"""
Summer course router: public application form + admin management endpoints.
"""
import logging
import secrets
import string
from datetime import date as date_type, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, contains_eager

from database import get_db
from models import (
    SummerCourseConfig,
    SummerBuddyGroup,
    SummerApplication,
    SummerCourseSlot,
    SummerSession,
    SummerLesson,
    SummerTutorDuty,
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
    SummerSlotCreate,
    SummerSlotUpdate,
    SummerSlotResponse,
    SummerSlotSessionInfo,
    SummerSessionCreate,
    SummerSessionStatusUpdate,
    SummerSessionResponse,
    SummerLessonResponse,
    SummerLessonUpdate,
    SummerLessonCalendarEntry,
    SummerLessonCalendarResponse,
    SummerFindSlotResult,
    SummerDemandResponse,
    SummerDemandCell,
    SummerSuggestRequest,
    SummerSuggestResponse,
    SummerSuggestionItem,
    SummerTutorDutyBulkSet,
    SummerTutorDutyResponse,
    SummerApplicationSessionInfo,
)
from auth.dependencies import require_admin_view, require_admin_write
from utils.rate_limiter import check_ip_rate_limit
from constants import hk_now, SummerApplicationStatus

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


def _build_application_response(app: SummerApplication) -> SummerApplicationResponse:
    """Build application response with embedded session info."""
    sessions = []
    for s in (app.sessions or []):
        if s.session_status == "Cancelled":
            continue
        slot = s.slot
        sessions.append(SummerApplicationSessionInfo(
            id=s.id,
            slot_id=s.slot_id,
            slot_day=slot.slot_day if slot else "",
            time_slot=slot.time_slot if slot else "",
            grade=slot.grade if slot else None,
            tutor_name=slot.tutor.tutor_name if slot and slot.tutor else None,
            session_status=s.session_status,
        ))
    data = {col.key: getattr(app, col.key) for col in app.__table__.columns}
    data["sessions"] = sessions
    return SummerApplicationResponse.model_validate(data)


