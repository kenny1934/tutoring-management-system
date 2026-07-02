"""
Tests for summer class context fields on GET /sessions.

Summer-published session_log rows link back to their summer placement via
summer_session_id. The sessions list should surface the class identity of
the slot actually being attended (summer_sessions.slot_id → summer_course_slots):
grade, course type (A/B), and slot label, plus the slot id for client-side
clustering. Regular sessions return NULLs for all four fields.
"""
import pytest
from datetime import date, datetime

from models import (
    Tutor,
    Student,
    Enrollment,
    SessionLog,
    SummerCourseConfig,
    SummerCourseSlot,
    SummerLesson,
    SummerSession,
    SummerApplication,
)
from tests.helpers import make_auth_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tutor(db_session):
    t = Tutor(
        user_email="tutor@test.com",
        tutor_name="Test Tutor",
        role="Tutor",
        default_location="MSA",
        is_active_tutor=True,
    )
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def student(db_session):
    s = Student(
        school_student_id="STU100",
        student_name="Summer Student",
        grade="F1",
        home_location="MSA",
    )
    db_session.add(s)
    db_session.commit()
    return s


@pytest.fixture
def enrollment(db_session, student, tutor):
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        assigned_day="Tuesday",
        assigned_time="10:00 - 11:30",
        location="MSA",
        lessons_paid=8,
        payment_date=date(2026, 6, 1),
        first_lesson_date=date(2026, 7, 7),
        payment_status="Paid",
        enrollment_type="Summer",
    )
    db_session.add(e)
    db_session.commit()
    return e


