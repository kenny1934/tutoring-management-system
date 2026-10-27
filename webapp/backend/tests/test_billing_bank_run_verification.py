"""Independent saved-run and result-confirmation checks using disposable SQLite."""
from copy import deepcopy
from datetime import date
from decimal import Decimal
from io import BytesIO
import json

import pytest
from fastapi import HTTPException
from openpyxl import load_workbook
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.bank_run_models import BankRun, BankRunClaim, BankRunImport, BankRunOperation
from billing.models import BillingOperation, BillingPayment, BillingPreference
from models import Student, StudentCoupon
from tests.test_billing_autopay_export_verification import (
    bank_records, draft_env, workflow_env, records, preview, assert_exact_workbook,
)
from tests.test_billing_autopay_verification import add_source, payment, record_paid
from tests.test_billing_bank_results_verification import ACCOUNT, BATCH, html_report, txt_report


@pytest.fixture(autouse=True)
def reject_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Saved-run verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def run_env(bank_records, monkeypatch):
    from routers import billing_bank_runs
    client, db, actor = bank_records
    clock = [date(2026, 11, 17)]
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'true')
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_STORAGE_ENABLED', 'true')
    monkeypatch.setattr(billing_bank_runs, 'today', lambda: clock[0])
    client.app.include_router(billing_bank_runs.router, prefix='/api')
    return client, db, actor, clock


def prepare(client, *, key='independent-prepared', branch='MSA'):
    reviewed = preview(client, branch)
    payload = {'collection_month': '2026-11', 'branch': branch,
        'expected_content_hash': reviewed['content_hash'], 'idempotency_key': key}
    response = client.post('/api/billing/autopay/runs', json=payload)
    assert response.status_code == 200, response.text
    return response.json(), payload


def uploaded(client, run, *, key='independent-uploaded', batch=BATCH):
    payload = {'expected_version': run['version'], 'idempotency_key': key, 'bank_batch_no': batch}
    response = client.post(f"/api/billing/autopay/runs/{run['id']}/submitted", json=payload)
    assert response.status_code == 200, response.text
    return response.json(), payload


def native_rows(run, *, status='Successed', code=''):
    return [(row['contract_no'], row['amount'], status, code) for row in run['export_preview']['rows']]


def source(run, *, rows=None, language='en', **changed):
    from decimal import Decimal
    rows = rows or native_rows(run)
    total = sum((Decimal(row[1]) for row in rows), Decimal('0'))
    known_failed = [row for row in rows if row[3] and row[2] not in ('Successed', '交易成功', 'P')]
    failed_amount = sum((Decimal(row[1]) for row in known_failed), Decimal('0'))
    return html_report(rows=rows, language=language, count=len(rows), total=format(total, '.2f'),
        success_count=len(rows)-len(known_failed), successful=format(total-failed_amount, '.2f'),
        failed_count=len(known_failed), failed=format(failed_amount, '.2f'), **changed)


def import_result(client, run, content=None, *, filename='DirectDebit_20991231.xls', expected_version=None):
    current = client.get(f"/api/billing/autopay/runs/{run['id']}")
    assert current.status_code == 200, current.text
    version = current.json()['version'] if expected_version is None else expected_version
    response = client.post(f"/api/billing/autopay/runs/{run['id']}/results",
        data={'expected_version': str(version)}, files={'file': (filename, content or source(run), 'application/vnd.ms-excel')})
    assert response.status_code == 200, response.text
    return response.json()


def confirmation(client, run, reviewed, *, key='independent-record-bank-result'):
    payload = {'expected_review_hash': reviewed['review_hash'], 'idempotency_key': key}
    response = client.post(f"/api/billing/autopay/runs/{run['id']}/results/{reviewed['id']}/confirm", json=payload)
    return response, payload


def two_payments(client, db):
    first = payment(client)
    add_source(db, student_id=102, source_id=21, location='MSA', school_id='2200')
    second = payment(client, student_id=102, source_id=21, key='second-run-payment')
    return first, second


