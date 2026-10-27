"""Saved-bank follow-up is a read-only presentation of synthetic SQLite facts."""
from copy import deepcopy
from datetime import date

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.autopay import build_autopay_run
from billing.autopay_view import apply_bank_run_follow_up
from billing.bank_run_models import BankRun, BankRunImport
from billing.models import BillingOperation, BillingPreference
from models import SessionLog, Student
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env
from tests.test_billing_autopay import env as autopay_env, clone_payment_for_student, run
from tests.test_billing_bank_export import env as export_env, preview
from tests.test_billing_bank_runs import env as run_env, prepared, submitted, uploaded, report_for, confirm


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Follow-up tests refuse external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def raw(db):
    from routers.billing import POLICY, holiday_dates
    return build_autopay_run(db, as_of=date(2026, 11, 17), month=date(2026, 11, 1),
                            holidays=holiday_dates(db), policy=POLICY)


def collected(run_env, monkeypatch):
    client, db, _, payment = run_env
    saved, _ = prepared(client)
    saved, _ = submitted(client, saved)
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    monkeypatch.setattr('routers.billing_autopay.today', lambda: date(2026, 11, 23))
    reviewed = uploaded(client, saved, report_for(saved))
    return client, db, payment, saved, reviewed


def test_overlay_never_mutates_raw_rows_or_prepared_financial_validation(run_env):
    client, db, _, _payment = run_env
    original = raw(db)
    old_dump = [r.model_dump(mode='json') for r in original]
    assert all('bank_run' not in value for value in old_dump)
    export_before = preview(client)
    run(client)
    assert preview(client) == export_before
    saved, _ = prepared(client)
    overlay = apply_bank_run_follow_up(db, original, as_of=date(2026, 11, 17))
    assert [r.model_dump(mode='json') for r in original] == old_dump
    assert overlay[0] is not original[0] and overlay[0].bank_run.follow_up == 'prepared'
    assert overlay[0].stage == original[0].stage == 'ready'
    assert overlay[0].model_dump(mode='json', exclude={'bank_run'}) == old_dump[0]
    file_before = client.get(f"/api/billing/autopay/runs/{saved['id']}/file")
    run(client)
    file_after = client.get(f"/api/billing/autopay/runs/{saved['id']}/file")
    assert file_before.content == file_after.content
    submitted(client, saved)  # Public presentation has not invalidated raw submission checks.


def test_submitted_follow_up_preserves_changed_preference_and_source_problems(run_env):
    client, db, _, _payment = run_env
    saved, _ = prepared(client)
    submitted(client, saved)
    preference = db.query(BillingPreference).one()
    preference.payment_method, preference.mandate_ready = 'manual', False
    db.commit()
    result = run(client)
    row, = result['rows']
    assert row['stage'] == 'attention' and result['counts']['ready'] == result['ready_total'] == 0
    assert row['bank_run']['follow_up'] == 'awaiting_results'
    assert {'PREFERENCE_CHANGED', 'MANDATE_NOT_READY'} <= {r['code'] for r in row['reasons']}
    assert 'READY' not in {r['code'] for r in row['reasons']}


@pytest.mark.parametrize('change', ['version', 'school_id', 'profile_branch'])
def test_stale_prepared_file_is_attention_without_changing_raw_readiness(run_env, change):
    client, db, _, payment = run_env
    saved, _ = prepared(client)
    if change == 'version':
        payment.version += 1  # Resending the message also advances the saved version.
    elif change == 'school_id':
        db.get(Student, 101).school_student_id = '9999'
    else:
        db.get(Student, 101).home_location = 'MSB'
    db.commit()
    assert raw(db)[0].stage == 'ready'
    row, = run(client)['rows']
    assert row['stage'] == 'attention' and row['bank_run']['follow_up'] == 'review'
    assert row['bank_run']['id'] == saved['id']
    detail = client.get(f"/api/billing/autopay/runs/{saved['id']}").json()
    assert not detail['can_submit']


@pytest.mark.parametrize('corruption', ['missing_operation', 'operation_account', 'applied_key',
                                      'applied_date', 'applied_amount', 'applied_version'])
def test_recorded_follow_up_requires_exact_applied_operation_proof(run_env, monkeypatch, corruption):
    client, db, payment, saved, reviewed = collected(run_env, monkeypatch)
    response, _ = confirm(client, reviewed)
    assert response.status_code == 200, response.text
    assert run(client)['rows'][0]['bank_run']['follow_up'] == 'recorded'
    imported = db.get(BankRunImport, reviewed['id'])
    operation = db.query(BillingOperation).filter_by(kind='paid').one()
    if corruption == 'missing_operation':
        db.delete(operation)
    elif corruption == 'operation_account':
        operation.account_id += 1000
    else:
        applications = deepcopy(imported.applied)
        field, value = {'applied_key': ('operation_key', 'wrong-key'),
                        'applied_date': ('payment_date', '2026-11-20'),
                        'applied_amount': ('amount', '1.00'),
                        'applied_version': ('version', 0)}[corruption]
        applications[payment.id][field] = value
        imported.applied = applications
    db.commit()
    row, = run(client)['rows']
    assert row['stage'] == 'attention' and row['bank_run']['follow_up'] == 'review'
    assert 'duplicate' in row['bank_run']['reason']


