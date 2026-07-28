"""
Tests for termination quarter date functions.

Covers:
- get_quarter_dates() — returns opening/closing dates for custom quarters
- get_quarter_for_date() — classifies a date into its custom quarter + reporting year
- build_quarter_window() — narrows a quarter around the summer course period
- attribute_quarter() — picks the quarter a lesson end date is judged in

Custom quarter definitions (non-standard):
  Q1: Jan 22 – Apr 21
  Q2: Apr 22 – Jul 21
  Q3: Jul 22 – Oct 21
  Q4: Oct 22 – Jan 21 (crosses year boundary)
"""
import pytest
from datetime import date, timedelta
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from quarters import (
    get_quarter_dates,
    get_quarter_for_date,
    build_quarter_window,
    attribute_quarter,
    PRE_SUMMER_GRACE_DAYS,
)

# The 2026 summer course: regular lessons pause 5 Jul and resume for the new school year
SUMMER_2026 = (date(2026, 7, 5), date(2026, 8, 29))


class TestGetQuarterDates:
    """Test suite for get_quarter_dates function."""

    def test_q1_dates(self):
        """Q1 2025: Jan 22 – Apr 21."""
        opening_start, opening_end, closing_end = get_quarter_dates(2025, 1)
        assert opening_start == date(2025, 1, 22)
        assert opening_end == date(2025, 1, 28)
        assert closing_end == date(2025, 4, 21)

    def test_q2_dates(self):
        """Q2 2025: Apr 22 – Jul 21."""
        opening_start, opening_end, closing_end = get_quarter_dates(2025, 2)
        assert opening_start == date(2025, 4, 22)
        assert opening_end == date(2025, 4, 28)
        assert closing_end == date(2025, 7, 21)

    def test_q3_dates(self):
        """Q3 2025: Jul 22 – Oct 21."""
        opening_start, opening_end, closing_end = get_quarter_dates(2025, 3)
        assert opening_start == date(2025, 7, 22)
        assert opening_end == date(2025, 7, 28)
        assert closing_end == date(2025, 10, 21)

    def test_q4_crosses_year_boundary(self):
        """Q4 2025: Oct 22, 2025 – Jan 21, 2026."""
        opening_start, opening_end, closing_end = get_quarter_dates(2025, 4)
        assert opening_start == date(2025, 10, 22)
        assert opening_end == date(2025, 10, 28)
        assert closing_end == date(2026, 1, 21)

    def test_opening_period_is_7_days(self):
        """Opening period is always 7 days from start."""
        for q in range(1, 5):
            opening_start, opening_end, _ = get_quarter_dates(2025, q)
            assert (opening_end - opening_start).days == 6  # inclusive 7 days


class TestGetQuarterForDate:
    """Test suite for get_quarter_for_date function."""

    # --- Q1: Jan 22 – Apr 21 ---

    def test_q1_start_boundary(self):
        """Jan 22 is the first day of Q1."""
        assert get_quarter_for_date(date(2026, 1, 22)) == (1, 2026)

    def test_q1_end_boundary(self):
        """Apr 21 is the last day of Q1."""
        assert get_quarter_for_date(date(2026, 4, 21)) == (1, 2026)

    def test_q1_mid(self):
        """Mid-Q1 date."""
        assert get_quarter_for_date(date(2026, 3, 1)) == (1, 2026)

    # --- Q2: Apr 22 – Jul 21 ---

    def test_q2_start_boundary(self):
        """Apr 22 is the first day of Q2."""
        assert get_quarter_for_date(date(2026, 4, 22)) == (2, 2026)

    def test_q2_end_boundary(self):
        """Jul 21 is the last day of Q2."""
        assert get_quarter_for_date(date(2026, 7, 21)) == (2, 2026)

    def test_q2_mid(self):
        """Mid-Q2 date."""
        assert get_quarter_for_date(date(2026, 6, 1)) == (2, 2026)

    # --- Q3: Jul 22 – Oct 21 ---

    def test_q3_start_boundary(self):
        """Jul 22 is the first day of Q3."""
        assert get_quarter_for_date(date(2026, 7, 22)) == (3, 2026)

    def test_q3_end_boundary(self):
        """Oct 21 is the last day of Q3."""
        assert get_quarter_for_date(date(2026, 10, 21)) == (3, 2026)

    def test_q3_mid(self):
        """Mid-Q3 date."""
        assert get_quarter_for_date(date(2026, 9, 1)) == (3, 2026)

    # --- Q4: Oct 22 – Jan 21 (crosses year) ---

    def test_q4_start_boundary(self):
        """Oct 22 is the first day of Q4."""
        assert get_quarter_for_date(date(2025, 10, 22)) == (4, 2025)

    def test_q4_november(self):
        """November belongs to Q4."""
        assert get_quarter_for_date(date(2025, 11, 15)) == (4, 2025)

    def test_q4_december(self):
        """December belongs to Q4."""
        assert get_quarter_for_date(date(2025, 12, 25)) == (4, 2025)

    def test_q4_jan_before_22(self):
        """Jan 1-21 belongs to Q4 of PREVIOUS year."""
        assert get_quarter_for_date(date(2026, 1, 15)) == (4, 2025)
        assert get_quarter_for_date(date(2026, 1, 1)) == (4, 2025)
        assert get_quarter_for_date(date(2026, 1, 21)) == (4, 2025)

    def test_q4_end_boundary(self):
        """Jan 21 is the last day of Q4 (previous year's reporting)."""
        assert get_quarter_for_date(date(2026, 1, 21)) == (4, 2025)


