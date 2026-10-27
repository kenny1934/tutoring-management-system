"""Synthetic, read-only renewal queue checks across recorded coverage and debt."""
from datetime import date, timedelta

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingPayment
from models import Enrollment, Holiday, SessionLog, Student, Tutor
from tests.test_billing_drafts import env as draft_env, saved
from tests.test_billing_workflow import confirmed, second_class


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Queue tests may only use synthetic SQLite records.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def env(draft_env, monkeypatch):
    from routers import billing_queue, billing_workflow
    monkeypatch.setenv('BILLING_RENEWAL_QUEUE_ENABLED', 'true')
    monkeypatch.delenv('BILLING_WORKFLOW_ENABLED', raising=False)
    monkeypatch.delenv('BILLING_WORKFLOW_STORAGE_ENABLED', raising=False)
    monkeypatch.setattr(billing_queue, 'today', lambda: date(2026, 10, 17))
    monkeypatch.setattr(billing_workflow, 'today', lambda: date(2026, 10, 17))
    client, session, user = draft_env
    client.app.include_router(billing_queue.router, prefix='/api')
    client.app.include_router(billing_workflow.router, prefix='/api')
    yield client, session, user


@pytest.fixture
def workflow_env(env, monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'true')
    yield env


def on_day(monkeypatch, value):
    from routers import billing_queue
    monkeypatch.setattr(billing_queue, 'today', lambda: value)


def queue(client, month='2026-11', **params):
    response = client.get('/api/billing/queue', params={'collection_month': month, **params})
    assert response.status_code == 200, response.text
    return response.json()


def only_row(client, month='2026-11', **params):
    result = queue(client, month, **params)
    assert len(result['rows']) == 1, result
    return result['rows'][0]


def choose_method(client, student_id=101, method='manual', ready=False):
    response = client.put(f'/api/billing/students/{student_id}/preferences', json={
        'payment_method': method, 'mandate_ready': ready, 'expected_version': 0,
        'idempotency_key': f'preference-{student_id}',
    })
    assert response.status_code == 200, response.text


def coverage(session, end, *, enrollment_id=11, start=date(2026, 9, 4)):
    """Replace one synthetic source with contiguous paid original lessons."""
    enrollment = session.get(Enrollment, enrollment_id)
    session.query(SessionLog).filter_by(enrollment_id=enrollment_id).delete(synchronize_session=False)
    holidays = {h.holiday_date for h in session.query(Holiday)}
    days = []
    current = start
    while current <= end:
        if current not in holidays:
            days.append(current)
        current += timedelta(days=7)
    enrollment.first_lesson_date = start
    enrollment.lessons_paid = len(days)
    enrollment.revenue_total = len(days) * 400
    for day in days:
        session.add(SessionLog(enrollment_id=enrollment_id, student_id=enrollment.student_id,
                               tutor_id=enrollment.tutor_id, session_date=day,
                               session_status='Scheduled', financial_status='Paid',
                               time_slot=enrollment.assigned_time, location=enrollment.location))
    session.commit()


def student_source(session, student_id, *, tutor_id=1, location='MSA', school_id=None):
    student = session.get(Student, student_id)
    if student is None:
        student = Student(id=student_id, student_name=f'Synthetic {student_id}', home_location=location)
        session.add(student)
    student.school_student_id = school_id
    identity = student_id * 10
    session.add(Enrollment(id=identity, student_id=student_id, tutor_id=tutor_id,
                           assigned_day='Fri', assigned_time='16:00 - 17:30', location=location,
                           lessons_paid=6, first_lesson_date=date(2026, 10, 2),
                           payment_status='Paid', payment_date=date(2026, 10, 1), revenue_total=2400))
    session.commit()
    coverage(session, date(2026, 11, 6), enrollment_id=identity, start=date(2026, 10, 2))
    return identity


def legacy_pending(session, *, student_id=101, source_id=11, sent=False,
                   start=date(2026, 11, 13), deadline=None):
    source = session.get(Enrollment, source_id)
    row = Enrollment(student_id=student_id, tutor_id=source.tutor_id, assigned_day=source.assigned_day,
                     assigned_time=source.assigned_time, location=source.location, lessons_paid=6,
                     first_lesson_date=start, payment_deadline=deadline or start,
                     payment_status='Pending Payment', fee_message_sent=sent,
                     renewed_from_enrollment_id=source_id, revenue_total=2300)
    session.add(row)
    session.flush()
    for i in range(6):
        session.add(SessionLog(enrollment_id=row.id, student_id=student_id, tutor_id=row.tutor_id,
                               session_date=start + timedelta(weeks=i), time_slot=row.assigned_time,
                               location=row.location, session_status='Scheduled', financial_status='Unpaid'))
    session.commit()
    return row.id


