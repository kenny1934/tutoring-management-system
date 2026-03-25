"""
Primary Prospect router: P6 student feeder list management.
Public endpoints for branch tutor submissions + admin endpoints for tracking/matching.
"""
import hmac
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, case
from sqlalchemy.orm import Session, joinedload

from constants import hk_now
from database import get_db
from models import PrimaryProspect, SummerApplication, SummerCourseConfig
from schemas import (
    PrimaryProspectBulkCreate,
    PrimaryProspectUpdate,
    PrimaryProspectAdminUpdate,
    PrimaryProspectResponse,
    PrimaryProspectBulkOutreach,
    PrimaryProspectStats,
    PrimaryProspectMatchResult,
)
from auth.dependencies import require_admin_view, require_admin_write
from utils.rate_limiter import check_ip_rate_limit, clear_ip_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prospects")

VALID_BRANCHES = {"MAC", "MCP", "MNT", "MTA", "MLT", "MTR", "MOT"}

BRANCH_PINS = {
    branch: os.getenv(f"PROSPECT_PIN_{branch}", "")
    for branch in VALID_BRANCHES
}
_empty_pins = [b for b, p in BRANCH_PINS.items() if not p]
if _empty_pins:
    logger.warning("Missing PROSPECT_PIN env vars for branches: %s — PIN auth will fail for these", ", ".join(_empty_pins))
VALID_OUTREACH = {"Not Started", "WeChat - Not Found", "WeChat - Cannot Add", "WeChat - Added", "Called", "No Response"}
VALID_STATUS = {"New", "Contacted", "Interested", "Applied", "Enrolled", "Declined"}



# ---- Helpers ----

def _check_pin(request: Request, branch: str):
    """Validate X-Branch-Pin header for public prospect endpoints."""
    pin = request.headers.get("X-Branch-Pin", "")
    expected = BRANCH_PINS.get(branch, "")
    if not expected or not hmac.compare_digest(pin, expected):
        check_ip_rate_limit(request, f"prospects_pin_header:{branch}")
        logger.warning("Failed PIN attempt for branch %s from %s", branch, request.client.host if request.client else "unknown")
        raise HTTPException(status_code=403, detail="Invalid or missing branch PIN")

def _prospect_to_response(p: PrimaryProspect) -> dict:
    """Convert a PrimaryProspect ORM object to response dict with matched application info."""
    data = {
        "id": p.id,
        "year": p.year,
        "source_branch": p.source_branch,
        "primary_student_id": p.primary_student_id,
        "student_name": p.student_name,
        "school": p.school,
        "grade": p.grade,
        "tutor_name": p.tutor_name,
        "phone_1": p.phone_1,
        "phone_1_relation": p.phone_1_relation,
        "phone_2": p.phone_2,
        "phone_2_relation": p.phone_2_relation,
        "wechat_id": p.wechat_id,
        "tutor_remark": p.tutor_remark,
        "wants_summer": p.wants_summer,
        "wants_regular": p.wants_regular,
        "preferred_branches": p.preferred_branches or [],
        "preferred_time_note": p.preferred_time_note,
        "preferred_tutor_note": p.preferred_tutor_note,
        "sibling_info": p.sibling_info,
        "outreach_status": p.outreach_status,
        "contact_notes": p.contact_notes,
        "status": p.status,
        "summer_application_id": p.summer_application_id,
        "submitted_at": p.submitted_at,
        "updated_at": p.updated_at,
        "edit_history": p.edit_history or [],
        "matched_application_ref": None,
        "matched_application_status": None,
    }
    if p.summer_application:
        data["matched_application_ref"] = p.summer_application.reference_code
        data["matched_application_status"] = p.summer_application.application_status
    return data


# ---- Public endpoints (PIN-protected) ----

class _VerifyPinRequest(BaseModel):
    branch: str
    pin: str

@router.post("/verify-pin")
def verify_pin(request: Request, payload: _VerifyPinRequest):
    """Verify a branch PIN without fetching data."""
    if payload.branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    check_ip_rate_limit(request, f"prospects_verify_pin:{payload.branch}")
    expected = BRANCH_PINS.get(payload.branch, "")
    if not expected or not hmac.compare_digest(payload.pin, expected):
        logger.warning("Failed PIN verification for branch %s from %s", payload.branch, request.client.host if request.client else "unknown")
        raise HTTPException(status_code=403, detail="Invalid PIN")
    clear_ip_rate_limit(request, f"prospects_verify_pin:{payload.branch}")
    return {"valid": True}


