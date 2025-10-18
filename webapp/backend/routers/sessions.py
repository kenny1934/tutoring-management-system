"""
Sessions API endpoints.
Provides read-only access to session log data.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import date
from database import get_db
from models import SessionLog, Student, Tutor, SessionExercise, HomeworkCompletion
from schemas import SessionResponse, DetailedSessionResponse, SessionExerciseResponse, HomeworkCompletionResponse

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
        session_data.school_student_id = session.student.school_student_id if session.student else None
        session_data.grade = session.student.grade if session.student else None
        session_data.lang_stream = session.student.lang_stream if session.student else None
        session_data.school = session.student.school if session.student else None
        result.append(session_data)

    return result


@router.get("/sessions/{session_id}", response_model=DetailedSessionResponse)
async def get_session_detail(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a specific session including exercises and homework completion.

    - **session_id**: The session's database ID

    Returns:
    - Session basic information
    - Student and tutor details
    - Session exercises (classwork and homework)
    - Homework completion tracking for this student
    """
    # Load session with basic relationships only
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Build basic session data
    session_data = DetailedSessionResponse.model_validate(session)
    session_data.student_name = session.student.student_name if session.student else None
    session_data.tutor_name = session.tutor.tutor_name if session.tutor else None
    session_data.school_student_id = session.student.school_student_id if session.student else None
    session_data.grade = session.student.grade if session.student else None
    session_data.lang_stream = session.student.lang_stream if session.student else None
    session_data.school = session.student.school if session.student else None

    # Load exercises separately to avoid complex joins
    exercises = db.query(SessionExercise).filter(
        SessionExercise.session_id == session_id
    ).all()

    session_data.exercises = [
        SessionExerciseResponse.model_validate(exercise)
        for exercise in exercises
    ]

    # Load homework completion for this session and student
    homework_completions = db.query(HomeworkCompletion).filter(
        HomeworkCompletion.current_session_id == session_id,
        HomeworkCompletion.student_id == session.student_id
    ).all()

    session_data.homework_completion = [
        HomeworkCompletionResponse.model_validate(hw)
        for hw in homework_completions
    ]

    # Load previous session (most recent attended session for same student, any tutor)
    previous_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.student_id == session.student_id,
        SessionLog.session_date < session.session_date,
        SessionLog.session_status.in_(['Attended', 'Attended (Make-up)'])
    ).order_by(SessionLog.session_date.desc()).first()

    if previous_session:
        prev_session_data = SessionResponse.model_validate(previous_session)
        prev_session_data.student_name = previous_session.student.student_name if previous_session.student else None
        prev_session_data.tutor_name = previous_session.tutor.tutor_name if previous_session.tutor else None
        prev_session_data.school_student_id = previous_session.student.school_student_id if previous_session.student else None
        prev_session_data.grade = previous_session.student.grade if previous_session.student else None
        prev_session_data.lang_stream = previous_session.student.lang_stream if previous_session.student else None
        prev_session_data.school = previous_session.student.school if previous_session.student else None
        session_data.previous_session = prev_session_data

    return session_data
