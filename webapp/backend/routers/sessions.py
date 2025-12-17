"""
Sessions API endpoints.
Provides read-only access to session log data.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import date
from database import get_db
from models import SessionLog, Student, Tutor, SessionExercise, HomeworkCompletion, HomeworkToCheck, SessionCurriculumSuggestion
from schemas import SessionResponse, DetailedSessionResponse, SessionExerciseResponse, HomeworkCompletionResponse, CurriculumSuggestionResponse, UpcomingTestAlert, CalendarEventResponse, LinkedSessionInfo
from datetime import date, timedelta

router = APIRouter()


def _build_linked_session_info(session: SessionLog, tutor: Tutor = None) -> LinkedSessionInfo:
    """Build a LinkedSessionInfo object from a session."""
    return LinkedSessionInfo(
        id=session.id,
        session_date=session.session_date,
        time_slot=session.time_slot,
        tutor_name=tutor.tutor_name if tutor else None,
        session_status=session.session_status
    )


@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    student_id: Optional[int] = Query(None, description="Filter by student ID"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    enrollment_id: Optional[int] = Query(None, description="Filter by enrollment ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    session_status: Optional[str] = Query(None, description="Filter by session status"),
    financial_status: Optional[str] = Query(None, description="Filter by financial status"),
    from_date: Optional[date] = Query(None, description="Filter by session_date >= this date"),
    to_date: Optional[date] = Query(None, description="Filter by session_date <= this date"),
    limit: int = Query(100, ge=1, le=2000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Get list of sessions with optional filters.

    - **student_id**: Filter by specific student
    - **tutor_id**: Filter by specific tutor
    - **enrollment_id**: Filter by specific enrollment
    - **location**: Filter by location
    - **session_status**: Filter by session status (supports comma-separated for multiple statuses)
    - **financial_status**: Filter by financial status (Paid, Unpaid, Waived)
    - **from_date**: Filter sessions from this date
    - **to_date**: Filter sessions up to this date
    - **limit**: Maximum number of results (default 100, max 500)
    - **offset**: Pagination offset (default 0)
    """
    query = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    )

    # Apply filters
    if student_id:
        query = query.filter(SessionLog.student_id == student_id)

    if tutor_id:
        query = query.filter(SessionLog.tutor_id == tutor_id)

    if enrollment_id:
        query = query.filter(SessionLog.enrollment_id == enrollment_id)

    if location:
        query = query.filter(SessionLog.location == location)

    if session_status:
        # Support comma-separated multiple statuses
        statuses = [s.strip() for s in session_status.split(',')]
        if len(statuses) == 1:
            query = query.filter(SessionLog.session_status == statuses[0])
        else:
            query = query.filter(SessionLog.session_status.in_(statuses))

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

    # Collect linked session IDs for batch loading
    linked_ids = set()
    for session in sessions:
        if session.rescheduled_to_id:
            linked_ids.add(session.rescheduled_to_id)
        if session.make_up_for_id:
            linked_ids.add(session.make_up_for_id)

    # Load linked sessions in one query
    linked_sessions = {}
    if linked_ids:
        linked_query = db.query(SessionLog).options(
            joinedload(SessionLog.tutor)
        ).filter(SessionLog.id.in_(linked_ids)).all()
        linked_sessions = {s.id: s for s in linked_query}

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
        session_data.exercises = [
            SessionExerciseResponse.model_validate(ex)
            for ex in session.exercises
        ]

        # Add linked session info
        if session.rescheduled_to_id and session.rescheduled_to_id in linked_sessions:
            linked = linked_sessions[session.rescheduled_to_id]
            session_data.rescheduled_to = _build_linked_session_info(linked, linked.tutor)
        if session.make_up_for_id and session.make_up_for_id in linked_sessions:
            linked = linked_sessions[session.make_up_for_id]
            session_data.make_up_for = _build_linked_session_info(linked, linked.tutor)

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

    # Load homework to check from previous session (using homework_to_check view)
    homework_to_check = db.query(HomeworkToCheck).filter(
        HomeworkToCheck.current_session_id == session_id
    ).all()

    # Convert homework_to_check view data to HomeworkCompletionResponse format
    homework_completion_list = []
    for hw in homework_to_check:
        # Parse pages field (e.g., "p.1-3" or "p.5") into page_start and page_end
        page_start = None
        page_end = None
        if hw.pages:
            pages_str = hw.pages.replace('p.', '')
            if '-' in pages_str:
                parts = pages_str.split('-')
                page_start = int(parts[0]) if parts[0].isdigit() else None
                page_end = int(parts[1]) if parts[1].isdigit() else None
            elif pages_str.isdigit():
                page_start = int(pages_str)

        homework_completion_list.append(HomeworkCompletionResponse(
            id=hw.session_exercise_id,  # Use exercise ID as identifier
            current_session_id=hw.current_session_id,
            session_exercise_id=hw.session_exercise_id,
            student_id=hw.student_id,
            completion_status=hw.completion_status,
            submitted=hw.submitted or False,
            tutor_comments=hw.tutor_comments,
            checked_by=hw.checked_by,
            checked_at=hw.checked_at,
            pdf_name=hw.pdf_name,
            page_start=page_start,
            page_end=page_end,
            homework_assigned_date=hw.homework_assigned_date,
            assigned_by_tutor_id=hw.assigned_by_tutor_id,
            assigned_by_tutor=hw.assigned_by_tutor
        ))

    session_data.homework_completion = homework_completion_list

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
        prev_session_data = DetailedSessionResponse.model_validate(previous_session)
        prev_session_data.student_name = previous_session.student.student_name if previous_session.student else None
        prev_session_data.tutor_name = previous_session.tutor.tutor_name if previous_session.tutor else None
        prev_session_data.school_student_id = previous_session.student.school_student_id if previous_session.student else None
        prev_session_data.grade = previous_session.student.grade if previous_session.student else None
        prev_session_data.lang_stream = previous_session.student.lang_stream if previous_session.student else None
        prev_session_data.school = previous_session.student.school if previous_session.student else None

        # Load exercises for previous session
        prev_exercises = db.query(SessionExercise).filter(
            SessionExercise.session_id == previous_session.id
        ).all()

        prev_session_data.exercises = [
            SessionExerciseResponse.model_validate(exercise)
            for exercise in prev_exercises
        ]

        session_data.previous_session = prev_session_data

    # Load linked sessions (rescheduled_to and make_up_for)
    if session.rescheduled_to_id:
        linked = db.query(SessionLog).options(
            joinedload(SessionLog.tutor)
        ).filter(SessionLog.id == session.rescheduled_to_id).first()
        if linked:
            session_data.rescheduled_to = _build_linked_session_info(linked, linked.tutor)

    if session.make_up_for_id:
        linked = db.query(SessionLog).options(
            joinedload(SessionLog.tutor)
        ).filter(SessionLog.id == session.make_up_for_id).first()
        if linked:
            session_data.make_up_for = _build_linked_session_info(linked, linked.tutor)

    return session_data


