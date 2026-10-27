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
