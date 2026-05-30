"""
Tutors API endpoints.
Provides read access to tutor information and admin updates to safe profile
fields (compensation, nickname, location, active flag).
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from typing import List, Union

from database import get_db
from models import Tutor
from schemas import TutorResponse, TutorResponsePublic, TutorUpdate
from auth.dependencies import (
    get_current_user,
    get_effective_role,
    can_view_admin_data,
    require_admin_write,
)

router = APIRouter()


def _serialize_tutor(tutor: Tutor, effective_role: str):
    """Pick the response shape for a tutor based on the viewer's role.

    Admin-level roles (Super Admin, Admin, Supervisor) get the full record
    including ``basic_salary``; everyone else gets the reduced record.
    """
    if can_view_admin_data(effective_role):
        return TutorResponse.model_validate(tutor)
    return TutorResponsePublic.model_validate(tutor)


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
    return [_serialize_tutor(t, effective_role) for t in tutors]


@router.get(
    "/tutors/{tutor_id}",
    response_model=Union[TutorResponse, TutorResponsePublic],
)
def get_tutor(
    tutor_id: int,
    request: Request,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get a single tutor by id.

    Admin-level roles (Super Admin, Admin, Supervisor) receive the full record
    including ``basic_salary``; all other roles receive a reduced record.
    """
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor {tutor_id} not found")

    effective_role = get_effective_role(request, current_user)
    return _serialize_tutor(tutor, effective_role)


@router.put("/tutors/{tutor_id}", response_model=TutorResponse)
def update_tutor(
    tutor_id: int,
    tutor_update: TutorUpdate,
    request: Request,
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db),
):
    """
    Update a tutor's compensation and safe profile fields. Admin only.

    Changes are recorded in the debug audit trail (before/after snapshot) so
    edits to sensitive fields like ``basic_salary`` are traceable.
    """
    # Local import avoids a module-load cycle with the debug router.
    from routers.debug_admin import log_operation

    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor {tutor_id} not found")

    update_data = tutor_update.model_dump(exclude_unset=True)
    if not update_data:
        return TutorResponse.model_validate(tutor)

    # Capture only the fields being changed, for a focused audit record.
    before_state = {field: getattr(tutor, field) for field in update_data}

    for field, value in update_data.items():
        setattr(tutor, field, value)

    log_operation(
        db=db,
        admin=admin,
        operation="UPDATE",
        table_name="tutors",
        row_id=tutor_id,
        before_state=before_state,
        after_state=update_data,
        request=request,
    )

    db.commit()
    db.refresh(tutor)
    return TutorResponse.model_validate(tutor)
