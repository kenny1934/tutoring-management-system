"""Tests for the prospect grade vocabulary in utils/grades.py.

A prospect is by definition a P6 student heading for secondary, but the grade
arrives as free text from a branch tutor's pasted spreadsheet. Two rules live
here: folding that text to a canonical value, and using it to rule out an
application that belongs to a different child. Both are pure functions; the
matcher wiring is covered in test_prospect_matching.py and
test_regular_prospect.py.
"""

import pytest

from schemas import PrimaryProspectBulkItem, PrimaryProspectUpdate
from utils.grades import (
    grade_blocks_prospect_link,
    normalize_prospect_grade,
    prospect_entering_grade,
)


class TestNormalizeProspectGrade:
    @pytest.mark.parametrize("raw", [
        "P6", "p6", " P6 ", "P.6",
        "G6", "g6",
        "P6/G6", "p6/g6", "P6 / G6", "G6/P6",
        "6", "Primary 6", "primary6", "Grade 6",
        "小六", "六年級", "小學六年級",
    ])
    def test_every_spelling_folds_to_p6(self, raw):
        assert normalize_prospect_grade(raw) == "P6"

    @pytest.mark.parametrize("raw", ["F1", "F2", "P5", "P6/G7", "S1"])
    def test_other_grades_pass_through(self, raw):
        """Only recognised P6 forms are rewritten. Anything else stays as typed
        so a human can see it and fix it, rather than being coerced silently."""
        assert normalize_prospect_grade(raw) == raw

    def test_empty_and_none_are_preserved(self):
        assert normalize_prospect_grade(None) is None
        assert normalize_prospect_grade("") == ""
        assert normalize_prospect_grade("   ") == ""


class TestProspectEnteringGrade:
    def test_p6_enters_f1(self):
        assert prospect_entering_grade("P6") == "F1"

    def test_unnormalized_spelling_still_resolves(self):
        """The guard works on rows written before the canonical form existed."""
        assert prospect_entering_grade("P6/G6") == "F1"

    def test_unrecognised_grade_yields_nothing(self):
        assert prospect_entering_grade("P5") is None
        assert prospect_entering_grade(None) is None


class TestGradeBlocksProspectLink:
    def test_matching_entering_grade_is_allowed(self):
        assert grade_blocks_prospect_link("P6", "F1") is False
        assert grade_blocks_prospect_link("P6/G6", "F1") is False

    def test_wrong_grade_is_blocked(self):
        """The sibling case: a shared parent phone or a colliding given name
        pointing at the older child's application."""
        assert grade_blocks_prospect_link("P6", "F2") is True
        assert grade_blocks_prospect_link("P6/G6", "F3") is True

    def test_unknown_on_either_side_never_blocks(self):
        """Absence of a grade is not evidence of a mismatch."""
        assert grade_blocks_prospect_link(None, "F2") is False
        assert grade_blocks_prospect_link("P6", None) is False
        assert grade_blocks_prospect_link("P6", "") is False
        assert grade_blocks_prospect_link("mystery", "F2") is False

    def test_comparison_ignores_case(self):
        assert grade_blocks_prospect_link("P6", "f1") is False


class TestIngestNormalisation:
    """Both write paths canonicalise, so nothing new arrives spelled its own
    way: the paste form (bulk create) and a branch tutor's later edit."""

    def test_bulk_item_folds_the_pasted_spelling(self):
        item = PrimaryProspectBulkItem(student_name="Chan Tai Man", grade="P6/G6")
        assert item.grade == "P6"

    def test_tutor_edit_folds_the_typed_spelling(self):
        update = PrimaryProspectUpdate(grade="  g6  ")
        assert update.grade == "P6"

    def test_unset_grade_stays_unset(self):
        assert PrimaryProspectUpdate().grade is None
        assert PrimaryProspectBulkItem(student_name="Chan Tai Man").grade is None
