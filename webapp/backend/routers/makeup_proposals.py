"""
Make-up Proposals API endpoints.
Allows tutors to propose make-up slots for confirmation by other tutors.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func
from typing import List, Optional
from datetime import datetime
from database import get_db
from models import (
    MakeupProposal, MakeupProposalSlot, SessionLog, Tutor, TutorMessage,
    Holiday
)
from schemas import (
    MakeupProposalCreate,
    MakeupProposalResponse,
    MakeupProposalSlotResponse,
    SlotApproveRequest,
    SlotRejectRequest,
    ProposalRejectRequest,
    PendingProposalCount,
    SessionResponse,
)

router = APIRouter()


def _format_date_with_day(date_str: str) -> str:
    """Format date string with day of week, e.g., 'Thu Mar 5'"""
    date = datetime.strptime(date_str, "%Y-%m-%d")
    return date.strftime("%a %b %-d")


def _build_slot_response(slot: MakeupProposalSlot) -> MakeupProposalSlotResponse:
    """Build a MakeupProposalSlotResponse from a slot."""
    return MakeupProposalSlotResponse(
        id=slot.id,
        proposal_id=slot.proposal_id,
        slot_order=slot.slot_order,
        proposed_date=slot.proposed_date,
        proposed_time_slot=slot.proposed_time_slot,
        proposed_tutor_id=slot.proposed_tutor_id,
        proposed_tutor_name=slot.proposed_tutor.tutor_name if slot.proposed_tutor else None,
        proposed_location=slot.proposed_location,
        slot_status=slot.slot_status,
        resolved_at=slot.resolved_at,
        resolved_by_tutor_id=slot.resolved_by_tutor_id,
        resolved_by_tutor_name=slot.resolved_by_tutor.tutor_name if slot.resolved_by_tutor else None,
        rejection_reason=slot.rejection_reason,
    )


def _build_proposal_response(
    proposal: MakeupProposal,
    include_session: bool = False,
    db: Session = None
) -> MakeupProposalResponse:
    """Build a MakeupProposalResponse from a proposal."""
    slots = [_build_slot_response(slot) for slot in proposal.slots]

    # Get original session if requested
    original_session = None
    if include_session and db and proposal.original_session:
        from routers.sessions import _build_session_response
        session = db.query(SessionLog).options(
            joinedload(SessionLog.student),
            joinedload(SessionLog.tutor),
            joinedload(SessionLog.exercises)
        ).filter(SessionLog.id == proposal.original_session_id).first()
        if session:
            original_session = _build_session_response(session)

    return MakeupProposalResponse(
        id=proposal.id,
        original_session_id=proposal.original_session_id,
        proposed_by_tutor_id=proposal.proposed_by_tutor_id,
        proposed_by_tutor_name=proposal.proposed_by_tutor.tutor_name if proposal.proposed_by_tutor else None,
        proposal_type=proposal.proposal_type,
        needs_input_tutor_id=proposal.needs_input_tutor_id,
        needs_input_tutor_name=proposal.needs_input_tutor.tutor_name if proposal.needs_input_tutor else None,
        notes=proposal.notes,
        status=proposal.status,
        created_at=proposal.created_at,
        resolved_at=proposal.resolved_at,
        message_id=proposal.message_id,
        slots=slots,
        original_session=original_session,
    )


@router.get("/makeup-proposals", response_model=List[MakeupProposalResponse])
async def get_proposals(
    tutor_id: Optional[int] = Query(None, description="Filter by target tutor (slots or needs_input)"),
    proposed_by: Optional[int] = Query(None, description="Filter by proposer"),
    status: Optional[str] = Query(None, description="Filter by status (pending, approved, rejected)"),
    include_session: bool = Query(False, description="Include original session details"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Get make-up proposals with optional filters.

    - **tutor_id**: Get proposals where tutor is a target (has pending slots or is needs_input target)
    - **proposed_by**: Get proposals created by this tutor
    - **status**: Filter by proposal status
    """
    query = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    )

    if status:
        query = query.filter(MakeupProposal.status == status)

    if proposed_by:
        query = query.filter(MakeupProposal.proposed_by_tutor_id == proposed_by)

    if tutor_id:
        # Tutor is either needs_input target OR has a pending slot
        slot_subquery = db.query(MakeupProposalSlot.proposal_id).filter(
            MakeupProposalSlot.proposed_tutor_id == tutor_id,
            MakeupProposalSlot.slot_status == 'pending'
        ).subquery()

        query = query.filter(
            or_(
                MakeupProposal.needs_input_tutor_id == tutor_id,
                MakeupProposal.id.in_(slot_subquery)
            )
        )

    proposals = query.order_by(MakeupProposal.created_at.desc()).offset(offset).limit(limit).all()

    return [_build_proposal_response(p, include_session, db) for p in proposals]


