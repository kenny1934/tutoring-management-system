"""Independent optional-note and source-context checks on synthetic SQLite."""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import coupon_accounting as accounting
from billing.coupon_models import CouponAccount, CouponImport, CouponObservation, CouponOperation, CouponUse, CouponVerification
from billing.coupon_schemas import CouponVerificationRequest
from billing.models import BillingAccount, BillingPayment
from models import Enrollment, SessionLog, Student, StudentCoupon
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env, second_class
from tests.test_billing_coupon_verification import (
    DAY, coupon_env, first_payment, group, observation, pay, receipt, verify, workbook,
)


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Coupon context verification refuses external databases.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def context_env(coupon_env, monkeypatch):
    from routers import billing_coupons
    monkeypatch.setattr(billing_coupons, 'today', lambda: DAY)
    coupon_env[0].app.include_router(billing_coupons.router, prefix='/api')
    return coupon_env


def note_request(db, *, reason=None, reconciliations=None, groups=None):
    balance = accounting.balance_for_student(db, 101, as_of=DAY)
    result = {'expected_version': balance.version, 'observation_id': balance.observation.id,
        'checked_at': datetime.combine(DAY, datetime.min.time(), tzinfo=timezone.utc).isoformat(),
        'groups': groups if groups is not None else [group()], 'reconciliations': reconciliations or []}
    if reason is not None:
        result['reason'] = reason
    return result


def review_and_confirm(client, request, key):
    reviewed = client.post('/api/billing/students/101/coupons/review', json=request)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()['can_confirm'], reviewed.text
    payload = {**request, 'expected_review_hash': reviewed.json()['review_hash'], 'idempotency_key': key}
    result = client.post('/api/billing/students/101/coupons/verify', json=payload)
    assert result.status_code == 200, result.text
    return result, payload


@pytest.mark.parametrize('reason', [None, '', ' \n\t '])
def test_empty_or_omitted_note_is_empty_audit_fact_and_exact_retry(context_env, reason):
    client, db, actor = context_env
    observation(db)
    request = note_request(db, reason=reason)
    assert CouponVerificationRequest.model_validate(request).reason == ''
    result, payload = review_and_confirm(client, request, 'optional-note')
    assert result.json()['usable_count'] == 1
    saved = db.query(CouponVerification).one()
    assert saved.reason == '' and saved.checked_by == actor.id
    assert saved.checked_at == datetime(2026, 10, 17)
    assert saved.reconciliations == []
    # Equivalent blank inputs normalise to the same reviewed payload.
    replay = client.post('/api/billing/students/101/coupons/verify', json={**payload, 'reason': '  '})
    assert replay.status_code == 200 and replay.json() == result.json()
    assert db.query(CouponVerification).count() == db.query(CouponOperation).filter_by(kind='verified').count() == 1


def test_optional_note_still_participates_in_review_and_retry_hashes(context_env):
    client, db, _actor = context_env
    observation(db)
    request = note_request(db)
    result, payload = review_and_confirm(client, request, 'blank-note-key')
    changed = client.post('/api/billing/students/101/coupons/verify', json={**payload, 'reason': 'A different checked fact.'})
    assert changed.status_code == 409
    assert db.query(CouponVerification).count() == 1 and db.query(CouponVerification).one().reason == ''
    updated_request = note_request(db, reason='  Checked an expiry correction.  ')
    updated, _ = review_and_confirm(client, updated_request, 'specific-note-key')
    assert updated.json()['version'] > result.json()['version']
    assert {row.reason for row in db.query(CouponVerification)} == {'', 'Checked an expiry correction.'}


def test_blank_note_keeps_explicit_paid_use_reconciliation_audited(context_env):
    client, db, actor = context_env
    observation(db)
    verify(db, actor, [group()])
    value = pay(client, first_payment(client))
    assert receipt(client, value)[0].status_code == 200
    use = db.query(CouponUse).one()
    observation(db, count=0, marker='b')
    request = note_request(db, groups=[], reconciliations=[{'use_id': use.id, 'included_in_observation': True}])
    result, _ = review_and_confirm(client, request, 'blank-note-explicit-reconciliation')
    assert result.json()['usable_count'] == 0 and result.json()['used_awaiting_sync_count'] == 0
    saved = db.query(CouponVerification).filter_by(reason='').one()
    assert saved.checked_by == actor.id and saved.reconciliations == request['reconciliations']


def native_use(context_env, *, paid=False, combined=False):
    client, db, actor = context_env
    if combined:
        second_class(db)
    observation(db)
    verify(db, actor, [group()])
    value = first_payment(client, ids=(11, 12) if combined else (11,))
    if paid:
        value = pay(client, value)
    return value, db.query(CouponUse).one()


