"""Exercise confirmed payments against isolated synthetic student records.

SQLite covers application state and HTTP permissions. The matching migration
and concurrent transaction checks run separately against disposable MySQL.
"""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import (
    BillingAccount, BillingDraftRevision, BillingLessonClaim, BillingOperation,
    BillingPayment, BillingPaymentLine, BillingPreference,
)
from billing import workflow
from models import Enrollment, Holiday, SessionLog, StudentCoupon, Tutor, TutorMemo
from tests.test_billing_drafts import env as draft_env, review_request, saved, save_request


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Workflow tests may only use their synthetic SQLite database.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def env(draft_env, monkeypatch):
    from routers import billing_workflow
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'true')
    monkeypatch.setattr(billing_workflow, 'today', lambda: date(2026, 10, 17))
    client, session, user = draft_env
    client.app.include_router(billing_workflow.router, prefix='/api')
    yield client, session, user


def preference(client, *, method='manual', ready=False, version=0, key='preference-1'):
    payload = {'payment_method': method, 'mandate_ready': ready,
               'expected_version': version, 'idempotency_key': key}
    response = client.put('/api/billing/students/101/preferences', json=payload)
    assert response.status_code == 200, response.text
    return payload, response.json()


def confirmation(client, *, payload=None, key='confirm-1', draft_key='draft-1'):
    _, draft = saved(client, key=draft_key, payload=payload)
    data = {'idempotency_key': key, 'expected_revision': draft['revision'],
            'expected_review_hash': draft['review']['review_hash'],
            'expected_preference_version': 1}
    return draft, data


def confirmed(client, *, payload=None, method='manual', ready=False):
    preference(client, method=method, ready=ready)
    if payload is not None:
        context = client.get('/api/billing/students/101/context', params=[
            ('basis', payload['basis']),
            *[('selected_enrollment_ids', eid) for eid in payload['selected_enrollment_ids']],
        ]).json()
        payload['expected_source_fingerprint'] = context['source_fingerprint']
    draft, data = confirmation(client, payload=payload)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == 200, response.text
    return draft, data, response.json()


def pay_payload(payment, **changes):
    data = {'expected_version': payment['version'], 'idempotency_key': 'paid-1',
            'payment_date': '2026-10-17', 'amount': payment['review']['period']['total_fee'],
            'method': 'cash'}
    data.update(changes)
    return data


def next_review(client, enrollment_ids):
    result = client.get('/api/billing/students/101/context', params=[
        ('basis', 'include_pending'), *[('selected_enrollment_ids', eid) for eid in enrollment_ids],
    ])
    assert result.status_code == 200, result.text
    context = result.json()
    return {'scenario': context['suggested_request'], 'basis': 'include_pending',
            'selected_enrollment_ids': enrollment_ids,
            'expected_source_fingerprint': context['source_fingerprint'], 'period_number': 1,
            'confirmed_checks': ['CONTINUING_SLOTS_REVIEW', 'CONTINUATION_UNCONFIRMED']}


def second_class(session):
    session.add(Tutor(id=2, user_email='other@example.test', tutor_name='Second Tutor', role='Tutor'))
    session.add(Enrollment(id=12, student_id=101, tutor_id=2, assigned_day='Sat',
                           assigned_time='10:00 - 11:30', location='MSA', lessons_paid=6,
                           first_lesson_date=date(2026, 10, 3), payment_status='Paid',
                           payment_date=date(2026, 10, 1), revenue_total=2400, is_new_student=False))
    session.flush()
    for i in range(6):
        session.add(SessionLog(id=120 + i, enrollment_id=12, student_id=101, tutor_id=2,
                               session_date=date(2026, 10, 3) + timedelta(weeks=i),
                               session_status='Scheduled', financial_status='Paid',
                               time_slot='10:00 - 11:30', location='MSA'))
    session.commit()


def coupon_payload(client, *, ids=(11,), value=300, count=1):
    payload = next_review(client, list(ids))
    payload['scenario']['coupon'] = {'kind': 'ordinary', 'value': value, 'verified': True,
                                     'available_count': count, 'expires_on': '2027-06-30'}
    return payload


