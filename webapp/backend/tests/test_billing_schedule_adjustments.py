"""Calendar count changes preserve receipt facts and every sold entitlement."""
from copy import deepcopy
from datetime import date, timedelta

import pytest
import makeup_models  # Register isolated participation tables before fixture creation.
from fastapi import HTTPException

from billing.models import BillingPayment
from billing.schemas import BillingSupplementPaidRequest
from billing.workflow import payment_detail
from billing.schedule_adjustments import preview, apply, record_supplement
from models import Enrollment, Holiday, SessionLog
from schemas import ScheduleChangeRequest, ApplyScheduleChangeRequest
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env, confirmed, pay_payload, next_review


def fixture_payment(env, paid=True, second_slot=False):
    client, db, actor = env
    source = db.get(Enrollment, 11)
    source.assigned_day, source.first_lesson_date = 'Tue', date(2026, 11, 24)
    for index, row in enumerate(db.query(SessionLog).filter_by(enrollment_id=11).order_by(SessionLog.id)):
        row.session_date = source.first_lesson_date + timedelta(weeks=index)
    if second_slot:
        db.add(Enrollment(id=12, student_id=101, tutor_id=1, assigned_day='Wed', assigned_time='16:00 - 17:30',
            location='MSA', lessons_paid=6, first_lesson_date=date(2026, 11, 25), payment_status='Paid',
            payment_date=date(2026, 11, 1), revenue_total=2400, is_new_student=False))
        db.flush()
        for index in range(6):
            db.add(SessionLog(id=120+index, enrollment_id=12, student_id=101, tutor_id=1,
                session_date=date(2026, 11, 25)+timedelta(weeks=index), session_status='Scheduled',
                financial_status='Paid', time_slot='16:00 - 17:30', location='MSA'))
    db.add(Holiday(holiday_date=date(2027, 1, 12), holiday_name='Invented closure'))
    db.commit()
    payload = next_review(client, [11, 12]) if second_slot else None
    if payload:
        payload['scenario'].update(payment_method='autopay', mandate_ready=True)
    _, _, detail = confirmed(client, method='autopay', ready=True, payload=payload)
    assert detail['review']['period']['kind'] == 'regular'
    assert detail['review']['period']['lesson_count'] == (7 if second_slot else 3)
    if paid:
        response = client.post(f"/api/billing/payments/{detail['id']}/paid", json=pay_payload(detail, method='autopay'))
        assert response.status_code == 200, response.text
    return client, db, actor, db.get(BillingPayment, detail['id']), db.get(Enrollment, detail['lines'][0]['enrollment_id'])


def change(db, enrollment, *, day='Fri', effective=date(2027, 1, 1), key='schedule-adjust-1'):
    request = ScheduleChangeRequest(assigned_day=day, assigned_time='16:00 - 17:30',
                                   location='MSA', tutor_id=1, effective_date=effective)
    proposal = preview(db, enrollment, request, as_of=date(2026, 11, 25))
    assert not proposal['issues'], proposal
    payload = ApplyScheduleChangeRequest(**request.model_dump(exclude={'review_period'}), expected_adjustment_hash=proposal['review_hash'],
                                        idempotency_key=key, reason='Permanent weekday change')
    return proposal, payload


def assert_integrity(db, payment):
    detail = payment_detail(db, payment)
    assert detail.review_issues == [], detail.review_issues
    return detail


def test_paid_three_to_five_preserves_receipt_and_collects_only_new_sessions(env):
    client, db, actor, payment, enrollment = fixture_payment(env)
    base = deepcopy(payment.snapshot['review'])
    receipt = (payment.payment_date, payment.received_amount, payment.received_method)
    proposal, payload = change(db, enrollment)
    assert proposal['additional_amount'] == 800 and proposal['new_count'] == 5
    result = apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    assert enrollment.lessons_paid == 5 and enrollment.payment_status == 'Partially Paid'
    roots = db.query(SessionLog).filter_by(enrollment_id=enrollment.id).all()
    assert sorted(row.financial_status for row in roots) == ['Paid'] * 3 + ['Unpaid'] * 2
    assert payment.snapshot['review'] == base
    assert (payment.payment_date, payment.received_amount, payment.received_method) == receipt
    detail = assert_integrity(db, payment)
    supplement = detail.supplementary_payments[0]
    data = BillingSupplementPaidRequest(expected_version=payment.version, idempotency_key='supplement-1',
        supplement_id=supplement.id, enrollment_id=enrollment.id, amount=800,
        payment_date=date(2026, 11, 25), method='bank_transfer', receipt_reference='SYNTHETIC-EXTRA')
    next_detail = record_supplement(db, payment, data, actor, as_of=date(2026, 11, 25))
    db.commit()
    assert enrollment.payment_status == 'Paid' and next_detail.outstanding_supplement_amount == 0
    assert all(row.financial_status == 'Paid' for row in roots)
    assert payment.snapshot['review'] == base
    assert (payment.payment_date, payment.received_amount, payment.received_method) == receipt
    assert record_supplement(db, payment, data, actor, as_of=date(2026, 11, 25)) == next_detail
    assert apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25)) == result
    assert len(db.query(SessionLog).filter_by(enrollment_id=enrollment.id).all()) == 5


