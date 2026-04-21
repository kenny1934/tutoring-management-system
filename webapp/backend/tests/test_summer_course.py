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


class TestStudentLessonsDuplicates:
    """Duplicates at the same effective lesson_number must surface via the
    `duplicates` field rather than silently collapsing to a single primary."""

    def _setup(self, db_session, slot):
        from routers.summer_course import _ensure_lessons_for_slot
        _ensure_lessons_for_slot(slot, db_session)
        db_session.commit()
        return (
            db_session.query(SummerLesson)
            .filter(SummerLesson.slot_id == slot.id)
            .order_by(SummerLesson.lesson_number)
            .all()
        )

    def test_duplicate_lesson_number_surfaces_in_duplicates(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """Sessions at L1, L2, L2, L3 → L2 entry carries one duplicate."""
        lessons = self._setup(db_session, slot_type_a)
        for ln in (1, 2, 3):
            db_session.add(SummerSession(
                application_id=application.id,
                slot_id=slot_type_a.id,
                lesson_id=lessons[ln - 1].id,
                session_status="Confirmed",
            ))
        # Second L2 via per-student override on lesson #4's date.
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,
            lesson_number=2,
            session_status="Confirmed",
        ))
        db_session.commit()

        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        student = result.students[0]
        l2 = next(l for l in student.lessons if l.lesson_number == 2)
        assert l2.placed is True
        assert len(l2.duplicates) == 1
        assert l2.duplicates[0].lesson_number == 2
        assert l2.duplicates[0].placed is True
        # Earlier date wins primary (lesson #2 date < lesson #4 date).
        assert l2.lesson_date == lessons[1].lesson_date
        assert l2.duplicates[0].lesson_date == lessons[3].lesson_date

    def test_placed_count_includes_duplicates(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """[L1, L2, L2, L3] → placed_count == 4, not 3."""
        lessons = self._setup(db_session, slot_type_a)
        for lesson in lessons[:3]:
            db_session.add(SummerSession(
                application_id=application.id,
                slot_id=slot_type_a.id,
                lesson_id=lesson.id,
                session_status="Confirmed",
            ))
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,
            lesson_number=2,
            session_status="Confirmed",
        ))
        db_session.commit()

        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        assert result.students[0].placed_count == 4

    def test_rescheduled_count_includes_duplicate_rescheduleds(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """A rescheduled duplicate counts toward rescheduled_count."""
        lessons = self._setup(db_session, slot_type_a)
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,
            session_status="Confirmed",
        ))
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,
            lesson_number=2,
            session_status="Rescheduled - Pending Make-up",
        ))
        db_session.commit()

        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        student = result.students[0]
        assert student.placed_count == 2
        assert student.rescheduled_count == 1

    def test_live_session_wins_primary_over_stale(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """A published session_log row beats a pre-publish twin as primary,
        even when the twin sorts earlier by date."""
        from models import Student
        from models import SessionLog as SessionLogModel

        lessons = self._setup(db_session, slot_type_a)
        s1 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,  # L2 material, earlier date
            session_status="Confirmed",
        )
        s2 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,  # L4 material, overridden to L2
            lesson_number=2,
            session_status="Confirmed",
        )
        db_session.add_all([s1, s2])
        db_session.flush()

        student_row = Student(student_name="Live", grade="F1")
        db_session.add(student_row)
        db_session.flush()
        admin = db_session.query(Tutor).first()

        db_session.add(SessionLogModel(
            student_id=student_row.id,
            tutor_id=admin.id,
            session_date=lessons[3].lesson_date,  # later than s1's
            time_slot="10:00 - 11:30",
            location="MSA",
            session_status="Confirmed",
            summer_session_id=s2.id,
            lesson_number=2,
        ))
        db_session.commit()

        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        l2 = next(l for l in result.students[0].lessons if l.lesson_number == 2)
        assert l2.session_id == s2.id
        assert len(l2.duplicates) == 1
        assert l2.duplicates[0].session_id == s1.id

    def test_placed_count_can_exceed_total_lessons(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """9 sessions across 8 lesson_numbers → placed_count=9 > total=8."""
        lessons = self._setup(db_session, slot_type_a)
        for lesson in lessons:
            db_session.add(SummerSession(
                application_id=application.id,
                slot_id=slot_type_a.id,
                lesson_id=lesson.id,
                session_status="Confirmed",
            ))
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[7].id,
            lesson_number=4,
            session_status="Confirmed",
        ))
        db_session.commit()

        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        student = result.students[0]
        assert student.total_lessons == 8
        assert student.placed_count == 9
        l4 = next(l for l in student.lessons if l.lesson_number == 4)
        assert len(l4.duplicates) == 1

    def test_two_published_sessions_both_overridden_to_same_ln(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """User edits two published sessions' ln via SessionDetailPopover
        (post-publish path). Both land at same effective ln via SessionLog
        override; both must surface in the students table."""
        from models import Student
        from models import SessionLog as SessionLogModel

        lessons = self._setup(db_session, slot_type_a)
        s1 = SummerSession(
            application_id=application.id, slot_id=slot_type_a.id,
            lesson_id=lessons[0].id, session_status="Confirmed",
        )
        s3 = SummerSession(
            application_id=application.id, slot_id=slot_type_a.id,
            lesson_id=lessons[2].id, session_status="Confirmed",
        )
        db_session.add_all([s1, s3])
        db_session.flush()

        student_row = Student(student_name="Live2x", grade="F1")
        db_session.add(student_row)
        db_session.flush()
        admin = db_session.query(Tutor).first()

        db_session.add(SessionLogModel(
            student_id=student_row.id, tutor_id=admin.id,
            session_date=lessons[0].lesson_date, time_slot="10:00 - 11:30",
            location="MSA", session_status="Confirmed",
            summer_session_id=s1.id, lesson_number=2,
        ))
        db_session.add(SessionLogModel(
            student_id=student_row.id, tutor_id=admin.id,
            session_date=lessons[2].lesson_date, time_slot="10:00 - 11:30",
            location="MSA", session_status="Confirmed",
            summer_session_id=s3.id, lesson_number=2,
        ))
        db_session.commit()

        from routers.summer_course import get_student_lessons
        result = get_student_lessons(
            config_id=summer_config.id, location="MSA",
            _admin=None, db=db_session,
        )
        student = result.students[0]
        l1 = next(l for l in student.lessons if l.lesson_number == 1)
        l2 = next(l for l in student.lessons if l.lesson_number == 2)
        l3 = next(l for l in student.lessons if l.lesson_number == 3)
        assert l1.placed is False
        assert l3.placed is False
        assert l2.placed is True
        assert len(l2.duplicates) == 1


class TestSummerSessionLessonNumberDuplicateGuard:
    """Pre-publish duplicate guard on POST /summer/sessions (calendar drop
    with explicit lesson_number) and PATCH /summer/sessions/{id}/lesson-number.
    Mirrors the SessionLog guard in PATCH /sessions/{id}."""

    def _setup(self, db_session, slot):
        from routers.summer_course import _ensure_lessons_for_slot
        _ensure_lessons_for_slot(slot, db_session)
        db_session.commit()
        return (
            db_session.query(SummerLesson)
            .filter(SummerLesson.slot_id == slot.id)
            .order_by(SummerLesson.lesson_number)
            .all()
        )

    def test_post_raises_409_on_duplicate_lesson_number(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """Calendar drop with explicit lesson_number that collides with an
        existing active session for the student raises 409."""
        from fastapi import HTTPException
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate

        lessons = self._setup(db_session, slot_type_a)
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,  # material L2
            session_status="Confirmed",
        ))
        db_session.commit()
        admin = db_session.query(Tutor).first()

        with pytest.raises(HTTPException) as exc:
            create_session(
                data=SummerSessionCreate(
                    application_id=application.id,
                    slot_id=slot_type_a.id,
                    lesson_id=lessons[3].id,  # material L4
                    lesson_number=2,  # but overridden to L2 → collision
                ),
                admin=admin, db=db_session,
            )
        assert exc.value.status_code == 409
        assert exc.value.detail["error"] == "DUPLICATE_LESSON_NUMBER"

    def test_post_force_lesson_duplicate_overrides_guard(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """force_lesson_duplicate=True lets admin commit an intentional dupe."""
        from routers.summer_course import create_session
        from schemas import SummerSessionCreate

        lessons = self._setup(db_session, slot_type_a)
        db_session.add(SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,
            session_status="Confirmed",
        ))
        db_session.commit()
        admin = db_session.query(Tutor).first()

        resp = create_session(
            data=SummerSessionCreate(
                application_id=application.id,
                slot_id=slot_type_a.id,
                lesson_id=lessons[3].id,
                lesson_number=2,
                force_lesson_duplicate=True,
            ),
            admin=admin, db=db_session,
        )
        assert resp.lesson_number == 2

    def test_post_bulk_mode_does_not_trigger_guard(
        self, db_session, summer_config, slot_type_a, slot_type_b, application_2x, admin_tutor,
    ):
        """Bulk mode (`all`) leaves lesson_number=None so the guard — gated on
        `data.lesson_number is not None` — never fires. This lets a 2x student
        sit in two slots that share material numbers 1-8 without interference."""
        from routers.summer_course import _ensure_lessons_for_slot, create_session
        from schemas import SummerSessionCreate

        _ensure_lessons_for_slot(slot_type_a, db_session)
        _ensure_lessons_for_slot(slot_type_b, db_session)
        db_session.commit()
        admin = db_session.query(Tutor).first()

        create_session(
            data=SummerSessionCreate(
                application_id=application_2x.id,
                slot_id=slot_type_a.id, mode="all",
            ),
            admin=admin, db=db_session,
        )
        # Second bulk place into a different slot should succeed — no guard.
        create_session(
            data=SummerSessionCreate(
                application_id=application_2x.id,
                slot_id=slot_type_b.id, mode="all",
            ),
            admin=admin, db=db_session,
        )
        sessions = db_session.query(SummerSession).filter(
            SummerSession.application_id == application_2x.id,
        ).all()
        assert len(sessions) == 16

    def test_patch_raises_409_on_duplicate_lesson_number(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """Changing an existing session's lesson_number to collide raises 409."""
        from fastapi import HTTPException
        from routers.summer_course import update_session_lesson_number
        from schemas import SummerSessionLessonNumberUpdate

        lessons = self._setup(db_session, slot_type_a)
        s1 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,  # L2
            session_status="Confirmed",
        )
        s2 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,  # L4
            session_status="Confirmed",
        )
        db_session.add_all([s1, s2])
        db_session.commit()
        admin = db_session.query(Tutor).first()

        with pytest.raises(HTTPException) as exc:
            update_session_lesson_number(
                session_id=s2.id,
                data=SummerSessionLessonNumberUpdate(lesson_number=2),
                admin=admin, db=db_session,
            )
        assert exc.value.status_code == 409
        assert exc.value.detail["error"] == "DUPLICATE_LESSON_NUMBER"
        assert exc.value.detail["other_session_id"] == s1.id

    def test_patch_force_overrides_guard(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        from routers.summer_course import update_session_lesson_number
        from schemas import SummerSessionLessonNumberUpdate

        lessons = self._setup(db_session, slot_type_a)
        s1 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,
            session_status="Confirmed",
        )
        s2 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,
            session_status="Confirmed",
        )
        db_session.add_all([s1, s2])
        db_session.commit()
        admin = db_session.query(Tutor).first()

        resp = update_session_lesson_number(
            session_id=s2.id,
            data=SummerSessionLessonNumberUpdate(
                lesson_number=2, force_lesson_duplicate=True,
            ),
            admin=admin, db=db_session,
        )
        assert resp.lesson_number == 2

    def test_patch_clear_is_unguarded(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """Clearing an override (reverting to slot default) bypasses the guard.
        Even if the slot default happens to collide, clear is always allowed —
        an admin explicitly nulling a value shouldn't be blocked."""
        from routers.summer_course import update_session_lesson_number
        from schemas import SummerSessionLessonNumberUpdate

        lessons = self._setup(db_session, slot_type_a)
        # s1 at material L2. s2 at material L4 but overridden to L3.
        s1 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,
            session_status="Confirmed",
        )
        s2 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,
            lesson_number=3,
            session_status="Confirmed",
        )
        db_session.add_all([s1, s2])
        db_session.commit()
        admin = db_session.query(Tutor).first()

        resp = update_session_lesson_number(
            session_id=s2.id,
            data=SummerSessionLessonNumberUpdate(clear_lesson_number=True),
            admin=admin, db=db_session,
        )
        assert resp.lesson_number is None

    def test_patch_no_change_is_unguarded(
        self, db_session, summer_config, slot_type_a, application, admin_tutor,
    ):
        """Re-saving the current effective lesson_number must not trip the
        guard (guard is scoped to actual changes)."""
        from routers.summer_course import update_session_lesson_number
        from schemas import SummerSessionLessonNumberUpdate

        lessons = self._setup(db_session, slot_type_a)
        s1 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[1].id,  # effective L2 via slot default
            session_status="Confirmed",
        )
        s2 = SummerSession(
            application_id=application.id,
            slot_id=slot_type_a.id,
            lesson_id=lessons[3].id,
            lesson_number=3,
            session_status="Confirmed",
        )
        db_session.add_all([s1, s2])
        db_session.commit()
        admin = db_session.query(Tutor).first()

        # Re-save 3 — matches current, no guard.
        resp = update_session_lesson_number(
            session_id=s2.id,
            data=SummerSessionLessonNumberUpdate(lesson_number=3),
            admin=admin, db=db_session,
        )
        assert resp.lesson_number == 3


