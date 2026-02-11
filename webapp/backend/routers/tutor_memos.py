"""
Tutor Memos API endpoints.
Provides CRUD operations for tutor session memos — notes created when a session
doesn't yet exist (e.g., admin forgot to renew enrollment). Memos can be
auto-matched to sessions when enrollments are created, then imported into sessions.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import List, Optional
from datetime import date
from database import get_db
from constants import hk_now
from models import TutorMemo, Student, Tutor, SessionLog, SessionExercise
from schemas import (
    TutorMemoCreate,
    TutorMemoUpdate,
    TutorMemoResponse,
    TutorMemoImportRequest,
)
from auth.dependencies import get_current_user, reject_guest

router = APIRouter()


def _memo_to_response(memo: TutorMemo) -> TutorMemoResponse:
    """Convert a TutorMemo ORM object to response schema."""
    return TutorMemoResponse(
        id=memo.id,
        student_id=memo.student_id,
        student_name=memo.student.student_name if memo.student else "Unknown",
        school_student_id=memo.student.school_student_id if memo.student else None,
        grade=memo.student.grade if memo.student else None,
        school=memo.student.school if memo.student else None,
        tutor_id=memo.tutor_id,
        tutor_name=memo.tutor.tutor_name if memo.tutor else "Unknown",
        memo_date=memo.memo_date,
        time_slot=memo.time_slot,
        location=memo.location,
        notes=memo.notes,
        exercises=memo.exercises,
        performance_rating=memo.performance_rating,
        linked_session_id=memo.linked_session_id,
        status=memo.status,
        created_at=memo.created_at,
        updated_at=memo.updated_at,
        created_by=memo.created_by,
    )


def _load_memo(db: Session, memo_id: int) -> TutorMemo:
    """Load a memo with relationships or raise 404."""
    memo = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    ).filter(TutorMemo.id == memo_id).first()
    if not memo:
        raise HTTPException(status_code=404, detail="Memo not found")
    return memo


@router.get("/tutor-memos", response_model=List[TutorMemoResponse])
async def list_memos(
    student_id: Optional[int] = Query(None),
    tutor_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None, pattern="^(pending|linked)$"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """List tutor memos with optional filters."""
    query = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    )

    if student_id:
        query = query.filter(TutorMemo.student_id == student_id)
    if tutor_id:
        query = query.filter(TutorMemo.tutor_id == tutor_id)
    if status:
        query = query.filter(TutorMemo.status == status)
    if from_date:
        query = query.filter(TutorMemo.memo_date >= from_date)
    if to_date:
        query = query.filter(TutorMemo.memo_date <= to_date)

    memos = query.order_by(desc(TutorMemo.created_at)).offset(offset).limit(limit).all()
    return [_memo_to_response(m) for m in memos]


@router.get("/tutor-memos/pending-count")
async def get_pending_count(
    tutor_id: Optional[int] = Query(None),
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Get count of pending (unlinked) memos, for dashboard/notification badges."""
    query = db.query(TutorMemo).filter(TutorMemo.status == "pending")
    if tutor_id:
        query = query.filter(TutorMemo.tutor_id == tutor_id)
    count = query.count()
    return {"count": count}


