"""
Tutors API endpoints.
Provides read-only access to tutor information.
"""
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session
from typing import List, Union

from database import get_db
from models import Tutor
from schemas import TutorResponse, TutorResponsePublic
from auth.dependencies import get_current_user, get_effective_role, can_view_admin_data

router = APIRouter()


@router.get(
    "/tutors",
    response_model=List[Union[TutorResponse, TutorResponsePublic]],
)
def get_tutors(
    request: Request,
    response: Response,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get list of all tutors.

    Requires authentication. Admin-level roles (Super Admin, Admin, Supervisor)
    receive the full record including ``basic_salary``; all other roles receive a
    reduced record without compensation data.

    Returns:
        List of tutors. Compensation (basic_salary) is included only for
        admin-level roles.
    """
    response.headers["Cache-Control"] = "private, max-age=300"
    tutors = db.query(Tutor).order_by(Tutor.tutor_name).limit(100).all()

    effective_role = get_effective_role(request, current_user)
    if can_view_admin_data(effective_role):
        return [TutorResponse.model_validate(t) for t in tutors]
    return [TutorResponsePublic.model_validate(t) for t in tutors]
