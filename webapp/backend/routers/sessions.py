"""
Sessions API endpoints.
Provides read-only access to session log data.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import date
from database import get_db
from models import SessionLog, Student, Tutor, SessionExercise, HomeworkCompletion, HomeworkToCheck, SessionCurriculumSuggestion, Holiday
from schemas import SessionResponse, DetailedSessionResponse, SessionExerciseResponse, HomeworkCompletionResponse, CurriculumSuggestionResponse, UpcomingTestAlert, CalendarEventResponse, LinkedSessionInfo, ExerciseSaveRequest, RateSessionRequest, SessionUpdate, BulkExerciseAssignRequest, BulkExerciseAssignResponse, MakeupSlotSuggestion, StudentInSlot, ScheduleMakeupRequest, ScheduleMakeupResponse
from datetime import date, timedelta, datetime

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_linked_session_info(session: SessionLog, tutor: Tutor = None) -> LinkedSessionInfo:
    """Build a LinkedSessionInfo object from a session."""
    return LinkedSessionInfo(
        id=session.id,
        session_date=session.session_date,
        time_slot=session.time_slot,
        tutor_name=tutor.tutor_name if tutor else None,
        session_status=session.session_status
    )


def _build_session_response(session: SessionLog) -> SessionResponse:
    """
    Build a SessionResponse from a SessionLog with student/tutor/exercise data.

    Centralizes the common pattern of populating student fields, tutor name,
    and exercises from the loaded session relationships.
    """
    data = SessionResponse.model_validate(session)
    data.student_name = session.student.student_name if session.student else None
    data.tutor_name = session.tutor.tutor_name if session.tutor else None
    data.school_student_id = session.student.school_student_id if session.student else None
    data.grade = session.student.grade if session.student else None
    data.lang_stream = session.student.lang_stream if session.student else None
    data.school = session.student.school if session.student else None
    data.exercises = [
        SessionExerciseResponse.model_validate(ex)
        for ex in session.exercises
    ]
    return data


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
        session_data = _build_session_response(session)

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


@router.patch("/sessions/{session_id}/attended", response_model=SessionResponse)
async def mark_session_attended(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Mark a session as attended.

    Updates session status based on current status:
    - Scheduled -> Attended
    - Trial Class -> Attended
    - Make-up Class -> Attended (Make-up)

    Also sets attendance tracking fields and audit columns.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

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
    session.attendance_marked_by = "system@csmpro.app"  # TODO: get from auth when available
    session.attendance_mark_time = datetime.now()

    # Set audit columns
    session.last_modified_by = "system@csmpro.app"  # TODO: get from auth when available
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response with related data
    session_data = _build_session_response(session)

    return session_data


@router.patch("/sessions/{session_id}/no-show", response_model=SessionResponse)
async def mark_session_no_show(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Mark a session as No Show.

    Updates session status to 'No Show' from valid starting statuses.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

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
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session)

    return session_data


@router.patch("/sessions/{session_id}/reschedule", response_model=SessionResponse)
async def mark_session_rescheduled(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Mark a session as Rescheduled - Pending Make-up.

    Updates session status to indicate it needs a make-up class scheduled.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

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
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session)

    return session_data


@router.patch("/sessions/{session_id}/sick-leave", response_model=SessionResponse)
async def mark_session_sick_leave(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Mark a session as Sick Leave - Pending Make-up.

    Updates session status to indicate student was sick and needs make-up.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

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
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session)

    return session_data


@router.patch("/sessions/{session_id}/weather-cancelled", response_model=SessionResponse)
async def mark_session_weather_cancelled(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Mark a session as Weather Cancelled - Pending Make-up.

    Updates session status to indicate class was cancelled due to weather.
    """
    session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

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
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session)

    return session_data


