"""
Stats API endpoints.
Provides dashboard summary statistics.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, and_, or_
from typing import List, Optional, Dict, Any
from datetime import date, timedelta
from database import get_db
from models import Student, Enrollment, SessionLog, Tutor
from schemas import DashboardStats, StudentBasic

router = APIRouter()


@router.get("/locations", response_model=List[str])
async def get_locations(db: Session = Depends(get_db)):
    """
    Get list of all unique locations from enrollments and sessions.

    Returns a sorted list of location names (e.g., ["MSA", "MSB"]).
    """
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
    # Build base queries with optional location filter

    # Total enrollments query
    enrollments_query = db.query(func.count(Enrollment.id))
    if location:
        enrollments_query = enrollments_query.filter(Enrollment.location == location)
    total_enrollments = enrollments_query.scalar() or 0

    # Active enrollments (Paid or Pending Payment, not Cancelled)
    active_enrollments_query = db.query(func.count(Enrollment.id)).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
    )
    if location:
        active_enrollments_query = active_enrollments_query.filter(Enrollment.location == location)
    active_enrollments = active_enrollments_query.scalar() or 0

    # Pending payment enrollments
    pending_payment_query = db.query(func.count(Enrollment.id)).filter(
        Enrollment.payment_status == 'Pending Payment'
    )
    if location:
        pending_payment_query = pending_payment_query.filter(Enrollment.location == location)
    pending_payment_enrollments = pending_payment_query.scalar() or 0

    # Active students (students with sessions in the past 14 days or upcoming 14 days)
    # Excludes Cancelled and No Show sessions
    today = date.today()
    active_window_start = today - timedelta(days=14)
    active_window_end = today + timedelta(days=14)
    excluded_statuses = ['Cancelled', 'No Show']

    active_students_query = db.query(func.count(func.distinct(SessionLog.student_id))).filter(
        SessionLog.session_date >= active_window_start,
        SessionLog.session_date <= active_window_end,
        ~SessionLog.session_status.in_(excluded_statuses)
    )
    if location:
        active_students_query = active_students_query.filter(SessionLog.location == location)
    active_students = active_students_query.scalar() or 0

    # Total students - count distinct student_ids from enrollments (filtered by location if applicable)
    total_students_query = db.query(func.count(func.distinct(Enrollment.student_id)))
    if location:
        total_students_query = total_students_query.filter(Enrollment.location == location)
    total_students = total_students_query.scalar() or 0

    # Sessions this month
    first_day_of_month = date(today.year, today.month, 1)

    sessions_this_month_query = db.query(func.count(SessionLog.id)).filter(
        SessionLog.session_date >= first_day_of_month
    )
    if location:
        sessions_this_month_query = sessions_this_month_query.filter(SessionLog.location == location)
    sessions_this_month = sessions_this_month_query.scalar() or 0

    # Sessions this week (Sunday to Saturday, excluding non-sessions)
    # Note: No Show IS included (counts as a session slot used)
    start_of_week = today - timedelta(days=(today.weekday() + 1) % 7)  # Sunday
    end_of_week = start_of_week + timedelta(days=6)  # Saturday

    sessions_this_week_query = db.query(func.count(SessionLog.id)).filter(
        SessionLog.session_date >= start_of_week,
        SessionLog.session_date <= end_of_week,
        SessionLog.session_status != 'Cancelled',
        ~SessionLog.session_status.like('%Make-up Booked%'),
        ~SessionLog.session_status.like('%Pending Make-up%')
    )
    if location:
        sessions_this_week_query = sessions_this_week_query.filter(SessionLog.location == location)
    sessions_this_week = sessions_this_week_query.scalar() or 0

    # Estimate revenue this month (sessions attended * average rate)
    # For MVP, use simple calculation: paid sessions * 400 (base rate)
    paid_sessions_query = db.query(func.count(SessionLog.id)).filter(
        and_(
            SessionLog.session_date >= first_day_of_month,
            SessionLog.financial_status == 'Paid'
        )
    )
    if location:
        paid_sessions_query = paid_sessions_query.filter(SessionLog.location == location)
    paid_sessions_this_month = paid_sessions_query.scalar() or 0

    revenue_this_month = paid_sessions_this_month * 400  # Base rate of 400 per session

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

    active_ids = [row[0] for row in active_student_ids_query.all()]

    # Fetch student details, sorted by id descending
    students = db.query(Student).filter(
        Student.id.in_(active_ids)
    ).order_by(Student.id.desc()).all()

    return students


@router.get("/search")
async def global_search(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(5, ge=1, le=10, description="Results per category"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Global search across students, sessions, and enrollments.

    Used by the Command Palette (Cmd+K) for quick navigation.
    Returns categorized results for students, sessions, and enrollments.
    """
    search_term = f"%{q}%"

    # Search students by name, school_student_id, or school
    # Use func.coalesce to handle NULL values safely
    students = db.query(Student).filter(
        or_(
            Student.student_name.ilike(search_term),
            func.coalesce(Student.school_student_id, '').ilike(search_term),
            func.coalesce(Student.school, '').ilike(search_term)
        )
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
