"""
Revenue API endpoints.
Provides monthly revenue and salary data for tutors.
"""
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from decimal import Decimal
from database import get_db
from models import Tutor
from auth.dependencies import get_current_user

router = APIRouter()


def calculate_monthly_bonus(total_revenue: Decimal) -> Decimal:
    """
    Calculate tiered monthly bonus based on total revenue.

    Tiers:
    - 0 - 50,000: 0%
    - 50,001 - 80,000: 5%
    - 80,001 - 90,000: 10%
    - 90,001 - 120,000: 25%
    - 120,001+: 30%
    """
    revenue = float(total_revenue)

    if revenue <= 50000:
        return Decimal("0.00")
    elif revenue <= 80000:
        bonus = (revenue - 50000) * 0.05
        return Decimal(str(round(bonus, 2)))
    elif revenue <= 90000:
        # 1,500 from first tier + 10% of excess over 80k
        bonus = 1500 + (revenue - 80000) * 0.10
        return Decimal(str(round(bonus, 2)))
    elif revenue <= 120000:
        # 1,500 + 1,000 from previous tiers + 25% of excess over 90k
        bonus = 2500 + (revenue - 90000) * 0.25
        return Decimal(str(round(bonus, 2)))
    else:
        # 1,500 + 1,000 + 7,500 from previous tiers + 30% of excess over 120k
        bonus = 10000 + (revenue - 120000) * 0.30
        return Decimal(str(round(bonus, 2)))


@router.get("/revenue/monthly-summary")
async def get_monthly_revenue_summary(
    tutor_id: Optional[int] = Query(None, gt=0, description="Tutor ID (admins only, defaults to current user)"),
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Period in YYYY-MM format"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get monthly revenue summary for a tutor.

    Returns combined salary data: basic_salary + session revenue.

    Non-admins can only view their own revenue (tutor_id is ignored).
    Admins can view any tutor's revenue.
    """
    is_admin = current_user.role in ('Admin', 'Super Admin')

    # Non-admins can only see their own revenue
    if not is_admin:
        tutor_id = current_user.id
    elif tutor_id is None:
        tutor_id = current_user.id

    # Get tutor's basic salary
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")

    basic_salary = tutor.basic_salary or Decimal("0.00")

    # Query tutor_monthly_revenue view for session revenue
    query = text("""
        SELECT
            tutor_id, tutor_name, session_period,
            sessions_count, total_revenue, avg_revenue_per_session
        FROM tutor_monthly_revenue
        WHERE tutor_id = :tutor_id AND session_period = :period
    """)
    result = db.execute(query, {"tutor_id": tutor_id, "period": period}).fetchone()

    # Calculate totals (handle case where no sessions in period)
    if result:
        session_revenue = Decimal(str(result.total_revenue)) if result.total_revenue else Decimal("0.00")
        sessions_count = result.sessions_count or 0
        avg_revenue = Decimal(str(result.avg_revenue_per_session)) if result.avg_revenue_per_session else None
    else:
        session_revenue = Decimal("0.00")
        sessions_count = 0
        avg_revenue = None

    # Calculate tiered monthly bonus based on session revenue
    monthly_bonus = calculate_monthly_bonus(session_revenue)
    total_salary = basic_salary + monthly_bonus

    return {
        "tutor_id": tutor_id,
        "tutor_name": tutor.tutor_name,
        "period": period,
        "basic_salary": float(basic_salary),
        "session_revenue": float(session_revenue),
        "monthly_bonus": float(monthly_bonus),
        "total_salary": float(total_salary),
        "sessions_count": sessions_count,
        "avg_revenue_per_session": float(avg_revenue) if avg_revenue else None
    }


@router.get("/revenue/session-details")
async def get_session_revenue_details(
    tutor_id: Optional[int] = Query(None, gt=0, description="Tutor ID (admins only, defaults to current user)"),
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Period in YYYY-MM format"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get session-level revenue details for a tutor in a given month.

    Returns list of individual sessions with revenue breakdown.

    Non-admins can only view their own revenue details (tutor_id is ignored).
    Admins can view any tutor's details.
    """
    is_admin = current_user.role in ('Admin', 'Super Admin')

    # Non-admins can only see their own revenue
    if not is_admin:
        tutor_id = current_user.id
    elif tutor_id is None:
        tutor_id = current_user.id

    # Verify tutor exists
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail="Tutor not found")

    # Query tutor_monthly_revenue_details view
    query = text("""
        SELECT
            session_id, student_id, student_name, session_date,
            time_slot, session_status, cost_per_session, enrollment_id
        FROM tutor_monthly_revenue_details
        WHERE tutor_id = :tutor_id AND session_period = :period
        ORDER BY session_date DESC, time_slot
    """)
    results = db.execute(query, {"tutor_id": tutor_id, "period": period}).fetchall()

    return [
        {
            "session_id": row.session_id,
            "session_date": row.session_date.isoformat() if row.session_date else None,
            "time_slot": row.time_slot,
            "student_id": row.student_id,
            "student_name": row.student_name,
            "session_status": row.session_status,
            "cost_per_session": float(row.cost_per_session) if row.cost_per_session else 0.0,
            "enrollment_id": row.enrollment_id
        }
        for row in results
    ]


@router.get("/revenue/location-monthly-summary")
async def get_location_monthly_summary(
    location: Optional[str] = Query(None, description="Location to aggregate (None for all locations)"),
    period: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="Period in YYYY-MM format"),
    current_user: Tutor = Depends(get_current_user),
    response: Response = None,
    db: Session = Depends(get_db)
):
    """
    Get aggregated revenue for all tutors at a location for a given month.
    Used for "Center View" mode on dashboard.

    - **location**: Location to aggregate (omit for all locations)
    - **period**: Period in YYYY-MM format

    Returns total revenue, session count, and average revenue per session.
    Only accessible by admins.
    """
    # Add cache header - revenue data is stable within a day
    if response:
        response.headers["Cache-Control"] = "private, max-age=3600"  # 1 hour

    # Only admins can view location-wide revenue
    is_admin = current_user.role in ('Admin', 'Super Admin')
    if not is_admin:
        raise HTTPException(status_code=403, detail="Admin access required for location-wide revenue")

    # Query session_costs view, aggregate by location
    if location:
        query = text("""
            SELECT
                COALESCE(SUM(cost_per_session), 0) as total_revenue,
                COUNT(*) as sessions_count,
                COALESCE(AVG(cost_per_session), 0) as avg_revenue_per_session
            FROM session_costs
            WHERE location = :location
              AND session_period = :period
        """)
        result = db.execute(query, {"location": location, "period": period}).fetchone()
    else:
        # All locations
        query = text("""
            SELECT
                COALESCE(SUM(cost_per_session), 0) as total_revenue,
                COUNT(*) as sessions_count,
                COALESCE(AVG(cost_per_session), 0) as avg_revenue_per_session
            FROM session_costs
            WHERE session_period = :period
        """)
        result = db.execute(query, {"period": period}).fetchone()

    return {
        "location": location or "All Locations",
        "period": period,
        "total_revenue": float(result.total_revenue or 0),
        "sessions_count": result.sessions_count or 0,
        "avg_revenue_per_session": float(result.avg_revenue_per_session or 0)
    }
