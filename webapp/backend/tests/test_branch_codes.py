"""Tests for utils/branch_codes.py — the branch-origin vocabulary.

Two rules live here: turning the centre name a parent picked into a branch
code, and deciding when a P6 prospect link may overwrite an application's
verified_branch_origin. Both are pure functions, so they are exercised without
fixtures; the response-level wiring is covered in test_regular_prospect.py.
"""

from utils.branch_codes import (
    NEW_STUDENT_ORIGIN,
    SECONDARY_BRANCH_CODES,
    resolve_claimed_branch_code,
    should_fill_prospect_origin,
)


class TestClaimedBranchCode:
    """The form stores the centre's Chinese display name. 二龍喉分校 exists on
    both sides, so resolving it needs the existing-student category too."""

    def test_secondary_claim_resolves(self):
        assert resolve_claimed_branch_code(
            "MathConcept中學教室 (華士古分校)", "MathConcept Secondary Academy") == "MSA"

    def test_primary_claim_resolves(self):
        assert resolve_claimed_branch_code("高士德分校", "MathConcept Education") == "MAC"

    def test_shared_centre_name_splits_on_the_category(self):
        assert resolve_claimed_branch_code("二龍喉分校", "MathConcept Education") == "MOT"
        assert resolve_claimed_branch_code("二龍喉分校", "MathConcept Secondary Academy") == "MSB"

    def test_no_category_hint_prefers_primary(self):
        assert resolve_claimed_branch_code("二龍喉分校", None) == "MOT"

    def test_no_centre_is_no_code(self):
        assert resolve_claimed_branch_code(None, "MathConcept Education") is None
        assert resolve_claimed_branch_code("", "MathConcept Education") is None

    def test_unrecognised_centre_is_no_code(self):
        assert resolve_claimed_branch_code("某某分校", "MathConcept Education") is None


class TestSecondaryBranchCodes:
    def test_derived_from_the_centre_map(self):
        """Adding a Secondary centre to the map should be the only edit needed."""
        assert SECONDARY_BRANCH_CODES == frozenset({"MSA", "MSB"})


class TestProspectOrigin:
    """The rule every prospect-link path shares. Getting it wrong either loses
    the branch origin or hands a returning student a new-student offer."""

    def test_fills_an_unset_origin(self):
        assert should_fill_prospect_origin(None, "MCP") is True
        assert should_fill_prospect_origin("", "MCP") is True

    def test_corrects_a_new_origin(self):
        # A prospect came from a primary branch, so "New" is now known wrong.
        assert should_fill_prospect_origin(NEW_STUDENT_ORIGIN, "MCP") is True

    def test_overrides_a_secondary_branch(self):
        """MSA/MSB is where they landed. Linking the student record fills the
        origin from that student's home location, so without this the origin
        would permanently record the destination for every P6 transition that
        enrolled before anyone linked the prospect."""
        assert should_fill_prospect_origin("MSA", "MCP") is True
        assert should_fill_prospect_origin("MSB", "MCP") is True
        assert should_fill_prospect_origin("msa", "MCP") is True

    def test_leaves_another_primary_branch_alone(self):
        # An admin picked that branch knowing more than the link does.
        assert should_fill_prospect_origin("MTA", "MCP") is False
        assert should_fill_prospect_origin("MOT", "MCP") is False

    def test_a_prospect_without_a_branch_writes_nothing(self):
        assert should_fill_prospect_origin(None, None) is False
        assert should_fill_prospect_origin(NEW_STUDENT_ORIGIN, "") is False
