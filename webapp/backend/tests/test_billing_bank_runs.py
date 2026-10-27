"""Persistent bank runs against invented financial records in isolated SQLite."""
from copy import deepcopy
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import bank_runs
from billing.bank_run_models import BankRun, BankRunClaim, BankRunImport, BankRunOperation, BankResultIdentity
from billing.models import BillingOperation, BillingPayment, BillingPaymentLine, BillingPreference
from models import Enrollment, SessionLog, Student
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env
from tests.test_billing_autopay import env as autopay_env, clone_payment_for_student
from tests.test_billing_bank_export import env as export_env, preview
from tests.test_billing_bank_results_verification import html_report, txt_report


@pytest.fixture(autouse=True)
def forbid_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Bank run tests refuse external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def env(export_env, monkeypatch):
    from routers import billing_bank_runs
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'true')
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_STORAGE_ENABLED', 'true')
    monkeypatch.setattr(billing_bank_runs, 'today', lambda: date(2026, 11, 17))
    client, db, user, payment = export_env
    client.app.include_router(billing_bank_runs.router, prefix='/api')
    return client, db, user, payment


def prepared(client, *, key='prepare-native'):
    review = preview(client)
    data = {'collection_month': '2026-11', 'branch': 'MSA',
            'expected_content_hash': review['content_hash'], 'idempotency_key': key}
    response = client.post('/api/billing/autopay/runs', json=data)
    assert response.status_code == 200, response.text
    return response.json(), data


def submitted(client, run, *, key='submitted-native', batch=None):
    body = {'expected_version': run['version'], 'idempotency_key': key, 'bank_batch_no': batch}
    response = client.post(f"/api/billing/autopay/runs/{run['id']}/submitted", json=body)
    assert response.status_code == 200, response.text
    return response.json(), body


def report_for(run, *, outcomes=None, language='en', **changes):
    rows = [(r['contract_no'], r['amount'], '交易成功' if language == 'zh' else 'Successed', '')
            for r in run['export_preview']['rows']]
    if outcomes:
        rows = [(c, a, *outcomes.get(c, (s, code))) for c, a, s, code in rows]
    successful = sum((Decimal(a) for _, a, s, code in rows if s in {'Successed', '交易成功'} and not code), Decimal(0))
    failed = sum((Decimal(a) for _, a, s, code in rows if code), Decimal(0))
    count_success = sum(s in {'Successed', '交易成功'} and not code for _, _, s, code in rows)
    total = sum((Decimal(a) for _, a, _, _ in rows), Decimal(0))
    args = dict(total=format(total, '.2f'), successful=format(successful, '.2f'), failed=format(failed, '.2f'),
                success_count=count_success, failed_count=len(rows) - count_success, count=len(rows), language=language)
    args.update(changes)
    return html_report(rows, **args)


def uploaded(client, run, content):
    response = client.post(f"/api/billing/autopay/runs/{run['id']}/results",
        data={'expected_version': str(run['version'])}, files={'file': ('bank-results.xls', content, 'application/octet-stream')})
    assert response.status_code == 200, response.text
    return response.json()


def confirm(client, review, *, key='confirm-native'):
    body = {'expected_review_hash': review['review_hash'], 'idempotency_key': key}
    response = client.post(f"/api/billing/autopay/runs/{review['run_id']}/results/{review['id']}/confirm", json=body)
    return response, body


def test_preparation_claims_and_frozen_file_have_no_payment_effect(env):
    client, db, _, payment = env
    run, data = prepared(client)
    assert run['status'] == 'prepared' and run['can_submit'] and run['can_discard']
    assert not run['can_import_results'] and run['can_download']
    assert run['history'][0]['kind'] == 'prepared'
    saved = db.get(BankRun, run['id'])
    file = client.get(f"/api/billing/autopay/runs/{run['id']}/file")
    assert file.status_code == 200 and file.content == saved.workbook
    assert file.headers['x-csm-export-total'] == run['total_amount']
    assert db.query(BankRunClaim).one().payment_id == payment.id
    assert db.get(BillingPayment, payment.id).status == 'Pending Payment'
    fresh = preview(client)
    assert fresh['payment_count'] == 0 and fresh['excluded_claimed_count'] == 1
    assert not fresh['can_download']
    assert client.post('/api/billing/autopay/runs', json=data).json() == run
    assert db.query(BankRun).count() == 1 and db.query(BankRunOperation).count() == 1
    assert client.post('/api/billing/autopay/export', json={
        'collection_month': '2026-11', 'branch': 'MSA', 'expected_content_hash': fresh['content_hash']}).status_code == 409


