"""
Stats API endpoints.
Provides dashboard summary statistics.
"""
import heapq
from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, and_, or_, case, select
from typing import List, Optional, Dict, Any
from datetime import date, datetime, timedelta, time
from database import get_db
from models import Student, Enrollment, SessionLog, Tutor
from schemas import DashboardStats, StudentBasic, ActivityEvent
from auth.dependencies import get_current_user, is_office_ip

router = APIRouter()


@router.get("/locations", response_model=List[str])
async def get_locations(response: Response, db: Session = Depends(get_db)):
    """
    Get list of all unique locations from enrollments and sessions.

    Returns a sorted list of location names (e.g., ["MSA", "MSB"]).
    """
    response.headers["Cache-Control"] = "private, max-age=300"

    # Get unique locations from enrollments
    enrollment_locations = db.query(Enrollment.location).filter(
        Enrollment.location.isnot(None)
    ).distinct().all()

    # Get unique locations from sessions
    session_locations = db.query(SessionLog.location).filter(
        SessionLog.location.isnot(None)
    ).distinct().all()

    # Combine and deduplicate
    all_locations = set()
    for (loc,) in enrollment_locations:
        if loc:
            all_locations.add(loc)
    for (loc,) in session_locations:
        if loc:
            all_locations.add(loc)

    # Return sorted list
    return sorted(list(all_locations))


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    location: Optional[str] = Query(None, description="Filter stats by location"),
    tutor_id: Optional[int] = Query(None, description="Filter stats by tutor (for 'My View' mode)"),
    db: Session = Depends(get_db)
):
    """
    Get dashboard summary statistics, optionally filtered by location.

    - **location**: Filter all stats by location (optional, omit for all locations)

    Returns:
    - Total students count
    - Active students count (with active enrollments)
    - Total enrollments count
    - Active enrollments count (Paid or Pending Payment)
    - Pending payment enrollments count
    - Sessions this month
    - Sessions this week
    - Estimated revenue this month
    """
    today = date.today()

    # Query 1: Enrollment stats (consolidated from 4 separate queries)
    enrollment_query = db.query(
        func.count(Enrollment.id).label('total'),
        func.sum(case(
            (Enrollment.payment_status.in_(['Paid', 'Pending Payment']), 1),
            else_=0
        )).label('active'),
        func.sum(case(
            (Enrollment.payment_status == 'Pending Payment', 1),
            else_=0
        )).label('pending'),
        func.count(func.distinct(Enrollment.student_id)).label('total_students')
    )
    if location:
        enrollment_query = enrollment_query.filter(Enrollment.location == location)
    if tutor_id:
        enrollment_query = enrollment_query.filter(Enrollment.tutor_id == tutor_id)
    enrollment_stats = enrollment_query.first()

    total_enrollments = enrollment_stats.total or 0
    active_enrollments = int(enrollment_stats.active or 0)
    pending_payment_enrollments = int(enrollment_stats.pending or 0)
    total_students = enrollment_stats.total_students or 0

    # Query 2: Session stats (consolidated from 4 separate queries)
    first_day_of_month = date(today.year, today.month, 1)
    start_of_week = today - timedelta(days=(today.weekday() + 1) % 7)  # Sunday
    end_of_week = start_of_week + timedelta(days=6)  # Saturday
    active_window_start = today - timedelta(days=14)
    active_window_end = today + timedelta(days=14)

    session_query = db.query(
        # Sessions this month
        func.sum(case(
            (SessionLog.session_date >= first_day_of_month, 1),
            else_=0
        )).label('this_month'),
        # Sessions this week (excluding cancelled and makeup-related statuses)
        func.sum(case(
            (and_(
                SessionLog.session_date >= start_of_week,
                SessionLog.session_date <= end_of_week,
                SessionLog.session_status != 'Cancelled',
                ~SessionLog.session_status.like('%Make-up Booked%'),
                ~SessionLog.session_status.like('%Pending Make-up%')
            ), 1),
            else_=0
        )).label('this_week'),
        # Paid sessions this month
        func.sum(case(
            (and_(
                SessionLog.session_date >= first_day_of_month,
                SessionLog.financial_status == 'Paid'
            ), 1),
            else_=0
        )).label('paid_sessions'),
        # Active students (distinct students with sessions in ±14 day window, excluding cancelled/no-show)
        func.count(func.distinct(case(
            (and_(
                SessionLog.session_date >= active_window_start,
                SessionLog.session_date <= active_window_end,
                ~SessionLog.session_status.in_(['Cancelled', 'No Show'])
            ), SessionLog.student_id),
            else_=None
        ))).label('active_students')
    )
    if location:
        session_query = session_query.filter(SessionLog.location == location)
    if tutor_id:
        session_query = session_query.filter(SessionLog.tutor_id == tutor_id)
    session_stats = session_query.first()

    sessions_this_month = int(session_stats.this_month or 0)
    sessions_this_week = int(session_stats.this_week or 0)
    paid_sessions_this_month = int(session_stats.paid_sessions or 0)

    # Active students: filter by enrollment ownership (tutor_id) not session tutor
    if tutor_id:
        # Build subquery for owned students - stays in SQL, no Python materialization
        owned_students_subq = db.query(Enrollment.student_id).filter(
            Enrollment.tutor_id == tutor_id,
            Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
        )
        if location:
            owned_students_subq = owned_students_subq.filter(Enrollment.location == location)
        owned_students_subq = owned_students_subq.distinct().subquery()

        # Count active students using SQL subquery - single database round-trip
        active_students_query = db.query(func.count(func.distinct(SessionLog.student_id))).filter(
            SessionLog.student_id.in_(select(owned_students_subq.c.student_id)),
            SessionLog.session_date >= active_window_start,
            SessionLog.session_date <= active_window_end,
            ~SessionLog.session_status.in_(['Cancelled', 'No Show'])
        )
        if location:
            active_students_query = active_students_query.filter(SessionLog.location == location)
        active_students = active_students_query.scalar() or 0
    else:
        active_students = int(session_stats.active_students or 0)

    # Estimate revenue this month (paid sessions * 400 base rate)
    revenue_this_month = paid_sessions_this_month * 400

    return DashboardStats(
        total_students=total_students,
        active_students=active_students,
        total_enrollments=total_enrollments,
        active_enrollments=active_enrollments,
        pending_payment_enrollments=pending_payment_enrollments,
        sessions_this_month=sessions_this_month,
        sessions_this_week=sessions_this_week,
        revenue_this_month=revenue_this_month
    )


