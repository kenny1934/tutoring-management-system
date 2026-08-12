"""
Tests for parent communication helper functions.

Covers:
- calculate_contact_status() — classifies days since contact into status labels
- the bulk create endpoint, which logs one contact against many students
- the statistics endpoint's type distribution, which used to name the three
  types it counted and is now blind to which types exist
"""
import asyncio
import pytest
import sys
import os
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Enrollment, ParentCommunication, Student, Tutor
from routers.parent_communications import (
    calculate_contact_status,
    create_communications_bulk,
    get_communication_stats,
)
from schemas import ParentCommunicationBulkCreate


class TestCalculateContactStatus:
    """Test suite for calculate_contact_status function."""

    # Default thresholds: recent=28, warning=50

    def test_never_contacted(self):
        """999+ days = Never Contacted."""
        assert calculate_contact_status(999, 28, 50) == "Never Contacted"
        assert calculate_contact_status(1500, 28, 50) == "Never Contacted"

    def test_recent_within_threshold(self):
        """Days ≤ recent_threshold = Recent."""
        assert calculate_contact_status(0, 28, 50) == "Recent"
        assert calculate_contact_status(10, 28, 50) == "Recent"

    def test_recent_at_boundary(self):
        """Exactly at recent threshold = Recent (≤)."""
        assert calculate_contact_status(28, 28, 50) == "Recent"

    def test_been_a_while(self):
        """Between recent and warning thresholds."""
        assert calculate_contact_status(35, 28, 50) == "Been a While"

    def test_been_a_while_at_boundary(self):
        """Exactly at warning threshold = Been a While (≤)."""
        assert calculate_contact_status(50, 28, 50) == "Been a While"

    def test_contact_needed(self):
        """Beyond warning threshold = Contact Needed."""
        assert calculate_contact_status(51, 28, 50) == "Contact Needed"
        assert calculate_contact_status(100, 28, 50) == "Contact Needed"

    def test_custom_thresholds(self):
        """Works with non-default thresholds."""
        assert calculate_contact_status(10, 14, 30) == "Recent"
        assert calculate_contact_status(14, 14, 30) == "Recent"
        assert calculate_contact_status(15, 14, 30) == "Been a While"
        assert calculate_contact_status(30, 14, 30) == "Been a While"
        assert calculate_contact_status(31, 14, 30) == "Contact Needed"


class TestBulkCreate:
    """One round of calls, logged once. The chase list can tick twenty families
    and record the same contact against all of them."""

    def _tutor(self, db_session):
        t = Tutor(user_email="bulk@test.com", tutor_name="Ms Ho", role="Tutor",
                  is_active_tutor=True)
        db_session.add(t)
        db_session.commit()
        return t

    def _students(self, db_session, count):
        made = []
        for i in range(count):
            s = Student(student_name=f"Student {i}", grade="F1", home_location="MSA")
            db_session.add(s)
            made.append(s)
        db_session.commit()
        return made

    def _call(self, db_session, payload, tutor):
        # A private loop rather than asyncio.run(): that clears the process's
        # current event loop on the way out, and tests elsewhere in the suite
        # still reach for it with get_event_loop().
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(create_communications_bulk(
                data=payload, tutor_id=tutor.id, created_by="admin@test.com",
                db=db_session, _=tutor,
            ))
        finally:
            loop.close()

    def test_one_record_per_student(self, db_session):
        tutor = self._tutor(db_session)
        students = self._students(db_session, 3)

        result = self._call(db_session, ParentCommunicationBulkCreate(
            student_ids=[s.id for s in students],
            contact_method="Phone",
            contact_type="General",
            brief_notes="rang about the September course",
        ), tutor)

        assert result.created == 3
        assert result.skipped == []
        rows = db_session.query(ParentCommunication).all()
        assert len(rows) == 3
        assert {r.student_id for r in rows} == {s.id for s in students}
        # The same contact, so the same details on every row.
        assert {r.brief_notes for r in rows} == {"rang about the September course"}
        assert {r.contact_date for r in rows} == {rows[0].contact_date}
        assert {r.tutor_id for r in rows} == {tutor.id}

    def test_a_student_that_no_longer_exists_is_reported_not_fatal(self, db_session):
        """The list a batch was picked from can be minutes out of date."""
        tutor = self._tutor(db_session)
        students = self._students(db_session, 2)

        result = self._call(db_session, ParentCommunicationBulkCreate(
            student_ids=[students[0].id, 999_999, students[1].id],
        ), tutor)

        assert result.created == 2
        assert result.skipped == [999_999]
        assert db_session.query(ParentCommunication).count() == 2

    def test_a_repeated_id_is_logged_once(self, db_session):
        tutor = self._tutor(db_session)
        student = self._students(db_session, 1)[0]

        result = self._call(db_session, ParentCommunicationBulkCreate(
            student_ids=[student.id, student.id],
        ), tutor)

        assert result.created == 1
        assert db_session.query(ParentCommunication).count() == 1

    def test_an_unknown_tutor_is_rejected(self, db_session):
        student = self._students(db_session, 1)[0]
        ghost = Tutor(id=4242, user_email="ghost@test.com", tutor_name="Nobody")

        with pytest.raises(HTTPException) as exc:
            self._call(db_session, ParentCommunicationBulkCreate(
                student_ids=[student.id],
            ), ghost)

        assert exc.value.status_code == 404
        assert db_session.query(ParentCommunication).count() == 0

    def test_the_batch_is_capped(self):
        """A selection that large is a mis-click on select-all, not a round of
        calls, and a note claiming otherwise is worse than no note."""
        with pytest.raises(ValidationError):
            ParentCommunicationBulkCreate(student_ids=list(range(1, 202)))
        with pytest.raises(ValidationError):
            ParentCommunicationBulkCreate(student_ids=[])


