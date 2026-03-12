"""
Tests for enrollment scheduling helper functions.

Covers:
- get_day_of_week_number() — day name to weekday number
- calculate_new_session_date() — session date when changing assigned day
"""
from datetime import date
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.enrollments import get_day_of_week_number, calculate_new_session_date


class TestGetDayOfWeekNumber:
    """Test suite for get_day_of_week_number function."""

    def test_full_names(self):
        assert get_day_of_week_number("Monday") == 0
        assert get_day_of_week_number("Wednesday") == 2
        assert get_day_of_week_number("Sunday") == 6

    def test_short_names(self):
        assert get_day_of_week_number("Mon") == 0
        assert get_day_of_week_number("Wed") == 2
        assert get_day_of_week_number("Sun") == 6

    def test_unknown_defaults_to_zero(self):
        assert get_day_of_week_number("InvalidDay") == 0


class TestCalculateNewSessionDate:
    """Test suite for calculate_new_session_date function."""

    def test_same_week_forward(self):
        # Monday Mar 9 → Wednesday Mar 11 (same week, +2 days)
        result = calculate_new_session_date(date(2026, 3, 9), "Monday", "Wednesday")
        assert result == date(2026, 3, 11)

    def test_wrap_to_next_week(self):
        # Wednesday Mar 11 → Monday Mar 16 (next week, +5 days)
        result = calculate_new_session_date(date(2026, 3, 11), "Wednesday", "Monday")
        assert result == date(2026, 3, 16)

    def test_same_day(self):
        # Tuesday → Tuesday = same date
        result = calculate_new_session_date(date(2026, 3, 10), "Tuesday", "Tuesday")
        assert result == date(2026, 3, 10)

    def test_short_day_names(self):
        # Mon Mar 9 → Fri Mar 13 (+4 days)
        result = calculate_new_session_date(date(2026, 3, 9), "Mon", "Fri")
        assert result == date(2026, 3, 13)

    def test_saturday_to_monday(self):
        # Sat Mar 14 → Mon Mar 16 (+2 days, wraps to next week)
        result = calculate_new_session_date(date(2026, 3, 14), "Saturday", "Monday")
        assert result == date(2026, 3, 16)
