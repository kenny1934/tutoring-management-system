"""Independent collection-run checks with invented, isolated SQLite evidence."""
from copy import deepcopy
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingPayment, BillingPreference
from models import Enrollment, SessionLog, Student, StudentCoupon, Tutor
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env


NOW = date(2026, 11, 17)


@pytest.fixture(autouse=True)
def forbid_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Autopay verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def move_source(db, first):
    source = db.get(Enrollment, 11)
    source.first_lesson_date = first
    for index, row in enumerate(db.query(SessionLog).filter_by(enrollment_id=11).order_by(SessionLog.id)):
        row.session_date = first + timedelta(weeks=index)
    db.commit()


def add_source(db, *, student_id=102, source_id=21, tutor_id=2, location='MSB',
               first=date(2026, 10, 16), count=6, school_id='2'):
    student = db.get(Student, student_id)
    if student is None:
        student = Student(id=student_id, student_name=f'Synthetic student {student_id}', home_location=location)
        db.add(student)
    student.school_student_id = school_id
    if db.get(Tutor, tutor_id) is None:
        db.add(Tutor(id=tutor_id, user_email=f'autopay-{tutor_id}@example.test',
            tutor_name=f'Synthetic tutor {tutor_id}', role='Tutor', default_location=location))
    db.flush()
    db.add(Enrollment(id=source_id, student_id=student_id, tutor_id=tutor_id,
        assigned_day=first.strftime('%a'), assigned_time='10:00 - 11:30', location=location,
        lessons_paid=count, first_lesson_date=first, payment_status='Paid',
        payment_date=first - timedelta(days=1), revenue_total=count * 400))
    db.flush()
    for index in range(count):
        db.add(SessionLog(id=source_id * 10 + index, enrollment_id=source_id, student_id=student_id,
            tutor_id=tutor_id, session_date=first + timedelta(weeks=index),
            time_slot='10:00 - 11:30', location=location, session_status='Scheduled', financial_status='Paid'))
    db.commit()


@pytest.fixture
def records(workflow_env, monkeypatch):
    from routers import billing, billing_autopay, billing_drafts, billing_workflow
    client, db, user = workflow_env
    for routes in (billing, billing_autopay, billing_drafts, billing_workflow):
        monkeypatch.setattr(routes, 'today', lambda: NOW)
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_ENABLED', 'false')
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_STORAGE_ENABLED', 'false')
    client.app.include_router(billing_autopay.router, prefix='/api')
    move_source(db, date(2026, 10, 16))
    db.get(Student, 101).school_student_id = '10'
    db.commit()
    return client, db, user


def payment(client, *, student_id=101, source_id=11, sent=True, key='independent-run', draft_only=False, coupon=None):
    previous = client.get(f'/api/billing/students/{student_id}/preferences')
    assert previous.status_code == 200, previous.text
    preference = client.put(f'/api/billing/students/{student_id}/preferences', json={
        'payment_method': 'autopay', 'mandate_ready': True, 'expected_version': previous.json()['version'],
        'idempotency_key': f'{key}-preference',
    })
    assert preference.status_code == 200, preference.text
    context = client.get(f'/api/billing/students/{student_id}/context',
        params={'selected_enrollment_ids': source_id})
    assert context.status_code == 200, context.text
    context = context.json()
    payload = {'scenario': context['suggested_request'], 'basis': 'paid_only',
        'selected_enrollment_ids': [source_id], 'expected_source_fingerprint': context['source_fingerprint'],
        'period_number': 1, 'confirmed_checks': ['CONTINUING_SLOTS_REVIEW', 'CONTINUATION_UNCONFIRMED', 'UNPAID_PAST_DATES']}
    if coupon:
        payload['scenario']['coupon'] = coupon
    reviewed = client.post(f'/api/billing/students/{student_id}/draft-review', json=payload)
    assert reviewed.status_code == 200, reviewed.text
    reviewed = reviewed.json()
    assert not reviewed['message']['blocked_reasons'], reviewed['message']['blocked_reasons']
    saved = client.post(f'/api/billing/students/{student_id}/drafts', json={
        'review': payload, 'expected_review_hash': reviewed['review_hash'], 'idempotency_key': f'{key}-draft',
    })
    assert saved.status_code == 200, saved.text
    draft = saved.json()
    if draft_only:
        return draft
    confirmed = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json={
        'expected_revision': draft['revision'], 'expected_review_hash': draft['review']['review_hash'],
        'expected_preference_version': preference.json()['version'], 'idempotency_key': f'{key}-confirm',
    })
    assert confirmed.status_code == 200, confirmed.text
    result = confirmed.json()
    if sent:
        response = client.post(f"/api/billing/payments/{result['id']}/sent", json={
            'expected_version': result['version'], 'language': 'zh', 'idempotency_key': f'{key}-sent',
        })
        assert response.status_code == 200, response.text
        result = response.json()
    return result