@router.get("/makeup-proposals/pending-count", response_model=PendingProposalCount)
async def get_pending_count(
    tutor_id: int = Query(..., description="Tutor ID to count pending proposals for"),
    db: Session = Depends(get_db)
):
    """
    Get count of pending proposals where tutor needs to take action.
    Counts unique proposals (not slots) where tutor is the target.
    """
    # Count unique proposals where this tutor has pending slots
    slot_proposal_count = db.query(func.count(func.distinct(MakeupProposal.id))).join(
        MakeupProposalSlot
    ).filter(
        MakeupProposalSlot.proposed_tutor_id == tutor_id,
        MakeupProposalSlot.slot_status == 'pending',
        MakeupProposal.status == 'pending'
    ).scalar() or 0

    # Count needs_input proposals targeting this tutor
    needs_input_count = db.query(func.count(MakeupProposal.id)).filter(
        MakeupProposal.needs_input_tutor_id == tutor_id,
        MakeupProposal.status == 'pending'
    ).scalar() or 0

    return PendingProposalCount(count=slot_proposal_count + needs_input_count)


@router.get("/makeup-proposals/{proposal_id}", response_model=MakeupProposalResponse)
async def get_proposal(
    proposal_id: int,
    include_session: bool = Query(True, description="Include original session details"),
    db: Session = Depends(get_db)
):
    """Get a single proposal with all details."""
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ).filter(MakeupProposal.id == proposal_id).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    return _build_proposal_response(proposal, include_session, db)


