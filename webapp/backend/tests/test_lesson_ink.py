"""Tests for lesson ink saved on the server.

A page of ink is named by its session, a target and its page index. The later
save always wins, and every write moves the page's version on, because that's
how an open lesson view notices that someone else changed a page it has.
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from models import LessonInk, SessionExercise, SessionLog, Student, Tutor
from auth.dependencies import get_current_user, reject_read_only
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}
TODAY = date.today()

PEN = {"points": [[10.5, 20.25, 0.5], [11, 21, 0.5]], "color": "#dc2626", "size": 4}
HIGHLIGHT = {"points": [[1, 2, 1], [3, 4, 1]], "color": "#facc15", "size": 18, "kind": "highlighter"}
PENCIL = {"points": [[5, 6, 0.5], [7, 8, 0.5], [9, 9, 0.5]], "color": "#6b7280", "size": 2.5, "kind": "pencil"}

ME = dict(id=99, user_email="me@example.com", tutor_name="Me", role="Tutor", is_active_tutor=True)
OTHER = dict(id=5, user_email="other@example.com", tutor_name="Ms Other", role="Tutor", is_active_tutor=True)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(reject_read_only, None)


def _as(**tutor):
    user = Tutor(**tutor)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[reject_read_only] = lambda: user


@pytest.fixture
def slot(db_session: Session):
    """Two students' lessons in one slot, each with a classwork sheet, and a lesson from last year."""
    db_session.add(Tutor(**ME))
    db_session.add(Tutor(**OTHER))
    db_session.add(Student(id=1, student_name="Amy", school_student_id="STU001", grade="F2"))
    db_session.add(Student(id=2, student_name="Ben", school_student_id="STU002", grade="F2"))
    for session_id, student_id, day in ((100, 1, TODAY), (101, 2, TODAY), (50, 1, TODAY - timedelta(days=400))):
        db_session.add(SessionLog(
            id=session_id, student_id=student_id, tutor_id=99, session_date=day,
            time_slot="15:00 - 16:30", session_status="Scheduled", location="Main Center",
        ))
    db_session.add(SessionExercise(id=10, session_id=100, exercise_type="CW", pdf_name="A.pdf", created_by="me@example.com"))
    db_session.add(SessionExercise(id=11, session_id=101, exercise_type="CW", pdf_name="B.pdf", created_by="me@example.com"))
    db_session.commit()
    _as(**ME)


def _page(session_id=100, target_key="ex:10", page_index=0, strokes=(PEN,)):
    return {
        "session_id": session_id, "target_key": target_key, "page_index": page_index,
        "pdf_page": page_index + 1, "pdf_name": "A.pdf", "strokes": list(strokes),
    }


def _save(client: TestClient, *pages) -> dict:
    resp = client.put("/api/lesson-ink", json={"pages": list(pages)}, cookies=AUTH_COOKIE)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _read(client: TestClient, *session_ids) -> dict:
    resp = client.get(f"/api/lesson-ink?session_ids={','.join(map(str, session_ids))}", cookies=AUTH_COOKIE)
    assert resp.status_code == 200, resp.text
    return {(p["session_id"], p["target_key"], p["page_index"]): p for p in resp.json()["pages"]}


def test_a_saved_page_reads_back_exactly(client: TestClient, db_session: Session, slot):
    result = _save(client, _page(strokes=[PEN, HIGHLIGHT, PENCIL]))

    assert result == {"saved": [{"session_id": 100, "target_key": "ex:10", "page_index": 0, "version": 1}], "dropped": []}
    page = _read(client, 100)[(100, "ex:10", 0)]
    assert page["strokes"] == [PEN, HIGHLIGHT, PENCIL]
    # A pen stroke has no kind, and a pressure of exactly 0.5 means "simulate
    # the pressure" to the views, so both have to survive the round trip.
    assert "kind" not in page["strokes"][0]
    assert page["strokes"][0]["points"][0][2] == 0.5
    assert (page["version"], page["pdf_page"], page["pdf_name"]) == (1, 1, "A.pdf")
    assert (page["updated_by"], page["updated_by_name"]) == ("me@example.com", "Me")
    assert db_session.query(LessonInk).one().session_exercise_id == 10


def test_a_stroke_of_a_kind_the_views_dont_draw_is_refused(client: TestClient, slot):
    crayon = {**PEN, "kind": "crayon"}
    resp = client.put("/api/lesson-ink", json={"pages": [_page(strokes=[crayon])]}, cookies=AUTH_COOKIE)
    assert resp.status_code == 422


def _draft_page(session_id=100, target_key="draft:100", sheet=0):
    """A sheet of a lesson's own Draft, which has no exercise and no PDF behind it."""
    return {
        "session_id": session_id, "target_key": target_key, "page_index": 1000 + sheet,
        "pdf_page": None, "pdf_name": None, "strokes": [PEN],
    }


def test_a_lessons_own_draft_is_saved_under_its_session(client: TestClient, db_session: Session, slot):
    result = _save(client, _draft_page())

    assert result["saved"] == [{"session_id": 100, "target_key": "draft:100", "page_index": 1000, "version": 1}]
    page = _read(client, 100)[(100, "draft:100", 1000)]
    assert page["strokes"] == [PEN]
    assert (page["pdf_page"], page["pdf_name"]) == (None, None)
    assert db_session.query(LessonInk).one().session_exercise_id is None