def run(client, month='2026-11', **params):
    response = client.get('/api/billing/autopay', params={'collection_month': month, **params})
    assert response.status_code == 200, response.text
    return response.json()


def payment_row(result, payment_id):
    matches = [row for row in result['rows'] if row['payment_id'] == payment_id]
    assert len(matches) == 1, result
    return matches[0]


def record_paid(client, value, key='independent-paid'):
    response = client.post(f"/api/billing/payments/{value['id']}/paid", json={
        'expected_version': value['version'], 'idempotency_key': key,
        'payment_date': NOW.isoformat(), 'amount': value['review']['period']['total_fee'],
        'method': 'autopay' if value['review']['period']['collection']['method'] == 'autopay' else 'cash',
    })
    assert response.status_code == 200, response.text
    return response.json()


def test_ready_uses_exact_confirmed_pending_amount_and_get_is_query_only(records):
    client, db, _ = records
    value = payment(client)
    statements = []
    def only_reads(_connection, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement
    event.listen(db.bind, 'before_cursor_execute', only_reads)
    try:
        result = run(client)
    finally:
        event.remove(db.bind, 'before_cursor_execute', only_reads)
    row = payment_row(result, value['id'])
    assert row['stage'] == 'ready' and row['origin'] == 'payment'
    assert row['amount_basis'] == 'confirmed'
    assert row['total_fee'] == result['ready_total'] == value['review']['period']['total_fee']
    assert row['enrollment_ids'] == [line['enrollment_id'] for line in value['lines']]
    assert row['payment_version'] == value['version'] and result['counts']['ready'] == 1
    assert result['collection_month'] == '2026-11'
    assert result['debit_from'] == '2026-11-20' and result['debit_to'] == '2026-11-22'
    assert statements


@pytest.mark.parametrize('change', ['unsent', 'mandate', 'manual_preference', 'missing_preference', 'past_run'])
def test_missing_operational_conditions_never_contribute_to_ready_total(records, monkeypatch, change):
    client, db, _ = records
    value = payment(client, sent=change != 'unsent')
    preference = db.query(BillingPreference).one()
    if change == 'mandate':
        preference.mandate_ready = False
    elif change == 'manual_preference':
        preference.payment_method = 'manual'
    elif change == 'missing_preference':
        db.delete(preference)
    elif change == 'past_run':
        from routers import billing_autopay
        monkeypatch.setattr(billing_autopay, 'today', lambda: date(2026, 11, 23))
    db.commit()
    result = run(client)
    row = payment_row(result, value['id'])
    assert row['stage'] == 'attention' and row['reasons']
    assert result['ready_total'] == result['counts']['ready'] == 0


def test_collection_month_is_not_the_month_of_the_lessons(records):
    client, _, _ = records
    value = payment(client)
    assert any(lesson['date'].startswith('2026-12') for lesson in value['review']['period']['lessons'])
    december = run(client, '2026-12')
    assert not any(row['stage'] == 'ready' and row['payment_id'] == value['id'] for row in december['rows'])
    assert december['ready_total'] == 0


@pytest.mark.parametrize('sent_at,expected', [(datetime(2026, 11, 18, 15, 59), 'ready'),
                                            (datetime(2026, 11, 18, 16, 0), 'attention')])
def test_notice_deadline_uses_hong_kong_date_for_utc_evidence(records, sent_at, expected):
    client, db, _ = records
    value = payment(client)
    db.get(BillingPayment, value['id']).sent_at = sent_at
    db.commit()
    result = run(client)
    assert payment_row(result, value['id'])['stage'] == expected
    assert bool(result['ready_total']) is (expected == 'ready')


@pytest.mark.parametrize('start,end,expected', [(21, 21, 'ready'), (25, 27, 'attention')])
def test_frozen_debit_dates_are_preserved_and_must_fit_the_run(records, start, end, expected):
    client, db, _ = records
    value = payment(client)
    stored = db.get(BillingPayment, value['id'])
    snapshot = deepcopy(stored.snapshot)
    snapshot['review']['period']['collection'].update(
        debit_from=f'2026-11-{start:02}', debit_to=f'2026-11-{end:02}')
    stored.snapshot = snapshot
    db.commit()
    row = payment_row(run(client), value['id'])
    assert row['stage'] == expected
    assert row['collection']['debit_from'] == f'2026-11-{start:02}'
    assert row['collection']['debit_to'] == f'2026-11-{end:02}'


@pytest.mark.parametrize('status', ['Paid', 'Cancelled'])
def test_paid_or_cancelled_payment_never_becomes_ready(records, status):
    client, db, _ = records
    value = payment(client)
    if status == 'Paid':
        record_paid(client, value)
    else:
        response = client.post(f"/api/billing/payments/{value['id']}/cancel", json={
            'expected_version': value['version'], 'idempotency_key': 'independent-cancel',
            'reason': 'Synthetic cancellation.',
        })
        assert response.status_code == 200, response.text
    result = run(client)
    assert result['ready_total'] == result['counts']['ready'] == 0
    assert not any(row['payment_id'] == value['id'] and row['stage'] == 'ready' for row in result['rows'])


@pytest.mark.parametrize('corruption', ['missing_review', 'missing_total', 'zero_total', 'counts', 'missing_slot', 'foreign_student', 'changed_original'])
def test_broken_confirmed_evidence_is_attention_without_crashing_or_leaking(records, corruption):
    client, db, _ = records
    value = payment(client)
    stored = db.get(BillingPayment, value['id'])
    snapshot = deepcopy(stored.snapshot)
    if corruption == 'missing_review':
        snapshot.pop('review')
    elif corruption == 'missing_total':
        snapshot['review']['period']['total_fee'] = None
    elif corruption == 'zero_total':
        snapshot['review']['period']['total_fee'] = 0
    elif corruption == 'counts':
        snapshot['review']['period']['counts_by_slot'] = [0]
    elif corruption == 'missing_slot':
        snapshot['review']['scenario']['slots'] = []
    elif corruption == 'foreign_student':
        snapshot['review']['student'].update(id=102, student_name='Foreign private name')
    else:
        line = value['lines'][0]
        original = db.query(SessionLog).filter_by(enrollment_id=line['enrollment_id']).first()
        original.session_date += timedelta(days=1)
    stored.snapshot = snapshot
    db.commit()
    response = client.get('/api/billing/autopay', params={'collection_month': '2026-11'})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['ready_total'] == result['counts']['ready'] == 0
    assert 'Foreign private name' not in response.text
    row = payment_row(result, value['id'])
    assert row['student']['id'] == 101 and row['stage'] == 'attention' and row['reasons']


def test_autopay_preference_does_not_convert_a_first_manual_payment(records):
    client, db, _ = records
    move_source(db, date(2026, 10, 2))
    value = payment(client)
    assert value['review']['scenario']['payment_method'] == 'autopay'
    assert value['review']['period']['collection']['method'] == 'manual'
    result = run(client)
    assert result['ready_total'] == result['counts']['ready'] == 0


@pytest.mark.parametrize('draft', [False, True])
def test_projection_and_saved_draft_are_preparation_not_approved_debits(records, draft):
    client, db, _ = records
    if draft:
        payment(client, draft_only=True)
    else:
        response = client.put('/api/billing/students/101/preferences', json={
            'payment_method': 'autopay', 'mandate_ready': True, 'expected_version': 0,
            'idempotency_key': 'independent-projection-method'})
        assert response.status_code == 200, response.text
    result = run(client)
    assert result['ready_total'] == result['counts']['ready'] == 0
    row = next(row for row in result['rows'] if row['student']['id'] == 101)
    assert row['stage'] == 'prepare' and row['origin'] == ('draft' if draft else 'projection')
    assert row['amount_basis'] == 'estimate'
    assert db.query(BillingPayment).count() == 0


@pytest.mark.parametrize('status,effective', [('Paused', NOW), ('Left', NOW), ('Paused', date(2026, 12, 1))])
def test_stopped_participation_during_covered_lessons_holds_collection(records, monkeypatch, status, effective):
    from makeup_schemas import ParticipationChange, ParticipationConfirm
    from services import makeup_entitlement as participation
    client, db, actor = records
    value = payment(client)
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_ENABLED', 'true')
    change = ParticipationChange(status=status, effective_on=effective, reason='Synthetic reviewed stop.')
    reviewed = participation.preview_participation(db, 101, change, as_of=NOW)
    assert reviewed.can_confirm
    participation.confirm_participation(db, 101, ParticipationConfirm(**change.model_dump(),
        expected_version=reviewed.version, expected_review_hash=reviewed.review_hash,
        idempotency_key='independent-run-participation'), actor, as_of=NOW)
    db.commit()
    result = run(client)
    assert payment_row(result, value['id'])['stage'] == 'attention'
    assert result['ready_total'] == 0
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'
    assert all(db.get(Enrollment, line['enrollment_id']).payment_status == 'Pending Payment'
               for line in value['lines'])


def test_participation_dates_are_loaded_in_one_bounded_batch(records, monkeypatch):
    from makeup_schemas import ParticipationChange, ParticipationConfirm
    from services import makeup_entitlement as participation
    client, db, actor = records
    payment(client)
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_ENABLED', 'true')
    change = ParticipationChange(status='Paused', effective_on=date(2026, 12, 1), reason='Synthetic batch check.')
    reviewed = participation.preview_participation(db, 101, change, as_of=NOW)
    participation.confirm_participation(db, 101, ParticipationConfirm(**change.model_dump(),
        expected_version=0, expected_review_hash=reviewed.review_hash,
        idempotency_key='independent-batched-participation'), actor, as_of=NOW)
    db.commit()
    participation.invalidate_makeup_entitlements(db)
    statements = []
    def count_reads(_connection, _cursor, statement, *_args):
        assert statement.lstrip().upper().startswith('SELECT')
        statements.append(statement)
    targets = {(101, NOW + timedelta(days=index)) for index in range(90)}
    event.listen(db.bind, 'before_cursor_execute', count_reads)
    try:
        result = participation.participation_states_for_targets(db, targets)
    finally:
        event.remove(db.bind, 'before_cursor_execute', count_reads)
    assert len(result) == 90 and len(statements) <= 3
    assert result[(101, NOW)] == 'Active'
    assert result[(101, date(2026, 12, 1))] == 'Paused'


@pytest.mark.parametrize('paid', [False, True])
def test_situation_two_prepaid_skip_requires_actual_payment(records, paid):
    client, db, _ = records
    move_source(db, date(2026, 11, 6))
    value = payment(client)
    assert value['review']['period']['kind'] == 'situation_two'
    assert value['review']['period']['coverage_through'] == '2027-01-31'
    if paid:
        record_paid(client, value)
    result = run(client, '2026-12')
    assert result['ready_total'] == result['counts']['ready'] == 0
    assert any(row['student']['id'] == 101 and row['stage'] == ('skipped' if paid else 'attention')
               for row in result['rows']), result


def test_paid_situation_two_original_run_also_honours_earlier_legacy_paid_lessons(records):
    client, db, _ = records
    move_source(db, date(2026, 11, 6))
    value = record_paid(client, payment(client))
    row = payment_row(run(client), value['id'])
    assert row['stage'] == 'skipped'
    assert row['payment_status'] == 'Paid'


@pytest.mark.parametrize('paid', [False, True])
def test_first_manual_payment_with_future_due_month_is_still_a_bank_run_skip(records, paid):
    from tests.test_billing_intake_verification import intake_request, saved_intake, confirmation_data
    client, _, _ = records
    preference = client.put('/api/billing/students/102/preferences', json={
        'payment_method': 'autopay', 'mandate_ready': True, 'expected_version': 0,
        'idempotency_key': 'independent-first-manual-method'})
    assert preference.status_code == 200, preference.text
    payload = intake_request(client, trial=False)
    payload['scenario'].update(first_lesson_date='2026-12-04', payment_method='autopay', mandate_ready=True)
    _, draft = saved_intake(client, payload)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirmation_data(draft))
    assert response.status_code == 200, response.text
    value = response.json()
    assert value['review']['period']['collection']['method'] == 'manual'
    assert value['review']['period']['collection']['due_before_lesson'] == '2026-12-04'
    if paid:
        value = record_paid(client, value)
    result = run(client)
    row = payment_row(result, value['id'])
    assert row['stage'] == 'skipped' and row['collection']['method'] == 'manual'
    assert result['ready_total'] == 0


