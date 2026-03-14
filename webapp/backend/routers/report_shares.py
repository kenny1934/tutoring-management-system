"""
Shareable parent report links — token-based, expiring snapshots.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database import get_db
from models import Tutor, ReportShare
from schemas import CreateReportShareRequest, ReportShareResponse, SharedReportData

router = APIRouter()

MAX_EXPIRY_DAYS = 90

# Fields to strip from student data before storing
SENSITIVE_STUDENT_FIELDS = {
    "id", "phone", "contacts", "home_location",
    "is_staff_referral", "staff_referral_notes",
}


@router.post("/report-shares", response_model=ReportShareResponse)
def create_report_share(
    req: CreateReportShareRequest,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):

    # Validate expiry
    days = min(max(req.expires_in_days, 1), MAX_EXPIRY_DAYS)

    # Enforce parent mode only
    config = req.report_data.get("config", {})
    if config.get("mode") == "internal":
        raise HTTPException(status_code=400, detail="Cannot share internal reports publicly")

    # Strip sensitive student fields
    student_data = req.report_data.get("student", {})
    for field in SENSITIVE_STUDENT_FIELDS:
        student_data.pop(field, None)

    token = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=days)

    share = ReportShare(
        token=token,
        report_data=req.report_data,
        created_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()

    return ReportShareResponse(
        token=token,
        expires_at=expires_at,
    )


@router.get("/report-shares/{token}", response_model=SharedReportData)
def get_shared_report(token: str, db: Session = Depends(get_db)):
    """Public endpoint — no auth required."""
    share = db.query(ReportShare).filter(ReportShare.token == token).first()

    if not share or share.revoked_at or share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Report not found or expired")

    # Increment view count
    share.view_count = (share.view_count or 0) + 1
    db.commit()

    return SharedReportData(
        report_data=share.report_data,
        created_at=share.created_at,
        expires_at=share.expires_at,
    )


@router.delete("/report-shares/{token}", status_code=204)
def revoke_report_share(
    token: str,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    share = db.query(ReportShare).filter(ReportShare.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")

    # Only creator or admin can revoke
    if share.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    share.revoked_at = datetime.utcnow()
    db.commit()
