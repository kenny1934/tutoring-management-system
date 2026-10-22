"""Present saved bank follow-up without changing financial collection readiness.

The public list calls this after its normal authorisation and source filtering.
Exports and prepared-file validation deliberately use the raw builder instead.
All lookups are batched and restricted to payment IDs already in that scoped list.
"""
from datetime import date
from decimal import Decimal, DecimalException

from .autopay import BAD_EVIDENCE, _shape, reason
from .autopay_schemas import AutopayBankRun
from .bank_export import bank_amount
from .bank_export_schemas import BankExportPreview
from .bank_results import REJECTIONS, _issues as report_issues, _row as normalise_result_row
from .bank_run_models import BankResultIdentity, BankRun, BankRunClaim, BankRunImport
from .bank_runs import _paid_key, storage_enabled
from .calculator import BillingPolicy
from .drafts import digest
from .models import BillingAccount, BillingOperation, BillingPayment
from .schemas import BillingDraftReview

INVALID = BAD_EVIDENCE + (DecimalException,)


def _saved_export(run):
    """Validate JSON evidence without fetching the immutable workbook blob."""
    try:
        frozen = BankExportPreview.model_validate(run.export_snapshot)
        if (digest({'export': run.export_snapshot, 'payments': run.payment_evidence}) != run.export_sha256
                or frozen.content_hash != run.content_hash or not frozen.can_download
                or frozen.branch != run.branch or frozen.collection_month != run.collection_month
                or frozen.payment_count != len(frozen.rows)
                or len({r.payment_id for r in frozen.rows}) != len(frozen.rows)
                or len({r.contract_no for r in frozen.rows}) != len(frozen.rows)
                or format(sum((bank_amount(r.amount) for r in frozen.rows), Decimal('0')), '.2f') != frozen.total_amount):
            return None
        return frozen
    except INVALID:
        return None


def _matched_report(run, imported, frozen, identity, as_of):
    """Prove the report belongs to the exact saved financial set, once per run."""
    try:
        report = imported.report
        debit_date = date.fromisoformat(report['debit_date'])
        if (report.get('issues') or report_issues(report) or debit_date > as_of
                or debit_date.strftime('%Y-%m') != run.collection_month
                or report['currency'] != 'MOP'
                or (run.bank_batch_no and report['bank_batch_no'] != run.bank_batch_no)
                or report['bank_identity_hash'] != imported.bank_identity_hash
                or report['report_hash'] != imported.report_hash
                or not identity or identity.run_id != run.id or identity.import_id != imported.id
                or identity.report_hash != imported.report_hash
                or report['payment_count'] != frozen.payment_count
                or report['total_amount'] != frozen.total_amount):
            return None
        saved = {r.contract_no: r for r in frozen.rows}
        actual = {}
        for raw in report['rows']:
            contract = raw['contract_no']
            if contract in actual or contract not in saved or raw['amount'] != saved[contract].amount:
                return None
            # Never trust a changed outcome label over the bank's actual status/code.
            normalised = normalise_result_row(contract, raw['amount'], raw['raw_status'], raw['reject_code'])
            if raw['outcome'] != normalised['outcome']:
                return None
            actual[contract] = normalised
        if set(actual) != set(saved):
            return None
        for row in frozen.rows:
            collection = run.payment_evidence[row.payment_id]['collection']
            if not date.fromisoformat(collection['debit_from']) <= debit_date <= date.fromisoformat(collection['debit_to']):
                return None
        return debit_date, actual
    except INVALID:
        return None


def _current_matches(raw, payment, owner, saved, run, policy):
    """The raw list already checked teaching integrity in one shared batch."""
    try:
        review = BillingDraftReview.model_validate(payment.snapshot['review'])
        return (owner == raw.student.id == saved.student.id
                and raw.payment_version == payment.version and raw.payment_status == payment.status
                and not any(r.code == 'PAYMENT_INTEGRITY' for r in raw.reasons)
                and _shape(review, raw.student.id, policy)
                and review.period.collection.method == 'autopay'
                and digest(payment.snapshot) == run.payment_evidence[payment.id]['snapshot_hash']
                and format(bank_amount(raw.total_fee), '.2f') == saved.amount
                and format(bank_amount(review.period.total_fee), '.2f') == saved.amount)
    except INVALID:
        return False


