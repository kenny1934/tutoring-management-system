"""
Tests for summer course arrangement endpoints.
Tests: session creation (modes), lesson generation, delete cascade,
       student lessons progress, find slot, and placement modes.
"""
import pytest
from datetime import date, datetime
from models import (
    Tutor, SummerCourseConfig, SummerCourseSlot, SummerLesson,
    SummerSession, SummerApplication,
)


@pytest.fixture
def admin_tutor(db_session):
    """Create an admin tutor for auth."""
    tutor = Tutor(
        user_email="admin@test.com",
        tutor_name="Admin",
        role="Admin",
        is_active_tutor=True,
    )
    db_session.add(tutor)
    db_session.commit()
    return tutor


@pytest.fixture
def summer_config(db_session):
    """Create a summer course config."""
    config = SummerCourseConfig(
        year=2025,
        title="Summer 2025",
        application_open_date=datetime(2025, 3, 1),
        application_close_date=datetime(2025, 6, 30),
        course_start_date=date(2025, 7, 5),
        course_end_date=date(2025, 8, 29),
        total_lessons=8,
        pricing_config={"base": 400},
        locations=[{"name": "MSA", "open_days": ["Tuesday", "Friday"]}],
        available_grades=[{"value": "F1"}, {"value": "F2"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(config)
    db_session.commit()
    return config


@pytest.fixture
def slot_type_a(db_session, summer_config):
    """Create a Type A slot."""
    slot = SummerCourseSlot(
        config_id=summer_config.id,
        slot_day="Tuesday",
        time_slot="10:00 - 11:30",
        location="MSA",
        grade="F1",
        course_type="A",
        max_students=6,
    )
    db_session.add(slot)
    db_session.commit()
    return slot


@pytest.fixture
def slot_type_b(db_session, summer_config):
    """Create a Type B slot."""
    slot = SummerCourseSlot(
        config_id=summer_config.id,
        slot_day="Friday",
        time_slot="10:00 - 11:30",
        location="MSA",
        grade="F1",
        course_type="B",
        max_students=6,
    )
    db_session.add(slot)
    db_session.commit()
    return slot


@pytest.fixture
def application(db_session, summer_config):
    """Create a test application."""
    app = SummerApplication(
        config_id=summer_config.id,
        reference_code="SC2025-TEST1",
        student_name="Test Student",
        grade="F1",
        contact_phone="12345678",
        preferred_location="MSA",
        application_status="Submitted",
        sessions_per_week=1,
    )
    db_session.add(app)
    db_session.commit()
    return app


@pytest.fixture
def application_2x(db_session, summer_config):
    """Create a 2x/week test application."""
    app = SummerApplication(
        config_id=summer_config.id,
        reference_code="SC2025-TEST2",
        student_name="Twice Weekly",
        grade="F1",
        contact_phone="87654321",
        preferred_location="MSA",
        application_status="Submitted",
        sessions_per_week=2,
    )
    db_session.add(app)
    db_session.commit()
    return app


class TestLessonGeneration:
    """Test _ensure_lessons_for_slot and generate_lessons endpoint."""

    def test_lesson_numbers_type_a(self, db_session, summer_config, slot_type_a):
        """Type A slots should generate lessons 1,2,3,...,8."""
        from routers.summer_course import _ensure_lessons_for_slot
        count = _ensure_lessons_for_slot(slot_type_a, db_session)
        db_session.commit()

        assert count > 0
        lessons = (
            db_session.query(SummerLesson)
            .filter(SummerLesson.slot_id == slot_type_a.id)
            .order_by(SummerLesson.lesson_date)
            .all()
        )
        lesson_nums = [l.lesson_number for l in lessons]
        assert lesson_nums == [1, 2, 3, 4, 5, 6, 7, 8]

    def test_lesson_numbers_type_b(self, db_session, summer_config, slot_type_b):
        """Type B slots should generate lessons 5,6,7,8,1,2,3,4."""
        from routers.summer_course import _ensure_lessons_for_slot
        count = _ensure_lessons_for_slot(slot_type_b, db_session)
        db_session.commit()

        lessons = (
            db_session.query(SummerLesson)
            .filter(SummerLesson.slot_id == slot_type_b.id)
            .order_by(SummerLesson.lesson_date)
            .all()
        )
        lesson_nums = [l.lesson_number for l in lessons]
        assert lesson_nums == [5, 6, 7, 8, 1, 2, 3, 4]

    def test_idempotent_generation(self, db_session, summer_config, slot_type_a):
        """Calling _ensure_lessons_for_slot twice should not create duplicates."""
        from routers.summer_course import _ensure_lessons_for_slot
        count1 = _ensure_lessons_for_slot(slot_type_a, db_session)
        db_session.commit()
        count2 = _ensure_lessons_for_slot(slot_type_a, db_session)
        db_session.commit()

        assert count1 > 0
        assert count2 == 0
        total = db_session.query(SummerLesson).filter(SummerLesson.slot_id == slot_type_a.id).count()
        assert total == count1

    def test_lesson_dates_are_correct_weekday(self, db_session, summer_config, slot_type_a):
        """All generated lesson dates should fall on the slot's day (Tuesday)."""
        from routers.summer_course import _ensure_lessons_for_slot
        _ensure_lessons_for_slot(slot_type_a, db_session)
        db_session.commit()

        lessons = db_session.query(SummerLesson).filter(SummerLesson.slot_id == slot_type_a.id).all()
        for lesson in lessons:
            assert lesson.lesson_date.strftime("%A") == "Tuesday"


class TestSessionCreation:
    """Test create_session with different modes."""

    def _generate_lessons(self, db_session, slot):
        from routers.summer_course import _ensure_lessons_for_slot
        _ensure_lessons_for_slot(slot, db_session)
        db_session.commit()

    def test_mode_all_creates_8_sessions(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """Mode 'all' should create one session per lesson."""
        self._generate_lessons(db_session, slot_type_a)
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate

        data = SummerSessionCreate(
            application_id=application.id,
            slot_id=slot_type_a.id,
            mode="all",
        )
        # Mock admin
        admin = db_session.query(Tutor).first()
        result = create_session(data=data, admin=admin, db=db_session)

        sessions = (
            db_session.query(SummerSession)
            .filter(SummerSession.application_id == application.id)
            .all()
        )
        assert len(sessions) == 8
        assert all(s.lesson_id is not None for s in sessions)

    def test_mode_first_half_creates_4_sessions(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """Mode 'first_half' should create sessions for first 4 lessons only."""
        self._generate_lessons(db_session, slot_type_a)
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate

        data = SummerSessionCreate(
            application_id=application.id,
            slot_id=slot_type_a.id,
            mode="first_half",
        )
        admin = db_session.query(Tutor).first()
        result = create_session(data=data, admin=admin, db=db_session)

        sessions = (
            db_session.query(SummerSession)
            .filter(SummerSession.application_id == application.id)
            .all()
        )
        assert len(sessions) == 4

    def test_mode_single_creates_no_sessions(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """Mode 'single' should generate lessons but create no sessions."""
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate

        data = SummerSessionCreate(
            application_id=application.id,
            slot_id=slot_type_a.id,
            mode="single",
        )
        admin = db_session.query(Tutor).first()
        result = create_session(data=data, admin=admin, db=db_session)

        # No sessions created
        sessions = (
            db_session.query(SummerSession)
            .filter(SummerSession.application_id == application.id)
            .all()
        )
        assert len(sessions) == 0

        # But lessons should exist
        lessons = db_session.query(SummerLesson).filter(SummerLesson.slot_id == slot_type_a.id).count()
        assert lessons == 8

    def test_duplicate_placement_blocked(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """Placing the same student in the same slot twice should fail."""
        self._generate_lessons(db_session, slot_type_a)
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate
        from fastapi import HTTPException

        data = SummerSessionCreate(
            application_id=application.id,
            slot_id=slot_type_a.id,
            mode="all",
        )
        admin = db_session.query(Tutor).first()
        create_session(data=data, admin=admin, db=db_session)

        with pytest.raises(HTTPException) as exc_info:
            create_session(data=data, admin=admin, db=db_session)
        assert exc_info.value.status_code == 400
        assert "already placed" in exc_info.value.detail.lower()

    def test_calendar_drop_single_lesson(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """Calendar drop (with lesson_id) should create exactly 1 session."""
        self._generate_lessons(db_session, slot_type_a)
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate

        lesson = (
            db_session.query(SummerLesson)
            .filter(SummerLesson.slot_id == slot_type_a.id)
            .first()
        )

        data = SummerSessionCreate(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lesson.id,
        )
        admin = db_session.query(Tutor).first()
        create_session(data=data, admin=admin, db=db_session)

        sessions = (
            db_session.query(SummerSession)
            .filter(SummerSession.application_id == application.id)
            .all()
        )
        assert len(sessions) == 1
        assert sessions[0].lesson_id == lesson.id


class TestDeleteCascade:
    """Test delete_session cascade behavior."""

    def _place_student(self, db_session, slot, application):
        from routers.summer_course import _ensure_lessons_for_slot, create_session
        from schemas import SummerSessionCreate
        _ensure_lessons_for_slot(slot, db_session)
        db_session.commit()
        admin = db_session.query(Tutor).first()
        data = SummerSessionCreate(application_id=application.id, slot_id=slot.id, mode="all")
        create_session(data=data, admin=admin, db=db_session)

    def test_cascade_delete_removes_all(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """cascade=True should remove all sessions for student+slot."""
        self._place_student(db_session, slot_type_a, application)
        session = db_session.query(SummerSession).filter(SummerSession.application_id == application.id).first()

        from routers.summer_course import delete_session
        delete_session(session_id=session.id, cascade=True, admin=admin_tutor, db=db_session)

        remaining = db_session.query(SummerSession).filter(SummerSession.application_id == application.id).count()
        assert remaining == 0

    def test_non_cascade_delete_removes_one(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """cascade=False should remove only the specific session."""
        self._place_student(db_session, slot_type_a, application)
        sessions = db_session.query(SummerSession).filter(SummerSession.application_id == application.id).all()
        assert len(sessions) == 8

        from routers.summer_course import delete_session
        delete_session(session_id=sessions[0].id, cascade=False, admin=admin_tutor, db=db_session)

        remaining = db_session.query(SummerSession).filter(SummerSession.application_id == application.id).count()
        assert remaining == 7


class TestCourseTypeReset:
    """Test that changing course type resets lesson numbers."""

    def test_type_change_resets_lessons(self, db_session, summer_config, slot_type_a, admin_tutor):
        """Changing slot from Type A to Type B should reset lesson numbers."""
        from routers.summer_course import _ensure_lessons_for_slot
        _ensure_lessons_for_slot(slot_type_a, db_session)
        db_session.commit()

        # Verify Type A: 1,2,3,4,5,6,7,8
        lessons = db_session.query(SummerLesson).filter(
            SummerLesson.slot_id == slot_type_a.id
        ).order_by(SummerLesson.lesson_date).all()
        assert [l.lesson_number for l in lessons] == [1, 2, 3, 4, 5, 6, 7, 8]

        # Change to Type B
        from routers.summer_course import compute_lesson_number
        for i, lesson in enumerate(lessons):
            lesson.lesson_number = compute_lesson_number("B", i + 1)
        db_session.commit()

        # Verify Type B: 5,6,7,8,1,2,3,4
        lessons = db_session.query(SummerLesson).filter(
            SummerLesson.slot_id == slot_type_a.id
        ).order_by(SummerLesson.lesson_date).all()
        assert [l.lesson_number for l in lessons] == [5, 6, 7, 8, 1, 2, 3, 4]


class TestStudentLessons:
    """Test get_student_lessons endpoint."""

    def test_returns_all_students(self, db_session, summer_config, application, admin_tutor):
        """Should return all non-withdrawn students."""
        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        assert len(result.students) == 1
        assert result.students[0].student_name == "Test Student"
        assert result.students[0].total_lessons == 8
        assert result.students[0].placed_count == 0
        assert len(result.students[0].lessons) == 8
        assert all(not l.placed for l in result.students[0].lessons)

    def test_placed_count_reflects_sessions(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """placed_count should reflect actual session count."""
        from routers.summer_course import _ensure_lessons_for_slot, create_session, get_student_lessons
        from schemas import SummerSessionCreate

        _ensure_lessons_for_slot(slot_type_a, db_session)
        db_session.commit()

        admin = db_session.query(Tutor).first()
        data = SummerSessionCreate(application_id=application.id, slot_id=slot_type_a.id, mode="first_half")
        create_session(data=data, admin=admin, db=db_session)

        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        student = result.students[0]
        assert student.placed_count == 4
        placed_lessons = [l for l in student.lessons if l.placed]
        assert len(placed_lessons) == 4
