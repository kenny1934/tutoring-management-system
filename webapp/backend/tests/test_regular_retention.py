"""Retention report: did last year's students apply for this year's course?

The conversion report's mirror image. Conversion counts new blood arriving
(P6 prospects -> F1); this counts the students already here staying, so the
tests concentrate on the three things that decide who lands in the cohort and
what state they get: the year-end activity cutoff, the Sept 1 grade shift, and
the way a termination means three different things depending on when it was
filed.
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException

from models import (
    Enrollment,
    ParentCommunication,
    PrimaryProspect,
    RegularApplication,
    RegularCourseConfig,
    RegularCourseSlot,
    RegularTutorDuty,
    Student,
    SummerApplication,
    SummerCourseConfig,
    TerminationRecord,
    Tutor,
)
from routers.regular_course import (
    _RETENTION_CACHE,
    _build_retention,
    _cached_retention,
    _retention_trend,
    get_my_class,
    get_my_retention,
    get_retention,
)
from routers.terminations import delete_termination_record

# The intake under test: applications open 4 Aug 2026, course starts 1 Sep.
# That puts the cohort cutoff at 1 May 2026 and the decline quarter at Q3 2026.
YEAR = 2026
ACTIVE_FROM = date(2026, 5, 1)
INTAKE_QUARTER = (2026, 3)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _empty_retention_cache():
    """Start every test with a cold cache.

    The report is held for two minutes against a fingerprint of the data behind
    it, and two tests building different worlds in the same second with the same
    row counts fingerprint alike. That cannot happen to one real database moving
    forwards in time, but it happens constantly to a suite starting over.
    """
    _RETENTION_CACHE.clear()
    yield
    _RETENTION_CACHE.clear()


@pytest.fixture
def tutor(db_session):
    t = Tutor(user_email="t@test.com", tutor_name="Ms Ho", role="Tutor", is_active_tutor=True)
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def reg_cfg(db_session):
    cfg = RegularCourseConfig(
        year=YEAR,
        title="Regular Sep 2026",
        application_open_date=datetime(2026, 8, 4, 10, 0),
        application_close_date=datetime(2026, 9, 30),
        course_start_date=date(2026, 9, 1),
        locations=[{"name": "華士古分校", "open_days": ["Tuesday"]}],
        # Mirrors the live config: F1-F3 open to parents, F4/F5 admin-only,
        # nothing at all for F6.
        available_grades=[
            {"value": "F1"}, {"value": "F2"}, {"value": "F3"},
            {"value": "F4", "admin_only": True},
            {"value": "F5", "admin_only": True},
        ],
        time_slots=["16:45 - 18:15"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


@pytest.fixture
def sum_cfg(db_session):
    cfg = SummerCourseConfig(
        year=YEAR,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 6, 30),
        course_start_date=date(2026, 7, 5),
        course_end_date=date(2026, 8, 29),
        total_lessons=8,
        pricing_config={"base": 400},
        locations=[{"name": "MSA"}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


_SEQ = iter(range(1, 9999))


def _student(db_session, name="Chan Tai Man", grade="F1", promoted=2025, code=None):
    s = Student(
        student_name=name,
        grade=grade,
        home_location="MSA",
        school_student_id=code,
        last_promoted_year=promoted,
    )
    db_session.add(s)
    db_session.commit()
    return s


def _regular_enrollment(db_session, student, tutor, *, first_lesson, lessons=8, location="MSA",
                        payment_status="Paid"):
    """A regular lesson pack. With no holidays seeded, it ends
    `lessons - 1` weeks after the first lesson."""
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        location=location,
        enrollment_type="Regular",
        first_lesson_date=first_lesson,
        lessons_paid=lessons,
        payment_status=payment_status,
        assigned_day="Tuesday",
        assigned_time="16:45 - 18:15",
    )
    db_session.add(e)
    db_session.commit()
    return e


def _summer_enrollment(db_session, student, tutor, sum_cfg, *, status="Enrolled", location="MSA"):
    app = SummerApplication(
        config_id=sum_cfg.id,
        reference_code=f"SC2026-R{next(_SEQ)}",
        student_name=student.student_name,
        grade=student.grade,
        contact_phone="85212340000",
        preferred_location="MSA",
        application_status=status,
        sessions_per_week=1,
        existing_student_id=student.id,
    )
    db_session.add(app)
    db_session.commit()
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        location=location,
        enrollment_type="Summer",
        first_lesson_date=date(2026, 7, 5),
        lessons_paid=8,
        payment_status="Paid",
        summer_application_id=app.id,
    )
    db_session.add(e)
    db_session.commit()
    return app, e


def _application(db_session, reg_cfg, student=None, *, grade="F2", status="Submitted",
                 name="Chan Tai Man", slot=None):
    a = RegularApplication(
        config_id=reg_cfg.id,
        reference_code=f"RC2026-R{next(_SEQ)}",
        student_name=name,
        grade=grade,
        contact_phone="85212340000",
        preferred_location="華士古分校",
        application_status=status,
        existing_student_id=student.id if student else None,
        is_existing_student="MathConcept Secondary Academy",
        assigned_slot_id=slot.id if slot else None,
    )
    db_session.add(a)
    db_session.commit()
    return a


def _slot(db_session, reg_cfg, tutor, *, day="Tuesday", time="16:45 - 18:15",
          location="華士古分校", grade="F2"):
    """One weekly slot in the September timetable. `tutor` may be None, which
    is the state most slots are in until the office decides who teaches."""
    s = RegularCourseSlot(
        config_id=reg_cfg.id,
        slot_day=day,
        time_slot=time,
        location=location,
        grade=grade,
        tutor_id=tutor.id if tutor else None,
        max_students=8,
    )
    db_session.add(s)
    db_session.commit()
    return s


def _termination(db_session, student, *, year, quarter, counted=True, reason=None, category=None):
    t = TerminationRecord(
        student_id=student.id,
        year=year,
        quarter=quarter,
        count_as_terminated=counted,
        reason=reason,
        reason_category=category,
    )
    db_session.add(t)
    db_session.commit()
    return t


def _row(result, student_id):
    return next((r for r in result.chase if r.student_id == student_id), None)


# ---------------------------------------------------------------------------
# Cohort membership
# ---------------------------------------------------------------------------

class TestCohort:
    def test_student_running_to_year_end_is_in_cohort(self, db_session, reg_cfg, tutor):
        """Lessons reaching past 1 May: present at year end."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7), lessons=8)

        result = _build_retention(db_session, reg_cfg)

        assert result.active_from == ACTIVE_FROM
        assert result.totals.cohort == 1
        assert _row(result, s.id).source == "regular_only"

    def test_student_who_lapsed_before_the_cutoff_is_out(self, db_session, reg_cfg, tutor):
        """A pack finishing in February says nothing about the year end."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 1, 6), lessons=4)

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 0

    def test_the_cutoff_is_inclusive_to_the_day(self, db_session, reg_cfg, tutor):
        """The cohort query reaches the same rows through the cheap weekly span
        as it did by walking every enrollment, so the boundary is worth pinning:
        a pack whose last lesson lands exactly on 1 May is in, and the same pack
        a week earlier is out."""
        on_the_day = _student(db_session, name="Last lesson 1 May")
        a_week_short = _student(db_session, name="Last lesson 24 Apr")
        # 8 lessons from 13 March: 13 Mar + 7 weeks = 1 May.
        _regular_enrollment(db_session, on_the_day, tutor, first_lesson=date(2026, 3, 13))
        _regular_enrollment(db_session, a_week_short, tutor, first_lesson=date(2026, 3, 6))

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 1
        assert _row(result, on_the_day.id) is not None

    def test_an_extension_can_carry_a_pack_over_the_cutoff(self, db_session, reg_cfg, tutor):
        """Extension weeks buy extra lesson dates, so they move the end date and
        must move cohort membership with it."""
        s = _student(db_session)
        e = _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 3, 6))
        assert _build_retention(db_session, reg_cfg).totals.cohort == 0

        e.deadline_extension_weeks = 2
        db_session.commit()

        assert _build_retention(db_session, reg_cfg).totals.cohort == 1

    def test_cancelled_enrollment_never_counted(self, db_session, reg_cfg, tutor):
        """Cancelled rows never represented an attending student."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7),
                            payment_status="Cancelled")

        assert _build_retention(db_session, reg_cfg).totals.cohort == 0

    def test_waived_enrollment_is_counted(self, db_session, reg_cfg, tutor):
        """Waived is a real attending student — the exclusion list is written
        as a deny-list precisely so this doesn't drop out."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7),
                            payment_status="Waived")

        assert _build_retention(db_session, reg_cfg).totals.cohort == 1

    def test_summer_only_student_joins_the_cohort(self, db_session, reg_cfg, sum_cfg, tutor):
        """Came in through summer with no regular history: still someone to keep."""
        s = _student(db_session, grade="P6")
        _summer_enrollment(db_session, s, tutor, sum_cfg)

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 1
        assert _row(result, s.id).source == "summer_only"

    def test_withdrawn_summer_application_does_not_qualify(self, db_session, reg_cfg, sum_cfg, tutor):
        s = _student(db_session, grade="P6")
        _summer_enrollment(db_session, s, tutor, sum_cfg, status="Withdrawn")

        assert _build_retention(db_session, reg_cfg).totals.cohort == 0

    def test_regular_and_summer_is_its_own_source(self, db_session, reg_cfg, sum_cfg, tutor):
        """Both sides is the strongest retention signal, so it stays separable."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _summer_enrollment(db_session, s, tutor, sum_cfg)

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 1, "the same student must not be counted twice"
        assert _row(result, s.id).source == "regular_and_summer"


