"""Leaving, and what the app refuses once somebody has.

The test that matters most in here is the one proving a departed tutor's
existing sessions stay editable. Everything else follows from the rule, but
that one is the requirement: the office will not have finished reassigning
somebody's lessons by the time they go, so their rows have to keep behaving
like ordinary rows for as long as it takes.
"""
from datetime import date, timedelta

import pytest

from models import (
    Enrollment,
    RegularCourseConfig,
    RegularCourseSlot,
    SessionLog,
    Student,
    SummerCourseConfig,
    SummerCourseSlot,
    Tutor,
)
from services.departure_guard import DepartedTutorAssignment, check_assignment
from utils.employment import can_hold_work_on, has_departed, is_leaving

TODAY = date(2026, 8, 15)
LAST_DAY = date(2026, 8, 22)


def _tutor(db, name="Mr Ivan Chen", departure=None, tutor_id=None):
    tutor = Tutor(
        id=tutor_id,
        user_email=f"{name.replace(' ', '.').lower()}@example.com",
        tutor_name=name,
        role="Tutor",
        default_location="MSB",
        is_active_tutor=True,
        departure_effective_on=departure,
    )
    db.add(tutor)
    db.commit()
    return tutor


def _student(db):
    student = Student(student_name="Test Student", grade="F2")
    db.add(student)
    db.commit()
    return student


def _mark_departed(db, tutor, when):
    """Record a departure after the fact, which is the only order it happens in.

    Sessions get booked weeks ahead and the resignation lands later, so a test
    that stamps the date first and then tries to create the legacy rows is
    testing something that cannot occur.
    """
    tutor.departure_effective_on = when
    db.commit()
    return tutor


def _session(db, tutor, student, on_date, status="Scheduled"):
    row = SessionLog(
        student_id=student.id,
        tutor_id=tutor.id,
        session_date=on_date,
        time_slot="10:00 - 11:30",
        location="MSB",
        session_status=status,
    )
    db.add(row)
    db.commit()
    return row


