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
from tests.test_makeup_entitlement_verification import records, preview, commit_change, future_booking, course, NOW
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