@pytest.mark.parametrize('paid', [False, True])
def test_combined_context_uses_frozen_lesson_dates_and_actual_received_money(context_env, paid):
    client, db, _actor = context_env
    value, use = native_use(context_env, paid=paid, combined=True)
    response = client.get('/api/billing/students/101/coupons')
    assert response.status_code == 200, response.text
    row, = response.json()['uses']
    period = value['review']['period']
    assert row['id'] == use.id and row['payment_id'] == value['id']
    assert row['first_lesson_date'] == period['first_lesson_date']
    assert row['last_lesson_date'] == period['last_lesson_date']
    assert row['lesson_count'] == period['lesson_count']
    if paid:
        assert row['payment_date'] == DAY.isoformat() and row['received_amount'] == period['total_fee']
    else:
        assert row.get('payment_date') is None and row.get('received_amount') is None
    assert len(value['lines']) == 2 and db.query(CouponUse).count() == 1


@pytest.mark.parametrize('corruption', ['foreign_review', 'malformed_review'])
def test_bad_snapshot_context_suppresses_its_values_without_echoing_private_data(context_env, corruption):
    client, db, _actor = context_env
    value, _use = native_use(context_env, paid=True)
    stored = db.get(BillingPayment, value['id'])
    snapshot = deepcopy(stored.snapshot)
    snapshot['review']['student']['student_name'] = 'PRIVATE_CONTEXT_SENTINEL'
    snapshot['review']['student']['id'] = 102 if corruption == 'foreign_review' else {'private': 'PRIVATE_CONTEXT_SENTINEL'}
    snapshot['review']['period']['first_lesson_date'] = '2028-02-03'
    snapshot['review']['period']['last_lesson_date'] = '2028-03-04'
    stored.snapshot = snapshot
    db.commit()
    result = client.get('/api/billing/students/101/coupons')
    assert result.status_code == 200, result.text
    row, = result.json()['uses']
    assert row.get('first_lesson_date') is None and row.get('last_lesson_date') is None and row.get('lesson_count') is None
    assert row['payment_date'] == DAY.isoformat() and row['received_amount'] == value['review']['period']['total_fee']
    assert 'PRIVATE_CONTEXT_SENTINEL' not in result.text and '2028-02-03' not in result.text


def test_cross_owner_payment_link_has_no_context_even_in_multi_student_batch(context_env):
    _client, db, _actor = context_env
    value, _use = native_use(context_env, paid=True)
    foreign_account = BillingAccount(student_id=102, academic_start=date(2026, 9, 1), policy_version='synthetic-context', active=True)
    db.add(foreign_account)
    db.flush()
    stored = db.get(BillingPayment, value['id'])
    stored.account_id, stored.payment_date, stored.received_amount = foreign_account.id, date(2028, 2, 3), 987654
    db.commit()
    row, = accounting.balances_for_students(db, [101, 102], as_of=DAY)[101].uses
    assert row.payment_date is row.received_amount is row.first_lesson_date is row.last_lesson_date is row.lesson_count is None


def legacy_use(db, *, enrollment_id=11, student_id=101):
    use = CouponUse(id=str(uuid4()), student_id=student_id, legacy_enrollment_id=enrollment_id,
                    value=300, state='awaiting_receipt')
    db.add(use)
    db.commit()
    return use


def test_legacy_context_uses_owned_originals_without_guessing_received_amount(context_env):
    _client, db, _actor = context_env
    legacy_use(db)
    db.add_all([
        SessionLog(student_id=101, enrollment_id=11, tutor_id=1, session_date=date(2027, 6, 1),
                   time_slot='16:00 - 17:30', location='MSA', session_status='Make-up Class', financial_status='Paid', make_up_for_id=110),
        SessionLog(student_id=102, enrollment_id=11, tutor_id=1, session_date=date(2027, 6, 2),
                   time_slot='16:00 - 17:30', location='MSA', session_status='Scheduled', financial_status='Paid'),
        SessionLog(student_id=101, enrollment_id=11, tutor_id=1, session_date=date(2027, 6, 3),
                   time_slot='16:00 - 17:30', location='MSA', session_status='Cancelled', financial_status='Paid'),
    ])
    db.commit()
    row, = accounting.balance_for_student(db, 101, as_of=DAY).uses
    assert row.payment_date == date(2026, 10, 1) and row.received_amount is None
    assert (row.first_lesson_date, row.last_lesson_date, row.lesson_count) == (date(2026, 10, 2), date(2026, 11, 6), 6)


def test_foreign_legacy_enrollment_suppresses_all_context(context_env):
    _client, db, _actor = context_env
    legacy_use(db)
    db.get(Enrollment, 11).student_id = 102
    db.commit()
    row, = accounting.balances_for_students(db, [101, 102], as_of=DAY)[101].uses
    assert row.payment_date is row.received_amount is row.first_lesson_date is row.last_lesson_date is row.lesson_count is None