class TestTypeDistribution:
    """The 30-day split by contact type on the parent-contacts dashboard.

    It used to count 'Progress Update', 'Concern' and 'General' in three CASE
    expressions that named them, so a fourth type was absent from the figures
    however many contacts were logged under it. That is the thing being tested
    here: the query is now blind to which types exist.
    """

    def _world(self, db_session, types):
        """One active student per contact type, each with one contact logged
        today, since the statistics only count students who are enrolled."""
        tutor = Tutor(user_email="stats@test.com", tutor_name="Ms Ho", role="Tutor",
                      is_active_tutor=True)
        db_session.add(tutor)
        db_session.commit()

        for i, contact_type in enumerate(types):
            student = Student(student_name=f"Student {i}", grade="F1", home_location="MSA")
            db_session.add(student)
            db_session.commit()
            db_session.add(Enrollment(
                student_id=student.id, tutor_id=tutor.id, location="MSA",
                enrollment_type="Regular", first_lesson_date=date.today() - timedelta(days=7),
                lessons_paid=20, payment_status="Paid",
                assigned_day="Wednesday", assigned_time="16:45 - 18:15",
            ))
            db_session.add(ParentCommunication(
                student_id=student.id, tutor_id=tutor.id,
                contact_date=datetime.now(), contact_method="Phone",
                contact_type=contact_type,
            ))
        db_session.commit()
        return tutor

    def _stats(self, db_session, tutor):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(get_communication_stats(
                tutor_id=None, location=None, _=tutor, db=db_session,
            ))
        finally:
            loop.close()

    def test_a_type_nobody_named_is_still_counted(self, db_session):
        tutor = self._world(db_session, ["Course Renewal", "Course Renewal", "Concern"])

        stats = self._stats(db_session, tutor)

        assert stats.type_counts == {"Course Renewal": 2, "Concern": 1}

    def test_a_type_with_nothing_against_it_is_absent_rather_than_zero(self, db_session):
        tutor = self._world(db_session, ["General"])

        assert self._stats(db_session, tutor).type_counts == {"General": 1}

    def test_the_weekly_totals_count_every_contact(self, db_session):
        """The split is by type, but this week and last week are everybody, so
        they are summed back across the groups rather than read off one row."""
        tutor = self._world(db_session, ["Course Renewal", "Concern", "General"])

        stats = self._stats(db_session, tutor)

        assert stats.contacts_this_week == 3
        assert sum(stats.type_counts.values()) == 3
