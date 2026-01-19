"""
Exam Revision Slots API endpoints.
Allows tutors to create dedicated revision slots linked to upcoming exams,
schedule eligible students into these slots (consuming pending make-ups),
and track enrollment.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_
from typing import List, Optional
from datetime import date, datetime
from database import get_db
from models import (
    ExamRevisionSlot, CalendarEvent, SessionLog, Student, Tutor, Enrollment
)
from schemas import (
    ExamRevisionSlotCreate,
    ExamRevisionSlotUpdate,
    ExamRevisionSlotResponse,
    ExamRevisionSlotDetailResponse,
    EnrolledStudentInfo,
    EligibleStudentResponse,
    PendingSessionInfo,
    EnrollStudentRequest,
    EnrollStudentResponse,
    ExamWithRevisionSlotsResponse,
    CalendarEventResponse,
    SessionResponse,
    SessionExerciseResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_session_response(session: SessionLog) -> SessionResponse:
    """Build a SessionResponse from a SessionLog."""
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
    ] if session.exercises else []
    return data


def _build_slot_response(slot: ExamRevisionSlot, enrolled_count: int = 0) -> ExamRevisionSlotResponse:
    """Build an ExamRevisionSlotResponse from an ExamRevisionSlot."""
    return ExamRevisionSlotResponse(
        id=slot.id,
        calendar_event_id=slot.calendar_event_id,
        session_date=slot.session_date,
        time_slot=slot.time_slot,
        tutor_id=slot.tutor_id,
        tutor_name=slot.tutor.tutor_name if slot.tutor else None,
        location=slot.location,
        notes=slot.notes,
        created_at=slot.created_at,
        created_by=slot.created_by,
        enrolled_count=enrolled_count,
        calendar_event=CalendarEventResponse.model_validate(slot.calendar_event) if slot.calendar_event else None
    )


# ============================================
# Revision Slot CRUD Endpoints
# ============================================

@router.get("/exam-revision/slots", response_model=List[ExamRevisionSlotResponse])
async def get_revision_slots(
    calendar_event_id: Optional[int] = Query(None, description="Filter by calendar event (exam) ID"),
    tutor_id: Optional[int] = Query(None, description="Filter by tutor ID"),
    location: Optional[str] = Query(None, description="Filter by location"),
    from_date: Optional[date] = Query(None, description="Filter slots from this date"),
    to_date: Optional[date] = Query(None, description="Filter slots up to this date"),
    db: Session = Depends(get_db)
):
    """
    Get list of revision slots with optional filters.
    """
    query = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.calendar_event),
        joinedload(ExamRevisionSlot.tutor),
        joinedload(ExamRevisionSlot.sessions)
    )

    if calendar_event_id:
        query = query.filter(ExamRevisionSlot.calendar_event_id == calendar_event_id)
    if tutor_id:
        query = query.filter(ExamRevisionSlot.tutor_id == tutor_id)
    if location:
        query = query.filter(ExamRevisionSlot.location == location)
    if from_date:
        query = query.filter(ExamRevisionSlot.session_date >= from_date)
    if to_date:
        query = query.filter(ExamRevisionSlot.session_date <= to_date)

    query = query.order_by(ExamRevisionSlot.session_date, ExamRevisionSlot.time_slot)
    slots = query.all()

    result = []
    for slot in slots:
        # Count enrolled sessions (those with active statuses)
        enrolled_count = len([
            s for s in slot.sessions
            if s.session_status in ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']
        ])
        result.append(_build_slot_response(slot, enrolled_count))

    return result


@router.post("/exam-revision/slots", response_model=ExamRevisionSlotResponse)
async def create_revision_slot(
    request: ExamRevisionSlotCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new revision slot for an exam.
    """
    # Verify calendar event exists
    calendar_event = db.query(CalendarEvent).filter(
        CalendarEvent.id == request.calendar_event_id
    ).first()
    if not calendar_event:
        raise HTTPException(status_code=404, detail=f"Calendar event with ID {request.calendar_event_id} not found")

    # Verify tutor exists
    tutor = db.query(Tutor).filter(Tutor.id == request.tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor with ID {request.tutor_id} not found")

    # Check for duplicate slot
    existing = db.query(ExamRevisionSlot).filter(
        ExamRevisionSlot.calendar_event_id == request.calendar_event_id,
        ExamRevisionSlot.session_date == request.session_date,
        ExamRevisionSlot.time_slot == request.time_slot,
        ExamRevisionSlot.tutor_id == request.tutor_id,
        ExamRevisionSlot.location == request.location
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A revision slot with these details already exists"
        )

    # Create the slot
    slot = ExamRevisionSlot(
        calendar_event_id=request.calendar_event_id,
        session_date=request.session_date,
        time_slot=request.time_slot,
        tutor_id=request.tutor_id,
        location=request.location,
        notes=request.notes,
        created_by="system@csmpro.app"  # TODO: get from auth
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)

    # Auto-adopt existing matching sessions
    # Build student filter based on calendar event criteria
    student_filters = []
    if calendar_event.school:
        student_filters.append(Student.school == calendar_event.school)
    if calendar_event.grade:
        student_filters.append(Student.grade == calendar_event.grade)
    # Academic stream matching for F4-F6
    if calendar_event.academic_stream and calendar_event.grade in ['F4', 'F5', 'F6']:
        student_filters.append(Student.academic_stream == calendar_event.academic_stream)

    # Find existing sessions at the same date/time/location
    existing_sessions = db.query(SessionLog).join(
        Student, SessionLog.student_id == Student.id
    ).filter(
        SessionLog.session_date == request.session_date,
        SessionLog.time_slot == request.time_slot,
        SessionLog.location == request.location,
        SessionLog.session_status.in_(['Scheduled', 'Make-up Class']),
        SessionLog.exam_revision_slot_id.is_(None),  # Not already linked to a revision slot
        *student_filters
    ).all()

    adopted_count = 0
    for session in existing_sessions:
        session.exam_revision_slot_id = slot.id
        adopted_count += 1

    if adopted_count > 0:
        db.commit()
        logger.info(f"Auto-adopted {adopted_count} existing sessions into revision slot {slot.id}")

    # Load relationships
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.calendar_event),
        joinedload(ExamRevisionSlot.tutor)
    ).filter(ExamRevisionSlot.id == slot.id).first()

    return _build_slot_response(slot, adopted_count)