def test_saved_run_is_immutable_and_upload_is_separate_from_payment(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    run, payload = prepare(client)
    assert run['status'] == 'prepared' and run['submitted_at'] is None
    assert {claim.payment_id for claim in db.query(BankRunClaim)} == {value['id']}
    replay = client.post('/api/billing/autopay/runs', json=payload)
    assert replay.status_code == 200 and replay.json()['id'] == run['id']
    first = client.get(f"/api/billing/autopay/runs/{run['id']}/file")
    assert_exact_workbook(first, run['export_preview'])
    submitted, submit_payload = uploaded(client, run)
    second = client.get(f"/api/billing/autopay/runs/{run['id']}/file")
    assert first.content == second.content == db.get(BankRun, run['id']).workbook
    assert submitted['status'] == 'submitted' and submitted['submitted_at']
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0
    retried = client.post(f"/api/billing/autopay/runs/{run['id']}/submitted", json=submit_payload)
    assert retried.status_code == 200 and retried.json()['version'] == submitted['version']
    assert db.query(BankRun).count() == 1


def test_claims_block_another_file_and_discard_retry_cannot_release_a_new_owners_claim(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    old, _ = prepare(client)
    blocked = preview(client)
    assert not blocked['can_download'] and blocked['issues']
    duplicate = client.post('/api/billing/autopay/runs', json={'collection_month':'2026-11','branch':'MSA',
        'expected_content_hash':old['content_hash'],'idempotency_key':'another-run-for-claimed-payment'})
    assert duplicate.status_code == 409 and db.query(BankRun).count() == 1
    discarded_payload = {'expected_version': old['version'], 'idempotency_key': 'discard-first-file', 'reason': 'Synthetic unuploaded replacement.'}
    result = client.post(f"/api/billing/autopay/runs/{old['id']}/discard", json=discarded_payload)
    assert result.status_code == 200 and result.json()['status'] == 'discarded'
    assert db.query(BankRunClaim).count() == 0
    new, _ = prepare(client, key='replacement-prepared')
    assert db.get(BankRunClaim, value['id']).run_id == new['id']
    replay = client.post(f"/api/billing/autopay/runs/{old['id']}/discard", json=discarded_payload)
    assert replay.status_code == 200 and replay.json()['status'] == 'discarded'
    assert db.get(BankRunClaim, value['id']).run_id == new['id']
    assert client.get(f"/api/billing/autopay/runs/{old['id']}/file").status_code == 200


def test_submitted_run_cannot_be_discarded_or_release_its_claim(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    rejected = client.post(f"/api/billing/autopay/runs/{run['id']}/discard", json={
        'expected_version': run['version'], 'idempotency_key': 'discard-after-upload', 'reason': 'Not authorised.'})
    assert rejected.status_code == 409
    assert db.get(BankRunClaim, value['id']).run_id == run['id']
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'


@pytest.mark.parametrize('corruption', ['file', 'total', 'row_amount', 'contract'])
def test_corrupted_saved_file_or_frozen_metadata_cannot_advertise_a_download(run_env, corruption):
    client, db, _actor, _clock = run_env
    payment(client)
    run, _ = prepare(client)
    stored = db.get(BankRun, run['id'])
    if corruption == 'file':
        stored.workbook += b'not the saved artifact'
    else:
        altered = deepcopy(stored.export_snapshot)
        if corruption == 'total': altered['total_amount'] = '1.00'
        elif corruption == 'row_amount': altered['rows'][0]['amount'] = '1.00'
        else: altered['rows'][0]['contract_no'] = 'MSA09999'
        stored.export_snapshot = altered
    db.commit()
    result = client.get(f"/api/billing/autopay/runs/{run['id']}/file")
    assert result.status_code == 409 and not result.content.startswith(b'PK')


def test_review_uses_file_date_then_explicit_confirmation_and_cross_format_replay_record_once(run_env):
    client, db, _actor, clock = run_env
    values = two_payments(client, db)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, run)
    assert reviewed['debit_date'] == '2026-11-21' and reviewed['ready_count'] == 2
    assert reviewed['recorded_count'] == 0 and reviewed['can_confirm']
    assert all(db.get(BillingPayment, value['id']).status == 'Pending Payment' for value in values)
    confirmed, payload = confirmation(client, run, reviewed)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()['recorded_count'] == 2 and not confirmed.json()['can_confirm']
    for value in values:
        stored = db.get(BillingPayment, value['id'])
        assert stored.status == 'Paid' and stored.payment_date == date(2026, 11, 21)
        assert stored.received_method == 'autopay' and stored.receipt_reference is None
    replay = client.post(f"/api/billing/autopay/runs/{run['id']}/results/{reviewed['id']}/confirm", json=payload)
    assert replay.status_code == 200 and replay.json()['recorded_count'] == 2
    zh = import_result(client, run, source(run, rows=[(c,a,'交易成功','') for c,a,_,_ in reversed(native_rows(run))], language='zh'))
    coded_rows = [(c,a,'P','') for c,a,_,_ in native_rows(run)]
    cents = sum(int(Decimal(row[1])*100) for row in coded_rows)
    coded = import_result(client, run, txt_report(coded_rows, success_count=2, successful_cents=cents), filename='different.txt')
    assert zh['id'] == coded['id'] == reviewed['id'] and zh['recorded_count'] == coded['recorded_count'] == 2
    assert db.query(BankRunImport).count() == 1 and db.query(BillingOperation).filter_by(kind='paid').count() == 2
    assert db.query(BankRunOperation).filter_by(kind='results_recorded').count() == 1
    assert ACCOUNT not in json.dumps(db.query(BankRunImport).one().report)


@pytest.mark.parametrize('held', ['rejected', 'unknown'])
def test_known_collected_rows_can_be_recorded_while_other_rows_remain_unpaid(run_env, held):
    client, db, _actor, clock = run_env
    first, second = two_payments(client, db)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    rows = native_rows(run)
    code = 'AT0311' if held == 'rejected' else ''
    rows[1] = (*rows[1][:2], 'Unobserved bank status', code)
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, run, source(run, rows=rows))
    assert reviewed['can_confirm'] and reviewed['ready_count'] == 1
    result, _ = confirmation(client, run, reviewed)
    assert result.status_code == 200, result.text
    assert db.get(BillingPayment, first['id']).status == 'Paid'
    assert db.get(BillingPayment, second['id']).status == 'Pending Payment'
    held_row = next(row for row in result.json()['rows'] if row['payment_id'] == second['id'])
    assert held_row['record_status'] == ('unpaid' if held == 'rejected' else 'review')
    assert held_row['reject_code'] == code
    assert db.query(BillingPreference).filter_by(mandate_ready=True).count() == 2
    assert db.get(BankRun, run['id']).status == 'needs_attention'


@pytest.mark.parametrize('change', ['paid', 'cancelled', 'version', 'snapshot'])
def test_manually_changed_payment_is_held_and_not_treated_as_bank_replay(run_env, change):
    client, db, _actor, clock = run_env
    value = payment(client)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    if change == 'paid': record_paid(client, value)
    elif change == 'cancelled':
        response = client.post(f"/api/billing/payments/{value['id']}/cancel", json={
            'expected_version': value['version'], 'idempotency_key': 'manual-cancel-before-result', 'reason': 'Synthetic cancellation.'})
        assert response.status_code == 200, response.text
    elif change == 'version': db.get(BillingPayment, value['id']).version += 1
    else:
        stored = db.get(BillingPayment, value['id'])
        snapshot = deepcopy(stored.snapshot)
        snapshot['review']['period']['total_fee'] += 1
        stored.snapshot = snapshot
    db.commit()
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, run)
    assert not reviewed['can_confirm'] and reviewed['ready_count'] == reviewed['recorded_count'] == 0
    assert reviewed['rows'][0]['record_status'] == 'review'
    result, _ = confirmation(client, run, reviewed)
    assert result.status_code == 409
    assert db.query(BankRunOperation).filter_by(kind='results_recorded').count() == 0


