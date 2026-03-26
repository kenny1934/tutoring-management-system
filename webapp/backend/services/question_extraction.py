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


# ---------------------------------------------------------------------------
# Question parsing
# ---------------------------------------------------------------------------


def parse_questions(content: dict) -> list[dict]:
    """
    Parse a TipTap document into individual questions.

    Splits on heading level 3 nodes (the question markers produced by OCR).
    Returns a list of question dicts with boundaries and basic metadata.
    Topic/difficulty fields are null — populated later by solution generation.
    """
    nodes = content.get("content", [])
    if not nodes:
        return []

    questions: list[dict] = []
    current: dict | None = None

    for i, node in enumerate(nodes):
        is_question_heading = (
            node.get("type") == "heading"
            and node.get("attrs", {}).get("level") == 3
        )

        if is_question_heading:
            if current is not None:
                current["end_node"] = i
                questions.append(current)

            label = _extract_text_with_math(node).strip()
            current = {
                "index": len(questions),
                "label": label,
                "start_node": i,
                "end_node": len(nodes),
                "preview": "",
                "topic": None,
                "subtopic": None,
                "difficulty": None,
                "marks": _parse_marks(label),
                "sub_questions": [],
            }
        elif current is not None:
            text = _extract_text(node)
            sub_match = _SUB_Q_PATTERN.match(text)
            if sub_match:
                sub_label = sub_match.group(0).strip()
                if sub_label not in current["sub_questions"]:
                    current["sub_questions"].append(sub_label)
            if current["marks"] is None:
                marks = _parse_marks(text)
                if marks is not None:
                    current["marks"] = marks

    if current is not None:
        current["end_node"] = len(nodes)
        questions.append(current)

    for q in questions:
        body_parts = []
        for node in nodes[q["start_node"] + 1 : q["end_node"]]:
            t = _extract_text_with_math(node).strip()
            if t:
                body_parts.append(t)
        if body_parts:
            q["preview"] = _truncate_safe(" ".join(body_parts), 500)
        else:
            q["preview"] = _truncate_safe(_NUM_PATTERN.sub("", q["label"]).strip(), 500)

    return questions