@router.get("/summer/applications", response_model=list[SummerApplicationResponse])
def list_applications(
    config_id: Optional[int] = None,
    application_status: Optional[str] = None,
    grade: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    buddy_group_id: Optional[int] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List summer applications with optional filters."""
    q = db.query(SummerApplication).options(
        joinedload(SummerApplication.buddy_group),
        joinedload(SummerApplication.sessions)
            .joinedload(SummerSession.slot)
            .joinedload(SummerCourseSlot.tutor),
    )

    if config_id:
        q = q.filter(SummerApplication.config_id == config_id)
    if application_status:
        q = q.filter(SummerApplication.application_status == application_status)
    if grade:
        q = q.filter(SummerApplication.grade == grade)
    if location:
        q = q.filter(SummerApplication.preferred_location == location)
    if buddy_group_id:
        q = q.filter(SummerApplication.buddy_group_id == buddy_group_id)
    if search:
        pattern = f"%{search}%"
        q = q.filter(
            (SummerApplication.student_name.ilike(pattern))
            | (SummerApplication.reference_code.ilike(pattern))
            | (SummerApplication.contact_phone.ilike(pattern))
        )

    apps = q.order_by(SummerApplication.submitted_at.desc()).all()
    return [_build_application_response(a) for a in apps]


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
        joinedload(SummerApplication.buddy_group),
        joinedload(SummerApplication.sessions)
            .joinedload(SummerSession.slot)
            .joinedload(SummerCourseSlot.tutor),
    ).filter(SummerApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _build_application_response(app)


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

    # Reload with sessions for response
    app = db.query(SummerApplication).options(
        joinedload(SummerApplication.buddy_group),
        joinedload(SummerApplication.sessions)
            .joinedload(SummerSession.slot)
            .joinedload(SummerCourseSlot.tutor),
    ).filter(SummerApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _build_application_response(app)


# ─── Slot CRUD ───────────────────────────────────────────────────────────────

def _build_slot_response(slot: SummerCourseSlot) -> SummerSlotResponse:
    """Build a SummerSlotResponse from an ORM slot with loaded relationships."""
    active_sessions = [
        s for s in slot.sessions if s.session_status != "Cancelled"
    ]
    return SummerSlotResponse(
        id=slot.id,
        config_id=slot.config_id,
        slot_day=slot.slot_day,
        time_slot=slot.time_slot,
        location=slot.location,
        grade=slot.grade,
        slot_label=slot.slot_label,
        course_type=slot.course_type,
        tutor_id=slot.tutor_id,
        tutor_name=slot.tutor.tutor_name if slot.tutor else None,
        max_students=slot.max_students,
        created_at=slot.created_at,
        session_count=len(active_sessions),
        sessions=[
            SummerSlotSessionInfo(
                id=s.id,
                application_id=s.application_id,
                student_name=s.application.student_name,
                grade=s.application.grade,
                session_status=s.session_status,
            )
            for s in active_sessions
        ],
    )


@router.get("/summer/slots", response_model=list[SummerSlotResponse])
def list_slots(
    config_id: int,
    location: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List all slots for a config, optionally filtered by location."""
    q = (
        db.query(SummerCourseSlot)
        .options(
            joinedload(SummerCourseSlot.tutor),
            joinedload(SummerCourseSlot.sessions).joinedload(SummerSession.application),
        )
        .filter(SummerCourseSlot.config_id == config_id)
    )
    if location:
        q = q.filter(SummerCourseSlot.location == location)
    slots = q.order_by(SummerCourseSlot.slot_day, SummerCourseSlot.time_slot).all()
    return [_build_slot_response(s) for s in slots]


@router.post("/summer/slots", response_model=SummerSlotResponse, status_code=201)
def create_slot(
    data: SummerSlotCreate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Create a new timetable slot."""
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == data.config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    slot = SummerCourseSlot(**data.model_dump())
    db.add(slot)
    db.commit()
    db.refresh(slot)
    # Reload with relationships
    slot = (
        db.query(SummerCourseSlot)
        .options(
            joinedload(SummerCourseSlot.tutor),
            joinedload(SummerCourseSlot.sessions).joinedload(SummerSession.application),
        )
        .filter(SummerCourseSlot.id == slot.id)
        .first()
    )
    return _build_slot_response(slot)


@router.patch("/summer/slots/{slot_id}", response_model=SummerSlotResponse)
def update_slot(
    slot_id: int,
    data: SummerSlotUpdate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update a slot's grade, tutor, capacity, etc."""
    slot = db.query(SummerCourseSlot).filter(SummerCourseSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    updates = data.model_dump(exclude_unset=True)

    # Tutor conflict detection
    new_tutor_id = updates.get("tutor_id")
    if new_tutor_id is not None and new_tutor_id != slot.tutor_id:
        conflict = (
            db.query(SummerCourseSlot)
            .filter(
                SummerCourseSlot.config_id == slot.config_id,
                SummerCourseSlot.slot_day == slot.slot_day,
                SummerCourseSlot.time_slot == slot.time_slot,
                SummerCourseSlot.tutor_id == new_tutor_id,
                SummerCourseSlot.id != slot_id,
            )
            .first()
        )
        if conflict:
            tutor = db.query(Tutor).filter(Tutor.id == new_tutor_id).first()
            name = tutor.tutor_name if tutor else "Tutor"
            raise HTTPException(
                status_code=409,
                detail=f"{name} is already assigned to another slot at {slot.slot_day} {slot.time_slot}",
            )

    for field, value in updates.items():
        setattr(slot, field, value)
    db.commit()

    # Reload with relationships
    slot = (
        db.query(SummerCourseSlot)
        .options(
            joinedload(SummerCourseSlot.tutor),
            joinedload(SummerCourseSlot.sessions).joinedload(SummerSession.application),
        )
        .filter(SummerCourseSlot.id == slot_id)
        .first()
    )
    return _build_slot_response(slot)


@router.delete("/summer/slots/{slot_id}")
def delete_slot(
    slot_id: int,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Delete a slot (only if no active sessions)."""
    slot = (
        db.query(SummerCourseSlot)
        .options(joinedload(SummerCourseSlot.sessions))
        .filter(SummerCourseSlot.id == slot_id)
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    active = [s for s in slot.sessions if s.session_status != "Cancelled"]
    if active:
        raise HTTPException(status_code=400, detail="Cannot delete slot with active sessions")

    db.delete(slot)
    db.commit()
    return {"success": True}


# ─── Session CRUD ────────────────────────────────────────────────────────────

def _build_session_response(s: SummerSession) -> SummerSessionResponse:
    """Build a SummerSessionResponse from an ORM session."""
    return SummerSessionResponse(
        id=s.id,
        application_id=s.application_id,
        slot_id=s.slot_id,
        lesson_number=s.lesson_number,
        specific_date=s.specific_date,
        session_status=s.session_status,
        placed_at=s.placed_at,
        placed_by=s.placed_by,
        student_name=s.application.student_name if s.application else None,
        student_grade=s.application.grade if s.application else None,
    )


@router.post("/summer/sessions", response_model=SummerSessionResponse, status_code=201)
def create_session(
    data: SummerSessionCreate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Assign a student (application) to a slot."""
    slot = (
        db.query(SummerCourseSlot)
        .options(joinedload(SummerCourseSlot.sessions))
        .filter(SummerCourseSlot.id == data.slot_id)
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    app = db.query(SummerApplication).filter(SummerApplication.id == data.application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    # Check capacity
    active_count = sum(1 for s in slot.sessions if s.session_status != "Cancelled")
    if active_count >= slot.max_students:
        raise HTTPException(status_code=400, detail="Slot is full")

    # Check duplicate
    existing = next(
        (s for s in slot.sessions
         if s.application_id == data.application_id and s.session_status != "Cancelled"),
        None,
    )
    if existing:
        raise HTTPException(status_code=400, detail="Application already placed in this slot")

    session = SummerSession(
        application_id=data.application_id,
        slot_id=data.slot_id,
        lesson_id=data.lesson_id,
        session_status="Tentative",
        placed_by=admin.tutor_name or "admin",
        placed_at=hk_now(),
    )
    db.add(session)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Application already placed in this slot")
    db.refresh(session)

    # Auto-sync: advance application status to Placement Offered
    if app.application_status in (
        SummerApplicationStatus.SUBMITTED,
        SummerApplicationStatus.UNDER_REVIEW,
    ):
        app.application_status = SummerApplicationStatus.PLACEMENT_OFFERED
        db.commit()

    # Reload with application
    session = (
        db.query(SummerSession)
        .options(joinedload(SummerSession.application))
        .filter(SummerSession.id == session.id)
        .first()
    )
    return _build_session_response(session)


@router.patch("/summer/sessions/{session_id}", response_model=SummerSessionResponse)
def update_session_status(
    session_id: int,
    data: SummerSessionStatusUpdate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update a session's status."""
    session = (
        db.query(SummerSession)
        .options(joinedload(SummerSession.application))
        .filter(SummerSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # session_status validated by Literal type in schema
    session.session_status = data.session_status
    db.commit()

    # Auto-sync application status
    app = session.application
    if app:
        if data.session_status == "Confirmed" and app.application_status == SummerApplicationStatus.PLACEMENT_OFFERED:
            app.application_status = SummerApplicationStatus.PLACEMENT_CONFIRMED
            db.commit()
        elif data.session_status == "Cancelled":
            _maybe_revert_app_status(db, app)

    db.refresh(session)
    return _build_session_response(session)


def _maybe_revert_app_status(db: Session, app: SummerApplication) -> None:
    """If application has no remaining active sessions, revert status to Under Review."""
    remaining = (
        db.query(SummerSession)
        .filter(
            SummerSession.application_id == app.id,
            SummerSession.session_status != "Cancelled",
        )
        .count()
    )
    if remaining == 0 and app.application_status in (
        SummerApplicationStatus.PLACEMENT_OFFERED,
        SummerApplicationStatus.PLACEMENT_CONFIRMED,
    ):
        app.application_status = SummerApplicationStatus.UNDER_REVIEW
        db.commit()


@router.delete("/summer/sessions/{session_id}")
def delete_session(
    session_id: int,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Remove a session (unassign student from slot)."""
    session = (
        db.query(SummerSession)
        .options(joinedload(SummerSession.application))
        .filter(SummerSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    app = session.application
    db.delete(session)
    db.commit()

    # Auto-sync: revert app status if no sessions remain
    if app:
        _maybe_revert_app_status(db, app)

    return {"success": True}


@router.post("/summer/sessions/bulk-confirm")
def bulk_confirm_sessions(
    config_id: int = Query(...),
    location: Optional[str] = None,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Confirm all tentative sessions for a config (optionally filtered by location)."""
    q = (
        db.query(SummerSession)
        .join(SummerCourseSlot, SummerSession.slot_id == SummerCourseSlot.id)
        .filter(
            SummerCourseSlot.config_id == config_id,
            SummerSession.session_status == "Tentative",
        )
    )
    if location:
        q = q.filter(SummerCourseSlot.location == location)

    # Get application IDs before updating so we can sync their statuses
    session_app_ids = [s.application_id for s in q.all()]

    count = q.update(
        {SummerSession.session_status: "Confirmed"},
        synchronize_session="fetch",
    )
    db.commit()

    # Auto-sync: advance application statuses to Placement Confirmed
    if session_app_ids:
        db.query(SummerApplication).filter(
            SummerApplication.id.in_(session_app_ids),
            SummerApplication.application_status == SummerApplicationStatus.PLACEMENT_OFFERED,
        ).update(
            {SummerApplication.application_status: SummerApplicationStatus.PLACEMENT_CONFIRMED},
            synchronize_session="fetch",
        )
        db.commit()

    return {"confirmed": count}


# ─── Demand Heatmap ──────────────────────────────────────────────────────────

@router.get("/summer/demand", response_model=SummerDemandResponse)
def get_demand(
    config_id: int,
    location: str,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get demand heatmap: preference counts by day x time_slot x grade."""
    apps = (
        db.query(SummerApplication)
        .filter(
            SummerApplication.config_id == config_id,
            SummerApplication.preferred_location == location,
            SummerApplication.application_status.not_in(["Withdrawn", "Rejected"]),
        )
        .all()
    )

    cells: dict[tuple[str, str], dict] = {}

    for app in apps:
        # First preference
        if app.preference_1_day and app.preference_1_time:
            key = (app.preference_1_day, app.preference_1_time)
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["first"][app.grade] = cell["first"].get(app.grade, 0) + 1

        # Second preference
        if app.preference_2_day and app.preference_2_time:
            key = (app.preference_2_day, app.preference_2_time)
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["second"][app.grade] = cell["second"].get(app.grade, 0) + 1

    demand_cells = [
        SummerDemandCell(
            day=day,
            time_slot=time,
            total_first_pref=sum(data["first"].values()),
            total_second_pref=sum(data["second"].values()),
            by_grade_first=data["first"],
            by_grade_second=data["second"],
        )
        for (day, time), data in sorted(cells.items())
    ]

    return SummerDemandResponse(location=location, cells=demand_cells)


# ─── Unassigned Students ─────────────────────────────────────────────────────

@router.get("/summer/unassigned", response_model=list[SummerApplicationResponse])
def list_unassigned(
    config_id: int,
    location: Optional[str] = None,
    grade: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List applications with no active session for this config."""
    placed_ids = (
        select(SummerSession.application_id)
        .join(SummerCourseSlot, SummerSession.slot_id == SummerCourseSlot.id)
        .where(
            SummerSession.session_status != "Cancelled",
            SummerCourseSlot.config_id == config_id,
        )
        .distinct()
        .scalar_subquery()
    )

    q = (
        db.query(SummerApplication)
        .options(joinedload(SummerApplication.buddy_group))
        .filter(
            SummerApplication.config_id == config_id,
            SummerApplication.application_status.not_in(["Withdrawn", "Rejected"]),
            SummerApplication.id.not_in(placed_ids),
        )
    )
    if location:
        q = q.filter(SummerApplication.preferred_location == location)
    if grade:
        q = q.filter(SummerApplication.grade == grade)

    return q.order_by(SummerApplication.student_name).all()


# ─── Auto-Suggest ────────────────────────────────────────────────────────────

@router.post("/summer/auto-suggest", response_model=SummerSuggestResponse)
def auto_suggest(
    data: SummerSuggestRequest,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Run greedy least-flexible-first auto-suggest algorithm.

    Note: unavailability_notes is free-text and not factored into the algorithm.
    Admin should cross-check proposals against student unavailability manually.
    """
    # 1. Load unassigned applications for this config + location
    placed_ids = (
        select(SummerSession.application_id)
        .join(SummerCourseSlot, SummerSession.slot_id == SummerCourseSlot.id)
        .where(
            SummerSession.session_status != "Cancelled",
            SummerCourseSlot.config_id == data.config_id,
        )
        .distinct()
        .scalar_subquery()
    )
    apps = (
        db.query(SummerApplication)
        .filter(
            SummerApplication.config_id == data.config_id,
            SummerApplication.preferred_location == data.location,
            SummerApplication.application_status.not_in(["Withdrawn", "Rejected"]),
            SummerApplication.id.not_in(placed_ids),
        )
        .all()
    )

    # 2. Load slots with current counts (eager-load sessions + their applications for buddy tracking)
    slots = (
        db.query(SummerCourseSlot)
        .options(
            joinedload(SummerCourseSlot.sessions).joinedload(SummerSession.application)
        )
        .filter(
            SummerCourseSlot.config_id == data.config_id,
            SummerCourseSlot.location == data.location,
        )
        .all()
    )

    # Build slot capacity map: slot_id -> remaining capacity
    slot_capacity: dict[int, int] = {}
    slot_buddy_groups: dict[int, set[int]] = {}  # slot_id -> set of buddy_group_ids
    for s in slots:
        active = [sess for sess in s.sessions if sess.session_status != "Cancelled"]
        slot_capacity[s.id] = s.max_students - len(active)
        # Track buddy groups in each slot
        for sess in active:
            if sess.application and sess.application.buddy_group_id:
                slot_buddy_groups.setdefault(s.id, set()).add(sess.application.buddy_group_id)

    # 3. Score each application by flexibility (count matching open slots)
    def count_matching(app: SummerApplication) -> int:
        return sum(1 for s in slots if s.grade == app.grade and slot_capacity.get(s.id, 0) > 0)

    sorted_apps = sorted(apps, key=count_matching)  # least flexible first

    # 4. Greedy assignment
    proposals: list[SummerSuggestionItem] = []
    unplaceable: list[dict] = []

    for app in sorted_apps:
        available = [s for s in slots if s.grade == app.grade and slot_capacity.get(s.id, 0) > 0]
        if not available:
            unplaceable.append({
                "application_id": app.id,
                "student_name": app.student_name,
                "reason": f"No open {app.grade} slots available",
            })
            continue

        # Try matching preferences
        best_slot = None
        match_type = "any_open"
        confidence = 0.3

        for s in available:
            is_first = (s.slot_day == app.preference_1_day and s.time_slot == app.preference_1_time)
            is_second = (s.slot_day == app.preference_2_day and s.time_slot == app.preference_2_time)
            has_buddy = (
                app.buddy_group_id
                and app.buddy_group_id in slot_buddy_groups.get(s.id, set())
            )

            if is_first:
                score = 1.0 + (0.05 if has_buddy else 0)
            elif is_second:
                score = 0.7 + (0.05 if has_buddy else 0)
            else:
                # Prefer emptiest slot, buddy bonus
                remaining = slot_capacity.get(s.id, 0)
                score = 0.3 + (remaining / 20) + (0.1 if has_buddy else 0)

            if best_slot is None or score > confidence:
                best_slot = s
                confidence = score
                if is_first:
                    match_type = "first_pref"
                elif is_second:
                    match_type = "second_pref"
                else:
                    match_type = "any_open"

        if best_slot:
            reason_parts = [f"{match_type.replace('_', ' ')} match"]
            if app.buddy_group_id and app.buddy_group_id in slot_buddy_groups.get(best_slot.id, set()):
                reason_parts.append("buddy in slot")
            proposals.append(SummerSuggestionItem(
                application_id=app.id,
                student_name=app.student_name,
                student_grade=app.grade,
                slot_id=best_slot.id,
                slot_day=best_slot.slot_day,
                slot_time=best_slot.time_slot,
                slot_grade=best_slot.grade,
                slot_label=best_slot.slot_label,
                match_type=match_type,
                confidence=min(confidence, 1.0),
                reason=", ".join(reason_parts),
            ))
            # Reserve capacity in memory
            slot_capacity[best_slot.id] -= 1
            if app.buddy_group_id:
                slot_buddy_groups.setdefault(best_slot.id, set()).add(app.buddy_group_id)

    return SummerSuggestResponse(proposals=proposals, unplaceable=unplaceable)


# ─── Tutor Duties ────────────────────────────────────────────────────────────

@router.get("/summer/tutors/active")
def get_active_tutors(
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Return active tutors for duty/slot assignment."""
    tutors = (
        db.query(Tutor)
        .filter(Tutor.is_active_tutor == True)  # noqa: E712
        .order_by(Tutor.tutor_name)
        .all()
    )
    return [{"id": t.id, "tutor_name": t.tutor_name, "default_location": t.default_location} for t in tutors]


@router.get("/summer/tutor-duties", response_model=list[SummerTutorDutyResponse])
def get_tutor_duties(
    config_id: int,
    location: str,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get all tutor duties for a config+location."""
    duties = (
        db.query(SummerTutorDuty)
        .options(joinedload(SummerTutorDuty.tutor))
        .filter(
            SummerTutorDuty.config_id == config_id,
            SummerTutorDuty.location == location,
        )
        .all()
    )
    return [
        SummerTutorDutyResponse(
            id=d.id,
            config_id=d.config_id,
            tutor_id=d.tutor_id,
            tutor_name=d.tutor.tutor_name if d.tutor else "",
            location=d.location,
            duty_day=d.duty_day,
            time_slot=d.time_slot,
        )
        for d in duties
    ]


@router.post("/summer/tutor-duties/bulk-set")
def bulk_set_tutor_duties(
    data: SummerTutorDutyBulkSet,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Replace all tutor duties for a config+location with the given set."""
    # Delete existing
    db.query(SummerTutorDuty).filter(
        SummerTutorDuty.config_id == data.config_id,
        SummerTutorDuty.location == data.location,
    ).delete()

    # Insert new
    for item in data.duties:
        db.add(SummerTutorDuty(
            config_id=data.config_id,
            tutor_id=item.tutor_id,
            location=data.location,
            duty_day=item.duty_day,
            time_slot=item.time_slot,
        ))

    db.commit()
    return {"success": True, "count": len(data.duties)}


# ─── Lesson Helpers ──────────────────────────────────────────────────────────

DAY_TO_WEEKDAY = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}


def get_slot_dates(slot_day: str, start: date_type, end: date_type) -> list[date_type]:
    """Return all occurrences of slot_day within [start, end]."""
    target = DAY_TO_WEEKDAY.get(slot_day)
    if target is None:
        return []
    dates: list[date_type] = []
    d = start
    # Advance to first occurrence
    while d.weekday() != target:
        d += timedelta(days=1)
    while d <= end:
        dates.append(d)
        d += timedelta(days=7)
    return dates


def compute_lesson_number(course_type: str | None, week: int) -> int:
    """Compute initial lesson number from course type and week (1-indexed).
    Type A: 1,2,3,...,8
    Type B: 5,6,7,8,1,2,3,4
    Default (None): same as A
    """
    if course_type == "B":
        return ((week - 1 + 4) % 8) + 1
    return week


# ─── Lessons (materialized instances) ────────────────────────────────────────

@router.post("/summer/lessons/generate")
def generate_lessons(
    config_id: int,
    location: str,
    slot_id: int | None = None,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Generate SummerLesson rows for slots. Uses course_type to seed lesson numbers.
    If slot_id is given, generates for that slot only. Otherwise for all slots in config+location.
    Skips slots that already have lessons.
    """
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    q = db.query(SummerCourseSlot).filter(
        SummerCourseSlot.config_id == config_id,
        SummerCourseSlot.location == location,
    )
    if slot_id:
        q = q.filter(SummerCourseSlot.id == slot_id)

    slots = q.all()
    created = 0
    skipped = 0

    # Batch check which slots already have lessons (avoids N+1)
    slot_ids = [s.id for s in slots]
    existing_slot_ids = {
        row[0]
        for row in db.query(SummerLesson.slot_id)
        .filter(SummerLesson.slot_id.in_(slot_ids))
        .distinct()
        .all()
    } if slot_ids else set()

    for slot in slots:
        if slot.id in existing_slot_ids:
            skipped += 1
            continue

        dates = get_slot_dates(slot.slot_day, config.course_start_date, config.course_end_date)
        for i, d in enumerate(dates):
            week = i + 1
            lesson_num = compute_lesson_number(slot.course_type, week)
            db.add(SummerLesson(
                slot_id=slot.id,
                lesson_date=d,
                lesson_number=lesson_num,
                lesson_status="Scheduled",
            ))
            created += 1

    db.commit()
    return {"success": True, "lessons_created": created, "slots_skipped": skipped}


@router.get("/summer/lessons", response_model=list[SummerLessonResponse])
def list_lessons(
    slot_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List all lessons for a slot, ordered by date."""
    return (
        db.query(SummerLesson)
        .filter(SummerLesson.slot_id == slot_id)
        .order_by(SummerLesson.lesson_date)
        .all()
    )


@router.patch("/summer/lessons/{lesson_id}", response_model=SummerLessonResponse)
def update_lesson(
    lesson_id: int,
    data: SummerLessonUpdate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update a lesson's lesson_number, status, or notes."""
    lesson = db.query(SummerLesson).filter(SummerLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    if data.lesson_number is not None:
        lesson.lesson_number = data.lesson_number
    if data.lesson_status is not None:
        lesson.lesson_status = data.lesson_status
    if data.notes is not None:
        lesson.notes = data.notes

    db.commit()
    db.refresh(lesson)
    return lesson


@router.get("/summer/lessons/calendar", response_model=SummerLessonCalendarResponse)
def get_lesson_calendar(
    config_id: int,
    location: str,
    week_start: date_type,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get lessons for one week with slot info and sessions, for calendar view."""
    week_end = week_start + timedelta(days=6)

    lessons = (
        db.query(SummerLesson)
        .join(SummerCourseSlot, SummerLesson.slot_id == SummerCourseSlot.id)
        .outerjoin(Tutor, SummerCourseSlot.tutor_id == Tutor.id)
        .options(
            contains_eager(SummerLesson.slot).contains_eager(SummerCourseSlot.tutor),
            joinedload(SummerLesson.sessions).joinedload(SummerSession.application),
        )
        .filter(
            SummerCourseSlot.config_id == config_id,
            SummerCourseSlot.location == location,
            SummerLesson.lesson_date >= week_start,
            SummerLesson.lesson_date <= week_end,
        )
        .order_by(SummerLesson.lesson_date, SummerCourseSlot.time_slot)
        .all()
    )

    entries = []
    for lesson in lessons:
        slot = lesson.slot
        active_sessions = [
            SummerSlotSessionInfo(
                id=s.id,
                application_id=s.application_id,
                student_name=s.application.student_name if s.application else "",
                grade=s.application.grade if s.application else "",
                session_status=s.session_status,
            )
            for s in lesson.sessions
            if s.session_status != "Cancelled"
        ]
        entries.append(SummerLessonCalendarEntry(
            lesson_id=lesson.id,
            slot_id=slot.id,
            slot_day=slot.slot_day,
            time_slot=slot.time_slot,
            grade=slot.grade,
            course_type=slot.course_type,
            lesson_number=lesson.lesson_number,
            lesson_status=lesson.lesson_status,
            tutor_id=slot.tutor_id,
            tutor_name=slot.tutor.tutor_name if slot.tutor else None,
            max_students=slot.max_students,
            date=lesson.lesson_date,
            notes=lesson.notes,
            sessions=active_sessions,
        ))

    return SummerLessonCalendarResponse(
        week_start=week_start,
        week_end=week_end,
        lessons=entries,
    )


@router.get("/summer/lessons/find-slot", response_model=list[SummerFindSlotResult])
def find_slot(
    config_id: int,
    location: str,
    grade: str,
    lesson_number: int,
    after_date: date_type | None = None,
    before_date: date_type | None = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Find lessons matching grade + lesson_number within a date range.
    Returns candidates sorted by: exact lesson match first, then by date.
    """
    # Subquery: count active sessions per lesson (avoids loading full session objects)
    active_count_sub = (
        select(func.count(SummerSession.id))
        .where(
            SummerSession.lesson_id == SummerLesson.id,
            SummerSession.session_status != "Cancelled",
        )
        .correlate(SummerLesson)
        .scalar_subquery()
        .label("active_count")
    )

    q = (
        db.query(SummerLesson, active_count_sub)
        .join(SummerCourseSlot, SummerLesson.slot_id == SummerCourseSlot.id)
        .outerjoin(Tutor, SummerCourseSlot.tutor_id == Tutor.id)
        .options(
            contains_eager(SummerLesson.slot).contains_eager(SummerCourseSlot.tutor),
        )
        .filter(
            SummerCourseSlot.config_id == config_id,
            SummerCourseSlot.location == location,
            SummerCourseSlot.grade == grade,
            SummerLesson.lesson_status != "Cancelled",
            active_count_sub < SummerCourseSlot.max_students,
        )
    )
    if after_date:
        q = q.filter(SummerLesson.lesson_date >= after_date)
    if before_date:
        q = q.filter(SummerLesson.lesson_date <= before_date)

    rows = q.order_by(SummerLesson.lesson_date).all()

    results = []
    for lesson, active_count in rows:
        slot = lesson.slot
        results.append(SummerFindSlotResult(
            lesson_id=lesson.id,
            slot_id=slot.id,
            date=lesson.lesson_date,
            time_slot=slot.time_slot,
            tutor_name=slot.tutor.tutor_name if slot.tutor else None,
            current_count=active_count,
            max_students=slot.max_students,
            lesson_number=lesson.lesson_number,
            lesson_match=lesson.lesson_number == lesson_number,
        ))

    # Sort: matches first, then by date
    results.sort(key=lambda r: (not r.lesson_match, r.date))
    return results
