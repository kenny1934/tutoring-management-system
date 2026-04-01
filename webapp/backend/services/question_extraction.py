"""
Question extraction service — parse TipTap document into individual questions.

Structural parsing only (pure Python, instant, free).
Topic/difficulty classification will be a byproduct of solution generation (future).
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Text extraction helpers
# ---------------------------------------------------------------------------


def _extract_text(node: dict) -> str:
    """Recursively extract plain text from a TipTap node."""
    if node.get("type") == "text":
        return node.get("text", "")
    if node.get("type") in ("inlineMath", "blockMath"):
        return node.get("attrs", {}).get("latex", "")
    parts = []
    for child in node.get("content", []):
        parts.append(_extract_text(child))
    return "".join(parts)


def _extract_text_with_math(node: dict) -> str:
    """Extract text with LaTeX expressions wrapped in $...$ delimiters."""
    if node.get("type") == "text":
        return node.get("text", "")
    if node.get("type") in ("inlineMath", "blockMath"):
        latex = node.get("attrs", {}).get("latex", "")
        return f"${latex}$" if latex else ""
    parts = []
    for child in node.get("content", []):
        parts.append(_extract_text_with_math(child))
    return "".join(parts)


def _parse_marks(text: str) -> int | None:
    """Extract marks allocation from text like '(3 marks)', '(5分)', '[4]'."""
    m = re.search(r"\((\d+)\s*(?:marks?|分|pts?)\)", text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"\[(\d+)\]", text)
    if m:
        return int(m.group(1))
    return None


def _truncate_safe(text: str, max_len: int) -> str:
    """Truncate text without breaking $...$ math delimiters."""
    if len(text) <= max_len:
        return text
    truncated = text[:max_len]
    if truncated.count("$") % 2 != 0:
        last_dollar = truncated.rfind("$")
        if last_dollar > 0:
            truncated = truncated[:last_dollar].rstrip()
    return truncated + "…"


_SUB_Q_PATTERN = re.compile(r"^\s*\(?([a-z]|[ivx]+)\)")
_NUM_PATTERN = re.compile(r"^\d+[\.\)）]?\s*")
_NUMBERED_PARA_PATTERN = re.compile(
    r"^(?:Q|第)?(\d+)[.\)）]|^第(\d+)題"
)


# ---------------------------------------------------------------------------
# Question boundary detection
# ---------------------------------------------------------------------------


def _find_heading_boundaries(nodes: list[dict]) -> list[tuple[int, str]]:
    """Find question boundaries from heading level 3 nodes (OCR-imported docs)."""
    boundaries = []
    for i, node in enumerate(nodes):
        if (
            node.get("type") == "heading"
            and node.get("attrs", {}).get("level") == 3
        ):
            label = _extract_text_with_math(node).strip()
            boundaries.append((i, label))
    return boundaries


def _find_numbered_para_boundaries(nodes: list[dict]) -> list[tuple[int, str]]:
    """Find question boundaries from numbered paragraphs (manually created docs).

    Only triggers when the first non-blank paragraph starts with "1." (or similar),
    to avoid false positives on documents that aren't question lists.
    """
    # First pass: collect candidate numbered paragraphs
    candidates: list[tuple[int, str, int]] = []  # (node_index, label, question_number)
    for i, node in enumerate(nodes):
        if node.get("type") != "paragraph":
            continue
        text = _extract_text(node).strip()
        if not text or text == "\xa0":
            continue
        m = _NUMBERED_PARA_PATTERN.match(text)
        if m:
            num = int(m.group(1) or m.group(2))
            candidates.append((i, _extract_text_with_math(node).strip(), num))

    if not candidates:
        return []
    # Must start from question 1 and have at least 2 questions
    if candidates[0][2] != 1 or len(candidates) < 2:
        return []
    # Check numbers are sequential (allow gaps but must be ascending)
    prev_num = 0
    for _, _, num in candidates:
        if num <= prev_num:
            return []
        prev_num = num

    return [(idx, label) for idx, label, _ in candidates]


# ---------------------------------------------------------------------------
# Question parsing
# ---------------------------------------------------------------------------


def parse_questions(content: dict) -> list[dict]:
    """
    Parse a TipTap document into individual questions.

    Detection strategy:
    1. Heading level 3 nodes (OCR-imported worksheets)
    2. Numbered paragraph pattern fallback (manually created docs)

    Returns a list of question dicts with boundaries and basic metadata.
    Topic/difficulty fields are null — populated later by solution generation.
    """
    nodes = content.get("content", [])
    if not nodes:
        return []

    # Try heading-based detection first, fall back to numbered paragraphs
    boundaries = _find_heading_boundaries(nodes)
    if not boundaries:
        boundaries = _find_numbered_para_boundaries(nodes)
    if not boundaries:
        return []

    questions: list[dict] = []

    for b_idx, (node_idx, label) in enumerate(boundaries):
        end_node = boundaries[b_idx + 1][0] if b_idx + 1 < len(boundaries) else len(nodes)
        q: dict = {
            "index": len(questions),
            "label": label,
            "start_node": node_idx,
            "end_node": end_node,
            "preview": "",
            "topic": None,
            "subtopic": None,
            "difficulty": None,
            "marks": _parse_marks(label),
            "sub_questions": [],
        }

        # Scan body nodes for sub-questions and marks
        for node in nodes[node_idx + 1 : end_node]:
            if node.get("type") == "answerSection":
                continue
            text = _extract_text(node)
            sub_match = _SUB_Q_PATTERN.match(text)
            if sub_match:
                sub_label = sub_match.group(0).strip()
                if sub_label not in q["sub_questions"]:
                    q["sub_questions"].append(sub_label)
            if q["marks"] is None:
                marks = _parse_marks(text)
                if marks is not None:
                    q["marks"] = marks

        questions.append(q)

    # Build previews and full text
    for q in questions:
        body_parts = []
        for node in nodes[q["start_node"] + 1 : q["end_node"]]:
            if node.get("type") == "answerSection":
                continue
            t = _extract_text_with_math(node).strip()
            if t:
                body_parts.append(t)
        full = "\n".join(body_parts) if body_parts else _NUM_PATTERN.sub("", q["label"]).strip()
        q["full_text"] = full
        q["preview"] = _truncate_safe(full, 500)

    return questions
