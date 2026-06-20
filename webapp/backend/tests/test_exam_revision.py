"""
Tests for exam revision helper functions.

Covers:
- _parse_time_slot() — time string to minutes conversion
- _times_overlap() — overlap detection between two time slots
- _is_session_consumable() — whether a session can be consumed for revision enrollment
"""
import pytest
from datetime import date, timedelta
from constants import hk_now
from unittest.mock import MagicMock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.orm import Session

from routers.exam_revision import _parse_time_slot, _times_overlap, _is_session_consumable
from constants import PENDING_MAKEUP_STATUSES, SCHEDULABLE_STATUSES, SessionStatus
from models import (
    ExamRevisionSlot, CalendarEvent, SessionLog, Student, Tutor, Enrollment,
)
from tests.helpers import make_auth_token


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
        s.session_date = session_date or (hk_now().date() + timedelta(days=7))
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
            session = self._mock_session(status, session_date=hk_now().date() + timedelta(days=1))
            assert _is_session_consumable(session) is True, f"Failed for {status}"

    def test_scheduled_past_not_consumable(self):
        """Scheduled session in the past is NOT consumable."""
        for status in SCHEDULABLE_STATUSES:
            session = self._mock_session(status, session_date=hk_now().date() - timedelta(days=1))
            assert _is_session_consumable(session) is False, f"Failed for {status}"

    def test_attended_not_consumable(self):
        """Attended session is not consumable."""
        session = self._mock_session("Attended")
        assert _is_session_consumable(session) is False

    def test_cancelled_not_consumable(self):
        """Cancelled session is not consumable."""
        session = self._mock_session("Cancelled")
        assert _is_session_consumable(session) is False


class TestEnrollStudentInheritsFromConsumedSession:
    """
    Integration tests for POST /exam-revision/slots/{slot_id}/enroll.

    Regression coverage for the bug where the created revision (make-up) session
    got the wrong enrollment_id (an arbitrary enrollment looked up by
    student + location) and was hard-coded to "Unpaid". A make-up session must
    inherit BOTH enrollment_id and financial_status from the session it consumes.
    """

    def _seed(self, db_session: Session):
        """
        Seed a tutor, student, TWO active enrollments at the same location, a
        consumable pending session attached to the *second* enrollment and
        marked Paid, plus a future revision slot.

        Two same-location enrollments are deliberate: the old buggy code did
        ``Enrollment.query(...).first()`` and would pick the *other* enrollment,
        so asserting on the consumed session's enrollment proves the fix.
        """
        tutor = Tutor(
            user_email="tutor@test.com", tutor_name="Mr Test Tutor",
            role="Tutor", default_location="Main Center",
        )
        student = Student(
            school_student_id="STU777", student_name="Test Student",
            grade="F4", phone="12345678", school="Test School",
        )
        db_session.add_all([tutor, student])
        db_session.commit()
        db_session.refresh(tutor)
        db_session.refresh(student)

        # An older enrollment at the same location — the buggy lookup would have
        # returned this one via .first().
        other_enrollment = Enrollment(
            student_id=student.id, tutor_id=tutor.id,
            assigned_day="Monday", assigned_time="15:00 - 16:30",
            location="Main Center", lessons_paid=10,
            payment_date=date.today() - timedelta(days=120),
            first_lesson_date=date.today() - timedelta(days=120),
            payment_status="Paid", enrollment_type="Regular",
        )
        # The current enrollment the consumed session actually belongs to.
        target_enrollment = Enrollment(
            student_id=student.id, tutor_id=tutor.id,
            assigned_day="Monday", assigned_time="15:00 - 16:30",
            location="Main Center", lessons_paid=10,
            payment_date=date.today(), first_lesson_date=date.today(),
            payment_status="Paid", enrollment_type="Regular",
        )
        db_session.add_all([other_enrollment, target_enrollment])
        db_session.commit()
        db_session.refresh(other_enrollment)
        db_session.refresh(target_enrollment)

        # Consumed session: a pending make-up that is already Paid.
        consumed = SessionLog(
            enrollment_id=target_enrollment.id, student_id=student.id,
            tutor_id=tutor.id, session_date=date.today(),
            time_slot="15:00 - 16:30", location="Main Center",
            session_status=SessionStatus.RESCHEDULED_PENDING.value,
            financial_status="Paid",
        )
        db_session.add(consumed)
        db_session.commit()
        db_session.refresh(consumed)

        # Calendar event + revision slot. Slot time differs from the regular
        # enrollment slot so the enrollment-deadline branch (which needs a MySQL
        # function) is skipped under SQLite.
        event = CalendarEvent(
            event_id="evt-test-777", title="F4 Maths Exam",
            start_date=date.today() + timedelta(days=14),
            school="Test School", grade="F4", event_type="Exam",
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)

        slot = ExamRevisionSlot(
            calendar_event_id=event.id,
            session_date=date.today() + timedelta(days=7),
            time_slot="17:00 - 18:30", tutor_id=tutor.id,
            location="Main Center",
        )
        db_session.add(slot)
        db_session.commit()
        db_session.refresh(slot)

        token = make_auth_token(tutor.id)
        return {
            "token": token, "student": student, "slot": slot,
            "consumed": consumed, "target_enrollment": target_enrollment,
            "other_enrollment": other_enrollment,
        }

    def test_revision_session_inherits_enrollment_and_paid_status(self, client, db_session):
        """The created revision session inherits enrollment_id + financial_status
        from the consumed session (not an arbitrary enrollment, not hard-coded Unpaid)."""
        ctx = self._seed(db_session)

        resp = client.post(
            f"/api/exam-revision/slots/{ctx['slot'].id}/enroll",
            json={
                "student_id": ctx["student"].id,
                "consume_session_id": ctx["consumed"].id,
            },
            cookies={"access_token": ctx["token"]},
        )
        assert resp.status_code == 200, resp.text

        revision = db_session.query(SessionLog).filter(
            SessionLog.exam_revision_slot_id == ctx["slot"].id,
            SessionLog.make_up_for_id == ctx["consumed"].id,
        ).one()

        # Inherits the consumed session's enrollment, NOT the older same-location one.
        assert revision.enrollment_id == ctx["target_enrollment"].id
        assert revision.enrollment_id != ctx["other_enrollment"].id
        # Inherits the consumed session's paid status instead of defaulting to Unpaid.
        assert revision.financial_status == "Paid"
        # Sanity: it is the make-up for the consumed session.
        assert revision.session_status == "Make-up Class"
        assert revision.make_up_for_id == ctx["consumed"].id

    def test_revision_session_inherits_unpaid_status(self, client, db_session):
        """When the consumed session is Unpaid, the revision session stays Unpaid."""
        ctx = self._seed(db_session)
        ctx["consumed"].financial_status = "Unpaid"
        db_session.commit()

        resp = client.post(
            f"/api/exam-revision/slots/{ctx['slot'].id}/enroll",
            json={
                "student_id": ctx["student"].id,
                "consume_session_id": ctx["consumed"].id,
            },
            cookies={"access_token": ctx["token"]},
        )
        assert resp.status_code == 200, resp.text

        revision = db_session.query(SessionLog).filter(
            SessionLog.exam_revision_slot_id == ctx["slot"].id,
            SessionLog.make_up_for_id == ctx["consumed"].id,
        ).one()
        assert revision.financial_status == "Unpaid"
        assert revision.enrollment_id == ctx["target_enrollment"].id
