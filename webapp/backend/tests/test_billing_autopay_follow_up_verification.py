"""Independent public-list follow-up acceptance with invented SQLite records.

Bank-file readiness and claims remain financial facts. This verifies the separate
operational view without changing, submitting or collecting any real payment.
"""
from datetime import date
import json

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.autopay import build_autopay_run
from billing.bank_run_models import BankResultIdentity, BankRunClaim
from billing.models import BillingOperation, BillingPayment, BillingPreference
from tests.test_billing_autopay_export_verification import bank_records, draft_env, workflow_env, records, preview
from tests.test_billing_autopay_verification import add_source, move_source, payment, record_paid, run, payment_row
from tests.test_billing_bank_run_verification import (
    run_env as bank_run_env, prepare, uploaded, native_rows, source, import_result, confirmation,
)


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Follow-up verification refuses external database connections.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def run_env(bank_run_env, monkeypatch):
    from routers import billing_autopay
    monkeypatch.setattr(billing_autopay, 'today', lambda: bank_run_env[3][0])
    return bank_run_env


def raw(db, as_of=date(2026, 11, 17)):
    from routers.billing import POLICY, holiday_dates
    return build_autopay_run(db, as_of=as_of, month=date(2026, 11, 1),
                            holidays=holiday_dates(db), policy=POLICY)


def annotated(client, value, saved, expected):
    result = run(client)
    row = payment_row(result, value['id'])
    assert row['bank_run']['id'] == saved['id']
    assert row['bank_run']['follow_up'] == expected
    return result, row


