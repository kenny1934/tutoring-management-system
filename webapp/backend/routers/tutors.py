"""
Tutors API endpoints.
Provides read access to tutor information and admin updates to safe profile
fields (compensation, nickname, location, active flag).
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session, selectinload
from typing import List, Union

from database import get_db
from models import Tutor, TutorBranchCoverage
from schemas import TutorResponse, TutorResponsePublic, TutorUpdate
from utils.employment import normalise_location
from auth.dependencies import (
    get_current_user,
    get_effective_role,
    can_view_admin_data,
    require_admin_write,
)

router = APIRouter()


def _describe_coverage(rows) -> list[str]:
    """Coverage rows as short readable strings, for the audit trail.

    The audit record stores a before and after snapshot of whatever changed,
    and ORM rows do not serialise. "MSB Sat from 2026-09-01" carries the same
    information to whoever reads the log later.
    """
    described = []
    for row in rows or []:
        parts = [row.location]
        if row.weekday:
            parts.append(row.weekday)
        if row.effective_from:
            parts.append(f"from {row.effective_from}")
        if row.effective_until:
            parts.append(f"until {row.effective_until}")
        described.append(" ".join(parts))
    return sorted(described)


def _replace_coverage(tutor: Tutor, requested, admin_email: str) -> None:
    """Swap the tutor's coverage list for the one that was sent.

    The whole list arrives each time rather than individual rows, because the
    editor is a set of checkboxes and dates that the admin sees all at once.
    Sending the finished state avoids the client having to work out which rows
    to add and which to delete.

    A row naming the tutor's own branch is dropped instead of rejected. It says
    nothing that ``default_location`` does not already say, and refusing the
    save over it would be a confusing way to tell somebody they ticked a box
    that was already true.
    """
    home = normalise_location(tutor.default_location)
    tutor.branch_coverage = [
        TutorBranchCoverage(
            location=normalise_location(row.location),
            effective_from=row.effective_from,
            effective_until=row.effective_until,
            weekday=row.weekday,
            note=row.note,
            created_by=admin_email,
        )
        for row in requested
        if normalise_location(row.location) and normalise_location(row.location) != home
    ]


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
    # Coverage is asked for by name because every one of these rows is about to
    # be serialised with it. Left to itself it would be one query per tutor.
    tutors = (
        db.query(Tutor)
        .options(selectinload(Tutor.branch_coverage))
        .order_by(Tutor.tutor_name)
        .limit(100)
        .all()
    )

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

    # Coverage is a collection of child rows rather than a column, so it is
    # handled on its own and kept out of the plain setattr loop below.
    coverage_sent = "branch_coverage" in update_data
    update_data.pop("branch_coverage", None)

    # Capture only the fields being changed, for a focused audit record.
    before_state = {field: getattr(tutor, field) for field in update_data}

    for field, value in update_data.items():
        setattr(tutor, field, value)

    if coverage_sent:
        before_state["branch_coverage"] = _describe_coverage(tutor.branch_coverage)
        # Runs after the loop above on purpose. A save can move somebody's home
        # branch and edit their coverage at once, and it is the new home branch
        # that decides which coverage rows are now redundant.
        _replace_coverage(tutor, tutor_update.branch_coverage or [], admin.user_email)
        update_data["branch_coverage"] = _describe_coverage(tutor.branch_coverage)

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
