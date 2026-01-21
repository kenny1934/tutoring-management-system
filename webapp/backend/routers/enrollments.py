"""
Enrollments API endpoints.
Provides read-only access to enrollment data with filtering.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, select
from typing import List, Optional
from datetime import date, timedelta
from collections import defaultdict
from database import get_db
from models import Enrollment, Student, Tutor, Discount
from schemas import EnrollmentResponse, EnrollmentUpdate, OverdueEnrollment

router = APIRouter()


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

    return enrollment_data


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentResponse)
async def update_enrollment(
    enrollment_id: int,
    enrollment_update: EnrollmentUpdate,
    db: Session = Depends(get_db)
):
    """Update an enrollment's information."""
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

    return enrollment_data