"""The grade check: which students' worksheets say nothing about their school.

A student's assignments count as evidence of where their school is, filed
under the grade on their record. That goes wrong in two ways. The record can
be wrong, as when a student repeats a year and nobody moves their grade back
down. Or the student can be doing catch-up work from an earlier grade for a
stretch. Either way their worksheets come mostly from a lower grade than the
one they are filed under, and counting them puts an earlier grade's topic on
the school's timeline.

Some schools really do teach chapters that our series files under a lower
grade, though. Their curriculum sheets and our weekly prep folders put 15 to
60 percent of their topics below our grade filing at TIS, SON, MAC, SYMS and
CDSJ3 (measured September 2026). A student there whose worksheets sit below
grade is following the school, not falling behind it. So the check compares
each student against their own school's plans and only flags a student who is
below grade when the school is not.

The first weeks of a school year are a separate case. Tutors spend them
reviewing the grade a student has just finished, so a lower grade's worksheet
then is review, not a sign of anything. warm_up_review() says which of those
worksheets to count as review, and the check itself ignores those weeks.

The rebuild (database/curriculum/backfill_observations.py) feeds this and sets
excluded_reason = 'grade_check' on the flagged students' assignment rows. The
admin list of students to check reads those rows back.
"""
import re
from collections import defaultdict

# The first weeks of a school year are warm-up. Tutors spend them reviewing
# the grade a student has just finished, so for a while nearly everyone looks
# a grade behind. Last September 3 to 4 percent of worksheets in weeks 1 to 3
# came from a lower grade, against 2 percent from week 4 on, and the first
# check this September flagged four students who were only doing that. So the
# check ignores those weeks. A student with a stale grade is still caught, a
# week or two later, because they carry on with the lower grade's work after
# everyone else has moved on.
WARM_UP_WEEKS = 3

# A student needs at least this many worksheets with a known grade after the
# warm-up before the check says anything about them.
MIN_WORKSHEETS = 3

# How much of a student's work has to sit below their grade.
BELOW_SHARE = 2 / 3

# A school whose own plans put at least this share of topics below our grade
# filing is one where below-grade work is normal, so its students are spared.
SCHOOL_BELOW_SHARE = 1 / 3

# Fewer topics than this from a school's own plans is too little to call its
# habit. Such a school is treated as keeping to our grade filing.
MIN_SCHOOL_TOPICS = 10

_GRADE_RE = re.compile(r"^F([1-6])$")


def grade_number(grade):
    """2 for "F2", None for anything that is not F1 to F6."""
    m = _GRADE_RE.match(grade or "")
    return int(m.group(1)) if m else None


def school_below_shares(school_topics):
    """{(school, grade): share} from the school's own plans.

    school_topics is an iterable of (school, grade, concept_grade), one per
    topic a prep folder or a curriculum sheet put in a school week. The share
    is how many of them belong to a lower grade than the one they were
    planned for. School-grades with too few topics are left out.
    """
    counts = defaultdict(lambda: [0, 0])
    for school, grade, concept_grade in school_topics:
        g, cg = grade_number(grade), grade_number(concept_grade)
        if g is None or cg is None:
            continue
        entry = counts[(school, grade)]
        entry[0] += cg < g
        entry[1] += 1
    return {k: below / total for k, (below, total) in counts.items()
            if total >= MIN_SCHOOL_TOPICS}


def warm_up_review(week, grade, concept_grade, school_share):
    """Whether a worksheet in the warm-up weeks is review of an earlier grade.

    It is when it comes from a lower grade than the one it is filed under, at
    a school whose own plans keep to our grade filing. school_share is that
    school-grade's entry from school_below_shares(), 0.0 when it has none.
    Review says nothing about the school's current topic, so the rebuild
    files these worksheets as revision and the views leave them out.
    """
    if week > WARM_UP_WEEKS:
        return False
    g, cg = grade_number(grade), grade_number(concept_grade)
    if g is None or cg is None or cg >= g:
        return False
    return school_share < SCHOOL_BELOW_SHARE


def students_out_of_step(worksheets, school_topics):
    """{(student_id, academic_year)} whose worksheets should not count.

    worksheets is an iterable of (student_id, academic_year, week_number,
    school, grade, concept_grade), one per worksheet whose topic has a single
    known grade. Revision worksheets should be left out before they get here,
    because revising an earlier grade is expected and says nothing about the
    record. school and grade are what the worksheet is filed under.
    """
    norms = school_below_shares(school_topics)
    tally = defaultdict(lambda: [0, 0])
    where = {}
    for student_id, year, week, school, grade, concept_grade in worksheets:
        if week <= WARM_UP_WEEKS:
            continue
        g, cg = grade_number(grade), grade_number(concept_grade)
        if g is None or cg is None:
            continue
        key = (student_id, year)
        tally[key][0] += cg < g
        tally[key][1] += 1
        where[key] = (school, grade)

    flagged = set()
    for key, (below, total) in tally.items():
        if total < MIN_WORKSHEETS or below / total < BELOW_SHARE:
            continue
        if norms.get(where[key], 0.0) >= SCHOOL_BELOW_SHARE:
            continue
        flagged.add(key)
    return flagged
