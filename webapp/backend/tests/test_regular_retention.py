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
    Student,
    SummerApplication,
    SummerCourseConfig,
    TerminationRecord,
    Tutor,
)
from routers.regular_course import _build_retention, get_my_retention, get_retention
from routers.terminations import delete_termination_record

# The intake under test: applications open 4 Aug 2026, course starts 1 Sep.
# That puts the cohort cutoff at 1 May 2026 and the decline quarter at Q3 2026.
YEAR = 2026
ACTIVE_FROM = date(2026, 5, 1)
INTAKE_QUARTER = (2026, 3)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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
                 name="Chan Tai Man"):
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
    )
    db_session.add(a)
    db_session.commit()
    return a


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
