"""Existing workflow routes must enforce the common policy, using only SQLite."""
import asyncio
from datetime import date, datetime
from inspect import signature

import pytest
from fastapi import HTTPException
from fastapi.params import Query
from sqlalchemy import event
from sqlalchemy.engine import Engine

from models import Enrollment, ExtensionRequest, SessionLog, Tutor
from routers import sessions, extension_requests
from schemas import SessionUpdate, ScheduleMakeupRequest, ExtensionRequestApprove
from tests.test_makeup_entitlement_verification import records, prepaid_starter, preview, commit_change, future_booking, course, NOW
from utils.makeup_validators import validate_makeup_constraints


@pytest.fixture(autouse=True)
def isolation_and_clock(monkeypatch):
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Route checks only permit disposable SQLite.'
    event.listen(Engine, 'do_connect', reject)
    monkeypatch.setattr(sessions, 'hk_now', lambda: datetime(2027, 3, 20, 12))
    yield
    event.remove(Engine, 'do_connect', reject)


def query(handler, **kwargs):
    args = {name: param.default.default for name, param in signature(handler).parameters.items()
            if isinstance(param.default, Query)}
    return handler(**(args | kwargs))


def test_shared_validator_replaces_both_legacy_limits(records):
    db, _ = records
    source = db.get(SessionLog, 110)
    validate_makeup_constraints(db, 101, source, date(2027, 6, 30), '10:00 - 11:30', 'MSA')
    with pytest.raises(HTTPException) as caught:
        validate_makeup_constraints(db, 101, source, date(2027, 7, 1), '10:00 - 11:30', 'MSA')
    assert caught.value.detail['error'] == 'MAKEUP_YEAR_ENDED'


def test_direct_booking_preserves_original_and_fee(records):
    db, actor = records
    before = db.get(Enrollment, 11).revenue_total
    result = asyncio.run(sessions.schedule_makeup(110, ScheduleMakeupRequest(
        session_date=date(2027, 6, 30), time_slot='10:00 - 11:30', location='MSA', tutor_id=2), actor, db))
    assert result.makeup_session.make_up_for_id == 110
    assert result.makeup_session.enrollment_id == 11
    assert result.makeup_session.financial_status == 'Paid'
    assert db.get(Enrollment, 11).revenue_total == before
    assert db.get(SessionLog, 110).rescheduled_to_id == result.makeup_session.id


def test_prepaid_first_course_can_book_through_real_route_before_start(prepaid_starter):
    db, actor = prepaid_starter
    result = asyncio.run(sessions.schedule_makeup(310, ScheduleMakeupRequest(
        session_date=date(2027, 4, 1), time_slot='10:00 - 11:30', location='MSA', tutor_id=2), actor, db))
    assert result.makeup_session.make_up_for_id == 310
    assert result.makeup_session.enrollment_id == 31
    assert result.makeup_session.financial_status == 'Paid'
    assert db.get(SessionLog, 310).session_date == date(2027, 4, 5)
    assert db.get(SessionLog, 310).rescheduled_to_id == result.makeup_session.id


@pytest.mark.parametrize('payment', ['Pending Payment', 'Overdue'])
@pytest.mark.parametrize('course_started', [False, True])
def test_unpaid_source_can_be_rescheduled_and_booked_without_settlement(prepaid_starter, monkeypatch, payment, course_started):
    db, actor = prepaid_starter
    if course_started:
        from services import makeup_entitlement
        monkeypatch.setattr(makeup_entitlement, '_today', lambda: date(2027, 4, 6))
        monkeypatch.setattr(sessions, 'hk_now', lambda: datetime(2027, 4, 6, 12))
    enrollment = db.get(Enrollment, 31)
    enrollment.payment_status = payment
    enrollment.payment_date = None
    source = db.get(SessionLog, 310)
    source.session_status = 'Scheduled'
    source.financial_status = 'Unpaid'
    db.commit()
    result = asyncio.run(sessions.mark_session_rescheduled(310, actor, db))
    assert result.session_status == 'Rescheduled - Pending Make-up'
    revenue = enrollment.revenue_total
    result = asyncio.run(sessions.schedule_makeup(310, ScheduleMakeupRequest(
        session_date=date(2027, 4, 10), time_slot='10:00 - 11:30', location='MSA', tutor_id=2), actor, db))
    replacement = result.makeup_session
    assert replacement.financial_status == source.financial_status == 'Unpaid'
    assert replacement.enrollment_id == source.enrollment_id == 31
    assert source.rescheduled_to_id == replacement.id
    assert (enrollment.payment_status, enrollment.payment_date, enrollment.revenue_total) == (payment, None, revenue)
    # A second move and an edit must remain possible before payment arrives.
    asyncio.run(sessions.update_session(replacement.id, SessionUpdate(time_slot='11:45 - 13:15'), actor, db))
    asyncio.run(sessions.mark_session_rescheduled(replacement.id, actor, db))
    next_booking = asyncio.run(sessions.schedule_makeup(replacement.id, ScheduleMakeupRequest(
        session_date=date(2027, 4, 17), time_slot='10:00 - 11:30', location='MSA', tutor_id=2), actor, db))
    assert next_booking.makeup_session.financial_status == 'Unpaid'
    assert next_booking.makeup_session.enrollment_id == 31
    assert next_booking.makeup_session.make_up_for_id == replacement.id
    assert db.get(SessionLog, 310).session_date == date(2027, 4, 5)


