"""Read makeup rights and review explicit pauses, departures and paid returns."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, get_effective_role, require_admin_write
from database import get_db
from models import Enrollment, SessionLog, Tutor
from makeup_schemas import (
    MakeupEligibilityResponse, ParticipationChange, ParticipationConfirm,
    ParticipationDetail, ParticipationPreview,
)
from routers.billing import source_scope, today
from routers.billing_drafts import authorise_student, translated
from routers.billing_workflow import write_action
from services import makeup_entitlement as service

router = APIRouter()


def _authorise(db, student_id, request, user, tutor_id=None):
    authorise_student(db, student_id, request, user, tutor_id, allow_intake=True)


def _require_enabled():
    if not service.entitlement_enabled():
        raise HTTPException(status_code=503, detail='Academic-year makeup management is not enabled yet.')


@router.get('/makeup/eligibility', response_model=MakeupEligibilityResponse)
def read_makeup_eligibility(
    request: Request, session_ids: list[int] = Query(..., min_length=1, max_length=100),
    target_date: date | None = None, tutor_id: int | None = None,
    user: Tutor = Depends(get_current_user), db: Session = Depends(get_db),
):
    scope = source_scope(request, user, tutor_id)
    ids = set(session_ids)
    owners = db.query(SessionLog.id, SessionLog.student_id, SessionLog.tutor_id).filter(SessionLog.id.in_(ids)).all()
    if len(owners) != len(ids):
        raise HTTPException(status_code=404, detail='A requested session is unavailable.')
    if scope is not None:
        student_ids = {row.student_id for row in owners}
        allowed = {row[0] for row in db.query(Enrollment.student_id).filter(
            Enrollment.student_id.in_(student_ids), Enrollment.tutor_id == scope,
            Enrollment.enrollment_type == 'Regular', Enrollment.payment_status != 'Cancelled',
        ).distinct().all()}
        if any(row.student_id not in allowed and row.tutor_id != scope for row in owners):
            raise HTTPException(status_code=404, detail='A requested session is outside your student scope.')
    as_of = today()
    return MakeupEligibilityResponse(as_of=as_of, eligibility=service.eligibility_for_sessions(
        db, ids, target_date=target_date, as_of=as_of,
    ))


@router.get('/billing/students/{student_id}/participation', response_model=ParticipationDetail)
def read_participation(student_id: int, request: Request, tutor_id: int | None = None,
                       user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    _authorise(db, student_id, request, user, tutor_id)
    return translated(lambda: service.participation_detail(db, student_id, as_of=today(),
        can_manage=get_effective_role(request, user) in {'Admin', 'Super Admin'}))


@router.post('/billing/students/{student_id}/participation/preview', response_model=ParticipationPreview)
def review_participation(student_id: int, data: ParticipationChange, request: Request,
                         tutor_id: int | None = None, user: Tutor = Depends(require_admin_write),
                         db: Session = Depends(get_db)):
    _require_enabled()
    _authorise(db, student_id, request, user, tutor_id)
    return translated(lambda: service.preview_participation(db, student_id, data, as_of=today()))


@router.post('/billing/students/{student_id}/participation', response_model=ParticipationDetail)
def change_participation(student_id: int, data: ParticipationConfirm, request: Request,
                         user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    _require_enabled()
    _authorise(db, student_id, request, user)
    return write_action(db, user, lambda actor: service.confirm_participation(
        db, student_id, data, actor, as_of=today(),
    ))
