"""Isolated draft persistence checks. No application server or shared database.

Run with pytest --noconftest tests/test_billing_drafts.py. SQLite proves the
workflow here, while MySQL DDL and real locking require their isolated checks.
"""
from datetime import date, timedelta
from dataclasses import replace
from types import SimpleNamespace
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from auth.dependencies import get_current_user
from database import Base, get_db
from models import Enrollment, Holiday, SessionLog, Student, StudentCoupon, Tutor
from billing import drafts as service
from billing.models import BillingAccount, BillingDraft, BillingDraftRevision
from billing.schemas import PreviewIssue
from routers import billing, billing_drafts


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'External database access is forbidden in draft tests.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv('BILLING_DRAFT_STORAGE_ENABLED', 'true')
    monkeypatch.setattr(billing, 'today', lambda: date(2026, 10, 17))
    monkeypatch.setattr(billing_drafts, 'today', lambda: date(2026, 10, 17))
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = Session(engine, expire_on_commit=False)
    user = SimpleNamespace(id=1, user_email='draft@example.test', tutor_name='Draft Admin', role='Admin')
    session.add_all([Tutor(**vars(user)), Student(id=101, student_name='Synthetic student', home_location='MSA'),
                     Student(id=102, student_name='Another student', home_location='MSA'),
                     Holiday(holiday_date=date(2026, 12, 25), holiday_name='Synthetic closure')])
    session.flush()
    source = Enrollment(id=11, student_id=101, tutor_id=1, assigned_day='Fri',
                        assigned_time='16:00 - 17:30', location='MSA', lessons_paid=6,
                        first_lesson_date=date(2026, 10, 2), payment_status='Paid',
                        payment_date=date(2026, 10, 1), revenue_total=2400, is_new_student=False)
    session.add(source)
    session.flush()
    for i in range(6):
        session.add(SessionLog(id=110 + i, enrollment_id=11, student_id=101, tutor_id=1,
                               session_date=date(2026, 10, 2) + timedelta(weeks=i),
                               session_status='Scheduled', financial_status='Paid',
                               time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    app = FastAPI()
    app.include_router(billing.router, prefix='/api')
    app.include_router(billing_drafts.router, prefix='/api')
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        yield client, session, user
    session.close()
    engine.dispose()


def review_request(client, **changes):
    response = client.get('/api/billing/students/101/context', params={'selected_enrollment_ids': 11})
    assert response.status_code == 200, response.text
    context = response.json()
    payload = {'scenario': context['suggested_request'], 'basis': 'paid_only',
               'selected_enrollment_ids': [11], 'expected_source_fingerprint': context['source_fingerprint'],
               'period_number': 1, 'confirmed_checks': []}
    payload.update(changes)
    return payload


def reviewed(client, payload=None):
    payload = payload or review_request(client)
    response = client.post('/api/billing/students/101/draft-review', json=payload)
    assert response.status_code == 200, response.text
    return payload, response.json()


def save_request(client, key='create-1', payload=None, note=None):
    payload, review = reviewed(client, payload)
    return {'review': payload, 'expected_review_hash': review['review_hash'],
            'idempotency_key': key, 'note': note}


def saved(client, **options):
    data = save_request(client, **options)
    response = client.post('/api/billing/students/101/drafts', json=data)
    assert response.status_code == 200, response.text
    return data, response.json()


def test_storage_disabled_rejects_save_and_reads_but_keeps_review(env, monkeypatch):
    client, session, _ = env
    data = save_request(client)
    monkeypatch.delenv('BILLING_DRAFT_STORAGE_ENABLED')
    assert not service.storage_enabled()
    assert client.post('/api/billing/students/101/drafts', json=data).status_code == 503
    assert client.get('/api/billing/students/101/drafts').status_code == 503
    assert client.get('/api/billing/drafts/00000000-0000-0000-0000-000000000001').status_code == 503
    assert client.post('/api/billing/students/101/draft-review', json=data['review']).status_code == 200
    assert session.query(BillingAccount).count() == 0


def test_review_is_query_only_and_uses_actual_combined_calculation(env):
    client, session, _ = env
    statements = []
    def only_select(_conn, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement
    event.listen(session.bind, 'before_cursor_execute', only_select)
    try:
        _, result = reviewed(client)
    finally:
        event.remove(session.bind, 'before_cursor_execute', only_select)
    assert result['period']['lesson_count'] == 6
    assert result['period']['total_fee'] == 2400
    assert result['message']['zh'] and result['message']['en']
    assert result['message']['blocked_reasons'] == []
    assert statements


def test_save_writes_only_inactive_draft_tables_and_preserves_teaching(env):
    client, session, _ = env
    data = save_request(client)
    statements = []
    def draft_writes_only(_conn, _cursor, statement, *_args):
        if statement.lstrip().upper().startswith(('INSERT', 'UPDATE', 'DELETE')):
            statements.append(statement)
            assert 'billing_' in statement, statement
    event.listen(session.bind, 'before_cursor_execute', draft_writes_only)
    try:
        response = client.post('/api/billing/students/101/drafts', json=data)
    finally:
        event.remove(session.bind, 'before_cursor_execute', draft_writes_only)
    assert response.status_code == 200, response.text
    detail = response.json()
    assert detail['revision'] == detail['current_revision'] == 1
    assert detail['can_copy'] and detail['stale_reasons'] == []
    assert detail['created_at'].endswith('Z')
    assert session.query(BillingAccount).one().active is False
    assert session.query(Enrollment).count() == 1
    assert session.query(SessionLog).count() == 6
    assert session.query(StudentCoupon).count() == 0
    assert session.query(Enrollment).one().fee_message_sent is False
    assert all(s.financial_status == 'Paid' for s in session.query(SessionLog))
    assert len(statements) == 3


def test_same_idempotency_request_replays_before_source_freshness_check(env):
    client, session, _ = env
    data, first = saved(client)
    session.query(Enrollment).filter(Enrollment.id == 11).update({'fee_message_sent': True})
    session.commit()
    response = client.post('/api/billing/students/101/drafts', json=data)
    assert response.status_code == 200, response.text
    replay = response.json()
    assert (replay['id'], replay['revision']) == (first['id'], 1)
    assert not replay['can_copy']
    assert replay['stale_reasons']
    assert session.query(BillingDraftRevision).count() == 1


def test_idempotency_key_cannot_be_reused_for_different_payload_or_actor(env):
    client, session, user = env
    data, _ = saved(client)
    changed = dict(data, note='Changed note')
    assert client.post('/api/billing/students/101/drafts', json=changed).status_code == 409
    other = Tutor(id=2, user_email='another@example.test', tutor_name='Another admin', role='Admin')
    session.add(other)
    session.commit()
    user.id = 2
    # The auth fixture uses the same object, but the persisted actor ID differs.
    assert client.post('/api/billing/students/101/drafts', json=data).status_code == 409
    session.rollback()


def test_changed_source_and_review_hash_are_conflicts_not_new_drafts(env):
    client, session, _ = env
    data = save_request(client)
    invalid_hash = dict(data, expected_review_hash='0' * 64)
    assert client.post('/api/billing/students/101/drafts', json=invalid_hash).status_code == 409
    assert session.query(BillingAccount).count() == 0
    session.query(Enrollment).filter(Enrollment.id == 11).update({'fee_message_sent': True})
    session.commit()
    assert client.post('/api/billing/students/101/drafts', json=data).status_code == 409
    assert session.query(BillingDraft).count() == 0


def test_revision_is_append_only_and_optimistic_version_is_enforced(env):
    client, session, _ = env
    _, first = saved(client)
    original = json.loads(json.dumps(session.query(BillingDraftRevision).one().snapshot))
    data = save_request(client, key='revise-1', note='Review changed coverage')
    data['expected_revision'] = 1
    response = client.put(f"/api/billing/drafts/{first['id']}/revisions", json=data)
    assert response.status_code == 200, response.text
    second = response.json()
    assert second['revision'] == second['current_revision'] == 2
    assert [h['revision'] for h in second['history']] == [2, 1]
    assert session.query(BillingDraftRevision).filter_by(revision=1).one().snapshot == original
    replay = client.put(f"/api/billing/drafts/{first['id']}/revisions", json=data)
    assert replay.status_code == 200 and replay.json()['revision'] == 2
    conflict = dict(data, idempotency_key='revise-2')
    assert client.put(f"/api/billing/drafts/{first['id']}/revisions", json=conflict).status_code == 409
    old = client.get(f"/api/billing/drafts/{first['id']}?revision=1").json()
    assert old['revision'] == 1 and old['current_revision'] == 2
    assert not old['can_copy'] and old['review']['message']['zh'] is None
    listing = client.get('/api/billing/students/101/drafts').json()
    assert len(listing) == 1 and listing[0]['current_revision'] == 2


@pytest.mark.parametrize('kind', ['source', 'calendar', 'policy', 'template'])
def test_stale_detail_withholds_response_text_without_changing_snapshot(env, monkeypatch, kind):
    client, session, _ = env
    _, first = saved(client)
    stored = json.loads(json.dumps(session.query(BillingDraftRevision).one().snapshot))
    if kind == 'source':
        session.query(Student).filter_by(id=101).update({'student_name': 'Updated student'})
        session.commit()
    elif kind == 'calendar':
        session.add(Holiday(holiday_date=date(2026, 12, 18), holiday_name='New closure'))
        session.commit()
    elif kind == 'policy':
        monkeypatch.setattr(billing_drafts, 'POLICY', replace(service.POLICY, version='changed-policy'))
    else:
        monkeypatch.setattr(service, 'MESSAGE_TEMPLATE_VERSION', 'changed-template')
    result = client.get(f"/api/billing/drafts/{first['id']}").json()
    assert not result['can_copy'] and result['stale_reasons']
    assert result['review']['message']['zh'] is result['review']['message']['en'] is None
    assert session.query(BillingDraftRevision).one().snapshot == stored


def test_day_change_alone_does_not_make_unchanged_future_draft_stale(env, monkeypatch):
    client, _, _ = env
    _, first = saved(client)
    monkeypatch.setattr(billing_drafts, 'today', lambda: date(2026, 10, 18))
    result = client.get(f"/api/billing/drafts/{first['id']}").json()
    assert result['can_copy'] and result['stale_reasons'] == []


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_read_only_roles_cannot_save_or_confirm_checks(env, role):
    client, _, user = env
    data = save_request(client)
    user.role = role
    assert client.post('/api/billing/students/101/drafts', json=data).status_code == 403
    confirm = dict(data['review'], confirmed_checks=['CONTINUATION_UNCONFIRMED'])
    assert client.post('/api/billing/students/101/draft-review', json=confirm).status_code == 403


def test_tutor_cannot_read_other_students_saved_draft(env):
    client, _, user = env
    _, first = saved(client)
    user.role = 'Tutor'
    user.id = 9
    assert client.get(f"/api/billing/drafts/{first['id']}").status_code == 404


def test_explicit_admin_confirmations_are_saved_with_review_and_hash(env):
    client, _, _ = env
    payload = review_request(client)
    _, before = reviewed(client, payload)
    payload['confirmed_checks'] = ['CONTINUATION_UNCONFIRMED']
    _, after = reviewed(client, payload)
    assert after['confirmed_checks'] == ['CONTINUATION_UNCONFIRMED']
    assert before['review_hash'] != after['review_hash']
    _, result = saved(client, payload=payload)
    assert result['review']['confirmed_checks'] == ['CONTINUATION_UNCONFIRMED']
    payload['confirmed_checks'] = ['PAID_COVERAGE_GAP']
    assert client.post('/api/billing/students/101/draft-review', json=payload).status_code == 422


@pytest.mark.parametrize('date_value', ['2026-10-30', '2026-12-04'])
def test_edited_start_cannot_skip_or_recharge_uncovered_source_dates(env, date_value):
    client, _, _ = env
    payload = review_request(client)
    payload['scenario']['first_lesson_date'] = date_value
    _, result = reviewed(client, payload)
    assert any(i['code'] == 'SOURCE_DATE_MISMATCH' for i in result['issues'])
    assert result['message']['zh'] is None


def test_existing_unpaid_roots_block_duplicate_parent_message(env):
    client, session, _ = env
    pending = Enrollment(id=12, student_id=101, tutor_id=1, assigned_day='Fri', assigned_time='16:00 - 17:30',
                         location='MSA', lessons_paid=6, first_lesson_date=date(2026, 11, 13),
                         payment_status='Pending Payment', fee_message_sent=True, renewed_from_enrollment_id=11)
    session.add(pending)
    session.flush()
    for i in range(6):
        session.add(SessionLog(id=120 + i, enrollment_id=12, student_id=101, tutor_id=1,
                               session_date=date(2026, 11, 13) + timedelta(weeks=i), session_status='Scheduled',
                               financial_status='Unpaid', time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    payload = review_request(client, selected_enrollment_ids=[12])
    # Build the expected fingerprint for precisely the selected source.
    source = client.get('/api/billing/students/101/context', params={'selected_enrollment_ids': 12}).json()
    payload['scenario'] = source['suggested_request']
    payload['expected_source_fingerprint'] = source['source_fingerprint']
    _, result = reviewed(client, payload)
    assert result['message']['zh'] is None
    assert any(i['code'] == 'EXISTING_ORIGINALS_OVERLAP' for i in result['issues'])


def test_future_period_messages_are_held_while_earlier_payments_are_previews(env):
    client, _, _ = env
    _, result = reviewed(client, review_request(client, period_number=2))
    assert result['message']['zh'] is None
    assert any(i['code'] == 'FUTURE_PAYMENT_PREVIEW' for i in result['issues'])


def test_unverified_coupon_blocks_copy_even_though_gross_total_is_known(env):
    client, _, _ = env
    payload = review_request(client)
    payload['scenario']['coupon'] = {'kind': 'ordinary', 'value': 300, 'verified': False}
    _, result = reviewed(client, payload)
    assert result['period']['total_fee'] == 2400
    assert result['message']['zh'] is None


def test_source_defect_cannot_be_confirmed_away(env):
    client, session, _ = env
    session.query(SessionLog).filter_by(id=110).update({'location': 'DIFFERENT'})
    session.commit()
    payload = review_request(client, confirmed_checks=['CONTINUING_SLOTS_REVIEW', 'CONTINUATION_UNCONFIRMED'])
    _, result = reviewed(client, payload)
    assert any(i['code'] == 'OFF_SLOT_ORIGINALS' for i in result['issues'])
    assert result['message']['zh'] is None


def test_tutor_cannot_forge_another_tutor_scope(env):
    client, _, user = env
    data = review_request(client)
    user.role = 'Tutor'
    assert client.post('/api/billing/students/101/draft-review?tutor_id=99', json=data).status_code == 403
    assert client.get('/api/billing/students/101/drafts?tutor_id=99').status_code == 403


def test_super_admin_impersonating_tutor_uses_requested_scope_but_cannot_write(env):
    client, _, user = env
    data, first = saved(client)
    user.id = 9
    user.role = 'Super Admin'
    headers = {'X-Effective-Role': 'Tutor'}
    assert client.post('/api/billing/students/101/draft-review?tutor_id=1', json=data['review'], headers=headers).status_code == 200
    assert client.get('/api/billing/students/101/drafts?tutor_id=1', headers=headers).status_code == 200
    assert client.get(f"/api/billing/drafts/{first['id']}?tutor_id=1", headers=headers).status_code == 200
    assert client.post('/api/billing/students/101/drafts', json=data, headers=headers).status_code == 403


def test_unready_future_autopay_does_not_block_first_manual_payment(env):
    client, _, _ = env
    data = review_request(client)
    data['scenario']['payment_method'] = 'autopay'
    data['scenario']['mandate_ready'] = False
    _, result = reviewed(client, data)
    assert result['period']['collection']['method'] == 'manual'
    assert result['message']['zh'] and result['message']['en']


@pytest.mark.parametrize('ready,role,copyable', [(False, 'Admin', False), (True, 'Admin', True), (True, 'Tutor', False), (True, 'Supervisor', False)])
def test_actual_autopay_requires_admin_authorisation_confirmation(env, ready, role, copyable):
    client, session, user = env
    session.query(Enrollment).filter_by(id=11).update({'lessons_paid': 9})
    for i in range(6, 9):
        session.add(SessionLog(id=110 + i, enrollment_id=11, student_id=101, tutor_id=1,
                               session_date=date(2026, 10, 2) + timedelta(weeks=i),
                               session_status='Scheduled', financial_status='Paid',
                               time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    data = review_request(client)
    data['scenario']['payment_method'] = 'autopay'
    data['scenario']['mandate_ready'] = ready
    user.role = role
    _, result = reviewed(client, data)
    assert result['period']['collection']['method'] == 'autopay'
    assert bool(result['message']['zh']) is copyable


@pytest.mark.parametrize('scope', ['context', 'calculator'])
def test_unknown_review_codes_fail_closed(env, monkeypatch, scope):
    client, _, _ = env
    data = review_request(client)
    if scope == 'context':
        original = service.load_contexts
        def with_unknown(*args, **kwargs):
            result = original(*args, **kwargs)
            result[101].issues.append(PreviewIssue(code='NEW_SOURCE_RULE', message='Review a new source rule.'))
            return result
        monkeypatch.setattr(service, 'load_contexts', with_unknown)
    else:
        original = service.preview_billing
        def with_unknown(*args, **kwargs):
            result = original(*args, **kwargs)
            result.issues.append(PreviewIssue(code='NEW_CALCULATION_RULE', message='Review a new calculation rule.', period=1))
            return result
        monkeypatch.setattr(service, 'preview_billing', with_unknown)
    _, result = reviewed(client, data)
    assert result['message']['zh'] is None and result['message']['en'] is None


def test_unrelated_historical_unpaid_bill_does_not_block_new_dates(env):
    client, session, _ = env
    old = Enrollment(id=12, student_id=101, tutor_id=1, assigned_day='Fri', assigned_time='16:00 - 17:30',
                     location='MSA', lessons_paid=6, first_lesson_date=date(2026, 8, 7),
                     payment_status='Pending Payment', fee_message_sent=True)
    session.add(old)
    session.flush()
    for i in range(6):
        session.add(SessionLog(id=120 + i, enrollment_id=12, student_id=101, tutor_id=1,
                               session_date=date(2026, 8, 7) + timedelta(weeks=i), session_status='Scheduled',
                               financial_status='Unpaid', time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    _, result = reviewed(client)
    assert any(i['code'] == 'SENT_BILL_REVIEW' for i in result['issues'])
    assert result['message']['zh'] and result['message']['en']
