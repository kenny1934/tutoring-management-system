"""Immutable bank-run history and explicit, atomic result reconciliation."""
from collections import Counter
from datetime import date
from decimal import Decimal
import hashlib
import os
from uuid import uuid4

from models import Student
from . import workflow
from .autopay import BAD_EVIDENCE, build_autopay_run
from .bank_export import bank_amount, preview_export, workbook_bytes
from .bank_export_schemas import BankExportIssue, BankExportPreview
from .bank_run_models import BankRun, BankRunClaim, BankRunImport, BankResultIdentity, BankRunOperation
from .bank_run_schemas import RunDetail, RunHistory, RunSummary, ResultReview, ResultRow
from .calculator import BillingPolicy
from .drafts import DraftConflict, DraftNotFound, digest, utc
from .models import BillingAccount, BillingOperation, BillingPayment, utc_now
from .schemas import BillingPaidRequest

POLICY = BillingPolicy()


def _flag(name):
    return os.getenv(name, '').strip().lower() in {'1', 'true', 'yes', 'on'}


def storage_enabled():
    return workflow.workflow_storage_enabled() and (_flag('BILLING_AUTOPAY_RUN_STORAGE_ENABLED') or _flag('BILLING_AUTOPAY_RUN_ENABLED'))


def writes_enabled():
    return storage_enabled() and workflow.workflow_enabled() and _flag('BILLING_AUTOPAY_RUN_ENABLED')


def claimed_payments(db, payment_ids):
    if not storage_enabled() or not payment_ids:
        return {}
    return dict(db.query(BankRunClaim.payment_id, BankRunClaim.run_id).filter(
        BankRunClaim.payment_id.in_(payment_ids)).all())


def _issue(code, message, student_id=None):
    return BankExportIssue(code=code, message=message, student_id=student_id)


def _actor(actor):
    return (actor.tutor_name or str(actor.id))[:100]


def _payload(kind, target, data, actor):
    return digest({'kind': kind, 'target': target, 'actor': actor.id, 'data': data.model_dump(mode='json')})


def _replay(db, actor, key, payload_hash, model):
    row = db.query(BankRunOperation).filter_by(actor_id=actor.id, idempotency_key=key).with_for_update().first()
    if row:
        if row.payload_hash != payload_hash:
            raise DraftConflict('This request key was used for another action. Refresh before continuing.')
        return model.model_validate(row.result)
    return None


def _audit(db, run, actor, kind, result, *, key=None, payload_hash=None):
    now = utc_now()
    if hasattr(result, 'history'):
        result.history.append(RunHistory(kind=kind, actor_name=_actor(actor), created_at=utc(now)))
    db.add(BankRunOperation(run_id=run.id, actor_id=actor.id, actor_name=_actor(actor),
        idempotency_key=key, payload_hash=payload_hash or digest({'kind': kind, 'run': run.id}),
        kind=kind, result=result.model_dump(mode='json') if hasattr(result, 'model_dump') else result, created_at=now))
    db.flush()


def find_run(db, run_id):
    if not storage_enabled():
        raise DraftConflict('Saved Autopay runs are not available yet.')
    run = db.query(BankRun).filter_by(id=str(run_id)).first()
    if run is None:
        raise DraftNotFound('Autopay run not found.')
    return run


def _preview(run):
    try:
        return BankExportPreview.model_validate(run.export_snapshot)
    except BAD_EVIDENCE:
        raise DraftConflict('The saved bank file details need review.') from None


def _lock_students(db, ids):
    ids = sorted(set(ids))
    if ids:
        db.query(Student.id).filter(Student.id.in_(ids)).order_by(Student.id).with_for_update().all()
        db.query(BillingAccount.id).filter(BillingAccount.student_id.in_(ids)).order_by(
            BillingAccount.student_id, BillingAccount.id).with_for_update().all()


def _lock_run(db, run_id):
    # Discover immutable ownership, then restart before taking the same student
    # and account locks used by teaching/payment operations. Never lock the run
    # before its students: a result confirmation also calls the payment service.
    initial = find_run(db, run_id)
    ids = [row.student.id for row in _preview(initial).rows]
    db.rollback()
    _lock_students(db, ids)
    run = db.query(BankRun).filter_by(id=str(run_id)).populate_existing().with_for_update().first()
    if run is None:
        raise DraftNotFound('Autopay run not found.')
    return run


