"""
Tests for enrollment session generation and date calculations.

These tests verify critical business logic for:
- Session date generation with holiday awareness
- Effective end date calculation
- Student conflict detection

Key business rules:
- Trial and One-Time enrollments generate exactly 1 session
- Regular enrollments generate lessons_paid sessions
- Holidays are skipped (not counted) but included in session list
- Effective end date = lessons_paid + extension_weeks non-holiday dates
"""
import pytest
from datetime import date, timedelta
from typing import List
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routers.enrollments import (
    generate_session_dates,
    calculate_effective_end_date,
    calculate_effective_end_date_bulk,
    get_holidays_in_range,
    check_student_conflicts,
    format_fee_message,
)
from models import Holiday, Enrollment, Tutor, Student, SessionLog
from schemas import SessionPreview


# ============================================================================
# Test generate_session_dates()
# ============================================================================

class TestGenerateSessionDates:
    """Test suite for generate_session_dates function."""

    def test_regular_enrollment_no_holidays(self, db_session):
        """Regular enrollment with 5 lessons and no holidays should generate exactly 5 sessions."""
        first_lesson = date(2026, 3, 2)  # A Monday with no holidays nearby

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            lessons_paid=5,
            enrollment_type="Regular",
            db=db_session
        )

        assert len(sessions) == 5
        assert len(skipped) == 0
        assert all(not s.is_holiday for s in sessions)
        assert sessions[0].session_date == first_lesson
        assert sessions[4].session_date == first_lesson + timedelta(weeks=4)
        assert end_date == first_lesson + timedelta(weeks=4)

    def test_trial_enrollment_single_session(self, db_session):
        """Trial enrollment should generate exactly 1 session regardless of lessons_paid."""
        first_lesson = date(2026, 3, 2)

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            lessons_paid=10,  # Should be ignored for Trial
            enrollment_type="Trial",
            db=db_session
        )

        assert len(sessions) == 1
        assert sessions[0].session_date == first_lesson
        assert end_date == first_lesson

    def test_one_time_enrollment_single_session(self, db_session):
        """One-Time enrollment should generate exactly 1 session."""
        first_lesson = date(2026, 3, 2)

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            lessons_paid=20,  # Should be ignored for One-Time
            enrollment_type="One-Time",
            db=db_session
        )

        assert len(sessions) == 1
        assert sessions[0].session_date == first_lesson

    def test_holiday_on_first_lesson_date(self, db_session, sample_holidays):
        """If first_lesson_date falls on holiday, it should be marked as holiday and not counted."""
        # Add Chinese New Year (Jan 29, 2026) from sample_holidays
        for h in sample_holidays:
            db_session.add(Holiday(holiday_date=h["holiday_date"], holiday_name=h["holiday_name"]))
        db_session.commit()

        # Start on Chinese New Year
        first_lesson = date(2026, 1, 29)  # This is a holiday

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Thursday",
            lessons_paid=3,
            enrollment_type="Regular",
            db=db_session
        )

        # Should have 4 sessions: 1 holiday + 3 regular
        assert len(sessions) == 4
        assert sessions[0].is_holiday is True
        assert sessions[0].holiday_name == "Chinese New Year"
        assert len(skipped) == 1
        assert skipped[0]["date"] == first_lesson.isoformat()

        # The 3 actual lessons should be on subsequent weeks
        regular_sessions = [s for s in sessions if not s.is_holiday]
        assert len(regular_sessions) == 3

    def test_multiple_consecutive_holidays(self, db_session, sample_holidays):
        """Multiple consecutive holidays should all be skipped and enrollment extended."""
        # Chinese New Year spans Jan 29-31, 2026 in sample_holidays
        for h in sample_holidays:
            db_session.add(Holiday(holiday_date=h["holiday_date"], holiday_name=h["holiday_name"]))
        db_session.commit()

        # Start just before the Chinese New Year cluster
        first_lesson = date(2026, 1, 22)  # Week before CNY

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Thursday",
            lessons_paid=4,
            enrollment_type="Regular",
            db=db_session
        )

        # First session: Jan 22 (not holiday)
        # Second week: Jan 29 (CNY - holiday, skipped)
        # Third week: Feb 5 (not holiday)
        # etc.
        assert sessions[0].session_date == date(2026, 1, 22)
        assert sessions[0].is_holiday is False

        # Find the CNY session
        cny_sessions = [s for s in sessions if s.session_date == date(2026, 1, 29)]
        assert len(cny_sessions) == 1
        assert cny_sessions[0].is_holiday is True

        # Should have 4 non-holiday sessions
        regular_sessions = [s for s in sessions if not s.is_holiday]
        assert len(regular_sessions) == 4

    def test_year_boundary_crossing(self, db_session):
        """Sessions should correctly span year boundaries (2025 → 2026)."""
        first_lesson = date(2025, 12, 20)  # December 2025

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Saturday",
            lessons_paid=5,
            enrollment_type="Regular",
            db=db_session
        )

        assert len(sessions) == 5
        assert sessions[0].session_date == date(2025, 12, 20)
        assert sessions[1].session_date == date(2025, 12, 27)
        assert sessions[2].session_date == date(2026, 1, 3)  # Crosses into 2026
        assert sessions[3].session_date == date(2026, 1, 10)
        assert sessions[4].session_date == date(2026, 1, 17)

    def test_sessions_return_correct_structure(self, db_session):
        """Verify SessionPreview fields are correctly populated."""
        first_lesson = date(2026, 3, 2)

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            lessons_paid=2,
            enrollment_type="Regular",
            db=db_session
        )

        assert len(sessions) == 2
        for session in sessions:
            assert isinstance(session, SessionPreview)
            assert session.session_date is not None
            assert session.time_slot == ""  # Empty until filled by caller
            assert session.location == ""   # Empty until filled by caller
            assert session.is_holiday is False
            assert session.holiday_name is None

    def test_single_lesson_paid(self, db_session):
        """Regular enrollment with 1 lesson should generate exactly 1 session."""
        first_lesson = date(2026, 3, 2)

        sessions, skipped, end_date = generate_session_dates(
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            lessons_paid=1,
            enrollment_type="Regular",
            db=db_session
        )

        assert len(sessions) == 1
        assert end_date == first_lesson


