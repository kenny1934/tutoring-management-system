"""
Sessions API endpoints.
Provides read-only access to session log data.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, text
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from typing import List, Optional
from datetime import date
from database import get_db
from models import SessionLog, Student, Tutor, SessionExercise, HomeworkCompletion, HomeworkToCheck, SessionCurriculumSuggestion, Holiday, ExamRevisionSlot, CalendarEvent, Enrollment
from schemas import SessionResponse, DetailedSessionResponse, SessionExerciseResponse, HomeworkCompletionResponse, CurriculumSuggestionResponse, UpcomingTestAlert, CalendarEventResponse, LinkedSessionInfo, ExerciseSaveRequest, RateSessionRequest, SessionUpdate, BulkExerciseAssignRequest, BulkExerciseAssignResponse, MakeupSlotSuggestion, StudentInSlot, ScheduleMakeupRequest, ScheduleMakeupResponse, CalendarEventCreate, CalendarEventUpdate, UncheckedAttendanceReminder, UncheckedAttendanceCount
from datetime import date, timedelta, datetime, timezone
from constants import hk_now
from utils.response_builders import build_session_response as _build_session_response, build_linked_session_info as _build_linked_session_info
from utils.rate_limiter import check_user_rate_limit
from utils.makeup_validators import find_root_original_session as _find_root_original_session, validate_makeup_constraints
from auth.dependencies import get_current_user, get_session_with_owner_check, require_admin_write

router = APIRouter()
logger = logging.getLogger(__name__)


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
        joinedload(SessionLog.exercises),
        joinedload(SessionLog.extension_request),
        joinedload(SessionLog.enrollment)
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
        session_data = _build_session_response(session, db)

        # Add linked session info
        if session.rescheduled_to_id and session.rescheduled_to_id in linked_sessions:
            linked = linked_sessions[session.rescheduled_to_id]
            session_data.rescheduled_to = _build_linked_session_info(linked, linked.tutor)
        if session.make_up_for_id and session.make_up_for_id in linked_sessions:
            linked = linked_sessions[session.make_up_for_id]
            session_data.make_up_for = _build_linked_session_info(linked, linked.tutor)

        result.append(session_data)

    return result


# ============================================================================
# UNCHECKED ATTENDANCE ENDPOINTS
# (Must be declared before /sessions/{session_id} to avoid route conflicts)
# ============================================================================

@router.get("/sessions/unchecked-attendance", response_model=List[UncheckedAttendanceReminder])
async def get_unchecked_attendance(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    urgency: Optional[str] = Query(None, description="Filter by urgency level: critical, high, medium, low"),
    db: Session = Depends(get_db)
):
    """
    Get sessions with unchecked attendance (past sessions still marked as Scheduled, Make-up Class, or Trial Class).

    - **location**: Filter by session location
    - **tutor_id**: Filter by specific tutor
    - **urgency**: Filter by urgency level (critical=7+ days, high=4-7, medium=2-3, low=0-1)

    Returns list of sessions that need attendance marking, sorted by most overdue first.
    """
    # Build dynamic query based on provided filters
    base_query = """
        SELECT
            session_id,
            session_date,
            time_slot,
            location,
            session_status,
            tutor_id,
            tutor_name,
            student_id,
            student_name,
            school_student_id,
            SUBSTRING_INDEX(grade_stream, ' ', 1) as grade,
            school,
            days_overdue,
            urgency_level
        FROM unchecked_attendance_reminders
        WHERE 1=1
    """
    params = {}

    if location:
        base_query += " AND location = :location"
        params["location"] = location

    if tutor_id:
        base_query += " AND tutor_id = :tutor_id"
        params["tutor_id"] = tutor_id

    if urgency:
        base_query += " AND LOWER(urgency_level) = LOWER(:urgency)"
        params["urgency"] = urgency

    base_query += " ORDER BY days_overdue DESC, session_date DESC LIMIT 500"
    query = text(base_query)

    logger.info(f"Unchecked attendance query - location: {location}, tutor_id: {tutor_id}, urgency: {urgency}")
    result = db.execute(query, params)

    rows = result.fetchall()
    return [
        UncheckedAttendanceReminder(
            session_id=row.session_id,
            session_date=row.session_date,
            time_slot=row.time_slot,
            location=row.location,
            session_status=row.session_status,
            tutor_id=row.tutor_id,
            tutor_name=row.tutor_name,
            student_id=row.student_id,
            student_name=row.student_name,
            school_student_id=row.school_student_id,
            grade=row.grade,
            school=row.school,
            days_overdue=row.days_overdue,
            urgency_level=row.urgency_level
        )
        for row in rows
    ]


@router.get("/sessions/unchecked-attendance/count", response_model=UncheckedAttendanceCount)
async def get_unchecked_attendance_count(
    location: Optional[str] = Query(None, description="Filter by location"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Get count of sessions with unchecked attendance.

    Returns total count and count of critical (>7 days overdue) sessions.
    Used for notification bell badge.
    """
    # Build dynamic query based on provided filters
    base_query = """
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN days_overdue > 7 THEN 1 ELSE 0 END) as critical
        FROM unchecked_attendance_reminders
        WHERE 1=1
    """
    params = {}

    if location:
        base_query += " AND location = :location"
        params["location"] = location

    if tutor_id:
        base_query += " AND tutor_id = :tutor_id"
        params["tutor_id"] = tutor_id

    result = db.execute(text(base_query), params)

    row = result.fetchone()
    return UncheckedAttendanceCount(
        total=row.total or 0,
        critical=row.critical or 0
    )


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
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.extension_request),
        joinedload(SessionLog.enrollment)
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

    # Extension request info
    if session.extension_request:
        session_data.extension_request_id = session.extension_request.id
        session_data.extension_request_status = session.extension_request.request_status

    # Enrollment payment status
    if session.enrollment:
        session_data.enrollment_payment_status = session.enrollment.payment_status

    # Load previous session (most recent attended session for same student, any tutor)
    previous_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.student_id == session.student_id,
        SessionLog.session_date < session.session_date,
        SessionLog.session_status.in_(['Attended', 'Attended (Make-up)'])
    ).order_by(SessionLog.session_date.desc()).first()

    # Batch load linked sessions (rescheduled_to and make_up_for) in a single query
    linked_ids = [id for id in [session.rescheduled_to_id, session.make_up_for_id] if id]
    linked_sessions_map = {}
    if linked_ids:
        linked_sessions = db.query(SessionLog).options(
            joinedload(SessionLog.tutor)
        ).filter(SessionLog.id.in_(linked_ids)).all()
        linked_sessions_map = {s.id: s for s in linked_sessions}

    # Batch load exercises for all related sessions (main + previous) in a single query
    session_ids_for_exercises = {session_id}
    if previous_session:
        session_ids_for_exercises.add(previous_session.id)

    all_exercises = db.query(SessionExercise).filter(
        SessionExercise.session_id.in_(session_ids_for_exercises)
    ).all()

    # Group exercises by session ID
    exercises_by_session = {}
    for ex in all_exercises:
        if ex.session_id not in exercises_by_session:
            exercises_by_session[ex.session_id] = []
        exercises_by_session[ex.session_id].append(ex)

    # Set exercises for main session
    session_data.exercises = [
        SessionExerciseResponse.model_validate(exercise)
        for exercise in exercises_by_session.get(session_id, [])
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

    # Build previous session data with pre-loaded exercises
    if previous_session:
        prev_session_data = DetailedSessionResponse.model_validate(previous_session)
        prev_session_data.student_name = previous_session.student.student_name if previous_session.student else None
        prev_session_data.tutor_name = previous_session.tutor.tutor_name if previous_session.tutor else None
        prev_session_data.school_student_id = previous_session.student.school_student_id if previous_session.student else None
        prev_session_data.grade = previous_session.student.grade if previous_session.student else None
        prev_session_data.lang_stream = previous_session.student.lang_stream if previous_session.student else None
        prev_session_data.school = previous_session.student.school if previous_session.student else None

        # Use pre-loaded exercises
        prev_session_data.exercises = [
            SessionExerciseResponse.model_validate(exercise)
            for exercise in exercises_by_session.get(previous_session.id, [])
        ]

        session_data.previous_session = prev_session_data

    # Navigation: previous session (most recent non-cancelled session before current)
    nav_previous = db.query(SessionLog).filter(
        SessionLog.student_id == session.student_id,
        SessionLog.session_date < session.session_date,
        SessionLog.session_status.in_(['Scheduled', 'Make-up Class', 'Trial Class', 'Attended', 'Attended (Make-up)'])
    ).order_by(SessionLog.session_date.desc(), SessionLog.time_slot.desc()).first()

    if nav_previous:
        session_data.nav_previous_id = nav_previous.id

    # Navigation: next session (next valid session after current)
    nav_next = db.query(SessionLog).filter(
        SessionLog.student_id == session.student_id,
        SessionLog.session_date > session.session_date,
        SessionLog.session_status.in_(['Scheduled', 'Make-up Class', 'Trial Class', 'Attended', 'Attended (Make-up)'])
    ).order_by(SessionLog.session_date.asc(), SessionLog.time_slot.asc()).first()

    if nav_next:
        session_data.nav_next_id = nav_next.id

    # Use pre-loaded linked sessions
    if session.rescheduled_to_id and session.rescheduled_to_id in linked_sessions_map:
        linked = linked_sessions_map[session.rescheduled_to_id]
        session_data.rescheduled_to = _build_linked_session_info(linked, linked.tutor)

    if session.make_up_for_id and session.make_up_for_id in linked_sessions_map:
        linked = linked_sessions_map[session.make_up_for_id]
        session_data.make_up_for = _build_linked_session_info(linked, linked.tutor)

    return session_data


@router.patch("/sessions/{session_id}/attended", response_model=SessionResponse)
async def mark_session_attended(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a session as attended.

    Updates session status based on current status:
    - Scheduled -> Attended
    - Trial Class -> Attended
    - Make-up Class -> Attended (Make-up)

    Also sets attendance tracking fields and audit columns.
    Requires authentication. Tutors can only modify their own sessions.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership: tutor can only modify their own sessions, admins can modify any
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Validate current status allows marking as attended
    valid_statuses = ["Scheduled", "Trial Class", "Make-up Class"]
    if session.session_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark attended: current status is '{session.session_status}'"
        )

    # Determine new status based on current status
    status_mapping = {
        "Scheduled": "Attended",
        "Trial Class": "Attended",
        "Make-up Class": "Attended (Make-up)"
    }
    new_status = status_mapping.get(session.session_status, session.session_status)

    # Store previous status for undo functionality
    session.previous_session_status = session.session_status

    # Update session status
    session.session_status = new_status

    # Set attendance tracking fields
    session.attendance_marked_by = current_user.user_email
    session.attendance_mark_time = hk_now()

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response with related data
    session_data = _build_session_response(session, db)

    return session_data


@router.patch("/sessions/{session_id}/no-show", response_model=SessionResponse)
async def mark_session_no_show(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a session as No Show.

    Updates session status to 'No Show' from valid starting statuses.
    Requires authentication. Tutors can only modify their own sessions.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Validate current status
    valid_statuses = ["Scheduled", "Trial Class", "Make-up Class"]
    if session.session_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark no show: current status is '{session.session_status}'"
        )

    # Store previous status and update
    session.previous_session_status = session.session_status
    session.session_status = "No Show"

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session, db)

    return session_data


