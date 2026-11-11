"""Bulk reassignment must be atomic and change no other lesson data."""
from datetime import date, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import inspect, event

from models import Tutor, Student, Enrollment, SessionLog, SessionExercise, TutorBranchCoverage
from tests.helpers import make_auth_token
from routers import sessions as routes


@pytest.fixture
def batch(db_session, monkeypatch):
    monkeypatch.setenv("BILLING_WORKFLOW_ENABLED", "false")
    monkeypatch.setenv("MAKEUP_ENTITLEMENT_ENABLED", "false")
    admin = Tutor(tutor_name="Admin", user_email="admin@example.com", role="Admin", default_location="MSA")
    old = Tutor(tutor_name="Original", user_email="original@example.com", role="Tutor", default_location="MSA")
    target = Tutor(tutor_name="Replacement", user_email="replacement@example.com", role="Tutor", default_location="MSA")
    student = Student(student_name="Student", school_student_id="001", grade="F4")
    db_session.add_all([admin, old, target, student])
    db_session.flush()
    enrollment = Enrollment(student_id=student.id, tutor_id=old.id, enrollment_type="Regular",
                            payment_status="Paid", first_lesson_date=date(2026, 11, 1), lessons_paid=4)
    db_session.add(enrollment)
    db_session.flush()
    rows = [SessionLog(student_id=student.id, enrollment_id=enrollment.id, tutor_id=old.id,
                       session_date=date(2026, 11, day), time_slot="16:00 - 17:30", location="MSA",
                       session_status="Scheduled", lesson_number=i + 1, notes="Keep these notes",
                       last_modified_by="original@example.com", last_modified_time=datetime(2026, 10, 1))
            for i, day in enumerate([12, 19, 26])]
    db_session.add_all(rows)
    db_session.flush()
    rows[1].make_up_for_id = rows[0].id
    exercise = SessionExercise(session_id=rows[0].id, exercise_type="CW", pdf_name="Keep.pdf", page_start=2, created_by="original@example.com")
    db_session.add(exercise)
    db_session.commit()
    return admin, old, target, rows, enrollment, exercise


def snapshot(obj):
    return {column.key: getattr(obj, column.key) for column in inspect(type(obj)).columns}


def post(client, admin, rows, target, **extra):
    return client.post("/api/sessions/bulk-change-tutor", headers={
        "Cookie": f"access_token={make_auth_token(admin.id)}", **extra,
    }, json={"session_ids": [row.id for row in rows], "tutor_id": target.id})


@pytest.mark.parametrize("role", ["Admin", "Super Admin"])
def test_changes_only_tutor_and_audit_fields(client, db_session, batch, role):
    admin, old, target, rows, enrollment, exercise = batch
    admin.role = role
    db_session.commit()
    before = [snapshot(row) for row in rows]
    related = [snapshot(enrollment), snapshot(exercise), snapshot(old), snapshot(target)]
    writes = []
    def capture(_connection, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().split()[0].upper() in {"UPDATE", "INSERT", "DELETE"}:
            writes.append(statement)
    event.listen(db_session.bind, "before_cursor_execute", capture)
    try:
        response = post(client, admin, rows[:2], target)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture)
    assert writes
    for statement in writes:
        assert statement.startswith("UPDATE session_log SET ")
        assignments = statement.split(" SET ")[1].split(" WHERE ")[0]
        assert {item.strip().split("=")[0] for item in assignments.split(",")} == {
            "tutor_id", "last_modified_by", "last_modified_time",
        }
    assert response.status_code == 200, response.text
    assert response.json()["changed_session_ids"] == [row.id for row in rows[:2]]
    for i, row in enumerate(rows):
        db_session.refresh(row)
        after = snapshot(row)
        if i < 2:
            assert after.pop("tutor_id") == target.id
            assert after.pop("last_modified_by") == admin.user_email
            assert after.pop("last_modified_time") != before[i]["last_modified_time"]
            assert after == {k: v for k, v in before[i].items()
                             if k not in {"tutor_id", "last_modified_by", "last_modified_time"}}
        else:
            assert after == before[i]
    assert [snapshot(enrollment), snapshot(exercise), snapshot(old), snapshot(target)] == related