@router.get("/tutor-memos/{memo_id}", response_model=TutorMemoResponse)
async def get_memo(
    memo_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """Get a single memo by ID."""
    memo = _load_memo(db, memo_id)
    return _memo_to_response(memo)


@router.post("/tutor-memos", response_model=TutorMemoResponse)
async def create_memo(
    data: TutorMemoCreate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new tutor memo."""
    student = db.query(Student).filter(Student.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Serialize exercises to dicts for JSON column
    exercises_json = None
    if data.exercises:
        exercises_json = [ex.model_dump() for ex in data.exercises]

    memo = TutorMemo(
        student_id=data.student_id,
        tutor_id=current_user.id,
        memo_date=data.memo_date,
        time_slot=data.time_slot,
        location=data.location,
        notes=data.notes,
        exercises=exercises_json,
        performance_rating=data.performance_rating,
        created_by=current_user.user_email,
    )
    db.add(memo)

    # Auto-match: check if a session already exists for this student+date
    matching_session = db.query(SessionLog).filter(
        SessionLog.student_id == data.student_id,
        SessionLog.session_date == data.memo_date,
        SessionLog.session_status.notin_(['Cancelled']),
    ).first()
    if matching_session:
        memo.linked_session_id = matching_session.id

    db.commit()
    memo = _load_memo(db, memo.id)
    return _memo_to_response(memo)


@router.put("/tutor-memos/{memo_id}", response_model=TutorMemoResponse)
async def update_memo(
    memo_id: int,
    data: TutorMemoUpdate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing memo."""
    memo = _load_memo(db, memo_id)

    # Only the creator or admins can update
    is_owner = memo.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own memos")

    if data.student_id is not None and data.student_id != memo.student_id:
        student = db.query(Student).filter(Student.id == data.student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        memo.student_id = data.student_id
    if data.memo_date is not None:
        memo.memo_date = data.memo_date
    if data.time_slot is not None:
        memo.time_slot = data.time_slot
    if data.location is not None:
        memo.location = data.location
    if data.notes is not None:
        memo.notes = data.notes
    if data.exercises is not None:
        memo.exercises = [ex.model_dump() for ex in data.exercises]
    if data.performance_rating is not None:
        memo.performance_rating = data.performance_rating

    db.commit()
    memo = _load_memo(db, memo.id)
    return _memo_to_response(memo)


@router.delete("/tutor-memos/{memo_id}")
async def delete_memo(
    memo_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a memo."""
    memo = _load_memo(db, memo_id)

    is_owner = memo.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete your own memos")

    db.delete(memo)
    db.commit()
    return {"message": "Memo deleted successfully"}


@router.post("/tutor-memos/{memo_id}/link/{session_id}", response_model=TutorMemoResponse)
async def link_memo_to_session(
    memo_id: int,
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Link a memo to a session (manual matching). Returns the updated memo."""
    memo = _load_memo(db, memo_id)

    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify student matches
    if memo.student_id != session.student_id:
        raise HTTPException(status_code=400, detail="Memo student does not match session student")

    memo.linked_session_id = session_id
    db.commit()
    memo = _load_memo(db, memo.id)
    return _memo_to_response(memo)


@router.post("/tutor-memos/{memo_id}/import/{session_id}")
async def import_memo_to_session(
    memo_id: int,
    session_id: int,
    request: TutorMemoImportRequest,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import memo data into a session. Creates exercises, sets notes/rating.
    Marks the memo as 'linked' after successful import.
    """
    memo = _load_memo(db, memo_id)
    session = db.query(SessionLog).options(
        joinedload(SessionLog.exercises),
    ).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if memo.student_id != session.student_id:
        raise HTTPException(status_code=400, detail="Memo student does not match session student")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    imported = {}

    # Import notes
    if request.import_notes and memo.notes:
        if session.notes:
            session.notes = f"{session.notes}\n\n[From memo] {memo.notes}"
        else:
            session.notes = memo.notes
        imported["notes"] = True

    # Import performance rating
    if request.import_rating and memo.performance_rating:
        session.performance_rating = memo.performance_rating
        imported["rating"] = True

    # Import exercises
    if request.import_exercises and memo.exercises:
        for ex_data in memo.exercises:
            exercise = SessionExercise(
                session_id=session_id,
                exercise_type=ex_data.get("exercise_type", "CW"),
                pdf_name=ex_data.get("pdf_name", ""),
                page_start=ex_data.get("page_start"),
                page_end=ex_data.get("page_end"),
                remarks=ex_data.get("remarks"),
                answer_pdf_name=ex_data.get("answer_pdf_name"),
                answer_page_start=ex_data.get("answer_page_start"),
                answer_page_end=ex_data.get("answer_page_end"),
                answer_remarks=ex_data.get("answer_remarks"),
                created_by=current_user.user_email,
                created_at=hk_now(),
            )
            db.add(exercise)
        imported["exercises"] = len(memo.exercises)

    # Link and mark as imported
    memo.linked_session_id = session_id
    memo.status = "linked"

    # Update session audit
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()

    return {"message": "Memo imported successfully", "imported": imported}


@router.get("/sessions/{session_id}/memo", response_model=Optional[TutorMemoResponse])
async def get_memo_for_session(
    session_id: int,
    _: Tutor = Depends(reject_guest),
    db: Session = Depends(get_db),
):
    """
    Check if a memo exists for a session — either already linked, or a pending
    memo matching the session's student + date + tutor + time slot.
    """
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # First check for directly linked memo
    memo = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    ).filter(TutorMemo.linked_session_id == session_id).first()

    if memo:
        return _memo_to_response(memo)

    # Fall back to matching by student + date + tutor + time slot (pending memos)
    filters = [
        TutorMemo.student_id == session.student_id,
        TutorMemo.memo_date == session.session_date,
        TutorMemo.tutor_id == session.tutor_id,
        TutorMemo.status == "pending",
    ]
    if session.time_slot:
        filters.append(TutorMemo.time_slot == session.time_slot)

    memo = db.query(TutorMemo).options(
        joinedload(TutorMemo.student),
        joinedload(TutorMemo.tutor),
    ).filter(*filters).first()

    if memo:
        return _memo_to_response(memo)

    return None