def summary(run):
    preview = _preview(run)
    return RunSummary(id=run.id, version=run.version, status=run.status,
        collection_month=run.collection_month, branch=run.branch, filename=preview.filename,
        payment_count=preview.payment_count, total_amount=preview.total_amount, content_hash=run.content_hash,
        created_at=utc(run.created_at), created_by_name=run.created_by_name,
        submitted_at=utc(run.submitted_at) if run.submitted_at else None,
        submitted_by_name=run.submitted_by_name, bank_batch_no=run.bank_batch_no,
        discarded_at=utc(run.discarded_at) if run.discarded_at else None,
        discard_reason=run.discard_reason, latest_import_id=run.latest_import_id)


def _file_issues(run):
    preview = _preview(run)
    if (hashlib.sha256(run.workbook).hexdigest() != run.file_sha256
            or digest({'export': run.export_snapshot, 'payments': run.payment_evidence}) != run.export_sha256
            or preview.content_hash != run.content_hash or not preview.can_download
            or preview.branch != run.branch or preview.collection_month != run.collection_month
            or preview.payment_count != len(preview.rows)):
        return [_issue('SAVED_FILE_CHANGED', 'The saved bank file needs review.')]
    return []


def _prepared_issues(db, run, *, as_of, holidays, policy=POLICY):
    if run.status != 'prepared':
        return []
    ready = {r.payment_id: r for r in build_autopay_run(db, as_of=as_of,
        month=date.fromisoformat(run.collection_month + '-01'), holidays=holidays, policy=policy) if r.stage == 'ready'}
    issues = []
    frozen = _preview(run)
    payments = {p.id: p for p in db.query(BillingPayment).filter(
        BillingPayment.id.in_([r.payment_id for r in frozen.rows])).all()}
    owners = claimed_payments(db, list(payments))
    for row in frozen.rows:
        current = ready.get(row.payment_id)
        if (current is None or current.payment_version != row.payment_version
                or current.student.id != row.student.id or current.student.home_location != row.student.home_location
                or current.student.school_student_id != row.student.school_student_id
                or format(bank_amount(current.total_fee), '.2f') != row.amount
                or row.payment_id not in payments or owners.get(row.payment_id) != run.id
                or digest(payments[row.payment_id].snapshot) != run.payment_evidence.get(row.payment_id, {}).get('snapshot_hash')):
            issues.append(_issue('PAYMENT_CHANGED', 'Review this payment before recording bank upload.', row.student.id))
    return issues


def detail(db, run, *, as_of, holidays, policy=POLICY):
    issues = _file_issues(run) + _prepared_issues(db, run, as_of=as_of, holidays=holidays, policy=policy)
    latest = db.query(BankRunImport).filter_by(id=run.latest_import_id, run_id=run.id).first() if run.latest_import_id else None
    history = [RunHistory(kind=row.kind, actor_name=row.actor_name, created_at=utc(row.created_at))
               for row in db.query(BankRunOperation).filter_by(run_id=run.id).order_by(BankRunOperation.id).all()]
    return RunDetail(**summary(run).model_dump(), export_preview=_preview(run), issues=issues,
        can_submit=writes_enabled() and run.status == 'prepared' and not issues,
        can_discard=writes_enabled() and run.status == 'prepared' and not run.submitted_at,
        can_download=not _file_issues(run), can_import_results=writes_enabled() and bool(run.submitted_at) and run.status != 'discarded',
        latest_import=review_result(db, run, latest, as_of=as_of, policy=policy) if latest else None, history=history)


