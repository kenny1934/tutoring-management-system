"""
Extension Requests API endpoints.
Allows tutors to request enrollment deadline extensions when scheduling
makeup sessions past the enrollment end date.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func, case
from typing import List, Optional
from datetime import datetime, date
from database import get_db
from models import (
    ExtensionRequest, SessionLog, Enrollment, Student, Tutor
)
from schemas import (
    ExtensionRequestCreate,
    ExtensionRequestApprove,
    ExtensionRequestReject,
    ExtensionRequestResponse,
    ExtensionRequestDetailResponse,
    PendingExtensionRequestCount,
)

router = APIRouter()


def _build_extension_request_response(
    request: ExtensionRequest,
    db: Session
) -> ExtensionRequestResponse:
    """Build an ExtensionRequestResponse from an extension request."""
    # Get original session date
    original_session_date = None
    if request.session:
        original_session_date = request.session.session_date

    # Get student info for display
    student = request.student

    return ExtensionRequestResponse(
        id=request.id,
        session_id=request.session_id,
        enrollment_id=request.enrollment_id,
        student_id=request.student_id,
        tutor_id=request.tutor_id,
        requested_extension_weeks=request.requested_extension_weeks,
        reason=request.reason,
        proposed_reschedule_date=request.proposed_reschedule_date,
        proposed_reschedule_time=request.proposed_reschedule_time,
        request_status=request.request_status,
        requested_by=request.requested_by,
        requested_at=request.requested_at,
        reviewed_by=request.reviewed_by,
        reviewed_at=request.reviewed_at,
        review_notes=request.review_notes,
        extension_granted_weeks=request.extension_granted_weeks,
        session_rescheduled=request.session_rescheduled or False,
        student_name=student.student_name if student else None,
        tutor_name=request.tutor.tutor_name if request.tutor else None,
        original_session_date=original_session_date,
        # Student info for display
        school_student_id=student.school_student_id if student else None,
        grade=student.grade if student else None,
        lang_stream=student.lang_stream if student else None,
        school=student.school if student else None,
        location=student.home_location if student else None,
    )


def _build_extension_request_detail_response(
    request: ExtensionRequest,
    db: Session
) -> ExtensionRequestDetailResponse:
    """Build an ExtensionRequestDetailResponse with enrollment context."""
    base_response = _build_extension_request_response(request, db)

    # Get enrollment details
    enrollment = request.enrollment
    enrollment_first_lesson_date = None
    enrollment_lessons_paid = None
    current_extension_weeks = 0
    current_effective_end_date = None
    projected_effective_end_date = None

    if enrollment:
        enrollment_first_lesson_date = enrollment.first_lesson_date
        enrollment_lessons_paid = enrollment.lessons_paid
        current_extension_weeks = enrollment.deadline_extension_weeks or 0

        # Calculate both effective end dates in a single query
        if enrollment.first_lesson_date and enrollment.lessons_paid:
            try:
                date_results = db.execute(text("""
                    SELECT
                        calculate_effective_end_date(:first_lesson_date, :lessons_paid, :current_ext) as current_end,
                        calculate_effective_end_date(:first_lesson_date, :lessons_paid, :projected_ext) as projected_end
                """), {
                    "first_lesson_date": enrollment.first_lesson_date,
                    "lessons_paid": enrollment.lessons_paid,
                    "current_ext": current_extension_weeks,
                    "projected_ext": current_extension_weeks + request.requested_extension_weeks
                }).fetchone()
                if date_results:
                    current_effective_end_date = date_results.current_end
                    projected_effective_end_date = date_results.projected_end
            except Exception:
                pass  # SQL function might not exist in all environments

    # Count pending makeups and completed sessions in a single query
    counts = db.query(
        func.count(case((SessionLog.session_status.like('%Pending Make-up%'), SessionLog.id))).label('pending'),
        func.count(case((SessionLog.session_status.in_(['Attended', 'Attended (Make-up)', 'No Show']), SessionLog.id))).label('completed')
    ).filter(
        SessionLog.enrollment_id == request.enrollment_id
    ).first()

    pending_makeups_count = counts.pending if counts else 0
    sessions_completed = counts.completed if counts else 0

    # Generate admin guidance
    admin_guidance = _generate_admin_guidance(
        request, current_extension_weeks, pending_makeups_count
    )

    return ExtensionRequestDetailResponse(
        **base_response.model_dump(),
        enrollment_first_lesson_date=enrollment_first_lesson_date,
        enrollment_lessons_paid=enrollment_lessons_paid,
        current_extension_weeks=current_extension_weeks,
        current_effective_end_date=current_effective_end_date,
        projected_effective_end_date=projected_effective_end_date,
        pending_makeups_count=pending_makeups_count,
        sessions_completed=sessions_completed,
        admin_guidance=admin_guidance,
    )


def _generate_admin_guidance(
    request: ExtensionRequest,
    current_extension_weeks: int,
    pending_makeups_count: int
) -> str:
    """Generate admin guidance message based on request context."""
    if current_extension_weeks >= 4:
        return 'REVIEW REQUIRED: Already 4+ weeks extended'
    if pending_makeups_count == 0:
        return 'QUESTION: No pending makeups - why extend?'
    if request.requested_at and (datetime.now() - request.requested_at).days > 7:
        return 'URGENT: Request pending over 7 days'
    if request.requested_extension_weeks > 2:
        return 'REVIEW: Requesting >2 weeks extension'
    return 'STANDARD: Normal extension request'


@router.post("/extension-requests", response_model=ExtensionRequestResponse)
async def create_extension_request(
    request: ExtensionRequestCreate,
    tutor_id: int = Query(..., description="ID of the tutor making the request"),
    db: Session = Depends(get_db)
):
    """
    Create a new extension request.

    Tutors use this when they need to schedule a makeup session past the
    enrollment's effective end date.
    """
    # Get the session
    session = db.query(SessionLog).options(
        joinedload(SessionLog.enrollment)
    ).filter(SessionLog.id == request.session_id).first()

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {request.session_id} not found")

    if not session.enrollment_id:
        raise HTTPException(status_code=400, detail="Session has no associated enrollment")

    # Check for existing pending request for this session
    existing = db.query(ExtensionRequest).filter(
        ExtensionRequest.session_id == request.session_id,
        ExtensionRequest.request_status == 'Pending'
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="A pending extension request already exists for this session"
        )

    # Get tutor info
    tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    if not tutor:
        raise HTTPException(status_code=404, detail=f"Tutor {tutor_id} not found")

    # Create the extension request
    extension_request = ExtensionRequest(
        session_id=request.session_id,
        enrollment_id=session.enrollment_id,
        student_id=session.student_id,
        tutor_id=tutor_id,
        requested_extension_weeks=request.requested_extension_weeks,
        reason=request.reason,
        proposed_reschedule_date=request.proposed_reschedule_date,
        proposed_reschedule_time=request.proposed_reschedule_time,
        request_status='Pending',
        requested_by=tutor.user_email,
    )

    db.add(extension_request)
    db.commit()
    db.refresh(extension_request)

    # Reload with relationships
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    ).filter(ExtensionRequest.id == extension_request.id).first()

    return _build_extension_request_response(extension_request, db)


@router.get("/extension-requests", response_model=List[ExtensionRequestResponse])
async def get_extension_requests(
    tutor_id: Optional[int] = Query(None, description="Filter by requesting tutor"),
    status: Optional[str] = Query(None, description="Filter by status (Pending, Approved, Rejected)"),
    enrollment_id: Optional[int] = Query(None, description="Filter by enrollment"),
    include_resolved: bool = Query(False, description="Include non-pending requests"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    List extension requests with optional filters.
    """
    query = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    )

    if tutor_id:
        query = query.filter(ExtensionRequest.tutor_id == tutor_id)

    if status:
        query = query.filter(ExtensionRequest.request_status == status)
    elif not include_resolved:
        query = query.filter(ExtensionRequest.request_status == 'Pending')

    if enrollment_id:
        query = query.filter(ExtensionRequest.enrollment_id == enrollment_id)

    # Order by pending first, then by request date (oldest first for pending)
    query = query.order_by(
        ExtensionRequest.request_status.desc(),  # Pending before Approved/Rejected
        ExtensionRequest.requested_at.asc()
    )

    requests = query.offset(offset).limit(limit).all()

    return [_build_extension_request_response(r, db) for r in requests]