def test_workflow_disabled_has_no_mutations(env, monkeypatch):
    client, session, _ = env
    monkeypatch.delenv('BILLING_WORKFLOW_ENABLED')
    response = client.put('/api/billing/students/101/preferences', json={
        'payment_method': 'manual', 'mandate_ready': False, 'expected_version': 0,
        'idempotency_key': 'disabled',
    })
    assert response.status_code == 503
    assert session.query(BillingAccount).count() == 0
    assert session.query(Enrollment).count() == 1


def test_disabling_writes_keeps_confirmed_records_readable_and_protected(env, monkeypatch):
    client, session, _ = env
    draft, confirmation_data, payment = confirmed(client)
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    options = client.get('/api/billing/options').json()
    assert options['workflow_available'] and not options['workflow_writes_available']
    assert client.get('/api/billing/students/101/preferences').json()['payment_method'] == 'manual'
    assert client.get('/api/billing/students/101/context').json()['recorded_payment_method'] == 'manual'
    assert client.get(f"/api/billing/payments/{payment['id']}").json()['id'] == payment['id']
    assert client.get('/api/billing/students/101/payments').json()[0]['id'] == payment['id']
    assert client.get(f"/api/billing/drafts/{draft['id']}").json()['confirmed_payment_id'] == payment['id']
    assert client.get('/api/billing/students/101/drafts').json()[0]['confirmed_payment_id'] == payment['id']
    assert client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirmation_data).status_code == 503
    assert client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment)).status_code == 503
    assert client.put('/api/billing/students/101/preferences', json={
        'payment_method': 'autopay', 'mandate_ready': False, 'expected_version': 1,
        'idempotency_key': 'disabled-preference',
    }).status_code == 503
    assert session.query(BillingPayment).one().status == 'Pending Payment'


def test_preferences_separate_parent_choice_from_bank_readiness_and_replay(env):
    client, session, _ = env
    before = client.get('/api/billing/students/101/preferences').json()
    assert before['version'] == 0 and before['payment_method'] is None
    data, first = preference(client, method='autopay')
    assert first['payment_method'] == 'autopay' and not first['mandate_ready']
    replay = client.put('/api/billing/students/101/preferences', json=data)
    assert replay.status_code == 200 and replay.json() == first
    assert session.query(BillingOperation).count() == 1
    assert not session.query(BillingAccount).one().active
    _, second = preference(client, method='autopay', ready=True, version=1, key='preference-2')
    assert second['mandate_ready'] and second['version'] == 2
    assert client.put('/api/billing/students/101/preferences', json=dict(data, idempotency_key='stale')).status_code == 409
    assert client.put('/api/billing/students/101/preferences', json=dict(data, mandate_ready=True)).status_code == 409
    assert session.query(BillingPreference).one().version == 2


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_non_admin_cannot_save_preference_or_confirm(env, role):
    client, session, user = env
    preference(client)
    draft, data = confirmation(client)
    user.role = role
    settings = {'payment_method': 'manual', 'mandate_ready': False, 'expected_version': 1, 'idempotency_key': 'forged'}
    assert client.put('/api/billing/students/101/preferences', json=settings).status_code == 403
    assert client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data).status_code == 403
    assert session.query(BillingPayment).count() == 0


def test_effective_tutor_cannot_mutate_even_with_super_admin_token(env):
    client, _, user = env
    preference(client)
    draft, data = confirmation(client)
    user.role = 'Super Admin'
    headers = {'X-Effective-Role': 'Tutor'}
    assert client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data, headers=headers).status_code == 403


def test_confirmation_creates_only_reviewed_dates_and_one_payment(env):
    client, session, _ = env
    draft, _, payment = confirmed(client)
    assert payment['status'] == 'Pending Payment' and payment['version'] == 1
    assert payment['can_copy'] and payment['review_issues'] == []
    assert len(payment['lines']) == 1
    enrollment = session.get(Enrollment, payment['lines'][0]['enrollment_id'])
    assert enrollment.renewed_from_enrollment_id == 11
    assert enrollment.payment_status == 'Pending Payment' and not enrollment.fee_message_sent
    assert enrollment.payment_deadline.isoformat() == payment['review']['period']['collection']['due_before_lesson']
    assert enrollment.discount_id is None and enrollment.revenue_total == 2400
    rows = session.query(SessionLog).filter_by(enrollment_id=enrollment.id).order_by(SessionLog.session_date).all()
    expected = sorted((l['date'], l['time_slot'], l['location']) for l in draft['review']['period']['lessons'])
    assert [(r.session_date.isoformat(), r.time_slot, r.location) for r in rows] == expected
    assert all(r.financial_status == 'Unpaid' for r in rows)
    assert session.query(BillingLessonClaim).count() == len(expected)
    assert session.query(BillingAccount).one().active
    assert session.query(BillingPayment).one().snapshot['review'] == draft['review']
    assert session.get(Enrollment, 11).payment_status == 'Paid'


