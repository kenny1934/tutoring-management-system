"""Batch-facing payment boundaries use only invented disposable SQLite records.

Each request settles one combined payment. The caller may orchestrate several
requests, so retries must preserve that payment's original payload and key.
"""
from copy import deepcopy
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.bank_run_models import BankRun, BankRunClaim
from billing.coupon_models import CouponObservation, CouponUse
from billing.models import BillingAccount, BillingOperation, BillingPayment, BillingPaymentLine
from models import Enrollment, SessionLog
from tests.test_billing_drafts import env as draft_env, review_request
from tests.test_billing_workflow import (
    env as workflow_env, confirmed, coupon_payload, next_review, pay_payload, second_class,
)
from tests.test_billing_coupons import env as coupon_env, balance, checked, observed
from tests.test_billing_autopay import env as autopay_env, autopay_payment
from tests.test_billing_bank_export import env as export_env
from tests.test_billing_bank_runs import (
    env as bank_env, confirm, prepared, report_for, submitted, uploaded,
)


@pytest.fixture(autouse=True)
def isolated_connections_and_flags(monkeypatch):
    def reject_external(dialect, *_args):
        assert dialect.name == 'sqlite', 'Bulk payment checks refuse external databases.'
    event.listen(Engine, 'do_connect', reject_external)
    for flag in ('BILLING_COUPON_ENABLED', 'BILLING_COUPON_STORAGE_ENABLED',
                 'BILLING_AUTOPAY_RUN_ENABLED', 'BILLING_AUTOPAY_RUN_STORAGE_ENABLED'):
        monkeypatch.setenv(flag, 'false')
    yield
    event.remove(Engine, 'do_connect', reject_external)


def manual_url(payment):
    return f"/api/billing/payments/{payment['id']}/manual-paid"


def assert_unpaid(db, payment):
    db.expire_all()
    stored = db.get(BillingPayment, payment['id'])
    assert stored.status == 'Pending Payment' and stored.version == payment['version']
    assert stored.payment_date is None and stored.received_amount is None
    for line in payment['lines']:
        enrollment = db.get(Enrollment, line['enrollment_id'])
        assert enrollment.payment_status == 'Pending Payment' and enrollment.payment_date is None
        assert all(session.financial_status == 'Unpaid' for session in db.query(SessionLog).filter_by(
            enrollment_id=enrollment.id))
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='paid').count() == 0


def saved_claim(db, payment_id):
    """Exercise a real claim row even if imported bank evidence is inconsistent."""
    run = BankRun(id=str(uuid4()), version=1, status='prepared', branch='MSA',
                  collection_month='2026-11', content_hash='a' * 64,
                  export_snapshot={}, payment_evidence={}, file_sha256='b' * 64,
                  export_sha256='c' * 64, workbook=b'invented test workbook',
                  created_by=1, created_by_name='Synthetic admin')
    db.add(run)
    db.flush()
    db.add(BankRunClaim(payment_id=payment_id, run_id=run.id))
    db.commit()
    return run


def test_current_active_payment_is_available_for_batch_actions(workflow_env):
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    assert payment['batch_action_issue'] is None
    result = client.get(f"/api/billing/payments/{payment['id']}")
    assert result.status_code == 200, result.text
    assert result.json()['batch_action_issue'] is None
    assert db.query(BillingAccount).one().active


@pytest.mark.parametrize('method', ['cash', 'bank_transfer'])
def test_manual_paid_settles_both_teaching_lines_at_reviewed_total(workflow_env, method):
    client, db, _ = workflow_env
    second_class(db)
    _, _, payment = confirmed(client, payload=next_review(client, [11, 12]))
    original = deepcopy(db.get(BillingPayment, payment['id']).snapshot)
    response = client.post(manual_url(payment), json=pay_payload(
        payment, method=method, payment_date='2026-10-16', note='Received and checked.'))
    assert response.status_code == 200, response.text
    paid = response.json()
    assert paid['status'] == 'Paid' and paid['version'] == payment['version'] + 1
    assert paid['received_method'] == method and paid['payment_date'] == '2026-10-16'
    assert paid['note'] == 'Received and checked.' and paid['receipt_reference'] is None
    stored = db.get(BillingPayment, payment['id'])
    assert stored.received_amount == payment['review']['period']['total_fee']
    assert stored.snapshot == original
    assert len(paid['lines']) == 2
    assert sum(line['tuition_amount'] + line['materials_fee'] for line in paid['lines']) == stored.received_amount
    for line in paid['lines']:
        enrollment = db.get(Enrollment, line['enrollment_id'])
        assert enrollment.payment_status == 'Paid' and enrollment.payment_date == date(2026, 10, 16)
        assert all(s.financial_status == 'Paid' for s in db.query(SessionLog).filter_by(enrollment_id=enrollment.id))
    assert db.get(Enrollment, 11).payment_status == db.get(Enrollment, 12).payment_status == 'Paid'
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='paid').count() == 1


