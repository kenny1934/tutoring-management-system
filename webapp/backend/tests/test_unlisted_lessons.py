"""Tests for lessons taught but not in CSM yet.

A tutor records a lesson CSM doesn't have. When the real lesson appears, it
fills itself in: attendance, classwork, homework, notes and rating, without
overwriting anything the lesson already has. See services/unlisted_lessons.py.
"""
import ast
import pathlib
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from auth.dependencies import (
    get_current_user,
    reject_guest,
    reject_read_only,
    require_admin_view,
    require_admin_write,
)
from main import app
from models import SessionExercise, SessionLog, Student, Tutor, TutorMemo, TutorMessage
from services.unlisted_lessons import fill_unlisted_lessons
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}
DAY = date(2026, 10, 6)
SLOT = "16:45 - 18:15"


@pytest.fixture
def me():
    """The signed-in user, a tutor unless a test says otherwise."""
    user = Tutor(id=99, user_email="me@example.com", tutor_name="Ms Me", role="Tutor", is_active_tutor=True)
    for dep in (get_current_user, reject_guest, reject_read_only, require_admin_view, require_admin_write):
        app.dependency_overrides[dep] = lambda: user
    yield user
    for dep in (get_current_user, reject_guest, reject_read_only, require_admin_view, require_admin_write):
        app.dependency_overrides.pop(dep, None)


@pytest.fixture
def people(db_session: Session):
    db_session.add_all([
        Tutor(id=99, user_email="me@example.com", tutor_name="Ms Me", role="Tutor", is_active_tutor=True),
        Tutor(id=98, user_email="other@example.com", tutor_name="Mr Other", role="Tutor", is_active_tutor=True),
        Tutor(id=1, user_email="admin@example.com", tutor_name="Ms Admin", role="Admin", is_active_tutor=False),
        Student(id=1, student_name="Ada Lee", school_student_id="1001", grade="F2"),
    ])
    db_session.commit()


def _record(db_session: Session, **overrides) -> TutorMemo:
    fields = dict(
        student_id=1, tutor_id=99, memo_date=DAY, time_slot=SLOT, location="MSA",
        notes="Did factorisation", performance_rating="⭐⭐⭐⭐",
        exercises=[
            {"exercise_type": "CW", "pdf_name": "Algebra.pdf", "page_start": 2, "page_end": 3},
            {"exercise_type": "HW", "url": "https://example.com/hw", "url_title": "Online HW"},
        ],
        status="waiting", created_by="me@example.com",
    )
    fields.update(overrides)
    lesson = TutorMemo(**fields)
    db_session.add(lesson)
    db_session.commit()
    return lesson


def _lesson(db_session: Session, id: int, **overrides) -> SessionLog:
    fields = dict(
        id=id, student_id=1, tutor_id=99, session_date=DAY, time_slot=SLOT,
        location="MSA", session_status="Scheduled",
    )
    fields.update(overrides)
    session = SessionLog(**fields)
    db_session.add(session)
    db_session.commit()
    return session


# ---- Filling in ----

def test_filling_in_marks_attendance_and_copies_the_record(db_session: Session, people):
    record = _record(db_session)
    lesson = _lesson(db_session, 500)

    filled = fill_unlisted_lessons(db_session, [1], "admin@example.com")
    db_session.commit()

    assert [(r.id, s.id) for r, s in filled] == [(record.id, 500)]
    db_session.refresh(lesson)
    assert lesson.session_status == "Attended"
    assert lesson.previous_session_status == "Scheduled"
    assert lesson.attendance_marked_by == "me@example.com"
    assert lesson.attendance_mark_time is not None
    assert lesson.last_modified_by == "admin@example.com"
    assert lesson.notes == "Did factorisation"
    assert lesson.performance_rating == "⭐⭐⭐⭐"
    exercises = db_session.query(SessionExercise).filter_by(session_id=500).order_by(SessionExercise.exercise_type).all()
    assert [(e.exercise_type, e.pdf_name, e.url, e.url_title) for e in exercises] == [
        ("CW", "Algebra.pdf", None, None),
        ("HW", None, "https://example.com/hw", "Online HW"),
    ]
    db_session.refresh(record)
    assert (record.status, record.linked_session_id, record.filled_by) == ("filled", 500, "admin@example.com")


def test_a_make_up_becomes_attended_make_up(db_session: Session, people):
    _record(db_session)
    lesson = _lesson(db_session, 500, session_status="Make-up Class")

    fill_unlisted_lessons(db_session, [1], "admin@example.com")
    db_session.commit()

    db_session.refresh(lesson)
    assert lesson.session_status == "Attended (Make-up)"


