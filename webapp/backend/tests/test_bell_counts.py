"""
Tests for the notification bell's count endpoints.

Every open tab polls these every 30 to 60 seconds, so two things matter
beyond the numbers they return.

First, each one has to be a plain function. FastAPI runs plain functions in
its thread pool, but it runs an async function on the server's single event
loop, and these all make blocking database calls. An async count therefore
holds up every other request while it waits, including Cloud Run's health
check, which restarts the server when it gets no answer.

Second, the aged make-ups count has to cost the same number of queries
however many make-ups are pending. It walks every pending make-up in the
school to find the ones belonging to the tutor who asked, so any query made
per make-up multiplies across the whole school on every poll.
"""
import asyncio
import itertools
from datetime import timedelta

import pytest
from sqlalchemy import event

from constants import SessionStatus, hk_now
from main import app
from models import Enrollment, SessionLog, Student, Tutor
from tests.conftest import test_engine
from tests.helpers import make_auth_token


RESCHEDULED_PENDING = SessionStatus.RESCHEDULED_PENDING.value
SICK_LEAVE_PENDING = SessionStatus.SICK_LEAVE_PENDING.value
# Any status outside the pending set will do for a lesson that has already
# been made up; the count only follows its date.
MADE_UP = "Rescheduled - Make-up Booked"

_student_numbers = itertools.count(1)


def _today():
    return hk_now().date()


def _days_ago(n):
    return _today() - timedelta(days=n)


@pytest.fixture
def tutors(db_session):
    a = Tutor(user_email="a@test.com", tutor_name="Tutor A", role="Tutor",
              default_location="MSA", is_active_tutor=True)
    b = Tutor(user_email="b@test.com", tutor_name="Tutor B", role="Tutor",
              default_location="MSA", is_active_tutor=True)
    db_session.add_all([a, b])
    db_session.commit()
    return a, b


def _student(db):
    n = next(_student_numbers)
    s = Student(school_student_id=f"BELL{n:03d}", student_name=f"Student {n}",
                grade="F2", home_location="MSA")
    db.add(s)
    db.commit()
    return s


def _enrol(db, student, tutor, first_lesson_date, *, enrollment_type="Regular",
           payment_status="Paid"):
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        assigned_day="Tuesday",
        assigned_time="10:00 - 11:30",
        location="MSA",
        lessons_paid=8,
        payment_date=first_lesson_date,
        first_lesson_date=first_lesson_date,
        payment_status=payment_status,
        enrollment_type=enrollment_type,
    )
    db.add(e)
    db.commit()
    return e


def _lesson(db, enrollment, days_ago, *, status=RESCHEDULED_PENDING, make_up_for=None):
    s = SessionLog(
        enrollment_id=enrollment.id,
        student_id=enrollment.student_id,
        tutor_id=enrollment.tutor_id,
        session_date=_days_ago(days_ago),
        time_slot="10:00 - 11:30",
        location="MSA",
        session_status=status,
        make_up_for_id=make_up_for.id if make_up_for else None,
    )
    db.add(s)
    db.commit()
    return s