def test_confirm_double_click_replays_but_changed_key_cannot_duplicate(env):
    client, session, _ = env
    draft, data, payment = confirmed(client)
    url = f"/api/billing/drafts/{draft['id']}/confirm"
    replay = client.post(url, json=data)
    assert replay.status_code == 200 and replay.json()['id'] == payment['id']
    assert client.post(url, json=dict(data, idempotency_key='second-confirm')).status_code == 409
    assert session.query(BillingPayment).count() == 1
    assert session.query(Enrollment).count() == 2


@pytest.mark.parametrize('change', ['calendar', 'source', 'revision', 'hash', 'preference'])
def test_confirmation_refuses_stale_review_and_rolls_back(env, change):
    client, session, _ = env
    preference(client)
    draft, data = confirmation(client)
    if change == 'calendar':
        session.add(Holiday(holiday_date=date(2026, 12, 18), holiday_name='Closure'))
        session.commit()
    elif change == 'source':
        session.get(Enrollment, 11).revenue_total = 2399
        session.commit()
    elif change == 'revision':
        update = save_request(client, key='new-revision')
        update['expected_revision'] = 1
        assert client.put(f"/api/billing/drafts/{draft['id']}/revisions", json=update).status_code == 200
    elif change == 'hash':
        data['expected_review_hash'] = '0' * 64
    else:
        preference(client, method='autopay', version=1, key='changed-method')
    result = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert result.status_code == 409, result.text
    assert session.query(BillingPayment).count() == 0
    assert session.query(BillingLessonClaim).count() == 0
    assert session.query(Enrollment).count() == 1
    assert not session.query(BillingAccount).one().active


def test_preference_is_required_and_must_match_draft(env):
    client, session, _ = env
    draft, data = confirmation(client)
    url = f"/api/billing/drafts/{draft['id']}/confirm"
    assert client.post(url, json=data).status_code == 409
    preference(client, method='autopay')
    assert client.post(url, json=data).status_code == 409
    assert session.query(BillingPayment).count() == 0


def test_first_manual_payment_under_autopay_needs_no_bank_mandate(env):
    client, _, _ = env
    payload = review_request(client)
    payload['scenario']['payment_method'] = 'autopay'
    _, _, payment = confirmed(client, payload=payload, method='autopay')
    assert payment['review']['period']['collection']['method'] == 'manual'
    assert payment['can_copy']


