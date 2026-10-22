"""Read-only KMS receipt follow-up using existing combined payment records."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from billing.receipt_schemas import ReceiptCount, ReceiptList
from billing.receipts import outstanding_count, outstanding_receipts
from billing.workflow import workflow_enabled, workflow_storage_enabled
from database import get_db
from models import Tutor
from routers.billing import source_scope, today

router = APIRouter()


def receipt_scope(request, user, tutor_id, location):
    viewed = source_scope(request, user, tutor_id)
    if location and location.strip().casefold() == 'various':
        raise HTTPException(status_code=422, detail='Choose a teaching branch.')
    return viewed


@router.get('/billing/receipts/count', response_model=ReceiptCount)
def count_receipts(
    request: Request, location: str | None = Query(default=None, max_length=100),
    tutor_id: int | None = Query(default=None, gt=0),
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    viewed = receipt_scope(request, user, tutor_id, location)
    return ReceiptCount(count=outstanding_count(db, tutor_id=viewed, location=location),
                        storage_available=workflow_storage_enabled(), writes_available=workflow_enabled())


@router.get('/billing/receipts', response_model=ReceiptList)
def list_receipts(
    request: Request, location: str | None = Query(default=None, max_length=100),
    tutor_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None, max_length=200),
    offset: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=200),
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    viewed = receipt_scope(request, user, tutor_id, location)
    total, rows = outstanding_receipts(db, tutor_id=viewed, location=location,
                                       search=search, offset=offset, limit=limit)
    return ReceiptList(as_of=today(), storage_available=workflow_storage_enabled(),
                        writes_available=workflow_enabled(), total=total, offset=offset, limit=limit, rows=rows)
