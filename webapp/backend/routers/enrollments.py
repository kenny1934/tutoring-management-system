"""
Enrollments API endpoints.
Provides CRUD access to enrollment data with filtering and session generation.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, select
from typing import List, Optional
from datetime import date, timedelta
from collections import defaultdict
from database import get_db
from models import Enrollment, Student, Tutor, Discount, Holiday, SessionLog
from schemas import (
    EnrollmentResponse, EnrollmentUpdate, EnrollmentExtensionUpdate, OverdueEnrollment,
    EnrollmentCreate, SessionPreview, StudentConflict, EnrollmentPreviewResponse,
    RenewalDataResponse, RenewalListItem, RenewalCountsResponse,
    EnrollmentDetailResponse, PendingMakeupSession
)
from auth.dependencies import require_admin, get_current_user

router = APIRouter()


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
                'date': current_date,
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


def calculate_effective_end_date(enrollment: Enrollment) -> Optional[date]:
    """Calculate effective end date based on first lesson + lessons paid + extensions.

    Formula: first_lesson_date + (lessons_paid + deadline_extension_weeks) weeks
    """
    if not enrollment.first_lesson_date:
        return None

    weeks_paid = enrollment.lessons_paid or 0
    extension_weeks = enrollment.deadline_extension_weeks or 0
    total_weeks = weeks_paid + extension_weeks

    return enrollment.first_lesson_date + timedelta(weeks=total_weeks)


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

    return EnrollmentPreviewResponse(
        enrollment_data=enrollment_data,
        sessions=sessions,
        effective_end_date=effective_end_date,
        conflicts=conflicts,
        warnings=warnings,
        skipped_holidays=skipped_holidays
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
        renewed_from_enrollment_id=enrollment_data.renewed_from_enrollment_id
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
    effective_end = calculate_effective_end_date(enrollment)
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

    # Filter by effective_end_date and check for existing renewals
    result = []
    for enrollment in enrollments:
        effective_end = calculate_effective_end_date(enrollment)
        if not effective_end:
            continue

        days_until_expiry = (effective_end - today).days

        # Include if expiring within 2 weeks or already expired
        if days_until_expiry <= 14:
            # Skip expired if not including them
            if days_until_expiry < 0 and not include_expired:
                continue

            # Check if already renewed (has a renewal enrollment with renewed_from_enrollment_id = this)
            existing_renewal = db.query(Enrollment.id).filter(
                Enrollment.renewed_from_enrollment_id == enrollment.id,
                Enrollment.payment_status != "Cancelled"
            ).first()

            if existing_renewal:
                continue  # Already renewed, skip

            # Also check for newer enrollment with same schedule (for legacy enrollments without renewed_from_enrollment_id)
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

            # Count sessions remaining (scheduled sessions with date >= today)
            sessions_remaining = db.query(func.count(SessionLog.id)).filter(
                SessionLog.enrollment_id == enrollment.id,
                SessionLog.session_date >= today,
                SessionLog.session_status == 'Scheduled'
            ).scalar() or 0

            result.append(RenewalListItem(
                id=enrollment.id,
                student_id=enrollment.student_id,
                student_name=enrollment.student.student_name if enrollment.student else "",
                school_student_id=enrollment.student.school_student_id if enrollment.student else None,
                grade=enrollment.student.grade if enrollment.student else None,
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
                payment_status=enrollment.payment_status
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

    expiring_soon = 0
    expired = 0

    for enrollment in enrollments:
        effective_end = calculate_effective_end_date(enrollment)
        if not effective_end:
            continue

        days_until_expiry = (effective_end - today).days

        # Only count if expiring within 2 weeks or expired
        if days_until_expiry > 14:
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
        enrollment_data.effective_end_date = calculate_effective_end_date(enrollment)
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

    # Group by student_id and keep only the latest enrollment per student
    student_enrollments = defaultdict(list)
    for enrollment in all_enrollments:
        student_enrollments[enrollment.student_id].append(enrollment)

    # Keep only the most recent enrollment per student that is still active
    latest_enrollments = []
    for student_id, enrollments_list in student_enrollments.items():
        # Sort by first_lesson_date descending and take the first one
        latest = max(enrollments_list, key=lambda e: e.first_lesson_date or date.min)

        # Calculate effective_end_date
        if latest.first_lesson_date:
            weeks_paid = latest.lessons_paid or 0
            extension = latest.deadline_extension_weeks or 0
            total_weeks = weeks_paid + extension
            effective_end_date = latest.first_lesson_date + timedelta(weeks=total_weeks)

            # Only include if still active
            if effective_end_date >= today:
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
        enrollment_data.effective_end_date = calculate_effective_end_date(enrollment)
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

    # Group by student_id and keep only the latest enrollment per student
    student_enrollments = defaultdict(list)
    for enrollment in all_enrollments:
        student_enrollments[enrollment.student_id].append(enrollment)

    # Keep only the most recent enrollment per student that is still active
    active_enrollments = []
    for student_id, enrollments_list in student_enrollments.items():
        # Sort by first_lesson_date descending and take the first one
        latest = max(enrollments_list, key=lambda e: e.first_lesson_date or date.min)

        # Calculate effective_end_date
        if latest.first_lesson_date:
            weeks_paid = latest.lessons_paid or 0
            extension = latest.deadline_extension_weeks or 0
            total_weeks = weeks_paid + extension
            effective_end_date = latest.first_lesson_date + timedelta(weeks=total_weeks)

            # Only include if still active
            if effective_end_date >= today:
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
        enrollment_data.effective_end_date = calculate_effective_end_date(enrollment)
        result.append(enrollment_data)

    return result


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
    enrollment_data.effective_end_date = calculate_effective_end_date(enrollment)

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
    effective_end = calculate_effective_end_date(enrollment)
    today = date.today()
    days_until_expiry = (effective_end - today).days if effective_end else 0

    # Get all sessions for this enrollment
    all_sessions = db.query(SessionLog).options(
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.enrollment_id == enrollment_id
    ).all()

    # Count sessions with proper logic:
    # - Exclude: Cancelled, *Make-up Booked (has substitute Make-up Class)
    # - Finished: Attended, Attended (Make-up), Attended (Trial), No Show
    sessions_total = 0
    sessions_finished = 0
    finished_statuses = ['Attended', 'Attended (Make-up)', 'Attended (Trial)', 'No Show']

    for session in all_sessions:
        status = session.session_status or ""
        # Exclude Cancelled
        if status == 'Cancelled':
            continue
        # Exclude *Make-up Booked (has substitute session)
        if 'Make-up Booked' in status:
            continue

        sessions_total += 1
        if status in finished_statuses:
            sessions_finished += 1

    # Get pending makeups (sessions with pending make-up statuses)
    pending_makeup_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]
    pending_sessions = [s for s in all_sessions if s.session_status in pending_makeup_statuses]

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
        phone=enrollment.student.phone if enrollment.student else None
    )


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
    for field, value in update_data.items():
        setattr(enrollment, field, value)

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
    enrollment_data.effective_end_date = calculate_effective_end_date(enrollment)

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
    enrollment_data.effective_end_date = calculate_effective_end_date(enrollment)

    return enrollment_data