def test_one_prepaid_slot_cannot_hide_another_uncovered_weekly_class(records):
    client, db, _ = records
    move_source(db, date(2026, 11, 6))
    value = record_paid(client, payment(client))
    add_source(db, student_id=101, source_id=31, location='MSA', first=date(2026, 11, 7), count=8, school_id='10')
    result = run(client, '2026-12')
    assert result['ready_total'] == 0
    assert any(row['student']['id'] == 101 and row['stage'] in {'attention', 'prepare'}
               for row in result['rows']), result
    assert not all(row['stage'] == 'skipped' for row in result['rows'] if row['student']['id'] == 101)


@pytest.mark.parametrize('paid', [False, True])
def test_coupon_combined_period_skips_only_after_actual_payment(records, paid):
    client, db, _ = records
    move_source(db, date(2026, 11, 13))
    db.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=500))
    db.commit()
    value = payment(client, coupon={'kind': 'staff', 'value': 500, 'verified': True,
        'available_count': 1, 'expires_on': '2027-06-30', 'combine_next_month': True})
    assert value['review']['period']['coverage_through'] == '2027-02-28'
    assert value['review']['period']['collection']['debit_from'] == '2026-12-20'
    assert value['review']['period']['deductions'] == [{'kind': 'staff', 'amount': 500}]
    if paid:
        value = record_paid(client, value)
        assert value['coupon_status'] == 'awaiting_receipt'
    result = run(client, '2027-01')
    assert result['ready_total'] == 0
    assert any(row['student']['id'] == 101 and row['stage'] == ('skipped' if paid else 'attention')
               for row in result['rows']), result