@router.get("/active-students", response_model=List[StudentBasic])
async def get_active_students(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor (for 'My View' mode)"),
    db: Session = Depends(get_db)
):
    """
    Get list of active students (students with sessions in ±14 day window).

    Uses same logic as active_students count in dashboard stats.
    Returns student details for popover display.
    """
    today = date.today()
    active_window_start = today - timedelta(days=14)
    active_window_end = today + timedelta(days=14)
    excluded_statuses = ['Cancelled', 'No Show']

    # Get unique student_ids from sessions in window
    active_student_ids_query = db.query(func.distinct(SessionLog.student_id)).filter(
        SessionLog.session_date >= active_window_start,
        SessionLog.session_date <= active_window_end,
        ~SessionLog.session_status.in_(excluded_statuses)
    )
    if location:
        active_student_ids_query = active_student_ids_query.filter(SessionLog.location == location)

    # Filter by enrollment ownership (tutor_id) using SQL subquery - no Python materialization
    if tutor_id:
        owned_students_subq = db.query(Enrollment.student_id).filter(
            Enrollment.tutor_id == tutor_id,
            Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
        )
        if location:
            owned_students_subq = owned_students_subq.filter(Enrollment.location == location)
        owned_students_subq = owned_students_subq.distinct().subquery()
        active_student_ids_query = active_student_ids_query.filter(
            SessionLog.student_id.in_(select(owned_students_subq.c.student_id))
        )

    # Use subquery for final student fetch - single round-trip
    active_ids_subq = active_student_ids_query.subquery()
    students = db.query(Student).filter(
        Student.id.in_(select(active_ids_subq.c.student_id))
    ).order_by(Student.id.desc()).all()

    return students


