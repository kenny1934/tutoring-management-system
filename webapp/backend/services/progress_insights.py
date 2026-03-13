"""
Student progress insights — rule-based topic analysis + Gemini narrative.
"""

import logging
import re
from collections import Counter
from datetime import date
from typing import Optional

from models import Student
from schemas import (
    ExerciseDetail, TestEvent, AttendanceSummary, RatingSummary,
    ProgressInsights, TopicCount,
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
# Layer 2: Gemini narrative
# ---------------------------------------------------------------------------

PROGRESS_INSIGHT_PROMPT = """You are writing a brief learning summary for a student progress report from a tutoring centre called "Math Concept Secondary" (中學班).

Based on the student context below, write 2-3 sentences summarizing:
1. What topics the student covered during this period (inferred from exercise names)
2. Their engagement pattern (attendance consistency, session ratings)
3. Any upcoming tests/exams they may be preparing for

Guidelines:
- Write in English, but you may include Chinese math terms in parentheses where helpful
- Tone: professional, positive, encouraging — this may be read by parents
- Be specific: mention actual topic names from the exercises, not generic statements
- Do NOT include any headings, bullet points, or formatting — just flowing prose
- Keep it concise: 2-3 sentences maximum"""


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
            lines.append(f"  - {t.start_date}: {t.title} ({t.event_type or 'Test'})")

    return "\n".join(lines)


def generate_progress_insights(
    student: Student,
    exercises: list[ExerciseDetail],
    test_events: list[TestEvent],
    attendance: AttendanceSummary,
    ratings: RatingSummary,
    date_range: Optional[tuple[date, date]] = None,
) -> ProgressInsights:
    """Generate combined rule-based + AI insights."""

    # Layer 1: Rule-based
    top_topics = _extract_topics(exercises)
    cw_count = sum(1 for e in exercises if e.exercise_type in ("CW", "Classwork"))
    hw_count = sum(1 for e in exercises if e.exercise_type in ("HW", "Homework"))

    # Layer 2: AI narrative (skip if no exercises)
    narrative = ""
    if exercises:
        try:
            from services.ai_client import generate

            context = _build_context(student, exercises, test_events, attendance, ratings, date_range)
            text, tokens, _ = generate(
                PROGRESS_INSIGHT_PROMPT,
                context,
                thinking_level="minimal",
                max_output_tokens=1024,
                temperature=0.4,
            )
            narrative = text.strip()
            logger.info("Progress insights generated: %d tokens", tokens)
        except Exception as exc:
            logger.warning("AI insight generation failed, returning rule-based only: %s", exc)

    return ProgressInsights(
        top_topics=top_topics,
        total_exercises=len(exercises),
        cw_count=cw_count,
        hw_count=hw_count,
        narrative=narrative,
    )