def test_filling_in_overwrites_nothing_the_lesson_already_has(db_session: Session, people):
    _record(db_session)
    lesson = _lesson(db_session, 500, session_status="Attended", attendance_marked_by="other@example.com",
                     notes="Tutor's own note", performance_rating="⭐⭐")
    db_session.add(SessionExercise(session_id=500, exercise_type="CW", pdf_name="Own.pdf", created_by="other@example.com"))
    db_session.commit()

    fill_unlisted_lessons(db_session, [1], "admin@example.com")
    db_session.commit()

    db_session.refresh(lesson)
    assert lesson.session_status == "Attended"
    assert lesson.attendance_marked_by == "other@example.com"
    assert (lesson.notes, lesson.performance_rating) == ("Tutor's own note", "⭐⭐")
    kinds = sorted((e.exercise_type, e.pdf_name or e.url) for e in db_session.query(SessionExercise).filter_by(session_id=500))
    assert kinds == [("CW", "Own.pdf"), ("HW", "https://example.com/hw")]


def test_the_same_time_slot_wins(db_session: Session, people):
    _record(db_session)
    _lesson(db_session, 500, time_slot="10:00 - 11:30")
    _lesson(db_session, 501)

    filled = fill_unlisted_lessons(db_session, [1], "admin@example.com")

    assert [s.id for _, s in filled] == [501]


def test_two_equally_good_lessons_are_left_to_a_person(db_session: Session, people):
    record = _record(db_session, time_slot=None)
    _lesson(db_session, 500, time_slot="10:00 - 11:30")
    _lesson(db_session, 501, time_slot="14:00 - 15:30")

    assert fill_unlisted_lessons(db_session, [1], "admin@example.com") == []
    db_session.refresh(record)
    assert record.status == "waiting"


@pytest.mark.parametrize("status", ["Cancelled", "No Show", "Rescheduled - Pending Make-up", "Sick Leave - Make-up Booked"])
def test_a_lesson_the_student_missed_is_not_filled_in(db_session: Session, people, status):
    _record(db_session)
    _lesson(db_session, 500, session_status=status)

    assert fill_unlisted_lessons(db_session, [1], "admin@example.com") == []


def test_a_lesson_takes_one_record_at_most(db_session: Session, people):
    _record(db_session)
    second = _record(db_session, notes="Recorded twice")
    _lesson(db_session, 500)

    filled = fill_unlisted_lessons(db_session, [1], "admin@example.com")

    assert len(filled) == 1
    db_session.refresh(second)
    assert second.status == "waiting"


def test_the_tutor_is_told_and_the_tutor_who_did_it_is_not(db_session: Session, people):
    _record(db_session)
    _record(db_session, memo_date=date(2026, 10, 7))
    _lesson(db_session, 500)
    _lesson(db_session, 501, session_date=date(2026, 10, 7))

    fill_unlisted_lessons(db_session, [1], "admin@example.com")
    db_session.commit()
    messages = db_session.query(TutorMessage).all()
    assert [(m.from_tutor_id, m.to_tutor_id) for m in messages] == [(1, 99), (1, 99)]
    assert "Ada Lee" in messages[0].subject

    db_session.query(TutorMessage).delete()
    _record(db_session, memo_date=date(2026, 10, 8))
    _lesson(db_session, 502, session_date=date(2026, 10, 8))
    fill_unlisted_lessons(db_session, [1], "me@example.com")
    db_session.commit()
    assert db_session.query(TutorMessage).count() == 0


def test_every_place_that_creates_a_lesson_fills_in_waiting_records():
    """Each router function that builds a lesson row also calls
    fill_unlisted_lessons, so a new way of creating lessons can't forget to."""
    routers = pathlib.Path(__file__).resolve().parent.parent / "routers"
    missing = []
    for path in routers.glob("*.py"):
        for fn in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            calls = [n.func for n in ast.walk(fn) if isinstance(n, ast.Call)]
            names = {c.id if isinstance(c, ast.Name) else getattr(c, "attr", None) for c in calls}
            if "SessionLog" in names and "fill_unlisted_lessons" not in names:
                missing.append(f"{path.name}::{fn.name}")
    assert missing == []


# ---- The endpoints ----