def test_source_integrity_after_recorded_payment_still_requires_attention(run_env, monkeypatch):
    client, db, _payment, _saved, reviewed = collected(run_env, monkeypatch)
    assert confirm(client, reviewed)[0].status_code == 200
    # A later teaching-source edit is not repaired or hidden by bank evidence.
    target = db.query(SessionLog).filter(SessionLog.financial_status == 'Paid', SessionLog.enrollment_id != 11).first()
    target.time_slot = '09:00 - 10:30'
    db.commit()
    row, = run(client)['rows']
    assert row['stage'] == 'attention' and row['bank_run']['follow_up'] == 'review'
    assert 'PAYMENT_INTEGRITY' in {r['code'] for r in row['reasons']}


@pytest.mark.parametrize('corruption', ['export', 'report', 'identity', 'row_outcome'])
def test_invalid_frozen_or_report_evidence_fails_closed_without_echoing_source_text(run_env, monkeypatch, corruption):
    client, db, _payment, saved, reviewed = collected(run_env, monkeypatch)
    stored = db.get(BankRun, saved['id'])
    imported = db.get(BankRunImport, reviewed['id'])
    if corruption == 'export':
        value = deepcopy(stored.export_snapshot)
        value['rows'][0]['contract_no'] = 'OTHERPRIVATECONTRACT'
        stored.export_snapshot = value
    elif corruption == 'identity':
        from billing.bank_run_models import BankResultIdentity
        db.query(BankResultIdentity).one().report_hash = 'wrong-report'
    else:
        value = deepcopy(imported.report)
        if corruption == 'report':
            value['issues'] = [{'code': 'UNKNOWN', 'message': 'OTHERPRIVATECONTRACT needs review'}]
        else:
            value['rows'][0]['outcome'] = 'rejected'
        imported.report = value
    db.commit()
    response = run(client)
    row, = response['rows']
    assert row['stage'] == 'attention' and response['ready_total'] == 0
    assert row.get('bank_run', {}).get('follow_up') in {None, 'review'}
    assert 'OTHERPRIVATECONTRACT' not in str(response)


def test_imported_overlay_queries_are_bounded_and_do_not_fetch_workbooks_or_write(run_env, monkeypatch):
    client, db, payment, _saved, _reviewed = collected(run_env, monkeypatch)

    def measured():
        source = raw(db)
        statements = []
        def select_only(_conn, _cursor, sql, *_args):
            assert sql.lstrip().upper().startswith('SELECT'), sql
            statements.append(sql)
            assert 'billing_bank_runs.workbook' not in sql.lower()
        event.listen(db.bind, 'before_cursor_execute', select_only)
        try:
            output = apply_bank_run_follow_up(db, source, as_of=date(2026, 11, 23))
        finally:
            event.remove(db.bind, 'before_cursor_execute', select_only)
        return output, statements

    one, one_reads = measured()
    for sid in range(201, 209):
        clone_payment_for_student(db, payment, sid)
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 17))
    monkeypatch.setattr('routers.billing_autopay.today', lambda: date(2026, 11, 17))
    other_run, _ = prepared(client, key='more-synthetic-payments')
    other_run, _ = submitted(client, other_run, key='more-submitted')
    monkeypatch.setattr('routers.billing_bank_runs.today', lambda: date(2026, 11, 23))
    monkeypatch.setattr('routers.billing_autopay.today', lambda: date(2026, 11, 23))
    uploaded(client, other_run, report_for(other_run, batch='000004322'))
    many, many_reads = measured()
    assert len(one) == 1 and len(many) == 9
    assert len(one_reads) == len(many_reads) == 5
    # Each run snapshot is selected once, rather than once per claimed student.
    run_reads = [sql for sql in many_reads if 'billing_bank_runs.export_snapshot' in sql]
    assert len(run_reads) == 1 and 'JOIN billing_bank_run_claims' not in run_reads[0]
    assert all(row.bank_run.follow_up == 'record_payment' for row in many)
    assert not db.new and not db.dirty


def test_public_follow_up_has_no_writes_even_with_recorded_audit_lookup(run_env, monkeypatch):
    client, db, _payment, _saved, reviewed = collected(run_env, monkeypatch)
    assert confirm(client, reviewed)[0].status_code == 200
    def select_only(_conn, _cursor, sql, *_args):
        assert sql.lstrip().upper().startswith('SELECT'), sql
    event.listen(db.bind, 'before_cursor_execute', select_only)
    try:
        row, = run(client)['rows']
    finally:
        event.remove(db.bind, 'before_cursor_execute', select_only)
    assert row['stage'] == 'skipped' and row['bank_run']['follow_up'] == 'recorded'
    assert not db.new and not db.dirty
