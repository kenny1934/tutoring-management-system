"""Turning ARK's employment records into a single date CSM can compare against.

Two readings live in the sync rather than in ARK, and both are here: a departed
status with no end date means gone right now, and an end date on an active
record is stale and must be ignored. Getting either the wrong way round either
locks somebody out who never left or lets somebody keep working who did.
"""
from datetime import date

from models import SessionLog, Student, Tutor
from services.ark_employment_sync import (
    apply_employment,
    resolve_last_working_day,
    tutors_missing_from_ark,
)

SEEN_ON = date(2026, 8, 15)


def _tutor(db, name, tutor_id=None, departure=None, teaches=True):
    tutor = Tutor(
        id=tutor_id,
        user_email=f"{name.replace(' ', '.').lower()}@example.com",
        tutor_name=name,
        role="Tutor",
        is_active_tutor=teaches,
        departure_effective_on=departure,
    )
    db.add(tutor)
    db.commit()
    return tutor


def _record(tutor_id, status="active", end_date=None, name="Someone"):
    return {
        "tutoring_system_id": tutor_id,
        "staff_id": 100 + tutor_id,
        "staff_name": name,
        "employment_status": status,
        "end_date": end_date,
    }


class TestResolvingARKsRecord:
    def test_active_staff_have_no_leaving_date(self):
        assert resolve_last_working_day("active", None, SEEN_ON) is None

    def test_a_resignation_uses_its_end_date(self):
        assert resolve_last_working_day("resigned", date(2026, 8, 22), SEEN_ON) == date(2026, 8, 22)

    def test_a_departure_with_no_end_date_means_today(self):
        """An immediate termination has no notice period. Reading the blank as
        "gone now" is the safe way round."""
        assert resolve_last_working_day("terminated", None, SEEN_ON) == SEEN_ON

    def test_an_end_date_on_an_active_record_is_ignored(self):
        """A withdrawn resignation leaves its date behind. Treating that as a
        leaving date would lock out somebody who is still here."""
        assert resolve_last_working_day("active", date(2026, 8, 22), SEEN_ON) is None

    def test_external_is_not_a_departure(self):
        """The passport record behind a CSM Pro supervisor login."""
        assert resolve_last_working_day("external", None, SEEN_ON) is None


class TestApplyingTheSync:
    def test_a_resignation_is_written_onto_the_tutor(self, db_session):
        tutor = _tutor(db_session, "Mr Ivan Chen", tutor_id=7)

        result = apply_employment(
            db_session, [_record(7, "resigned", "2026-08-22")], seen_on=SEEN_ON
        )

        db_session.refresh(tutor)
        assert tutor.departure_effective_on == date(2026, 8, 22)
        assert result.marked == 1
        assert result.checked == 1

    def test_a_withdrawn_resignation_clears_the_date(self, db_session):
        tutor = _tutor(db_session, "Mr Ivan Chen", tutor_id=7, departure=date(2026, 8, 22))

        result = apply_employment(db_session, [_record(7, "active")], seen_on=SEEN_ON)

        db_session.refresh(tutor)
        assert tutor.departure_effective_on is None
        assert result.cleared == 1

    def test_an_unchanged_record_is_left_alone(self, db_session):
        _tutor(db_session, "Mr Ivan Chen", tutor_id=7, departure=date(2026, 8, 22))

        result = apply_employment(
            db_session, [_record(7, "resigned", "2026-08-22")], seen_on=SEEN_ON
        )

        assert result.unchanged == 1
        assert result.marked == 0

    def test_tutors_ark_does_not_mention_are_untouched(self, db_session):
        """The Supervisor and Guest accounts exist only in CSM, so a date set
        on one by hand has to survive every run."""
        supervisor = _tutor(
            db_session, "Ms Stella Sou", tutor_id=12,
            departure=date(2026, 7, 1), teaches=False,
        )

        apply_employment(db_session, [_record(7, "active")], seen_on=SEEN_ON)

        db_session.refresh(supervisor)
        assert supervisor.departure_effective_on == date(2026, 7, 1)

    def test_a_link_to_a_missing_tutor_is_reported_not_fatal(self, db_session):
        result = apply_employment(db_session, [_record(999, "resigned", "2026-08-22")], seen_on=SEEN_ON)

        assert result.unlinked_tutor_ids == [999]
        assert result.checked == 0


class TestReconciliation:
    def test_teaching_staff_with_no_ark_record_are_listed(self, db_session):
        """The guard only works for people ARK knows about, so the gap has to
        be visible rather than assumed away."""
        _tutor(db_session, "Mr Kent Choi", tutor_id=18)
        _tutor(db_session, "Ms Bella Chang", tutor_id=1)

        missing = tutors_missing_from_ark(db_session, [_record(1)])

        assert [t.id for t in missing] == [18]

    def test_non_teaching_accounts_are_not_expected_in_ark(self, db_session):
        _tutor(db_session, "Center MSA", tutor_id=14, teaches=False)

        assert tutors_missing_from_ark(db_session, []) == []


class TestOverrunReport:
    def test_it_finds_work_booked_past_a_last_working_day(self, db_session, client):
        tutor = _tutor(db_session, "Mr Ivan Chen", tutor_id=7)
        student = Student(student_name="A Student", grade="F2")
        db_session.add(student)
        db_session.commit()
        for day in (25, 26, 29):
            db_session.add(SessionLog(
                student_id=student.id,
                tutor_id=tutor.id,
                session_date=date(2026, 8, day),
                time_slot="10:00 - 11:30",
                location="MSB",
                session_status="Scheduled",
            ))
        db_session.commit()
        # The resignation lands after the lessons are already in the diary,
        # which is the order this always happens in.
        tutor.departure_effective_on = date(2026, 8, 22)
        db_session.commit()

        rows = (
            db_session.query(SessionLog)
            .join(Tutor, SessionLog.tutor_id == Tutor.id)
            .filter(Tutor.departure_effective_on.isnot(None))
            .filter(SessionLog.session_date > Tutor.departure_effective_on)
            .all()
        )

        assert len(rows) == 3
