"""The quarterly termination reports, against a database.

`test_terminations.py` covers the date arithmetic that decides a quarter's
window. This file covers what the reports then do with it: who is on the roster
when the quarter opens, who is still there when it closes, and who ran out of
lessons in between. All of that lives in raw SQL, and until the queries stopped
writing `DATE_ADD(:closing_end, INTERVAL 30 DAY)` inline none of it could run on
SQLite, so none of it was tested.

The stand-in for `calculate_effective_end_date` in conftest.py counts weeks
without skipping holidays, so a pack of N lessons starting on day D ends N-1
weeks later. That is enough to put an end date on either side of a cutoff, which
is what every one of these reports actually asks.

Q1 2026 runs 22 Jan to 21 Apr, and its opening week is 22-28 Jan.
"""
from __future__ import annotations

import asyncio
from datetime import date

import pytest

from models import Enrollment, Student, TerminationRecord, Tutor
from routers import terminations as T

YEAR, QUARTER = 2026, 1
OPENING = date(2026, 1, 22)
CLOSING = date(2026, 4, 21)


def _run(coro):
    """A private loop rather than asyncio.run(), which clears the process's
    current loop on the way out and breaks tests elsewhere in the suite."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture
def tutor(db_session):
    t = Tutor(user_email="ho@test.com", tutor_name="Ms Ho", role="Tutor", is_active_tutor=True)
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def admin(db_session):
    t = Tutor(user_email="admin@test.com", tutor_name="Admin", role="Admin", is_active_tutor=True)
    db_session.add(t)
    db_session.commit()
    return t


def _student(db_session, name, location="MSA"):
    s = Student(student_name=name, grade="F1", home_location=location)
    db_session.add(s)
    db_session.commit()
    return s


def _pack(db_session, student, tutor, *, first_lesson, lessons=8, location="MSA"):
    """One paid lesson pack, ending `lessons - 1` weeks after it starts."""
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        location=location,
        enrollment_type="Regular",
        first_lesson_date=first_lesson,
        lessons_paid=lessons,
        payment_status="Paid",
        assigned_day="Wednesday",
        assigned_time="16:45 - 18:15",
    )
    db_session.add(e)
    db_session.commit()
    return e


def _stats(db_session, admin, location=None):
    return _run(T.get_termination_stats(
        request=None, quarter=QUARTER, year=YEAR, location=location, tutor_id=None,
        current_user=admin, db=db_session,
    ))


def _left_this_quarter(db_session, admin, location=None):
    return _run(T.get_terminated_students(
        request=None, quarter=QUARTER, year=YEAR, location=location, tutor_id=None,
        current_user=admin, db=db_session,
    ))


class TestWhoLeft:
    def test_a_pack_running_out_inside_the_quarter_counts_as_leaving(
        self, db_session, tutor, admin
    ):
        s = _student(db_session, "Ran out in March")
        # 8 lessons from 21 Jan ends 11 Mar, inside the window.
        _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21))

        rows = _left_this_quarter(db_session, admin)

        assert [r.student_name for r in rows] == ["Ran out in March"]
        assert rows[0].termination_date == date(2026, 3, 11)
        assert rows[0].schedule == "[16:45 - 18:15], Wednesday"

    def test_a_pack_still_running_at_the_close_does_not(self, db_session, tutor, admin):
        s = _student(db_session, "Still going")
        # 20 lessons from 21 Jan reaches into June.
        _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=20)

        assert _left_this_quarter(db_session, admin) == []

    def test_only_the_last_pack_is_judged(self, db_session, tutor, admin):
        """A student who renewed in March did not leave in February, however
        the February pack ended."""
        s = _student(db_session, "Renewed")
        _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=4)
        _pack(db_session, s, tutor, first_lesson=date(2026, 3, 4), lessons=20)

        assert _left_this_quarter(db_session, admin) == []

    def test_coming_back_later_does_not_rewrite_the_quarter_they_left_in(
        self, db_session, tutor, admin
    ):
        """The quarter's history has to stay put. A student who left in March
        and came back in July is still someone who left in March, which is why
        the ranking ignores packs starting more than a month after the close."""
        s = _student(db_session, "Came back")
        _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=8)
        _pack(db_session, s, tutor, first_lesson=date(2026, 7, 1), lessons=8)

        rows = _left_this_quarter(db_session, admin)

        assert [r.student_name for r in rows] == ["Came back"]

    def test_a_branch_filter_only_shows_that_branch(self, db_session, tutor, admin):
        msa = _student(db_session, "At MSA", location="MSA")
        msb = _student(db_session, "At MSB", location="MSB")
        _pack(db_session, msa, tutor, first_lesson=date(2026, 1, 21))
        _pack(db_session, msb, tutor, first_lesson=date(2026, 1, 21), location="MSB")

        rows = _left_this_quarter(db_session, admin, location="MSB")

        assert [r.student_name for r in rows] == ["At MSB"]


class TestOpeningAndClosing:
    def test_a_student_here_all_quarter_counts_at_both_ends(self, db_session, tutor, admin):
        s = _student(db_session, "Here throughout")
        _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=20)

        stats = _stats(db_session, admin)

        assert stats.location_stats.opening == 1
        assert stats.location_stats.closing == 1
        assert stats.location_stats.terminated == 0

    def test_a_student_who_ran_out_mid_quarter_counts_only_at_the_opening(
        self, db_session, tutor, admin
    ):
        s = _student(db_session, "Left in March")
        _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=8)

        stats = _stats(db_session, admin)

        assert stats.location_stats.opening == 1
        assert stats.location_stats.closing == 0

    def test_a_renewal_starting_a_fortnight_late_still_opens_the_quarter(
        self, db_session, tutor, admin
    ):
        """Holidays delay renewals, so a pack beginning shortly after the
        opening week is the same student carrying on, not a new arrival."""
        s = _student(db_session, "Renewed late")
        # Ends 14 Jan, just before the quarter opens...
        _pack(db_session, s, tutor, first_lesson=date(2025, 11, 26), lessons=8)
        # ...and the next pack starts 4 Feb, a week after the opening week.
        _pack(db_session, s, tutor, first_lesson=date(2026, 2, 4), lessons=20)

        stats = _stats(db_session, admin)

        assert stats.location_stats.opening == 1
        assert stats.location_stats.closing == 1

    def test_somebody_who_arrives_mid_quarter_is_not_on_the_opening_roster(
        self, db_session, tutor, admin
    ):
        s = _student(db_session, "Joined in March")
        _pack(db_session, s, tutor, first_lesson=date(2026, 3, 11), lessons=20)

        stats = _stats(db_session, admin)

        assert stats.location_stats.opening == 0
        assert stats.location_stats.closing == 1

    def test_the_rate_counts_only_students_marked_as_real_churn(
        self, db_session, tutor, admin
    ):
        """`terminated` is the reviewed number, not the list: a student whose
        record says the leaving was a transfer stays out of it."""
        left = _student(db_session, "Really left")
        moved = _student(db_session, "Moved branch")
        for s in (left, moved):
            _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=8)
        db_session.add_all([
            TerminationRecord(student_id=left.id, year=YEAR, quarter=QUARTER,
                              count_as_terminated=True, reason_category="Lost interest"),
            TerminationRecord(student_id=moved.id, year=YEAR, quarter=QUARTER,
                              count_as_terminated=False, reason_category="Transferred"),
        ])
        db_session.commit()

        stats = _stats(db_session, admin)

        assert len(_left_this_quarter(db_session, admin)) == 2
        assert stats.location_stats.terminated == 1
        assert stats.location_stats.opening == 2
        assert stats.location_stats.term_rate == 50.0


class TestDrillDown:
    def test_each_stat_lists_the_students_it_counted(self, db_session, tutor, admin):
        staying = _student(db_session, "Staying")
        leaving = _student(db_session, "Leaving")
        _pack(db_session, staying, tutor, first_lesson=date(2026, 1, 21), lessons=20)
        _pack(db_session, leaving, tutor, first_lesson=date(2026, 1, 21), lessons=8)
        db_session.add(TerminationRecord(
            student_id=leaving.id, year=YEAR, quarter=QUARTER,
            count_as_terminated=True, reason_category="Lost interest",
        ))
        db_session.commit()

        def names(stat_type):
            rows = _run(T.get_stat_details(
                request=None, stat_type=stat_type, quarter=QUARTER, year=YEAR,
                location=None, tutor_id=None, current_user=admin, db=db_session,
            ))
            return sorted(r.student_name for r in rows)

        stats = _stats(db_session, admin)

        assert names("opening") == ["Leaving", "Staying"]
        assert names("closing") == ["Staying"]
        assert names("terminated") == ["Leaving"]
        # The drill-down and the number above it have to agree.
        assert len(names("opening")) == stats.location_stats.opening
        assert len(names("closing")) == stats.location_stats.closing
        assert len(names("terminated")) == stats.location_stats.terminated

    def test_an_unknown_stat_type_is_rejected(self, db_session, admin):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            _run(T.get_stat_details(
                request=None, stat_type="something else", quarter=QUARTER, year=YEAR,
                location=None, tutor_id=None, current_user=admin, db=db_session,
            ))
        assert exc.value.status_code == 400


class TestAvailableQuarters:
    def test_a_quarter_appears_once_a_pack_has_ended_in_it(self, db_session, tutor, admin):
        """The dropdown is built from the distinct end dates. Two students on
        the same pack share one, which is why the query asks about distinct
        packs rather than distinct enrollments."""
        one = _student(db_session, "One")
        two = _student(db_session, "Two")
        for s in (one, two):
            _pack(db_session, s, tutor, first_lesson=date(2026, 1, 21), lessons=8)

        quarters = _run(T.get_available_quarters(
            request=None, location=None, current_user=admin, db=db_session,
        ))

        assert (QUARTER, YEAR) in [(q.quarter, q.year) for q in quarters]

    def test_the_current_quarter_is_not_offered_for_review(self, db_session, tutor, admin):
        """A quarter still running has incomplete figures, so it is left off."""
        from constants import hk_now
        from quarters import get_quarter_for_date

        current = get_quarter_for_date(hk_now().date())
        s = _student(db_session, "Ending today")
        _pack(db_session, s, tutor, first_lesson=hk_now().date(), lessons=1)

        quarters = _run(T.get_available_quarters(
            request=None, location=None, current_user=admin, db=db_session,
        ))

        assert current not in [(q.quarter, q.year) for q in quarters]