@router.patch("/sessions/{session_id}/reschedule", response_model=SessionResponse)
async def mark_session_rescheduled(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a session as Rescheduled - Pending Make-up.

    Updates session status to indicate it needs a make-up class scheduled.
    Requires authentication. Tutors can only modify their own sessions.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Validate current status
    valid_statuses = ["Scheduled", "Trial Class", "Make-up Class"]
    if session.session_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reschedule: current status is '{session.session_status}'"
        )

    # Store previous status and update
    session.previous_session_status = session.session_status
    session.session_status = "Rescheduled - Pending Make-up"

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session, db)

    return session_data


@router.patch("/sessions/{session_id}/sick-leave", response_model=SessionResponse)
async def mark_session_sick_leave(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a session as Sick Leave - Pending Make-up.

    Updates session status to indicate student was sick and needs make-up.
    Requires authentication. Tutors can only modify their own sessions.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Validate current status
    valid_statuses = ["Scheduled", "Trial Class", "Make-up Class"]
    if session.session_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark sick leave: current status is '{session.session_status}'"
        )

    # Store previous status and update
    session.previous_session_status = session.session_status
    session.session_status = "Sick Leave - Pending Make-up"

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session, db)

    return session_data


@router.patch("/sessions/{session_id}/weather-cancelled", response_model=SessionResponse)
async def mark_session_weather_cancelled(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a session as Weather Cancelled - Pending Make-up.

    Updates session status to indicate class was cancelled due to weather.
    Requires authentication. Tutors can only modify their own sessions.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Validate current status
    valid_statuses = ["Scheduled", "Trial Class", "Make-up Class"]
    if session.session_status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark weather cancelled: current status is '{session.session_status}'"
        )

    # Store previous status and update
    session.previous_session_status = session.session_status
    session.session_status = "Weather Cancelled - Pending Make-up"

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session, db)

    return session_data