@router.get("/search")
async def global_search(
    request: Request,
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(5, ge=1, le=10, description="Results per category"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Global search across students, sessions, and enrollments.

    Used by the Command Palette (Cmd+K) for quick navigation.
    Returns categorized results for students, sessions, and enrollments.
    """
    search_term = f"%{q}%"

    # Get effective role (respects Super Admin impersonation)
    effective_role = current_user.role
    if current_user.role == "Super Admin":
        impersonated_role = request.headers.get("X-Effective-Role")
        if impersonated_role in ("Admin", "Tutor"):
            effective_role = impersonated_role

    # Check if user can see/search phone numbers
    can_see_phone = (
        effective_role in ("Admin", "Super Admin") or
        is_office_ip(request, db)
    )

    # Search students by name, school_student_id, school, and optionally phone
    # Use func.coalesce to handle NULL values safely
    student_conditions = [
        Student.student_name.ilike(search_term),
        func.coalesce(Student.school_student_id, '').ilike(search_term),
        func.coalesce(Student.school, '').ilike(search_term)
    ]
    if can_see_phone:
        student_conditions.append(func.coalesce(Student.phone, '').ilike(search_term))

    students = db.query(Student).filter(
        or_(*student_conditions)
    ).limit(limit).all()

    # Search recent sessions (join with student to search by student name)
    # Only look at sessions from the past 30 days and upcoming 30 days
    today = date.today()
    session_window_start = today - timedelta(days=30)
    session_window_end = today + timedelta(days=30)

    # Use joinedload to eagerly load relationships
    # Join with Tutor to also search by tutor name
    sessions = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).join(
        Student, SessionLog.student_id == Student.id
    ).join(
        Tutor, SessionLog.tutor_id == Tutor.id
    ).filter(
        SessionLog.session_date >= session_window_start,
        SessionLog.session_date <= session_window_end,
        or_(
            Student.student_name.ilike(search_term),
            func.coalesce(Student.school_student_id, '').ilike(search_term),
            func.coalesce(Tutor.tutor_name, '').ilike(search_term)
        )
    ).order_by(SessionLog.session_date.desc()).limit(limit).all()

    # Search enrollments by student name or tutor name
    # Use joinedload to eagerly load relationships, join with Tutor for search
    enrollments = db.query(Enrollment).options(
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor)
    ).join(
        Student, Enrollment.student_id == Student.id
    ).join(
        Tutor, Enrollment.tutor_id == Tutor.id
    ).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment']),
        or_(
            Student.student_name.ilike(search_term),
            func.coalesce(Tutor.tutor_name, '').ilike(search_term)
        )
    ).limit(limit).all()

    return {
        "students": [
            {
                "id": s.id,
                "student_name": s.student_name,
                "school_student_id": s.school_student_id,
                "school": s.school,
                "grade": s.grade,
                "phone": s.phone if can_see_phone else None,
            }
            for s in students
        ],
        "sessions": [
            {
                "id": sess.id,
                "student_id": sess.student_id,
                "student_name": sess.student.student_name if sess.student else None,
                "session_date": sess.session_date.isoformat() if sess.session_date else None,
                "session_status": sess.session_status,
                "tutor_name": sess.tutor.tutor_name if sess.tutor else None,
            }
            for sess in sessions
        ],
        "enrollments": [
            {
                "id": e.id,
                "student_id": e.student_id,
                "student_name": e.student.student_name if e.student else None,
                "tutor_name": e.tutor.tutor_name if e.tutor else None,
                "location": e.location,
                "payment_status": e.payment_status,
            }
            for e in enrollments
        ],
    }


@router.get("/activity-feed", response_model=List[ActivityEvent])
async def get_activity_feed(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor (for 'My View' mode)"),
    limit: int = Query(10, ge=1, le=50, description="Max events to return"),
    db: Session = Depends(get_db)
):
    """
    Get recent activity events for dashboard feed.

    Returns a chronological list of recent events including:
    - Sessions attended/completed
    - Sessions cancelled
    - Make-up sessions completed
    - Payments received
    - New enrollments
    """
    today = date.today()
    events = []

    # 1. Sessions: attended, make-ups, cancelled, rescheduled, sick leave, weather (last 7 days)
    # Filter out sessions with empty audit column (AppSheet data gaps)
    sessions_query = db.query(SessionLog).options(
        joinedload(SessionLog.student)
    ).filter(
        SessionLog.last_modified_time.isnot(None),
        SessionLog.session_date >= (today - timedelta(days=7)),
        SessionLog.session_status.in_([
            'Attended', 'Attended (Make-up)', 'Cancelled',
            'Rescheduled - Pending Make-up', 'Sick Leave - Pending Make-up',
            'Weather Cancelled - Pending Make-up',
            'Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked',
            'Weather Cancelled - Make-up Booked'
        ])
    )
    if location and location != "All Locations":
        sessions_query = sessions_query.filter(SessionLog.location == location)
    if tutor_id:
        sessions_query = sessions_query.filter(SessionLog.tutor_id == tutor_id)

    for s in sessions_query.all():
        if 'Make-up Booked' in s.session_status:
            event_type, title = "makeup_booked", "Make-up booked"
        elif 'Rescheduled' in s.session_status:
            event_type, title = "session_rescheduled", "Session rescheduled"
        elif 'Sick Leave' in s.session_status:
            event_type, title = "sick_leave", "Sick leave"
        elif 'Weather Cancelled' in s.session_status:
            event_type, title = "weather_cancelled", "Weather cancelled"
        elif s.session_status == 'Cancelled':
            event_type, title = "session_cancelled", "Session cancelled"
        elif s.session_status == 'Attended (Make-up)':
            event_type, title = "makeup_completed", "Make-up completed"
        else:
            event_type, title = "session_attended", "Session completed"

        grade_desc = ""
        if s.student:
            grade_desc = f"{s.student.grade or ''}{s.student.lang_stream or ''}".strip()

        # Use attendance_mark_time for completed sessions, fall back to last_modified_time
        if event_type in ('session_attended', 'makeup_completed') and s.attendance_mark_time:
            event_timestamp = s.attendance_mark_time
        else:
            event_timestamp = s.last_modified_time

        events.append(ActivityEvent(
            id=f"session_{s.id}",
            type=event_type,
            title=title,
            student=s.student.student_name if s.student else "Unknown",
            school_student_id=s.student.school_student_id if s.student else None,
            location=s.location,
            description=grade_desc if grade_desc else None,
            timestamp=event_timestamp,
            link=f"/sessions/{s.id}"
        ))

    # 2. Enrollments: new (14 days) + payments (30 days)
    # Filter out enrollments with empty audit column (AppSheet data gaps)
    enrollments_query = db.query(Enrollment).options(
        joinedload(Enrollment.student)
    ).filter(
        Enrollment.last_modified_time.isnot(None),
        or_(
            and_(Enrollment.payment_date.isnot(None),
                 Enrollment.payment_date >= (today - timedelta(days=30))),
            Enrollment.first_lesson_date >= (today - timedelta(days=14))
        )
    )
    if location and location != "All Locations":
        enrollments_query = enrollments_query.filter(Enrollment.location == location)
    if tutor_id:
        enrollments_query = enrollments_query.filter(Enrollment.tutor_id == tutor_id)

    for e in enrollments_query.all():
        # Payment received
        if e.payment_date and e.payment_date >= (today - timedelta(days=30)):
            events.append(ActivityEvent(
                id=f"payment_{e.id}",
                type="payment_received",
                title="Payment received",
                student=e.student.student_name if e.student else "Unknown",
                school_student_id=e.student.school_student_id if e.student else None,
                location=e.location,
                description=f"{e.lessons_paid} lessons" if e.lessons_paid else None,
                timestamp=datetime.combine(e.payment_date, time(12, 0)),
                link=f"/enrollments/{e.id}"
            ))
        # New enrollment (only past/today, not future dates)
        if e.first_lesson_date and e.first_lesson_date >= (today - timedelta(days=14)) and e.first_lesson_date <= today:
            grade_desc = ""
            if e.student:
                grade_desc = f"{e.student.grade or ''}{e.student.lang_stream or ''}".strip()
            events.append(ActivityEvent(
                id=f"enrollment_{e.id}",
                type="new_enrollment",
                title="New enrollment",
                student=e.student.student_name if e.student else "Unknown",
                school_student_id=e.student.school_student_id if e.student else None,
                location=e.location,
                description=grade_desc if grade_desc else None,
                timestamp=e.last_modified_time,
                link=f"/enrollments/{e.id}"
            ))

    # Get top N events by timestamp using heapq (more efficient than full sort)
    return heapq.nlargest(limit, events, key=lambda x: x.timestamp)