def test_a_tutor_records_a_lesson_and_it_waits(client: TestClient, db_session: Session, people, me):
    resp = client.post("/api/unlisted-lessons", json={
        "student_id": 1, "lesson_date": str(DAY), "time_slot": SLOT, "location": "MSA",
        "exercises": [{"exercise_type": "Classwork", "pdf_name": "A.pdf", "id": 5}],
    }, cookies=AUTH_COOKIE)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["status"], body["tutor_id"], body["student_name"]) == ("waiting", 99, "Ada Lee")
    assert body["exercises"][0]["exercise_type"] == "CW"
    assert "id" not in body["exercises"][0]


def test_recording_a_lesson_csm_already_has_fills_it_in_at_once(client: TestClient, db_session: Session, people, me):
    _lesson(db_session, 500)
    resp = client.post("/api/unlisted-lessons", json={
        "student_id": 1, "lesson_date": str(DAY), "time_slot": SLOT, "notes": "n",
    }, cookies=AUTH_COOKIE)

    assert resp.json()["status"] == "filled"
    assert resp.json()["filled_session_id"] == 500


def test_only_an_admin_records_for_another_tutor(client: TestClient, db_session: Session, people, me):
    payload = {"student_id": 1, "lesson_date": str(DAY), "tutor_id": 98}
    assert client.post("/api/unlisted-lessons", json=payload, cookies=AUTH_COOKIE).status_code == 403

    me.role = "Admin"
    resp = client.post("/api/unlisted-lessons", json=payload, cookies=AUTH_COOKIE)
    assert resp.json()["tutor_id"] == 98


def test_only_its_tutor_or_an_admin_changes_it_and_only_while_waiting(client: TestClient, db_session: Session, people, me):
    theirs = _record(db_session, tutor_id=98)
    assert client.patch(f"/api/unlisted-lessons/{theirs.id}", json={"notes": "x"}, cookies=AUTH_COOKIE).status_code == 403
    assert client.delete(f"/api/unlisted-lessons/{theirs.id}", cookies=AUTH_COOKIE).status_code == 403

    mine = _record(db_session, status="filled")
    assert client.patch(f"/api/unlisted-lessons/{mine.id}", json={"notes": "x"}, cookies=AUTH_COOKIE).status_code == 409

    me.role = "Admin"
    resp = client.patch(f"/api/unlisted-lessons/{theirs.id}", json={"notes": "fixed"}, cookies=AUTH_COOKIE)
    assert resp.json()["notes"] == "fixed"


def test_dismissing_records_who_and_why(client: TestClient, db_session: Session, people, me):
    me.role = "Admin"
    record = _record(db_session)

    resp = client.post(f"/api/unlisted-lessons/{record.id}/dismiss", json={"reason": "mistake"}, cookies=AUTH_COOKIE)

    assert resp.json()["status"] == "dismissed"
    db_session.refresh(record)
    assert (record.dismissed_by, record.dismiss_reason) == ("me@example.com", "mistake")
    assert client.post(f"/api/unlisted-lessons/{record.id}/dismiss", json={"reason": "mistake"}, cookies=AUTH_COOKIE).status_code == 409


def test_the_one_click_fill_checks_student_day_and_owner(client: TestClient, db_session: Session, people, me):
    record = _record(db_session, time_slot=None)
    _lesson(db_session, 500, time_slot="10:00 - 11:30")
    _lesson(db_session, 501, time_slot="14:00 - 15:30")
    _lesson(db_session, 502, session_date=date(2026, 10, 9))
    _lesson(db_session, 503, tutor_id=98, time_slot="18:00 - 19:30")

    waiting = client.get("/api/sessions/501/unlisted-lessons", cookies=AUTH_COOKIE).json()
    assert [w["id"] for w in waiting] == [record.id]
    assert client.post(f"/api/unlisted-lessons/{record.id}/fill/502", cookies=AUTH_COOKIE).status_code == 400
    assert client.post(f"/api/unlisted-lessons/{record.id}/fill/503", cookies=AUTH_COOKIE).status_code == 403

    resp = client.post(f"/api/unlisted-lessons/{record.id}/fill/501", cookies=AUTH_COOKIE)
    assert resp.json()["filled_session_id"] == 501
    assert db_session.get(SessionLog, 501).session_status == "Attended"


def test_the_bell_counts_waiting_lessons_by_branch(client: TestClient, db_session: Session, people, me):
    _record(db_session)
    _record(db_session, location="MSB")
    _record(db_session, status="filled")

    assert client.get("/api/unlisted-lessons/waiting-count", cookies=AUTH_COOKIE).json() == {"count": 2}
    assert client.get("/api/unlisted-lessons/waiting-count?location=MSB", cookies=AUTH_COOKIE).json() == {"count": 1}