def _aged(client, tutor):
    resp = client.get(
        "/api/sessions/aged-pending-makeups/count",
        params={"tutor_id": tutor.id},
        cookies={"access_token": make_auth_token(tutor.id)},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_counts_pending_make_ups_past_the_threshold(client, db_session, tutors):
    a, b = tutors
    enrolment = _enrol(db_session, _student(db_session), a, _days_ago(200))
    _lesson(db_session, enrolment, 10)                             # too recent
    _lesson(db_session, enrolment, 35)                             # aged
    _lesson(db_session, enrolment, 50, status=SICK_LEAVE_PENDING)  # aged and critical
    _lesson(db_session, enrolment, 50, status="Attended")          # not pending

    assert _aged(client, a) == {"count": 2, "critical": 1}
    assert _aged(client, b) == {"count": 0, "critical": 0}


def test_the_latest_active_regular_enrollment_decides_the_tutor(client, db_session, tutors):
    a, b = tutors

    # This student moved from A to B, so the old make-up is now B's to chase.
    moved = _student(db_session)
    old = _enrol(db_session, moved, a, _days_ago(300))
    _enrol(db_session, moved, b, _days_ago(100))
    _lesson(db_session, old, 40)

    # A newer enrolment that was cancelled leaves the student with A.
    cancelled = _student(db_session)
    kept = _enrol(db_session, cancelled, a, _days_ago(300))
    _enrol(db_session, cancelled, b, _days_ago(100), payment_status="Cancelled")
    _lesson(db_session, kept, 40)

    # So does a newer summer enrolment.
    summer = _student(db_session)
    kept_over_summer = _enrol(db_session, summer, a, _days_ago(300))
    _enrol(db_session, summer, b, _days_ago(100), enrollment_type="Summer")
    _lesson(db_session, kept_over_summer, 40)

    # A student with no Regular enrolment at all belongs to nobody.
    trial_only = _student(db_session)
    _lesson(db_session, _enrol(db_session, trial_only, a, _days_ago(60), enrollment_type="Trial"), 40)

    assert _aged(client, a) == {"count": 2, "critical": 0}
    assert _aged(client, b) == {"count": 1, "critical": 0}


def test_a_rescheduled_make_up_is_aged_from_the_lesson_first_missed(client, db_session, tutors):
    a, _ = tutors
    enrolment = _enrol(db_session, _student(db_session), a, _days_ago(200))
    original = _lesson(db_session, enrolment, 60, status=MADE_UP)
    first_make_up = _lesson(db_session, enrolment, 25, status=MADE_UP, make_up_for=original)
    # Only five days old by its own date, but the lesson behind it was missed 60 days ago.
    _lesson(db_session, enrolment, 5, make_up_for=first_make_up)

    assert _aged(client, a) == {"count": 1, "critical": 1}


def test_aged_count_queries_do_not_grow_with_pending_make_ups(client, db_session, tutors):
    a, _ = tutors

    def add_student_with_one_rescheduled_make_up():
        enrolment = _enrol(db_session, _student(db_session), a, _days_ago(200))
        original = _lesson(db_session, enrolment, 60, status=MADE_UP)
        _lesson(db_session, enrolment, 40, make_up_for=original)

    statements = []

    def record(*_args):
        statements.append(1)

    def statements_for_one_poll():
        statements.clear()
        event.listen(test_engine, "before_cursor_execute", record)
        try:
            _aged(client, a)
        finally:
            event.remove(test_engine, "before_cursor_execute", record)
        return len(statements)

    add_student_with_one_rescheduled_make_up()
    with_one = statements_for_one_poll()
    for _ in range(20):
        add_student_with_one_rescheduled_make_up()
    with_twenty_one = statements_for_one_poll()

    assert _aged(client, a) == {"count": 21, "critical": 21}
    assert with_twenty_one == with_one


BELL_COUNT_PATHS = [
    "/api/sessions/unchecked-attendance/count",
    "/api/sessions/aged-pending-makeups/count",
    "/api/messages/unread-count",
    "/api/makeup-proposals/pending-count",
    "/api/terminations/review-needed-count",
    "/api/extension-requests/pending-count",
    "/api/enrollments/renewal-counts",
    "/api/parent-communications/contact-needed-count",
    "/api/tutor-memos/pending-count",
]


@pytest.mark.parametrize("path", BELL_COUNT_PATHS)
def test_bell_counts_run_in_the_thread_pool(path):
    endpoints = [
        route.endpoint for route in app.routes
        if getattr(route, "path", None) == path and "GET" in getattr(route, "methods", set())
    ]
    assert endpoints, f"no GET route at {path}"
    assert not any(asyncio.iscoroutinefunction(e) for e in endpoints)