# ============================================
# Make-up Scheduling Endpoints
# ============================================

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
    days_ahead: int = Query(30, ge=1, le=60, description="Days ahead to search for slots"),
    limit: int = Query(10, ge=1, le=20, description="Maximum suggestions to return"),
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

    # Get all sessions in the date range at same location with active statuses
    active_statuses = ["Scheduled", "Make-up Class"]
    sessions = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.location == location,
        SessionLog.session_date >= start_date,
        SessionLog.session_date <= end_date,
        SessionLog.session_status.in_(active_statuses)
    ).all()

    # Get holidays in the range
    holidays = db.query(Holiday).filter(
        Holiday.holiday_date >= start_date,
        Holiday.holiday_date <= end_date
    ).all()
    holiday_dates = {h.holiday_date for h in holidays}

    # Group sessions by (date, time_slot, tutor_id)
    from collections import defaultdict
    slots = defaultdict(list)
    for session in sessions:
        key = (session.session_date, session.time_slot, session.tutor_id)
        slots[key].append(session)

    # Get all tutors at this location
    tutors = db.query(Tutor).filter(Tutor.default_location == location).all()
    tutor_map = {t.id: t for t in tutors}

    # Get common time slots from existing sessions
    time_slots = set()
    for session in sessions:
        if session.time_slot:
            time_slots.add(session.time_slot)

    # Generate scored suggestions
    suggestions = []
    for (slot_date, time_slot, tutor_id), slot_sessions in slots.items():
        # Skip holidays
        if slot_date in holiday_dates:
            continue

        # Skip if full (8 or more students)
        if len(slot_sessions) >= 8:
            continue

        tutor = tutor_map.get(tutor_id)
        if not tutor:
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

        # Calculate a default score for initial sorting
        # Frontend can re-sort with different weights
        default_score = 0
        if raw_data["is_same_tutor"]:
            default_score += 100
        default_score += min(raw_data["matching_grade_count"] * 20, 60)
        default_score += min(raw_data["matching_school_count"] * 15, 45)
        default_score += min(raw_data["matching_lang_count"] * 10, 30)
        default_score += max(0, 30 * (30 - raw_data["days_away"]) / 30)  # Sooner date bonus
        default_score += (8 - raw_data["current_students"]) * 10  # Capacity bonus

        suggestions.append(MakeupSlotSuggestion(
            session_date=slot_date,
            time_slot=time_slot,
            tutor_id=tutor_id,
            tutor_name=tutor.tutor_name,
            location=location,
            current_students=len(active_students),
            available_spots=8 - len(active_students),
            compatibility_score=int(default_score),
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

    # Sort by score descending, then by date
    suggestions.sort(key=lambda s: (-s.compatibility_score, s.session_date))

    return suggestions[:limit]


@router.post("/sessions/{session_id}/schedule-makeup", response_model=ScheduleMakeupResponse)
async def schedule_makeup(
    session_id: int,
    request: ScheduleMakeupRequest,
    db: Session = Depends(get_db)
):
    """
    Schedule a make-up session for a pending make-up.

    Creates a new session with status "Make-up Class" and links it to the original.
    Updates the original session status from "X - Pending Make-up" to "X - Make-up Booked".

    Validates:
    - Original session is in "Pending Make-up" status
    - No make-up already scheduled (1:1 relationship)
    - Target date is not a holiday
    - Student doesn't have active session at that slot (unless it's also rescheduled)
    """
    # Get the original session
    original_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == session_id).first()

    if not original_session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found")

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

    # Check for holiday
    holiday = db.query(Holiday).filter(
        Holiday.holiday_date == request.session_date
    ).first()
    if holiday:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot schedule on holiday: {holiday.holiday_name}"
        )

    # Check for student conflict at the target slot
    # Allow if the existing session is also in "Pending Make-up" status (that slot is free)
    existing_session = db.query(SessionLog).filter(
        SessionLog.student_id == original_session.student_id,
        SessionLog.session_date == request.session_date,
        SessionLog.time_slot == request.time_slot,
        SessionLog.location == request.location
    ).first()

    if existing_session:
        if "Pending Make-up" not in existing_session.session_status:
            raise HTTPException(
                status_code=400,
                detail=f"Student already has a session at this slot (Session #{existing_session.id})"
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
        financial_status="Unpaid",  # Inherits from original or set to Unpaid
        make_up_for_id=original_session.id,
        notes=request.notes,  # Optional reason for scheduling
        last_modified_by="system@csmpro.app",
        last_modified_time=datetime.now()
    )
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
    original_session.last_modified_by = "system@csmpro.app"
    original_session.last_modified_time = datetime.now()

    db.commit()

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
    makeup_response = _build_session_response(makeup_session)
    original_response = _build_session_response(original_session)

    # Add linked session info
    original_response.rescheduled_to = _build_linked_session_info(makeup_session, makeup_session.tutor)
    makeup_response.make_up_for = _build_linked_session_info(original_session, original_session.tutor)

    return ScheduleMakeupResponse(
        makeup_session=makeup_response,
        original_session=original_response
    )


@router.put("/sessions/{session_id}/exercises", response_model=SessionResponse)
async def save_session_exercises(
    session_id: int,
    request: ExerciseSaveRequest,
    db: Session = Depends(get_db)
):
    """
    Save exercises (CW or HW) for a session.

    Replaces all exercises of the specified type with the new list.

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
            created_by="system@csmpro.app",  # TODO: get from auth when available
            created_at=datetime.now()
        )
        db.add(new_exercise)

    # Update audit columns
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response (refresh loads exercises relationship)
    session_data = _build_session_response(session)

    return session_data


@router.post("/sessions/bulk-assign-exercises", response_model=BulkExerciseAssignResponse)
async def bulk_assign_exercises(
    request: BulkExerciseAssignRequest,
    db: Session = Depends(get_db)
):
    """
    Assign an exercise to multiple sessions at once.

    Creates the same exercise (CW or HW) for each specified session.
    Useful for assigning the same courseware to multiple sessions in bulk.

    - **session_ids**: List of session IDs to assign the exercise to
    - **exercise_type**: Type of exercise ("CW" or "HW")
    - **pdf_name**: PDF filename/path
    - **page_start**: Optional start page
    - **page_end**: Optional end page
    - **remarks**: Optional remarks
    """
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
            created_by="system@csmpro.app",  # TODO: get from auth when available
            created_at=datetime.now()
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
    db: Session = Depends(get_db)
):
    """
    Rate a session and add notes.

    Updates the performance_rating (emoji stars) and notes fields.

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

    # Update rating and notes
    session.performance_rating = request.performance_rating
    session.notes = request.notes

    # Update audit columns
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session)

    return session_data


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: int,
    request: SessionUpdate,
    db: Session = Depends(get_db)
):
    """
    Update session fields.

    Updates any provided fields (non-None values).
    Tracks previous status if session_status changes.

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

    # Update fields that are provided (not None)
    if request.session_date is not None:
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
    session.last_modified_by = "system@csmpro.app"
    session.last_modified_time = datetime.now()

    db.commit()
    db.refresh(session)

    # Build response
    session_data = _build_session_response(session)

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
        logger.warning(f"Calendar sync failed (non-fatal): {e}")

    # Fetch all events within date range
    start_date = date.today()
    end_date = start_date + timedelta(days=days_ahead)

    events = db.query(CalendarEvent).filter(
        CalendarEvent.start_date >= start_date,
        CalendarEvent.start_date <= end_date
    ).order_by(CalendarEvent.start_date).all()

    return events