@pytest.mark.parametrize('ready', [False, True])
def test_actual_autopay_requires_saved_bank_authorisation(env, ready):
    client, session, _ = env
    session.get(Enrollment, 11).lessons_paid = 9
    for i in range(6, 9):
        session.add(SessionLog(id=110 + i, enrollment_id=11, student_id=101, tutor_id=1,
                               session_date=date(2026, 10, 2) + timedelta(weeks=i),
                               session_status='Scheduled', financial_status='Paid',
                               time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    preference(client, method='autopay', ready=ready)
    payload = review_request(client)
    payload['scenario'].update(payment_method='autopay', mandate_ready=True)
    draft, data = confirmation(client, payload=payload)
    assert draft['review']['period']['collection']['method'] == 'autopay'
    result = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    if not ready:
        assert result.status_code == 409, result.text
        assert session.query(BillingPayment).count() == 0
    else:
        assert result.status_code == 200, result.text
        payment = result.json()
        deadline = payment['review']['period']['collection']['debit_to']
        assert deadline is not None
        assert all(session.get(Enrollment, line['enrollment_id']).payment_deadline.isoformat() == deadline
                   for line in payment['lines'])


def test_two_classes_allocate_one_coupon_and_materials_outside_revenue(env):
    client, session, _ = env
    second_class(session)
    session.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    session.commit()
    payload = coupon_payload(client, ids=(11, 12), value=301)
    payload['scenario']['materials_fee'] = 100
    _, _, payment = confirmed(client, payload=payload)
    assert len(payment['lines']) == 2
    assert sum(line['discount_amount'] for line in payment['lines']) == 301
    assert sum(line['materials_fee'] for line in payment['lines']) == payment['review']['period']['materials_fee']
    assert sum(line['tuition_amount'] + line['materials_fee'] for line in payment['lines']) == payment['review']['period']['total_fee']
    assert {line['tutor_id'] for line in payment['lines']} == {1, 2}
    assert payment['coupon_status'] == 'reserved'
    assert session.query(StudentCoupon).one().available_coupons == 1
    assert sum(session.get(Enrollment, line['enrollment_id']).revenue_total for line in payment['lines']) == payment['review']['period']['gross_tuition'] - 301


def test_sent_updates_every_enrollment_once_and_records_language(env):
    client, session, _ = env
    second_class(session)
    _, _, payment = confirmed(client, payload=next_review(client, [11, 12]))
    data = {'expected_version': 1, 'idempotency_key': 'sent-1', 'language': 'zh'}
    url = f"/api/billing/payments/{payment['id']}/sent"
    response = client.post(url, json=data)
    assert response.status_code == 200, response.text
    sent = response.json()
    assert sent['version'] == 2 and sent['sent_at'] and sent['sent_language'] == 'zh'
    assert all(session.get(Enrollment, line['enrollment_id']).fee_message_sent for line in sent['lines'])
    assert client.post(url, json=data).json()['version'] == 2
    assert client.post(url, json=dict(data, idempotency_key='stale-sent')).status_code == 409
    assert session.query(BillingOperation).filter_by(kind='sent').count() == 1


def test_payment_is_atomic_for_all_classes_and_preserves_imported_coupons(env):
    client, session, _ = env
    second_class(session)
    session.add(StudentCoupon(student_id=101, available_coupons=2, coupon_value=300))
    session.commit()
    _, _, payment = confirmed(client, payload=coupon_payload(client, ids=(11, 12), count=2))
    data = pay_payload(payment)
    url = f"/api/billing/payments/{payment['id']}/paid"
    response = client.post(url, json=data)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['status'] == 'Paid' and result['version'] == 2
    assert result['coupon_status'] == 'awaiting_receipt' and not result['can_copy']
    assert result['review']['message']['zh'] is None
    for line in result['lines']:
        enrollment = session.get(Enrollment, line['enrollment_id'])
        assert enrollment.payment_status == 'Paid' and enrollment.payment_date == date(2026, 10, 17)
        assert all(s.financial_status == 'Paid' for s in session.query(SessionLog).filter_by(enrollment_id=enrollment.id))
    assert session.query(StudentCoupon).one().available_coupons == 2
    assert client.post(url, json=data).json()['version'] == 2
    assert session.query(BillingOperation).filter_by(kind='paid').count() == 1
    assert client.post(url, json=pay_payload(result, idempotency_key='paid-again')).status_code == 409


@pytest.mark.parametrize('change', [{'amount': 1}, {'payment_date': '2026-10-18'}, {'method': 'autopay'}])
def test_invalid_payment_cannot_partially_settle_enrollments(env, change):
    client, session, _ = env
    _, _, payment = confirmed(client)
    response = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment, **change))
    assert response.status_code == 422, response.text
    assert session.get(BillingPayment, payment['id']).status == 'Pending Payment'
    for line in payment['lines']:
        assert session.get(Enrollment, line['enrollment_id']).payment_status == 'Pending Payment'
        assert all(s.financial_status == 'Unpaid' for s in session.query(SessionLog).filter_by(enrollment_id=line['enrollment_id']))
    assert session.query(BillingOperation).filter_by(kind='paid').count() == 0


def test_kms_receipt_is_external_fact_and_releases_reservation_once(env):
    client, session, _ = env
    session.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    session.commit()
    _, _, payment = confirmed(client, payload=coupon_payload(client))
    url = f"/api/billing/payments/{payment['id']}/receipt"
    assert client.post(url, json={'expected_version': 1, 'idempotency_key': 'too-soon', 'receipt_reference': 'KMS-01'}).status_code == 422
    paid = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment)).json()
    data = {'expected_version': paid['version'], 'idempotency_key': 'receipt-1', 'receipt_reference': ' KMS-01 '}
    response = client.post(url, json=data)
    assert response.status_code == 200, response.text
    receipt = response.json()
    assert receipt['receipt_reference'] == 'KMS-01' and receipt['coupon_status'] == 'recorded_in_kms'
    assert client.post(url, json=data).json()['version'] == receipt['version']
    assert client.post(url, json=dict(data, expected_version=receipt['version'], idempotency_key='replace')).status_code == 409
    assert session.query(StudentCoupon).one().available_coupons == 1


