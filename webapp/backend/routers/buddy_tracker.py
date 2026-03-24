"""
Buddy Tracker router: PIN-gated self-service for primary branch staff
to track buddy group registrations for summer courses.
"""
import hmac
import logging
import os
import secrets
import string
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import SummerApplication, SummerBuddyGroup, SummerBuddyMember
from schemas import (
    BuddyGroupLookupResponse,
    BuddyGroupMemberInfo,
    BuddyMemberCreate,
    BuddyMemberResponse,
    BuddyMemberUpdate,
)
from auth.dependencies import require_admin_view
from utils.rate_limiter import check_ip_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/buddy-tracker")

VALID_BRANCHES = {"MAC", "MCP", "MNT", "MTA", "MLT", "MTR", "MOT"}

BRANCH_PINS = {
    branch: os.getenv(f"BUDDY_PIN_{branch}", "") or os.getenv(f"PROSPECT_PIN_{branch}", "")
    for branch in VALID_BRANCHES
}
_empty_pins = [b for b, p in BRANCH_PINS.items() if not p]
if _empty_pins:
    logger.warning("Missing BUDDY_PIN/PROSPECT_PIN env vars for branches: %s — PIN auth will fail for these", ", ".join(_empty_pins))


# ---- Helpers ----

def _check_pin(request: Request, branch: str):
    """Validate X-Branch-Pin header for buddy tracker endpoints."""
    pin = request.headers.get("X-Branch-Pin", "")
    expected = BRANCH_PINS.get(branch, "")
    if not expected or not hmac.compare_digest(pin, expected):
        logger.warning("Failed buddy PIN attempt for branch %s from %s", branch, request.client.host if request.client else "unknown")
        raise HTTPException(status_code=403, detail="Invalid or missing branch PIN")


def _generate_buddy_code() -> str:
    """Generate a 6-char alphanumeric buddy code like BG-7X3K."""
    chars = string.ascii_uppercase + string.digits
    code = "".join(secrets.choice(chars) for _ in range(4))
    return f"BG-{code}"


def _get_group_members(db: Session, group_id: int, exclude_member_id: Optional[int] = None) -> list[BuddyGroupMemberInfo]:
    """Get all members of a buddy group (both primary and secondary)."""
    members: list[BuddyGroupMemberInfo] = []

    # Primary members (from summer_buddy_members)
    primary = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.buddy_group_id == group_id,
    ).all()
    for m in primary:
        if exclude_member_id and m.id == exclude_member_id:
            continue
        members.append(BuddyGroupMemberInfo(
            id=m.id,
            name=m.student_name_en,
            student_id=m.student_id,
            branch=m.source_branch,
            source="primary",
            is_sibling=m.is_sibling,
        ))

    # Secondary members (from summer_applications)
    secondary = db.query(SummerApplication).filter(
        SummerApplication.buddy_group_id == group_id,
        SummerApplication.application_status.notin_(["Withdrawn", "Rejected"]),
    ).all()
    for a in secondary:
        members.append(BuddyGroupMemberInfo(
            id=a.id,
            name=a.student_name,
            student_id=None,
            branch="Secondary",
            source="secondary",
            is_sibling=False,
        ))

    return members


def _get_group_size(db: Session, group_id: int) -> int:
    """Count total members in a buddy group (primary + secondary)."""
    primary_count = db.query(func.count(SummerBuddyMember.id)).filter(
        SummerBuddyMember.buddy_group_id == group_id,
    ).scalar() or 0
    secondary_count = db.query(func.count(SummerApplication.id)).filter(
        SummerApplication.buddy_group_id == group_id,
        SummerApplication.application_status.notin_(["Withdrawn", "Rejected"]),
    ).scalar() or 0
    return primary_count + secondary_count