@pytest.fixture
def config(db_session):
    cfg = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 6, 30),
        course_start_date=date(2026, 7, 6),
        course_end_date=date(2026, 8, 31),
        total_lessons=8,
        pricing_config={"base": 400},
        locations=[{"name": "MSA", "open_days": ["Tuesday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


@pytest.fixture
def application(db_session, config, student):
    a = SummerApplication(
        config_id=config.id,
        reference_code="SC2026-T0100",
        student_name="Summer Student",
        grade="F1",
        contact_phone="11111111",
        application_status="Paid",
        sessions_per_week=1,
        lessons_paid=8,
        existing_student_id=student.id,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _make_slot(db_session, config, tutor, *, grade="F1", course_type="A",
               slot_label=None, slot_day="Tuesday", time_slot="10:00 - 11:30",
               is_adhoc=False):
    s = SummerCourseSlot(
        config_id=config.id,
        slot_day=slot_day,
        time_slot=time_slot,
        location="MSA",
        grade=grade,
        course_type=course_type,
        slot_label=slot_label,
        max_students=8,
        tutor_id=tutor.id,
        is_adhoc=is_adhoc,
    )
    db_session.add(s)
    db_session.commit()
    return s


def _make_summer_session(db_session, application, slot, lesson_number=1,
                         lesson_date=date(2026, 7, 7)):
    lesson = SummerLesson(
        slot_id=slot.id,
        lesson_date=lesson_date,
        lesson_number=lesson_number,
        lesson_status="Scheduled",
    )
    db_session.add(lesson)
    db_session.commit()
    ss = SummerSession(
        application_id=application.id,
        slot_id=slot.id,
        lesson_id=lesson.id,
        lesson_number=lesson_number,
        session_status="Confirmed",
    )
    db_session.add(ss)
    db_session.commit()
    return ss


def _make_session_log(db_session, enrollment, tutor, *, summer_session_id=None,
                      session_date=date(2026, 7, 7), lesson_number=None):
    row = SessionLog(
        enrollment_id=enrollment.id,
        student_id=enrollment.student_id,
        tutor_id=tutor.id,
        session_date=session_date,
        time_slot="10:00 - 11:30",
        location="MSA",
        session_status="Scheduled",
        summer_session_id=summer_session_id,
        lesson_number=lesson_number,
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)
    return row


def _get_sessions(client, tutor, **params):
    token = make_auth_token(tutor.id)
    resp = client.get("/api/sessions", params=params, cookies={"access_token": token})
    assert resp.status_code == 200
    return resp.json()


# ---------------------------------------------------------------------------
# Summer class fields
# ---------------------------------------------------------------------------

class TestSummerClassFields:
    def test_summer_session_carries_class_identity(
        self, client, db_session, tutor, enrollment, config, application
    ):
        slot = _make_slot(db_session, config, tutor,
                          grade="F1", course_type="A", slot_label="Tue 10:00 F1A")
        ss = _make_summer_session(db_session, application, slot, lesson_number=2)
        _make_session_log(db_session, enrollment, tutor,
                          summer_session_id=ss.id, lesson_number=2)

        rows = _get_sessions(client, tutor)
        assert len(rows) == 1
        row = rows[0]
        assert row["summer_slot_id"] == slot.id
        assert row["summer_class_grade"] == "F1"
        assert row["summer_course_type"] == "A"
        assert row["summer_slot_label"] == "Tue 10:00 F1A"

    def test_regular_session_has_null_class_fields(
        self, client, db_session, tutor, enrollment
    ):
        _make_session_log(db_session, enrollment, tutor)

        rows = _get_sessions(client, tutor)
        assert len(rows) == 1
        row = rows[0]
        assert row["summer_slot_id"] is None
        assert row["summer_class_grade"] is None
        assert row["summer_course_type"] is None
        assert row["summer_slot_label"] is None

    def test_multiple_slots_map_to_their_own_rows(
        self, client, db_session, tutor, enrollment, config, application
    ):
        """Batch resolution: two summer rows in different slots plus one
        regular row each get the right (or no) class identity."""
        slot_a = _make_slot(db_session, config, tutor,
                            grade="F1", course_type="A")
        slot_b = _make_slot(db_session, config, tutor,
                            grade="F2", course_type="B",
                            slot_day="Friday", time_slot="14:00 - 15:30")
        ss_a = _make_summer_session(db_session, application, slot_a,
                                    lesson_number=1, lesson_date=date(2026, 7, 7))
        ss_b = _make_summer_session(db_session, application, slot_b,
                                    lesson_number=1, lesson_date=date(2026, 7, 10))
        log_a = _make_session_log(db_session, enrollment, tutor,
                                  summer_session_id=ss_a.id,
                                  session_date=date(2026, 7, 7))
        log_b = _make_session_log(db_session, enrollment, tutor,
                                  summer_session_id=ss_b.id,
                                  session_date=date(2026, 7, 10))
        log_regular = _make_session_log(db_session, enrollment, tutor,
                                        session_date=date(2026, 7, 14))

        rows = {r["id"]: r for r in _get_sessions(client, tutor)}
        assert rows[log_a.id]["summer_slot_id"] == slot_a.id
        assert rows[log_a.id]["summer_class_grade"] == "F1"
        assert rows[log_a.id]["summer_course_type"] == "A"
        assert rows[log_b.id]["summer_slot_id"] == slot_b.id
        assert rows[log_b.id]["summer_class_grade"] == "F2"
        assert rows[log_b.id]["summer_course_type"] == "B"
        assert rows[log_regular.id]["summer_slot_id"] is None

    def test_adhoc_slot_without_grade_returns_partial_identity(
        self, client, db_session, tutor, enrollment, config, application
    ):
        """Ad-hoc make-up slots may have no grade/type; fields degrade to
        NULL individually rather than erroring."""
        slot = _make_slot(db_session, config, tutor,
                          grade=None, course_type=None,
                          slot_label="Make-up Slot", is_adhoc=True)
        ss = _make_summer_session(db_session, application, slot,
                                  lesson_number=None)
        _make_session_log(db_session, enrollment, tutor,
                          summer_session_id=ss.id)

        rows = _get_sessions(client, tutor)
        row = rows[0]
        assert row["summer_slot_id"] == slot.id
        assert row["summer_class_grade"] is None
        assert row["summer_course_type"] is None
        assert row["summer_slot_label"] == "Make-up Slot"

    def test_dangling_summer_session_id_is_safe(
        self, client, db_session, tutor, enrollment
    ):
        """A summer_session_id with no matching summer_sessions row (e.g.
        legacy/test data) must not crash the endpoint; fields stay NULL."""
        _make_session_log(db_session, enrollment, tutor, summer_session_id=99999)

        rows = _get_sessions(client, tutor)
        row = rows[0]
        assert row["summer_slot_id"] is None
        assert row["summer_class_grade"] is None
