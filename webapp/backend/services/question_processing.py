"""
Question processing service — solve questions and/or generate variants via Gemini.

Two modes:
- Solve only: step-by-step solution + topic/difficulty classification
- Vary (always includes solve): solution + variant question + variant solution + classification
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

from services.question_extraction import _extract_text

logger = logging.getLogger(__name__)

PROCESS_MODEL = "gemini-2.5-flash"
MAX_CONCURRENT = 5

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SOLVE_PROMPT = """\
Solve this math question. Show only the essential math steps — no text explanations unless truly necessary. Use math notation, not words.

Rules:
- Use $...$ for inline LaTeX math.
- Show only key derivation steps and the final answer. Omit obvious steps.
- Write mostly math, minimal text. e.g. "$x^2 - 5x + 6 = 0$\\n$(x-2)(x-3) = 0$\\n$x = 2$ or $x = 3$"
- End with "Answer: ..."
- Do NOT restate the question or add unnecessary commentary.

Question:
{question_text}

Return ONLY valid JSON:
{{
  "solution": "$...$ math steps, one per line, minimal text",
  "topic": "e.g. Algebra, Trigonometry, Calculus",
  "subtopic": "e.g. Quadratic Equations, Unit Circle",
  "difficulty": "easy|medium|hard"
}}"""

VARY_PROMPT = """\
Do all three tasks for this question:

1. **Solve** — show only essential math steps, minimal text.
2. **Generate a variant** — same concept and difficulty, different numbers. Keep the same structure and language.
3. **Solve the variant** — same concise style.

Rules:
- Use $...$ for inline LaTeX math.
- Show only key derivation steps and final answers. Omit obvious steps.
- Write mostly math, minimal text.
- End each solution with "Answer: ..."
- Do NOT restate questions or add unnecessary commentary.

Question:
{question_text}

