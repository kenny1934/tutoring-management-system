"""
Tests for the line under the dashboard greeting.

The line counts classes, not students: one class is one tutor's time slot on
one day, however many students sit in it. A tutor teaching six students at
18:25 has taught one class, and their milestones have to say so. The school
year starts on the regular intake's first lesson day, and summer lessons are
a different course, so neither the summer before nor a summer make-up that
lands in September counts towards it.
"""
import inspect
import itertools
from datetime import date, datetime, timedelta

import pytest

from models import Enrollment, Holiday, RegularCourseConfig, SessionLog, Student, Tutor
from routers import stats
from services.greeting_line import gather, greeting_line, number_fact, properties, school_year_start
from tests.helpers import make_auth_token

# A Thursday, so the test line is allowed to speak.
TODAY = date(2026, 10, 15)
YEAR_START = date(2026, 9, 1)

_numbers = itertools.count(1)


@pytest.fixture
def tutor(db_session):
    t = Tutor(user_email="greet@test.com", tutor_name="Mr Greet", role="Tutor",
              default_location="MSA", is_active_tutor=True)
    db_session.add(t)
    db_session.add(RegularCourseConfig(
        year=2026, title="Regular 2026", application_open_date=datetime(2026, 6, 1),
        application_close_date=datetime(2026, 8, 31), course_start_date=YEAR_START,
        locations=[], available_grades=[], time_slots=[],
    ))
    db_session.commit()
    return t


def _student(db, **kw):
    n = next(_numbers)
    s = Student(school_student_id=f"GRT{n:03d}", student_name=kw.pop("name", f"Student {n}"),
                grade=kw.pop("grade", "F2"), school=kw.pop("school", "SRL-E"), home_location="MSA")
    db.add(s)
    db.commit()
    return s


def _enrol(db, student, tutor, first, enrollment_type="Regular"):
    e = Enrollment(student_id=student.id, tutor_id=tutor.id, assigned_day="Thursday",
                   assigned_time="18:25 - 19:55", location="MSA", lessons_paid=8,
                   first_lesson_date=first, payment_status="Paid", enrollment_type=enrollment_type)
    db.add(e)
    db.commit()
    return e


def _lesson(db, enrolment, day, slot="18:25 - 19:55", status="Attended"):
    db.add(SessionLog(enrollment_id=enrolment.id, student_id=enrolment.student_id,
                      tutor_id=enrolment.tutor_id, session_date=day, time_slot=slot,
                      location="MSA", session_status=status))
    db.commit()


