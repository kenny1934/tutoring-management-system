"""Unpaid charge revisions and cancelled intake history, using invented records."""
from copy import deepcopy
from datetime import date

import pytest
from billing.models import BillingPayment, BillingPaymentLine, BillingLessonClaim, BillingOperation
from models import Enrollment, SessionLog
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env, confirmed as renewal_confirmed, coupon_payload
from tests.test_billing_intake import intake_env, intake_request, save_preference, confirmed


def change(payment, **updates):
    payload = dict(expected_version=payment['version'], charge_materials=False, keep_deduction=True,
                   expected_total=payment['review']['period']['tuition_after_deductions'],
                   reason='Materials waived for this intake.', idempotency_key='charges-1')
    payload.update(updates)
    return payload


def test_remove_materials_updates_every_representation_and_retains_identity(intake_env):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    before = deepcopy(db.get(BillingPayment, payment['id']).snapshot)
    ids = [line['enrollment_id'] for line in payment['lines']]
    session_ids = [s.id for s in db.query(SessionLog).filter(SessionLog.enrollment_id.in_(ids)).all()]
    payload = change(payment)
    response = client.post(f"/api/billing/payments/{payment['id']}/charges", json=payload)
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated['version'] == 2 and updated['status'] == 'Pending Payment'
    assert updated['review']['period']['materials_fee'] == 0
    assert updated['review']['period']['total_fee'] == payment['review']['period']['total_fee'] - 100
    assert updated['review']['period']['lessons'] == payment['review']['period']['lessons']
    assert updated['review']['period']['collection'] == payment['review']['period']['collection']
    assert updated['review']['scenario']['materials_fee'] == 0
    assert updated['lines'][0]['materials_fee'] == 0
    assert not updated['review_issues'] and updated['can_copy']
    assert '$100' not in updated['review']['message']['en']
    assert updated['review']['review_hash'] != payment['review']['review_hash']
    enrollment = db.get(Enrollment, ids[0])
    assert enrollment.is_new_student and enrollment.revenue_total == payment['lines'][0]['tuition_amount']
    assert [s.id for s in db.query(SessionLog).filter(SessionLog.enrollment_id.in_(ids)).all()] == session_ids
    snapshot = db.get(BillingPayment, payment['id']).snapshot
    assert snapshot['charge_changes'][0]['before_review'] == before['review']
    history = updated['history'][-1]
    assert history['kind'] == 'charges' and history['reason'] == payload['reason']
    assert history['previous_total'] == payment['review']['period']['total_fee']
    read = client.get(f"/api/billing/payments/{payment['id']}").json()
    assert [{k: v for k, v in h.items() if k != 'created_at'} for h in read['history']] == [
        {k: v for k, v in h.items() if k != 'created_at'} for h in updated['history']]
    # An uncertain response retries the exact operation once.
    assert client.post(f"/api/billing/payments/{payment['id']}/charges", json=payload).json() == updated
    assert db.query(BillingOperation).filter_by(kind='charges').count() == 1
    stale = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(payment, idempotency_key='stale-edit'))
    assert stale.status_code == 409
    # Money can subsequently be recorded using the revised total.
    paid = client.post(f"/api/billing/payments/{payment['id']}/paid", json={
        'expected_version': 2, 'idempotency_key': 'pay-revised', 'payment_date': '2026-10-17',
        'amount': updated['review']['period']['total_fee'], 'method': 'cash'})
    assert paid.status_code == 200, paid.text
    assert paid.json()['status'] == 'Paid'


def test_sent_message_is_reset_and_retained_in_audit(intake_env):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    sent = client.post(f"/api/billing/payments/{payment['id']}/sent", json={
        'expected_version': 1, 'language': 'en', 'idempotency_key': 'sent'}).json()
    response = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(sent))
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated['sent_at'] is None and updated['sent_language'] is None
    assert updated['message_needs_resend']
    assert client.get(f"/api/billing/payments/{payment['id']}").json()['message_needs_resend']
    assert not db.get(Enrollment, payment['lines'][0]['enrollment_id']).fee_message_sent
    assert db.get(BillingPayment, payment['id']).snapshot['charge_changes'][0]['sent_at']
    resent = client.post(f"/api/billing/payments/{payment['id']}/sent", json={
        'expected_version': updated['version'], 'language': 'en', 'idempotency_key': 'resent'})
    assert resent.status_code == 200, resent.text
    assert not resent.json()['message_needs_resend']