@router.post("/makeup-proposals", response_model=MakeupProposalResponse)
async def create_proposal(
    data: MakeupProposalCreate,
    from_tutor_id: int = Query(..., description="Proposer tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Create a new make-up proposal.

    For specific_slots: Include 1-3 slot options.
    For needs_input: Specify the target tutor who will select a slot.
    """
    # Verify proposer exists
    proposer = db.query(Tutor).filter(Tutor.id == from_tutor_id).first()
    if not proposer:
        raise HTTPException(status_code=404, detail="Proposer tutor not found")

    # Verify original session exists and is in Pending Make-up status
    original_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.enrollment)
    ).filter(SessionLog.id == data.original_session_id).first()

    if not original_session:
        raise HTTPException(status_code=404, detail="Original session not found")

    if "Pending Make-up" not in original_session.session_status:
        raise HTTPException(
            status_code=400,
            detail=f"Session must be in 'Pending Make-up' status, got '{original_session.session_status}'"
        )

    # Check if there's already an active proposal for this session
    existing_proposal = db.query(MakeupProposal).filter(
        MakeupProposal.original_session_id == data.original_session_id,
        MakeupProposal.status == 'pending'
    ).first()

    if existing_proposal:
        raise HTTPException(
            status_code=400,
            detail="There is already a pending proposal for this session"
        )

    # For needs_input, verify target tutor
    if data.proposal_type == 'needs_input':
        if not data.needs_input_tutor_id:
            raise HTTPException(
                status_code=400,
                detail="needs_input_tutor_id is required for needs_input proposals"
            )
        target_tutor = db.query(Tutor).filter(Tutor.id == data.needs_input_tutor_id).first()
        if not target_tutor:
            raise HTTPException(status_code=404, detail="Target tutor not found")

    # For specific_slots, verify each slot's tutor
    if data.proposal_type == 'specific_slots':
        for slot_data in data.slots:
            slot_tutor = db.query(Tutor).filter(Tutor.id == slot_data.proposed_tutor_id).first()
            if not slot_tutor:
                raise HTTPException(
                    status_code=404,
                    detail=f"Tutor with ID {slot_data.proposed_tutor_id} not found"
                )

    # Gather info for message content
    student_name = original_session.student.student_name if original_session.student else "Unknown"
    student_id = original_session.student.school_student_id if original_session.student else ""
    student_grade = original_session.student.grade if original_session.student else ""
    session_date = original_session.session_date.strftime("%a %b %-d") if original_session.session_date else "Unknown"
    session_time = original_session.time_slot or ""
    original_tutor = original_session.tutor.tutor_name if original_session.tutor else "Unknown"

    # Create proposal first (without message_id, will update after)
    proposal = MakeupProposal(
        original_session_id=data.original_session_id,
        proposed_by_tutor_id=from_tutor_id,
        proposal_type=data.proposal_type,
        needs_input_tutor_id=data.needs_input_tutor_id,
        notes=data.notes,
        status='pending',
        message_id=None,
    )
    db.add(proposal)
    db.flush()  # Get proposal ID

    # Create slots for specific_slots type
    if data.proposal_type == 'specific_slots':
        for slot_data in data.slots:
            slot = MakeupProposalSlot(
                proposal_id=proposal.id,
                slot_order=slot_data.slot_order,
                proposed_date=slot_data.proposed_date,
                proposed_time_slot=slot_data.proposed_time_slot,
                proposed_tutor_id=slot_data.proposed_tutor_id,
                proposed_location=slot_data.proposed_location,
                slot_status='pending',
            )
            db.add(slot)

    # Build rich message content
    if data.proposal_type == 'specific_slots':
        slot_lines = []
        for i, slot_data in enumerate(data.slots, 1):
            slot_tutor = db.query(Tutor).filter(Tutor.id == slot_data.proposed_tutor_id).first()
            formatted_date = _format_date_with_day(slot_data.proposed_date)
            slot_lines.append(f"  {i}. {formatted_date} {slot_data.proposed_time_slot} with {slot_tutor.tutor_name if slot_tutor else 'TBD'} @ {slot_data.proposed_location}")
        slots_summary = "Proposed slots:\n" + "\n".join(slot_lines)
    else:
        target_tutor = db.query(Tutor).filter(Tutor.id == data.needs_input_tutor_id).first()
        slots_summary = f"Awaiting {target_tutor.tutor_name if target_tutor else 'you'} to select a slot."

    message_body = f"""Make-up request for:
Student: {student_id} {student_name} ({student_grade})
Original: {session_date} {session_time} with {original_tutor}

{slots_summary}
{f'{chr(10)}Notes: {data.notes}' if data.notes else ''}

View proposal: /proposals?id={proposal.id}""".strip()

    subject = f"[Make-up] {student_id} {student_name} - {session_date}"

    # Create targeted messages (not broadcast)
    # For needs_input: single message to target tutor
    # For specific_slots: one message per unique slot tutor
    messages_created = []

    if data.proposal_type == 'needs_input':
        message = TutorMessage(
            from_tutor_id=from_tutor_id,
            to_tutor_id=data.needs_input_tutor_id,
            subject=subject,
            message=message_body,
            priority="High",
            category="MakeupConfirmation",
        )
        db.add(message)
        messages_created.append(message)
    else:
        # For specific_slots: create message per unique slot tutor
        unique_tutor_ids = set(slot.proposed_tutor_id for slot in data.slots)
        for tutor_id in unique_tutor_ids:
            message = TutorMessage(
                from_tutor_id=from_tutor_id,
                to_tutor_id=tutor_id,
                subject=subject,
                message=message_body,
                priority="High",
                category="MakeupConfirmation",
            )
            db.add(message)
            messages_created.append(message)

    db.flush()  # Get message IDs

    # Update proposal with first message ID
    if messages_created:
        proposal.message_id = messages_created[0].id

    db.commit()

    # Reload with relationships
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ).filter(MakeupProposal.id == proposal.id).first()

    return _build_proposal_response(proposal, include_session=True, db=db)


@router.post("/makeup-proposals/slots/{slot_id}/approve", response_model=MakeupProposalResponse)
async def approve_slot(
    slot_id: int,
    tutor_id: int = Query(..., description="Approving tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Approve a proposal slot.

    - Only the slot's target tutor can approve
    - Creates the make-up session automatically
    - Auto-rejects sibling slots
    - Updates proposal status to 'approved'
    """
    # Get the slot with proposal
    slot = db.query(MakeupProposalSlot).options(
        joinedload(MakeupProposalSlot.proposal).joinedload(MakeupProposal.original_session),
        joinedload(MakeupProposalSlot.proposed_tutor),
    ).filter(MakeupProposalSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    proposal = slot.proposal

    # Check permissions: target tutor, proposer, or admin/super_admin
    is_target_tutor = slot.proposed_tutor_id == tutor_id
    is_proposer = proposal.proposed_by_tutor_id == tutor_id
    acting_tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    is_admin = acting_tutor and acting_tutor.role in ['admin', 'super_admin']

    if not (is_target_tutor or is_proposer or is_admin):
        raise HTTPException(
            status_code=403,
            detail="Only the target tutor, proposer, or admin can approve this slot"
        )

    # Verify slot is pending
    if slot.slot_status != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Slot is already {slot.slot_status}"
        )

    # Verify proposal is pending
    if proposal.status != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Proposal is already {proposal.status}"
        )

    # Get original session for validation and make-up creation
    original_session = db.query(SessionLog).options(
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
    ).filter(SessionLog.id == proposal.original_session_id).first()

    if not original_session:
        raise HTTPException(status_code=404, detail="Original session not found")

    # Validate: not a holiday
    holiday = db.query(Holiday).filter(
        Holiday.holiday_date == slot.proposed_date
    ).first()
    if holiday:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot schedule on holiday: {holiday.holiday_name}"
        )

    # Validate: student doesn't have conflicting session
    existing_session = db.query(SessionLog).filter(
        SessionLog.student_id == original_session.student_id,
        SessionLog.session_date == slot.proposed_date,
        SessionLog.time_slot == slot.proposed_time_slot,
        SessionLog.location == slot.proposed_location
    ).first()

    if existing_session and "Pending Make-up" not in existing_session.session_status:
        raise HTTPException(
            status_code=400,
            detail=f"Student already has a session at this slot (Session #{existing_session.id})"
        )

    # Create the make-up session
    makeup_session = SessionLog(
        enrollment_id=original_session.enrollment_id,
        student_id=original_session.student_id,
        tutor_id=slot.proposed_tutor_id,
        session_date=slot.proposed_date,
        time_slot=slot.proposed_time_slot,
        location=slot.proposed_location,
        session_status="Make-up Class",
        financial_status="Unpaid",
        make_up_for_id=original_session.id,
        notes=f"Approved via proposal #{proposal.id}",
        last_modified_by=f"tutor_{tutor_id}@csmpro.app",
        last_modified_time=datetime.now()
    )
    db.add(makeup_session)
    db.flush()

    # Update original session
    original_session.session_status = original_session.session_status.replace(
        "Pending Make-up", "Make-up Booked"
    )
    original_session.rescheduled_to_id = makeup_session.id
    original_session.last_modified_by = f"tutor_{tutor_id}@csmpro.app"
    original_session.last_modified_time = datetime.now()

    # Approve this slot
    slot.slot_status = 'approved'
    slot.resolved_at = datetime.now()
    slot.resolved_by_tutor_id = tutor_id

    # Auto-reject sibling slots
    for sibling in proposal.slots:
        if sibling.id != slot_id and sibling.slot_status == 'pending':
            sibling.slot_status = 'rejected'
            sibling.resolved_at = datetime.now()
            sibling.resolved_by_tutor_id = tutor_id
            sibling.rejection_reason = "Another slot was approved"

    # Update proposal status
    proposal.status = 'approved'
    proposal.resolved_at = datetime.now()
    proposal.active_flag = None  # Clear flag to allow new proposals

    db.commit()

    # Reload and return
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ).filter(MakeupProposal.id == proposal.id).first()

    return _build_proposal_response(proposal, include_session=True, db=db)