@router.get("/exam-revision/slots/{slot_id}", response_model=ExamRevisionSlotDetailResponse)
async def get_revision_slot_detail(
    slot_id: int,
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a revision slot including enrolled students.
    """
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.calendar_event),
        joinedload(ExamRevisionSlot.tutor),
        joinedload(ExamRevisionSlot.sessions).joinedload(SessionLog.student)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail=f"Revision slot with ID {slot_id} not found")

    # Build enrolled students list
    enrolled_students = []
    for session in slot.sessions:
        if session.session_status in ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']:
            enrolled_students.append(EnrolledStudentInfo(
                session_id=session.id,
                student_id=session.student_id,
                student_name=session.student.student_name if session.student else "Unknown",
                school_student_id=session.student.school_student_id if session.student else None,
                grade=session.student.grade if session.student else None,
                school=session.student.school if session.student else None,
                lang_stream=session.student.lang_stream if session.student else None,
                academic_stream=session.student.academic_stream if session.student else None,
                session_status=session.session_status,
                consumed_session_id=session.make_up_for_id
            ))

    return ExamRevisionSlotDetailResponse(
        id=slot.id,
        calendar_event_id=slot.calendar_event_id,
        session_date=slot.session_date,
        time_slot=slot.time_slot,
        tutor_id=slot.tutor_id,
        tutor_name=slot.tutor.tutor_name if slot.tutor else None,
        location=slot.location,
        notes=slot.notes,
        created_at=slot.created_at,
        created_by=slot.created_by,
        enrolled_count=len(enrolled_students),
        calendar_event=CalendarEventResponse.model_validate(slot.calendar_event) if slot.calendar_event else None,
        enrolled_students=enrolled_students
    )


@router.delete("/exam-revision/slots/{slot_id}")
async def delete_revision_slot(
    slot_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a revision slot. Can only delete empty slots (no enrolled students).
    """
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.sessions)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail=f"Revision slot with ID {slot_id} not found")

    # Check for enrolled students
    enrolled = [
        s for s in slot.sessions
        if s.session_status in ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']
    ]
    if enrolled:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete slot with {len(enrolled)} enrolled student(s). Remove enrollments first."
        )

    db.delete(slot)
    db.commit()

    return {"message": f"Revision slot {slot_id} deleted successfully"}


# ============================================
# Eligible Students & Enrollment
# ============================================

