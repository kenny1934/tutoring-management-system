"""Branch revenue report endpoints (summer fee collection + Jul/Aug regular).

- GET  /summer/revenue/report        — JSON summary for the admin in-app view.
- POST /summer/revenue/sheet-refresh — rebuild the workbook and replace the
  shared Google Sheet's content. Auth: admin cookie session OR matching
  X-Cron-Secret header (Cloud Scheduler daily refresh), mirroring the
  marketing-snapshot pattern in summer_course.py.
"""
from __future__ import annotations

import logging
import os
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from database import get_db
from models import SummerCourseConfig
from schemas import BranchRevenueReportResponse, RevenueSheetRefreshResponse
from services.branch_revenue_report import (
    RevenueSheetConfigError,
    build_workbook,
    collect_report_data,
    push_workbook_to_sheet,
    report_to_summary,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_active_config(db: Session) -> SummerCourseConfig:
    config = (
        db.query(SummerCourseConfig)
        .filter(SummerCourseConfig.is_active == True)  # noqa: E712
        .first()
    )
    if config is None:
        raise HTTPException(status_code=404, detail="No active summer course found")
    return config


def _require_admin(request: Request, db: Session = Depends(get_db)) -> None:
    user = get_current_user(request, db)
    require_admin_write(request, user)


def _authorize_sheet_refresh(
    request: Request,
    db: Session = Depends(get_db),
    x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret"),
) -> None:
    """Admin cookie session OR matching X-Cron-Secret header."""
    expected = os.environ.get("REVENUE_SHEET_CRON_SECRET")
    if expected and x_cron_secret and secrets.compare_digest(x_cron_secret, expected):
        return
    user = get_current_user(request, db)
    require_admin_write(request, user)


@router.get("/summer/revenue/report", response_model=BranchRevenueReportResponse)
def get_revenue_report(
    _auth: None = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Compute the branch revenue summary for the active summer config."""
    config = _get_active_config(db)
    data = collect_report_data(db, config)
    summary = report_to_summary(data)
    summary["spreadsheet_id"] = os.environ.get("BRANCH_REVENUE_SHEET_ID")
    return summary


@router.post("/summer/revenue/sheet-refresh", response_model=RevenueSheetRefreshResponse)
def refresh_revenue_sheet(
    _auth: None = Depends(_authorize_sheet_refresh),
    db: Session = Depends(get_db),
):
    """Rebuild the revenue workbook from live data and push it to the sheet."""
    spreadsheet_id = os.environ.get("BRANCH_REVENUE_SHEET_ID")
    if not spreadsheet_id:
        raise HTTPException(
            status_code=500, detail="BRANCH_REVENUE_SHEET_ID env var is not set"
        )
    config = _get_active_config(db)
    data = collect_report_data(db, config)
    xlsx = build_workbook(data)
    try:
        result = push_workbook_to_sheet(xlsx, spreadsheet_id)
    except RevenueSheetConfigError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Revenue sheet refresh failed")
        raise HTTPException(status_code=502, detail=f"Sheet update failed: {e}")
    return RevenueSheetRefreshResponse(
        as_of=data["as_of"],
        config_id=config.id,
        spreadsheet_id=spreadsheet_id,
        sheet_name=result.get("name"),
        modified_time=result.get("modifiedTime"),
    )
