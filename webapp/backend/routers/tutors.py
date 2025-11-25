"""
Tutors API endpoints.
Provides read-only access to tutor information.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Tutor
from schemas import TutorResponse

router = APIRouter()


@router.get("/tutors", response_model=List[TutorResponse])
def get_tutors(
    db: Session = Depends(get_db)
):
    """
    Get list of all tutors.

    Returns:
        List of tutors with basic information
    """
    tutors = db.query(Tutor).order_by(Tutor.tutor_name).all()
    return tutors
