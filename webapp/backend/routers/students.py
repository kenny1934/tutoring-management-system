"""
Students API endpoints.
Provides read-only access to student data.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, select
from typing import List, Optional
from database import get_db
from models import Student, Enrollment, Tutor
from schemas import StudentResponse, StudentDetailResponse, StudentUpdate
from auth.dependencies import require_admin

router = APIRouter()


@router.get("/students/schools", response_model=List[str])
async def get_unique_schools(response: Response, db: Session = Depends(get_db)):
    """Get list of all unique school names for autocomplete."""
    response.headers["Cache-Control"] = "private, max-age=300"
    schools = db.query(Student.school).filter(Student.school.isnot(None)).distinct().all()
    return sorted([s[0] for s in schools if s[0]])


@router.get("/students", response_model=List[StudentResponse])
async def get_students(
    search: Optional[str] = Query(None, description="Search by student name or ID"),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    school: Optional[str] = Query(None, description="Filter by school"),
    location: Optional[str] = Query(None, description="Filter by home location"),
    academic_stream: Optional[str] = Query(None, description="Filter by academic stream (Science/Arts)"),
    sort_by: Optional[str] = Query(None, description="Sort field: id, name, school, grade"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Get list of all students with optional filters.

    - **search**: Search by student name or school_student_id
    - **grade**: Filter by grade (e.g., 'P6', 'F1', 'F2')
    - **school**: Filter by school name
    - **location**: Filter by home location
    - **academic_stream**: Filter by academic stream for F4-F6 students
    - **sort_by**: Sort field (id, name, school, grade)
    - **sort_order**: Sort order (asc or desc, default desc)
    - **limit**: Maximum number of results (default 100, max 500)
    - **offset**: Pagination offset (default 0)
    """
    # Create subquery to count enrollments efficiently
    enrollment_count_subq = (
        select(
            Enrollment.student_id,
            func.count(Enrollment.id).label("enrollment_count")
        )
        .group_by(Enrollment.student_id)
        .subquery()
    )

    # Main query with left join to get enrollment counts
    query = (
        db.query(
            Student,
            func.coalesce(enrollment_count_subq.c.enrollment_count, 0).label("enrollment_count")
        )
        .outerjoin(enrollment_count_subq, Student.id == enrollment_count_subq.c.student_id)
    )

    # Apply filters
    if search:
        query = query.filter(
            (Student.student_name.ilike(f"%{search}%")) |
            (Student.school_student_id.ilike(f"%{search}%"))
        )

    if grade:
        query = query.filter(Student.grade == grade)

    if school:
        query = query.filter(Student.school == school)

    if location:
        query = query.filter(Student.home_location == location)

    if academic_stream:
        query = query.filter(Student.academic_stream == academic_stream)

    # Apply sorting
    sort_columns = {
        "id": Student.id,
        "name": Student.student_name,
        "school": Student.school,
        "grade": Student.grade,
    }
    sort_column = sort_columns.get(sort_by, Student.id)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # Apply pagination
    students_with_counts = query.offset(offset).limit(limit).all()

    # Build response with enrollment counts (now fetched in a single query)
    result = []
    for student, enrollment_count in students_with_counts:
        student_data = StudentResponse.model_validate(student)
        student_data.enrollment_count = enrollment_count
        result.append(student_data)

    return result


@router.get("/students/{student_id}", response_model=StudentDetailResponse)
async def get_student_detail(
    student_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a specific student, including enrollment history.

    - **student_id**: The student's database ID
    """
    student = db.query(Student).options(
        joinedload(Student.enrollments).joinedload(Enrollment.tutor)
    ).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(status_code=404, detail=f"Student with ID {student_id} not found")

    # Build response with enrollment details including tutor names
    response = StudentDetailResponse.model_validate(student)
    for i, enrollment in enumerate(student.enrollments):
        response.enrollments[i].tutor_name = enrollment.tutor.tutor_name if enrollment.tutor else None
    return response


@router.patch("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    student_update: StudentUpdate,
    admin: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update a student's information. Admin only."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    update_data = student_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    db.commit()
    db.refresh(student)
    return student