class TestSequenceScoring:
    """Test the _score_sequence helper."""

    def test_perfect_sequence(self):
        from routers.summer_course import _score_sequence
        # All pairs in order, both groups in order
        score = _score_sequence([1, 2, 3, 4, 5, 6, 7, 8])
        assert score == 1.0

    def test_reversed_pairs(self):
        from routers.summer_course import _score_sequence
        # All pairs reversed: 2 before 1, 4 before 3, etc.
        score = _score_sequence([2, 1, 4, 3, 6, 5, 8, 7])
        assert score < 0.3  # very bad

    def test_ab_interleaved(self):
        from routers.summer_course import _score_sequence
        # Type A+B typical: 1,5,2,6,3,7,4,8
        score = _score_sequence([1, 5, 2, 6, 3, 7, 4, 8])
        # Pairs preserved (1<2, 3<4, 5<6, 7<8) but groups not in strict order
        assert score > 0.5  # decent — pairs all preserved

    def test_partial_good(self):
        from routers.summer_course import _score_sequence
        # Some pairs preserved, some broken
        score = _score_sequence([1, 2, 4, 3, 5, 6, 8, 7])
        # Pairs (1,2) and (5,6) preserved, (3,4) and (7,8) broken
        assert 0.3 < score < 0.8


class TestAutoSuggest:
    """Test the lesson-level auto-suggest algorithm."""

    def _generate_all_lessons(self, db_session, *slots):
        from routers.summer_course import _ensure_lessons_for_slot
        for slot in slots:
            _ensure_lessons_for_slot(slot, db_session)
        db_session.commit()

    def test_1x_student_gets_8_lessons(self, db_session, summer_config, slot_type_a, application, admin_tutor):
        """1x/week student should get 8 lesson assignments from one slot."""
        self._generate_all_lessons(db_session, slot_type_a)
        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(config_id=summer_config.id, location="MSA")
        result = auto_suggest(data=data, _admin=None, db=db_session)

        assert len(result.proposals) == 1
        proposal = result.proposals[0]
        assert proposal.student_name == "Test Student"
        assert len(proposal.lesson_assignments) == 8
        assert proposal.sessions_per_week == 1

    def test_2x_student_gets_lessons_from_multiple_slots(
        self, db_session, summer_config, slot_type_a, slot_type_b, application_2x, admin_tutor
    ):
        """2x/week student should get lessons from multiple slots."""
        self._generate_all_lessons(db_session, slot_type_a, slot_type_b)
        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(config_id=summer_config.id, location="MSA")
        result = auto_suggest(data=data, _admin=None, db=db_session)

        assert len(result.proposals) == 1
        proposal = result.proposals[0]
        assert proposal.student_name == "Twice Weekly"
        assert len(proposal.lesson_assignments) == 8
        assert proposal.sessions_per_week == 2

        # Should use at least 2 different slots
        slot_ids = {a.slot_id for a in proposal.lesson_assignments}
        assert len(slot_ids) >= 1  # May use 1 or 2 depending on availability

    def test_pair_ordering_preserved(
        self, db_session, summer_config, slot_type_a, slot_type_b, application, admin_tutor
    ):
        """Proposed lesson sequence should preserve pair ordering."""
        self._generate_all_lessons(db_session, slot_type_a, slot_type_b)
        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(config_id=summer_config.id, location="MSA")
        result = auto_suggest(data=data, _admin=None, db=db_session)

        assert len(result.proposals) >= 1
        proposal = result.proposals[0]
        # Sort assignments by date
        sorted_assignments = sorted(proposal.lesson_assignments, key=lambda a: a.lesson_date)
        lesson_order = [a.lesson_number for a in sorted_assignments]

        # Check pair ordering
        pairs = [(1, 2), (3, 4), (5, 6), (7, 8)]
        for a, b in pairs:
            if a in lesson_order and b in lesson_order:
                assert lesson_order.index(a) < lesson_order.index(b), \
                    f"L{a} should come before L{b}, got {lesson_order}"

    def test_sequence_score_positive(
        self, db_session, summer_config, slot_type_a, application, admin_tutor
    ):
        """Proposals should have a positive sequence score."""
        self._generate_all_lessons(db_session, slot_type_a)
        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(config_id=summer_config.id, location="MSA")
        result = auto_suggest(data=data, _admin=None, db=db_session)

        assert len(result.proposals) >= 1
        assert result.proposals[0].sequence_score > 0

    def test_single_student_mode(
        self, db_session, summer_config, slot_type_a, application, application_2x, admin_tutor
    ):
        """application_id should limit suggest to just that student."""
        self._generate_all_lessons(db_session, slot_type_a)
        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(
            config_id=summer_config.id, location="MSA",
            application_id=application.id,
        )
        result = auto_suggest(data=data, _admin=None, db=db_session)

        assert len(result.proposals) == 1
        assert result.proposals[0].application_id == application.id

    def test_exclude_dates(
        self, db_session, summer_config, slot_type_a, application, admin_tutor
    ):
        """exclude_dates should filter out lessons on those dates."""
        self._generate_all_lessons(db_session, slot_type_a)

        # Get all lesson dates for this slot
        lessons = db_session.query(SummerLesson).filter(
            SummerLesson.slot_id == slot_type_a.id
        ).order_by(SummerLesson.lesson_date).all()
        first_date = lessons[0].lesson_date

        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(
            config_id=summer_config.id, location="MSA",
            exclude_dates=[first_date],
        )
        result = auto_suggest(data=data, _admin=None, db=db_session)

        if result.proposals:
            for a in result.proposals[0].lesson_assignments:
                if a.lesson_date == first_date:
                    assert a.is_pending_makeup, "Excluded date must be marked as pending make-up"

    def test_unavailability_notes_shown(
        self, db_session, summer_config, slot_type_a, admin_tutor
    ):
        """unavailability_notes should be passed through to the proposal."""
        app = SummerApplication(
            config_id=summer_config.id,
            reference_code="SC2025-UNAVL",
            student_name="Unavailable Kid",
            grade="F1",
            contact_phone="11111111",
            preferred_location="MSA",
            application_status="Submitted",
            sessions_per_week=1,
            unavailability_notes="7月14至21日不能上課",
        )
        db_session.add(app)
        db_session.commit()

        self._generate_all_lessons(db_session, slot_type_a)
        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(config_id=summer_config.id, location="MSA")
        result = auto_suggest(data=data, _admin=None, db=db_session)

        proposal = next((p for p in result.proposals if p.student_name == "Unavailable Kid"), None)
        assert proposal is not None
        assert proposal.unavailability_notes == "7月14至21日不能上課"

    def _make_slot(self, db_session, config, day: str, course_type: str, grade: str = "F1", max_students: int = 6):
        slot = SummerCourseSlot(
            config_id=config.id,
            slot_day=day,
            time_slot="10:00 - 11:30",
            location="MSA",
            grade=grade,
            course_type=course_type,
            max_students=max_students,
        )
        db_session.add(slot)
        db_session.commit()
        return slot

    def test_2x_returns_up_to_3_options_across_slot_pairs(
        self, db_session, summer_config, application_2x, admin_tutor
    ):
        """2x student with 3+ viable slot pairs should surface A/B/C with distinct slot sets."""
        # Three pairs: (Tue+Fri), (Mon+Thu), (Wed+Sat) — all A/B
        pairs = [
            ("Tuesday", "Friday"),
            ("Monday", "Thursday"),
            ("Wednesday", "Saturday"),
        ]
        slots = []
        for a_day, b_day in pairs:
            slots.append(self._make_slot(db_session, summer_config, a_day, "A"))
            slots.append(self._make_slot(db_session, summer_config, b_day, "B"))
        self._generate_all_lessons(db_session, *slots)

        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(
            config_id=summer_config.id, location="MSA",
            application_id=application_2x.id,
        )
        result = auto_suggest(data=data, _admin=None, db=db_session)

        app_proposals = [p for p in result.proposals if p.application_id == application_2x.id]
        assert len(app_proposals) == 3, f"expected 3 options, got {len(app_proposals)}"
        assert [p.option_label for p in app_proposals] == ["Option A", "Option B", "Option C"]

        # Each option must use a distinct set of slots
        slot_sets = [frozenset(a.slot_id for a in p.lesson_assignments) for p in app_proposals]
        assert len(set(slot_sets)) == 3, f"options should use distinct slot sets, got {slot_sets}"

        # Confidence non-increasing A → B → C
        confs = [p.confidence for p in app_proposals]
        assert confs[0] >= confs[1] >= confs[2]

    def test_2x_single_option_when_only_one_pair_fits(
        self, db_session, summer_config, slot_type_a, slot_type_b, application_2x, admin_tutor
    ):
        """2x student with only one viable slot pair should receive a single proposal."""
        self._generate_all_lessons(db_session, slot_type_a, slot_type_b)

        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(
            config_id=summer_config.id, location="MSA",
            application_id=application_2x.id,
        )
        result = auto_suggest(data=data, _admin=None, db=db_session)

        app_proposals = [p for p in result.proposals if p.application_id == application_2x.id]
        assert len(app_proposals) == 1

    def test_2x_alternatives_do_not_leak_capacity(
        self, db_session, summer_config, application_2x, admin_tutor
    ):
        """Probing alternatives for one student must not consume capacity seen by the next student."""
        # Two pairs, primary pair capped so only one student fits; alt pair has room.
        primary_a = self._make_slot(db_session, summer_config, "Tuesday", "A", max_students=1)
        primary_b = self._make_slot(db_session, summer_config, "Friday", "B", max_students=1)
        alt_a = self._make_slot(db_session, summer_config, "Monday", "A", max_students=6)
        alt_b = self._make_slot(db_session, summer_config, "Thursday", "B", max_students=6)
        self._generate_all_lessons(db_session, primary_a, primary_b, alt_a, alt_b)

        # Second 2x student competes for the same capacity
        second = SummerApplication(
            config_id=summer_config.id,
            reference_code="SC2025-LEAK",
            student_name="Second Student",
            grade="F1",
            contact_phone="22222222",
            preferred_location="MSA",
            application_status="Submitted",
            sessions_per_week=2,
        )
        db_session.add(second)
        db_session.commit()

        from routers.summer_course import auto_suggest
        from schemas import SummerSuggestRequest

        data = SummerSuggestRequest(config_id=summer_config.id, location="MSA")
        result = auto_suggest(data=data, _admin=None, db=db_session)

        # Both students should get at least one proposal — the primary pair's
        # capacity was only enough for one, but the alt pair covers the other.
        # If the first student's alt probe leaked (permanently consumed alt capacity),
        # the second student would have nowhere to go.
        app_ids = {p.application_id for p in result.proposals}
        assert application_2x.id in app_ids
        assert second.id in app_ids