# ============================================
# Undo/Redo Endpoints
# ============================================

@router.patch("/sessions/{session_id}/undo", response_model=SessionResponse)
async def undo_session_status(
    session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Undo the last status change on a session.

    Reverts session_status to previous_session_status and clears the undo history.
    Cannot undo if a make-up has been booked (use cancel-makeup instead).
    Requires authentication. Tutors can only modify their own sessions.

    Returns the session with `undone_from_status` field indicating what was undone.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Validate we have something to undo
    if not session.previous_session_status:
        raise HTTPException(
            status_code=400,
            detail="No previous status to revert to"
        )

    # Prevent undo when make-up is booked
    if "Make-up Booked" in session.session_status:
        raise HTTPException(
            status_code=400,
            detail="Cannot undo: a make-up session has been booked. Use 'Cancel Make-up' first."
        )

    # Store the status we're undoing from (for redo toast)
    undone_from_status = session.session_status

    # Revert to previous status
    session.session_status = session.previous_session_status
    session.previous_session_status = None  # Clear to prevent double-undo

    # Clear attendance fields if undoing from Attended status
    if undone_from_status in ("Attended", "Attended (Make-up)"):
        session.attendance_marked_by = None
        session.attendance_mark_time = None

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    response = _build_session_response(session, db)
    # Convert to dict and add undone_from_status for redo toast
    response_dict = response.model_dump()
    response_dict["undone_from_status"] = undone_from_status
    return response_dict


@router.patch("/sessions/{session_id}/redo", response_model=SessionResponse)
async def redo_session_status(
    session_id: int,
    status: str = Query(..., description="Status to restore"),
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Redo a recently undone status change (called from toast).

    Restores the session to the specified status and stores current as previous.
    Requires authentication. Tutors can only modify their own sessions.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Store current status as previous (for undo again if needed)
    session.previous_session_status = session.session_status
    session.session_status = status

    # Re-set attendance fields if restoring to Attended
    if status in ("Attended", "Attended (Make-up)"):
        session.attendance_marked_by = current_user.user_email
        session.attendance_mark_time = hk_now()

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    return _build_session_response(session, db)


# ============================================
# Make-up Scheduling Endpoints
# ============================================


# _find_root_original_session moved to utils/makeup_validators.py


def _get_makeup_raw_data(
    original_session: SessionLog,
    original_student: Student,
    candidate_tutor_id: int,
    active_students: List[dict],
    slot_date: date,
    today: date
) -> dict:
    """
    Get raw compatibility data for a make-up slot.

    Returns raw counts and flags for frontend-side weighted scoring.
    This allows users to adjust weights and re-sort instantly.
    """
    # Count matching students (density-based)
    matching_grade_count = sum(
        1 for s in active_students
        if original_student.grade and s.get("grade") == original_student.grade
    )
    matching_school_count = sum(
        1 for s in active_students
        if original_student.school and s.get("school") == original_student.school
    )
    matching_lang_count = sum(
        1 for s in active_students
        if original_student.lang_stream and s.get("lang_stream") == original_student.lang_stream
    )

    # Calculate days from today
    days_away = (slot_date - today).days if slot_date >= today else 0

    return {
        "is_same_tutor": candidate_tutor_id == original_session.tutor_id,
        "matching_grade_count": matching_grade_count,
        "matching_school_count": matching_school_count,
        "matching_lang_count": matching_lang_count,
        "days_away": days_away,
        "current_students": len(active_students),
    }


@router.get("/sessions/{session_id}/makeup-suggestions", response_model=List[MakeupSlotSuggestion])
async def get_makeup_suggestions(
    session_id: int,
    response: Response,
    days_ahead: int = Query(30, ge=1, le=60, description="Days ahead to search for slots"),
    db: Session = Depends(get_db)
):
    """
    Get scored slot suggestions for scheduling a make-up session.

    Returns available slots at the same location, scored by compatibility:
    - Same tutor: +100 points
    - Same grade students: +50 points
    - Same school students: +30 points
    - Same language stream: +20 points
    - Available capacity: +10 points per empty spot

    Only includes slots with capacity (< 8 active students).
    Only counts "Scheduled" and "Make-up Class" sessions.
    """
    # Set cache headers for browser caching (2 minutes)
    response.headers["Cache-Control"] = "private, max-age=120"

    # Get the original session
    original_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).filter(SessionLog.id == session_id).first()

    if not original_session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Validate it's a pending make-up session
    if "Pending Make-up" not in original_session.session_status:
        raise HTTPException(
            status_code=400,
            detail=f"Session status must be 'Pending Make-up', got '{original_session.session_status}'"
        )

    # Already has make-up scheduled?
    if original_session.rescheduled_to_id:
        raise HTTPException(
            status_code=400,
            detail="Make-up already scheduled for this session"
        )

    original_student = original_session.student
    location = original_session.location

    # Query date range
    start_date = date.today()
    end_date = start_date + timedelta(days=days_ahead)

    # Get holidays in the range first (small query)
    holidays = db.query(Holiday).filter(
        Holiday.holiday_date >= start_date,
        Holiday.holiday_date <= end_date
    ).all()
    holiday_dates = {h.holiday_date for h in holidays}

    # Optimized: First query to get slot counts and identify non-full slots (< 8 students)
    # This filters out full slots at DB level instead of loading all sessions
    active_statuses = ["Scheduled", "Make-up Class"]
    slot_counts = db.query(
        SessionLog.session_date,
        SessionLog.time_slot,
        SessionLog.tutor_id,
        func.count(SessionLog.id).label('slot_count')
    ).filter(
        SessionLog.location == location,
        SessionLog.session_date >= start_date,
        SessionLog.session_date <= end_date,
        SessionLog.session_status.in_(active_statuses),
        ~SessionLog.session_date.in_(holiday_dates) if holiday_dates else True  # Skip holidays at DB level
    ).group_by(
        SessionLog.session_date,
        SessionLog.time_slot,
        SessionLog.tutor_id
    ).having(
        func.count(SessionLog.id) < 8  # Only non-full slots
    ).all()

    # Build set of valid (non-full) slot keys
    valid_slot_keys = {(sc.session_date, sc.time_slot, sc.tutor_id) for sc in slot_counts}

    # Now fetch only sessions that belong to non-full slots
    # This significantly reduces data transfer when many slots are full
    sessions = []
    if valid_slot_keys:
        # Build filter conditions for valid slots
        from sqlalchemy import tuple_
        slot_filter = tuple_(
            SessionLog.session_date,
            SessionLog.time_slot,
            SessionLog.tutor_id
        ).in_(valid_slot_keys)

        sessions = db.query(SessionLog).options(
            joinedload(SessionLog.student),
            joinedload(SessionLog.tutor)
        ).filter(
            SessionLog.location == location,
            SessionLog.session_date >= start_date,
            SessionLog.session_date <= end_date,
            SessionLog.session_status.in_(active_statuses),
            slot_filter
        ).all()

    # Group sessions by (date, time_slot, tutor_id) - now a much smaller set
    from collections import defaultdict
    slots = defaultdict(list)
    for session in sessions:
        key = (session.session_date, session.time_slot, session.tutor_id)
        slots[key].append(session)

    # Note: tutor info is already eagerly loaded via joinedload(SessionLog.tutor)

    # Generate scored suggestions
    # Note: Holidays and full slots already filtered at DB level
    suggestions = []
    for (slot_date, time_slot, tutor_id), slot_sessions in slots.items():
        tutor = slot_sessions[0].tutor
        if not tutor:
            continue

        # Skip slots where the student being rescheduled is already enrolled
        if any(s.student_id == original_student.id for s in slot_sessions):
            continue

        # Build active students list
        active_students = [
            {
                "id": s.student.id,
                "school_student_id": s.student.school_student_id,
                "student_name": s.student.student_name,
                "grade": s.student.grade,
                "school": s.student.school,
                "lang_stream": s.student.lang_stream,
                "session_status": s.session_status
            }
            for s in slot_sessions if s.student
        ]

        # Get raw compatibility data for frontend-side weighted scoring
        raw_data = _get_makeup_raw_data(
            original_session, original_student, tutor_id, active_students,
            slot_date, start_date  # start_date is today
        )

        suggestions.append(MakeupSlotSuggestion(
            session_date=slot_date,
            time_slot=time_slot,
            tutor_id=tutor_id,
            tutor_name=tutor.tutor_name,
            location=location,
            current_students=len(active_students),
            available_spots=8 - len(active_students),
            compatibility_score=0,  # Frontend calculates score with user-adjustable weights
            score_breakdown=raw_data,
            students_in_slot=[
                StudentInSlot(
                    id=s["id"],
                    school_student_id=s["school_student_id"],
                    student_name=s["student_name"],
                    grade=s["grade"],
                    school=s["school"],
                    lang_stream=s["lang_stream"],
                    session_status=s["session_status"]
                )
                for s in active_students
            ]
        ))

    # Also add empty slots for tutors (slots with no existing sessions but tutor is available)
    # For now, we'll just show slots that have existing sessions - can expand later

    # Sort by date, then time slot (frontend re-sorts by user-adjusted weights)
    suggestions.sort(key=lambda s: (s.session_date, s.time_slot))

    return suggestions


@router.post("/sessions/{session_id}/schedule-makeup", response_model=ScheduleMakeupResponse)
async def schedule_makeup(
    session_id: int,
    request: ScheduleMakeupRequest,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Schedule a make-up session for a pending make-up.

    Creates a new session with status "Make-up Class" and links it to the original.
    Updates the original session status from "X - Pending Make-up" to "X - Make-up Booked".
    Requires authentication. Tutors can only schedule makeups for their own sessions.

    Validates:
    - Original session is in "Pending Make-up" status
    - No make-up already scheduled (1:1 relationship)
    - Target date is not a holiday
    - Student doesn't have active session at that slot (unless it's also rescheduled)
    """
    # Get the original session with row-level lock to prevent race conditions
    # (two concurrent requests could both see rescheduled_to_id=NULL without this)
    original_session = db.query(SessionLog).with_for_update().options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not original_session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership - only original session owner or admin can schedule makeup
    is_owner = original_session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only schedule makeups for your own sessions")

    # Validate status
    if "Pending Make-up" not in original_session.session_status:
        raise HTTPException(
            status_code=400,
            detail=f"Session must be in 'Pending Make-up' status, got '{original_session.session_status}'"
        )

    # Check 1:1 relationship
    if original_session.rescheduled_to_id:
        raise HTTPException(
            status_code=400,
            detail="Make-up already scheduled for this session"
        )

    # Shared validation: 60-day window, holiday, enrollment deadline, student conflict
    is_super_admin = current_user.role == "Super Admin"
    validate_makeup_constraints(
        db, original_session.student_id, original_session,
        request.session_date, request.time_slot, request.location,
        is_super_admin=is_super_admin,
    )

    # Verify tutor exists and is at the location
    tutor = db.query(Tutor).filter(Tutor.id == request.tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor with ID {request.tutor_id} not found")
    if tutor.default_location != request.location:
        raise HTTPException(
            status_code=400,
            detail=f"Tutor '{tutor.tutor_name}' is not at location '{request.location}'"
        )

    # Create the make-up session
    makeup_session = SessionLog(
        enrollment_id=original_session.enrollment_id,
        student_id=original_session.student_id,
        tutor_id=request.tutor_id,
        session_date=request.session_date,
        time_slot=request.time_slot,
        location=request.location,
        session_status="Make-up Class",
        financial_status=original_session.financial_status,  # Inherit from original session
        make_up_for_id=original_session.id,
        notes=request.notes,  # Optional reason for scheduling
        last_modified_by=current_user.user_email,
        last_modified_time=hk_now()
    )

    # Auto-link to matching exam revision slot if student matches criteria
    student = db.query(Student).filter(Student.id == original_session.student_id).first()
    if student:
        matching_slot = db.query(ExamRevisionSlot).join(
            CalendarEvent, ExamRevisionSlot.calendar_event_id == CalendarEvent.id
        ).filter(
            ExamRevisionSlot.session_date == request.session_date,
            ExamRevisionSlot.time_slot == request.time_slot,
            ExamRevisionSlot.location == request.location,
            or_(CalendarEvent.school.is_(None), CalendarEvent.school == student.school),
            or_(CalendarEvent.grade.is_(None), CalendarEvent.grade == student.grade),
            or_(
                CalendarEvent.academic_stream.is_(None),
                student.grade not in ['F4', 'F5', 'F6'],
                CalendarEvent.academic_stream == student.academic_stream
            )
        ).first()

        if matching_slot:
            makeup_session.exam_revision_slot_id = matching_slot.id

    db.add(makeup_session)
    db.flush()  # Get the ID

    # Update original session status and link
    # "Rescheduled - Pending Make-up" -> "Rescheduled - Make-up Booked"
    # "Sick Leave - Pending Make-up" -> "Sick Leave - Make-up Booked"
    # "Weather Cancelled - Pending Make-up" -> "Weather Cancelled - Make-up Booked"
    original_session.session_status = original_session.session_status.replace(
        "Pending Make-up", "Make-up Booked"
    )
    original_session.rescheduled_to_id = makeup_session.id
    original_session.last_modified_by = current_user.user_email
    original_session.last_modified_time = hk_now()

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        err = str(e)
        if 'unique_active_student_slot' in err:
            raise HTTPException(status_code=409, detail="Student already has an active session at this slot")
        if 'unique_active_makeup_source' in err:
            raise HTTPException(status_code=409, detail="A make-up session already exists for this original session")
        raise

    # Refresh and load relationships for response
    db.refresh(makeup_session)
    db.refresh(original_session)

    # Load relationships for the makeup session
    makeup_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == makeup_session.id).first()

    # Build responses
    makeup_response = _build_session_response(makeup_session, db)
    original_response = _build_session_response(original_session, db)

    # Add linked session info
    original_response.rescheduled_to = _build_linked_session_info(makeup_session, makeup_session.tutor)
    makeup_response.make_up_for = _build_linked_session_info(original_session, original_session.tutor)

    return ScheduleMakeupResponse(
        makeup_session=makeup_response,
        original_session=original_response
    )


@router.delete("/sessions/{makeup_session_id}/cancel-makeup", response_model=SessionResponse)
async def cancel_makeup(
    makeup_session_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Cancel a scheduled make-up session.

    Deletes the make-up session and reverts the original session status
    from "X - Make-up Booked" back to "X - Pending Make-up".
    Requires authentication. Tutors can only cancel makeups for their own sessions.

    Can only cancel make-up sessions that haven't been attended yet.
    """
    # Get the makeup session
    makeup_session = db.query(SessionLog).filter(SessionLog.id == makeup_session_id).first()

    if not makeup_session:
        raise HTTPException(status_code=404, detail=f"Session with ID {makeup_session_id} not found")

    # Check ownership - only makeup session owner or admin can cancel
    is_owner = makeup_session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only cancel makeups for your own sessions")

    # Validate this is a make-up session
    if makeup_session.session_status != "Make-up Class":
        raise HTTPException(
            status_code=400,
            detail=f"Can only cancel make-up sessions, got '{makeup_session.session_status}'"
        )

    # Get the original session
    if not makeup_session.make_up_for_id:
        raise HTTPException(
            status_code=400,
            detail="Make-up session has no linked original session"
        )

    original_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == makeup_session.make_up_for_id).first()

    if not original_session:
        raise HTTPException(
            status_code=404,
            detail=f"Original session with ID {makeup_session.make_up_for_id} not found"
        )

    # Revert original session status
    # "X - Make-up Booked" -> "X - Pending Make-up"
    original_session.session_status = original_session.session_status.replace(
        "Make-up Booked", "Pending Make-up"
    )
    original_session.rescheduled_to_id = None
    original_session.last_modified_by = current_user.user_email
    original_session.last_modified_time = hk_now()

    # Delete the makeup session
    db.delete(makeup_session)

    db.commit()
    db.refresh(original_session)

    return _build_session_response(original_session, db)