def test_manual_payment_uses_one_coupon_and_defers_the_single_kms_receipt(coupon_env):
    client, db, _ = coupon_env
    observed(client)
    assert checked(client)[0].status_code == 200
    second_class(db)
    _, _, payment = confirmed(client, payload=coupon_payload(client, ids=(11, 12)))
    assert db.query(CouponUse).count() == 1
    response = client.post(manual_url(payment), json=pay_payload(payment))
    assert response.status_code == 200, response.text
    paid = response.json()
    assert paid['coupon_status'] == 'awaiting_receipt' and paid['receipt_reference'] is None
    assert db.query(CouponUse).one().state == 'awaiting_receipt'
    assert db.query(CouponObservation).one().remaining_count == 1
    assert balance(client)['usable_count'] == 0
    assert sum(line.discount_amount for line in db.query(BillingPaymentLine)) == 300
    receipt = client.post(f"/api/billing/payments/{payment['id']}/receipt", json={
        'expected_version': paid['version'], 'idempotency_key': 'bulk-later-kms-receipt',
        'receipt_reference': 'SYNTHETIC-BULK-RECEIPT', 'coupon_selected': True,
    })
    assert receipt.status_code == 200, receipt.text
    assert db.query(CouponUse).count() == 1 and db.query(CouponUse).one().state == 'receipt_recorded'
    assert db.query(CouponObservation).one().remaining_count == 1
    assert balance(client)['usable_count'] == 0


def test_first_manual_collection_is_payable_under_an_autopay_preference(workflow_env):
    client, _, _ = workflow_env
    payload = review_request(client)
    payload['scenario']['payment_method'] = 'autopay'
    _, _, payment = confirmed(client, payload=payload, method='autopay')
    assert payment['review']['scenario']['payment_method'] == 'autopay'
    assert payment['review']['period']['collection']['method'] == 'manual'
    response = client.post(manual_url(payment), json=pay_payload(payment))
    assert response.status_code == 200, response.text


@pytest.mark.parametrize('method', ['autopay', 'cheque', '', None])
def test_manual_endpoint_rejects_nonmanual_received_methods(workflow_env, method):
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    response = client.post(manual_url(payment), json=pay_payload(payment, method=method))
    assert response.status_code == 422, response.text
    assert_unpaid(db, payment)


def test_frozen_autopay_cannot_enter_manual_payment_path(workflow_env):
    client, db, _ = workflow_env
    stored = autopay_payment(client, db, sent=False)
    payment = client.get(f'/api/billing/payments/{stored.id}').json()
    assert payment['review']['period']['collection']['method'] == 'autopay'
    response = client.post(manual_url(payment), json=pay_payload(payment))
    assert response.status_code == 422, response.text
    assert_unpaid(db, payment)


@pytest.mark.parametrize('change', [
    {'amount': 1}, {'amount': 0}, {'payment_date': '2026-10-18'},
    {'expected_version': 99},
])
def test_invalid_manual_payment_is_atomic(workflow_env, change):
    client, db, _ = workflow_env
    second_class(db)
    _, _, payment = confirmed(client, payload=next_review(client, [11, 12]))
    response = client.post(manual_url(payment), json=pay_payload(payment, **change))
    assert response.status_code == (409 if 'expected_version' in change else 422), response.text
    assert_unpaid(db, payment)


def test_changed_linked_fee_blocks_the_entire_combined_payment(workflow_env):
    client, db, _ = workflow_env
    second_class(db)
    _, _, payment = confirmed(client, payload=next_review(client, [11, 12]))
    enrollment = db.get(Enrollment, payment['lines'][1]['enrollment_id'])
    enrollment.revenue_total -= 1
    db.commit()
    response = client.post(manual_url(payment), json=pay_payload(payment))
    assert response.status_code == 409, response.text
    assert_unpaid(db, payment)


