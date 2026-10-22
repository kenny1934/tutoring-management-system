"""Reviewed enrollments and combined collections, enabled after migration."""
from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from database import get_db
from models import Enrollment, Tutor
from billing.models import BillingAccount, BillingPayment, BillingPaymentLine
from billing.schemas import (
    BillingCancelRequest, BillingConfirmRequest, BillingPaidRequest, BillingPaymentDetail, BillingPreferences,
    BillingPreferenceUpdate, BillingReceiptRequest, BillingSentRequest,
    BillingIntakeSource,
)
from billing import workflow
from routers.billing import POLICY, source_scope, today
from routers.billing_drafts import authorise_draft, authorise_student, find_draft, translated

router = APIRouter()


def require_workflow():
    if not workflow.workflow_enabled():
        raise HTTPException(status_code=503, detail='Enrollment confirmation and payment recording are not enabled yet.')


def require_storage():
    if not workflow.workflow_storage_enabled():
        raise HTTPException(status_code=503, detail='Confirmed payments are not available yet.')


def require_preferences():
    if not workflow.preferences_writes_enabled():
        raise HTTPException(status_code=503, detail='Payment method recording is not enabled yet.')


def write_action(db, user, action):
    # Authorisation reads happen first. Restart so the first consistent MySQL
    # read follows the service's student/account/source locks.
    actor = SimpleNamespace(id=user.id, tutor_name=user.tutor_name, user_email=user.user_email)
    db.rollback()
    try:
        result = translated(lambda: action(actor))
        db.commit()
        return result
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail='Another action changed these records. Refresh and review before trying again.') from error
    except Exception:
        db.rollback()
        raise


def find_payment(db, payment_id):
    result = db.query(BillingPayment, BillingAccount.student_id).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id,
    ).filter(BillingPayment.id == str(payment_id)).first()
    if result is None:
        raise HTTPException(status_code=404, detail='Payment not found.')
    return result


def authorise_payment(db, payment, student_id, request, user, tutor_id=None):
    scope = source_scope(request, user, tutor_id)
    teaching = db.query(Enrollment.id).join(
        BillingPaymentLine, BillingPaymentLine.enrollment_id == Enrollment.id,
    ).filter(BillingPaymentLine.payment_id == payment.id, Enrollment.student_id == student_id,
             Enrollment.enrollment_type == 'Regular')
    if scope is not None:
        teaching = teaching.filter(Enrollment.tutor_id == scope)
    if teaching.first():
        # An outstanding receipt retains access through its actual teaching
        # records after a student leaves or the teaching year changes.
        return
    snapshot = payment.snapshot if isinstance(payment.snapshot, dict) else {}
    saved_request = snapshot.get('request')
    source = saved_request.get('intake') if isinstance(saved_request, dict) else None
    if not source:
        return authorise_student(db, student_id, request, user, tutor_id)
    return authorise_student(db, student_id, request, user, tutor_id,
                             intake=BillingIntakeSource.model_validate(source))


@router.get('/billing/students/{student_id}/preferences', response_model=BillingPreferences)
def read_preferences(student_id: int, request: Request, tutor_id: int | None = None,
                     user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_storage()
    authorise_student(db, student_id, request, user, tutor_id, allow_intake=True)
    return workflow.get_preferences(db, student_id, POLICY)


@router.put('/billing/students/{student_id}/preferences', response_model=BillingPreferences)
def update_preferences(student_id: int, data: BillingPreferenceUpdate, request: Request,
                       user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_preferences()
    authorise_student(db, student_id, request, user, allow_intake=True)
    return write_action(db, user, lambda actor: workflow.save_preferences(db, student_id, data, actor, POLICY))


@router.post('/billing/drafts/{draft_id}/confirm', response_model=BillingPaymentDetail)
def confirm_enrollments(draft_id: UUID, data: BillingConfirmRequest, request: Request,
                       user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    require_workflow()
    draft, student_id = find_draft(db, draft_id)
    authorise_draft(db, draft, student_id, request, user)
    return write_action(db, user, lambda actor: workflow.confirm_draft(
        db, student_id, str(draft_id), data, actor, as_of=today(), policy=POLICY,
    ))


@router.get('/billing/students/{student_id}/payments', response_model=list[BillingPaymentDetail])
def list_payments(student_id: int, request: Request, tutor_id: int | None = None,
                  user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_storage()
    try:
        authorise_student(db, student_id, request, user, tutor_id, allow_intake=True)
    except HTTPException as error:
        if error.status_code != 404:
            raise
        # A cancelled first intake may be the student's only Regular record.
        candidates = db.query(BillingPayment).join(BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
            BillingAccount.student_id == student_id, BillingAccount.academic_start == POLICY.academic_start,
        ).all()
        allowed = False
        for payment in candidates:
            if not payment.snapshot['request'].get('intake'):
                continue
            try:
                authorise_payment(db, payment, student_id, request, user, tutor_id)
                allowed = True
                break
            except HTTPException as scoped_error:
                if scoped_error.status_code != 404:
                    raise
        if not allowed:
            raise error
    payments = db.query(BillingPayment).join(BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
        BillingAccount.student_id == student_id, BillingAccount.academic_start == POLICY.academic_start,
    ).order_by(BillingPayment.created_at.desc(), BillingPayment.id).all()
    return translated(lambda: [workflow.payment_detail(db, payment) for payment in payments])


@router.get('/billing/payments/{payment_id}', response_model=BillingPaymentDetail)
def read_payment(payment_id: UUID, request: Request, tutor_id: int | None = None,
                 user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    require_storage()
    payment, student_id = find_payment(db, payment_id)
    authorise_payment(db, payment, student_id, request, user, tutor_id)
    return translated(lambda: workflow.payment_detail(db, payment))


def payment_action(db, payment_id, data, request, user, kind):
    require_workflow()
    payment, student_id = find_payment(db, payment_id)
    authorise_payment(db, payment, student_id, request, user)
    return write_action(db, user, lambda actor: workflow.mutate_payment(
        db, student_id, str(payment_id), data, actor, kind=kind, as_of=today(), policy=POLICY,
    ))


@router.post('/billing/payments/{payment_id}/sent', response_model=BillingPaymentDetail)
def mark_sent(payment_id: UUID, data: BillingSentRequest, request: Request,
              user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return payment_action(db, payment_id, data, request, user, 'sent')


@router.post('/billing/payments/{payment_id}/paid', response_model=BillingPaymentDetail)
def record_payment(payment_id: UUID, data: BillingPaidRequest, request: Request,
                   user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return payment_action(db, payment_id, data, request, user, 'paid')


@router.post('/billing/payments/{payment_id}/receipt', response_model=BillingPaymentDetail)
def record_receipt(payment_id: UUID, data: BillingReceiptRequest, request: Request,
                   user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return payment_action(db, payment_id, data, request, user, 'receipt')


@router.post('/billing/payments/{payment_id}/cancel', response_model=BillingPaymentDetail)
def cancel_enrollments(payment_id: UUID, data: BillingCancelRequest, request: Request,
                      user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return payment_action(db, payment_id, data, request, user, 'cancelled')