@router.post("/bulk")
def bulk_create_prospects(
    request: Request,
    payload: PrimaryProspectBulkCreate,
    db: Session = Depends(get_db),
):
    """Bulk create prospects from paste form submission."""
    check_ip_rate_limit(request, "prospects_bulk_create")
    if payload.source_branch not in VALID_BRANCHES:
        raise HTTPException(403, "Invalid or missing branch PIN")
    _check_pin(request, payload.source_branch)
    if not payload.prospects:
        raise HTTPException(400, "No prospects provided")
    if len(payload.prospects) > 200:
        raise HTTPException(400, "Cannot submit more than 200 prospects per request")

    created = []
    for item in payload.prospects:
        prospect = PrimaryProspect(
            year=payload.year,
            source_branch=payload.source_branch,
            primary_student_id=item.primary_student_id,
            student_name=item.student_name,
            school=item.school,
            grade=item.grade,
            tutor_name=item.tutor_name,
            phone_1=item.phone_1,
            phone_1_relation=item.phone_1_relation,
            phone_2=item.phone_2,
            phone_2_relation=item.phone_2_relation,
            wechat_id=item.wechat_id,
            tutor_remark=item.tutor_remark,
            wants_summer=item.wants_summer or 'Considering',
            wants_regular=item.wants_regular or 'Considering',
            preferred_branches=item.preferred_branches or [],
            preferred_time_note=item.preferred_time_note,
            preferred_tutor_note=item.preferred_tutor_note,
            sibling_info=item.sibling_info,
            submitted_at=hk_now(),
        )
        db.add(prospect)
        created.append(prospect)

    db.commit()
    for p in created:
        db.refresh(p)

    return {"created": len(created)}


