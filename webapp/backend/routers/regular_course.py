"""
Regular course (September intake) router: public application form + admin
management endpoints.

Stripped-down mirror of routers/summer_course.py: no buddy groups, no
discount tiers, no placement subsystem. Students pick ONE weekly slot
(preference 1 = first choice, preference 2 = backup); publishing an
application creates a native Regular-typed Enrollment with cadence-generated
sessions starting from the first occurrence of the confirmed weekday on/after
the config's course_start_date.

Several private helpers are copied from summer_course.py rather than shared —
keep them in sync when the summer versions change.
"""
import logging
import secrets
from datetime import date as date_type, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    RegularCourseConfig,
    RegularApplication,
    RegularApplicationEdit,
    RegularCourseSlot,
    Discount,
    Enrollment,
    SessionLog,
    Student,
    Tutor,
)
from schemas import (
    RegularCourseFormConfig,
    RegularApplicationCreate,
    RegularApplicationSubmitResponse,
    RegularApplicationStatusResponse,
    RegularApplicationEditRequest,
    RegularApplicationEditEntry,
    RegularCourseConfigCreate,
    RegularCourseConfigUpdate,
    RegularCourseConfigResponse,
    RegularApplicationResponse,
    RegularApplicationUpdate,
    RegularApplicationStats,
    RegularDemandCell,
    RegularDemandResponse,
    RegularSlotCreate,
    RegularSlotUpdate,
    RegularSlotStudentInfo,
    RegularSlotResponse,
    RegularSlotAssignRequest,
    RegularSuggestion,
    RegularSuggestResponse,
    RegularPublishRequest,
    RegularPublishConflictSession,
    RegularPublishResponse,
    RegularUnpublishResponse,
    RegularPublishBatchRequest,
    RegularPublishResult,
    RegularPublishBatchResponse,
    LinkedSecondaryStudentInfo,
)
from auth.dependencies import require_admin_view, require_admin_write
from routers.students import find_duplicate_students
from utils.rate_limiter import check_ip_rate_limit
from constants import (
    hk_now,
    RegularApplicationStatus,
    COMPLETED_STATUSES,
    DAY_FULL_TO_SHORT,
    MIN_LESSONS_FOR_DISCOUNT,
    normalize_secondary_location,
    normalize_day_short,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Helpers
# ============================================

def _normalize_phone(phone: str | None) -> str:
    """Strip everything except digits + leading '+' for duplicate-check parity.

    Copy of summer_course._normalize_phone (keep in sync). Deliberately
    different from utils/phone_matching.normalize_phone — the stored value is
    this normalized form and the status page compares against it, so parity
    with the summer form matters more than 852/853 stripping.
    """
    if not phone:
        return ""
    s = phone.strip()
    plus = "+" if s.startswith("+") else ""
    digits = "".join(ch for ch in s if ch.isdigit())
    return plus + digits


# Fields the applicant may self-edit while the application is still Submitted.
_APPLICANT_EDITABLE_FIELDS: tuple[str, ...] = (
    "grade",
    "school",
    "lang_stream",
    "wechat_id",
    "preferred_location",
    "preference_1_day",
    "preference_1_time",
    "preference_2_day",
    "preference_2_time",
)

# Admin can additionally edit identity fields (still audited).
_ADMIN_EDITABLE_FIELDS: tuple[str, ...] = _APPLICANT_EDITABLE_FIELDS + (
    "student_name",
)


def _normalize_edit_value(field: str, value):
    """Coerce incoming edit values to the same shape we'd store from a fresh submit."""
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip()
        return v or None
    return value


def _apply_application_edits(
    db: Session,
    app: RegularApplication,
    changes: dict,
    *,
    edited_via: str,
    edited_by: str | None,
    allowed_fields: tuple[str, ...],
) -> int:
    """Apply a partial edit, write one audit row per changed field. Returns count."""
    written = 0
    now = hk_now()
    for field, raw in changes.items():
        if field not in allowed_fields:
            continue  # whitelist enforcement — silently drop anything unknown
        new_val = _normalize_edit_value(field, raw)
        old_val = getattr(app, field, None)
        if old_val == new_val:
            continue
        setattr(app, field, new_val)
        db.add(RegularApplicationEdit(
            application_id=app.id,
            edited_at=now,
            field_name=field,
            old_value=None if old_val is None else str(old_val),
            new_value=None if new_val is None else str(new_val),
            edited_via=edited_via,
            edited_by=edited_by,
        ))
        written += 1
    return written


def _write_status_audit(
    db: Session,
    app: RegularApplication,
    old_status: str,
    new_status: str,
    edited_by: str | None,
) -> None:
    """Audit row for a status transition."""
    db.add(RegularApplicationEdit(
        application_id=app.id,
        edited_at=hk_now(),
        field_name="application_status",
        old_value=old_status,
        new_value=new_status,
        edited_via="admin",
        edited_by=edited_by,
    ))


def _get_active_config(db: Session) -> RegularCourseConfig | None:
    """Get the currently active regular course config."""
    return db.query(RegularCourseConfig).filter(
        RegularCourseConfig.is_active == True  # noqa: E712
    ).first()


def _generate_reference_code(year: int) -> str:
    """Generate a random reference code like RC2026-K7X3M (no ambiguous chars)."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # excludes O/0/I/1
    code = "".join(secrets.choice(chars) for _ in range(5))
    return f"RC{year}-{code}"


def _authenticate_application(
    db: Session, reference_code: str, phone: str
) -> RegularApplication:
    app = db.query(RegularApplication).filter(
        RegularApplication.reference_code == reference_code.strip().upper(),
        RegularApplication.contact_phone == _normalize_phone(phone),
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


def _build_status_response(app: RegularApplication) -> RegularApplicationStatusResponse:
    """Compose the public status payload (used by status check + edit endpoints)."""
    return RegularApplicationStatusResponse(
        reference_code=app.reference_code,
        student_name=app.student_name,
        application_status=app.application_status,
        submitted_at=app.submitted_at,
        grade=app.grade,
        school=app.school,
        lang_stream=app.lang_stream,
        wechat_id=app.wechat_id,
        preferred_location=app.preferred_location,
        preference_1_day=app.preference_1_day,
        preference_1_time=app.preference_1_time,
        preference_2_day=app.preference_2_day,
        preference_2_time=app.preference_2_time,
    )


def _classify_prefs(app: RegularApplication) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Split the two preference slots into (first-choice, backup) tiers.

    Regular collapses summer's sessions_per_week logic: preference 1 is always
    the first choice and preference 2 the backup.
    """
    def s(d, t):
        return (d, t) if d and t else None
    s1 = s(app.preference_1_day, app.preference_1_time)
    s2 = s(app.preference_2_day, app.preference_2_time)
    return ([s1] if s1 else []), ([s2] if s2 else [])


def _published_filter_clause(db: Session, published: Optional[str]):
    """Build a clause that filters RegularApplication by publish state, or None
    when the argument isn't a recognized choice."""
    if published not in ("published", "unpublished"):
        return None
    subq = (
        db.query(Enrollment.regular_application_id)
        .filter(Enrollment.regular_application_id.isnot(None))
    )
    if published == "published":
        return RegularApplication.id.in_(subq)
    return ~RegularApplication.id.in_(subq)


def _application_search_clause(search: str):
    """Search clause matching name, ref code, phone, or linked student school ID."""
    pattern = f"%{search}%"
    student_match = (
        select(Student.id)
        .where(
            Student.id == RegularApplication.existing_student_id,
            Student.school_student_id.ilike(pattern),
        )
        .exists()
    )
    return (
        RegularApplication.student_name.ilike(pattern)
        | RegularApplication.reference_code.ilike(pattern)
        | RegularApplication.contact_phone.ilike(pattern)
        | student_match
    )


def _get_linked_students_bulk(
    db: Session, student_ids: list[int]
) -> dict[int, LinkedSecondaryStudentInfo]:
    """Bulk-fetch minimal linked-student info for the admin list."""
    if not student_ids:
        return {}
    rows = db.query(Student).filter(Student.id.in_(set(student_ids))).all()
    return {
        s.id: LinkedSecondaryStudentInfo(
            id=s.id,
            student_name=s.student_name,
            school_student_id=s.school_student_id,
            home_location=s.home_location,
        )
        for s in rows
    }


def _get_published_enrollment_ids(db: Session, app_ids: list[int]) -> dict[int, int]:
    """Map app_id → enrollment id for published apps (one query, 1:1 bridge)."""
    if not app_ids:
        return {}
    rows = (
        db.query(Enrollment.regular_application_id, Enrollment.id)
        .filter(Enrollment.regular_application_id.in_(app_ids))
        .all()
    )
    return {app_id: enr_id for app_id, enr_id in rows}


def _build_application_responses(
    db: Session, apps: list[RegularApplication]
) -> list[RegularApplicationResponse]:
    """Build response list with batched linked-student + publish lookups."""
    linked_students = _get_linked_students_bulk(
        db, [a.existing_student_id for a in apps if a.existing_student_id]
    )
    published = _get_published_enrollment_ids(db, [a.id for a in apps])
    responses = []
    for app in apps:
        data = {col.key: getattr(app, col.key) for col in app.__table__.columns}
        data["linked_student"] = (
            linked_students.get(app.existing_student_id) if app.existing_student_id else None
        )
        data["published_enrollment_id"] = published.get(app.id)
        responses.append(RegularApplicationResponse.model_validate(data))
    return responses


# ============================================
# Public endpoints (no auth)
# ============================================

@router.get("/regular/public/config", response_model=RegularCourseFormConfig)
def get_public_config(request: Request, db: Session = Depends(get_db)):
    """Return the active regular course config for the public form."""
    check_ip_rate_limit(request, "regular_config")
    config = _get_active_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active regular course found")
    return RegularCourseFormConfig(
        year=config.year,
        title=config.title,
        description=config.description,
        application_open_date=config.application_open_date,
        application_close_date=config.application_close_date,
        course_start_date=config.course_start_date,
        locations=config.locations or [],
        available_grades=config.available_grades or [],
        time_slots=config.time_slots or [],
        existing_student_options=config.existing_student_options,
        center_options=config.center_options,
        lang_stream_options=config.lang_stream_options,
        text_content=config.text_content,
        course_intro=config.course_intro,
        pricing_config=config.pricing_config,
        banner_image_url=config.banner_image_url,
    )


@router.post("/regular/public/apply", response_model=RegularApplicationSubmitResponse)
def submit_application(
    request: Request,
    data: RegularApplicationCreate,
    db: Session = Depends(get_db),
):
    """Submit a public regular course application."""
    check_ip_rate_limit(request, "regular_apply")

    config = _get_active_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active regular course found")

    # Check application window
    now = hk_now()
    if now < config.application_open_date or now > config.application_close_date:
        raise HTTPException(status_code=400, detail="Application period is not open")

    # Duplicate check: same (normalized phone, student name) within this config.
    # Same parent submitting multiple kids is allowed; same kid submitted twice
    # is rejected.
    normalized_phone = _normalize_phone(data.contact_phone)
    student_name_clean = data.student_name.strip()
    existing_app = db.query(RegularApplication.id).filter(
        RegularApplication.config_id == config.id,
        RegularApplication.contact_phone == normalized_phone,
        RegularApplication.student_name == student_name_clean,
    ).first()
    if existing_app:
        raise HTTPException(
            status_code=400,
            detail="An application for this student has already been submitted from this phone number. Please use the status page to edit it.",
        )

    now_ts = hk_now()
    app = RegularApplication(
        config_id=config.id,
        reference_code="TEMP",  # placeholder, updated below
        student_name=student_name_clean,
        school=data.school.strip() if data.school else None,
        grade=data.grade.strip(),
        lang_stream=data.lang_stream,
        is_existing_student=data.is_existing_student,
        current_centers=data.current_centers,
        wechat_id=data.wechat_id.strip() if data.wechat_id else None,
        contact_phone=normalized_phone,
        preferred_location=data.preferred_location,
        preference_1_day=data.preference_1_day,
        preference_1_time=data.preference_1_time,
        preference_2_day=data.preference_2_day,
        preference_2_time=data.preference_2_time,
        form_language=data.form_language or "zh",
        submitted_at=now_ts,
    )
    # Generate unique random reference code with retry on collision
    db.add(app)
    for _ in range(10):
        app.reference_code = _generate_reference_code(config.year)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            db.add(app)  # Re-attach after rollback (object becomes transient)
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique reference code")

    return RegularApplicationSubmitResponse(
        reference_code=app.reference_code,
        message="Application submitted successfully",
    )


@router.get("/regular/public/status/{reference_code}", response_model=RegularApplicationStatusResponse)
def check_application_status(
    request: Request,
    reference_code: str,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Check application status by reference code + phone (for verification)."""
    check_ip_rate_limit(request, "regular_status")
    app = _authenticate_application(db, reference_code, phone)
    return _build_status_response(app)


@router.patch(
    "/regular/public/application/{reference_code}",
    response_model=RegularApplicationStatusResponse,
)
def edit_application(
    request: Request,
    reference_code: str,
    data: RegularApplicationEditRequest,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Applicant self-edits their submission while it is still in Submitted state.

    Identity and contact phone are NOT in the editable set. Once admin moves
    the application out of Submitted, this returns 409 and the status page
    hides edit affordances.
    """
    check_ip_rate_limit(request, "regular_edit")
    app = _authenticate_application(db, reference_code, phone)

    if app.application_status != RegularApplicationStatus.SUBMITTED.value:
        raise HTTPException(
            status_code=409,
            detail="This application is being reviewed and can no longer be edited from the status page. Please contact us to make changes.",
        )

    _apply_application_edits(
        db,
        app,
        data.model_dump(exclude_unset=True),
        edited_via="applicant",
        edited_by=None,
        allowed_fields=_APPLICANT_EDITABLE_FIELDS,
    )
    db.commit()
    db.refresh(app)
    return _build_status_response(app)


# ============================================
# Admin endpoints (require auth)
# ============================================

@router.get("/regular/configs", response_model=list[RegularCourseConfigResponse])
def list_configs(
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List all regular course configs."""
    return db.query(RegularCourseConfig).order_by(RegularCourseConfig.year.desc()).all()


@router.post("/regular/configs", response_model=RegularCourseConfigResponse, status_code=201)
def create_config(
    data: RegularCourseConfigCreate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Create a new regular course config."""
    existing = db.query(RegularCourseConfig).filter(
        RegularCourseConfig.year == data.year
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Config for year {data.year} already exists")

    config = RegularCourseConfig(**data.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.patch("/regular/configs/{config_id}", response_model=RegularCourseConfigResponse)
def update_config(
    config_id: int,
    data: RegularCourseConfigUpdate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update an existing regular course config."""
    config = db.query(RegularCourseConfig).filter(RegularCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(config, field, value)

    # Enforce single active config
    if updates.get("is_active") is True:
        db.query(RegularCourseConfig).filter(
            RegularCourseConfig.id != config_id,
            RegularCourseConfig.is_active == True,  # noqa: E712
        ).update({"is_active": False})

    db.commit()
    db.refresh(config)
    return config


@router.get("/regular/configs/{config_id}", response_model=RegularCourseConfigResponse)
def get_config(
    config_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get a single regular course config by ID."""
    config = db.query(RegularCourseConfig).filter(RegularCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.delete("/regular/configs/{config_id}")
def delete_config(
    config_id: int,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Delete a regular course config. Cannot delete the active config."""
    config = db.query(RegularCourseConfig).filter(RegularCourseConfig.id == config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    if config.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active config")
    db.delete(config)
    db.commit()
    return {"success": True}


@router.post("/regular/configs/{config_id}/clone", response_model=RegularCourseConfigResponse)
def clone_config(
    config_id: int,
    target_year: int = Query(..., description="Target year for the cloned config"),
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Clone an existing config for a new year."""
    source = db.query(RegularCourseConfig).filter(RegularCourseConfig.id == config_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Config not found")

    existing = db.query(RegularCourseConfig).filter(RegularCourseConfig.year == target_year).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Config for year {target_year} already exists")

    year_diff = target_year - source.year

    from dateutil.relativedelta import relativedelta

    clone = RegularCourseConfig(
        year=target_year,
        title=source.title.replace(str(source.year), str(target_year)),
        description=source.description,
        application_open_date=source.application_open_date + relativedelta(years=year_diff),
        application_close_date=source.application_close_date + relativedelta(years=year_diff),
        course_start_date=source.course_start_date + relativedelta(years=year_diff),
        locations=source.locations,
        available_grades=source.available_grades,
        time_slots=source.time_slots,
        existing_student_options=source.existing_student_options,
        center_options=source.center_options,
        lang_stream_options=source.lang_stream_options,
        text_content=source.text_content,
        course_intro=source.course_intro,
        pricing_config=source.pricing_config,
        banner_image_url=source.banner_image_url,
        is_active=False,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


# ---- Applications admin ----

# Copy of summer's map for resolving a claimed centre to a Secondary branch
# code (keep in sync with summer_course._SECONDARY_CENTER_NAME_TO_CODE).
_SECONDARY_CENTER_NAME_TO_CODE: dict[str, str] = {
    "華士古分校": "MSA",
    "二龍喉分校": "MSB",
    "MathConcept中學教室 (華士古分校)": "MSA",
    "MathConcept中學教室 (二龍喉分校)": "MSB",
}

_SECONDARY_BRANCH_CODES = frozenset({"MSA", "MSB"})

# Must match the merged match_reason emitted by find_duplicate_students for a
# combined exact-name + phone hit (see routers/students.py).
_AUTO_LINK_REASON = "Same name and phone at this location"


@router.get("/regular/admin/suggest-student-links")
def admin_suggest_student_links(
    config_id: int = Query(...),
    dry_run: bool = Query(False, description="When true, preview without auto-linking high-confidence matches."),
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Scan unlinked secondary-claiming apps and suggest matching Student rows.

    Scope: apps in this config whose claimed centre resolves to a Secondary
    Academy branch (MSA/MSB) and that are not yet linked to a Student. High
    confidence 1:1 matches (same name AND phone at the branch) are linked
    automatically unless dry_run.
    """
    candidate_apps = (
        db.query(RegularApplication)
        .filter(
            RegularApplication.config_id == config_id,
            RegularApplication.is_existing_student == "MathConcept Secondary Academy",
            RegularApplication.existing_student_id.is_(None),
        )
        .all()
    )
    apps: list[tuple[RegularApplication, str]] = []
    for app in candidate_apps:
        center_name = (app.current_centers or [None])[0]
        code = _SECONDARY_CENTER_NAME_TO_CODE.get(center_name or "")
        if code in _SECONDARY_BRANCH_CODES:
            apps.append((app, code))

    def a_summary(a: RegularApplication, code: str) -> dict:
        return {
            "id": a.id,
            "student_name": a.student_name,
            "reference_code": a.reference_code,
            "contact_phone": a.contact_phone,
            "preferred_location": a.preferred_location,
            "grade": a.grade,
            "claimed_branch_code": code,
        }

    matches: list[dict] = []
    skipped: list[dict] = []

    for app, code in apps:
        candidates = find_duplicate_students(
            db, app.student_name, code, app.contact_phone
        )
        strong = [c for c in candidates if c["match_reason"] == _AUTO_LINK_REASON]
        if len(strong) == 1 and len(candidates) == 1:
            chosen = strong[0]
            matches.append({"application": a_summary(app, code), "student": chosen})
            if not dry_run:
                app.existing_student_id = chosen["id"]
        elif candidates:
            skipped.append({
                "application": a_summary(app, code),
                "reason": "ambiguous_candidates",
                "candidates": candidates,
            })

    if not dry_run:
        db.commit()

    return {
        "total_unlinked": len(apps),
        "matches": matches,
        "skipped": skipped,
    }


@router.get("/regular/applications", response_model=list[RegularApplicationResponse])
def list_applications(
    config_id: Optional[int] = None,
    application_status: Optional[str] = None,
    grade: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    published: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List regular applications with optional filters.

    `published` accepts "published" (apps with a linked Enrollment) or
    "unpublished" (no Enrollment yet). Anything else is treated as no filter.
    """
    q = db.query(RegularApplication)
    if config_id:
        q = q.filter(RegularApplication.config_id == config_id)
    if application_status:
        q = q.filter(RegularApplication.application_status == application_status)
    if grade:
        q = q.filter(RegularApplication.grade == grade)
    if location:
        q = q.filter(RegularApplication.preferred_location == location)
    if search:
        q = q.filter(_application_search_clause(search))
    pub_clause = _published_filter_clause(db, published)
    if pub_clause is not None:
        q = q.filter(pub_clause)

    apps = q.order_by(RegularApplication.submitted_at.desc()).all()
    return _build_application_responses(db, apps)


@router.get("/regular/applications/stats", response_model=RegularApplicationStats)
def get_application_stats(
    config_id: Optional[int] = None,
    application_status: Optional[str] = None,
    grade: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    published: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Aggregate stats honoring the same filters as /regular/applications."""
    filters = []
    if config_id:
        filters.append(RegularApplication.config_id == config_id)
    if application_status:
        filters.append(RegularApplication.application_status == application_status)
    if grade:
        filters.append(RegularApplication.grade == grade)
    if location:
        filters.append(RegularApplication.preferred_location == location)
    if search:
        filters.append(_application_search_clause(search))
    pub_clause = _published_filter_clause(db, published)
    if pub_clause is not None:
        filters.append(pub_clause)

    total = db.query(func.count(RegularApplication.id)).filter(*filters).scalar() or 0
    by_status = dict(
        db.query(RegularApplication.application_status, func.count(RegularApplication.id))
        .filter(*filters)
        .group_by(RegularApplication.application_status)
        .all()
    )
    by_grade = dict(
        db.query(RegularApplication.grade, func.count(RegularApplication.id))
        .filter(*filters)
        .group_by(RegularApplication.grade)
        .all()
    )
    by_location = dict(
        db.query(
            func.coalesce(RegularApplication.preferred_location, "Unknown"),
            func.count(RegularApplication.id),
        )
        .filter(*filters)
        .group_by(RegularApplication.preferred_location)
        .all()
    )

    return RegularApplicationStats(
        total=total,
        by_status=by_status,
        by_grade=by_grade,
        by_location=by_location,
    )


@router.get("/regular/applications/{app_id}", response_model=RegularApplicationResponse)
def get_application(
    app_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get a single application by ID."""
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _build_application_responses(db, [app])[0]


@router.get(
    "/regular/applications/{app_id}/edits",
    response_model=list[RegularApplicationEditEntry],
)
def list_application_edits(
    app_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Audit trail for one application, newest first."""
    return (
        db.query(RegularApplicationEdit)
        .filter(RegularApplicationEdit.application_id == app_id)
        .order_by(RegularApplicationEdit.edited_at.desc(), RegularApplicationEdit.id.desc())
        .all()
    )


@router.patch("/regular/applications/{app_id}", response_model=RegularApplicationResponse)
def update_application(
    app_id: int,
    data: RegularApplicationUpdate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update application status/notes/details (admin)."""
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    updates = data.model_dump(exclude_unset=True)
    admin_label = admin.tutor_name or admin.user_email or "admin"

    # Track reviewer + write audit row when status changes
    if "application_status" in updates:
        new_status = updates.pop("application_status")
        if hasattr(new_status, "value"):
            new_status = new_status.value
        if app.application_status != new_status:
            _write_status_audit(db, app, app.application_status, new_status, admin_label)
        app.application_status = new_status
        app.reviewed_by = admin_label
        app.reviewed_at = hk_now()

    # Detail-field edits go through the audit helper
    detail_changes = {k: updates.pop(k) for k in list(updates.keys()) if k in _ADMIN_EDITABLE_FIELDS}
    if detail_changes:
        _apply_application_edits(
            db,
            app,
            detail_changes,
            edited_via="admin",
            edited_by=admin_label,
            allowed_fields=_ADMIN_EDITABLE_FIELDS,
        )

    # Anything left (admin_notes, existing_student_id) is written directly
    # without audit — admin-only bookkeeping fields.
    for field, value in updates.items():
        setattr(app, field, value)

    db.commit()
    db.refresh(app)
    return _build_application_responses(db, [app])[0]


# ---- Demand summary ----

@router.get("/regular/demand", response_model=RegularDemandResponse)
def get_demand(
    config_id: int,
    location: str,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Demand summary: preference counts by day x time_slot x grade."""
    apps = (
        db.query(RegularApplication)
        .filter(
            RegularApplication.config_id == config_id,
            RegularApplication.preferred_location == location,
            RegularApplication.application_status.not_in(["Withdrawn", "Rejected"]),
        )
        .all()
    )

    cells: dict[tuple[str, str], dict] = {}
    for app in apps:
        primary_slots, backup_slots = _classify_prefs(app)
        for key in primary_slots:
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["first"][app.grade] = cell["first"].get(app.grade, 0) + 1
        for key in backup_slots:
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["second"][app.grade] = cell["second"].get(app.grade, 0) + 1

    demand_cells = [
        RegularDemandCell(
            day=day,
            time_slot=time,
            total_first_pref=sum(data["first"].values()),
            total_second_pref=sum(data["second"].values()),
            by_grade_first=data["first"],
            by_grade_second=data["second"],
        )
        for (day, time), data in sorted(cells.items())
    ]

    return RegularDemandResponse(location=location, cells=demand_cells)


# ============================================
# Arrangement: weekly slots + assignment
# ============================================

def _slot_responses(db: Session, slots: list[RegularCourseSlot]) -> list[RegularSlotResponse]:
    """Build slot responses with batched assignment + publish lookups."""
    if not slots:
        return []
    slot_ids = [s.id for s in slots]
    assigned = (
        db.query(RegularApplication)
        .filter(RegularApplication.assigned_slot_id.in_(slot_ids))
        .order_by(RegularApplication.student_name)
        .all()
    )
    published = _get_published_enrollment_ids(db, [a.id for a in assigned])
    by_slot: dict[int, list[RegularSlotStudentInfo]] = {}
    for a in assigned:
        by_slot.setdefault(a.assigned_slot_id, []).append(RegularSlotStudentInfo(
            application_id=a.id,
            student_name=a.student_name,
            grade=a.grade,
            lang_stream=a.lang_stream,
            school=a.school,
            application_status=a.application_status,
            published=a.id in published,
        ))
    tutor_ids = {s.tutor_id for s in slots if s.tutor_id}
    tutor_names: dict[int, str] = {}
    if tutor_ids:
        tutor_names = dict(
            db.query(Tutor.id, Tutor.tutor_name).filter(Tutor.id.in_(tutor_ids)).all()
        )
    return [
        RegularSlotResponse(
            id=s.id,
            config_id=s.config_id,
            slot_day=s.slot_day,
            time_slot=s.time_slot,
            location=s.location,
            grade=s.grade,
            tutor_id=s.tutor_id,
            tutor_name=tutor_names.get(s.tutor_id) if s.tutor_id else None,
            max_students=s.max_students,
            assigned_count=len(by_slot.get(s.id, [])),
            students=by_slot.get(s.id, []),
        )
        for s in slots
    ]


@router.get("/regular/slots", response_model=list[RegularSlotResponse])
def list_slots(
    config_id: int,
    location: Optional[str] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """List arrangement slots for a config, with assigned students."""
    query = db.query(RegularCourseSlot).filter(RegularCourseSlot.config_id == config_id)
    if location:
        query = query.filter(RegularCourseSlot.location == location)
    slots = query.order_by(RegularCourseSlot.id).all()
    return _slot_responses(db, slots)


@router.post("/regular/slots", response_model=RegularSlotResponse, status_code=201)
def create_slot(
    data: RegularSlotCreate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Create a weekly arrangement slot."""
    config = db.query(RegularCourseConfig).filter(RegularCourseConfig.id == data.config_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    if data.tutor_id is not None:
        tutor = db.query(Tutor).filter(Tutor.id == data.tutor_id).first()
        if not tutor:
            raise HTTPException(status_code=404, detail=f"Tutor with ID {data.tutor_id} not found")
    slot = RegularCourseSlot(**data.model_dump())
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return _slot_responses(db, [slot])[0]


@router.patch("/regular/slots/{slot_id}", response_model=RegularSlotResponse)
def update_slot(
    slot_id: int,
    data: RegularSlotUpdate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Update a slot. Capacity cannot drop below the assigned count."""
    slot = db.query(RegularCourseSlot).filter(RegularCourseSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    updates = data.model_dump(exclude_unset=True)
    if updates.get("tutor_id") is not None:
        tutor = db.query(Tutor).filter(Tutor.id == updates["tutor_id"]).first()
        if not tutor:
            raise HTTPException(status_code=404, detail=f"Tutor with ID {updates['tutor_id']} not found")
    if "max_students" in updates:
        assigned_count = (
            db.query(func.count(RegularApplication.id))
            .filter(RegularApplication.assigned_slot_id == slot_id)
            .scalar()
        )
        if updates["max_students"] < assigned_count:
            raise _publish_error(
                "capacity_below_assigned",
                f"Slot has {assigned_count} assigned student(s). "
                "Unassign some before lowering capacity.",
            )
    for field, value in updates.items():
        setattr(slot, field, value)
    db.commit()
    db.refresh(slot)
    return _slot_responses(db, [slot])[0]


@router.delete("/regular/slots/{slot_id}")
def delete_slot(
    slot_id: int,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Delete a slot. Blocked while any application is assigned to it."""
    slot = db.query(RegularCourseSlot).filter(RegularCourseSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")
    assigned_count = (
        db.query(func.count(RegularApplication.id))
        .filter(RegularApplication.assigned_slot_id == slot_id)
        .scalar()
    )
    if assigned_count:
        raise _publish_error(
            "slot_has_assignments",
            f"Slot has {assigned_count} assigned student(s). Unassign them first.",
        )
    db.delete(slot)
    db.commit()
    return {"success": True}


@router.patch("/regular/applications/{app_id}/slot", response_model=RegularApplicationResponse)
def assign_application_slot(
    app_id: int,
    req: RegularSlotAssignRequest,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Assign an application to a slot (slot_id null unassigns). Capacity is
    enforced here; assignment never changes the application status."""
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    old_slot_id = app.assigned_slot_id
    if req.slot_id is not None:
        slot = db.query(RegularCourseSlot).filter(RegularCourseSlot.id == req.slot_id).first()
        if not slot:
            raise HTTPException(status_code=404, detail="Slot not found")
        if slot.config_id != app.config_id:
            raise _publish_error(
                "slot_config_mismatch",
                "Slot belongs to a different intake config.",
            )
        if req.slot_id != old_slot_id:
            assigned_count = (
                db.query(func.count(RegularApplication.id))
                .filter(
                    RegularApplication.assigned_slot_id == req.slot_id,
                    RegularApplication.id != app.id,
                )
                .scalar()
            )
            if assigned_count >= slot.max_students:
                raise _publish_error(
                    "slot_full",
                    f"Slot is full ({assigned_count}/{slot.max_students}).",
                )

    if req.slot_id != old_slot_id:
        app.assigned_slot_id = req.slot_id
        db.add(RegularApplicationEdit(
            application_id=app.id,
            field_name="assigned_slot_id",
            old_value=str(old_slot_id) if old_slot_id is not None else None,
            new_value=str(req.slot_id) if req.slot_id is not None else None,
            edited_via="admin",
            edited_by=admin.user_email or "admin",
        ))
        db.commit()
        db.refresh(app)
    return _build_application_responses(db, [app])[0]


def _norm_school(school: Optional[str]) -> Optional[str]:
    s = (school or "").strip().lower()
    return s or None


@router.get("/regular/suggest", response_model=RegularSuggestResponse)
def suggest_slots(
    config_id: int,
    application_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Capacity-strict slot suggestions for one application.

    Ranking: preference-1 match > preference-2 match > explicit same-grade,
    with bonuses from the slot's already-assigned members (majority lang
    stream match, schoolmates). Grade-compatible = slot grade equals the
    applicant's or is unset. Full slots are excluded."""
    app = (
        db.query(RegularApplication)
        .filter(
            RegularApplication.id == application_id,
            RegularApplication.config_id == config_id,
        )
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    query = db.query(RegularCourseSlot).filter(RegularCourseSlot.config_id == config_id)
    if app.preferred_location:
        query = query.filter(RegularCourseSlot.location == app.preferred_location)
    slots = query.all()
    slot_infos = {s.id: s for s in slots}
    members: dict[int, list[RegularApplication]] = {}
    if slot_infos:
        for member in (
            db.query(RegularApplication)
            .filter(RegularApplication.assigned_slot_id.in_(slot_infos.keys()))
            .all()
        ):
            members.setdefault(member.assigned_slot_id, []).append(member)

    tutor_ids = {s.tutor_id for s in slots if s.tutor_id}
    tutor_names: dict[int, str] = {}
    if tutor_ids:
        tutor_names = dict(
            db.query(Tutor.id, Tutor.tutor_name).filter(Tutor.id.in_(tutor_ids)).all()
        )

    app_school = _norm_school(app.school)
    suggestions: list[RegularSuggestion] = []
    for slot in slots:
        if slot.id == app.assigned_slot_id:
            continue
        assigned = members.get(slot.id, [])
        if len(assigned) >= slot.max_students:
            continue  # capacity-strict
        if slot.grade and slot.grade != app.grade:
            continue  # grade-incompatible

        score = 0
        reasons: list[str] = []
        if (
            app.preference_1_day and app.preference_1_time
            and slot.slot_day == app.preference_1_day
            and slot.time_slot == app.preference_1_time
        ):
            score += 300
            reasons.append("pref_1_match")
        elif (
            app.preference_2_day and app.preference_2_time
            and slot.slot_day == app.preference_2_day
            and slot.time_slot == app.preference_2_time
        ):
            score += 200
            reasons.append("pref_2_match")
        if slot.grade == app.grade:
            score += 100
            reasons.append("same_grade")
        else:
            score += 40  # grade-unset slot: compatible but weaker signal
        if app.lang_stream and assigned:
            stream_matches = sum(1 for m in assigned if m.lang_stream == app.lang_stream)
            if stream_matches * 2 >= len(assigned):
                score += 30
                reasons.append("stream_match")
        if app_school:
            schoolmates = sum(1 for m in assigned if _norm_school(m.school) == app_school)
            if schoolmates:
                score += 15 * schoolmates
                reasons.append(f"schoolmates:{schoolmates}")

        suggestions.append(RegularSuggestion(
            slot_id=slot.id,
            slot_day=slot.slot_day,
            time_slot=slot.time_slot,
            location=slot.location,
            grade=slot.grade,
            tutor_name=tutor_names.get(slot.tutor_id) if slot.tutor_id else None,
            assigned_count=len(assigned),
            max_students=slot.max_students,
            score=score,
            reasons=reasons,
        ))

    # Prefer filling existing groups on ties.
    suggestions.sort(key=lambda s: (-s.score, -s.assigned_count, s.slot_id))
    return RegularSuggestResponse(
        application_id=app.id,
        suggestions=suggestions[:5],
    )


# ============================================
# Publish bridge → native Regular enrollment
# ============================================

# Statuses from which publishing is allowed: the weekly slot must have been
# agreed with the parent first. Side exits are explicit non-publishes.
PUBLISHABLE_APP_STATUSES = (
    RegularApplicationStatus.SCHEDULE_CONFIRMED.value,
)


def _publish_error(error_code: str, message: str, **extra) -> HTTPException:
    """Build a 400 with a stable error_code so the UI can map to copy."""
    detail = {"error_code": error_code, "message": message}
    detail.update(extra)
    return HTTPException(status_code=400, detail=detail)


def _first_weekday_on_or_after(start: date_type, day: str) -> date_type:
    """First occurrence of `day` (full or short form) on/after `start`."""
    short = normalize_day_short(day)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    if short not in days:
        raise _publish_error("invalid_day", f"Unrecognized weekday: {day}")
    return start + timedelta(days=(days.index(short) - start.weekday()) % 7)


def _publish_application_inner(
    db: Session, app_id: int, req: RegularPublishRequest, admin_email: str
) -> RegularPublishResponse:
    """Core publish logic. Raises HTTPException on hard blocks. Caller commits."""
    app = (
        db.query(RegularApplication)
        .options(joinedload(RegularApplication.config))
        .filter(RegularApplication.id == app_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    # Block: must have a linked existing student.
    if not app.existing_student_id:
        raise _publish_error(
            "no_linked_student",
            "Application has no linked student. Link or create one in the "
            "application detail modal before publishing.",
        )

    # Block: already published (also enforced by unique index, but pre-check
    # gives a friendlier error and reveals the existing enrollment id).
    existing = (
        db.query(Enrollment)
        .filter(Enrollment.regular_application_id == app.id)
        .first()
    )
    if existing:
        raise _publish_error(
            "already_published",
            "This application has already been published.",
            enrollment_id=existing.id,
        )

    # Block: status threshold.
    if app.application_status not in PUBLISHABLE_APP_STATUSES:
        raise _publish_error(
            "status_too_early",
            f"Application status is '{app.application_status}'. "
            "Publishing requires Schedule Confirmed.",
            current_status=app.application_status,
        )

    # Resolve the schedule: explicit request fields win, otherwise fall back
    # to the assigned arrangement slot (one-click publish path).
    slot = (
        db.query(RegularCourseSlot)
        .filter(RegularCourseSlot.id == app.assigned_slot_id)
        .first()
        if app.assigned_slot_id
        else None
    )
    confirmed_day = req.confirmed_day or (slot.slot_day if slot else None)
    confirmed_time = req.confirmed_time or (slot.time_slot if slot else None)
    location = req.location or (slot.location if slot else None)
    tutor_id = req.tutor_id if req.tutor_id is not None else (slot.tutor_id if slot else None)

    if not confirmed_day or not confirmed_time or not location:
        raise _publish_error(
            "no_schedule",
            "No confirmed schedule. Supply day/time/location or assign the "
            "application to a slot first.",
        )
    if tutor_id is None:
        if slot:
            raise _publish_error(
                "slot_no_tutor",
                "The assigned slot has no tutor. Set a tutor on the slot or "
                "supply one in the publish request.",
            )
        raise _publish_error(
            "no_schedule",
            "No tutor supplied. Supply tutor_id or assign the application "
            "to a slot with a tutor.",
        )

    # Block: tutor must exist.
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise _publish_error("invalid_tutor", f"Tutor with ID {tutor_id} not found")

    # Validate discount (e.g. an auto-suggested coupon) like create_enrollment.
    # Coupon inventory is NOT decremented here — that happens at mark-paid.
    discount = None
    if req.discount_id:
        from routers.enrollments import discount_requires_min_lessons

        discount = db.query(Discount).filter(Discount.id == req.discount_id).first()
        if not discount:
            raise _publish_error(
                "invalid_discount", f"Discount with ID {req.discount_id} not found"
            )
        if discount_requires_min_lessons(discount) and req.lessons_paid < MIN_LESSONS_FOR_DISCOUNT:
            raise _publish_error(
                "discount_min_lessons",
                f"Discounts are not available for enrollments of fewer than "
                f"{MIN_LESSONS_FOR_DISCOUNT} lessons.",
            )

    assigned_day = normalize_day_short(confirmed_day)
    if assigned_day not in DAY_FULL_TO_SHORT.values():
        raise _publish_error("invalid_day", f"Unrecognized weekday: {confirmed_day}")

    course_start = app.config.course_start_date if app.config else None
    if req.first_lesson_date is not None:
        first_lesson_date = req.first_lesson_date
        if course_start and first_lesson_date < course_start:
            raise _publish_error(
                "first_lesson_too_early",
                f"First lesson date {first_lesson_date.isoformat()} is before the "
                f"course start date {course_start.isoformat()}.",
            )
        # The weekly cadence is generated from this date, so its weekday must
        # match the confirmed day or the label and the real dates diverge.
        actual_day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][first_lesson_date.weekday()]
        if actual_day != assigned_day:
            raise _publish_error(
                "first_lesson_day_mismatch",
                f"First lesson date {first_lesson_date.isoformat()} falls on {actual_day}, "
                f"not the confirmed day {assigned_day}.",
            )
    else:
        if not course_start:
            raise _publish_error("no_course_start", "Config has no course start date.")
        first_lesson_date = _first_weekday_on_or_after(course_start, assigned_day)

    # Generate the weekly cadence with holiday skipping (shared with the
    # native enrollment-creation flow). Local import mirrors summer_course's
    # pattern to avoid circular imports.
    from routers.enrollments import (
        generate_session_dates,
        check_student_conflicts,
        compute_enrollment_revenue_total,
    )

    sessions, skipped_holidays, _effective_end = generate_session_dates(
        first_lesson_date=first_lesson_date,
        assigned_day=assigned_day,
        lessons_paid=req.lessons_paid,
        enrollment_type='Regular',
        db=db,
    )
    non_holiday_dates = [s.session_date for s in sessions if not s.is_holiday]

    # Block: datetime collision with any existing active session.
    conflicts = check_student_conflicts(
        db=db,
        student_id=app.existing_student_id,
        session_dates=non_holiday_dates,
        time_slot=confirmed_time,
    )
    if conflicts:
        raise _publish_error(
            "datetime_collision",
            f"Student already has {len(conflicts)} active session(s) at the same date+time. "
            "Resolve conflicts before publishing.",
            conflicts=[
                RegularPublishConflictSession(
                    session_date=c.session_date,
                    time_slot=c.time_slot,
                    existing_tutor_name=c.existing_tutor_name,
                    session_status=c.session_status,
                    enrollment_id=c.enrollment_id,
                ).model_dump(mode="json")
                for c in conflicts
            ],
        )

    # Auto-detect is_new_student like the native create flow: new = no prior
    # non-Trial enrollment. Regular (unlike Summer) must carry the $100 reg
    # fee for genuinely new students.
    prior_non_trial = db.query(Enrollment).filter(
        Enrollment.student_id == app.existing_student_id,
        Enrollment.enrollment_type != 'Trial',
    ).first()
    is_new_student = prior_non_trial is None

    is_paid = req.payment_status == 'Paid'
    enrollment = Enrollment(
        student_id=app.existing_student_id,
        tutor_id=tutor_id,
        assigned_day=assigned_day,
        assigned_time=confirmed_time,
        location=normalize_secondary_location(location),
        lessons_paid=req.lessons_paid,
        first_lesson_date=first_lesson_date,
        payment_date=hk_now().date() if is_paid else None,
        payment_status=req.payment_status,
        enrollment_type='Regular',
        fee_message_sent=False,
        is_new_student=is_new_student,
        discount_id=req.discount_id,
        regular_application_id=app.id,
        last_modified_by=admin_email,
    )
    db.add(enrollment)
    db.flush()  # need enrollment.id for child sessions

    # Snapshot per-session revenue for the revenue views (excludes reg fee).
    enrollment.revenue_total = compute_enrollment_revenue_total(enrollment, db)

    fin_status = 'Paid' if is_paid else 'Unpaid'
    sessions_created = 0
    for preview in sessions:
        if preview.is_holiday:
            continue
        db.add(SessionLog(
            enrollment_id=enrollment.id,
            student_id=app.existing_student_id,
            tutor_id=tutor_id,
            session_date=preview.session_date,
            time_slot=confirmed_time,
            location=normalize_secondary_location(location),
            session_status='Scheduled',
            financial_status=fin_status,
            last_modified_by=admin_email,
        ))
        sessions_created += 1

    # Move app status to Enrolled (with audit), unless already there.
    if app.application_status != RegularApplicationStatus.ENROLLED.value:
        old_status = app.application_status
        app.application_status = RegularApplicationStatus.ENROLLED.value
        _write_status_audit(db, app, old_status, app.application_status, admin_email)

    return RegularPublishResponse(
        application_id=app.id,
        enrollment_id=enrollment.id,
        sessions_created=sessions_created,
        first_lesson_date=first_lesson_date,
        skipped_holidays=skipped_holidays,
    )


@router.post(
    "/regular/applications/{app_id}/publish",
    response_model=RegularPublishResponse,
)
def publish_application(
    app_id: int,
    req: RegularPublishRequest,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Publish one regular application as a native Regular-typed Enrollment
    with cadence-generated session_log records."""
    result = _publish_application_inner(db, app_id, req, admin.user_email or "admin")
    db.commit()
    return result


@router.post(
    "/regular/applications/publish-batch",
    response_model=RegularPublishBatchResponse,
)
def publish_applications_batch(
    request: RegularPublishBatchRequest,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Publish many applications in one request. Each runs in its own
    SAVEPOINT so a failure on one doesn't roll back successful ones."""
    admin_email = admin.user_email or "admin"
    results: list[RegularPublishResult] = []
    published = 0
    failed = 0

    for item in request.items:
        req = RegularPublishRequest(**item.model_dump(exclude={"application_id"}))
        try:
            with db.begin_nested():  # SAVEPOINT per app
                outcome = _publish_application_inner(db, item.application_id, req, admin_email)
            results.append(RegularPublishResult(
                application_id=item.application_id,
                success=True,
                enrollment_id=outcome.enrollment_id,
                sessions_created=outcome.sessions_created,
            ))
            published += 1
        except HTTPException as exc:
            detail = exc.detail
            if isinstance(detail, dict):
                error_code = detail.get("error_code", "publish_failed")
                message = detail.get("message", str(detail))
            else:
                error_code = "publish_failed"
                message = str(detail)
            results.append(RegularPublishResult(
                application_id=item.application_id,
                success=False,
                error_code=error_code,
                error=message,
            ))
            failed += 1
        except Exception as exc:  # noqa: BLE001 — last-ditch catch keeps batch alive
            logger.exception("Unexpected error publishing regular application %s", item.application_id)
            results.append(RegularPublishResult(
                application_id=item.application_id,
                success=False,
                error_code="internal_error",
                error=str(exc),
            ))
            failed += 1

    db.commit()
    return RegularPublishBatchResponse(
        results=results,
        published_count=published,
        failed_count=failed,
    )


def _previous_status_before_enrollment(db: Session, app_id: int) -> str:
    """Look up the most recent audit row where status moved into 'Enrolled'
    and return its old_value. Fall back to 'Schedule Confirmed' if no audit."""
    edit = (
        db.query(RegularApplicationEdit)
        .filter(
            RegularApplicationEdit.application_id == app_id,
            RegularApplicationEdit.field_name == "application_status",
            RegularApplicationEdit.new_value == RegularApplicationStatus.ENROLLED.value,
        )
        .order_by(RegularApplicationEdit.edited_at.desc())
        .first()
    )
    if edit and edit.old_value:
        return edit.old_value
    return RegularApplicationStatus.SCHEDULE_CONFIRMED.value


@router.delete(
    "/regular/applications/{app_id}/publish",
    response_model=RegularUnpublishResponse,
)
def unpublish_application(
    app_id: int,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Roll back a publish: delete the Regular enrollment and its session_log
    rows. Blocks if any session has been marked attended."""
    admin_email = admin.user_email or "admin"
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.regular_application_id == app_id)
        .first()
    )
    if not enrollment:
        raise _publish_error(
            "not_published",
            "This application has not been published. Nothing to unpublish.",
        )

    # Block: any attended session locks the enrollment.
    locked = (
        db.query(SessionLog)
        .filter(
            SessionLog.enrollment_id == enrollment.id,
            SessionLog.session_status.in_(COMPLETED_STATUSES),
        )
        .all()
    )
    if locked:
        raise _publish_error(
            "sessions_attended",
            f"{len(locked)} session(s) already attended. Cannot unpublish — "
            "delete or undo attendance on those sessions first.",
            session_ids=[s.id for s in locked],
        )

    sessions_deleted = (
        db.query(SessionLog)
        .filter(SessionLog.enrollment_id == enrollment.id)
        .delete(synchronize_session="fetch")
    )
    db.delete(enrollment)

    # Revert app status with audit.
    target_status = _previous_status_before_enrollment(db, app_id)
    if app.application_status != target_status:
        old_status = app.application_status
        app.application_status = target_status
        _write_status_audit(db, app, old_status, target_status, admin_email)

    db.commit()
    return RegularUnpublishResponse(
        application_id=app_id,
        enrollment_id=enrollment.id,
        sessions_deleted=sessions_deleted,
        application_status=app.application_status,
    )