# ============================================================================
# Test calculate_effective_end_date()
# ============================================================================

class TestCalculateEffectiveEndDate:
    """Test suite for calculate_effective_end_date function."""

    def _create_enrollment(self, db_session, first_lesson, lessons_paid, extension_weeks=0):
        """Helper to create an enrollment for testing."""
        # Create required tutor and student
        tutor = Tutor(user_email="test@example.com", tutor_name="Test Tutor", role="Tutor")
        db_session.add(tutor)
        db_session.flush()

        student = Student(
            school_student_id="TEST001",
            student_name="Test Student",
            grade="F4",
            phone="12345678",
        )
        db_session.add(student)
        db_session.flush()

        enrollment = Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            assigned_time="15:00-16:00",
            location="Main Center",
            lessons_paid=lessons_paid,
            deadline_extension_weeks=extension_weeks,
            enrollment_type="Regular",
        )
        db_session.add(enrollment)
        db_session.commit()
        return enrollment

    def test_basic_end_date_no_holidays(self, db_session):
        """End date should be lessons_paid weeks from first lesson when no holidays."""
        first_lesson = date(2026, 3, 2)
        enrollment = self._create_enrollment(db_session, first_lesson, lessons_paid=5)

        end_date = calculate_effective_end_date(enrollment, db_session)

        # 5 lessons = first lesson + 4 more weeks
        expected = first_lesson + timedelta(weeks=4)
        assert end_date == expected

    def test_with_extension_weeks(self, db_session):
        """End date should include extension weeks buffer."""
        first_lesson = date(2026, 3, 2)
        enrollment = self._create_enrollment(
            db_session, first_lesson, lessons_paid=5, extension_weeks=2
        )

        end_date = calculate_effective_end_date(enrollment, db_session)

        # 5 lessons + 2 extension = 7 total lesson dates counted
        expected = first_lesson + timedelta(weeks=6)
        assert end_date == expected

    def test_with_holiday_gaps(self, db_session, sample_holidays):
        """Holidays should be skipped when counting lesson dates."""
        # Add holidays
        for h in sample_holidays:
            db_session.add(Holiday(holiday_date=h["holiday_date"], holiday_name=h["holiday_name"]))
        db_session.commit()

        # Start on Jan 22, 2026 (Thursday)
        # Jan 29 is Chinese New Year (holiday)
        first_lesson = date(2026, 1, 22)
        enrollment = self._create_enrollment(db_session, first_lesson, lessons_paid=4)

        end_date = calculate_effective_end_date(enrollment, db_session)

        # Week 1: Jan 22 (counted)
        # Week 2: Jan 29 (CNY - skipped)
        # Week 3: Feb 5 (counted)
        # Week 4: Feb 12 (counted)
        # Week 5: Feb 19 (counted)
        # Total: 4 lessons counted, spanning 5 calendar weeks
        expected = date(2026, 2, 19)
        assert end_date == expected

    def test_no_first_lesson_date(self, db_session):
        """Should return None if enrollment has no first_lesson_date."""
        tutor = Tutor(user_email="test@example.com", tutor_name="Test Tutor", role="Tutor")
        db_session.add(tutor)
        db_session.flush()

        student = Student(
            school_student_id="TEST001",
            student_name="Test Student",
            grade="F4",
            phone="12345678",
        )
        db_session.add(student)
        db_session.flush()

        enrollment = Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            first_lesson_date=None,  # No date set
            assigned_day="Monday",
            assigned_time="15:00-16:00",
            location="Main Center",
            lessons_paid=5,
            enrollment_type="Regular",
        )
        db_session.add(enrollment)
        db_session.commit()

        end_date = calculate_effective_end_date(enrollment, db_session)

        assert end_date is None

    def test_zero_lessons_paid(self, db_session):
        """Should return first_lesson_date if lessons_paid is 0."""
        first_lesson = date(2026, 3, 2)
        enrollment = self._create_enrollment(db_session, first_lesson, lessons_paid=0)

        end_date = calculate_effective_end_date(enrollment, db_session)

        assert end_date == first_lesson


