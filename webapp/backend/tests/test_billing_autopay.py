"""Autopay run reads use synthetic SQLite only and cannot submit a bank debit."""
from copy import deepcopy
from datetime import date, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.autopay import build_autopay_run
from billing.models import (BillingAccount, BillingDraft, BillingDraftRevision, BillingLessonClaim,
                            BillingOperation, BillingPayment, BillingPaymentLine, BillingPreference)
from billing.schemas import BillingDraftReview
from billing.workflow import payment_integrity, payment_rows
from models import Enrollment, SessionLog, Student
from tests.test_billing_drafts import env as draft_env, review_request
from tests.test_billing_workflow import env as workflow_env, confirmation, confirmed, preference


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Autopay checks only permit synthetic SQLite.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def env(workflow_env, monkeypatch):
    from routers import billing_autopay
    monkeypatch.setattr(billing_autopay, 'today', lambda: date(2026, 11, 17))
    client, session, user = workflow_env
    client.app.include_router(billing_autopay.router, prefix='/api')
    yield client, session, user


def autopay_payment(client, session, *, sent=True, source_first=date(2026, 10, 2), source_count=9):
    source = session.get(Enrollment, 11)
    source.lessons_paid, source.first_lesson_date = source_count, source_first
    for i, lesson in enumerate(session.query(SessionLog).filter_by(enrollment_id=11).order_by(SessionLog.id)):
        lesson.session_date = source_first + timedelta(weeks=i)
    for i in range(6, source_count):
        session.add(SessionLog(id=110 + i, enrollment_id=11, student_id=101, tutor_id=1,
            session_date=source_first + timedelta(weeks=i), session_status='Scheduled',
            financial_status='Paid', time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    preference(client, method='autopay', ready=True)
    payload = review_request(client)
    payload['scenario'].update(payment_method='autopay', mandate_ready=True)
    draft, data = confirmation(client, payload=payload)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == 200, response.text
    payment = session.get(BillingPayment, response.json()['id'])
    if sent:
        payment.sent_at = datetime(2026, 11, 16, 4)
        payment.sent_language = 'en'
        for line in session.query(BillingPaymentLine).filter_by(payment_id=payment.id):
            session.get(Enrollment, line.enrollment_id).fee_message_sent = True
        session.commit()
    assert payment.snapshot['review']['period']['collection']['debit_from'] == '2026-11-20'
    return payment


def run(client, month='2026-11', **params):
    response = client.get('/api/billing/autopay', params={'collection_month': month, **params})
    assert response.status_code == 200, response.text
    return response.json()


def codes(row):
    return {r['code'] for r in row['reasons']}


def test_ready_is_exact_frozen_confirmed_amount_and_query_only(env):
    client, session, _ = env
    payment = autopay_payment(client, session)
    statements = []
    def select_only(_conn, _cursor, statement, *_args):
        assert statement.lstrip().upper().startswith('SELECT'), statement
        statements.append(statement)
    event.listen(session.bind, 'before_cursor_execute', select_only)
    try:
        result = run(client)
    finally:
        event.remove(session.bind, 'before_cursor_execute', select_only)
    row, = result['rows']
    assert row['stage'] == 'ready' and row['payment_id'] == payment.id
    assert row['payment_version'] == payment.version
    assert row['amount_basis'] == 'confirmed'
    assert result['ready_total'] == row['total_fee'] == payment.snapshot['review']['period']['total_fee']
    assert result['counts'] == {'ready': 1, 'attention': 0, 'prepare': 0, 'skipped': 0}
    assert result['debit_from'] == '2026-11-20' and result['notice_to'] == '2026-11-18'
    assert statements and not session.dirty and not session.new


@pytest.mark.parametrize('mutation,expected', [
    ('unsent', 'MESSAGE_NOT_SENT'), ('mandate', 'MANDATE_NOT_READY'),
    ('method', 'PREFERENCE_CHANGED'), ('inactive', 'ACCOUNT_INACTIVE'),
    ('late_message', 'MESSAGE_SENT_LATE'), ('changed_enrollment', 'PAYMENT_INTEGRITY'),
    ('wrong_dates', 'COLLECTION_DATES_REVIEW'),
])
def test_readiness_checks_are_independent(env, mutation, expected):
    client, session, _ = env
    payment = autopay_payment(client, session)
    pref = session.query(BillingPreference).one()
    if mutation == 'unsent': payment.sent_at = None
    if mutation == 'mandate': pref.mandate_ready = False
    if mutation == 'method': pref.payment_method = 'manual'
    if mutation == 'inactive': session.query(BillingAccount).one().active = False
    if mutation == 'late_message': payment.sent_at = datetime(2026, 11, 18, 18)  # 19 Nov in HK
    if mutation == 'changed_enrollment':
        session.get(Enrollment, session.query(BillingPaymentLine).one().enrollment_id).revenue_total = 1
    if mutation == 'wrong_dates':
        snapshot = deepcopy(payment.snapshot)
        snapshot['review']['period']['collection'].update(debit_from='2026-11-25', debit_to='2026-11-27')
        payment.snapshot = snapshot
    session.commit()
    result = run(client)
    assert result['ready_total'] == 0
    assert expected in codes(result['rows'][0])
    assert result['rows'][0]['stage'] == 'attention'


def test_historical_pending_cannot_be_debited_again(env, monkeypatch):
    client, session, _ = env
    autopay_payment(client, session)
    monkeypatch.setattr('routers.billing_autopay.today', lambda: date(2026, 11, 23))
    row, = run(client)['rows']
    assert row['stage'] == 'attention' and 'DEBIT_WINDOW_PASSED' in codes(row)


@pytest.mark.parametrize('corruption', ['missing', 'zero', 'empty_counts', 'foreign_student'])
def test_bad_snapshot_fails_closed_without_foreign_identity(env, corruption):
    client, session, _ = env
    payment = autopay_payment(client, session)
    snapshot = deepcopy(payment.snapshot)
    if corruption == 'missing': snapshot['review']['period'].pop('total_fee')
    if corruption == 'zero': snapshot['review']['period']['total_fee'] = 0
    if corruption == 'empty_counts': snapshot['review']['period']['counts_by_slot'] = []
    if corruption == 'foreign_student':
        snapshot['review']['student'].update(id=102, student_name='Foreign secret')
    payment.snapshot = snapshot
    session.commit()
    row, = run(client)['rows']
    assert row['stage'] == 'attention' and row['total_fee'] is None
    assert 'PAYMENT_INTEGRITY' in codes(row)
    assert row['student']['id'] == 101 and 'Foreign secret' not in str(row)


def test_first_manual_under_autopay_never_becomes_ready(env):
    client, session, _ = env
    payload = review_request(client)
    payload['scenario']['payment_method'] = 'autopay'
    _, _, payment = confirmed(client, payload=payload, method='autopay')
    result = run(client)
    row, = result['rows']
    assert payment['review']['period']['collection']['method'] == 'manual'
    assert row['stage'] == 'skipped' and 'MANUAL_COLLECTION' in codes(row)
    assert result['ready_total'] == 0


def test_preference_projection_is_never_approved_money(env):
    client, _, _ = env
    preference(client, method='autopay', ready=True)
    result = run(client)
    row, = result['rows']
    assert row['stage'] in {'prepare', 'attention'} and row['payment_id'] is None
    assert row['amount_basis'] == 'estimate' and result['ready_total'] == 0


def test_187_only_does_not_read_188_tables_and_preserves_saved_autopay_draft(env, monkeypatch):
    monkeypatch.setenv('BILLING_RENEWAL_QUEUE_ENABLED', 'true')
    client, session, _ = env
    payload = review_request(client)
    payload['scenario']['payment_method'] = 'autopay'
    from tests.test_billing_drafts import saved
    saved(client, payload=payload)
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.delenv('BILLING_WORKFLOW_STORAGE_ENABLED', raising=False)
    forbidden = ('billing_preferences', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims', 'billing_operations')
    def old_schema_only(_conn, _cursor, sql, *_args):
        assert not any(name in sql.lower() for name in forbidden), sql
    event.listen(session.bind, 'before_cursor_execute', old_schema_only)
    try:
        result = run(client)
    finally:
        event.remove(session.bind, 'before_cursor_execute', old_schema_only)
    assert not result['confirmed_storage_available'] and result['preparation_available']
    assert result['ready_total'] == 0 and result['rows'][0]['stage'] in {'prepare', 'attention'}
    assert result['rows'][0]['origin'] == 'draft'


def test_scope_and_filters_are_applied_to_summary(env):
    client, session, user = env
    autopay_payment(client, session)
    assert run(client, stage='attention')['counts']['ready'] == 1
    assert run(client, stage='attention')['total'] == 0
    assert run(client, search='unknown')['ready_total'] == 0
    assert run(client, location='MSB')['rows'] == []
    user.role, user.id = 'Tutor', 999
    assert run(client)['rows'] == []
    user.id = 1
    assert len(run(client)['rows']) == 1
    assert client.get('/api/billing/autopay', params={'tutor_id': 999}).status_code == 403
    user.role = 'Guest'
    assert client.get('/api/billing/autopay').status_code == 403


@pytest.mark.parametrize('params', [{'collection_month': '2026-10'}, {'collection_month': '2027-07'},
                                    {'collection_month': '2026-13'}, {'location': 'Various'}])
def test_run_validation(env, params):
    assert env[0].get('/api/billing/autopay', params=params).status_code == 422


def test_preloaded_integrity_matches_existing_path(env):
    from billing.autopay import _payment_evidence
    client, session, _ = env
    payment = autopay_payment(client, session)
    review = BillingDraftReview.model_validate(payment.snapshot['review'])
    lines, claims, sessions = _payment_evidence(session, [payment.id])
    assert payment_integrity(session, payment, review, payment_rows(session, payment)) == payment_integrity(
        session, payment, review, lines[payment.id], preloaded_claims=claims[payment.id],
        preloaded_sessions=sessions[payment.id]) == []


def settle(session, payment):
    payment.status, payment.payment_date = 'Paid', date(2026, 11, 20)
    for line in session.query(BillingPaymentLine).filter_by(payment_id=payment.id):
        enrollment = session.get(Enrollment, line.enrollment_id)
        enrollment.payment_status, enrollment.payment_date = 'Paid', payment.payment_date
        for lesson in session.query(SessionLog).filter_by(enrollment_id=enrollment.id):
            lesson.financial_status = 'Paid'
    session.commit()


def test_situation_two_paid_skips_later_run_but_pending_needs_attention(env):
    client, session, _ = env
    payment = autopay_payment(client, session, source_first=date(2026, 11, 6), source_count=6)
    assert payment.snapshot['review']['period']['coverage_through'] == '2027-01-31'
    earlier, = run(client, '2026-12')['rows']
    assert earlier['stage'] == 'attention' and 'EARLIER_PAYMENT_UNPAID' in codes(earlier)
    settle(session, payment)
    later, = run(client, '2026-12')['rows']
    assert later['stage'] == 'skipped' and 'PREPAID' in codes(later)
    assert later['payment_id'] == payment.id and later['total_fee'] > 0
    assert run(client, '2026-12')['ready_total'] == 0


def test_paid_single_slot_cannot_hide_uncovered_second_slot(env):
    client, session, _ = env
    payment = autopay_payment(client, session, source_first=date(2026, 11, 6), source_count=6)
    settle(session, payment)
    second = Enrollment(student_id=101, tutor_id=1, assigned_day='Sat',
        assigned_time='10:00 - 11:30', location='MSA', lessons_paid=6,
        first_lesson_date=date(2026, 12, 5), payment_status='Paid', payment_date=date(2026, 11, 20),
        revenue_total=2400, is_new_student=False)
    session.add(second)
    session.flush()
    for i in range(6):
        session.add(SessionLog(enrollment_id=second.id, student_id=101, tutor_id=1,
            session_date=date(2026, 12, 5) + timedelta(weeks=i), session_status='Scheduled',
            financial_status='Paid', time_slot=second.assigned_time, location='MSA'))
    session.commit()
    row, = run(client, '2026-12')['rows']
    assert row['stage'] == 'attention' and 'COVERAGE_REVIEW' in codes(row)


def clone_payment_for_student(session, original, sid):
    """Create several equivalent financial records for a bounded-read check."""
    session.add(Student(id=sid, student_name=f'Synthetic {sid}', school_student_id=str(sid - 190), home_location='MSA'))
    account = BillingAccount(student_id=sid, academic_start=date(2026, 9, 1),
        policy_version='regular-calendar-preview-v1', active=True)
    session.add(account)
    session.flush()
    session.add(BillingPreference(account_id=account.id, payment_method='autopay', mandate_ready=True, version=1))
    draft = BillingDraft(id=str(uuid4()), account_id=account.id, current_revision=1, created_by=1)
    session.add(draft)
    session.flush()
    snapshot = deepcopy(original.snapshot)
    snapshot['review']['student'].update(id=sid, student_name=f'Synthetic {sid}', school_student_id=str(sid - 190))
    payment = BillingPayment(id=str(uuid4()), account_id=account.id, draft_id=draft.id, draft_revision=1,
        version=1, status='Pending Payment', snapshot={}, created_by=1,
        sent_at=datetime(2026, 11, 16, 4), sent_language='en')
    session.add(payment)
    session.flush()
    evidence = {}
    for line, enrollment, _ in payment_rows(session, original):
        new_enrollment = Enrollment(student_id=sid, tutor_id=enrollment.tutor_id,
            assigned_day=enrollment.assigned_day, assigned_time=enrollment.assigned_time,
            location=enrollment.location, lessons_paid=enrollment.lessons_paid,
            first_lesson_date=enrollment.first_lesson_date, payment_status='Pending Payment',
            revenue_total=enrollment.revenue_total, is_new_student=False)
        session.add(new_enrollment)
        session.flush()
        evidence[str(new_enrollment.id)] = {'tutor_id': new_enrollment.tutor_id,
            'renewed_from_enrollment_id': None, 'is_new_student': False}
        session.add(BillingPaymentLine(payment_id=payment.id, enrollment_id=new_enrollment.id,
            slot_index=line.slot_index, lesson_count=line.lesson_count, gross_tuition=line.gross_tuition,
            discount_amount=line.discount_amount, tuition_amount=line.tuition_amount, materials_fee=line.materials_fee))
        for claim, lesson in session.query(BillingLessonClaim, SessionLog).join(
                SessionLog, SessionLog.id == BillingLessonClaim.session_id).filter(
                BillingLessonClaim.payment_id == original.id, BillingLessonClaim.enrollment_id == enrollment.id):
            new_lesson = SessionLog(enrollment_id=new_enrollment.id, student_id=sid, tutor_id=lesson.tutor_id,
                session_date=lesson.session_date, time_slot=lesson.time_slot, location=lesson.location,
                session_status='Scheduled', financial_status='Unpaid')
            session.add(new_lesson)
            session.flush()
            session.add(BillingLessonClaim(student_id=sid, payment_id=payment.id,
                enrollment_id=new_enrollment.id, session_id=new_lesson.id, lesson_date=claim.lesson_date,
                time_slot=claim.time_slot, location=claim.location))
    snapshot['line_evidence'] = evidence
    payment.snapshot = snapshot
    session.commit()
    return payment


def test_actual_payment_reads_are_batched_and_ordered_by_school_id(env):
    client, session, _ = env
    payment = autopay_payment(client, session)
    session.get(Student, 101).school_student_id = '20'
    session.commit()
    def counted():
        queries = []
        def query(_conn, _cursor, sql, *_args):
            assert sql.lstrip().upper().startswith('SELECT')
            queries.append(sql)
        event.listen(session.bind, 'before_cursor_execute', query)
        try:
            result = run(client)
        finally:
            event.remove(session.bind, 'before_cursor_execute', query)
        return result, len(queries)
    one, count_one = counted()
    clone_payment_for_student(session, payment, 201)
    clone_payment_for_student(session, payment, 202)
    clone_payment_for_student(session, payment, 203)
    several, count_several = counted()
    assert one['counts']['ready'] == 1 and several['counts']['ready'] == 4
    assert count_several == count_one
    assert [r['student']['school_student_id'] for r in several['rows']] == ['11', '12', '13', '20']
    filtered = run(client, search='Synthetic 202', limit=1)
    assert filtered['counts']['ready'] == 1 and filtered['ready_total'] == filtered['rows'][0]['total_fee']


def test_corrupted_first_manual_method_cannot_become_an_autopay_debit(env):
    client, session, _ = env
    payment = autopay_payment(client, session)
    snapshot = deepcopy(payment.snapshot)
    snapshot['review']['period']['kind'] = 'first'
    payment.snapshot = snapshot
    session.commit()
    result = run(client)
    assert result['ready_total'] == 0
    row, = result['rows']
    assert row['stage'] == 'attention' and 'PAYMENT_INTEGRITY' in codes(row)


def test_paid_transition_original_run_includes_settled_legacy_lessons(env):
    client, session, _ = env
    payment = autopay_payment(client, session, source_first=date(2026, 11, 6), source_count=6)
    settle(session, payment)
    result = run(client)
    row, = result['rows']
    assert row['stage'] == 'skipped' and 'ALREADY_PAID' in codes(row)
    assert result['ready_total'] == 0


def test_july_tail_cannot_become_a_separate_autopay_period(env):
    from billing.autopay import _shape
    from billing.calculator import BillingPolicy, preview_billing
    from billing.schemas import BillingPreviewRequest
    client, session, _ = env
    payment = autopay_payment(client, session)
    review = BillingDraftReview.model_validate(payment.snapshot['review'])
    scenario = BillingPreviewRequest(first_lesson_date=date(2027, 7, 2), mode='regular',
        payment_method='autopay', mandate_ready=True, materials_fee=0,
        slots=[{'weekday': 'Fri', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}])
    period = preview_billing(scenario, set()).periods[0]
    assert period.collection.method == 'autopay' and period.first_lesson_date > date(2027, 6, 30)
    assert not _shape(review.model_copy(update={'scenario': scenario, 'period': period}), 101, BillingPolicy())


def test_legacy_only_paid_december_is_a_skipped_transition_collection(env):
    client, session, _ = env
    source = session.get(Enrollment, 11)
    source.first_lesson_date = date(2026, 11, 13)
    for index, lesson in enumerate(session.query(SessionLog).filter_by(enrollment_id=11).order_by(SessionLog.id)):
        lesson.session_date = date(2026, 11, 13) + timedelta(weeks=index)
    session.commit()
    preference(client, method='autopay', ready=True)
    assert session.query(BillingPayment).count() == 0
    result = run(client)
    row, = result['rows']
    assert row['stage'] == 'skipped' and row['origin'] == 'projection'
    assert 'PREPAID' in codes(row)
    assert row['coverage_from'] == '2026-12-04' and row['coverage_through'] == '2026-12-31'
    assert row['lesson_count'] == 3 and row['enrollment_ids'] == [11]
    assert row['payment_id'] is None and row['total_fee'] is None and row['amount_basis'] == 'unknown'
    assert result['ready_total'] == 0 and result['counts']['skipped'] == 1
    # An unsettled original cannot become paid evidence through a projection.
    session.get(SessionLog, 115).financial_status = 'Unpaid'
    session.commit()
    row, = run(client)['rows']
    assert row['stage'] == 'attention' and 'COVERAGE_REVIEW' in codes(row)
    assert row['total_fee'] is None
