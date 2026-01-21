from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from database import get_db
from models import Holiday
from schemas import HolidayResponse

router = APIRouter()


@router.get("/holidays", response_model=List[HolidayResponse])
async def get_holidays(
    response: Response,
    from_date: Optional[date] = Query(None, description="Filter holidays >= this date"),
    to_date: Optional[date] = Query(None, description="Filter holidays <= this date"),
    db: Session = Depends(get_db)
):
    """
    Get holidays with optional date range filtering.

    Args:
        from_date: Filter holidays on or after this date
        to_date: Filter holidays on or before this date
        db: Database session

    Returns:
        List of holidays matching the filters
    """
    response.headers["Cache-Control"] = "private, max-age=300"
    query = db.query(Holiday)

    if from_date:
        query = query.filter(Holiday.holiday_date >= from_date)

    if to_date:
        query = query.filter(Holiday.holiday_date <= to_date)

    query = query.order_by(Holiday.holiday_date)

    return query.all()