def create_run(db, data, actor, *, as_of, holidays, policy=POLICY):
    if not writes_enabled():
        raise DraftConflict('Saving Autopay runs is not enabled yet.')
    payload_hash = _payload('prepared', None, data, actor)
    # Callers may have read the holiday calendar while preparing arguments.
    # Begin the financial snapshot only after the ownership locks below.
    db.rollback()
    # Use locking discovery reads before the first consistent financial read.
    # Lock profile-branch students directly. A nonlocking account subquery in
    # this SELECT would establish an older MySQL snapshot before waiting for
    # a student lock. Unknown branches can block either complete preview.
    from sqlalchemy import or_
    ids = [sid for sid, in db.query(Student.id).filter(
        or_(Student.home_location == data.branch, Student.home_location.is_(None),
            Student.home_location.notin_(['MSA', 'MSB']))).order_by(Student.id).with_for_update().all()]
    _lock_students(db, ids)
    replay = _replay(db, actor, data.idempotency_key, payload_hash, RunDetail)
    if replay:
        return replay
    month = date.fromisoformat(data.collection_month + '-01')
    preview = preview_export(db, as_of=as_of, month=month, branch=data.branch, holidays=holidays, policy=policy)
    if preview.content_hash != data.expected_content_hash:
        raise DraftConflict('The export changed. Refresh and review it before saving the run.')
    if not preview.can_download:
        raise ValueError('Resolve the bank file checks before saving the run.')
    run = BankRun(id=str(uuid4()), version=1, status='prepared', branch=data.branch,
        collection_month=data.collection_month, content_hash=preview.content_hash,
        export_snapshot=preview.model_dump(mode='json'), workbook=workbook_bytes(preview),
        payment_evidence={p.id: {'snapshot_hash': digest(p.snapshot),
                               'collection': p.snapshot['review']['period']['collection']}
                          for p in db.query(BillingPayment).filter(
            BillingPayment.id.in_([r.payment_id for r in preview.rows])).all()},
        created_by=actor.id, created_by_name=_actor(actor))
    run.file_sha256 = hashlib.sha256(run.workbook).hexdigest()
    run.export_sha256 = digest({'export': run.export_snapshot, 'payments': run.payment_evidence})
    db.add(run)
    db.flush()
    for row in preview.rows:
        db.add(BankRunClaim(payment_id=row.payment_id, run_id=run.id))
    db.flush()
    result = detail(db, run, as_of=as_of, holidays=holidays, policy=policy)
    _audit(db, run, actor, 'prepared', result, key=data.idempotency_key, payload_hash=payload_hash)
    return result


def change_run(db, run_id, data, actor, *, kind, as_of, holidays, policy=POLICY):
    if not writes_enabled():
        raise DraftConflict('Changing Autopay runs is not enabled yet.')
    run = _lock_run(db, run_id)
    payload_hash = _payload(kind, run.id, data, actor)
    replay = _replay(db, actor, data.idempotency_key, payload_hash, RunDetail)
    if replay:
        return replay
    if run.version != data.expected_version:
        raise DraftConflict('This run changed. Refresh before continuing.')
    if kind == 'submitted':
        if run.status != 'prepared' or run.submitted_at:
            raise DraftConflict('Only a prepared file can be recorded as uploaded.')
        checks = _file_issues(run) + _prepared_issues(db, run, as_of=as_of, holidays=holidays, policy=policy)
        if checks:
            raise DraftConflict('Review the saved file and its payments before recording bank upload.')
        run.submitted_at, run.submitted_by_name = utc_now(), _actor(actor)
        run.bank_batch_no, run.status = data.bank_batch_no, 'submitted'
    elif kind == 'discarded':
        if run.status != 'prepared' or run.submitted_at:
            raise DraftConflict('Only an unsubmitted prepared run can be discarded.')
        run.status, run.discarded_at, run.discard_reason = 'discarded', utc_now(), data.reason
        db.query(BankRunClaim).filter_by(run_id=run.id).delete(synchronize_session=False)
    else:
        raise ValueError('Unknown run action.')
    run.version += 1
    db.flush()
    result = detail(db, run, as_of=as_of, holidays=holidays, policy=policy)
    _audit(db, run, actor, kind, result, key=data.idempotency_key, payload_hash=payload_hash)
    return result


def _result_import(db, run, import_id):
    result = db.query(BankRunImport).filter_by(id=str(import_id), run_id=run.id).first()
    if result is None:
        raise DraftNotFound('Bank result review not found.')
    return result


def _paid_key(import_id, payment_id):
    return digest({'bank_import': import_id, 'payment': payment_id})