@pytest.mark.parametrize('change', ['unknown_contract', 'amount', 'date', 'batch', 'currency'])
def test_report_mismatches_are_held_globally_before_any_payment(run_env, change):
    client, db, _actor, clock = run_env
    value = payment(client)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    rows = native_rows(run)
    changed = {}
    if change == 'unknown_contract': rows[0] = ('MSA09999', *rows[0][1:])
    elif change == 'amount': rows[0] = (rows[0][0], '1600.01', *rows[0][2:])
    elif change == 'date': changed['date'] = '2026/11/23'
    elif change == 'batch': changed['batch'] = '000009999'
    else: changed['currency'] = 'USD'
    clock[0] = date(2026, 11, 30)
    reviewed = import_result(client, run, source(run, rows=rows, **changed))
    assert reviewed['issues'] and not reviewed['can_confirm']
    result, _ = confirmation(client, run, reviewed)
    assert result.status_code == 409
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'


def test_failure_after_one_payment_flush_rolls_back_and_exact_retry_records_each_once(run_env, monkeypatch):
    from billing import bank_runs
    client, db, _actor, clock = run_env
    values = two_payments(client, db)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, run)
    actual = bank_runs.workflow.mutate_payment
    calls = []
    def fail_second(*args, **kwargs):
        calls.append(args[2])
        if len(calls) == 2: raise HTTPException(status_code=503, detail='Synthetic failure before the second settlement.')
        return actual(*args, **kwargs)
    monkeypatch.setattr(bank_runs.workflow, 'mutate_payment', fail_second)
    failed, payload = confirmation(client, run, reviewed, key='atomic-bank-retry')
    assert failed.status_code == 503
    db.expire_all()
    assert all(db.get(BillingPayment, value['id']).status == 'Pending Payment' for value in values)
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0
    assert db.query(BankRunImport).one().applied == {}
    monkeypatch.setattr(bank_runs.workflow, 'mutate_payment', actual)
    success = client.post(f"/api/billing/autopay/runs/{run['id']}/results/{reviewed['id']}/confirm", json=payload)
    assert success.status_code == 200, success.text
    assert success.json()['recorded_count'] == 2 and db.query(BillingOperation).filter_by(kind='paid').count() == 2
    replay = client.post(f"/api/billing/autopay/runs/{run['id']}/results/{reviewed['id']}/confirm", json=payload)
    assert replay.status_code == 200 and db.query(BillingOperation).filter_by(kind='paid').count() == 2


