"""Independent receipt worklist acceptance using invented SQLite records only."""
from copy import deepcopy
from datetime import date
import json

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingAccount, BillingPayment, BillingPaymentLine
from models import Enrollment, Student
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env, second_class
from tests.test_billing_autopay_verification import add_source, payment


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Receipt verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def receipt_env(workflow_env, monkeypatch):
    from routers import billing_receipts
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'false')
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    monkeypatch.setattr(billing_receipts, 'today', lambda: date(2026, 10, 17))
    workflow_env[0].app.include_router(billing_receipts.router, prefix='/api')
    return workflow_env


def paid(client, *, student_id=101, source_id=11, key='receipt-payment', reference=None):
    value = payment(client, student_id=student_id, source_id=source_id, key=key)
    response = client.post(f"/api/billing/payments/{value['id']}/paid", json={
        'expected_version': value['version'], 'idempotency_key': key+'-paid',
        'payment_date': '2026-10-17', 'amount': value['review']['period']['total_fee'],
        'method': 'autopay' if value['review']['period']['collection']['method'] == 'autopay' else 'cash',
        'receipt_reference': reference,
    })
    assert response.status_code == 200, response.text
    return response.json()


def receipts(client, **params):
    result = client.get('/api/billing/receipts', params=params)
    assert result.status_code == 200, result.text
    return result.json()


def count(client, **params):
    result = client.get('/api/billing/receipts/count', params=params)
    assert result.status_code == 200, result.text
    return result.json()


def record_receipt(client, value, *, reference='KMS-SYNTHETIC-001', key='receipt-entry'):
    return client.post(f"/api/billing/payments/{value['id']}/receipt", json={
        'expected_version': value['version'], 'idempotency_key': key, 'receipt_reference': reference})


def test_paid_without_coupon_or_receipt_has_one_compact_task(receipt_env):
    client, db, _actor = receipt_env
    value = paid(client)
    result = receipts(client)
    assert result['total'] == count(client)['count'] == 1
    row = result['rows'][0]
    assert row['payment_id'] == value['id'] and row['student']['id'] == 101
    assert row['received_amount'] == value['review']['period']['total_fee']
    assert row['received_method'] == value['received_method'] and row['coupon_value'] == 0
    assert row['total_amount'] == value['review']['period']['total_fee']
    assert not row['needs_checking'] and not row['issues']
    assert 'snapshot' not in json.dumps(result) and 'message' not in row


@pytest.mark.parametrize('status', ['Pending Payment', 'Cancelled'])
def test_unpaid_or_cancelled_payments_are_not_receipt_work(receipt_env, status):
    client, db, _actor = receipt_env
    value = payment(client)
    db.get(BillingPayment, value['id']).status = status
    db.commit()
    assert receipts(client)['total'] == count(client)['count'] == 0


def test_nonblank_receipt_closes_task_but_whitespace_is_still_outstanding(receipt_env):
    client, db, _actor = receipt_env
    value = paid(client, reference='SYNTHETIC-ISSUED-001')
    assert receipts(client)['total'] == count(client)['count'] == 0
    db.get(BillingPayment, value['id']).receipt_reference = '  \t  '
    db.commit()
    assert receipts(client)['total'] == count(client)['count'] == 1


def test_combined_two_line_payment_stays_one_task(receipt_env):
    from tests.test_billing_workflow import confirmed, next_review, pay_payload
    client, db, _actor = receipt_env
    second_class(db)
    payload = next_review(client, [11, 12])
    _draft, _request, value = confirmed(client, payload=payload)
    result = client.post(f"/api/billing/payments/{value['id']}/paid", json=pay_payload(value))
    assert result.status_code == 200, result.text
    assert len(value['lines']) == 2
    listed = receipts(client)
    assert listed['total'] == count(client)['count'] == 1 and len(listed['rows']) == 1
    assert listed['rows'][0]['lesson_count'] == value['review']['period']['lesson_count']


def test_older_academic_payment_remains_visible_without_selected_month(receipt_env):
    client, db, _actor = receipt_env
    value = paid(client)
    account = db.get(BillingAccount, db.get(BillingPayment, value['id']).account_id)
    account.academic_start = date(2025, 9, 1)
    db.commit()
    result = receipts(client, collection_month='2027-06')
    assert result['total'] == count(client)['count'] == 1
    assert result['rows'][0]['payment_id'] == value['id']


@pytest.mark.parametrize('damage', ['foreign_snapshot', 'malformed_snapshot'])
def test_invalid_saved_identity_never_leaks_snapshot_amounts_or_student(receipt_env, damage):
    client, db, _actor = receipt_env
    value = paid(client)
    stored = db.get(BillingPayment, value['id'])
    if damage == 'foreign_snapshot':
        changed = deepcopy(stored.snapshot)
        changed['review']['student'].update(id=102, student_name='Private foreign snapshot name')
        changed['review']['period']['total_fee'] = 123456789
        stored.snapshot = changed
    else:
        stored.snapshot = {'review': ['not', 'a', 'valid', 'snapshot']}
    db.commit()
    result = receipts(client)
    row = result['rows'][0]
    assert row['student']['id'] == 101 and row['student']['student_name'] != 'Private foreign snapshot name'
    assert row['first_lesson_date'] is row['last_lesson_date'] is row['lesson_count'] is row['total_amount'] is None
    assert row['received_amount'] == value['review']['period']['total_fee'] and row['needs_checking']
    assert 'Private foreign snapshot name' not in json.dumps(result) and '123456789' not in json.dumps(result)