Return ONLY valid JSON:
{{
  "solution": "$...$ math steps, one per line, minimal text",
  "variant": "The full variant question text",
  "variant_solution": "$...$ math steps, one per line, minimal text",
  "topic": "e.g. Algebra, Trigonometry, Calculus",
  "subtopic": "e.g. Quadratic Equations, Unit Circle",
  "difficulty": "easy|medium|hard"
}}"""

# ---------------------------------------------------------------------------
# Text → TipTap converter
# ---------------------------------------------------------------------------

_MATH_RE = re.compile(r"\$([^$]+)\$")



def text_to_tiptap_nodes(text: str) -> list[dict]:
    """Convert text with $...$ math into TipTap paragraph + inlineMath nodes."""
    if not text:
        return [{"type": "paragraph"}]

    # Replace LaTeX line breaks (\\) with newlines, but only outside $...$ math
    parts = _MATH_RE.split(text)  # alternates: text, math_content, text, ...
    for i in range(0, len(parts), 2):  # even indices are outside math
        parts[i] = parts[i].replace("\\\\", "\n")
    # Rejoin: re-wrap odd parts (math content) with $...$
    rebuilt = []
    for i, p in enumerate(parts):
        rebuilt.append(f"${p}$" if i % 2 == 1 else p)
    text = "".join(rebuilt)

    paragraphs: list[dict] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            paragraphs.append({"type": "paragraph"})
            continue

        content: list[dict] = []
        last_end = 0
        for m in _MATH_RE.finditer(line):
            # Text before the math
            before = line[last_end:m.start()]
            if before:
                content.append({"type": "text", "text": before})
            # Math node — normalize double backslashes to single for LaTeX commands
            latex = m.group(1)
            latex = re.sub(r"\\\\([a-zA-Z])", r"\\\1", latex)
            content.append({
                "type": "inlineMath",
                "attrs": {"latex": latex},
            })
            last_end = m.end()
        # Trailing text
        trailing = line[last_end:]
        if trailing:
            content.append({"type": "text", "text": trailing})

        if content:
            paragraphs.append({"type": "paragraph", "content": content})
        else:
            paragraphs.append({"type": "paragraph"})

    return paragraphs


def _build_answer_section(solution_nodes: list[dict], label: str = "") -> dict:
    """Wrap solution nodes in an answerSection TipTap node."""
    return {
        "type": "answerSection",
        "attrs": {"open": False, "align": "left", "label": label},
        "content": solution_nodes or [{"type": "paragraph"}],
    }


# ---------------------------------------------------------------------------
# Question text extraction (reuse from question_extraction)
# ---------------------------------------------------------------------------


def _extract_question_text(content: dict, question: dict) -> str:
    """Extract the full text of a question from TipTap content nodes."""
    from services.question_extraction import _extract_text_with_math

    nodes = content.get("content", [])
    parts: list[str] = []
    for node in nodes[question["start_node"]:question["end_node"]]:
        if node.get("type") == "answerSection":
            continue
        t = _extract_text_with_math(node).strip()
        if t:
            parts.append(t)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Single question processing
# ---------------------------------------------------------------------------


def _dedup_repetition(text: str) -> str:
    """Detect and truncate consecutive repeated blocks (model looping).

    Only triggers on genuine loops — the same block of 80+ chars appearing
    back-to-back (possibly with whitespace between). Does NOT flag naturally
    similar math expressions like repeated \\frac{\\pi}{...} across steps.
    """
    # Split into lines and look for consecutive blocks of repeated lines
    lines = text.split("\n")
    if len(lines) < 6:
        return text
    # Check if a sequence of N consecutive lines repeats immediately after
    for block_size in range(3, len(lines) // 2):
        for start in range(len(lines) - block_size * 2):
            block = lines[start:start + block_size]
            next_block = lines[start + block_size:start + block_size * 2]
            if block == next_block:
                # Found a repeated block — keep first occurrence only
                return "\n".join(lines[:start + block_size]).rstrip()
    return text


# Pattern to detect bare LaTeX (not wrapped in $...$) — e.g. \frac{a}{b}, \sqrt{x}
_BARE_LATEX_RE = re.compile(
    r"(?<!\$)"  # not preceded by $
    r"(\\(?:frac|dfrac|sqrt|sin|cos|tan|log|ln|lim|sum|int|prod|infty|alpha|beta|theta|pi|text|mathrm|left|right)\b[^$\n]*?)"
    r"(?!\$)"   # not followed by $
)


def _wrap_bare_latex(text: str) -> str:
    """Wrap bare LaTeX expressions in $...$ if the model forgot to."""
    lines = text.split("\n")
    result = []
    for line in lines:
        # Skip lines that are already mostly math (have $...$)
        if "$" in line:
            result.append(line)
            continue
        # Wrap detected bare LaTeX
        wrapped = _BARE_LATEX_RE.sub(r"$\1$", line)
        result.append(wrapped)
    return "\n".join(result)


# LaTeX commands that collide with JSON escapes (\b, \f, \n, \r, \t)
# \beta→\b+eta, \frac→\f+rac, \nu→\n+u, \rho→\r+ho, \theta→\t+heta
_LATEX_COLLISIONS = re.compile(
    r"(?<!\\)\\("  # single backslash (not preceded by another backslash)
    r"beta|boldsymbol|binom|bm|bar|boxed|begin|"  # \b...
    r"frac|dfrac|flat|forall|"                      # \f...
    r"nu|neg|nabla|nolimits|notin|neq|ngeq|nleq|"  # \n...
    r"rho|right|rightarrow|Rightarrow|rm|"          # \r...
    r"theta|tan|text|to|top|times|tilde|triangle"   # \t...
    r")(?![a-zA-Z])"
)


def _fix_json_escapes(text: str) -> str:
    """Fix unescaped LaTeX backslashes that break JSON parsing.

    Two problems:
    1. \\sin, \\cos etc. — \\s is not a valid JSON escape, causes parse error
    2. \\theta, \\beta, \\frac etc. — \\t, \\b, \\f ARE valid JSON escapes,
       so json.loads silently converts them to tab/backspace/formfeed

    Solution: double-escape all bare LaTeX commands before parsing.
    Already-escaped \\\\theta is left alone (negative lookbehind).
    """
    # First: escape LaTeX commands that collide with JSON escapes (\b→backspace, \t→tab, etc.)
    text = _LATEX_COLLISIONS.sub(lambda m: "\\\\" + m.group(1), text)

    # Second: fix remaining bare backslashes (not valid JSON escapes, not already doubled)
    result = []
    i = 0
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text):
            next_char = text[i + 1]
            if next_char == "\\":
                result.append("\\\\")
                i += 2
                continue
            elif next_char in ('"', '/', 'b', 'f', 'n', 'r', 't', 'u'):
                result.append("\\")
                result.append(next_char)
                i += 2
                continue
            else:
                result.append("\\\\")
                i += 1
                continue
        result.append(text[i])
        i += 1
    return "".join(result)


def _salvage_truncated_json(text: str) -> str:
    """Attempt to close a truncated JSON response so it can be parsed.

    The model hit max_output_tokens mid-JSON. We try to close the open
    string value and add missing closing braces/fields with defaults.
    """
    text = text.rstrip()
    # If we're inside a string value, close it
    # Count unescaped quotes to see if we're mid-string
    in_string = False
    i = 0
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text):
            i += 2
            continue
        if text[i] == '"':
            in_string = not in_string
        i += 1
    if in_string:
        text += ' [truncated]"'
    # Close any open object
    if text.count("{") > text.count("}"):
        # Add missing fields with defaults
        if '"topic"' not in text:
            text += ', "topic": null'
        if '"subtopic"' not in text:
            text += ', "subtopic": null'
        if '"difficulty"' not in text:
            text += ', "difficulty": null'
        text += "}"
    return text


def _process_one_question_sync(question_text: str, use_vary: bool) -> tuple[dict, int, int]:
    """Process a single question synchronously (runs in thread pool)."""
    from services.ai_client import generate

    prompt_template = VARY_PROMPT if use_vary else SOLVE_PROMPT
    prompt = prompt_template.format(question_text=question_text)

    text, input_tokens, output_tokens, is_truncated = generate(
        prompt=prompt,
        model=PROCESS_MODEL,
        thinking_level="medium",
        response_mime_type="application/json",
        max_output_tokens=8192,
        temperature=0.3,
    )

    if is_truncated:
        # Try to salvage truncated JSON by closing the string and object
        text = _salvage_truncated_json(text)

    # Must always fix escapes before parsing — \beta, \theta, \frac etc.
    # collide with JSON escape sequences (\b, \t, \f) and get silently mangled
    fixed = _fix_json_escapes(text)
    try:
        result = json.loads(fixed)
    except json.JSONDecodeError:
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", fixed.strip())
        result = json.loads(cleaned)

    # Post-process text fields: fix bare LaTeX and detect repetition
    for key in ("solution", "variant", "variant_solution"):
        if key in result and isinstance(result[key], str):
            result[key] = _wrap_bare_latex(result[key])
            result[key] = _dedup_repetition(result[key])

    return result, input_tokens, output_tokens


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------


async def process_questions(
    questions: list[dict],
    content: dict,
    actions: list[str],
    question_indices: list[int] | None = None,
) -> tuple[list[dict], list[dict], int, int]:
    """
    Process questions in parallel via Gemini.

    Args:
        questions: Extracted question metadata (from parse_questions).
        content: The full TipTap document content.
        actions: List of actions — ["solve"] or ["vary"] or ["solve", "vary"].
        question_indices: Specific question indices to process (None = all).

    Returns:
        (results, errors, total_input_tokens, total_output_tokens)
    """
    use_vary = "vary" in actions

    # Filter to requested indices
    if question_indices is not None:
        selected = [q for q in questions if q["index"] in question_indices]
    else:
        selected = list(questions)

    if not selected:
        return [], [], 0, 0

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def process_one(q: dict) -> dict:
        question_text = _extract_question_text(content, q)
        async with semaphore:
            result, inp, out = await asyncio.to_thread(
                _process_one_question_sync, question_text, use_vary
            )

        # Build TipTap nodes from response
        solution_nodes = text_to_tiptap_nodes(result.get("solution", ""))
        variant_nodes = text_to_tiptap_nodes(result["variant"]) if use_vary and result.get("variant") else None
        variant_solution_nodes = text_to_tiptap_nodes(result["variant_solution"]) if use_vary and result.get("variant_solution") else None

        return {
            "index": q["index"],
            "label": q["label"],
            "solution_nodes": solution_nodes,
            "solution_text": result.get("solution", ""),
            "variant_nodes": variant_nodes,
            "variant_text": result.get("variant", ""),
            "variant_solution_nodes": variant_solution_nodes,
            "variant_solution_text": result.get("variant_solution", ""),
            "topic": result.get("topic"),
            "subtopic": result.get("subtopic"),
            "difficulty": result.get("difficulty"),
            "_input_tokens": inp,
            "_output_tokens": out,
        }

    results = await asyncio.gather(
        *(process_one(q) for q in selected),
        return_exceptions=True,
    )

    final: list[dict] = []
    errors: list[dict] = []
    total_input = 0
    total_output = 0
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.error("Failed to process question %d: %s", selected[i]["index"], r)
            errors.append({"index": selected[i]["index"], "label": selected[i]["label"], "error": str(r)})
            continue
        total_input += r.pop("_input_tokens", 0)
        total_output += r.pop("_output_tokens", 0)
        final.append(r)

    return final, errors, total_input, total_output


# ---------------------------------------------------------------------------
# Apply solutions to document
# ---------------------------------------------------------------------------


def apply_solutions_to_content(
    content: dict,
    questions: list[dict],
    results: list[dict],
    replace_existing: bool = False,
) -> dict:
    """
    Insert answerSection nodes into the document content after each question.

    Scans the actual document nodes for question heading boundaries rather than
    relying on stored start_node/end_node, which go stale after previous inserts.

    Returns the modified content dict.
    """
    nodes = list(content.get("content", []))
    result_map = {r["index"]: r for r in results}

    # Match question boundaries by heading label text (not positional index).
    # This handles reordered questions and non-question h3 headings correctly.
    h3_by_label: dict[str, int] = {}
    h3_ordered: list[int] = []
    for i, node in enumerate(nodes):
        if node.get("type") == "heading" and node.get("attrs", {}).get("level") == 3:
            h3_ordered.append(i)
            h3_by_label[_extract_text(node).strip()] = i

    boundaries: list[tuple[dict, int, int]] = []
    for q in questions:
        qlabel = q.get("label", "").strip()
        start = h3_by_label.get(qlabel)
        if start is None:
            continue
        idx = h3_ordered.index(start)
        end = h3_ordered[idx + 1] if idx + 1 < len(h3_ordered) else len(nodes)
        boundaries.append((q, start, end))

    # Process in reverse order so insertions don't shift later indices
    for q_meta, start, end in reversed(boundaries):
        r = result_map.get(q_meta["index"])
        if not r or not r.get("solution_nodes"):
            continue

        # Check for existing answerSection anywhere in this question's range
        existing_pos = None
        for i in range(start, min(end, len(nodes))):
            if nodes[i].get("type") == "answerSection":
                existing_pos = i
                break

        if existing_pos is not None and not replace_existing:
            continue

        if existing_pos is not None:
            nodes.pop(existing_pos)
            end -= 1

        # Preserve full label (e.g. "2(a)") instead of extracting only leading digit
        label = q_meta.get("label", "").strip().rstrip(".")

        answer_node = _build_answer_section(r["solution_nodes"], label=label)

        insert_pos = min(end, len(nodes))
        nodes.insert(insert_pos, answer_node)

    return {**content, "content": nodes}


# ---------------------------------------------------------------------------
# Build variant document
# ---------------------------------------------------------------------------


def build_variant_document(
    results: list[dict],
    include_solutions: bool = True,
) -> dict:
    """
    Build a TipTap document from variant results.

    Returns a TipTap doc dict with heading + variant content + optional answerSection per question.
    """
    doc_nodes: list[dict] = []

    for r in sorted(results, key=lambda x: x["index"]):
        if not r.get("variant_nodes"):
            continue

        # Question heading — preserve full label (e.g. "2(a)")
        number = r.get("label", "").strip().rstrip(".") or str(r["index"] + 1)
        doc_nodes.append({
            "type": "heading",
            "attrs": {"level": 3},
            "content": [{"type": "text", "text": f"{number}."}],
        })

        # Variant content
        doc_nodes.extend(r["variant_nodes"])

        # Optional variant solution
        if include_solutions and r.get("variant_solution_nodes"):
            doc_nodes.append(
                _build_answer_section(r["variant_solution_nodes"], label=number)
            )

    return {"type": "doc", "content": doc_nodes} if doc_nodes else {"type": "doc", "content": [{"type": "paragraph"}]}
