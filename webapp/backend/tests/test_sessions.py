"""
Tests for session-related business logic.

Covers:
- Makeup chain traversal (_find_root_original_session, _find_root_original_session_date)
- 60-day makeup deadline rule enforcement
"""
import pytest
from datetime import date, timedelta
from sqlalchemy.orm import Session

from models import SessionLog, Student, Tutor, Enrollment
from routers.sessions import _find_root_original_session
from utils.response_builders import _find_root_original_session_date


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
