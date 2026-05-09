"""Grade progression and pre-grade display helpers.

The school year in HK starts on Sept 1. A student stored as F1 today should
become F2 once the new year begins. During the summer course window between
the academic year ending and Sept 1 the badge should display "Pre-F2" so
tutors know what curriculum to assign, but the stored grade stays F1 until
the promotion job runs.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Optional, Tuple

GRADE_ORDER = ["P6", "F1", "F2", "F3", "F4", "F5", "F6", "Graduated"]

# Promotion mapping applied each Sept 1.
PROMOTE_MAP = {
    "P6": "F1",
    "F1": "F2",
    "F2": "F3",
    "F3": "F4",
    "F4": "F5",
    "F5": "F6",
    "F6": "Graduated",
}

# Summer applications carry the *target* grade (the grade the student will be
# entering). When admin creates a Student record from a SummerApplication
# during the pre-grade window, the stored grade should be one step below
# so the Sept 1 promotion lifts them to the target.
TARGET_TO_PRE_GRADE = {
    "F1": "P6",
    "F2": "F1",
    "F3": "F2",
    "F4": "F3",
}


def next_grade(grade: Optional[str]) -> Optional[str]:
    """Return the grade a student would have after one promotion."""
    if not grade:
        return None
    return PROMOTE_MAP.get(grade)


def is_in_pre_grade_window(today: date, window: Optional[Tuple[date, date]]) -> bool:
    """True when today falls inside the inclusive [start, end] window."""
    if not window:
        return False
    start, end = window
    return start <= today <= end


def display_grade(grade: Optional[str], today: date, window: Optional[Tuple[date, date]]) -> Optional[str]:
    """Render the grade with a "Pre-" prefix during the summer window.

    Returns the raw grade outside the window or when no next grade exists.
    """
    if not grade:
        return grade
    if not is_in_pre_grade_window(today, window):
        return grade
    promoted = PROMOTE_MAP.get(grade)
    if not promoted or promoted == "Graduated":
        return grade
    return f"Pre-{promoted}"


def apply_target_to_pre_grade(
    target_grade: Optional[str],
    today: date,
    config_year: Optional[int],
) -> Optional[str]:
    """Translate a summer application's target grade to the stored "current" grade.

    Cutoff: Sept 1 of `config_year` (the promotion date). Before the cutoff
    F1 -> P6, F2 -> F1, F3 -> F2, F4 -> F3. On or after the cutoff, the target
    IS the current grade — pass through.

    The cutoff is wider than the badge display window because a pre-F1
    applicant is currently in P6 at any point before promotion, not just
    during the summer course window.
    """
    if not target_grade:
        return target_grade
    if not config_year:
        return target_grade
    if today >= date(config_year, 9, 1):
        return target_grade
    return TARGET_TO_PRE_GRADE.get(target_grade, target_grade)


def resolve_pre_grade_window(
    course_start_date: Optional[date],
    course_year: Optional[int],
    explicit_start: Optional[date],
    explicit_end: Optional[date],
) -> Optional[Tuple[date, date]]:
    """Determine the active pre-grade window.

    Explicit start/end take precedence. Otherwise default to
    (course_start_date, Aug 31 of course_year) — promotion fires Sept 1.
    Returns None when no usable defaults are available.
    """
    start = explicit_start or course_start_date
    end = explicit_end
    if end is None and course_year is not None:
        end = date(course_year, 9, 1) - timedelta(days=1)
    if not start or not end or start > end:
        return None
    return (start, end)