# ============================================================================
# Test calculate_effective_end_date_bulk()
# ============================================================================

class TestCalculateEffectiveEndDateBulk:
    """Test suite for calculate_effective_end_date_bulk function (pre-loaded holidays)."""

    def _create_enrollment(self, db_session, first_lesson, lessons_paid, extension_weeks=0):
        """Helper to create an enrollment for testing."""
        tutor = Tutor(user_email="test@example.com", tutor_name="Test Tutor", role="Tutor")
        db_session.add(tutor)
        db_session.flush()

        student = Student(
            school_student_id="TEST001",
            student_name="Test Student",
            grade="F4",
            phone="12345678",
        )
        db_session.add(student)
        db_session.flush()

        enrollment = Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            first_lesson_date=first_lesson,
            assigned_day="Monday",
            assigned_time="15:00-16:00",
            location="Main Center",
            lessons_paid=lessons_paid,
            deadline_extension_weeks=extension_weeks,
            enrollment_type="Regular",
        )
        db_session.add(enrollment)
        db_session.commit()
        return enrollment

    def test_bulk_matches_regular(self, db_session, sample_holidays):
        """Bulk calculation should match regular calculation."""
        # Add holidays
        for h in sample_holidays:
            db_session.add(Holiday(holiday_date=h["holiday_date"], holiday_name=h["holiday_name"]))
        db_session.commit()

        first_lesson = date(2026, 1, 22)
        enrollment = self._create_enrollment(db_session, first_lesson, lessons_paid=4)

        # Calculate with regular function
        regular_end = calculate_effective_end_date(enrollment, db_session)

        # Calculate with bulk function (pre-loaded holidays)
        holidays = get_holidays_in_range(
            db_session,
            first_lesson,
            first_lesson + timedelta(weeks=52)
        )
        bulk_end = calculate_effective_end_date_bulk(enrollment, holidays)

        assert bulk_end == regular_end


