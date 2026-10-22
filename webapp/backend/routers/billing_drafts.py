"""Versioned payment drafts, without enrolment creation or payment actions."""
from uuid import UUID
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from database import get_db
from models import Enrollment, SessionLog, Student, Tutor
from billing.drafts import (
    DraftConflict, DraftNotFound, discard_draft, draft_detail, draft_summaries, review_draft,
    save_draft, storage_enabled,
)
from billing.models import BillingAccount, BillingDraft, BillingDraftRevision
from billing.schemas import (
    BillingDraftDetail, BillingDraftDiscardRequest, BillingDraftReview, BillingDraftReviewRequest,
    BillingDraftRevisionRequest, BillingDraftSaveRequest, BillingDraftSummary,
    BillingIntakeSource,
)
from billing.evidence import source_student_ids
from routers.billing import POLICY, preview_role, source_scope, today

router = APIRouter()


def require_storage():
    if not storage_enabled():
        raise HTTPException(status_code=503, detail='Saving billing drafts is not enabled. Fee review remains available.')


def authorise_intake_student(db, student_id, request, user, tutor_id=None, *,
                             trial_enrollment_id=None, trial_session_id=None):
    scope = source_scope(request, user, tutor_id)
    if db.query(Student.id).filter(Student.id == student_id).first() is None:
        raise HTTPException(status_code=404, detail='Student not found.')
    if (trial_enrollment_id is None) != (trial_session_id is None):
        raise HTTPException(status_code=422, detail='Choose both the trial enrollment and its attended session.')
    # Admin readers can still inspect/discard a stale saved intake after its
    # trial is removed. The source service validates actual trial ownership.
    if scope is None:
        return
    if trial_enrollment_id is not None:
        source = db.query(Enrollment.id).join(SessionLog, SessionLog.enrollment_id == Enrollment.id).filter(
            Enrollment.id == trial_enrollment_id, Enrollment.student_id == student_id,
            Enrollment.enrollment_type == 'Trial', SessionLog.id == trial_session_id,
            SessionLog.student_id == student_id, Enrollment.payment_status != 'Cancelled',
        )
        if scope is not None:
            from sqlalchemy import or_
            source = source.filter(or_(Enrollment.tutor_id == scope, SessionLog.tutor_id == scope))
        allowed = source.first() is not None
    else:
        allowed = scope is None or db.query(Enrollment.id).filter(
            Enrollment.student_id == student_id, Enrollment.tutor_id == scope,
            Enrollment.payment_status != 'Cancelled',
        ).first() is not None
    if not allowed:
        raise HTTPException(status_code=404, detail='No intake source is available in your student scope.')


def authorise_student(db, student_id, request, user, tutor_id=None, *, intake=None, allow_intake=False):
    if intake is not None:
        return authorise_intake_student(db, student_id, request, user, tutor_id,
            trial_enrollment_id=intake.trial_enrollment_id, trial_session_id=intake.trial_session_id)
    scope = source_scope(request, user, tutor_id)
    allowed = source_student_ids(db, POLICY, tutor_id=scope).filter(Enrollment.student_id == student_id).first()
    if allowed is None:
        if allow_intake:
            return authorise_intake_student(db, student_id, request, user, tutor_id)
        raise HTTPException(status_code=404, detail='No regular-course source is available in your student scope.')


def authorise_draft(db, draft, student_id, request, user, tutor_id=None, *, row=None):
    row = row or db.query(BillingDraftRevision).filter_by(
        draft_id=draft.id, revision=draft.current_revision,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail='Draft revision not found.')
    source = row.snapshot['request'].get('intake')
    intake = BillingIntakeSource.model_validate(source) if source else None
    return authorise_student(db, student_id, request, user, tutor_id, intake=intake)