def test_late_coupon_failure_rolls_back_every_linked_enrollment(coupon_env, monkeypatch):
    from billing import coupon_accounting
    from billing.drafts import DraftConflict
    client, db, _ = coupon_env
    observed(client)
    assert checked(client)[0].status_code == 200
    second_class(db)
    _, _, payment = confirmed(client, payload=coupon_payload(client, ids=(11, 12)))
    def reject_coupon(*_args, **_kwargs):
        raise DraftConflict('Synthetic coupon changed after enrollment updates.')
    monkeypatch.setattr(coupon_accounting, 'payment_changed', reject_coupon)
    response = client.post(manual_url(payment), json=pay_payload(payment))
    assert response.status_code == 409, response.text
    assert_unpaid(db, payment)
    assert db.query(CouponUse).one().state == 'reserved'
    assert db.query(CouponObservation).one().remaining_count == 1


def test_lost_response_replays_the_exact_original_payment_without_second_effect(workflow_env):
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    body = pay_payload(payment, payment_date='2026-10-16', method='bank_transfer')
    response = client.post(manual_url(payment), json=body)
    assert response.status_code == 200, response.text
    original = response.json()
    receipt = client.post(f"/api/billing/payments/{payment['id']}/receipt", json={
        'expected_version': original['version'], 'idempotency_key': 'later-receipt-before-retry',
        'receipt_reference': 'SYNTHETIC-LATER-RECEIPT',
    })
    assert receipt.status_code == 200, receipt.text
    replay = client.post(manual_url(payment), json=body)
    assert replay.status_code == 200 and replay.json() == original
    assert db.get(BillingPayment, payment['id']).version == receipt.json()['version']
    assert db.get(BillingPayment, payment['id']).receipt_reference == 'SYNTHETIC-LATER-RECEIPT'
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='paid').count() == 1


def test_manual_retry_key_cannot_be_reused_on_generic_paid_endpoint(workflow_env):
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    body = pay_payload(payment)
    paid = client.post(manual_url(payment), json=body)
    assert paid.status_code == 200, paid.text
    reused = client.post(f"/api/billing/payments/{payment['id']}/paid", json=body)
    assert reused.status_code == 409, reused.text
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='paid').count() == 1


@pytest.mark.parametrize('mutation', ['changed_body', 'fresh_key', 'changed_actor'])
def test_paid_retry_cannot_be_reinterpreted_as_another_payment(workflow_env, mutation):
    client, db, user = workflow_env
    _, _, payment = confirmed(client)
    body = pay_payload(payment)
    original = client.post(manual_url(payment), json=body)
    assert original.status_code == 200, original.text
    changed = dict(body)
    if mutation == 'changed_body':
        changed['method'] = 'bank_transfer'
    elif mutation == 'fresh_key':
        changed.update(idempotency_key='new-key-after-payment', expected_version=original.json()['version'])
    else:
        user.id = 2
    response = client.post(manual_url(payment), json=changed)
    assert response.status_code == 409, response.text
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='paid').count() == 1
    assert db.get(BillingPayment, payment['id']).received_method == 'cash'


@pytest.mark.parametrize('action', ['manual-paid', 'sent'])
@pytest.mark.parametrize('restriction', ['inactive', 'previous_year', 'claimed'])
def test_read_and_write_boundaries_hold_restricted_accounts(workflow_env, monkeypatch, action, restriction):
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    if restriction == 'inactive':
        db.query(BillingAccount).one().active = False
    elif restriction == 'previous_year':
        db.query(BillingAccount).one().academic_start = date(2025, 9, 1)
    else:
        monkeypatch.setenv('BILLING_AUTOPAY_RUN_STORAGE_ENABLED', 'true')
        saved_claim(db, payment['id'])
    db.commit()
    before_operations = db.query(BillingOperation).count()
    read = client.get(f"/api/billing/payments/{payment['id']}")
    assert read.status_code == 200, read.text
    assert read.json()['batch_action_issue']
    body = pay_payload(payment) if action == 'manual-paid' else {
        'expected_version': payment['version'], 'idempotency_key': 'restricted-batch-sent', 'language': 'zh',
    }
    result = client.post(f"/api/billing/payments/{payment['id']}/{action}", json=body)
    assert result.status_code == 409, result.text
    assert_unpaid(db, payment)
    assert db.query(BillingAccount).count() == 1
    assert db.query(BillingOperation).count() == before_operations
    assert all(not db.get(Enrollment, line['enrollment_id']).fee_message_sent for line in payment['lines'])