@router.get("/sessions/{session_id}/curriculum-suggestions", response_model=CurriculumSuggestionResponse)
async def get_curriculum_suggestions(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Get curriculum suggestions from last year for a specific session.

    - **session_id**: The session's database ID

    Returns:
    - Curriculum topics from last year's Week N-1, N, and N+1
    - Formatted suggestions display
    - Student, tutor, and session context
    """
    # Query the session_curriculum_suggestions view
    suggestion = db.query(SessionCurriculumSuggestion).filter(
        SessionCurriculumSuggestion.id == session_id
    ).first()

    if not suggestion:
        raise HTTPException(
            status_code=404,
            detail=f"No curriculum suggestion found for session {session_id}"
        )

    return CurriculumSuggestionResponse.model_validate(suggestion)


@router.get("/sessions/{session_id}/upcoming-tests", response_model=List[UpcomingTestAlert])
async def get_upcoming_tests(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Get upcoming tests/exams for a student's school and grade within 14 days of the session date.

    - **session_id**: The session's database ID

    Returns:
    - List of upcoming tests within 14 days
    - Each test includes school, grade, event type, date, and days_until countdown
    """
    from services.google_calendar_service import get_upcoming_tests_for_session, sync_calendar_events

    # Auto-sync calendar events (respects 15-min TTL, won't sync if recent)
    try:
        sync_calendar_events(db=db, force_sync=False)
    except Exception as e:
        # Log but don't fail the request if sync fails
        print(f"Calendar sync failed (non-fatal): {e}")

    # Get session to extract student info
    session = db.query(SessionLog).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get student to extract school, grade, and academic stream
    student = db.query(Student).filter(Student.id == session.student_id).first()

    if not student or not student.school or not student.grade:
        # Return empty list if student doesn't have required info
        return []

    # Get upcoming tests for this student's school and grade
    upcoming_tests = get_upcoming_tests_for_session(
        db=db,
        school=student.school,
        grade=student.grade,
        academic_stream=student.academic_stream,
        session_date=session.session_date,
        days_ahead=14
    )

    return upcoming_tests


@router.post("/calendar/sync")
async def sync_calendar(
    force: bool = False,
    db: Session = Depends(get_db)
):
    """
    Manually sync calendar events from Google Calendar.

    - **force**: If true, force sync even if last sync was recent

    Returns:
    - Number of events synced
    """
    from services.google_calendar_service import sync_calendar_events

    try:
        synced_count = sync_calendar_events(db=db, force_sync=force)
        return {
            "success": True,
            "events_synced": synced_count,
            "message": f"Successfully synced {synced_count} calendar events"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync calendar: {str(e)}"
        )


@router.get("/calendar/events", response_model=List[CalendarEventResponse])
async def get_calendar_events(
    days_ahead: int = Query(30, ge=1, le=90, description="Number of days ahead to fetch events"),
    db: Session = Depends(get_db)
):
    """
    Get all upcoming calendar events (tests/exams) within the specified date range.

    - **days_ahead**: Number of days ahead to fetch events (default: 30, max: 90)

    Returns:
    - List of calendar events sorted by start date
    """
    from services.google_calendar_service import sync_calendar_events
    from models import CalendarEvent

    # Auto-sync calendar events (respects 15-min TTL)
    try:
        sync_calendar_events(db=db, force_sync=False)
    except Exception as e:
        # Log but don't fail if sync fails
        print(f"Calendar sync failed (non-fatal): {e}")

    # Fetch all events within date range
    start_date = date.today()
    end_date = start_date + timedelta(days=days_ahead)

    events = db.query(CalendarEvent).filter(
        CalendarEvent.start_date >= start_date,
        CalendarEvent.start_date <= end_date
    ).order_by(CalendarEvent.start_date).all()

    return events
