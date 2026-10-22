"""Intake integration against invented SQLite data with external access forbidden."""
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import guards
from billing.models import BillingPayment
from billing.schemas import BillingDraftReviewRequest
from models import Enrollment, SessionLog, Tutor
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Intake tests may only use synthetic SQLite data.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def intake_env(env):
    client, db, user = env
    db.add(Enrollment(id=21, student_id=102, tutor_id=1, enrollment_type='Trial',
                      assigned_day='Tue', assigned_time='16:00 - 17:30', location='MSA',
                      first_lesson_date=date(2026, 11, 3), lessons_paid=1, payment_status='Paid'))
    db.flush()
    db.add(SessionLog(id=210, enrollment_id=21, student_id=102, tutor_id=1,
                      session_date=date(2026, 11, 3), time_slot='16:00 - 17:30', location='MSA',
                      session_status='Attended', financial_status='Paid'))
    db.commit()
    return client, db, user


def intake_request(client, *, trial=True):
    query = {'trial_enrollment_id': 21, 'trial_session_id': 210} if trial else {}
    response = client.get('/api/billing/students/102/intake-context', params=query)
    assert response.status_code == 200, response.text
    context = response.json()
    scenario = context['suggested_request'] or {
        'first_lesson_date': '2026-11-10', 'slots': [{'weekday': 'Tue', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}],
        'mode': 'new_student', 'payment_method': 'manual', 'materials_fee': context['materials_fee'],
    }
    return {'scenario': scenario, 'expected_source_fingerprint': context['source_fingerprint'],
            'intake': {'trial_enrollment_id': 21 if trial else None,
                       'trial_session_id': 210 if trial else None, 'slots': [{'tutor_id': 1}]}}


def reviewed(client, data):
    response = client.post('/api/billing/students/102/draft-review', json=data)
    assert response.status_code == 200, response.text
    return response.json()


def saved(client, data):
    review = reviewed(client, data)
    payload = {'review': data, 'expected_review_hash': review['review_hash'], 'idempotency_key': 'intake-save'}
    response = client.post('/api/billing/students/102/drafts', json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def confirmed(client, data):
    draft = saved(client, data)
    payload = {'expected_revision': draft['revision'], 'expected_review_hash': draft['review']['review_hash'],
               'expected_preference_version': 1, 'idempotency_key': 'intake-confirm'}
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=payload)
    assert response.status_code == 200, response.text
    return draft, payload, response.json()


def save_preference(client, method='manual'):
    response = client.put('/api/billing/students/102/preferences', json={
        'payment_method': method, 'mandate_ready': False, 'expected_version': 0,
        'idempotency_key': 'intake-preference',
    })
    assert response.status_code == 200, response.text


def test_no_enrollment_student_context_and_generic_first_payment(intake_env):
    client, db, _ = intake_env
    db.query(SessionLog).filter(SessionLog.enrollment_id == 21).delete()
    db.query(Enrollment).filter(Enrollment.id == 21).delete()
    db.commit()
    save_preference(client)
    data = intake_request(client, trial=False)
    _, _, payment = confirmed(client, data)
    assert payment['review']['period']['collection']['method'] == 'manual'
    assert payment['review']['period']['materials_fee'] == 100
    assert db.get(Enrollment, payment['lines'][0]['enrollment_id']).is_new_student


def test_trial_conversion_replay_and_newness_survive_waived_materials(intake_env):
    client, db, _ = intake_env
    save_preference(client, 'autopay')
    data = intake_request(client)
    data['scenario']['materials_fee'] = 0
    data['intake']['materials_override_reason'] = 'Admin approved materials waiver'
    draft, confirm, payment = confirmed(client, data)
    assert payment['review']['period']['collection']['method'] == 'manual'
    assert payment['review']['period']['total_fee'] == 3050
    enrollment = db.get(Enrollment, payment['lines'][0]['enrollment_id'])
    assert enrollment.renewed_from_enrollment_id == 21
    assert enrollment.is_new_student and enrollment.revenue_total == 3050
    assert payment['lines'][0]['materials_fee'] == 0
    replay = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirm)
    assert replay.status_code == 200 and replay.json() == payment
    assert db.query(BillingPayment).count() == 1


@pytest.mark.parametrize('field,value', [('renewed_from_enrollment_id', None), ('is_new_student', False)])
def test_mutated_intake_link_or_newness_blocks_financial_action(intake_env, field, value):
    client, db, _ = intake_env
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client))
    enrollment = db.get(Enrollment, payment['lines'][0]['enrollment_id'])
    setattr(enrollment, field, value)
    db.commit()
    detail = client.get(f"/api/billing/payments/{payment['id']}")
    assert detail.status_code == 200
    assert not detail.json()['can_copy'] and detail.json()['review_issues']
    action = client.post(f"/api/billing/payments/{payment['id']}/sent", json={
        'expected_version': 1, 'language': 'en', 'idempotency_key': 'unsafe-sent'})
    assert action.status_code == 409