@router.get("/exam-revision/slots/{slot_id}/eligible-students", response_model=List[EligibleStudentResponse])
async def get_eligible_students(
    slot_id: int,
    db: Session = Depends(get_db)
):
    """
    Get students eligible for enrollment in this revision slot.

    Eligibility criteria:
    1. Student's school, grade, academic_stream (if F4-F6) match the calendar event
    2. Student has an active enrollment at the slot's location
    3. Student has at least one pending make-up session OR unused scheduled/make-up session (future dated)
    4. Student is not already enrolled in this revision slot
    """
    # Get the slot with calendar event
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.calendar_event),
        joinedload(ExamRevisionSlot.sessions)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail=f"Revision slot with ID {slot_id} not found")

    calendar_event = slot.calendar_event
    if not calendar_event:
        raise HTTPException(status_code=400, detail="Revision slot has no associated calendar event")

    # Get IDs of already enrolled students
    already_enrolled_student_ids = {
        s.student_id for s in slot.sessions
        if s.session_status in ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']
    }

    # Build student filter based on calendar event criteria
    student_filters = []
    if calendar_event.school:
        student_filters.append(Student.school == calendar_event.school)
    if calendar_event.grade:
        student_filters.append(Student.grade == calendar_event.grade)
    # Academic stream matching for F4-F6
    if calendar_event.academic_stream and calendar_event.grade in ['F4', 'F5', 'F6']:
        student_filters.append(Student.academic_stream == calendar_event.academic_stream)

    # Find students with active enrollments at this location
    enrolled_students_query = db.query(Student).join(
        Enrollment, Student.id == Enrollment.student_id
    ).filter(
        Enrollment.location == slot.location,
        Enrollment.payment_status.in_(['Paid', 'Pending Payment']),  # Active enrollments
        *student_filters
    ).distinct()

    students = enrolled_students_query.all()

    # For each student, find their pending sessions
    eligible_students = []
    pending_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]
    schedulable_statuses = ['Scheduled', 'Make-up Class']

    for student in students:
        # Skip already enrolled students
        if student.id in already_enrolled_student_ids:
            continue

        # Find pending make-up sessions
        pending_sessions = db.query(SessionLog).options(
            joinedload(SessionLog.tutor)
        ).filter(
            SessionLog.student_id == student.id,
            SessionLog.location == slot.location,
            or_(
                # Pending make-up sessions (any date)
                and_(
                    SessionLog.session_status.in_(pending_statuses),
                    SessionLog.rescheduled_to_id.is_(None)  # Not already booked
                ),
                # Future scheduled/make-up sessions that could be used
                and_(
                    SessionLog.session_status.in_(schedulable_statuses),
                    SessionLog.session_date > date.today()
                )
            )
        ).order_by(SessionLog.session_date).all()

        if pending_sessions:
            eligible_students.append(EligibleStudentResponse(
                student_id=student.id,
                student_name=student.student_name,
                school_student_id=student.school_student_id,
                grade=student.grade,
                school=student.school,
                lang_stream=student.lang_stream,
                academic_stream=student.academic_stream,
                pending_sessions=[
                    PendingSessionInfo(
                        id=s.id,
                        session_date=s.session_date,
                        time_slot=s.time_slot,
                        session_status=s.session_status,
                        tutor_name=s.tutor.tutor_name if s.tutor else None,
                        location=s.location
                    )
                    for s in pending_sessions
                ]
            ))

    # Sort by student name
    eligible_students.sort(key=lambda s: s.student_name)

    return eligible_students


