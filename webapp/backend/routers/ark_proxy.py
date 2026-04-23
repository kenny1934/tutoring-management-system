"""
Proxy router for ARK leave management API.
Forwards requests to ARK backend using service-to-service auth,
mapping the current CSM user's email to their ARK staff identity.
"""

import os
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Tutor
from auth.dependencies import get_current_user, require_admin

logger = logging.getLogger(__name__)


def require_admin_or_supervisor(
    current_user: Tutor = Depends(get_current_user),
) -> Tutor:
    """
    Read-only admin access for the leave quick-link: Admin, Super Admin, or Supervisor.

    Supervisors are CSM Pro staff with read-only admin visibility on Leave
    (Review/Calendar/All Staff); write actions stay on `require_admin`.
    """
    if current_user.role not in ("Admin", "Super Admin", "Supervisor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or Supervisor access required",
        )
    return current_user

router = APIRouter()

ARK_API_BASE_URL = os.getenv("ARK_API_BASE_URL", "https://ark.mathconceptsecondary.academy/api")
ARK_SERVICE_TOKEN = os.getenv("ARK_SERVICE_TOKEN", "")
ARK_TIMEOUT = 10.0

# Shared client for connection reuse across requests
_ark_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _ark_client
    if _ark_client is None:
        _ark_client = httpx.AsyncClient(timeout=ARK_TIMEOUT)
    return _ark_client


async def shutdown_ark_client():
    """Close the shared httpx client. Called from main.py shutdown event."""
    global _ark_client
    if _ark_client is not None:
        await _ark_client.aclose()
        _ark_client = None


def _ark_headers(user_email: str) -> dict:
    """Build headers for ARK service-to-service requests."""
    return {
        "Authorization": f"Bearer {ARK_SERVICE_TOKEN}",
        "X-Acting-Email": user_email,
        "Content-Type": "application/json",
    }


async def _ark_request(method: str, path: str, user_email: str, **kwargs):
    """Make a request to ARK and return the JSON response."""
    if not ARK_SERVICE_TOKEN:
        raise HTTPException(502, detail="ARK integration not configured")

    url = f"{ARK_API_BASE_URL}{path}"
    try:
        resp = await _get_client().request(
            method, url, headers=_ark_headers(user_email), **kwargs
        )
    except httpx.RequestError:
        raise HTTPException(502, detail="ARK unavailable")

    if resp.status_code == 404:
        raise HTTPException(404, detail="ARK account not linked")
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", "ARK error")
        except Exception:
            detail = "ARK error"
        raise HTTPException(resp.status_code, detail=detail)

    if resp.status_code == 204:
        return None
    return resp.json()


def _resolve_acting_email(
    current_user: Tutor,
    as_tutor_id: Optional[int],
    db: Session,
) -> str:
    """Resolve the email to use as ARK X-Acting-Email.

    If `as_tutor_id` is provided, the caller must be a Super Admin and the
    target tutor must exist with a user_email. Used to let Super Admins view
    another tutor's read-only ARK data while impersonating them in the UI.
    """
    if as_tutor_id is None:
        return current_user.user_email

    if current_user.role != "Super Admin":
        raise HTTPException(403, detail="Only Super Admin can view another user's ARK data")

    tutor = db.query(Tutor).filter(Tutor.id == as_tutor_id).first()
    if tutor is None:
        raise HTTPException(404, detail="Tutor not found")
    if not tutor.user_email:
        raise HTTPException(400, detail="Tutor has no email on file")
    return tutor.user_email


# ─── Self-service endpoints (any authenticated user) ───

