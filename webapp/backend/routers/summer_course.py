"""
Summer course router: public application form + admin management endpoints.
"""
import logging
import secrets
import string
from datetime import date as date_type, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, contains_eager

from database import get_db
from models import (
    SummerCourseConfig,
    SummerBuddyGroup,
    SummerBuddyMember,
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
    SummerStudentLessonEntry,
    SummerStudentLessonsRow,
    SummerStudentLessonsResponse,
    SummerDemandResponse,
    SummerDemandCell,
    SummerSuggestRequest,
    SummerSuggestResponse,
    SummerSuggestionItem,
    SummerLessonAssignment,
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
            or_(
                SummerBuddyGroup.config_id == config.id,
                and_(SummerBuddyGroup.config_id.is_(None), SummerBuddyGroup.year == config.year),
            ),
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
        sessions_per_week=data.sessions_per_week,
        submitted_at=hk_now(),
    )
    # Generate unique random reference code with retry on collision
    db.add(app)
    for _ in range(10):
        ref = _generate_reference_code(config.year)
        app.reference_code = ref
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            db.add(app)  # Re-attach after rollback (object becomes transient)
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique reference code")

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

    now = hk_now()
    if now < config.application_open_date or now > config.application_close_date:
        raise HTTPException(status_code=400, detail="Application period is not open")

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
    from datetime import datetime as _dt
    _current_year = _dt.now().year
    group = db.query(SummerBuddyGroup).filter(
        SummerBuddyGroup.buddy_code == code.strip().upper(),
        or_(SummerBuddyGroup.year == _current_year, SummerBuddyGroup.year.is_(None)),
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Buddy group not found")

    app_count = db.query(func.count(SummerApplication.id)).filter(
        SummerApplication.buddy_group_id == group.id
    ).scalar() or 0
    primary_count = db.query(func.count(SummerBuddyMember.id)).filter(
        SummerBuddyMember.buddy_group_id == group.id
    ).scalar() or 0
    return {"buddy_code": group.buddy_code, "member_count": app_count + primary_count}


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
    data["placed_count"] = len(sessions)
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
    # Deduplicate: one entry per student (a student may have 8 session rows, one per lesson)
    seen: set[int] = set()
    unique_sessions = []
    for s in slot.sessions:
        if s.session_status == "Cancelled":
            continue
        if s.application_id in seen:
            continue
        seen.add(s.application_id)
        unique_sessions.append(s)

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
        session_count=len(unique_sessions),
        sessions=[
            SummerSlotSessionInfo(
                id=s.id,
                application_id=s.application_id,
                student_name=s.application.student_name,
                grade=s.application.grade,
                session_status=s.session_status,
            )
            for s in unique_sessions
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

    # Detect course_type change → reset lesson numbers
    old_course_type = slot.course_type
    for field, value in updates.items():
        setattr(slot, field, value)
    db.commit()

    if "course_type" in updates and updates["course_type"] != old_course_type:
        # Re-seed lesson numbers from the new course_type formula
        lessons = (
            db.query(SummerLesson)
            .filter(SummerLesson.slot_id == slot_id)
            .order_by(SummerLesson.lesson_date)
            .all()
        )
        for i, lesson in enumerate(lessons):
            lesson.lesson_number = compute_lesson_number(updates["course_type"], i + 1)
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
    """Assign a student (application) to a slot.

    If lesson_id is provided: creates a single session for that lesson (calendar drop).
    If lesson_id is None: creates one session per lesson for the slot (Slot Setup drop).
    """
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

    now = hk_now()
    placed_by = admin.tutor_name or "admin"

    if data.lesson_id:
        # Calendar drop — per-lesson duplicate + capacity check (single query)
        lesson_sessions = (
            db.query(SummerSession)
            .filter(
                SummerSession.lesson_id == data.lesson_id,
                SummerSession.session_status != "Cancelled",
            )
            .all()
        )
        if any(s.application_id == data.application_id for s in lesson_sessions):
            raise HTTPException(status_code=400, detail="Already placed in this lesson")
        if len(lesson_sessions) >= slot.max_students:
            raise HTTPException(status_code=400, detail="Lesson is full")

        session = SummerSession(
            application_id=data.application_id,
            slot_id=data.slot_id,
            lesson_id=data.lesson_id,
            session_status="Tentative",
            placed_by=placed_by,
            placed_at=now,
        )
        db.add(session)
    else:
        # Slot Setup drop — per-slot checks
        active_students = {s.application_id for s in slot.sessions if s.session_status != "Cancelled"}
        if len(active_students) >= slot.max_students:
            raise HTTPException(status_code=400, detail="Slot is full")
        if data.application_id in active_students:
            raise HTTPException(status_code=400, detail="Application already placed in this slot")

        # Create sessions based on mode
        _ensure_lessons_for_slot(slot, db)
        lessons = (
            db.query(SummerLesson)
            .filter(SummerLesson.slot_id == data.slot_id)
            .order_by(SummerLesson.lesson_date)
            .all()
        )

        if data.mode == "first_half":
            lessons = lessons[:len(lessons) // 2]
        elif data.mode == "single":
            # Just ensure lessons exist — admin places manually in Calendar
            pass

        if data.mode == "single":
            # No sessions created — lessons are ready for manual Calendar placement
            db.commit()
            return SummerSessionResponse(
                id=0, application_id=data.application_id, slot_id=data.slot_id,
                session_status="Tentative", student_name=app.student_name,
                student_grade=app.grade,
            )

        sessions = [
            SummerSession(
                application_id=data.application_id,
                slot_id=data.slot_id,
                lesson_id=lesson.id,
                session_status="Tentative",
                placed_by=placed_by,
                placed_at=now,
            )
            for lesson in lessons
        ]
        db.add_all(sessions)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Application already placed in this slot")

    # Auto-sync: advance application status to Placement Offered
    if app.application_status in (
        SummerApplicationStatus.SUBMITTED,
        SummerApplicationStatus.UNDER_REVIEW,
    ):
        app.application_status = SummerApplicationStatus.PLACEMENT_OFFERED
        db.commit()

    # Reload and return one session for the response
    if data.lesson_id:
        result = (
            db.query(SummerSession)
            .options(joinedload(SummerSession.application))
            .filter(SummerSession.id == session.id)
            .first()
        )
    else:
        result = (
            db.query(SummerSession)
            .options(joinedload(SummerSession.application))
            .filter(
                SummerSession.application_id == data.application_id,
                SummerSession.slot_id == data.slot_id,
            )
            .first()
        )
    return _build_session_response(result)


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
    cascade: bool = True,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Remove a session. cascade=true deletes all sibling sessions for the same student+slot."""
    session = (
        db.query(SummerSession)
        .options(joinedload(SummerSession.application))
        .filter(SummerSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    app = session.application
    if cascade:
        # Delete ALL sessions for this student+slot (Slot Setup removal)
        db.query(SummerSession).filter(
            SummerSession.application_id == session.application_id,
            SummerSession.slot_id == session.slot_id,
        ).delete()
    else:
        # Delete only this specific session (Calendar lesson removal)
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

    # Collect application IDs with scalar query (no ORM object loading)
    session_app_ids = [
        row[0] for row in q.with_entities(SummerSession.application_id).distinct().all()
    ]

    # Single bulk UPDATE
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


@router.post("/summer/sessions/bulk-create")
def bulk_create_sessions(
    items: list[SummerSessionCreate],
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Create multiple sessions in a single transaction.
    Used by auto-suggest accept to avoid N*8 round-trips.
    Each item must have lesson_id set (calendar-style per-lesson placement).
    Skips duplicates and full lessons silently.
    """
    now = hk_now()
    placed_by = admin.tutor_name or "admin"
    created = 0
    skipped = 0

    # Pre-load slots and lesson sessions to avoid N+1 queries
    slot_ids = {item.slot_id for item in items}
    lesson_ids = {item.lesson_id for item in items if item.lesson_id}
    slots_by_id = {
        s.id: s for s in db.query(SummerCourseSlot).filter(SummerCourseSlot.id.in_(slot_ids)).all()
    } if slot_ids else {}
    existing_sessions = (
        db.query(SummerSession)
        .filter(SummerSession.lesson_id.in_(lesson_ids), SummerSession.session_status != "Cancelled")
        .all()
    ) if lesson_ids else []
    # Group existing sessions by lesson_id
    sessions_by_lesson: dict[int, list] = {}
    for s in existing_sessions:
        sessions_by_lesson.setdefault(s.lesson_id, []).append(s)

    for item in items:
        lesson_sessions = sessions_by_lesson.get(item.lesson_id, []) if item.lesson_id else []

        if any(s.application_id == item.application_id for s in lesson_sessions):
            skipped += 1
            continue

        slot = slots_by_id.get(item.slot_id)
        if slot and len(lesson_sessions) >= slot.max_students:
            skipped += 1
            continue

        session = SummerSession(
            application_id=item.application_id,
            slot_id=item.slot_id,
            lesson_id=item.lesson_id,
            session_status="Tentative",
            placed_by=placed_by,
            placed_at=now,
        )
        db.add(session)
        # Track newly added sessions for capacity checks within this batch
        if item.lesson_id:
            sessions_by_lesson.setdefault(item.lesson_id, []).append(session)
        created += 1

    db.commit()

    # Auto-sync application statuses
    app_ids = list({item.application_id for item in items})
    if app_ids:
        db.query(SummerApplication).filter(
            SummerApplication.id.in_(app_ids),
            SummerApplication.application_status.in_([
                SummerApplicationStatus.SUBMITTED,
                SummerApplicationStatus.UNDER_REVIEW,
            ]),
        ).update(
            {SummerApplication.application_status: SummerApplicationStatus.PLACEMENT_OFFERED},
            synchronize_session="fetch",
        )
    db.commit()

    return {"created": created, "skipped": skipped}


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
    """List applications with fewer than total_lessons active sessions (includes partially placed)."""
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    total_lessons = config.total_lessons if config else 8

    # Count active sessions per application for this config
    placed_count_sub = (
        select(func.count(SummerSession.id))
        .join(SummerCourseSlot, SummerSession.slot_id == SummerCourseSlot.id)
        .where(
            SummerSession.session_status != "Cancelled",
            SummerCourseSlot.config_id == config_id,
            SummerSession.application_id == SummerApplication.id,
        )
        .correlate(SummerApplication)
        .scalar_subquery()
    )

    q = (
        db.query(SummerApplication)
        .options(
            joinedload(SummerApplication.buddy_group),
            joinedload(SummerApplication.sessions)
                .joinedload(SummerSession.slot)
                .joinedload(SummerCourseSlot.tutor),
        )
        .filter(
            SummerApplication.config_id == config_id,
            SummerApplication.application_status.not_in(["Withdrawn", "Rejected"]),
            placed_count_sub < total_lessons,
        )
    )
    if location:
        q = q.filter(SummerApplication.preferred_location == location)
    if grade:
        q = q.filter(SummerApplication.grade == grade)

    apps = q.order_by(SummerApplication.student_name).all()
    return [_build_application_response(a) for a in apps]


# ─── Student Lessons Progress ────────────────────────────────────────────────

@router.get("/summer/students/lessons", response_model=SummerStudentLessonsResponse)
def get_student_lessons(
    config_id: int,
    location: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get per-student lesson progress for all applications in a config+location."""
    config = db.query(SummerCourseConfig).filter(SummerCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    total = config.total_lessons

    # Load all applications with their sessions+lessons
    q = (
        db.query(SummerApplication)
        .options(
            joinedload(SummerApplication.sessions)
                .joinedload(SummerSession.lesson),
            joinedload(SummerApplication.sessions)
                .joinedload(SummerSession.slot),
        )
        .filter(
            SummerApplication.config_id == config_id,
            SummerApplication.application_status.not_in(["Withdrawn", "Rejected"]),
        )
    )
    if location:
        q = q.filter(SummerApplication.preferred_location == location)

    apps = q.order_by(SummerApplication.student_name).all()

    rows = []
    for app in apps:
        # Build a map: lesson_number → session info
        placed_by_lesson: dict[int, SummerSession] = {}
        for s in app.sessions:
            if s.session_status == "Cancelled":
                continue
            lesson = s.lesson
            if lesson and lesson.lesson_number not in placed_by_lesson:
                placed_by_lesson[lesson.lesson_number] = s

        # Build 1..total entries
        entries = []
        for ln in range(1, total + 1):
            s = placed_by_lesson.get(ln)
            if s and s.lesson:
                entries.append(SummerStudentLessonEntry(
                    lesson_number=ln,
                    placed=True,
                    session_id=s.id,
                    lesson_id=s.lesson_id,
                    lesson_date=s.lesson.lesson_date,
                    time_slot=s.slot.time_slot if s.slot else None,
                    slot_id=s.slot_id,
                    session_status=s.session_status,
                ))
            else:
                entries.append(SummerStudentLessonEntry(lesson_number=ln, placed=False))

        placed_count = len(placed_by_lesson)
        rows.append(SummerStudentLessonsRow(
            application_id=app.id,
            student_name=app.student_name,
            grade=app.grade,
            sessions_per_week=app.sessions_per_week,
            placed_count=placed_count,
            total_lessons=total,
            lessons=entries,
        ))

    # Sort: least complete first
    rows.sort(key=lambda r: r.placed_count / r.total_lessons if r.total_lessons else 0)
    return SummerStudentLessonsResponse(students=rows)


# ─── Auto-Suggest ────────────────────────────────────────────────────────────


def _score_sequence(lesson_numbers: list[int]) -> float:
    """Score how well a list of lesson_numbers (in chronological order) preserves
    the ideal curriculum sequence.

    Pair ordering (weight 1.0 each): within pairs (1,2), (3,4), (5,6), (7,8),
    is the first element scheduled before the second?

    Group ordering (weight 0.5 each): within [1,2,3,4] and [5,6,7,8],
    are elements in ascending order (pairwise)?
    """
    if not lesson_numbers:
        return 0.0

    # Map lesson_number -> position (index) in chronological order
    pos: dict[int, int] = {}
    for i, ln in enumerate(lesson_numbers):
        if ln not in pos:  # first occurrence wins
            pos[ln] = i

    score = 0.0
    total_weight = 0.0

    # Pair ordering — weight 1.0 each
    pairs = [(1, 2), (3, 4), (5, 6), (7, 8)]
    for a, b in pairs:
        if a in pos and b in pos:
            total_weight += 1.0
            if pos[a] < pos[b]:
                score += 1.0

    # Group ordering — weight 0.5 for each adjacent pair in group
    groups = [[1, 2, 3, 4], [5, 6, 7, 8]]
    for group in groups:
        present = [ln for ln in group if ln in pos]
        for i in range(len(present) - 1):
            total_weight += 0.5
            if pos[present[i]] < pos[present[i + 1]]:
                score += 0.5

    return score / total_weight if total_weight > 0 else 0.0


def _find_best_lesson_set(
    app: SummerApplication,
    available_lessons: list,
    lesson_capacity: dict[int, int],
    lesson_buddy_groups: dict[int, set[int]],
) -> tuple[list | None, str, float]:
    """Find the best set of 8 lessons for a student.

    Returns (assignments_list_or_None, match_type, confidence).
    Each item in assignments is a dict with lesson info ready for SummerLessonAssignment.
    """
    # Group available lessons by lesson_number
    by_number: dict[int, list] = {}
    for lesson, slot in available_lessons:
        if lesson_capacity.get(lesson.id, 0) <= 0:
            continue
        by_number.setdefault(lesson.lesson_number, []).append((lesson, slot))

    needed = list(range(1, 9))  # lesson_numbers 1-8

    # Check we have at least one candidate for every lesson_number
    if not all(n in by_number for n in needed):
        return None, "", 0.0

    # --- For 1x/week students: try single-slot solution first ---
    if app.sessions_per_week == 1:
        single_results = _try_single_slot(app, by_number, lesson_buddy_groups, lesson_capacity)
        if single_results:
            # Return the best result; caller handles multiple options
            assignments, match_type, confidence = single_results[0]
            return assignments, match_type, confidence

    # --- Cross-slot greedy assignment ---
    # Process order: 1, 5, 2, 6, 3, 7, 4, 8 (alternate algebra/geometry groups)
    process_order = [1, 5, 2, 6, 3, 7, 4, 8]
    assigned: dict[int, dict] = {}  # lesson_number -> assignment dict
    assigned_dates: list[tuple[int, object]] = []  # (lesson_number, date) in assignment order

    best_match = "any_open"
    total_score = 0.0

    for ln in process_order:
        candidates = by_number.get(ln, [])
        if not candidates:
            return None, "", 0.0

        best_candidate = None
        best_cand_score = -1.0

        for lesson, slot in candidates:
            if lesson_capacity.get(lesson.id, 0) <= 0:
                continue

            cand_score = 0.0

            # Preference match
            is_first = (slot.slot_day == app.preference_1_day and slot.time_slot == app.preference_1_time)
            is_second = (slot.slot_day == app.preference_2_day and slot.time_slot == app.preference_2_time)
            if is_first:
                cand_score += 1.0
            elif is_second:
                cand_score += 0.7
            else:
                cand_score += 0.3

            # Buddy bonus
            if app.buddy_group_id and app.buddy_group_id in lesson_buddy_groups.get(lesson.id, set()):
                cand_score += 0.1

            # Capacity: slight preference for less-full lessons (normalize to 0-0.05)
            remaining = lesson_capacity.get(lesson.id, 0)
            cand_score += min(remaining / 200.0, 0.05)

            # Date ordering: prefer dates that maintain pair/group order
            ordering_bonus = 0.0
            if assigned_dates:
                # Check if this date would maintain order with already-assigned lessons
                lesson_date = lesson.lesson_date
                good_order = 0
                total_checks = 0
                for prev_ln, prev_date in assigned_dates:
                    # For pair partners and group members, correct order matters
                    if (prev_ln < ln and prev_date <= lesson_date) or \
                       (prev_ln > ln and prev_date >= lesson_date):
                        good_order += 1
                    total_checks += 1
                if total_checks > 0:
                    ordering_bonus = 0.2 * (good_order / total_checks)
            cand_score += ordering_bonus

            if cand_score > best_cand_score:
                best_cand_score = cand_score
                best_candidate = (lesson, slot, is_first, is_second)

        if best_candidate is None:
            return None, "", 0.0

        lesson, slot, is_first, is_second = best_candidate
        assigned[ln] = {
            "lesson_id": lesson.id,
            "slot_id": slot.id,
            "lesson_number": ln,
            "lesson_date": lesson.lesson_date,
            "time_slot": slot.time_slot,
            "slot_day": slot.slot_day,
            "tutor_name": slot.tutor.tutor_name if slot.tutor else None,
            "student_count": slot.max_students - lesson_capacity.get(lesson.id, 0),
            "max_students": slot.max_students,
        }
        assigned_dates.append((ln, lesson.lesson_date))

        # Track match quality
        if is_first:
            total_score += 1.0
            if best_match != "first_pref":
                best_match = "first_pref" if best_match in ("any_open", "first_pref") else "mixed"
        elif is_second:
            total_score += 0.7
            if best_match != "second_pref":
                best_match = "second_pref" if best_match in ("any_open", "second_pref") else "mixed"
        else:
            total_score += 0.3

        # Temporarily reserve capacity for greedy consistency
        lesson_capacity[lesson.id] -= 1

    # Build sorted assignment list (by date)
    assignments = sorted(assigned.values(), key=lambda a: a["lesson_date"])
    confidence = min(total_score / 8.0, 1.0)

    return assignments, best_match, confidence


def _try_single_slot(
    app: SummerApplication,
    by_number: dict[int, list],
    lesson_buddy_groups: dict[int, set[int]],
    lesson_capacity: dict[int, int],
    max_options: int = 3,
) -> list[tuple[list, str, float]]:
    """For 1x/week students, find top N single-slot solutions.

    Returns list of (assignments, match_type, confidence) tuples, best first.
    Empty list if no single slot covers all 8 lessons.
    """
    # Collect all slot_ids that appear across every lesson_number
    slot_sets = []
    for n in range(1, 9):
        candidates = by_number.get(n, [])
        slot_ids = {slot.id for _, slot in candidates}
        slot_sets.append(slot_ids)

    if not slot_sets:
        return []

    # Slots that have all 8 lesson_numbers available
    common_slots = slot_sets[0]
    for s in slot_sets[1:]:
        common_slots = common_slots & s
    if not common_slots:
        return []

    # Build quick lookup: (slot_id, lesson_number) -> (lesson, slot)
    slot_lessons: dict[tuple[int, int], tuple] = {}
    for n in range(1, 9):
        for lesson, slot in by_number.get(n, []):
            if slot.id in common_slots:
                slot_lessons[(slot.id, n)] = (lesson, slot)

    # Score each common slot
    scored: list[tuple[float, int, str]] = []  # (score, slot_id, match_type)
    for sid in common_slots:
        sample_lesson, sample_slot = slot_lessons.get((sid, 1), (None, None))
        if sample_slot is None:
            continue

        score = 0.0
        is_first = (sample_slot.slot_day == app.preference_1_day and sample_slot.time_slot == app.preference_1_time)
        is_second = (sample_slot.slot_day == app.preference_2_day and sample_slot.time_slot == app.preference_2_time)

        if is_first:
            score += 1.0
            match = "first_pref"
        elif is_second:
            score += 0.7
            match = "second_pref"
        else:
            score += 0.3
            match = "any_open"

        # Buddy bonus (check across all 8 lessons)
        buddy_bonus = 0
        if app.buddy_group_id:
            for n in range(1, 9):
                pair = slot_lessons.get((sid, n))
                if pair and app.buddy_group_id in lesson_buddy_groups.get(pair[0].id, set()):
                    buddy_bonus += 1
            score += 0.1 * (buddy_bonus / 8)

        scored.append((score, sid, match))

    if not scored:
        return []

    # Sort by score descending, take top N
    scored.sort(key=lambda x: x[0], reverse=True)
    results: list[tuple[list, str, float]] = []

    for score, sid, match_type in scored[:max_options]:
        assignments = []
        valid = True
        for n in range(1, 9):
            pair = slot_lessons.get((sid, n))
            if pair is None:
                valid = False
                break
            lesson, slot = pair
            assignments.append({
                "lesson_id": lesson.id,
                "slot_id": slot.id,
                "lesson_number": n,
                "lesson_date": lesson.lesson_date,
                "time_slot": slot.time_slot,
                "slot_day": slot.slot_day,
                "tutor_name": slot.tutor.tutor_name if slot.tutor else None,
                "student_count": slot.max_students - lesson_capacity.get(lesson.id, 0),
                "max_students": slot.max_students,
            })
        if not valid:
            continue
        assignments.sort(key=lambda a: a["lesson_date"])
        results.append((assignments, match_type, min(score, 1.0)))

    return results


@router.post("/summer/auto-suggest", response_model=SummerSuggestResponse)
def auto_suggest(
    data: SummerSuggestRequest,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Lesson-level greedy auto-suggest: least-flexible-first assignment.

    Note: unavailability_notes is free-text and not factored into the algorithm.
    Admin should cross-check proposals against student unavailability manually.
    """
    # 1. Load all lessons for config+location, joined with slots + tutor
    lessons_query = (
        db.query(SummerLesson, SummerCourseSlot)
        .join(SummerCourseSlot, SummerLesson.slot_id == SummerCourseSlot.id)
        .options(joinedload(SummerCourseSlot.tutor))
        .filter(
            SummerCourseSlot.config_id == data.config_id,
            SummerCourseSlot.location == data.location,
            SummerLesson.lesson_status != "Cancelled",
        )
    )
    all_lessons: list[tuple] = lessons_query.all()

    # Build lesson capacity: lesson_id -> remaining seats
    # Count active sessions per lesson
    session_counts = dict(
        db.query(SummerSession.lesson_id, func.count(SummerSession.id))
        .filter(SummerSession.session_status != "Cancelled")
        .join(SummerCourseSlot, SummerSession.slot_id == SummerCourseSlot.id)
        .filter(
            SummerCourseSlot.config_id == data.config_id,
            SummerCourseSlot.location == data.location,
        )
        .group_by(SummerSession.lesson_id)
        .all()
    )
    lesson_capacity: dict[int, int] = {}
    for lesson, slot in all_lessons:
        count = session_counts.get(lesson.id, 0)
        lesson_capacity[lesson.id] = slot.max_students - count

    # Track buddy groups per lesson (which buddy groups have students in each lesson)
    lesson_buddy_groups: dict[int, set[int]] = {}
    buddy_sessions = (
        db.query(SummerSession.lesson_id, SummerApplication.buddy_group_id)
        .join(SummerApplication, SummerSession.application_id == SummerApplication.id)
        .filter(
            SummerSession.session_status != "Cancelled",
            SummerApplication.buddy_group_id.is_not(None),
        )
        .join(SummerCourseSlot, SummerSession.slot_id == SummerCourseSlot.id)
        .filter(
            SummerCourseSlot.config_id == data.config_id,
            SummerCourseSlot.location == data.location,
        )
        .all()
    )
    for lesson_id, bg_id in buddy_sessions:
        if lesson_id is not None and bg_id is not None:
            lesson_buddy_groups.setdefault(lesson_id, set()).add(bg_id)

    # 2. Load students
    if data.application_id:
        # Single student mode
        app = db.query(SummerApplication).filter(SummerApplication.id == data.application_id).first()
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
        if app.application_status in ("Withdrawn", "Rejected"):
            raise HTTPException(status_code=400, detail="Cannot suggest for withdrawn/rejected application")
        apps = [app]
    else:
        # All unplaced students
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

    # 3. Apply date constraints
    exclude_set = set(data.exclude_dates) if data.exclude_dates else set()
    include_set = set(data.include_dates) if data.include_dates else None

    filtered_lessons = []
    for lesson, slot in all_lessons:
        if lesson.lesson_date in exclude_set:
            continue
        if include_set is not None and lesson.lesson_date not in include_set:
            continue
        filtered_lessons.append((lesson, slot))

    # 4. Pre-group lessons by grade (avoids repeated O(N*M) scans)
    from collections import defaultdict
    lessons_by_grade: dict[str, list] = defaultdict(list)
    for lesson, slot in filtered_lessons:
        if slot.grade:
            lessons_by_grade[slot.grade].append((lesson, slot))

    def count_available(app: SummerApplication) -> int:
        return sum(
            1 for lesson, slot in lessons_by_grade.get(app.grade, [])
            if lesson_capacity.get(lesson.id, 0) > 0
        )

    sorted_apps = sorted(apps, key=count_available)

    # Pre-compute placed_count per application (existing non-cancelled sessions)
    app_placed_counts: dict[int, int] = {}
    if sorted_apps:
        app_ids = [a.id for a in sorted_apps]
        placed_rows = (
            db.query(SummerSession.application_id, func.count(SummerSession.id))
            .filter(
                SummerSession.application_id.in_(app_ids),
                SummerSession.session_status != "Cancelled",
            )
            .group_by(SummerSession.application_id)
            .all()
        )
        app_placed_counts = dict(placed_rows)

    # 5. Greedy assignment
    proposals: list[SummerSuggestionItem] = []
    unplaceable: list[dict] = []

    for app in sorted_apps:
        grade_lessons = lessons_by_grade.get(app.grade, [])

        if not grade_lessons:
            unplaceable.append({
                "application_id": app.id,
                "student_name": app.student_name,
                "reason": f"No {app.grade} lessons available",
            })
            continue

        # Snapshot capacity before this student (so we can roll back if needed)
        cap_snapshot = {lid: cap for lid, cap in lesson_capacity.items()}

        # For 1x students: try to get multiple single-slot options
        option_labels = "ABCDEFGH"
        alt_options: list[tuple[list, str, float]] = []
        if app.sessions_per_week == 1:
            by_num: dict[int, list] = {}
            for lesson, slot in grade_lessons:
                if lesson_capacity.get(lesson.id, 0) <= 0:
                    continue
                by_num.setdefault(lesson.lesson_number, []).append((lesson, slot))
            if all(n in by_num for n in range(1, 9)):
                alt_options = _try_single_slot(app, by_num, lesson_buddy_groups, lesson_capacity)

        # Primary result from full algorithm
        result = _find_best_lesson_set(
            app, grade_lessons, lesson_capacity, lesson_buddy_groups,
        )
        assignments, match_type, confidence = result

        if assignments is None:
            # Roll back any capacity changes from partial greedy
            lesson_capacity.update(cap_snapshot)
            unplaceable.append({
                "application_id": app.id,
                "student_name": app.student_name,
                "reason": f"Cannot fill all 8 lessons for {app.grade}",
            })
            continue

        def _build_proposal(
            assign_list: list, m_type: str, conf: float, label: str | None = None,
        ) -> SummerSuggestionItem:
            chronological_numbers = [a["lesson_number"] for a in assign_list]
            seq_score = _score_sequence(chronological_numbers)
            reason_parts = [f"{m_type.replace('_', ' ')} match"]
            if app.buddy_group_id:
                buddy_hits = sum(
                    1 for a in assign_list
                    if app.buddy_group_id in lesson_buddy_groups.get(a["lesson_id"], set())
                )
                if buddy_hits > 0:
                    reason_parts.append(f"buddy in {buddy_hits}/{len(assign_list)} lessons")
            if seq_score < 1.0:
                reason_parts.append(f"sequence {seq_score:.0%}")

            # Warn if 1x student ended up in multiple slots — replace match_type text
            slot_ids = {a["slot_id"] for a in assign_list}
            if app.sessions_per_week == 1 and len(slot_ids) > 1:
                reason_parts[0] = "uses multiple slots (1x student)"

            return SummerSuggestionItem(
                application_id=app.id,
                student_name=app.student_name,
                student_grade=app.grade,
                sessions_per_week=app.sessions_per_week,
                lesson_assignments=[SummerLessonAssignment(**a) for a in assign_list],
                sequence_score=seq_score,
                match_type=m_type,
                confidence=min(conf, 1.0),
                reason=", ".join(reason_parts),
                unavailability_notes=app.unavailability_notes,
                option_label=label,
                preference_1_day=app.preference_1_day,
                preference_1_time=app.preference_1_time,
                preference_2_day=app.preference_2_day,
                preference_2_time=app.preference_2_time,
                placed_count=app_placed_counts.get(app.id, 0),
            )

        # Build proposals: if we have multiple single-slot options, emit them
        if len(alt_options) > 1:
            # Dedupe: skip alt options that match the primary assignment's slot
            primary_slot_ids = {a["slot_id"] for a in assignments}
            emitted_slot_ids: set[frozenset] = set()
            idx = 0
            # Always include primary as Option A
            proposals.append(_build_proposal(assignments, match_type, confidence, f"Option {option_labels[idx]}"))
            emitted_slot_ids.add(frozenset(primary_slot_ids))
            idx += 1
            for alt_assign, alt_match, alt_conf in alt_options:
                alt_slot_ids = frozenset(a["slot_id"] for a in alt_assign)
                if alt_slot_ids in emitted_slot_ids:
                    continue
                if idx >= 3:
                    break
                proposals.append(_build_proposal(alt_assign, alt_match, alt_conf, f"Option {option_labels[idx]}"))
                emitted_slot_ids.add(alt_slot_ids)
                idx += 1
        else:
            proposals.append(_build_proposal(assignments, match_type, confidence))

        # Capacity already decremented during _find_best_lesson_set;
        # update buddy groups for subsequent students
        if app.buddy_group_id:
            for a in assignments:
                lesson_buddy_groups.setdefault(a["lesson_id"], set()).add(app.buddy_group_id)

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

def _ensure_lessons_for_slot(slot: SummerCourseSlot, db: Session) -> int:
    """Generate SummerLesson rows for a slot if none exist. Returns count created."""
    existing = db.query(SummerLesson).filter(SummerLesson.slot_id == slot.id).first()
    if existing:
        return 0
    config = slot.config
    dates = get_slot_dates(slot.slot_day, config.course_start_date, config.course_end_date)
    for i, d in enumerate(dates):
        db.add(SummerLesson(
            slot_id=slot.id,
            lesson_date=d,
            lesson_number=compute_lesson_number(slot.course_type, i + 1),
            lesson_status="Scheduled",
        ))
    db.flush()
    return len(dates)


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

    q = db.query(SummerCourseSlot).options(
        joinedload(SummerCourseSlot.config),
    ).filter(
        SummerCourseSlot.config_id == config_id,
        SummerCourseSlot.location == location,
    )
    if slot_id:
        q = q.filter(SummerCourseSlot.id == slot_id)

    slots = q.all()
    created = 0
    skipped = 0

    for slot in slots:
        count = _ensure_lessons_for_slot(slot, db)
        if count:
            created += count
        else:
            skipped += 1

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
    # Auto-generate lessons for slots that don't have any yet (single query with NOT EXISTS)
    from sqlalchemy import exists as sa_exists
    slots_needing_lessons = (
        db.query(SummerCourseSlot)
        .options(joinedload(SummerCourseSlot.config))
        .filter(
            SummerCourseSlot.config_id == config_id,
            SummerCourseSlot.location == location,
            ~sa_exists().where(SummerLesson.slot_id == SummerCourseSlot.id),
        )
        .all()
    )
    if slots_needing_lessons:
        for slot in slots_needing_lessons:
            _ensure_lessons_for_slot(slot, db)
        db.commit()

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
