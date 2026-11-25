"""Real editor handlers against confirmed payments in an isolated SQLite database."""
import asyncio
from copy import deepcopy
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingLessonClaim, BillingPayment
from billing.workflow import payment_detail
from models import Enrollment, SessionLog, Tutor
from routers import enrollments, sessions
from schemas import ApplyScheduleChangeRequest, SessionUpdate
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env, confirmed, pay_payload


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Schedule checks must never connect to application data.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


def originals(db, enrollment_id):
    return db.query(SessionLog).filter_by(enrollment_id=enrollment_id, make_up_for_id=None).order_by(SessionLog.session_date).all()


def setup_payment(env, paid=False):
    client, db, actor = env
    _, _, detail = confirmed(client)
    if paid:
        response = client.post(f"/api/billing/payments/{detail['id']}/paid", json=pay_payload(detail))
        assert response.status_code == 200, response.text
        detail = response.json()
    db.add(Tutor(id=2, tutor_name='Another tutor', user_email='other@example.test', role='Tutor'))
    db.commit()
    return client, db, actor, db.get(BillingPayment, detail['id']), detail['lines'][0]['enrollment_id']


@pytest.mark.parametrize('paid', [False, True])
@pytest.mark.parametrize('field', ['tutor_id', 'time_slot', 'session_date', 'location'])
def test_session_editor_preserves_payment_and_can_collect_afterwards(env, paid, field):
    client, db, actor, payment, eid = setup_payment(env, paid)
    lesson = originals(db, eid)[0]
    old_quote = deepcopy(payment.snapshot['review'])
    old_date = lesson.session_date
    values = {'tutor_id': 2, 'time_slot': '12:00 - 13:30',
              'session_date': old_date - timedelta(days=1), 'location': 'MSB'}
    result = asyncio.run(sessions.update_session(lesson.id, SessionUpdate(**{field: values[field]}), actor, db))
    assert getattr(result, field) == values[field]
    assert payment.snapshot['review'] == old_quote
    claim = db.query(BillingLessonClaim).filter_by(session_id=lesson.id).one()
    assert claim.lesson_date == lesson.session_date
    assert claim.location == lesson.location
    detail = payment_detail(db, payment)
    assert detail.review_issues == []
    assert len(payment.snapshot['schedule_changes']) == 1
    assert detail.status == ('Paid' if paid else 'Pending Payment')
    if not paid:
        response = client.post(f'/api/billing/payments/{payment.id}/paid', json=pay_payload(detail.model_dump(mode='json')))
        assert response.status_code == 200, response.text
        assert all(row.financial_status == 'Paid' for row in originals(db, eid))


@pytest.mark.parametrize('paid', [False, True])
@pytest.mark.parametrize('apply_to_sessions', [False, True])
def test_enrollment_editor_preserves_count_fees_and_original_quote(env, monkeypatch, paid, apply_to_sessions):
    _, db, actor, payment, eid = setup_payment(env, paid)
    monkeypatch.setattr(enrollments, 'billing_today', lambda _: date(2026, 10, 17))
    old_quote = deepcopy(payment.snapshot['review'])
    before = [(row.id, row.session_date, row.financial_status) for row in originals(db, eid)]
    result = asyncio.run(enrollments.apply_schedule_change(eid, ApplyScheduleChangeRequest(
        assigned_day='Thu', assigned_time='12:00 - 13:30', location='MSA', tutor_id=2,
        apply_to_sessions=apply_to_sessions), db, actor))
    assert result.sessions_updated == (len(before) if apply_to_sessions else 0)
    assert payment.snapshot['review'] == old_quote
    assert payment_detail(db, payment).review_issues == []
    enrollment = db.get(Enrollment, eid)
    assert (enrollment.tutor_id, enrollment.assigned_day, enrollment.assigned_time) == (2, 'Thu', '12:00 - 13:30')
    after = originals(db, eid)
    assert [r.id for r in after] == [r[0] for r in before]
    assert [r.financial_status for r in after] == [r[2] for r in before]
    if apply_to_sessions:
        assert all(row.tutor_id == 2 and row.session_date.weekday() == 3 and row.time_slot == '12:00 - 13:30' for row in after)
    else:
        assert [r.session_date for r in after] == [r[1] for r in before]


def test_repeated_edit_retains_original_claim_and_stale_payment_write_is_rejected(env):
    client, db, actor, payment, eid = setup_payment(env)
    lesson = originals(db, eid)[0]
    original_day = lesson.session_date
    before = payment_detail(db, payment).model_dump(mode='json')
    for offset in (1, 2):
        asyncio.run(sessions.update_session(lesson.id, SessionUpdate(session_date=original_day-timedelta(days=offset)), actor, db))
    evidence = payment.snapshot['teaching_schedules']['lessons'][str(lesson.id)]
    assert evidence['original']['date'] == original_day.isoformat()
    assert len(payment.snapshot['schedule_changes']) == 2
    assert payment_detail(db, payment).review_issues == []
    response = client.post(f'/api/billing/payments/{payment.id}/paid', json=pay_payload(before))
    assert response.status_code == 409