def test_payment_reads_do_not_write_or_expose_another_students_records(env):
    client, session, user = env
    _, _, payment = confirmed(client)
    statements = []
    def select_only(_conn, _cursor, sql, *_args):
        statements.append(sql)
        assert sql.lstrip().upper().startswith('SELECT'), sql
    event.listen(session.bind, 'before_cursor_execute', select_only)
    try:
        assert client.get(f"/api/billing/payments/{payment['id']}").status_code == 200
        result = client.get('/api/billing/students/101/payments')
        assert result.status_code == 200 and len(result.json()) == 1
        assert client.get('/api/billing/students/101/preferences').status_code == 200
    finally:
        event.remove(session.bind, 'before_cursor_execute', select_only)
    assert statements
    user.role, user.id = 'Tutor', 999
    assert client.get(f"/api/billing/payments/{payment['id']}").status_code == 404
    assert client.get('/api/billing/students/101/payments').status_code == 404


@pytest.mark.parametrize('field,value', [('revenue_total', 1), ('payment_status', 'Paid'), ('lessons_paid', 1)])
def test_changed_linked_enrollment_blocks_copy_and_collection(env, field, value):
    client, session, _ = env
    _, _, payment = confirmed(client)
    enrollment = session.get(Enrollment, payment['lines'][0]['enrollment_id'])
    setattr(enrollment, field, value)
    session.commit()
    detail = client.get(f"/api/billing/payments/{payment['id']}").json()
    assert detail['review_issues'] and not detail['can_copy']
    response = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment))
    assert response.status_code == 409
    assert session.get(BillingPayment, payment['id']).status == 'Pending Payment'


def test_failure_after_session_creation_rolls_back_entire_confirmation(env, monkeypatch):
    client, session, _ = env
    preference(client)
    draft, data = confirmation(client)
    def fail(*_args, **_kwargs):
        raise ValueError('Synthetic reconciliation failure.')
    monkeypatch.setattr('services.unlisted_lessons.fill_unlisted_lessons', fail)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == 422
    assert session.query(BillingPayment).count() == 0
    assert session.query(BillingPaymentLine).count() == 0
    assert session.query(BillingLessonClaim).count() == 0
    assert session.query(Enrollment).count() == 1
    assert session.query(SessionLog).count() == 6
    assert not session.query(BillingAccount).one().active


@pytest.mark.parametrize('value', [200, 300])
def test_reserved_coupon_count_covers_all_values_until_kms_receipt(env, value):
    client, session, _ = env
    session.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    session.commit()
    _, _, first = confirmed(client, payload=coupon_payload(client))
    payload = coupon_payload(client, ids=tuple(line['enrollment_id'] for line in first['lines']), value=value)
    second, data = confirmation(client, payload=payload, key='confirm-2', draft_key='draft-2')
    url = f"/api/billing/drafts/{second['id']}/confirm"
    response = client.post(url, json=data)
    assert response.status_code == 409, response.text
    assert 'coupon' in response.json()['detail'].lower()
    assert session.query(BillingPayment).count() == 1


@pytest.mark.parametrize('mutation', ['session_paid', 'session_cancelled', 'session_date', 'extra_original', 'tutor'])
def test_changed_session_or_tutor_blocks_confirmed_message_and_payment(env, mutation):
    client, session, _ = env
    _, _, payment = confirmed(client)
    eid = payment['lines'][0]['enrollment_id']
    lesson = session.query(SessionLog).filter_by(enrollment_id=eid).first()
    if mutation == 'session_paid':
        lesson.financial_status = 'Paid'
    elif mutation == 'session_cancelled':
        lesson.session_status = 'Cancelled'
    elif mutation == 'session_date':
        lesson.session_date += timedelta(days=1)
    elif mutation == 'extra_original':
        session.add(SessionLog(enrollment_id=eid, student_id=101, tutor_id=1,
                               session_date=date(2027, 1, 8), time_slot=lesson.time_slot,
                               location='MSA', session_status='Scheduled', financial_status='Unpaid'))
    else:
        session.add(Tutor(id=2, user_email='other@example.test', tutor_name='Replacement', role='Tutor'))
        session.flush()
        session.get(Enrollment, eid).tutor_id = 2
    session.commit()
    detail = client.get(f"/api/billing/payments/{payment['id']}").json()
    assert detail['review_issues'] and not detail['can_copy']
    assert client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment)).status_code == 409
    assert session.get(BillingPayment, payment['id']).status == 'Pending Payment'