@router.get("/exam-revision/calendar/{event_id}/eligible-students", response_model=List[EligibleStudentResponse])
async def get_eligible_students_by_exam(
    event_id: int,
    location: str = Query(..., description="Location to filter students by"),
    db: Session = Depends(get_db)
):
    """
    Get students eligible for revision slots for a specific exam (calendar event).

    This endpoint allows viewing eligible students WITHOUT requiring a slot to exist first.

    Eligibility criteria:
    1. Student's school, grade, academic_stream (if F4-F6) match the calendar event
    2. Student has an active enrollment at the specified location
    3. Student has at least one pending make-up session OR unused scheduled/make-up session (future dated)
    """
    # Get the calendar event
    calendar_event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id
    ).first()

    if not calendar_event:
        raise HTTPException(status_code=404, detail=f"Calendar event with ID {event_id} not found")

    # Build student filter based on calendar event criteria
    student_filters = []
    if calendar_event.school:
        student_filters.append(Student.school == calendar_event.school)
    if calendar_event.grade:
        student_filters.append(Student.grade == calendar_event.grade)
    # Academic stream matching for F4-F6
    if calendar_event.academic_stream and calendar_event.grade in ['F4', 'F5', 'F6']:
        student_filters.append(Student.academic_stream == calendar_event.academic_stream)

    # Find students with active enrollments at this location
    enrolled_students_query = db.query(Student).join(
        Enrollment, Student.id == Enrollment.student_id
    ).filter(
        Enrollment.location == location,
        Enrollment.payment_status.in_(['Paid', 'Pending Payment']),  # Active enrollments
        *student_filters
    ).distinct()

    students = enrolled_students_query.all()

    # For each student, find their pending sessions
    eligible_students = []
    pending_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]
    schedulable_statuses = ['Scheduled', 'Make-up Class']

    for student in students:
        # Find pending make-up sessions
        pending_sessions = db.query(SessionLog).options(
            joinedload(SessionLog.tutor)
        ).filter(
            SessionLog.student_id == student.id,
            SessionLog.location == location,
            or_(
                # Pending make-up sessions (any date)
                and_(
                    SessionLog.session_status.in_(pending_statuses),
                    SessionLog.rescheduled_to_id.is_(None)  # Not already booked
                ),
                # Future scheduled/make-up sessions that could be used
                and_(
                    SessionLog.session_status.in_(schedulable_statuses),
                    SessionLog.session_date > date.today()
                )
            )
        ).order_by(SessionLog.session_date).all()

        if pending_sessions:
            eligible_students.append(EligibleStudentResponse(
                student_id=student.id,
                student_name=student.student_name,
                school_student_id=student.school_student_id,
                grade=student.grade,
                school=student.school,
                lang_stream=student.lang_stream,
                academic_stream=student.academic_stream,
                pending_sessions=[
                    PendingSessionInfo(
                        id=s.id,
                        session_date=s.session_date,
                        time_slot=s.time_slot,
                        session_status=s.session_status,
                        tutor_name=s.tutor.tutor_name if s.tutor else None,
                        location=s.location
                    )
                    for s in pending_sessions
                ]
            ))

    # Sort by student name
    eligible_students.sort(key=lambda s: s.student_name)

    return eligible_students


@router.post("/exam-revision/slots/{slot_id}/enroll", response_model=EnrollStudentResponse)
async def enroll_student(
    slot_id: int,
    request: EnrollStudentRequest,
    db: Session = Depends(get_db)
):
    """
    Enroll a student in a revision slot by consuming one of their pending sessions.

    Creates a new session linked to both the revision slot and the consumed session.
    Updates the consumed session status from "Pending Make-up" to "Make-up Booked".
    """
    # Get the revision slot
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.calendar_event),
        joinedload(ExamRevisionSlot.tutor),
        joinedload(ExamRevisionSlot.sessions)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail=f"Revision slot with ID {slot_id} not found")

    # Check if student is already enrolled
    already_enrolled = any(
        s.student_id == request.student_id and
        s.session_status in ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']
        for s in slot.sessions
    )
    if already_enrolled:
        raise HTTPException(
            status_code=400,
            detail="Student is already enrolled in this revision slot"
        )

    # Get the session to consume
    consume_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == request.consume_session_id).first()

    if not consume_session:
        raise HTTPException(
            status_code=404,
            detail=f"Session with ID {request.consume_session_id} not found"
        )

    # Validate the session belongs to the student
    if consume_session.student_id != request.student_id:
        raise HTTPException(
            status_code=400,
            detail="The session to consume does not belong to this student"
        )

    # Validate the session can be consumed
    pending_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]
    schedulable_statuses = ['Scheduled', 'Make-up Class']

    is_pending_makeup = (
        consume_session.session_status in pending_statuses and
        consume_session.rescheduled_to_id is None
    )
    is_future_scheduled = (
        consume_session.session_status in schedulable_statuses and
        consume_session.session_date > date.today()
    )

    if not (is_pending_makeup or is_future_scheduled):
        raise HTTPException(
            status_code=400,
            detail=f"Session cannot be consumed. Status: {consume_session.session_status}"
        )

    # Get the student for enrollment lookup
    student = db.query(Student).filter(Student.id == request.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with ID {request.student_id} not found")

    # Find the student's enrollment at this location
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == request.student_id,
        Enrollment.location == slot.location,
        Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
    ).first()

    # Create the revision session
    revision_session = SessionLog(
        enrollment_id=enrollment.id if enrollment else consume_session.enrollment_id,
        student_id=request.student_id,
        tutor_id=slot.tutor_id,
        session_date=slot.session_date,
        time_slot=slot.time_slot,
        location=slot.location,
        session_status="Make-up Class",  # Revision sessions are make-up sessions
        financial_status="Unpaid",
        make_up_for_id=consume_session.id,
        exam_revision_slot_id=slot.id,
        notes=request.notes,
        last_modified_by="system@csmpro.app",
        last_modified_time=datetime.now()
    )
    db.add(revision_session)
    db.flush()  # Get the ID

    # Update the consumed session
    if is_pending_makeup:
        # Change from "X - Pending Make-up" to "X - Make-up Booked"
        consume_session.session_status = consume_session.session_status.replace(
            "Pending Make-up", "Make-up Booked"
        )
        consume_session.rescheduled_to_id = revision_session.id
    else:
        # For future scheduled sessions, mark as rescheduled
        consume_session.previous_session_status = consume_session.session_status
        consume_session.session_status = "Rescheduled - Make-up Booked"
        consume_session.rescheduled_to_id = revision_session.id

    consume_session.last_modified_by = "system@csmpro.app"
    consume_session.last_modified_time = datetime.now()

    db.commit()

    # Refresh and load relationships for response
    revision_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == revision_session.id).first()

    consume_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises)
    ).filter(SessionLog.id == consume_session.id).first()

    return EnrollStudentResponse(
        revision_session=_build_session_response(revision_session),
        consumed_session=_build_session_response(consume_session)
    )


