"""
Tests for session-related business logic.

Covers:
- Makeup chain traversal (_find_root_original_session, _find_root_original_session_date)
- Batch root date resolution (batch_find_root_original_session_dates)
- 60-day makeup deadline rule enforcement
- Session ownership verification
"""
import pytest
from datetime import date, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import SessionLog, Student, Tutor, Enrollment
from routers.sessions import _find_root_original_session, _verify_session_ownership
from utils.response_builders import _find_root_original_session_date, batch_find_root_original_session_dates


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def sample_tutor(db_session: Session) -> Tutor:
    """Create a test tutor."""
    tutor = Tutor(
        user_email="tutor@example.com",
        tutor_name="Test Tutor",
        default_location="Main Center",
        role="Tutor",
    )
    db_session.add(tutor)
    db_session.commit()
    db_session.refresh(tutor)
    return tutor


@pytest.fixture
def sample_student(db_session: Session) -> Student:
    """Create a test student."""
    student = Student(
        school_student_id="STU001",
        student_name="Test Student",
        grade="F4",
        phone="12345678",
        school="Test High School",
    )
    db_session.add(student)
    db_session.commit()
    db_session.refresh(student)
    return student


@pytest.fixture
def sample_enrollment(db_session: Session, sample_student: Student, sample_tutor: Tutor) -> Enrollment:
    """Create a test enrollment."""
    enrollment = Enrollment(
        student_id=sample_student.id,
        tutor_id=sample_tutor.id,
        assigned_day="Monday",
        assigned_time="15:00-16:00",
        location="Main Center",
        lessons_paid=10,
        payment_date=date.today(),
        first_lesson_date=date.today(),
        payment_status="Paid",
        enrollment_type="Regular",
    )
    db_session.add(enrollment)
    db_session.commit()
    db_session.refresh(enrollment)
    return enrollment


# ============================================================================
# Makeup Chain Traversal Tests
# ============================================================================

class TestFindRootOriginalSession:
    """Tests for _find_root_original_session() function."""

    def test_no_chain_returns_self(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Session with no make_up_for_id returns itself."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 3, 2),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        result = _find_root_original_session(session, db_session)

        assert result.id == session.id
        assert result.session_date == date(2026, 3, 2)

    def test_simple_chain_returns_root(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """A <- B: calling with B returns A."""
        # Original session A
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        # Makeup session B for A
        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 15),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        result = _find_root_original_session(session_b, db_session)

        assert result.id == session_a.id
        assert result.session_date == date(2026, 1, 5)

    def test_deep_chain_returns_root(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """A <- B <- C <- D: calling with D returns A."""
        # Original session A
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        # Chain: B <- A
        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 15),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        # Chain: C <- B
        session_c = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 25),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_b.id,
        )
        db_session.add(session_c)
        db_session.commit()
        db_session.refresh(session_c)

        # Chain: D <- C
        session_d = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 2, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
            make_up_for_id=session_c.id,
        )
        db_session.add(session_d)
        db_session.commit()
        db_session.refresh(session_d)

        result = _find_root_original_session(session_d, db_session)

        assert result.id == session_a.id
        assert result.session_date == date(2026, 1, 5)

    def test_orphaned_chain_returns_last_valid(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Session with non-existent make_up_for_id returns itself."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 2, 10),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
            make_up_for_id=99999,  # Non-existent session
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        result = _find_root_original_session(session, db_session)

        # Returns the session itself since parent doesn't exist
        assert result.id == session.id

    def test_circular_reference_breaks_loop(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Circular reference (data corruption) does not cause infinite loop."""
        # Create session A
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        # Create session B pointing to A
        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 15),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        # CORRUPT DATA: Make A point back to B (circular reference)
        session_a.make_up_for_id = session_b.id
        db_session.commit()

        # Should not hang - visited set breaks the loop
        result = _find_root_original_session(session_b, db_session)

        # Result should be one of the sessions in the loop
        assert result.id in [session_a.id, session_b.id]


class TestFindRootOriginalSessionDate:
    """Tests for _find_root_original_session_date() function."""

    def test_non_makeup_returns_none(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Non-makeup session (no make_up_for_id) returns None."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 3, 2),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        result = _find_root_original_session_date(session, db_session)

        assert result is None

    def test_simple_chain_returns_root_date(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """A <- B: returns A's date."""
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 15),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        result = _find_root_original_session_date(session_b, db_session)

        assert result == date(2026, 1, 5)

    def test_deep_chain_returns_root_date(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """A <- B <- C: returns A's date."""
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 1),  # Root date
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 15),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        session_c = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 2, 1),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
            make_up_for_id=session_b.id,
        )
        db_session.add(session_c)
        db_session.commit()
        db_session.refresh(session_c)

        result = _find_root_original_session_date(session_c, db_session)

        assert result == date(2026, 1, 1)  # Root session A's date


