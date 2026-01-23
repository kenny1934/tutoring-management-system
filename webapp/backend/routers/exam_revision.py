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
from sqlalchemy.exc import IntegrityError
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
from utils.response_builders import build_session_response as _build_session_response
from constants import ENROLLED_SESSION_STATUSES, PENDING_MAKEUP_STATUSES, SCHEDULABLE_STATUSES

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_student_filters_from_event(calendar_event: CalendarEvent) -> list:
    """Build SQLAlchemy filter conditions for students matching calendar event criteria."""
    filters = []
    if calendar_event.school:
        filters.append(Student.school == calendar_event.school)
    if calendar_event.grade:
        filters.append(Student.grade == calendar_event.grade)
    # Academic stream matching for F4-F6
    if calendar_event.academic_stream and calendar_event.grade in ['F4', 'F5', 'F6']:
        filters.append(Student.academic_stream == calendar_event.academic_stream)
    return filters


def _get_consumable_sessions_query(
    db: Session,
    student_id: int,
    location: Optional[str] = None
):
    """
    Build query for sessions that can be consumed for revision enrollment.

    Returns sessions that are either:
    - Pending make-up sessions (any date, not already booked)
    - Future scheduled/make-up sessions

    If location is None, returns sessions from all locations.
    """
    query = db.query(SessionLog).options(
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.student_id == student_id,
        or_(
            and_(
                SessionLog.session_status.in_(PENDING_MAKEUP_STATUSES),
                SessionLog.rescheduled_to_id.is_(None)
            ),
            and_(
                SessionLog.session_status.in_(SCHEDULABLE_STATUSES),
                SessionLog.session_date > date.today()
            )
        )
    )
    if location:
        query = query.filter(SessionLog.location == location)
    return query


def _is_session_consumable(session: SessionLog) -> bool:
    """Check if a session can be consumed for revision enrollment."""
    is_pending = (
        session.session_status in PENDING_MAKEUP_STATUSES and
        session.rescheduled_to_id is None
    )
    is_future = (
        session.session_status in SCHEDULABLE_STATUSES and
        session.session_date > date.today()
    )
    return is_pending or is_future


def _parse_time_slot(time_slot: str) -> tuple[int, int]:
    """
    Parse a time slot string like "16:45 - 18:15" into start and end minutes from midnight.
    Returns (start_minutes, end_minutes).
    """
    try:
        parts = time_slot.split(' - ')
        if len(parts) != 2:
            return (0, 0)
        start_h, start_m = map(int, parts[0].strip().split(':'))
        end_h, end_m = map(int, parts[1].strip().split(':'))
        return (start_h * 60 + start_m, end_h * 60 + end_m)
    except (ValueError, IndexError):
        return (0, 0)


def _times_overlap(slot1: str, slot2: str) -> bool:
    """Check if two time slots overlap."""
    start1, end1 = _parse_time_slot(slot1)
    start2, end2 = _parse_time_slot(slot2)
    # If parsing failed, assume no overlap
    if (start1, end1) == (0, 0) or (start2, end2) == (0, 0):
        return False
    # Overlap occurs when one slot starts before the other ends and vice versa
    return start1 < end2 and start2 < end1


def _build_slot_response(
    slot: ExamRevisionSlot,
    enrolled_count: int = 0,
    warning: Optional[str] = None
) -> ExamRevisionSlotResponse:
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
        calendar_event=CalendarEventResponse.model_validate(slot.calendar_event) if slot.calendar_event else None,
        warning=warning
    )


