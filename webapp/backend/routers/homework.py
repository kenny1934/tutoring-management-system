"""
Homework checking endpoints.

Homework is assigned in one session and checked in a later one, so a check is
keyed to the assignment rather than to the session the tutor happened to be
sitting in. The homework_to_check view decides what is still open for a given
session, looking back up to three sat sessions.
"""
from datetime import date as date_type
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, reject_read_only
from constants import hk_now
from database import get_db
from models import HomeworkCompletion, HomeworkToCheck, SessionExercise, SessionLog, Tutor
from schemas import (
    HomeworkCompletionResponse,
    HomeworkCountResponse,
    HomeworkMarkRequest,
    SessionHomeworkResponse,
)

router = APIRouter()

# completion_status values that mean the tutor has actually looked at the work.
CHECKED_STATUSES = ('Completed', 'Partially Completed', 'Not Completed')

# Kept in sync with completion_status for the legacy reporting queries.
SUBMITTED_STATUSES = ('Completed', 'Partially Completed')

MAX_BULK_SESSIONS = 200


def _to_response(row: HomeworkToCheck) -> HomeworkCompletionResponse:
    """Map a homework_to_check row onto the API shape."""
    return HomeworkCompletionResponse(
        session_exercise_id=row.session_exercise_id,
        current_session_id=row.current_session_id,
        student_id=row.student_id,
        assigned_session_id=row.assigned_session_id,
        homework_assigned_date=row.homework_assigned_date,
        assigned_time_slot=row.assigned_time_slot,
        assigned_by_tutor_id=row.assigned_by_tutor_id,
        assigned_by_tutor=row.assigned_by_tutor,
        sessions_ago=row.sessions_ago,
        pdf_name=row.pdf_name,
        page_start=row.page_start,
        page_end=row.page_end,
        pages=row.pages,
        url=row.url,
        url_title=row.url_title,
        assignment_remarks=row.assignment_remarks,
        completion_id=row.completion_id,
        completion_status=row.completion_status,
        homework_rating=row.homework_rating,
        tutor_comments=row.tutor_comments,
        checked_by=row.checked_by,
        checked_at=row.checked_at,
        checked_in_session_id=row.checked_in_session_id,
        attachment_count=row.attachment_count or 0,
    )


def load_homework_to_check(db: Session, session_ids: List[int]) -> dict:
    """
    Open homework for each of the given sessions, keyed by session id.

    Shared with the session detail endpoint so both read the same shape.
    """
    if not session_ids:
        return {}

    rows = db.query(HomeworkToCheck).filter(
        HomeworkToCheck.current_session_id.in_(session_ids)
    ).all()

    by_session: dict = {}
    for row in rows:
        by_session.setdefault(row.current_session_id, []).append(_to_response(row))

    # Oldest assignment first, so the longest-outstanding homework leads.
    for items in by_session.values():
        items.sort(key=lambda hw: (-(hw.sessions_ago or 0), hw.pdf_name or hw.url or ''))

    return by_session


@router.get("/homework/to-check", response_model=List[SessionHomeworkResponse])
async def get_homework_to_check(
    session_ids: Optional[str] = Query(
        None, description="Comma-separated session IDs"
    ),
    date: Optional[date_type] = Query(None, description="Session date (YYYY-MM-DD)"),
    tutor_id: Optional[int] = Query(None, description="Limit to one tutor's sessions"),
    time_slot: Optional[str] = Query(None, description="Limit to one time slot"),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """
    Homework still open across many sessions, for the sessions list and wide
    lesson mode. Either pass session_ids, or a date with optional tutor and
    time slot filters.
    """
    if session_ids:
        try:
            ids = [int(part) for part in session_ids.split(",") if part.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="session_ids must be integers")
        if len(ids) > MAX_BULK_SESSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Too many sessions requested. Maximum is {MAX_BULK_SESSIONS}",
            )
    elif date:
        query = db.query(SessionLog.id).filter(SessionLog.session_date == date)
        if tutor_id:
            query = query.filter(SessionLog.tutor_id == tutor_id)
        if time_slot:
            query = query.filter(SessionLog.time_slot == time_slot)
        ids = [row[0] for row in query.limit(MAX_BULK_SESSIONS).all()]
    else:
        raise HTTPException(status_code=400, detail="Provide either session_ids or date")

    by_session = load_homework_to_check(db, ids)

    return [
        SessionHomeworkResponse(session_id=session_id, homework=by_session.get(session_id, []))
        for session_id in ids
    ]