# ============================================================================
# 60-Day Makeup Deadline Rule Tests
# ============================================================================

class TestMakeupDeadlineRule:
    """
    Tests for the 60-day makeup deadline rule.

    The rule: Makeup must be scheduled within 60 days of the ROOT original session.
    Super Admin can override this restriction.
    """

    def test_within_60_days_allowed(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Makeup within 60 days should be allowed."""
        original_date = date(2026, 1, 1)
        makeup_date = date(2026, 2, 15)  # 45 days later

        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=original_date,
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        root = _find_root_original_session(session, db_session)
        days_since_original = (makeup_date - root.session_date).days

        assert days_since_original == 45
        assert days_since_original <= 60  # Within limit

    def test_exactly_60_days_allowed(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Makeup at exactly 60 days should be allowed (> 60, not >= 60)."""
        original_date = date(2026, 1, 1)
        makeup_date = date(2026, 3, 2)  # 60 days later

        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=original_date,
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        root = _find_root_original_session(session, db_session)
        days_since_original = (makeup_date - root.session_date).days

        assert days_since_original == 60
        assert not (days_since_original > 60)  # Should pass the rule

    def test_61_days_exceeds_limit(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """Makeup at 61 days should exceed the limit for regular users."""
        original_date = date(2026, 1, 1)
        makeup_date = date(2026, 3, 3)  # 61 days later

        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=original_date,
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        root = _find_root_original_session(session, db_session)
        days_since_original = (makeup_date - root.session_date).days

        assert days_since_original == 61
        assert days_since_original > 60  # Exceeds limit

    def test_chain_uses_root_date_for_calculation(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """
        For chained makeups, the 60-day rule should count from the ROOT original.

        A (Jan 1) <- B (Jan 30) <- C (Mar 15)
        C is 73 days from A, so should be blocked (not 44 days from B).
        """
        # Root original session A
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 1),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        # First makeup B
        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 30),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        # Proposed second makeup C date
        proposed_makeup_date = date(2026, 3, 15)

        # Find root from B (where the user would be scheduling makeup)
        root = _find_root_original_session(session_b, db_session)

        # Verify root is A
        assert root.id == session_a.id

        # Calculate days from root
        days_since_original = (proposed_makeup_date - root.session_date).days

        # Should be 73 days from Jan 1, not 44 days from Jan 30
        assert days_since_original == 73
        assert days_since_original > 60  # Should be blocked

        # Verify that if we only counted from immediate parent, it would pass
        days_from_immediate = (proposed_makeup_date - session_b.session_date).days
        assert days_from_immediate == 44
        assert days_from_immediate <= 60  # Would pass if we used wrong date

    def test_deep_chain_deadline_calculation(
        self, db_session: Session, sample_enrollment: Enrollment, sample_tutor: Tutor
    ):
        """
        Deep chain: A <- B <- C <- D, D should count from A's date.
        """
        # A: Jan 1
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 1),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        # B: Jan 15 (makeup for A)
        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 15),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        # C: Jan 30 (makeup for B)
        session_c = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_enrollment.student_id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 30),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Pending Make-up",
            make_up_for_id=session_b.id,
        )
        db_session.add(session_c)
        db_session.commit()
        db_session.refresh(session_c)

        # Proposed D date: Feb 28 (58 days from A - within limit)
        proposed_date_ok = date(2026, 2, 28)

        root = _find_root_original_session(session_c, db_session)
        assert root.id == session_a.id

        days_ok = (proposed_date_ok - root.session_date).days
        assert days_ok == 58
        assert days_ok <= 60  # Should pass

        # Proposed D date: Mar 5 (63 days from A - exceeds limit)
        proposed_date_blocked = date(2026, 3, 5)
        days_blocked = (proposed_date_blocked - root.session_date).days
        assert days_blocked == 63
        assert days_blocked > 60  # Should be blocked


