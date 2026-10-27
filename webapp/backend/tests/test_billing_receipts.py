"""Receipt tasks reuse paid combined records without touching their finances."""
from datetime import date

import pytest
from sqlalchemy import event

from billing.models import BillingPayment
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env, confirmed, pay_payload


@pytest.fixture
def records(workflow_env, monkeypatch):
    from routers import billing_receipts
    client, db, user = workflow_env
    client.app.include_router(billing_receipts.router, prefix='/api')
    monkeypatch.setattr(billing_receipts, 'today', lambda: date(2027, 1, 20))
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'false')
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    return client, db, user


def paid_payment(client):
    _, _, payment = confirmed(client)
    result = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment))
    assert result.status_code == 200, result.text
    return result.json()


def test_paid_payment_remains_outstanding_across_collection_months(records):
    client, db, _ = records
    paid = paid_payment(client)
    response = client.get('/api/billing/receipts')
    assert response.status_code == 200, response.text
    task = response.json()
    assert task['as_of'] == '2027-01-20'
    assert task['total'] == 1
    row = task['rows'][0]
    assert row['payment_id'] == paid['id']
    assert row['student']['id'] == 101
    assert row['received_amount'] == paid['review']['period']['total_fee']
    assert row['payment_date'] == '2026-10-17'
    assert not row['needs_checking']
    assert client.get('/api/billing/receipts/count').json()['count'] == 1
    assert client.get('/api/billing/receipts', params={'search': 'not this student'}).json()['total'] == 0
    assert client.get('/api/billing/receipts', params={'offset': 1}).json()['rows'] == []
    assert db.get(BillingPayment, paid['id']).status == 'Paid'


def test_recording_required_receipt_finishes_task_without_changing_payment(records):
    client, db, _ = records
    paid = paid_payment(client)
    amount = db.get(BillingPayment, paid['id']).received_amount
    body = {'expected_version': paid['version'], 'idempotency_key': 'issued-kms-receipt',
            'receipt_reference': 'SYNTHETIC-KMS-001'}
    response = client.post(f"/api/billing/payments/{paid['id']}/receipt", json=body)
    assert response.status_code == 200, response.text
    assert client.get('/api/billing/receipts').json()['rows'] == []
    assert client.get('/api/billing/receipts/count').json()['count'] == 0
    payment = db.get(BillingPayment, paid['id'])
    assert payment.status == 'Paid' and payment.received_amount == amount


def test_storage_off_is_explicit_and_performs_no_reads(records, monkeypatch):
    client, db, _ = records
    paid_payment(client)
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    statements = []
    def record(_conn, _cursor, statement, *_args):
        statements.append(statement)
    event.listen(db.bind, 'before_cursor_execute', record)
    try:
        listing = client.get('/api/billing/receipts').json()
        count = client.get('/api/billing/receipts/count').json()
    finally:
        event.remove(db.bind, 'before_cursor_execute', record)
    assert listing['storage_available'] is False and listing['rows'] == []
    assert count == {'count': 0, 'storage_available': False, 'writes_available': False}
    assert statements == []


def test_read_only_storage_and_query_only_list_remain_available(records, monkeypatch):
    client, db, _ = records
    paid = paid_payment(client)
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    statements = []
    def read_only(_conn, _cursor, statement, *_args):
        assert statement.lstrip().upper().startswith('SELECT'), statement
        assert 'coupon_observations' not in statement.lower()
        statements.append(statement)
    event.listen(db.bind, 'before_cursor_execute', read_only)
    try:
        listing = client.get('/api/billing/receipts').json()
        count = client.get('/api/billing/receipts/count').json()
    finally:
        event.remove(db.bind, 'before_cursor_execute', read_only)
    assert listing['storage_available'] is True and listing['writes_available'] is False
    assert listing['rows'][0]['payment_id'] == paid['id'] and count['count'] == 1
    assert len(statements) <= 4


def test_invalid_teaching_location_is_not_a_receipt_scope(records):
    client, _, _ = records
    assert client.get('/api/billing/receipts', params={'location': 'Various'}).status_code == 422
    assert client.get('/api/billing/receipts/count', params={'location': 'Various'}).status_code == 422
