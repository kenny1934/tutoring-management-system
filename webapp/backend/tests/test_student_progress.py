"""
Tests for student progress endpoint.

Covers:
- GET /api/students/{id}/progress returns correct schema shape
- Date range filtering
- AI insights gating (generate_insights param)
- exclude_from_ai parameter
- 404 for nonexistent student
- Auth required

Note: The progress endpoint uses MySQL's date_format() which doesn't exist
in SQLite. We register a custom SQLite function to emulate it.
"""
import pytest
import sqlite3
from datetime import date, timedelta
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Tutor, Student, Enrollment, SessionLog, SessionExercise, ParentCommunication
from tests.helpers import make_auth_token


def _sqlite_date_format(dt_str, fmt):
    """Emulate MySQL date_format() for SQLite tests."""
    if dt_str is None:
        return None
    from datetime import datetime as _dt
    try:
        d = _dt.fromisoformat(str(dt_str))
    except (ValueError, TypeError):
        return None
    py_fmt = fmt.replace("%Y", "%Y").replace("%m", "%m").replace("%d", "%d")
    return d.strftime(py_fmt)


@pytest.fixture(autouse=True)
def _register_sqlite_date_format(db_session):
    """Register MySQL date_format() emulation on the SQLite connection."""
    raw_conn = db_session.get_bind().raw_connection()
    raw_conn.create_function("date_format", 2, _sqlite_date_format)




def _seed_basics(db_session) -> tuple:
    """Seed a tutor and student, return (tutor, student)."""
    tutor = Tutor(
        id=1, user_email="t@t.com", tutor_name="Mr T",
        role="Tutor", default_location="MSA",
    )
    student = Student(
        id=1, student_name="Alice", grade="F4",
        school="Test School", home_location="MSA",
        school_student_id="1001",
    )
    db_session.add_all([tutor, student])
    db_session.commit()
    return tutor, student


