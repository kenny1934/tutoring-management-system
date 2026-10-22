"""Independent intake acceptance checks against disposable SQLite records.

The engine guard rejects every external connection, including accidental
connections outside the overridden HTTP request database dependency.
"""
from copy import deepcopy
from datetime import date

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.drafts import digest
from billing.models import BillingDraftRevision, BillingPayment, BillingPaymentLine
from models import Enrollment, SessionLog, Tutor
from tests.test_billing_drafts import env as draft_env, saved
from tests.test_billing_workflow import env as workflow_env


@pytest.fixture(autouse=True)
def forbid_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Independent intake checks refuse external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def test_pre_intake_saved_renewal_preserves_hash_and_exact_retry(workflow_env):
    """An existing stored snapshot has no intake key, even as a null field."""
    client, session, _ = workflow_env
    data, draft = saved(client, key='independent-old-draft')
    row = session.query(BillingDraftRevision).one()
    snapshot = deepcopy(row.snapshot)
    snapshot['request'].pop('intake', None)
    snapshot['review'].pop('intake', None)
    old_review_body = {key: value for key, value in snapshot['review'].items()
                       if key not in {'review_hash', 'source_fingerprint', 'issues'}}
    old_review_hash = digest(old_review_body)
    assert draft['review']['review_hash'] == old_review_hash
    row.review_hash = old_review_hash
    snapshot['review']['review_hash'] = old_review_hash
    row.snapshot = snapshot
    old_request = deepcopy(data)
    old_request['review'].pop('intake', None)
    # Pydantic historically included the default null note in its write hash.
    old_request.setdefault('note', None)
    row.payload_hash = digest({'operation': 'create', 'draft_id': None,
                               'student_id': 101, 'actor_id': 1, 'request': old_request})
    session.commit()
    read = client.get(f"/api/billing/drafts/{draft['id']}")
    assert read.status_code == 200, read.text
    assert read.json()['can_copy'] and read.json()['stale_reasons'] == []
    replay = client.post('/api/billing/students/101/drafts', json=data)
    assert replay.status_code == 200, replay.text
    assert (replay.json()['id'], replay.json()['revision']) == (draft['id'], 1)
    assert session.query(BillingDraftRevision).count() == 1


@pytest.fixture
def intake_records(workflow_env):
    client, session, user = workflow_env
    session.add(Tutor(id=2, user_email='intake-second@example.test', tutor_name='Second tutor', role='Tutor'))
    trial = Enrollment(id=21, student_id=102, tutor_id=1, assigned_day='Fri',
                       assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
                       first_lesson_date=date(2026, 10, 16), enrollment_type='Trial',
                       payment_status='Paid', revenue_total=150, is_new_student=False)
    session.add(trial)
    session.flush()
    session.add(SessionLog(id=210, enrollment_id=21, student_id=102, tutor_id=1,
                           session_date=date(2026, 10, 16), time_slot='16:00 - 17:30',
                           location='MSA', session_status='Attended', financial_status='Paid'))
    session.commit()
    return client, session, user


def intake_context(client, *, trial=True, **params):
    if trial:
        params = {'trial_enrollment_id': 21, 'trial_session_id': 210, **params}
    return client.get('/api/billing/students/102/intake-context', params=params)


def intake_request(client, *, trial=True, **changes):
    response = intake_context(client, trial=trial)
    assert response.status_code == 200, response.text
    context = response.json()
    scenario = deepcopy(context['suggested_request']) or {}
    scenario.update(first_lesson_date='2026-10-30', mode='new_student', payment_method='manual',
                    slots=[{'weekday': 'Fri', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}],
                    materials_fee=context['materials_fee'], trial_deduction=trial, mandate_ready=False)
    source = {'slots': [{'tutor_id': 1}]}
    if trial:
        source.update(trial_enrollment_id=21, trial_session_id=210)
    result = {'scenario': scenario, 'basis': 'paid_only', 'selected_enrollment_ids': [],
              'expected_source_fingerprint': context['source_fingerprint'],
              'period_number': 1, 'confirmed_checks': [], 'intake': source}
    result.update(changes)
    return result


def reviewed_intake(client, payload=None):
    payload = payload or intake_request(client)
    response = client.post('/api/billing/students/102/draft-review', json=payload)
    assert response.status_code == 200, response.text
    return payload, response.json()


def saved_intake(client, payload=None):
    payload, review = reviewed_intake(client, payload)
    response = client.post('/api/billing/students/102/drafts', json={
        'review': payload, 'expected_review_hash': review['review_hash'],
        'idempotency_key': 'independent-intake-save',
    })
    assert response.status_code == 200, response.text
    return payload, response.json()


def setup_preference(client, method='manual'):
    response = client.put('/api/billing/students/102/preferences', json={
        'payment_method': method, 'mandate_ready': False, 'expected_version': 0,
        'idempotency_key': 'independent-intake-preference',
    })
    assert response.status_code == 200, response.text


def confirmation_data(draft):
    return {'expected_revision': draft['revision'], 'expected_review_hash': draft['review']['review_hash'],
            'expected_preference_version': 1, 'idempotency_key': 'independent-intake-confirm'}


