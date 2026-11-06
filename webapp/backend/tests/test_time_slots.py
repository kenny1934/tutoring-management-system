"""Class times are validated on input without constraining legacy responses."""
from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import select

import schemas
from billing.workflow import canonical_time
from models import Enrollment, SessionLog, Student, Tutor
from routers.enrollments import check_student_conflicts
from services.unlisted_lessons import pick_lesson
from utils.time_slots import normalise_time_slot, same_time_slot, time_slot_matches


@pytest.mark.parametrize("value,expected", [
    ("18:00-19:30", "18:00 - 19:30"),
    (" 9:00  -  10:30 ", "09:00 - 10:30"),
    ("00:00 - 00:01", "00:00 - 00:01"),
    ("22:00 - 23:59", "22:00 - 23:59"),
])
def test_normalises_valid_ranges(value, expected):
    assert normalise_time_slot(value) == expected
    assert same_time_slot(value, expected)


@pytest.mark.parametrize("value", ["", "Various", "nonsense", "18:00", "24:00-25:00",
    "18:60-19:30", "19:30-18:00", "18:00-18:00", "23:00-00:30", "18:0-19:30",
    "prefix 18:00-19:30", "18:00-19:30 suffix"])
def test_rejects_invalid_ranges(value):
    with pytest.raises(ValueError):
        normalise_time_slot(value)


REQUESTS = [
    (schemas.EnrollmentCreate, "assigned_time", dict(student_id=1, tutor_id=1, assigned_day="Wed", location="TEST", first_lesson_date="2026-11-04", lessons_paid=6)),
    (schemas.EnrollmentUpdate, "assigned_time", {}),
    (schemas.ScheduleChangeRequest, "assigned_time", dict(assigned_day="Wed", location="TEST", tutor_id=1)),
    (schemas.ApplyScheduleChangeRequest, "assigned_time", dict(assigned_day="Wed", location="TEST", tutor_id=1)),
    (schemas.SessionUpdate, "time_slot", {}),
    (schemas.ScheduleMakeupRequest, "time_slot", dict(session_date="2026-11-04", tutor_id=1, location="TEST")),
    (schemas.MakeupProposalSlotCreate, "proposed_time_slot", dict(proposed_date="2026-11-04", proposed_tutor_id=1, proposed_location="TEST")),
    (schemas.MakeupProposalSlotUpdate, "proposed_time_slot", {}),
    (schemas.ExamRevisionSlotCreate, "time_slot", dict(calendar_event_id=1, session_date="2026-11-04", tutor_id=1, location="TEST")),
    (schemas.ExamRevisionSlotUpdate, "time_slot", {}),
    (schemas.UnlistedLessonUpdate, "time_slot", {}),
    (schemas.RegularSlotUpdate, "time_slot", {}),
]


@pytest.mark.parametrize("model,field,other", REQUESTS)
def test_write_contracts_normalise_ranges(model, field, other):
    result = model(**other, **{field: "18:00-19:30"})
    assert getattr(result, field) == "18:00 - 19:30"


@pytest.mark.parametrize("model,field,other", REQUESTS)
@pytest.mark.parametrize("value", ["nonsense", "19:30 - 18:00", "18:00 - "])
def test_write_contracts_reject_bad_ranges(model, field, other, value):
    with pytest.raises(ValidationError):
        model(**other, **{field: value})


def test_overrides_are_ranges_too():
    request = dict(assigned_day="Wed", assigned_time="18:00-19:30", location="TEST", tutor_id=1)
    value = schemas.ApplyScheduleChangeRequest(**request, time_overrides={2: "9:00-10:30"})
    assert value.time_overrides == {2: "09:00 - 10:30"}
    with pytest.raises(ValidationError):
        schemas.ApplyScheduleChangeRequest(**request, time_overrides={2: "14:30"})


def test_partial_edits_and_legacy_summaries_remain_supported():
    assert schemas.EnrollmentUpdate(payment_status="Paid").model_dump(exclude_unset=True) == {"payment_status": "Paid"}
    assert schemas.EnrollmentUpdate(assigned_time="Various", payment_status="Paid").assigned_time == "Various"
    assert schemas.SessionUpdate(notes="Updated notes").time_slot is None
    assert schemas.SessionUpdate(time_slot=None).time_slot is None
    assert schemas.SessionBase(student_id=1, tutor_id=1, session_date=date(2026, 11, 4), time_slot="legacy").time_slot == "legacy"
    assert canonical_time("18:00 - 19:30") == "18:00-19:30"