class TestStudentProgressEndpoint:
    """GET /api/students/{id}/progress"""

    def test_returns_correct_schema(self, client, db_session):
        """Response should have all expected top-level keys."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get(
            "/api/students/1/progress",
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()

        expected_keys = {
            "student_id", "attendance", "ratings", "exercises",
            "enrollment_timeline", "contacts", "monthly_activity",
            "test_events", "insights",
        }
        assert set(data.keys()) == expected_keys
        assert data["student_id"] == 1

    def test_attendance_shape(self, client, db_session):
        """Attendance summary should have expected fields."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        att = resp.json()["attendance"]

        assert "attended" in att
        assert "no_show" in att
        assert "rescheduled" in att
        assert "total_past_sessions" in att
        assert "attendance_rate" in att

    def test_ratings_shape(self, client, db_session):
        """Ratings summary should have expected fields."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        ratings = resp.json()["ratings"]

        assert "overall_avg" in ratings
        assert "total_rated" in ratings
        assert "monthly_trend" in ratings
        assert isinstance(ratings["monthly_trend"], list)

    def test_exercises_shape(self, client, db_session):
        """Exercises summary should have expected fields."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        exercises = resp.json()["exercises"]

        assert "total" in exercises
        assert "classwork" in exercises
        assert "homework" in exercises
        assert "details" in exercises

    def test_404_for_nonexistent_student(self, client, db_session):
        """Should return 404 if student_id doesn't exist."""
        tutor = Tutor(
            id=1, user_email="t@t.com", tutor_name="T",
            role="Tutor", default_location="MSA",
        )
        db_session.add(tutor)
        db_session.commit()

        token = make_auth_token(1)
        resp = client.get("/api/students/999/progress", cookies={"access_token": token})
        assert resp.status_code == 404

    def test_requires_auth(self, client, db_session):
        """Should return 401 without auth cookie."""
        resp = client.get("/api/students/1/progress")
        assert resp.status_code == 401

    def test_empty_data_returns_zeros(self, client, db_session):
        """Student with no sessions should return zero-valued summaries."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        data = resp.json()

        assert data["attendance"]["attended"] == 0
        assert data["attendance"]["total_past_sessions"] == 0
        assert data["ratings"]["total_rated"] == 0
        assert data["exercises"]["total"] == 0
        assert data["contacts"]["total_contacts"] == 0


class TestProgressWithData:
    """Test progress endpoint with seeded session data."""

    def _seed_sessions(self, db_session):
        """Seed tutor, student, enrollment, sessions, and exercises."""
        tutor, student = _seed_basics(db_session)

        enrollment = Enrollment(
            id=1, student_id=1, tutor_id=1,
            assigned_day="Monday", assigned_time="15:00-16:00",
            location="MSA", lessons_paid=10,
            payment_date=date.today() - timedelta(days=60),
            first_lesson_date=date.today() - timedelta(days=60),
            payment_status="Paid", enrollment_type="Regular",
        )
        db_session.add(enrollment)

        # Add sessions: 3 attended, 1 no-show
        sessions = []
        for i, (status, rating) in enumerate([
            ("Attended", "⭐⭐⭐⭐"),
            ("Attended", "⭐⭐⭐"),
            ("Attended", None),
            ("No Show", None),
        ]):
            s = SessionLog(
                id=i + 1, enrollment_id=1, student_id=1, tutor_id=1,
                session_date=date.today() - timedelta(days=30 - i * 7),
                time_slot="15:00-16:00", location="MSA",
                session_status=status, financial_status="Paid",
                performance_rating=rating,
            )
            sessions.append(s)
        db_session.add_all(sessions)

        # Add exercises to the first two sessions (CW=Classwork, HW=Homework)
        exercises = [
            SessionExercise(session_id=1, exercise_type="CW", pdf_name="algebra.pdf", page_start=1, page_end=5, created_by="tutor@test.com"),
            SessionExercise(session_id=1, exercise_type="HW", pdf_name="hw1.pdf", page_start=1, page_end=3, created_by="tutor@test.com"),
            SessionExercise(session_id=2, exercise_type="CW", pdf_name="geometry.pdf", page_start=10, page_end=15, created_by="tutor@test.com"),
        ]
        db_session.add_all(exercises)

        # Add a parent contact
        contact = ParentCommunication(
            student_id=1, tutor_id=1,
            contact_date=date.today() - timedelta(days=10),
            contact_method="WhatsApp", contact_type="Progress Update",
            brief_notes="Discussed performance",
        )
        db_session.add(contact)
        db_session.commit()

    def test_attendance_counts(self, client, db_session):
        """Should correctly count attended, no-show sessions."""
        self._seed_sessions(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        att = resp.json()["attendance"]

        assert att["attended"] == 3
        assert att["no_show"] == 1
        assert att["total_past_sessions"] == 4
        assert att["attendance_rate"] == 75.0  # 3 / (3+1) * 100

    def test_rating_calculations(self, client, db_session):
        """Should compute average from star ratings."""
        self._seed_sessions(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        ratings = resp.json()["ratings"]

        assert ratings["total_rated"] == 2
        assert ratings["overall_avg"] == 3.5  # (4+3)/2

    def test_exercise_counts(self, client, db_session):
        """Should count classwork and homework correctly."""
        self._seed_sessions(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        exercises = resp.json()["exercises"]

        assert exercises["total"] == 3
        assert exercises["classwork"] == 2
        assert exercises["homework"] == 1

    def test_contact_summary(self, client, db_session):
        """Should report parent contacts."""
        self._seed_sessions(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        contacts = resp.json()["contacts"]

        assert contacts["total_contacts"] == 1
        assert contacts["by_method"]["WhatsApp"] == 1

    def test_enrollment_timeline(self, client, db_session):
        """Should include enrollment history."""
        self._seed_sessions(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        timeline = resp.json()["enrollment_timeline"]

        assert len(timeline) == 1
        assert timeline[0]["tutor_name"] == "Mr T"
        assert timeline[0]["enrollment_type"] == "Regular"


class TestProgressDateRange:
    """Test date range filtering."""

    def _seed_sessions_across_months(self, db_session):
        """Seed sessions spanning several months."""
        _seed_basics(db_session)

        enrollment = Enrollment(
            id=1, student_id=1, tutor_id=1,
            assigned_day="Monday", assigned_time="15:00-16:00",
            location="MSA", lessons_paid=20,
            payment_date=date(2025, 1, 1),
            first_lesson_date=date(2025, 1, 6),
            payment_status="Paid", enrollment_type="Regular",
        )
        db_session.add(enrollment)

        # Sessions in Jan, Feb, Mar 2025
        for month in [1, 2, 3]:
            s = SessionLog(
                enrollment_id=1, student_id=1, tutor_id=1,
                session_date=date(2025, month, 15),
                time_slot="15:00-16:00", location="MSA",
                session_status="Attended", financial_status="Paid",
            )
            db_session.add(s)
        db_session.commit()

    def test_date_range_filters_sessions(self, client, db_session):
        """Only sessions within date range should be counted."""
        self._seed_sessions_across_months(db_session)
        token = make_auth_token(1)

        resp = client.get(
            "/api/students/1/progress?start_date=2025-02-01&end_date=2025-02-28",
            cookies={"access_token": token},
        )
        att = resp.json()["attendance"]
        assert att["attended"] == 1

    def test_no_date_range_includes_all(self, client, db_session):
        """Without date range, all sessions should be included."""
        self._seed_sessions_across_months(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        att = resp.json()["attendance"]
        assert att["attended"] == 3


class TestProgressInsightsGating:
    """Test that AI insights are only generated when requested."""

    def test_no_insights_by_default(self, client, db_session):
        """insights should be null when generate_insights is not set."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get("/api/students/1/progress", cookies={"access_token": token})
        assert resp.json()["insights"] is None

    def test_no_insights_when_false(self, client, db_session):
        """insights should be null when generate_insights=false."""
        _seed_basics(db_session)
        token = make_auth_token(1)

        resp = client.get(
            "/api/students/1/progress?generate_insights=false",
            cookies={"access_token": token},
        )
        assert resp.json()["insights"] is None