def _classes_before_today(db, tutor, n, students=1):
    """n earlier classes this school year, each with the given number of students."""
    enrolments = [_enrol(db, _student(db), tutor, YEAR_START) for _ in range(students)]
    for i in range(n):
        day = YEAR_START + timedelta(days=i // 3)
        slot = ["10:00 - 11:30", "14:30 - 16:00", "16:45 - 18:15"][i % 3]
        for e in enrolments:
            _lesson(db, e, day, slot)
    return enrolments


# ---------------------------------------------------------------------------
# Number facts
# ---------------------------------------------------------------------------

class TestNumberFacts:
    def test_two_properties_join_into_one_sentence(self):
        assert number_fact(64) == (9, "64 is 4 cubed and 8 squared.")

    def test_a_fibonacci_prime(self):
        assert number_fact(89)[1] == "89 is a Fibonacci number and a prime."

    def test_a_palindromic_prime_reads_as_one_sentence(self):
        assert number_fact(101)[1] == "101 is a palindrome and a prime."

    def test_a_triangular_number_explains_itself(self):
        assert number_fact(91)[1] == "91 is a triangular number, so 91 dots make a triangle 13 rows deep."

    def test_a_plain_prime_is_the_lightest_fact(self):
        # About one class count in six is prime, so a prime alone has to lose
        # to almost anything else that could be said.
        assert properties(293) == [(1, "a prime")]

    def test_dull_numbers_have_nothing_to_say(self):
        assert number_fact(74) is None
        assert number_fact(1) is None


# ---------------------------------------------------------------------------
# What the tutor's data says
# ---------------------------------------------------------------------------

class TestClasses:
    def test_the_school_year_starts_on_the_intake_first_lesson_day(self, db_session, tutor):
        assert school_year_start(db_session, TODAY) == YEAR_START

    def test_a_class_with_many_students_counts_once(self, db_session, tutor):
        # 99 earlier classes with three students each are 99 classes, so the
        # one today is the 100th, not the 298th.
        enrolments = _classes_before_today(db_session, tutor, 99, students=3)
        for e in enrolments:
            _lesson(db_session, e, TODAY, "18:25 - 19:55", "Scheduled")
        assert greeting_line(db_session, tutor.id, TODAY) == "Your 18:25 class is your 100th this school year."

    def test_last_years_classes_and_summer_lessons_do_not_count(self, db_session, tutor):
        enrolments = _classes_before_today(db_session, tutor, 99)
        _lesson(db_session, enrolments[0], YEAR_START - timedelta(days=30), "10:00 - 11:30")
        summer = _enrol(db_session, _student(db_session), tutor, date(2026, 7, 1), "Summer")
        _lesson(db_session, summer, YEAR_START + timedelta(days=5), "11:45 - 13:15", "Attended (Make-up)")
        _lesson(db_session, enrolments[0], TODAY, "18:25 - 19:55", "Scheduled")
        assert greeting_line(db_session, tutor.id, TODAY) == "Your 18:25 class is your 100th this school year."

    def test_a_rescheduled_lesson_is_not_a_class(self, db_session, tutor):
        enrolments = _classes_before_today(db_session, tutor, 99)
        _lesson(db_session, enrolments[0], YEAR_START + timedelta(days=40), "19:00 - 20:30",
                "Rescheduled - Make-up Booked")
        _lesson(db_session, enrolments[0], TODAY, "18:25 - 19:55", "Scheduled")
        assert greeting_line(db_session, tutor.id, TODAY) == "Your 18:25 class is your 100th this school year."


class TestPeople:
    def test_a_first_lesson_beats_a_class_count(self, db_session, tutor):
        _classes_before_today(db_session, tutor, 63)
        new = _enrol(db_session, _student(db_session, name="Mars Ieong"), tutor, TODAY)
        _lesson(db_session, new, TODAY, "16:45 - 18:15", "Scheduled")
        assert greeting_line(db_session, tutor.id, TODAY) == "Mars Ieong has a first lesson with you today at 16:45."

    def test_an_anniversary_for_a_student_who_still_comes(self, db_session, tutor):
        e = _enrol(db_session, _student(db_session, name="Albee Kuong"), tutor, date(2025, 10, 15))
        _lesson(db_session, e, TODAY - timedelta(days=7), "10:00 - 11:30")
        assert greeting_line(db_session, tutor.id, TODAY) == "Albee Kuong started with you one year ago today."

    def test_no_anniversary_for_a_student_who_has_left(self, db_session, tutor):
        e = _enrol(db_session, _student(db_session, name="Gone Student"), tutor, date(2025, 10, 15))
        _lesson(db_session, e, TODAY - timedelta(days=90), "10:00 - 11:30")
        assert all("Gone Student" not in line for _, line in gather(db_session, tutor.id, TODAY))


class TestHolidays:
    def test_a_holiday_is_said_once_when_it_comes_into_view(self, db_session, tutor):
        db_session.add(Holiday(holiday_date=date(2026, 10, 18), holiday_name="Chong Yeung Festival"))
        db_session.commit()
        monday, tuesday = date(2026, 10, 12), date(2026, 10, 13)
        assert greeting_line(db_session, tutor.id, monday) == (
            "Chong Yeung Festival is this Sunday, so there are no lessons that day.")
        assert greeting_line(db_session, tutor.id, tuesday) is None

    def test_a_run_of_holidays_names_its_last_day(self, db_session, tutor):
        for d in range(20, 24):
            db_session.add(Holiday(holiday_date=date(2026, 10, d), holiday_name="Company Trip"))
        db_session.commit()
        assert greeting_line(db_session, tutor.id, date(2026, 10, 19)) == (
            "Company Trip starts this Tuesday, so there are no lessons from then until Friday.")


class TestEndpoint:
    def test_is_a_plain_function(self):
        # It makes blocking database calls, so it must run in FastAPI's thread
        # pool and not on the event loop (see test_bell_counts).
        assert not inspect.iscoroutinefunction(stats.get_greeting_line)

    def test_defaults_to_the_signed_in_tutor(self, client, db_session, tutor):
        resp = client.get("/api/greeting-line", cookies={"access_token": make_auth_token(tutor.id)})
        assert resp.status_code == 200, resp.text
        assert set(resp.json()) == {"line"}