@router.post("/makeup-proposals/slots/{slot_id}/reject", response_model=MakeupProposalResponse)
async def reject_slot(
    slot_id: int,
    request: SlotRejectRequest,
    tutor_id: int = Query(..., description="Rejecting tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Reject a proposal slot.

    - Only the slot's target tutor can reject
    - If all slots are rejected, the proposal is rejected
    """
    slot = db.query(MakeupProposalSlot).options(
        joinedload(MakeupProposalSlot.proposal),
    ).filter(MakeupProposalSlot.id == slot_id).first()

    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    proposal = slot.proposal

    # Check permissions: target tutor, proposer, or admin/super_admin
    is_target_tutor = slot.proposed_tutor_id == tutor_id
    is_proposer = proposal.proposed_by_tutor_id == tutor_id
    acting_tutor = db.query(Tutor).filter(Tutor.id == tutor_id).first()
    is_admin = acting_tutor and acting_tutor.role in ['admin', 'super_admin']

    if not (is_target_tutor or is_proposer or is_admin):
        raise HTTPException(
            status_code=403,
            detail="Only the target tutor, proposer, or admin can reject this slot"
        )

    if slot.slot_status != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Slot is already {slot.slot_status}"
        )

    if proposal.status != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Proposal is already {proposal.status}"
        )

    # Reject the slot
    slot.slot_status = 'rejected'
    slot.resolved_at = datetime.now()
    slot.resolved_by_tutor_id = tutor_id
    slot.rejection_reason = request.rejection_reason

    # Check if all slots are now rejected
    all_slots = db.query(MakeupProposalSlot).filter(
        MakeupProposalSlot.proposal_id == proposal.id
    ).all()

    all_rejected = all(s.slot_status == 'rejected' for s in all_slots)

    if all_rejected:
        proposal.status = 'rejected'
        proposal.resolved_at = datetime.now()
        proposal.active_flag = None  # Clear flag to allow new proposals

    db.commit()

    # Reload and return
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ).filter(MakeupProposal.id == proposal.id).first()

    return _build_proposal_response(proposal, include_session=True, db=db)


@router.post("/makeup-proposals/{proposal_id}/reject", response_model=MakeupProposalResponse)
async def reject_proposal(
    proposal_id: int,
    request: ProposalRejectRequest,
    tutor_id: int = Query(..., description="Rejecting tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Reject an entire proposal (for needs_input type).

    - Only the needs_input target tutor can reject
    """
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.slots),
    ).filter(MakeupProposal.id == proposal_id).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.proposal_type != 'needs_input':
        raise HTTPException(
            status_code=400,
            detail="Use slot-level rejection for specific_slots proposals"
        )

    if proposal.needs_input_tutor_id != tutor_id:
        raise HTTPException(
            status_code=403,
            detail="Only the target tutor can reject this proposal"
        )

    if proposal.status != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Proposal is already {proposal.status}"
        )

    proposal.status = 'rejected'
    proposal.resolved_at = datetime.now()
    proposal.active_flag = None  # Clear flag to allow new proposals
    # Store rejection reason in notes
    if request.rejection_reason:
        proposal.notes = (proposal.notes or "") + f"\n\nRejected: {request.rejection_reason}"

    db.commit()

    # Reload and return
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ).filter(MakeupProposal.id == proposal.id).first()

    return _build_proposal_response(proposal, include_session=True, db=db)