@router.get("")
def list_prospects(
    request: Request,
    branch: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    """List prospects for a branch (PIN-protected — for branch tutors to view their submissions)."""
    check_ip_rate_limit(request, "prospects_list")
    if branch not in VALID_BRANCHES:
        raise HTTPException(403, "Invalid or missing branch PIN")
    _check_pin(request, branch)

    prospects = (
        db.query(PrimaryProspect)
        .options(joinedload(PrimaryProspect.summer_application))
        .filter(PrimaryProspect.source_branch == branch, PrimaryProspect.year == year)
        .order_by(PrimaryProspect.id)
        .all()
    )
    return [_prospect_to_response(p) for p in prospects]


@router.patch("/{prospect_id}")
def update_prospect(
    request: Request,
    prospect_id: int,
    payload: PrimaryProspectUpdate,
    branch: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    """Update a single prospect (PIN-protected — branch tutor edit with history tracking)."""
    check_ip_rate_limit(request, "prospects_update")
    if branch not in VALID_BRANCHES:
        raise HTTPException(403, "Invalid or missing branch PIN")
    _check_pin(request, branch)
    prospect = db.query(PrimaryProspect).filter(PrimaryProspect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(404, "Prospect not found")
    if prospect.source_branch != branch:
        raise HTTPException(403, "Cannot edit prospects from another branch")
    if prospect.year != year:
        raise HTTPException(403, "Year mismatch")

    changes = []
    update_data = payload.model_dump(exclude_unset=True)
    for field, new_value in update_data.items():
        old_value = getattr(prospect, field)
        if old_value != new_value:
            changes.append({
                "timestamp": hk_now().isoformat(),
                "field": field,
                "old_value": str(old_value) if old_value is not None else None,
                "new_value": str(new_value) if new_value is not None else None,
            })
            setattr(prospect, field, new_value)

    if changes:
        history = list(prospect.edit_history or [])
        history.extend(changes)
        prospect.edit_history = history
        prospect.updated_at = hk_now()

    db.commit()
    db.refresh(prospect)
    return _prospect_to_response(prospect)


@router.delete("/{prospect_id}")
def delete_prospect(
    request: Request,
    prospect_id: int,
    branch: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    """Delete a prospect (PIN-protected — tutor correcting mistakes)."""
    check_ip_rate_limit(request, "prospects_delete")
    if branch not in VALID_BRANCHES:
        raise HTTPException(403, "Invalid or missing branch PIN")
    _check_pin(request, branch)
    prospect = db.query(PrimaryProspect).filter(PrimaryProspect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(404, "Prospect not found")
    if prospect.source_branch != branch:
        raise HTTPException(403, "Cannot delete prospects from another branch")
    if prospect.year != year:
        raise HTTPException(403, "Year mismatch")
    db.delete(prospect)
    db.commit()
    return {"deleted": True}


# ---- Admin endpoints (auth required) ----

@router.get("/admin")
def admin_list_prospects(
    year: int = Query(...),
    branch: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    outreach_status: Optional[str] = Query(None),
    wants_summer: Optional[str] = Query(None),
    wants_regular: Optional[str] = Query(None),
    linked: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin_view),
):
    """Admin list with filters."""
    q = db.query(PrimaryProspect).filter(PrimaryProspect.year == year)

    if branch:
        q = q.filter(PrimaryProspect.source_branch == branch)
    if status:
        q = q.filter(PrimaryProspect.status == status)
    if outreach_status:
        q = q.filter(PrimaryProspect.outreach_status == outreach_status)
    if wants_summer:
        q = q.filter(PrimaryProspect.wants_summer == wants_summer)
    if wants_regular:
        q = q.filter(PrimaryProspect.wants_regular == wants_regular)
    if linked == "linked":
        q = q.filter(PrimaryProspect.summer_application_id.isnot(None))
    elif linked == "unlinked":
        q = q.filter(PrimaryProspect.summer_application_id.is_(None))
    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            PrimaryProspect.student_name.ilike(term),
            PrimaryProspect.phone_1.ilike(term),
            PrimaryProspect.phone_2.ilike(term),
            PrimaryProspect.school.ilike(term),
            PrimaryProspect.primary_student_id.ilike(term),
        ))

    prospects = q.options(joinedload(PrimaryProspect.summer_application)).order_by(PrimaryProspect.source_branch, PrimaryProspect.id).all()
    return [_prospect_to_response(p) for p in prospects]


@router.patch("/{prospect_id}/admin")
def admin_update_prospect(
    prospect_id: int,
    payload: PrimaryProspectAdminUpdate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin_write),
):
    """Admin update: outreach status, status, contact notes, application linking."""
    prospect = db.query(PrimaryProspect).filter(PrimaryProspect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(404, "Prospect not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "outreach_status" in update_data and update_data["outreach_status"] not in VALID_OUTREACH:
        raise HTTPException(400, f"Invalid outreach_status: {update_data['outreach_status']}")
    if "status" in update_data and update_data["status"] not in VALID_STATUS:
        raise HTTPException(400, f"Invalid status: {update_data['status']}")

    # Handle unlinking (setting to None/0)
    if "summer_application_id" in update_data:
        app_id = update_data["summer_application_id"]
        if app_id and app_id > 0:
            app = db.query(SummerApplication).filter(SummerApplication.id == app_id).first()
            if not app:
                raise HTTPException(404, "Summer application not found")
        else:
            update_data["summer_application_id"] = None

    for field, value in update_data.items():
        setattr(prospect, field, value)

    db.commit()
    db.refresh(prospect)
    return _prospect_to_response(prospect)


@router.post("/admin/bulk-outreach")
def admin_bulk_outreach(
    payload: PrimaryProspectBulkOutreach,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin_write),
):
    """Bulk update outreach status for multiple prospects."""
    if payload.outreach_status not in VALID_OUTREACH:
        raise HTTPException(400, f"Invalid outreach_status: {payload.outreach_status}")

    updated = (
        db.query(PrimaryProspect)
        .filter(PrimaryProspect.id.in_(payload.ids))
        .update({PrimaryProspect.outreach_status: payload.outreach_status}, synchronize_session="fetch")
    )
    db.commit()
    return {"updated": updated}


@router.get("/admin/stats")
def admin_prospect_stats(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin_view),
):
    """Funnel stats per branch."""
    rows = (
        db.query(
            PrimaryProspect.source_branch,
            func.count().label("total"),
            func.sum(case((PrimaryProspect.wants_summer == 'Yes', 1), else_=0)).label("wants_summer_yes"),
            func.sum(case((PrimaryProspect.wants_summer == 'Considering', 1), else_=0)).label("wants_summer_considering"),
            func.sum(case((PrimaryProspect.wants_regular == 'Yes', 1), else_=0)).label("wants_regular_yes"),
            func.sum(case((PrimaryProspect.wants_regular == 'Considering', 1), else_=0)).label("wants_regular_considering"),
            func.sum(case((PrimaryProspect.summer_application_id.isnot(None), 1), else_=0)).label("matched_to_application"),
            func.sum(case((PrimaryProspect.outreach_status == 'Not Started', 1), else_=0)).label("outreach_not_started"),
            func.sum(case((PrimaryProspect.outreach_status == 'WeChat - Added', 1), else_=0)).label("outreach_wechat_added"),
            func.sum(case((PrimaryProspect.outreach_status == 'WeChat - Not Found', 1), else_=0)).label("outreach_wechat_not_found"),
            func.sum(case((PrimaryProspect.outreach_status == 'WeChat - Cannot Add', 1), else_=0)).label("outreach_wechat_cannot_add"),
            func.sum(case((PrimaryProspect.outreach_status == 'Called', 1), else_=0)).label("outreach_called"),
            func.sum(case((PrimaryProspect.outreach_status == 'No Response', 1), else_=0)).label("outreach_no_response"),
        )
        .filter(PrimaryProspect.year == year)
        .group_by(PrimaryProspect.source_branch)
        .all()
    )

    return [
        PrimaryProspectStats(
            branch=r.source_branch,
            total=r.total,
            wants_summer_yes=r.wants_summer_yes or 0,
            wants_summer_considering=r.wants_summer_considering or 0,
            wants_regular_yes=r.wants_regular_yes or 0,
            wants_regular_considering=r.wants_regular_considering or 0,
            matched_to_application=r.matched_to_application or 0,
            outreach_not_started=r.outreach_not_started or 0,
            outreach_wechat_added=r.outreach_wechat_added or 0,
            outreach_wechat_not_found=r.outreach_wechat_not_found or 0,
            outreach_wechat_cannot_add=r.outreach_wechat_cannot_add or 0,
            outreach_called=r.outreach_called or 0,
            outreach_no_response=r.outreach_no_response or 0,
        )
        for r in rows
    ]


@router.get("/admin/match/{prospect_id}")
def admin_find_matches(
    prospect_id: int,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin_view),
):
    """Find summer applications matching a prospect by phone."""
    prospect = db.query(PrimaryProspect).filter(PrimaryProspect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(404, "Prospect not found")

    phones = [p for p in [prospect.phone_1, prospect.phone_2] if p]
    if not phones:
        return PrimaryProspectMatchResult(prospect_id=prospect_id, matches=[])

    apps = (
        db.query(SummerApplication)
        .join(SummerCourseConfig, SummerApplication.config_id == SummerCourseConfig.id)
        .filter(
            SummerApplication.contact_phone.in_(phones),
            SummerCourseConfig.year == prospect.year,
        )
        .all()
    )

    matches = []
    for app in apps:
        match_type = "phone"
        if prospect.student_name and app.student_name:
            # Check if names share common parts
            p_parts = set(prospect.student_name.lower().split())
            a_parts = set(app.student_name.lower().split())
            if p_parts & a_parts:
                match_type = "phone+name"
        matches.append({
            "application_id": app.id,
            "reference_code": app.reference_code,
            "student_name": app.student_name,
            "contact_phone": app.contact_phone,
            "application_status": app.application_status,
            "match_type": match_type,
        })

    return PrimaryProspectMatchResult(prospect_id=prospect_id, matches=matches)


@router.post("/admin/auto-match")
def admin_auto_match(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin_write),
):
    """Batch auto-match all unlinked prospects against summer applications by phone."""
    unlinked = (
        db.query(PrimaryProspect)
        .filter(
            PrimaryProspect.year == year,
            PrimaryProspect.summer_application_id.is_(None),
        )
        .all()
    )

    if not unlinked:
        return {"matched": 0, "total_unlinked": 0}

    # Collect all phones from unlinked prospects
    phone_to_prospects: dict[str, list[PrimaryProspect]] = {}
    for p in unlinked:
        for phone in [p.phone_1, p.phone_2]:
            if phone:
                phone_to_prospects.setdefault(phone, []).append(p)

    if not phone_to_prospects:
        return {"matched": 0, "total_unlinked": len(unlinked)}

    # Find all applications with matching phones, filtered to same year
    apps = (
        db.query(SummerApplication)
        .join(SummerCourseConfig, SummerApplication.config_id == SummerCourseConfig.id)
        .filter(
            SummerApplication.contact_phone.in_(phone_to_prospects.keys()),
            SummerCourseConfig.year == year,
        )
        .all()
    )

    # Group applications by phone to detect ambiguity
    apps_by_phone: dict[str, list] = {}
    for app in apps:
        apps_by_phone.setdefault(app.contact_phone, []).append(app)

    matched_count = 0
    skipped_ambiguous = 0
    for phone, phone_apps in apps_by_phone.items():
        prospects = phone_to_prospects.get(phone, [])
        # Skip ambiguous: multiple prospects or multiple apps for same phone
        if len(prospects) > 1 or len(phone_apps) > 1:
            skipped_ambiguous += len(prospects)
            continue
        prospect = prospects[0]
        app = phone_apps[0]
        if prospect.summer_application_id is None:
            prospect.summer_application_id = app.id
            if prospect.status == 'New':
                prospect.status = 'Applied'
            matched_count += 1

    db.commit()
    return {"matched": matched_count, "total_unlinked": len(unlinked), "skipped_ambiguous": skipped_ambiguous}