def _member_to_response(db: Session, member: SummerBuddyMember) -> dict:
    """Convert a SummerBuddyMember to response dict."""
    group = member.buddy_group
    all_members = _get_group_members(db, group.id, exclude_member_id=member.id)
    group_size = len(all_members) + 1  # include self
    return {
        "id": member.id,
        "buddy_group_id": member.buddy_group_id,
        "student_id": member.student_id,
        "student_name_en": member.student_name_en,
        "student_name_zh": member.student_name_zh,
        "parent_phone": member.parent_phone,
        "source_branch": member.source_branch,
        "is_sibling": member.is_sibling,
        "year": member.year,
        "created_at": member.created_at,
        "updated_at": member.updated_at,
        "buddy_code": group.buddy_code,
        "group_size": group_size,
        "group_members": [m.model_dump() for m in all_members],
    }


# ---- Public endpoints (PIN-protected) ----

class _VerifyPinRequest(BaseModel):
    branch: str
    pin: str


@router.post("/verify-pin")
def verify_pin(request: Request, payload: _VerifyPinRequest):
    """Verify a branch PIN for buddy tracker access."""
    if payload.branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    expected = BRANCH_PINS.get(payload.branch, "")
    if not expected or not hmac.compare_digest(payload.pin, expected):
        check_ip_rate_limit(request, "buddy_verify_pin")  # Only count failures
        logger.warning("Failed buddy PIN verification for branch %s from %s", payload.branch, request.client.host if request.client else "unknown")
        raise HTTPException(status_code=403, detail="Invalid PIN")
    return {"valid": True}


@router.get("/members")
def list_members(
    request: Request,
    branch: str = Query(...),
    year: int = Query(...),
    db: Session = Depends(get_db),
):
    """List all buddy members for a branch and year, with group info."""
    if branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    _check_pin(request, branch)
    check_ip_rate_limit(request, "buddy_list")

    members = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.source_branch == branch,
        SummerBuddyMember.year == year,
    ).order_by(SummerBuddyMember.created_at.desc()).all()

    # Also include members from other branches that are in groups with our branch's members
    # (cross-branch siblings) — we need their group IDs
    our_group_ids = {m.buddy_group_id for m in members}

    # Build response
    result = []
    for m in members:
        result.append(_member_to_response(db, m))

    # Also fetch cross-branch sibling entries that are in our groups but from other branches
    if our_group_ids:
        cross_branch = db.query(SummerBuddyMember).filter(
            SummerBuddyMember.buddy_group_id.in_(our_group_ids),
            SummerBuddyMember.source_branch != branch,
        ).all()
        for m in cross_branch:
            result.append(_member_to_response(db, m))

    return result