def test_discount_allocation_preserves_total_with_unequal_classes():
    assert workflow.allocate_discount(301, [3, 5]) == [113, 188]
    assert workflow.allocate_discount(301, [4, 4]) == [151, 150]
    assert workflow.allocate_discount(301, [0, 6]) == [0, 301]


def test_cancel_preserves_audit_releases_claims_and_allows_reviewed_replacement(env):
    client, session, _ = env
    session.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    session.commit()
    draft, _, payment = confirmed(client, payload=coupon_payload(client))
    saved_snapshot = session.get(BillingPayment, payment['id']).snapshot
    data = {'expected_version': 1, 'idempotency_key': 'cancel-1', 'reason': 'Parent changed the agreed dates.'}
    url = f"/api/billing/payments/{payment['id']}/cancel"
    response = client.post(url, json=data)
    assert response.status_code == 200, response.text
    cancelled = response.json()
    assert cancelled['status'] == 'Cancelled' and cancelled['version'] == 2
    assert cancelled['coupon_status'] == 'none' and not cancelled['can_copy']
    assert session.query(BillingLessonClaim).count() == 0
    assert session.get(BillingPayment, payment['id']).snapshot == saved_snapshot
    assert session.query(BillingDraftRevision).count() == 1
    assert all(session.get(Enrollment, line['enrollment_id']).payment_status == 'Cancelled' for line in payment['lines'])
    assert all(s.session_status == 'Cancelled' for s in session.query(SessionLog).filter(SessionLog.enrollment_id != 11))
    assert client.post(url, json=data).json()['version'] == 2
    assert client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(cancelled, idempotency_key='pay-cancelled')).status_code == 409
    replacement, confirm = confirmation(client, payload=coupon_payload(client), key='confirm-replacement', draft_key='draft-replacement')
    response = client.post(f"/api/billing/drafts/{replacement['id']}/confirm", json=confirm)
    assert response.status_code == 200, response.text
    assert response.json()['id'] != payment['id']
    assert response.json()['coupon_status'] == 'reserved'
    assert session.query(BillingPayment).count() == 2
    assert session.query(BillingLessonClaim).count() == payment['review']['period']['lesson_count']
    assert session.query(StudentCoupon).one().available_coupons == 1


@pytest.mark.parametrize('reason', ['paid', 'attendance', 'makeup'])
def test_cancel_refuses_payment_or_attendance_without_erasing_links(env, reason):
    client, session, _ = env
    _, _, payment = confirmed(client)
    eid = payment['lines'][0]['enrollment_id']
    if reason == 'paid':
        response = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment))
        assert response.status_code == 200
        payment = response.json()
    else:
        original = session.query(SessionLog).filter_by(enrollment_id=eid).first()
        original.session_status = 'Attended' if reason == 'attendance' else 'Rescheduled - Make-up Booked'
        if reason == 'makeup':
            session.add(SessionLog(enrollment_id=eid, student_id=101, tutor_id=1,
                                   session_date=original.session_date + timedelta(days=1), time_slot=original.time_slot,
                                   location='MSA', session_status='Make-up Class', financial_status='Unpaid',
                                   make_up_for_id=original.id))
        session.commit()
    response = client.post(f"/api/billing/payments/{payment['id']}/cancel", json={
        'expected_version': payment['version'], 'idempotency_key': 'unsafe-cancel', 'reason': 'Try cancelling.',
    })
    assert response.status_code == 409, response.text
    assert session.query(BillingLessonClaim).count() == payment['review']['period']['lesson_count']
    assert session.get(BillingPayment, payment['id']).status != 'Cancelled'