def test_intake_context_and_quote_do_not_create_teaching_records(intake_records):
    client, session, _ = intake_records
    before = (session.query(Enrollment).count(), session.query(SessionLog).count())
    response = intake_context(client)
    assert response.status_code == 200, response.text
    context = response.json()
    assert context['student']['id'] == 102
    assert context['trial']['enrollment_id'] == 21 and context['trial']['session_id'] == 210
    assert context['is_new_student'] and context['materials_fee'] == 100
    _, review = reviewed_intake(client)
    assert review['period']['collection']['method'] == 'manual'
    assert review['period']['deductions'] == [{'kind': 'trial', 'amount': 150}]
    assert not review['message']['blocked_reasons']
    assert (session.query(Enrollment).count(), session.query(SessionLog).count()) == before
    assert session.query(BillingPayment).count() == 0


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor'])
def test_scoped_read_only_staff_can_preview_but_cannot_save_intake(intake_records, role):
    client, session, user = intake_records
    payload = intake_request(client)
    user.role = role
    assert intake_context(client).status_code == 200
    _, review = reviewed_intake(client, payload)
    saved_response = client.post('/api/billing/students/102/drafts', json={
        'review': payload, 'expected_review_hash': review['review_hash'],
        'idempotency_key': 'read-only-forged-save',
    })
    assert saved_response.status_code == 403
    assert session.query(BillingDraftRevision).count() == 0


def test_intake_scope_cannot_be_forged_or_leak_another_students_trial(intake_records):
    client, _, user = intake_records
    user.role = 'Tutor'
    assert intake_context(client, tutor_id=2).status_code == 403
    user.id = 2
    assert intake_context(client).status_code == 404
    user.role = 'Admin'
    cross_student = client.get('/api/billing/students/101/intake-context', params={
        'trial_enrollment_id': 21, 'trial_session_id': 210,
    })
    assert cross_student.status_code in {404, 422}


@pytest.mark.parametrize('change', ['wrong_session', 'not_attended', 'wrong_owner', 'converted'])
def test_trial_source_must_still_be_exact_attended_and_unconverted(intake_records, change):
    client, session, _ = intake_records
    if change == 'wrong_session':
        response = intake_context(client, trial_session_id=110)
    else:
        if change == 'not_attended':
            session.get(SessionLog, 210).session_status = 'No Show'
        elif change == 'wrong_owner':
            session.get(SessionLog, 210).student_id = 101
        else:
            session.add(Enrollment(id=22, student_id=102, tutor_id=1, assigned_day='Fri',
                                   assigned_time='16:00 - 17:30', location='MSA', lessons_paid=6,
                                   first_lesson_date=date(2026, 10, 30), enrollment_type='Regular',
                                   payment_status='Pending Payment', renewed_from_enrollment_id=21))
        session.commit()
        response = intake_context(client)
    if response.status_code == 200:
        assert response.json()['issues'], response.text
        payload = intake_request(client)
        _, review = reviewed_intake(client, payload)
        assert review['message']['blocked_reasons']
    else:
        assert response.status_code in {404, 409, 422}, response.text


def test_trial_deduction_cannot_be_forged_without_a_trial_or_stacked(intake_records):
    client, _, _ = intake_records
    payload = intake_request(client, trial=False)
    payload['scenario']['trial_deduction'] = True
    response = client.post('/api/billing/students/102/draft-review', json=payload)
    if response.status_code == 200:
        assert response.json()['message']['blocked_reasons']
    else:
        assert response.status_code in {403, 422}
    payload = intake_request(client)
    payload['scenario']['coupon'] = {'kind': 'ordinary', 'value': 300, 'verified': True,
                                     'available_count': 1, 'expires_on': '2027-06-30'}
    assert client.post('/api/billing/students/102/draft-review', json=payload).status_code == 422


def test_two_weekly_classes_create_one_payment_with_exact_tutors_and_net_revenue(intake_records):
    client, session, _ = intake_records
    setup_preference(client, 'autopay')
    payload = intake_request(client)
    payload['scenario']['payment_method'] = 'autopay'
    payload['scenario']['slots'].append({'weekday': 'Sat', 'time_slot': '10:00 - 11:30', 'location': 'MSA'})
    payload['intake']['slots'].append({'tutor_id': 2})
    _, draft = saved_intake(client, payload)
    assert session.query(Enrollment).count() == 2
    body = confirmation_data(draft)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=body)
    assert response.status_code == 200, response.text
    payment = response.json()
    assert payment['review']['period']['collection']['method'] == 'manual'
    assert len(payment['lines']) == 2
    created = [session.get(Enrollment, line['enrollment_id']) for line in payment['lines']]
    assert [row.tutor_id for row in created] == [1, 2]
    assert all(row.renewed_from_enrollment_id == 21 for row in created)
    assert [row.is_new_student for row in created] == [True, False]
    assert sum(row.revenue_total for row in created) == payment['review']['period']['gross_tuition'] - 150
    assert sum(line['materials_fee'] for line in payment['lines']) == 100
    assert sum(line['tuition_amount'] + line['materials_fee'] for line in payment['lines']) == payment['review']['period']['total_fee']
    for line in payment['lines']:
        enrollment = session.get(Enrollment, line['enrollment_id'])
        rows = session.query(SessionLog).filter_by(enrollment_id=enrollment.id).all()
        assert len(rows) == line['lesson_count'] and all(row.tutor_id == enrollment.tutor_id for row in rows)
    replay = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=body)
    assert replay.status_code == 200 and replay.json()['id'] == payment['id']
    assert session.query(BillingPayment).count() == 1 and session.query(BillingPaymentLine).count() == 2


