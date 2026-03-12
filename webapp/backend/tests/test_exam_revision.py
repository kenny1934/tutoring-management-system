"""
Tests for exam revision helper functions.

Covers:
- _parse_time_slot() — time string to minutes conversion
- _times_overlap() — overlap detection between two time slots
- _is_session_consumable() — whether a session can be consumed for revision enrollment
"""
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.exam_revision import _parse_time_slot, _times_overlap, _is_session_consumable
from constants import PENDING_MAKEUP_STATUSES, SCHEDULABLE_STATUSES


class TestParseTimeSlot:
    """Test suite for _parse_time_slot function."""

    def test_standard_format(self):
        """Standard format: '16:45 - 18:15'."""
        assert _parse_time_slot("16:45 - 18:15") == (16 * 60 + 45, 18 * 60 + 15)

    def test_morning_slot(self):
        """Morning slot."""
        assert _parse_time_slot("09:00 - 10:30") == (540, 630)

    def test_single_digit_hour(self):
        """Single digit hour: '9:00 - 10:30'."""
        assert _parse_time_slot("9:00 - 10:30") == (540, 630)

    def test_invalid_returns_zero(self):
        """Invalid format returns (0, 0)."""
        assert _parse_time_slot("invalid") == (0, 0)

    def test_empty_string(self):
        """Empty string returns (0, 0)."""
        assert _parse_time_slot("") == (0, 0)

    def test_missing_separator(self):
        """No separator returns (0, 0)."""
        assert _parse_time_slot("09:00") == (0, 0)

    def test_midnight(self):
        """Midnight: '00:00 - 01:00'."""
        assert _parse_time_slot("00:00 - 01:00") == (0, 60)


class TestTimesOverlap:
    """Test suite for _times_overlap function."""

    def test_overlapping_slots(self):
        """Partially overlapping slots."""
        assert _times_overlap("09:00 - 10:00", "09:30 - 10:30") is True

    def test_contained_slot(self):
        """One slot fully contained in the other."""
        assert _times_overlap("09:00 - 12:00", "10:00 - 11:00") is True

    def test_adjacent_no_overlap(self):
        """Adjacent slots do not overlap (end == start)."""
        assert _times_overlap("09:00 - 10:00", "10:00 - 11:00") is False

    def test_non_overlapping(self):
        """Completely separate slots."""
        assert _times_overlap("09:00 - 10:00", "11:00 - 12:00") is False

    def test_same_slot(self):
        """Identical slots overlap."""
        assert _times_overlap("09:00 - 10:30", "09:00 - 10:30") is True

    def test_invalid_first_slot(self):
        """Invalid first slot returns False."""
        assert _times_overlap("invalid", "09:00 - 10:00") is False

    def test_invalid_second_slot(self):
        """Invalid second slot returns False."""
        assert _times_overlap("09:00 - 10:00", "invalid") is False

    def test_both_invalid(self):
        """Both invalid returns False."""
        assert _times_overlap("invalid", "bad") is False


class TestIsSessionConsumable:
    """Test suite for _is_session_consumable function."""

    def _mock_session(self, status, session_date=None, rescheduled_to_id=None):
        """Create a mock SessionLog."""
        s = MagicMock()
        s.session_status = status
        s.session_date = session_date or (date.today() + timedelta(days=7))
        s.rescheduled_to_id = rescheduled_to_id
        return s

    def test_pending_makeup_consumable(self):
        """Pending makeup without rescheduled_to is consumable."""
        for status in PENDING_MAKEUP_STATUSES:
            session = self._mock_session(status, rescheduled_to_id=None)
            assert _is_session_consumable(session) is True, f"Failed for {status}"

    def test_pending_makeup_with_rescheduled_to_not_consumable(self):
        """Pending makeup with rescheduled_to is NOT consumable (already used)."""
        for status in PENDING_MAKEUP_STATUSES:
            session = self._mock_session(status, rescheduled_to_id=99)
            assert _is_session_consumable(session) is False, f"Failed for {status}"

    def test_scheduled_future_consumable(self):
        """Scheduled session in the future is consumable."""
        for status in SCHEDULABLE_STATUSES:
            session = self._mock_session(status, session_date=date.today() + timedelta(days=1))
            assert _is_session_consumable(session) is True, f"Failed for {status}"

    def test_scheduled_past_not_consumable(self):
        """Scheduled session in the past is NOT consumable."""
        for status in SCHEDULABLE_STATUSES:
            session = self._mock_session(status, session_date=date.today() - timedelta(days=1))
            assert _is_session_consumable(session) is False, f"Failed for {status}"

    def test_attended_not_consumable(self):
        """Attended session is not consumable."""
        session = self._mock_session("Attended")
        assert _is_session_consumable(session) is False

    def test_cancelled_not_consumable(self):
        """Cancelled session is not consumable."""
        session = self._mock_session("Cancelled")
        assert _is_session_consumable(session) is False