@router.post("/members")
def create_member(
    request: Request,
    data: BuddyMemberCreate,
    db: Session = Depends(get_db),
):
    """Add a student to the buddy tracker, optionally joining an existing group."""
    if data.source_branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    _check_pin(request, data.source_branch)
    check_ip_rate_limit(request, "buddy_create")

    if data.buddy_code:
        # Join existing group
        group = db.query(SummerBuddyGroup).filter(
            SummerBuddyGroup.buddy_code == data.buddy_code.strip().upper(),
        ).first()
        if not group:
            raise HTTPException(status_code=404, detail="Buddy code not found")

        # Check for cross-branch members
        existing_primary = db.query(SummerBuddyMember).filter(
            SummerBuddyMember.buddy_group_id == group.id,
            SummerBuddyMember.source_branch != data.source_branch,
        ).all()
        existing_secondary = db.query(SummerApplication).filter(
            SummerApplication.buddy_group_id == group.id,
            SummerApplication.application_status.notin_(["Withdrawn", "Rejected"]),
        ).all()

        has_cross_branch = len(existing_primary) > 0 or len(existing_secondary) > 0
        if has_cross_branch and not data.is_sibling:
            # Return existing members so frontend can show them for confirmation
            all_members = _get_group_members(db, group.id)
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "CROSS_BRANCH_SIBLING_REQUIRED",
                    "message": "This group has members from another branch. Cross-branch groups are for siblings only.",
                    "existing_members": [m.model_dump() for m in all_members],
                },
            )
    else:
        # Create new group with collision-safe retry
        for _ in range(10):
            code = _generate_buddy_code()
            group = SummerBuddyGroup(config_id=None, year=data.year, buddy_code=code)
            db.add(group)
            try:
                db.flush()
                break
            except IntegrityError:
                db.rollback()
        else:
            raise HTTPException(status_code=500, detail="Could not generate unique buddy code")

    member = SummerBuddyMember(
        buddy_group_id=group.id,
        student_id=data.student_id.strip(),
        student_name_en=data.student_name_en.strip(),
        student_name_zh=data.student_name_zh.strip() if data.student_name_zh else None,
        parent_phone=data.parent_phone.strip() if data.parent_phone else None,
        source_branch=data.source_branch,
        is_sibling=data.is_sibling,
        year=data.year,
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    return _member_to_response(db, member)


@router.patch("/members/{member_id}")
def update_member(
    request: Request,
    member_id: int,
    data: BuddyMemberUpdate,
    branch: str = Query(...),
    db: Session = Depends(get_db),
):
    """Update a buddy member's details."""
    if branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    _check_pin(request, branch)
    check_ip_rate_limit(request, "buddy_update")

    member = db.query(SummerBuddyMember).filter(SummerBuddyMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.source_branch != branch:
        raise HTTPException(status_code=403, detail="Cannot edit member from another branch")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(member, field, value)

    db.commit()
    db.refresh(member)
    return _member_to_response(db, member)


@router.delete("/members/{member_id}")
def delete_member(
    request: Request,
    member_id: int,
    branch: str = Query(...),
    db: Session = Depends(get_db),
):
    """Delete a buddy member. Cleans up empty groups."""
    if branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    _check_pin(request, branch)
    check_ip_rate_limit(request, "buddy_delete")

    member = db.query(SummerBuddyMember).filter(SummerBuddyMember.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.source_branch != branch:
        raise HTTPException(status_code=403, detail="Cannot delete member from another branch")

    group_id = member.buddy_group_id
    db.delete(member)
    db.flush()

    # Clean up empty group (no primary members AND no secondary applications)
    remaining_primary = db.query(func.count(SummerBuddyMember.id)).filter(
        SummerBuddyMember.buddy_group_id == group_id,
    ).scalar() or 0
    remaining_secondary = db.query(func.count(SummerApplication.id)).filter(
        SummerApplication.buddy_group_id == group_id,
        SummerApplication.application_status.notin_(["Withdrawn", "Rejected"]),
    ).scalar() or 0

    if remaining_primary == 0 and remaining_secondary == 0:
        group = db.query(SummerBuddyGroup).filter(SummerBuddyGroup.id == group_id).first()
        if group:
            db.delete(group)

    db.commit()
    return {"deleted": True}


@router.get("/groups/{code}")
def lookup_group(
    request: Request,
    code: str,
    branch: str = Query(...),
    db: Session = Depends(get_db),
):
    """Look up a buddy group by code. Requires PIN auth."""
    if branch not in VALID_BRANCHES:
        raise HTTPException(status_code=400, detail="Invalid branch")
    _check_pin(request, branch)
    check_ip_rate_limit(request, "buddy_lookup")

    group = db.query(SummerBuddyGroup).filter(
        SummerBuddyGroup.buddy_code == code.strip().upper(),
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Buddy code not found")

    members = _get_group_members(db, group.id)
    return BuddyGroupLookupResponse(
        buddy_code=group.buddy_code,
        year=group.year,
        members=members,
        total_size=len(members),
    )


# ---- Admin endpoints (JWT auth, no PIN) ----

@router.get("/admin/groups/{code}")
def admin_lookup_group(
    code: str,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Admin: look up a buddy group by code. Returns primary members."""
    group = db.query(SummerBuddyGroup).filter(
        SummerBuddyGroup.buddy_code == code.strip().upper(),
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Buddy code not found")

    members = _get_group_members(db, group.id)
    return BuddyGroupLookupResponse(
        buddy_code=group.buddy_code,
        year=group.year,
        members=members,
        total_size=len(members),
    )