def test_unpaid_increase_revises_bill_and_collection_pays_all_five(env):
    client, db, actor, payment, enrollment = fixture_payment(env, paid=False)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    detail = assert_integrity(db, payment)
    assert enrollment.payment_status == 'Pending Payment' and enrollment.lessons_paid == 5
    assert detail.review.period.total_fee == 2000 and not detail.supplementary_payments
    response = client.post(f'/api/billing/payments/{payment.id}/paid', json=pay_payload(detail.model_dump(mode='json'), method='autopay'))
    assert response.status_code == 200, response.text
    assert enrollment.payment_status == 'Paid'
    assert all(row.financial_status == 'Paid' for row in db.query(SessionLog).filter_by(enrollment_id=enrollment.id))


@pytest.mark.parametrize('paid', [True, False])
def test_five_to_three_keeps_all_five_entitlements_and_original_fee(env, paid):
    _, db, actor, payment, enrollment = fixture_payment(env, paid=paid)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    before = deepcopy(payment.snapshot['review'])
    proposal, payload = change(db, enrollment, day='Tue', key='change-back')
    assert len(proposal['pending_session_ids']) == 2 and proposal['additional_amount'] == 0
    assert proposal['new_count'] == 5
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    roots = db.query(SessionLog).filter_by(enrollment_id=enrollment.id).all()
    assert len(roots) == enrollment.lessons_paid == 5
    assert len([row for row in roots if row.session_status == 'Rescheduled - Pending Make-up']) == 2
    assert payment.snapshot['review']['period'] == before['period']
    if not paid:
        assert '2 sessions remain to be rescheduled' in payment.snapshot['review']['message']['en']
    assert_integrity(db, payment)


@pytest.mark.parametrize('case', ['calendar', 'status', 'date', 'hash'])
def test_stale_proposal_is_rejected_without_partial_writes(env, case):
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    if case == 'calendar':
        db.add(Holiday(holiday_date=date(2027, 1, 8), holiday_name='New closure'))
    elif case == 'status':
        db.query(SessionLog).filter_by(enrollment_id=enrollment.id).first().session_status = 'Attended'
    elif case == 'date':
        payload.effective_date = date(2027, 1, 2)
    else:
        payload.expected_adjustment_hash = '0' * 64
    db.commit()
    count = db.query(SessionLog).count()
    with pytest.raises(HTTPException):
        apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.rollback()
    assert enrollment.payment_status == 'Paid' and enrollment.lessons_paid == 3
    assert db.query(SessionLog).count() == count


def test_supplement_amount_tampering_is_detected(env):
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    snapshot = deepcopy(payment.snapshot)
    snapshot['supplementary_payments'][0]['amount'] = 400
    payment.snapshot = snapshot
    db.commit()
    assert payment_detail(db, payment).review_issues


def test_repeated_decrease_then_increase_reuses_pending_entitlements(env):
    _, db, actor, payment, enrollment = fixture_payment(env)
    for weekday, key in [('Fri', 'first-increase'), ('Tue', 'decrease'), ('Fri', 'increase-again')]:
        proposal, payload = change(db, enrollment, day=weekday, key=key)
        if key == 'increase-again':
            assert proposal['additional_amount'] == 0 and proposal['added_dates'] == []
        apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
        db.commit()
        assert_integrity(db, payment)
    assert enrollment.lessons_paid == 5
    assert len(payment.snapshot['supplementary_payments']) == 1
    assert all(row.session_status == 'Scheduled' for row in db.query(SessionLog).filter_by(enrollment_id=enrollment.id))


def test_original_and_added_revenue_allocations_are_preserved(env):
    from decimal import Decimal
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    assert all(row.billing_tuition_amount == Decimal('400') for row in db.query(SessionLog).filter_by(enrollment_id=enrollment.id))