class TestBuildQuarterWindowWithoutSummer:
    """A year with no summer course leaves every quarter on the plain calendar."""

    @pytest.mark.parametrize("quarter", [1, 2, 3, 4])
    def test_matches_plain_quarter(self, quarter):
        opening_start, opening_end, closing_end = get_quarter_dates(2026, quarter)
        window = build_quarter_window(2026, quarter, pause=None)

        assert window.opening_start == opening_start
        assert window.opening_end == opening_end
        assert window.closing_end == closing_end
        assert window.churn_cutoff == closing_end
        assert window.judged_from == opening_start
        assert window.prev_closing_end == opening_start - timedelta(days=1)
        assert window.summer is None
        assert window.handover_from is None

    @pytest.mark.parametrize("quarter", [1, 4])
    def test_quarters_away_from_summer_are_untouched(self, quarter):
        """Q1 and Q4 never meet the pause, so a configured summer changes nothing."""
        assert build_quarter_window(2026, quarter, SUMMER_2026) == \
            build_quarter_window(2026, quarter, pause=None)


class TestBuildQuarterWindowRunningIntoSummer:
    """Q2 2026 runs into the pause, so it is measured up to 4 Jul."""

    @pytest.fixture
    def window(self):
        return build_quarter_window(2026, 2, SUMMER_2026)

    def test_measured_up_to_the_day_before_the_pause(self, window):
        assert window.closing_end == date(2026, 7, 4)

    def test_opening_week_is_unchanged(self, window):
        assert window.opening_start == date(2026, 4, 22)
        assert window.opening_end == date(2026, 4, 28)

    def test_churn_cutoff_leaves_the_run_up_to_the_next_quarter(self, window):
        """Lessons ending within the grace period are handed over, not counted as churn."""
        assert window.churn_cutoff == date(2026, 6, 6)
        assert window.handover_from == date(2026, 6, 7)
        assert window.handover_from == window.churn_cutoff + timedelta(days=1)
        assert (SUMMER_2026[0] - window.handover_from).days == PRE_SUMMER_GRACE_DAYS

    def test_still_judges_from_its_own_start(self, window):
        assert window.judged_from == date(2026, 4, 22)

    def test_reports_the_pause_it_was_adjusted_around(self, window):
        assert window.summer == SUMMER_2026


class TestBuildQuarterWindowAfterSummer:
    """Q3 2026 starts inside the pause, so it opens when regular lessons resume."""

    @pytest.fixture
    def window(self):
        return build_quarter_window(2026, 3, SUMMER_2026)

    def test_opens_on_1_sep(self, window):
        assert window.opening_start == date(2026, 9, 1)
        assert window.opening_end == date(2026, 9, 7)

    def test_closing_end_is_unchanged(self, window):
        assert window.closing_end == date(2026, 10, 21)
        assert window.churn_cutoff == date(2026, 10, 21)

    def test_inherits_the_run_up_and_the_pause(self, window):
        """Everything handed over by Q2 is judged here, alongside its own churn."""
        assert window.judged_from == date(2026, 6, 7)

    def test_judged_from_matches_the_previous_quarter_handover(self, window):
        assert window.judged_from == build_quarter_window(2026, 2, SUMMER_2026).handover_from

    def test_previous_quarter_ends_at_the_pause(self, window):
        assert window.prev_closing_end == date(2026, 7, 4)

    def test_resume_date_never_lands_inside_the_pause(self):
        """A course running past 1 Sep pushes the resume date to the day after it."""
        late_summer = (date(2026, 7, 5), date(2026, 9, 6))
        window = build_quarter_window(2026, 3, late_summer)
        assert window.opening_start == date(2026, 9, 7)
        assert window.opening_end == date(2026, 9, 13)


class TestBuildQuarterWindowPauseInsideOneQuarter:
    """A pause that starts and ends inside one quarter needs no handover."""

    def test_no_adjustment(self):
        contained = (date(2026, 7, 25), date(2026, 8, 20))  # wholly inside Q3
        assert build_quarter_window(2026, 3, contained) == \
            build_quarter_window(2026, 3, pause=None)


class TestAttributeQuarter:
    """Ends around the pause are judged in the quarter that resumes after it."""

    def test_before_the_run_up_stays_in_its_own_quarter(self):
        assert attribute_quarter(date(2026, 6, 6), SUMMER_2026) == (2, 2026)

    def test_run_up_moves_to_the_next_quarter(self):
        assert attribute_quarter(date(2026, 6, 7), SUMMER_2026) == (3, 2026)
        assert attribute_quarter(date(2026, 7, 4), SUMMER_2026) == (3, 2026)

    def test_inside_the_pause_moves_to_the_next_quarter(self):
        assert attribute_quarter(date(2026, 7, 5), SUMMER_2026) == (3, 2026)
        assert attribute_quarter(date(2026, 8, 29), SUMMER_2026) == (3, 2026)

    def test_after_the_pause_is_unchanged(self):
        assert attribute_quarter(date(2026, 8, 30), SUMMER_2026) == (3, 2026)
        assert attribute_quarter(date(2026, 10, 22), SUMMER_2026) == (4, 2026)

    def test_without_a_pause_matches_the_plain_quarter(self):
        for d in (date(2026, 6, 7), date(2026, 7, 5), date(2026, 8, 29)):
            assert attribute_quarter(d, None) == get_quarter_for_date(d)
