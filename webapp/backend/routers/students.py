"""
Students API endpoints.
Provides CRUD access to student data.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, select, or_, cast, Integer
from typing import List, Optional
from database import get_db
from models import Student, Enrollment, Tutor, StudentCoupon
from schemas import StudentResponse, StudentDetailResponse, StudentUpdate, StudentCreate, StudentCouponResponse
from auth.dependencies import require_admin_write, get_current_user, is_office_ip, get_effective_role

router = APIRouter()


@router.get("/students/schools", response_model=List[str])
async def get_unique_schools(response: Response, db: Session = Depends(get_db)):
    """Get list of all unique school names for autocomplete."""
    response.headers["Cache-Control"] = "private, max-age=300"
    schools = db.query(Student.school).filter(Student.school.isnot(None)).distinct().limit(200).all()
    return sorted([s[0] for s in schools if s[0]])


@router.get("/students/school-info/{school_name}")
async def get_school_info(
    school_name: str,
    db: Session = Depends(get_db)
):
    """Get common lang_stream for a school based on existing students."""
    result = db.query(
        Student.lang_stream,
        func.count(Student.id).label('count')
    ).filter(
        Student.school == school_name,
        Student.lang_stream.isnot(None)
    ).group_by(
        Student.lang_stream
    ).order_by(
        func.count(Student.id).desc()
    ).first()

    return {"lang_stream": result[0] if result else None}


@router.get("/students/next-id/{location}")
async def get_next_student_id(
    location: str,
    db: Session = Depends(get_db)
):
    """Get the next available school_student_id for a location."""
    # Get all school_student_ids for this location
    ids = db.query(Student.school_student_id).filter(
        Student.home_location == location,
        Student.school_student_id.isnot(None)
    ).all()

    # Find the max numeric ID
    max_id = 1000
    for (sid,) in ids:
        if sid and sid.isdigit():
            max_id = max(max_id, int(sid))

    return {"next_id": str(max_id + 1)}


@router.get("/students/check-duplicates")
async def check_duplicates(
    student_name: str = Query(..., description="Student name to check"),
    location: str = Query(..., description="Home location"),
    phone: Optional[str] = Query(None, description="Phone number to check"),
    db: Session = Depends(get_db)
):
    """Check for potential duplicate students at the same location."""
    duplicates = []
    seen_ids = set()

    # Check exact name match at same location (case-insensitive)
    name_matches = db.query(Student).filter(
        Student.student_name.ilike(student_name),
        Student.home_location == location
    ).limit(3).all()

    for s in name_matches:
        seen_ids.add(s.id)
        duplicates.append({
            "id": s.id,
            "student_name": s.student_name,
            "school_student_id": s.school_student_id,
            "school": s.school,
            "grade": s.grade,
            "match_reason": "Same name at this location"
        })

    # Check phone match (if provided and has at least 8 digits)
    if phone and len(phone) >= 8:
        phone_matches = db.query(Student).filter(
            Student.phone == phone,
            Student.home_location == location
        ).limit(3).all()

        for s in phone_matches:
            if s.id not in seen_ids:
                seen_ids.add(s.id)
                duplicates.append({
                    "id": s.id,
                    "student_name": s.student_name,
                    "school_student_id": s.school_student_id,
                    "school": s.school,
                    "grade": s.grade,
                    "match_reason": "Same phone number"
                })

    return {"duplicates": duplicates}


@router.get("/students", response_model=List[StudentResponse])
async def get_students(
    request: Request,
    search: Optional[str] = Query(None, description="Search by student name or ID"),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    school: Optional[str] = Query(None, description="Filter by school"),
    location: Optional[str] = Query(None, description="Filter by home location"),
    academic_stream: Optional[str] = Query(None, description="Filter by academic stream (Science/Arts)"),
    sort_by: Optional[str] = Query(None, description="Sort field: id, name, school, grade"),
    sort_order: Optional[str] = Query("desc", description="Sort order: asc or desc"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    current_user: Tutor = Depends(get_current_user),
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

    # Get effective role (respects Super Admin impersonation)
    effective_role = get_effective_role(request, current_user)

    # Check if user can see/search phone numbers (admins always, tutors only from office IP)
    can_see_phone = (
        effective_role in ("Admin", "Super Admin") or
        is_office_ip(request, db)
    )

    # Apply filters
    if search:
        # Base search fields
        search_conditions = [
            Student.student_name.ilike(f"%{search}%"),
            Student.school_student_id.ilike(f"%{search}%")
        ]
        # Add phone search if user has permission
        if can_see_phone:
            search_conditions.append(Student.phone.ilike(f"%{search}%"))
        query = query.filter(or_(*search_conditions))

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
        # Redact phone if not allowed
        if not can_see_phone:
            student_data.phone = None
        result.append(student_data)

    return result


@router.get("/students/{student_id}", response_model=StudentDetailResponse)
async def get_student_detail(
    request: Request,
    student_id: int,
    current_user: Tutor = Depends(get_current_user),
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

    # Get effective role (respects Super Admin impersonation)
    effective_role = get_effective_role(request, current_user)

    # Redact phone if tutor is not accessing from office IP
    can_see_phone = (
        effective_role in ("Admin", "Super Admin") or
        is_office_ip(request, db)
    )
    if not can_see_phone:
        response.phone = None

    return response


@router.get("/students/{student_id}/coupon", response_model=StudentCouponResponse)
async def get_student_coupon(
    student_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check if a student has available discount coupons.

    Returns coupon availability and value for enrollment discount auto-selection.
    """
    coupon = db.query(StudentCoupon).filter(StudentCoupon.student_id == student_id).first()
    if coupon and coupon.available_coupons and coupon.available_coupons > 0:
        return StudentCouponResponse(
            has_coupon=True,
            available=coupon.available_coupons,
            value=coupon.coupon_value
        )
    return StudentCouponResponse(has_coupon=False)


@router.patch("/students/{student_id}", response_model=StudentResponse)
async def update_student(
    student_id: int,
    student_update: StudentUpdate,
    admin: Tutor = Depends(require_admin_write),
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


@router.post("/students", response_model=StudentResponse)
async def create_student(
    student_data: StudentCreate,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """Create a new student. Admin only."""
    data = student_data.model_dump()

    # Auto-generate school_student_id if not provided and location is set
    if not data.get("school_student_id") and data.get("home_location"):
        location = data["home_location"]
        # Get all school_student_ids for this location
        ids = db.query(Student.school_student_id).filter(
            Student.home_location == location,
            Student.school_student_id.isnot(None)
        ).all()

        # Find the max numeric ID
        max_id = 1000
        for (sid,) in ids:
            if sid and sid.isdigit():
                max_id = max(max_id, int(sid))

        data["school_student_id"] = str(max_id + 1)

    new_student = Student(**data)
    db.add(new_student)
    db.commit()
    db.refresh(new_student)
    return new_student
