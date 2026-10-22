"""Scoped, read-only monthly collection preparation."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from billing.autopay import build_autopay_run, collection_month as parse_month, run_response
from billing.autopay_schemas import AutopayResponse, AutopayStage
from billing.autopay_view import apply_bank_run_follow_up
from billing.bank_export import (
    ExportBlocked, ExportConflict, ExportUnavailable, preview_export, reviewed_export,
)
from billing.bank_export_schemas import BankExportPreview, BankExportPreviewRequest, BankExportRequest
from billing.workflow import workflow_storage_enabled
from billing.queue import queue_available
from database import get_db
from models import Tutor
from routers.billing import POLICY, holiday_dates, source_scope, today

router = APIRouter()


@router.get('/billing/autopay', response_model=AutopayResponse)
def get_autopay_run(
    request: Request,
    collection_month: str | None = Query(default=None, pattern=r'^\d{4}-(0[1-9]|1[0-2])$'),
    stage: AutopayStage | None = None,
    search: str | None = Query(default=None, max_length=200),
    location: str | None = Query(default=None, max_length=100),
    tutor_id: int | None = Query(default=None, gt=0),
    offset: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=200),
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    viewed = source_scope(request, user, tutor_id)
    if not queue_available():
        raise HTTPException(status_code=503, detail='Collection preparation is not available yet.')
    if location and location.strip().casefold() == 'various':
        raise HTTPException(status_code=422, detail='Choose a teaching branch.')
    as_of = today()
    try:
        month = parse_month(collection_month, as_of, POLICY)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    rows = build_autopay_run(db, as_of=as_of, month=month, holidays=holiday_dates(db),
                             tutor_id=viewed, location=location, policy=POLICY)
    rows = apply_bank_run_follow_up(db, rows, as_of=as_of, policy=POLICY)
    return run_response(rows, as_of=as_of, month=month, offset=offset, limit=limit,
                        stage=stage, search=search, policy=POLICY)


def export_month(data):
    try:
        return parse_month(data.collection_month, today(), POLICY)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post('/billing/autopay/export-preview', response_model=BankExportPreview)
def preview_bank_export(
    data: BankExportPreviewRequest,
    _user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db),
):
    return preview_export(db, as_of=today(), month=export_month(data), branch=data.branch,
                          holidays=holiday_dates(db) if workflow_storage_enabled() else set(), policy=POLICY)


@router.post('/billing/autopay/export')
def download_bank_export(
    data: BankExportRequest,
    _user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db),
):
    month = export_month(data)
    from billing.bank_runs import storage_enabled as run_storage_enabled
    if run_storage_enabled():
        raise HTTPException(status_code=409, detail='Save the bank file as an Autopay run before downloading it.')
    try:
        preview, content = reviewed_export(db, as_of=today(), month=month, branch=data.branch,
            holidays=holiday_dates(db) if workflow_storage_enabled() else set(), policy=POLICY,
            expected_content_hash=data.expected_content_hash)
    except ExportUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ExportConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ExportBlocked as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(content=content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{preview.filename}"',
                 'Cache-Control': 'no-store',
                 'X-CSM-Export-Total': preview.total_amount,
                 'X-CSM-Export-Count': str(preview.payment_count),
                 'X-CSM-Export-Hash': preview.content_hash})