def test_context_reads_are_batched_and_read_only(context_env):
    _client, db, _actor = context_env
    observation(db)
    legacy_use(db)
    def measured():
        statements = []
        def select_only(_connection, _cursor, sql, *_args):
            assert sql.lstrip().upper().startswith('SELECT'), sql
            statements.append(sql)
        event.listen(db.bind, 'before_cursor_execute', select_only)
        try:
            result = accounting.balance_for_student(db, 101, as_of=DAY)
        finally:
            event.remove(db.bind, 'before_cursor_execute', select_only)
        return result, statements
    one, one_queries = measured()
    for index in range(8):
        enrollment = Enrollment(student_id=101, tutor_id=1, enrollment_type='Regular', lessons_paid=1,
            first_lesson_date=DAY + timedelta(weeks=index), payment_date=DAY, payment_status='Paid')
        db.add(enrollment)
        db.flush()
        db.add(SessionLog(student_id=101, tutor_id=1, enrollment_id=enrollment.id,
            session_date=enrollment.first_lesson_date, session_status='Scheduled', financial_status='Paid'))
        db.add(CouponUse(id=str(uuid4()), student_id=101, legacy_enrollment_id=enrollment.id, value=300, state='awaiting_receipt'))
    db.commit()
    many, many_queries = measured()
    assert len(one.uses) == 1 and len(many.uses) == 9
    assert len(one_queries) == len(many_queries) <= 8
    assert sum('FROM session_log' in sql for sql in many_queries) == 1
    assert not db.new and not db.dirty


def test_feature_off_skips_new_context_queries(context_env, monkeypatch):
    _client, db, _actor = context_env
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'false')
    def reject(_connection, _cursor, sql, *_args):
        assert 'billing_coupon_' not in sql and 'FROM session_log' not in sql
    event.listen(db.bind, 'before_cursor_execute', reject)
    try:
        assert accounting.balances_for_students(db, [101], as_of=DAY) == {}
        assert not accounting.balance_for_student(db, 101, as_of=DAY).storage_available
    finally:
        event.remove(db.bind, 'before_cursor_execute', reject)