@router.get("/extension-requests/pending-count", response_model=PendingExtensionRequestCount)
async def get_pending_count(
    db: Session = Depends(get_db)
):
    """
    Get count of pending extension requests for admin badge.
    """
    count = db.query(func.count(ExtensionRequest.id)).filter(
        ExtensionRequest.request_status == 'Pending'
    ).scalar() or 0

    return PendingExtensionRequestCount(count=count)


@router.get("/extension-requests/{request_id}", response_model=ExtensionRequestDetailResponse)
async def get_extension_request(
    request_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a single extension request with full context for admin review.
    """
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    ).filter(ExtensionRequest.id == request_id).first()

    if not extension_request:
        raise HTTPException(status_code=404, detail=f"Extension request {request_id} not found")

    return _build_extension_request_detail_response(extension_request, db)


@router.patch("/extension-requests/{request_id}/approve", response_model=ExtensionRequestResponse)
async def approve_extension_request(
    request_id: int,
    approval: ExtensionRequestApprove,
    admin_tutor_id: int = Query(..., description="ID of the admin approving"),
    db: Session = Depends(get_db)
):
    """
    Approve an extension request.

    This will:
    1. Update the extension request status to 'Approved'
    2. Add the granted weeks to the enrollment's deadline_extension_weeks
    3. Update the enrollment's extension audit trail
    4. Optionally reschedule the session if reschedule_session=true
    """
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    ).filter(ExtensionRequest.id == request_id).first()

    if not extension_request:
        raise HTTPException(status_code=404, detail=f"Extension request {request_id} not found")

    if extension_request.request_status != 'Pending':
        raise HTTPException(
            status_code=400,
            detail=f"Request is already {extension_request.request_status}"
        )

    # Get admin tutor info
    admin_tutor = db.query(Tutor).filter(Tutor.id == admin_tutor_id).first()
    if not admin_tutor:
        raise HTTPException(status_code=404, detail=f"Admin tutor {admin_tutor_id} not found")

    # Check admin role
    if admin_tutor.role != 'Admin':
        raise HTTPException(status_code=403, detail="Only admins can approve extension requests")

    now = datetime.now()

    # Update extension request
    extension_request.request_status = 'Approved'
    extension_request.reviewed_by = admin_tutor.user_email
    extension_request.reviewed_at = now
    extension_request.review_notes = approval.review_notes
    extension_request.extension_granted_weeks = approval.extension_granted_weeks

    # Update enrollment
    enrollment = extension_request.enrollment
    if enrollment:
        current_extension = enrollment.deadline_extension_weeks or 0
        enrollment.deadline_extension_weeks = current_extension + approval.extension_granted_weeks
        enrollment.last_extension_date = now.date()
        enrollment.extension_granted_by = admin_tutor.user_email

        # Append to extension notes
        new_note = f"{now.strftime('%Y-%m-%d %H:%M')}: +{approval.extension_granted_weeks} weeks granted via request #{request_id}"
        if extension_request.reason:
            new_note += f" - {extension_request.reason[:100]}"
        if enrollment.extension_notes:
            enrollment.extension_notes = f"{enrollment.extension_notes}\n{new_note}"
        else:
            enrollment.extension_notes = new_note

    # Optionally reschedule the session
    if approval.reschedule_session and extension_request.proposed_reschedule_date:
        session = extension_request.session
        if session:
            session.session_date = extension_request.proposed_reschedule_date
            if extension_request.proposed_reschedule_time:
                session.time_slot = extension_request.proposed_reschedule_time
            extension_request.session_rescheduled = True

    db.commit()
    db.refresh(extension_request)

    return _build_extension_request_response(extension_request, db)


@router.patch("/extension-requests/{request_id}/reject", response_model=ExtensionRequestResponse)
async def reject_extension_request(
    request_id: int,
    rejection: ExtensionRequestReject,
    admin_tutor_id: int = Query(..., description="ID of the admin rejecting"),
    db: Session = Depends(get_db)
):
    """
    Reject an extension request.
    """
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    ).filter(ExtensionRequest.id == request_id).first()

    if not extension_request:
        raise HTTPException(status_code=404, detail=f"Extension request {request_id} not found")

    if extension_request.request_status != 'Pending':
        raise HTTPException(
            status_code=400,
            detail=f"Request is already {extension_request.request_status}"
        )

    # Get admin tutor info
    admin_tutor = db.query(Tutor).filter(Tutor.id == admin_tutor_id).first()
    if not admin_tutor:
        raise HTTPException(status_code=404, detail=f"Admin tutor {admin_tutor_id} not found")

    # Check admin role
    if admin_tutor.role != 'Admin':
        raise HTTPException(status_code=403, detail="Only admins can reject extension requests")

    now = datetime.now()

    # Update extension request
    extension_request.request_status = 'Rejected'
    extension_request.reviewed_by = admin_tutor.user_email
    extension_request.reviewed_at = now
    extension_request.review_notes = rejection.review_notes

    db.commit()
    db.refresh(extension_request)

    return _build_extension_request_response(extension_request, db)