def _recorded(payment, imported, saved, debit_date, operation):
    """Paid alone is insufficient: require this import's applied audit evidence."""
    try:
        applied = imported.applied[payment.id]
        key = _paid_key(imported.id, payment.id)
        return (operation is not None and operation.account_id == payment.account_id
                and applied['operation_key'] == key and operation.idempotency_key == key
                and applied['payment_date'] == debit_date.isoformat() and applied['amount'] == saved.amount
                and isinstance(applied['version'], int) and saved.payment_version < applied['version'] <= payment.version
                and payment.status == 'Paid' and payment.received_method == 'autopay'
                and payment.payment_date == debit_date and bank_amount(payment.received_amount) == bank_amount(saved.amount))
    except INVALID:
        return False


def _annotate(row, run, follow_up, label, *, attention=False, import_id=None):
    row.bank_run = AutopayBankRun(id=run.id, branch=run.branch, collection_month=run.collection_month,
        follow_up=follow_up, import_id=import_id, reason=label)
    if attention:
        row.stage = 'attention'
        # Keep existing source problems, including payment/participation changes.
        row.reasons = [reason('BANK_' + follow_up.upper(), label)] + [r for r in row.reasons if r.code != 'READY']


def apply_bank_run_follow_up(db, rows, *, as_of, policy=BillingPolicy()):
    """Return a separate operational view; never mutate raw financial rows.

    Summary counts and totals are calculated by the caller after this overlay.
    An uploaded Pending Payment is follow-up work, so it no longer contributes
    to the public Ready total. A prepared file retains the original raw stage.
    """
    payment_ids = {r.payment_id for r in rows if r.origin == 'payment' and r.payment_id}
    if not storage_enabled() or not payment_ids:
        return rows
    claims = dict(db.query(BankRunClaim.payment_id, BankRunClaim.run_id).filter(
        BankRunClaim.payment_id.in_(payment_ids)).all())
    if not claims:
        return rows
    # Fetch each run once. Joining JSON evidence to every claim would repeat a
    # whole run's financial set for every student. Never load workbook blobs.
    runs = db.query(BankRun.id, BankRun.status, BankRun.branch,
        BankRun.collection_month, BankRun.content_hash, BankRun.export_snapshot, BankRun.payment_evidence,
        BankRun.export_sha256, BankRun.submitted_at, BankRun.bank_batch_no, BankRun.latest_import_id).filter(
            BankRun.id.in_(set(claims.values()))).all()
    by_run = {r.id: r for r in runs if r.status != 'discarded'}
    by_payment = {pid: by_run[rid] for pid, rid in claims.items() if rid in by_run}
    if not by_payment:
        return rows
    import_ids = {r.latest_import_id for r in by_run.values() if r.latest_import_id}
    imports = {r.id: r for r in db.query(BankRunImport).filter(BankRunImport.id.in_(import_ids)).all()} if import_ids else {}
    identity_hashes = {r.bank_identity_hash for r in imports.values()}
    identities = {r.bank_identity_hash: r for r in db.query(BankResultIdentity).filter(
        BankResultIdentity.bank_identity_hash.in_(identity_hashes)).all()} if identity_hashes else {}
    payments = {p.id: (p, sid) for p, sid in db.query(BillingPayment, BillingAccount.student_id).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(BillingPayment.id.in_(by_payment)).all()}
    keys = {_paid_key(imported.id, pid) for pid, run in by_payment.items()
            if (imported := imports.get(run.latest_import_id)) is not None
            and isinstance(imported.applied, dict) and imported.applied.get(pid)}
    operations = {(op.payment_id, op.idempotency_key): op for op in db.query(BillingOperation).filter(
        BillingOperation.payment_id.in_(by_payment), BillingOperation.kind == 'paid',
        BillingOperation.idempotency_key.in_(keys)).all()} if keys else {}
    evidence = {}
    for run in by_run.values():
        frozen = _saved_export(run)
        imported = imports.get(run.latest_import_id)
        report = (_matched_report(run, imported, frozen, identities.get(imported.bank_identity_hash), as_of)
                  if frozen and imported and imported.run_id == run.id else None)
        evidence[run.id] = ({r.payment_id: r for r in frozen.rows} if frozen else {}, imported, report)
    result = []
    for raw in rows:
        run = by_payment.get(raw.payment_id)
        if run is None:
            result.append(raw)
            continue
        row = raw.model_copy(deep=True)
        result.append(row)
        saved_rows, imported, matched = evidence[run.id]
        saved = saved_rows.get(row.payment_id)
        if not saved or saved.student.id != row.student.id or run.branch not in {'MSA', 'MSB'}:
            # An invalid cross-owner claim is not authority to expose that run.
            row.stage = 'attention'
            row.reasons = [reason('BANK_RUN_REVIEW', 'Review the saved bank file')] + [r for r in row.reasons if r.code != 'READY']
            continue
        if run.status == 'prepared' and not run.submitted_at and not run.latest_import_id:
            current = payments.get(row.payment_id)
            if (not current or not _current_matches(raw, current[0], current[1], saved, run, policy)
                    or current[0].status != 'Pending Payment' or current[0].version != saved.payment_version
                    or raw.student.home_location != saved.student.home_location
                    or raw.student.school_student_id != saved.student.school_student_id):
                _annotate(row, run, 'review', 'Review the changed bank file', attention=True)
            else:
                _annotate(row, run, 'prepared', 'Saved bank file')
            continue
        if not run.submitted_at or run.status not in {'submitted', 'processed', 'needs_attention'}:
            _annotate(row, run, 'review', 'Review the saved bank file', attention=True)
            continue
        if not run.latest_import_id:
            _annotate(row, run, 'awaiting_results', 'Awaiting bank results', attention=True)
            continue
        import_id = imported.id if imported and imported.run_id == run.id else None
        if not matched:
            _annotate(row, run, 'review', 'Review bank results', attention=True, import_id=import_id)
            continue
        debit_date, bank_rows = matched
        bank_row = bank_rows[saved.contract_no]
        outcome = bank_row['outcome']
        current = payments.get(row.payment_id)
        if not current or not _current_matches(raw, current[0], current[1], saved, run, policy):
            _annotate(row, run, 'review', 'Review the changed payment', attention=True, import_id=import_id)
            continue
        payment = current[0]
        if outcome == 'collected' and _recorded(payment, imported, saved, debit_date,
                operations.get((payment.id, _paid_key(imported.id, payment.id)))):
            _annotate(row, run, 'recorded', 'Payment recorded', import_id=import_id)
        elif payment.status == 'Paid' and outcome == 'rejected':
            # Rejection is historical once an independent payment settled debt.
            # It is not evidence that this bank import recorded the payment.
            _annotate(row, run, 'rejected', 'Payment already received', import_id=import_id)
        elif payment.status == 'Paid':
            _annotate(row, run, 'review', 'Check possible duplicate collection', attention=True, import_id=import_id)
        elif payment.status != 'Pending Payment' or payment.version != saved.payment_version:
            _annotate(row, run, 'review', 'Review the changed payment', attention=True, import_id=import_id)
        elif outcome == 'collected':
            _annotate(row, run, 'record_payment', 'Record collected payment', attention=True, import_id=import_id)
        elif outcome == 'rejected':
            _annotate(row, run, 'rejected', REJECTIONS.get(bank_row['reject_code'], 'Review bank results'),
                      attention=True, import_id=import_id)
        else:
            _annotate(row, run, 'review', 'Review bank results', attention=True, import_id=import_id)
    return result
