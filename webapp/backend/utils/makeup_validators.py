"""
Shared validation logic for make-up session scheduling.
Used by both sessions.py (schedule_makeup) and exam_revision.py (enroll_student).
"""
import logging
from datetime import date
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from models import SessionLog, Enrollment, Holiday, ExtensionRequest

logger = logging.getLogger(__name__)


def find_root_original_session(session: SessionLog, db: Session) -> SessionLog:
    """
    Trace back through make_up_for_id chain to find the root original session.

    This handles chains like: Session A (original) <- Session B (makeup) <- Session C (makeup of B)
    When called with Session C, returns Session A.

    If no chain (not a makeup), returns the input session.
    Uses visited set to prevent infinite loops in case of data corruption.
    """
    visited = set()
    current = session

    while current.make_up_for_id and current.id not in visited:
        visited.add(current.id)
        parent = db.query(SessionLog).filter(
            SessionLog.id == current.make_up_for_id
        ).first()
        if not parent:
            break
        current = parent

    return current


def validate_makeup_constraints(
    db: Session,
    student_id: int,
    consume_session: SessionLog,
    target_date: date,
    target_time_slot: str,
    target_location: str,
    is_super_admin: bool = False,
    exclude_session_id: Optional[int] = None,
):
    """
    Shared validation for all make-up scheduling.
    Raises HTTPException for blocking issues.

    Checks:
    1. 60-day window (Super Admin can override)
    2. Holiday
    3. Enrollment deadline for regular slot
    4. Student time conflict
    """
    # 1. 60-day makeup restriction (Super Admin can override; approved extension bypasses)
    root_original = find_root_original_session(consume_session, db)
    days_since_original = (target_date - root_original.session_date).days

    if days_since_original > 60 and not is_super_admin:
        # Check if session has an approved extension request (bypasses 60-day rule)
        has_approved_extension = db.query(ExtensionRequest).filter(
            ExtensionRequest.session_id == consume_session.id,
            ExtensionRequest.request_status == 'Approved'
        ).first() is not None

        if has_approved_extension:
            logger.info(f"60-day rule bypassed for session #{consume_session.id} (approved extension exists)")
        else:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "MAKEUP_60_DAY_EXCEEDED",
                    "message": f"Makeup must be scheduled within 60 days of the original session ({root_original.session_date}). This would be {days_since_original} days later.",
                    "original_session_id": root_original.id,
                    "original_session_date": str(root_original.session_date),
                    "days_difference": days_since_original,
                    "max_allowed_days": 60
                }
            )

    # 2. Check for holiday
    holiday = db.query(Holiday).filter(
        Holiday.holiday_date == target_date
    ).first()
    if holiday:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot schedule on holiday: {holiday.holiday_name}"
        )

    # 3. Check enrollment deadline - ONLY for regular slot
    # Only block scheduling to the student's regular slot (assigned_day + assigned_time)
    # past the enrollment end date. Non-regular slots are allowed past deadline.
    # Check against student's CURRENT enrollment (latest by first_lesson_date).
    # Only Regular enrollments count - ignore One-Time and Trial.
    current_enrollment = db.query(Enrollment).filter(
        Enrollment.student_id == student_id,
        Enrollment.enrollment_type == 'Regular',
        Enrollment.payment_status != "Cancelled"
    ).order_by(Enrollment.first_lesson_date.desc()).first()

    if current_enrollment and current_enrollment.assigned_day and current_enrollment.assigned_time:
        proposed_day = target_date.strftime('%a')
        is_regular_slot = (
            proposed_day == current_enrollment.assigned_day and
            target_time_slot == current_enrollment.assigned_time
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
                    if target_date > effective_end_date:
                        raise HTTPException(
                            status_code=400,
                            detail={
                                "error": "ENROLLMENT_DEADLINE_EXCEEDED",
                                "message": f"Cannot schedule makeup to regular slot ({current_enrollment.assigned_day} {current_enrollment.assigned_time}) past enrollment end date ({effective_end_date}). Request a deadline extension first.",
                                "effective_end_date": str(effective_end_date),
                                "enrollment_id": current_enrollment.id,
                                "extension_required": True
                            }
                        )
            except HTTPException:
                raise
            except SQLAlchemyError as e:
                logger.warning(f"Could not check enrollment deadline: {e}")

    # 4. Check for student conflict at the target slot
    # Allow if the existing session is also in "Pending Make-up" status (that slot is free)
    conflict_query = db.query(SessionLog).filter(
        SessionLog.student_id == student_id,
        SessionLog.session_date == target_date,
        SessionLog.time_slot == target_time_slot,
        SessionLog.location == target_location
    )
    if exclude_session_id:
        conflict_query = conflict_query.filter(SessionLog.id != exclude_session_id)

    existing_session = conflict_query.first()

    if existing_session:
        if "Pending Make-up" not in existing_session.session_status:
            raise HTTPException(
                status_code=400,
                detail=f"Student already has a session at this slot (Session #{existing_session.id})"
            )