# ============================================================================
# Batch Root Date Resolution Tests
# ============================================================================

class TestBatchFindRootOriginalSessionDates:
    """Tests for batch_find_root_original_session_dates() function."""

    def test_empty_list_returns_empty(self, db_session):
        """Empty session list should return empty dict."""
        result = batch_find_root_original_session_dates([], db_session)
        assert result == {}

    def test_no_makeups_returns_empty(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """Sessions without make_up_for_id should return empty dict."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        result = batch_find_root_original_session_dates([session], db_session)
        assert result == {}

    def test_simple_chain(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """A -> B makeup chain: B should resolve to A's date."""
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Rescheduled - Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 12),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Make-up Class",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        result = batch_find_root_original_session_dates([session_a, session_b], db_session)
        assert session_b.id in result
        assert result[session_b.id] == date(2026, 1, 5)
        assert session_a.id not in result  # A is not a makeup

    def test_deep_chain(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """A -> B -> C chain: both B and C should resolve to A's date."""
        session_a = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Rescheduled - Pending Make-up",
        )
        db_session.add(session_a)
        db_session.commit()
        db_session.refresh(session_a)

        session_b = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 12),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Rescheduled - Pending Make-up",
            make_up_for_id=session_a.id,
        )
        db_session.add(session_b)
        db_session.commit()
        db_session.refresh(session_b)

        session_c = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 19),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Make-up Class",
            make_up_for_id=session_b.id,
        )
        db_session.add(session_c)
        db_session.commit()
        db_session.refresh(session_c)

        result = batch_find_root_original_session_dates([session_b, session_c], db_session)
        assert result[session_b.id] == date(2026, 1, 5)
        assert result[session_c.id] == date(2026, 1, 5)

    def test_mixed_list(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """Mix of regular and makeup sessions: only makeups appear in result."""
        regular = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        original = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 12),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Rescheduled - Pending Make-up",
        )
        db_session.add_all([regular, original])
        db_session.commit()
        db_session.refresh(regular)
        db_session.refresh(original)

        makeup = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 19),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Make-up Class",
            make_up_for_id=original.id,
        )
        db_session.add(makeup)
        db_session.commit()
        db_session.refresh(makeup)

        result = batch_find_root_original_session_dates([regular, original, makeup], db_session)
        assert len(result) == 1
        assert makeup.id in result
        assert result[makeup.id] == date(2026, 1, 12)


# ============================================================================
# Session Ownership Verification Tests
# ============================================================================