def _check_tutor_conflicts(
    db: Session,
    tutor_id: int,
    session_date: date,
    time_slot: str,
) -> List[dict]:
    """
    Check if the tutor has regular sessions that conflict with the given date/time.
    Returns a list of conflicting session details.
    """
    # Query regular sessions (not revision slots) for this tutor on this date
    conflicting_sessions = db.query(SessionLog).options(
        joinedload(SessionLog.student)
    ).filter(
        SessionLog.tutor_id == tutor_id,
        SessionLog.session_date == session_date,
        SessionLog.exam_revision_slot_id.is_(None),  # Regular sessions only
        SessionLog.session_status.in_(['Scheduled', 'Make-up Class', 'Rescheduled'])
    ).all()

    conflicts = []
    for session in conflicting_sessions:
        if session.time_slot and _times_overlap(time_slot, session.time_slot):
            conflicts.append({
                "session_id": session.id,
                "student_name": session.student.student_name if session.student else "Unknown",
                "time_slot": session.time_slot,
                "status": session.session_status,
            })

    return conflicts


def _check_student_conflicts(
    db: Session,
    student_id: int,
    session_date: date,
    time_slot: str,
    exclude_session_id: Optional[int] = None
) -> List[dict]:
    """
    Check if the student has existing sessions that conflict with the given date/time.
    Returns a list of conflicting session details.

    Args:
        db: Database session
        student_id: Student to check
        session_date: Date of the proposed session
        time_slot: Time slot of the proposed session
        exclude_session_id: Optional session ID to exclude (e.g., the session being consumed)
    """
    query = db.query(SessionLog).options(
        joinedload(SessionLog.tutor)
    ).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date == session_date,
        SessionLog.session_status.in_(['Scheduled', 'Make-up Class', 'Rescheduled'])
    )

    if exclude_session_id:
        query = query.filter(SessionLog.id != exclude_session_id)

    existing_sessions = query.all()
    conflicts = []
    for session in existing_sessions:
        if session.time_slot and _times_overlap(time_slot, session.time_slot):
            conflicts.append({
                "session_id": session.id,
                "tutor_name": session.tutor.tutor_name if session.tutor else "Unknown",
                "time_slot": session.time_slot,
                "location": session.location,
            })

    return conflicts


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
            if s.session_status in ENROLLED_SESSION_STATUSES
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

    # Check for overlapping slots (same date/location, overlapping time)
    overlap_warning = None
    other_slots = db.query(ExamRevisionSlot).filter(
        ExamRevisionSlot.calendar_event_id == request.calendar_event_id,
        ExamRevisionSlot.session_date == request.session_date,
        ExamRevisionSlot.location == request.location
    ).all()
    overlapping = [s for s in other_slots if _times_overlap(request.time_slot, s.time_slot)]
    if overlapping:
        overlap_info = ", ".join([f"{s.time_slot} ({s.tutor.tutor_name if s.tutor else 'Unknown'})" for s in overlapping])
        overlap_warning = f"Overlapping slot(s) at same location: {overlap_info}"

    # Check for tutor conflicts with regular sessions
    tutor_conflicts = _check_tutor_conflicts(db, request.tutor_id, request.session_date, request.time_slot)
    if tutor_conflicts:
        conflict_info = ", ".join([f"{c['student_name']} ({c['time_slot']})" for c in tutor_conflicts])
        conflict_warning = f"Tutor has {len(tutor_conflicts)} conflicting session(s): {conflict_info}"
        if overlap_warning:
            overlap_warning = f"{overlap_warning}. {conflict_warning}"
        else:
            overlap_warning = conflict_warning

    # Create the slot
    slot = ExamRevisionSlot(
        calendar_event_id=request.calendar_event_id,
        session_date=request.session_date,
        time_slot=request.time_slot,
        tutor_id=request.tutor_id,
        location=request.location,
        notes=request.notes,
        created_by=request.created_by or "system@csmpro.app"
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)

    # Auto-adopt existing matching sessions
    student_filters = _build_student_filters_from_event(calendar_event)

    # Find existing sessions at the same date/time/location
    existing_sessions = db.query(SessionLog).join(
        Student, SessionLog.student_id == Student.id
    ).filter(
        SessionLog.session_date == request.session_date,
        SessionLog.time_slot == request.time_slot,
        SessionLog.location == request.location,
        SessionLog.session_status.in_(SCHEDULABLE_STATUSES),
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

    return _build_slot_response(slot, adopted_count, overlap_warning)


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
        if session.session_status in ENROLLED_SESSION_STATUSES:
            enrolled_students.append(EnrolledStudentInfo(
                session_id=session.id,
                student_id=session.student_id,
                student_name=session.student.student_name if session.student else "Unknown",
                school_student_id=session.student.school_student_id if session.student else None,
                grade=session.student.grade if session.student else None,
                school=session.student.school if session.student else None,
                lang_stream=session.student.lang_stream if session.student else None,
                academic_stream=session.student.academic_stream if session.student else None,
                home_location=session.student.home_location if session.student else None,
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


@router.patch("/exam-revision/slots/{slot_id}", response_model=ExamRevisionSlotResponse)
async def update_revision_slot(
    slot_id: int,
    update: ExamRevisionSlotUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a revision slot's details.

    If the slot has enrolled students, date/time/location changes are restricted.
    Tutor and notes can always be updated.
    """
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.sessions),
        joinedload(ExamRevisionSlot.tutor),
        joinedload(ExamRevisionSlot.calendar_event)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail=f"Revision slot with ID {slot_id} not found")

    # Check for enrolled students
    enrolled_count = len([
        s for s in slot.sessions
        if s.session_status in ENROLLED_SESSION_STATUSES
    ])

    # Restrict date/time/location changes if students are enrolled
    restricted_fields_changed = any([
        update.session_date is not None and update.session_date != slot.session_date,
        update.time_slot is not None and update.time_slot != slot.time_slot,
        update.location is not None and update.location != slot.location
    ])

    if enrolled_count > 0 and restricted_fields_changed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change date, time, or location when {enrolled_count} student(s) are enrolled. Remove enrollments first."
        )

    # Validate tutor if changing
    if update.tutor_id is not None:
        tutor = db.query(Tutor).filter(Tutor.id == update.tutor_id).first()
        if not tutor:
            raise HTTPException(status_code=404, detail=f"Tutor with ID {update.tutor_id} not found")

    # Check for duplicates if changing key fields
    if any([update.session_date, update.time_slot, update.tutor_id, update.location]):
        check_date = update.session_date if update.session_date else slot.session_date
        check_time = update.time_slot if update.time_slot else slot.time_slot
        check_tutor = update.tutor_id if update.tutor_id else slot.tutor_id
        check_location = update.location if update.location else slot.location

        existing = db.query(ExamRevisionSlot).filter(
            ExamRevisionSlot.id != slot_id,
            ExamRevisionSlot.calendar_event_id == slot.calendar_event_id,
            ExamRevisionSlot.session_date == check_date,
            ExamRevisionSlot.time_slot == check_time,
            ExamRevisionSlot.tutor_id == check_tutor,
            ExamRevisionSlot.location == check_location
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A revision slot with these details already exists"
            )

    # Compute final values for conflict checking
    final_date = update.session_date if update.session_date else slot.session_date
    final_time = update.time_slot if update.time_slot else slot.time_slot
    final_tutor = update.tutor_id if update.tutor_id else slot.tutor_id

    # Check for tutor conflicts with regular sessions
    warning = None
    tutor_conflicts = _check_tutor_conflicts(db, final_tutor, final_date, final_time)
    if tutor_conflicts:
        conflict_info = ", ".join([f"{c['student_name']} ({c['time_slot']})" for c in tutor_conflicts])
        warning = f"Tutor has {len(tutor_conflicts)} conflicting session(s): {conflict_info}"

    # Apply updates
    if update.session_date is not None:
        slot.session_date = update.session_date
    if update.time_slot is not None:
        slot.time_slot = update.time_slot
    if update.tutor_id is not None:
        slot.tutor_id = update.tutor_id
    if update.location is not None:
        slot.location = update.location
    if update.notes is not None:
        slot.notes = update.notes if update.notes.strip() else None

    db.commit()
    db.refresh(slot)

    # Auto-adopt existing sessions if date/time/location changed
    adopted_count = 0
    if any([update.session_date, update.time_slot, update.location]):
        calendar_event = slot.calendar_event
        student_filters = _build_student_filters_from_event(calendar_event)

        existing_sessions = db.query(SessionLog).join(
            Student, SessionLog.student_id == Student.id
        ).filter(
            SessionLog.session_date == slot.session_date,
            SessionLog.time_slot == slot.time_slot,
            SessionLog.location == slot.location,
            SessionLog.session_status.in_(SCHEDULABLE_STATUSES),
            SessionLog.exam_revision_slot_id.is_(None),
            *student_filters
        ).all()

        for session in existing_sessions:
            session.exam_revision_slot_id = slot.id
            adopted_count += 1

        if adopted_count > 0:
            db.commit()
            logger.info(f"Auto-adopted {adopted_count} existing sessions into revision slot {slot.id} after update")

    # Reload with relationships
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.calendar_event),
        joinedload(ExamRevisionSlot.tutor),
        joinedload(ExamRevisionSlot.sessions)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    return _build_slot_response(slot, adopted_count, warning)


@router.delete("/exam-revision/slots/{slot_id}")
async def delete_revision_slot(
    slot_id: int,
    force: bool = Query(False, description="Force delete: unenroll all students first"),
    db: Session = Depends(get_db)
):
    """
    Delete a revision slot.

    By default, can only delete empty slots (no enrolled students).
    With force=true, will unenroll all students (reverting their sessions) then delete.
    """
    slot = db.query(ExamRevisionSlot).options(
        joinedload(ExamRevisionSlot.sessions)
    ).filter(ExamRevisionSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail=f"Revision slot with ID {slot_id} not found")

    # Check for enrolled students
    enrolled = [
        s for s in slot.sessions
        if s.session_status in ENROLLED_SESSION_STATUSES
    ]

    if enrolled and not force:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete slot with {len(enrolled)} enrolled student(s). Use force=true to unenroll and delete."
        )

    # Force delete: unenroll all students first
    unenrolled_count = 0
    if enrolled and force:
        for session in enrolled:
            # Skip already attended sessions
            if session.session_status in ['Attended', 'Attended (Make-up)']:
                continue

            # Revert the consumed session if it exists
            if session.make_up_for_id:
                consumed_session = db.query(SessionLog).filter(
                    SessionLog.id == session.make_up_for_id
                ).first()
                if consumed_session:
                    # Revert status from "Make-up Booked" to "Pending Make-up"
                    consumed_session.session_status = consumed_session.session_status.replace(
                        "Make-up Booked", "Pending Make-up"
                    )
                    consumed_session.rescheduled_to_id = None

            # Delete the revision session
            db.delete(session)
            unenrolled_count += 1

    db.delete(slot)
    db.commit()

    if unenrolled_count > 0:
        return {"message": f"Revision slot {slot_id} deleted. {unenrolled_count} student(s) were unenrolled."}
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
        if s.session_status in ENROLLED_SESSION_STATUSES
    }

    # Build student filter based on calendar event criteria
    student_filters = _build_student_filters_from_event(calendar_event)

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

    for student in students:
        # Skip already enrolled students
        if student.id in already_enrolled_student_ids:
            continue

        # Find pending make-up sessions
        pending_sessions = _get_consumable_sessions_query(
            db, student.id, slot.location
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
                home_location=student.home_location,
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
    location: Optional[str] = Query(None, description="Location to filter students by (optional - omit for all locations)"),
    db: Session = Depends(get_db)
):
    """
    Get students eligible for revision slots for a specific exam (calendar event).

    This endpoint allows viewing eligible students WITHOUT requiring a slot to exist first.

    Eligibility criteria:
    1. Student's school, grade, academic_stream (if F4-F6) match the calendar event
    2. Student has an active enrollment (at the specified location if provided)
    3. Student has at least one pending make-up session OR unused scheduled/make-up session (future dated)
    """
    # Get the calendar event
    calendar_event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id
    ).first()

    if not calendar_event:
        raise HTTPException(status_code=404, detail=f"Calendar event with ID {event_id} not found")

    # Build student filter based on calendar event criteria
    student_filters = _build_student_filters_from_event(calendar_event)

    # Find students with active enrollments (optionally filtered by location)
    enrolled_students_query = db.query(Student).join(
        Enrollment, Student.id == Enrollment.student_id
    ).filter(
        Enrollment.payment_status.in_(['Paid', 'Pending Payment']),  # Active enrollments
        *student_filters
    )
    if location:
        enrolled_students_query = enrolled_students_query.filter(Enrollment.location == location)
    enrolled_students_query = enrolled_students_query.distinct()

    students = enrolled_students_query.all()

    # For each student, find their pending sessions
    eligible_students = []

    for student in students:
        # Find pending make-up sessions (optionally filtered by location)
        pending_sessions = _get_consumable_sessions_query(
            db, student.id, location
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
                home_location=student.home_location,
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
        s.session_status in ENROLLED_SESSION_STATUSES
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
    if not _is_session_consumable(consume_session):
        raise HTTPException(
            status_code=400,
            detail=f"Session cannot be consumed. Status: {consume_session.session_status}"
        )

    # Get the student for enrollment lookup
    student = db.query(Student).filter(Student.id == request.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail=f"Student with ID {request.student_id} not found")

    # Check for student time conflicts (warning, not blocking)
    student_conflicts = _check_student_conflicts(
        db, request.student_id, slot.session_date, slot.time_slot,
        exclude_session_id=request.consume_session_id
    )
    student_warning = None
    if student_conflicts:
        conflict_info = ", ".join([
            f"{c['tutor_name']} at {c['location']} ({c['time_slot']})"
            for c in student_conflicts
        ])
        student_warning = f"Student has {len(student_conflicts)} conflicting session(s): {conflict_info}"

    # Find the student's enrollment at this location
    enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == request.student_id,
        Enrollment.location == slot.location,
        Enrollment.payment_status.in_(['Paid', 'Pending Payment'])
    ).first()

    # Create the revision session
    modified_by = request.created_by or "system@csmpro.app"
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
        last_modified_by=modified_by,
        last_modified_time=datetime.now()
    )
    db.add(revision_session)

    try:
        db.flush()  # Get the ID and check unique constraint

        # Update the consumed session (inside same transaction)
        is_pending_makeup = (
            consume_session.session_status in PENDING_MAKEUP_STATUSES and
            consume_session.rescheduled_to_id is None
        )
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

        consume_session.last_modified_by = modified_by
        consume_session.last_modified_time = datetime.now()

        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Student is already enrolled in this revision slot"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to complete enrollment"
        )

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
        consumed_session=_build_session_response(consume_session),
        warning=student_warning
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
                if s.session_status in ENROLLED_SESSION_STATUSES
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

        # Eligible count is lazy-loaded on the frontend when expanding a card
        # to avoid N+1 queries (was calling _count_eligible_students per exam)
        eligible_count = 0

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
    enrolled_statuses = ENROLLED_SESSION_STATUSES
    already_enrolled_subquery = db.query(SessionLog.student_id).join(
        ExamRevisionSlot, SessionLog.exam_revision_slot_id == ExamRevisionSlot.id
    ).filter(
        ExamRevisionSlot.calendar_event_id == calendar_event.id,
        SessionLog.session_status.in_(enrolled_statuses)
    ).distinct()

    # Build student filter based on calendar event criteria
    student_filters = _build_student_filters_from_event(calendar_event)

    # Get students who have pending sessions

    # Subquery for students with pending sessions
    student_ids_with_pending = db.query(SessionLog.student_id).filter(
        or_(
            and_(
                SessionLog.session_status.in_(PENDING_MAKEUP_STATUSES),
                SessionLog.rescheduled_to_id.is_(None)
            ),
            and_(
                SessionLog.session_status.in_(SCHEDULABLE_STATUSES),
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
