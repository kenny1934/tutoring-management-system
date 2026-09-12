"""Tests for saving a session's exercises through PUT /sessions/{id}/exercises.

The save used to delete every exercise of the type and insert the list again,
so each save gave each exercise a new id and cut its homework completion
record loose. It now updates rows in place, and stores each row's place so
that dragging a row to a new position still sticks.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from models import HomeworkCompletion, SessionExercise, SessionLog, Student, Tutor
from auth.dependencies import get_current_user, reject_read_only
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}
URL = "/api/sessions/100/exercises"


@pytest.fixture(autouse=True)
def as_tutor():
    tutor = Tutor(id=99, user_email="me@example.com", tutor_name="Me", role="Tutor", is_active_tutor=True)
    app.dependency_overrides[get_current_user] = lambda: tutor
    app.dependency_overrides[reject_read_only] = lambda: tutor
    yield tutor
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(reject_read_only, None)


@pytest.fixture
def lesson(db_session: Session):
    """A lesson with two classwork sheets and one homework sheet, the homework already marked."""
    db_session.add(Tutor(id=99, user_email="me@example.com", tutor_name="Me", role="Tutor", is_active_tutor=True))
    db_session.add(Student(id=1, student_name="Test Student", school_student_id="STU001", grade="F2"))
    db_session.add(SessionLog(
        id=100, student_id=1, tutor_id=99, session_date=date.today(),
        time_slot="15:00 - 16:30", session_status="Scheduled", location="Main Center",
    ))
    db_session.add(SessionExercise(
        id=10, session_id=100, exercise_type="CW", pdf_name="A.pdf",
        page_start=1, page_end=2, created_by="other@example.com",
    ))
    db_session.add(SessionExercise(
        id=11, session_id=100, exercise_type="CW", pdf_name="B.pdf", created_by="other@example.com",
    ))
    db_session.add(SessionExercise(
        id=20, session_id=100, exercise_type="HW", pdf_name="H.pdf",
        page_start=5, page_end=6, created_by="other@example.com",
    ))
    db_session.add(HomeworkCompletion(
        id=77, current_session_id=100, session_exercise_id=20, student_id=1,
        completion_status="Completed",
    ))
    db_session.commit()


def _save(client: TestClient, exercise_type: str, exercises: list, **extra) -> list:
    """Saves the list and returns the (id, file) of each exercise of that type, in the order shown."""
    resp = client.put(
        URL, json={"exercise_type": exercise_type, "exercises": exercises, **extra}, cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 200, resp.text
    return [(ex["id"], ex["pdf_name"]) for ex in resp.json()["exercises"] if ex["exercise_type"] == exercise_type]


def _cw(pdf_name: str, id: int | None = None, **pages) -> dict:
    return {"id": id, "exercise_type": "CW", "pdf_name": pdf_name, **pages}


def test_an_edit_keeps_each_exercise_id(client: TestClient, db_session: Session, lesson):
    shown = _save(client, "CW", [_cw("A.pdf", 10, page_start=3, page_end=4), _cw("B.pdf", 11)])

    assert shown == [(10, "A.pdf"), (11, "B.pdf")]
    db_session.expire_all()
    edited = db_session.get(SessionExercise, 10)
    assert (edited.page_start, edited.page_end) == (3, 4)
    assert edited.created_by == "other@example.com"


def test_a_new_row_is_added_and_a_removed_row_is_deleted(client: TestClient, db_session: Session, lesson):
    shown = _save(client, "CW", [_cw("B.pdf", 11), _cw("C.pdf")])

    assert shown[0] == (11, "B.pdf")
    assert shown[1][1] == "C.pdf" and shown[1][0] not in (10, 11)
    db_session.expire_all()
    assert db_session.get(SessionExercise, 10) is None


def test_a_new_order_is_kept(client: TestClient, db_session: Session, lesson):
    assert _save(client, "CW", [_cw("B.pdf", 11), _cw("A.pdf", 10, page_start=1, page_end=2)]) == [
        (11, "B.pdf"), (10, "A.pdf"),
    ]

    # The session page reads exercises with its own query, so check it too.
    detail = client.get("/api/sessions/100", cookies=AUTH_COOKIE)
    assert detail.status_code == 200, detail.text
    assert [ex["id"] for ex in detail.json()["exercises"]] == [11, 10, 20]


def test_rows_sent_without_ids_are_matched_by_their_file_and_pages(client: TestClient, lesson):
    # The Zen assign screens send the whole list back with no ids.
    shown = _save(client, "CW", [_cw("B.pdf"), _cw("A.pdf", page_start=1, page_end=2)])

    assert shown == [(11, "B.pdf"), (10, "A.pdf")]


def test_an_id_from_another_type_is_not_taken_over(client: TestClient, db_session: Session, lesson):
    shown = _save(client, "HW", [{"id": 10, "exercise_type": "HW", "pdf_name": "New.pdf"}])

    assert len(shown) == 1 and shown[0][0] not in (10, 20)
    db_session.expire_all()
    assert db_session.get(SessionExercise, 10).exercise_type == "CW"


def test_marked_homework_keeps_its_exercise_across_an_edit(client: TestClient, db_session: Session, lesson):
    _save(client, "HW", [{"id": 20, "exercise_type": "HW", "pdf_name": "H.pdf", "page_start": 5, "page_end": 7}])

    db_session.expire_all()
    assert db_session.get(HomeworkCompletion, 77).session_exercise_id == 20
    assert db_session.get(SessionExercise, 20).page_end == 7


def test_appended_rows_go_after_the_ones_the_form_placed(client: TestClient, lesson):
    _save(client, "CW", [_cw("B.pdf", 11), _cw("A.pdf", 10, page_start=1, page_end=2)])

    shown = _save(client, "CW", [_cw("D.pdf")], append=True)

    assert [pdf for _, pdf in shown] == ["B.pdf", "A.pdf", "D.pdf"]
    assert [id for id, _ in shown][:2] == [11, 10]


def test_classwork_is_listed_before_homework(db_session: Session, lesson):
    db_session.add(SessionExercise(
        id=5, session_id=100, exercise_type="HW", pdf_name="Older.pdf", created_by="other@example.com",
    ))
    db_session.commit()
    db_session.expire_all()

    assert [ex.id for ex in db_session.get(SessionLog, 100).exercises] == [10, 11, 5, 20]
