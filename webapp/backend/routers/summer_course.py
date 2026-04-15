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
    SummerApplicationEdit,
    SummerCourseSlot,
    SummerSession,
    SummerLesson,
    SummerTutorDuty,
    Tutor,
    Student,
    PrimaryProspect,
)
from schemas import (
    SummerCourseFormConfig,
    SummerApplicationCreate,
    SummerApplicationEditRequest,
    SummerApplicationEditEntry,
    SummerApplicationSubmitResponse,
    SummerApplicationStatusResponse,
    SummerBuddyChangeRequest,
    SummerBuddyChangeResponse,
    SummerBuddyGroupPublicResponse,
    SummerSiblingCreateRequest,
    SummerSiblingAdminUpdate,
    SummerSiblingInfo,
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
    LinkedSecondaryStudentInfo,
    LinkedPrimaryProspectInfo,
)
from auth.dependencies import require_admin_view, require_admin_write
from routers.students import find_duplicate_students
from utils.rate_limiter import check_ip_rate_limit
from constants import (
    hk_now,
    SummerApplicationStatus,
    SummerSiblingVerificationStatus,
    SUMMER_NON_ATTENDING_STATUSES,
    PRIMARY_BRANCH_OPTIONS,
    PRIMARY_BRANCH_CODES,
)

PENDING = SummerSiblingVerificationStatus.PENDING.value
CONFIRMED = SummerSiblingVerificationStatus.CONFIRMED.value
REJECTED = SummerSiblingVerificationStatus.REJECTED.value

router = APIRouter()
logger = logging.getLogger(__name__)

# Public cap on buddy group size. Admin PATCH bypasses this to allow manual overflow pairing.
PUBLIC_BUDDY_GROUP_CAP = 3


def _build_status_response(
    db: Session,
    app: SummerApplication,
) -> "SummerApplicationStatusResponse":
    """Compose the public status payload (used by status check + edit endpoints)."""
    buddy_code = None
    buddy_member_count = None
    siblings: list[SummerSiblingInfo] = []
    if app.buddy_group:
        buddy_code = app.buddy_group.buddy_code
        buddy_member_count = _get_buddy_member_count(db, app.buddy_group.id)
        siblings = _get_buddy_siblings(db, app.buddy_group.id, caller_application_id=app.id)
    return SummerApplicationStatusResponse(
        reference_code=app.reference_code,
        student_name=app.student_name,
        application_status=app.application_status,
        submitted_at=app.submitted_at,
        buddy_code=buddy_code,
        buddy_group_member_count=buddy_member_count,
        buddy_siblings=siblings,
        primary_branch_options=PRIMARY_BRANCH_OPTIONS,
        grade=app.grade,
        school=app.school,
        lang_stream=app.lang_stream,
        wechat_id=app.wechat_id,
        preferred_location=app.preferred_location,
        preference_1_day=app.preference_1_day,
        preference_1_time=app.preference_1_time,
        preference_2_day=app.preference_2_day,
        preference_2_time=app.preference_2_time,
        preference_3_day=app.preference_3_day,
        preference_3_time=app.preference_3_time,
        preference_4_day=app.preference_4_day,
        preference_4_time=app.preference_4_time,
        unavailability_notes=app.unavailability_notes,
        sessions_per_week=app.sessions_per_week or 1,
    )