def test_discard_releases_only_unsubmitted_claim_and_retains_file(env):
    client, db, _, payment = env
    run, _ = prepared(client)
    body = {'expected_version': run['version'], 'idempotency_key': 'discard-one', 'reason': 'Wrong branch review.'}
    response = client.post(f"/api/billing/autopay/runs/{run['id']}/discard", json=body)
    assert response.status_code == 200, response.text
    discarded = response.json()
    assert discarded['status'] == 'discarded' and discarded['can_download']
    assert not discarded['can_submit'] and db.query(BankRunClaim).count() == 0
    assert preview(client)['can_download'] and db.get(BillingPayment, payment.id).status == 'Pending Payment'
    assert client.get(f"/api/billing/autopay/runs/{run['id']}/file").status_code == 200
    assert client.post(f"/api/billing/autopay/runs/{run['id']}/discard", json=body).json() == discarded


def test_submitted_is_factual_and_never_paid_or_discardable(env):
    client, db, _, payment = env
    run, _ = prepared(client)
    run, body = submitted(client, run, batch='000004321')
    assert run['status'] == 'submitted' and run['submitted_at'] and run['can_import_results']
    assert not run['can_submit'] and not run['can_discard']
    assert db.get(BillingPayment, payment.id).status == 'Pending Payment'
    assert client.post(f"/api/billing/autopay/runs/{run['id']}/submitted", json=body).json() == run
    assert client.post(f"/api/billing/autopay/runs/{run['id']}/discard", json={
        'expected_version': run['version'], 'idempotency_key': 'bad-discard', 'reason': 'Not allowed.'}).status_code == 409


def test_actual_collected_results_apply_once_and_keep_kms_followup(env, monkeypatch):
    client, db, _, payment = env
    run, _ = prepared(client)
    run, _ = submitted(client, run)
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    review = uploaded(client, run, report_for(run))
    assert review['ready_count'] == 1 and review['can_confirm'] and review['recorded_count'] == 0
    assert db.get(BillingPayment, payment.id).status == 'Pending Payment'
    response, body = confirm(client, review)
    assert response.status_code == 200, response.text
    recorded = response.json()
    assert recorded['recorded_count'] == 1 and recorded['ready_count'] == 0 and not recorded['can_confirm']
    paid = db.get(BillingPayment, payment.id)
    assert paid.status == 'Paid' and paid.received_method == 'autopay' and paid.payment_date == date(2026, 11, 21)
    assert not paid.receipt_reference
    for line in db.query(BillingPaymentLine).filter_by(payment_id=payment.id):
        assert db.get(Enrollment, line.enrollment_id).payment_status == 'Paid'
        assert all(s.financial_status == 'Paid' for s in db.query(SessionLog).filter_by(enrollment_id=line.enrollment_id))
    url = f"/api/billing/autopay/runs/{run['id']}/results/{review['id']}/confirm"
    assert client.post(url, json=body).json() == recorded
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 1
    current = client.get(f"/api/billing/autopay/runs/{run['id']}").json()
    assert current['status'] == 'processed' and current['latest_import']['recorded_count'] == 1
    translated = uploaded(client, current, report_for(run, language='zh'))
    assert translated['id'] == review['id'] and translated['recorded_count'] == 1
    assert db.query(BankRunImport).count() == 1 and db.query(BankResultIdentity).count() == 1


@pytest.mark.parametrize('change', ['cancelled', 'changed', 'paid_elsewhere'])
def test_changed_or_other_paid_source_is_held(env, monkeypatch, change):
    client, db, _, payment = env
    run, _ = prepared(client)
    run, _ = submitted(client, run)
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    review = uploaded(client, run, report_for(run))
    if change == 'cancelled': payment.status = 'Cancelled'
    if change == 'changed': payment.version += 1
    if change == 'paid_elsewhere': payment.status, payment.received_method = 'Paid', 'cash'
    db.commit()
    response, _ = confirm(client, review)
    assert response.status_code == 409
    fresh = client.get(f"/api/billing/autopay/runs/{run['id']}/results/{review['id']}").json()
    assert not fresh['can_confirm'] and fresh['rows'][0]['record_status'] == 'review'
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0


