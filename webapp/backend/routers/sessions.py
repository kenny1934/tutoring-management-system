"""
Sessions API endpoints.
Provides read-only access to session log data.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import date
from database import get_db
from models import SessionLog, Student, Tutor
from schemas import SessionResponse

router = APIRouter()


@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    session_status: Optional[str] = Query(None, description="Filter by session status"),
    financial_status: Optional[str] = Query(None, description="Filter by financial status"),
    from_date: Optional[date] = Query(None, description="Filter by session_date >= this date"),
    to_date: Optional[date] = Query(None, description="Filter by session_date <= this date"),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Get list of sessions with optional filters.

    - **student_id**: Filter by specific student
    - **tutor_id**: Filter by specific tutor
    - **location**: Filter by location
    - **session_status**: Filter by session status (Scheduled, Completed, Cancelled, etc.)
    - **financial_status**: Filter by financial status (Paid, Unpaid, Waived)
    - **from_date**: Filter sessions from this date
    - **to_date**: Filter sessions up to this date
    - **limit**: Maximum number of results (default 100, max 500)
    - **offset**: Pagination offset (default 0)
    """
    query = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    )

    # Apply filters
    if student_id:
        query = query.filter(SessionLog.student_id == student_id)

    if tutor_id:
        query = query.filter(SessionLog.tutor_id == tutor_id)

    if location:
        query = query.filter(SessionLog.location == location)

    if session_status:
        query = query.filter(SessionLog.session_status == session_status)

    if financial_status:
        query = query.filter(SessionLog.financial_status == financial_status)

    if from_date:
        query = query.filter(SessionLog.session_date >= from_date)

    if to_date:
        query = query.filter(SessionLog.session_date <= to_date)

    # Order by most recent first
    query = query.order_by(SessionLog.session_date.desc())

    # Apply pagination
    sessions = query.offset(offset).limit(limit).all()

    # Build response with related data
    result = []
    for session in sessions:
        session_data = SessionResponse.model_validate(session)
        session_data.student_name = session.student.student_name if session.student else None
        session_data.tutor_name = session.tutor.tutor_name if session.tutor else None
        result.append(session_data)

    return result


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session_detail(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a specific session.

    - **session_id**: The session's database ID
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    session_data = SessionResponse.model_validate(session)
    session_data.student_name = session.student.student_name if session.student else None
    session_data.tutor_name = session.tutor.tutor_name if session.tutor else None

    return session_data
