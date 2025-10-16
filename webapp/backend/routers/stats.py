"""
Stats API endpoints.
Provides dashboard summary statistics.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_
from datetime import date, timedelta
from database import get_db
from models import Student, Enrollment, SessionLog
from schemas import DashboardStats

router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get dashboard summary statistics.

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
    # Total students
    total_students = db.query(func.count(Student.id)).scalar() or 0

    # Total enrollments
    total_enrollments = db.query(func.count(Enrollment.id)).scalar() or 0

    # Active enrollments (Paid or Pending Payment, not Cancelled)
    active_enrollments = db.query(func.count(Enrollment.id)).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
    ).scalar() or 0

    # Pending payment enrollments
    pending_payment_enrollments = db.query(func.count(Enrollment.id)).filter(
        Enrollment.payment_status == 'Pending Payment'
    ).scalar() or 0

    # Active students (students with at least one active enrollment)
    active_students = db.query(func.count(func.distinct(Enrollment.student_id))).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
    ).scalar() or 0

    # Sessions this month
    today = date.today()
    first_day_of_month = date(today.year, today.month, 1)

    sessions_this_month = db.query(func.count(SessionLog.id)).filter(
        SessionLog.session_date >= first_day_of_month
    ).scalar() or 0

    # Sessions this week
    start_of_week = today - timedelta(days=today.weekday())

    sessions_this_week = db.query(func.count(SessionLog.id)).filter(
        SessionLog.session_date >= start_of_week
    ).scalar() or 0

    # Estimate revenue this month (sessions attended * average rate)
    # For MVP, use simple calculation: paid sessions * 400 (base rate)
    paid_sessions_this_month = db.query(func.count(SessionLog.id)).filter(
        and_(
            SessionLog.session_date >= first_day_of_month,
            SessionLog.financial_status == 'Paid'
        )
    ).scalar() or 0

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
