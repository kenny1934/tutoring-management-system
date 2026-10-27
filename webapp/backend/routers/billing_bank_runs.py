"""Admin-only immutable bank files and separately confirmed bank results."""
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from auth.dependencies import require_admin_write
from database import get_db
from models import Tutor
from billing import bank_runs
from billing.bank_results import BankReportError, parse_bank_report
from billing.bank_run_models import BankRun
from billing.bank_run_schemas import (ResultConfirm, ResultReview, RunAction, RunCreate, RunDetail,
                                     RunDiscard, RunList, RunSubmit)
from billing.bank_export_schemas import BankBranch
from routers.billing import POLICY, holiday_dates, today
from routers.billing_drafts import translated

router = APIRouter()


def require_storage():
    if not bank_runs.storage_enabled():
        raise HTTPException(status_code=503, detail='Saved Autopay runs are not available yet.')


def require_writes():
    if not bank_runs.writes_enabled():
        raise HTTPException(status_code=503, detail='Saving and processing Autopay runs is not enabled yet.')


def _month(value):
    from billing.autopay import collection_month
    try:
        return collection_month(value, today(), POLICY).strftime('%Y-%m')
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def persist(db, user, action):
    actor = SimpleNamespace(id=user.id, tutor_name=user.tutor_name, user_email=user.user_email)
    db.rollback()
    for attempt in range(2):
        try:
            result = translated(lambda: action(actor))
            db.commit()
            return result
        except (IntegrityError, OperationalError) as error:
            db.rollback()
            # A unique claim/retry or an InnoDB deadlock may have raced another
            # committed operation. One full retry rechecks its idempotency and
            # current evidence; no individual financial mutation is retried alone.
            if attempt == 0:
                continue
            raise HTTPException(status_code=409, detail='Another action changed this run. Refresh and review before continuing.') from error
        except Exception:
            db.rollback()
            raise


@router.get('/billing/autopay/runs', response_model=RunList)
def list_runs(collection_month: str | None = Query(default=None, pattern=r'^\d{4}-(0[1-9]|1[0-2])$'),
              branch: BankBranch | None = None, _user: Tutor = Depends(require_admin_write),
              db: Session = Depends(get_db)):
    month = _month(collection_month) if collection_month else None
    if not bank_runs.storage_enabled():
        return RunList(storage_available=False, writes_available=False, runs=[])
    query = db.query(BankRun)
    if month: query = query.filter(BankRun.collection_month == month)
    if branch: query = query.filter(BankRun.branch == branch)
    rows = query.order_by(BankRun.created_at.desc(), BankRun.id).limit(200).all()
    return translated(lambda: RunList(storage_available=True, writes_available=bank_runs.writes_enabled(),
                                      runs=[bank_runs.summary(row) for row in rows]))


@router.post('/billing/autopay/runs', response_model=RunDetail)
def prepare_run(data: RunCreate, user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_writes()
    _month(data.collection_month)
    return persist(db, user, lambda actor: bank_runs.create_run(db, data, actor, as_of=today(),
                                                              holidays=holiday_dates(db), policy=POLICY))


@router.get('/billing/autopay/runs/{run_id}', response_model=RunDetail)
def read_run(run_id: UUID, _user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_storage()
    return translated(lambda: bank_runs.detail(db, bank_runs.find_run(db, run_id), as_of=today(),
                                               holidays=holiday_dates(db), policy=POLICY))


@router.get('/billing/autopay/runs/{run_id}/file')
def read_run_file(run_id: UUID, _user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_storage()
    run = translated(lambda: bank_runs.find_run(db, run_id))
    if bank_runs._file_issues(run):
        raise HTTPException(status_code=409, detail='The saved bank file needs review.')
    preview = bank_runs._preview(run)
    return Response(content=run.workbook, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{preview.filename}"', 'Cache-Control': 'no-store',
                 'X-CSM-Export-Total': preview.total_amount, 'X-CSM-Export-Count': str(preview.payment_count),
                 'X-CSM-Export-Hash': preview.content_hash})


@router.post('/billing/autopay/runs/{run_id}/submitted', response_model=RunDetail)
def submit_run(run_id: UUID, data: RunSubmit, user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_writes()
    return persist(db, user, lambda actor: bank_runs.change_run(db, str(run_id), data, actor, kind='submitted',
        as_of=today(), holidays=holiday_dates(db), policy=POLICY))


@router.post('/billing/autopay/runs/{run_id}/discard', response_model=RunDetail)
def discard_run(run_id: UUID, data: RunDiscard, user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_writes()
    return persist(db, user, lambda actor: bank_runs.change_run(db, str(run_id), data, actor, kind='discarded',
        as_of=today(), holidays=holiday_dates(db), policy=POLICY))


@router.post('/billing/autopay/runs/{run_id}/results', response_model=ResultReview)
def import_results(run_id: UUID, expected_version: int = Form(ge=1), file: UploadFile = File(),
                   user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_writes()
    try:
        # The parser independently enforces its limit and never executes HTML.
        content = file.file.read(2 * 1024 * 1024 + 1)
        report = parse_bank_report(content)
    except BankReportError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return persist(db, user, lambda actor: bank_runs.upload_results(db, str(run_id), report,
                                       expected_version, actor, as_of=today(), policy=POLICY))


@router.get('/billing/autopay/runs/{run_id}/results/{import_id}', response_model=ResultReview)
def read_results(run_id: UUID, import_id: UUID, _user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_storage()
    def read():
        run = bank_runs.find_run(db, run_id)
        imported = bank_runs._result_import(db, run, import_id)
        return bank_runs.review_result(db, run, imported, as_of=today(), policy=POLICY)
    return translated(read)


@router.post('/billing/autopay/runs/{run_id}/results/{import_id}/confirm', response_model=ResultReview)
def confirm_results(run_id: UUID, import_id: UUID, data: ResultConfirm,
                    user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_writes()
    return persist(db, user, lambda actor: bank_runs.confirm_results(db, str(run_id), str(import_id), data,
                                                    actor, as_of=today(), policy=POLICY))
