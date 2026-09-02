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
from calendar import monthrange
from datetime import date as date_type, datetime, timedelta
from typing import Optional, get_args

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Date, and_, func, literal, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    RegularCourseConfig,
    RegularApplication,
    RegularApplicationEdit,
    RegularCourseSlot,
    RegularTutorDuty,
    Discount,
    Enrollment,
    ParentCommunication,
    PrimaryProspect,
    SummerApplication,
    SummerCourseConfig,
    SchoolAlias,
    SessionLog,
    Student,
    TerminationRecord,
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
    RegularAssignedSlotInfo,
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
    RegularProspectLinkRequest,
    RegularSuggestion,
    RegularSuggestResponse,
    RegularPublishRequest,
    RegularPublishConflictSession,
    RegularPublishResponse,
    RegularUnpublishResponse,
    RegularPublishBatchRequest,
    RegularPublishResult,
    RegularPublishBatchResponse,
    RegularApplicationMessages,
    TutorDutyBulkSet,
    TutorDutyResponse,
    LinkedSecondaryStudentInfo,
    RegularProspectJourney,
    RegularProspectSuggestion,
    RegularProspectSuggestResponse,
    RegularConversionResponse,
    RegularConversionBranchRow,
    RegularConversionTutorRow,
    RegularConversionIntentionRow,
    RegularConversionSchoolRow,
    RegularConversionMovementRow,
    RegularConversionLostRow,
    RegularRetentionResponse,
    RegularRetentionRow,
    RegularRetentionChaseRow,
    RegularRetentionReconciliation,
    RegularRetentionMineResponse,
    RegularMyClassResponse,
    RegularMyClassSlot,
    RegularMyClassStudent,
    RegularRetentionOutsideRow,
    RegularRetentionTrendPoint,
    ProspectIntention,
    SchoolAliasCreate,
    SchoolAliasResponse,
)
from auth.dependencies import (
    reject_guest,
    require_admin_view,
    require_admin_write,
    require_super_admin,
    resolve_viewed_tutor_id,
)
from routers.students import find_duplicate_students, students_at
from routers.primary_prospects import enrollment_backed_students
from services.departure_guard import check_assignment
from utils.name_matching import NAME_CANDIDATE_THRESHOLD, name_similarity
from utils.grades import GRADE_ORDER, grade_blocks_prospect_link, next_grade
from quarters import get_quarter_dates, get_quarter_for_date
from utils.phone_matching import normalize_phone
from utils.rate_limiter import check_ip_rate_limit
from utils.effective_end import reaches_clause
from utils.school_alias import (
    clear_cache as clear_school_alias_cache,
    fold as fold_school,
    get_alias_map,
    group_key as school_group_key,
    is_valid_target as is_valid_school_target,
    resolve as resolve_school,
)
from utils.ttl_cache import TTLCache
from utils.tutor_duties import list_duties, replace_duties
from utils.regular_messages import format_schedule_message, strip_blank_student_id
from utils.branch_codes import (
    SECONDARY_BRANCH_CODES,
    SECONDARY_CENTER_NAME_TO_CODE,
    resolve_claimed_branch_code,
    should_fill_prospect_origin,
)
from utils.regular_promo import (
    application_promo,
    intake_charges_registration_fee,
    intake_registration_fee,
    is_verified_new,
    parse_promo,
    promo_active,
    promo_message_fields,
)
from constants import (
    hk_now,
    RegularApplicationStatus,
    BASE_FEE_PER_LESSON,
    COMPLETED_STATUSES,
    DAY_FULL_TO_SHORT,
    MIN_LESSONS_FOR_DISCOUNT,
    REGISTRATION_FEE,
    REGULAR_EXIT_STATUSES,
    format_student_code,
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


def effective_stream(app: RegularApplication) -> Optional[str]:
    """The language stream that governs placement for an application.

    The application's own value wins. A family fills the form in for the year
    they are applying for, so it is the most recent word we have, while the
    student record can be a year stale and nothing in the intake writes back to
    it. The International stream folds into E for matching and colour, because a
    class is never International and a placed student sits in C or E.

    The linked student record is only a fallback for an application that carries
    no stream at all. Where the two disagree, the admin sees a warning on the
    application and can copy the form's value onto the record deliberately; that
    is the only thing that changes the record, and publishing never does it.

    Returns None when neither side has anything.
    """
    raw = (app.lang_stream or "").strip()
    if raw:
        return "E" if raw == "Int" else raw
    student = app.existing_student if app.existing_student_id else None
    return getattr(student, "lang_stream", None) or None


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
            lang_stream=s.lang_stream,
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


def _get_tutor_names_bulk(db: Session, slots: list[RegularCourseSlot]) -> dict[int, str]:
    """Map tutor id → name for the tutors staffing these slots, in one query."""
    tutor_ids = {s.tutor_id for s in slots if s.tutor_id}
    if not tutor_ids:
        return {}
    return dict(
        db.query(Tutor.id, Tutor.tutor_name).filter(Tutor.id.in_(tutor_ids)).all()
    )


def _get_assigned_slots_bulk(
    db: Session, slot_ids: list[int]
) -> dict[int, RegularAssignedSlotInfo]:
    """Bulk-fetch the weekly slots applications are assigned to, tutor name
    included, so the admin list can show the placement without extra calls."""
    wanted = {sid for sid in slot_ids if sid}
    if not wanted:
        return {}
    rows = (
        db.query(RegularCourseSlot, Tutor.tutor_name)
        .outerjoin(Tutor, Tutor.id == RegularCourseSlot.tutor_id)
        .filter(RegularCourseSlot.id.in_(wanted))
        .all()
    )
    return {
        s.id: RegularAssignedSlotInfo(
            id=s.id,
            slot_day=s.slot_day,
            time_slot=s.time_slot,
            location=s.location,
            grade=s.grade,
            lang_stream=s.lang_stream,
            tutor_id=s.tutor_id,
            tutor_name=tutor_name,
            max_students=s.max_students,
        )
        for s, tutor_name in rows
    }


def _is_new_student(
    db: Session, student_id: Optional[int], *, exclude_application_id: Optional[int] = None
) -> bool:
    """Whether the one-off registration fee still applies to this student.

    New means no prior non-Trial enrollment. The enrollment this application
    itself published is ignored, so the answer — and the fee quoted to the
    parent — reads the same before and after publishing. An application with
    no student linked yet counts as new, which is what publishing would find.
    """
    if not student_id:
        return True
    query = db.query(Enrollment.id).filter(
        Enrollment.student_id == student_id,
        Enrollment.enrollment_type != 'Trial',
    )
    if exclude_application_id is not None:
        query = query.filter(
            or_(
                Enrollment.regular_application_id.is_(None),
                Enrollment.regular_application_id != exclude_application_id,
            )
        )
    return query.first() is None


def _new_student_flags_bulk(
    db: Session, apps: list[RegularApplication]
) -> dict[int, bool]:
    """`_is_new_student` for a whole page of applications, in one query."""
    student_ids = {a.existing_student_id for a in apps if a.existing_student_id}
    if not student_ids:
        return {a.id: True for a in apps}
    rows = (
        db.query(Enrollment.student_id, Enrollment.regular_application_id)
        .filter(
            Enrollment.student_id.in_(student_ids),
            Enrollment.enrollment_type != 'Trial',
        )
        .all()
    )
    by_student: dict[int, set] = {}
    for student_id, from_app_id in rows:
        by_student.setdefault(student_id, set()).add(from_app_id)
    return {
        a.id: not any(
            from_app_id != a.id
            for from_app_id in by_student.get(a.existing_student_id, ())
        )
        for a in apps
    }


def _prospect_journeys_bulk(
    db: Session, apps: list[RegularApplication]
) -> dict[int, RegularProspectJourney]:
    """Journey block for each application a P6 prospect links to, in two queries.

    attended_summer is true when the prospect's summer application published an
    enrollment (row existence is the signal — unpublish deletes it) and that
    application was not withdrawn."""
    app_ids = [a.id for a in apps]
    if not app_ids:
        return {}
    prospects = (
        db.query(PrimaryProspect)
        .options(joinedload(PrimaryProspect.summer_application))
        .filter(PrimaryProspect.regular_application_id.in_(app_ids))
        .all()
    )
    if not prospects:
        return {}
    summer_app_ids = {p.summer_application_id for p in prospects if p.summer_application_id}
    enrolled_summer_ids: set[int] = set()
    if summer_app_ids:
        enrolled_summer_ids = {
            sid for (sid,) in db.query(Enrollment.summer_application_id)
            .filter(Enrollment.summer_application_id.in_(summer_app_ids))
            if sid is not None
        }
    result: dict[int, RegularProspectJourney] = {}
    for p in prospects:
        sa = p.summer_application
        attended = (
            p.summer_application_id in enrolled_summer_ids
            and sa is not None
            and sa.application_status != "Withdrawn"
        )
        result[p.regular_application_id] = RegularProspectJourney(
            prospect_id=p.id,
            source_branch=p.source_branch,
            primary_student_id=p.primary_student_id,
            attended_summer=bool(attended),
        )
    return result


def _build_application_responses(
    db: Session, apps: list[RegularApplication]
) -> list[RegularApplicationResponse]:
    """Build response list with batched linked-student + publish lookups."""
    linked_students = _get_linked_students_bulk(
        db, [a.existing_student_id for a in apps if a.existing_student_id]
    )
    published = _get_published_enrollment_ids(db, [a.id for a in apps])
    slots = _get_assigned_slots_bulk(db, [a.assigned_slot_id for a in apps])
    new_student = _new_student_flags_bulk(db, apps)
    journeys = _prospect_journeys_bulk(db, apps)
    # Every application on a page shares one config, so the offer is parsed and
    # date-checked once rather than per row.
    active_promo = None
    if apps:
        candidate = parse_promo(apps[0].config)
        if promo_active(candidate, hk_now().date()):
            active_promo = candidate
    school_aliases = get_alias_map(db)
    responses = []
    for app in apps:
        data = {col.key: getattr(app, col.key) for col in app.__table__.columns}
        data["school_canonical"] = resolve_school(app.school, app.lang_stream, school_aliases)
        data["linked_student"] = (
            linked_students.get(app.existing_student_id) if app.existing_student_id else None
        )
        data["published_enrollment_id"] = published.get(app.id)
        data["assigned_slot"] = (
            slots.get(app.assigned_slot_id) if app.assigned_slot_id else None
        )
        data["is_new_student"] = new_student[app.id]
        data["prospect_journey"] = journeys.get(app.id)
        data["claimed_branch_code"] = resolve_claimed_branch_code(
            (app.current_centers or [None])[0], app.is_existing_student
        )
        # Eligible = the offer is running AND an admin has verified the
        # applicant has no MathConcept history. An unverified application is
        # not eligible yet, which is what puts the prompt in front of staff.
        eligible = active_promo is not None and is_verified_new(app)
        data["promo_eligible"] = eligible
        data["promo_code"] = active_promo.code if eligible else None
        responses.append(RegularApplicationResponse.model_validate(data))
    return responses


# ============================================
# Public endpoints (no auth)
# ============================================

def _application_window(config: RegularCourseConfig) -> str:
    """Where 'now' sits relative to the config's application window.

    The form is gated on this rather than on the dates alone: submission has
    always been rejected outside the window, so the form must not invite four
    steps of typing it is going to refuse.
    """
    now = hk_now()
    if now < config.application_open_date:
        return "before"
    if now > config.application_close_date:
        return "closed"
    return "open"


def _public_pricing_config(config: RegularCourseConfig) -> Optional[dict]:
    """The pricing block as a parent may see it.

    A seasonal offer is advertised on a schedule the form does not control: the
    application window opens days before the campaign launches, so the promo is
    removed entirely until its own start date. Stripping it here rather than
    hiding it in the browser means an unannounced offer is never sitting in the
    page's network response waiting to be read, and a device with a wrong clock
    cannot reveal it early.

    ``discount_id`` is dropped even once the offer is live: it addresses an
    internal discounts row and does nothing for the form.
    """
    pricing = config.pricing_config
    if not pricing or "promo" not in pricing:
        return pricing
    pricing = dict(pricing)
    promo = parse_promo(config)
    if not promo_active(promo, hk_now().date()):
        pricing.pop("promo", None)
        return pricing
    public_promo = {k: v for k, v in (pricing["promo"] or {}).items() if k != "discount_id"}
    pricing["promo"] = public_promo
    return pricing


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
        application_window=_application_window(config),
        course_start_date=config.course_start_date,
        locations=config.locations or [],
        available_grades=config.available_grades or [],
        time_slots=config.time_slots or [],
        existing_student_options=config.existing_student_options,
        center_options=config.center_options,
        lang_stream_options=config.lang_stream_options,
        text_content=config.text_content,
        course_intro=config.course_intro,
        pricing_config=_public_pricing_config(config),
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

    # Check application window (the form gates on the same helper, so a
    # submission only reaches here if the visitor bypassed the closed screen)
    if _application_window(config) != "open":
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

# Must match the merged match_reason emitted by find_duplicate_students for a
# combined exact-name + phone hit (see routers/students.py).
_AUTO_LINK_REASON = "Same name and phone at this location"


def _unlinked_secondary_apps(
    db: Session, config_id: int
) -> list[tuple[RegularApplication, str]]:
    """Live applications that say the family already studies at the secondary
    academy but carry no student link, each with the branch they named.

    An application naming a centre we cannot resolve to MSA or MSB is left out:
    there is no branch to look a student up at, so nothing can be suggested for
    it either way."""
    apps = (
        db.query(RegularApplication)
        .filter(
            RegularApplication.config_id == config_id,
            RegularApplication.application_status.notin_(REGULAR_EXIT_STATUSES),
            RegularApplication.is_existing_student == "MathConcept Secondary Academy",
            RegularApplication.existing_student_id.is_(None),
        )
        .all()
    )
    out: list[tuple[RegularApplication, str]] = []
    for app in apps:
        code = SECONDARY_CENTER_NAME_TO_CODE.get((app.current_centers or [None])[0] or "")
        if code in SECONDARY_BRANCH_CODES:
            out.append((app, code))
    return out


def _candidates_for(
    db: Session, apps: list[tuple[RegularApplication, str]]
) -> list[tuple[RegularApplication, str, list[dict]]]:
    """Each application with the student rows that might be the same person.

    The branch is loaded once and handed to every check against it. The fuzzy
    pass reads every student at a branch, so doing it per application meant
    sweeping the same few hundred rows twenty times over, which was nearly two
    seconds on this intake."""
    pools: dict[str, list] = {}
    out = []
    for app, code in apps:
        if code not in pools:
            pools[code] = students_at(db, code)
        out.append(
            (app, code, find_duplicate_students(
                db, app.student_name, code, app.contact_phone, pool=pools[code],
            ))
        )
    return out


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
    apps = _unlinked_secondary_apps(db, config_id)

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

    # A prospect outranks the student record as an origin: the prospect is
    # where the applicant came from, the student record is where they landed.
    # Same precedence update_application applies when an admin links by hand.
    # Only the write path reads this, and the preview is the common call, so
    # a dry run skips the query entirely.
    prospect_branch_by_app = dict(
        db.query(PrimaryProspect.regular_application_id, PrimaryProspect.source_branch)
        .filter(PrimaryProspect.regular_application_id.in_([a.id for a, _ in apps]))
        .all()
    ) if apps and not dry_run else {}

    for app, code, candidates in _candidates_for(db, apps):
        strong = [c for c in candidates if c["match_reason"] == _AUTO_LINK_REASON]
        if len(strong) == 1 and len(candidates) == 1:
            chosen = strong[0]
            matches.append({"application": a_summary(app, code), "student": chosen})
            if not dry_run:
                app.existing_student_id = chosen["id"]
                prospect_branch = prospect_branch_by_app.get(app.id)
                if should_fill_prospect_origin(app.verified_branch_origin, prospect_branch):
                    app.verified_branch_origin = prospect_branch
                elif not app.verified_branch_origin and chosen.get("home_location"):
                    # Narrower than update_application's version of this, which
                    # overwrites whatever is there: that runs when an admin
                    # deliberately changes the student link, while this is a
                    # bulk auto-link, so it only fills a blank.
                    app.verified_branch_origin = chosen["home_location"]
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

    # Anything left (admin_notes, existing_student_id, verified_branch_origin)
    # is written directly without audit — admin-only bookkeeping fields.
    for field, value in updates.items():
        setattr(app, field, value)

    # Auto-fill verified_branch_origin when linking to a Student, unless the
    # admin set it explicitly in the same request. A linked P6 prospect wins:
    # the prospect is the true origin (a primary-branch student moving up),
    # while the Student record is the destination. Mirrors summer, where the
    # same omission silently lost a receipt code on F1 transitions — here it
    # would instead hand a returning student a new-student offer.
    if "existing_student_id" in data.model_fields_set and "verified_branch_origin" not in data.model_fields_set:
        prospect_branch = (
            db.query(PrimaryProspect.source_branch)
            .filter(PrimaryProspect.regular_application_id == app.id)
            .scalar()
        )
        if prospect_branch:
            app.verified_branch_origin = prospect_branch
        elif app.existing_student_id:
            student = db.query(Student).filter(Student.id == app.existing_student_id).first()
            if student and student.home_location:
                app.verified_branch_origin = student.home_location
        else:
            app.verified_branch_origin = None

    db.commit()
    db.refresh(app)
    return _build_application_responses(db, [app])[0]


# ---- Demand summary ----

@router.post("/regular/school-aliases", response_model=SchoolAliasResponse, status_code=201)
def create_school_alias(
    data: SchoolAliasCreate,
    _admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Assign a canonical school code to a typed spelling.

    Called from the assign controls on the stats view and the application
    detail modal when staff recognise an unmapped spelling. Assigning an
    already-mapped spelling overwrites its target, which is also how a wrong
    assignment gets corrected. The raw spelling on the application itself is
    never touched."""
    key = fold_school(data.raw)
    if not key:
        raise HTTPException(status_code=422, detail="School name is empty")
    target = data.target.strip()
    if not is_valid_school_target(target):
        raise HTTPException(status_code=422, detail="School code is not in a recognised form")
    row = db.merge(SchoolAlias(alias_key=key, target=target))
    db.commit()
    clear_school_alias_cache()
    _SCHOOL_CODES_CACHE.clear()
    return row


# The vocabulary changes only when an alias is assigned or a student record
# gains a new school, so a minute of staleness is fine and saves a DISTINCT
# scan over students on every mount of an assign control. Same rules as the
# alias map's own cache: the write path clears this process, others wait out
# the TTL.
_SCHOOL_CODES_CACHE = TTLCache(ttl_seconds=60, maxsize=1)


@router.get("/regular/school-codes", response_model=list[str])
def get_school_codes(
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """The known school-code vocabulary for the assign dropdown.

    The union of every alias target already in use and every distinct school
    code on student records, sorted. Free entry stays possible in the UI, so
    a genuinely new school is typed rather than blocked."""
    cached = _SCHOOL_CODES_CACHE.get("codes")
    if cached is not None:
        return cached
    targets = {t for (t,) in db.query(SchoolAlias.target).distinct()}
    student_codes = {
        s.strip() for (s,) in db.query(Student.school).distinct() if s and s.strip()
    }
    codes = sorted(targets | student_codes)
    _SCHOOL_CODES_CACHE.set("codes", codes)
    return codes


@router.get("/regular/demand", response_model=RegularDemandResponse)
def get_demand(
    config_id: int,
    location: str,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Demand summary: preference counts by day x time_slot x grade-stream.

    Buckets are keyed by grade + effective stream (F1C, F1E, ...) so the grid can
    tell a Chinese-stream class apart from an English one at a glance. The stream
    is resolved the same way placement resolves it, so demand and suggestions
    agree; an application with no resolvable stream keys on the bare grade."""
    apps = (
        db.query(RegularApplication)
        .options(joinedload(RegularApplication.existing_student))
        .filter(
            RegularApplication.config_id == config_id,
            RegularApplication.preferred_location == location,
            RegularApplication.application_status.not_in(REGULAR_EXIT_STATUSES),
        )
        .all()
    )

    cells: dict[tuple[str, str], dict] = {}
    for app in apps:
        key_gs = f"{app.grade or ''}{effective_stream(app) or ''}"
        primary_slots, backup_slots = _classify_prefs(app)
        for key in primary_slots:
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["first"][key_gs] = cell["first"].get(key_gs, 0) + 1
        for key in backup_slots:
            cell = cells.setdefault(key, {"first": {}, "second": {}})
            cell["second"][key_gs] = cell["second"].get(key_gs, 0) + 1

    demand_cells = [
        RegularDemandCell(
            day=day,
            time_slot=time,
            total_first_pref=sum(data["first"].values()),
            total_second_pref=sum(data["second"].values()),
            by_grade_stream_first=data["first"],
            by_grade_stream_second=data["second"],
        )
        for (day, time), data in sorted(cells.items())
    ]

    return RegularDemandResponse(location=location, cells=demand_cells)


# ============================================
# Arrangement: weekly slots + assignment
# ============================================

def _seat_count(db: Session, slot_id: int, exclude_app_id: int | None = None) -> int:
    """Applications holding a seat in this slot.

    Exit-status applications are skipped: a student who withdrew after being
    placed must not keep a seat that the class can offer to somebody else.
    """
    query = db.query(func.count(RegularApplication.id)).filter(
        RegularApplication.assigned_slot_id == slot_id,
        RegularApplication.application_status.not_in(REGULAR_EXIT_STATUSES),
    )
    if exclude_app_id is not None:
        query = query.filter(RegularApplication.id != exclude_app_id)
    return query.scalar() or 0


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
    student_ids = {a.existing_student_id for a in assigned if a.existing_student_id}
    student_codes: dict[int, str] = {}
    if student_ids:
        student_codes = dict(
            db.query(Student.id, Student.school_student_id)
            .filter(Student.id.in_(student_ids))
            .all()
        )
    school_aliases = get_alias_map(db)
    by_slot: dict[int, list[RegularSlotStudentInfo]] = {}
    # Seats held, counted separately from the row list: an exit-status student
    # still shows on the slot (so the admin can see the placement they gave up)
    # but no longer occupies one of its places.
    seats: dict[int, int] = {}
    for a in assigned:
        if a.application_status not in REGULAR_EXIT_STATUSES:
            seats[a.assigned_slot_id] = seats.get(a.assigned_slot_id, 0) + 1
        by_slot.setdefault(a.assigned_slot_id, []).append(RegularSlotStudentInfo(
            application_id=a.id,
            student_name=a.student_name,
            grade=a.grade,
            # The same stream the unassigned panel beside this board shows, so a
            # student's badge cannot change colour just by being dragged in.
            lang_stream=effective_stream(a),
            school=a.school,
            # Resolved on the form's own stream value, because Int picks the
            # international campus where one exists and effective_stream has
            # already folded Int into E.
            school_canonical=resolve_school(a.school, a.lang_stream, school_aliases),
            application_status=a.application_status,
            published=a.id in published,
            school_student_id=student_codes.get(a.existing_student_id),
        ))
    tutor_names = _get_tutor_names_bulk(db, slots)
    return [
        RegularSlotResponse(
            id=s.id,
            config_id=s.config_id,
            slot_day=s.slot_day,
            time_slot=s.time_slot,
            location=s.location,
            grade=s.grade,
            lang_stream=s.lang_stream,
            tutor_id=s.tutor_id,
            tutor_name=tutor_names.get(s.tutor_id) if s.tutor_id else None,
            max_students=s.max_students,
            assigned_count=seats.get(s.id, 0),
            students=by_slot.get(s.id, []),
        )
        for s in slots
    ]


@router.get("/regular/tutor-duties", response_model=list[TutorDutyResponse])
def get_tutor_duties(
    config_id: int,
    location: str,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Get all tutor duties for a config+location."""
    return list_duties(db, RegularTutorDuty, config_id, location)


@router.post("/regular/tutor-duties/bulk-set")
def bulk_set_tutor_duties(
    data: TutorDutyBulkSet,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Replace all tutor duties for a config+location with the given set."""
    return replace_duties(db, RegularTutorDuty, data)


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
        assigned_count = _seat_count(db, slot_id)
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
            assigned_count = _seat_count(db, req.slot_id, exclude_app_id=app.id)
            if assigned_count >= slot.max_students:
                raise _publish_error(
                    "slot_full",
                    f"Slot is full ({assigned_count}/{slot.max_students}).",
                )

    if req.slot_id != old_slot_id:
        app.assigned_slot_id = req.slot_id
        db.add(RegularApplicationEdit(
            application_id=app.id,
            edited_at=hk_now(),
            field_name="assigned_slot_id",
            old_value=str(old_slot_id) if old_slot_id is not None else None,
            new_value=str(req.slot_id) if req.slot_id is not None else None,
            edited_via="admin",
            edited_by=admin.user_email or "admin",
        ))
        db.commit()
        db.refresh(app)
    return _build_application_responses(db, [app])[0]


# ============================================
# Prospect journey: link editing + reverse suggestions
# ============================================

@router.patch("/regular/applications/{app_id}/prospect", response_model=RegularApplicationResponse)
def link_application_prospect(
    app_id: int,
    req: RegularProspectLinkRequest,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """Link a P6 prospect to this application (prospect_id null unlinks).

    The link lives on the prospect row, mirroring the summer link; an
    application holds at most one prospect, so any prospect already pointing
    here is cleared before the new one is set."""
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    admin_label = admin.user_email or "admin"
    current = (
        db.query(PrimaryProspect)
        .filter(PrimaryProspect.regular_application_id == app_id)
        .first()
    )
    old_prospect_id = current.id if current else None

    if req.prospect_id is not None:
        if req.prospect_id == old_prospect_id:
            return _build_application_responses(db, [app])[0]  # no-op
        prospect = db.query(PrimaryProspect).filter(PrimaryProspect.id == req.prospect_id).first()
        if not prospect:
            raise HTTPException(status_code=404, detail="Prospect not found")
        if current is not None and current.id != prospect.id:
            current.regular_application_id = None
            current.updated_at = hk_now()
        prospect.regular_application_id = app_id
        prospect.updated_at = hk_now()
        new_prospect_id = prospect.id
        if should_fill_prospect_origin(app.verified_branch_origin, prospect.source_branch):
            app.verified_branch_origin = prospect.source_branch
    else:
        if current is None:
            return _build_application_responses(db, [app])[0]  # already unlinked
        current.regular_application_id = None
        current.updated_at = hk_now()
        new_prospect_id = None

    db.add(RegularApplicationEdit(
        application_id=app.id,
        edited_at=hk_now(),
        field_name="prospect_link",
        old_value=str(old_prospect_id) if old_prospect_id is not None else None,
        new_value=str(new_prospect_id) if new_prospect_id is not None else None,
        edited_via="admin",
        edited_by=admin_label,
    ))
    db.commit()
    db.refresh(app)
    return _build_application_responses(db, [app])[0]


@router.get(
    "/regular/applications/{app_id}/prospect-suggestions",
    response_model=RegularProspectSuggestResponse,
)
def suggest_prospects_for_application(
    app_id: int,
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Ranked P6 prospect candidates for one regular application.

    The summer matcher's cascade, run in reverse: a prospect whose summer
    application resolves to this application's linked student (exact), then a
    phone match, then name similarity."""
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    cfg_year = (
        db.query(RegularCourseConfig.year)
        .filter(RegularCourseConfig.id == app.config_id)
        .scalar()
    )
    q = db.query(PrimaryProspect)
    if cfg_year is not None:
        q = q.filter(PrimaryProspect.year == cfg_year)
    prospects = q.all()

    app_phones = {normalize_phone(app.contact_phone)} - {""}

    # Exact via shared student: prospect -> summer_application -> existing_student_id.
    sid_by_prospect: dict[int, Optional[int]] = {}
    if app.existing_student_id:
        summer_app_ids = {p.summer_application_id for p in prospects if p.summer_application_id}
        if summer_app_ids:
            sid_by_summer = dict(
                db.query(SummerApplication.id, SummerApplication.existing_student_id)
                .filter(SummerApplication.id.in_(summer_app_ids))
                .all()
            )
            for p in prospects:
                sid_by_prospect[p.id] = sid_by_summer.get(p.summer_application_id)

    suggestions: list[RegularProspectSuggestion] = []
    for p in prospects:
        signals: set[str] = set()
        similarity = 0
        if app.existing_student_id and sid_by_prospect.get(p.id) == app.existing_student_id:
            signals.add("student")
        # Phone and name are guesses, so both are held to the grade constraint:
        # a P6 prospect can only belong to an F1 application. Same rule the
        # prospects-side matchers apply, so the two surfaces agree on a pair.
        # The exact student signal above is exempt: a grade clash there means
        # someone's grade is wrong, not that it's a different child.
        wrong_grade = grade_blocks_prospect_link(p.grade, app.grade)
        p_phones = {normalize_phone(p.phone_1), normalize_phone(p.phone_2)} - {""}
        if app_phones and not wrong_grade and (app_phones & p_phones):
            signals.add("phone")
        if app.student_name and p.student_name and not wrong_grade:
            score = name_similarity(p.student_name, app.student_name)
            if score >= NAME_CANDIDATE_THRESHOLD:
                signals.add("name")
                similarity = score
        if not signals:
            continue
        if "student" in signals:
            match_type = "student"
        elif signals >= {"phone", "name"}:
            match_type = "phone+name"
        elif "phone" in signals:
            match_type = "phone"
        else:
            match_type = "name"
        suggestions.append(RegularProspectSuggestion(
            prospect_id=p.id,
            student_name=p.student_name,
            source_branch=p.source_branch,
            grade=p.grade,
            phone_1=p.phone_1,
            match_type=match_type,
            similarity=similarity if "name" in signals else None,
            already_linked=(
                p.regular_application_id is not None and p.regular_application_id != app_id
            ),
        ))

    rank = {"student": 0, "phone+name": 1, "phone": 2, "name": 3}
    suggestions.sort(key=lambda s: (rank.get(s.match_type, 9), -(s.similarity or 0)))
    return RegularProspectSuggestResponse(application_id=app_id, suggestions=suggestions[:8])


@router.get("/regular/conversion", response_model=RegularConversionResponse)
def get_conversion(
    year: int = Query(...),
    branch: Optional[str] = None,  # limit to one source (primary) branch code
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Prospect -> summer -> regular conversion funnel for one year.

    Sliced per source branch, with a grade-stream breakdown of regular
    applicants to feed 'how many F1C vs F1E classes to open'. attended_summer
    and enrolled_regular read enrollment-row existence, the same signal the
    journey chip uses, so the two reconcile. Passing `branch` scopes the whole
    report to one source branch — every axis derives from the prospect set, so
    filtering once here is enough."""
    q = db.query(PrimaryProspect).filter(PrimaryProspect.year == year)
    if branch:
        q = q.filter(PrimaryProspect.source_branch == branch)
    prospects = q.all()

    summer_app_ids = {p.summer_application_id for p in prospects if p.summer_application_id}
    # The enrolled student's MSA/MSB code rides the enrolled-signal query so
    # the chase list can badge summer alumni with who they became.
    summer_code_by_app = {
        aid: code
        for aid, (_sid, code) in enrollment_backed_students(
            db, Enrollment.summer_application_id, summer_app_ids
        ).items()
    }
    withdrawn_summer_ids: set[int] = set()
    if summer_app_ids:
        withdrawn_summer_ids = {
            aid for (aid,) in db.query(SummerApplication.id)
            .filter(
                SummerApplication.id.in_(summer_app_ids),
                SummerApplication.application_status == "Withdrawn",
            )
        }

    regular_app_ids = {p.regular_application_id for p in prospects if p.regular_application_id}
    enrolled_regular_ids: set[int] = set()
    grade_stream_by_app: dict[int, str] = {}
    # Landed branch for enrolled prospects reads the enrollment's own location
    # (set from the slot at publish), normalised to the MSA/MSB code space that
    # the prospect's preferred_branches also use, so axis 4 compares like-for-like.
    landed_branch_by_app: dict[int, str] = {}
    if regular_app_ids:
        for rid, loc in (
            db.query(Enrollment.regular_application_id, Enrollment.location)
            .filter(Enrollment.regular_application_id.in_(regular_app_ids))
        ):
            if rid is None:
                continue
            enrolled_regular_ids.add(rid)
            landed_branch_by_app[rid] = normalize_secondary_location(loc) or "Unknown"
        reg_apps = (
            db.query(RegularApplication)
            .options(joinedload(RegularApplication.existing_student))
            .filter(RegularApplication.id.in_(regular_app_ids))
            .all()
        )
        for a in reg_apps:
            grade_stream_by_app[a.id] = f"{a.grade or ''}{effective_stream(a) or ''}"

    rows: dict[str, RegularConversionBranchRow] = {}
    by_gs_applied: dict[str, int] = {}
    by_gs_enrolled: dict[str, int] = {}
    # Extra axes, accumulated in the same single pass over prospects.
    tutor_rows: dict[tuple[str, str], RegularConversionTutorRow] = {}
    reg_intent: dict[str, RegularConversionIntentionRow] = {}
    sum_intent: dict[str, RegularConversionIntentionRow] = {}
    school_rows: dict[str, RegularConversionSchoolRow] = {}
    # School is free-text. Spellings the alias table recognises group under
    # their canonical staff code; the rest group case- and spacing-insensitively
    # on the folded spelling, remembering how often each original appeared so an
    # unmapped row can still show the most common one.
    school_aliases = get_alias_map(db)
    school_display: dict[str, dict[str, int]] = {}
    movement: dict[tuple[str, str], RegularConversionMovementRow] = {}
    lost: list[RegularConversionLostRow] = []

    # Membership drives the intention bucketing off the shared schema Literal, so
    # a new intention value can't silently fall into "Unknown".
    valid_intentions = frozenset(get_args(ProspectIntention))

    def _intent(value: Optional[str]) -> str:
        return value if value in valid_intentions else "Unknown"

    def _bump_intent(store: dict, value: str, ai: int, ei: int, si: int) -> None:
        r = store.setdefault(value, RegularConversionIntentionRow(intention=value))
        r.prospects += 1
        r.applied_regular += ai
        r.enrolled_regular += ei
        r.attended_summer += si

    for p in prospects:
        row = rows.setdefault(p.source_branch, RegularConversionBranchRow(branch=p.source_branch))
        row.prospects += 1
        if p.wants_summer == "Yes":
            row.wants_summer_yes += 1
        if p.wants_regular == "Yes":
            row.wants_regular_yes += 1
        attended = (
            p.summer_application_id in summer_code_by_app
            and p.summer_application_id not in withdrawn_summer_ids
        )
        if attended:
            row.attended_summer += 1

        applied = p.regular_application_id is not None
        enrolled = applied and p.regular_application_id in enrolled_regular_ids
        # 0/1 forms reused across every axis below.
        ai, ei, si = int(applied), int(enrolled), int(attended)
        if applied:
            row.applied_regular += 1
            gs = grade_stream_by_app.get(p.regular_application_id)
            if gs:
                by_gs_applied[gs] = by_gs_applied.get(gs, 0) + 1
            if enrolled:
                row.enrolled_regular += 1
                if gs:
                    by_gs_enrolled[gs] = by_gs_enrolled.get(gs, 0) + 1

        # Axis 1: submitting tutor within the source branch.
        tkey = (p.source_branch, (p.tutor_name or "").strip() or "Unattributed")
        trow = tutor_rows.setdefault(
            tkey, RegularConversionTutorRow(branch=tkey[0], tutor_name=tkey[1])
        )
        trow.prospects += 1
        trow.applied_regular += ai
        trow.enrolled_regular += ei

        # Axis 2: stated intention vs outcome — one row keyed on the regular
        # intention, another on the summer intention; each carries every count
        # so the frontend reads only the columns its table shows.
        _bump_intent(reg_intent, _intent(p.wants_regular), ai, ei, si)
        _bump_intent(sum_intent, _intent(p.wants_summer), ai, ei, si)

        # Axis 3: feeder school. Prospects carry no language stream, so a
        # sectioned-school spelling resolves to its bare family code, which
        # still groups the school as one row. Unmapped spellings keep the old
        # folded-key grouping, with the display spelling resolved after the loop.
        raw_school = (p.school or "").strip()
        canonical = resolve_school(raw_school, None, school_aliases)
        # school_alias.group_key's rule, opened up because this table needs
        # its two halves separately: a row for prospects with no school, and
        # the raw spelling as the display until the fixup after the loop.
        skey = canonical or fold_school(raw_school) or "unknown"
        display = canonical or raw_school or "Unknown"
        srow = school_rows.setdefault(skey, RegularConversionSchoolRow(school=display))
        srow.prospects += 1
        srow.applied_regular += ai
        srow.enrolled_regular += ei
        if not canonical:
            counts = school_display.setdefault(skey, {})
            counts[display] = counts.get(display, 0) + 1

        # Axis 4: wanted branch vs where they enrolled (enrolled prospects only).
        if enrolled:
            enrolled_branch = landed_branch_by_app.get(p.regular_application_id, "Unknown")
            prefs = [b for b in (p.preferred_branches or []) if b]
            if not prefs:
                wanted = "None"
            elif enrolled_branch in prefs:
                wanted = enrolled_branch  # landed in a branch they named
            else:
                wanted = " / ".join(prefs)  # crossed away from every named branch
            mkey = (wanted, enrolled_branch)
            mrow = movement.setdefault(
                mkey, RegularConversionMovementRow(wanted_branch=wanted, enrolled_branch=enrolled_branch)
            )
            mrow.count += 1

        # Lost list: a prospect with no regular application yet.
        if not applied:
            lost.append(RegularConversionLostRow(
                prospect_id=p.id,
                student_name=p.student_name,
                source_branch=p.source_branch,
                primary_student_id=p.primary_student_id,
                grade=p.grade,
                school=p.school,
                phone_1=p.phone_1,
                phone_2=p.phone_2,
                wechat_id=p.wechat_id,
                wants_regular=p.wants_regular,
                preferred_branches=[b for b in (p.preferred_branches or []) if b],
                outreach_status=p.outreach_status,
                attended_summer=attended,
                summer_student_code=summer_code_by_app.get(p.summer_application_id) if attended else None,
            ))

    branches = [rows[b] for b in sorted(rows)]
    totals = RegularConversionBranchRow(
        branch="All",
        prospects=sum(r.prospects for r in branches),
        wants_summer_yes=sum(r.wants_summer_yes for r in branches),
        wants_regular_yes=sum(r.wants_regular_yes for r in branches),
        attended_summer=sum(r.attended_summer for r in branches),
        applied_regular=sum(r.applied_regular for r in branches),
        enrolled_regular=sum(r.enrolled_regular for r in branches),
    )

    # Deterministic ordering for every axis. Intention tables follow the ladder
    # Yes -> Considering -> No -> Unknown; tutors group under their branch with
    # Unattributed last; schools lead with the biggest feeders.
    intent_order = {"Yes": 0, "Considering": 1, "No": 2, "Unknown": 3}
    by_tutor = sorted(
        tutor_rows.values(),
        key=lambda r: (r.branch, r.tutor_name == "Unattributed", r.tutor_name),
    )
    by_regular_intention = sorted(reg_intent.values(), key=lambda r: intent_order.get(r.intention, 9))
    by_summer_intention = sorted(sum_intent.values(), key=lambda r: intent_order.get(r.intention, 9))
    for skey, counts in school_display.items():
        # Unmapped rows show their most common original spelling; ties break
        # alphabetically. Canonical rows already carry their code.
        school_rows[skey].school = sorted(
            counts.items(), key=lambda kv: (-kv[1], kv[0])
        )[0][0]
    by_school = sorted(
        school_rows.values(),
        key=lambda r: (r.school == "Unknown", -r.prospects, r.school),
    )
    branch_movement = sorted(movement.values(), key=lambda r: (r.wanted_branch, r.enrolled_branch))
    lost_prospects = sorted(
        lost,
        key=lambda r: (r.wants_regular != "Yes", r.source_branch, r.student_name),
    )

    return RegularConversionResponse(
        year=year,
        branches=branches,
        totals=totals,
        by_grade_stream_applied=by_gs_applied,
        by_grade_stream_enrolled=by_gs_enrolled,
        by_tutor=by_tutor,
        by_regular_intention=by_regular_intention,
        by_summer_intention=by_summer_intention,
        by_school=by_school,
        branch_movement=branch_movement,
        lost_prospects=lost_prospects,
    )


# ============================================
# Retention: did last year's students come back?
# ============================================
# The mirror of the conversion report. Conversion asks whether new blood
# arrived (P6 prospects -> F1); retention asks whether the students already
# here stayed. The two never share a denominator, which is why this builds its
# cohort from enrollments rather than from primary_prospects.

# How far back a regular enrollment may end and still count its student as
# "here at the end of last year". Four months before the course starts lands
# at 1 May, which is where the cohort size stops moving: earlier cutoffs only
# add long-lapsed students, later ones start cutting real ones whose final
# lesson pack ran out ahead of the summer pause.
RETENTION_ACTIVE_MONTHS_BACK = 4

# The one payment status that never represented an attending student. Written
# as an exclusion rather than the Paid/Pending allow-list the latest_enrollments
# view uses, so statuses like Waived — which do represent a real student — don't
# silently drop out of the cohort.
RETENTION_VOID_PAYMENT_STATUSES = ("Cancelled",)


def _months_before(d: date_type, months: int) -> date_type:
    """`d` shifted back whole months, clamped to the shorter month's last day."""
    month, year = d.month - months, d.year
    while month <= 0:
        month += 12
        year -= 1
    return d.replace(year=year, month=month, day=min(d.day, monthrange(year, month)[1]))


def _retention_rungs(config: RegularCourseConfig) -> dict[str, str]:
    """Entering grade -> whether the form has a place for it.

    `admin_only` rungs are real but hidden from parents, so those families
    can't self-serve however hard they're chased. Grades absent from the config
    have nowhere to apply at all; their students are reported separately and
    never counted as unresponsive."""
    rungs: dict[str, str] = {}
    for entry in config.available_grades or []:
        value = (entry.get("value") or "").strip()
        if value:
            rungs[value.upper()] = "admin_only" if entry.get("admin_only") else "open"
    return rungs


def _reaches_clause(active_from: date_type):
    """`effective_end_date >= active_from`, without walking every enrollment.

    The trick and the reasoning behind it now live in `utils/effective_end.py`,
    because the termination reports need the same thing in raw SQL."""
    return reaches_clause(active_from)


def _retention_cohort_sources(
    db: Session,
    config: RegularCourseConfig,
    active_from: date_type,
    tutor_id: Optional[int] = None,
):
    """The two cohort sources, each as {student_id: (last_start, branch, tutor_id)}.

    Source A is a regular enrollment still running at the end of last school
    year; source B is this year's summer course. A student in both is the
    strongest retention signal there is, so the caller tags rather than merges
    them. Branch and tutor come from the most recent enrollment on each side —
    the regular one wins downstream, being the student's home class.

    `tutor_id` narrows both sources in SQL rather than leaving the caller to
    discard other people's students in Python, which is most of what the tutor
    view used to spend its time on."""
    def _fold(rows) -> dict[int, tuple]:
        latest: dict[int, tuple] = {}
        for student_id, location, tutor_id, first_lesson in rows:
            current = latest.get(student_id)
            if current is None or (first_lesson or date_type.min) >= current[0]:
                latest[student_id] = (
                    first_lesson or date_type.min,
                    normalize_secondary_location(location),
                    tutor_id,
                )
        return latest

    columns = (
        Enrollment.student_id,
        Enrollment.location,
        Enrollment.tutor_id,
        Enrollment.first_lesson_date,
    )
    # Still the holiday-aware end date the enrollment list and renewal pages
    # read, just reached without running the walk on every row.
    regular_filters = (
        Enrollment.enrollment_type == 'Regular',
        Enrollment.payment_status.notin_(RETENTION_VOID_PAYMENT_STATUSES),
        Enrollment.first_lesson_date.isnot(None),
        _reaches_clause(active_from),
    )
    regular_q = db.query(*columns).filter(*regular_filters)
    summer_q = (
        db.query(*columns)
        .join(SummerApplication, SummerApplication.id == Enrollment.summer_application_id)
        .join(SummerCourseConfig, SummerCourseConfig.id == SummerApplication.config_id)
        .filter(
            Enrollment.enrollment_type == 'Summer',
            SummerCourseConfig.year == config.year,
            SummerApplication.application_status.notin_(REGULAR_EXIT_STATUSES),
        )
    )
    if tutor_id is not None:
        regular_q = regular_q.filter(Enrollment.tutor_id == tutor_id)
        summer_q = summer_q.filter(Enrollment.tutor_id == tutor_id)

    regular = _fold(regular_q)
    summer = _fold(summer_q)

    if tutor_id is not None:
        # A student whose regular class belongs to someone else is that tutor's
        # to chase, however many summer lessons they took here. Without this,
        # narrowing in SQL would quietly hand them to both tutors.
        summer_only = set(summer) - set(regular)
        if summer_only:
            taught_elsewhere = {
                student_id
                for (student_id,) in db.query(Enrollment.student_id).filter(
                    *regular_filters, Enrollment.student_id.in_(summer_only)
                )
            }
            for student_id in taught_elsewhere:
                summer.pop(student_id, None)
    return regular, summer


def _retention_terminations(
    db: Session, student_ids: set[int], active_from: date_type, intake: tuple[int, int]
):
    """Split this cohort's termination records into the three things they mean.

    A decline rides on termination_records because the application window falls
    inside a single reporting quarter, and that quarter is already the one built
    to catch "didn't come back when regular lessons resumed". So a termination
    filed in the intake quarter *is* a declined intake:

      - `declined`   counted termination in the intake quarter -> real churn.
                     Off the chase list, but it stays in the denominator: a
                     family who said no is a retention failure, not an exclusion.
      - `not_churn`  uncounted termination in the intake quarter -> transferred
                     branch, graduated, moved away. Out of both.
      - `left_before` counted termination from an earlier quarter -> they left
                     last year and are not a retention question at all.

    `left_before` only honours quarters that close on or after `active_from`.
    Cohort membership already requires lessons running that late, so an older
    termination is contradicted by the enrollment that came after it; the more
    recent signal wins."""
    intake_year, intake_quarter = intake
    left_before: set[int] = set()
    # (reason, category, filed_at) — the filing date is what the trend plots,
    # since a decline is only known to the centre once somebody records it.
    declined: dict[int, tuple[Optional[str], Optional[str], Optional[datetime]]] = {}
    not_churn: set[int] = set()
    if not student_ids:
        return left_before, declined, not_churn

    rows = db.query(
        TerminationRecord.student_id,
        TerminationRecord.year,
        TerminationRecord.quarter,
        TerminationRecord.count_as_terminated,
        TerminationRecord.reason,
        TerminationRecord.reason_category,
        TerminationRecord.created_at,
    ).filter(TerminationRecord.student_id.in_(student_ids))

    for student_id, term_year, quarter, counted, reason, category, filed_at in rows:
        if term_year is None or quarter is None:
            continue
        position = (term_year, quarter)
        if position == (intake_year, intake_quarter):
            if counted:
                declined[student_id] = (reason, category, filed_at)
            else:
                not_churn.add(student_id)
        elif position < (intake_year, intake_quarter) and counted:
            if get_quarter_dates(term_year, quarter)[2] >= active_from:
                left_before.add(student_id)
    return left_before, declined, not_churn


def _retention_applications(db: Session, config: RegularCourseConfig, year: int):
    """This intake's live applications, mapped to the student each belongs to.

    Two link paths, because a student can reach an application either way:
    `existing_student_id` is the main one, and a P6 prospect's own link picks up
    the handful whose application was matched to the prospect but never back to
    the student record. Missing the second path would read as "no response" for
    a family that already applied.

    Returns the prospect block for each of those students as well, since the
    same pass over the prospect list already has it in hand. The board renders
    it as the chip the applications page uses, so a student who came up from a
    primary branch is labelled the same way wherever staff meet them."""
    apps = (
        db.query(RegularApplication)
        .filter(
            RegularApplication.config_id == config.id,
            RegularApplication.application_status.notin_(REGULAR_EXIT_STATUSES),
        )
        .all()
    )
    app_by_student: dict[int, RegularApplication] = {}
    for app in apps:
        if app.existing_student_id:
            app_by_student.setdefault(app.existing_student_id, app)

    prospects = (
        db.query(PrimaryProspect)
        .options(joinedload(PrimaryProspect.summer_application))
        .filter(
            PrimaryProspect.year == year,
            PrimaryProspect.summer_application_id.isnot(None),
        )
        .all()
    )
    backed = enrollment_backed_students(
        db,
        Enrollment.summer_application_id,
        {p.summer_application_id for p in prospects},
    )
    by_id = {app.id: app for app in apps}
    journeys: dict[int, RegularProspectJourney] = {}
    for prospect in prospects:
        pair = backed.get(prospect.summer_application_id)
        if not pair:
            continue
        student_id = pair[0]
        summer_app = prospect.summer_application
        journeys[student_id] = RegularProspectJourney(
            prospect_id=prospect.id,
            source_branch=prospect.source_branch,
            primary_student_id=prospect.primary_student_id,
            # Same rule the applications page uses, so the chip cannot say two
            # different things about one student: they took the course if the
            # summer application published an enrollment and was not withdrawn.
            attended_summer=bool(
                summer_app is not None
                and summer_app.application_status != "Withdrawn"
            ),
        )
        if prospect.regular_application_id and student_id not in app_by_student:
            app = by_id.get(prospect.regular_application_id)
            if app:
                app_by_student[student_id] = app

    enrolled_app_ids: set[int] = set()
    app_ids = {app.id for app in app_by_student.values()}
    if app_ids:
        enrolled_app_ids = {
            app_id
            for (app_id,) in db.query(Enrollment.regular_application_id).filter(
                Enrollment.regular_application_id.in_(app_ids)
            )
            if app_id is not None
        }
    return app_by_student, enrolled_app_ids, journeys


def _retention_contacts(db: Session, student_ids: set[int], window_start):
    """Per-student parent-contact facts: last contact, whether it fell inside
    the application window, and any booked follow-up.

    Reuses parent_communications rather than growing an outreach table of its
    own, so a renewal call and a progress call live in one history."""
    contacts: dict[int, dict] = {}
    if not student_ids:
        return contacts
    rows = db.query(
        ParentCommunication.student_id,
        ParentCommunication.contact_date,
        ParentCommunication.follow_up_needed,
        ParentCommunication.follow_up_date,
        ParentCommunication.brief_notes,
    ).filter(ParentCommunication.student_id.in_(student_ids))

    for student_id, contact_date, follow_up_needed, follow_up_date, notes in rows:
        entry = contacts.setdefault(
            student_id,
            {
                "last": None,
                "note": None,
                "in_window": False,
                # The first call of the window, not the most recent one: the
                # trend asks when a family stopped being unreached, and a
                # second call does not move that date.
                "first_in_window": None,
                "follow_up_needed": False,
                "follow_up_date": None,
            },
        )
        if contact_date and (entry["last"] is None or contact_date > entry["last"]):
            entry["last"] = contact_date
            # What was said, so a second caller does not repeat the first.
            # Clipped because this rides on every row of an already large
            # payload and the list shows one line of it.
            entry["note"] = (notes or "").strip()[:200] or None
        if contact_date and window_start and contact_date >= window_start:
            entry["in_window"] = True
            if entry["first_in_window"] is None or contact_date < entry["first_in_window"]:
                entry["first_in_window"] = contact_date
        if follow_up_needed:
            entry["follow_up_needed"] = True
            if follow_up_date and (
                entry["follow_up_date"] is None or follow_up_date < entry["follow_up_date"]
            ):
                entry["follow_up_date"] = follow_up_date
    return contacts


def _retention_reconciliation(
    db: Session, config: RegularCourseConfig, branch: Optional[str] = None
):
    """Applications that claim an existing student but carry no student link.

    Three counts, and only the last one is worth acting on.

    Most of them are not a mistake at all. A P6 student coming up from a
    primary branch ticks "I already study at MathConcept" because to a family
    MathConcept is one place, and they are right: they have simply never
    studied at the secondary academy, so there is no record here to link them
    to and none of them is being counted as an unanswered student. Nothing can
    be done about those, and asking staff to look at them wastes their time.

    `unlinked_matchable` is the subset where a student record at the branch
    they named might be theirs. Those are the ones that can distort the board,
    because if the match is right then that student has applied and is being
    read as no response. It is counted by running the same scan the matching
    tool runs, so the headline and the list it opens can never disagree.

    With a branch selected, only the applications naming that branch count: the
    record to fix, if there is one, is at the branch they say they attend."""
    apps = _unlinked_secondary_apps(db, config.id)
    if branch:
        apps = [(a, code) for a, code in apps if code == branch]
    matchable = sum(1 for _a, _code, found in _candidates_for(db, apps) if found)

    rows = (
        db.query(RegularApplication.is_existing_student, RegularApplication.preferred_location)
        .filter(
            RegularApplication.config_id == config.id,
            RegularApplication.application_status.notin_(REGULAR_EXIT_STATUSES),
            RegularApplication.is_existing_student.isnot(None),
            RegularApplication.is_existing_student != "None",
            RegularApplication.existing_student_id.is_(None),
        )
        .all()
    )
    if branch:
        rows = [r for r in rows if normalize_secondary_location(r[1]) == branch]
    secondary = sum(1 for claim, _loc in rows if claim == "MathConcept Secondary Academy")
    return RegularRetentionReconciliation(
        unlinked_count=len(rows),
        unlinked_secondary=secondary,
        unlinked_primary=len(rows) - secondary,
        unlinked_matchable=matchable,
    )


def _event_day(value, window_start) -> Optional[date_type]:
    """The day an event lands on, falling back to the day the window opened.

    A record with no timestamp is old enough to predate the window either way,
    and dropping it would leave the chart's last point short of the headline it
    sits under."""
    if value is None:
        value = window_start
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def _retention_trend(
    applied: list[date_type],
    declined: list[date_type],
    contacted: list[date_type],
    *,
    start: Optional[date_type],
    today: date_type,
    close: Optional[date_type],
) -> list[RegularRetentionTrendPoint]:
    """The window day by day, from the dates the events already carry.

    No snapshot table stands behind this. Applications know when they were
    submitted, terminations when they were filed and contacts when the call was
    made, so the history is reconstructable at any time — which means the chart
    is complete from the day it ships rather than starting flat and filling in.

    The caller passes one date per student counted, so the running totals end on
    the same figures the headline shows. Dates before the window open are folded
    onto its first day rather than dropped, which keeps that guarantee for a
    contact logged early."""
    if start is None:
        return []
    end = today if close is None or today <= close else close
    latest = max([*applied, *declined, *contacted], default=None)
    # A late application still belongs on the chart; a closed window with none
    # simply stops on its closing date.
    if latest and latest > end:
        end = latest
    if end < start:
        return []

    def daily(dates: list[date_type]) -> dict[date_type, int]:
        counts: dict[date_type, int] = {}
        for value in dates:
            if value is None:
                continue
            day = start if value < start else value
            counts[day] = counts.get(day, 0) + 1
        return counts

    per_day = (daily(applied), daily(declined), daily(contacted))
    running = [0, 0, 0]
    points: list[RegularRetentionTrendPoint] = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        fresh = [counts.get(day, 0) for counts in per_day]
        running = [total + new for total, new in zip(running, fresh)]
        points.append(RegularRetentionTrendPoint(
            date=day,
            applied=fresh[0],
            declined=fresh[1],
            contacted=fresh[2],
            applied_total=running[0],
            declined_total=running[1],
            contacted_total=running[2],
        ))
    return points


def _build_retention(
    db: Session,
    config: RegularCourseConfig,
    *,
    branch: Optional[str] = None,
    tutor_id: Optional[int] = None,
    include_reconciliation: bool = True,
) -> RegularRetentionResponse:
    """Assemble the retention report for one intake.

    `tutor_id` scopes the whole report to one tutor's students, which is what
    the tutor-facing view reads; the caller decides what of it that role is
    allowed to see."""
    year = config.year
    active_from = _months_before(config.course_start_date, RETENTION_ACTIVE_MONTHS_BACK)
    window_start = config.application_open_date
    intake_quarter, intake_year = get_quarter_for_date(
        window_start.date() if window_start else config.course_start_date
    )

    regular_src, summer_src = _retention_cohort_sources(db, config, active_from, tutor_id)
    cohort_ids = set(regular_src) | set(summer_src)
    left_before, declined, not_churn = _retention_terminations(
        db, cohort_ids, active_from, (intake_year, intake_quarter)
    )
    # Students who left before the window are not a retention question at all.
    # Those who left during it for a reason that was never churn — moved
    # branch, finished school — stay on the board and out of the denominator,
    # because a cohort that shrank silently is a cohort nobody trusts.
    cohort_ids -= left_before

    app_by_student, enrolled_app_ids, prospect_journeys = _retention_applications(db, config, year)
    contacts = _retention_contacts(db, cohort_ids, window_start)
    rungs = _retention_rungs(config)

    students = {
        s.id: s for s in db.query(Student).filter(Student.id.in_(cohort_ids))
    } if cohort_ids else {}
    tutor_ids = {
        src[student_id][2]
        for student_id in cohort_ids
        for src in (regular_src, summer_src)
        if student_id in src and src[student_id][2]
    }
    tutor_names = dict(
        db.query(Tutor.id, Tutor.tutor_name).filter(Tutor.id.in_(tutor_ids))
    ) if tutor_ids else {}

    totals = RegularRetentionRow(key="All")
    no_rung_row = RegularRetentionRow(key="No rung offered")
    not_churn_row = RegularRetentionRow(key="Accounted for")
    by_branch: dict[str, RegularRetentionRow] = {}
    by_grade: dict[str, RegularRetentionRow] = {}
    by_source: dict[str, RegularRetentionRow] = {}
    by_tutor: dict[str, RegularRetentionRow] = {}
    by_reason: dict[str, RegularRetentionRow] = {}
    chase: list[RegularRetentionChaseRow] = []
    # One date per student the totals count, which is what keeps the last point
    # of the trend equal to the KPI above it.
    applied_dates: list[date_type] = []
    declined_dates: list[date_type] = []
    contacted_dates: list[date_type] = []

    def _bump(row: RegularRetentionRow, state: str, contacted: bool) -> None:
        row.cohort += 1
        # Enrolled nests inside applied, matching the conversion funnel's
        # strictly-nested stages.
        if state == "enrolled":
            row.applied += 1
            row.enrolled += 1
        elif state == "applied":
            row.applied += 1
        elif state == "declined":
            row.declined += 1
        elif state == "no_response":
            row.no_response += 1
            if contacted:
                row.no_response_contacted += 1
        if contacted:
            row.contacted += 1

    today = hk_now().date()

    for student_id in cohort_ids:
        student = students.get(student_id)
        if not student:
            continue
        in_regular, in_summer = student_id in regular_src, student_id in summer_src
        home = regular_src.get(student_id) or summer_src.get(student_id)
        student_branch = home[1] if home else None
        student_tutor_id = home[2] if home else None
        if branch and student_branch != branch:
            continue
        if tutor_id is not None and student_tutor_id != tutor_id:
            continue

        # The stored grade is last school year's until the Sept 1 job runs, but
        # an application carries the grade being entered. Bridging the two is
        # what keeps the board stable across the promotion boundary.
        already_promoted = (student.last_promoted_year or 0) >= year
        expected_grade = student.grade if already_promoted else next_grade(student.grade)
        rung = rungs.get((expected_grade or "").upper(), "none")

        app = app_by_student.get(student_id)
        decline = declined.get(student_id)
        # A live application outranks a termination filed in the same quarter:
        # it is the later word from the same family.
        if app and app.id in enrolled_app_ids:
            state = "enrolled"
        elif app:
            state = "applied"
        elif decline:
            state = "declined"
        elif student_id in not_churn:
            state = "not_churn"
        else:
            state = "no_response"

        contact = contacts.get(student_id) or {}
        last_contact = contact.get("last")
        source = (
            "regular_and_summer" if in_regular and in_summer
            else "regular_only" if in_regular
            else "summer_only"
        )
        chase.append(RegularRetentionChaseRow(
            student_id=student_id,
            student_name=student.student_name,
            student_code=format_student_code(student.home_location, student.school_student_id),
            branch=student_branch,
            grade=student.grade,
            expected_grade=expected_grade,
            rung=rung,
            lang_stream=student.lang_stream,
            school=student.school,
            phone=student.phone,
            tutor_name=tutor_names.get(student_tutor_id),
            source=source,
            prospect_journey=prospect_journeys.get(student_id),
            state=state,
            reference_code=app.reference_code if app else None,
            application_status=app.application_status if app else None,
            last_contact_date=last_contact,
            last_contact_note=contact.get("note"),
            days_since_contact=(today - last_contact.date()).days if last_contact else None,
            follow_up_needed=bool(contact.get("follow_up_needed")),
            follow_up_date=contact.get("follow_up_date"),
            # Kept even when an application won the state, so a family that
            # applied *and* was marked not-returning shows the contradiction
            # instead of hiding it.
            decline_reason_category=decline[1] if decline else None,
        ))

        contacted = bool(contact.get("in_window"))
        # Both of these are reported on their own and never counted as a
        # retention outcome: one had nowhere to apply, the other was never a
        # loss. Leaving either in the denominator would understate the rate.
        if state == "not_churn":
            _bump(not_churn_row, state, contacted)
            continue
        if rung == "none":
            _bump(no_rung_row, state, contacted)
            continue
        _bump(totals, state, contacted)
        # Dated as the same event the row was counted as, so a student who both
        # applied and was contacted appears on both lines and once each.
        if state in ("applied", "enrolled") and app:
            applied_dates.append(_event_day(app.submitted_at, window_start))
        elif state == "declined" and decline:
            declined_dates.append(_event_day(decline[2], window_start))
        if contacted:
            contacted_dates.append(_event_day(contact.get("first_in_window"), window_start))
        _bump(by_branch.setdefault(student_branch or "Unknown",
                                   RegularRetentionRow(key=student_branch or "Unknown")), state, contacted)
        _bump(by_grade.setdefault(expected_grade or "Unknown",
                                  RegularRetentionRow(key=expected_grade or "Unknown")), state, contacted)
        _bump(by_source.setdefault(source, RegularRetentionRow(key=source)), state, contacted)
        # Keyed on the tutor's id, not their name: two tutors called Ms Wong
        # are two rows, not one row with both their students in it.
        tutor_key = str(student_tutor_id) if student_tutor_id else "unattributed"
        _bump(
            by_tutor.setdefault(
                tutor_key,
                RegularRetentionRow(
                    key=tutor_key,
                    label=tutor_names.get(student_tutor_id) or "Unattributed",
                ),
            ),
            state,
            contacted,
        )
        if state == "declined":
            reason_key = (decline[1] if decline else None) or "Unspecified"
            _bump(by_reason.setdefault(reason_key, RegularRetentionRow(key=reason_key)), state, contacted)

    # Only the admin board can act on any of this, so the tutor view does not
    # pay for the queries behind it.
    reconciliation = RegularRetentionReconciliation()
    if include_reconciliation:
        reconciliation = _retention_reconciliation(db, config, branch)
        # Applications from students this cohort never contained: they lapsed
        # earlier, or never had a qualifying enrollment. Named rather than
        # counted, because each one is a different situation and a number
        # cannot tell them apart. Their branch is their home branch, there
        # being no enrollment here to take one from.
        outside_ids = [sid for sid in app_by_student if sid not in cohort_ids]
        outside: list[RegularRetentionOutsideRow] = []
        if outside_ids:
            query = db.query(Student).filter(Student.id.in_(outside_ids))
            if branch:
                query = query.filter(Student.home_location == branch)
            for student in query:
                app = app_by_student[student.id]
                outside.append(RegularRetentionOutsideRow(
                    student_id=student.id,
                    student_name=student.student_name,
                    student_code=format_student_code(
                        student.home_location, student.school_student_id
                    ),
                    branch=student.home_location,
                    grade=student.grade,
                    applied_grade=app.grade,
                    reference_code=app.reference_code,
                ))
            outside.sort(key=lambda r: r.student_name or "")
        reconciliation.applied_outside_cohort = len(outside)
        reconciliation.applied_outside = outside

    # Unresponsive students lead every list — they are the work. Within that,
    # group by branch and entering grade so a caller works one class at a time.
    state_order = {"no_response": 0, "declined": 1, "applied": 2, "enrolled": 3, "not_churn": 4}
    chase.sort(key=lambda r: (
        state_order.get(r.state, 9),
        r.branch or "",
        GRADE_ORDER.index(r.expected_grade) if r.expected_grade in GRADE_ORDER else 99,
        r.student_name or "",
    ))

    return RegularRetentionResponse(
        year=year,
        window_start=window_start,
        active_from=active_from,
        intake_year=intake_year,
        intake_quarter=intake_quarter,
        totals=totals,
        by_branch=sorted(by_branch.values(), key=lambda r: r.key),
        by_expected_grade=sorted(
            by_grade.values(),
            key=lambda r: GRADE_ORDER.index(r.key) if r.key in GRADE_ORDER else 99,
        ),
        by_source=sorted(by_source.values(), key=lambda r: -r.cohort),
        by_tutor=sorted(
            by_tutor.values(),
            key=lambda r: (r.key == "unattributed", -r.cohort, r.label or r.key),
        ),
        by_decline_reason=sorted(by_reason.values(), key=lambda r: (-r.declined, r.key)),
        no_rung=no_rung_row,
        not_churn=not_churn_row,
        chase=chase,
        reconciliation=reconciliation,
        trend=_retention_trend(
            applied_dates,
            declined_dates,
            contacted_dates,
            start=window_start.date() if window_start else None,
            today=today,
            close=(
                config.application_close_date.date()
                if config.application_close_date else None
            ),
        ),
    )


# The report costs about 600ms of database CPU, most of it working out which
# enrollments were still running at the end of last school year, and the answer
# is the same for everybody who opens the board that minute. Two minutes is
# short enough that a slow-changing input (a phone number edited on a student
# record, a change to the config) heals on its own, and long enough to collapse
# a morning's worth of staff all opening the board at once into one query.
#
# Anything the board's own buttons change is caught properly rather than waited
# out: the fingerprint below goes in the key, so logging a contact or marking a
# family as not returning produces a different key immediately, on every
# instance at once. See utils/ttl_cache.py for why that matters here.
_RETENTION_CACHE = TTLCache(ttl_seconds=120, maxsize=8)


def _retention_fingerprint(db: Session, config: RegularCourseConfig) -> tuple:
    """A cheap stand-in for "has anything the report reads changed?".

    Counts catch inserts and deletes, and the latest `updated_at` catches an
    edit in place. Applications, terminations and parent contacts are the three
    tables this board writes to, so its own actions always land. Everything else
    it reads (students, enrollments) changes rarely and is left to the TTL.

    Parent contacts have no `updated_at` column, so an edit to an existing note
    is the one change that waits for the TTL rather than showing straight away.
    """
    apps = db.query(
        func.count(RegularApplication.id), func.max(RegularApplication.updated_at)
    ).filter(RegularApplication.config_id == config.id).one()
    terms = db.query(
        func.count(TerminationRecord.id), func.max(TerminationRecord.updated_at)
    ).one()
    contacts = db.query(
        func.count(ParentCommunication.id), func.max(ParentCommunication.id)
    ).one()
    return (
        tuple(apps), tuple(terms), tuple(contacts),
        config.updated_at,
        # The trend runs to today, so a report built yesterday is stale at
        # midnight however little else moved.
        date_type.today(),
    )


def _cached_retention(
    db: Session,
    config: RegularCourseConfig,
    *,
    branch: Optional[str] = None,
    tutor_id: Optional[int] = None,
    include_reconciliation: bool = True,
) -> RegularRetentionResponse:
    """`_build_retention`, but skipped when nothing has moved since last time."""
    key = (
        config.id, branch, tutor_id, include_reconciliation,
        _retention_fingerprint(db, config),
    )
    cached = _RETENTION_CACHE.get(key)
    if cached is not None:
        return cached
    report = _build_retention(
        db, config, branch=branch, tutor_id=tutor_id,
        include_reconciliation=include_reconciliation,
    )
    _RETENTION_CACHE.set(key, report)
    return report


@router.get(
    "/regular/retention",
    response_model=RegularRetentionResponse,
    # About 800 rows, most of whose optional fields are empty: a family nobody
    # has rung has nothing to say about the call. Leaving those keys out of the
    # JSON rather than sending them as null is a quarter of the payload.
    response_model_exclude_none=True,
)
def get_retention(
    year: int = Query(...),
    branch: Optional[str] = None,  # MSA / MSB
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Did last year's students apply for this year's regular course?

    Counterpart to /regular/conversion: that one tracks P6 prospects arriving,
    this tracks the students already here staying. The cohort is everyone with
    a regular enrollment still running at the end of last school year, plus
    this year's summer course, minus the students who had already left."""
    config = db.query(RegularCourseConfig).filter(RegularCourseConfig.year == year).first()
    if not config:
        raise HTTPException(status_code=404, detail=f"No regular course config for {year}")
    return _cached_retention(db, config, branch=branch)


def _intake_config(db: Session, year: Optional[int]) -> RegularCourseConfig:
    """The intake a tutor-facing page is about: the one they name, or the one
    that is open, since that is the only one they can do anything about."""
    query = db.query(RegularCourseConfig)
    config = (
        query.filter(RegularCourseConfig.year == year).first()
        if year is not None
        else query.filter(RegularCourseConfig.is_active == True).first()  # noqa: E712
    )
    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"No regular course config for {year}" if year else "No active regular intake",
        )
    return config


@router.get(
    "/regular/retention/mine",
    response_model=RegularRetentionMineResponse,
    response_model_exclude_none=True,
)
def get_my_retention(
    year: Optional[int] = None,
    tutor_id: Optional[int] = None,
    current_user: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """A tutor's own students and whether they have come back.

    The same cohort logic as the admin report, scoped to the caller's own
    students and stripped of everything that would read as a scoreboard: no
    branch rows, no comparison against other tutors, no reconciliation. Admins
    calling this see their own students too — the admin board is where the
    whole picture lives.

    `tutor_id` is for viewing the page as somebody else, which only an admin
    may do. See `resolve_viewed_tutor_id`.

    Defaults to the active intake, since a tutor chases the one that is open."""
    viewed_tutor_id = resolve_viewed_tutor_id(current_user, tutor_id)
    config = _intake_config(db, year)
    report = _cached_retention(
        db, config, tutor_id=viewed_tutor_id, include_reconciliation=False
    )
    return RegularRetentionMineResponse(
        year=report.year,
        intake_year=report.intake_year,
        intake_quarter=report.intake_quarter,
        totals=report.totals,
        students=report.chase,
    )


@router.get(
    "/regular/class/mine",
    response_model=RegularMyClassResponse,
    response_model_exclude_none=True,
)
def get_my_class(
    year: Optional[int] = None,
    tutor_id: Optional[int] = None,
    current_user: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Who is coming to this tutor's classes in September.

    The forward-looking half of renewal. `/regular/retention/mine` looks back
    at the students they taught last year and asks who has not come back; this
    looks at the slots they are down to teach and says who has been placed in
    them. The two populations differ on purpose, because a class fills up with
    families the tutor has never met and some of last year's students end up
    with somebody else.

    `tutor_id` is for viewing the page as somebody else, which only an admin
    may do. See `resolve_viewed_tutor_id`."""
    viewed_tutor_id = resolve_viewed_tutor_id(current_user, tutor_id)
    config = _intake_config(db, year)

    slots = (
        db.query(RegularCourseSlot)
        .filter(
            RegularCourseSlot.config_id == config.id,
            RegularCourseSlot.tutor_id == viewed_tutor_id,
        )
        .order_by(RegularCourseSlot.slot_day, RegularCourseSlot.time_slot)
        .all()
    )

    # Everyone placed in those slots who is still in the intake. A withdrawn
    # application keeps its slot in the database but is not coming, so it is
    # neither listed nor counted against the places.
    apps: list[RegularApplication] = []
    if slots:
        apps = (
            db.query(RegularApplication)
            .options(joinedload(RegularApplication.existing_student))
            .filter(
                RegularApplication.assigned_slot_id.in_([s.id for s in slots]),
                RegularApplication.application_status.not_in(REGULAR_EXIT_STATUSES),
            )
            .order_by(RegularApplication.student_name)
            .all()
        )

    # Which of them this tutor already teaches. Anyone who started a regular
    # course with them on or after last September, which is the school year
    # ending as this intake opens.
    taught: set[int] = set()
    student_ids = [a.existing_student_id for a in apps if a.existing_student_id]
    if student_ids:
        taught = {
            row[0]
            for row in db.query(Enrollment.student_id).filter(
                Enrollment.student_id.in_(student_ids),
                Enrollment.tutor_id == viewed_tutor_id,
                Enrollment.enrollment_type != "Summer",
                Enrollment.first_lesson_date >= date_type(config.year - 1, 9, 1),
            )
        }

    by_slot: dict[int, list[RegularMyClassStudent]] = {}
    for app in apps:
        student = app.existing_student
        by_slot.setdefault(app.assigned_slot_id, []).append(RegularMyClassStudent(
            application_id=app.id,
            student_name=(student.student_name if student else app.student_name),
            grade=app.grade,
            # The stream that governs their placement rather than the one typed
            # on the form, which is what the arrangement board reads too. Thirty
            # applications say International, a stream no class runs in, and a
            # handful disagree with the student's own record, which is the system
            # of record. Sending the raw value put a tutor and the office one
            # word apart about the same child.
            lang_stream=effective_stream(app),
            school=app.school,
            application_status=app.application_status,
            student_id=app.existing_student_id,
            student_code=(
                format_student_code(student.home_location, student.school_student_id)
                if student else None
            ),
            taught_by_me_last_year=app.existing_student_id in taught,
        ))

    return RegularMyClassResponse(
        year=config.year,
        slots=[
            RegularMyClassSlot(
                slot_id=s.id,
                slot_day=s.slot_day,
                time_slot=s.time_slot,
                location=s.location,
                grade=s.grade,
                lang_stream=s.lang_stream,
                max_students=s.max_students,
                students=by_slot.get(s.id, []),
            )
            for s in slots
        ],
    )


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
            .options(joinedload(RegularApplication.existing_student))
            .filter(RegularApplication.assigned_slot_id.in_(slot_infos.keys()))
            .all()
        ):
            members.setdefault(member.assigned_slot_id, []).append(member)

    tutor_names = _get_tutor_names_bulk(db, slots)

    school_aliases = get_alias_map(db)
    app_school = school_group_key(app.school, app.lang_stream, school_aliases)
    app_stream = effective_stream(app)
    suggestions: list[RegularSuggestion] = []
    for slot in slots:
        if slot.id == app.assigned_slot_id:
            continue
        assigned = members.get(slot.id, [])
        if len(assigned) >= slot.max_students:
            continue  # capacity-strict
        if slot.grade and slot.grade != app.grade:
            continue  # grade-incompatible
        if slot.lang_stream and app_stream and slot.lang_stream != app_stream:
            continue  # stream-incompatible (hard filter)

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
        if slot.lang_stream and app_stream and slot.lang_stream == app_stream:
            # The slot itself declares the stream — an exact match is the signal.
            score += 30
            reasons.append("stream_match")
        elif not slot.lang_stream and app_stream and assigned:
            # Unset-stream slot gives no signal of its own, so fall back to the
            # already-assigned members' majority stream.
            stream_matches = sum(1 for m in assigned if effective_stream(m) == app_stream)
            if stream_matches * 2 >= len(assigned):
                score += 30
                reasons.append("stream_match")
        if app_school:
            schoolmates = sum(
                1 for m in assigned
                if school_group_key(m.school, m.lang_stream, school_aliases) == app_school
            )
            if schoolmates:
                score += 15 * schoolmates
                reasons.append(f"schoolmates:{schoolmates}")

        suggestions.append(RegularSuggestion(
            slot_id=slot.id,
            slot_day=slot.slot_day,
            time_slot=slot.time_slot,
            location=slot.location,
            grade=slot.grade,
            lang_stream=slot.lang_stream,
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

# Statuses from which publishing is allowed: the fee message must have gone out
# first, same threshold as summer. Side exits are explicit non-publishes.
PUBLISHABLE_APP_STATUSES = (
    RegularApplicationStatus.FEE_SENT.value,
    RegularApplicationStatus.PAID.value,
    RegularApplicationStatus.ENROLLED.value,
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
            "Publishing requires Fee Sent, Paid, or Enrolled.",
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

    # Regular (unlike Summer) must carry the $100 materials fee for
    # genuinely new students. Same rule the fee message quoted.
    is_new_student = _is_new_student(
        db, app.existing_student_id, exclude_application_id=app.id
    )

    # Snapshot the offer the enrollment is sold under, so a fee message
    # re-copied later still names it and still knows the materials fee was
    # waived. Resolved here rather than taken from the request: eligibility is
    # the server's call, and publishing must charge what the parent was quoted.
    promo = application_promo(app, app.config, hk_now().date())

    # Payment state follows the application status when the request stays
    # silent, mirroring summer: an app already marked Paid publishes as Paid.
    if req.payment_status is not None:
        payment_status = req.payment_status
    else:
        payment_status = 'Paid' if app.application_status in (
            RegularApplicationStatus.PAID.value,
            RegularApplicationStatus.ENROLLED.value,
        ) else 'Pending Payment'
    is_paid = payment_status == 'Paid'

    # Nothing is written if the tutor will not be here for the lessons. A
    # regular enrollment runs for a block of weeks, so the last lesson is the
    # one that decides it, and that is the date quoted back.
    last_lesson_date = max(
        (p.session_date for p in sessions if not p.is_holiday), default=first_lesson_date
    )
    departure_problem = check_assignment(db, tutor_id, last_lesson_date, noun="lesson")
    if departure_problem:
        raise HTTPException(status_code=400, detail=departure_problem)

    enrollment = Enrollment(
        student_id=app.existing_student_id,
        tutor_id=tutor_id,
        assigned_day=assigned_day,
        assigned_time=confirmed_time,
        location=normalize_secondary_location(location),
        lessons_paid=req.lessons_paid,
        first_lesson_date=first_lesson_date,
        payment_date=hk_now().date() if is_paid else None,
        payment_status=payment_status,
        enrollment_type='Regular',
        # Publishing is gated on Fee Sent or later, so the fee message has
        # already gone out by the time an enrollment exists.
        fee_message_sent=True,
        is_new_student=is_new_student,
        promo_code=promo.code if promo else None,
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
        application_status=app.application_status,
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


@router.get(
    "/regular/applications/{app_id}/messages",
    response_model=RegularApplicationMessages,
)
def get_application_messages(
    app_id: int,
    lessons_paid: int = Query(6, ge=1, le=24),
    discount_id: Optional[int] = Query(None),
    first_lesson_date: Optional[date_type] = Query(None),
    _admin: None = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Parent-facing schedule and fee messages for one application.

    The schedule comes from the assigned arrangement slot, falling back to the
    applicant's first-choice preference so a message can still be drafted
    before placement. Lesson dates, discount and registration fee are computed
    exactly as publishing would, so the quoted total is the total charged.
    """
    app = (
        db.query(RegularApplication)
        .options(joinedload(RegularApplication.config))
        .filter(RegularApplication.id == app_id)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    slot = (
        db.query(RegularCourseSlot)
        .filter(RegularCourseSlot.id == app.assigned_slot_id)
        .first()
        if app.assigned_slot_id
        else None
    )
    if slot:
        source = "slot"
        raw_day, raw_time, raw_location = slot.slot_day, slot.time_slot, slot.location
    else:
        source = "preference"
        raw_day, raw_time = app.preference_1_day, app.preference_1_time
        raw_location = app.preferred_location

    if not raw_day or not raw_time or not raw_location:
        raise _publish_error(
            "no_schedule",
            "No schedule to describe. Assign the application to a slot first.",
        )

    assigned_day = normalize_day_short(raw_day)
    if assigned_day not in DAY_FULL_TO_SHORT.values():
        raise _publish_error("invalid_day", f"Unrecognized weekday: {raw_day}")
    location = normalize_secondary_location(raw_location)

    course_start = app.config.course_start_date if app.config else None
    lesson_start = first_lesson_date
    if lesson_start is None:
        if not course_start:
            raise _publish_error("no_course_start", "Config has no course start date.")
        lesson_start = _first_weekday_on_or_after(course_start, assigned_day)

    from routers.enrollments import (
        compute_discount_value,
        format_fee_message,
        generate_session_dates,
    )

    sessions, _skipped, _end = generate_session_dates(
        first_lesson_date=lesson_start,
        assigned_day=assigned_day,
        lessons_paid=lessons_paid,
        enrollment_type="Regular",
        db=db,
    )
    session_dates = [s.session_date for s in sessions if not s.is_holiday]

    discount = (
        db.query(Discount).filter(Discount.id == discount_id).first()
        if discount_id
        else None
    )
    discount_value = compute_discount_value(discount, lessons_paid)

    # Same new-student rule as publish: nobody with a prior non-Trial
    # enrollment pays the registration fee again.
    student = app.existing_student if app.existing_student_id else None
    is_new_student = _is_new_student(
        db, app.existing_student_id, exclude_application_id=app.id
    )

    student_code = (student.school_student_id or "") if student else ""
    student_name = student.student_name if student else app.student_name

    # This intake does not collect the materials fee from anyone, so the draft
    # charges nobody. A running offer the applicant is verified for is still
    # quoted by name and still names the fee among what it saved them, which
    # is the one place the $100 appears.
    charges_reg_fee = intake_charges_registration_fee(app.config)
    promo = application_promo(app, app.config, hk_now().date())
    promo_fields = promo_message_fields(promo, intake_registration_fee(app.config))
    bills_reg_fee = is_new_student and charges_reg_fee

    def fee(lang: str) -> str:
        return strip_blank_student_id(format_fee_message(
            lang=lang,
            school_student_id=student_code,
            student_name=student_name,
            assigned_day=assigned_day,
            assigned_time=raw_time,
            location=location,
            lessons_paid=lessons_paid,
            session_dates=session_dates,
            discount_value=discount_value,
            is_new_student=bills_reg_fee,
            promo=promo_fields,
        ))

    def schedule(lang: str) -> str:
        return format_schedule_message(
            lang=lang,
            school_student_id=student_code,
            student_name=student_name,
            assigned_day=assigned_day,
            assigned_time=raw_time,
            location=location,
            lessons_paid=lessons_paid,
            session_dates=session_dates,
        )

    total_fee = (
        BASE_FEE_PER_LESSON * lessons_paid
        - discount_value
        + (REGISTRATION_FEE if bills_reg_fee else 0)
    )

    return RegularApplicationMessages(
        application_id=app.id,
        schedule_zh=schedule("zh"),
        schedule_en=schedule("en"),
        fee_zh=fee("zh"),
        fee_en=fee("en"),
        schedule_source=source,
        assigned_day=assigned_day,
        assigned_time=raw_time,
        location=location,
        lessons_paid=lessons_paid,
        first_lesson_date=lesson_start,
        total_fee=total_fee,
        discount_value=discount_value,
        is_new_student=is_new_student,
        has_student_link=student is not None,
        promo_code=promo.code if promo else None,
        promo_name_en=promo.name_en if promo else None,
        promo_waives_registration_fee=bool(promo and promo.waives_registration_fee),
    )


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
    and return its old_value. Fall back to 'Fee Sent' if no audit."""
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
    return RegularApplicationStatus.FEE_SENT.value


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


@router.delete("/regular/applications/{app_id}")
def delete_application(
    app_id: int,
    _admin: Tutor = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Permanently delete an application and its edit history. Super Admin
    only: a cleanup tool for test submissions, not part of the normal flow.
    Real applicants exit through Withdrawn/Rejected so the funnel keeps them.

    Blocked while an enrollment references the application, because the
    enrollment's registration fee resolves through this link (application →
    intake config): deleting the application would flip a waived fee back to
    charged on every display. Unpublish first, then delete."""
    app = db.query(RegularApplication).filter(RegularApplication.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.regular_application_id == app_id)
        .first()
    )
    if enrollment:
        raise HTTPException(
            status_code=409,
            detail="This application has a published enrollment. Unpublish it before deleting.",
        )

    # The prospect FK is SET NULL at the DB layer, but clear it here as well so
    # the ORM sees the unlink in the same transaction and the prospect's
    # derived regular journey returns to "none" immediately.
    db.query(PrimaryProspect).filter(
        PrimaryProspect.regular_application_id == app_id
    ).update({PrimaryProspect.regular_application_id: None})

    # CASCADE would get these too; explicit so the delete does not depend on
    # how the DB constraint was created.
    db.query(RegularApplicationEdit).filter(
        RegularApplicationEdit.application_id == app_id
    ).delete()

    db.delete(app)
    db.commit()
    return {"success": True}