def review_result(db, run, imported, *, as_of, policy=POLICY):
    if not storage_enabled():
        raise DraftConflict('Saved Autopay runs are not available yet.')
    from .autopay import _payment_evidence, _shape
    from .schemas import BillingDraftReview
    report = imported.report
    frozen = _preview(run)
    issues = [BankExportIssue.model_validate(i) for i in report.get('issues', [])]
    issues.extend(_file_issues(run))
    if not run.submitted_at or run.status == 'discarded':
        issues.append(_issue('RUN_NOT_SUBMITTED', 'Record the bank upload before reviewing its results.'))
    try:
        debit_date = date.fromisoformat(report['debit_date'])
    except (ValueError, TypeError, KeyError):
        debit_date = None
        issues.append(_issue('DEBIT_DATE', 'Check the bank debit date.'))
    if debit_date:
        if debit_date > as_of:
            issues.append(_issue('FUTURE_DEBIT_DATE', 'The bank debit date cannot be in the future.'))
        if debit_date.strftime('%Y-%m') != run.collection_month:
            issues.append(_issue('COLLECTION_MONTH', 'The bank debit date belongs to another collection month.'))
        # Each exact saved payment carries its actual approved debit window.
        for saved in frozen.rows:
            try:
                collection = run.payment_evidence[saved.payment_id]['collection']
                if not date.fromisoformat(collection['debit_from']) <= debit_date <= date.fromisoformat(collection['debit_to']):
                    issues.append(_issue('DEBIT_WINDOW', 'The bank debit date differs from the saved collection dates.'))
                    break
            except BAD_EVIDENCE:
                issues.append(_issue('PAYMENT_CHANGED', 'A saved payment needs review.'))
                break
    if report.get('currency') != 'MOP':
        issues.append(_issue('CURRENCY', 'This bank file requires MOP results.'))
    if run.bank_batch_no and report.get('bank_batch_no') != run.bank_batch_no:
        issues.append(_issue('BANK_BATCH', 'The bank batch number differs from the recorded upload.'))
    identity = db.query(BankResultIdentity).filter_by(bank_identity_hash=imported.bank_identity_hash).first()
    if identity and identity.run_id != run.id:
        issues.append(_issue('BANK_REPORT_REUSE', 'This bank batch already belongs to another run.'))
    elif identity and identity.report_hash != imported.report_hash:
        issues.append(_issue('BANK_REPORT_CONFLICT', 'This bank batch has different previously saved results.'))
    saved_by_contract = {row.contract_no: row for row in frozen.rows}
    actual_rows = report.get('rows', [])
    contracts = [row.get('contract_no', '') for row in actual_rows]
    if len(set(contracts)) != len(contracts):
        issues.append(_issue('DUPLICATE_CONTRACT', 'The bank report repeats a contract number.'))
    if set(contracts) != set(saved_by_contract):
        issues.append(_issue('CONTRACT_SET', 'The report does not contain exactly this saved run’s contracts.'))
    if report.get('payment_count') != frozen.payment_count or report.get('total_amount') != frozen.total_amount:
        issues.append(_issue('RUN_TOTAL', 'The bank count or total differs from the saved file.'))
    payment_ids = [r.payment_id for r in frozen.rows]
    payments = {p.id: p for p in db.query(BillingPayment).filter(BillingPayment.id.in_(payment_ids)).all()}
    accounts = dict(db.query(BillingAccount.id, BillingAccount.student_id).filter(
        BillingAccount.id.in_({p.account_id for p in payments.values()})).all())
    lines, claims, sessions = _payment_evidence(db, payment_ids)
    owners = claimed_payments(db, payment_ids)
    applications = imported.applied or {}
    operations = {op.idempotency_key: op for op in db.query(BillingOperation).filter(
        BillingOperation.payment_id.in_(payment_ids), BillingOperation.kind == 'paid',
        BillingOperation.idempotency_key.in_([_paid_key(imported.id, pid) for pid in applications])).all()} if applications else {}
    rows = []
    for raw in actual_rows:
        saved = saved_by_contract.get(raw.get('contract_no'))
        payment = payments.get(saved.payment_id) if saved else None
        outcome = raw.get('outcome', 'unknown')
        row = ResultRow(contract_no=raw.get('contract_no', ''), amount=raw.get('amount', ''),
            raw_status=raw.get('raw_status', ''), reject_code=raw.get('reject_code', ''),
            outcome=outcome, reason=raw.get('reason', ''), record_status='review',
            student=saved.student if saved else None, payment_id=saved.payment_id if saved else None,
            payment_version=payment.version if payment else None)
        if not saved:
            row.reason = 'Contract not found in this saved file'
        elif raw.get('amount') != saved.amount:
            row.reason = 'Amount differs from the saved file'
            issues.append(_issue('ROW_AMOUNT', 'A bank amount differs from the saved file.', saved.student.id))
        elif (payment is None or accounts.get(payment.account_id) != saved.student.id
              or owners.get(saved.payment_id) != run.id):
            row.reason = 'The saved payment is missing or belongs to another student'
        else:
            try:
                review = BillingDraftReview.model_validate(payment.snapshot['review'])
                valid = (_shape(review, saved.student.id, policy)
                         and digest(payment.snapshot) == (run.payment_evidence or {}).get(payment.id, {}).get('snapshot_hash')
                         and review.period.collection.method == 'autopay'
                         and format(bank_amount(review.period.total_fee), '.2f') == saved.amount
                         and not workflow.payment_integrity(db, payment, review, lines[payment.id],
                             preloaded_claims=claims[payment.id], preloaded_sessions=sessions[payment.id]))
            except BAD_EVIDENCE:
                valid = False
            recorded = applications.get(payment.id)
            op = operations.get(_paid_key(imported.id, payment.id))
            if (valid and recorded and op and payment.status == 'Paid' and outcome == 'collected'
                    and payment.received_method == 'autopay' and payment.payment_date == debit_date
                    and payment.received_amount == int(Decimal(saved.amount))):
                row.record_status, row.reason = 'recorded', 'Payment already recorded from this bank result'
            elif not valid or payment.version != saved.payment_version or payment.status != 'Pending Payment':
                row.reason = 'The payment changed. Review it before recording the bank result'
            elif Decimal(saved.amount) != Decimal(saved.amount).to_integral_value():
                row.reason = 'This fee amount needs manual review'
            elif outcome == 'collected':
                row.record_status = 'ready'
                row.reason = 'Collected by the bank'
            elif outcome == 'rejected':
                row.record_status = 'unpaid'
            else:
                row.record_status = 'review'
        rows.append(row)
    # Deterministic ordering and hashes make the displayed review the exact
    # optimistic confirmation boundary, including changed source evidence.
    rows.sort(key=lambda row: row.contract_no)
    issues.sort(key=lambda issue: (issue.code, issue.student_id or 0, issue.message))
    ready = [row for row in rows if row.record_status == 'ready']
    recorded = [row for row in rows if row.record_status == 'recorded']
    ready_amount = format(sum((Decimal(row.amount) for row in ready), Decimal('0.00')), '.2f')
    recorded_amount = format(sum((Decimal(row.amount) for row in recorded), Decimal('0.00')), '.2f')
    values = dict(id=imported.id, run_id=run.id, run_version=run.version,
        source_format=report.get('source_format', ''), bank_batch_no=report.get('bank_batch_no', ''),
        debit_date=debit_date, currency=report.get('currency', ''), report_hash=imported.report_hash,
        payment_count=report.get('payment_count', 0), total_amount=report.get('total_amount'),
        success_count=report.get('success_count', 0), successful_amount=report.get('successful_amount'),
        failed_count=report.get('failed_count', 0), failed_amount=report.get('failed_amount'),
        ready_count=len(ready), ready_amount=ready_amount, recorded_count=len(recorded), recorded_amount=recorded_amount,
        review_count=sum(r.record_status == 'review' for r in rows), rows=rows, issues=issues,
        can_confirm=writes_enabled() and bool(ready) and not issues)
    values['review_hash'] = digest({**values, 'rows': [r.model_dump(mode='json') for r in rows],
                                   'issues': [i.model_dump(mode='json') for i in issues]})
    return ResultReview(**values)