def test_foreign_teaching_link_does_not_authorise_its_tutor(receipt_env):
    client, db, actor = receipt_env
    value = paid(client)
    line = db.query(BillingPaymentLine).filter_by(payment_id=value['id']).one()
    enrollment = db.get(Enrollment, line.enrollment_id)
    enrollment.student_id = 102
    db.commit()
    admin = receipts(client)
    assert admin['total'] == 1 and admin['rows'][0]['needs_checking']
    actor.role = 'Tutor'
    assert receipts(client)['total'] == count(client)['count'] == 0


def test_teaching_branch_filter_uses_current_own_lines_and_preserves_profile_identity(receipt_env):
    client, db, _actor = receipt_env
    value = paid(client)
    eid = value['lines'][0]['enrollment_id']
    db.get(Enrollment, eid).location = 'MSB'
    db.commit()
    assert receipts(client, location='MSA')['total'] == count(client, location='MSA')['count'] == 0
    selected = receipts(client, location='MSB')
    assert selected['total'] == count(client, location='MSB')['count'] == 1
    assert selected['rows'][0]['student']['home_location'] == 'MSA'


def test_admin_can_find_lost_link_by_profile_but_tutor_cannot(receipt_env):
    client, db, actor = receipt_env
    value = paid(client)
    db.query(BillingPaymentLine).filter_by(payment_id=value['id']).delete(synchronize_session=False)
    db.commit()
    result = receipts(client, location='MSA')
    assert result['total'] == 1 and result['rows'][0]['needs_checking']
    assert receipts(client, location='MSB')['total'] == 0
    actor.role = 'Tutor'
    assert receipts(client, location='MSA')['total'] == count(client, location='MSA')['count'] == 0


def test_sort_search_pagination_and_count_match_without_loading_other_snapshots(receipt_env):
    client, db, _actor = receipt_env
    first = paid(client)
    db.get(Student, 101).school_student_id = '20'
    add_source(db, student_id=102, source_id=21, tutor_id=2, location='MSA', school_id='3', first=date(2026, 10, 2))
    second = paid(client, student_id=102, source_id=21, key='receipt-second')
    db.commit()
    result = receipts(client, limit=1)
    assert result['total'] == count(client)['count'] == 2
    assert result['rows'][0]['payment_id'] == second['id']
    assert receipts(client, offset=1, limit=1)['rows'][0]['payment_id'] == first['id']
    assert receipts(client, search='20')['total'] == 1
    statements = []
    def capture(_connection, _cursor, statement, params, *_args):
        if 'billing_payments.snapshot' in statement:
            statements.append((statement, params))
    event.listen(db.bind, 'before_cursor_execute', capture)
    try:
        receipts(client, limit=1)
    finally:
        event.remove(db.bind, 'before_cursor_execute', capture)
    assert len(statements) == 1
    assert second['id'] in statements[0][1] and first['id'] not in statements[0][1]


def test_receipt_list_and_badge_are_query_only_with_no_191_reads(receipt_env):
    client, db, _actor = receipt_env
    paid(client)
    statements = []
    def reads(_connection, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT')
        assert 'billing_coupon_' not in statement.lower()
    event.listen(db.bind, 'before_cursor_execute', reads)
    try:
        assert receipts(client)['total'] == count(client)['count'] == 1
    finally:
        event.remove(db.bind, 'before_cursor_execute', reads)
    assert statements


def test_188_off_returns_empty_capabilities_without_financial_or_191_queries(receipt_env, monkeypatch):
    client, db, _actor = receipt_env
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    def guard(_connection, _cursor, statement, *_args):
        assert not any(name in statement.lower() for name in ['billing_payments', 'billing_payment_lines', 'billing_coupon_'])
    event.listen(db.bind, 'before_cursor_execute', guard)
    try:
        assert receipts(client)['total'] == count(client)['count'] == 0
        assert not receipts(client)['storage_available'] and not count(client)['writes_available']
    finally:
        event.remove(db.bind, 'before_cursor_execute', guard)


def test_storage_only_keeps_receipts_visible_with_writes_disabled(receipt_env, monkeypatch):
    client, _db, _actor = receipt_env
    paid(client)
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    assert receipts(client)['total'] == 1 and not receipts(client)['writes_available']
    assert count(client)['storage_available'] and not count(client)['writes_available']


@pytest.mark.parametrize('role', ['Guest'])
def test_disallowed_role_cannot_read_receipts(receipt_env, role):
    client, _db, actor = receipt_env
    actor.role = role
    assert client.get('/api/billing/receipts').status_code == 403
    assert client.get('/api/billing/receipts/count').status_code == 403


def test_tutor_cannot_spoof_another_tutor_scope(receipt_env):
    client, _db, actor = receipt_env
    paid(client)
    actor.role = 'Tutor'
    assert receipts(client)['total'] == 1
    assert client.get('/api/billing/receipts', params={'tutor_id': 2}).status_code == 403
    assert client.get('/api/billing/receipts/count', params={'tutor_id': 2}).status_code == 403
    assert client.get('/api/billing/receipts', params={'location':'Various'}).status_code == 422


@pytest.mark.parametrize('older_account,blank_existing', [(True, False), (False, True)])
def test_real_receipt_completion_removes_older_or_blank_reference_task(receipt_env, older_account, blank_existing):
    client, db, _actor = receipt_env
    value = paid(client)
    stored = db.get(BillingPayment, value['id'])
    if older_account:
        db.get(BillingAccount, stored.account_id).academic_start = date(2025, 9, 1)
    if blank_existing:
        stored.receipt_reference = '   '
    db.commit()
    assert receipts(client)['total'] == 1
    result = record_receipt(client, value)
    assert result.status_code == 200, result.text
    assert receipts(client)['total'] == count(client)['count'] == 0