# ---------------------------------------------------------------------------
# The Sept 1 grade shift
# ---------------------------------------------------------------------------

class TestExpectedGrade:
    def test_before_promotion_the_expected_grade_is_one_step_up(self, db_session, reg_cfg, tutor):
        """Stored grade is last year's until the Sept 1 job runs, but an
        application carries the grade being entered."""
        s = _student(db_session, grade="F1", promoted=2025)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        row = _row(_build_retention(db_session, reg_cfg), s.id)

        assert (row.grade, row.expected_grade) == ("F1", "F2")

    def test_after_promotion_the_stored_grade_is_already_right(self, db_session, reg_cfg, tutor):
        """Once promoted for this intake the grade must not shift a second time,
        or the whole board moves overnight on 1 September."""
        s = _student(db_session, grade="F2", promoted=YEAR)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        row = _row(_build_retention(db_session, reg_cfg), s.id)

        assert (row.grade, row.expected_grade) == ("F2", "F2")

    def test_open_admin_only_and_missing_rungs_are_distinguished(self, db_session, reg_cfg, tutor):
        entering_f2 = _student(db_session, name="Open", grade="F1")
        entering_f5 = _student(db_session, name="AdminOnly", grade="F4")
        entering_f6 = _student(db_session, name="NoRung", grade="F5")
        for s in (entering_f2, entering_f5, entering_f6):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        result = _build_retention(db_session, reg_cfg)

        assert _row(result, entering_f2.id).rung == "open"
        assert _row(result, entering_f5.id).rung == "admin_only"
        assert _row(result, entering_f6.id).rung == "none"

    def test_students_with_no_rung_are_reported_apart(self, db_session, reg_cfg, tutor):
        """Nobody should read as unresponsive when the form has nowhere to put
        them — they are counted separately instead."""
        no_rung = _student(db_session, name="NoRung", grade="F5")
        chasable = _student(db_session, name="Chasable", grade="F1")
        for s in (no_rung, chasable):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 1
        assert result.totals.no_response == 1
        assert result.no_rung.cohort == 1
        assert result.no_rung.no_response == 1


# ---------------------------------------------------------------------------
# Applied / enrolled
# ---------------------------------------------------------------------------

