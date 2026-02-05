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
from auth.dependencies import get_current_user, require_admin

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
        target_enrollment_id=request.target_enrollment_id,
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

    # Source enrollment (where the session is from)
    source_enrollment = request.enrollment
    enrollment_first_lesson_date = None
    enrollment_lessons_paid = None
    source_effective_end_date = None

    if source_enrollment:
        enrollment_first_lesson_date = source_enrollment.first_lesson_date
        enrollment_lessons_paid = source_enrollment.lessons_paid
        # Calculate source enrollment's effective end date
        if source_enrollment.first_lesson_date and source_enrollment.lessons_paid:
            try:
                source_ext = source_enrollment.deadline_extension_weeks or 0
                result = db.execute(text("""
                    SELECT calculate_effective_end_date(:first_lesson_date, :lessons_paid, :ext) as end_date
                """), {
                    "first_lesson_date": source_enrollment.first_lesson_date,
                    "lessons_paid": source_enrollment.lessons_paid,
                    "ext": source_ext
                }).fetchone()
                if result:
                    source_effective_end_date = result.end_date
            except Exception:
                pass

    # Target enrollment (the one to extend - may differ from source)
    # Use target_enrollment if set, otherwise fall back to source enrollment
    target_enrollment = request.target_enrollment if request.target_enrollment_id else source_enrollment
    target_first_lesson_date = None
    target_lessons_paid = None
    current_extension_weeks = 0
    current_effective_end_date = None
    projected_effective_end_date = None

    if target_enrollment:
        target_first_lesson_date = target_enrollment.first_lesson_date
        target_lessons_paid = target_enrollment.lessons_paid
        current_extension_weeks = target_enrollment.deadline_extension_weeks or 0

        # Calculate target enrollment's effective end dates
        if target_enrollment.first_lesson_date and target_enrollment.lessons_paid:
            try:
                date_results = db.execute(text("""
                    SELECT
                        calculate_effective_end_date(:first_lesson_date, :lessons_paid, :current_ext) as current_end,
                        calculate_effective_end_date(:first_lesson_date, :lessons_paid, :projected_ext) as projected_end
                """), {
                    "first_lesson_date": target_enrollment.first_lesson_date,
                    "lessons_paid": target_enrollment.lessons_paid,
                    "current_ext": current_extension_weeks,
                    "projected_ext": current_extension_weeks + request.requested_extension_weeks
                }).fetchone()
                if date_results:
                    current_effective_end_date = date_results.current_end
                    projected_effective_end_date = date_results.projected_end
            except Exception:
                pass  # SQL function might not exist in all environments

    # Count pending makeups and completed sessions for SOURCE enrollment
    source_pending_makeups_count = 0
    source_sessions_completed = 0
    if source_enrollment:
        source_counts = db.query(
            func.count(case((SessionLog.session_status.like('%Pending Make-up%'), SessionLog.id))).label('pending'),
            func.count(case((SessionLog.session_status.in_(['Attended', 'Attended (Make-up)', 'No Show']), SessionLog.id))).label('completed')
        ).filter(
            SessionLog.student_id == request.student_id,
            SessionLog.enrollment_id == source_enrollment.id
        ).first()
        source_pending_makeups_count = source_counts.pending if source_counts else 0
        source_sessions_completed = source_counts.completed if source_counts else 0

    # Count pending makeups and completed sessions for TARGET enrollment
    pending_makeups_count = 0
    sessions_completed = 0
    if target_enrollment:
        target_counts = db.query(
            func.count(case((SessionLog.session_status.like('%Pending Make-up%'), SessionLog.id))).label('pending'),
            func.count(case((SessionLog.session_status.in_(['Attended', 'Attended (Make-up)', 'No Show']), SessionLog.id))).label('completed')
        ).filter(
            SessionLog.student_id == request.student_id,
            SessionLog.enrollment_id == target_enrollment.id
        ).first()
        pending_makeups_count = target_counts.pending if target_counts else 0
        sessions_completed = target_counts.completed if target_counts else 0

    # For admin guidance, consider makeups on BOTH enrollments
    total_pending_makeups = source_pending_makeups_count + (pending_makeups_count if target_enrollment and target_enrollment.id != source_enrollment.id else 0)

    # Generate admin guidance
    admin_guidance = _generate_admin_guidance(
        request, current_extension_weeks, total_pending_makeups
    )

    return ExtensionRequestDetailResponse(
        **base_response.model_dump(),
        enrollment_first_lesson_date=enrollment_first_lesson_date,
        enrollment_lessons_paid=enrollment_lessons_paid,
        source_effective_end_date=source_effective_end_date,
        source_pending_makeups_count=source_pending_makeups_count,
        source_sessions_completed=source_sessions_completed,
        target_first_lesson_date=target_first_lesson_date,
        target_lessons_paid=target_lessons_paid,
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
    current_user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new extension request.

    Tutors use this when they need to schedule a makeup session past the
    enrollment's effective end date. Requires authentication.
    The requesting tutor is determined from the authenticated user.
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

    # Use current authenticated user as the requesting tutor
    tutor = current_user

    # Determine target enrollment (which enrollment to extend)
    # If provided in request, validate and use it. Otherwise auto-detect.
    target_enrollment_id = None

    if request.target_enrollment_id:
        # Validate provided target enrollment belongs to same student
        target_enrollment = db.query(Enrollment).filter(
            Enrollment.id == request.target_enrollment_id,
            Enrollment.student_id == session.student_id
        ).first()

        if not target_enrollment:
            raise HTTPException(
                status_code=400,
                detail="Target enrollment not found or does not belong to this student"
            )

        # Set target if different from source
        if target_enrollment.id != session.enrollment_id:
            target_enrollment_id = target_enrollment.id
    else:
        # Auto-detect: Find student's current regular enrollment (latest by first_lesson_date)
        # Only Regular enrollments count - ignore One-Time and Trial
        current_enrollment = db.query(Enrollment).filter(
            Enrollment.student_id == session.student_id,
            Enrollment.enrollment_type == 'Regular'
        ).order_by(Enrollment.first_lesson_date.desc()).first()

        # If current enrollment differs from session's enrollment, use current as target
        if current_enrollment and current_enrollment.id != session.enrollment_id:
            target_enrollment_id = current_enrollment.id

    # Create the extension request
    extension_request = ExtensionRequest(
        session_id=request.session_id,
        enrollment_id=session.enrollment_id,
        target_enrollment_id=target_enrollment_id,
        student_id=session.student_id,
        tutor_id=tutor.id,
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
        joinedload(ExtensionRequest.target_enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    ).filter(ExtensionRequest.id == extension_request.id).first()

    return _build_extension_request_response(extension_request, db)


@router.get("/extension-requests", response_model=List[ExtensionRequestResponse])
async def get_extension_requests(
    tutor_id: Optional[int] = Query(None, description="Filter by requesting tutor"),
    status: Optional[str] = Query(None, description="Filter by status (Pending, Approved, Rejected)"),
    enrollment_id: Optional[int] = Query(None, description="Filter by enrollment"),
    location: Optional[str] = Query(None, description="Filter by enrollment location"),
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
        joinedload(ExtensionRequest.target_enrollment),
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

    if location:
        query = query.join(ExtensionRequest.enrollment).filter(Enrollment.location == location)

    # Order by pending first, then by request date (oldest first for pending)
    query = query.order_by(
        ExtensionRequest.request_status.desc(),  # Pending before Approved/Rejected
        ExtensionRequest.requested_at.asc()
    )

    requests = query.offset(offset).limit(limit).all()

    return [_build_extension_request_response(r, db) for r in requests]


@router.get("/extension-requests/pending-count", response_model=PendingExtensionRequestCount)
async def get_pending_count(
    location: Optional[str] = Query(None, description="Filter by location"),
    db: Session = Depends(get_db)
):
    """
    Get count of pending extension requests for admin badge.
    """
    query = db.query(func.count(ExtensionRequest.id)).filter(
        ExtensionRequest.request_status == 'Pending'
    )

    if location and location != "All Locations":
        query = query.join(ExtensionRequest.enrollment).filter(Enrollment.location == location)

    count = query.scalar() or 0

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
        joinedload(ExtensionRequest.target_enrollment),
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
    admin_tutor: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Approve an extension request. Requires admin access.

    This will:
    1. Update the extension request status to 'Approved'
    2. Add the granted weeks to the TARGET enrollment's deadline_extension_weeks
       (target = student's current enrollment, may differ from session's enrollment)
    3. Update the enrollment's extension audit trail
    """
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.target_enrollment),
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

    now = datetime.now()

    # Update extension request
    extension_request.request_status = 'Approved'
    extension_request.reviewed_by = admin_tutor.user_email
    extension_request.reviewed_at = now
    extension_request.review_notes = approval.review_notes
    extension_request.extension_granted_weeks = approval.extension_granted_weeks

    # Determine which enrollment to extend
    # Use target_enrollment if set (cross-enrollment case), otherwise fall back to source enrollment
    # This fallback ensures backward compatibility with AppSheet requests (target_enrollment_id = NULL)
    enrollment_to_extend = extension_request.target_enrollment if extension_request.target_enrollment_id else extension_request.enrollment
    source_enrollment = extension_request.enrollment

    if enrollment_to_extend:
        current_extension = enrollment_to_extend.deadline_extension_weeks or 0
        enrollment_to_extend.deadline_extension_weeks = current_extension + approval.extension_granted_weeks
        enrollment_to_extend.last_extension_date = now.date()
        enrollment_to_extend.extension_granted_by = admin_tutor.user_email

        # Append to extension notes
        # Include source enrollment info if different from target
        if extension_request.target_enrollment_id and source_enrollment:
            new_note = f"{now.strftime('%Y-%m-%d %H:%M')}: +{approval.extension_granted_weeks} weeks granted via request #{request_id} (makeup from enrollment #{source_enrollment.id})"
        else:
            new_note = f"{now.strftime('%Y-%m-%d %H:%M')}: +{approval.extension_granted_weeks} weeks granted via request #{request_id}"
        if extension_request.reason:
            new_note += f" - {extension_request.reason[:100]}"
        if enrollment_to_extend.extension_notes:
            enrollment_to_extend.extension_notes = f"{enrollment_to_extend.extension_notes}\n{new_note}"
        else:
            enrollment_to_extend.extension_notes = new_note

    # Note: Actual makeup scheduling is done separately through the normal flow
    # The proposed_reschedule_date/time are kept as reference for the admin

    db.commit()
    db.refresh(extension_request)

    return _build_extension_request_response(extension_request, db)


@router.patch("/extension-requests/{request_id}/reject", response_model=ExtensionRequestResponse)
async def reject_extension_request(
    request_id: int,
    rejection: ExtensionRequestReject,
    admin_tutor: Tutor = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Reject an extension request. Requires admin access.
    """
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.target_enrollment),
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

    now = datetime.now()

    # Update extension request
    extension_request.request_status = 'Rejected'
    extension_request.reviewed_by = admin_tutor.user_email
    extension_request.reviewed_at = now
    extension_request.review_notes = rejection.review_notes

    db.commit()
    db.refresh(extension_request)

    return _build_extension_request_response(extension_request, db)


@router.patch("/extension-requests/{request_id}/mark-rescheduled", response_model=ExtensionRequestResponse)
async def mark_session_rescheduled(
    request_id: int,
    db: Session = Depends(get_db)
):
    """
    Mark an extension request's session as rescheduled.
    Called when a makeup is scheduled via the extension request flow.
    """
    extension_request = db.query(ExtensionRequest).options(
        joinedload(ExtensionRequest.session),
        joinedload(ExtensionRequest.enrollment),
        joinedload(ExtensionRequest.target_enrollment),
        joinedload(ExtensionRequest.student),
        joinedload(ExtensionRequest.tutor),
    ).filter(ExtensionRequest.id == request_id).first()

    if not extension_request:
        raise HTTPException(status_code=404, detail=f"Extension request {request_id} not found")

    if extension_request.request_status != 'Approved':
        raise HTTPException(
            status_code=400,
            detail=f"Can only mark rescheduled on approved requests (current: {extension_request.request_status})"
        )

    extension_request.session_rescheduled = True

    db.commit()
    db.refresh(extension_request)

    return _build_extension_request_response(extension_request, db)