def test_prepared_claim_preserves_raw_ready_and_cannot_create_a_second_export(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    before = run(client)
    saved, _ = prepare(client)
    after, row = annotated(client, value, saved, 'prepared')
    assert row['stage'] == 'ready'
    assert after['counts'] == before['counts'] and after['ready_total'] == before['ready_total']
    assert next(row for row in raw(db) if row.payment_id == value['id']).stage == 'ready'
    assert db.get(BankRunClaim, value['id']).run_id == saved['id']
    assert preview(client)['excluded_claimed_count'] == 1 and not preview(client)['can_download']
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0


def test_public_read_does_not_change_reviewed_export_identity_or_saved_workbook(run_env):
    client, _db, _actor, _clock = run_env
    payment(client)
    before = preview(client)
    run(client)
    after = preview(client)
    assert after == before
    saved, _ = prepare(client)
    file_before = client.get(f"/api/billing/autopay/runs/{saved['id']}/file")
    annotated(client, {'id': saved['export_preview']['rows'][0]['payment_id']}, saved, 'prepared')
    file_after = client.get(f"/api/billing/autopay/runs/{saved['id']}/file")
    assert file_before.content == file_after.content
    assert file_before.headers['x-csm-export-hash'] == file_after.headers['x-csm-export-hash'] == saved['content_hash']
    submitted, _ = uploaded(client, saved)
    assert submitted['status'] == 'submitted'


def test_optional_presentation_metadata_does_not_change_the_prior_export_hash_shape(run_env):
    from billing.bank_export import FORMAT_VERSION, _payment_state
    from billing.drafts import digest
    client, db, _actor, _clock = run_env
    value = payment(client)
    reviewed = preview(client)
    ready = [row for row in raw(db) if row.stage == 'ready']
    # This is the pre-overlay hash shape of one exact native payment. New
    # presentation-only fields, including nulls, must not stale saved files.
    payload = {'format': FORMAT_VERSION, 'collection_month': '2026-11', 'branch': 'MSA',
        'rows': reviewed['rows'], 'total_amount': reviewed['total_amount'],
        'readiness': [row.model_dump(mode='json', exclude={'bank_run'}) for row in ready],
        'payment_state': _payment_state(db, [value['id']]), 'issues': reviewed['issues'], 'claimed_payments': {}}
    assert reviewed['content_hash'] == digest(payload)


def test_saved_file_does_not_promote_later_invalid_readiness(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    db.query(BillingPreference).one().mandate_ready = False
    db.commit()
    result, row = annotated(client, value, saved, 'prepared')
    assert row['stage'] == 'attention' and result['ready_total'] == result['counts']['ready'] == 0
    assert any(reason['code'] != 'BANK_RUN_PREPARED' for reason in row['reasons'])


def test_submission_changes_only_public_follow_up_not_raw_financial_readiness(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    result, row = annotated(client, value, saved, 'awaiting_results')
    assert row['stage'] == 'attention' and result['counts']['ready'] == result['ready_total'] == 0
    assert result['counts']['attention'] == 1
    assert next(row for row in raw(db) if row.payment_id == value['id']).stage == 'ready'
    assert db.get(BankRunClaim, value['id']).run_id == saved['id']
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'


@pytest.mark.parametrize('outcome,expected', [
    ('collected', 'record_payment'), ('rejected', 'rejected'), ('unknown', 'review'),
])
def test_results_require_follow_up_before_financial_recording(run_env, outcome, expected):
    client, db, _actor, clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    clock[0] = date(2026, 11, 22)
    statuses = {'collected': ('Successed', ''), 'rejected': ('Rejected', 'AT0311'), 'unknown': ('?', '')}
    rows = native_rows(saved, status=statuses[outcome][0], code=statuses[outcome][1])
    reviewed = import_result(client, saved, source(saved, rows=rows))
    result, row = annotated(client, value, saved, expected)
    assert row['stage'] == 'attention' and result['ready_total'] == 0
    assert row['bank_run']['import_id'] == reviewed['id']
    assert db.get(BillingPayment, value['id']).status == 'Pending Payment'
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0


@pytest.mark.parametrize('outcome', ['collected', 'unknown', 'rejected'])
def test_paid_elsewhere_retains_possible_duplicate_collection_but_settles_rejected_debt(run_env, outcome):
    client, db, _actor, clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    record_paid(client, value)
    clock[0] = date(2026, 11, 22)
    status, code = {'collected': ('Successed', ''), 'unknown': ('?', ''), 'rejected': ('Rejected', 'AT0311')}[outcome]
    import_result(client, saved, source(saved, rows=native_rows(saved, status=status, code=code)))
    result = run(client)
    row = payment_row(result, value['id'])
    assert row['stage'] == ('skipped' if outcome == 'rejected' else 'attention')
    assert result['ready_total'] == 0
    if outcome != 'rejected':
        assert row['bank_run']['follow_up'] == 'review'


def test_exact_recorded_result_is_skipped_without_a_second_financial_effect(run_env):
    client, db, _actor, clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, saved)
    response, _ = confirmation(client, saved, reviewed)
    assert response.status_code == 200, response.text
    result, row = annotated(client, value, saved, 'recorded')
    assert row['stage'] == 'skipped' and result['ready_total'] == 0
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 1


@pytest.mark.parametrize('changed', ['cancelled', 'version'])
def test_previously_reviewed_collected_result_rechecks_changed_payment_state(run_env, changed):
    client, db, _actor, clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    clock[0] = date(2026, 11, 22)
    import_result(client, saved)
    stored = db.get(BillingPayment, value['id'])
    if changed == 'cancelled':
        response = client.post(f"/api/billing/payments/{value['id']}/cancel", json={
            'expected_version': value['version'], 'idempotency_key': 'follow-up-cancel', 'reason': 'Synthetic cancellation.'})
        assert response.status_code == 200, response.text
    else:
        stored.version += 1
        db.commit()
    result, row = annotated(client, value, saved, 'review')
    assert row['stage'] == 'attention' and result['ready_total'] == 0
    assert db.query(BillingOperation).filter_by(kind='paid').count() == 0


@pytest.mark.parametrize('recorded', [False, True])
def test_missing_global_bank_identity_withholds_collected_or_recorded_claim(run_env, recorded):
    client, db, _actor, clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    clock[0] = date(2026, 11, 22)
    reviewed = import_result(client, saved)
    if recorded:
        response, _ = confirmation(client, saved, reviewed)
        assert response.status_code == 200, response.text
    db.delete(db.query(BankResultIdentity).one())
    db.commit()
    result, row = annotated(client, value, saved, 'review')
    assert row['stage'] == 'attention' and result['ready_total'] == 0
    assert db.query(BillingOperation).filter_by(kind='paid').count() == int(recorded)


def test_discarded_run_no_longer_annotates_the_current_payment(run_env):
    client, db, _actor, _clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    response = client.post(f"/api/billing/autopay/runs/{saved['id']}/discard", json={
        'expected_version': saved['version'], 'idempotency_key': 'follow-up-discard', 'reason': 'Synthetic unsubmitted file.'})
    assert response.status_code == 200, response.text
    row = payment_row(run(client), value['id'])
    assert row['stage'] == 'ready' and row.get('bank_run') is None
    assert db.get(BankRunClaim, value['id']) is None


def test_later_collection_view_keeps_the_actual_earlier_saved_run_scope(run_env):
    client, db, _actor, _clock = run_env
    # This source ends4 December, so situation two prepays the December
    # remainder and January in the November collection.
    move_source(db, date(2026, 10, 30))
    value = payment(client)
    assert value['review']['period']['coverage_through'] >= '2027-01-01'
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    result = run(client, '2026-12')
    row = payment_row(result, value['id'])
    assert row['stage'] == 'attention'
    assert row['bank_run']['id'] == saved['id']
    assert row['bank_run']['collection_month'] == '2026-11'
    assert result['collection_month'] == '2026-12' and result['ready_total'] == 0


@pytest.mark.parametrize('workflow_storage,run_storage', [(True, False), (False, True)])
def test_feature_off_list_does_not_query_absent_190_or_188_tables(run_env, monkeypatch, workflow_storage, run_storage):
    client, db, _actor, _clock = run_env
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', str(workflow_storage).lower())
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'false')
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_STORAGE_ENABLED', str(run_storage).lower())
    def guard(_connection, _cursor, statement, *_args):
        sql = statement.lower()
        assert 'billing_bank_' not in sql
        if not workflow_storage:
            assert not any(name in sql for name in ['billing_payments', 'billing_preferences', 'billing_payment_lines', 'billing_operations', 'billing_lesson_claims'])
    event.listen(db.bind, 'before_cursor_execute', guard)
    try:
        result = run(client)
        assert all(row.get('bank_run') is None for row in result['rows'])
    finally:
        event.remove(db.bind, 'before_cursor_execute', guard)


def test_writes_disabled_preserves_read_only_follow_up(run_env, monkeypatch):
    client, _db, _actor, _clock = run_env
    value = payment(client)
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    monkeypatch.setenv('BILLING_AUTOPAY_RUN_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    result, row = annotated(client, value, saved, 'awaiting_results')
    assert row['stage'] == 'attention' and result['ready_total'] == 0


def test_counts_pagination_and_branch_scope_follow_the_public_partition(run_env):
    client, db, _actor, _clock = run_env
    first = payment(client)
    add_source(db, student_id=102, source_id=21, location='MSA', school_id='2101')
    second = payment(client, student_id=102, source_id=21, key='follow-up-second')
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    add_source(db, student_id=103, source_id=31, location='MSB', school_id='2102')
    third = payment(client, student_id=103, source_id=31, key='follow-up-unclaimed')
    result = run(client)
    assert result['counts']['ready'] == 1 and result['counts']['attention'] == 2
    assert result['ready_total'] == third['review']['period']['total_fee']
    assert sum(result['counts'].values()) == len(result['rows']) == 3
    attention = run(client, stage='attention', limit=1)
    next_page = run(client, stage='attention', offset=1, limit=1)
    assert attention['total'] == next_page['total'] == 2
    assert attention['counts'] == next_page['counts'] == result['counts']
    assert {attention['rows'][0]['payment_id'], next_page['rows'][0]['payment_id']} == {first['id'], second['id']}
    branch = run(client, location='MSB')
    assert branch['counts']['ready'] == 1 and branch['counts']['attention'] == 0
    assert branch['rows'][0]['payment_id'] == third['id'] and branch['rows'][0].get('bank_run') is None


def test_scoped_list_has_only_minimal_own_row_run_metadata(run_env):
    client, db, actor, _clock = run_env
    first = payment(client)
    add_source(db, student_id=102, source_id=21, tutor_id=2, location='MSA', school_id='2101')
    payment(client, student_id=102, source_id=21, key='follow-up-other-tutor')
    saved, _ = prepare(client)
    saved, _ = uploaded(client, saved)
    actor.role = 'Tutor'
    result = run(client)
    assert len(result['rows']) == 1 and result['rows'][0]['student']['id'] == 101
    metadata = payment_row(result, first['id'])['bank_run']
    assert set(metadata) <= {'id', 'version', 'status', 'branch', 'collection_month', 'follow_up', 'import_id', 'reason'}
    text = json.dumps(result)
    assert 'export_preview' not in text and 'report_hash' not in text
    assert '000004321' not in text and '000778899001122' not in text and 'MSA02101' not in text
    assert client.get('/api/billing/autopay', params={'collection_month': '2026-11', 'tutor_id': 2}).status_code == 403
    assert client.get(f"/api/billing/autopay/runs/{saved['id']}").status_code == 403
