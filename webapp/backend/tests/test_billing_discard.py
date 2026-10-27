"""Discarded drafts remain auditable and cannot create enrollments.

These HTTP checks only use synthetic SQLite records. The matching MySQL
transaction races run separately against the private disposable database.
"""
from copy import deepcopy
from datetime import date

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingAccount, BillingDraft, BillingDraftRevision, BillingPayment
from models import Enrollment, SessionLog, Tutor
from tests.test_billing_drafts import env as draft_env, saved, save_request
from tests.test_billing_workflow import confirmed, confirmation, preference


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Discard tests may only use synthetic SQLite records.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def env(draft_env, monkeypatch):
    monkeypatch.delenv('BILLING_WORKFLOW_ENABLED', raising=False)
    monkeypatch.delenv('BILLING_WORKFLOW_STORAGE_ENABLED', raising=False)
    yield draft_env


@pytest.fixture
def workflow_env(env, monkeypatch):
    from routers import billing_workflow
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'true')
    monkeypatch.setattr(billing_workflow, 'today', lambda: date(2026, 10, 17))
    env[0].app.include_router(billing_workflow.router, prefix='/api')
    yield env


def discard(client, draft, *, key='discard-1', revision=None):
    return client.post(f"/api/billing/drafts/{draft['id']}/discard", json={
        'expected_revision': revision if revision is not None else draft['current_revision'],
        'idempotency_key': key,
    })


def test_discard_appends_audit_revision_without_changing_original_or_teaching(env):
    client, session, _ = env
    _, first = saved(client, note='Reviewed with parent')
    original = deepcopy(session.query(BillingDraftRevision).one().snapshot)
    result = discard(client, first)
    assert result.status_code == 200, result.text
    detail = result.json()
    assert detail['state'] == 'discarded'
    assert detail['revision'] == detail['current_revision'] == 2
    assert not detail['can_copy']
    assert detail['review']['message']['zh'] is detail['review']['message']['en'] is None
    assert [(h['revision'], h['action']) for h in detail['history']] == [(2, 'discarded'), (1, 'saved')]
    assert detail['history'][0]['created_by_name'] == 'Draft Admin'
    rows = session.query(BillingDraftRevision).order_by(BillingDraftRevision.revision).all()
    assert rows[0].snapshot == original
    assert rows[1].snapshot['state'] == 'discarded'
    assert rows[1].snapshot['review'] == original['review']
    assert rows[1].snapshot['request'] == original['request']
    assert session.query(BillingDraft).one().current_revision == 2
    assert not session.query(BillingAccount).one().active
    assert session.query(Enrollment).count() == 1
    assert session.query(SessionLog).count() == 6
    assert session.query(Enrollment).one().fee_message_sent is False
    assert all(s.financial_status == 'Paid' for s in session.query(SessionLog))


def test_default_list_hides_discarded_but_history_is_available(env):
    client, _, _ = env
    _, first = saved(client, key='first')
    _, other = saved(client, key='second')
    assert discard(client, first).status_code == 200
    current = client.get('/api/billing/students/101/drafts').json()
    assert [(d['id'], d['state']) for d in current] == [(other['id'], 'active')]
    all_drafts = client.get('/api/billing/students/101/drafts?include_discarded=true').json()
    assert {d['id']: d['state'] for d in all_drafts} == {first['id']: 'discarded', other['id']: 'active'}
    for revision in (None, 1, 2):
        result = client.get(f"/api/billing/drafts/{first['id']}", params={} if revision is None else {'revision': revision})
        assert result.status_code == 200
        old = result.json()
        assert old['state'] == 'discarded' and old['current_revision'] == 2
        assert not old['can_copy']
        assert old['review']['message']['zh'] is old['review']['message']['en'] is None


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_non_admin_cannot_discard(env, role):
    client, session, user = env
    _, first = saved(client)
    user.role = role
    assert discard(client, first).status_code == 403
    assert session.query(BillingDraftRevision).count() == 1


def test_super_admin_using_tutor_role_cannot_discard(env):
    client, session, user = env
    _, first = saved(client)
    user.role = 'Super Admin'
    response = client.post(f"/api/billing/drafts/{first['id']}/discard", headers={'X-Effective-Role': 'Tutor'},
                           json={'expected_revision': 1, 'idempotency_key': 'forged'})
    assert response.status_code == 403
    assert session.query(BillingDraftRevision).count() == 1


def test_discarded_history_keeps_tutor_scope(env):
    client, _, user = env
    _, first = saved(client)
    assert discard(client, first).status_code == 200
    user.role = 'Tutor'
    assert client.get(f"/api/billing/drafts/{first['id']}").status_code == 200
    user.id = 99
    assert client.get(f"/api/billing/drafts/{first['id']}").status_code == 404
    assert client.get('/api/billing/students/101/drafts?include_discarded=true').status_code == 404


def test_discard_storage_gate_and_missing_id(env, monkeypatch):
    client, session, _ = env
    _, first = saved(client)
    missing = dict(first, id='00000000-0000-0000-0000-000000000001')
    assert discard(client, missing).status_code == 404
    monkeypatch.delenv('BILLING_DRAFT_STORAGE_ENABLED')
    assert discard(client, first).status_code == 503
    assert session.query(BillingDraftRevision).count() == 1


def test_discard_stale_version_cannot_replace_new_review(env):
    client, session, _ = env
    _, first = saved(client)
    revision = dict(save_request(client, key='revision-2', note='Second review'), expected_revision=1)
    revised = client.put(f"/api/billing/drafts/{first['id']}/revisions", json=revision)
    assert revised.status_code == 200, revised.text
    assert discard(client, first).status_code == 409
    assert session.query(BillingDraftRevision).count() == 2
    assert discard(client, revised.json(), key='discard-2').status_code == 200
    assert session.query(BillingDraftRevision).count() == 3