def upload_results(db, run_id, report, expected_version, actor, *, as_of, policy=POLICY):
    if not writes_enabled():
        raise DraftConflict('Importing bank results is not enabled yet.')
    run = _lock_run(db, run_id)
    if not run.submitted_at or run.status == 'discarded':
        raise DraftConflict('Record the actual bank upload before importing results.')
    same = db.query(BankRunImport).filter_by(run_id=run.id, report_hash=report['report_hash']).first()
    if same:
        return review_result(db, run, same, as_of=as_of, policy=policy)
    if run.version != expected_version:
        raise DraftConflict('This run changed. Refresh before uploading results.')
    imported = BankRunImport(id=str(uuid4()), run_id=run.id, bank_identity_hash=report['bank_identity_hash'],
        report_hash=report['report_hash'], report=report, applied={}, created_by_name=_actor(actor))
    db.add(imported)
    db.flush()
    checked = review_result(db, run, imported, as_of=as_of, policy=policy)
    # A report with wrong contracts, dates or totals must not reserve its bank
    # identity against the correct run. Valid held statuses can still be saved.
    identity = db.query(BankResultIdentity).filter_by(bank_identity_hash=imported.bank_identity_hash).with_for_update().first()
    if not checked.issues and identity is None:
        db.add(BankResultIdentity(bank_identity_hash=imported.bank_identity_hash,
            run_id=run.id, import_id=imported.id, report_hash=imported.report_hash))
    run.latest_import_id = imported.id
    run.version += 1
    if checked.issues or any(row.record_status in {'review', 'unpaid'} for row in checked.rows):
        run.status = 'needs_attention'
    db.flush()
    result = review_result(db, run, imported, as_of=as_of, policy=policy)
    _audit(db, run, actor, 'results_uploaded', result)
    return result