@router.put("/sessions/{session_id}/exercises", response_model=SessionResponse)
async def save_session_exercises(
    session_id: int,
    request: ExerciseSaveRequest,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Save exercises (CW or HW) for a session.

    Replaces all exercises of the specified type with the new list.
    Requires authentication. Tutors can only modify their own sessions.

    - **session_id**: The session's database ID
    - **exercise_type**: Type of exercises ("CW" or "HW")
    - **exercises**: List of exercises to save
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Delete existing exercises of this type
    db.query(SessionExercise).filter(
        SessionExercise.session_id == session_id,
        SessionExercise.exercise_type == request.exercise_type
    ).delete(synchronize_session=False)

    # Insert new exercises using short form (CW/HW)
    for ex in request.exercises:
        new_exercise = SessionExercise(
            session_id=session_id,
            exercise_type=request.exercise_type,  # Use CW or HW
            pdf_name=ex.pdf_name,
            page_start=ex.page_start,
            page_end=ex.page_end,
            remarks=ex.remarks,
            # Answer file fields
            answer_pdf_name=ex.answer_pdf_name,
            answer_page_start=ex.answer_page_start,
            answer_page_end=ex.answer_page_end,
            answer_remarks=ex.answer_remarks,
            created_by=current_user.user_email,
            created_at=hk_now()
        )
        db.add(new_exercise)

    # Update audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response (refresh loads exercises relationship)
    session_data = _build_session_response(session, db)

    return session_data


@router.post("/sessions/bulk-assign-exercises", response_model=BulkExerciseAssignResponse)
async def bulk_assign_exercises(
    request: BulkExerciseAssignRequest,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Assign an exercise to multiple sessions at once.

    Creates the same exercise (CW or HW) for each specified session.
    Useful for assigning the same courseware to multiple sessions in bulk.
    Requires authentication. Tutors can only assign to their own sessions.

    - **session_ids**: List of session IDs to assign the exercise to
    - **exercise_type**: Type of exercise ("CW" or "HW")
    - **pdf_name**: PDF filename/path
    - **page_start**: Optional start page
    - **page_end**: Optional end page
    - **remarks**: Optional remarks
    """
    # Rate limit bulk operations
    check_user_rate_limit(current_user.id, "bulk_assign_exercises")

    # Verify all sessions exist
    sessions = db.query(SessionLog).filter(
        SessionLog.id.in_(request.session_ids)
    ).all()

    found_ids = {s.id for s in sessions}
    missing_ids = set(request.session_ids) - found_ids
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Sessions not found: {sorted(missing_ids)}"
        )

    # Check ownership - tutors can only assign to their own sessions
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not is_admin:
        for session in sessions:
            if session.tutor_id != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail=f"You can only assign exercises to your own sessions (session {session.id} belongs to another tutor)"
                )

    # Create exercises for each session
    created_count = 0
    for session_id in request.session_ids:
        new_exercise = SessionExercise(
            session_id=session_id,
            exercise_type=request.exercise_type,
            pdf_name=request.pdf_name,
            page_start=request.page_start,
            page_end=request.page_end,
            remarks=request.remarks,
            created_by=current_user.user_email,
            created_at=hk_now()
        )
        db.add(new_exercise)
        created_count += 1

    db.commit()

    return BulkExerciseAssignResponse(
        created_count=created_count,
        session_ids=request.session_ids
    )


@router.patch("/sessions/{session_id}/rate", response_model=SessionResponse)
async def rate_session(
    session_id: int,
    request: RateSessionRequest,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Rate a session and add notes.

    Updates the performance_rating (emoji stars) and notes fields.
    Requires authentication. Tutors can only rate their own sessions.

    - **session_id**: The session's database ID
    - **performance_rating**: Rating as emoji stars (e.g., "⭐⭐⭐")
    - **notes**: Optional notes/comments
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only rate your own sessions")

    # Update rating and notes
    session.performance_rating = request.performance_rating
    session.notes = request.notes

    # Update audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session, db)

    return session_data


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: int,
    request: SessionUpdate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update session fields.

    Updates any provided fields (non-None values).
    Tracks previous status if session_status changes.
    Requires authentication. Tutors can only modify their own sessions.

    - **session_id**: The session's database ID
    - **session_date**: New session date
    - **time_slot**: New time slot (e.g., "16:45 - 18:15")
    - **location**: New location
    - **tutor_id**: New tutor ID
    - **session_status**: New status
    - **performance_rating**: Rating as emoji stars
    - **notes**: Session notes/comments
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

    # Check ownership
    is_owner = session.tutor_id == current_user.id
    is_admin = current_user.role in ("Admin", "Super Admin")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You can only modify your own sessions")

    # Update fields that are provided (not None)
    if request.session_date is not None:
        # Validate enrollment deadline - ONLY when moving TO regular slot
        # Business rule: Only block scheduling to the student's regular slot (assigned_day + assigned_time)
        # past the enrollment end date. Non-regular slots are allowed past deadline.
        # IMPORTANT: Check against student's CURRENT enrollment (latest by first_lesson_date),
        # not the session's enrollment, to handle cross-enrollment makeups correctly.
        # Only Regular enrollments count - ignore One-Time and Trial
        if session.student_id and request.session_date != session.session_date:
            current_enrollment = db.query(Enrollment).filter(
                Enrollment.student_id == session.student_id,
                Enrollment.enrollment_type == 'Regular',
                Enrollment.payment_status != "Cancelled"
            ).order_by(Enrollment.first_lesson_date.desc()).first()

            if current_enrollment and current_enrollment.assigned_day and current_enrollment.assigned_time:
                # Determine the effective time slot (new one if changing, otherwise current)
                proposed_time = request.time_slot if request.time_slot else session.time_slot
                proposed_day = request.session_date.strftime('%a')
                is_regular_slot = (
                    proposed_day == current_enrollment.assigned_day and
                    proposed_time == current_enrollment.assigned_time
                )

                if is_regular_slot and current_enrollment.first_lesson_date and current_enrollment.lessons_paid:
                    try:
                        effective_end_result = db.execute(text("""
                            SELECT calculate_effective_end_date(
                                :first_lesson_date,
                                :lessons_paid,
                                COALESCE(:extension_weeks, 0)
                            ) as effective_end_date
                        """), {
                            "first_lesson_date": current_enrollment.first_lesson_date,
                            "lessons_paid": current_enrollment.lessons_paid,
                            "extension_weeks": current_enrollment.deadline_extension_weeks or 0
                        }).fetchone()

                        if effective_end_result and effective_end_result.effective_end_date:
                            effective_end_date = effective_end_result.effective_end_date
                            if request.session_date > effective_end_date:
                                raise HTTPException(
                                    status_code=400,
                                    detail={
                                        "error": "ENROLLMENT_DEADLINE_EXCEEDED",
                                        "message": f"Cannot move session to regular slot ({current_enrollment.assigned_day} {current_enrollment.assigned_time}) past enrollment end date ({effective_end_date}). Request a deadline extension first.",
                                        "effective_end_date": str(effective_end_date),
                                        "enrollment_id": current_enrollment.id,
                                        "session_id": session_id,
                                        "extension_required": True
                                    }
                                )
                    except HTTPException:
                        raise  # Re-raise HTTPExceptions
                    except SQLAlchemyError as e:
                        # Log but don't block if SQL function doesn't exist
                        logger.warning(f"Could not check enrollment deadline: {e}")

            # 60-day makeup restriction (Super Admin can override)
            # Only applies to makeup sessions (those with make_up_for_id)
            if session.make_up_for_id:
                is_super_admin = current_user.role == "Super Admin"
                if not is_super_admin:
                    root_original = _find_root_original_session(session, db)
                    days_since_original = (request.session_date - root_original.session_date).days

                    if days_since_original > 60:
                        raise HTTPException(
                            status_code=400,
                            detail={
                                "error": "MAKEUP_60_DAY_EXCEEDED",
                                "message": f"Makeup must be within 60 days of original session ({root_original.session_date}). This would be {days_since_original} days later.",
                                "original_session_id": root_original.id,
                                "original_session_date": str(root_original.session_date),
                                "days_difference": days_since_original,
                                "max_allowed_days": 60
                            }
                        )

        session.session_date = request.session_date

    if request.time_slot is not None:
        session.time_slot = request.time_slot

    if request.location is not None:
        session.location = request.location

    if request.tutor_id is not None:
        session.tutor_id = request.tutor_id

    if request.session_status is not None and request.session_status != session.session_status:
        # Track previous status for undo functionality
        session.previous_session_status = session.session_status
        session.session_status = request.session_status

    if request.performance_rating is not None:
        session.performance_rating = request.performance_rating

    if request.notes is not None:
        session.notes = request.notes

    # Set audit columns
    session.last_modified_by = current_user.user_email
    session.last_modified_time = hk_now()

    # Handle revision slot linking when date/time/location changes
    if any([request.session_date, request.time_slot, request.location]):
        # Check if session already linked - verify it still matches
        if session.exam_revision_slot_id:
            current_slot = db.query(ExamRevisionSlot).filter(
                ExamRevisionSlot.id == session.exam_revision_slot_id
            ).first()
            # Auto-unlink if no longer matches
            if current_slot and (
                current_slot.session_date != session.session_date or
                current_slot.time_slot != session.time_slot or
                current_slot.location != session.location
            ):
                session.exam_revision_slot_id = None

        # Try to auto-link if not linked
        if session.exam_revision_slot_id is None and session.student:
            matching_slot = db.query(ExamRevisionSlot).join(
                CalendarEvent, ExamRevisionSlot.calendar_event_id == CalendarEvent.id
            ).filter(
                ExamRevisionSlot.session_date == session.session_date,
                ExamRevisionSlot.time_slot == session.time_slot,
                ExamRevisionSlot.location == session.location,
                or_(CalendarEvent.school.is_(None), CalendarEvent.school == session.student.school),
                or_(CalendarEvent.grade.is_(None), CalendarEvent.grade == session.student.grade),
                or_(
                    CalendarEvent.academic_stream.is_(None),
                    session.student.grade not in ['F4', 'F5', 'F6'],
                    CalendarEvent.academic_stream == session.student.academic_stream
                )
            ).first()

            if matching_slot:
                session.exam_revision_slot_id = matching_slot.id

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session, db)

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
    except (OSError, SQLAlchemyError) as e:
        # Log but don't fail the request if sync fails (network/db errors)
        logger.warning(f"Calendar sync failed (non-fatal): {e}")

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
    days_behind: int = Query(0, ge=0, le=730, description="Days in past to sync"),
    admin: Tutor = Depends(require_admin_write),
    db: Session = Depends(get_db)
):
    """
    Manually sync calendar events from Google Calendar.

    Requires admin access.

    - **force**: If true, force sync even if last sync was recent
    - **days_behind**: Days in the past to sync (default: 0, max: 730)

    Returns:
    - Number of events synced
    """
    from services.google_calendar_service import sync_calendar_events

    try:
        result = sync_calendar_events(db=db, force_sync=force, days_behind=days_behind)
        return {
            "success": True,
            "events_synced": result["synced"],
            "events_deleted": result["deleted"],
            "message": f"Synced {result['synced']} events, deleted {result['deleted']} orphaned events"
        }
    except (OSError, SQLAlchemyError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync calendar: {str(e)}"
        )


@router.get("/calendar/events", response_model=List[CalendarEventResponse])
async def get_calendar_events(
    days_ahead: int = Query(30, ge=1, le=365, description="Number of days ahead to fetch events"),
    include_past: bool = Query(False, description="Include past events"),
    days_behind: int = Query(365, ge=0, le=730, description="Days in past if include_past=True"),
    db: Session = Depends(get_db)
):
    """
    Get calendar events (tests/exams) within the specified date range.

    - **days_ahead**: Number of days ahead to fetch events (default: 30, max: 365)
    - **include_past**: Include past events (default: False)
    - **days_behind**: Days in the past to include if include_past=True (default: 365)

    Returns:
    - List of calendar events sorted by start date
    """
    from services.google_calendar_service import sync_calendar_events
    from models import CalendarEvent

    # Auto-sync calendar events (respects 15-min TTL)
    # When include_past is True, also sync past events
    try:
        sync_calendar_events(db=db, force_sync=False, days_behind=days_behind if include_past else 0)
    except (OSError, SQLAlchemyError) as e:
        # Log but don't fail if sync fails (network/db errors)
        logger.warning(f"Calendar sync failed (non-fatal): {e}")

    # Fetch events within date range
    end_date = date.today() + timedelta(days=days_ahead)

    if include_past:
        start_date = date.today() - timedelta(days=days_behind)
    else:
        start_date = date.today()

    events = db.query(CalendarEvent).filter(
        CalendarEvent.start_date >= start_date,
        CalendarEvent.start_date <= end_date
    ).order_by(CalendarEvent.start_date).all()

    # Add revision slot counts
    for event in events:
        event.revision_slot_count = len(event.revision_slots) if event.revision_slots else 0

    return events


@router.post("/calendar/events", response_model=CalendarEventResponse)
async def create_calendar_event(
    request: CalendarEventCreate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new calendar event with Google Calendar sync.

    Requires admin role. The event will be:
    1. Created in Google Calendar first
    2. Then saved to local database with the Google event_id

    If Google Calendar sync fails, the event is NOT created.
    """
    from services.google_calendar_service import GoogleCalendarService

    try:
        # Create in Google Calendar first (requires Service Account)
        calendar_service = GoogleCalendarService(use_oauth=True)
        google_event_id = calendar_service.create_event(
            title=request.title,
            start_date=request.start_date,
            end_date=request.end_date,
            description=request.description
        )
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Google Calendar write not configured: {str(e)}"
        )
    except OSError as e:
        logger.error(f"Failed to create event in Google Calendar: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create event in Google Calendar: {str(e)}"
        )

    # Save to local database with Google event_id
    event = CalendarEvent(
        event_id=google_event_id,
        title=request.title,
        description=request.description,
        start_date=request.start_date,
        end_date=request.end_date or request.start_date,
        school=request.school,
        grade=request.grade,
        academic_stream=request.academic_stream,
        event_type=request.event_type,
        last_synced_at=datetime.now(timezone.utc)
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    event.revision_slot_count = 0
    logger.info(f"Created calendar event {event.id} (Google: {google_event_id}) by {current_user.user_email}")
    return event


@router.patch("/calendar/events/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event(
    event_id: int,
    request: CalendarEventUpdate,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a calendar event with Google Calendar sync.

    Requires admin role. The event will be:
    1. Updated in Google Calendar first
    2. Then updated in local database

    If Google Calendar sync fails, the local update is NOT applied.
    """
    from services.google_calendar_service import GoogleCalendarService

    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    # Get update fields
    updates = request.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        # Update in Google Calendar first
        calendar_service = GoogleCalendarService(use_oauth=True)
        calendar_service.update_event(
            event_id=event.event_id,
            title=updates.get('title'),
            start_date=updates.get('start_date'),
            end_date=updates.get('end_date'),
            description=updates.get('description')
        )
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Google Calendar write not configured: {str(e)}"
        )
    except OSError as e:
        logger.error(f"Failed to update event in Google Calendar: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update event in Google Calendar: {str(e)}"
        )

    # Update local database
    for field, value in updates.items():
        setattr(event, field, value)
    event.last_synced_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)

    event.revision_slot_count = len(event.revision_slots) if event.revision_slots else 0
    logger.info(f"Updated calendar event {event.id} by {current_user.user_email}")
    return event


@router.delete("/calendar/events/{event_id}")
async def delete_calendar_event(
    event_id: int,
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a calendar event with Google Calendar sync.

    Requires admin role. The event will be:
    1. Checked for linked revision slots (deletion blocked if any exist)
    2. Deleted from Google Calendar
    3. Deleted from local database

    Returns error if the event has revision slots - they must be removed first.
    """
    from services.google_calendar_service import GoogleCalendarService

    event = db.query(CalendarEvent).options(
        joinedload(CalendarEvent.revision_slots)
    ).filter(CalendarEvent.id == event_id).first()

    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    # Block deletion if event has revision slots
    if event.revision_slots and len(event.revision_slots) > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: event has {len(event.revision_slots)} revision slot(s). Remove them first."
        )

    try:
        # Delete from Google Calendar first
        calendar_service = GoogleCalendarService(use_oauth=True)
        calendar_service.delete_event(event.event_id)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Google Calendar write not configured: {str(e)}"
        )
    except OSError as e:
        # Log warning but continue - event might already be deleted in Google
        logger.warning(f"Failed to delete from Google Calendar (continuing): {e}")

    # Delete from local database
    db.delete(event)
    db.commit()

    logger.info(f"Deleted calendar event {event_id} by {current_user.user_email}")
    return {"message": "Event deleted successfully"}