@router.delete("/exam-revision/slots/{slot_id}/enrollments/{session_id}")
async def remove_enrollment(
    slot_id: int,
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Remove a student's enrollment from a revision slot.

    Deletes the revision session and reverts the consumed session's status
    back to "Pending Make-up".
    """
    # Get the revision session
    revision_session = db.query(SessionLog).filter(
        SessionLog.id == session_id,
        SessionLog.exam_revision_slot_id == slot_id
    ).first()

    if not revision_session:
        raise HTTPException(
            status_code=404,
            detail=f"Enrollment session {session_id} not found in slot {slot_id}"
        )

    # Can only remove if not yet attended
    if revision_session.session_status in ['Attended', 'Attended (Make-up)']:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove enrollment for attended session"
        )

    # Revert the consumed session if it exists
    if revision_session.make_up_for_id:
        consumed_session = db.query(SessionLog).filter(
            SessionLog.id == revision_session.make_up_for_id
        ).first()
        if consumed_session:
            # Revert status from "X - Make-up Booked" to "X - Pending Make-up"
            consumed_session.session_status = consumed_session.session_status.replace(
                "Make-up Booked", "Pending Make-up"
            )
            consumed_session.rescheduled_to_id = None
            consumed_session.last_modified_by = "system@csmpro.app"
            consumed_session.last_modified_time = datetime.now()

    # Delete the revision session
    db.delete(revision_session)
    db.commit()

    return {"message": f"Enrollment removed from slot {slot_id}"}


# ============================================
# Calendar View with Revision Summaries
# ============================================

@router.get("/exam-revision/calendar", response_model=List[ExamWithRevisionSlotsResponse])
async def get_exams_with_revision_slots(
    school: Optional[str] = Query(None, description="Filter by school"),
    grade: Optional[str] = Query(None, description="Filter by grade"),
    location: Optional[str] = Query(None, description="Filter slots by location"),
    from_date: Optional[date] = Query(None, description="Filter exams from this date"),
    to_date: Optional[date] = Query(None, description="Filter exams up to this date"),
    db: Session = Depends(get_db)
):
    """
    Get upcoming exams with their revision slot summaries.

    Returns calendar events that have exam/test type with their associated
    revision slots, enrollment counts, and eligible student counts.
    """
    # Default date range: from today to 60 days ahead
    if not from_date:
        from_date = date.today()
    if not to_date:
        to_date = date.today()
        # Extend to 60 days for a reasonable range
        from datetime import timedelta
        to_date = from_date + timedelta(days=60)

    # Query calendar events (exams)
    query = db.query(CalendarEvent).options(
        joinedload(CalendarEvent.revision_slots).joinedload(ExamRevisionSlot.tutor),
        joinedload(CalendarEvent.revision_slots).joinedload(ExamRevisionSlot.sessions)
    ).filter(
        CalendarEvent.start_date >= from_date,
        CalendarEvent.start_date <= to_date,
        CalendarEvent.event_type.in_(['Test', 'Quiz', 'Exam', 'Final Exam', 'Mid-term', 'Mock'])
    )

    if school:
        query = query.filter(CalendarEvent.school == school)
    if grade:
        query = query.filter(CalendarEvent.grade == grade)

    query = query.order_by(CalendarEvent.start_date)
    events = query.all()

    result = []
    for event in events:
        # Filter slots by location if specified
        slots = event.revision_slots
        if location:
            slots = [s for s in slots if s.location == location]

        # Build slot responses
        slot_responses = []
        total_enrolled = 0
        for slot in slots:
            enrolled_count = len([
                s for s in slot.sessions
                if s.session_status in ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']
            ])
            total_enrolled += enrolled_count
            slot_responses.append(ExamRevisionSlotResponse(
                id=slot.id,
                calendar_event_id=slot.calendar_event_id,
                session_date=slot.session_date,
                time_slot=slot.time_slot,
                tutor_id=slot.tutor_id,
                tutor_name=slot.tutor.tutor_name if slot.tutor else None,
                location=slot.location,
                notes=slot.notes,
                created_at=slot.created_at,
                created_by=slot.created_by,
                enrolled_count=enrolled_count
            ))

        # Calculate eligible count (students matching criteria with pending sessions)
        # This is a simplified count - for full list, use the eligible-students endpoint
        eligible_count = _count_eligible_students(db, event, location)

        result.append(ExamWithRevisionSlotsResponse(
            id=event.id,
            event_id=event.event_id,
            title=event.title,
            description=event.description,
            start_date=event.start_date,
            end_date=event.end_date,
            school=event.school,
            grade=event.grade,
            academic_stream=event.academic_stream,
            event_type=event.event_type,
            revision_slots=slot_responses,
            total_enrolled=total_enrolled,
            eligible_count=eligible_count
        ))

    return result


def _count_eligible_students(
    db: Session,
    calendar_event: CalendarEvent,
    location: Optional[str] = None
) -> int:
    """
    Count students eligible for revision slots for this calendar event.
    Excludes students already enrolled in revision slots for this event.
    """
    # Get students already enrolled in revision slots for this calendar event
    enrolled_statuses = ['Scheduled', 'Make-up Class', 'Attended', 'Attended (Make-up)']
    already_enrolled_subquery = db.query(SessionLog.student_id).join(
        ExamRevisionSlot, SessionLog.exam_revision_slot_id == ExamRevisionSlot.id
    ).filter(
        ExamRevisionSlot.calendar_event_id == calendar_event.id,
        SessionLog.session_status.in_(enrolled_statuses)
    ).distinct()

    # Build student filter based on calendar event criteria
    student_filters = []
    if calendar_event.school:
        student_filters.append(Student.school == calendar_event.school)
    if calendar_event.grade:
        student_filters.append(Student.grade == calendar_event.grade)
    if calendar_event.academic_stream and calendar_event.grade in ['F4', 'F5', 'F6']:
        student_filters.append(Student.academic_stream == calendar_event.academic_stream)

    # Get students who have pending sessions
    pending_statuses = [
        'Rescheduled - Pending Make-up',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Pending Make-up'
    ]

    # Subquery for students with pending sessions
    student_ids_with_pending = db.query(SessionLog.student_id).filter(
        or_(
            and_(
                SessionLog.session_status.in_(pending_statuses),
                SessionLog.rescheduled_to_id.is_(None)
            ),
            and_(
                SessionLog.session_status.in_(['Scheduled', 'Make-up Class']),
                SessionLog.session_date > date.today()
            )
        )
    )
    if location:
        student_ids_with_pending = student_ids_with_pending.filter(SessionLog.location == location)

    student_ids_with_pending = student_ids_with_pending.distinct()

    # Count students matching criteria who have pending sessions, excluding already enrolled
    count = db.query(func.count(func.distinct(Student.id))).join(
        Enrollment, Student.id == Enrollment.student_id
    ).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment']),
        Student.id.in_(student_ids_with_pending),
        ~Student.id.in_(already_enrolled_subquery),  # Exclude already enrolled students
        *student_filters
    )

    if location:
        count = count.filter(Enrollment.location == location)

    return count.scalar() or 0