def confirm_results(db, run_id, import_id, data, actor, *, as_of, policy=POLICY):
    if not writes_enabled():
        raise DraftConflict('Recording bank results is not enabled yet.')
    run = _lock_run(db, run_id)
    payload_hash = _payload('results_recorded', str(import_id), data, actor)
    replay = _replay(db, actor, data.idempotency_key, payload_hash, ResultReview)
    if replay:
        return replay
    imported = _result_import(db, run, import_id)
    review = review_result(db, run, imported, as_of=as_of, policy=policy)
    if review.review_hash != data.expected_review_hash:
        raise DraftConflict('The bank result review changed. Refresh and review it before confirming.')
    if not review.can_confirm:
        raise DraftConflict('Resolve the bank result checks before recording payments.')
    identity = db.query(BankResultIdentity).filter_by(bank_identity_hash=imported.bank_identity_hash).with_for_update().first()
    if identity is not None and (identity.run_id != run.id or identity.report_hash != imported.report_hash):
        raise DraftConflict('This bank batch has already been saved with different results or another run.')
    if identity is None:
        db.add(BankResultIdentity(bank_identity_hash=imported.bank_identity_hash, run_id=run.id,
                                 import_id=imported.id, report_hash=imported.report_hash))
        db.flush()
    applications = dict(imported.applied or {})
    for row in sorted((r for r in review.rows if r.record_status == 'ready'), key=lambda r: (r.student.id, r.payment_id)):
        data_paid = BillingPaidRequest(expected_version=row.payment_version,
            idempotency_key=_paid_key(imported.id, row.payment_id), payment_date=review.debit_date,
            amount=int(Decimal(row.amount)), method='autopay')
        paid = workflow.mutate_payment(db, row.student.id, row.payment_id, data_paid, actor,
                                       kind='paid', as_of=as_of, policy=policy)
        applications[row.payment_id] = {'version': paid.version, 'payment_date': review.debit_date.isoformat(),
                                         'amount': row.amount, 'operation_key': data_paid.idempotency_key}
    imported.applied = applications
    run.bank_batch_no = run.bank_batch_no or review.bank_batch_no
    run.version += 1
    db.flush()
    result = review_result(db, run, imported, as_of=as_of, policy=policy)
    run.status = ('processed' if not result.issues and all(row.record_status == 'recorded' for row in result.rows)
                  else 'needs_attention')
    db.flush()
    result = review_result(db, run, imported, as_of=as_of, policy=policy)
    _audit(db, run, actor, 'results_recorded', result, key=data.idempotency_key, payload_hash=payload_hash)
    return result