def test_a_draft_filed_under_another_lesson_is_dropped(client: TestClient, db_session: Session, slot):
    result = _save(client, _draft_page(session_id=100, target_key="draft:101"))

    assert result == {"saved": [], "dropped": [{"session_id": 100, "target_key": "draft:101", "page_index": 1000}]}
    assert db_session.query(LessonInk).count() == 0


def test_every_save_moves_the_version_on_and_the_later_one_wins(client: TestClient, slot):
    _save(client, _page(strokes=[PEN]))
    _as(**OTHER)

    result = _save(client, _page(strokes=[HIGHLIGHT]))

    assert result["saved"][0]["version"] == 2
    page = _read(client, 100)[(100, "ex:10", 0)]
    assert page["strokes"] == [HIGHLIGHT]
    assert page["updated_by_name"] == "Ms Other"


def test_clearing_a_page_keeps_an_empty_row_so_open_views_see_it(client: TestClient, slot):
    _save(client, _page(strokes=[PEN]))

    assert _save(client, _page(strokes=[]))["saved"][0]["version"] == 2

    page = _read(client, 100)[(100, "ex:10", 0)]
    assert (page["strokes"], page["version"]) == ([], 2)


def test_a_preview_is_saved_without_an_exercise(client: TestClient, db_session: Session, slot):
    _save(client, _page(target_key="preview:345"))

    row = db_session.query(LessonInk).one()
    assert (row.target_key, row.session_exercise_id) == ("preview:345", None)


def test_one_save_can_cover_several_lessons_and_a_read_returns_only_those_asked_for(client: TestClient, slot):
    result = _save(client, _page(), _page(session_id=101, target_key="ex:11"))

    assert len(result["saved"]) == 2
    assert set(_read(client, 101)) == {(101, "ex:11", 0)}
    assert set(_read(client, 100, 101)) == {(100, "ex:10", 0), (101, "ex:11", 0)}


def test_pages_whose_exercise_is_gone_or_elsewhere_are_dropped(client: TestClient, slot):
    result = _save(client, _page(target_key="ex:999"), _page(session_id=101, target_key="ex:10"), _page())

    assert [p["target_key"] for p in result["saved"]] == ["ex:10"]
    assert result["saved"][0]["session_id"] == 100
    assert {(p["session_id"], p["target_key"]) for p in result["dropped"]} == {(100, "ex:999"), (101, "ex:10")}


def test_a_page_sent_twice_in_one_save_keeps_its_last_strokes(client: TestClient, slot):
    result = _save(client, _page(strokes=[PEN]), _page(strokes=[HIGHLIGHT]))

    assert result["saved"] == [{"session_id": 100, "target_key": "ex:10", "page_index": 0, "version": 1}]
    assert _read(client, 100)[(100, "ex:10", 0)]["strokes"] == [HIGHLIGHT]


def test_a_target_in_the_wrong_form_is_refused(client: TestClient, slot):
    resp = client.put(
        "/api/lesson-ink", json={"pages": [{**_page(), "target_key": "exercise:10"}]}, cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 422


def test_a_read_needs_a_list_of_numbers(client: TestClient, slot):
    assert client.get("/api/lesson-ink?session_ids=abc", cookies=AUTH_COOKIE).status_code == 400
    assert client.get("/api/lesson-ink?session_ids=", cookies=AUTH_COOKIE).status_code == 400


def test_read_only_users_cannot_save_ink(client: TestClient, slot):
    """reject_read_only is the gate. Without the override it must not pass."""
    app.dependency_overrides.pop(reject_read_only, None)
    app.dependency_overrides[get_current_user] = lambda: Tutor(**{**ME, "role": "Supervisor"})

    resp = client.put("/api/lesson-ink", json={"pages": [_page()]}, cookies=AUTH_COOKIE)

    assert resp.status_code == 403


def _old_and_new_ink(db_session: Session):
    for session_id in (50, 100):
        db_session.add(LessonInk(
            session_id=session_id, target_key="preview:1", page_index=0,
            strokes=[PEN], updated_by="me@example.com",
        ))
    db_session.commit()


def test_the_purge_deletes_ink_from_lessons_over_a_year_old(
    client: TestClient, db_session: Session, slot, monkeypatch,
):
    monkeypatch.setenv("LESSON_INK_CRON_SECRET", "s3cret")
    _old_and_new_ink(db_session)

    # No cookie, the way Cloud Scheduler calls it, so the gate has to let it through.
    resp = client.post("/api/admin/lesson-ink/purge", headers={"X-Cron-Secret": "s3cret"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["deleted"] == 1
    assert [row.session_id for row in db_session.query(LessonInk).all()] == [100]


def test_the_purge_refuses_a_wrong_secret_and_a_tutor(
    client: TestClient, db_session: Session, slot, monkeypatch,
):
    monkeypatch.setenv("LESSON_INK_CRON_SECRET", "s3cret")
    _old_and_new_ink(db_session)

    assert client.post("/api/admin/lesson-ink/purge", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    assert client.post("/api/admin/lesson-ink/purge", cookies=AUTH_COOKIE).status_code == 403
    assert db_session.query(LessonInk).count() == 2
