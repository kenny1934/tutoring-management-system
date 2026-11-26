"""Earlier first weekdays use synthetic intakes and never access shared data."""
from copy import deepcopy
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingPayment
from billing.schedule_adjustments import preview, apply
from billing.workflow import payment_detail
from models import Enrollment, SessionLog
from routers import enrollments
from schemas import ScheduleChangeRequest, ApplyScheduleChangeRequest
from tests.test_billing_intake import intake_env, env, draft_env, intake_request, confirmed
from tests.test_billing_returning_intake import earlier, clock, preferences
from tests.test_billing_workflow import pay_payload


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'First-session checks may only use synthetic SQLite records.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def first_payment(intake_env, monkeypatch, mode='returning_student', paid=True):
    client, db, actor = intake_env
    if mode == 'returning_student':
        earlier(db)
    clock(monkeypatch, date(2026, 11, 26))
    monkeypatch.setattr(enrollments, 'billing_today', lambda fallback: date(2026, 11, 26))
    preferences(client)
    payload = intake_request(client, trial=False)
    payload['scenario'].update(first_lesson_date='2026-11-27', slots=[{
        'weekday': 'Fri', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}])
    _, _, detail = confirmed(client, payload)
    assert detail['review']['scenario']['mode'] == mode
    if paid:
        response = client.post(f"/api/billing/payments/{detail['id']}/paid", json=pay_payload(detail))
        assert response.status_code == 200, response.text
    payment = db.get(BillingPayment, detail['id'])
    block = db.get(Enrollment, detail['lines'][0]['enrollment_id'])
    return client, db, actor, payment, block


def request(effective=date(2026, 11, 25)):
    return ScheduleChangeRequest(assigned_day='Wed', assigned_time='16:00 - 17:30',
        location='MSA', tutor_id=1, effective_date=effective, review_period=True)


@pytest.mark.parametrize('mode', ['new_student', 'returning_student'])
@pytest.mark.parametrize('paid', [True, False])
def test_first_friday_can_move_to_wednesday_before_its_original_start(intake_env, monkeypatch, mode, paid):
    client, db, actor, payment, block = first_payment(intake_env, monkeypatch, mode, paid)
    original_quote = deepcopy(payment.snapshot['review'])
    original_received = payment.received_amount
    original_end = original_quote['period']['coverage_through']
    old_count = block.lessons_paid
    default = preview(db, block, request(None), as_of=date(2026, 11, 26))
    assert default['effective_date'] == '2026-11-27'
    assert default['effective_date_min'] == '2026-11-23'
    proposal = preview(db, block, request(), as_of=date(2026, 11, 26))
    assert not proposal['issues']
    assert proposal['first_lesson_date'] == '2026-11-25'
    assert proposal['previous_first_lesson_date'] == '2026-11-27'
    assert proposal['moves'][0]['date'] == '2026-11-25'
    assert proposal['coverage_through'] == original_end
    if mode == 'returning_student':
        assert old_count == 4 and proposal['new_count'] == 6
        assert proposal['additional_amount'] == 800
    data = ApplyScheduleChangeRequest(**request().model_dump(exclude={'review_period'}),
        expected_adjustment_hash=proposal['review_hash'], idempotency_key='earlier-first',
        reason='The new timetable began this Wednesday.')
    with pytest.raises(HTTPException, match='Confirm the past dates'):
        apply(db, block.id, data, actor, as_of=date(2026, 11, 26))
    assert block.first_lesson_date == date(2026, 11, 27)
    data.acknowledge_past_dates = True
    apply(db, block.id, data, actor, as_of=date(2026, 11, 26));db.commit()
    assert block.first_lesson_date == date(2026, 11, 25)
    evidence = payment.snapshot['teaching_schedules']['enrollments'][str(block.id)]
    assert evidence['first_lesson_date'] == '2026-11-25'
    detail = payment_detail(db, payment)
    assert detail.review_issues == []
    assert detail.review.period.coverage_through.isoformat() == original_end
    assert payment.received_amount == original_received
    if paid:
        assert payment.snapshot['review'] == original_quote
        assert block.payment_status == 'Partially Paid'
        assert all(row.financial_status == 'Unpaid' for row in db.query(SessionLog).filter(
            SessionLog.enrollment_id == block.id, SessionLog.session_date.in_(proposal['added_dates'])))
    else:
        assert block.payment_status == 'Pending Payment'
        assert block.payment_deadline == date(2026, 11, 25)
    # Later edits preserve the recorded earlier start, and arbitrary date drift is still detected.
    client.app.include_router(enrollments.router, prefix='/api')
    response = client.patch(f'/api/enrollments/{block.id}/apply-schedule-change', json={
        'assigned_day': 'Wed', 'assigned_time': '18:00 - 19:30', 'location': 'MSA', 'tutor_id': 1,
        'apply_to_sessions': False})
    assert response.status_code == 200, response.text
    assert block.first_lesson_date == date(2026, 11, 25)
    assert payment_detail(db, payment).review_issues == []
    block.first_lesson_date = date(2026, 11, 24)
    assert payment_detail(db, payment).review_issues


def test_first_week_limit_rejects_an_unrelated_earlier_week(intake_env, monkeypatch):
    _, db, _, _, block = first_payment(intake_env, monkeypatch)
    with pytest.raises(HTTPException, match='within the billing period'):
        preview(db, block, request(date(2026, 11, 18)), as_of=date(2026, 11, 26))


def test_earlier_first_date_still_checks_overlapping_attendance(intake_env, monkeypatch):
    _, db, _, _, block = first_payment(intake_env, monkeypatch)
    db.add(SessionLog(student_id=102, tutor_id=1, session_date=date(2026, 11, 25),
        time_slot='16:15 - 17:45', location='MSA', session_status='Attended', financial_status='Paid'))
    db.commit()
    proposal = preview(db, block, request(), as_of=date(2026, 11, 26))
    assert any('already has a lesson' in issue for issue in proposal['issues'])


def test_http_first_week_preview_and_save_use_the_same_earlier_start(intake_env, monkeypatch):
    client, db, _, payment, block = first_payment(intake_env, monkeypatch)
    client.app.include_router(enrollments.router, prefix='/api')
    data = request().model_dump(mode='json')
    response = client.post(f'/api/enrollments/{block.id}/schedule-change-preview', json=data)
    assert response.status_code == 200, response.text
    proposal = response.json()['period_adjustment']
    assert proposal['effective_date_min'] == '2026-11-23'
    assert proposal['previous_first_lesson_date'] == '2026-11-27'
    assert proposal['first_lesson_date'] == '2026-11-25'
    data.pop('review_period')
    data.update(expected_adjustment_hash=proposal['review_hash'], idempotency_key='earlier-first-http',
        reason='The first lesson moved to Wednesday.')
    url = f'/api/enrollments/{block.id}/apply-schedule-change'
    assert client.patch(url, json=data).status_code == 422
    data['acknowledge_past_dates'] = True
    response = client.patch(url, json=data)
    assert response.status_code == 200, response.text
    assert client.patch(url, json=data).json() == response.json()
    assert db.query(SessionLog).filter_by(enrollment_id=block.id, session_date=date(2026, 11, 25)).count() == 1
    assert payment_detail(db, payment).review_issues == []