def test_queue_gate_and_preview_option(env, monkeypatch):
    client, _, _ = env
    assert client.get('/api/billing/options').json()['queue_available']
    monkeypatch.delenv('BILLING_DRAFT_STORAGE_ENABLED')
    assert not client.get('/api/billing/options').json()['queue_available']
    assert client.get('/api/billing/queue').status_code == 503
    assert client.get('/api/billing/queue/counts').status_code == 503


def test_migration187_only_queue_is_read_only_and_never_queries188(env):
    client, session, _ = env
    forbidden = {'billing_preferences', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims', 'billing_operations'}
    statements = []
    def guard(_conn, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement
        assert not any(name in statement.lower() for name in forbidden), statement
    event.listen(session.bind, 'before_cursor_execute', guard)
    try:
        row = only_row(client)
        counts = client.get('/api/billing/queue/counts?collection_month=2026-11')
        assert counts.status_code == 200, counts.text
    finally:
        event.remove(session.bind, 'before_cursor_execute', guard)
    assert statements
    assert row['origin'] == 'projection' and row['stage'] == 'prepare'
    assert row['payment_method'] is None and not row['overdue']
    assert row['total_fee'] is row['lesson_count'] is row['coverage_through'] is row['due_date'] is None
    assert row['student']['id'] == 101


def test_saved_draft_works_without_workflow_tables(env):
    client, session, _ = env
    _, draft = saved(client)
    row = only_row(client)
    assert row['draft_id'] == draft['id'] and row['origin'] == 'draft'
    assert row['stage'] == 'prepare'
    assert row['amount_basis'] == 'reviewed' and row['total_fee'] == draft['review']['period']['total_fee']
    assert row['payment_id'] is None and session.query(Enrollment).count() == 1


@pytest.mark.parametrize('month', ['2026-10', '2026-11', '2026-12'])
def test_missing_preference_is_a_preparation_step_with_no_assumed_fee(env, month):
    client, _, _ = env
    result = queue(client, month, stage='prepare')
    assert len(result['rows']) == 1
    row = result['rows'][0]
    assert row['stage'] == 'prepare' and row['ready_now']
    assert any(i['code'] == 'PAYMENT_PREFERENCE_REQUIRED' for i in row['issues'])
    assert row['payment_method'] is row['total_fee'] is row['lesson_count'] is None
    assert row['coverage_through'] is row['collection'] is row['due_date'] is None
    assert result['counts']['prepare'] == result['counts']['actionable'] == 1
    assert result['counts']['attention'] == result['counts']['send'] == 0


def test_real_source_problem_stays_in_attention_with_missing_preference(env):
    client, session, _ = env
    session.delete(session.get(SessionLog, 112))
    session.commit()
    row = only_row(client, stage='attention')
    assert row['stage'] == 'attention'
    assert any(i['code'] == 'ORIGINAL_COUNT_REVIEW' for i in row['issues'])
    assert queue(client, stage='prepare')['rows'] == []


def test_saved_draft_with_changed_calendar_stays_in_attention(env):
    client, session, _ = env
    _, draft = saved(client)
    session.add(Holiday(holiday_date=date(2026, 12, 12), holiday_name='Changed calendar'))
    session.commit()
    row = only_row(client, stage='attention')
    assert row['draft_id'] == draft['id']
    assert any(i['code'] == 'STALE_DRAFT' for i in row['issues'])
    assert queue(client, stage='prepare')['rows'] == []


def test_prepaid_month_does_not_raise_missing_preference_task_early(env, monkeypatch):
    client, session, _ = env
    coverage(session, date(2027, 1, 29))
    on_day(monkeypatch, date(2026, 12, 12))
    result = queue(client, '2026-12')
    assert result['rows'] == [] and result['counts']['actionable'] == 0
    row = only_row(client, '2026-12', stage='no_payment')
    assert row['payment_method'] is None


@pytest.mark.parametrize('has_draft', [False, True])
def test_gap_before_future_paid_coverage_remains_actionable_now(workflow_env, monkeypatch, has_draft):
    client, session, _ = workflow_env
    choose_method(client)
    coverage(session, date(2027, 1, 29))
    if has_draft:
        saved(client)
    session.query(SessionLog).filter_by(enrollment_id=11, session_date=date(2026, 12, 4)).delete()
    session.commit()
    on_day(monkeypatch, date(2026, 12, 12))
    row = only_row(client, '2026-12')
    assert row['stage'] == 'attention' and row['ready_now'] and not row['overdue']
    assert any(i['code'] == 'PAID_COVERAGE_GAP' for i in row['issues'])
    if not has_draft:
        assert row['total_fee'] is None and row['first_lesson_date'] is None


@pytest.mark.parametrize('method,paid_through,month,next_first,next_end', [
    ('autopay', date(2027, 1, 29), '2027-01', '2027-02-05', '2027-02-28'),
    ('manual', date(2027, 2, 26), '2027-02', '2027-03-05', '2027-04-30'),
    ('manual', date(2027, 3, 26), '2027-03', '2027-04-02', '2027-05-31'),
])
def test_prepaid_coverage_suppresses_earlier_collection_and_manual_months_roll(
        workflow_env, monkeypatch, method, paid_through, month, next_first, next_end):
    client, session, _ = workflow_env
    choose_method(client, method=method, ready=True)
    coverage(session, paid_through)
    on_day(monkeypatch, date.fromisoformat(month+'-12'))
    previous = '2026-12' if month == '2027-01' else f"2027-{int(month[-2:])-1:02d}"
    assert queue(client, previous)['rows'] == []
    skipped = only_row(client, previous, stage='no_payment')
    assert skipped['stage'] == 'no_payment' and not skipped['overdue']
    row = only_row(client, month)
    assert row['stage'] == 'prepare' and row['origin'] == 'projection'
    assert row['first_lesson_date'] == next_first and row['coverage_through'] == next_end
    assert row['prepare_on'] == month+'-12' and row['ready_now']
    assert row['amount_basis'] == 'tuition_only' and not row['overdue']


@pytest.mark.parametrize('day,ready', [(11, False), (12, True), (18, True), (19, True), (28, True)])
def test_notice_window_opens_on12_and_unsent_task_survives_after18(workflow_env, monkeypatch, day, ready):
    client, session, _ = workflow_env
    choose_method(client, method='autopay', ready=True)
    coverage(session, date(2027, 1, 29))
    on_day(monkeypatch, date(2027, 1, day))
    row = only_row(client, '2027-01')
    assert row['stage'] == 'prepare' and row['ready_now'] is ready
    assert not row['overdue'] and row['prepare_on'] == '2027-01-12'
    assert row['due_date'] == '2027-01-22'


@pytest.mark.parametrize('as_of', [date(2026, 10, 17), date(2026, 10, 18)])
def test_no_notice_adjusted_manual_is_preparable_without_arbitrary_expiry_window(workflow_env, monkeypatch, as_of):
    client, _, _ = workflow_env
    on_day(monkeypatch, as_of)
    choose_method(client)
    row = only_row(client, '2026-10')
    assert row['stage'] == 'prepare' and row['ready_now']
    assert row['first_lesson_date'] == row['due_date'] == '2026-11-13'
    assert row['collection']['notice_from'] is None
    assert row['prepare_on'] is None
    earlier = only_row(client, '2026-09', stage='no_payment')
    assert earlier['stage'] == 'no_payment' and not earlier['ready_now']
    assert earlier['prepare_on'] is None


def test_existing_no_notice_enrollment_is_visible_before_its_lesson_month(env):
    client, session, _ = env
    pending = legacy_pending(session)
    row = only_row(client, '2026-10')
    assert row['stage'] == 'send' and row['enrollment_ids'] == [pending]
    assert row['prepare_on'] is None and row['due_date'] == '2026-11-13'


def test_unready_bank_setup_does_not_block_first_manual_collection(workflow_env):
    client, _, _ = workflow_env
    choose_method(client, method='autopay', ready=False)
    row = only_row(client)
    assert row['payment_method'] == 'manual' and row['stage'] == 'prepare'


def test_actual_autopay_without_bank_setup_requires_attention(workflow_env):
    client, session, _ = workflow_env
    coverage(session, date(2026, 11, 27))
    choose_method(client, method='autopay', ready=False)
    row = only_row(client)
    assert row['payment_method'] == 'autopay' and row['stage'] == 'attention'
    assert any(i['code'] == 'MANDATE_NOT_READY' for i in row['issues'])


def test_twice_weekly_manual_is_one_monthly_student_row(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    second_class(session)
    choose_method(client)
    coverage(session, date(2027, 1, 29))
    coverage(session, date(2027, 1, 30), enrollment_id=12, start=date(2026, 9, 5))
    on_day(monkeypatch, date(2027, 1, 12))
    row = only_row(client, '2027-01')
    assert row['first_lesson_date'] == '2027-02-05' and row['coverage_through'] == '2027-02-28'
    assert row['lesson_count'] == 8 and row['payment_method'] == 'manual'
    assert set(row['enrollment_ids']) == {11, 12}
    assert row['stage'] == 'attention'  # Two continuing classes still need confirmation.
    assert queue(client, '2027-01')['counts']['total'] == 1


@pytest.mark.parametrize('sent,stage', [(False, 'send'), (True, 'awaiting_payment')])
def test_legacy_unpaid_task_keeps_existing_identity_and_unknown_fee(env, monkeypatch, sent, stage):
    client, session, _ = env
    pending = legacy_pending(session, sent=sent)
    on_day(monkeypatch, date(2026, 11, 12))
    row = only_row(client)
    assert row['stage'] == stage and row['origin'] == 'legacy'
    assert row['enrollment_ids'] == [pending]
    assert row['amount_basis'] == 'unknown' and row['total_fee'] is None
    assert row['payment_id'] is None and not row['overdue']


def test_multiple_unpaid_legacy_records_are_one_attention_row_with_all_ids(env, monkeypatch):
    client, session, _ = env
    first = legacy_pending(session)
    second = legacy_pending(session, source_id=first, sent=True, start=date(2026, 12, 25))
    on_day(monkeypatch, date(2026, 12, 1))
    row = only_row(client, '2026-12')
    assert row['stage'] == 'attention' and set(row['enrollment_ids']) == {first, second}
    assert queue(client, '2026-12')['counts']['total'] == 1


@pytest.mark.parametrize('day,overdue', [(12, False), (13, True), (14, True)])
def test_manual_debt_is_overdue_on_first_lesson_day(env, monkeypatch, day, overdue):
    client, session, _ = env
    legacy_pending(session, sent=True)
    on_day(monkeypatch, date(2026, 11, day))
    row = only_row(client)
    assert row['overdue'] is overdue
    assert row['stage'] == ('attention' if overdue else 'awaiting_payment')
    counts = queue(client)['counts']
    assert counts['overdue'] == int(overdue) and counts['actionable'] == 0


def test_combined_pending_payment_is_one_send_task_without_legacy_duplicates(workflow_env):
    client, session, _ = workflow_env
    second_class(session)
    from tests.test_billing_workflow import coupon_payload
    _, _, payment = confirmed(client, payload=coupon_payload(client, ids=(11, 12)))
    row = only_row(client)
    assert row['stage'] == 'send' and row['origin'] == 'payment'
    assert row['payment_id'] == payment['id'] and row['payment_ids'] == [payment['id']]
    assert set(row['enrollment_ids']) == {line['enrollment_id'] for line in payment['lines']}
    assert row['lesson_count'] == payment['review']['period']['lesson_count']
    assert row['total_fee'] == payment['review']['period']['total_fee'] and row['amount_basis'] == 'reviewed'
    assert queue(client)['counts']['send'] == 1


def test_discarded_draft_is_not_a_queue_task_or_a_substitute_for_actual_payment(workflow_env):
    client, _, _ = workflow_env
    choose_method(client)
    _, draft = saved(client)
    first = only_row(client)
    assert first['origin'] == 'draft' and first['stage'] == 'prepare'
    response = client.post(f"/api/billing/drafts/{draft['id']}/discard", json={
        'expected_revision': 1, 'idempotency_key': 'discard-queue',
    })
    assert response.status_code == 200, response.text
    row = only_row(client)
    assert row['origin'] == 'projection' and row['draft_id'] is None


def test_pending_payment_sent_state_and_paid_coverage_replace_draft_task(workflow_env):
    client, _, _ = workflow_env
    _, _, payment = confirmed(client)
    assert only_row(client)['origin'] == 'payment'
    response = client.post(f"/api/billing/payments/{payment['id']}/sent", json={
        'expected_version': payment['version'], 'idempotency_key': 'queue-sent', 'language': 'en',
    })
    assert response.status_code == 200, response.text
    row = only_row(client)
    assert row['stage'] == 'awaiting_payment' and row['payment_id'] == payment['id']
    response = client.post(f"/api/billing/payments/{payment['id']}/paid", json={
        'expected_version': response.json()['version'], 'idempotency_key': 'queue-paid',
        'payment_date': '2026-10-17', 'amount': payment['review']['period']['total_fee'], 'method': 'cash',
    })
    assert response.status_code == 200, response.text
    assert queue(client)['rows'] == []
    assert only_row(client, stage='no_payment')['payment_id'] is None


def test_cancelled_payment_releases_coverage_without_resurrecting_its_draft(workflow_env):
    client, _, _ = workflow_env
    _, _, payment = confirmed(client)
    response = client.post(f"/api/billing/payments/{payment['id']}/cancel", json={
        'expected_version': payment['version'], 'idempotency_key': 'queue-cancel', 'reason': 'Synthetic correction',
    })
    assert response.status_code == 200, response.text
    row = only_row(client)
    assert row['origin'] == 'projection' and row['stage'] == 'prepare'
    assert row['draft_id'] is row['payment_id'] is None
    assert row['first_lesson_date'] == payment['review']['period']['first_lesson_date']


def test_workflow_storage_only_queue_is_select_only_and_keeps_confirmed_work(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    _, _, payment = confirmed(client)
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    monkeypatch.delenv('BILLING_DRAFT_STORAGE_ENABLED')
    def only_select(_conn, _cursor, statement, *_args):
        assert statement.lstrip().upper().startswith('SELECT'), statement
    event.listen(session.bind, 'before_cursor_execute', only_select)
    try:
        assert client.get('/api/billing/options').json()['queue_available']
        row = only_row(client)
        assert row['payment_id'] == payment['id'] and row['stage'] == 'send'
        assert client.get('/api/billing/queue/counts').status_code == 200
    finally:
        event.remove(session.bind, 'before_cursor_execute', only_select)


@pytest.mark.parametrize('day,overdue', [(20, False), (22, False), (23, True)])
def test_autopay_debt_overdue_starts_after_debit_window(workflow_env, monkeypatch, day, overdue):
    client, session, _ = workflow_env
    coverage(session, date(2026, 11, 27))
    _, _, payment = confirmed(client, method='autopay', ready=True)
    stored = session.get(BillingPayment, payment['id'])
    assert stored.snapshot['review']['period']['collection']['debit_to'] == '2026-11-22'
    on_day(monkeypatch, date(2026, 11, day))
    row = only_row(client)
    assert row['overdue'] is overdue
    assert row['stage'] == ('attention' if overdue else 'send')


@pytest.mark.parametrize('as_of', [date(2026, 12, 1), date(2027, 3, 1)])
def test_missing_past_sessions_require_review_but_are_not_recorded_overdue_debt(workflow_env, monkeypatch, as_of):
    client, _, _ = workflow_env
    choose_method(client)
    on_day(monkeypatch, as_of)
    month = as_of.strftime('%Y-%m')
    row = only_row(client, month)
    assert row['stage'] == 'attention' and not row['overdue']
    assert queue(client, month)['counts']['overdue'] == 0


def test_fully_covered_teaching_year_has_no_renewal(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    choose_method(client)
    coverage(session, date(2027, 7, 2))
    on_day(monkeypatch, date(2027, 7, 3))
    assert queue(client, '2027-07')['rows'] == []
    assert only_row(client, '2027-07', stage='no_payment')['stage'] == 'no_payment'


@pytest.mark.parametrize('paid_through,month', [(date(2027, 1, 29), '2026-12'), (date(2027, 7, 2), '2027-07')])
def test_obsolete_unconfirmed_draft_does_not_reopen_already_paid_coverage(workflow_env, monkeypatch, paid_through, month):
    client, session, _ = workflow_env
    choose_method(client)
    _, draft = saved(client)
    coverage(session, paid_through)
    on_day(monkeypatch, date.fromisoformat(month+'-12'))
    assert queue(client, month)['rows'] == []
    row = only_row(client, month, stage='no_payment')
    assert row['draft_id'] is None and row['origin'] == 'projection'


def test_queue_counts_are_scope_based_and_not_changed_by_search_stage_or_pagination(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    choose_method(client)
    coverage(session, date(2026, 11, 27))
    source102 = student_source(session, 102, school_id='2')
    source103 = student_source(session, 103, school_id='10')
    source104 = student_source(session, 104, school_id='1')
    legacy_pending(session, student_id=102, source_id=source102)
    legacy_pending(session, student_id=103, source_id=source103, sent=True)
    choose_method(client, 104)
    coverage(session, date(2027, 1, 29), enrollment_id=source104)
    on_day(monkeypatch, date(2026, 11, 12))
    all_rows = queue(client)
    assert [row['student']['id'] for row in all_rows['rows']] == [102, 103, 101]
    assert all_rows['counts'] == {'prepare': 1, 'send': 1, 'awaiting_payment': 1, 'attention': 0,
                                  'no_payment': 1, 'total': 4, 'actionable': 2, 'overdue': 0}
    for params in [{'search': 'Another'}, {'stage': 'send'}, {'limit': 1, 'offset': 1}]:
        filtered = queue(client, **params)
        assert filtered['counts'] == all_rows['counts']
    counts = client.get('/api/billing/queue/counts?collection_month=2026-11').json()
    assert {key: counts[key] for key in all_rows['counts']} == all_rows['counts']
    assert counts['as_of'] == '2026-11-12' and counts['collection_month'] == '2026-11'


def test_branch_uses_teaching_location_and_roles_cannot_expand_scope(env):
    client, session, user = env
    session.add(Tutor(id=2, tutor_name='Second Tutor', user_email='second@example.test', role='Tutor'))
    session.get(Student, 101).home_location = 'MSB'
    session.commit()
    student_source(session, 102, tutor_id=2, location='MSB')
    assert [r['student']['id'] for r in queue(client, location='MSA')['rows']] == [101]
    assert [r['student']['id'] for r in queue(client, location='MSB')['rows']] == [102]
    user.role = 'Tutor'
    assert [r['student']['id'] for r in queue(client)['rows']] == [101]
    assert client.get('/api/billing/queue?tutor_id=2').status_code == 403
    assert client.get('/api/billing/queue/counts?tutor_id=2').status_code == 403
    user.role = 'Super Admin'
    response = client.get('/api/billing/queue', params={'tutor_id': 2}, headers={'X-Effective-Role': 'Tutor'})
    assert response.status_code == 200 and [r['student']['id'] for r in response.json()['rows']] == [102]
    user.role = 'Guest'
    assert client.get('/api/billing/queue').status_code == 403


def test_student_batch_does_not_add_a_query_for_each_row(env):
    client, session, _ = env
    def query_count():
        statements = []
        def count(_conn, _cursor, statement, *_args):
            if statement.lstrip().upper().startswith('SELECT'):
                statements.append(statement)
        event.listen(session.bind, 'before_cursor_execute', count)
        try:
            queue(client)
        finally:
            event.remove(session.bind, 'before_cursor_execute', count)
        return len(statements)
    one = query_count()
    for student_id in range(102, 112):
        student_source(session, student_id)
    many = query_count()
    assert many <= one + 2, (one, many)


def test_invalid_lesson_owner_stays_scoped_and_does_not_hide_other_students(env):
    client, session, _ = env
    student_source(session, 102)
    session.get(SessionLog, 110).student_id = 102
    session.commit()
    rows = {r['student']['id']: r for r in queue(client)['rows']}
    assert set(rows) == {101, 102}
    assert rows[101]['stage'] == 'attention'
    assert any(i['code'] == 'SOURCE_OWNERSHIP_REVIEW' for i in rows[101]['issues'])
    assert rows[101]['lesson_count'] is None and rows[101]['total_fee'] is None
    assert not any(i['code'] == 'SOURCE_OWNERSHIP_REVIEW' for i in rows[102]['issues'])
    assert rows[102]['enrollment_ids'] == [1020]


@pytest.mark.parametrize('grouped', [False, True])
def test_invalid_owner_on_unpaid_record_requires_review_before_sending(workflow_env, grouped):
    client, session, _ = workflow_env
    student_source(session, 102)
    if grouped:
        _, _, payment = confirmed(client)
        pending_id = payment['lines'][0]['enrollment_id']
    else:
        pending_id = legacy_pending(session)
    lesson = session.query(SessionLog).filter_by(enrollment_id=pending_id).first()
    lesson.student_id = 102
    session.commit()
    rows = {r['student']['id']: r for r in queue(client)['rows']}
    assert rows[101]['stage'] == 'attention'
    assert any(i['code'] == 'SOURCE_OWNERSHIP_REVIEW' for i in rows[101]['issues'])


@pytest.mark.parametrize('kind', ['Cancelled', 'One-Time', 'Summer', 'outside_year'])
def test_irrelevant_sources_do_not_create_renewal_rows(env, kind):
    client, session, _ = env
    enrollment = session.get(Enrollment, 11)
    if kind == 'Cancelled':
        enrollment.payment_status = 'Cancelled'
    elif kind == 'outside_year':
        enrollment.first_lesson_date = date(2025, 1, 1)
        for lesson in session.query(SessionLog):
            lesson.session_date -= timedelta(days=730)
    else:
        enrollment.enrollment_type = kind
    session.commit()
    assert queue(client)['rows'] == []


@pytest.mark.parametrize('kind', ['Summer', 'Trial', 'Regular'])
@pytest.mark.parametrize('current_regular', [False, True])
def test_outstanding_old_or_other_course_payment_is_retained_once(env, monkeypatch, kind, current_regular):
    client, session, _ = env
    if current_regular:
        identity = legacy_pending(session)
        enrollment = session.get(Enrollment, identity)
    else:
        enrollment = session.get(Enrollment, 11)
        identity = enrollment.id
    enrollment.enrollment_type = kind
    enrollment.payment_status = 'Pending Payment'
    enrollment.fee_message_sent = True
    if kind == 'Regular':
        enrollment.first_lesson_date = date(2025, 10, 3)
        enrollment.payment_deadline = date(2025, 10, 3)
        for i, lesson in enumerate(session.query(SessionLog).filter_by(enrollment_id=identity).order_by(SessionLog.id)):
            lesson.session_date = date(2025, 10, 3) + timedelta(weeks=i)
            lesson.financial_status = 'Unpaid'
    session.commit()
    on_day(monkeypatch, date(2026, 12, 1))
    result = queue(client, '2026-12')
    assert len(result['rows']) == 1 and result['counts']['total'] == 1
    row = result['rows'][0]
    assert row['origin'] == 'legacy' and row['enrollment_ids'] == [identity]
    assert row['overdue'] and row['stage'] == 'attention'
    assert row['total_fee'] is None and result['counts']['overdue'] == 1


def test_multiple_legacy_only_records_link_to_an_existing_enrollment(env):
    client, session, _ = env
    first = session.get(Enrollment, 11)
    first.enrollment_type = 'Summer'
    first.payment_status = 'Pending Payment'
    second_id = legacy_pending(session)
    session.get(Enrollment, second_id).enrollment_type = 'Summer'
    session.commit()
    row = only_row(client)
    assert row['enrollment_ids'] == [11, second_id] and row['payment_ids'] == []
    assert row['action_url'] == '/enrollments/11'


@pytest.mark.parametrize('value', ['2026-00', '2026-13', '2026-1', '2026-11-01', 'not-a-month'])
def test_collection_month_validation(env, value):
    client, _, _ = env
    assert client.get('/api/billing/queue', params={'collection_month': value}).status_code == 422
    assert client.get('/api/billing/queue/counts', params={'collection_month': value}).status_code == 422


def test_gap_evidence_matches_queue_context_and_blocked_draft_review(env):
    client, session, _ = env
    moved = session.get(SessionLog, 112)
    moved.session_date = date(2026, 10, 17)
    session.commit()
    row = only_row(client)
    assert row['stage'] == 'attention' and row['ready_now'] and not row['overdue']
    assert row['total_fee'] is None and row['first_lesson_date'] is None
    gap_issue = next(issue for issue in row['issues'] if issue['code'] == 'PAID_COVERAGE_GAP')
    detail, = gap_issue['gap_evidence']
    assert detail['date'] == '2026-10-16' and detail['kind'] == 'timetable_difference'
    assert detail['enrollment_id'] == 11 and detail['selected']
    assert detail['nearby_lessons'][0]['session_id'] == 112
    assert detail['nearby_lessons'][0]['date'] == '2026-10-17'
    source = client.get('/api/billing/students/101/context',
                        params={'selected_enrollment_ids': 11}).json()
    source_issue = next(issue for issue in source['issues'] if issue['code'] == 'PAID_COVERAGE_GAP')
    assert source_issue == gap_issue
    request = {'scenario': source['suggested_request'], 'basis': 'paid_only',
               'selected_enrollment_ids': [11], 'expected_source_fingerprint': source['source_fingerprint'],
               'period_number': 1, 'confirmed_checks': []}
    response = client.post('/api/billing/students/101/draft-review', json=request)
    assert response.status_code == 200, response.text
    review = response.json()
    assert next(issue for issue in review['issues'] if issue['code'] == 'PAID_COVERAGE_GAP') == gap_issue
    assert review['message']['zh'] is None and review['message']['en'] is None
    assert gap_issue['message'] in review['message']['blocked_reasons']
    request['confirmed_checks'] = ['PAID_COVERAGE_GAP']
    assert client.post('/api/billing/students/101/draft-review', json=request).status_code == 422
    counts = client.get('/api/billing/queue/counts').json()
    assert counts['attention'] == counts['actionable'] == 1 and counts['overdue'] == 0


def test_queue_cancelled_original_is_visible_without_becoming_paid_coverage(env):
    client, session, _ = env
    session.get(SessionLog, 112).session_status = 'Cancelled'
    session.add(SessionLog(enrollment_id=11, student_id=101, tutor_id=1,
                           session_date=date(2026, 11, 13), time_slot='16:00 - 17:30', location='MSA',
                           session_status='Scheduled', financial_status='Paid'))
    session.commit()
    row = only_row(client)
    assert row['stage'] == 'attention' and row['total_fee'] is None
    assert not any(issue['code'] == 'ORIGINAL_COUNT_REVIEW' for issue in row['issues'])
    gap_issue = next(issue for issue in row['issues'] if issue['code'] == 'PAID_COVERAGE_GAP')
    detail, = gap_issue['gap_evidence']
    assert detail['kind'] == 'recorded_cancelled' and detail['date'] == '2026-10-16'
    assert detail['matching_lessons'][0]['session_id'] == 112
    assert detail['matching_lessons'][0]['status'] == 'Cancelled'
    source = client.get('/api/billing/students/101/context').json()
    assert not any(lesson['id'] == 112 for block in source['source_blocks'] for lesson in block['originals'])
    assert source['slot_candidates'][0]['last_paid_original_date'] == '2026-11-13'


def test_queue_gap_identifies_existing_unpaid_enrollment_and_keeps_its_task(env):
    client, session, _ = env
    pending_id = legacy_pending(session)
    later_id = legacy_pending(session, start=date(2027, 1, 1))
    session.get(Enrollment, later_id).payment_status = 'Paid'
    for lesson in session.query(SessionLog).filter_by(enrollment_id=later_id):
        lesson.financial_status = 'Paid'
    session.commit()
    row = only_row(client)
    assert row['origin'] == 'legacy' and row['stage'] == 'attention'
    assert row['enrollment_ids'] == [pending_id]
    assert row['total_fee'] is None and row['payment_id'] is None
    gap_issue = next(issue for issue in row['issues'] if issue['code'] == 'PAID_COVERAGE_GAP')
    details = gap_issue['gap_evidence']
    assert len(details) == 6
    assert all(detail['kind'] == 'recorded_unpaid' for detail in details)
    assert {lesson['enrollment_id'] for detail in details for lesson in detail['matching_lessons']} == {pending_id}
    assert all(detail['matching_lessons'][0]['payment_status'] == 'Pending Payment' for detail in details)
    assert row['action_url'] == f'/enrollments/{pending_id}'


def test_queue_explains_gap_on_unselected_historical_timetable(env):
    client, session, _ = env
    old = Enrollment(id=12, student_id=101, tutor_id=1, assigned_day='Sat',
                     assigned_time='16:00 - 17:30', location='MSA', lessons_paid=5,
                     first_lesson_date=date(2026, 9, 5), payment_status='Paid', revenue_total=2000)
    session.add(old)
    session.flush()
    for i in (0, 1, 3, 4, 5):
        session.add(SessionLog(enrollment_id=12, student_id=101, tutor_id=1,
                               session_date=date(2026, 9, 5) + timedelta(weeks=i),
                               time_slot=old.assigned_time, location=old.location,
                               session_status='Attended', financial_status='Paid'))
    session.commit()
    row = only_row(client)
    assert row['stage'] == 'attention' and row['enrollment_ids'] == [11]
    gap_issue = next(issue for issue in row['issues'] if issue['code'] == 'PAID_COVERAGE_GAP')
    detail, = gap_issue['gap_evidence']
    assert detail['date'] == '2026-09-19' and detail['weekday'] == 'Sat'
    assert detail['enrollment_id'] == 12 and not detail['selected']
    assert detail['before']['enrollment_id'] == detail['after']['enrollment_id'] == 12
