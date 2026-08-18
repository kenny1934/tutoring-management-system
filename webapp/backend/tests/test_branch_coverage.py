"""Working at a branch that is not your own.

A tutor from MSA went to MSB to cover somebody else's lessons and there was no
way to say so, because every picker in the app narrowed by the tutor's own
default_location. The data model was never the obstacle: session_log has always
carried its own location, so the lesson was representable, and the revenue views
already credit it to whoever taught it. What was missing was a way to record
that the arrangement exists.

The rule these tests pin down is the split between the two ways of asking. A
picker that is about to assign a lesson knows the date and gets the strict
answer. A filter toolbar has no particular day in mind and gets the permissive
one. Getting that backwards in either direction is the bug worth catching:
strict everywhere means a filter shows nothing, and permissive everywhere means
somebody's Saturday cover offers them for a Tuesday.
"""
from datetime import date

from models import Tutor, TutorBranchCoverage
from utils.employment import covers_on, normalise_location, works_at

TODAY = date(2026, 8, 15)
SATURDAY = date(2026, 8, 22)
TUESDAY = date(2026, 8, 25)


def _tutor(home="MSA", coverage=()):
    return Tutor(
        user_email="simon@example.com",
        tutor_name="Simon",
        role="Tutor",
        default_location=home,
        is_active_tutor=True,
        branch_coverage=list(coverage),
    )


def _cover(location="MSB", weekday=None, start=None, until=None):
    return TutorBranchCoverage(
        location=location,
        weekday=weekday,
        effective_from=start,
        effective_until=until,
    )


class TestOwnBranch:
    def test_their_own_branch_needs_no_coverage(self):
        assert works_at(_tutor("MSA"), "MSA") is True
        assert works_at(_tutor("MSA"), "MSB") is False

    def test_no_branch_selected_offers_everybody(self):
        assert works_at(_tutor("MSA"), None) is True
        assert works_at(_tutor("MSA"), "") is True

    def test_the_chinese_branch_name_is_the_same_branch(self):
        assert works_at(_tutor("MSB"), "二龍喉分校") is True
        assert works_at(_tutor("MSB"), "華士古分校") is False
        assert normalise_location("華士古分校") == "MSA"
        assert normalise_location("MSA") == "MSA"


class TestCoverage:
    def test_an_open_ended_arrangement_applies_on_any_day(self):
        simon = _tutor(coverage=[_cover()])
        assert works_at(simon, "MSB") is True
        assert works_at(simon, "MSB", SATURDAY) is True
        assert works_at(simon, "MSB", TUESDAY) is True

    def test_a_weekday_arrangement_stays_on_that_weekday(self):
        simon = _tutor(coverage=[_cover(weekday="Sat")])
        assert works_at(simon, "MSB", SATURDAY) is True
        assert works_at(simon, "MSB", TUESDAY) is False

    def test_a_single_day_is_a_range_of_one(self):
        simon = _tutor(coverage=[_cover(start=SATURDAY, until=SATURDAY)])
        assert works_at(simon, "MSB", SATURDAY) is True
        assert works_at(simon, "MSB", date(2026, 8, 23)) is False

    def test_a_range_is_inclusive_at_both_ends(self):
        simon = _tutor(coverage=[_cover(start=date(2026, 8, 1), until=date(2026, 8, 31))])
        assert works_at(simon, "MSB", date(2026, 7, 31)) is False
        assert works_at(simon, "MSB", date(2026, 8, 1)) is True
        assert works_at(simon, "MSB", date(2026, 8, 31)) is True
        assert works_at(simon, "MSB", date(2026, 9, 1)) is False

    def test_coverage_of_another_branch_does_not_count(self):
        assert works_at(_tutor(coverage=[_cover(location="MSC")]), "MSB") is False


class TestTheTwoWaysOfAsking:
    def test_a_filter_gets_the_permissive_answer(self):
        # Saturdays only, asked with no date. A filter wants to know whether
        # this tutor has anything at MSB at all, and they do.
        simon = _tutor(coverage=[_cover(weekday="Sat")])
        assert works_at(simon, "MSB") is True

    def test_a_finished_arrangement_drops_out_of_the_filter(self):
        finished = _cover(until=date(2020, 1, 1))
        assert covers_on(finished, None) is False
        # But history stays readable: a date inside the window still matches.
        assert covers_on(finished, date(2019, 12, 25)) is True

    def test_an_arrangement_still_to_start_counts_for_a_filter(self):
        # Only the end is checked without a date. Somebody who starts covering
        # next month should already be findable, and refusing them would leave
        # the filter unable to name them on the day they turn up.
        assert covers_on(_cover(start=date(2099, 1, 1)), None) is True