@router.get("/homework/counts", response_model=List[HomeworkCountResponse])
async def get_homework_counts(
    session_ids: str = Query(..., description="Comma-separated session IDs"),
    db: Session = Depends(get_db),
    current_user: Tutor = Depends(get_current_user),
):
    """
    How much homework is open per session, for list badges.

    Counts only. The full detail comes from the session itself when a tutor
    opens it, which keeps this cheap enough to call for a screen of rows.
    """
    try:
        ids = [int(part) for part in session_ids.split(",") if part.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="session_ids must be integers")

    if not ids:
        return []
    if len(ids) > MAX_BULK_SESSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many sessions requested. Maximum is {MAX_BULK_SESSIONS}",
        )

    rows = db.query(
        HomeworkToCheck.current_session_id.label("session_id"),
        func.count().label("total"),
        func.sum(
            case((HomeworkToCheck.check_status == 'Checked', 1), else_=0)
        ).label("checked"),
    ).filter(
        HomeworkToCheck.current_session_id.in_(ids)
    ).group_by(HomeworkToCheck.current_session_id).all()

    return [
        HomeworkCountResponse(
            session_id=row.session_id,
            total=row.total or 0,
            checked=int(row.checked or 0),
        )
        for row in rows
    ]


@router.patch(
    "/sessions/{session_id}/homework/{session_exercise_id}",
    response_model=HomeworkCompletionResponse,
)
async def mark_homework(
    session_id: int,
    session_exercise_id: int,
    request: HomeworkMarkRequest,
    current_user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """
    Mark one homework assignment as checked in this session.

    Creates the completion record on first mark and updates it afterwards.
    Marking from a different session than the original check moves the record
    to the new session, since that is where the tutor actually saw the work.
    """
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    exercise = db.query(SessionExercise).filter(
        SessionExercise.id == session_exercise_id
    ).first()
    if not exercise:
        raise HTTPException(
            status_code=404, detail=f"Homework with ID {session_exercise_id} not found"
        )
    if exercise.exercise_type not in ('HW', 'Homework'):
        raise HTTPException(
            status_code=400, detail="That exercise is classwork, not homework"
        )

    assigning_session = db.query(SessionLog).filter(
        SessionLog.id == exercise.session_id
    ).first()

    # The assignment has to belong to the same student, or this is the wrong row.
    if assigning_session and assigning_session.student_id != session.student_id:
        raise HTTPException(
            status_code=400,
            detail="That homework belongs to a different student",
        )

    completion = db.query(HomeworkCompletion).filter(
        HomeworkCompletion.session_exercise_id == session_exercise_id
    ).first()

    if not completion:
        completion = HomeworkCompletion(
            session_exercise_id=session_exercise_id,
            student_id=session.student_id,
            created_at=hk_now(),
        )
        db.add(completion)

    completion.current_session_id = session_id

    # Snapshot the assignment so the record survives the exercise being edited.
    completion.pdf_name = exercise.pdf_name
    completion.page_start = exercise.page_start
    completion.page_end = exercise.page_end
    completion.url = exercise.url
    completion.exercise_remarks = exercise.remarks
    if assigning_session:
        completion.assigned_date = assigning_session.session_date
        completion.assigned_by_tutor_id = assigning_session.tutor_id

    if request.completion_status is not None:
        completion.completion_status = request.completion_status
        completion.submitted = request.completion_status in SUBMITTED_STATUSES
    if request.homework_rating is not None:
        completion.homework_rating = request.homework_rating or None
    if request.tutor_comments is not None:
        completion.tutor_comments = request.tutor_comments or None

    status = completion.completion_status
    if status in CHECKED_STATUSES:
        completion.checked_by = current_user.id
        completion.checked_at = hk_now()
    else:
        # Back to unchecked: drop the audit stamp so it reads as never checked.
        completion.checked_by = None
        completion.checked_at = None

    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()

    row = db.query(HomeworkToCheck).filter(
        HomeworkToCheck.current_session_id == session_id,
        HomeworkToCheck.session_exercise_id == session_exercise_id,
    ).first()

    if row:
        return _to_response(row)

    # The view drops rows it no longer considers open for this session. Fall
    # back to the stored record so the caller still gets the saved state.
    db.refresh(completion)
    return HomeworkCompletionResponse(
        session_exercise_id=session_exercise_id,
        current_session_id=session_id,
        student_id=completion.student_id,
        assigned_session_id=exercise.session_id,
        homework_assigned_date=completion.assigned_date,
        assigned_by_tutor_id=completion.assigned_by_tutor_id,
        pdf_name=completion.pdf_name,
        page_start=completion.page_start,
        page_end=completion.page_end,
        url=completion.url,
        assignment_remarks=completion.exercise_remarks,
        completion_id=completion.id,
        completion_status=completion.completion_status,
        homework_rating=completion.homework_rating,
        tutor_comments=completion.tutor_comments,
        checked_by=completion.checked_by,
        checked_at=completion.checked_at,
        checked_in_session_id=completion.current_session_id,
        attachment_count=len(completion.files or []),
    )
