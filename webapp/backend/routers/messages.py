"""
Messages API endpoints.
Provides messaging system for tutor-to-tutor communication.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func
from typing import List, Optional
from datetime import datetime
from database import get_db
from models import TutorMessage, MessageReadReceipt, MessageLike, Tutor
from schemas import (
    MessageCreate,
    MessageUpdate,
    MessageResponse,
    ThreadResponse,
    UnreadCountResponse
)

router = APIRouter()


def build_message_response(
    message: TutorMessage,
    current_tutor_id: int,
    db: Session
) -> MessageResponse:
    """Build a MessageResponse from a TutorMessage with computed fields."""
    # Check if read by current tutor
    is_read = db.query(MessageReadReceipt).filter(
        MessageReadReceipt.message_id == message.id,
        MessageReadReceipt.tutor_id == current_tutor_id
    ).first() is not None

    # Count likes (only LIKE actions, not UNLIKE)
    like_count = db.query(MessageLike).filter(
        MessageLike.message_id == message.id,
        MessageLike.action_type == "LIKE"
    ).count()

    # Check if liked by current tutor
    current_like = db.query(MessageLike).filter(
        MessageLike.message_id == message.id,
        MessageLike.tutor_id == current_tutor_id
    ).order_by(MessageLike.liked_at.desc()).first()
    is_liked_by_me = current_like is not None and current_like.action_type == "LIKE"

    # Count replies
    reply_count = db.query(TutorMessage).filter(
        TutorMessage.reply_to_id == message.id
    ).count()

    return MessageResponse(
        id=message.id,
        from_tutor_id=message.from_tutor_id,
        from_tutor_name=message.from_tutor.tutor_name if message.from_tutor else None,
        to_tutor_id=message.to_tutor_id,
        to_tutor_name=message.to_tutor.tutor_name if message.to_tutor else "All",
        subject=message.subject,
        message=message.message,
        priority=message.priority or "Normal",
        category=message.category,
        created_at=message.created_at,
        updated_at=message.updated_at,
        reply_to_id=message.reply_to_id,
        is_read=is_read,
        like_count=like_count,
        is_liked_by_me=is_liked_by_me,
        reply_count=reply_count
    )


@router.get("/messages", response_model=List[ThreadResponse])
async def get_message_threads(
    tutor_id: int = Query(..., description="Current tutor ID (required for read status)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(20, ge=1, le=50, description="Maximum threads to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """Get message threads with batched queries for performance."""
    from sqlalchemy import desc

    # 1. Fetch root messages
    query = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(
            TutorMessage.reply_to_id.is_(None),
            or_(
                TutorMessage.to_tutor_id == tutor_id,
                TutorMessage.to_tutor_id.is_(None),
                TutorMessage.from_tutor_id == tutor_id
            )
        )
    )
    if category:
        query = query.filter(TutorMessage.category == category)

    root_messages = query.order_by(TutorMessage.created_at.desc()).offset(offset).limit(limit).all()

    if not root_messages:
        return []

    root_ids = [m.id for m in root_messages]

    # 2. Batch fetch ALL replies for these roots
    all_replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.reply_to_id.in_(root_ids))
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    # Group replies by root_id
    replies_by_root = {}
    for reply in all_replies:
        replies_by_root.setdefault(reply.reply_to_id, []).append(reply)

    # Collect ALL message IDs (roots + replies)
    all_message_ids = root_ids + [r.id for r in all_replies]

    # 3. Batch fetch read receipts
    read_receipts = db.query(MessageReadReceipt.message_id).filter(
        MessageReadReceipt.message_id.in_(all_message_ids),
        MessageReadReceipt.tutor_id == tutor_id
    ).all()
    read_ids = set(r.message_id for r in read_receipts)

    # 4. Batch fetch like counts (GROUP BY)
    like_counts = db.query(
        MessageLike.message_id,
        func.count(MessageLike.id).label('count')
    ).filter(
        MessageLike.message_id.in_(all_message_ids),
        MessageLike.action_type == "LIKE"
    ).group_by(MessageLike.message_id).all()
    like_count_map = {lc.message_id: lc.count for lc in like_counts}

    # 5. Batch fetch "liked by me" - get latest action per message
    my_likes_subq = (
        db.query(
            MessageLike.message_id,
            MessageLike.action_type,
            func.row_number().over(
                partition_by=MessageLike.message_id,
                order_by=desc(MessageLike.liked_at)
            ).label('rn')
        )
        .filter(
            MessageLike.message_id.in_(all_message_ids),
            MessageLike.tutor_id == tutor_id
        )
        .subquery()
    )
    my_likes = db.query(my_likes_subq.c.message_id, my_likes_subq.c.action_type).filter(
        my_likes_subq.c.rn == 1
    ).all()
    liked_by_me = set(ml.message_id for ml in my_likes if ml.action_type == "LIKE")

    # 6. Batch fetch reply counts
    reply_counts = db.query(
        TutorMessage.reply_to_id,
        func.count(TutorMessage.id).label('count')
    ).filter(
        TutorMessage.reply_to_id.in_(all_message_ids)
    ).group_by(TutorMessage.reply_to_id).all()
    reply_count_map = {rc.reply_to_id: rc.count for rc in reply_counts}

    # Helper to build MessageResponse from pre-fetched data
    def build_response(msg: TutorMessage) -> MessageResponse:
        return MessageResponse(
            id=msg.id,
            from_tutor_id=msg.from_tutor_id,
            from_tutor_name=msg.from_tutor.tutor_name if msg.from_tutor else None,
            to_tutor_id=msg.to_tutor_id,
            to_tutor_name=msg.to_tutor.tutor_name if msg.to_tutor else "All",
            subject=msg.subject,
            message=msg.message,
            priority=msg.priority or "Normal",
            category=msg.category,
            created_at=msg.created_at,
            updated_at=msg.updated_at,
            reply_to_id=msg.reply_to_id,
            is_read=msg.id in read_ids,
            like_count=like_count_map.get(msg.id, 0),
            is_liked_by_me=msg.id in liked_by_me,
            reply_count=reply_count_map.get(msg.id, 0)
        )

    # Build thread responses
    threads = []
    for root in root_messages:
        replies = replies_by_root.get(root.id, [])
        all_ids_in_thread = [root.id] + [r.id for r in replies]
        unread_count = sum(1 for mid in all_ids_in_thread if mid not in read_ids)

        threads.append(ThreadResponse(
            root_message=build_response(root),
            replies=[build_response(r) for r in replies],
            total_unread=unread_count
        ))

    return threads


@router.get("/messages/sent", response_model=List[MessageResponse])
async def get_sent_messages(
    tutor_id: int = Query(..., description="Tutor ID to get sent messages for"),
    limit: int = Query(50, ge=1, le=200, description="Maximum messages to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """Get messages sent by the specified tutor."""
    messages = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.from_tutor_id == tutor_id)
        .order_by(TutorMessage.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [build_message_response(m, tutor_id, db) for m in messages]


@router.get("/messages/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    tutor_id: int = Query(..., description="Tutor ID to get unread count for"),
    db: Session = Depends(get_db)
):
    """Get the count of unread messages for a tutor."""
    # Get all message IDs visible to this tutor
    visible_messages = (
        db.query(TutorMessage.id)
        .filter(
            or_(
                TutorMessage.to_tutor_id == tutor_id,
                TutorMessage.to_tutor_id.is_(None)  # Broadcasts
            )
        )
        .all()
    )
    visible_ids = [m.id for m in visible_messages]

    if not visible_ids:
        return UnreadCountResponse(count=0)

    # Get read message IDs
    read_ids = set(
        r.message_id for r in db.query(MessageReadReceipt.message_id).filter(
            MessageReadReceipt.message_id.in_(visible_ids),
            MessageReadReceipt.tutor_id == tutor_id
        ).all()
    )

    unread_count = len(visible_ids) - len(read_ids)
    return UnreadCountResponse(count=unread_count)


@router.get("/messages/thread/{message_id}", response_model=ThreadResponse)
async def get_thread(
    message_id: int,
    tutor_id: int = Query(..., description="Current tutor ID"),
    db: Session = Depends(get_db)
):
    """Get a full thread by root message ID."""
    root = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.id == message_id)
        .first()
    )

    if not root:
        raise HTTPException(status_code=404, detail="Message not found")

    # If this message is a reply, get the actual root
    if root.reply_to_id:
        actual_root = (
            db.query(TutorMessage)
            .options(
                joinedload(TutorMessage.from_tutor),
                joinedload(TutorMessage.to_tutor)
            )
            .filter(TutorMessage.id == root.reply_to_id)
            .first()
        )
        if actual_root:
            root = actual_root

    # Get replies
    replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.reply_to_id == root.id)
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    # Build response
    root_response = build_message_response(root, tutor_id, db)
    reply_responses = [build_message_response(r, tutor_id, db) for r in replies]

    # Count unread
    all_message_ids = [root.id] + [r.id for r in replies]
    read_ids = set(
        r.message_id for r in db.query(MessageReadReceipt.message_id).filter(
            MessageReadReceipt.message_id.in_(all_message_ids),
            MessageReadReceipt.tutor_id == tutor_id
        ).all()
    )
    total_unread = len(all_message_ids) - len(read_ids)

    return ThreadResponse(
        root_message=root_response,
        replies=reply_responses,
        total_unread=total_unread
    )


@router.post("/messages", response_model=MessageResponse)
async def create_message(
    message_data: MessageCreate,
    from_tutor_id: int = Query(..., description="Sender tutor ID"),
    db: Session = Depends(get_db)
):
    """Create a new message or reply."""
    # Verify sender exists
    sender = db.query(Tutor).filter(Tutor.id == from_tutor_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender tutor not found")

    # If replying, verify parent exists
    if message_data.reply_to_id:
        parent = db.query(TutorMessage).filter(
            TutorMessage.id == message_data.reply_to_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent message not found")

    # If sending to specific tutor, verify they exist
    if message_data.to_tutor_id:
        recipient = db.query(Tutor).filter(Tutor.id == message_data.to_tutor_id).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient tutor not found")

    # Create message
    new_message = TutorMessage(
        from_tutor_id=from_tutor_id,
        to_tutor_id=message_data.to_tutor_id,
        subject=message_data.subject,
        message=message_data.message,
        priority=message_data.priority,
        category=message_data.category,
        reply_to_id=message_data.reply_to_id
    )

    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    # Load relationships
    new_message = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.id == new_message.id)
        .first()
    )

    return build_message_response(new_message, from_tutor_id, db)


@router.post("/messages/{message_id}/read")
async def mark_as_read(
    message_id: int,
    tutor_id: int = Query(..., description="Tutor marking as read"),
    db: Session = Depends(get_db)
):
    """Mark a message as read by the current tutor."""
    # Verify message exists
    message = db.query(TutorMessage).filter(TutorMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Check if already read
    existing = db.query(MessageReadReceipt).filter(
        MessageReadReceipt.message_id == message_id,
        MessageReadReceipt.tutor_id == tutor_id
    ).first()

    if not existing:
        receipt = MessageReadReceipt(
            message_id=message_id,
            tutor_id=tutor_id
        )
        db.add(receipt)
        db.commit()

    return {"success": True}


@router.post("/messages/{message_id}/like")
async def toggle_like(
    message_id: int,
    tutor_id: int = Query(..., description="Tutor toggling like"),
    db: Session = Depends(get_db)
):
    """Toggle like on a message."""
    # Verify message exists
    message = db.query(TutorMessage).filter(TutorMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Get current like status
    current_like = db.query(MessageLike).filter(
        MessageLike.message_id == message_id,
        MessageLike.tutor_id == tutor_id
    ).order_by(MessageLike.liked_at.desc()).first()

    # Toggle: if currently liked -> unlike, else -> like
    new_action = "UNLIKE" if (current_like and current_like.action_type == "LIKE") else "LIKE"

    new_like = MessageLike(
        message_id=message_id,
        tutor_id=tutor_id,
        action_type=new_action
    )
    db.add(new_like)
    db.commit()

    # Return new like count
    like_count = db.query(MessageLike).filter(
        MessageLike.message_id == message_id,
        MessageLike.action_type == "LIKE"
    ).count()

    return {
        "success": True,
        "is_liked": new_action == "LIKE",
        "like_count": like_count
    }


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def update_message(
    message_id: int,
    update_data: MessageUpdate,
    tutor_id: int = Query(..., description="Requesting tutor ID"),
    db: Session = Depends(get_db)
):
    """Update a message (only by the sender)."""
    message = db.query(TutorMessage).filter(TutorMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Only sender can edit
    if message.from_tutor_id != tutor_id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")

    if update_data.message is not None:
        message.message = update_data.message
        message.updated_at = datetime.now()

    db.commit()
    db.refresh(message)

    # Reload with relationships
    message = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.id == message_id)
        .first()
    )

    return build_message_response(message, tutor_id, db)


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    tutor_id: int = Query(..., description="Requesting tutor ID"),
    db: Session = Depends(get_db)
):
    """Delete a message (only by the sender)."""
    message = db.query(TutorMessage).filter(TutorMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Only sender can delete
    if message.from_tutor_id != tutor_id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    # Delete related records first (read receipts, likes)
    db.query(MessageReadReceipt).filter(MessageReadReceipt.message_id == message_id).delete()
    db.query(MessageLike).filter(MessageLike.message_id == message_id).delete()

    # Delete the message
    db.delete(message)
    db.commit()

    return {"success": True, "message": "Message deleted"}
