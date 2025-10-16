"""
Enrollments API endpoints.
Provides read-only access to enrollment data with filtering.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import date
from database import get_db
from models import Enrollment, Student, Tutor, Discount
from schemas import EnrollmentResponse

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

    # Order by most recent first
    query = query.order_by(Enrollment.first_lesson_date.desc())

    # Apply pagination
    enrollments = query.offset(offset).limit(limit).all()

    # Build response with related data
    result = []
    for enrollment in enrollments:
        enrollment_data = EnrollmentResponse.model_validate(enrollment)
        enrollment_data.student_name = enrollment.student.student_name if enrollment.student else None
        enrollment_data.tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
        enrollment_data.discount_name = enrollment.discount.discount_name if enrollment.discount else None
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

    return enrollment_data