def test_existing_paid_makeup_rights_and_unpaid_added_rights_survive(env, monkeypatch):
    from services import makeup_entitlement as service
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    roots = db.query(SessionLog).filter_by(enrollment_id=enrollment.id).all()
    facts = service._facts(db, [enrollment.student_id])
    intervals, problems = service._intervals(facts, enrollment.student_id)
    assert not problems
    assert any(item['enrollment_id'] == enrollment.id for item in intervals)
    for row in roots:
        row.session_status = 'Rescheduled - Pending Make-up'
    db.commit()
    monkeypatch.setenv('BILLING_MAKEUP_ENABLED', 'true')
    # Eligibility preserves separate current coverage and source payment facts.
    facts = service._facts(db, [enrollment.student_id])
    for row in roots:
        eligibility = service._eligibility(facts, row, as_of=date(2027, 1, 10), target_date=date(2027, 1, 20))
        assert eligibility.can_book, eligibility


def test_supplementary_balance_remains_in_payment_worklist(env):
    from billing.queue import pending_rows
    from billing.evidence import load_contexts
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    context = load_contexts(db, [enrollment.student_id], set(), as_of=date(2026, 11, 25), basis='include_pending')[enrollment.student_id]
    rows = pending_rows(context, [payment], {payment.id: [enrollment.id]}, {enrollment.id}, {}, date(2026, 11, 25), date(2027, 1, 31))
    assert len(rows) == 1 and rows[0].total_fee == 800 and rows[0].lesson_count == 2
    assert rows[0].payment_id == payment.id
    assert rows[0].payment_method == 'manual'


def test_supplement_route_keeps_authorisation_versions_and_receipt_history(env):
    client, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    item = payment.snapshot['supplementary_payments'][0]
    data = {'expected_version': payment.version, 'idempotency_key': 'http-supplement',
        'supplement_id': item['id'], 'enrollment_id': enrollment.id, 'amount': 800,
        'payment_date': '2026-10-17', 'method': 'cash'}
    url = f'/api/billing/payments/{payment.id}/supplement-paid'
    actor.role = 'Tutor'
    assert client.post(url, json=data).status_code == 403
    actor.role = 'Admin'
    assert client.post(url, json={**data, 'amount': 799}).status_code == 422
    response = client.post(url, json=data)
    assert response.status_code == 200, response.text
    assert response.json()['outstanding_supplement_amount'] == 0
    assert client.post(url, json=data).json() == response.json()
    assert client.post(url, json={**data, 'idempotency_key': 'duplicate-other-key'}).status_code == 409


def test_actual_schedule_editor_preview_apply_and_retry(env, monkeypatch):
    from routers import enrollments as routes
    client, db, actor, payment, enrollment = fixture_payment(env)
    monkeypatch.setattr(routes, 'billing_today', lambda _: date(2026, 11, 25))
    client.app.include_router(routes.router, prefix='/api')
    request = {'assigned_day': 'Fri', 'assigned_time': '16:00 - 17:30', 'location': 'MSA', 'tutor_id': 1, 'review_period': True, 'effective_date': '2027-01-01'}
    response = client.post(f'/api/enrollments/{enrollment.id}/schedule-change-preview', json=request)
    assert response.status_code == 200, response.text
    proposal = response.json()['period_adjustment']
    assert proposal['additional_amount'] == 800 and proposal['new_count'] == 5
    payload = {key: value for key, value in request.items() if key != 'review_period'}
    payload.update(expected_adjustment_hash=proposal['review_hash'], idempotency_key='editor-http-1', reason='Permanent change')
    url = f'/api/enrollments/{enrollment.id}/apply-schedule-change'
    result = client.patch(url, json=payload)
    assert result.status_code == 200, result.text
    assert client.patch(url, json=payload).json() == result.json()
    assert enrollment.lessons_paid == 5 and enrollment.payment_status == 'Partially Paid'
    assert_integrity(db, payment)


@pytest.mark.parametrize('case', ['before_period', 'after_period', 'past'])
def test_invalid_effective_dates_cannot_move_the_financial_boundary(env, case):
    _, db, _, _, enrollment = fixture_payment(env)
    effective, as_of = {'before_period': (date(2026, 12, 31), date(2026, 11, 25)),
        'after_period': (date(2027, 2, 1), date(2026, 11, 25)),
        'past': (date(2027, 1, 1), date(2027, 1, 10))}[case]
    request = ScheduleChangeRequest(assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1, effective_date=effective)
    with pytest.raises(HTTPException):
        preview(db, enrollment, request, as_of=as_of)


def test_effective_date_preserves_earlier_originals(env):
    _, db, actor, payment, enrollment = fixture_payment(env)
    original = db.query(SessionLog).filter_by(enrollment_id=enrollment.id).order_by(SessionLog.session_date).first()
    before = (original.id, original.session_date, original.time_slot, original.financial_status)
    _, payload = change(db, enrollment, effective=date(2027, 1, 10))
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    assert (original.id, original.session_date, original.time_slot, original.financial_status) == before
    assert_integrity(db, payment)