# ============================================================================
# Test get_holidays_in_range()
# ============================================================================

class TestGetHolidaysInRange:
    """Test suite for get_holidays_in_range helper function."""

    def test_returns_holidays_in_range(self, db_session, sample_holidays):
        """Should return dict of holiday_date -> holiday_name within range."""
        for h in sample_holidays:
            db_session.add(Holiday(holiday_date=h["holiday_date"], holiday_name=h["holiday_name"]))
        db_session.commit()

        holidays = get_holidays_in_range(
            db_session,
            date(2026, 1, 1),
            date(2026, 2, 1)
        )

        # Should include New Year's Day and Chinese New Year (Jan 29-31)
        assert date(2026, 1, 1) in holidays
        assert holidays[date(2026, 1, 1)] == "New Year's Day"
        assert date(2026, 1, 29) in holidays
        assert date(2026, 12, 25) not in holidays  # Outside range

    def test_empty_when_no_holidays(self, db_session):
        """Should return empty dict when no holidays in range."""
        holidays = get_holidays_in_range(
            db_session,
            date(2026, 6, 1),
            date(2026, 6, 30)
        )

        assert holidays == {}


# ============================================================================
# Test format_fee_message()
# ============================================================================

class TestFormatFeeMessage:
    """Test suite for format_fee_message function."""

    def _base_args(self, **overrides):
        """Base arguments for format_fee_message."""
        defaults = {
            "lang": "en",
            "school_student_id": "1001",
            "student_name": "Test Student",
            "assigned_day": "Monday",
            "assigned_time": "15:00-16:30",
            "location": "MSA",
            "lessons_paid": 10,
            "session_dates": [date(2026, 3, 2) + timedelta(weeks=i) for i in range(10)],
            "discount_value": 0,
            "is_new_student": False,
        }
        defaults.update(overrides)
        return defaults

    def test_base_fee_calculation(self):
        """Fee should be 400 * lessons_paid with no extras."""
        msg = format_fee_message(**self._base_args(lessons_paid=10))
        assert "$4,000" in msg

    def test_single_lesson_fee(self):
        """Single lesson should be $400."""
        msg = format_fee_message(**self._base_args(
            lessons_paid=1,
            session_dates=[date(2026, 3, 2)],
        ))
        assert "$400" in msg

    def test_discount_applied(self):
        """Discount should reduce fee: 400*10 - 500 = 3500."""
        msg = format_fee_message(**self._base_args(discount_value=500))
        assert "$3,500" in msg
        assert "Discounted $500" in msg

    def test_new_student_registration_fee(self):
        """New student should have $100 registration fee added."""
        msg = format_fee_message(**self._base_args(is_new_student=True))
        # 400*10 + 100 = 4100
        assert "$4,100" in msg
        assert "$100 registration fee" in msg

    def test_discount_and_registration_combined(self):
        """Both discount and registration fee should be reflected."""
        msg = format_fee_message(**self._base_args(
            discount_value=200,
            is_new_student=True,
        ))
        # 400*10 - 200 + 100 = 3900
        assert "$3,900" in msg

    def test_chinese_language(self):
        """Chinese message should use Chinese day names and location."""
        msg = format_fee_message(**self._base_args(lang="zh"))
        assert "逢星期一" in msg
        assert "華士古分校" in msg
        assert "學生編號" in msg

    def test_english_language(self):
        """English message should use English day names and location."""
        msg = format_fee_message(**self._base_args(lang="en"))
        assert "Every Monday" in msg
        assert "Vasco Center" in msg
        assert "Student ID" in msg

    def test_msb_location_bank_account(self):
        """MSB location should use correct bank account number."""
        msg = format_fee_message(**self._base_args(location="MSB"))
        assert "185000010473304" in msg

    def test_msa_location_bank_account(self):
        """MSA location should use correct bank account number."""
        msg = format_fee_message(**self._base_args(location="MSA"))
        assert "185000380468369" in msg

    def test_lesson_count_in_message(self):
        """Message should show correct lesson count."""
        msg = format_fee_message(**self._base_args(lessons_paid=8, session_dates=[
            date(2026, 3, 2) + timedelta(weeks=i) for i in range(8)
        ]))
        assert "8 lessons total" in msg

    def test_session_dates_formatted(self):
        """Session dates should appear in YYYY/MM/DD format."""
        msg = format_fee_message(**self._base_args(
            session_dates=[date(2026, 3, 2)],
            lessons_paid=1,
        ))
        assert "2026/03/02" in msg