def test_two_due_payments_for_one_student_require_review_instead_of_summing(records):
    client, db, _ = records
    first = payment(client)
    add_source(db, student_id=101, source_id=31, location='MSA', first=date(2026, 10, 17), school_id='10')
    second = payment(client, source_id=31, key='independent-second-class')
    result = run(client)
    assert payment_row(result, first['id'])['stage'] == 'attention'
    assert payment_row(result, second['id'])['stage'] == 'attention'
    assert result['ready_total'] == result['counts']['ready'] == 0


def test_earlier_unpaid_debt_blocks_a_new_run_even_without_target_lesson_overlap(records):
    client, db, _ = records
    earlier = payment(client)
    assert earlier['review']['period']['coverage_through'] == '2026-12-31'
    add_source(db, student_id=101, source_id=31, location='MSA', first=date(2026, 11, 21), school_id='10')
    later = payment(client, source_id=31, key='independent-later-run')
    assert later['review']['period']['collection']['debit_from'] == '2026-12-20'
    result = run(client, '2026-12')
    row = payment_row(result, later['id'])
    assert row['stage'] == 'attention'
    assert any(reason['code'] == 'OUTSTANDING_PAYMENT' for reason in row['reasons'])
    assert result['ready_total'] == 0


def test_numeric_student_order_and_scoped_counts_survive_pagination(records):
    client, db, _ = records
    first = payment(client)
    add_source(db)
    second = payment(client, student_id=102, source_id=21, key='independent-other-student')
    result = run(client, stage='ready', limit=1)
    assert result['total'] == result['counts']['ready'] == 2
    assert result['rows'][0]['student']['id'] == 102
    assert result['ready_total'] == first['review']['period']['total_fee'] + second['review']['period']['total_fee']
    page_two = run(client, stage='ready', limit=1, offset=1)
    assert page_two['rows'][0]['student']['id'] == 101
    assert page_two['ready_total'] == result['ready_total']
    branch = run(client, location='MSB')
    assert branch['counts']['ready'] == branch['total'] == 1
    assert branch['ready_total'] == second['review']['period']['total_fee']
    search = run(client, search='10')
    assert search['total'] == 1 and search['rows'][0]['student']['id'] == 101
    assert search['ready_total'] == first['review']['period']['total_fee']