def test_discard_replay_does_not_append_or_depend_on_source_freshness(env):
    client, session, _ = env
    _, first = saved(client)
    assert discard(client, first).status_code == 200
    session.query(Enrollment).filter_by(id=11).update({'fee_message_sent': True})
    session.commit()
    replay = discard(client, first)
    assert replay.status_code == 200, replay.text
    assert replay.json()['state'] == 'discarded' and replay.json()['current_revision'] == 2
    assert not replay.json()['can_copy']
    assert session.query(BillingDraftRevision).count() == 2
    assert discard(client, first, key='second-discard', revision=2).status_code == 409
    assert session.query(BillingDraftRevision).count() == 2


@pytest.mark.parametrize('change', ['revision', 'actor', 'draft', 'operation'])
def test_discard_key_cannot_be_reused_for_another_action(env, change):
    client, session, user = env
    _, first = saved(client)
    assert discard(client, first).status_code == 200
    if change == 'revision':
        response = discard(client, first, revision=2)
    elif change == 'actor':
        session.add(Tutor(id=2, tutor_name='Second admin', user_email='second@example.test', role='Admin'))
        session.commit()
        user.id = 2
        response = discard(client, first)
    elif change == 'draft':
        _, other = saved(client, key='other-draft')
        response = discard(client, other)
    else:
        response = client.post('/api/billing/students/101/drafts', json=save_request(client, key='discard-1'))
    assert response.status_code == 409, response.text
    assert session.query(BillingDraftRevision).count() == (3 if change == 'draft' else 2)


def test_discard_can_remove_stale_draft_without_rewriting_review(env):
    client, session, _ = env
    _, first = saved(client)
    original = deepcopy(session.query(BillingDraftRevision).one().snapshot)
    session.query(Enrollment).filter_by(id=11).update({'fee_message_sent': True})
    session.commit()
    response = discard(client, first)
    assert response.status_code == 200, response.text
    assert response.json()['state'] == 'discarded'
    assert session.query(BillingDraftRevision).filter_by(revision=1).one().snapshot == original


def test_revise_and_saved_request_replay_cannot_resurrect_discarded_draft(env):
    client, session, _ = env
    create, first = saved(client)
    revision = dict(save_request(client, key='revision-2'), expected_revision=1)
    second = client.put(f"/api/billing/drafts/{first['id']}/revisions", json=revision).json()
    assert discard(client, second).status_code == 200
    for body in (dict(revision, idempotency_key='new-revision', expected_revision=3),
                 dict(revision, idempotency_key='stale-revision')):
        assert client.put(f"/api/billing/drafts/{first['id']}/revisions", json=body).status_code == 409
    for path, verb, body in [('/api/billing/students/101/drafts', client.post, create),
                             (f"/api/billing/drafts/{first['id']}/revisions", client.put, revision)]:
        replay = verb(path, json=body)
        assert replay.status_code == 200, replay.text
        assert replay.json()['state'] == 'discarded'
        assert replay.json()['current_revision'] == 3 and not replay.json()['can_copy']
    assert session.query(BillingDraftRevision).count() == 3
    assert client.get('/api/billing/students/101/drafts').json() == []


def test_discard_requires_only_existing_draft_tables_when_workflow_is_off(env):
    client, session, _ = env
    forbidden = {'billing_preferences', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims', 'billing_operations'}
    def no_workflow_tables(_conn, _cursor, statement, *_args):
        assert not any(name in statement.lower() for name in forbidden), statement
    event.listen(session.bind, 'before_cursor_execute', no_workflow_tables)
    try:
        _, first = saved(client)
        assert discard(client, first).status_code == 200
        assert client.get('/api/billing/students/101/drafts').json() == []
        assert len(client.get('/api/billing/students/101/drafts?include_discarded=true').json()) == 1
        assert client.get(f"/api/billing/drafts/{first['id']}?revision=1").json()['state'] == 'discarded'
    finally:
        event.remove(session.bind, 'before_cursor_execute', no_workflow_tables)


def test_confirmed_draft_cannot_be_discarded_when_writes_are_on_or_off(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    first, _, payment = confirmed(client)
    for enabled in ('true', 'false'):
        monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', enabled)
        monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
        result = discard(client, first)
        assert result.status_code == 409, result.text
        assert session.query(BillingDraftRevision).count() == 1
        assert session.get(BillingPayment, payment['id']).status == 'Pending Payment'


def test_discarded_draft_cannot_confirm_using_original_or_current_revision(workflow_env):
    client, session, _ = workflow_env
    preference(client)
    first, data = confirmation(client)
    assert discard(client, first).status_code == 200
    for revision in (1, 2):
        result = client.post(f"/api/billing/drafts/{first['id']}/confirm", json=dict(data, expected_revision=revision))
        assert result.status_code == 409, result.text
    assert session.query(BillingPayment).count() == 0
    assert session.query(Enrollment).count() == 1
    assert session.query(SessionLog).count() == 6


@pytest.mark.parametrize('changes', [{'expected_revision': 0}, {'expected_revision': None}, {'idempotency_key': ''}])
def test_discard_rejects_incomplete_or_invalid_payload(env, changes):
    client, session, _ = env
    _, first = saved(client)
    data = {'expected_revision': 1, 'idempotency_key': 'discard-1', **changes}
    assert client.post(f"/api/billing/drafts/{first['id']}/discard", json=data).status_code == 422
    assert session.query(BillingDraftRevision).count() == 1