@router.delete("/makeup-proposals/{proposal_id}")
async def cancel_proposal(
    proposal_id: int,
    tutor_id: int = Query(..., description="Requesting tutor ID"),
    db: Session = Depends(get_db)
):
    """
    Cancel a proposal (by the proposer).

    - Only the proposer can cancel
    - Only pending proposals can be cancelled
    """
    proposal = db.query(MakeupProposal).filter(
        MakeupProposal.id == proposal_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    if proposal.proposed_by_tutor_id != tutor_id:
        raise HTTPException(
            status_code=403,
            detail="Only the proposer can cancel this proposal"
        )

    if proposal.status != 'pending':
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a {proposal.status} proposal"
        )

    # Delete the proposal (cascade deletes slots)
    db.delete(proposal)
    db.commit()

    return {"success": True, "message": "Proposal cancelled"}


@router.get("/makeup-proposals/for-session/{session_id}", response_model=Optional[MakeupProposalResponse])
async def get_proposal_for_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    """Get the active proposal for a session (if any)."""
    proposal = db.query(MakeupProposal).options(
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ).filter(
        MakeupProposal.original_session_id == session_id,
        MakeupProposal.status == 'pending'
    ).first()

    if not proposal:
        return None

    return _build_proposal_response(proposal, include_session=True, db=db)