def test_stage_filter_does_not_change_the_scoped_ready_summary(records):
    client, db, _ = records
    first = payment(client, sent=False)
    add_source(db)
    second = payment(client, student_id=102, source_id=21, key='independent-ready-other')
    result = run(client, stage='attention')
    assert result['total'] == 1 and result['rows'][0]['payment_id'] == first['id']
    assert result['counts']['attention'] == result['counts']['ready'] == 1
    assert result['ready_total'] == second['review']['period']['total_fee']


@pytest.mark.parametrize('paid', [False, True])
def test_final_june_payment_includes_july_tail_without_a_second_debit(records, paid):
    client, db, _ = records
    move_source(db, date(2027, 4, 23))
    value = payment(client)
    assert value['review']['period']['collection']['debit_from'] == '2027-05-20'
    assert value['review']['period']['coverage_through'] == '2027-07-04'
    assert any(row['date'] == '2027-07-02' for row in value['review']['period']['lessons'])
    if paid:
        record_paid(client, value)
    result = run(client, '2027-06')
    assert result['ready_total'] == result['counts']['ready'] == 0
    assert any(row['student']['id'] == 101 and row['stage'] == ('skipped' if paid else 'attention')
               for row in result['rows']), result


def test_187_only_operation_does_not_query_missing_financial_or_participation_tables(records, monkeypatch):
    client, db, _ = records
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    forbidden = ('billing_payments', 'billing_payment_lines', 'billing_lesson_claims',
                 'billing_preferences', 'billing_operations', 'makeup_participation')
    def reject_new_tables(_connection, _cursor, statement, *_args):
        assert not any(table in statement.lower() for table in forbidden), statement
    event.listen(db.bind, 'before_cursor_execute', reject_new_tables)
    try:
        result = run(client)
        assert not result['confirmed_storage_available']
        assert result['ready_total'] == result['counts']['ready'] == 0
    finally:
        event.remove(db.bind, 'before_cursor_execute', reject_new_tables)


def test_tutor_scope_and_location_filter_cannot_expose_another_student(records):
    client, _, user = records
    value = payment(client)
    user.role, user.id = 'Tutor', 2
    result = run(client)
    assert result['rows'] == [] and result['ready_total'] == 0
    assert client.get('/api/billing/autopay', params={'collection_month': '2026-11', 'tutor_id': 1}).status_code == 403
    user.id = 1
    assert payment_row(run(client), value['id'])['stage'] == 'ready'
    assert run(client, location='MSB')['rows'] == []


@pytest.mark.parametrize('role', ['Supervisor', 'Guest'])
def test_read_roles_are_enforced_without_mutating_payments(records, role):
    client, db, user = records
    value = payment(client)
    user.role = role
    response = client.get('/api/billing/autopay', params={'collection_month': '2026-11'})
    assert response.status_code == (200 if role == 'Supervisor' else 403), response.text
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'