def test_bank_storage_off_does_not_query_uninstalled_run_tables(workflow_env):
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    statements = []
    def no_run_tables(_conn, _cursor, sql, *_args):
        assert 'billing_bank_' not in sql.lower(), sql
        statements.append(sql)
    event.listen(db.bind, 'before_cursor_execute', no_run_tables)
    try:
        read = client.get(f"/api/billing/payments/{payment['id']}")
        assert read.status_code == 200 and read.json()['batch_action_issue'] is None
        result = client.post(manual_url(payment), json=pay_payload(payment))
        assert result.status_code == 200, result.text
    finally:
        event.remove(db.bind, 'before_cursor_execute', no_run_tables)
    assert statements


@pytest.mark.parametrize('language', ['zh', 'en'])
def test_sent_records_selected_language_for_both_lines_and_replays_once(workflow_env, language):
    client, db, _ = workflow_env
    second_class(db)
    _, _, payment = confirmed(client, payload=next_review(client, [11, 12]))
    body = {'expected_version': payment['version'], 'idempotency_key': 'bulk-mark-sent', 'language': language}
    url = f"/api/billing/payments/{payment['id']}/sent"
    response = client.post(url, json=body)
    assert response.status_code == 200, response.text
    marked = response.json()
    assert marked['sent_at'] and marked['sent_language'] == language
    assert marked['status'] == 'Pending Payment'
    assert all(db.get(Enrollment, line['enrollment_id']).fee_message_sent for line in payment['lines'])
    replay = client.post(url, json=body)
    assert replay.status_code == 200 and replay.json() == marked
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='sent').count() == 1
    assert db.query(BillingOperation).filter_by(payment_id=payment['id'], kind='paid').count() == 0
    changed = dict(body, language='en' if language == 'zh' else 'zh')
    assert client.post(url, json=changed).status_code == 409


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_nonadmin_cannot_record_batch_manual_payment(workflow_env, role):
    client, db, user = workflow_env
    _, _, payment = confirmed(client)
    user.role = role
    response = client.post(manual_url(payment), json=pay_payload(payment))
    assert response.status_code == 403, response.text
    assert_unpaid(db, payment)


def test_effective_tutor_and_disabled_workflow_cannot_record_manual_payment(workflow_env, monkeypatch):
    client, db, user = workflow_env
    _, _, payment = confirmed(client)
    user.role = 'Super Admin'
    denied = client.post(manual_url(payment), json=pay_payload(payment), headers={'X-Effective-Role': 'Tutor'})
    assert denied.status_code == 403, denied.text
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    disabled = client.post(manual_url(payment), json=pay_payload(payment))
    assert disabled.status_code == 503, disabled.text
    assert_unpaid(db, payment)


def test_claimed_autopay_stays_with_bank_results_and_cannot_be_marked_sent_again(bank_env, monkeypatch):
    client, db, _, stored = bank_env
    run, _ = prepared(client)
    payment = client.get(f'/api/billing/payments/{stored.id}').json()
    assert payment['batch_action_issue']
    before_sent_at, before_version = stored.sent_at, stored.version
    denied = client.post(f'/api/billing/payments/{stored.id}/sent', json={
        'expected_version': payment['version'], 'idempotency_key': 'claimed-sent-again', 'language': 'zh',
    })
    assert denied.status_code == 409, denied.text
    db.refresh(stored)
    assert stored.sent_at == before_sent_at and stored.version == before_version
    assert client.post(manual_url(payment), json=pay_payload(payment)).status_code == 409
    run, _ = submitted(client, run)
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    review = uploaded(client, run, report_for(run))
    recorded, body = confirm(client, review)
    assert recorded.status_code == 200, recorded.text
    assert recorded.json()['recorded_count'] == 1 and recorded.json()['ready_count'] == 0
    db.refresh(stored)
    assert stored.status == 'Paid' and stored.received_method == 'autopay'
    assert stored.payment_date == date(2026, 11, 21) and stored.receipt_reference is None
    replay = client.post(f"/api/billing/autopay/runs/{run['id']}/results/{review['id']}/confirm", json=body)
    assert replay.status_code == 200 and replay.json() == recorded.json()
    assert db.query(BillingOperation).filter_by(payment_id=stored.id, kind='paid').count() == 1