class TestApplied:
    def test_linked_application_counts_as_applied(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        app = _application(db_session, reg_cfg, s)

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.applied == 1
        assert result.totals.no_response == 0
        row = _row(result, s.id)
        assert row.state == "applied"
        assert row.reference_code == app.reference_code

    def test_published_application_reads_as_enrolled(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        app = _application(db_session, reg_cfg, s)
        db_session.add(Enrollment(
            student_id=s.id, tutor_id=tutor.id, location="MSA", enrollment_type="Regular",
            first_lesson_date=date(2026, 9, 1), lessons_paid=6, payment_status="Paid",
            regular_application_id=app.id,
        ))
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        assert _row(result, s.id).state == "enrolled"
        # Enrolled nests inside applied, matching the conversion funnel.
        assert (result.totals.applied, result.totals.enrolled) == (1, 1)

    def test_withdrawn_application_does_not_count(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _application(db_session, reg_cfg, s, status="Withdrawn")

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.applied == 0
        assert _row(result, s.id).state == "no_response"

    def test_application_reachable_only_through_the_prospect_link(
        self, db_session, reg_cfg, sum_cfg, tutor
    ):
        """A P6 who applied but whose application was matched to the prospect
        rather than back to the student record. Missing this path would chase a
        family that already applied."""
        s = _student(db_session, grade="P6")
        summer_app, _ = _summer_enrollment(db_session, s, tutor, sum_cfg)
        app = _application(db_session, reg_cfg, None, grade="F1")
        db_session.add(PrimaryProspect(
            year=YEAR, source_branch="MAC", student_name=s.student_name, grade="P6",
            summer_application_id=summer_app.id, regular_application_id=app.id,
        ))
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        row = _row(result, s.id)
        assert row.state == "applied"
        assert row.on_prospect_board is True

    def test_prospect_board_membership_is_flagged_even_without_an_application(
        self, db_session, reg_cfg, sum_cfg, tutor
    ):
        """The primary branch is already chasing these families; the board says
        so rather than sending a second caller."""
        s = _student(db_session, grade="P6")
        summer_app, _ = _summer_enrollment(db_session, s, tutor, sum_cfg)
        db_session.add(PrimaryProspect(
            year=YEAR, source_branch="MAC", student_name=s.student_name, grade="P6",
            summer_application_id=summer_app.id,
        ))
        db_session.commit()

        row = _row(_build_retention(db_session, reg_cfg), s.id)

        assert row.state == "no_response"
        assert row.on_prospect_board is True


# ---------------------------------------------------------------------------
# Terminations: three meanings, decided by when they were filed
# ---------------------------------------------------------------------------

class TestTerminations:
    def test_decline_in_the_intake_quarter_stays_in_the_denominator(self, db_session, reg_cfg, tutor):
        """A family who said no is a retention failure, not an exclusion —
        dropping them would flatter the rate."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=3, counted=True,
                     reason="going to a competitor", category="Switched to competitor")

        result = _build_retention(db_session, reg_cfg)

        assert (result.intake_year, result.intake_quarter) == INTAKE_QUARTER
        assert result.totals.cohort == 1
        assert result.totals.declined == 1
        assert result.totals.no_response == 0, "a decline is an answer, not silence"
        row = _row(result, s.id)
        assert row.state == "declined"
        assert row.decline_reason_category == "Switched to competitor"

    def test_declines_group_by_reason(self, db_session, reg_cfg, tutor):
        for name, category in [("A", "Scheduling conflict"), ("B", "Scheduling conflict"),
                               ("C", "Relocated")]:
            s = _student(db_session, name=name)
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
            _termination(db_session, s, year=2026, quarter=3, category=category)

        result = _build_retention(db_session, reg_cfg)

        assert [(r.key, r.declined) for r in result.by_decline_reason] == [
            ("Scheduling conflict", 2), ("Relocated", 1),
        ]

    def test_uncounted_termination_leaves_the_denominator(self, db_session, reg_cfg, tutor):
        """Transferred branch or graduated: never a retention failure, so it
        leaves the rate — but it is still reported, because a cohort that
        shrank silently is one nobody trusts."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=3, counted=False,
                     reason="Transfer to MSB")

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 0
        assert result.not_churn.cohort == 1
        assert _row(result, s.id).state == "not_churn"

    def test_a_transfer_is_not_a_decline(self, db_session, reg_cfg, tutor):
        """The two states share a table and mean opposite things: one is a lost
        customer, the other is a customer who is still ours."""
        left = _student(db_session, name="Left")
        moved = _student(db_session, name="Moved")
        for s in (left, moved):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, left, year=2026, quarter=3, counted=True,
                     category="Switched to competitor")
        _termination(db_session, moved, year=2026, quarter=3, counted=False,
                     category="Relocated")

        result = _build_retention(db_session, reg_cfg)

        assert (result.totals.cohort, result.totals.declined) == (1, 1)
        assert result.not_churn.cohort == 1
        assert [r.key for r in result.by_decline_reason] == ["Switched to competitor"]

    def test_an_application_outranks_a_transfer(self, db_session, reg_cfg, tutor):
        """Marked as moving branch and then applied anyway: the application is
        the later word, so they return to the denominator."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=3, counted=False)
        _application(db_session, reg_cfg, s)

        result = _build_retention(db_session, reg_cfg)

        assert (result.totals.cohort, result.totals.applied) == (1, 1)
        assert result.not_churn.cohort == 0
        assert _row(result, s.id).state == "applied"

    def test_termination_from_the_quarter_before_removes_the_student(self, db_session, reg_cfg, tutor):
        """Q2 closes 21 July, after the 1 May cutoff, so it is the more recent
        word: they left at the end of last year and are not a retention question."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=2, counted=True)

        assert _build_retention(db_session, reg_cfg).totals.cohort == 0

    def test_stale_termination_loses_to_a_later_enrollment(self, db_session, reg_cfg, tutor):
        """Q1 closes 21 April, before the cutoff. A student who terminated then
        but has lessons running into May came back — the enrollment is the more
        recent signal and wins."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=1, counted=True)

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 1
        assert _row(result, s.id).state == "no_response"

    def test_application_outranks_a_contradictory_decline(self, db_session, reg_cfg, tutor):
        """Applying is a concrete act; if both exist the application wins, but
        the decline reason still rides along so staff can see the conflict."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _application(db_session, reg_cfg, s)
        _termination(db_session, s, year=2026, quarter=3, category="Lost interest")

        row = _row(_build_retention(db_session, reg_cfg), s.id)

        assert row.state == "applied"
        assert row.decline_reason_category == "Lost interest"


# ---------------------------------------------------------------------------
# Contact, reconciliation, scoping
# ---------------------------------------------------------------------------

class TestContactAndScoping:
    def test_contact_inside_the_window_counts(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        db_session.add(ParentCommunication(
            student_id=s.id, tutor_id=tutor.id, contact_date=datetime(2026, 8, 10),
            contact_method="Phone", contact_type="General", brief_notes="chased",
            follow_up_needed=True, follow_up_date=date(2026, 8, 20),
        ))
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.contacted == 1
        row = _row(result, s.id)
        assert row.follow_up_needed is True
        assert row.follow_up_date == date(2026, 8, 20)
        # Still unresponsive: being called is not the same as answering.
        assert row.state == "no_response"

    def test_contact_before_the_window_does_not_count_as_chased(self, db_session, reg_cfg, tutor):
        """A progress call in May says nothing about this intake."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        db_session.add(ParentCommunication(
            student_id=s.id, tutor_id=tutor.id, contact_date=datetime(2026, 5, 30),
            contact_method="WeChat", contact_type="Progress Update",
        ))
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.contacted == 0
        # The history still shows, so a caller knows when they last spoke.
        assert _row(result, s.id).last_contact_date == datetime(2026, 5, 30)

    def test_the_last_note_rides_along_with_the_last_contact(self, db_session, reg_cfg, tutor):
        """The note is what stops a second caller repeating the first, and it
        has to be the note from the call the date refers to."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        for when, note in (
            (datetime(2026, 8, 6), "left a message"),
            (datetime(2026, 8, 9), "mother will decide after the results"),
        ):
            db_session.add(ParentCommunication(
                student_id=s.id, tutor_id=tutor.id, contact_date=when,
                contact_method="Phone", contact_type="General", brief_notes=note,
            ))
        db_session.commit()

        row = _row(_build_retention(db_session, reg_cfg), s.id)

        assert row.last_contact_date == datetime(2026, 8, 9)
        assert row.last_contact_note == "mother will decide after the results"

    def test_a_long_note_is_clipped(self, db_session, reg_cfg, tutor):
        """It rides on every row of a payload that is already large, and the
        list has room for one line of it."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        db_session.add(ParentCommunication(
            student_id=s.id, tutor_id=tutor.id, contact_date=datetime(2026, 8, 6),
            contact_method="Phone", contact_type="General", brief_notes="x" * 500,
        ))
        db_session.commit()

        assert len(_row(_build_retention(db_session, reg_cfg), s.id).last_contact_note) == 200

    def test_contacting_the_unresponsive_is_counted_separately(self, db_session, reg_cfg, tutor):
        """Cohort-wide "contacted" reads as "of the unresponsive, N called" when
        it sits under a no-response heading, so the scoped figure is its own."""
        applied = _student(db_session, name="Applied")
        silent = _student(db_session, name="Silent")
        for s in (applied, silent):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
            db_session.add(ParentCommunication(
                student_id=s.id, tutor_id=tutor.id, contact_date=datetime(2026, 8, 10),
                contact_method="Phone", contact_type="General",
            ))
        _application(db_session, reg_cfg, applied)
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.contacted == 2
        assert result.totals.no_response_contacted == 1

    def test_unlinked_applications_are_surfaced_for_reconciliation(self, db_session, reg_cfg, tutor):
        """These claim an existing student but have no link, so their families
        read as unresponsive and would be chased in error."""
        _application(db_session, reg_cfg, None)
        _application(db_session, reg_cfg, None)

        result = _build_retention(db_session, reg_cfg)

        assert result.reconciliation.unlinked_count == 2
        assert result.reconciliation.unlinked_secondary == 2

    def test_unlinked_applications_follow_the_branch_filter(self, db_session, reg_cfg, tutor):
        """An unmatched application has no student record to take a branch from,
        so the branch it asked for is the only one it has. Counting all of them
        against one branch overstates what is wrong with that list."""
        msa = _application(db_session, reg_cfg, None)
        msb = _application(db_session, reg_cfg, None)
        msb.preferred_location = "二龍喉分校"
        db_session.commit()

        assert msa.preferred_location == "華士古分校"
        assert _build_retention(db_session, reg_cfg).reconciliation.unlinked_count == 2
        assert _build_retention(db_session, reg_cfg, branch="MSB").reconciliation.unlinked_count == 1

    def test_applications_from_outside_the_cohort_are_counted(self, db_session, reg_cfg, tutor):
        """They applied but were never in the denominator. Reported so they read
        as excluded rather than as missing."""
        lapsed = _student(db_session, name="Lapsed")
        _regular_enrollment(db_session, lapsed, tutor, first_lesson=date(2026, 1, 6), lessons=4)
        _application(db_session, reg_cfg, lapsed)

        result = _build_retention(db_session, reg_cfg)

        assert result.totals.cohort == 0
        assert result.reconciliation.applied_outside_cohort == 1
        # Their home branch is the only branch they have, so a branch-scoped
        # board counts them where the student sits.
        assert _build_retention(db_session, reg_cfg, branch="MSA").reconciliation.applied_outside_cohort == 1
        assert _build_retention(db_session, reg_cfg, branch="MSB").reconciliation.applied_outside_cohort == 0

    def test_applications_from_outside_the_cohort_are_named(self, db_session, reg_cfg, tutor):
        """Each of them is a different situation: one lapsed a year ago, one is
        a primary student the conversion board owns. A count cannot tell those
        apart and staff cannot act on it."""
        lapsed = _student(db_session, name="Lapsed", grade="F2", code="1426")
        _regular_enrollment(db_session, lapsed, tutor, first_lesson=date(2026, 1, 6), lessons=4)
        _application(db_session, reg_cfg, lapsed, grade="F3")

        [row] = _build_retention(db_session, reg_cfg).reconciliation.applied_outside

        assert row.student_id == lapsed.id
        assert row.student_name == "Lapsed"
        assert row.student_code == "MSA-1426"
        assert row.branch == "MSA"
        # What they are on record as, against what they have asked for.
        assert (row.grade, row.applied_grade) == ("F2", "F3")
        assert row.reference_code

    def test_students_with_no_class_to_apply_for_stay_on_the_list(
        self, db_session, reg_cfg, tutor
    ):
        """Held out of the rate but kept in `chase`, which is what lets the
        overview name them instead of just counting them."""
        leaver = _student(db_session, name="Leaving school", grade="F5")
        _regular_enrollment(db_session, leaver, tutor, first_lesson=date(2026, 4, 7))

        result = _build_retention(db_session, reg_cfg)

        assert result.no_rung.cohort == 1
        assert result.totals.cohort == 0
        row = _row(result, leaver.id)
        assert row is not None and row.rung == "none"
        assert row.expected_grade == "F6"

    def test_branch_filter_scopes_the_whole_report(self, db_session, reg_cfg, tutor):
        msa = _student(db_session, name="At MSA")
        msb = _student(db_session, name="At MSB")
        _regular_enrollment(db_session, msa, tutor, first_lesson=date(2026, 4, 7), location="MSA")
        _regular_enrollment(db_session, msb, tutor, first_lesson=date(2026, 4, 7), location="MSB")

        result = _build_retention(db_session, reg_cfg, branch="MSB")

        assert result.totals.cohort == 1
        assert [r.key for r in result.by_branch] == ["MSB"]

    def test_tutors_sharing_a_name_stay_two_rows(self, db_session, reg_cfg, tutor):
        """Keyed on the tutor's id: merging them would hand one of them the
        other's students and quietly halve the row count."""
        namesake = Tutor(user_email="w2@test.com", tutor_name="Ms Ho", role="Tutor",
                         is_active_tutor=True)
        db_session.add(namesake)
        db_session.commit()
        for t in (tutor, namesake):
            s = _student(db_session, name=f"Student of {t.id}")
            _regular_enrollment(db_session, s, t, first_lesson=date(2026, 4, 7))

        result = _build_retention(db_session, reg_cfg)

        assert [r.key for r in result.by_tutor] == [str(tutor.id), str(namesake.id)]
        assert {r.label for r in result.by_tutor} == {"Ms Ho"}
        assert [r.cohort for r in result.by_tutor] == [1, 1]

    def test_tutor_scope_hides_other_tutors_students(self, db_session, reg_cfg, tutor):
        """What the tutor-facing view reads."""
        other = Tutor(user_email="o@test.com", tutor_name="Mr Lei", role="Tutor",
                      is_active_tutor=True)
        db_session.add(other)
        db_session.commit()
        mine = _student(db_session, name="Mine")
        theirs = _student(db_session, name="Theirs")
        _regular_enrollment(db_session, mine, tutor, first_lesson=date(2026, 4, 7))
        _regular_enrollment(db_session, theirs, other, first_lesson=date(2026, 4, 7))

        result = _build_retention(db_session, reg_cfg, tutor_id=tutor.id)

        assert result.totals.cohort == 1
        assert _row(result, mine.id) is not None
        assert _row(result, theirs.id) is None

    def test_unresponsive_students_lead_the_list(self, db_session, reg_cfg, tutor):
        """The chase list returns the whole cohort so the UI can filter, but the
        work comes first."""
        applied = _student(db_session, name="Applied")
        silent = _student(db_session, name="Silent")
        for s in (applied, silent):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _application(db_session, reg_cfg, applied)

        result = _build_retention(db_session, reg_cfg)

        assert [r.state for r in result.chase] == ["no_response", "applied"]

    def test_unknown_year_is_a_404(self, db_session):
        with pytest.raises(HTTPException) as exc:
            get_retention(year=1999, branch=None, _admin=None, db=db_session)
        assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# The trend
# ---------------------------------------------------------------------------

class TestTrendSeries:
    """The pure part: dates in, one point per day out. No snapshot stands
    behind the chart, so these are the rules that make a rebuilt series
    trustworthy."""

    def test_a_window_that_has_not_opened_has_no_points(self):
        assert _retention_trend(
            [], [], [], start=date(2026, 8, 4), today=date(2026, 8, 1),
            close=date(2026, 9, 30),
        ) == []

    def test_no_window_at_all_has_no_points(self):
        assert _retention_trend([], [], [], start=None, today=date(2026, 8, 10),
                                close=None) == []

    def test_one_point_per_day_up_to_today(self):
        points = _retention_trend(
            [], [], [], start=date(2026, 8, 4), today=date(2026, 8, 6),
            close=date(2026, 9, 30),
        )
        assert [p.date for p in points] == [
            date(2026, 8, 4), date(2026, 8, 5), date(2026, 8, 6),
        ]

    def test_a_closed_window_stops_closing(self):
        """Months of flat tail after the intake ends says nothing, so the
        series ends where the window did."""
        points = _retention_trend(
            [date(2026, 9, 29)], [], [], start=date(2026, 9, 28),
            today=date(2026, 12, 25), close=date(2026, 9, 30),
        )
        assert [p.date for p in points] == [
            date(2026, 9, 28), date(2026, 9, 29), date(2026, 9, 30),
        ]

    def test_a_late_application_extends_the_series(self):
        """One taken after the deadline is still an application; dropping it
        would leave the last point short of the headline."""
        points = _retention_trend(
            [date(2026, 10, 2)], [], [], start=date(2026, 9, 29),
            today=date(2026, 12, 25), close=date(2026, 9, 30),
        )
        assert points[-1].date == date(2026, 10, 2)
        assert points[-1].applied_total == 1

    def test_events_before_the_window_fold_onto_its_first_day(self):
        """Rather than dropping off the chart while the headline still counts
        them."""
        points = _retention_trend(
            [date(2026, 7, 1)], [], [], start=date(2026, 8, 4),
            today=date(2026, 8, 5), close=date(2026, 9, 30),
        )
        assert points[0].applied == 1
        assert points[-1].applied_total == 1

    def test_running_totals_accumulate_across_the_three_series(self):
        points = _retention_trend(
            [date(2026, 8, 4), date(2026, 8, 6)],
            [date(2026, 8, 5)],
            [date(2026, 8, 4), date(2026, 8, 4)],
            start=date(2026, 8, 4), today=date(2026, 8, 6), close=date(2026, 9, 30),
        )
        assert [(p.applied, p.declined, p.contacted) for p in points] == [
            (1, 0, 2), (0, 1, 0), (1, 0, 0),
        ]
        assert [(p.applied_total, p.declined_total, p.contacted_total) for p in points] == [
            (1, 0, 2), (1, 1, 2), (2, 1, 2),
        ]


class TestTrendInTheReport:
    """The wiring: the chart is read directly under the headline figures, so
    the two must never disagree."""

    def test_the_last_point_equals_the_headline(self, db_session, reg_cfg, tutor):
        applied = _student(db_session, name="Applied")
        silent = _student(db_session, name="Silent")
        for s in (applied, silent):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        app = _application(db_session, reg_cfg, applied)
        app.submitted_at = datetime(2026, 8, 5, 9, 30)
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        last = result.trend[-1]
        assert last.applied_total == result.totals.applied == 1
        assert last.declined_total == result.totals.declined
        assert last.contacted_total == result.totals.contacted
        by_day = {p.date: p for p in result.trend}
        assert by_day[date(2026, 8, 5)].applied == 1
        assert by_day[date(2026, 8, 4)].applied == 0

    def test_a_decline_is_dated_when_it_was_filed(self, db_session, reg_cfg, tutor):
        """Not when the quarter started: the chart is asking when the centre
        found out."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        record = _termination(db_session, s, year=2026, quarter=3, category="Moving Away")
        record.created_at = datetime(2026, 8, 7, 14, 0)
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        by_day = {p.date: p for p in result.trend}
        assert by_day[date(2026, 8, 7)].declined == 1
        assert result.trend[-1].declined_total == result.totals.declined == 1

    def test_a_family_called_twice_is_counted_once_on_the_first_call(
        self, db_session, reg_cfg, tutor
    ):
        """The line answers when a family stopped being unreached, and a
        second call does not move that day."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        for when in (datetime(2026, 8, 6), datetime(2026, 8, 9)):
            db_session.add(ParentCommunication(
                student_id=s.id, tutor_id=tutor.id, contact_date=when,
                contact_method="Phone", contact_type="General",
            ))
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        by_day = {p.date: p for p in result.trend}
        assert by_day[date(2026, 8, 6)].contacted == 1
        assert by_day[date(2026, 8, 9)].contacted == 0
        assert result.trend[-1].contacted_total == result.totals.contacted == 1

    def test_students_outside_the_denominator_stay_off_the_chart(
        self, db_session, reg_cfg, tutor
    ):
        """An F6 leaver has no place to apply for and is never counted as
        unresponsive, so their application is not part of this rate either."""
        s = _student(db_session, name="Leaving school", grade="F5")
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        app = _application(db_session, reg_cfg, s, grade="F6")
        app.submitted_at = datetime(2026, 8, 5)
        db_session.commit()

        result = _build_retention(db_session, reg_cfg)

        assert result.no_rung.cohort == 1
        assert result.totals.cohort == 0
        assert all(p.applied == 0 for p in result.trend)

    def test_the_branch_filter_reaches_the_chart(self, db_session, reg_cfg, tutor):
        msa = _student(db_session, name="At MSA")
        msb = _student(db_session, name="At MSB")
        for s, location in ((msa, "MSA"), (msb, "MSB")):
            _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7),
                                location=location)
            app = _application(db_session, reg_cfg, s)
            app.submitted_at = datetime(2026, 8, 5)
        db_session.commit()

        both = _build_retention(db_session, reg_cfg)
        one = _build_retention(db_session, reg_cfg, branch="MSB")

        assert both.trend[-1].applied_total == 2
        assert one.trend[-1].applied_total == one.totals.applied == 1


