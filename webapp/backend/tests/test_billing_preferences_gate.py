"""Preference collection may open before financial writes, on synthetic SQLite only."""
from uuid import UUID

import pytest
from sqlalchemy import event

from billing import workflow
from billing.models import BillingAccount, BillingLessonClaim, BillingOperation, BillingPayment, BillingPreference
from models import Enrollment, SessionLog, StudentCoupon
from tests.test_billing_workflow import draft_env, env, reject_external_connections


@pytest.fixture
def preferences_only(env, monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_PREFERENCES_ENABLED', 'true')
    return env


def choice(*, version=0, key='choice-1', method='autopay', ready=False):
    return {'payment_method': method, 'mandate_ready': ready,
            'expected_version': version, 'idempotency_key': key}


@pytest.mark.parametrize(('financial', 'storage', 'preferences', 'enabled'), [
    (False, False, False, False), (False, False, True, False),
    (False, True, False, False), (False, True, True, True),
    (True, False, False, True), (True, False, True, True),
    (True, True, False, True), (True, True, True, True),
])
def test_preference_capability_requires_storage_or_full_workflow(monkeypatch, financial, storage, preferences, enabled):
    for name, value in [('BILLING_WORKFLOW_ENABLED', financial),
                        ('BILLING_WORKFLOW_STORAGE_ENABLED', storage),
                        ('BILLING_PREFERENCES_ENABLED', preferences)]:
        monkeypatch.setenv(name, 'true' if value else 'false')
    assert workflow.preferences_writes_enabled() is enabled


def test_preference_collection_does_not_activate_or_change_teaching(preferences_only):
    client, session, _ = preferences_only
    options = client.get('/api/billing/options').json()
    assert options['workflow_available']
    assert options['preferences_writes_available']
    assert not options['workflow_writes_available']
    assert not options['queue_available']
    response = client.put('/api/billing/students/101/preferences', json=choice())
    assert response.status_code == 200, response.text
    assert response.json()['payment_method'] == 'autopay'
    assert response.json()['mandate_ready'] is False
    assert client.get('/api/billing/students/101/preferences').json() == response.json()
    assert client.get('/api/billing/students/101/context').json()['recorded_payment_method'] == 'autopay'
    assert session.query(BillingAccount).one().active is False
    assert session.query(BillingPreference).count() == 1
    assert session.query(BillingOperation).count() == 1
    assert session.query(BillingPayment).count() == 0
    assert session.query(BillingLessonClaim).count() == 0
    assert session.query(Enrollment).count() == 1
    assert session.query(SessionLog).count() == 6
    assert session.query(StudentCoupon).count() == 0
    source = session.get(Enrollment, 11)
    assert source.payment_status == 'Paid' and source.revenue_total == 2400
    assert source.fee_message_sent is False
    assert all(row.financial_status == 'Paid' and row.session_status == 'Scheduled' for row in session.query(SessionLog))


def test_preference_collection_keeps_all_financial_routes_closed(preferences_only):
    client, session, _ = preferences_only
    assert client.put('/api/billing/students/101/preferences', json=choice()).status_code == 200
    identifier = str(UUID(int=1))
    requests = [
        (f'/api/billing/drafts/{identifier}/confirm', {'expected_revision': 1, 'expected_review_hash': '0' * 64, 'expected_preference_version': 1, 'idempotency_key': 'confirm'}),
        (f'/api/billing/payments/{identifier}/sent', {'expected_version': 1, 'language': 'en', 'idempotency_key': 'sent'}),
        (f'/api/billing/payments/{identifier}/paid', {'expected_version': 1, 'payment_date': '2026-10-17', 'amount': 2400, 'method': 'cash', 'idempotency_key': 'paid'}),
        (f'/api/billing/payments/{identifier}/receipt', {'expected_version': 1, 'receipt_reference': 'SYNTHETIC-1', 'idempotency_key': 'receipt'}),
        (f'/api/billing/payments/{identifier}/cancel', {'expected_version': 1, 'reason': 'Synthetic cancellation', 'idempotency_key': 'cancel'}),
    ]
    for url, payload in requests:
        response = client.post(url, json=payload)
        assert response.status_code == 503, response.text
    assert session.query(BillingPayment).count() == 0
    assert session.query(BillingOperation).count() == 1
    assert session.query(Enrollment).count() == 1
    assert session.query(BillingAccount).one().active is False


def test_preferences_only_preserves_retries_and_optimistic_version(preferences_only):
    client, session, _ = preferences_only
    payload = choice()
    first = client.put('/api/billing/students/101/preferences', json=payload)
    assert first.status_code == 200, first.text
    replay = client.put('/api/billing/students/101/preferences', json=payload)
    assert replay.status_code == 200 and replay.json() == first.json()
    updated = client.put('/api/billing/students/101/preferences', json=choice(version=1, key='choice-2', ready=True))
    assert updated.status_code == 200 and updated.json()['version'] == 2
    assert updated.json()['mandate_ready'] is True
    assert client.put('/api/billing/students/101/preferences', json=choice(key='stale-version')).status_code == 409
    assert client.put('/api/billing/students/101/preferences', json=choice(method='manual')).status_code == 409
    session.expire_all()
    assert session.query(BillingPreference).one().version == 2
    assert session.query(BillingOperation).count() == 2


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_preference_activation_does_not_widen_staff_write_permissions(preferences_only, role):
    client, session, user = preferences_only
    user.role = role
    response = client.put('/api/billing/students/101/preferences', json=choice())
    assert response.status_code == 403
    assert session.query(BillingAccount).count() == 0


def test_effective_tutor_cannot_use_preference_activation(preferences_only):
    client, session, user = preferences_only
    user.role = 'Super Admin'
    response = client.put('/api/billing/students/101/preferences', json=choice(), headers={'X-Effective-Role': 'Tutor'})
    assert response.status_code == 403
    assert session.query(BillingPreference).count() == 0


@pytest.mark.parametrize('preferences_flag', [False, True])
def test_absent_workflow_storage_never_touches_migration188(env, monkeypatch, preferences_flag):
    client, session, _ = env
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    monkeypatch.setenv('BILLING_PREFERENCES_ENABLED', str(preferences_flag).lower())
    tables = ('billing_preferences', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims', 'billing_operations')
    def no_workflow_tables(_conn, _cursor, statement, *_args):
        assert not any(name in statement.lower() for name in tables), statement
    event.listen(session.bind, 'before_cursor_execute', no_workflow_tables)
    try:
        options = client.get('/api/billing/options').json()
        assert not options['workflow_available'] and not options['preferences_writes_available']
        assert client.get('/api/billing/students/101/preferences').status_code == 503
        assert client.put('/api/billing/students/101/preferences', json=choice()).status_code == 503
        assert client.get('/api/billing/students/101/context').status_code == 200
    finally:
        event.remove(session.bind, 'before_cursor_execute', no_workflow_tables)
    assert session.query(BillingAccount).count() == 0


@pytest.mark.parametrize('drafts,storage,financial,queue_flag,expected', [
    (True, False, False, False, False),
    (True, True, False, False, False),
    (False, True, False, False, False),
    (False, False, False, True, False),
    (True, False, False, True, True),
    (False, True, False, True, True),
    (False, False, True, False, True),
])
def test_renewals_cutover_is_separate_from_preference_storage(monkeypatch, drafts, storage, financial, queue_flag, expected):
    from billing.queue import queue_available
    for name, value in [('BILLING_DRAFT_STORAGE_ENABLED', drafts),
                        ('BILLING_WORKFLOW_STORAGE_ENABLED', storage),
                        ('BILLING_WORKFLOW_ENABLED', financial),
                        ('BILLING_RENEWAL_QUEUE_ENABLED', queue_flag)]:
        monkeypatch.setenv(name, str(value).lower())
    monkeypatch.setenv('BILLING_PREFERENCES_ENABLED', 'true')
    assert queue_available() is expected