@pytest.mark.parametrize('ownership', ['foreign_student', 'foreign_enrollment'])
def test_inconsistent_source_ownership_blocks_without_exposing_rows(intake_env, ownership):
    client, db, _ = intake_env
    if ownership == 'foreign_student':
        db.add(SessionLog(id=211, enrollment_id=21, student_id=101, tutor_id=1,
                          session_date=date(2026, 11, 4), session_status='Attended',
                          time_slot='16:00 - 17:30', location='MSA'))
    else:
        db.add(SessionLog(id=211, enrollment_id=11, student_id=102, tutor_id=1,
                          session_date=date(2026, 11, 4), session_status='Attended',
                          time_slot='16:00 - 17:30', location='MSA'))
    db.commit()
    data = intake_request(client)
    review = reviewed(client, data)
    assert review['message']['zh'] is None
    assert any(i['code'] == 'INTAKE_SOURCE_OWNERSHIP' for i in review['issues'])
    context = client.get('/api/billing/students/102/intake-context').json()
    assert 'lessons' not in context and 'source_blocks' not in context


def test_requested_tutor_change_stales_a_saved_intake(intake_env):
    client, db, _ = intake_env
    db.add(Tutor(id=2, user_email='intake-tutor@example.test', tutor_name='Intake teacher', role='Tutor'))
    db.commit()
    data = intake_request(client)
    data['intake']['slots'][0]['tutor_id'] = 2
    draft = saved(client, data)
    db.get(Tutor, 2).tutor_name = 'Changed teacher'
    db.commit()
    detail = client.get(f"/api/billing/drafts/{draft['id']}")
    assert detail.status_code == 200 and not detail.json()['can_copy']
    assert detail.json()['stale_reasons']


def test_cancelled_first_intake_keeps_payment_history_and_exact_replay(intake_env):
    client, db, user = intake_env
    db.query(SessionLog).filter(SessionLog.enrollment_id == 21).delete()
    db.query(Enrollment).filter(Enrollment.id == 21).delete()
    db.add(Tutor(id=2, tutor_name='Unrelated tutor', user_email='unrelated-intake@example.test', role='Tutor'))
    db.commit()
    save_preference(client)
    _, _, payment = confirmed(client, intake_request(client, trial=False))
    action = {'expected_version': 1, 'idempotency_key': 'cancel-first-intake', 'reason': 'Parent cancelled before starting'}
    response = client.post(f"/api/billing/payments/{payment['id']}/cancel", json=action)
    assert response.status_code == 200, response.text
    cancelled = response.json()
    assert cancelled['status'] == 'Cancelled'
    assert client.post(f"/api/billing/payments/{payment['id']}/cancel", json=action).json() == cancelled
    assert client.get(f"/api/billing/payments/{payment['id']}").status_code == 200
    assert len(client.get('/api/billing/students/102/payments').json()) == 1
    user.role = 'Tutor'
    assert client.get(f"/api/billing/payments/{payment['id']}").status_code == 200
    assert len(client.get('/api/billing/students/102/payments').json()) == 1
    assert db.query(BillingPayment).count() == 1
    user.id = 2
    assert client.get(f"/api/billing/payments/{payment['id']}").status_code == 404
    assert client.get('/api/billing/students/102/payments').status_code == 404


def test_deleted_trial_masks_saved_message_but_admin_can_inspect_and_discard(intake_env):
    client, db, _ = intake_env
    draft = saved(client, intake_request(client))
    db.query(SessionLog).filter(SessionLog.enrollment_id == 21).delete()
    db.query(Enrollment).filter(Enrollment.id == 21).delete()
    db.commit()
    response = client.get(f"/api/billing/drafts/{draft['id']}")
    assert response.status_code == 200 and not response.json()['can_copy']
    assert response.json()['stale_reasons']
    discard = client.post(f"/api/billing/drafts/{draft['id']}/discard", json={
        'expected_revision': 1, 'idempotency_key': 'discard-missing-trial'})
    assert discard.status_code == 200 and discard.json()['state'] == 'discarded'


def test_intake_none_is_absent_from_historical_contract_serialization():
    payload = {'scenario': {'first_lesson_date': '2026-11-10', 'mode': 'transition',
                           'slots': [{'weekday': 'Tue', 'location': 'MSA', 'time_slot': '16:00 - 17:30'}]},
               'selected_enrollment_ids': [11], 'expected_source_fingerprint': 'a' * 64}
    assert 'intake' not in BillingDraftReviewRequest.model_validate(payload).model_dump(mode='json')


@pytest.mark.parametrize('flag', ['off', 'storage', 'on'])
def test_generic_cutover_guard_leaves_storage_only_and_special_courses_unchanged(monkeypatch, flag):
    monkeypatch.delenv('BILLING_WORKFLOW_ENABLED', raising=False)
    monkeypatch.delenv('BILLING_WORKFLOW_STORAGE_ENABLED', raising=False)
    if flag == 'storage':
        monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    if flag == 'on':
        monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'true')
        with pytest.raises(HTTPException) as error:
            guards.assert_generic_regular_policy(102, date(2026, 10, 30))
        assert error.value.status_code == 409
    else:
        guards.assert_generic_regular_policy(102, date(2026, 10, 30))
    guards.assert_generic_regular_policy(102, date(2026, 10, 29))
    guards.assert_generic_regular_policy(102, date(2027, 9, 1))
    for course in ['Trial', 'One-Time', 'Summer']:
        guards.assert_generic_regular_policy(102, date(2026, 11, 1), course)