def test_coupon_bank_payment_preserves_kms_receipt_and_imported_balance(run_env):
    client, db, _actor, clock = run_env
    db.add(StudentCoupon(student_id=101, available_coupons=1, coupon_value=300))
    db.commit()
    value = payment(client, coupon={'kind': 'ordinary', 'value': 300, 'verified': True,
        'available_count': 1, 'expires_on': '2027-06-30'})
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, run)
    result, _ = confirmation(client, run, reviewed)
    assert result.status_code == 200, result.text
    stored = db.get(BillingPayment, value['id'])
    assert stored.status == 'Paid' and stored.coupon_status == 'awaiting_receipt'
    assert stored.receipt_reference is None and db.query(StudentCoupon).one().available_coupons == 1


@pytest.mark.parametrize('workflow_available,storage_available', [(True, False), (False, True)])
def test_feature_off_reads_do_not_touch_unavailable_bank_or_financial_tables(run_env, monkeypatch, workflow_available, storage_available):
    client, db, _actor, _clock = run_env
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', str(workflow_available).lower())
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'false')
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_STORAGE_ENABLED', str(storage_available).lower())
    def guard(_connection, _cursor, statement, *_args):
        text = statement.lower()
        assert 'billing_bank_' not in text
        if not workflow_available:
            assert not any(name in text for name in ['billing_accounts', 'billing_payments', 'billing_preferences', 'billing_payment_lines'])
    event.listen(db.bind, 'before_cursor_execute', guard)
    try:
        result = client.get('/api/billing/autopay/runs')
        assert result.status_code == 200 and result.json() == {'storage_available': False, 'writes_available': False, 'runs': []}
        assert not preview(client)['can_download']
        assert client.get('/api/billing/autopay/runs/00000000-0000-0000-0000-000000000001').status_code == 503
    finally:
        event.remove(db.bind, 'before_cursor_execute', guard)