def test_schedule_changes_do_not_hide_later_tampering(env):
    _, db, actor, payment, eid = setup_payment(env)
    lesson = originals(db, eid)[0]
    asyncio.run(sessions.update_session(lesson.id, SessionUpdate(time_slot='12:00 - 13:30'), actor, db))
    lesson.session_date += timedelta(days=1)
    db.commit()
    assert payment_detail(db, payment).review_issues


@pytest.mark.parametrize('case', ['collision', 'cancel', 'year'])
def test_invalid_session_changes_leave_payment_and_claim_intact_after_rollback(env, case):
    _, db, actor, payment, eid = setup_payment(env)
    first, second, *_ = originals(db, eid)
    before = (first.session_date, payment.version, deepcopy(payment.snapshot))
    changes = {'collision': {'session_date': second.session_date}, 'cancel': {'session_status': 'Cancelled'},
               'year': {'session_date': date(2027, 9, 2)}}[case]
    with pytest.raises(HTTPException):
        asyncio.run(sessions.update_session(first.id, SessionUpdate(**changes), actor, db))
    db.rollback()
    assert (first.session_date, payment.version, payment.snapshot) == before
    assert payment_detail(db, payment).review_issues == []


def test_enrollment_schedule_change_leaves_completed_lessons_untouched(env, monkeypatch):
    _, db, actor, payment, eid = setup_payment(env)
    monkeypatch.setattr(enrollments, 'billing_today', lambda _: date(2026, 10, 17))
    first, *_ = originals(db, eid)
    first.session_status = 'Attended'
    db.commit()
    before = (first.session_date, first.time_slot, first.tutor_id)
    asyncio.run(enrollments.apply_schedule_change(eid, ApplyScheduleChangeRequest(
        assigned_day='Thu', assigned_time='12:00 - 13:30', location='MSA', tutor_id=2,
        apply_to_sessions=True), db, actor))
    assert (first.session_date, first.time_slot, first.tutor_id) == before
    assert payment_detail(db, payment).review_issues == []


def test_session_editor_preserves_ownership_checks(env):
    _, db, actor, payment, eid = setup_payment(env)
    lesson = originals(db, eid)[0]
    other = db.get(Tutor, 2)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(sessions.update_session(lesson.id, SessionUpdate(time_slot='12:00 - 13:30'), other, db))
    assert exc.value.status_code == 403
    db.rollback()
    owner = db.get(Tutor, actor.id)
    owner.role = 'Tutor'
    asyncio.run(sessions.update_session(lesson.id, SessionUpdate(time_slot='12:00 - 13:30'), owner, db))
    assert lesson.time_slot == '12:00 - 13:30'
    assert payment_detail(db, payment).review_issues == []


def test_two_lessons_can_exchange_dates_without_losing_claims(env, monkeypatch):
    _, db, actor, payment, eid = setup_payment(env)
    monkeypatch.setattr(enrollments, 'billing_today', lambda _: date(2026, 10, 17))
    first, second, *_ = originals(db, eid)
    first_date, second_date = first.session_date, second.session_date
    asyncio.run(enrollments.apply_schedule_change(eid, ApplyScheduleChangeRequest(
        assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1,
        apply_to_sessions=True, date_overrides={first.id: second_date.isoformat(), second.id: first_date.isoformat()}), db, actor))
    assert (first.session_date, second.session_date) == (second_date, first_date)
    assert payment_detail(db, payment).review_issues == []
    assert db.query(BillingLessonClaim).filter_by(payment_id=payment.id).count() == len(originals(db, eid))


def test_tutor_change_does_not_reject_an_existing_timetable_overlap(env):
    _, db, actor, payment, eid = setup_payment(env)
    lesson = originals(db, eid)[0]
    # A pre-existing cross-branch overlap must not prevent correcting its tutor.
    db.add(SessionLog(student_id=lesson.student_id, tutor_id=1,
        enrollment_id=11, session_date=lesson.session_date, time_slot=lesson.time_slot,
        location='MSB', session_status='Scheduled', financial_status='Paid'))
    db.commit()
    asyncio.run(sessions.update_session(lesson.id, SessionUpdate(tutor_id=2), actor, db))
    assert lesson.tutor_id == 2
    assert payment_detail(db, payment).review_issues == []
