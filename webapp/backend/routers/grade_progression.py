"""Annual grade promotion endpoint.

Fires once per year on Sept 1 (HK time). Each student is promoted exactly once
per calendar year via the `last_promoted_year` idempotency key, so reruns and
out-of-order calls are safe.

Auth: admin cookie session OR matching X-Cron-Secret header (for Cloud
Scheduler), mirroring the marketing-snapshot pattern in summer_course.py.
"""

import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_write
from database import get_db
from models import Student
from utils.grades import PROMOTE_MAP

logger = logging.getLogger(__name__)
router = APIRouter()

HK_TZ = timezone(timedelta(hours=8))


def _authorize(
    request: Request,
    db: Session = Depends(get_db),
    x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret"),
) -> None:
    expected = os.environ.get("GRADE_PROMOTION_CRON_SECRET")
    if expected and x_cron_secret and secrets.compare_digest(x_cron_secret, expected):
        return
    user = get_current_user(request, db)
    require_admin_write(request, user)


class GradePromotionRequest(BaseModel):
    """Request body for the promotion endpoint.

    Modeled as a Pydantic BaseModel (not loose function args) so dry_run and
    target_year are unambiguously parsed from the JSON body. An earlier bug
    treated them as query params and silently dropped body values, causing
    a "dry-run" smoke test to actually promote students.
    """
    target_year: Optional[int] = None
    dry_run: bool = False


class GradePromotionResponse(BaseModel):
    target_year: int
    promoted_count: int
    skipped_count: int
    by_grade: dict[str, int]
    dry_run: bool


@router.post("/admin/promote-grades", response_model=GradePromotionResponse)
def promote_grades(
    body: GradePromotionRequest = GradePromotionRequest(),
    _auth: None = Depends(_authorize),
    db: Session = Depends(get_db),
) -> GradePromotionResponse:
    """Promote each student's grade once per calendar year.

    target_year defaults to today's HK year. A student is promoted iff
    last_promoted_year IS NULL OR last_promoted_year < target_year.
    """
    target_year = body.target_year
    dry_run = body.dry_run
    current_hk_year = datetime.now(HK_TZ).year
    if target_year is None:
        target_year = current_hk_year
    # Guard against fat-fingered future years that would prematurely promote
    # everyone. One year ahead is the max anyone should ever need.
    if target_year > current_hk_year + 1:
        raise HTTPException(
            status_code=400,
            detail=f"target_year {target_year} too far in the future (max {current_hk_year + 1}).",
        )

    candidates = (
        db.query(Student)
        .filter(
            (Student.last_promoted_year.is_(None))
            | (Student.last_promoted_year < target_year)
        )
        .all()
    )

    promoted_count = 0
    skipped_count = 0
    by_grade: dict[str, int] = {}

    for student in candidates:
        current = student.grade
        next_grade = PROMOTE_MAP.get(current) if current else None
        if not next_grade:
            # Graduated, unknown, or empty — nothing to promote, but stamp
            # the year anyway so they don't reappear in every annual run.
            skipped_count += 1
            if not dry_run:
                student.last_promoted_year = target_year
            continue
        by_grade[current] = by_grade.get(current, 0) + 1
        if not dry_run:
            student.grade = next_grade
            student.last_promoted_year = target_year
        promoted_count += 1

    if not dry_run:
        db.commit()
        logger.info(
            "Grade promotion %s: promoted=%d skipped=%d by_grade=%s",
            target_year, promoted_count, skipped_count, by_grade,
        )

    return GradePromotionResponse(
        target_year=target_year,
        promoted_count=promoted_count,
        skipped_count=skipped_count,
        by_grade=by_grade,
        dry_run=dry_run,
    )