# ---------------------------------------------------------------------------
# Taking it back
# ---------------------------------------------------------------------------

class TestUndo:
    """Marking a family as not returning is one click, so unmarking them has to
    be one too. Flipping count_as_terminated is not an undo: it says "left, but
    not churn", which leaves the student off the board a second way."""

    def _undo(self, db_session, student, tutor):
        # A private loop rather than asyncio.run(): that clears the process's
        # current event loop on the way out, and tests elsewhere in the suite
        # still reach for it with get_event_loop().
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(delete_termination_record(
                student_id=student.id, year=2026, quarter=3,
                current_user=tutor, db=db_session,
            ))
        finally:
            loop.close()

    def test_undoing_a_decline_returns_the_student_to_the_list(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=3, category="Lost interest")
        assert _build_retention(db_session, reg_cfg).totals.declined == 1

        self._undo(db_session, s, tutor)

        result = _build_retention(db_session, reg_cfg)
        assert result.totals.declined == 0
        assert result.totals.no_response == 1
        assert _row(result, s.id).state == "no_response"

    def test_undoing_a_transfer_puts_them_back_in_the_denominator(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=3, counted=False)
        assert _build_retention(db_session, reg_cfg).totals.cohort == 0

        self._undo(db_session, s, tutor)

        assert _build_retention(db_session, reg_cfg).totals.cohort == 1

    def test_undoing_leaves_other_quarters_alone(self, db_session, reg_cfg, tutor):
        """The board only ever writes into the intake quarter, so it must only
        ever remove from it — an earlier termination is somebody else's record."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _termination(db_session, s, year=2026, quarter=1, counted=True)
        _termination(db_session, s, year=2026, quarter=3, counted=True)

        self._undo(db_session, s, tutor)

        left = db_session.query(TerminationRecord).filter(
            TerminationRecord.student_id == s.id
        ).all()
        assert [(r.year, r.quarter) for r in left] == [(2026, 1)]

    def test_undoing_nothing_is_not_an_error(self, db_session, reg_cfg, tutor):
        """Two callers clearing the same row is a race, not a failure."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        assert self._undo(db_session, s, tutor) is None