def translated(action):
    try:
        return action()
    except DraftConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except DraftNotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def find_draft(db, draft_id):
    result = db.query(BillingDraft, BillingAccount.student_id).join(
        BillingAccount, BillingAccount.id == BillingDraft.account_id,
    ).filter(BillingDraft.id == str(draft_id)).first()
    if result is None:
        raise HTTPException(status_code=404, detail='Draft not found.')
    return result


@router.post('/billing/students/{student_id}/draft-review', response_model=BillingDraftReview)
def post_draft_review(student_id: int, data: BillingDraftReviewRequest, request: Request,
                      tutor_id: int | None = None,
                      user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    role = preview_role(request, user)
    authorise_student(db, student_id, request, user, tutor_id, intake=data.intake)
    return translated(lambda: review_draft(db, student_id, data, as_of=today(),
                                          admin=role in {'Admin', 'Super Admin'}, policy=POLICY))


def persist(db, student_id, data, user, *, draft_id=None, discard=False):
    # Authorisation has read the source already. Start the write transaction
    # afresh so MySQL does not retain a pre-lock consistent-read snapshot.
    actor = SimpleNamespace(id=user.id, tutor_name=user.tutor_name)
    db.rollback()
    try:
        if discard:
            draft, row = discard_draft(db, student_id, draft_id, data, actor, policy=POLICY)
        else:
            draft, row = save_draft(db, student_id, data, actor, as_of=today(), draft_id=draft_id, policy=POLICY)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail='Another draft action was saved. Reload and retry with its latest revision.') from error
    except Exception:
        db.rollback()
        raise
    return draft_detail(db, draft, row, as_of=today(), policy=POLICY)


@router.post('/billing/students/{student_id}/drafts', response_model=BillingDraftDetail)
def post_draft(student_id: int, data: BillingDraftSaveRequest, request: Request,
               user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_storage()
    authorise_student(db, student_id, request, user, intake=data.review.intake)
    return translated(lambda: persist(db, student_id, data, user))


@router.put('/billing/drafts/{draft_id}/revisions', response_model=BillingDraftDetail)
def put_draft_revision(draft_id: UUID, data: BillingDraftRevisionRequest, request: Request,
                       user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_storage()
    draft, student_id = find_draft(db, draft_id)
    authorise_draft(db, draft, student_id, request, user)
    authorise_student(db, student_id, request, user, intake=data.review.intake)
    return translated(lambda: persist(db, student_id, data, user, draft_id=str(draft_id)))


@router.get('/billing/students/{student_id}/drafts', response_model=list[BillingDraftSummary])
def get_student_drafts(student_id: int, request: Request, tutor_id: int | None = None, user: Tutor = Depends(get_current_user),
                       db: Session = Depends(get_db), include_discarded: bool = False):
    require_storage()
    authorise_student(db, student_id, request, user, tutor_id, allow_intake=True)
    return draft_summaries(db, student_id, include_discarded=include_discarded)


@router.post('/billing/drafts/{draft_id}/discard', response_model=BillingDraftDetail)
def post_discard_draft(draft_id: UUID, data: BillingDraftDiscardRequest, request: Request,
                       user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_storage()
    draft, student_id = find_draft(db, draft_id)
    authorise_draft(db, draft, student_id, request, user)
    return translated(lambda: persist(db, student_id, data, user, draft_id=str(draft_id), discard=True))


@router.get('/billing/drafts/{draft_id}', response_model=BillingDraftDetail)
def get_draft(draft_id: UUID, request: Request, revision: int | None = Query(None, ge=1),
              tutor_id: int | None = None,
              user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_storage()
    draft, student_id = find_draft(db, draft_id)
    row = db.query(BillingDraftRevision).filter(
        BillingDraftRevision.draft_id == draft.id,
        BillingDraftRevision.revision == (revision if revision is not None else draft.current_revision),
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail='Draft revision not found.')
    authorise_draft(db, draft, student_id, request, user, tutor_id, row=row)
    return translated(lambda: draft_detail(db, draft, row, as_of=today(), policy=POLICY))