def prepare_import(client, db, rows, *, observed_on=DAY):
    for student_id, school_id in ((101, '0021'), (102, '0022')):
        db.get(Student, student_id).school_student_id = school_id
    db.commit()
    result = client.post('/api/billing/coupon-imports/preview',
        data={'branch': 'MSA', 'observed_on': observed_on.isoformat()},
        files={'file': ('synthetic-coupon-flags.xlsx', workbook(rows),
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})
    assert result.status_code == 200, result.text
    assert result.json()['can_confirm'], result.text
    return result.json()


def import_confirmation(review, key='completion-flags', **changes):
    return {'expected_review_hash': review['review_hash'], 'idempotency_key': key, **changes}


def test_import_completion_flags_are_batched_and_absent_from_the_preapply_hash(context_env, monkeypatch):
    client, db, _actor = context_env
    db.add(StudentCoupon(student_id=101, available_coupons=7, coupon_value=200))
    db.commit()
    review = prepare_import(client, db, [('MSA0021', 0), ('MSA0022', 2)])
    assert all('coupon_check_required' not in row for row in review['rows'])
    repeated = client.get(f"/api/billing/coupon-imports/{review['id']}")
    assert repeated.status_code == 200 and repeated.json() == review
    assert db.query(CouponObservation).count() == db.query(CouponUse).count() == 0
    calls = []
    original = accounting.balances_for_students
    def batched(database, student_ids, **options):
        calls.append(tuple(student_ids))
        return original(database, student_ids, **options)
    monkeypatch.setattr(accounting, 'balances_for_students', batched)
    applied = client.post(f"/api/billing/coupon-imports/{review['id']}/confirm",
                          json=import_confirmation(review))
    assert applied.status_code == 200, applied.text
    result = applied.json()
    assert calls == [(101, 102)]
    assert result['review_hash'] == review['review_hash'] and result['applied'] and not result['can_confirm']
    assert [(r['company_id'], r['remaining_count'], r['coupon_check_required']) for r in result['rows']] == [
        ('MSA0021', 0, False), ('MSA0022', 2, True)]
    assert {r.student_id: r.remaining_count for r in db.query(CouponObservation)} == {101: 0, 102: 2}
    assert all(r.verification_id is None for r in db.query(CouponAccount))
    assert db.query(CouponVerification).count() == db.query(CouponUse).count() == db.query(BillingPayment).count() == 0
    assert db.query(StudentCoupon).one().available_coupons == 7
    assert db.get(CouponImport, review['id']).applied_review == result


def test_applied_import_freezes_completion_flags_for_retry_and_readonly_history(context_env, monkeypatch):
    client, db, actor = context_env
    review = prepare_import(client, db, [('MSA0021', 0), ('MSA0022', 2)])
    payload = import_confirmation(review, 'frozen-completion')
    applied = client.post(f"/api/billing/coupon-imports/{review['id']}/confirm", json=payload)
    assert applied.status_code == 200, applied.text
    frozen = applied.json()
    verify(db, actor, [group(quantity=2)], student_id=102)
    assert accounting.balance_for_student(db, 102, as_of=DAY).usable_count == 2
    def no_recalculation(*_args, **_kwargs):
        raise AssertionError('An applied import must return its frozen completion evidence.')
    monkeypatch.setattr(accounting, 'balances_for_students', no_recalculation)
    replay = client.post(f"/api/billing/coupon-imports/{review['id']}/confirm", json=payload)
    assert replay.status_code == 200 and replay.json() == frozen
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    statements = []
    def read_only(_connection, _cursor, sql, *_args):
        assert sql.lstrip().upper().startswith('SELECT'), sql
        statements.append(sql)
    event.listen(db.bind, 'before_cursor_execute', read_only)
    try:
        loaded = client.get(f"/api/billing/coupon-imports/{review['id']}")
        assert loaded.status_code == 200 and loaded.json() == frozen
    finally:
        event.remove(db.bind, 'before_cursor_execute', read_only)
    assert statements
    assert db.query(CouponObservation).count() == 2 and db.query(CouponUse).count() == 0
    assert db.query(CouponOperation).filter_by(kind='import_applied').count() == 1


@pytest.mark.parametrize('use_stage', ['reserved', 'awaiting_receipt', 'receipt_recorded'])
def test_imported_zero_keeps_unresolved_use_and_requires_coupon_check(context_env, use_stage):
    client, db, actor = context_env
    observation(db, observed_on=DAY - timedelta(days=1))
    verify(db, actor, [group()])
    payment = first_payment(client)
    if use_stage != 'reserved':
        payment = pay(client, payment)
    if use_stage == 'receipt_recorded':
        recorded, _ = receipt(client, payment)
        assert recorded.status_code == 200, recorded.text
    use = db.query(CouponUse).one()
    before = (use.state, use.receipt_reference, use.coupon_used_on, use.accounted_observation_id)
    review = prepare_import(client, db, [('MSA0021', 0)])
    applied = client.post(f"/api/billing/coupon-imports/{review['id']}/confirm",
                          json=import_confirmation(review, 'zero-with-' + use_stage))
    assert applied.status_code == 200, applied.text
    row, = applied.json()['rows']
    assert row['previous_count'] == 1 and row['remaining_count'] == 0 and row['coupon_check_required'] is True
    db.refresh(use)
    assert (use.state, use.receipt_reference, use.coupon_used_on, use.accounted_observation_id) == before
    assert use.accounted_observation_id is None and db.query(CouponUse).count() == 1
    balance = accounting.balance_for_student(db, 101, as_of=DAY)
    assert balance.usable_count is None and balance.observation.remaining_count == 0
    assert balance.uses[0].state == use_stage and not balance.uses[0].accounted_in_observation
    assert db.query(CouponObservation).count() == 2 and db.query(CouponVerification).count() == 1
    if use_stage != 'receipt_recorded':
        assert use.receipt_reference is None


def test_import_completion_gate_off_never_queries_191_and_preserves_stored_result(context_env, monkeypatch):
    client, db, _actor = context_env
    review = prepare_import(client, db, [('MSA0021', 0)])
    payload = import_confirmation(review, 'off-completion')
    applied = client.post(f"/api/billing/coupon-imports/{review['id']}/confirm", json=payload)
    assert applied.status_code == 200, applied.text
    saved = deepcopy(db.get(CouponImport, review['id']).applied_review)
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'false')
    def no_191(_connection, _cursor, sql, *_args):
        assert 'billing_coupon_' not in sql
    event.listen(db.bind, 'before_cursor_execute', no_191)
    try:
        assert client.get(f"/api/billing/coupon-imports/{review['id']}").status_code == 409
        assert client.post(f"/api/billing/coupon-imports/{review['id']}/confirm", json=payload).status_code == 409
        assert accounting.balances_for_students(db, [101, 102], as_of=DAY) == {}
    finally:
        event.remove(db.bind, 'before_cursor_execute', no_191)
    assert db.get(CouponImport, review['id']).applied_review == saved
    assert db.query(CouponObservation).count() == 1 and db.query(CouponUse).count() == 0