@pytest.mark.parametrize('status', ['Paid', 'Cancelled'])
def test_settled_or_cancelled_charges_cannot_be_edited(intake_env, status):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    row = db.get(BillingPayment, payment['id'])
    row.status = status
    for line in payment['lines']:
        db.get(Enrollment, line['enrollment_id']).payment_status = status
    db.commit()
    response = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(payment))
    assert response.status_code == 409
    assert db.get(BillingPaymentLine, db.query(BillingPaymentLine.id).first()[0]).materials_fee == 100


def test_amount_change_and_missing_reason_are_rejected(intake_env):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    path = f"/api/billing/payments/{payment['id']}/charges"
    assert client.post(path, json=change(payment, expected_total=1)).status_code == 409
    assert client.post(path, json=change(payment, reason='  ')).status_code == 422
    assert db.get(BillingPayment, payment['id']).version == 1


def test_removing_trial_deduction_updates_revenue_without_recreating_sessions(intake_env):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    total = payment['review']['period']['gross_tuition'] + 100
    response = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(
        payment, charge_materials=True, keep_deduction=False, expected_total=total))
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated['review']['period']['deductions'] == []
    assert not updated['review']['scenario']['trial_deduction']
    assert db.get(Enrollment, updated['lines'][0]['enrollment_id']).revenue_total == total - 100
    assert updated['can_copy'] and not updated['review_issues']


def test_cancelling_first_intake_then_recreating_preserves_new_student_rules(intake_env):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client, trial=False))
    cancel = client.post(f"/api/billing/payments/{payment['id']}/cancel", json={
        'expected_version': 1, 'reason': 'Incorrect materials charge.', 'idempotency_key': 'cancel'})
    assert cancel.status_code == 200, cancel.text
    context = client.get('/api/billing/students/102/intake-context').json()
    assert context['is_new_student'] and context['materials_fee'] == 100
    data = intake_request(client, trial=False)
    assert data['scenario']['mode'] == 'new_student'
    data['scenario']['materials_fee'] = 0
    review = client.post('/api/billing/students/102/draft-review', json=data).json()
    assert review['period']['lesson_count'] >= 6
    response = client.post('/api/billing/students/102/drafts', json={
        'review': data, 'expected_review_hash': review['review_hash'], 'idempotency_key': 'replacement-draft'})
    assert response.status_code == 200, response.text
    draft = response.json()
    replacement = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json={
        'expected_revision': draft['revision'], 'expected_review_hash': draft['review']['review_hash'],
        'expected_preference_version': 1, 'idempotency_key': 'replacement-confirm'})
    assert replacement.status_code == 200, replacement.text
    result = replacement.json()
    assert db.get(Enrollment, result['lines'][0]['enrollment_id']).is_new_student
    assert result['lines'][0]['materials_fee'] == 0
    assert db.get(Enrollment, payment['lines'][0]['enrollment_id']).payment_status == 'Cancelled'


@pytest.mark.parametrize('kind', ['Regular', 'Summer', 'One-Time'])
@pytest.mark.parametrize('status,is_new', [('Cancelled', True), ('Paid', False), ('Pending Payment', False)])
def test_history_ignores_cancelled_but_retains_valid_course_types(intake_env, kind, status, is_new):
    client, db, _ = intake_env
    db.add(Enrollment(student_id=102, tutor_id=1, enrollment_type=kind, payment_status=status,
                      first_lesson_date=date(2025, 9, 1), lessons_paid=6))
    db.commit()
    context = client.get('/api/billing/students/102/intake-context').json()
    assert context['is_new_student'] is is_new
    assert context['materials_fee'] == (100 if is_new else 0)


