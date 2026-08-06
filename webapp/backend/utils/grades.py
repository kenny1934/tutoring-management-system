"""Grade vocabulary: progression, pre-grade display, and prospect matching.

The school year in HK starts on Sept 1. A student stored as F1 today should
become F2 once the new year begins. During the summer course window between
the academic year ending and Sept 1 the badge should display "Pre-F2" so
tutors know what curriculum to assign, but the stored grade stays F1 until
the promotion job runs.

The last section reads the same ladder as a matching signal, alongside
utils/name_matching.py and utils/phone_matching.py: a prospect can only belong
to an application for the grade they are entering. It lives here rather than in
its own module because it is three lines over PROMOTE_MAP, mirroring how
utils/branch_codes.py keeps its link-time policy beside the vocabulary it
reasons about.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from functools import lru_cache
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


# A primary prospect is by definition a P6 student heading for secondary, but
# the grade arrives as free text from a branch tutor's pasted spreadsheet, so
# the column holds "P6", "P6/G6", "小六" and friends. Every spelling a token
# can take; a value made only of these folds to the canonical "P6".
_P6_TOKENS = frozenset({
    "p6", "g6", "6",
    "primary6", "grade6",
    "小六", "六年級", "小學六年級",
})

_GRADE_TOKEN_SPLIT = re.compile(r"[^0-9a-z一-鿿]+")


@lru_cache(maxsize=256)
def normalize_prospect_grade(grade: Optional[str]) -> Optional[str]:
    """Fold the many spellings of P6 to the canonical "P6".

    Only recognised P6 forms are rewritten. Anything else is returned as
    typed, so a genuinely odd value stays visible for a human to fix rather
    than being silently coerced into a grade nobody entered.

    Cached because the matchers call this once per prospect-application pair
    — tens of thousands of times per auto-match run over a handful of distinct
    values. Pure function of its argument, so the cache can never go stale.
    """
    if grade is None:
        return None
    text = grade.strip()
    if not text:
        return text
    tokens = [t for t in _GRADE_TOKEN_SPLIT.split(text.lower()) if t]
    if not tokens:
        return text
    # Two ways to be P6, because punctuation means both things here. Rejoined,
    # it catches a separator *within* one spelling ("P.6", "Primary 6"). Token
    # by token, it catches two spellings of the same fact ("P6/G6").
    #
    # Adding a token affects both readings: a bare "primary" added for the
    # first would also make "primary" alone fold via the second. Add whole
    # compacted spellings ("primary6"), not fragments.
    if "".join(tokens) in _P6_TOKENS or all(t in _P6_TOKENS for t in tokens):
        return "P6"
    return text


def prospect_entering_grade(prospect_grade: Optional[str]) -> Optional[str]:
    """The secondary grade a prospect is heading into ("P6/G6" -> "F1").

    None when the stored grade isn't a form we recognise, which callers read
    as "no information" rather than "no match".
    """
    return next_grade(normalize_prospect_grade(prospect_grade))


def grade_blocks_prospect_link(
    prospect_grade: Optional[str],
    application_grade: Optional[str],
) -> bool:
    """True when an application's grade rules it out as this prospect's.

    Applications carry the grade the student is *entering*, so a P6 prospect
    can only ever belong to an F1 application. Name and phone signals are both
    fallible — siblings share a phone, and common HK given names collide — so
    this is the one hard constraint available to rule a candidate out.

    Returns False whenever either side is unknown: absence of a grade is not
    evidence of a mismatch.
    """
    entering = prospect_entering_grade(prospect_grade)
    candidate = (application_grade or "").strip()
    if not entering or not candidate:
        return False
    return candidate.upper() != entering.upper()


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
