"""Tests for the courseware usage-detail endpoint.

The endpoint reads the migration-169 `courseware_usage_detail` view, which
has no ORM model, so the fixture creates a plain SQLite table with the same
columns and fills it by hand alongside the ORM rows it joins to.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from main import app
from models import SessionExercise, SessionLog, Student, Tutor
from auth.dependencies import get_current_user
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}

USAGE_DETAIL_DDL = """CREATE TABLE courseware_usage_detail (
    exercise_id INT, normalized_path TEXT, filename VARCHAR(255),
    original_pdf_name TEXT, exercise_type VARCHAR(20), page_start INT,
    page_end INT, session_date DATE, location VARCHAR(100), student_id INT,
    student_name VARCHAR(255), grade VARCHAR(50), lang_stream VARCHAR(50),
    school VARCHAR(255), academic_stream VARCHAR(50), tutor_id INT,
    tutor_name VARCHAR(255))"""

# (exercise id, student id, school, lesson date, lesson status)
LESSONS = [
    (1, 1, "SPCC", date(2026, 9, 3), "Attended"),
    (2, 2, "SPCC", date(2026, 8, 28), "Rescheduled - Make-up Booked"),
    (3, 3, "SHCC", date(2026, 9, 1), "Attended (Make-up)"),
    (4, 4, None, date(2026, 7, 15), "Attended"),
]


@pytest.fixture(autouse=True)
def _setup(db_session):
    # conftest only drops ORM tables between tests; this raw one persists in
    # the shared in-memory DB, so recreate it fresh each time.
    db_session.execute(text("DROP TABLE IF EXISTS courseware_usage_detail"))
    db_session.execute(text(USAGE_DETAIL_DDL))

    for exercise_id, student_id, school, day, status in LESSONS:
        db_session.add(Student(id=student_id, student_name=f"Student {student_id}",
                               school=school, grade="F1", lang_stream="E"))
        db_session.add(SessionLog(id=100 + exercise_id, student_id=student_id,
                                  tutor_id=50, session_date=day, session_status=status,
                                  location="MSA"))
        db_session.add(SessionExercise(id=exercise_id, session_id=100 + exercise_id,
                                       exercise_type="CW", pdf_name="704_EX2_e.pdf",
                                       created_by="me@example.com"))
        db_session.execute(text("""
            INSERT INTO courseware_usage_detail
                (exercise_id, filename, original_pdf_name, exercise_type,
                 session_date, location, student_id, student_name, grade,
                 lang_stream, school, tutor_id, tutor_name)
            VALUES (:eid, '704_EX2_e', '704_EX2_e.pdf', 'CW', :day, 'MSA',
                    :sid, :name, 'F1', 'E', :school, 50, 'Mr Lau')
        """), {"eid": exercise_id, "day": day, "sid": student_id,
               "name": f"Student {student_id}", "school": school})
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: Tutor(
        id=99, user_email="me@example.com", tutor_name="Me", role="Tutor",
        is_active_tutor=True,
    )
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _get(client, **params):
    return client.get(
        "/api/courseware/usage-detail",
        params={"filename": "704_EX2_e", "time_range": "all-time", **params},
        cookies=AUTH_COOKIE,
    )


def test_each_line_carries_the_lesson_status(client: TestClient):
    body = _get(client).json()
    assert {r["exercise_id"]: r["session_status"] for r in body} == {
        1: "Attended",
        2: "Rescheduled - Make-up Booked",
        3: "Attended (Make-up)",
        4: "Attended",
    }


def test_lines_come_newest_first(client: TestClient):
    body = _get(client).json()
    assert [r["exercise_id"] for r in body] == [1, 3, 2, 4]


def test_school_keeps_only_that_school(client: TestClient):
    body = _get(client, school="SPCC").json()
    assert [r["exercise_id"] for r in body] == [1, 2]


def test_exclude_school_keeps_everyone_else(client: TestClient):
    # The student with no school on record counts as another school, so the
    # two halves together add up to every lesson.
    body = _get(client, exclude_school="SPCC").json()
    assert [r["exercise_id"] for r in body] == [3, 4]