def test_sql_conflict_lookup_tolerates_legacy_spaces(db_session):
    tutor = Tutor(user_email="slot@example.test", tutor_name="Synthetic Tutor", role="Tutor")
    student = Student(student_name="Synthetic Student", school_student_id="SLOT")
    db_session.add_all([tutor, student])
    db_session.flush()
    enrollment = Enrollment(student_id=student.id, tutor_id=tutor.id, assigned_time="18:00-19:30",
        assigned_day="Wed", first_lesson_date=date(2026, 11, 4), lessons_paid=6)
    db_session.add(enrollment)
    db_session.flush()
    sample_session = SessionLog(enrollment_id=enrollment.id, student_id=student.id, tutor_id=tutor.id,
        session_date=date(2026, 11, 4), time_slot="18:00-19:30", session_status="Scheduled")
    db_session.add(sample_session)
    db_session.flush()
    assert db_session.scalar(select(SessionLog.id).where(time_slot_matches(SessionLog.time_slot, "18:00 - 19:30"))) == sample_session.id
    conflicts = check_student_conflicts(db_session, sample_session.student_id, [sample_session.session_date], "18:00 - 19:30")
    assert len(conflicts) == 1
    assert conflicts[0].session_date == sample_session.session_date


def test_unlisted_matching_prefers_equivalent_range_over_other_lesson():
    matching = SimpleNamespace(time_slot="18:00 - 19:30")
    other = SimpleNamespace(time_slot="18:25 - 19:55")
    memo = SimpleNamespace(time_slot="18:00-19:30")
    assert pick_lesson(memo, [other, matching]) is matching


def test_legacy_summary_cannot_be_assigned_as_a_new_time(mock_db):
    import asyncio
    from fastapi import HTTPException
    from routers.enrollments import update_enrollment
    mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = SimpleNamespace(assigned_time="18:00 - 19:30")
    with pytest.raises(HTTPException) as error:
        asyncio.run(update_enrollment(1, schemas.EnrollmentUpdate(assigned_time="Various"), admin=None, db=mock_db))
    assert error.value.status_code == 422


def test_schedule_change_stores_normalised_times_and_preserves_completed_lessons(db_session, monkeypatch):
    import asyncio
    from datetime import datetime
    from routers import enrollments

    tutor = Tutor(user_email="schedule@example.test", tutor_name="Synthetic Tutor", role="Admin")
    student = Student(student_name="Synthetic Student", school_student_id="SCHEDULE")
    db_session.add_all([tutor, student])
    db_session.flush()
    enrollment = Enrollment(student_id=student.id, tutor_id=tutor.id, assigned_day="Wed",
        assigned_time="18:00-19:30", first_lesson_date=date(2026, 11, 4),
        lessons_paid=6, enrollment_type="Regular", location="TEST")
    db_session.add(enrollment)
    db_session.flush()
    completed = SessionLog(enrollment_id=enrollment.id, student_id=student.id, tutor_id=tutor.id,
        session_date=date(2026, 11, 4), time_slot="18:00 - 19:30", session_status="Attended")
    ordinary = SessionLog(enrollment_id=enrollment.id, student_id=student.id, tutor_id=tutor.id,
        session_date=date(2026, 11, 11), time_slot="18:00 - 19:30", session_status="Scheduled")
    overridden = SessionLog(enrollment_id=enrollment.id, student_id=student.id, tutor_id=tutor.id,
        session_date=date(2026, 11, 18), time_slot="18:00 - 19:30", session_status="Scheduled")
    db_session.add_all([completed, ordinary, overridden])
    db_session.flush()
    monkeypatch.setattr(enrollments, "hk_now", lambda: datetime(2026, 11, 6, 12))
    monkeypatch.setattr(enrollments, "billing_today", lambda actual: actual)
    monkeypatch.setattr(enrollments, "assert_legacy_enrollments_mutable", lambda *a, **k: None)
    monkeypatch.setattr(enrollments, "assert_legacy_creation_allowed", lambda *a, **k: None)
    request = schemas.ApplyScheduleChangeRequest(assigned_day="Wed", assigned_time="18:00-19:45",
        tutor_id=tutor.id, location="TEST", time_overrides={overridden.id: "18:25-19:55"})
    result = asyncio.run(enrollments.apply_schedule_change(enrollment.id, request, db_session, tutor))
    assert result.sessions_updated == 2
    assert enrollment.assigned_time == "18:00 - 19:45"
    assert ordinary.time_slot == "18:00 - 19:45"
    assert overridden.time_slot == "18:25 - 19:55"
    assert completed.time_slot == "18:00 - 19:30" and completed.session_status == "Attended"