def _classify_prefs(app: SummerApplication) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Split an application's 4 preference slots into (primary, backup) tiers.

    Mirrors ``webapp/frontend/lib/summer-preferences.ts``. Every consumer goes
    through this helper so the rule lives in exactly two places.
    """
    is_pair = (app.sessions_per_week or 1) >= 2
    def s(d, t):
        return (d, t) if d and t else None
    s1, s2 = s(app.preference_1_day, app.preference_1_time), s(app.preference_2_day, app.preference_2_time)
    s3, s4 = s(app.preference_3_day, app.preference_3_time), s(app.preference_4_day, app.preference_4_time)
    if is_pair:
        return [x for x in (s1, s2) if x], [x for x in (s3, s4) if x]
    return ([s1] if s1 else []), ([s2] if s2 else [])


def _normalize_phone(phone: str | None) -> str:
    """Strip everything except digits + leading '+' for duplicate-check parity.

    Stored value is the normalized form so two formats of the same number
    collapse to one. Display-friendliness is sacrificed for an unambiguous
    duplicate key.
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
    "preference_3_day",
    "preference_3_time",
    "preference_4_day",
    "preference_4_time",
    "unavailability_notes",
    "sessions_per_week",
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
    app: SummerApplication,
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
        db.add(SummerApplicationEdit(
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
    app: SummerApplication,
    old_status: str,
    new_status: str,
    edited_by: str | None,
) -> None:
    """Audit row for an admin status transition."""
    db.add(SummerApplicationEdit(
        application_id=app.id,
        edited_at=hk_now(),
        field_name="application_status",
        old_value=old_status,
        new_value=new_status,
        edited_via="admin",
        edited_by=edited_by,
    ))


def _assert_buddy_group_has_room(db: Session, group_id: int, *, headroom: int = 1) -> None:
    """Raise 400 if adding `headroom` members would exceed PUBLIC_BUDDY_GROUP_CAP.

    Acquires a row lock on the buddy group so concurrent declarations serialize.
    The lock is held until the calling request commits, so callers must do the
    insert + commit in the same transaction as this check.
    """
    db.query(SummerBuddyGroup).filter(SummerBuddyGroup.id == group_id).with_for_update().first()
    if _get_buddy_member_count(db, group_id) + headroom > PUBLIC_BUDDY_GROUP_CAP:
        raise HTTPException(
            status_code=400,
            detail=f"Group is full (max {PUBLIC_BUDDY_GROUP_CAP} members). Please create a new group or contact us for help.",
        )


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
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # excludes O/0/I/1
    code = "".join(secrets.choice(chars) for _ in range(4))
    return f"BG-{code}"


def _create_buddy_group(db: Session, config_id: int | None) -> SummerBuddyGroup:
    """Create a new buddy group with a unique code (retry on collision)."""
    for _ in range(10):
        code = _generate_buddy_code()
        existing = db.query(SummerBuddyGroup).filter(
            SummerBuddyGroup.buddy_code == code
        ).first()
        if not existing:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique code")
    group = SummerBuddyGroup(config_id=config_id, buddy_code=code)
    db.add(group)
    db.flush()
    return group


def _lookup_buddy_group(db: Session, code: str, config: SummerCourseConfig) -> SummerBuddyGroup | None:
    """Look up a buddy group by code, scoped to the given config/year."""
    return db.query(SummerBuddyGroup).filter(
        SummerBuddyGroup.buddy_code == code.strip().upper(),
        or_(
            SummerBuddyGroup.config_id == config.id,
            and_(SummerBuddyGroup.config_id.is_(None), SummerBuddyGroup.year == config.year),
        ),
    ).first()


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
    return SummerCourseFormConfig(
        year=config.year,
        title=config.title,
        description=config.description,
        application_open_date=config.application_open_date,
        application_close_date=config.application_close_date,
        course_start_date=config.course_start_date,
        course_end_date=config.course_end_date,
        total_lessons=config.total_lessons,
        pricing_config=config.pricing_config or {},
        locations=config.locations or [],
        available_grades=config.available_grades or [],
        time_slots=config.time_slots or [],
        existing_student_options=config.existing_student_options,
        center_options=config.center_options,
        lang_stream_options=config.lang_stream_options,
        text_content=config.text_content,
        course_intro=config.course_intro,
        banner_image_url=config.banner_image_url,
        primary_branch_options=PRIMARY_BRANCH_OPTIONS,
    )


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

    # Duplicate check: same (normalized phone, student name) within this config.
    # Same parent submitting multiple kids is allowed; same kid submitted twice
    # is rejected. Phone is normalized to digits-only so format variations
    # (spaces, hyphens, parens) collapse to one key.
    normalized_phone = _normalize_phone(data.contact_phone)
    student_name_clean = data.student_name.strip()
    existing_app = db.query(SummerApplication.id).filter(
        SummerApplication.config_id == config.id,
        SummerApplication.contact_phone == normalized_phone,
        SummerApplication.student_name == student_name_clean,
    ).first()
    if existing_app:
        raise HTTPException(
            status_code=400,
            detail="An application for this student has already been submitted from this phone number. Please use the status page to edit it.",
        )

    # Handle buddy code: join existing group or leave as None.
    # If a sibling is also being declared, we need room for both — pre-flight
    # the cap with both new members so we never end up in a state where the
    # app is committed but the sibling step fails.
    buddy_group_id = None
    buddy_code_out = None
    needs_sibling_slot = bool(data.declared_sibling)
    if data.buddy_code:
        group = _lookup_buddy_group(db, data.buddy_code, config)
        if not group:
            raise HTTPException(status_code=400, detail="Invalid buddy code")
        _assert_buddy_group_has_room(db, group.id, headroom=2 if needs_sibling_slot else 1)
        buddy_group_id = group.id
        buddy_code_out = group.buddy_code

    now_ts = hk_now()
    # Create application (reference_code generated after insert)
    app = SummerApplication(
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
        preference_3_day=data.preference_3_day,
        preference_3_time=data.preference_3_time,
        preference_4_day=data.preference_4_day,
        preference_4_time=data.preference_4_time,
        unavailability_notes=data.unavailability_notes,
        buddy_group_id=buddy_group_id,
        buddy_joined_at=now_ts if buddy_group_id else None,
        buddy_names=data.buddy_names,
        buddy_referrer_name=data.buddy_referrer_name,
        form_language=data.form_language or "zh",
        sessions_per_week=data.sessions_per_week,
        submitted_at=now_ts,
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

    # Self-declared sibling (optional). Requires a buddy group; silently
    # ignored otherwise so stale UI state can't block the submission. The
    # cap was already pre-flighted above with headroom=2 when a sibling was
    # declared, so this is the second-line defense against concurrent races
    # — it re-acquires the row lock and re-counts.
    if data.declared_sibling and app.buddy_group_id:
        _assert_buddy_group_has_room(db, app.buddy_group_id, headroom=1)
        db.add(_create_sibling_member(app, data.declared_sibling, config.year))
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
    app = db.query(SummerApplication).options(
        joinedload(SummerApplication.buddy_group)
    ).filter(
        SummerApplication.reference_code == reference_code.strip().upper(),
        SummerApplication.contact_phone == _normalize_phone(phone),
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    return _build_status_response(db, app)


def _get_buddy_member_count(db: Session, group_id: int) -> int:
    """Total members counted toward the discount threshold (apps + non-rejected siblings)."""
    app_count = db.query(func.count(SummerApplication.id)).filter(
        SummerApplication.buddy_group_id == group_id
    ).scalar() or 0
    sibling_count = db.query(func.count(SummerBuddyMember.id)).filter(
        SummerBuddyMember.buddy_group_id == group_id,
        SummerBuddyMember.verification_status != REJECTED,
    ).scalar() or 0
    return app_count + sibling_count


def _serialize_sibling(
    member: SummerBuddyMember,
    caller_application_id: Optional[int] = None,
    declared_by_name: Optional[str] = None,
) -> SummerSiblingInfo:
    return SummerSiblingInfo(
        id=member.id,
        name_en=member.student_name_en,
        name_zh=member.student_name_zh,
        source_branch=member.source_branch,
        verification_status=member.verification_status,
        declared_by_application_id=member.declared_by_application_id,
        declared_by_name=declared_by_name,
        can_remove=(
            member.verification_status == PENDING
            and caller_application_id is not None
            and member.declared_by_application_id == caller_application_id
        ),
        created_at=member.created_at,
    )


def _resolve_declarer_names(
    db: Session, members: list[SummerBuddyMember]
) -> dict[int, str]:
    """Look up the student_name for each declared_by_application_id in one query."""
    ids = {m.declared_by_application_id for m in members if m.declared_by_application_id}
    if not ids:
        return {}
    rows = db.query(SummerApplication.id, SummerApplication.student_name).filter(
        SummerApplication.id.in_(ids)
    ).all()
    return {r[0]: r[1] for r in rows}


def _get_buddy_siblings(
    db: Session, group_id: int, caller_application_id: Optional[int] = None
) -> list[SummerSiblingInfo]:
    rows = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.buddy_group_id == group_id,
        SummerBuddyMember.verification_status != REJECTED,
    ).order_by(SummerBuddyMember.created_at.asc()).all()
    names = _resolve_declarer_names(db, rows)
    return [
        _serialize_sibling(r, caller_application_id, names.get(r.declared_by_application_id))
        for r in rows
    ]


def _get_buddy_siblings_bulk(
    db: Session, group_ids: list[int]
) -> dict[int, list[SummerSiblingInfo]]:
    """Batch sibling lookup for multiple groups (avoids N+1 in list endpoints)."""
    if not group_ids:
        return {}
    rows = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.buddy_group_id.in_(group_ids),
        SummerBuddyMember.verification_status != REJECTED,
    ).order_by(SummerBuddyMember.created_at.asc()).all()
    names = _resolve_declarer_names(db, rows)
    by_group: dict[int, list[SummerSiblingInfo]] = {}
    for r in rows:
        by_group.setdefault(r.buddy_group_id, []).append(
            _serialize_sibling(r, declared_by_name=names.get(r.declared_by_application_id))
        )
    return by_group


def _validate_primary_branch(branch: str) -> str:
    code = (branch or "").strip().upper()
    if code not in PRIMARY_BRANCH_CODES:
        raise HTTPException(status_code=400, detail=f"Invalid primary branch: {code or '(empty)'}")
    return code


def _create_sibling_member(
    app: SummerApplication, data, year: int
) -> SummerBuddyMember:
    """Build (not commit) a new self-declared sibling row from a request payload."""
    branch_code = _validate_primary_branch(data.source_branch)
    name_zh = (data.name_zh or "").strip() or None if hasattr(data, "name_zh") else None
    return SummerBuddyMember(
        buddy_group_id=app.buddy_group_id,
        student_id=None,
        student_name_en=data.name_en.strip(),
        student_name_zh=name_zh,
        source_branch=branch_code,
        is_sibling=True,
        verification_status=PENDING,
        declared_by_application_id=app.id,
        year=year,
    )


@router.patch("/summer/public/application/{reference_code}/buddy", response_model=SummerBuddyChangeResponse)
def change_buddy_group(
    request: Request,
    reference_code: str,
    data: SummerBuddyChangeRequest,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Change buddy group for an existing application (public, auth via ref code + phone)."""
    check_ip_rate_limit(request, "summer_buddy")

    config = _get_active_config(db)
    if not config:
        raise HTTPException(status_code=404, detail="No active summer course found")

    now = hk_now()
    if now < config.application_open_date or now > config.application_close_date:
        raise HTTPException(status_code=400, detail="Application period is not open")

    app = db.query(SummerApplication).filter(
        SummerApplication.reference_code == reference_code.strip().upper(),
        SummerApplication.contact_phone == _normalize_phone(phone),
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if data.action == "leave":
        app.buddy_group_id = None
        app.buddy_joined_at = None
        app.buddy_referrer_name = None
        db.commit()
        return SummerBuddyChangeResponse(buddy_code=None, member_count=0)

    elif data.action == "join":
        if not data.buddy_code:
            raise HTTPException(status_code=400, detail="Buddy code is required to join a group")
        group = _lookup_buddy_group(db, data.buddy_code, config)
        if not group:
            raise HTTPException(status_code=400, detail="Invalid buddy code")
        # Don't count the applicant if they are already in this same group (no-op join)
        if app.buddy_group_id != group.id:
            _assert_buddy_group_has_room(db, group.id)
            app.buddy_joined_at = now
        app.buddy_group_id = group.id
        app.buddy_referrer_name = data.buddy_referrer_name
        app.buddy_names = None
        db.commit()
        return SummerBuddyChangeResponse(
            buddy_code=group.buddy_code,
            member_count=_get_buddy_member_count(db, group.id),
        )

    elif data.action == "create":
        group = _create_buddy_group(db, config.id)
        app.buddy_group_id = group.id
        app.buddy_joined_at = now
        app.buddy_referrer_name = None
        app.buddy_names = None
        db.commit()
        return SummerBuddyChangeResponse(
            buddy_code=group.buddy_code,
            member_count=_get_buddy_member_count(db, group.id),
        )

    raise HTTPException(status_code=400, detail="Invalid action")


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

    group = _create_buddy_group(db, config.id)
    db.commit()
    return {"buddy_code": group.buddy_code}


@router.get("/summer/public/buddy-group/{code}", response_model=SummerBuddyGroupPublicResponse)
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

    count = _get_buddy_member_count(db, group.id)
    # Anyone holding the code can hit this endpoint. Exposing the exact member
    # count is intentional: the apply form needs it to render "X members joined"
    # and to show whether the buddy discount threshold has been reached. This
    # is a deliberate trade-off — the codes are 6 random chars (~887M space)
    # and the endpoint is rate-limited, so the enumeration risk is theoretical.
    # Sibling NAMES are still hidden (only the authenticated status endpoint
    # returns them).
    return SummerBuddyGroupPublicResponse(
        buddy_code=group.buddy_code,
        member_count=count,
        is_full=count >= PUBLIC_BUDDY_GROUP_CAP,
        max_members=PUBLIC_BUDDY_GROUP_CAP,
    )


# ---- Self-declared sibling endpoints (public, ref-code + phone auth) ----

def _authenticate_application(
    db: Session, reference_code: str, phone: str
) -> SummerApplication:
    app = db.query(SummerApplication).filter(
        SummerApplication.reference_code == reference_code.strip().upper(),
        SummerApplication.contact_phone == _normalize_phone(phone),
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.post(
    "/summer/public/application/{reference_code}/sibling",
    response_model=SummerSiblingInfo,
)
def declare_sibling(
    request: Request,
    reference_code: str,
    data: SummerSiblingCreateRequest,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Declare a primary-branch sibling on the caller's buddy group."""
    check_ip_rate_limit(request, "summer_buddy")
    app = _authenticate_application(db, reference_code, phone)
    if not app.buddy_group_id:
        raise HTTPException(
            status_code=400,
            detail="Join or create a buddy group before declaring a sibling.",
        )
    _assert_buddy_group_has_room(db, app.buddy_group_id)
    member = _create_sibling_member(app, data, app.config.year if app.config else hk_now().year)
    db.add(member)
    db.commit()
    db.refresh(member)
    return _serialize_sibling(member, caller_application_id=app.id)


@router.delete(
    "/summer/public/application/{reference_code}/sibling/{member_id}",
    status_code=204,
)
def remove_sibling(
    request: Request,
    reference_code: str,
    member_id: int,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Remove a Pending sibling the caller previously declared."""
    check_ip_rate_limit(request, "summer_buddy")
    app = _authenticate_application(db, reference_code, phone)
    member = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.id == member_id,
    ).first()
    if not member or member.buddy_group_id != app.buddy_group_id:
        raise HTTPException(status_code=404, detail="Sibling not found")
    if member.verification_status != PENDING:
        raise HTTPException(
            status_code=400,
            detail="Confirmed siblings cannot be removed by the parent. Please contact us.",
        )
    # Authorization invariant: even though every member of the buddy group
    # could in principle hit this endpoint with their own ref code + phone,
    # only the applicant who originally declared the sibling may remove them.
    # Do not loosen this — the declaring applicant is the source of truth for
    # the relationship and should be the one to retract it.
    if member.declared_by_application_id != app.id:
        raise HTTPException(
            status_code=403,
            detail="Only the parent who declared this sibling may remove them.",
        )
    db.delete(member)
    db.commit()


# ---- Self-service application edit ----

@router.patch(
    "/summer/public/application/{reference_code}",
    response_model=SummerApplicationStatusResponse,
)
def edit_application(
    request: Request,
    reference_code: str,
    data: SummerApplicationEditRequest,
    phone: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Applicant self-edits their submission while it is still in Submitted state.

    Identity, contact phone, and buddy/sibling fields are NOT in the editable
    set — those go through dedicated endpoints or admin only. Once admin moves
    the application out of Submitted, this returns 409 and the status page
    hides edit affordances.
    """
    check_ip_rate_limit(request, "summer_edit")
    app = _authenticate_application(db, reference_code, phone)

    if app.application_status != SummerApplicationStatus.SUBMITTED.value:
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
    return _build_status_response(db, app)


# ---- Admin sibling endpoints ----

@router.patch(
    "/summer/admin/buddy-siblings/{member_id}",
    response_model=SummerSiblingInfo,
)
def admin_update_sibling(
    member_id: int,
    data: SummerSiblingAdminUpdate,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Admin: confirm / reject a self-declared sibling."""
    member = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.id == member_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Sibling not found")
    member.verification_status = data.verification_status
    if data.student_id is not None:
        member.student_id = data.student_id.strip() or None
    db.commit()
    db.refresh(member)
    declarer = None
    if member.declared_by_application_id:
        declarer = db.query(SummerApplication.student_name).filter(
            SummerApplication.id == member.declared_by_application_id
        ).scalar()
    return _serialize_sibling(member, declared_by_name=declarer)


@router.delete(
    "/summer/admin/buddy-siblings/{member_id}",
    status_code=204,
)
def admin_delete_sibling(
    member_id: int,
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Admin: hard-delete a sibling row (for cleanup)."""
    member = db.query(SummerBuddyMember).filter(
        SummerBuddyMember.id == member_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Sibling not found")
    db.delete(member)
    db.commit()


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
        course_intro=source.course_intro,
        banner_image_url=source.banner_image_url,
        is_active=False,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    return clone


# Maps the `name` values stored in SummerCourseConfig.center_options (the
# Chinese display string that ends up in SummerApplication.current_centers[0])
# to the internal branch code. "二龍喉分校" is ambiguous between MOT (Primary)
# and MSB (Secondary Academy) — disambiguate via is_existing_student. Kept
# here rather than on the config JSON because the code isn't stored there.
# Update alongside any seed_summer_*.py changes.
_PRIMARY_CENTER_NAME_TO_CODE: dict[str, str] = {
    "高士德分校": "MAC",
    "水坑尾分校": "MCP",
    "東方明珠分校": "MNT",
    "林茂塘分校": "MLT",
    "二龍喉分校": "MOT",
    "氹仔美景I分校": "MTA",
    "氹仔美景II分校": "MTR",
}

_SECONDARY_CENTER_NAME_TO_CODE: dict[str, str] = {
    "華士古分校": "MSA",
    "二龍喉分校": "MSB",
    # Full-name fallback in case an older config stored the unshortened form.
    "MathConcept中學教室 (華士古分校)": "MSA",
    "MathConcept中學教室 (二龍喉分校)": "MSB",
}


def _resolve_claimed_branch_code(
    center_name: Optional[str], is_existing: Optional[str]
) -> Optional[str]:
    """Map a stored center name to a branch code, using the existing-student
    category to disambiguate centers that exist on both Primary and Secondary
    sides (currently only 二龍喉分校)."""
    if not center_name:
        return None
    if is_existing == "MathConcept Secondary Academy":
        return _SECONDARY_CENTER_NAME_TO_CODE.get(center_name)
    if is_existing == "MathConcept Education":
        return _PRIMARY_CENTER_NAME_TO_CODE.get(center_name)
    # No category hint — try primary, then fall through to secondary.
    return (
        _PRIMARY_CENTER_NAME_TO_CODE.get(center_name)
        or _SECONDARY_CENTER_NAME_TO_CODE.get(center_name)
    )


def _get_linked_students_bulk(
    db: Session, student_ids: list[int]
) -> dict[int, LinkedSecondaryStudentInfo]:
    """Return {student_id: LinkedSecondaryStudentInfo} for admin list cards."""
    if not student_ids:
        return {}
    rows = (
        db.query(
            Student.id,
            Student.student_name,
            Student.school_student_id,
            Student.home_location,
        )
        .filter(Student.id.in_(student_ids))
        .all()
    )
    return {
        r.id: LinkedSecondaryStudentInfo(
            id=r.id,
            student_name=r.student_name,
            school_student_id=r.school_student_id,
            home_location=r.home_location,
        )
        for r in rows
    }


def _get_linked_prospects_bulk(
    db: Session, app_ids: list[int]
) -> dict[int, LinkedPrimaryProspectInfo]:
    """Return {summer_application_id: LinkedPrimaryProspectInfo}.

    One-way link: PrimaryProspect has a summer_application_id FK populated by
    the prospects-page Auto Match feature. Only unambiguous 1:1 matches are
    stored there, so at most one prospect per application.
    """
    if not app_ids:
        return {}
    rows = (
        db.query(
            PrimaryProspect.id,
            PrimaryProspect.student_name,
            PrimaryProspect.primary_student_id,
            PrimaryProspect.source_branch,
            PrimaryProspect.summer_application_id,
        )
        .filter(PrimaryProspect.summer_application_id.in_(app_ids))
        .all()
    )
    return {
        r.summer_application_id: LinkedPrimaryProspectInfo(
            id=r.id,
            student_name=r.student_name,
            primary_student_id=r.primary_student_id,
            source_branch=r.source_branch,
        )
        for r in rows
    }


def _get_buddy_group_sizes(
    db: Session, group_ids: list[int]
) -> dict[int, int]:
    """Return {buddy_group_id: applicant_count} for the given groups.

    Counts actual SummerApplication rows sharing each group — not declared
    siblings. Used for the buddy people-meter in the admin list card.
    """
    if not group_ids:
        return {}
    rows = (
        db.query(
            SummerApplication.buddy_group_id,
            func.count(SummerApplication.id),
        )
        .filter(SummerApplication.buddy_group_id.in_(group_ids))
        .group_by(SummerApplication.buddy_group_id)
        .all()
    )
    return {gid: count for gid, count in rows}


def _build_application_response(
    app: SummerApplication,
    siblings_by_group: Optional[dict[int, list[SummerSiblingInfo]]] = None,
    group_sizes: Optional[dict[int, int]] = None,
    linked_students: Optional[dict[int, LinkedSecondaryStudentInfo]] = None,
    linked_prospects: Optional[dict[int, LinkedPrimaryProspectInfo]] = None,
    slot_counts: Optional[dict[int, int]] = None,
) -> SummerApplicationResponse:
    """Build application response with embedded session and sibling info.

    Pass the bulk dicts from `_get_buddy_siblings_bulk`, `_get_buddy_group_sizes`,
    `_get_linked_students_bulk`, `_get_linked_prospects_bulk`, and
    `_get_slot_session_counts` to avoid N+1 in list endpoints.
    Single-app endpoints can omit all of them.
    """
    sessions = []
    for s in (app.sessions or []):
        if s.session_status == "Cancelled":
            continue
        slot = s.slot
        lesson = s.lesson
        sessions.append(SummerApplicationSessionInfo(
            id=s.id,
            slot_id=s.slot_id,
            slot_day=slot.slot_day if slot else "",
            time_slot=slot.time_slot if slot else "",
            grade=slot.grade if slot else None,
            tutor_name=slot.tutor.tutor_name if slot and slot.tutor else None,
            session_status=s.session_status,
            lesson_number=lesson.lesson_number if lesson else s.lesson_number,
            lesson_date=str(lesson.lesson_date) if lesson and lesson.lesson_date else None,
            slot_max_students=slot.max_students if slot else None,
            slot_current_count=(slot_counts or {}).get(s.slot_id),
        ))
    data = {col.key: getattr(app, col.key) for col in app.__table__.columns}
    data["sessions"] = sessions
    data["placed_count"] = len(sessions)
    data["buddy_code"] = app.buddy_code  # @property, not a column

    siblings = (siblings_by_group or {}).get(app.buddy_group_id or -1, [])
    data["buddy_siblings"] = siblings
    data["pending_sibling_count"] = sum(
        1 for s in siblings if s.verification_status == PENDING
    )
    # Optimistic group size for the discount meter: actual Secondary applicants
    # in the same buddy_group_id PLUS any non-rejected Primary-branch siblings
    # that have been declared. Pending declarations are counted optimistically —
    # if they're later rejected the meter drops.
    secondary_count = (
        (group_sizes or {}).get(app.buddy_group_id, 0) if app.buddy_group_id else 0
    )
    data["buddy_group_member_count"] = secondary_count + len(siblings)

    if app.existing_student_id and linked_students:
        data["linked_student"] = linked_students.get(app.existing_student_id)
    if linked_prospects:
        data["linked_prospect"] = linked_prospects.get(app.id)

    claimed_center = (app.current_centers or [None])[0]
    if claimed_center:
        data["claimed_branch_code"] = _resolve_claimed_branch_code(
            claimed_center, app.is_existing_student
        )

    return SummerApplicationResponse.model_validate(data)


def _get_slot_session_counts(db: Session, slot_ids: list[int]) -> dict[int, int]:
    """Count distinct students (applications) per slot in bulk."""
    if not slot_ids:
        return {}
    rows = (
        db.query(SummerSession.slot_id, func.count(func.distinct(SummerSession.application_id)))
        .filter(
            SummerSession.slot_id.in_(slot_ids),
            SummerSession.session_status.not_in(SUMMER_NON_ATTENDING_STATUSES),
        )
        .group_by(SummerSession.slot_id)
        .all()
    )
    return {slot_id: cnt for slot_id, cnt in rows}


def _build_application_responses(
    db: Session, apps: list[SummerApplication]
) -> list[SummerApplicationResponse]:
    """Build response list with batched sibling + group-size + linked-entity lookups."""
    group_ids = [a.buddy_group_id for a in apps if a.buddy_group_id]
    siblings_by_group = _get_buddy_siblings_bulk(db, group_ids)
    group_sizes = _get_buddy_group_sizes(db, group_ids)
    student_ids = [a.existing_student_id for a in apps if a.existing_student_id]
    linked_students = _get_linked_students_bulk(db, student_ids)
    linked_prospects = _get_linked_prospects_bulk(db, [a.id for a in apps])
    # Bulk-fetch slot session counts for capacity display
    slot_ids = list({
        s.slot_id for a in apps for s in (a.sessions or [])
        if s.session_status != "Cancelled"
    })
    slot_counts = _get_slot_session_counts(db, slot_ids)
    return [
        _build_application_response(
            a,
            siblings_by_group,
            group_sizes,
            linked_students,
            linked_prospects,
            slot_counts=slot_counts,
        )
        for a in apps
    ]


_SECONDARY_BRANCH_CODES = frozenset({"MSA", "MSB"})

# Strict auto-link threshold: only a candidate whose reason combines both name
# and phone is high-confidence enough to link without human review.
_AUTO_LINK_REASON = "Same name and phone at this location"


@router.get("/summer/admin/suggest-student-links")
def admin_suggest_student_links(
    config_id: int = Query(...),
    dry_run: bool = Query(False, description="When true, preview without auto-linking high-confidence matches."),
    _admin: None = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Scan unlinked secondary-claiming apps and suggest matching Student rows.

    Scope: apps in this config whose `claimed_branch_code` is a Secondary
    Academy branch (MSA/MSB) and that are not yet linked to a Student.

    Behaviour: for each app we run the same name+location / phone+location
    dupe-check used by the detail modal. High-confidence candidates (combined
    name+phone match at the same location) become `matches`; everything else
    is surfaced in `skipped` so the admin can pick manually. When dry_run is
    false, high-confidence 1:1 matches are linked automatically.
    """
    # claimed_branch_code is a derived response field, not a DB column — we
    # resolve it per-row here. Narrow the SQL filter to secondary claimants
    # (is_existing_student == "MathConcept Secondary Academy") and unlinked
    # apps; Python then drops rows whose center doesn't resolve to MSA/MSB.
    candidate_apps = (
        db.query(SummerApplication)
        .filter(
            SummerApplication.config_id == config_id,
            SummerApplication.is_existing_student == "MathConcept Secondary Academy",
            SummerApplication.existing_student_id.is_(None),
        )
        .all()
    )
    apps: list[tuple[SummerApplication, str]] = []
    for app in candidate_apps:
        center_name = (app.current_centers or [None])[0]
        code = _resolve_claimed_branch_code(center_name, app.is_existing_student)
        if code in _SECONDARY_BRANCH_CODES:
            apps.append((app, code))

    def a_summary(a: SummerApplication, code: str) -> dict:
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
            # Exactly one high-confidence 1:1 — safe to auto-link.
            chosen = strong[0]
            matches.append({"application": a_summary(app, code), "student": chosen})
            if not dry_run:
                app.existing_student_id = chosen["id"]
                if not app.verified_branch_origin and chosen.get("home_location"):
                    app.verified_branch_origin = chosen["home_location"]
        elif candidates:
            skipped.append({
                "application": a_summary(app, code),
                "reason": "ambiguous_candidates",
                "candidates": candidates,
            })
        # Apps with no candidates at all are neither matched nor skipped; the
        # total_unlinked count below tells the admin how many remain.

    if not dry_run:
        db.commit()

    return {
        "total_unlinked": len(apps),
        "matches": matches,
        "skipped": skipped,
    }


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
        joinedload(SummerApplication.sessions)
            .joinedload(SummerSession.lesson),
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
    return _build_application_responses(db, apps)


@router.get("/summer/applications/stats", response_model=SummerApplicationStats)
def get_application_stats(
    config_id: Optional[int] = None,
    application_status: Optional[str] = None,
    grade: Optional[str] = None,
    location: Optional[str] = None,
    search: Optional[str] = None,
    buddy_group_id: Optional[int] = None,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get aggregate stats for summer applications, honoring the same filters
    as /summer/applications so the list UI and its chip counts stay consistent.
    """
    filters = []
    if config_id:
        filters.append(SummerApplication.config_id == config_id)
    if application_status:
        filters.append(SummerApplication.application_status == application_status)
    if grade:
        filters.append(SummerApplication.grade == grade)
    if location:
        filters.append(SummerApplication.preferred_location == location)
    if buddy_group_id:
        filters.append(SummerApplication.buddy_group_id == buddy_group_id)
    if search:
        pattern = f"%{search}%"
        filters.append(
            (SummerApplication.student_name.ilike(pattern))
            | (SummerApplication.reference_code.ilike(pattern))
            | (SummerApplication.contact_phone.ilike(pattern))
        )

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
        joinedload(SummerApplication.sessions)
            .joinedload(SummerSession.lesson),
    ).filter(SummerApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _build_application_responses(db, [app])[0]


@router.get(
    "/summer/applications/{app_id}/edits",
    response_model=list[SummerApplicationEditEntry],
)
def list_application_edits(
    app_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Audit trail for one application, newest first."""
    rows = (
        db.query(SummerApplicationEdit)
        .filter(SummerApplicationEdit.application_id == app_id)
        .order_by(SummerApplicationEdit.edited_at.desc(), SummerApplicationEdit.id.desc())
        .all()
    )
    return rows


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
    admin_label = admin.tutor_name or admin.user_email or "admin"

    # Handle buddy_code changes specially
    buddy_code_value = updates.pop("buddy_code", None)
    if buddy_code_value is not None:
        prev_group_id = app.buddy_group_id
        if buddy_code_value == "":
            # Leave group
            app.buddy_group_id = None
            app.buddy_joined_at = None
            app.buddy_referrer_name = None
        elif buddy_code_value == "NEW":
            group = _create_buddy_group(db, app.config_id)
            app.buddy_group_id = group.id
            app.buddy_joined_at = hk_now()
            app.buddy_referrer_name = None
        else:
            # Join existing group by code
            group = db.query(SummerBuddyGroup).filter(
                SummerBuddyGroup.buddy_code == buddy_code_value.strip().upper()
            ).first()
            if not group:
                raise HTTPException(status_code=400, detail="Invalid buddy code")
            if prev_group_id != group.id:
                app.buddy_joined_at = hk_now()
            app.buddy_group_id = group.id
            # Set referrer name if provided alongside the join
            if "buddy_referrer_name" in updates:
                app.buddy_referrer_name = updates.pop("buddy_referrer_name")
        # Remove buddy_referrer_name from generic updates since we handled it
        updates.pop("buddy_referrer_name", None)

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

    # Anything left (admin_notes, existing_student_id, verified_branch_origin,
    # lang_stream when not in detail set) is written directly without audit —
    # these are admin-only bookkeeping fields.
    for field, value in updates.items():
        setattr(app, field, value)

    # Auto-fill verified_branch_origin when linking to a Secondary student,
    # unless the admin explicitly set it in the same request.
    if "existing_student_id" in data.model_fields_set and "verified_branch_origin" not in data.model_fields_set:
        if app.existing_student_id:
            student = db.query(Student).filter(Student.id == app.existing_student_id).first()
            if student and student.home_location:
                app.verified_branch_origin = student.home_location
        else:
            # Unlinked — clear auto-set origin (admin can re-verify manually)
            app.verified_branch_origin = None

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
    return _build_application_responses(db, [app])[0]


# ─── Slot CRUD ───────────────────────────────────────────────────────────────

def _build_slot_response(slot: SummerCourseSlot) -> SummerSlotResponse:
    """Build a SummerSlotResponse from an ORM slot with loaded relationships."""
    # Deduplicate: one entry per student (a student may have 8 session rows, one per lesson)
    # Keep non-cancelled sessions visible; exclude non-attending from capacity count
    seen: set[int] = set()
    unique_sessions = []
    for s in slot.sessions:
        if s.session_status == "Cancelled":
            continue
        if s.application_id in seen:
            continue
        seen.add(s.application_id)
        unique_sessions.append(s)

    attending_count = sum(
        1 for s in unique_sessions
        if s.session_status not in SUMMER_NON_ATTENDING_STATUSES
    )

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
        session_count=attending_count,
        sessions=[
            SummerSlotSessionInfo(
                id=s.id,
                application_id=s.application_id,
                student_name=s.application.student_name,
                grade=s.application.grade,
                session_status=s.session_status,
                buddy_group_id=s.application.buddy_group_id,
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
        attending = [s for s in lesson_sessions if s.session_status not in SUMMER_NON_ATTENDING_STATUSES]
        if len(attending) >= slot.max_students:
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
        active_students = {s.application_id for s in slot.sessions if s.session_status not in SUMMER_NON_ATTENDING_STATUSES}
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

    # Auto-sync: advance Submitted → Under Review once sessions exist
    if app.application_status == SummerApplicationStatus.SUBMITTED:
        app.application_status = SummerApplicationStatus.UNDER_REVIEW
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

    # If all sessions cancelled, revert app status
    app = session.application
    if app and data.session_status == "Cancelled":
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
    if remaining == 0 and app.application_status == SummerApplicationStatus.UNDER_REVIEW:
        app.application_status = SummerApplicationStatus.SUBMITTED
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
    slot_id: Optional[int] = None,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Confirm all tentative sessions for a config (optionally filtered by location and/or slot)."""
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
    if slot_id:
        q = q.filter(SummerSession.slot_id == slot_id)

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
        attending = [s for s in lesson_sessions if s.session_status not in SUMMER_NON_ATTENDING_STATUSES]
        if slot and len(attending) >= slot.max_students:
            skipped += 1
            continue

        session = SummerSession(
            application_id=item.application_id,
            slot_id=item.slot_id,
            lesson_id=item.lesson_id,
            session_status=item.session_status,
            placed_by=placed_by,
            placed_at=now,
        )
        db.add(session)
        # Track newly added sessions for capacity checks within this batch
        if item.lesson_id:
            sessions_by_lesson.setdefault(item.lesson_id, []).append(session)
        created += 1

    db.commit()

    # Auto-sync: Submitted → Under Review once sessions exist
    app_ids = list({item.application_id for item in items})
    if app_ids:
        db.query(SummerApplication).filter(
            SummerApplication.id.in_(app_ids),
            SummerApplication.application_status == SummerApplicationStatus.SUBMITTED,
        ).update(
            {SummerApplication.application_status: SummerApplicationStatus.UNDER_REVIEW},
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
        primary_slots, backup_slots = _classify_prefs(app)
        for key in primary_slots:
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["first"][app.grade] = cell["first"].get(app.grade, 0) + 1
        for key in backup_slots:
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
    return _build_application_responses(db, apps)


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

    # Bulk-fetch linked student/prospect info for branch chips
    student_ids = [a.existing_student_id for a in apps if a.existing_student_id]
    app_ids = [a.id for a in apps]
    linked_students = _get_linked_students_bulk(db, student_ids) if student_ids else {}
    linked_prospects = _get_linked_prospects_bulk(db, app_ids) if app_ids else {}

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
        rescheduled_count = sum(
            1 for s in placed_by_lesson.values()
            if s.session_status in SUMMER_NON_ATTENDING_STATUSES
        )
        claimed_center = (app.current_centers or [None])[0]
        rows.append(SummerStudentLessonsRow(
            application_id=app.id,
            student_name=app.student_name,
            grade=app.grade,
            lang_stream=app.lang_stream,
            application_status=app.application_status,
            is_existing_student=app.is_existing_student,
            claimed_branch_code=_resolve_claimed_branch_code(claimed_center, app.is_existing_student) if claimed_center else None,
            verified_branch_origin=app.verified_branch_origin,
            linked_student=linked_students.get(app.existing_student_id) if app.existing_student_id else None,
            linked_prospect=linked_prospects.get(app.id),
            sessions_per_week=app.sessions_per_week,
            placed_count=placed_count,
            rescheduled_count=rescheduled_count,
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
    all_lessons: list | None = None,
    max_gaps: int = 2,
) -> tuple[list | None, str, float]:
    """Find the best set of 8 lessons for a student.

    Allows up to `max_gaps` date-excluded lessons marked as pending make-up.
    Capacity gaps (all candidates full) are NOT included — they are truly skipped.

    Returns (assignments_list_or_None, match_type, confidence).
    Each item in assignments is a dict with lesson info ready for SummerLessonAssignment.
    """
    # Group available (date-filtered) lessons by lesson_number
    by_number: dict[int, list] = {}
    for lesson, slot in available_lessons:
        if lesson_capacity.get(lesson.id, 0) <= 0:
            continue
        by_number.setdefault(lesson.lesson_number, []).append((lesson, slot))

    # Sort each lesson_number's candidates by date ascending. With the strict
    # `>` comparison in the scoring loop below, earliest-date wins ties — which
    # is what produces the natural A/B twice-a-week interleave 1,5,2,6,3,7,4,8
    # for students whose pref 1 and pref 2 both match Type-A/B slots.
    for n in by_number:
        by_number[n].sort(key=lambda ls: ls[0].lesson_date)

    # Group ALL lessons (unfiltered) by lesson_number for gap detection
    all_by_number: dict[int, list] = {}
    if all_lessons:
        for lesson, slot in all_lessons:
            all_by_number.setdefault(lesson.lesson_number, []).append((lesson, slot))
        for n in all_by_number:
            all_by_number[n].sort(key=lambda ls: ls[0].lesson_date)

    def _build_assignment(lesson, slot, ln: int, *, is_pending_makeup: bool = False) -> dict:
        result = {
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
        if is_pending_makeup:
            result["is_pending_makeup"] = True
        return result

    needed = list(range(1, 9))  # lesson_numbers 1-8

    # Count how many lesson numbers are missing from filtered set
    missing_numbers = [n for n in needed if n not in by_number]
    # Among missing: which have lessons in unfiltered (date-excluded) vs truly none (capacity)?
    date_excluded_gaps = [n for n in missing_numbers if n in all_by_number]
    capacity_gaps = [n for n in missing_numbers if n not in all_by_number]

    # Capacity gaps cannot be filled at all — count towards gap limit
    # Date-excluded gaps can become pending make-up — count towards gap limit
    total_gaps = len(missing_numbers)
    if total_gaps > max_gaps:
        return None, "", 0.0
    # If there are only capacity gaps (no date exclusion involved), don't allow gaps at all
    # because there's nothing to mark as pending make-up
    if capacity_gaps and not date_excluded_gaps and total_gaps > 0:
        return None, "", 0.0

    # --- For 1x/week students: try single-slot solution first (only if no gaps) ---
    if app.sessions_per_week == 1 and total_gaps == 0:
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
    gap_count = 0

    best_match = "any_open"
    total_score = 0.0
    primary_pairs, backup_pairs = _classify_prefs(app)

    # Gated debug: set SUMMER_SUGGEST_DEBUG=1 in the backend env to trace scoring.
    import os
    _debug = os.getenv("SUMMER_SUGGEST_DEBUG") == "1"
    if _debug:
        print(
            f"[suggest] app={app.id} name={app.student_name} grade={app.grade} "
            f"spw={app.sessions_per_week} primary={primary_pairs} backup={backup_pairs}",
            flush=True,
        )

    for ln in process_order:
        candidates = by_number.get(ln, [])

        # Precompute earliness range across the candidates that still have
        # capacity. Earliness dominates capacity so A/B twice-a-week students
        # snap to the earliest preferred slot per lesson instead of drifting
        # to a slightly-less-full later slot.
        _avail_dates = [l.lesson_date for l, _ in candidates if lesson_capacity.get(l.id, 0) > 0]
        _min_d = min(_avail_dates) if _avail_dates else None
        _max_d = max(_avail_dates) if _avail_dates else None
        _span_days = (_max_d - _min_d).days if _min_d and _max_d and _max_d > _min_d else 0

        best_candidate = None
        best_cand_score = -1.0
        _debug_rows: list[tuple] = []

        for lesson, slot in candidates:
            if lesson_capacity.get(lesson.id, 0) <= 0:
                if _debug:
                    _debug_rows.append((lesson.lesson_date, slot.slot_day, slot.time_slot, "FULL", 0.0, 0.0, 0.0))
                continue

            cand_score = 0.0
            is_first = any(slot.slot_day == d and slot.time_slot == t for d, t in primary_pairs)
            is_second = (not is_first) and any(
                slot.slot_day == d and slot.time_slot == t for d, t in backup_pairs
            )
            if is_first:
                cand_score += 1.0
                _pref_label = "first"
            elif is_second:
                cand_score += 0.7
                _pref_label = "second"
            else:
                cand_score += 0.3
                _pref_label = "any"

            # Buddy bonus
            if app.buddy_group_id and app.buddy_group_id in lesson_buddy_groups.get(lesson.id, set()):
                cand_score += 0.1

            # Capacity: slight preference for less-full lessons (normalize to 0-0.05)
            remaining = lesson_capacity.get(lesson.id, 0)
            cand_score += min(remaining / 200.0, 0.05)

            # Earliness bonus (0-0.1): linear preference for earlier dates
            # within the same lesson number. Outweighs capacity (max 0.05).
            earliness_bonus = 0.0
            if _span_days > 0 and _min_d is not None:
                offset_days = (lesson.lesson_date - _min_d).days
                earliness_bonus = 0.1 * (1 - offset_days / _span_days)
            cand_score += earliness_bonus

            # Date ordering: prefer dates that maintain pair/group order
            ordering_bonus = 0.0
            if assigned_dates:
                lesson_date = lesson.lesson_date
                good_order = 0
                total_checks = 0
                for prev_ln, prev_date in assigned_dates:
                    if (prev_ln < ln and prev_date <= lesson_date) or \
                       (prev_ln > ln and prev_date >= lesson_date):
                        good_order += 1
                    total_checks += 1
                if total_checks > 0:
                    ordering_bonus = 0.2 * (good_order / total_checks)
            cand_score += ordering_bonus

            if _debug:
                _debug_rows.append(
                    (lesson.lesson_date, slot.slot_day, slot.time_slot, _pref_label,
                     round(earliness_bonus, 3), round(ordering_bonus, 3), round(cand_score, 3))
                )

            if cand_score > best_cand_score:
                best_cand_score = cand_score
                best_candidate = (lesson, slot, is_first, is_second)

        if _debug:
            print(f"[suggest] L{ln} candidates (sorted by date): {_debug_rows}", flush=True)
            if best_candidate:
                bl, bs, _, _ = best_candidate
                print(
                    f"[suggest] L{ln} WINNER: {bl.lesson_date} {bs.slot_day} {bs.time_slot} score={best_cand_score:.3f}",
                    flush=True,
                )

        if best_candidate is not None:
            lesson, slot, is_first, is_second = best_candidate
            assigned[ln] = _build_assignment(lesson, slot, ln)
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
        else:
            # No candidate found — try to fill as date-excluded gap (pending make-up)
            gap_count += 1
            if gap_count > max_gaps:
                return None, "", 0.0

            # Find the best lesson from ALL (unfiltered) lessons for this number
            all_candidates = all_by_number.get(ln, [])
            best_gap = None
            best_gap_score = -1.0
            assigned_slot_ids = {a["slot_id"] for a in assigned.values()}
            for lesson, slot in all_candidates:
                # For gap lessons: prefer same slot as already-assigned lessons
                gap_score = 0.5 if slot.id in assigned_slot_ids else 0.0
                if any(slot.slot_day == d and slot.time_slot == t for d, t in primary_pairs):
                    gap_score += 0.3
                elif any(slot.slot_day == d and slot.time_slot == t for d, t in backup_pairs):
                    gap_score += 0.1
                if gap_score > best_gap_score:
                    best_gap_score = gap_score
                    best_gap = (lesson, slot)

            if best_gap is None:
                # Truly no lesson exists for this number — capacity gap, fail
                return None, "", 0.0

            lesson, slot = best_gap
            assigned[ln] = _build_assignment(lesson, slot, ln, is_pending_makeup=True)
            assigned_dates.append((ln, lesson.lesson_date))
            # Don't reserve capacity for gap lessons (student won't attend)
            # Gap lessons contribute 0 to confidence score

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
        # 1x solver only — 2x routes through the multi-slot solver above.
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
    # 0. Ensure lessons exist for all slots at this location (same as calendar tab)
    from sqlalchemy import exists as sa_exists
    slots_needing_lessons = (
        db.query(SummerCourseSlot)
        .options(joinedload(SummerCourseSlot.config))
        .filter(
            SummerCourseSlot.config_id == data.config_id,
            SummerCourseSlot.location == data.location,
            ~sa_exists().where(SummerLesson.slot_id == SummerCourseSlot.id),
        )
        .all()
    )
    if slots_needing_lessons:
        for slot in slots_needing_lessons:
            _ensure_lessons_for_slot(slot, db)
        db.commit()

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
        .filter(SummerSession.session_status.not_in(SUMMER_NON_ATTENDING_STATUSES))
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

    # Also keep unfiltered lessons by grade — used for date-excluded gap detection
    all_lessons_by_grade: dict[str, list] = defaultdict(list)
    for lesson, slot in all_lessons:
        if slot.grade:
            all_lessons_by_grade[slot.grade].append((lesson, slot))

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
        all_grade_lessons = all_lessons_by_grade.get(app.grade, [])
        result = _find_best_lesson_set(
            app, grade_lessons, lesson_capacity, lesson_buddy_groups,
            all_lessons=all_grade_lessons,
        )
        assignments, match_type, confidence = result

        if assignments is None:
            # Roll back any capacity changes from partial greedy
            lesson_capacity.update(cap_snapshot)
            unplaceable.append({
                "application_id": app.id,
                "student_name": app.student_name,
                "reason": f"Cannot fill enough lessons for {app.grade} (more than 2 gaps)",
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

            # Count pending make-up gaps
            makeup_count = sum(1 for a in assign_list if a.get("is_pending_makeup"))
            if makeup_count > 0:
                makeup_numbers = [a["lesson_number"] for a in assign_list if a.get("is_pending_makeup")]
                reason_parts.append(f"L{',L'.join(str(n) for n in makeup_numbers)} pending make-up")

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
                preference_3_day=app.preference_3_day,
                preference_3_time=app.preference_3_time,
                preference_4_day=app.preference_4_day,
                preference_4_time=app.preference_4_time,
                placed_count=app_placed_counts.get(app.id, 0),
                pending_makeup_count=makeup_count,
            )

        # --- Generate "with make-ups" variant if any lessons are in non-pref slots ---
        # Only meaningful when the student has preferences set
        primary_pairs, backup_pairs = _classify_prefs(app)
        has_prefs = len(primary_pairs) > 0 or len(backup_pairs) > 0
        non_pref_lessons: list[int] = []  # lesson_numbers in non-pref slots
        for a in assignments:
            if a.get("is_pending_makeup"):
                continue  # already a gap
            is_pref = any(a["slot_day"] == d and a["time_slot"] == t for d, t in primary_pairs)
            is_backup = any(a["slot_day"] == d and a["time_slot"] == t for d, t in backup_pairs)
            if not is_pref and not is_backup:
                non_pref_lessons.append(a["lesson_number"])

        # Build a "with make-ups" variant: swap up to max_gaps non-pref lessons to gaps
        existing_gaps = sum(1 for a in assignments if a.get("is_pending_makeup"))
        gap_budget = 2 - existing_gaps
        makeup_variant = None
        if has_prefs and non_pref_lessons and gap_budget > 0 and all_grade_lessons:
            # Pick the non-pref lessons to swap (just take up to gap_budget)
            swap_numbers = set(non_pref_lessons[:gap_budget])
            # Build unfiltered lesson index for gap sourcing
            all_by_num: dict[int, list] = {}
            for lesson, slot in all_grade_lessons:
                all_by_num.setdefault(lesson.lesson_number, []).append((lesson, slot))

            makeup_list = []
            valid = True
            for a in assignments:
                if a["lesson_number"] in swap_numbers and not a.get("is_pending_makeup"):
                    # Find the best lesson from the student's preferred slot
                    gap_candidates = all_by_num.get(a["lesson_number"], [])
                    best_gap = None
                    best_score = -1.0
                    pref_slot_ids = {aa["slot_id"] for aa in assignments if aa["lesson_number"] not in swap_numbers}
                    for lesson, slot in gap_candidates:
                        gs = 0.5 if slot.id in pref_slot_ids else 0.0
                        if any(slot.slot_day == d and slot.time_slot == t for d, t in primary_pairs):
                            gs += 0.3
                        elif any(slot.slot_day == d and slot.time_slot == t for d, t in backup_pairs):
                            gs += 0.1
                        if gs > best_score:
                            best_score = gs
                            best_gap = (lesson, slot)
                    if best_gap:
                        lesson, slot = best_gap
                        makeup_list.append({
                            "lesson_id": lesson.id,
                            "slot_id": slot.id,
                            "lesson_number": a["lesson_number"],
                            "lesson_date": lesson.lesson_date,
                            "time_slot": slot.time_slot,
                            "slot_day": slot.slot_day,
                            "tutor_name": slot.tutor.tutor_name if slot.tutor else None,
                            "student_count": slot.max_students - lesson_capacity.get(lesson.id, 0),
                            "max_students": slot.max_students,
                            "is_pending_makeup": True,
                        })
                    else:
                        valid = False
                        break
                else:
                    makeup_list.append(dict(a))  # copy unchanged

            if valid:
                makeup_list.sort(key=lambda x: x["lesson_date"])
                # Confidence: re-score without the swapped lessons
                pref_score = sum(
                    1.0 if any(a["slot_day"] == d and a["time_slot"] == t for d, t in primary_pairs) else
                    0.7 if any(a["slot_day"] == d and a["time_slot"] == t for d, t in backup_pairs) else
                    0.3
                    for a in makeup_list if not a.get("is_pending_makeup")
                )
                makeup_conf = min(pref_score / 8.0, 1.0)
                makeup_variant = (makeup_list, match_type, makeup_conf)

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
            # Append makeup variant after slot options if it exists
            if makeup_variant and idx < 4:
                proposals.append(_build_proposal(*makeup_variant, f"Option {option_labels[idx]}"))
        elif makeup_variant:
            # Single primary + makeup variant → emit as Option A / Option B
            proposals.append(_build_proposal(assignments, match_type, confidence, "Option A"))
            proposals.append(_build_proposal(*makeup_variant, "Option B"))
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
                buddy_group_id=s.application.buddy_group_id if s.application else None,
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
            SummerSession.session_status.not_in(SUMMER_NON_ATTENDING_STATUSES),
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