def test_explicit_past_lesson_review_preserves_unlisted_teaching(env, monkeypatch):
    from routers import billing, billing_drafts, billing_workflow
    client, session, user = env
    for router in (billing, billing_drafts, billing_workflow):
        monkeypatch.setattr(router, 'today', lambda: date(2026, 11, 14))
    session.add(TutorMemo(student_id=101, tutor_id=1, memo_date=date(2026, 11, 13),
                          time_slot='16:00 - 17:30', location='MSA', status='waiting',
                          notes='Synthetic taught lesson', exercises=[], created_by=user.user_email))
    session.commit()
    payload = review_request(client, confirmed_checks=['UNPAID_PAST_DATES', 'CONTINUATION_UNCONFIRMED'])
    _, _, payment = confirmed(client, payload=payload)
    memo = session.query(TutorMemo).one()
    assert memo.status == 'filled'
    lesson = session.get(SessionLog, memo.linked_session_id)
    assert lesson.session_status == 'Attended' and lesson.notes == 'Synthetic taught lesson'
    assert lesson.financial_status == 'Unpaid'
    assert lesson.enrollment_id == payment['lines'][0]['enrollment_id']
    assert payment['review_issues'] == []


def test_existing_overdue_view_includes_linked_fees_then_clears_after_payment(env, monkeypatch):
    from routers import enrollments
    client, _, _ = env
    client.app.include_router(enrollments.router, prefix='/api')
    _, _, payment = confirmed(client)
    monkeypatch.setattr(enrollments, 'hk_now', lambda: datetime(2026, 11, 14, 12))
    response = client.get('/api/enrollments/overdue')
    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 1 and rows[0]['days_overdue'] == 1
    assert rows[0]['billing_payment_id'] == payment['id']
    assert rows[0]['total_fee'] == payment['review']['period']['total_fee']
    assert client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment)).status_code == 200
    assert client.get('/api/enrollments/overdue').json() == []


def test_payment_audit_failure_rolls_back_every_linked_financial_change(env, monkeypatch):
    client, session, _ = env
    second_class(session)
    _, _, payment = confirmed(client, payload=next_review(client, [11, 12]))
    original = workflow.save_operation
    def fail_payment(*args, **kwargs):
        if args[4] == 'paid':
            raise ValueError('Synthetic audit persistence failure.')
        return original(*args, **kwargs)
    monkeypatch.setattr(workflow, 'save_operation', fail_payment)
    response = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment))
    assert response.status_code == 422, response.text
    assert session.get(BillingPayment, payment['id']).version == 1
    assert session.get(BillingPayment, payment['id']).paid_at is None
    for line in payment['lines']:
        enrollment = session.get(Enrollment, line['enrollment_id'])
        assert enrollment.payment_status == 'Pending Payment' and enrollment.payment_date is None
        assert all(s.financial_status == 'Unpaid' for s in session.query(SessionLog).filter_by(enrollment_id=enrollment.id))
    assert session.query(BillingOperation).filter_by(kind='paid').count() == 0


@pytest.mark.parametrize('time_slot,expected_status', [('15:00 - 16:00', 200), ('15:30 - 16:30', 409)])
def test_confirmation_detects_other_course_time_overlap_but_allows_adjacent_class(env, time_slot, expected_status):
    client, session, _ = env
    preference(client)
    draft, data = confirmation(client)
    session.add(Enrollment(id=12, student_id=101, tutor_id=1, assigned_day='Fri',
                           assigned_time=time_slot, location='MSA', lessons_paid=1,
                           first_lesson_date=date(2026, 11, 13), payment_status='Paid', enrollment_type='Trial'))
    session.flush()
    session.add(SessionLog(enrollment_id=12, student_id=101, tutor_id=1,
                           session_date=date(2026, 11, 13), time_slot=time_slot, location='MSA',
                           session_status='Trial Class', financial_status='Paid'))
    session.commit()
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == expected_status, response.text
    assert session.query(BillingPayment).count() == (1 if expected_status == 200 else 0)


@pytest.mark.parametrize('action,payload', [
    ('sent', {'language': 'en'}),
    ('paid', {'payment_date': '2026-10-17', 'amount': 2400, 'method': 'cash'}),
    ('receipt', {'receipt_reference': 'KMS-01'}),
    ('cancel', {'reason': 'Not an admin'}),
])
def test_tutor_cannot_mutate_confirmed_payments(env, action, payload):
    client, session, user = env
    _, _, payment = confirmed(client)
    user.role = 'Tutor'
    response = client.post(f"/api/billing/payments/{payment['id']}/{action}", json={
        **payload, 'idempotency_key': 'tutor-attempt', 'expected_version': 1,
    })
    assert response.status_code == 403
    assert session.get(BillingPayment, payment['id']).version == 1
