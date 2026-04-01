"""
Proxy router for ARK leave management API.
Forwards requests to ARK backend using service-to-service auth,
mapping the current CSM user's email to their ARK staff identity.
"""

import os
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from models import Tutor
from auth.dependencies import get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter()

ARK_API_BASE_URL = os.getenv("ARK_API_BASE_URL", "https://ark.mathconceptsecondary.academy/api")
ARK_SERVICE_TOKEN = os.getenv("ARK_SERVICE_TOKEN", "")
ARK_TIMEOUT = 10.0


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
        async with httpx.AsyncClient(timeout=ARK_TIMEOUT) as client:
            resp = await client.request(
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


# ─── Self-service endpoints (any authenticated user) ───

@router.get("/ark/leave/types")
async def ark_leave_types(current_user: Tutor = Depends(get_current_user)):
    """Leave type options for the request form."""
    return await _ark_request("GET", "/me/leave-types", current_user.user_email)


@router.get("/ark/leave/balances")
async def ark_leave_balances(
    year: Optional[int] = Query(None),
    current_user: Tutor = Depends(get_current_user),
):
    """Current user's leave balances."""
    params = {}
    if year:
        params["year"] = year
    return await _ark_request("GET", "/me/leave-balances", current_user.user_email, params=params)


@router.get("/ark/leave/my-requests")
async def ark_my_requests(
    status: Optional[str] = Query(None),
    current_user: Tutor = Depends(get_current_user),
):
    """Current user's own leave requests."""
    params = {}
    if status:
        params["status"] = status
    return await _ark_request("GET", "/me/leave-requests", current_user.user_email, params=params)


class CreateLeaveRequest(BaseModel):
    leave_type_id: int
    start_date: str  # YYYY-MM-DD
    end_date: str
    days_requested: float
    is_half_day: bool = False
    half_day_period: Optional[str] = None  # "AM" or "PM"
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


# ─── Admin endpoints ───

@router.get("/ark/leave/pending")
async def ark_pending_requests(
    current_user: Tutor = Depends(require_admin),
):
    """All pending leave requests (admin only)."""
    return await _ark_request(
        "GET", "/leave-requests", current_user.user_email,
        params={"status": "pending"},
    )


@router.get("/ark/leave/pending/count")
async def ark_pending_count(
    current_user: Tutor = Depends(require_admin),
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
