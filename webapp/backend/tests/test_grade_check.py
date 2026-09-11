"""Tests for the grade check (curriculum/grade_check.py)."""
from curriculum.grade_check import (
    grade_number,
    school_below_shares,
    students_out_of_step,
    warm_up_review,
)

YEAR = "2026-2027"


def _plans(school, grade, below, same):
    """A school's own plans: `below` topics from the grade under, `same` on grade."""
    lower = "F%d" % (grade_number(grade) - 1)
    return [(school, grade, lower)] * below + [(school, grade, grade)] * same


def test_grade_number():
    assert grade_number("F2") == 2
    assert grade_number("P6") is None
    assert grade_number(None) is None


def test_repeating_student_with_a_stale_grade_is_flagged():
    # Filed as F3, but every worksheet is an F2 chapter, and the school's own
    # plans keep to our grade filing.
    worksheets = [(1, YEAR, 5, "SRL-C", "F3", "F2")] * 5
    plans = _plans("SRL-C", "F3", below=1, same=20)
    assert students_out_of_step(worksheets, plans) == {(1, YEAR)}


def test_a_school_that_teaches_below_our_filing_spares_its_students():
    worksheets = [(1, YEAR, 5, "TIS", "F3", "F2")] * 6
    plans = _plans("TIS", "F3", below=15, same=21)
    assert students_out_of_step(worksheets, plans) == set()


def test_too_few_worksheets_says_nothing():
    worksheets = [(1, YEAR, 5, "SRL-C", "F3", "F2")] * 2
    assert students_out_of_step(worksheets, []) == set()


def test_mostly_on_grade_work_is_not_flagged():
    worksheets = ([(1, YEAR, 5, "SRL-C", "F3", "F2")] * 2
                  + [(1, YEAR, 5, "SRL-C", "F3", "F3")] * 4)
    assert students_out_of_step(worksheets, []) == set()


def test_each_school_year_is_judged_on_its_own():
    worksheets = ([(1, "2025-2026", 5, "SRL-C", "F2", "F2")] * 5
                  + [(1, YEAR, 5, "SRL-C", "F3", "F2")] * 3)
    assert students_out_of_step(worksheets, []) == {(1, YEAR)}


def test_a_school_with_too_few_planned_topics_counts_as_keeping_to_our_filing():
    plans = _plans("NEW", "F3", below=5, same=0)
    assert school_below_shares(plans) == {}
    worksheets = [(1, YEAR, 5, "NEW", "F3", "F2")] * 3
    assert students_out_of_step(worksheets, plans) == {(1, YEAR)}


def test_the_september_warm_up_is_ignored():
    # Everyone reviews last year's work in the first weeks, so three weeks of
    # it say nothing. The same work carried on past the warm-up does.
    warm_up = [(1, YEAR, week, "SRL-C", "F3", "F2") for week in (1, 2, 3)] * 2
    assert students_out_of_step(warm_up, []) == set()
    later = [(1, YEAR, week, "SRL-C", "F3", "F2") for week in (4, 5, 6)]
    assert students_out_of_step(warm_up + later, []) == {(1, YEAR)}


def test_unknown_grades_are_ignored():
    worksheets = [(1, YEAR, 5, "SRL-C", "F3", None)] * 5 + [(1, YEAR, 5, "SRL-C", "P6", "F1")] * 5
    assert students_out_of_step(worksheets, []) == set()


def test_warm_up_review_is_a_lower_grade_early_in_the_year():
    assert warm_up_review(1, "F2", "F1", 0.0) is True
    assert warm_up_review(3, "F3", "F1", 0.1) is True
    # After the warm-up, or on the student's own grade, it is not review.
    assert warm_up_review(4, "F2", "F1", 0.0) is False
    assert warm_up_review(2, "F2", "F2", 0.0) is False
    assert warm_up_review(2, "F2", None, 0.0) is False


def test_warm_up_review_spares_schools_that_teach_below_our_filing():
    assert warm_up_review(1, "F3", "F2", 0.42) is False
