"""Tests for the homework checking endpoints."""

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from main import app
from models import (
    HomeworkCompletion,
    HomeworkFile,
    HomeworkToCheck,
    SessionExercise,
    SessionLog,
    Student,
    Tutor,
)
from auth.dependencies import get_current_user, reject_read_only
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}

TODAY = date.today()
LAST_WEEK = TODAY - timedelta(days=7)
TWO_WEEKS_AGO = TODAY - timedelta(days=14)


def _tutor(role: str = "Tutor", tutor_id: int = 99) -> Tutor:
    return Tutor(
        id=tutor_id,
        user_email="me@example.com",
        tutor_name="Me",
        role=role,
        is_active_tutor=True,
    )


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(reject_read_only, None)


@pytest.fixture
def as_tutor():
    tutor = _tutor()
    app.dependency_overrides[get_current_user] = lambda: tutor
    app.dependency_overrides[reject_read_only] = lambda: tutor
    return tutor


@pytest.fixture
def homework_setup(db_session: Session):
    """
    A student with homework assigned last week, being checked today.

    homework_to_check is a view in production. Under SQLite it is created as a
    plain table, so the rows it would produce are inserted directly.
    """
    db_session.add(Tutor(id=99, user_email="me@example.com", tutor_name="Me", role="Tutor", is_active_tutor=True))
    db_session.add(Tutor(id=5, user_email="other@example.com", tutor_name="Ms Other", role="Tutor", is_active_tutor=True))
    db_session.add(Student(id=1, student_name="Test Student", school_student_id="STU001", grade="F2"))

    db_session.add(SessionLog(
        id=100, student_id=1, tutor_id=5, session_date=LAST_WEEK,
        time_slot="15:00 - 16:30", session_status="Attended", location="Main Center",
    ))
    db_session.add(SessionLog(
        id=200, student_id=1, tutor_id=99, session_date=TODAY,
        time_slot="15:00 - 16:30", session_status="Scheduled", location="Main Center",
    ))

    db_session.add(SessionExercise(
        id=10, session_id=100, exercise_type="HW", pdf_name="Ch5.pdf",
        page_start=12, page_end=15, created_by="other@example.com",
    ))
    db_session.add(SessionExercise(
        id=11, session_id=100, exercise_type="CW", pdf_name="Classwork.pdf",
        created_by="other@example.com",
    ))

    db_session.add(HomeworkToCheck(
        current_session_id=200, session_exercise_id=10, student_id=1,
        current_tutor_id=99, current_session_date=TODAY, student_name="Test Student",
        assigned_session_id=100, homework_assigned_date=LAST_WEEK,
        assigned_time_slot="15:00 - 16:30", assigned_by_tutor_id=5,
        assigned_by_tutor="Ms Other", sessions_ago=1,
        pdf_name="Ch5.pdf", page_start=12, page_end=15, pages="p.12-15",
        completion_status="Not Checked", attachment_count=0, check_status="Pending",
    ))
    db_session.commit()


def test_mark_creates_completion_record(client: TestClient, db_session: Session, as_tutor, homework_setup):
    resp = client.patch(
        "/api/sessions/200/homework/10",
        json={"completion_status": "Completed"},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 200

    record = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).one()
    assert record.completion_status == "Completed"
    assert record.current_session_id == 200
    assert record.checked_by == 99
    assert record.checked_at is not None
    # Legacy flag stays in step with the four-state status.
    assert record.submitted is True


def test_mark_snapshots_the_assignment(client: TestClient, db_session: Session, as_tutor, homework_setup):
    """The record must survive the assignment being edited away."""
    client.patch(
        "/api/sessions/200/homework/10",
        json={"completion_status": "Partially Completed"},
        cookies=AUTH_COOKIE,
    )

    record = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).one()
    assert record.pdf_name == "Ch5.pdf"
    assert record.page_start == 12
    assert record.page_end == 15
    assert record.assigned_date == LAST_WEEK
    assert record.assigned_by_tutor_id == 5
    assert record.submitted is True


def test_mark_is_idempotent_per_assignment(client: TestClient, db_session: Session, as_tutor, homework_setup):
    """Marking twice updates the one record rather than adding another."""
    client.patch("/api/sessions/200/homework/10", json={"completion_status": "Completed"}, cookies=AUTH_COOKIE)
    client.patch("/api/sessions/200/homework/10", json={"completion_status": "Not Completed"}, cookies=AUTH_COOKIE)

    records = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).all()
    assert len(records) == 1
    assert records[0].completion_status == "Not Completed"
    assert records[0].submitted is False


def test_unmarking_clears_the_audit_stamp(client: TestClient, db_session: Session, as_tutor, homework_setup):
    client.patch("/api/sessions/200/homework/10", json={"completion_status": "Completed"}, cookies=AUTH_COOKIE)
    client.patch("/api/sessions/200/homework/10", json={"completion_status": "Not Checked"}, cookies=AUTH_COOKIE)

    record = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).one()
    assert record.completion_status == "Not Checked"
    assert record.checked_by is None
    assert record.checked_at is None