@pytest.mark.parametrize('replacement_chain', [False, True])
def test_early_booking_preserves_paid_source_and_replacement_links(records, replacement_chain):
    db, actor = records
    enrollment = course(db, 13, date(2026, 12, 5), count=3,
                        status='Rescheduled - Pending Make-up')
    db.commit()
    source_id = 130
    if replacement_chain:
        replacement = future_booking(db, source_id=source_id, when=date(2026, 12, 4))
        replacement.session_status = 'Rescheduled - Pending Make-up'
        db.commit()
        source_id = replacement.id
    revenue = enrollment.revenue_total
    result = asyncio.run(sessions.schedule_makeup(source_id, ScheduleMakeupRequest(
        session_date=date(2026, 12, 3), time_slot='10:00 - 11:30',
        location='MSA', tutor_id=2), actor, db))
    assert result.makeup_session.session_date == date(2026, 12, 3)
    assert result.makeup_session.make_up_for_id == source_id
    assert result.makeup_session.enrollment_id == 13
    assert result.makeup_session.financial_status == 'Paid'
    assert db.get(SessionLog, source_id).rescheduled_to_id == result.makeup_session.id
    assert db.get(SessionLog, source_id).session_status == 'Rescheduled - Make-up Booked'
    assert db.get(SessionLog, 130).session_date == date(2026, 12, 5)
    assert db.get(Enrollment, 13).revenue_total == revenue
    if replacement_chain:
        assert db.get(SessionLog, 130).rescheduled_to_id == source_id


def test_unrelated_tutor_cannot_direct_book_new_policy_student(records):
    db, _ = records
    with pytest.raises(HTTPException) as caught:
        asyncio.run(sessions.schedule_makeup(110, ScheduleMakeupRequest(
            session_date=date(2027, 4, 10), time_slot='10:00 - 11:30', location='MSA', tutor_id=3), db.get(Tutor, 3), db))
    assert caught.value.status_code == 403
    assert db.get(SessionLog, 110).rescheduled_to_id is None


@pytest.mark.parametrize('change', [
    {'time_slot': '11:45 - 13:15'}, {'tutor_id': 2}, {'session_date': date(2027, 5, 1)},
])
def test_booking_edits_cannot_bypass_future_pause(records, change):
    db, actor = records
    commit_change(db, actor, preview(db, effective=date(2027, 4, 1)))
    booking = future_booking(db, when=date(2027, 4, 10))
    with pytest.raises(HTTPException) as caught:
        asyncio.run(sessions.update_session(booking.id, SessionUpdate(**change), actor, db))
    assert caught.value.detail['error'] == 'MAKEUP_PARTICIPATION_REQUIRED'


def test_cancelled_pause_history_cannot_be_reactivated_with_redo(records):
    db, actor = records
    booking = future_booking(db)
    commit_change(db, actor, preview(db))
    with pytest.raises(HTTPException):
        asyncio.run(sessions.redo_session_status(booking.id, 'Make-up Class', actor, db))
    assert db.get(SessionLog, booking.id).session_status == 'Cancelled'
    assert db.get(SessionLog, 110).rescheduled_to_id is None


def test_worklist_keeps_september_and_exposes_history(records, monkeypatch):
    db, _ = records
    rows = query(sessions.get_sessions, db=db, pending_makeups=True, limit=2000)
    assert [row.id for row in rows] == [110]
    assert rows[0].makeup_eligibility.valid_until == date(2027, 6, 30)
    monkeypatch.delenv('MAKEUP_ENTITLEMENT_ENABLED')
    assert query(sessions.get_sessions, db=db, pending_makeups=True, limit=2000) == []
    history = query(sessions.get_sessions, db=db, pending_makeups=True, include_history=True, limit=2000)
    assert [row.id for row in history] == [110]
    assert history[0].makeup_eligibility is None


def test_retired_extension_keeps_original_decision_in_history(records):
    db, actor = records
    db.add(ExtensionRequest(id=40, session_id=110, enrollment_id=11, student_id=101,
        tutor_id=2, requested_extension_weeks=2, reason='Synthetic earlier extension request',
        request_status='Pending', requested_by='owner@example.test', requested_at=datetime(2026, 11, 1)))
    db.commit()
    assert query(extension_requests.get_pending_count, db=db).count == 0
    assert query(extension_requests.get_extension_requests, db=db) == []
    history = query(extension_requests.get_extension_requests, db=db, include_resolved=True)
    assert len(history) == 1 and history[0].request_status == 'Pending'
    assert not history[0].action_required and history[0].disposition == 'No longer required'
    with pytest.raises(HTTPException) as caught:
        asyncio.run(extension_requests.approve_extension_request(40,
            ExtensionRequestApprove(extension_granted_weeks=2), actor, db))
    assert caught.value.status_code == 409
    assert db.get(ExtensionRequest, 40).request_status == 'Pending'
    assert db.get(Enrollment, 11).deadline_extension_weeks == 0


@pytest.mark.parametrize('has_debt', [False, True])
def test_pause_holds_unconfirmed_renewals_but_keeps_existing_debt(records, has_debt):
    from billing.queue import build_queue
    db, actor = records
    if has_debt:
        course(db, 13, date(2027, 4, 5), count=4, payment='Pending Payment')
        db.commit()
    commit_change(db, actor, preview(db))
    rows = build_queue(db, as_of=NOW, collection_month='2027-04', holidays=set())
    row = next(row for row in rows if row.student.id == 101)
    if has_debt:
        assert row.origin == 'legacy' and row.stage != 'no_payment'
        assert db.get(Enrollment, 13).payment_status == 'Pending Payment'
    else:
        assert row.stage == 'no_payment' and not row.ready_now
        assert row.note == 'Student paused'