def test_disabling_writes_keeps_history_and_saved_file_readable_but_protects_actions(run_env, monkeypatch):
    client, db, _actor, _clock = run_env
    payment(client)
    run, _ = prepare(client)
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'false')
    assert client.get('/api/billing/autopay/runs').json()['storage_available']
    assert not client.get('/api/billing/autopay/runs').json()['writes_available']
    detail = client.get(f"/api/billing/autopay/runs/{run['id']}")
    assert detail.status_code == 200 and not detail.json()['can_submit'] and not detail.json()['can_discard']
    assert client.get(f"/api/billing/autopay/runs/{run['id']}/file").status_code == 200
    result = client.post(f"/api/billing/autopay/runs/{run['id']}/submitted", json={
        'expected_version': run['version'], 'idempotency_key': 'writes-off-upload'})
    assert result.status_code == 503 and db.get(BankRun, run['id']).status == 'prepared'


@pytest.mark.parametrize('role,effective', [('Supervisor', None), ('Tutor', 'Admin'), ('Guest', None),
    ('Super Admin', 'Tutor'), ('Super Admin', 'Supervisor')])
def test_history_artifact_and_mutations_have_effective_admin_boundaries(run_env, role, effective):
    client, _db, actor, _clock = run_env
    payment(client)
    run, _ = prepare(client)
    actor.role = role
    headers = {'X-Effective-Role': effective} if effective else {}
    for suffix in ['', f"/{run['id']}", f"/{run['id']}/file"]:
        assert client.get('/api/billing/autopay/runs'+suffix, headers=headers).status_code == 403
    assert client.post(f"/api/billing/autopay/runs/{run['id']}/submitted", headers=headers,
        json={'expected_version': run['version'], 'idempotency_key': 'denied-upload'}).status_code == 403


def test_profile_edits_are_checked_before_upload_and_frozen_identity_is_used_after_upload(run_env):
    client, db, _actor, clock = run_env
    value = payment(client)
    run, _ = prepare(client)
    student = db.get(Student, 101)
    student.school_student_id = '9999'
    db.commit()
    stale = client.get(f"/api/billing/autopay/runs/{run['id']}").json()
    assert not stale['can_submit'] and stale['issues']
    student.school_student_id = '2100'
    db.commit()
    run, _ = uploaded(client, run)
    original = client.get(f"/api/billing/autopay/runs/{run['id']}/file").content
    student.school_student_id, student.home_location = '9999', 'MSB'
    db.commit()
    current = client.get(f"/api/billing/autopay/runs/{run['id']}").json()
    assert current['export_preview']['rows'][0]['contract_no'] == 'MSA02100'
    assert client.get(f"/api/billing/autopay/runs/{run['id']}/file").content == original
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, run)
    assert reviewed['can_confirm'] and reviewed['rows'][0]['payment_id'] == value['id']
    result, _ = confirmation(client, run, reviewed)
    assert result.status_code == 200 and db.get(BillingPayment, value['id']).status == 'Paid'
    assert db.get(Student, 101).school_student_id == '9999'


@pytest.mark.parametrize('changed', ['date', 'outcome'])
def test_changed_evidence_under_the_same_bank_identity_cannot_overwrite_the_first_report(run_env, changed):
    from billing.bank_run_models import BankResultIdentity
    client, db, _actor, clock = run_env
    value = payment(client)
    run, _ = prepare(client)
    run, _ = uploaded(client, run)
    clock[0] = date(2026, 11, 22)
    first = import_result(client, run)
    if changed == 'date':
        content = source(run, date='2026/11/22')
    else:
        content = source(run, rows=native_rows(run, status='Rejected', code='AT0311'))
    other = import_result(client, run, content)
    assert other['id'] != first['id'] and other['report_hash'] != first['report_hash']
    assert any(issue['code'] == 'BANK_REPORT_CONFLICT' for issue in other['issues'])
    assert not other['can_confirm']
    result, _ = confirmation(client, run, other, key='attempt-conflicting-bank-result')
    assert result.status_code == 409 and db.get(BillingPayment, value['id']).status == 'Pending Payment'
    assert db.query(BankResultIdentity).one().import_id == first['id']