def test_rating_and_comment_save_independently(client: TestClient, db_session: Session, as_tutor, homework_setup):
    client.patch("/api/sessions/200/homework/10", json={"completion_status": "Completed"}, cookies=AUTH_COOKIE)
    client.patch("/api/sessions/200/homework/10", json={"homework_rating": "⭐⭐⭐"}, cookies=AUTH_COOKIE)
    client.patch("/api/sessions/200/homework/10", json={"tutor_comments": "Neat work"}, cookies=AUTH_COOKIE)

    record = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).one()
    assert record.completion_status == "Completed"
    assert record.homework_rating == "⭐⭐⭐"
    assert record.tutor_comments == "Neat work"


def test_rating_only_mark_still_reads_as_unchecked(client: TestClient, db_session: Session, as_tutor, homework_setup):
    """A star before a status must not make the item look checked."""
    client.patch("/api/sessions/200/homework/10", json={"homework_rating": "⭐⭐⭐"}, cookies=AUTH_COOKIE)

    record = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).one()
    assert record.homework_rating == "⭐⭐⭐"
    assert record.completion_status == "Not Checked"
    assert record.checked_by is None


def test_mark_rejects_unknown_status(client: TestClient, as_tutor, homework_setup):
    resp = client.patch(
        "/api/sessions/200/homework/10",
        json={"completion_status": "Sort of done"},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 422


def test_mark_rejects_classwork(client: TestClient, as_tutor, homework_setup):
    resp = client.patch(
        "/api/sessions/200/homework/11",
        json={"completion_status": "Completed"},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 400
    assert "classwork" in resp.json()["detail"].lower()


def test_mark_rejects_another_students_homework(client: TestClient, db_session: Session, as_tutor, homework_setup):
    db_session.add(Student(id=2, student_name="Other Student", school_student_id="STU002", grade="F2"))
    db_session.add(SessionLog(
        id=300, student_id=2, tutor_id=99, session_date=TODAY,
        time_slot="17:00 - 18:30", session_status="Scheduled", location="Main Center",
    ))
    db_session.commit()

    resp = client.patch(
        "/api/sessions/300/homework/10",
        json={"completion_status": "Completed"},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 400
    assert "different student" in resp.json()["detail"].lower()


def test_mark_404s_on_missing_session(client: TestClient, as_tutor, homework_setup):
    resp = client.patch(
        "/api/sessions/999/homework/10",
        json={"completion_status": "Completed"},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 404


def test_to_check_returns_a_row_per_session(client: TestClient, as_tutor, homework_setup):
    resp = client.get("/api/homework/to-check?session_ids=200,100", cookies=AUTH_COOKIE)
    assert resp.status_code == 200

    payload = resp.json()
    assert [entry["session_id"] for entry in payload] == [200, 100]

    open_homework = payload[0]["homework"]
    assert len(open_homework) == 1
    assert open_homework[0]["session_exercise_id"] == 10
    assert open_homework[0]["sessions_ago"] == 1
    assert open_homework[0]["assigned_by_tutor"] == "Ms Other"
    # The session that assigned it has nothing of its own to check.
    assert payload[1]["homework"] == []


def test_to_check_rejects_bad_ids(client: TestClient, as_tutor, homework_setup):
    resp = client.get("/api/homework/to-check?session_ids=abc", cookies=AUTH_COOKIE)
    assert resp.status_code == 400


def test_to_check_needs_session_ids(client: TestClient, as_tutor, homework_setup):
    resp = client.get("/api/homework/to-check", cookies=AUTH_COOKIE)
    assert resp.status_code == 422


def test_counts_summarise_open_homework(client: TestClient, db_session: Session, as_tutor, homework_setup):
    db_session.add(HomeworkToCheck(
        current_session_id=200, session_exercise_id=12, student_id=1,
        current_tutor_id=99, current_session_date=TODAY, student_name="Test Student",
        assigned_session_id=100, homework_assigned_date=TWO_WEEKS_AGO, sessions_ago=2,
        pdf_name="Ch4.pdf", completion_status="Completed", attachment_count=0,
        check_status="Checked",
    ))
    db_session.commit()

    resp = client.get("/api/homework/counts?session_ids=200", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    assert resp.json() == [{"session_id": 200, "total": 2, "checked": 1}]


def test_counts_omit_sessions_without_homework(client: TestClient, as_tutor, homework_setup):
    resp = client.get("/api/homework/counts?session_ids=100", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    assert resp.json() == []


# --- Handed-in files ---

@pytest.fixture
def fake_storage(monkeypatch):
    """Stand in for GCS so uploads can be exercised without a bucket."""
    uploaded = []

    def _upload_image(file_bytes, original_filename=None, prefix="inbox"):
        uploaded.append(("image", prefix, original_filename))
        return f"https://storage.googleapis.com/csm-inbox-images/{prefix}/fake.jpg"

    def _upload_document(file_bytes, original_filename, content_type, prefix="inbox"):
        uploaded.append(("document", prefix, original_filename))
        return f"https://storage.googleapis.com/csm-inbox-images/{prefix}/docs/fake.pdf"

    monkeypatch.setattr("routers.homework.upload_image", _upload_image)
    monkeypatch.setattr("routers.homework.upload_document", _upload_document)
    monkeypatch.setattr("routers.homework.delete_image", lambda url: True)
    return uploaded


def test_upload_photo_creates_the_completion_record(
    client: TestClient, db_session: Session, as_tutor, homework_setup, fake_storage
):
    """A tutor photographing the work first must not need a status beforehand."""
    resp = client.post(
        "/api/sessions/200/homework/10/files",
        files={"file": ("book.jpg", b"pretend-jpeg", "image/jpeg")},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 200

    payload = resp.json()
    assert payload["attachment_count"] == 1
    assert len(payload["files"]) == 1
    assert payload["files"][0]["file_type"] == "image"
    # Created but untouched, so it still reads as waiting to be checked.
    assert payload["completion_status"] == "Not Checked"

    record = db_session.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == 10
    ).one()
    assert record.pdf_name == "Ch5.pdf"
    assert fake_storage == [("image", "homework", "book.jpg")]


def test_upload_pdf_is_stored_without_reprocessing(
    client: TestClient, as_tutor, homework_setup, fake_storage
):
    resp = client.post(
        "/api/sessions/200/homework/10/files",
        files={"file": ("scan.pdf", b"%PDF-fake", "application/pdf")},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 200
    assert resp.json()["files"][0]["file_type"] == "pdf"
    assert fake_storage == [("document", "homework", "scan.pdf")]


def test_uploads_stack_in_order(client: TestClient, as_tutor, homework_setup, fake_storage):
    client.post("/api/sessions/200/homework/10/files",
                files={"file": ("one.jpg", b"a", "image/jpeg")}, cookies=AUTH_COOKIE)
    resp = client.post("/api/sessions/200/homework/10/files",
                       files={"file": ("two.jpg", b"b", "image/jpeg")}, cookies=AUTH_COOKIE)

    files = resp.json()["files"]
    assert [f["file_order"] for f in files] == [1, 2]
    assert [f["file_name"] for f in files] == ["one.jpg", "two.jpg"]


def test_upload_rejects_other_file_types(client: TestClient, as_tutor, homework_setup, fake_storage):
    resp = client.post(
        "/api/sessions/200/homework/10/files",
        files={"file": ("notes.docx", b"zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 400
    assert "photos and pdfs" in resp.json()["detail"].lower()
    assert fake_storage == []


def test_upload_rejects_classwork(client: TestClient, as_tutor, homework_setup, fake_storage):
    resp = client.post(
        "/api/sessions/200/homework/11/files",
        files={"file": ("book.jpg", b"a", "image/jpeg")},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 400
    assert fake_storage == []


def test_delete_removes_the_attachment(
    client: TestClient, db_session: Session, as_tutor, homework_setup, fake_storage
):
    upload = client.post("/api/sessions/200/homework/10/files",
                         files={"file": ("book.jpg", b"a", "image/jpeg")}, cookies=AUTH_COOKIE)
    file_id = upload.json()["files"][0]["id"]

    resp = client.delete(f"/api/sessions/200/homework/10/files/{file_id}", cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    assert resp.json()["attachment_count"] == 0
    assert resp.json()["files"] == []
    assert db_session.query(HomeworkFile).count() == 0


def test_delete_rejects_a_file_from_another_homework(
    client: TestClient, db_session: Session, as_tutor, homework_setup, fake_storage
):
    """File ids are only meaningful against their own assignment."""
    client.post("/api/sessions/200/homework/10/files",
                files={"file": ("book.jpg", b"a", "image/jpeg")}, cookies=AUTH_COOKIE)

    db_session.add(SessionExercise(
        id=12, session_id=100, exercise_type="HW", pdf_name="Other.pdf",
        created_by="other@example.com",
    ))
    db_session.commit()

    resp = client.delete("/api/sessions/200/homework/12/files/1", cookies=AUTH_COOKIE)
    assert resp.status_code == 404
    assert db_session.query(HomeworkFile).count() == 1


def test_uploading_is_blocked_for_read_only_users(client: TestClient, homework_setup, fake_storage):
    app.dependency_overrides[get_current_user] = lambda: _tutor(role="Supervisor")
    resp = client.post(
        "/api/sessions/200/homework/10/files",
        files={"file": ("book.jpg", b"a", "image/jpeg")},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 403
    assert fake_storage == []


def test_marking_is_blocked_for_read_only_users(client: TestClient, homework_setup):
    """reject_read_only is the gate. Without the override it must not pass."""
    app.dependency_overrides[get_current_user] = lambda: _tutor(role="Supervisor")
    resp = client.patch(
        "/api/sessions/200/homework/10",
        json={"completion_status": "Completed"},
        cookies=AUTH_COOKIE,
    )
    assert resp.status_code == 403
