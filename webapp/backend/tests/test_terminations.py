"""
Tests for termination quarter date functions.

Covers:
- get_quarter_dates() — returns opening/closing dates for custom quarters
- get_quarter_for_date() — classifies a date into its custom quarter + reporting year

Custom quarter definitions (non-standard):
  Q1: Jan 22 – Apr 21
  Q2: Apr 22 – Jul 21
  Q3: Jul 22 – Oct 21
  Q4: Oct 22 – Jan 21 (crosses year boundary)
"""
import pytest
from datetime import date
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.terminations import get_quarter_dates, get_quarter_for_date


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
