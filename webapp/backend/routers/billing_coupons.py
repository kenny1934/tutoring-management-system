"""Scoped coupon evidence and reviewed KMS spreadsheet imports."""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from database import get_db
from models import Tutor
from billing import coupon_accounting as accounting, coupon_imports
from billing.coupon_schemas import CouponBalance, CouponImportConfirm, CouponImportReview, CouponVerificationConfirm, CouponVerificationRequest, CouponVerificationReview
from billing import kms_preview, kms_apply, legacy_coupon_receipts
from billing.coupon_schemas import CouponLegacyReceiptRequest
from billing.kms_schemas import KmsCheckRequest, KmsCheckReview, KmsPreviewStatus, KmsApplyRequest, KmsApplyResult
from routers.billing import today
from routers.billing_drafts import authorise_student, translated
from routers.billing_workflow import write_action

router = APIRouter()


@router.get('/billing/students/{student_id}/coupons', response_model=CouponBalance)
def read_coupon_balance(student_id: int, request: Request, tutor_id: int | None = None,
                        user: Tutor = Depends(get_current_user), db: Session = Depends(get_db)):
    authorise_student(db, student_id, request, user, tutor_id, allow_intake=True)
    return translated(lambda: accounting.balance_for_student(db, student_id, as_of=today()))


@router.post('/billing/students/{student_id}/coupons/review', response_model=CouponVerificationReview)
def review_coupon_check(student_id: int, data: CouponVerificationRequest, request: Request,
                        user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    authorise_student(db, student_id, request, user, allow_intake=True)
    return translated(lambda: accounting.review_verification(db, student_id, data, as_of=today()))


@router.post('/billing/students/{student_id}/coupons/verify', response_model=CouponBalance)
def confirm_coupon_check(student_id: int, data: CouponVerificationConfirm, request: Request,
                         user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    authorise_student(db, student_id, request, user, allow_intake=True)
    return write_action(db, user, lambda actor: accounting.verify_coupons(db, student_id, data, actor, as_of=today()))


@router.post('/billing/coupon-imports/preview', response_model=CouponImportReview)
def upload_coupon_list(file: UploadFile = File(...), branch: str = Form(...), observed_on: date = Form(...),
                       user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    content = file.file.read(coupon_imports.MAX_BYTES + 1)
    return write_action(db, user, lambda actor: coupon_imports.preview_import(
        db, content, file.filename or 'KMS-list.xlsx', branch, observed_on, actor, as_of=today()))


@router.get('/billing/coupon-imports/{import_id}', response_model=CouponImportReview)
def read_coupon_import(import_id: UUID, _user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return translated(lambda: coupon_imports.review_import(db, coupon_imports.find_import(db, import_id), as_of=today()))


@router.post('/billing/coupon-imports/{import_id}/confirm', response_model=CouponImportReview)
def confirm_coupon_import(import_id: UUID, data: CouponImportConfirm,
                          user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return write_action(db, user, lambda actor: coupon_imports.apply_import(db, import_id, data, actor, as_of=today()))


@router.get('/billing/kms-coupons/status', response_model=KmsPreviewStatus)
def kms_coupon_status(_user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return translated(lambda: kms_preview.status(db))


@router.post('/billing/kms-coupons/check', response_model=KmsCheckReview)
def check_kms_coupons(data: KmsCheckRequest, user: Tutor = Depends(require_admin_write),
                      db: Session = Depends(get_db)):
    # Only source evidence is saved. No coupon-account or payment writer runs.
    return translated(lambda: _check_kms_coupons(db, user, data.branch))


def _check_kms_coupons(db, user, branch):
    with kms_preview.check_guard(branch, db):
        return write_action(db, user, lambda actor: kms_preview.check_kms(db, branch, actor))


@router.get('/billing/kms-coupons/checks/{check_id}', response_model=KmsCheckReview)
def read_kms_coupon_check(check_id: UUID, _user: Tutor = Depends(require_admin_write),
                          db: Session = Depends(get_db)):
    return translated(lambda: kms_preview.review_check(db, kms_preview.find_check(db, check_id)))


@router.post('/billing/kms-coupons/checks/{check_id}/apply', response_model=KmsApplyResult)
def apply_kms_coupon_check(check_id: UUID, data: KmsApplyRequest,
                           user: Tutor = Depends(require_admin_write), db: Session = Depends(get_db)):
    return write_action(db, user, lambda actor: kms_apply.apply_check(db, check_id, data, actor, as_of=today()))


@router.post('/billing/students/{student_id}/coupon-uses/{use_id}/receipt', response_model=CouponBalance)
def record_legacy_coupon_receipt(student_id: int, use_id: UUID, data: CouponLegacyReceiptRequest,
                                 request: Request, user: Tutor = Depends(require_admin_write),
                                 db: Session = Depends(get_db)):
    authorise_student(db, student_id, request, user, allow_intake=True)
    return write_action(db, user, lambda actor: legacy_coupon_receipts.record_receipt(
        db, student_id, use_id, data, actor, as_of=today()))