class TestEmploymentDates:
    """The notice period, which is where a flag would get this wrong."""

    def test_nobody_leaving_is_never_departed(self, db_session):
        tutor = _tutor(db_session, departure=None)
        assert is_leaving(tutor) is False
        assert has_departed(tutor, TODAY) is False
        assert can_hold_work_on(tutor, date(2030, 1, 1)) is True

    def test_last_day_itself_still_counts_as_here(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        assert has_departed(tutor, LAST_DAY) is False
        assert can_hold_work_on(tutor, LAST_DAY) is True

    def test_departed_the_day_after(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        assert has_departed(tutor, LAST_DAY + timedelta(days=1)) is True

    def test_serving_notice_can_still_take_work_before_the_date(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        assert has_departed(tutor, TODAY) is False
        assert can_hold_work_on(tutor, TODAY) is True
        assert can_hold_work_on(tutor, LAST_DAY + timedelta(days=1)) is False


class TestLegacySessionsStayEditable:
    """A departure must not freeze the work already on the books."""

    def test_editing_a_departed_tutors_session_is_allowed(self, db_session):
        tutor = _tutor(db_session)
        student = _student(db_session)
        row = _session(db_session, tutor, student, date(2026, 3, 5))
        _mark_departed(db_session, tutor, date(2026, 1, 31))

        row.session_status = "Attended"
        row.notes = "Covered by another tutor"
        row.time_slot = "14:30 - 16:00"
        db_session.commit()

        assert db_session.get(SessionLog, row.id).session_status == "Attended"

    def test_moving_a_departed_tutors_session_to_a_new_date_is_allowed(self, db_session):
        tutor = _tutor(db_session)
        student = _student(db_session)
        row = _session(db_session, tutor, student, date(2026, 3, 5))
        _mark_departed(db_session, tutor, date(2026, 1, 31))

        # Still theirs, later still. Admins reassign in whatever order suits
        # them, and blocking this would force date and tutor to move together.
        row.session_date = date(2026, 4, 9)
        db_session.commit()

        assert db_session.get(SessionLog, row.id).session_date == date(2026, 4, 9)

    def test_writing_the_same_tutor_id_back_is_not_a_change(self, db_session):
        tutor = _tutor(db_session)
        student = _student(db_session)
        row = _session(db_session, tutor, student, date(2026, 3, 5))
        _mark_departed(db_session, tutor, date(2026, 1, 31))

        # What a PUT does when the form posts every field back unchanged.
        row.tutor_id = tutor.id
        row.notes = "Untouched"
        db_session.commit()

        assert db_session.get(SessionLog, row.id).tutor_id == tutor.id

    def test_reassigning_to_somebody_still_here_is_allowed(self, db_session):
        leaver = _tutor(db_session)
        keeper = _tutor(db_session, name="Ms Bella Chang")
        student = _student(db_session)
        row = _session(db_session, leaver, student, date(2026, 3, 5))
        _mark_departed(db_session, leaver, date(2026, 1, 31))

        row.tutor_id = keeper.id
        db_session.commit()

        assert db_session.get(SessionLog, row.id).tutor_id == keeper.id


class TestAssignmentsAreRefused:
    """The pile must not grow."""

    def test_new_session_after_the_last_day_is_refused(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        student = _student(db_session)

        with pytest.raises(DepartedTutorAssignment) as caught:
            _session(db_session, tutor, student, LAST_DAY + timedelta(days=3))

        assert "Ivan Chen" in str(caught.value)
        assert "22 August 2026" in str(caught.value)

    def test_new_session_on_the_last_day_is_allowed(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        student = _student(db_session)

        row = _session(db_session, tutor, student, LAST_DAY)

        assert row.id is not None

    def test_moving_somebody_elses_session_onto_a_leaver_is_refused(self, db_session):
        leaver = _tutor(db_session, departure=LAST_DAY)
        keeper = _tutor(db_session, name="Ms Bella Chang")
        student = _student(db_session)
        row = _session(db_session, keeper, student, LAST_DAY + timedelta(days=7))

        row.tutor_id = leaver.id
        with pytest.raises(DepartedTutorAssignment):
            db_session.commit()

    def test_enrollment_starting_after_the_last_day_is_refused(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        student = _student(db_session)

        db_session.add(Enrollment(
            student_id=student.id,
            tutor_id=tutor.id,
            first_lesson_date=LAST_DAY + timedelta(days=14),
            lessons_paid=6,
        ))
        with pytest.raises(DepartedTutorAssignment):
            db_session.commit()

    def test_summer_slot_is_judged_against_the_end_of_the_intake(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)
        config = SummerCourseConfig(
            year=2026,
            title="Summer 2026",
            application_open_date=date(2026, 4, 1),
            application_close_date=date(2026, 6, 1),
            course_start_date=date(2026, 7, 1),
            course_end_date=date(2026, 8, 31),
            pricing_config={},
            locations=[],
            available_grades=[],
            time_slots=[],
        )
        db_session.add(config)
        db_session.commit()

        db_session.add(SummerCourseSlot(
            config_id=config.id,
            slot_day="Tuesday",
            time_slot="10:00 - 11:30",
            location="MSB",
            tutor_id=tutor.id,
        ))
        with pytest.raises(DepartedTutorAssignment) as caught:
            db_session.commit()

        assert "31 August 2026" in str(caught.value)

    def test_regular_slot_refuses_any_leaver(self, db_session):
        # Even somebody who is not going for months: the slot has no end date,
        # so it would carry on past them.
        tutor = _tutor(db_session, departure=date(2027, 6, 30))
        config = RegularCourseConfig(
            year=2026,
            title="Regular 2026",
            application_open_date=date(2026, 8, 1),
            application_close_date=date(2026, 8, 17),
            course_start_date=date(2026, 9, 1),
            locations=[],
            available_grades=[],
            time_slots=[],
        )
        db_session.add(config)
        db_session.commit()

        db_session.add(RegularCourseSlot(
            config_id=config.id,
            slot_day="Saturday",
            time_slot="10:00 - 11:30",
            location="MSB",
            tutor_id=tutor.id,
        ))
        with pytest.raises(DepartedTutorAssignment) as caught:
            db_session.commit()

        assert "regular slot" in str(caught.value)

    def test_a_tutor_who_is_not_leaving_is_untouched(self, db_session):
        tutor = _tutor(db_session, departure=None)
        student = _student(db_session)

        row = _session(db_session, tutor, student, date(2030, 1, 1))

        assert row.id is not None


class TestTheRegistryStaysHonest:
    """The guard only covers what is listed in GUARDS.

    The module says a new feature that assigns tutors belongs in that list on
    the day it is written, which is the sort of comment nothing enforces. This
    walks every foreign key onto tutors and makes somebody decide: either the
    column assigns work, and it goes in GUARDS, or it records who did something,
    and it goes in the exempt list below with a reason.
    """

    # Columns that name the person who acted, or who is being spoken to, rather
    # than the person who will teach. None of these can name somebody who has
    # left, because a leaver cannot log in to act, and the message tables must
    # keep working for everybody on file.
    AUTHORSHIP_COLUMNS = {
        ("debug_audit_logs", "admin_id"),
        ("document_folders", "created_by"),
        ("document_versions", "created_by"),
        ("documents", "created_by"),
        ("documents", "locked_by"),
        ("documents", "updated_by"),
        ("extension_requests", "tutor_id"),
        ("homework_completion", "assigned_by_tutor_id"),
        ("homework_completion", "checked_by"),
        ("makeup_proposal_slots", "resolved_by_tutor_id"),
        ("makeup_proposals", "proposed_by_tutor_id"),
        ("message_archives", "tutor_id"),
        ("message_likes", "tutor_id"),
        ("message_mentions", "mentioned_tutor_id"),
        ("message_pins", "tutor_id"),
        ("message_read_receipts", "tutor_id"),
        ("message_recipients", "tutor_id"),
        ("message_snoozes", "tutor_id"),
        ("message_templates", "tutor_id"),
        ("parent_communications", "tutor_id"),
        ("push_subscriptions", "tutor_id"),
        ("report_shares", "created_by"),
        ("saved_reports", "created_by"),
        ("student_radar_configs", "tutor_id"),
        ("termination_records", "tutor_id"),
        ("thread_mutes", "tutor_id"),
        ("thread_pins", "tutor_id"),
        ("tutor_memos", "tutor_id"),
        ("tutor_messages", "from_tutor_id"),
        ("waitlist_entries", "created_by"),
    }

    def test_every_tutor_foreign_key_is_guarded_or_named_as_authorship(self):
        from database import Base
        from services.departure_guard import GUARDS

        guarded = {
            (model.__tablename__, guard.column)
            for model, guards in GUARDS.items()
            for guard in guards
        }

        unaccounted = []
        for mapper in Base.registry.mappers:
            table = mapper.local_table
            if table is None:
                continue
            for column in table.columns:
                for fk in column.foreign_keys:
                    if fk.column.table.name != "tutors":
                        continue
                    key = (table.name, column.name)
                    if key not in guarded and key not in self.AUTHORSHIP_COLUMNS:
                        unaccounted.append(key)

        assert not unaccounted, (
            "These columns point at a tutor and are neither guarded nor listed "
            f"as authorship: {sorted(unaccounted)}. Decide which they are: if a "
            "write to one decides who teaches something, add it to GUARDS in "
            "services/departure_guard.py."
        )


class TestEarlyCheck:
    """The endpoint-level check, for refusing before anything is written."""

    def test_check_returns_a_message_for_work_past_the_last_day(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)

        problem = check_assignment(db_session, tutor.id, LAST_DAY + timedelta(days=1))

        assert problem is not None
        assert "Ivan Chen" in problem

    def test_check_passes_for_work_before_the_last_day(self, db_session):
        tutor = _tutor(db_session, departure=LAST_DAY)

        assert check_assignment(db_session, tutor.id, LAST_DAY) is None

    def test_check_passes_for_everybody_else(self, db_session):
        tutor = _tutor(db_session, departure=None)

        assert check_assignment(db_session, tutor.id, date(2030, 1, 1)) is None
        assert check_assignment(db_session, None, date(2030, 1, 1)) is None

    def test_a_leaving_date_written_mid_request_is_not_missed(self, db_session):
        """The leavers are cached per session, so the cache has to notice when
        somebody's date is written in the same request that then assigns them."""
        tutor = _tutor(db_session)
        assert check_assignment(db_session, tutor.id, date(2027, 1, 1)) is None

        tutor.departure_effective_on = LAST_DAY
        db_session.commit()

        assert check_assignment(db_session, tutor.id, date(2027, 1, 1)) is not None