@router.get("/ark/leave/types")
async def ark_leave_types(
    as_tutor_id: Optional[int] = Query(None),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Leave type options for the request form."""
    acting_email = _resolve_acting_email(current_user, as_tutor_id, db)
    return await _ark_request("GET", "/me/leave-types", acting_email)


@router.get("/ark/leave/balances")
async def ark_leave_balances(
    year: Optional[int] = Query(None),
    as_tutor_id: Optional[int] = Query(None),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current user's leave balances (or another tutor's, for Super Admin)."""
    acting_email = _resolve_acting_email(current_user, as_tutor_id, db)
    params = {}
    if year:
        params["year"] = year
    return await _ark_request("GET", "/me/leave-balances", acting_email, params=params)


@router.get("/ark/leave/my-requests")
async def ark_my_requests(
    status: Optional[str] = Query(None),
    as_tutor_id: Optional[int] = Query(None),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current user's own leave requests (or another tutor's, for Super Admin)."""
    acting_email = _resolve_acting_email(current_user, as_tutor_id, db)
    params = {}
    if status:
        params["status"] = status
    return await _ark_request("GET", "/me/leave-requests", acting_email, params=params)


class CreateLeaveRequest(BaseModel):
    leave_type_id: int
    start_date: str  # YYYY-MM-DD
    end_date: str
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None
    days_requested: float
    reason: Optional[str] = None


@router.post("/ark/leave/my-requests", status_code=201)
async def ark_create_request(
    data: CreateLeaveRequest,
    current_user: Tutor = Depends(get_current_user),
):
    """File a leave request for the current user."""
    return await _ark_request(
        "POST", "/me/leave-requests", current_user.user_email,
        json=data.model_dump(exclude_none=True),
    )


@router.put("/ark/leave/my-requests/{request_id}/cancel")
async def ark_cancel_request(
    request_id: int,
    current_user: Tutor = Depends(get_current_user),
):
    """Cancel own pending leave request."""
    return await _ark_request(
        "PUT", f"/me/leave-requests/{request_id}/cancel", current_user.user_email,
    )


# ─── Overtime endpoints ───

@router.get("/ark/overtime/my")
async def ark_my_overtime(
    year: Optional[int] = Query(None),
    as_tutor_id: Optional[int] = Query(None),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Current user's overtime records (or another tutor's, for Super Admin)."""
    acting_email = _resolve_acting_email(current_user, as_tutor_id, db)
    params = {}
    if year:
        params["year"] = year
    return await _ark_request("GET", "/me/overtime", acting_email, params=params)


class CreateOvertimeRequest(BaseModel):
    date: str  # YYYY-MM-DD
    hours: float
    description: Optional[str] = None


@router.post("/ark/overtime/my", status_code=201)
async def ark_create_overtime(
    data: CreateOvertimeRequest,
    current_user: Tutor = Depends(get_current_user),
):
    """File an overtime record for the current user."""
    return await _ark_request(
        "POST", "/me/overtime", current_user.user_email,
        json=data.model_dump(exclude_none=True),
    )


# ─── Admin endpoints ───

@router.get("/ark/leave/calendar")
async def ark_leave_calendar(
    year: int = Query(...),
    month: int = Query(...),
    current_user: Tutor = Depends(require_admin_or_supervisor),
):
    """Team leave calendar for a month (admin/supervisor read-only)."""
    return await _ark_request(
        "GET", "/leave-calendar", current_user.user_email,
        params={"year": year, "month": month},
    )


@router.get("/ark/leave/all-balances-summary")
async def ark_all_balances_summary(
    year: Optional[int] = Query(None),
    current_user: Tutor = Depends(require_admin_or_supervisor),
):
    """All active staff's AL pool + Sick Leave summary (admin/supervisor read-only).

    Branch filtering is done client-side against `branch_code` — CSM's
    selectedLocation is a branch code (e.g. "MSA"), not a numeric id.
    """
    params = {"year": year} if year else {}
    return await _ark_request(
        "GET", "/leave-balances-summary", current_user.user_email, params=params,
    )


@router.get("/ark/leave/pending")
async def ark_pending_requests(
    current_user: Tutor = Depends(require_admin_or_supervisor),
):
    """All pending leave requests (admin/supervisor read-only)."""
    return await _ark_request(
        "GET", "/leave-requests", current_user.user_email,
        params={"status": "pending"},
    )


@router.get("/ark/leave/pending/count")
async def ark_pending_count(
    current_user: Tutor = Depends(require_admin_or_supervisor),
):
    """Count of pending leave requests (for badge)."""
    try:
        requests = await _ark_request(
            "GET", "/leave-requests", current_user.user_email,
            params={"status": "pending"},
        )
        return {"count": len(requests)}
    except HTTPException:
        return {"count": 0}


class ReviewLeaveRequest(BaseModel):
    status: str  # "approved" or "rejected"
    reviewer_note: Optional[str] = None


@router.put("/ark/leave/requests/{request_id}/review")
async def ark_review_request(
    request_id: int,
    data: ReviewLeaveRequest,
    current_user: Tutor = Depends(require_admin),
):
    """Approve or reject a leave request (admin only)."""
    return await _ark_request(
        "PUT", f"/leave-requests/{request_id}/review", current_user.user_email,
        json=data.model_dump(exclude_none=True),
    )