def test_renewal_can_remove_existing_coupon_without_changing_teaching(env):
    client, db, _ = env
    _, _, payment = renewal_confirmed(client, payload=coupon_payload(client))
    total = payment['review']['period']['gross_tuition']
    response = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(
        payment, keep_deduction=False, expected_total=total))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['coupon_status'] == 'none' and result['review']['period']['deductions'] == []
    assert not result['review_issues'] and result['can_copy']
    assert sum(line['tuition_amount'] for line in result['lines']) == total


def test_charge_edits_require_admin_and_workflow(intake_env, monkeypatch):
    client, db, user = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    path = f"/api/billing/payments/{payment['id']}/charges"
    user.role = 'Tutor'
    assert client.post(path, json=change(payment)).status_code == 403
    user.role = 'Admin'
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    assert client.post(path, json=change(payment)).status_code == 503


def test_collection_run_blocks_charge_changes(intake_env, monkeypatch):
    from billing import bank_runs
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    monkeypatch.setattr(bank_runs, 'claimed_payments', lambda *_: {payment['id']: 'active-run'})
    response = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(payment))
    assert response.status_code == 409
    assert db.get(BillingPayment, payment['id']).version == 1


@pytest.mark.parametrize('status,is_new', [('Cancelled', True), (None, False)])
def test_regular_application_checks_also_ignore_cancelled_history(intake_env, status, is_new):
    from types import SimpleNamespace
    from routers.regular_course import _is_new_student, _new_student_flags_bulk
    client, db, _ = intake_env
    db.add(Enrollment(student_id=102, tutor_id=1, enrollment_type='Regular', payment_status='Cancelled',
                      first_lesson_date=date(2026, 11, 1), lessons_paid=8))
    db.commit()
    record = db.query(Enrollment).filter_by(student_id=102, enrollment_type='Regular').one()
    record.payment_status = status
    db.commit()
    assert _is_new_student(db, 102) is is_new
    assert _new_student_flags_bulk(db, [SimpleNamespace(id=1, existing_student_id=102)]) == {1: is_new}


@pytest.mark.parametrize('status,is_new', [('Cancelled', True), (None, False)])
def test_legacy_creation_ignores_cancelled_history(intake_env, monkeypatch, status, is_new):
    from routers import enrollments
    client, db, _ = intake_env
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    db.add(Enrollment(student_id=102, tutor_id=1, enrollment_type='Regular', payment_status='Cancelled',
                      first_lesson_date=date(2026, 11, 1), lessons_paid=8))
    db.commit()
    record = db.query(Enrollment).filter_by(student_id=102, enrollment_type='Regular').one()
    record.payment_status = status
    db.commit()
    client.app.include_router(enrollments.router, prefix='/api')
    response = client.post('/api/enrollments', json={
        'student_id': 102, 'tutor_id': 1, 'assigned_day': 'Fri', 'assigned_time': '16:00 - 17:30',
        'location': 'MSA', 'lessons_paid': 6, 'first_lesson_date': '2026-09-04', 'enrollment_type': 'Regular'})
    assert response.status_code == 200, response.text
    assert response.json()['is_new_student'] is is_new


def test_readding_materials_uses_shared_standard_and_checks_displayed_total(intake_env, monkeypatch):
    from types import SimpleNamespace
    from billing import settings
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    removed = client.post(f"/api/billing/payments/{payment['id']}/charges", json=change(payment)).json()
    # A setting change after the editor opens must not silently charge a new amount.
    monkeypatch.setattr(settings, 'get_settings', lambda *_a, **_kw: SimpleNamespace(materials_fee=120))
    payload = change(removed, charge_materials=True, expected_total=removed['review']['period']['total_fee'] + 100,
                     idempotency_key='restore-materials')
    path = f"/api/billing/payments/{payment['id']}/charges"
    assert client.post(path, json=payload).status_code == 409
    payload['expected_total'] += 20
    response = client.post(path, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['lines'][0]['materials_fee'] == 120
    assert response.json()['can_copy']