def test_existing_future_makeup_arrangements_are_held_for_review(env):
    _, db, actor, payment, enrollment = fixture_payment(env)
    row = db.query(SessionLog).filter_by(enrollment_id=enrollment.id).first()
    row.session_status = 'Rescheduled - Pending Make-up'
    db.commit()
    request = ScheduleChangeRequest(assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1, effective_date=date(2027, 1, 1))
    assert preview(db, enrollment, request, as_of=date(2026, 11, 25))['issues']


def test_successful_autopay_run_does_not_prevent_later_supplement(env, monkeypatch):
    from billing import bank_runs
    _, db, actor, payment, enrollment = fixture_payment(env)
    monkeypatch.setattr(bank_runs, 'claimed_payments', lambda *_: {payment.id: 'retained-paid-run'})
    proposal, _ = change(db, enrollment)
    assert proposal['additional_amount'] == 800
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    assert payment_detail(db, payment).batch_action_issue is None


def test_unpaid_prepared_autopay_amount_is_held_for_review(env, monkeypatch):
    from billing import bank_runs
    _, db, actor, payment, enrollment = fixture_payment(env, paid=False)
    monkeypatch.setattr(bank_runs, 'claimed_payments', lambda *_: {payment.id: 'prepared-bank-run'})
    request = ScheduleChangeRequest(assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1, effective_date=date(2027, 1, 1))
    assert any('Autopay run' in issue for issue in preview(db, enrollment, request, as_of=date(2026, 11, 25))['issues'])


def test_revised_unpaid_fee_message_lists_actual_new_dates(env):
    _, db, actor, payment, enrollment = fixture_payment(env, paid=False)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    message = assert_integrity(db, payment).review.message
    assert not message.blocked_reasons
    assert all(f'2027/01/{day:02}' in message.en for day in (1, 8, 15, 22, 29))
    assert '2027/01/05' not in message.en
    assert 'Every Tuesday' not in message.en


def test_supplement_message_has_only_additional_tuition_and_bilingual_instructions(env):
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    message = assert_integrity(db, payment).supplementary_payments[0].message
    assert not message.blocked_reasons
    assert '$800' in message.en and '$800' in message.zh
    assert '$1,200' not in message.en
    assert 'Bank transfer' in message.en
    assert '2027/01/22' in message.en and '2027/01/29' in message.zh


@pytest.mark.parametrize('paid', [True, False])
def test_grouped_payment_keeps_other_class_counts_and_settlement(env, paid):
    from billing.workflow import payment_rows
    _, db, actor, payment, enrollment = fixture_payment(env, paid=paid, second_slot=True)
    other = next(row for _, row, _ in payment_rows(db, payment) if row.id != enrollment.id)
    before = (other.lessons_paid, other.payment_status, other.revenue_total)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    assert (other.lessons_paid, other.payment_status, other.revenue_total) == before
    assert enrollment.lessons_paid == 5
    assert enrollment.payment_status == ('Partially Paid' if paid else 'Pending Payment')
    assert_integrity(db, payment)


def test_older_editor_cannot_skip_the_monthly_count_review(env, monkeypatch):
    import asyncio
    from routers import enrollments as routes
    _, db, actor, payment, enrollment = fixture_payment(env)
    monkeypatch.setattr(routes, 'billing_today', lambda _: date(2026, 11, 25))
    before = deepcopy(payment.snapshot)
    with pytest.raises(HTTPException) as caught:
        asyncio.run(routes.apply_schedule_change(enrollment.id, ApplyScheduleChangeRequest(
            assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1,
            apply_to_sessions=True), db, actor))
    assert caught.value.status_code == 409
    db.rollback()
    assert enrollment.assigned_day == 'Tue' and enrollment.lessons_paid == 3
    assert payment.snapshot == before


def test_decrease_cannot_create_entitlements_outside_existing_makeup_deadline(env, monkeypatch):
    from types import SimpleNamespace
    from billing import schedule_adjustments
    _, db, actor, payment, enrollment = fixture_payment(env)
    _, payload = change(db, enrollment)
    apply(db, enrollment.id, payload, actor, as_of=date(2026, 11, 25))
    db.commit()
    monkeypatch.setattr(schedule_adjustments, 'BillingPolicy', lambda: SimpleNamespace(makeup_end=date(2027, 1, 20)))
    request = ScheduleChangeRequest(assigned_day='Tue', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1, effective_date=date(2027, 1, 1))
    proposal = preview(db, enrollment, request, as_of=date(2026, 11, 25))
    assert any('deadline' in issue for issue in proposal['issues'])
    assert all(row.session_status == 'Scheduled' for row in db.query(SessionLog).filter_by(enrollment_id=enrollment.id))
