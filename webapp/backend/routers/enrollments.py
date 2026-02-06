"""
Enrollments API endpoints.
Provides CRUD access to enrollment data with filtering and session generation.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, select
from typing import List, Optional
from datetime import date, datetime, timedelta
from collections import defaultdict
from database import get_db
from models import Enrollment, Student, Tutor, Discount, Holiday, SessionLog, StudentCoupon
from schemas import (
    EnrollmentResponse, EnrollmentUpdate, EnrollmentExtensionUpdate, OverdueEnrollment,
    EnrollmentCreate, SessionPreview, StudentConflict, EnrollmentPreviewResponse,
    RenewalDataResponse, RenewalListItem, RenewalCountsResponse, TrialListItem,
    EnrollmentDetailResponse, PendingMakeupSession, PotentialRenewalLink,
    BatchEnrollmentRequest, BatchOperationResponse,
    EligibilityResult, BatchRenewCheckResponse, BatchRenewRequest, BatchRenewResult, BatchRenewResponse,
    ScheduleChangeRequest, ScheduleChangePreviewResponse, UnchangeableSession, UpdatableSession,
    ApplyScheduleChangeRequest, ScheduleChangeResult
)
from auth.dependencies import require_admin, get_current_user

router = APIRouter()

# Grace period: students remain in "active" lists for this many days after enrollment expires
ACTIVE_GRACE_PERIOD_DAYS = 21


# ============================================
# Session Generation Helpers
# ============================================

def get_holidays_in_range(db: Session, start_date: date, end_date: date) -> dict:
    """Load holidays between start and end dates, returning dict of date -> name."""
    holidays = db.query(Holiday).filter(
        Holiday.holiday_date >= start_date,
        Holiday.holiday_date <= end_date
    ).all()
    return {h.holiday_date: h.holiday_name for h in holidays}


def generate_session_dates(
    first_lesson_date: date,
    assigned_day: str,
    lessons_paid: int,
    enrollment_type: str,
    db: Session
) -> tuple[List[SessionPreview], List[dict], date]:
    """
    Generate session dates with holiday awareness.

    Returns:
        - List of SessionPreview objects
        - List of skipped holidays (for warnings)
        - effective_end_date (date of last session)
    """
    sessions = []
    skipped_holidays = []
    current_date = first_lesson_date
    sessions_generated = 0

    # Trial and One-Time generate exactly 1 session
    max_sessions = 1 if enrollment_type in ('Trial', 'One-Time') else lessons_paid

    # Load holidays for date range (first_lesson_date + 104 weeks to be safe)
    end_range = first_lesson_date + timedelta(weeks=104)
    holidays = get_holidays_in_range(db, first_lesson_date, end_range)

    while sessions_generated < max_sessions:
        holiday_name = holidays.get(current_date)

        if holiday_name:
            # Record skipped holiday
            skipped_holidays.append({
                'date': current_date.isoformat(),
                'name': holiday_name
            })
            # Add to sessions list as skipped
            sessions.append(SessionPreview(
                session_date=current_date,
                time_slot="",  # Will be filled by caller
                location="",   # Will be filled by caller
                is_holiday=True,
                holiday_name=holiday_name
            ))
            current_date += timedelta(weeks=1)
            continue

        # Normal session
        sessions.append(SessionPreview(
            session_date=current_date,
            time_slot="",  # Will be filled by caller
            location="",   # Will be filled by caller
            is_holiday=False
        ))
        sessions_generated += 1

        if sessions_generated < max_sessions:
            current_date += timedelta(weeks=1)

    effective_end_date = current_date
    return sessions, skipped_holidays, effective_end_date


def check_student_conflicts(
    db: Session,
    student_id: int,
    session_dates: List[date],
    time_slot: str,
    exclude_enrollment_id: Optional[int] = None
) -> List[StudentConflict]:
    """Check if student has existing sessions at given dates/times."""
    conflicts = []

    # Statuses that don't count as conflicts (pending makeups are available for reassignment)
    non_conflict_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up',
        'Cancelled'
    ]

    query = db.query(SessionLog).options(
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date.in_(session_dates),
        SessionLog.time_slot == time_slot,
        ~SessionLog.session_status.in_(non_conflict_statuses)
    )

    if exclude_enrollment_id:
        query = query.filter(SessionLog.enrollment_id != exclude_enrollment_id)

    for session in query.all():
        conflicts.append(StudentConflict(
            session_date=session.session_date,
            time_slot=session.time_slot,
            existing_tutor_name=session.tutor.tutor_name if session.tutor else "Unknown",
            session_status=session.session_status,
            enrollment_id=session.enrollment_id
        ))

    return conflicts


def calculate_effective_end_date(enrollment: Enrollment, db: Session) -> Optional[date]:
    """Calculate effective end date with holiday awareness.

    Counts actual lesson dates (skipping holidays) until we reach
    lessons_paid valid lesson dates, then adds extension weeks (also holiday-aware).

    The last lesson is on the Nth non-holiday date where N = lessons_paid.
    Extension weeks provide additional deadline buffer beyond the last lesson.
    """
    import logging
    logger = logging.getLogger(__name__)

    if not enrollment.first_lesson_date:
        return None

    weeks_paid = enrollment.lessons_paid or 0
    extension_weeks = enrollment.deadline_extension_weeks or 0

    # Total lesson dates to count (lessons + extension buffer)
    total_lesson_dates = weeks_paid + extension_weeks

    if total_lesson_dates <= 0:
        return enrollment.first_lesson_date

    # Calculate date range needed (2x total weeks for long enrollments, minimum 30 weeks)
    # Increased from 1.5x to 2x to handle extended holiday clusters
    weeks_buffer = max(30, int(total_lesson_dates * 2))
    end_range = enrollment.first_lesson_date + timedelta(weeks=weeks_buffer)
    holidays = get_holidays_in_range(db, enrollment.first_lesson_date, end_range)

    current_date = enrollment.first_lesson_date
    lessons_counted = 0
    effective_end = current_date

    # Max iterations guard to prevent infinite loops
    # Set to 3x expected iterations as a safety limit
    max_iterations = total_lesson_dates * 3
    iterations = 0

    while lessons_counted < total_lesson_dates:
        iterations += 1
        if iterations > max_iterations:
            logger.warning(
                f"Effective end date calculation exceeded max iterations ({max_iterations}) "
                f"for enrollment {enrollment.id}. Lessons counted: {lessons_counted}/{total_lesson_dates}"
            )
            break

        if current_date not in holidays:
            lessons_counted += 1
            effective_end = current_date
        current_date += timedelta(weeks=1)

    return effective_end


def calculate_effective_end_date_bulk(
    enrollment: Enrollment,
    holidays: dict
) -> Optional[date]:
    """Holiday-aware calculation with pre-loaded holidays dict.

    Use this for bulk operations to avoid repeated DB queries.
    Caller should load holidays once with get_holidays_in_range().
    """
    import logging
    logger = logging.getLogger(__name__)

    if not enrollment.first_lesson_date:
        return None

    weeks_paid = enrollment.lessons_paid or 0
    extension_weeks = enrollment.deadline_extension_weeks or 0
    total_lesson_dates = weeks_paid + extension_weeks

    if total_lesson_dates <= 0:
        return enrollment.first_lesson_date

    current_date = enrollment.first_lesson_date
    lessons_counted = 0
    effective_end = current_date

    # Max iterations guard to prevent infinite loops
    # Set to 3x expected iterations as a safety limit
    max_iterations = total_lesson_dates * 3
    iterations = 0

    while lessons_counted < total_lesson_dates:
        iterations += 1
        if iterations > max_iterations:
            logger.warning(
                f"Effective end date calculation exceeded max iterations ({max_iterations}) "
                f"for enrollment {enrollment.id}. Lessons counted: {lessons_counted}/{total_lesson_dates}"
            )
            break

        if current_date not in holidays:
            lessons_counted += 1
            effective_end = current_date
        current_date += timedelta(weeks=1)

    return effective_end


# ============================================
# Enrollment Creation Endpoints
# ============================================

@router.post("/enrollments/preview", response_model=EnrollmentPreviewResponse)
async def preview_enrollment(
    enrollment_data: EnrollmentCreate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Preview sessions before creating an enrollment (no DB writes).

    Returns the list of sessions that would be generated, including:
    - Session dates with holiday skipping
    - Conflicts with student's existing sessions
    - Warnings about holidays
    """
    # Validate student exists
    student = db.query(Student).filter(Student.id == enrollment_data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with ID {enrollment_data.student_id} not found")

    # Validate tutor exists
    tutor = db.query(Tutor).filter(Tutor.id == enrollment_data.tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor with ID {enrollment_data.tutor_id} not found")

    # Generate session dates
    sessions, skipped_holidays, effective_end_date = generate_session_dates(
        first_lesson_date=enrollment_data.first_lesson_date,
        assigned_day=enrollment_data.assigned_day,
        lessons_paid=enrollment_data.lessons_paid,
        enrollment_type=enrollment_data.enrollment_type,
        db=db
    )

    # Fill in time_slot and location for all sessions
    for session in sessions:
        session.time_slot = enrollment_data.assigned_time
        session.location = enrollment_data.location

    # Get non-holiday session dates for conflict checking
    non_holiday_dates = [s.session_date for s in sessions if not s.is_holiday]

    # Check for student conflicts
    conflicts = check_student_conflicts(
        db=db,
        student_id=enrollment_data.student_id,
        session_dates=non_holiday_dates,
        time_slot=enrollment_data.assigned_time
    )

    # Mark sessions with conflicts
    conflict_dates = {c.session_date for c in conflicts}
    for session in sessions:
        if session.session_date in conflict_dates:
            conflict = next(c for c in conflicts if c.session_date == session.session_date)
            session.conflict = f"Existing session with {conflict.existing_tutor_name} ({conflict.session_status})"

    # Build warnings
    warnings = []
    if skipped_holidays:
        for holiday in skipped_holidays:
            warnings.append(f"Holiday '{holiday['name']}' on {holiday['date']} - session pushed to next week")

    if conflicts:
        warnings.append(f"{len(conflicts)} conflict(s) found - student has existing sessions at these times")

    # Find potential previous enrollments to link as renewal (only if not already set)
    potential_renewals = []
    if not enrollment_data.renewed_from_enrollment_id:
        # Look for most recent enrollments for this student (simplified - no schedule matching)
        existing_enrollments = (
            db.query(Enrollment)
            .options(joinedload(Enrollment.tutor))
            .filter(
                Enrollment.student_id == enrollment_data.student_id,
                Enrollment.payment_status != "Cancelled"
            )
            .order_by(Enrollment.first_lesson_date.desc())
            .limit(5)
            .all()
        )

        for enr in existing_enrollments:
            eff_end = calculate_effective_end_date(enr, db)
            if eff_end:
                potential_renewals.append(PotentialRenewalLink(
                    id=enr.id,
                    effective_end_date=eff_end,
                    lessons_paid=enr.lessons_paid or 0,
                    tutor_name=enr.tutor.tutor_name if enr.tutor else ""
                ))

    return EnrollmentPreviewResponse(
        enrollment_data=enrollment_data,
        sessions=sessions,
        effective_end_date=effective_end_date,
        conflicts=conflicts,
        warnings=warnings,
        skipped_holidays=skipped_holidays,
        potential_renewals=potential_renewals
    )


@router.post("/enrollments", response_model=EnrollmentResponse)
async def create_enrollment(
    enrollment_data: EnrollmentCreate,
    admin: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create a new enrollment and generate sessions. Admin only.

    Sessions are generated with holiday awareness:
    - Holidays are skipped, extending the enrollment span
    - Trial/One-Time enrollments generate exactly 1 session
    """
    # Validate student exists
    student = db.query(Student).filter(Student.id == enrollment_data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with ID {enrollment_data.student_id} not found")

    # Validate tutor exists
    tutor = db.query(Tutor).filter(Tutor.id == enrollment_data.tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor with ID {enrollment_data.tutor_id} not found")

    # Validate discount if provided
    discount = None
    if enrollment_data.discount_id:
        discount = db.query(Discount).filter(Discount.id == enrollment_data.discount_id).first()
        if not discount:
            raise HTTPException(status_code=404, detail=f"Discount with ID {enrollment_data.discount_id} not found")

    # Validate renewed_from enrollment if provided
    if enrollment_data.renewed_from_enrollment_id:
        renewed_from = db.query(Enrollment).filter(
            Enrollment.id == enrollment_data.renewed_from_enrollment_id
        ).first()
        if not renewed_from:
            raise HTTPException(
                status_code=404,
                detail=f"Renewal source enrollment ID {enrollment_data.renewed_from_enrollment_id} not found"
            )

    # Generate session dates for conflict checking
    sessions, skipped_holidays, effective_end_date = generate_session_dates(
        first_lesson_date=enrollment_data.first_lesson_date,
        assigned_day=enrollment_data.assigned_day,
        lessons_paid=enrollment_data.lessons_paid,
        enrollment_type=enrollment_data.enrollment_type,
        db=db
    )

    # Check for conflicts (don't create if conflicts exist)
    non_holiday_dates = [s.session_date for s in sessions if not s.is_holiday]
    conflicts = check_student_conflicts(
        db=db,
        student_id=enrollment_data.student_id,
        session_dates=non_holiday_dates,
        time_slot=enrollment_data.assigned_time
    )

    if conflicts:
        conflict_details = [
            f"{c.session_date} with {c.existing_tutor_name}"
            for c in conflicts
        ]
        raise HTTPException(
            status_code=409,
            detail=f"Cannot create enrollment: student has conflicting sessions at: {', '.join(conflict_details)}"
        )

    # Create the enrollment
    enrollment = Enrollment(
        student_id=enrollment_data.student_id,
        tutor_id=enrollment_data.tutor_id,
        assigned_day=enrollment_data.assigned_day,
        assigned_time=enrollment_data.assigned_time,
        location=enrollment_data.location,
        first_lesson_date=enrollment_data.first_lesson_date,
        lessons_paid=enrollment_data.lessons_paid,
        enrollment_type=enrollment_data.enrollment_type,
        payment_status='Pending Payment',
        discount_id=enrollment_data.discount_id,
        renewed_from_enrollment_id=enrollment_data.renewed_from_enrollment_id,
        last_modified_time=datetime.now(),
        last_modified_by=admin.user_email
    )
    db.add(enrollment)
    db.flush()  # Get enrollment ID

    # Create sessions
    sessions_created = 0
    for session_preview in sessions:
        if session_preview.is_holiday:
            continue  # Skip holidays

        session = SessionLog(
            enrollment_id=enrollment.id,
            student_id=enrollment_data.student_id,
            tutor_id=enrollment_data.tutor_id,
            session_date=session_preview.session_date,
            time_slot=enrollment_data.assigned_time,
            location=enrollment_data.location,
            session_status='Scheduled',
            financial_status='Unpaid',
            last_modified_by=admin.user_email
        )
        db.add(session)
        sessions_created += 1

    db.commit()

    # Re-query with joins to return full response
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment.id).first()

    # Build response
    enrollment_response = EnrollmentResponse.model_validate(enrollment)
    enrollment_response.student_name = student.student_name
    enrollment_response.tutor_name = tutor.tutor_name
    enrollment_response.discount_name = discount.discount_name if discount else None
    enrollment_response.grade = student.grade
    enrollment_response.school = student.school
    enrollment_response.school_student_id = student.school_student_id
    enrollment_response.lang_stream = student.lang_stream
    enrollment_response.effective_end_date = effective_end_date

    return enrollment_response


@router.get("/enrollments/{enrollment_id}/renewal-data", response_model=RenewalDataResponse)
async def get_renewal_data(
    enrollment_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get pre-filled data for renewing an enrollment.

    Calculates the suggested first_lesson_date as the next occurrence
    of assigned_day after the current enrollment's effective_end_date.
    """
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    # Calculate effective end date
    effective_end = calculate_effective_end_date(enrollment, db)
    if not effective_end:
        raise HTTPException(
            status_code=400,
            detail="Cannot calculate renewal date: enrollment has no first_lesson_date"
        )

    # Calculate suggested first lesson date (next occurrence of assigned_day after effective_end)
    # Support both full and abbreviated day names for legacy data compatibility
    day_name_to_weekday = {
        'Monday': 0, 'Mon': 0,
        'Tuesday': 1, 'Tue': 1,
        'Wednesday': 2, 'Wed': 2,
        'Thursday': 3, 'Thu': 3,
        'Friday': 4, 'Fri': 4,
        'Saturday': 5, 'Sat': 5,
        'Sunday': 6, 'Sun': 6
    }

    assigned_weekday = day_name_to_weekday.get(enrollment.assigned_day)
    if assigned_weekday is None:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid assigned_day: {enrollment.assigned_day}"
        )

    # Find next occurrence of the assigned day after effective_end
    suggested_date = effective_end + timedelta(days=1)  # Start from day after end
    while suggested_date.weekday() != assigned_weekday:
        suggested_date += timedelta(days=1)

    return RenewalDataResponse(
        student_id=enrollment.student_id,
        student_name=enrollment.student.student_name if enrollment.student else "",
        school_student_id=enrollment.student.school_student_id if enrollment.student else None,
        grade=enrollment.student.grade if enrollment.student else None,
        tutor_id=enrollment.tutor_id,
        tutor_name=enrollment.tutor.tutor_name if enrollment.tutor else "",
        assigned_day=enrollment.assigned_day,
        assigned_time=enrollment.assigned_time,
        location=enrollment.location,
        suggested_first_lesson_date=suggested_date,
        previous_lessons_paid=enrollment.lessons_paid or 0,
        enrollment_type=enrollment.enrollment_type,
        renewed_from_enrollment_id=enrollment.id,
        previous_effective_end_date=effective_end,
        discount_id=enrollment.discount_id,
        discount_name=enrollment.discount.discount_name if enrollment.discount else None
    )


@router.get("/enrollments/renewals", response_model=List[RenewalListItem])
async def get_enrollments_needing_renewal(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    include_expired: bool = Query(True, description="Include already expired enrollments"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get enrollments that need renewal (expiring soon or already expired).

    Includes:
    - Expiring soon: effective_end_date within next 14 days
    - Expired: effective_end_date has passed but no renewal created

    Only returns Regular enrollments that are not cancelled.
    """
    today = date.today()
    two_weeks_ahead = today + timedelta(days=14)

    # Query active Regular enrollments
    query = (
        db.query(Enrollment)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor)
        )
        .filter(
            Enrollment.payment_status != "Cancelled",
            Enrollment.enrollment_type == "Regular",
            Enrollment.student_id.isnot(None),
            Enrollment.tutor_id.isnot(None),
            Enrollment.first_lesson_date.isnot(None)
        )
    )

    if location:
        query = query.filter(Enrollment.location == location)

    if tutor_id:
        query = query.filter(Enrollment.tutor_id == tutor_id)

    enrollments = query.all()

    # Load holidays once for bulk calculation (2 years should cover all enrollments)
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    # First pass: calculate effective_end_date and filter candidates
    candidates = []
    for enrollment in enrollments:
        effective_end = calculate_effective_end_date_bulk(enrollment, holidays)
        if not effective_end:
            continue

        days_until_expiry = (effective_end - today).days

        # Include if expiring within 2 weeks or already expired
        if days_until_expiry <= 14:
            # Skip expired if not including them
            if days_until_expiry < 0 and not include_expired:
                continue
            candidates.append((enrollment, effective_end, days_until_expiry))

    if not candidates:
        return []

    # Get all candidate IDs for batch queries
    candidate_ids = [e.id for e, _, _ in candidates]

    # Batch query 1: Get renewal enrollment details (for status tracking)
    renewal_enrollments_query = db.query(
        Enrollment.renewed_from_enrollment_id,
        Enrollment.id,
        Enrollment.fee_message_sent,
        Enrollment.payment_status,
        Enrollment.first_lesson_date,
        Enrollment.lessons_paid
    ).filter(
        Enrollment.renewed_from_enrollment_id.in_(candidate_ids),
        Enrollment.payment_status != "Cancelled"
    ).all()

    # Build map: original_enrollment_id -> renewal info
    renewal_info_map = {}
    for original_id, renewal_id, fee_sent, pay_status, first_lesson, lessons in renewal_enrollments_query:
        # Determine renewal status
        if pay_status == "Paid":
            status = "paid"
        elif fee_sent:
            status = "message_sent"
        else:
            status = "pending_message"
        renewal_info_map[original_id] = {
            "id": renewal_id,
            "status": status,
            "first_lesson_date": first_lesson,
            "lessons_paid": lessons,
            "payment_status": pay_status
        }

    renewed_ids = set(renewal_info_map.keys())

    # Batch query 2: Get all session counts grouped by enrollment (instead of N queries)
    session_counts_query = db.query(
        SessionLog.enrollment_id,
        func.count(SessionLog.id)
    ).filter(
        SessionLog.enrollment_id.in_(candidate_ids),
        SessionLog.session_date >= today,
        SessionLog.session_status == 'Scheduled'
    ).group_by(SessionLog.enrollment_id).all()
    session_counts_map = dict(session_counts_query)

    # Batch query 3: Find enrollments with same schedule (for legacy enrollments without FK)
    # Note: We don't filter by date here - the per-enrollment query will check first_lesson_date > effective_end
    newer_enrollment_subquery = (
        db.query(
            Enrollment.student_id,
            Enrollment.assigned_day,
            Enrollment.assigned_time,
            Enrollment.location
        )
        .filter(
            Enrollment.payment_status != "Cancelled"
        )
        .distinct()
        .all()
    )
    # Create a set for O(1) lookup
    newer_schedule_set = {(r.student_id, r.assigned_day, r.assigned_time, r.location) for r in newer_enrollment_subquery}

    # Build result using batch data
    result = []
    for enrollment, effective_end, days_until_expiry in candidates:
        # Check for legacy renewals (no FK link) by schedule match
        if enrollment.id not in renewal_info_map:
            schedule_key = (enrollment.student_id, enrollment.assigned_day, enrollment.assigned_time, enrollment.location)
            if schedule_key in newer_schedule_set:
                # Query the newer enrollment to get its status
                newer_enrollment = db.query(
                    Enrollment.id,
                    Enrollment.fee_message_sent,
                    Enrollment.payment_status,
                    Enrollment.first_lesson_date,
                    Enrollment.lessons_paid
                ).filter(
                    Enrollment.student_id == enrollment.student_id,
                    Enrollment.assigned_day == enrollment.assigned_day,
                    Enrollment.assigned_time == enrollment.assigned_time,
                    Enrollment.location == enrollment.location,
                    Enrollment.first_lesson_date > effective_end,
                    Enrollment.payment_status != "Cancelled",
                    Enrollment.id != enrollment.id
                ).first()

                if newer_enrollment:
                    # Add to renewal_info_map for status tracking
                    if newer_enrollment.payment_status == "Paid":
                        status = "paid"
                    elif newer_enrollment.fee_message_sent:
                        status = "message_sent"
                    else:
                        status = "pending_message"
                    renewal_info_map[enrollment.id] = {
                        "id": newer_enrollment.id,
                        "status": status,
                        "first_lesson_date": newer_enrollment.first_lesson_date,
                        "lessons_paid": newer_enrollment.lessons_paid,
                        "payment_status": newer_enrollment.payment_status
                    }

        # Get session count from batch data
        sessions_remaining = session_counts_map.get(enrollment.id, 0)

        # Get renewal status from batch data
        renewal_info = renewal_info_map.get(enrollment.id)

        # Skip paid renewals - they're complete and don't need attention
        if renewal_info and renewal_info["status"] == "paid":
            continue

        renewal_status = renewal_info["status"] if renewal_info else "not_renewed"
        renewal_enrollment_id = renewal_info["id"] if renewal_info else None

        result.append(RenewalListItem(
            id=enrollment.id,
            student_id=enrollment.student_id,
            student_name=enrollment.student.student_name if enrollment.student else "",
            school_student_id=enrollment.student.school_student_id if enrollment.student else None,
            grade=enrollment.student.grade if enrollment.student else None,
            lang_stream=enrollment.student.lang_stream if enrollment.student else None,
            school=enrollment.student.school if enrollment.student else None,
            tutor_id=enrollment.tutor_id,
            tutor_name=enrollment.tutor.tutor_name if enrollment.tutor else "",
            assigned_day=enrollment.assigned_day,
            assigned_time=enrollment.assigned_time,
            location=enrollment.location,
            first_lesson_date=enrollment.first_lesson_date,
            lessons_paid=enrollment.lessons_paid or 0,
            effective_end_date=effective_end,
            days_until_expiry=days_until_expiry,
            sessions_remaining=sessions_remaining,
            payment_status=enrollment.payment_status,
            renewal_status=renewal_status,
            renewal_enrollment_id=renewal_enrollment_id,
            renewal_first_lesson_date=renewal_info["first_lesson_date"] if renewal_info else None,
            renewal_lessons_paid=renewal_info["lessons_paid"] if renewal_info else None,
            renewal_payment_status=renewal_info["payment_status"] if renewal_info else None
        ))

    # Sort by days_until_expiry (most urgent first - negative values first for expired)
    result.sort(key=lambda x: x.days_until_expiry)

    return result


@router.get("/enrollments/renewal-counts", response_model=RenewalCountsResponse)
async def get_renewal_counts(
    location: Optional[str] = Query(None, description="Filter by location"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get counts of enrollments needing renewal for notification badge.

    Returns counts for:
    - expiring_soon: Expiring within 14 days
    - expired: Already expired but not renewed
    - total: Sum of both
    """
    today = date.today()
    two_weeks_ahead = today + timedelta(days=14)

    # Query active Regular enrollments
    query = (
        db.query(Enrollment)
        .filter(
            Enrollment.payment_status != "Cancelled",
            Enrollment.enrollment_type == "Regular",
            Enrollment.student_id.isnot(None),
            Enrollment.tutor_id.isnot(None),
            Enrollment.first_lesson_date.isnot(None)
        )
    )

    if location:
        query = query.filter(Enrollment.location == location)

    enrollments = query.all()

    # Load holidays once for bulk calculation
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    expiring_soon = 0
    expired = 0

    for enrollment in enrollments:
        effective_end = calculate_effective_end_date_bulk(enrollment, holidays)
        if not effective_end:
            continue

        days_until_expiry = (effective_end - today).days

        # Only count if expiring within 2 weeks or expired
        if days_until_expiry > 14:
            continue

        # Skip enrollments expired more than 30 days (likely orphaned)
        if days_until_expiry < -30:
            continue

        # Check if already renewed
        existing_renewal = db.query(Enrollment.id).filter(
            Enrollment.renewed_from_enrollment_id == enrollment.id,
            Enrollment.payment_status != "Cancelled"
        ).first()

        if existing_renewal:
            continue  # Already renewed, skip

        # Also check for newer enrollment with same schedule (for legacy enrollments)
        newer_enrollment = db.query(Enrollment.id).filter(
            Enrollment.student_id == enrollment.student_id,
            Enrollment.assigned_day == enrollment.assigned_day,
            Enrollment.assigned_time == enrollment.assigned_time,
            Enrollment.location == enrollment.location,
            Enrollment.first_lesson_date > effective_end,
            Enrollment.payment_status != "Cancelled",
            Enrollment.id != enrollment.id
        ).first()

        if newer_enrollment:
            continue  # Has newer enrollment with same schedule, skip

        if days_until_expiry < 0:
            expired += 1
        else:
            expiring_soon += 1

    return RenewalCountsResponse(
        expiring_soon=expiring_soon,
        expired=expired,
        total=expiring_soon + expired
    )


@router.get("/enrollments", response_model=List[EnrollmentResponse])
async def get_enrollments(
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    payment_status: Optional[str] = Query(None, description="Filter by payment status"),
    enrollment_type: Optional[str] = Query(None, description="Filter by enrollment type (Regular, Trial, One-Time)"),
    from_date: Optional[date] = Query(None, description="Filter by first_lesson_date >= this date"),
    to_date: Optional[date] = Query(None, description="Filter by first_lesson_date <= this date"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Get list of enrollments with optional filters.

    - **student_id**: Filter by specific student
    - **tutor_id**: Filter by specific tutor
    - **location**: Filter by location
    - **payment_status**: Filter by payment status (Paid, Pending Payment, Cancelled)
    - **enrollment_type**: Filter by enrollment type (Regular, Trial, One-Time)
    - **from_date**: Filter enrollments starting from this date
    - **to_date**: Filter enrollments up to this date
    - **limit**: Maximum number of results (default 100, max 500)
    - **offset**: Pagination offset (default 0)
    """
    query = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(
        # Exclude orphaned enrollments with NULL foreign keys
        Enrollment.student_id.isnot(None),
        Enrollment.tutor_id.isnot(None)
    )

    # Apply filters
    if student_id:
        query = query.filter(Enrollment.student_id == student_id)

    if tutor_id:
        query = query.filter(Enrollment.tutor_id == tutor_id)

    if location:
        query = query.filter(Enrollment.location == location)

    if payment_status:
        query = query.filter(Enrollment.payment_status == payment_status)

    if enrollment_type:
        query = query.filter(Enrollment.enrollment_type == enrollment_type)

    if from_date:
        query = query.filter(Enrollment.first_lesson_date >= from_date)

    if to_date:
        query = query.filter(Enrollment.first_lesson_date <= to_date)

    # Order by most recent first, with secondary sort by id for stable pagination
    query = query.order_by(Enrollment.first_lesson_date.desc(), Enrollment.id.desc())

    # Apply pagination
    enrollments = query.offset(offset).limit(limit).all()

    # Load holidays once for bulk calculation
    today = date.today()
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    # Build response with related data
    result = []
    for enrollment in enrollments:
        enrollment_data = EnrollmentResponse.model_validate(enrollment)
        enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
        enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
        enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
        enrollment_data.grade = enrollment.student.grade if enrollment.student else None
        enrollment_data.school = enrollment.student.school if enrollment.student else None
        enrollment_data.school_student_id = enrollment.student.school_student_id if enrollment.student else None
        enrollment_data.lang_stream = enrollment.student.lang_stream if enrollment.student else None
        enrollment_data.effective_end_date = calculate_effective_end_date_bulk(enrollment, holidays)
        result.append(enrollment_data)

    return result


@router.get("/enrollments/active", response_model=List[EnrollmentResponse])
async def get_active_enrollments(
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db)
):
    """
    Get active enrollments - latest enrollment per student that is still active.

    Logic: For each student, returns only their most recent enrollment based on first_lesson_date,
    excluding cancelled enrollments and those with effective_end_date < today.

    effective_end_date = first_lesson_date + (lessons_paid + deadline_extension_weeks) weeks

    - **location**: Filter by location (optional, omit for all locations)
    """
    today = date.today()

    # Pre-filter at SQL level: exclude enrollments that are definitely expired
    # Most enrollments have lessons_paid <= 52 weeks + 8 week extension max
    # This filters out ~60-80% of historical data before Python processing
    max_possible_weeks = 60  # Conservative upper bound
    cutoff_date = today - timedelta(weeks=max_possible_weeks)

    query = (
        db.query(Enrollment)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor),
            joinedload(Enrollment.discount)
        )
        .filter(
            Enrollment.payment_status != "Cancelled",
            Enrollment.enrollment_type == "Regular",
            Enrollment.student_id.isnot(None),
            Enrollment.tutor_id.isnot(None),
            # Pre-filter: only enrollments that could possibly still be active
            or_(
                Enrollment.first_lesson_date == None,  # Not started yet
                Enrollment.first_lesson_date >= cutoff_date  # Started within max window
            )
        )
    )

    # Apply location filter if provided
    if location:
        query = query.filter(Enrollment.location == location)

    # Fetch pre-filtered enrollments
    all_enrollments = query.all()

    # Load holidays once for bulk calculation
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    # Group by student_id and keep only the latest enrollment per student
    student_enrollments = defaultdict(list)
    for enrollment in all_enrollments:
        student_enrollments[enrollment.student_id].append(enrollment)

    # Keep only the most recent enrollment per student that is still active
    latest_enrollments = []
    for student_id, enrollments_list in student_enrollments.items():
        # Sort by first_lesson_date descending and take the first one
        latest = max(enrollments_list, key=lambda e: e.first_lesson_date or date.min)

        # Calculate effective_end_date (holiday-aware)
        if latest.first_lesson_date:
            effective_end_date = calculate_effective_end_date_bulk(latest, holidays)

            # Only include if still active (with grace period)
            if effective_end_date and effective_end_date >= today - timedelta(days=ACTIVE_GRACE_PERIOD_DAYS):
                latest_enrollments.append(latest)
        else:
            # No first_lesson_date - include it (enrollment hasn't started yet)
            latest_enrollments.append(latest)

    # Sort by student name for easier viewing
    latest_enrollments = sorted(latest_enrollments, key=lambda e: e.student.student_name if e.student else "")

    # Build response with related data
    result = []
    for enrollment in latest_enrollments:
        enrollment_data = EnrollmentResponse.model_validate(enrollment)
        enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
        enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
        enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
        enrollment_data.grade = enrollment.student.grade if enrollment.student else None
        enrollment_data.school = enrollment.student.school if enrollment.student else None
        enrollment_data.school_student_id = enrollment.student.school_student_id if enrollment.student else None
        enrollment_data.lang_stream = enrollment.student.lang_stream if enrollment.student else None
        enrollment_data.effective_end_date = calculate_effective_end_date_bulk(enrollment, holidays)
        result.append(enrollment_data)

    return result


@router.get("/enrollments/overdue", response_model=List[OverdueEnrollment])
async def get_overdue_enrollments(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Get overdue and upcoming enrollments with pending payment.

    Includes:
    - Overdue: payment_status = 'Pending Payment' AND first_lesson_date <= today
    - Due Soon: payment_status = 'Pending Payment' AND first_lesson_date within next 7 days

    Returns enrollments with calculated days_overdue (negative for upcoming).
    Sorted by days_overdue descending (most overdue first).

    - **location**: Filter by location (optional)
    - **tutor_id**: Filter by tutor ID (optional)
    """
    today = date.today()
    week_from_now = today + timedelta(days=7)

    query = (
        db.query(Enrollment)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor)
        )
        .filter(
            Enrollment.payment_status == "Pending Payment",
            Enrollment.first_lesson_date.isnot(None),
            Enrollment.first_lesson_date <= week_from_now,
            Enrollment.student_id.isnot(None)
        )
    )

    # Apply location filter if provided
    if location:
        query = query.filter(Enrollment.location == location)

    # Apply tutor filter if provided
    if tutor_id:
        query = query.filter(Enrollment.tutor_id == tutor_id)

    overdue_enrollments = query.all()

    # Build response with days_overdue calculation
    result = []
    for enrollment in overdue_enrollments:
        days_overdue = (today - enrollment.first_lesson_date).days

        result.append(OverdueEnrollment(
            id=enrollment.id,
            student_id=enrollment.student_id,
            student_name=enrollment.student.student_name if enrollment.student else "",
            school_student_id=enrollment.student.school_student_id if enrollment.student else None,
            grade=enrollment.student.grade if enrollment.student else None,
            lang_stream=enrollment.student.lang_stream if enrollment.student else None,
            school=enrollment.student.school if enrollment.student else None,
            tutor_id=enrollment.tutor_id,
            tutor_name=enrollment.tutor.tutor_name if enrollment.tutor else None,
            assigned_day=enrollment.assigned_day,
            assigned_time=enrollment.assigned_time,
            location=enrollment.location,
            first_lesson_date=enrollment.first_lesson_date,
            lessons_paid=enrollment.lessons_paid or 0,
            days_overdue=days_overdue
        ))

    # Sort by days_overdue descending (most overdue first)
    result.sort(key=lambda x: x.days_overdue, reverse=True)

    return result


@router.get("/enrollments/my-students", response_model=List[EnrollmentResponse])
async def get_my_students(
    tutor_id: int = Query(..., description="Filter by tutor ID (required)"),
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db)
):
    """
    Get "My Students" - active enrollments for a specific tutor.

    Returns the latest active enrollment per student for the given tutor.
    Filters applied:
    - tutor_id = specified tutor (required)
    - payment_status != "Cancelled"
    - Only latest enrollment per student (by first_lesson_date)
    - effective_end_date >= today (enrollment still active)

    effective_end_date = first_lesson_date + (lessons_paid + deadline_extension_weeks) weeks
    """
    today = date.today()

    # Pre-filter at SQL level: exclude enrollments that are definitely expired
    max_possible_weeks = 60  # Conservative upper bound
    cutoff_date = today - timedelta(weeks=max_possible_weeks)

    # Query enrollments for this tutor
    query = (
        db.query(Enrollment)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor),
            joinedload(Enrollment.discount)
        )
        .filter(
            Enrollment.tutor_id == tutor_id,
            Enrollment.payment_status != "Cancelled",
            Enrollment.enrollment_type == "Regular",
            Enrollment.student_id.isnot(None),
            # Pre-filter: only enrollments that could possibly still be active
            or_(
                Enrollment.first_lesson_date == None,
                Enrollment.first_lesson_date >= cutoff_date
            )
        )
    )

    # Apply location filter if provided
    if location:
        query = query.filter(Enrollment.location == location)

    all_enrollments = query.all()

    # Load holidays once for bulk calculation
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    # Group by student_id and keep only the latest enrollment per student
    student_enrollments = defaultdict(list)
    for enrollment in all_enrollments:
        student_enrollments[enrollment.student_id].append(enrollment)

    # Keep only the most recent enrollment per student that is still active
    active_enrollments = []
    for student_id, enrollments_list in student_enrollments.items():
        # Sort by first_lesson_date descending and take the first one
        latest = max(enrollments_list, key=lambda e: e.first_lesson_date or date.min)

        # Calculate effective_end_date (holiday-aware)
        if latest.first_lesson_date:
            effective_end_date = calculate_effective_end_date_bulk(latest, holidays)

            # Only include if still active (with grace period)
            if effective_end_date and effective_end_date >= today - timedelta(days=ACTIVE_GRACE_PERIOD_DAYS):
                active_enrollments.append(latest)
        else:
            # No first_lesson_date - include it (enrollment hasn't started yet)
            active_enrollments.append(latest)

    # Sort by student name for easier viewing
    active_enrollments = sorted(
        active_enrollments,
        key=lambda e: e.student.student_name if e.student else ""
    )

    # Build response with related data
    result = []
    for enrollment in active_enrollments:
        enrollment_data = EnrollmentResponse.model_validate(enrollment)
        enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
        enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
        enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
        enrollment_data.grade = enrollment.student.grade if enrollment.student else None
        enrollment_data.school = enrollment.student.school if enrollment.student else None
        enrollment_data.school_student_id = enrollment.student.school_student_id if enrollment.student else None
        enrollment_data.lang_stream = enrollment.student.lang_stream if enrollment.student else None
        enrollment_data.effective_end_date = calculate_effective_end_date_bulk(enrollment, holidays)
        result.append(enrollment_data)

    return result


# ============================================
# Trials Endpoints
# ============================================

@router.get("/enrollments/trials", response_model=List[TrialListItem])
async def get_trials(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID (for tutor-specific view)"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all trial enrollments with derived status for Kanban dashboard.

    Trial status is derived from:
    - scheduled: session_status='Trial Class' and date >= today
    - attended: session marked as attended (enrollment_type='Trial')
    - no_show: session marked as no show (enrollment_type='Trial')
    - converted: student has subsequent enrollment after trial
    - pending: attended but no subsequent enrollment yet
    """
    today = date.today()

    # Query trial enrollments with their sessions
    query = (
        db.query(Enrollment, SessionLog)
        .join(SessionLog, SessionLog.enrollment_id == Enrollment.id)
        .options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor)
        )
        .filter(
            Enrollment.enrollment_type == 'Trial',
            Enrollment.payment_status != 'Cancelled'
        )
    )

    if location:
        query = query.filter(Enrollment.location == location)

    if tutor_id:
        query = query.filter(Enrollment.tutor_id == tutor_id)

    results = query.all()

    if not results:
        return []

    # Get all student IDs for batch checking subsequent enrollments
    student_ids = set(e.student_id for e, _ in results)
    enrollment_ids = set(e.id for e, _ in results)

    # Batch query: Find subsequent enrollments for each student (after their trial)
    subsequent_enrollments = (
        db.query(
            Enrollment.student_id,
            Enrollment.id,
            Enrollment.first_lesson_date,
            Enrollment.renewed_from_enrollment_id
        )
        .filter(
            Enrollment.student_id.in_(student_ids),
            Enrollment.enrollment_type == 'Regular',
            Enrollment.payment_status != 'Cancelled'
        )
        .all()
    )

    # Build map: trial_enrollment_id -> subsequent enrollment info
    # Check both renewed_from_enrollment_id link and date-based
    subsequent_map = {}
    for student_id, subsequent_id, first_lesson, renewed_from in subsequent_enrollments:
        # If directly linked via renewed_from_enrollment_id
        if renewed_from in enrollment_ids:
            subsequent_map[renewed_from] = subsequent_id

    # Also check by date: find any regular enrollment after the trial for the same student
    trial_dates = {e.id: (e.student_id, e.first_lesson_date) for e, _ in results}
    for student_id, subsequent_id, first_lesson, _ in subsequent_enrollments:
        if first_lesson:
            for trial_id, (trial_student_id, trial_date) in trial_dates.items():
                if (trial_student_id == student_id and
                    trial_date and first_lesson > trial_date and
                    trial_id not in subsequent_map):
                    subsequent_map[trial_id] = subsequent_id

    # Build result items - deduplicate by enrollment (keep most relevant session)
    # Group sessions by enrollment_id (an enrollment may have multiple sessions if rescheduled)
    enrollment_sessions: dict[int, list[tuple[Enrollment, SessionLog]]] = {}
    for enrollment, session in results:
        if enrollment.id not in enrollment_sessions:
            enrollment_sessions[enrollment.id] = []
        enrollment_sessions[enrollment.id].append((enrollment, session))

    trial_items = []
    for enrollment_id, sessions in enrollment_sessions.items():
        # Pick the most relevant session:
        # 1. Attended session (if any) - shows trial outcome
        # 2. Scheduled session closest to today (if pending)
        # 3. Most recent session (fallback)
        attended = [s for _, s in sessions if s.session_status in ('Attended', 'Attended (Make-up)')]
        scheduled = [s for _, s in sessions if s.session_status == 'Trial Class']

        if attended:
            session = attended[0]
        elif scheduled:
            session = min(scheduled, key=lambda s: abs((s.session_date - today).days))
        else:
            session = max([s for _, s in sessions], key=lambda s: s.session_date)

        enrollment = sessions[0][0]  # Same enrollment object for all sessions

        # Derive trial status
        session_status = session.session_status
        subsequent_id = subsequent_map.get(enrollment.id)

        if subsequent_id:
            trial_status = 'converted'
        elif session_status == 'Trial Class':
            trial_status = 'scheduled'
        elif session_status in ('Attended', 'Attended (Make-up)'):
            trial_status = 'pending'  # Attended but not yet converted
        elif session_status == 'No Show':
            trial_status = 'no_show'
        else:
            # Other statuses (Rescheduled, Sick Leave, etc.) - treat as scheduled
            trial_status = 'scheduled'

        trial_items.append(TrialListItem(
            enrollment_id=enrollment.id,
            student_id=enrollment.student_id,
            student_name=enrollment.student.student_name if enrollment.student else "",
            school_student_id=enrollment.student.school_student_id if enrollment.student else None,
            grade=enrollment.student.grade if enrollment.student else None,
            lang_stream=enrollment.student.lang_stream if enrollment.student else None,
            school=enrollment.student.school if enrollment.student else None,
            tutor_id=enrollment.tutor_id,
            tutor_name=enrollment.tutor.tutor_name if enrollment.tutor else "",
            session_id=session.id,
            session_date=session.session_date,
            time_slot=session.time_slot or enrollment.assigned_time,
            location=enrollment.location,
            session_status=session_status,
            payment_status=enrollment.payment_status,
            trial_status=trial_status,
            subsequent_enrollment_id=subsequent_id,
            created_at=datetime.combine(session.session_date, datetime.min.time())
        ))

    # Sort by session date (most recent first for attended, soonest first for scheduled)
    trial_items.sort(key=lambda x: (
        0 if x.trial_status == 'scheduled' else 1,  # Scheduled first
        x.session_date if x.trial_status == 'scheduled' else -x.session_date.toordinal()
    ))

    return trial_items


@router.get("/enrollments/{enrollment_id}", response_model=EnrollmentResponse)
async def get_enrollment_detail(
    enrollment_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a specific enrollment.

    - **enrollment_id**: The enrollment's database ID
    """
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    enrollment_data = EnrollmentResponse.model_validate(enrollment)
    enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
    enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
    enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
    enrollment_data.grade = enrollment.student.grade if enrollment.student else None
    enrollment_data.school = enrollment.student.school if enrollment.student else None
    enrollment_data.school_student_id = enrollment.student.school_student_id if enrollment.student else None
    enrollment_data.lang_stream = enrollment.student.lang_stream if enrollment.student else None
    enrollment_data.effective_end_date = calculate_effective_end_date(enrollment, db)

    return enrollment_data


@router.get("/enrollments/{enrollment_id}/detail", response_model=EnrollmentDetailResponse)
async def get_enrollment_detail_for_modal(
    enrollment_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed enrollment information for the review modal before renewal.

    Returns comprehensive info including:
    - Basic enrollment info (student, tutor, schedule)
    - Date calculations (first lesson, effective end, days until expiry)
    - Session statistics (finished vs total)
    - Pending makeups with extension request status
    - Contact info (phone)
    """
    from models import ExtensionRequest

    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    # Calculate effective end date
    effective_end = calculate_effective_end_date(enrollment, db)
    today = date.today()
    days_until_expiry = (effective_end - today).days if effective_end else 0

    # Optimized: Use aggregation query for session counts instead of fetching all
    # Exclude: Cancelled, *Make-up Booked (has substitute Make-up Class)
    finished_statuses = ['Attended', 'Attended (Make-up)', 'Attended (Trial)', 'No Show']
    excluded_statuses = ['Cancelled', 'Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked',
                         'Weather Cancelled - Make-up Booked']

    # Single aggregation query for both counts
    from sqlalchemy import case
    session_stats = db.query(
        func.count(SessionLog.id).label('total'),
        func.sum(case((SessionLog.session_status.in_(finished_statuses), 1), else_=0)).label('finished')
    ).filter(
        SessionLog.enrollment_id == enrollment_id,
        SessionLog.session_status.notin_(excluded_statuses)
    ).first()

    sessions_total = session_stats.total or 0
    sessions_finished = session_stats.finished or 0

    # Get pending makeups (only fetch pending, not all sessions)
    pending_makeup_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]
    pending_sessions = db.query(SessionLog).options(
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.enrollment_id == enrollment_id,
        SessionLog.session_status.in_(pending_makeup_statuses)
    ).all()

    # Get extension requests for these sessions
    pending_session_ids = [s.id for s in pending_sessions]
    extension_requests = {}
    if pending_session_ids:
        ext_reqs = db.query(ExtensionRequest).filter(
            ExtensionRequest.session_id.in_(pending_session_ids)
        ).all()
        extension_requests = {er.session_id: er for er in ext_reqs}

    pending_makeups = [
        PendingMakeupSession(
            id=session.id,
            session_date=session.session_date,
            time_slot=session.time_slot,
            session_status=session.session_status,
            tutor_name=session.tutor.tutor_name if session.tutor else None,
            has_extension_request=session.id in extension_requests,
            extension_request_status=extension_requests[session.id].request_status if session.id in extension_requests else None
        )
        for session in pending_sessions
    ]

    return EnrollmentDetailResponse(
        id=enrollment.id,
        student_id=enrollment.student_id,
        student_name=enrollment.student.student_name if enrollment.student else "",
        school_student_id=enrollment.student.school_student_id if enrollment.student else None,
        grade=enrollment.student.grade if enrollment.student else None,
        lang_stream=enrollment.student.lang_stream if enrollment.student else None,
        school=enrollment.student.school if enrollment.student else None,
        home_location=enrollment.student.home_location if enrollment.student else None,
        tutor_id=enrollment.tutor_id,
        tutor_name=enrollment.tutor.tutor_name if enrollment.tutor else "",
        assigned_day=enrollment.assigned_day or "",
        assigned_time=enrollment.assigned_time or "",
        location=enrollment.location or "",
        first_lesson_date=enrollment.first_lesson_date,
        effective_end_date=effective_end,
        days_until_expiry=days_until_expiry,
        lessons_paid=enrollment.lessons_paid or 0,
        sessions_finished=sessions_finished,
        sessions_total=sessions_total,
        pending_makeups=pending_makeups,
        payment_status=enrollment.payment_status or "",
        phone=enrollment.student.phone if enrollment.student else None,
        fee_message_sent=enrollment.fee_message_sent or False
    )


@router.get("/enrollments/{enrollment_id}/fee-message")
async def get_fee_message(
    enrollment_id: int,
    lang: str = Query("zh", description="Language: 'zh' for Chinese, 'en' for English"),
    lessons_paid: int = Query(6, description="Number of lessons for renewal (default 6)"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a fee message for an enrollment renewal.

    Uses the existing enrollment's schedule to calculate renewal session dates
    and generate a formatted fee message ready to copy.
    """
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    # Calculate effective end date of current enrollment
    effective_end = calculate_effective_end_date(enrollment, db)

    # Use enrollment's first_lesson_date if set, otherwise calculate from effective_end
    if enrollment.first_lesson_date:
        first_lesson_date = enrollment.first_lesson_date
    else:
        # Calculate first lesson date for renewal (next occurrence of assigned_day after effective_end)
        day_map = {'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6}
        assigned_day_num = day_map.get(enrollment.assigned_day[:3], 0)  # Handle "Monday" or "Mon"
        current_day_num = effective_end.weekday() if effective_end else date.today().weekday()
        days_until_target = (assigned_day_num - current_day_num) % 7
        if days_until_target == 0:
            days_until_target = 7  # Move to next week if same day
        first_lesson_date = (effective_end if effective_end else date.today()) + timedelta(days=days_until_target)

    # Generate session dates
    sessions, _, _ = generate_session_dates(
        first_lesson_date=first_lesson_date,
        assigned_day=enrollment.assigned_day or "Mon",
        lessons_paid=lessons_paid,
        enrollment_type="Regular",
        db=db
    )

    # Get non-holiday session dates
    session_dates = [s.session_date for s in sessions if not s.is_holiday]

    # Check for student's available coupons first, then fall back to enrollment discount
    student_coupon = db.query(StudentCoupon).filter(
        StudentCoupon.student_id == enrollment.student_id
    ).first()

    if student_coupon and student_coupon.available_coupons and student_coupon.available_coupons > 0:
        # Use student's available coupon discount
        discount_value = int(student_coupon.coupon_value or 300)
    else:
        # Fall back to enrollment's discount (if any)
        discount_value = int(enrollment.discount.discount_value) if enrollment.discount and enrollment.discount.discount_value else 0

    # Format the fee message
    message = format_fee_message(
        lang=lang,
        school_student_id=enrollment.student.school_student_id if enrollment.student else "",
        student_name=enrollment.student.student_name if enrollment.student else "",
        assigned_day=enrollment.assigned_day or "",
        assigned_time=enrollment.assigned_time or "",
        location=enrollment.location or "",
        lessons_paid=lessons_paid,
        session_dates=session_dates,
        discount_value=discount_value
    )

    return {"message": message, "lessons_paid": lessons_paid, "first_lesson_date": str(first_lesson_date)}


def format_fee_message(
    lang: str,
    school_student_id: str,
    student_name: str,
    assigned_day: str,
    assigned_time: str,
    location: str,
    lessons_paid: int,
    session_dates: list,
    discount_value: int = 0
) -> str:
    """Format a fee message in Chinese or English."""
    day_map_zh = {'Mon': '一', 'Tue': '二', 'Wed': '三', 'Thu': '四', 'Fri': '五', 'Sat': '六', 'Sun': '日',
                  'Monday': '一', 'Tuesday': '二', 'Wednesday': '三', 'Thursday': '四',
                  'Friday': '五', 'Saturday': '六', 'Sunday': '日'}
    day_map_en = {'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday',
                  'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday',
                  'Monday': 'Monday', 'Tuesday': 'Tuesday', 'Wednesday': 'Wednesday',
                  'Thursday': 'Thursday', 'Friday': 'Friday', 'Saturday': 'Saturday', 'Sunday': 'Sunday'}
    location_map_zh = {'MSA': '華士古分校', 'MSB': '二龍喉分校'}
    location_map_en = {'MSA': 'Vasco Branch', 'MSB': 'Flora Garden Branch'}
    bank_map = {'MSA': '185000380468369', 'MSB': '185000010473304'}

    base_fee = 400 * lessons_paid
    discount_value = int(discount_value)  # Ensure no decimals
    total_fee = base_fee - discount_value
    lesson_dates_str = '\n                  '.join([d.strftime('%Y/%m/%d') for d in session_dates])

    if lang == 'zh':
        discount_text = f' (已折扣${discount_value}學費禮劵，原價為${base_fee})' if discount_value > 0 else ''
        closed_days = ' (星期二三公休)' if location == 'MSB' else ''

        return f"""家長您好，以下是 MathConcept中學教室 常規課程 之【繳費提示訊息】：

學生編號：{school_student_id}
學生姓名：{student_name}
上課時間：逢星期{day_map_zh.get(assigned_day, assigned_day)} {assigned_time} (90分鐘)
上課日期：
                  {lesson_dates_str}
                  (共{lessons_paid}堂)

費用： ${total_fee:,}{discount_text}

請於第一堂之前繳交學費。逾期繳費者，本中心將收取$200手續費，並保留權利拒絕學生上課。
家長可親臨中學教室({location_map_zh.get(location, location)}){closed_days} 以現金方式繳交學費，或選擇把學費存入以下戶口：

銀行：中國銀行
名稱：弘教數學教育中心
號碼：{bank_map.get(location, '')}
請於備註註明學生姓名及其編號，並發收條至中心微信號確認，謝謝

MathConcept 中學教室 ({location_map_zh.get(location, location)})"""

    else:  # English
        discount_text = f' (Discounted ${discount_value}, original price ${base_fee})' if discount_value > 0 else ''
        closed_days = ' (Closed Tue & Wed)' if location == 'MSB' else ''

        return f"""Dear Parent,

This is a payment reminder for MathConcept Secondary Academy regular course:

Student ID: {school_student_id}
Student Name: {student_name}
Schedule: Every {day_map_en.get(assigned_day, assigned_day)} {assigned_time} (90 minutes)
Lesson Dates:
                  {lesson_dates_str}
                  ({lessons_paid} lessons total)

Fee: ${total_fee:,}{discount_text}

Please pay before the first lesson. Late payment will incur a $200 administrative fee, and we reserve the right to refuse admission.

Payment options:
1. Cash payment at our center ({location_map_en.get(location, location)}){closed_days}
2. Bank transfer:
   Bank: Bank of China
   Account Name: 弘教數學教育中心
   Account Number: {bank_map.get(location, '')}
   Please include student name and ID in the transfer remarks, and send the receipt to our WeChat for confirmation.

Thank you!
MathConcept Secondary Academy ({location_map_en.get(location, location)})"""


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentResponse)
async def update_enrollment(
    enrollment_id: int,
    enrollment_update: EnrollmentUpdate,
    admin: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update an enrollment's information. Admin only."""
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    update_data = enrollment_update.model_dump(exclude_unset=True)

    # Check if payment_status is being changed to "Paid"
    updating_to_paid = (
        'payment_status' in update_data and
        update_data['payment_status'] == 'Paid' and
        enrollment.payment_status != 'Paid'
    )

    for field, value in update_data.items():
        setattr(enrollment, field, value)

    # If marking enrollment as paid, update all sessions' financial_status to Paid
    if updating_to_paid:
        enrollment.payment_date = date.today()
        db.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment_id
        ).update({'financial_status': 'Paid'})

    enrollment.last_modified_time = datetime.now()
    enrollment.last_modified_by = admin.user_email

    db.commit()
    # Re-query with joins to ensure relationships are loaded
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    # Manually set relationship fields (same as GET endpoint)
    enrollment_data = EnrollmentResponse.model_validate(enrollment)
    enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
    enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
    enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
    enrollment_data.grade = enrollment.student.grade if enrollment.student else None
    enrollment_data.school = enrollment.student.school if enrollment.student else None
    enrollment_data.school_student_id = enrollment.student.school_student_id if enrollment.student else None
    enrollment_data.lang_stream = enrollment.student.lang_stream if enrollment.student else None
    enrollment_data.effective_end_date = calculate_effective_end_date(enrollment, db)

    return enrollment_data


@router.patch("/enrollments/{enrollment_id}/extension", response_model=EnrollmentResponse)
async def update_enrollment_extension(
    enrollment_id: int,
    extension_update: EnrollmentExtensionUpdate,
    admin: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Update enrollment deadline extension. Admin only.

    This endpoint allows admins to directly set the deadline extension weeks
    with an audit trail. The extension_notes field is appended with each change.
    """
    from datetime import datetime

    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    # Build audit entry
    now = datetime.now()
    timestamp = now.strftime("%Y-%m-%d %H:%M")
    old_weeks = enrollment.deadline_extension_weeks or 0
    new_weeks = extension_update.deadline_extension_weeks

    audit_entry = f"[{timestamp}] {admin.user_email}: Set to {new_weeks} weeks (was {old_weeks})\nReason: {extension_update.reason}"

    # Append to existing notes or create new (append to match AppSheet behavior)
    if enrollment.extension_notes:
        enrollment.extension_notes = f"{enrollment.extension_notes}\n---\n{audit_entry}"
    else:
        enrollment.extension_notes = audit_entry

    # Update extension fields
    enrollment.deadline_extension_weeks = new_weeks
    enrollment.last_extension_date = now.date()
    enrollment.extension_granted_by = admin.user_email
    enrollment.last_modified_time = now
    enrollment.last_modified_by = admin.user_email

    db.commit()

    # Re-query with joins to ensure relationships are loaded
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount)
    ).filter(Enrollment.id == enrollment_id).first()

    # Build response
    enrollment_data = EnrollmentResponse.model_validate(enrollment)
    enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
    enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
    enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
    enrollment_data.grade = enrollment.student.grade if enrollment.student else None
    enrollment_data.school = enrollment.student.school if enrollment.student else None
    enrollment_data.school_student_id = enrollment.student.school_student_id if enrollment.student else None
    enrollment_data.lang_stream = enrollment.student.lang_stream if enrollment.student else None
    enrollment_data.effective_end_date = calculate_effective_end_date(enrollment, db)

    return enrollment_data


# ============================================
# Schedule Change Operations
# ============================================

# Statuses that cannot be changed (past or completed sessions)
UNCHANGEABLE_STATUSES = [
    'Attended',
    'Attended (Make-up)',
    'No Show',
    'Rescheduled - Pending Make-up',
    'Sick Leave - Pending Make-up',
    'Weather Cancelled - Pending Make-up',
    'Cancelled'
]


def get_day_of_week_number(day_name: str) -> int:
    """Convert day name to weekday number (0=Monday, 6=Sunday)"""
    days = {
        # Full names
        'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
        'Friday': 4, 'Saturday': 5, 'Sunday': 6,
        # Short names (used by the frontend)
        'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3,
        'Fri': 4, 'Sat': 5, 'Sun': 6
    }
    return days.get(day_name, 0)


def calculate_new_session_date(old_date: date, old_day: str, new_day: str) -> date:
    """Calculate new session date when changing assigned day.

    Finds the next occurrence of new_day that is in the same week or the following week.
    """
    old_weekday = get_day_of_week_number(old_day)
    new_weekday = get_day_of_week_number(new_day)

    # Calculate the difference in days
    day_diff = new_weekday - old_weekday

    # If new day is before old day in the week, move to next week
    if day_diff < 0:
        day_diff += 7

    return old_date + timedelta(days=day_diff)


@router.post("/enrollments/{enrollment_id}/schedule-change-preview", response_model=ScheduleChangePreviewResponse)
async def preview_schedule_change(
    enrollment_id: int,
    new_schedule: ScheduleChangeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Preview the impact of a schedule change on an enrollment.
    Shows which sessions can and cannot be changed.
    Admin only.
    """
    # Get enrollment with relationships
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    # Get new tutor info
    new_tutor = db.query(Tutor).filter(Tutor.id == new_schedule.tutor_id).first()
    if not new_tutor:
        raise HTTPException(status_code=404, detail=f"Tutor with ID {new_schedule.tutor_id} not found")

    # Build current schedule info
    current_schedule = {
        "assigned_day": enrollment.assigned_day,
        "assigned_time": enrollment.assigned_time,
        "location": enrollment.location,
        "tutor_id": enrollment.tutor_id,
        "tutor_name": enrollment.tutor.tutor_name if enrollment.tutor else "Unknown"
    }

    new_schedule_info = {
        "assigned_day": new_schedule.assigned_day,
        "assigned_time": new_schedule.assigned_time,
        "location": new_schedule.location,
        "tutor_id": new_schedule.tutor_id,
        "tutor_name": new_tutor.tutor_name
    }

    # Get all sessions for this enrollment
    sessions = db.query(SessionLog).options(
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.enrollment_id == enrollment_id
    ).order_by(SessionLog.session_date).all()

    unchangeable_sessions = []
    updatable_sessions = []
    warnings = []
    today = date.today()

    # Load holidays for next year
    end_range = today + timedelta(weeks=52)
    holidays = get_holidays_in_range(db, today, end_range)

    # Track used dates to avoid collisions when multiple sessions shift
    used_dates = set()

    for session in sessions:
        tutor_name = session.tutor.tutor_name if session.tutor else "Unknown"

        # Check if session can be changed
        is_past = session.session_date < today
        is_unchangeable_status = session.session_status in UNCHANGEABLE_STATUSES

        if is_past or is_unchangeable_status:
            reason = "Past date" if is_past else f"Status: {session.session_status}"
            unchangeable_sessions.append(UnchangeableSession(
                session_id=session.id,
                session_date=session.session_date,
                time_slot=session.time_slot,
                tutor_name=tutor_name,
                session_status=session.session_status,
                reason=reason
            ))
        else:
            # Calculate new date
            new_date = calculate_new_session_date(
                session.session_date,
                enrollment.assigned_day,
                new_schedule.assigned_day
            )

            # Check for holiday
            original_new_date = new_date
            is_holiday = new_date in holidays
            holiday_name = holidays.get(new_date)
            shifted_date = None
            collision_shift = False

            if is_holiday:
                # Auto-shift to next week
                shifted_date = new_date + timedelta(weeks=1)
                # Check if shifted date is also a holiday or already used
                while shifted_date in holidays or shifted_date in used_dates:
                    shifted_date += timedelta(weeks=1)
                warnings.append(f"Session on {new_date} falls on {holiday_name}, shifted to {shifted_date}")

            # Determine final date
            final_date = shifted_date if is_holiday else new_date

            # Check for collision with already-used dates (even if not a holiday)
            if final_date in used_dates:
                collision_shift = True
                original_final = final_date
                while final_date in used_dates or final_date in holidays:
                    final_date += timedelta(weeks=1)
                if is_holiday:
                    shifted_date = final_date
                else:
                    shifted_date = final_date
                    is_holiday = True  # Mark as shifted for display
                    holiday_name = "collision with previous session"
                warnings.append(f"Session shifted from {original_final} to {final_date} to avoid collision")

            # Track this date as used
            used_dates.add(final_date)

            updatable_sessions.append(UpdatableSession(
                session_id=session.id,
                current_date=session.session_date,
                current_time_slot=session.time_slot,
                current_tutor_name=tutor_name,
                new_date=original_new_date,  # Original calculated date (for strikethrough display)
                new_time_slot=new_schedule.assigned_time,
                new_tutor_name=new_tutor.tutor_name,
                is_holiday=is_holiday,
                holiday_name=holiday_name,
                shifted_date=final_date if (is_holiday or collision_shift) else None  # Actual final date after shifting
            ))

    # Check for conflicts with new schedule
    conflicts = []
    if updatable_sessions:
        new_dates = [s.new_date for s in updatable_sessions]
        conflicts = check_student_conflicts(
            db,
            enrollment.student_id,
            new_dates,
            new_schedule.assigned_time,
            exclude_enrollment_id=enrollment_id
        )

    can_apply = len(conflicts) == 0

    if conflicts:
        warnings.append(f"{len(conflicts)} conflict(s) detected with new schedule")

    return ScheduleChangePreviewResponse(
        enrollment_id=enrollment_id,
        current_schedule=current_schedule,
        new_schedule=new_schedule_info,
        unchangeable_sessions=unchangeable_sessions,
        updatable_sessions=updatable_sessions,
        conflicts=conflicts,
        warnings=warnings,
        can_apply=can_apply
    )


@router.patch("/enrollments/{enrollment_id}/apply-schedule-change", response_model=ScheduleChangeResult)
async def apply_schedule_change(
    enrollment_id: int,
    changes: ApplyScheduleChangeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Apply a schedule change to an enrollment and optionally update future sessions.
    Admin only.
    """
    # Get enrollment
    enrollment = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor)
    ).filter(Enrollment.id == enrollment_id).first()

    if not enrollment:
        raise HTTPException(status_code=404, detail=f"Enrollment with ID {enrollment_id} not found")

    # Verify new tutor exists
    new_tutor = db.query(Tutor).filter(Tutor.id == changes.tutor_id).first()
    if not new_tutor:
        raise HTTPException(status_code=404, detail=f"Tutor with ID {changes.tutor_id} not found")

    old_day = enrollment.assigned_day
    old_time = enrollment.assigned_time
    old_tutor_id = enrollment.tutor_id

    # Update enrollment record
    enrollment.assigned_day = changes.assigned_day
    enrollment.assigned_time = changes.assigned_time
    enrollment.location = changes.location
    enrollment.tutor_id = changes.tutor_id
    enrollment.last_modified_time = datetime.now()
    enrollment.last_modified_by = current_user.user_email

    sessions_updated = 0

    if changes.apply_to_sessions:
        today = date.today()

        # Load holidays for next year
        end_range = today + timedelta(weeks=52)
        holidays = get_holidays_in_range(db, today, end_range)

        # Get updatable sessions (future, scheduled status), ordered by date
        sessions = db.query(SessionLog).filter(
            SessionLog.enrollment_id == enrollment_id,
            SessionLog.session_date >= today,
            ~SessionLog.session_status.in_(UNCHANGEABLE_STATUSES)
        ).order_by(SessionLog.session_date).all()

        # Track used dates to avoid collisions when multiple sessions shift
        used_dates = set()

        for session in sessions:
            # Check for manual date override first
            if changes.date_overrides and session.id in changes.date_overrides:
                new_date = date.fromisoformat(changes.date_overrides[session.id])
            else:
                # Calculate new date
                new_date = calculate_new_session_date(
                    session.session_date,
                    old_day,
                    changes.assigned_day
                )

                # Handle holiday shifts and collision avoidance
                while new_date in holidays or new_date in used_dates:
                    new_date += timedelta(weeks=1)

            # Track this date as used
            used_dates.add(new_date)

            # Update session
            session.session_date = new_date
            # Handle time override
            if changes.time_overrides and session.id in changes.time_overrides:
                session.time_slot = changes.time_overrides[session.id]
            else:
                session.time_slot = changes.assigned_time
            session.location = changes.location
            session.tutor_id = changes.tutor_id
            session.last_modified_time = datetime.now()

            sessions_updated += 1

    db.commit()

    # Recalculate effective end date
    new_effective_end = calculate_effective_end_date(enrollment, db)

    message = f"Schedule updated"
    if sessions_updated > 0:
        message += f", {sessions_updated} session(s) updated"
    else:
        message += " (no sessions changed)"

    return ScheduleChangeResult(
        enrollment_id=enrollment_id,
        sessions_updated=sessions_updated,
        new_effective_end_date=new_effective_end,
        message=message
    )


# ============================================
# Cancel Enrollment
# ============================================

@router.patch("/enrollments/{enrollment_id}/cancel")
async def cancel_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Cancel an enrollment and all its sessions.

    Only allowed if no sessions have been attended (to preserve payment obligation).
    Sets payment_status to 'Cancelled' and cancels all remaining sessions.
    """
    enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    # Check for attended sessions - cannot cancel if any exist
    ATTENDED_STATUSES = ['Attended', 'Attended (Make-up)']
    attended_count = db.query(SessionLog).filter(
        SessionLog.enrollment_id == enrollment_id,
        SessionLog.session_status.in_(ATTENDED_STATUSES)
    ).count()

    if attended_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel enrollment with attended sessions"
        )

    # Update payment_status to Cancelled
    enrollment.payment_status = "Cancelled"
    enrollment.last_modified_time = datetime.now()
    enrollment.last_modified_by = current_user.user_email

    # Cancel all remaining sessions
    cancelled_count = db.query(SessionLog).filter(
        SessionLog.enrollment_id == enrollment_id,
        SessionLog.session_status != 'Cancelled'
    ).update({'session_status': 'Cancelled'}, synchronize_session=False)

    db.commit()
    db.refresh(enrollment)

    return {"enrollment": enrollment, "sessions_cancelled": cancelled_count}


# ============================================
# Batch Operations
# ============================================

@router.post("/enrollments/batch-mark-paid", response_model=BatchOperationResponse)
async def batch_mark_paid(
    request: BatchEnrollmentRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin)
):
    """
    Mark multiple enrollments as paid.
    Also updates all associated sessions' financial_status to 'Paid'.
    Admin only.
    """
    updated = []
    for eid in request.enrollment_ids:
        enrollment = db.query(Enrollment).filter(Enrollment.id == eid).first()
        if enrollment and enrollment.payment_status != 'Paid':
            enrollment.payment_status = 'Paid'
            enrollment.payment_date = date.today()
            enrollment.last_modified_time = datetime.now()
            enrollment.last_modified_by = current_user.user_email
            # Also update sessions' financial_status
            db.query(SessionLog).filter(
                SessionLog.enrollment_id == eid
            ).update({'financial_status': 'Paid'})
            updated.append(eid)

    db.commit()
    return BatchOperationResponse(updated=updated, count=len(updated))


@router.post("/enrollments/batch-mark-sent", response_model=BatchOperationResponse)
async def batch_mark_sent(
    request: BatchEnrollmentRequest,
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(require_admin)
):
    """
    Mark fee message as sent for multiple enrollments.
    Admin only.
    """
    updated = []
    for eid in request.enrollment_ids:
        enrollment = db.query(Enrollment).filter(Enrollment.id == eid).first()
        if enrollment and not enrollment.fee_message_sent:
            enrollment.fee_message_sent = True
            enrollment.last_modified_time = datetime.now()
            enrollment.last_modified_by = current_user.user_email
            updated.append(eid)

    db.commit()
    return BatchOperationResponse(updated=updated, count=len(updated))


@router.post("/enrollments/batch-renew-check", response_model=BatchRenewCheckResponse)
async def batch_renew_check(
    request: BatchEnrollmentRequest,
    admin: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Check eligibility for batch renewal of multiple enrollments.

    Returns lists of eligible and ineligible enrollments with reasons:
    - pending_makeups: Has pending makeup sessions
    - conflicts: Generated sessions would conflict with existing sessions
    - extension_pending: Has pending extension request

    Admin only.
    """
    from models import ExtensionRequest

    eligible = []
    ineligible = []

    # Day name to weekday mapping
    day_name_to_weekday = {
        'Monday': 0, 'Mon': 0,
        'Tuesday': 1, 'Tue': 1,
        'Wednesday': 2, 'Wed': 2,
        'Thursday': 3, 'Thu': 3,
        'Friday': 4, 'Fri': 4,
        'Saturday': 5, 'Sat': 5,
        'Sunday': 6, 'Sun': 6
    }

    # Pending makeup statuses
    pending_makeup_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]

    # Load holidays once for bulk calculation
    today = date.today()
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    for eid in request.enrollment_ids:
        enrollment = db.query(Enrollment).options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor)
        ).filter(Enrollment.id == eid).first()

        if not enrollment:
            continue

        # Extract student info for display
        student = enrollment.student
        student_name = student.student_name if student else "Unknown"
        student_info = {
            "student_id": student.id if student else None,
            "school_student_id": student.school_student_id if student else None,
            "grade": student.grade if student else None,
            "lang_stream": student.lang_stream if student else None,
            "school": student.school if student else None,
        }

        # Calculate schedule info upfront (for all results including ineligible)
        effective_end = calculate_effective_end_date_bulk(enrollment, holidays)
        suggested_date = None
        if effective_end:
            assigned_weekday = day_name_to_weekday.get(enrollment.assigned_day)
            if assigned_weekday is not None:
                suggested_date = effective_end + timedelta(days=1)
                while suggested_date.weekday() != assigned_weekday:
                    suggested_date += timedelta(days=1)

        schedule_info = {
            "assigned_day": enrollment.assigned_day,
            "assigned_time": enrollment.assigned_time,
            "suggested_first_lesson_date": suggested_date,
        }

        # Check 1: Pending makeups (overridable)
        pending_sessions = db.query(SessionLog).filter(
            SessionLog.enrollment_id == eid,
            SessionLog.session_status.in_(pending_makeup_statuses)
        ).all()

        if pending_sessions:
            ineligible.append(EligibilityResult(
                enrollment_id=eid,
                eligible=False,
                reason="pending_makeups",
                student_name=student_name,
                details=f"{len(pending_sessions)} pending makeup(s)",
                overridable=True,
                **student_info,
                **schedule_info
            ))
            continue

        # Check 2: Pending extension requests (overridable)
        session_ids = db.query(SessionLog.id).filter(
            SessionLog.enrollment_id == eid
        ).all()
        session_id_list = [s.id for s in session_ids]

        if session_id_list:
            pending_extensions = db.query(ExtensionRequest).filter(
                ExtensionRequest.session_id.in_(session_id_list),
                ExtensionRequest.request_status == 'pending'
            ).count()

            if pending_extensions > 0:
                ineligible.append(EligibilityResult(
                    enrollment_id=eid,
                    eligible=False,
                    reason="extension_pending",
                    student_name=student_name,
                    details=f"{pending_extensions} pending extension request(s)",
                    overridable=True,
                    **student_info,
                    **schedule_info
                ))
                continue

        # Check 3: Invalid data (not overridable)
        if not effective_end:
            ineligible.append(EligibilityResult(
                enrollment_id=eid,
                eligible=False,
                reason="invalid_data",
                student_name=student_name,
                details="Cannot calculate renewal date",
                overridable=False,
                **student_info,
                **schedule_info
            ))
            continue

        if day_name_to_weekday.get(enrollment.assigned_day) is None:
            ineligible.append(EligibilityResult(
                enrollment_id=eid,
                eligible=False,
                reason="invalid_data",
                student_name=student_name,
                details=f"Invalid assigned day: {enrollment.assigned_day}",
                overridable=False,
                **student_info,
                **schedule_info
            ))
            continue

        # Check 4: Conflicts on generated dates (not overridable)
        sessions, _, _ = generate_session_dates(
            first_lesson_date=suggested_date,
            assigned_day=enrollment.assigned_day,
            lessons_paid=6,
            enrollment_type='Regular',
            db=db
        )

        non_holiday_dates = [s.session_date for s in sessions if not s.is_holiday]
        conflicts = check_student_conflicts(
            db=db,
            student_id=enrollment.student_id,
            session_dates=non_holiday_dates,
            time_slot=enrollment.assigned_time
        )

        if conflicts:
            conflict_dates = [str(c.session_date) for c in conflicts[:3]]
            details = f"Conflicts on: {', '.join(conflict_dates)}"
            if len(conflicts) > 3:
                details += f" (+{len(conflicts) - 3} more)"
            ineligible.append(EligibilityResult(
                enrollment_id=eid,
                eligible=False,
                reason="conflicts",
                student_name=student_name,
                details=details,
                overridable=False,
                **student_info,
                **schedule_info
            ))
            continue

        # All checks passed
        eligible.append(EligibilityResult(
            enrollment_id=eid,
            eligible=True,
            reason=None,
            student_name=student_name,
            details=None,
            overridable=False,
            **student_info,
            **schedule_info
        ))

    return BatchRenewCheckResponse(eligible=eligible, ineligible=ineligible)


@router.post("/enrollments/batch-renew", response_model=BatchRenewResponse)
async def batch_renew(
    request: BatchRenewRequest,
    admin: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Create renewal enrollments for multiple enrollments at once.

    Uses the same schedule (day, time, location) and tutor from original enrollment.
    Generates sessions with conflict checking.

    Admin only.
    """
    # Day name to weekday mapping
    day_name_to_weekday = {
        'Monday': 0, 'Mon': 0,
        'Tuesday': 1, 'Tue': 1,
        'Wednesday': 2, 'Wed': 2,
        'Thursday': 3, 'Thu': 3,
        'Friday': 4, 'Fri': 4,
        'Saturday': 5, 'Sat': 5,
        'Sunday': 6, 'Sun': 6
    }

    results = []
    created_count = 0
    failed_count = 0

    # Load holidays once for bulk calculation
    today = date.today()
    holidays = get_holidays_in_range(db, today - timedelta(weeks=52), today + timedelta(weeks=104))

    for eid in request.enrollment_ids:
        # Get original enrollment
        enrollment = db.query(Enrollment).options(
            joinedload(Enrollment.student),
            joinedload(Enrollment.tutor)
        ).filter(Enrollment.id == eid).first()

        if not enrollment:
            results.append(BatchRenewResult(
                original_enrollment_id=eid,
                new_enrollment_id=None,
                success=False,
                error="Enrollment not found"
            ))
            failed_count += 1
            continue

        # Calculate renewal first lesson date
        effective_end = calculate_effective_end_date_bulk(enrollment, holidays)
        if not effective_end:
            results.append(BatchRenewResult(
                original_enrollment_id=eid,
                new_enrollment_id=None,
                success=False,
                error="Cannot calculate renewal date"
            ))
            failed_count += 1
            continue

        assigned_weekday = day_name_to_weekday.get(enrollment.assigned_day)
        if assigned_weekday is None:
            results.append(BatchRenewResult(
                original_enrollment_id=eid,
                new_enrollment_id=None,
                success=False,
                error=f"Invalid assigned day: {enrollment.assigned_day}"
            ))
            failed_count += 1
            continue

        # Find next occurrence of the assigned day after effective_end
        first_lesson_date = effective_end + timedelta(days=1)
        while first_lesson_date.weekday() != assigned_weekday:
            first_lesson_date += timedelta(days=1)

        # Generate session dates
        sessions, _, _ = generate_session_dates(
            first_lesson_date=first_lesson_date,
            assigned_day=enrollment.assigned_day,
            lessons_paid=request.lessons_paid,
            enrollment_type='Regular',
            db=db
        )

        # Check for conflicts
        non_holiday_dates = [s.session_date for s in sessions if not s.is_holiday]
        conflicts = check_student_conflicts(
            db=db,
            student_id=enrollment.student_id,
            session_dates=non_holiday_dates,
            time_slot=enrollment.assigned_time
        )

        if conflicts:
            results.append(BatchRenewResult(
                original_enrollment_id=eid,
                new_enrollment_id=None,
                success=False,
                error=f"Conflicts detected on {len(conflicts)} date(s)"
            ))
            failed_count += 1
            continue

        # Create the new enrollment
        new_enrollment = Enrollment(
            student_id=enrollment.student_id,
            tutor_id=enrollment.tutor_id,
            assigned_day=enrollment.assigned_day,
            assigned_time=enrollment.assigned_time,
            location=enrollment.location,
            first_lesson_date=first_lesson_date,
            lessons_paid=request.lessons_paid,
            enrollment_type='Regular',
            payment_status='Pending Payment',
            discount_id=enrollment.discount_id,
            renewed_from_enrollment_id=eid,
            last_modified_time=datetime.now(),
            last_modified_by=admin.user_email
        )
        db.add(new_enrollment)
        db.flush()  # Get enrollment ID

        # Create sessions
        for session_preview in sessions:
            if session_preview.is_holiday:
                continue

            session = SessionLog(
                enrollment_id=new_enrollment.id,
                student_id=enrollment.student_id,
                tutor_id=enrollment.tutor_id,
                session_date=session_preview.session_date,
                time_slot=enrollment.assigned_time,
                location=enrollment.location,
                session_status='Scheduled',
                financial_status='Unpaid',
                last_modified_by=admin.user_email
            )
            db.add(session)

        results.append(BatchRenewResult(
            original_enrollment_id=eid,
            new_enrollment_id=new_enrollment.id,
            success=True,
            error=None
        ))
        created_count += 1

    db.commit()

    return BatchRenewResponse(
        results=results,
        created_count=created_count,
        failed_count=failed_count
    )