@pytest.mark.parametrize("role", ["Tutor", "Supervisor", "Guest"])
def test_non_admin_cannot_reassign(client, db_session, batch, role):
    admin, _, target, rows, *_ = batch
    admin.role = role
    db_session.commit()
    assert post(client, admin, rows, target).status_code == 403


def test_impersonation_respects_effective_role(client, db_session, batch):
    admin, _, target, rows, *_ = batch
    admin.role = "Super Admin"
    db_session.commit()
    assert post(client, admin, rows, target, **{"X-Effective-Role": "Tutor"}).status_code == 403


@pytest.mark.parametrize("reason", ["billing", "makeup", "departure", "coverage"])
def test_one_blocked_row_leaves_entire_batch_unchanged(client, db_session, batch, monkeypatch, reason):
    admin, _, target, rows, *_ = batch
    before = [snapshot(row) for row in rows]
    if reason == "billing":
        def blocked(*args, **kwargs):
            raise HTTPException(409, detail={"message": "Billing review required."})
        monkeypatch.setattr(routes, "assert_legacy_enrollments_mutable", blocked)
    elif reason == "makeup":
        def blocked(*args, **kwargs):
            raise HTTPException(409, detail={"message": "Make-up review required."})
        monkeypatch.setattr(routes, "assert_makeup_entitlement", blocked)
    elif reason == "departure":
        target.departure_effective_on = date(2026, 11, 15)
        db_session.commit()
    else:
        rows[1].location = "MSB"
        db_session.commit()
        before = [snapshot(row) for row in rows]
    response = post(client, admin, rows, target)
    assert response.status_code == 409, response.text
    assert response.json()["detail"]["issues"]
    for row, original in zip(rows, before):
        db_session.refresh(row)
        assert snapshot(row) == original


def test_same_tutor_is_unchanged_and_duplicate_ids_are_deduplicated(client, db_session, batch):
    admin, old, _, rows, *_ = batch
    before = snapshot(rows[0])
    response = post(client, admin, [rows[0], rows[0]], old)
    assert response.status_code == 200, response.text
    assert response.json() == {"changed_session_ids": [], "unchanged_session_ids": [rows[0].id]}
    db_session.refresh(rows[0])
    assert snapshot(rows[0]) == before


def test_missing_session_blocks_batch(client, batch):
    admin, _, target, rows, *_ = batch
    response = client.post("/api/sessions/bulk-change-tutor",
        headers={"Cookie": f"access_token={make_auth_token(admin.id)}"},
        json={"session_ids": [rows[0].id, 999999], "tutor_id": target.id})
    assert response.status_code == 404


def test_dated_branch_coverage(client, db_session, batch):
    admin, _, target, rows, *_ = batch
    target.default_location = "MSB"
    db_session.add(TutorBranchCoverage(tutor_id=target.id, location="MSA",
        effective_from=rows[0].session_date, effective_until=rows[0].session_date))
    db_session.commit()
    assert post(client, admin, rows[:1], target).status_code == 200
    assert post(client, admin, rows[1:], target).status_code == 409


@pytest.mark.parametrize("body", [
    {"session_ids": [], "tutor_id": 1},
    {"session_ids": [1], "tutor_id": 0},
    {"session_ids": [1], "tutor_id": 1, "session_status": "Attended"},
    {"session_ids": list(range(501)), "tutor_id": 1},
])
def test_rejects_invalid_or_extra_fields(client, batch, body):
    admin = batch[0]
    response = client.post("/api/sessions/bulk-change-tutor",
        headers={"Cookie": f"access_token={make_auth_token(admin.id)}"}, json=body)
    assert response.status_code == 422


@pytest.mark.parametrize("invalid", ["missing", "non_teaching"])
def test_invalid_target_is_rejected(client, db_session, batch, invalid):
    admin, _, target, rows, *_ = batch
    if invalid == "missing":
        target = Tutor(id=999999)
    else:
        target.is_active_tutor = False
        db_session.commit()
    assert post(client, admin, rows, target).status_code == 400
