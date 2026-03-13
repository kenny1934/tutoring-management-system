"""
Student progress insights — rule-based topic analysis + Gemini narrative + concept extraction.
"""

import json
import logging
import re
from collections import Counter
from datetime import date
from typing import Optional

from models import Student
from schemas import (
    ExerciseDetail, TestEvent, AttendanceSummary, RatingSummary,
    ProgressInsights, TopicCount, ConceptNode,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Layer 1: Rule-based topic extraction
# ---------------------------------------------------------------------------

def _display_name(pdf_name: str) -> str:
    """Extract readable name from PDF path: V:\\abc\\def\\ghi.pdf → ghi"""
    filename = re.split(r"[/\\]", pdf_name)[-1]
    return re.sub(r"\.[^.]+$", "", filename)


def _extract_topics(exercises: list[ExerciseDetail]) -> list[TopicCount]:
    """Count topic frequencies from exercise display names."""
    counter: Counter[str] = Counter()
    for ex in exercises:
        name = _display_name(ex.pdf_name)
        if name:
            counter[name] += 1

    return [
        TopicCount(topic=topic, count=count)
        for topic, count in counter.most_common(10)
    ]


# ---------------------------------------------------------------------------
# Layer 2: Gemini narrative + concept extraction
# ---------------------------------------------------------------------------

PROGRESS_INSIGHT_PROMPT = """You are writing a brief learning summary for a student progress report from a tutoring centre called "MathConcept Secondary Academy" (中學班).

Based on the student context below, produce a JSON response with two fields:

1. "narrative": 2-3 sentences summarizing:
   - What topics the student covered during this period (inferred from exercise names)
   - Their engagement pattern (attendance consistency, session ratings)
   - Any upcoming tests/exams they may be preparing for

2. "concepts": an array of math concepts extracted from the exercise filenames, where each entry has:
   - "label": a clean, human-readable concept name (e.g. "Parallel Lines" not "MAS_704_parallel_lines")
   - "count": how many exercises covered this concept
   - "category": one of "Algebra", "Geometry", "Arithmetic", "Statistics", "Trigonometry", "Number Theory", or "Other"

Guidelines for the narrative:
- Tone: professional, positive, encouraging — this may be read by parents
- Be specific: mention actual topic names, not generic statements
- Do NOT include any headings, bullet points, or formatting — just flowing prose
- Keep it concise: 2-3 sentences maximum

Guidelines for concepts:
- Group similar filenames into the same concept (e.g. "parallel_lines_1" and "parallel_lines_2" → one "Parallel Lines" entry with count=2)
- Translate coded filenames into meaningful math terms
- Return at most 12 concepts, ordered by count descending

Return ONLY valid JSON, no markdown code fences."""

LANGUAGE_INSTRUCTION = {
    "zh-hant": "\n\nIMPORTANT: Write the narrative in Traditional Chinese (繁體中文). Keep JSON keys and category values in English, but write the narrative and concept labels in Traditional Chinese.",
}


def _apply_language(prompt: str, language: str) -> str:
    """Append language instruction if non-English."""
    instruction = LANGUAGE_INSTRUCTION.get(language)
    if instruction:
        return prompt + instruction
    return prompt


def _build_context(
    student: Student,
    exercises: list[ExerciseDetail],
    test_events: list[TestEvent],
    attendance: AttendanceSummary,
    ratings: RatingSummary,
    date_range: Optional[tuple[date, date]],
) -> str:
    """Build plain-text context for the AI prompt."""
    lines = []

    # Student info
    lines.append(f"Student: {student.student_name}")
    if student.grade:
        lines.append(f"Grade: {student.grade}")
    if student.school:
        lines.append(f"School: {student.school}")

    # Date range
    if date_range:
        lines.append(f"Report period: {date_range[0]} to {date_range[1]}")

    # Attendance
    lines.append(f"\nAttendance: {attendance.attended} attended, {attendance.no_show} no-show out of {attendance.attended + attendance.no_show} sessions")
    lines.append(f"Attendance rate: {attendance.attendance_rate}%")

    # Ratings
    if ratings.overall_avg > 0:
        lines.append(f"Average performance rating: {ratings.overall_avg}/5 ({ratings.total_rated} rated sessions)")
    if ratings.recent_avg is not None:
        lines.append(f"Recent 30-day average: {ratings.recent_avg}/5")

    # Exercises
    if exercises:
        cw = [e for e in exercises if e.exercise_type in ("CW", "Classwork")]
        hw = [e for e in exercises if e.exercise_type in ("HW", "Homework")]
        lines.append(f"\nExercises assigned: {len(exercises)} total ({len(cw)} classwork, {len(hw)} homework)")

        # List unique exercise names
        names = list(dict.fromkeys(_display_name(e.pdf_name) for e in exercises if e.pdf_name))
        if names:
            lines.append(f"Topics covered: {', '.join(names[:20])}")

    # Tests
    if test_events:
        lines.append(f"\nTests/exams during period:")
        for t in test_events[:10]:
            line = f"  - {t.start_date}: {t.title} ({t.event_type or 'Test'})"
            if t.description:
                line += f" — Syllabus: {t.description}"
            lines.append(line)

    return "\n".join(lines)


def _parse_ai_response(text: str) -> tuple[str, list[ConceptNode]]:
    """Parse JSON response from AI, extracting narrative and concepts."""
    narrative = ""
    concept_nodes = []

    # Strip markdown code fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
        narrative = data.get("narrative", "")

        for c in data.get("concepts", []):
            if isinstance(c, dict) and "label" in c:
                concept_nodes.append(ConceptNode(
                    label=c["label"],
                    count=c.get("count", 1),
                    category=c.get("category"),
                ))
    except (json.JSONDecodeError, TypeError, KeyError) as exc:
        logger.warning("Failed to parse AI JSON response: %s | raw=%s", exc, text[:200])

    return narrative, concept_nodes


def generate_progress_insights(
    student: Student,
    exercises: list[ExerciseDetail],
    test_events: list[TestEvent],
    attendance: AttendanceSummary,
    ratings: RatingSummary,
    date_range: Optional[tuple[date, date]] = None,
    language: str = "en",
) -> ProgressInsights:
    """Generate combined rule-based + AI insights."""

    # Layer 1: Rule-based
    top_topics = _extract_topics(exercises)
    cw_count = sum(1 for e in exercises if e.exercise_type in ("CW", "Classwork"))
    hw_count = sum(1 for e in exercises if e.exercise_type in ("HW", "Homework"))

    # Layer 2: AI narrative + concept extraction (skip if no exercises)
    narrative = ""
    concept_nodes: list[ConceptNode] = []
    if exercises:
        try:
            from services.ai_client import generate

            prompt = _apply_language(PROGRESS_INSIGHT_PROMPT, language)
            context = _build_context(student, exercises, test_events, attendance, ratings, date_range)
            text, tokens, _ = generate(
                prompt,
                context,
                thinking_level="minimal",
                max_output_tokens=2048,
                temperature=0.4,
            )
            narrative, concept_nodes = _parse_ai_response(text)
            logger.info("Progress insights generated: %d tokens, %d concepts", tokens, len(concept_nodes))
        except Exception as exc:
            logger.warning("AI insight generation failed, returning rule-based only: %s", exc)

    return ProgressInsights(
        top_topics=top_topics,
        total_exercises=len(exercises),
        cw_count=cw_count,
        hw_count=hw_count,
        narrative=narrative,
        concept_nodes=concept_nodes,
    )
