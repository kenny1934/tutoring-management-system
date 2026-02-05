"""
Discounts API endpoints.
Provides read access to discount data.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import Discount
from schemas import DiscountResponse
from auth.dependencies import get_current_user

router = APIRouter()


@router.get("/discounts", response_model=List[DiscountResponse])
async def get_discounts(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all active discounts.

    Returns list of discounts that can be applied to enrollments.
    """
    discounts = db.query(Discount).filter(Discount.is_active == True).all()
    return discounts