# ---------------------------------------------------------------------------
# The tutor-facing view
# ---------------------------------------------------------------------------

class TestTutorView:
    def test_returns_only_the_callers_own_students(self, db_session, reg_cfg, tutor):
        other = Tutor(user_email="o@test.com", tutor_name="Mr Lei", role="Tutor",
                      is_active_tutor=True)
        db_session.add(other)
        db_session.commit()
        mine = _student(db_session, name="Mine")
        theirs = _student(db_session, name="Theirs")
        _regular_enrollment(db_session, mine, tutor, first_lesson=date(2026, 4, 7))
        _regular_enrollment(db_session, theirs, other, first_lesson=date(2026, 4, 7))

        result = get_my_retention(year=YEAR, current_user=tutor, db=db_session)

        assert [s.student_name for s in result.students] == ["Mine"]
        assert result.totals.cohort == 1

    def test_a_summer_student_stays_with_their_regular_tutor(
        self, db_session, reg_cfg, sum_cfg, tutor
    ):
        """Scoping the cohort in SQL narrows each source independently, so a
        student taught over the summer by one tutor and in September by another
        would otherwise land on both worklists."""
        summer_tutor = Tutor(user_email="s@test.com", tutor_name="Mr Lei", role="Tutor",
                             is_active_tutor=True)
        db_session.add(summer_tutor)
        db_session.commit()
        s = _student(db_session, name="Taught by both")
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _summer_enrollment(db_session, s, summer_tutor, sum_cfg)

        mine = get_my_retention(year=YEAR, current_user=tutor, db=db_session)
        theirs = get_my_retention(year=YEAR, current_user=summer_tutor, db=db_session)

        assert [r.student_name for r in mine.students] == ["Taught by both"]
        assert theirs.students == []

    def test_carries_no_centre_wide_figures(self, db_session, reg_cfg, tutor):
        """A tutor sees their students, not how the centre is performing — the
        response has nowhere to put a branch or tutor comparison."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        result = get_my_retention(year=YEAR, current_user=tutor, db=db_session)

        for leaked in ("by_branch", "by_tutor", "by_source", "reconciliation"):
            assert not hasattr(result, leaked), f"{leaked} must not reach a tutor"

    def test_defaults_to_the_open_intake(self, db_session, reg_cfg, tutor):
        """A tutor chases whichever intake is open, so the year is optional."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        result = get_my_retention(year=None, current_user=tutor, db=db_session)

        assert result.year == YEAR

    def test_no_active_intake_is_a_404(self, db_session, reg_cfg, tutor):
        reg_cfg.is_active = False
        db_session.commit()

        with pytest.raises(HTTPException) as exc:
            get_my_retention(year=None, current_user=tutor, db=db_session)
        assert exc.value.status_code == 404

    def test_an_applied_student_carries_the_rung_they_are_on(
        self, db_session, reg_cfg, tutor
    ):
        """"Applied" covers everything from Submitted to Fee Sent, which is
        the difference between a family who filled the form in last night and
        one waiting to pay."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        _application(db_session, reg_cfg, s, status="Fee Sent")

        result = get_my_retention(year=YEAR, current_user=tutor, db=db_session)

        assert [r.application_status for r in result.students] == ["Fee Sent"]

    def test_a_student_with_no_application_carries_no_rung(
        self, db_session, reg_cfg, tutor
    ):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        result = get_my_retention(year=YEAR, current_user=tutor, db=db_session)

        assert result.students[0].application_status is None


# ---------------------------------------------------------------------------
# Viewing the page as somebody else
# ---------------------------------------------------------------------------

class TestViewingAsAnotherTutor:
    """Impersonation has to reach the data or it only tests the layout.

    The catch is that impersonating turns the caller's effective role down to
    Tutor, so the permission has to be read off the token instead. These pin
    down that an admin can look and a tutor cannot.
    """

    @pytest.fixture
    def other(self, db_session):
        t = Tutor(user_email="other@test.com", tutor_name="Mr Lei", role="Tutor",
                  is_active_tutor=True)
        db_session.add(t)
        db_session.commit()
        return t

    @pytest.fixture
    def admin(self, db_session):
        t = Tutor(user_email="admin@test.com", tutor_name="Ms Boss", role="Super Admin",
                  is_active_tutor=True)
        db_session.add(t)
        db_session.commit()
        return t

    def test_an_admin_sees_the_chosen_tutors_list(self, db_session, reg_cfg, admin, other):
        theirs = _student(db_session, name="Theirs")
        _regular_enrollment(db_session, theirs, other, first_lesson=date(2026, 4, 7))

        result = get_my_retention(
            year=YEAR, tutor_id=other.id, current_user=admin, db=db_session
        )

        assert [r.student_name for r in result.students] == ["Theirs"]

    def test_a_tutor_cannot_ask_for_somebody_elses(self, db_session, reg_cfg, tutor, other):
        with pytest.raises(HTTPException) as exc:
            get_my_retention(
                year=YEAR, tutor_id=other.id, current_user=tutor, db=db_session
            )
        assert exc.value.status_code == 403

    def test_asking_for_your_own_id_is_always_allowed(self, db_session, reg_cfg, tutor):
        s = _student(db_session, name="Mine")
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        result = get_my_retention(
            year=YEAR, tutor_id=tutor.id, current_user=tutor, db=db_session
        )

        assert [r.student_name for r in result.students] == ["Mine"]

    def test_the_class_list_follows_the_same_rule(self, db_session, reg_cfg, tutor, other):
        with pytest.raises(HTTPException) as exc:
            get_my_class(year=YEAR, tutor_id=other.id, current_user=tutor, db=db_session)
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# September classes
# ---------------------------------------------------------------------------

class TestMyClass:
    """The forward-looking half: who has been placed into this tutor's slots.

    A different population from the chase list on purpose. Some of the class
    are families the tutor has never taught, and some of last year's students
    end up with somebody else.
    """

    def test_only_the_slots_this_tutor_is_down_to_teach(
        self, db_session, reg_cfg, tutor
    ):
        other = Tutor(user_email="o3@test.com", tutor_name="Mr Lei", role="Tutor",
                      is_active_tutor=True)
        db_session.add(other)
        db_session.commit()
        mine = _slot(db_session, reg_cfg, tutor, day="Tuesday")
        theirs = _slot(db_session, reg_cfg, other, day="Friday")
        _application(db_session, reg_cfg, name="In mine", slot=mine)
        _application(db_session, reg_cfg, name="In theirs", slot=theirs)

        result = get_my_class(year=YEAR, current_user=tutor, db=db_session)

        assert [s.slot_day for s in result.slots] == ["Tuesday"]
        assert [s.student_name for s in result.slots[0].students] == ["In mine"]

    def test_a_withdrawn_applicant_is_neither_listed_nor_counted(
        self, db_session, reg_cfg, tutor
    ):
        """They keep their slot in the database but they are not coming."""
        slot = _slot(db_session, reg_cfg, tutor)
        _application(db_session, reg_cfg, name="Coming", slot=slot)
        _application(db_session, reg_cfg, name="Gone", slot=slot, status="Withdrawn")

        result = get_my_class(year=YEAR, current_user=tutor, db=db_session)

        assert [s.student_name for s in result.slots[0].students] == ["Coming"]

    def test_a_returning_student_is_marked_as_already_taught(
        self, db_session, reg_cfg, tutor
    ):
        slot = _slot(db_session, reg_cfg, tutor)
        known = _student(db_session, name="Known face")
        _regular_enrollment(db_session, known, tutor, first_lesson=date(2025, 9, 6))
        _application(db_session, reg_cfg, known, name="Known face", slot=slot)
        _application(db_session, reg_cfg, name="New family", slot=slot)

        result = get_my_class(year=YEAR, current_user=tutor, db=db_session)
        by_name = {s.student_name: s for s in result.slots[0].students}

        assert by_name["Known face"].taught_by_me_last_year is True
        assert by_name["Known face"].student_id == known.id
        assert by_name["New family"].taught_by_me_last_year is False
        assert by_name["New family"].student_id is None

    def test_somebody_elses_student_is_not_marked_as_taught(
        self, db_session, reg_cfg, tutor
    ):
        other = Tutor(user_email="o4@test.com", tutor_name="Mr Lei", role="Tutor",
                      is_active_tutor=True)
        db_session.add(other)
        db_session.commit()
        slot = _slot(db_session, reg_cfg, tutor)
        s = _student(db_session, name="Taught by Mr Lei")
        _regular_enrollment(db_session, s, other, first_lesson=date(2025, 9, 6))
        _application(db_session, reg_cfg, s, name="Taught by Mr Lei", slot=slot)

        result = get_my_class(year=YEAR, current_user=tutor, db=db_session)

        assert result.slots[0].students[0].taught_by_me_last_year is False

    def test_an_empty_page_says_how_many_slots_are_undecided(
        self, db_session, reg_cfg, tutor
    ):
        """Most tutors see nothing until the office assigns slots, and nothing
        is ambiguous between "not mine" and "not decided yet"."""
        db_session.add(RegularTutorDuty(
            config_id=reg_cfg.id, tutor_id=tutor.id, location="華士古分校",
            duty_day="Tuesday", time_slot="16:45 - 18:15",
        ))
        _slot(db_session, reg_cfg, None)
        _slot(db_session, reg_cfg, None, day="Friday")
        db_session.commit()

        result = get_my_class(year=YEAR, current_user=tutor, db=db_session)

        assert result.slots == []
        assert result.slots_awaiting_a_tutor == 2

    def test_another_branchs_undecided_slots_are_not_counted(
        self, db_session, reg_cfg, tutor
    ):
        db_session.add(RegularTutorDuty(
            config_id=reg_cfg.id, tutor_id=tutor.id, location="華士古分校",
            duty_day="Tuesday", time_slot="16:45 - 18:15",
        ))
        _slot(db_session, reg_cfg, None)
        _slot(db_session, reg_cfg, None, location="二龍喉分校")
        db_session.commit()

        result = get_my_class(year=YEAR, current_user=tutor, db=db_session)

        assert result.slots_awaiting_a_tutor == 1


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

class TestCaching:
    """The report costs about 600ms of database work and is the same for
    everybody who opens the board that minute, so it is held for two.

    What these tests pin down is that holding it never shows one person another
    person's report, and that the board's own buttons take effect at once
    rather than after the timer. Both come from the fingerprint in the key.
    """

    def test_reading_it_twice_builds_it_once(self, db_session, reg_cfg, tutor):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))

        first = _cached_retention(db_session, reg_cfg)
        second = _cached_retention(db_session, reg_cfg)

        assert second is first
        assert _RETENTION_CACHE.hits == 1

    def test_logging_a_contact_takes_effect_straight_away(self, db_session, reg_cfg, tutor):
        """The whole point of fingerprinting rather than trusting the timer:
        somebody rings a family, the board reloads, and the row has moved."""
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        before = _cached_retention(db_session, reg_cfg)
        assert before.totals.contacted == 0

        db_session.add(ParentCommunication(
            student_id=s.id, tutor_id=tutor.id, contact_date=datetime(2026, 8, 10),
            contact_method="Phone", contact_type="General", brief_notes="rang them",
        ))
        db_session.commit()

        after = _cached_retention(db_session, reg_cfg)
        assert after is not before
        assert after.totals.contacted == 1

    def test_marking_a_family_as_leaving_takes_effect_straight_away(
        self, db_session, reg_cfg, tutor
    ):
        s = _student(db_session)
        _regular_enrollment(db_session, s, tutor, first_lesson=date(2026, 4, 7))
        before = _cached_retention(db_session, reg_cfg)
        assert before.totals.declined == 0

        _termination(db_session, s, year=2026, quarter=3, category="Moved away")

        after = _cached_retention(db_session, reg_cfg)
        assert after.totals.declined == 1

    def test_one_branch_is_not_served_the_other_branch_s_report(
        self, db_session, reg_cfg, tutor
    ):
        msa = _student(db_session, name="At MSA")
        msb = _student(db_session, name="At MSB")
        msb.home_location = "MSB"
        db_session.commit()
        _regular_enrollment(db_session, msa, tutor, first_lesson=date(2026, 4, 7))
        _regular_enrollment(db_session, msb, tutor, first_lesson=date(2026, 4, 7),
                            location="MSB")

        everyone = _cached_retention(db_session, reg_cfg)
        just_msb = _cached_retention(db_session, reg_cfg, branch="MSB")

        assert everyone.totals.cohort == 2
        assert [r.student_name for r in just_msb.chase] == ["At MSB"]

    def test_a_tutor_is_not_served_the_whole_centre_s_report(
        self, db_session, reg_cfg, tutor
    ):
        """The nastiest thing a shared cache could do here: hand a tutor the
        admin report because the two calls landed in the same second."""
        other = Tutor(user_email="o2@test.com", tutor_name="Mr Lei", role="Tutor",
                      is_active_tutor=True)
        db_session.add(other)
        db_session.commit()
        mine = _student(db_session, name="Mine")
        theirs = _student(db_session, name="Theirs")
        _regular_enrollment(db_session, mine, tutor, first_lesson=date(2026, 4, 7))
        _regular_enrollment(db_session, theirs, other, first_lesson=date(2026, 4, 7))

        everyone = _cached_retention(db_session, reg_cfg)
        just_mine = _cached_retention(
            db_session, reg_cfg, tutor_id=tutor.id, include_reconciliation=False
        )

        assert everyone.totals.cohort == 2
        assert [r.student_name for r in just_mine.chase] == ["Mine"]