def test_rejected_result_keeps_claimed_debt_without_automatic_actions(env, monkeypatch):
    client, db, _, payment = env
    run, _ = prepared(client)
    run, _ = submitted(client, run)
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    row = run['export_preview']['rows'][0]
    review = uploaded(client, run, report_for(run, outcomes={row['contract_no']: ('Rejected', 'AT0311')}))
    assert not review['can_confirm'] and review['rows'][0]['record_status'] == 'unpaid'
    assert review['rows'][0]['reject_code'] == 'AT0311'
    assert db.get(BillingPayment, payment.id).status == 'Pending Payment'
    assert db.query(BankRunClaim).count() == 1 and db.query(BillingPreference).one().mandate_ready
    assert client.get(f"/api/billing/autopay/runs/{run['id']}").json()['status'] == 'needs_attention'


@pytest.mark.parametrize('change', ['future', 'wrong_month', 'wrong_window', 'wrong_batch', 'wrong_total'])
def test_global_report_conflicts_block_all_financial_changes(env, monkeypatch, change):
    client, db, _, payment = env
    run, _ = prepared(client)
    run, _ = submitted(client, run, batch='000004321')
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    args = {}
    if change == 'future': args['date'] = '2026/11/24'
    if change == 'wrong_month': args['date'] = '2026/12/21'
    if change == 'wrong_window': args['date'] = '2026/11/19'
    if change == 'wrong_batch': args['batch'] = '000099999'
    if change == 'wrong_total': args['total'] = '1.00'
    review = uploaded(client, run, report_for(run, **args))
    assert review['issues'] and not review['can_confirm']
    assert db.get(BillingPayment, payment.id).status == 'Pending Payment'
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0


@pytest.mark.parametrize('field', ['total_amount', 'contract_no', 'workbook'])
def test_saved_metadata_and_workbook_integrity_are_bound(env, field):
    client, db, _, _ = env
    run, _ = prepared(client)
    stored = db.get(BankRun, run['id'])
    if field == 'workbook': stored.workbook = b'not the saved workbook'
    else:
        snapshot = deepcopy(stored.export_snapshot)
        if field == 'total_amount': snapshot['total_amount'] = '1.00'
        else: snapshot['rows'][0]['contract_no'] = 'MSA0999'
        stored.export_snapshot = snapshot
    db.commit()
    detail = client.get(f"/api/billing/autopay/runs/{run['id']}").json()
    assert not detail['can_download'] and not detail['can_submit']
    assert client.get(f"/api/billing/autopay/runs/{run['id']}/file").status_code == 409


def test_storage_gates_never_query_190_when_off_and_reads_survive_write_disable(env, monkeypatch):
    client, db, _, _ = env
    run, _ = prepared(client)
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    assert client.get('/api/billing/autopay/runs').json()['storage_available']
    detail = client.get(f"/api/billing/autopay/runs/{run['id']}").json()
    assert not detail['can_submit'] and detail['can_download']
    assert client.get(f"/api/billing/autopay/runs/{run['id']}/file").status_code == 200
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_STORAGE_ENABLED', 'false')
    def no_new_schema(_conn, _cursor, sql, *_args):
        assert 'billing_bank_' not in sql.lower(), sql
    event.listen(db.bind, 'before_cursor_execute', no_new_schema)
    try:
        assert client.get('/api/billing/autopay/runs').json() == {'storage_available': False, 'writes_available': False, 'runs': []}
        assert client.get(f"/api/billing/autopay/runs/{run['id']}").status_code == 503
        assert client.get(f"/api/billing/autopay/runs/{run['id']}/file").status_code == 503
        assert preview(client)['can_download']
    finally:
        event.remove(db.bind, 'before_cursor_execute', no_new_schema)


@pytest.mark.parametrize('role,header', [('Tutor', None), ('Supervisor', None), ('Guest', None),
    ('Super Admin', 'Tutor'), ('Super Admin', 'Supervisor')])
def test_effective_role_restricts_run_reads_and_writes(env, role, header):
    client, _, user, _ = env
    run, _ = prepared(client)
    user.role = role
    headers = {'X-Effective-Role': header} if header else {}
    for path in ['/api/billing/autopay/runs', f"/api/billing/autopay/runs/{run['id']}", f"/api/billing/autopay/runs/{run['id']}/file"]:
        assert client.get(path, headers=headers).status_code == 403
    assert client.post('/api/billing/autopay/runs', headers=headers, json={
        'collection_month': '2026-11', 'branch': 'MSA', 'expected_content_hash': 'a' * 64,
        'idempotency_key': 'forbidden'}).status_code == 403