def test_changed_trial_after_save_masks_message_and_cannot_confirm(intake_records):
    client, session, _ = intake_records
    setup_preference(client)
    _, draft = saved_intake(client)
    before = session.query(Enrollment).count()
    session.get(SessionLog, 210).session_status = 'No Show'
    session.commit()
    read = client.get(f"/api/billing/drafts/{draft['id']}")
    assert read.status_code == 200, read.text
    assert not read.json()['can_copy'] and read.json()['review']['message']['zh'] is None
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirmation_data(draft))
    assert response.status_code in {409, 422}, response.text
    assert session.query(Enrollment).count() == before and session.query(BillingPayment).count() == 0


def test_failed_confirmation_rolls_back_every_intake_teaching_row(intake_records, monkeypatch):
    client, session, _ = intake_records
    setup_preference(client)
    _, draft = saved_intake(client)
    before = (session.query(Enrollment).count(), session.query(SessionLog).count())
    def fail_after_creation(*_args, **_kwargs):
        raise RuntimeError('Synthetic atomicity failure')
    monkeypatch.setattr('services.unlisted_lessons.fill_unlisted_lessons', fail_after_creation)
    with pytest.raises(RuntimeError, match='Synthetic atomicity failure'):
        client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirmation_data(draft))
    assert (session.query(Enrollment).count(), session.query(SessionLog).count()) == before
    assert session.query(BillingPayment).count() == 0 and session.query(BillingPaymentLine).count() == 0


def test_materials_override_requires_admin_reason_and_survives_reopening(intake_records):
    client, _, user = intake_records
    payload = intake_request(client)
    payload['scenario']['materials_fee'] = 0
    _, missing_reason = reviewed_intake(client, payload)
    assert missing_reason['message']['blocked_reasons']
    payload['intake']['materials_override_reason'] = 'Materials were already supplied during the trial.'
    _, adjusted = reviewed_intake(client, payload)
    assert not adjusted['message']['blocked_reasons']
    assert adjusted['period']['materials_fee'] == 0
    _, draft = saved_intake(client, payload)
    reopened = client.get(f"/api/billing/drafts/{draft['id']}")
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()['review']['intake']['materials_override_reason'] == payload['intake']['materials_override_reason']
    user.role = 'Tutor'
    response = client.post('/api/billing/students/102/draft-review', json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['message']['blocked_reasons']
    assert response.json()['message']['zh'] is None and response.json()['message']['en'] is None


def test_returning_student_uses_history_for_materials_without_changing_legacy_revenue(intake_records):
    client, session, _ = intake_records
    historical = Enrollment(id=31, student_id=102, tutor_id=1, assigned_day='Fri',
                            assigned_time='16:00 - 17:30', location='MSA', lessons_paid=6,
                            first_lesson_date=date(2025, 10, 3), enrollment_type='Regular',
                            payment_status='Paid', revenue_total=2375, is_new_student=True)
    session.add(historical)
    session.commit()
    response = intake_context(client, trial=False)
    assert response.status_code == 200, response.text
    assert not response.json()['is_new_student'] and response.json()['materials_fee'] == 0
    _, review = reviewed_intake(client, intake_request(client, trial=False))
    assert review['period']['materials_fee'] == 0 and review['period']['deductions'] == []
    assert session.get(Enrollment, 31).revenue_total == 2375


def test_short_first_payment_keeps_exact_boundary_reason_and_following_journey(intake_records):
    client, _, _ = intake_records
    payload = intake_request(client)
    payload['scenario'].update(first_lesson_date='2026-11-11', trial_deduction=False,
        slots=[{'weekday': 'Tue', 'time_slot': '16:00 - 17:30', 'location': 'MSA'},
               {'weekday': 'Wed', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}],
        adjustment={'through': '2026-11-30', 'reason': 'Keep the first collection manageable.'})
    payload['intake']['slots'] = [{'tutor_id': 1}, {'tutor_id': 2}]
    _, draft = saved_intake(client, payload)
    period = draft['review']['period']
    assert period['lesson_count'] == 5
    assert period['coverage_through'] == '2026-11-30'
    assert period['adjustment_reason'] == 'Keep the first collection manageable.'
    assert period['gross_tuition'] == 2000 and period['total_fee'] == 2100
    assert not draft['review']['message']['blocked_reasons']
    preview = client.post('/api/billing/preview', json=payload['scenario'])
    assert preview.status_code == 200, preview.text
    assert preview.json()['periods'][1]['coverage_from'] == '2026-12-01'
