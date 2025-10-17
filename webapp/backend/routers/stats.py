"""
Stats API endpoints.
Provides dashboard summary statistics.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_
from typing import List, Optional
from datetime import date, timedelta
from database import get_db
from models import Student, Enrollment, SessionLog
from schemas import DashboardStats

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

    # Active students (students with at least one active enrollment)
    active_students_query = db.query(func.count(func.distinct(Enrollment.student_id))).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
    )
    if location:
        active_students_query = active_students_query.filter(Enrollment.location == location)
    active_students = active_students_query.scalar() or 0

    # Total students - count distinct student_ids from enrollments (filtered by location if applicable)
    total_students_query = db.query(func.count(func.distinct(Enrollment.student_id)))
    if location:
        total_students_query = total_students_query.filter(Enrollment.location == location)
    total_students = total_students_query.scalar() or 0

    # Sessions this month
    today = date.today()
    first_day_of_month = date(today.year, today.month, 1)

    sessions_this_month_query = db.query(func.count(SessionLog.id)).filter(
        SessionLog.session_date >= first_day_of_month
    )
    if location:
        sessions_this_month_query = sessions_this_month_query.filter(SessionLog.location == location)
    sessions_this_month = sessions_this_month_query.scalar() or 0

    # Sessions this week
    start_of_week = today - timedelta(days=today.weekday())

    sessions_this_week_query = db.query(func.count(SessionLog.id)).filter(
        SessionLog.session_date >= start_of_week
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
