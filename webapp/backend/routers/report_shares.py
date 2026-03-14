"""
Shareable parent report links — token-based, expiring snapshots.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from database import get_db
from utils.rate_limiter import check_ip_rate_limit
from models import Tutor, ReportShare
from schemas import CreateReportShareRequest, ReportShareResponse, SharedReportData

router = APIRouter()

MAX_EXPIRY_DAYS = 90
DEDUP_WINDOW_MINUTES = 5

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

    # Dedup: reuse recent share for same student by same tutor
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=DEDUP_WINDOW_MINUTES)
    dedup_filter = [
        ReportShare.created_by == current_user.id,
        ReportShare.created_at >= cutoff,
        ReportShare.revoked_at.is_(None),
        ReportShare.expires_at > now,
    ]
    if req.student_id:
        dedup_filter.append(ReportShare.student_id == req.student_id)
    student_name = student_data.get("student_name")
    if req.student_id or student_name:
        existing = db.query(ReportShare).filter(
            *dedup_filter
        ).order_by(ReportShare.created_at.desc()).first()

        if existing:
            match = req.student_id and existing.student_id == req.student_id
            if not match:
                existing_name = existing.report_data.get("student", {}).get("student_name")
                match = existing_name == student_name
            if match:
                # Update snapshot so the link always serves the latest config
                existing.report_data = req.report_data
                db.commit()
                return ReportShareResponse(token=existing.token, expires_at=existing.expires_at)

    # Purge expired rows (lightweight, runs on create only)
    db.query(ReportShare).filter(ReportShare.expires_at < datetime.utcnow()).delete()

    token = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=days)

    share = ReportShare(
        token=token,
        report_data=req.report_data,
        student_id=req.student_id,
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
def get_shared_report(token: str, request: Request, db: Session = Depends(get_db)):
    """Public endpoint — no auth required. IP rate-limited."""
    check_ip_rate_limit(request, "report_share_view")
    share = db.query(ReportShare).filter(ReportShare.token == token).first()

    if not share or share.revoked_at or share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Report not found or expired")

    # Increment view count atomically
    db.query(ReportShare).filter(ReportShare.id == share.id).update(
        {ReportShare.view_count: ReportShare.view_count + 1}
    )
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
