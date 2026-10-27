"""Scoped, read-only renewal worklist and its canonical reminder counts."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from billing.queue import URGENCY_ORDER, build_queue, queue_available, queue_counts
from billing.schemas import BillingQueueCountResponse, BillingQueueResponse, BillingQueueUrgencyCounts, QueueStage
from database import get_db
from models import Tutor
from routers.billing import POLICY, holiday_dates, source_scope, student_number_order, today

router = APIRouter()
MONTH_PATTERN = r'^\d{4}-(0[1-9]|1[0-2])$'


def scoped_rows(request, user, db, collection_month, location, tutor_id):
    viewed = source_scope(request, user, tutor_id)
    if not queue_available():
        raise HTTPException(status_code=503, detail='The renewal queue is not available yet.')
    as_of = today()
    month = collection_month or as_of.strftime('%Y-%m')
    if not (f'{POLICY.academic_start.year}-01' <= month <= f'{POLICY.regular_end.year}-12'):
        raise HTTPException(status_code=422, detail='Choose a collection month in this teaching year.')
    rows = build_queue(db, as_of=as_of, collection_month=month, holidays=holiday_dates(db),
                       tutor_id=viewed, location=location, policy=POLICY)
    rows.sort(key=lambda row: (URGENCY_ORDER[row.urgency], student_number_order(row.student)))
    return as_of, month, rows


@router.get('/billing/queue/counts', response_model=BillingQueueCountResponse)
def get_queue_counts(
    request: Request,
    collection_month: str | None = Query(default=None, pattern=MONTH_PATTERN),
    location: str | None = Query(default=None, max_length=100),
    tutor_id: int | None = Query(default=None, gt=0),
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    as_of, month, rows = scoped_rows(request, user, db, collection_month, location, tutor_id)
    return BillingQueueCountResponse(as_of=as_of, collection_month=month, **queue_counts(rows).model_dump())


@router.get('/billing/queue', response_model=BillingQueueResponse)
def get_queue(
    request: Request,
    collection_month: str | None = Query(default=None, pattern=MONTH_PATTERN),
    stage: QueueStage | None = None,
    search: str | None = Query(default=None, max_length=200),
    location: str | None = Query(default=None, max_length=100),
    tutor_id: int | None = Query(default=None, gt=0),
    offset: int = Query(default=0, ge=0), limit: int = Query(default=50, ge=1, le=200),
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    as_of, month, rows = scoped_rows(request, user, db, collection_month, location, tutor_id)
    counts = queue_counts(rows)
    rows = [r for r in rows if (r.stage == stage if stage else r.stage != 'no_payment')]
    if search and search.strip():
        term = search.strip().casefold()
        rows = [r for r in rows if term in r.student.student_name.casefold()
                or term in (r.student.school_student_id or '').casefold()]
    urgency_counts = BillingQueueUrgencyCounts()
    for row in rows:
        setattr(urgency_counts, row.urgency, getattr(urgency_counts, row.urgency) + 1)
    return BillingQueueResponse(as_of=as_of, collection_month=month, counts=counts, urgency_counts=urgency_counts,
                                total=len(rows), offset=offset, limit=limit, rows=rows[offset:offset + limit])
