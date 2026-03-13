"""
Summer course router: public application form + admin management endpoints.
"""
import logging
import secrets
import string
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    SummerCourseConfig,
    SummerBuddyGroup,
    SummerApplication,
    Tutor,
)
from schemas import (
    SummerCourseFormConfig,
    SummerApplicationCreate,
    SummerApplicationSubmitResponse,
    SummerApplicationStatusResponse,
    SummerCourseConfigCreate,
    SummerCourseConfigUpdate,
    SummerCourseConfigResponse,
    SummerApplicationResponse,
    SummerApplicationUpdate,
    SummerApplicationStats,
)
from auth.dependencies import require_admin_view, require_admin_write
from utils.rate_limiter import check_ip_rate_limit
from constants import hk_now

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_active_config(db: Session) -> SummerCourseConfig | None:
    """Get the currently active summer course config."""
    return db.query(SummerCourseConfig).filter(
        SummerCourseConfig.is_active == True  # noqa: E712
    ).first()


def _generate_reference_code(year: int) -> str:
    """Generate a random reference code like SC2025-K7X3M (no ambiguous chars)."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # excludes O/0/I/1
    code = "".join(secrets.choice(chars) for _ in range(5))
    return f"SC{year}-{code}"


def _generate_buddy_code() -> str:
    """Generate a 6-char alphanumeric buddy code like BG-7X3K."""
    chars = string.ascii_uppercase + string.digits
    code = "".join(secrets.choice(chars) for _ in range(4))
    return f"BG-{code}"


# ============================================
# Public endpoints (no auth)
# ============================================

@router.get("/summer/public/config", response_model=SummerCourseFormConfig)
def get_public_config(request: Request, db: Session = Depends(get_db)):
    """Return the active summer course config for the public form."""
    check_ip_rate_limit(request, "summer_config")
    config = _get_active_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active summer course found")
    return config


@router.post("/summer/public/apply", response_model=SummerApplicationSubmitResponse)
def submit_application(
    request: Request,
    data: SummerApplicationCreate,
    db: Session = Depends(get_db),
):
    """Submit a public summer course application."""
    check_ip_rate_limit(request, "summer_apply")

    config = _get_active_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active summer course found")

    # Check application window
    now = hk_now()
    if now < config.application_open_date or now > config.application_close_date:
        raise HTTPException(status_code=400, detail="Application period is not open")

    # Handle buddy code: join existing group or leave as None
    buddy_group_id = None
    buddy_code_out = None
    if data.buddy_code:
        group = db.query(SummerBuddyGroup).filter(
            SummerBuddyGroup.buddy_code == data.buddy_code.strip().upper(),
            SummerBuddyGroup.config_id == config.id,
        ).first()
        if not group:
            raise HTTPException(status_code=400, detail="Invalid buddy code")
        buddy_group_id = group.id
        buddy_code_out = group.buddy_code

    # Create application (reference_code generated after insert)
    app = SummerApplication(
        config_id=config.id,
        reference_code="TEMP",  # placeholder, updated below
        student_name=data.student_name.strip(),
        school=data.school.strip() if data.school else None,
        grade=data.grade.strip(),
        lang_stream=data.lang_stream,
        is_existing_student=data.is_existing_student,
        current_centers=data.current_centers,
        wechat_id=data.wechat_id.strip() if data.wechat_id else None,
        contact_phone=data.contact_phone.strip(),
        preferred_location=data.preferred_location,
        preference_1_day=data.preference_1_day,
        preference_1_time=data.preference_1_time,
        preference_2_day=data.preference_2_day,
        preference_2_time=data.preference_2_time,
        unavailability_notes=data.unavailability_notes,
        buddy_group_id=buddy_group_id,
        buddy_names=data.buddy_names,
        form_language=data.form_language or "zh",
        submitted_at=hk_now(),
    )
    # Generate unique random reference code
    for _ in range(10):
        ref = _generate_reference_code(config.year)
        existing = db.query(SummerApplication).filter(
            SummerApplication.reference_code == ref
        ).first()
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique reference code")

    app.reference_code = ref
    db.add(app)
    db.commit()

    return SummerApplicationSubmitResponse(
        reference_code=app.reference_code,
        buddy_code=buddy_code_out,
        message="Application submitted successfully",
    )


@router.get("/summer/public/status/{reference_code}", response_model=SummerApplicationStatusResponse)
def check_application_status(
    request: Request,
    reference_code: str,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Check application status by reference code + phone (for verification)."""
    check_ip_rate_limit(request, "summer_status")
    app = db.query(SummerApplication).filter(
        SummerApplication.reference_code == reference_code.strip().upper(),
        SummerApplication.contact_phone == phone.strip(),
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return SummerApplicationStatusResponse(
        reference_code=app.reference_code,
        student_name=app.student_name,
        application_status=app.application_status,
        submitted_at=app.submitted_at,
    )


@router.post("/summer/public/buddy-group")
def create_buddy_group(
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a new buddy group and return the shareable code."""
    check_ip_rate_limit(request, "summer_buddy")

    config = _get_active_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active summer course found")

    # Generate unique code (retry on collision)
    for _ in range(10):
        code = _generate_buddy_code()
        existing = db.query(SummerBuddyGroup).filter(
            SummerBuddyGroup.buddy_code == code
        ).first()
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique code")

    group = SummerBuddyGroup(config_id=config.id, buddy_code=code)
    db.add(group)
    db.commit()
    return {"buddy_code": code}


@router.get("/summer/public/buddy-group/{code}")
def get_buddy_group(
    request: Request,
    code: str,
    db: Session = Depends(get_db),
):
    """Look up a buddy group by code."""
    check_ip_rate_limit(request, "summer_buddy")
    group = db.query(SummerBuddyGroup).filter(
        SummerBuddyGroup.buddy_code == code.strip().upper()
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Buddy group not found")

    member_count = db.query(func.count(SummerApplication.id)).filter(
        SummerApplication.buddy_group_id == group.id
    ).scalar()
    return {"buddy_code": group.buddy_code, "member_count": member_count}


# ============================================
# Admin endpoints (require auth)
# ============================================

@router.get("/summer/configs", response_model=list[SummerCourseConfigResponse])
def list_configs(
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List all summer course configs."""
    configs = db.query(SummerCourseConfig).order_by(SummerCourseConfig.year.desc()).all()
    return configs


@router.post("/summer/configs", response_model=SummerCourseConfigResponse, status_code=201)
def create_config(
    data: SummerCourseConfigCreate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Create a new summer course config."""
    existing = db.query(SummerCourseConfig).filter(
        SummerCourseConfig.year == data.year
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Config for year {data.year} already exists")

    config = SummerCourseConfig(**data.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.patch("/summer/configs/{config_id}", response_model=SummerCourseConfigResponse)
def update_config(
    config_id: int,
    data: SummerCourseConfigUpdate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update an existing summer course config."""
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(config, field, value)

    # Enforce single active config
    if updates.get("is_active") is True:
        db.query(SummerCourseConfig).filter(
            SummerCourseConfig.id != config_id,
            SummerCourseConfig.is_active == True,
        ).update({"is_active": False})

    db.commit()
    db.refresh(config)
    return config


@router.get("/summer/configs/{config_id}", response_model=SummerCourseConfigResponse)
def get_config(
    config_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get a single summer course config by ID."""
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/summer/configs/{config_id}")
def delete_config(
    config_id: int,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Delete a summer course config. Cannot delete the active config."""
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    if config.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active config")
    db.delete(config)
    db.commit()
    return {"success": True}


@router.post("/summer/configs/{config_id}/clone", response_model=SummerCourseConfigResponse)
def clone_config(
    config_id: int,
    target_year: int = Query(..., description="Target year for the cloned config"),
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Clone an existing config for a new year."""
    source = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Config not found")

    # Check target year doesn't already exist
    existing = db.query(SummerCourseConfig).filter(SummerCourseConfig.year == target_year).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Config for year {target_year} already exists")

    year_diff = target_year - source.year

    from dateutil.relativedelta import relativedelta

    clone = SummerCourseConfig(
        year=target_year,
        title=source.title.replace(str(source.year), str(target_year)),
        description=source.description,
        application_open_date=source.application_open_date + relativedelta(years=year_diff),
        application_close_date=source.application_close_date + relativedelta(years=year_diff),
        course_start_date=source.course_start_date + relativedelta(years=year_diff),
        course_end_date=source.course_end_date + relativedelta(years=year_diff),
        total_lessons=source.total_lessons,
        pricing_config=source.pricing_config,
        locations=source.locations,
        available_grades=source.available_grades,
        time_slots=source.time_slots,
        existing_student_options=source.existing_student_options,
        center_options=source.center_options,
        text_content=source.text_content,
        banner_image_url=source.banner_image_url,
        is_active=False,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


@router.get("/summer/applications", response_model=list[SummerApplicationResponse])
def list_applications(
    config_id: Optional[int] = None,
    application_status: Optional[str] = None,
    grade: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List summer applications with optional filters."""
    q = db.query(SummerApplication).options(joinedload(SummerApplication.buddy_group))

    if config_id:
        q = q.filter(SummerApplication.config_id == config_id)
    if application_status:
        q = q.filter(SummerApplication.application_status == application_status)
    if grade:
        q = q.filter(SummerApplication.grade == grade)
    if location:
        q = q.filter(SummerApplication.preferred_location == location)
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            (SummerApplication.student_name.ilike(pattern))
            | (SummerApplication.reference_code.ilike(pattern))
            | (SummerApplication.contact_phone.ilike(pattern))
        )

    return q.order_by(SummerApplication.submitted_at.desc()).all()


@router.get("/summer/applications/stats", response_model=SummerApplicationStats)
def get_application_stats(
    config_id: Optional[int] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get aggregate stats for summer applications."""
    filters = []
    if config_id:
        filters.append(SummerApplication.config_id == config_id)

    total = db.query(func.count(SummerApplication.id)).filter(*filters).scalar() or 0

    by_status = dict(
        db.query(SummerApplication.application_status, func.count(SummerApplication.id))
        .filter(*filters)
        .group_by(SummerApplication.application_status)
        .all()
    )
    by_grade = dict(
        db.query(SummerApplication.grade, func.count(SummerApplication.id))
        .filter(*filters)
        .group_by(SummerApplication.grade)
        .all()
    )
    by_location = dict(
        db.query(
            func.coalesce(SummerApplication.preferred_location, "Unknown"),
            func.count(SummerApplication.id),
        )
        .filter(*filters)
        .group_by(SummerApplication.preferred_location)
        .all()
    )

    return SummerApplicationStats(
        total=total,
        by_status=by_status,
        by_grade=by_grade,
        by_location=by_location,
    )


@router.get("/summer/applications/{app_id}", response_model=SummerApplicationResponse)
def get_application(
    app_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get a single application by ID."""
    app = db.query(SummerApplication).options(
        joinedload(SummerApplication.buddy_group)
    ).filter(SummerApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.patch("/summer/applications/{app_id}", response_model=SummerApplicationResponse)
def update_application(
    app_id: int,
    data: SummerApplicationUpdate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update application status/notes (admin)."""
    app = db.query(SummerApplication).filter(SummerApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    updates = data.model_dump(exclude_unset=True)

    # Track reviewer when status changes
    if "application_status" in updates:
        updates["reviewed_by"] = admin.tutor_name or "admin"
        updates["reviewed_at"] = hk_now()

    for field, value in updates.items():
        setattr(app, field, value)

    db.commit()
    db.refresh(app)
    return app