class TestVerifySessionOwnership:
    """Tests for _verify_session_ownership helper."""

    def test_owner_allowed(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """Session owner should pass verification."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()

        # Should not raise
        _verify_session_ownership(session, sample_tutor)

    def test_admin_allowed(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """Admin should be allowed to modify any session."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()

        admin = Tutor(
            user_email="admin@test.com",
            tutor_name="Admin User",
            role="Admin",
            default_location="Main Center",
        )
        db_session.add(admin)
        db_session.commit()

        # Admin should not raise even though they don't own the session
        _verify_session_ownership(session, admin)

    def test_non_owner_rejected(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """Non-owner, non-admin should be rejected."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()

        other_tutor = Tutor(
            user_email="other@test.com",
            tutor_name="Other Tutor",
            role="Tutor",
            default_location="Main Center",
        )
        db_session.add(other_tutor)
        db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            _verify_session_ownership(session, other_tutor)
        assert exc_info.value.status_code == 403
        assert "modify" in exc_info.value.detail

    def test_custom_action_in_message(self, db_session, sample_enrollment, sample_student, sample_tutor):
        """Custom action parameter should appear in error message."""
        session = SessionLog(
            enrollment_id=sample_enrollment.id,
            student_id=sample_student.id,
            tutor_id=sample_tutor.id,
            session_date=date(2026, 1, 5),
            time_slot="15:00-16:00",
            location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()

        other_tutor = Tutor(
            user_email="other@test.com",
            tutor_name="Other Tutor",
            role="Tutor",
            default_location="Main Center",
        )
        db_session.add(other_tutor)
        db_session.commit()

        with pytest.raises(HTTPException) as exc_info:
            _verify_session_ownership(session, other_tutor, action="rate")
        assert "rate" in exc_info.value.detail


# ============================================================================
# Non-Owner Tutor Action Tests (Integration)
# ============================================================================

class TestNonOwnerTutorActions:
    """
    Integration tests verifying any authenticated tutor can perform
    reschedule/sick-leave/weather-cancelled/undo/schedule-makeup
    on sessions they don't own.
    """

    def _seed(self, db_session):
        """Create owner tutor, non-owner tutor, student, enrollment, and a scheduled session."""
        from tests.helpers import make_auth_token

        owner = Tutor(
            user_email="owner@test.com", tutor_name="Owner Tutor",
            role="Tutor", default_location="Main Center",
        )
        other = Tutor(
            user_email="other@test.com", tutor_name="Other Tutor",
            role="Tutor", default_location="Main Center",
        )
        student = Student(
            school_student_id="STU999", student_name="Test Student",
            grade="F4", phone="12345678", school="Test School",
        )
        db_session.add_all([owner, other, student])
        db_session.commit()
        db_session.refresh(owner)
        db_session.refresh(other)
        db_session.refresh(student)

        enrollment = Enrollment(
            student_id=student.id, tutor_id=owner.id,
            assigned_day="Monday", assigned_time="15:00-16:00",
            location="Main Center", lessons_paid=10,
            payment_date=date.today(), first_lesson_date=date.today(),
            payment_status="Paid", enrollment_type="Regular",
        )
        db_session.add(enrollment)
        db_session.commit()
        db_session.refresh(enrollment)

        session = SessionLog(
            enrollment_id=enrollment.id, student_id=student.id,
            tutor_id=owner.id, session_date=date.today(),
            time_slot="15:00-16:00", location="Main Center",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        token = make_auth_token(other.id)
        return session, token

    def test_non_owner_can_reschedule(self, client, db_session):
        """Non-owner tutor should be able to reschedule another tutor's session."""
        session, token = self._seed(db_session)
        resp = client.patch(
            f"/api/sessions/{session.id}/reschedule",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert "Pending Make-up" in resp.json()["session_status"]

    def test_non_owner_can_mark_sick_leave(self, client, db_session):
        """Non-owner tutor should be able to mark sick leave on another tutor's session."""
        session, token = self._seed(db_session)
        resp = client.patch(
            f"/api/sessions/{session.id}/sick-leave",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert "Sick Leave" in resp.json()["session_status"]

    def test_non_owner_can_mark_weather_cancelled(self, client, db_session):
        """Non-owner tutor should be able to mark weather cancelled on another tutor's session."""
        session, token = self._seed(db_session)
        resp = client.patch(
            f"/api/sessions/{session.id}/weather-cancelled",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert "Weather Cancelled" in resp.json()["session_status"]

    def test_non_owner_can_undo(self, client, db_session):
        """Non-owner tutor should be able to undo status on another tutor's session."""
        session, token = self._seed(db_session)
        # First set a previous status so undo has something to revert
        session.previous_session_status = "Scheduled"
        session.session_status = "Rescheduled - Pending Make-up"
        db_session.commit()

        resp = client.patch(
            f"/api/sessions/{session.id}/undo",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        assert resp.json()["session_status"] == "Scheduled"