# ============================================================================
# Test check_student_conflicts()
# ============================================================================

class TestCheckStudentConflicts:
    """Test suite for check_student_conflicts function."""

    def _setup(self, db_session):
        """Create base tutor, student, enrollment, and a scheduled session."""
        tutor = Tutor(user_email="t@test.com", tutor_name="Tutor A", role="Tutor")
        db_session.add(tutor)
        db_session.flush()

        student = Student(student_name="Student A", home_location="MSA", school_student_id="1001")
        db_session.add(student)
        db_session.flush()

        enrollment = Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            first_lesson_date=date(2026, 3, 2),
            assigned_day="Monday",
            assigned_time="15:00-16:30",
            location="MSA",
            lessons_paid=4,
            enrollment_type="Regular",
        )
        db_session.add(enrollment)
        db_session.flush()

        session = SessionLog(
            enrollment_id=enrollment.id,
            student_id=student.id,
            tutor_id=tutor.id,
            session_date=date(2026, 3, 2),
            time_slot="15:00-16:30",
            location="MSA",
            session_status="Scheduled",
        )
        db_session.add(session)
        db_session.commit()

        return student, tutor, enrollment, session

    def test_no_conflicts(self, db_session):
        """No conflict when dates/times don't overlap."""
        student, tutor, enrollment, _ = self._setup(db_session)

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 4, 6)],  # Different date
            "15:00-16:30",
        )
        assert len(conflicts) == 0

    def test_different_time_no_conflict(self, db_session):
        """No conflict when same date but different time slot."""
        student, tutor, enrollment, _ = self._setup(db_session)

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 3, 2)],  # Same date
            "17:00-18:30",  # Different time
        )
        assert len(conflicts) == 0

    def test_conflict_detected(self, db_session):
        """Conflict when same student, same date, same time."""
        student, tutor, enrollment, _ = self._setup(db_session)

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 3, 2)],
            "15:00-16:30",
        )
        assert len(conflicts) == 1
        assert conflicts[0].session_date == date(2026, 3, 2)
        assert conflicts[0].existing_tutor_name == "Tutor A"

    def test_excluded_enrollment_not_conflicting(self, db_session):
        """Excluding own enrollment should not flag as conflict."""
        student, tutor, enrollment, _ = self._setup(db_session)

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 3, 2)],
            "15:00-16:30",
            exclude_enrollment_id=enrollment.id,
        )
        assert len(conflicts) == 0

    def test_cancelled_session_not_conflicting(self, db_session):
        """Cancelled sessions should not count as conflicts."""
        student, tutor, enrollment, session = self._setup(db_session)
        session.session_status = "Cancelled"
        db_session.commit()

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 3, 2)],
            "15:00-16:30",
        )
        assert len(conflicts) == 0

    def test_pending_makeup_not_conflicting(self, db_session):
        """Pending makeup sessions should not count as conflicts."""
        student, tutor, enrollment, session = self._setup(db_session)
        session.session_status = "Rescheduled - Pending Make-up"
        db_session.commit()

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 3, 2)],
            "15:00-16:30",
        )
        assert len(conflicts) == 0

    def test_attended_session_is_conflict(self, db_session):
        """Attended sessions should be flagged as conflicts."""
        student, tutor, enrollment, session = self._setup(db_session)
        session.session_status = "Attended"
        db_session.commit()

        conflicts = check_student_conflicts(
            db_session,
            student.id,
            [date(2026, 3, 2)],
            "15:00-16:30",
        )
        assert len(conflicts) == 1
