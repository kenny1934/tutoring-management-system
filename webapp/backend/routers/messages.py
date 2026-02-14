"""
Messages API endpoints.
Provides messaging system for tutor-to-tutor communication.
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func, desc
from typing import List, Optional
from datetime import datetime
from constants import hk_now
from database import get_db
from sse import sse_manager
import re
from models import TutorMessage, MessageReadReceipt, MessageLike, MessageArchive, MessagePin, ThreadPin, ThreadMute, MessageSnooze, MessageMention, MessageRecipient, MessageTemplate, Tutor, MakeupProposal
from utils.html_sanitizer import sanitize_message_html
from schemas import (
    MessageCreate,
    MessageUpdate,
    MessageResponse,
    ThreadResponse,
    UnreadCountResponse,
    CategoryUnreadCountsResponse,
    PaginatedThreadsResponse,
    PaginatedMessagesResponse,
    ArchiveRequest,
    ArchiveResponse,
    PinRequest,
    PinResponse,
    MarkAllReadRequest,
    MarkAllReadResponse,
    ReadReceiptDetail,
    LikeDetail,
    ReactionSummary,
    MessageTemplateCreate,
    MessageTemplateUpdate,
    MessageTemplateResponse,
    SnoozeRequest,
)
from utils.rate_limiter import check_user_rate_limit
from services.image_storage import upload_image

router = APIRouter()

# Group message sentinel value
GROUP_MESSAGE_SENTINEL = -1


def visible_to_tutor_filter(tutor_id: int, db: Session):
    """Reusable SQLAlchemy filter for messages visible to a specific tutor.

    A message is visible if:
    1. to_tutor_id == tutor_id (direct message), OR
    2. to_tutor_id IS NULL (broadcast), OR
    3. to_tutor_id == -1 AND tutor is in message_recipients (group message)
    """
    group_msg_subq = db.query(MessageRecipient.message_id).filter(
        MessageRecipient.tutor_id == tutor_id
    ).scalar_subquery()

    return or_(
        TutorMessage.to_tutor_id == tutor_id,
        TutorMessage.to_tutor_id.is_(None),
        and_(
            TutorMessage.to_tutor_id == GROUP_MESSAGE_SENTINEL,
            TutorMessage.id.in_(group_msg_subq)
        )
    )


# ============================================
# Shared query helpers (avoid duplication)
# ============================================

def _get_liked_by_me(db: Session, message_ids: list[int], tutor_id: int) -> set[int]:
    """Get set of message IDs that the given tutor has liked (latest action = LIKE)."""
    if not message_ids:
        return set()
    subq = (
        db.query(
            MessageLike.message_id,
            MessageLike.action_type,
            func.row_number().over(
                partition_by=MessageLike.message_id,
                order_by=desc(MessageLike.liked_at)
            ).label('rn')
        )
        .filter(MessageLike.message_id.in_(message_ids), MessageLike.tutor_id == tutor_id)
        .subquery()
    )
    rows = db.query(subq.c.message_id, subq.c.action_type).filter(subq.c.rn == 1).all()
    return set(r.message_id for r in rows if r.action_type == "LIKE")


def _bulk_insert_ignore(db: Session, model_class, message_ids: list[int], tutor_id: int) -> int:
    """Bulk INSERT IGNORE for archive/pin/thread-pin operations. Returns count of newly inserted rows."""
    from sqlalchemy.dialects.mysql import insert
    count = 0
    for message_id in message_ids:
        stmt = insert(model_class).values(message_id=message_id, tutor_id=tutor_id).prefix_with('IGNORE')
        result = db.execute(stmt)
        count += result.rowcount
    db.commit()
    return count


def _fetch_like_details(db: Session, message_ids: list[int]) -> dict[int, list[LikeDetail]]:
    """Batch fetch like details (emoji reactions) for a set of messages.
    Returns {message_id: [LikeDetail, ...]}."""
    if not message_ids:
        return {}

    like_details_subq = (
        db.query(
            MessageLike.message_id,
            MessageLike.tutor_id,
            MessageLike.action_type,
            MessageLike.emoji,
            MessageLike.liked_at,
            func.row_number().over(
                partition_by=[MessageLike.message_id, MessageLike.tutor_id, MessageLike.emoji],
                order_by=desc(MessageLike.liked_at)
            ).label('rn')
        )
        .filter(MessageLike.message_id.in_(message_ids))
        .subquery()
    )
    current_likers = (
        db.query(
            like_details_subq.c.message_id,
            like_details_subq.c.tutor_id,
            like_details_subq.c.emoji,
            like_details_subq.c.liked_at,
            Tutor.tutor_name
        )
        .join(Tutor, like_details_subq.c.tutor_id == Tutor.id)
        .filter(
            like_details_subq.c.rn == 1,
            like_details_subq.c.action_type == "LIKE"
        )
        .order_by(like_details_subq.c.liked_at.asc())
        .all()
    )
    result: dict[int, list[LikeDetail]] = {}
    for liker in current_likers:
        result.setdefault(liker.message_id, []).append(
            LikeDetail(
                tutor_id=liker.tutor_id,
                tutor_name=liker.tutor_name or "Unknown",
                liked_at=liker.liked_at,
                emoji=liker.emoji or "❤️"
            )
        )
    return result


def _fetch_read_receipts(
    db: Session, message_ids: list[int], current_tutor_id: int
) -> dict[int, list[ReadReceiptDetail]]:
    """Batch fetch read receipts for messages sent by current tutor.
    Returns {message_id: [ReadReceiptDetail, ...]}."""
    if not message_ids:
        return {}
    sender_receipts = (
        db.query(
            MessageReadReceipt.message_id,
            MessageReadReceipt.tutor_id,
            MessageReadReceipt.read_at,
            Tutor.tutor_name
        )
        .join(Tutor, MessageReadReceipt.tutor_id == Tutor.id)
        .filter(MessageReadReceipt.message_id.in_(message_ids))
        .filter(MessageReadReceipt.tutor_id != current_tutor_id)
        .order_by(MessageReadReceipt.read_at.asc())
        .all()
    )
    result: dict[int, list[ReadReceiptDetail]] = {}
    for receipt in sender_receipts:
        result.setdefault(receipt.message_id, []).append(
            ReadReceiptDetail(
                tutor_id=receipt.tutor_id,
                tutor_name=receipt.tutor_name or "Unknown",
                read_at=receipt.read_at
            )
        )
    return result


def _fetch_group_recipients(
    db: Session, message_ids: list[int]
) -> tuple[dict[int, list[int]], dict[int, list[str]], dict[int, int]]:
    """Batch fetch group message recipients.
    Returns (ids_map, names_map, count_map) where:
      ids_map:   {message_id: [tutor_id, ...]}
      names_map: {message_id: [tutor_name, ...]}
      count_map: {message_id: int}
    """
    ids_map: dict[int, list[int]] = {}
    names_map: dict[int, list[str]] = {}
    count_map: dict[int, int] = {}
    if not message_ids:
        return ids_map, names_map, count_map
    rows = (
        db.query(MessageRecipient.message_id, MessageRecipient.tutor_id, Tutor.tutor_name)
        .join(Tutor, MessageRecipient.tutor_id == Tutor.id)
        .filter(MessageRecipient.message_id.in_(message_ids))
        .order_by(MessageRecipient.message_id, Tutor.tutor_name)
        .all()
    )
    for r in rows:
        ids_map.setdefault(r.message_id, []).append(r.tutor_id)
        names_map.setdefault(r.message_id, []).append(r.tutor_name or "Unknown")
    for mid in message_ids:
        count_map[mid] = len(ids_map.get(mid, []))
    return ids_map, names_map, count_map


def _fetch_thread_pin_ids(db: Session, message_ids: list[int], tutor_id: int) -> set[int]:
    """Batch fetch thread-pinned status for a set of messages.
    Returns set of message_ids that are thread-pinned by this tutor."""
    if not message_ids:
        return set()
    rows = db.query(ThreadPin.message_id).filter(
        ThreadPin.message_id.in_(message_ids),
        ThreadPin.tutor_id == tutor_id
    ).all()
    return set(r.message_id for r in rows)


def _fetch_thread_mute_ids(db: Session, message_ids: list[int], tutor_id: int) -> set[int]:
    """Batch fetch muted status for a set of messages."""
    if not message_ids:
        return set()
    rows = db.query(ThreadMute.message_id).filter(
        ThreadMute.message_id.in_(message_ids),
        ThreadMute.tutor_id == tutor_id
    ).all()
    return set(r.message_id for r in rows)


def _fetch_snooze_data(db: Session, message_ids: list[int], tutor_id: int) -> dict[int, datetime]:
    """Batch fetch active snooze data. Returns {message_id: snooze_until} for actively snoozed messages."""
    if not message_ids:
        return {}
    rows = db.query(MessageSnooze.message_id, MessageSnooze.snooze_until).filter(
        MessageSnooze.message_id.in_(message_ids),
        MessageSnooze.tutor_id == tutor_id,
        MessageSnooze.snooze_until > func.now()
    ).all()
    return {r.message_id: r.snooze_until for r in rows}


# Regex to extract tiptap mention data-id from HTML (e.g., <span data-type="mention" data-id="42">)
_MENTION_ID_RE = re.compile(r'data-type=["\']mention["\'][^>]*data-id=["\'](\d+)["\']')


def _parse_mention_ids(html: str) -> set[int]:
    """Extract mentioned tutor IDs from tiptap HTML content."""
    if not html:
        return set()
    return {int(m) for m in _MENTION_ID_RE.findall(html)}


def _save_mentions(db: Session, message_id: int, html: str) -> set[int]:
    """Parse mentions from HTML and persist to DB. Returns mentioned tutor IDs."""
    mention_ids = _parse_mention_ids(html)
    if not mention_ids:
        return set()
    # Get existing mentions for this message
    existing = db.query(MessageMention.mentioned_tutor_id).filter(
        MessageMention.message_id == message_id
    ).all()
    existing_ids = {r.mentioned_tutor_id for r in existing}
    # Add new mentions
    for tid in mention_ids - existing_ids:
        db.add(MessageMention(message_id=message_id, mentioned_tutor_id=tid))
    # Remove stale mentions
    stale = existing_ids - mention_ids
    if stale:
        db.query(MessageMention).filter(
            MessageMention.message_id == message_id,
            MessageMention.mentioned_tutor_id.in_(stale)
        ).delete(synchronize_session=False)
    if mention_ids != existing_ids:
        db.commit()
    return mention_ids


def _deliver_due_scheduled_messages(tutor_id: int, db: Session):
    """Lazy delivery: find scheduled messages from this tutor that are now due, clear scheduled_at, and broadcast."""
    now = hk_now()
    due_messages = db.query(TutorMessage).options(
        joinedload(TutorMessage.from_tutor)
    ).filter(
        TutorMessage.from_tutor_id == tutor_id,
        TutorMessage.scheduled_at.isnot(None),
        TutorMessage.scheduled_at <= now,
    ).all()

    for msg in due_messages:
        msg.created_at = now  # Update to delivery time (not original creation time)
        msg.scheduled_at = None
        db.commit()
        # Save mentions now that message is delivered
        mentioned_ids = _save_mentions(db, msg.id, msg.message)
        # Broadcast via SSE
        recipient_ids = []
        if msg.to_tutor_id is None:
            all_tutors = db.query(Tutor.id).all()
            recipient_ids = [t.id for t in all_tutors if t.id != msg.from_tutor_id]
        elif msg.to_tutor_id == GROUP_MESSAGE_SENTINEL:
            recips = db.query(MessageRecipient.tutor_id).filter(
                MessageRecipient.message_id == msg.id
            ).all()
            recipient_ids = [r.tutor_id for r in recips]
        elif msg.to_tutor_id > 0:
            recipient_ids = [msg.to_tutor_id]
        if recipient_ids:
            asyncio.create_task(sse_manager.broadcast("new_message", {
                "message_id": msg.id,
                "thread_id": msg.reply_to_id or msg.id,
                "from_tutor_id": msg.from_tutor_id,
                "from_tutor_name": msg.from_tutor.tutor_name if msg.from_tutor else None,
                "subject": msg.subject,
                "preview": (msg.message or "")[:100],
                "category": msg.category,
                "priority": msg.priority,
                "mentioned_tutor_ids": sorted(mentioned_ids),
            }, recipient_ids))


def build_message_response(
    message: TutorMessage,
    current_tutor_id: int,
    db: Session
) -> MessageResponse:
    """Build a MessageResponse from a TutorMessage with computed fields.

    NOTE: This function runs 4 queries per message. For multiple messages,
    use batch_build_message_responses() instead to avoid N+1 query issues.
    """
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

    # Check if pinned by current tutor
    is_pinned = db.query(MessagePin).filter(
        MessagePin.message_id == message.id,
        MessagePin.tutor_id == current_tutor_id
    ).first() is not None

    # Check if thread-pinned by current tutor
    is_thread_pinned = db.query(ThreadPin).filter(
        ThreadPin.message_id == message.id,
        ThreadPin.tutor_id == current_tutor_id
    ).first() is not None

    # Check if thread-muted by current tutor
    is_thread_muted = db.query(ThreadMute).filter(
        ThreadMute.message_id == message.id,
        ThreadMute.tutor_id == current_tutor_id
    ).first() is not None

    # Check if snoozed
    snooze = db.query(MessageSnooze).filter(
        MessageSnooze.message_id == message.id,
        MessageSnooze.tutor_id == current_tutor_id,
        MessageSnooze.snooze_until > func.now()
    ).first()
    is_snoozed = snooze is not None
    snoozed_until = snooze.snooze_until if snooze else None

    # Count replies
    reply_count = db.query(TutorMessage).filter(
        TutorMessage.reply_to_id == message.id
    ).count()

    # Fetch like details via shared helper
    like_details_map = _fetch_like_details(db, [message.id])
    like_details = like_details_map.get(message.id, [])
    # Build reaction summary from like_details
    reaction_map: dict = {}
    for ld in like_details:
        if ld.emoji not in reaction_map:
            reaction_map[ld.emoji] = {"count": 0, "tutor_ids": []}
        reaction_map[ld.emoji]["count"] += 1
        reaction_map[ld.emoji]["tutor_ids"].append(ld.tutor_id)
    reaction_summary = [
        ReactionSummary(emoji=e, count=r["count"], tutor_ids=r["tutor_ids"])
        for e, r in reaction_map.items()
    ]

    # Group message fields
    is_group = message.to_tutor_id == GROUP_MESSAGE_SENTINEL
    _to_tutor_ids = None
    _to_tutor_names = None
    _to_tutor_name = message.to_tutor.tutor_name if message.to_tutor else "All"
    if is_group:
        ids_map, names_map, _ = _fetch_group_recipients(db, [message.id])
        _to_tutor_ids = ids_map.get(message.id)
        _to_tutor_names = names_map.get(message.id)
        if _to_tutor_names:
            if len(_to_tutor_names) <= 3:
                _to_tutor_name = ", ".join(_to_tutor_names)
            else:
                _to_tutor_name = f"{', '.join(_to_tutor_names[:2])} +{len(_to_tutor_names) - 2}"

    return MessageResponse(
        id=message.id,
        from_tutor_id=message.from_tutor_id,
        from_tutor_name=message.from_tutor.tutor_name if message.from_tutor else None,
        to_tutor_id=message.to_tutor_id,
        to_tutor_name=_to_tutor_name,
        subject=message.subject,
        message=message.message,
        priority=message.priority or "Normal",
        category=message.category,
        created_at=message.created_at,
        updated_at=message.updated_at,
        reply_to_id=message.reply_to_id,
        is_read=is_read,
        is_pinned=is_pinned,
        is_thread_pinned=is_thread_pinned,
        is_thread_muted=is_thread_muted,
        is_snoozed=is_snoozed,
        snoozed_until=snoozed_until,
        scheduled_at=message.scheduled_at,
        is_group_message=is_group,
        to_tutor_ids=_to_tutor_ids,
        to_tutor_names=_to_tutor_names,
        like_count=like_count,
        is_liked_by_me=is_liked_by_me,
        like_details=like_details,
        reaction_summary=reaction_summary,
        reply_count=reply_count,
        image_attachments=message.image_attachments or [],
        file_attachments=message.file_attachments or []
    )


def batch_build_message_responses(
    messages: List[TutorMessage],
    current_tutor_id: int,
    db: Session
) -> List[MessageResponse]:
    """Build MessageResponse objects for multiple messages using batched queries.

    This function runs ~6 queries total regardless of message count,
    compared to 4 queries per message with build_message_response().
    """


    if not messages:
        return []

    message_ids = [m.id for m in messages]

    # 1. Batch fetch read receipts (for is_read check)
    read_receipts = db.query(MessageReadReceipt.message_id).filter(
        MessageReadReceipt.message_id.in_(message_ids),
        MessageReadReceipt.tutor_id == current_tutor_id
    ).all()
    read_ids = set(r.message_id for r in read_receipts)

    # 2. Batch fetch pinned (star) status
    pinned_receipts = db.query(MessagePin.message_id).filter(
        MessagePin.message_id.in_(message_ids),
        MessagePin.tutor_id == current_tutor_id
    ).all()
    pinned_ids = set(r.message_id for r in pinned_receipts)

    # 2b. Batch fetch thread-pinned status
    thread_pinned_ids = _fetch_thread_pin_ids(db, message_ids, current_tutor_id)

    # 2c. Batch fetch thread-muted status
    thread_muted_ids = _fetch_thread_mute_ids(db, message_ids, current_tutor_id)

    # 2d. Batch fetch snooze data
    snooze_data = _fetch_snooze_data(db, message_ids, current_tutor_id)

    # 3. Batch fetch like counts (GROUP BY)
    like_counts = db.query(
        MessageLike.message_id,
        func.count(MessageLike.id).label('count')
    ).filter(
        MessageLike.message_id.in_(message_ids),
        MessageLike.action_type == "LIKE"
    ).group_by(MessageLike.message_id).all()
    like_count_map = {lc.message_id: lc.count for lc in like_counts}

    # 3. Batch fetch "liked by me" - get latest action per message
    liked_by_me = _get_liked_by_me(db, message_ids, current_tutor_id)

    # 4. Batch fetch like details (who reacted to each message)
    like_details_map = _fetch_like_details(db, message_ids)

    # 5. Batch fetch reply counts (exclude pending scheduled)
    reply_counts = db.query(
        TutorMessage.reply_to_id,
        func.count(TutorMessage.id).label('count')
    ).filter(
        TutorMessage.reply_to_id.in_(message_ids),
        TutorMessage.scheduled_at.is_(None),
    ).group_by(TutorMessage.reply_to_id).all()
    reply_count_map = {rc.reply_to_id: rc.count for rc in reply_counts}

    # 6. Fetch read receipts for messages sent by current tutor (WhatsApp-style seen)
    my_sent_ids = [m.id for m in messages if m.from_tutor_id == current_tutor_id]
    sender_read_receipts_map = _fetch_read_receipts(db, my_sent_ids, current_tutor_id)

    # 7. Get total active tutor count for broadcast messages (excluding sender)
    has_broadcast = any(m.from_tutor_id == current_tutor_id and m.to_tutor_id is None for m in messages)
    total_active_tutors = 0
    if has_broadcast:
        total_active_tutors = db.query(func.count(Tutor.id)).filter(
            Tutor.id != current_tutor_id
        ).scalar() or 0

    # 8. Batch fetch group recipient info
    _batch_group_ids = [m.id for m in messages if m.to_tutor_id == GROUP_MESSAGE_SENTINEL]
    _batch_group_recipients_map, _batch_group_names_map, _batch_group_count_map = _fetch_group_recipients(db, _batch_group_ids)

    # Build responses using pre-fetched data
    responses = []
    for msg in messages:
        is_own_message = msg.from_tutor_id == current_tutor_id
        is_broadcast = msg.to_tutor_id is None
        is_group = msg.to_tutor_id == GROUP_MESSAGE_SENTINEL

        # Determine read receipt data for sender's messages
        read_receipts_list = None
        total_recipients = None
        read_by_all = None

        if is_own_message:
            read_receipts_list = sender_read_receipts_map.get(msg.id, [])
            read_count = len(read_receipts_list)

            if is_broadcast:
                total_recipients = total_active_tutors
                read_by_all = read_count >= total_recipients if total_recipients > 0 else True
            elif is_group:
                total_recipients = _batch_group_count_map.get(msg.id, 0)
                read_by_all = read_count >= total_recipients if total_recipients > 0 else True
            else:
                total_recipients = 1
                read_by_all = read_count >= 1

        # Group message display name
        if is_group:
            names = _batch_group_names_map.get(msg.id, [])
            to_tutor_name = ", ".join(names) if len(names) <= 3 else f"{', '.join(names[:2])} +{len(names) - 2}"
        else:
            to_tutor_name = msg.to_tutor.tutor_name if msg.to_tutor else "All"

        responses.append(
            MessageResponse(
                id=msg.id,
                from_tutor_id=msg.from_tutor_id,
                from_tutor_name=msg.from_tutor.tutor_name if msg.from_tutor else None,
                to_tutor_id=msg.to_tutor_id,
                to_tutor_name=to_tutor_name,
                subject=msg.subject,
                message=msg.message,
                priority=msg.priority or "Normal",
                category=msg.category,
                created_at=msg.created_at,
                updated_at=msg.updated_at,
                reply_to_id=msg.reply_to_id,
                is_read=msg.id in read_ids,
                is_pinned=msg.id in pinned_ids,
                is_thread_pinned=msg.id in thread_pinned_ids,
                is_thread_muted=msg.id in thread_muted_ids,
                is_snoozed=msg.id in snooze_data,
                snoozed_until=snooze_data.get(msg.id),
                scheduled_at=msg.scheduled_at,
                is_group_message=is_group,
                to_tutor_ids=_batch_group_recipients_map.get(msg.id) if is_group else None,
                to_tutor_names=_batch_group_names_map.get(msg.id) if is_group else None,
                like_count=like_count_map.get(msg.id, 0),
                is_liked_by_me=msg.id in liked_by_me,
                like_details=like_details_map.get(msg.id, []),
                reply_count=reply_count_map.get(msg.id, 0),
                image_attachments=msg.image_attachments or [],
                file_attachments=msg.file_attachments or [],
                read_receipts=read_receipts_list,
                total_recipients=total_recipients,
                read_by_all=read_by_all
            )
        )

    return responses


# ============================================
# SSE real-time stream
# ============================================

@router.get("/messages/stream")
async def message_stream(
    tutor_id: int = Query(..., description="Tutor ID to stream events for"),
    request: Request = None,
):
    """Server-Sent Events stream for real-time message delivery.

    Pushes events: new_message, message_read, reaction, typing, presence.
    Client connects via EventSource and receives JSON payloads.
    """
    queue = sse_manager.connect(tutor_id)

    async def event_generator():
        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    break

                try:
                    # Wait for an event, with 30s timeout for keepalive
                    message = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield message
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent connection timeout
                    sse_manager.update_presence(tutor_id)
                    yield ": keepalive\n\n"
        finally:
            sse_manager.disconnect(tutor_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/messages/typing")
async def send_typing_indicator(
    tutor_id: int = Query(..., description="Tutor who is typing"),
    thread_id: int = Query(..., description="Root message ID of the thread"),
    db: Session = Depends(get_db),
):
    """Broadcast a typing indicator to thread participants via SSE."""
    # Get sender name
    sender = db.query(Tutor.tutor_name).filter(Tutor.id == tutor_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Tutor not found")

    # Get thread root to determine participants
    root = db.query(TutorMessage).filter(TutorMessage.id == thread_id).first()
    if not root:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Determine recipients (all thread participants except the typer)
    participant_ids: set[int] = set()
    # Root sender + root recipient
    participant_ids.add(root.from_tutor_id)
    if root.to_tutor_id and root.to_tutor_id > 0:
        participant_ids.add(root.to_tutor_id)
    elif root.to_tutor_id == GROUP_MESSAGE_SENTINEL:
        group_ids = db.query(MessageRecipient.tutor_id).filter(
            MessageRecipient.message_id == thread_id
        ).all()
        participant_ids.update(r.tutor_id for r in group_ids)
    elif root.to_tutor_id is None:
        # Broadcast thread — don't send typing to everyone, just active repliers
        replier_ids = db.query(TutorMessage.from_tutor_id).filter(
            TutorMessage.reply_to_id == thread_id
        ).distinct().all()
        participant_ids.update(r.from_tutor_id for r in replier_ids)

    participant_ids.discard(tutor_id)

    if participant_ids:
        await sse_manager.broadcast("typing", {
            "thread_id": thread_id,
            "tutor_id": tutor_id,
            "tutor_name": sender.tutor_name,
        }, list(participant_ids))

    return {"success": True}


@router.get("/messages/presence")
async def get_presence():
    """Return currently online tutors and their last-seen timestamps."""
    online = sse_manager.get_online_tutors(within_seconds=300)
    return {
        "online": list(online.keys()),
        "last_seen": {str(tid): ts.isoformat() for tid, ts in online.items()},
    }


@router.get("/messages/templates", response_model=List[MessageTemplateResponse])
async def get_templates(
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Get message templates (personal + global)."""
    templates = db.query(MessageTemplate).filter(
        or_(MessageTemplate.tutor_id == tutor_id, MessageTemplate.is_global == True)
    ).order_by(MessageTemplate.is_global.desc(), MessageTemplate.title).all()
    return templates


@router.post("/messages/templates", response_model=MessageTemplateResponse)
async def create_template(
    template: MessageTemplateCreate,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Create a personal message template."""
    db_template = MessageTemplate(
        tutor_id=tutor_id,
        title=template.title,
        content=template.content,
        category=template.category,
        is_global=False,
    )
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template


@router.patch("/messages/templates/{template_id}", response_model=MessageTemplateResponse)
async def update_template(
    template_id: int,
    template: MessageTemplateUpdate,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Update a personal message template."""
    db_template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.tutor_id == tutor_id,
    ).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.title is not None:
        db_template.title = template.title
    if template.content is not None:
        db_template.content = template.content
    if template.category is not None:
        db_template.category = template.category
    db.commit()
    db.refresh(db_template)
    return db_template


@router.delete("/messages/templates/{template_id}")
async def delete_template(
    template_id: int,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Delete a personal message template."""
    db_template = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.tutor_id == tutor_id,
    ).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(db_template)
    db.commit()
    return {"success": True}


@router.post("/messages/thread-mute")
async def mute_threads(
    request: PinRequest,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Mute threads to suppress notifications."""
    count = 0
    for mid in request.message_ids:
        exists = db.query(ThreadMute).filter(
            ThreadMute.message_id == mid, ThreadMute.tutor_id == tutor_id
        ).first()
        if not exists:
            db.add(ThreadMute(message_id=mid, tutor_id=tutor_id))
            count += 1
    db.commit()
    return {"success": True, "count": count}


@router.delete("/messages/thread-mute")
async def unmute_threads(
    request: PinRequest,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Unmute threads."""
    count = db.query(ThreadMute).filter(
        ThreadMute.message_id.in_(request.message_ids),
        ThreadMute.tutor_id == tutor_id
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "count": count}


@router.post("/messages/snooze")
async def snooze_threads(
    request: SnoozeRequest,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Snooze threads until a specified time."""
    count = 0
    for mid in request.message_ids:
        existing = db.query(MessageSnooze).filter(
            MessageSnooze.message_id == mid, MessageSnooze.tutor_id == tutor_id
        ).first()
        if existing:
            existing.snooze_until = request.snooze_until
        else:
            db.add(MessageSnooze(message_id=mid, tutor_id=tutor_id, snooze_until=request.snooze_until))
        count += 1
    db.commit()
    return {"success": True, "count": count}


@router.delete("/messages/snooze")
async def unsnooze_threads(
    request: PinRequest,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Unsnooze threads immediately."""
    count = db.query(MessageSnooze).filter(
        MessageSnooze.message_id.in_(request.message_ids),
        MessageSnooze.tutor_id == tutor_id
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "count": count}


@router.get("/messages/snoozed")
async def get_snoozed_threads(
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Get currently snoozed/reminded threads as full messages."""
    snooze_rows = db.query(MessageSnooze).filter(
        MessageSnooze.tutor_id == tutor_id,
        MessageSnooze.snooze_until > func.now()
    ).all()
    if not snooze_rows:
        return []
    msg_ids = [s.message_id for s in snooze_rows]
    messages = (
        db.query(TutorMessage)
        .options(joinedload(TutorMessage.from_tutor), joinedload(TutorMessage.to_tutor))
        .filter(TutorMessage.id.in_(msg_ids))
        .order_by(TutorMessage.created_at.desc())
        .all()
    )
    return [build_message_response(m, tutor_id, db) for m in messages]


@router.get("/messages/scheduled")
async def get_scheduled_messages(
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Get messages scheduled for future delivery by this tutor."""
    messages = (
        db.query(TutorMessage)
        .options(joinedload(TutorMessage.from_tutor), joinedload(TutorMessage.to_tutor))
        .filter(
            TutorMessage.from_tutor_id == tutor_id,
            TutorMessage.scheduled_at.isnot(None),
            TutorMessage.scheduled_at > hk_now(),
        )
        .order_by(TutorMessage.scheduled_at)
        .all()
    )
    return [build_message_response(m, tutor_id, db) for m in messages]


@router.delete("/messages/scheduled/{message_id}")
async def cancel_scheduled_message(
    message_id: int,
    tutor_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Cancel a scheduled message (delete from DB)."""
    message = db.query(TutorMessage).filter(
        TutorMessage.id == message_id,
        TutorMessage.from_tutor_id == tutor_id,
        TutorMessage.scheduled_at.isnot(None),
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Scheduled message not found")
    db.delete(message)
    db.commit()
    return {"success": True}


@router.get("/messages", response_model=PaginatedThreadsResponse)
async def get_message_threads(
    tutor_id: int = Query(..., description="Current tutor ID (required for read status)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, min_length=1, max_length=100, description="Search in subject, message, or tutor names"),
    from_tutor_id: Optional[int] = Query(None, description="Filter by sender tutor ID"),
    date_from: Optional[str] = Query(None, description="Filter by start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter by end date (YYYY-MM-DD)"),
    has_attachments: Optional[bool] = Query(None, description="Filter messages with attachments"),
    priority: Optional[str] = Query(None, description="Filter by priority level"),
    limit: int = Query(50, ge=1, le=500, description="Maximum threads to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """Get message threads with batched queries for performance."""

    # Lazy delivery of scheduled messages that are now due
    _deliver_due_scheduled_messages(tutor_id, db)

    # Subquery for archived message IDs for this tutor
    archived_ids_subq = db.query(MessageArchive.message_id).filter(
        MessageArchive.tutor_id == tutor_id
    ).scalar_subquery()

    # Subquery: root message IDs that have replies from other tutors
    has_replies_subq = db.query(TutorMessage.reply_to_id).filter(
        TutorMessage.reply_to_id.isnot(None),
        TutorMessage.from_tutor_id != tutor_id
    ).scalar_subquery()

    # Base query for root messages (excluding archived and still-scheduled)
    base_query = (
        db.query(TutorMessage)
        .outerjoin(Tutor, TutorMessage.from_tutor_id == Tutor.id)
        .filter(
            TutorMessage.reply_to_id.is_(None),
            ~TutorMessage.id.in_(archived_ids_subq),  # Exclude archived
            TutorMessage.scheduled_at.is_(None),  # Exclude pending scheduled messages
            or_(
                visible_to_tutor_filter(tutor_id, db),
                TutorMessage.id.in_(has_replies_subq),     # Threads I started with replies
            )
        )
    )
    if category:
        base_query = base_query.filter(TutorMessage.category == category)
    if from_tutor_id:
        base_query = base_query.filter(TutorMessage.from_tutor_id == from_tutor_id)
    if date_from:
        base_query = base_query.filter(TutorMessage.created_at >= date_from)
    if date_to:
        base_query = base_query.filter(TutorMessage.created_at <= f"{date_to} 23:59:59")
    if has_attachments:
        base_query = base_query.filter(
            or_(
                func.json_length(TutorMessage.image_attachments) > 0,
                func.json_length(TutorMessage.file_attachments) > 0,
            )
        )
    if priority:
        base_query = base_query.filter(TutorMessage.priority == priority)

    # Apply search filter
    if search:
        search_pattern = f"%{search}%"
        base_query = base_query.filter(
            or_(
                TutorMessage.subject.ilike(search_pattern),
                TutorMessage.message.ilike(search_pattern),
                Tutor.tutor_name.ilike(search_pattern)
            )
        )

    # Get total count BEFORE pagination
    total_count = base_query.count()

    # Fetch paginated root messages with eager loading
    query = (
        base_query
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
    )
    root_messages = query.order_by(TutorMessage.created_at.desc()).offset(offset).limit(limit).all()

    if not root_messages:
        return PaginatedThreadsResponse(
            threads=[],
            total_count=total_count,
            has_more=False,
            limit=limit,
            offset=offset
        )

    root_ids = [m.id for m in root_messages]

    # 2. Batch fetch ALL replies for these roots (exclude pending scheduled)
    all_replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(
            TutorMessage.reply_to_id.in_(root_ids),
            TutorMessage.scheduled_at.is_(None),
        )
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

    # Batch fetch pinned (star) status
    pinned_receipts = db.query(MessagePin.message_id).filter(
        MessagePin.message_id.in_(all_message_ids),
        MessagePin.tutor_id == tutor_id
    ).all()
    pinned_ids = set(r.message_id for r in pinned_receipts)

    # Batch fetch thread-pinned status
    thread_pinned_ids = _fetch_thread_pin_ids(db, all_message_ids, tutor_id)

    # Batch fetch thread-muted status
    thread_muted_ids = _fetch_thread_mute_ids(db, all_message_ids, tutor_id)

    # Batch fetch snooze data
    snooze_data = _fetch_snooze_data(db, all_message_ids, tutor_id)

    # Combine all messages for in-memory lookups
    all_messages = root_messages + all_replies

    # Batch fetch group message visibility (for in-memory unread checks)
    _group_msg_ids = [m.id for m in all_messages if m.to_tutor_id == GROUP_MESSAGE_SENTINEL]
    group_visible_ids = set()
    if _group_msg_ids:
        _rows = db.query(MessageRecipient.message_id).filter(
            MessageRecipient.message_id.in_(_group_msg_ids),
            MessageRecipient.tutor_id == tutor_id
        ).all()
        group_visible_ids = set(r.message_id for r in _rows)

    def _is_visible_to_me(msg):
        return (msg.to_tutor_id == tutor_id or msg.to_tutor_id is None or
                (msg.to_tutor_id == GROUP_MESSAGE_SENTINEL and msg.id in group_visible_ids))

    # Batch fetch group recipient info for response building
    group_recipients_map, group_recipient_names_map, group_recipient_count_map = _fetch_group_recipients(db, _group_msg_ids)

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
    liked_by_me = _get_liked_by_me(db, all_message_ids, tutor_id)

    # 6. Batch fetch like details (who reacted to each message)
    like_details_map = _fetch_like_details(db, all_message_ids)

    # 7. Batch fetch reply counts (exclude pending scheduled)
    reply_counts = db.query(
        TutorMessage.reply_to_id,
        func.count(TutorMessage.id).label('count')
    ).filter(
        TutorMessage.reply_to_id.in_(all_message_ids),
        TutorMessage.scheduled_at.is_(None),
    ).group_by(TutorMessage.reply_to_id).all()
    reply_count_map = {rc.reply_to_id: rc.count for rc in reply_counts}

    # 8. Fetch read receipts for messages sent by current tutor (seen badges)
    my_sent_ids = [m.id for m in all_messages if m.from_tutor_id == tutor_id]
    sender_read_receipts_map = _fetch_read_receipts(db, my_sent_ids, tutor_id)

    # 9. Get total tutor count for broadcast messages (excluding sender)
    has_broadcast = any(m.from_tutor_id == tutor_id and m.to_tutor_id is None for m in all_messages)
    total_active_tutors = 0
    if has_broadcast:
        total_active_tutors = db.query(func.count(Tutor.id)).filter(
            Tutor.id != tutor_id
        ).scalar() or 0

    # Helper to build MessageResponse from pre-fetched data
    def build_response(msg: TutorMessage) -> MessageResponse:
        is_own_message = msg.from_tutor_id == tutor_id
        is_broadcast = msg.to_tutor_id is None
        is_group = msg.to_tutor_id == GROUP_MESSAGE_SENTINEL

        read_receipts_list = None
        total_recipients = None
        read_by_all = None

        if is_own_message:
            read_receipts_list = sender_read_receipts_map.get(msg.id, [])
            read_count = len(read_receipts_list)
            if is_broadcast:
                total_recipients = total_active_tutors
                read_by_all = read_count >= total_recipients if total_recipients > 0 else True
            elif is_group:
                total_recipients = group_recipient_count_map.get(msg.id, 0)
                read_by_all = read_count >= total_recipients if total_recipients > 0 else True
            else:
                total_recipients = 1
                read_by_all = read_count >= 1

        # Group message display name
        if is_group:
            names = group_recipient_names_map.get(msg.id, [])
            if len(names) <= 3:
                to_tutor_name = ", ".join(names)
            else:
                to_tutor_name = f"{', '.join(names[:2])} +{len(names) - 2}"
        else:
            to_tutor_name = msg.to_tutor.tutor_name if msg.to_tutor else "All"

        return MessageResponse(
            id=msg.id,
            from_tutor_id=msg.from_tutor_id,
            from_tutor_name=msg.from_tutor.tutor_name if msg.from_tutor else None,
            to_tutor_id=msg.to_tutor_id,
            to_tutor_name=to_tutor_name,
            subject=msg.subject,
            message=msg.message,
            priority=msg.priority or "Normal",
            category=msg.category,
            created_at=msg.created_at,
            updated_at=msg.updated_at,
            reply_to_id=msg.reply_to_id,
            is_read=msg.id in read_ids,
            is_pinned=msg.id in pinned_ids,
            is_thread_pinned=msg.id in thread_pinned_ids,
            is_thread_muted=msg.id in thread_muted_ids,
            is_snoozed=msg.id in snooze_data,
            snoozed_until=snooze_data.get(msg.id),
            is_group_message=is_group,
            to_tutor_ids=group_recipients_map.get(msg.id) if is_group else None,
            to_tutor_names=group_recipient_names_map.get(msg.id) if is_group else None,
            like_count=like_count_map.get(msg.id, 0),
            is_liked_by_me=msg.id in liked_by_me,
            like_details=like_details_map.get(msg.id, []),
            reply_count=reply_count_map.get(msg.id, 0),
            image_attachments=msg.image_attachments or [],
            file_attachments=msg.file_attachments or [],
            read_receipts=read_receipts_list,
            total_recipients=total_recipients,
            read_by_all=read_by_all
        )

    # Build thread responses
    threads = []
    for root in root_messages:
        replies = replies_by_root.get(root.id, [])
        all_msgs_in_thread = [root] + replies
        unread_count = sum(1 for m in all_msgs_in_thread if m.id not in read_ids and _is_visible_to_me(m))

        threads.append(ThreadResponse(
            root_message=build_response(root),
            replies=[build_response(r) for r in replies],
            total_unread=unread_count
        ))

    return PaginatedThreadsResponse(
        threads=threads,
        total_count=total_count,
        has_more=(offset + len(threads)) < total_count,
        limit=limit,
        offset=offset
    )


@router.get("/messages/sent", response_model=List[MessageResponse])
async def get_sent_messages(
    tutor_id: int = Query(..., description="Tutor ID to get sent messages for"),
    limit: int = Query(50, ge=1, le=500, description="Maximum messages to return"),
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

    # Use batch function to avoid N+1 queries
    return batch_build_message_responses(messages, tutor_id, db)


@router.get("/messages/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    tutor_id: int = Query(..., description="Tutor ID to get unread count for"),
    db: Session = Depends(get_db)
):
    """Get the count of unread messages for a tutor."""
    # Exclude archived messages for this tutor
    archived_ids_subq = db.query(MessageArchive.message_id).filter(
        MessageArchive.tutor_id == tutor_id
    ).scalar_subquery()

    # Count visible messages that have no read receipt (excluding archived and pending scheduled)
    unread_count = db.query(func.count(TutorMessage.id)).filter(
        visible_to_tutor_filter(tutor_id, db),
        TutorMessage.scheduled_at.is_(None),
        ~TutorMessage.id.in_(archived_ids_subq),
        ~db.query(MessageReadReceipt.id).filter(
            MessageReadReceipt.message_id == TutorMessage.id,
            MessageReadReceipt.tutor_id == tutor_id
        ).exists()
    ).scalar() or 0

    return UnreadCountResponse(count=unread_count)


@router.get("/messages/unread-counts-by-category", response_model=CategoryUnreadCountsResponse)
async def get_unread_counts_by_category(
    tutor_id: int = Query(..., description="Tutor ID"),
    db: Session = Depends(get_db)
):
    """Get per-category unread message counts for sidebar badges."""
    archived_ids_subq = db.query(MessageArchive.message_id).filter(
        MessageArchive.tutor_id == tutor_id
    ).scalar_subquery()

    read_ids_subq = db.query(MessageReadReceipt.message_id).filter(
        MessageReadReceipt.tutor_id == tutor_id
    ).scalar_subquery()

    # Count unread root messages (reply_to_id IS NULL) grouped by category
    rows = db.query(
        TutorMessage.category,
        func.count(TutorMessage.id)
    ).filter(
        visible_to_tutor_filter(tutor_id, db),
        TutorMessage.scheduled_at.is_(None),
        TutorMessage.reply_to_id.is_(None),
        ~TutorMessage.id.in_(archived_ids_subq),
        ~TutorMessage.id.in_(read_ids_subq),
    ).group_by(TutorMessage.category).all()

    # Also count unread replies
    reply_rows = db.query(
        # For replies, get the root's category
        func.coalesce(
            db.query(TutorMessage.category).filter(
                TutorMessage.id == TutorMessage.reply_to_id
            ).correlate(TutorMessage).scalar_subquery(),
            TutorMessage.category
        ).label("root_category"),
        func.count(TutorMessage.id)
    ).filter(
        visible_to_tutor_filter(tutor_id, db),
        TutorMessage.scheduled_at.is_(None),
        TutorMessage.reply_to_id.isnot(None),
        ~TutorMessage.id.in_(archived_ids_subq),
        ~TutorMessage.id.in_(read_ids_subq),
    ).group_by("root_category").all()

    counts: dict[str, int] = {}
    total = 0
    for category, count in list(rows) + list(reply_rows):
        cat_key = category or "uncategorized"
        counts[cat_key] = counts.get(cat_key, 0) + count
        total += count
    counts["inbox"] = total

    # Count unread threads where this tutor is mentioned
    mention_msg_ids = db.query(MessageMention.message_id).filter(
        MessageMention.mentioned_tutor_id == tutor_id
    ).scalar_subquery()
    mention_unread = db.query(func.count(TutorMessage.id)).filter(
        TutorMessage.id.in_(mention_msg_ids),
        TutorMessage.scheduled_at.is_(None),
        ~TutorMessage.id.in_(read_ids_subq),
    ).scalar() or 0
    counts["mentions"] = mention_unread

    return CategoryUnreadCountsResponse(counts=counts)


@router.get("/messages/mentions", response_model=PaginatedThreadsResponse)
async def get_mentioned_threads(
    tutor_id: int = Query(..., description="Current tutor ID"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get threads where current tutor is @mentioned."""
    # Find root thread IDs for messages mentioning this tutor
    mentioned_msg_ids_subq = db.query(MessageMention.message_id).filter(
        MessageMention.mentioned_tutor_id == tutor_id
    ).scalar_subquery()

    # Get root message IDs: either the mentioned message itself (if root) or its reply_to_id
    mentioned_msgs = db.query(TutorMessage).filter(
        TutorMessage.id.in_(mentioned_msg_ids_subq)
    ).all()
    root_ids = set()
    for m in mentioned_msgs:
        root_ids.add(m.reply_to_id if m.reply_to_id else m.id)

    if not root_ids:
        return PaginatedThreadsResponse(threads=[], total=0, limit=limit, offset=offset)

    total = len(root_ids)

    # Fetch root messages, sorted by latest mention
    root_messages = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(TutorMessage.id.in_(root_ids))
        .order_by(desc(TutorMessage.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not root_messages:
        return PaginatedThreadsResponse(threads=[], total=total, limit=limit, offset=offset)

    root_ids_page = [m.id for m in root_messages]
    root_responses = batch_build_message_responses(root_messages, tutor_id, db)

    # Fetch replies (exclude pending scheduled)
    all_replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(
            TutorMessage.reply_to_id.in_(root_ids_page),
            TutorMessage.scheduled_at.is_(None),
        )
        .order_by(TutorMessage.created_at)
        .all()
    )
    replies_map: dict[int, list] = {}
    for r in all_replies:
        replies_map.setdefault(r.reply_to_id, []).append(r)

    # Batch build replies
    flat_replies = [r for group in replies_map.values() for r in group]
    reply_responses = batch_build_message_responses(flat_replies, tutor_id, db)
    reply_resp_map: dict[int, list] = {}
    for rr in reply_responses:
        reply_resp_map.setdefault(rr.reply_to_id, []).append(rr)

    # Unread counts
    read_ids_subq = db.query(MessageReadReceipt.message_id).filter(
        MessageReadReceipt.tutor_id == tutor_id
    ).scalar_subquery()

    threads = []
    for root_resp in root_responses:
        thread_msg_ids = [root_resp.id] + [r.id for r in reply_resp_map.get(root_resp.id, [])]
        unread = db.query(func.count(TutorMessage.id)).filter(
            TutorMessage.id.in_(thread_msg_ids),
            ~TutorMessage.id.in_(read_ids_subq),
        ).scalar() or 0
        threads.append(ThreadResponse(
            root_message=root_resp,
            replies=reply_resp_map.get(root_resp.id, []),
            total_unread=unread,
        ))

    # Sort by most recent activity
    threads.sort(key=lambda t: max(
        [t.root_message.created_at] + [r.created_at for r in t.replies]
    ), reverse=True)

    return PaginatedThreadsResponse(threads=threads, total=total, limit=limit, offset=offset)


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

    # Get replies (exclude pending scheduled messages)
    replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(
            TutorMessage.reply_to_id == root.id,
            TutorMessage.scheduled_at.is_(None),
        )
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    # Use batch function to avoid N+1 queries
    all_messages = [root] + replies
    all_responses = batch_build_message_responses(all_messages, tutor_id, db)
    root_response = all_responses[0]
    reply_responses = all_responses[1:]

    # Count unread: only messages visible to current tutor (direct, broadcast, or group recipient)
    total_unread = sum(1 for r in all_responses if not r.is_read and (
        r.to_tutor_id == tutor_id or r.to_tutor_id is None or
        (r.is_group_message and r.to_tutor_ids and tutor_id in r.to_tutor_ids)
    ))

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
    # Rate limit check - most critical endpoint for spam prevention
    check_user_rate_limit(from_tutor_id, "message_create")

    # Verify sender exists
    sender = db.query(Tutor).filter(Tutor.id == from_tutor_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Sender tutor not found")

    # Validate mutual exclusivity of to_tutor_id and to_tutor_ids
    if message_data.to_tutor_id and message_data.to_tutor_ids:
        raise HTTPException(status_code=400, detail="Cannot specify both to_tutor_id and to_tutor_ids")

    # If replying, verify parent exists
    if message_data.reply_to_id:
        parent = db.query(TutorMessage).filter(
            TutorMessage.id == message_data.reply_to_id
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent message not found")

    # Determine the effective to_tutor_id
    effective_to_tutor_id = message_data.to_tutor_id
    if message_data.to_tutor_ids:
        # Group message: validate all recipient tutors exist
        recipient_tutors = db.query(Tutor.id).filter(
            Tutor.id.in_(message_data.to_tutor_ids)
        ).all()
        found_ids = set(r.id for r in recipient_tutors)
        missing = set(message_data.to_tutor_ids) - found_ids
        if missing:
            raise HTTPException(status_code=404, detail=f"Recipient tutors not found: {sorted(missing)}")
        effective_to_tutor_id = GROUP_MESSAGE_SENTINEL
    elif message_data.to_tutor_id:
        # Direct message: verify recipient exists
        recipient = db.query(Tutor).filter(Tutor.id == message_data.to_tutor_id).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient tutor not found")

    # Determine if this is a scheduled message
    # Convert scheduled_at to naive HK time (matching DB convention) to avoid aware/naive TypeError
    scheduled_at_hk = None
    is_scheduled = False
    if message_data.scheduled_at is not None:
        from constants import HK_TZ
        if message_data.scheduled_at.tzinfo:
            scheduled_at_hk = message_data.scheduled_at.astimezone(HK_TZ).replace(tzinfo=None)
        else:
            scheduled_at_hk = message_data.scheduled_at
        is_scheduled = scheduled_at_hk > hk_now()

    # Create message (sanitize HTML to prevent XSS)
    new_message = TutorMessage(
        from_tutor_id=from_tutor_id,
        to_tutor_id=effective_to_tutor_id,
        subject=message_data.subject,
        message=sanitize_message_html(message_data.message),
        priority=message_data.priority,
        category=message_data.category,
        reply_to_id=message_data.reply_to_id,
        image_attachments=message_data.image_attachments or [],
        file_attachments=message_data.file_attachments or [],
        scheduled_at=scheduled_at_hk if is_scheduled else None,
    )

    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    # Insert group message recipients (exclude sender from own recipients)
    if message_data.to_tutor_ids:
        for tid in message_data.to_tutor_ids:
            if tid != from_tutor_id:
                db.add(MessageRecipient(message_id=new_message.id, tutor_id=tid))
        db.commit()

    # Parse and save @mentions (skip for scheduled messages — will be done on delivery)
    mentioned_ids: set[int] = set()
    if not is_scheduled:
        mentioned_ids = _save_mentions(db, new_message.id, new_message.message)

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

    # Broadcast new message via SSE to all recipients (skip for scheduled messages)
    if not is_scheduled:
        recipient_ids = []
        if effective_to_tutor_id is None:
            # Broadcast: notify all tutors
            all_tutors = db.query(Tutor.id).all()
            recipient_ids = [t.id for t in all_tutors if t.id != from_tutor_id]
        elif effective_to_tutor_id == GROUP_MESSAGE_SENTINEL:
            # Group: notify recipients
            recipient_ids = [tid for tid in (message_data.to_tutor_ids or []) if tid != from_tutor_id]
        elif effective_to_tutor_id > 0:
            # Direct: notify recipient
            recipient_ids = [effective_to_tutor_id]

        if recipient_ids:
            asyncio.create_task(sse_manager.broadcast("new_message", {
                "message_id": new_message.id,
                "thread_id": new_message.reply_to_id or new_message.id,
                "from_tutor_id": from_tutor_id,
                "from_tutor_name": new_message.from_tutor.tutor_name if new_message.from_tutor else None,
                "subject": new_message.subject,
                "preview": (new_message.message or "")[:100],
                "category": new_message.category,
                "priority": new_message.priority,
                "mentioned_tutor_ids": sorted(mentioned_ids),
            }, recipient_ids))

    return build_message_response(new_message, from_tutor_id, db)


@router.post("/messages/upload-image")
async def upload_message_image(
    file: UploadFile = File(...),
    tutor_id: int = Query(..., description="Tutor ID for authentication")
):
    """
    Upload an image for message attachment.
    Returns the public URL of the uploaded image.
    Images are automatically resized (max 1920px) and compressed.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Read file contents
    contents = await file.read()

    # Upload to GCS (includes resize and compression)
    try:
        url = upload_image(contents, file.filename)
        return {"url": url, "filename": file.filename}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/messages/upload-file")
async def upload_message_file(
    file: UploadFile = File(...),
    tutor_id: int = Query(..., description="Tutor ID for authentication")
):
    """
    Upload a file (image or document) for message attachment.
    Images are resized/compressed; documents are stored as-is.
    Returns URL, filename, and content_type.
    """
    content_type = file.content_type or ""
    contents = await file.read()

    try:
        if content_type.startswith('image/'):
            url = upload_image(contents, file.filename)
            return {"url": url, "filename": file.filename, "content_type": content_type}
        else:
            from services.image_storage import upload_document
            url = upload_document(contents, file.filename or "file", content_type)
            return {"url": url, "filename": file.filename, "content_type": content_type}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ============================================
# Batch Read Endpoint (must be before {message_id} routes)
# ============================================

@router.post("/messages/mark-all-read", response_model=MarkAllReadResponse)
async def mark_all_read(
    request: MarkAllReadRequest,
    tutor_id: int = Query(..., description="Tutor marking messages as read"),
    db: Session = Depends(get_db)
):
    """Mark all visible unread messages as read in one operation."""
    from sqlalchemy.dialects.mysql import insert as mysql_insert

    check_user_rate_limit(tutor_id, "message_read")

    # Subquery for archived message IDs
    archived_ids_subq = db.query(MessageArchive.message_id).filter(
        MessageArchive.tutor_id == tutor_id
    ).scalar_subquery()

    # Subquery for already-read message IDs
    already_read_subq = db.query(MessageReadReceipt.message_id).filter(
        MessageReadReceipt.tutor_id == tutor_id
    ).scalar_subquery()

    # Find all unread, non-archived messages visible to this tutor (exclude pending scheduled)
    unread_query = db.query(TutorMessage.id).filter(
        visible_to_tutor_filter(tutor_id, db),
        TutorMessage.scheduled_at.is_(None),
        ~TutorMessage.id.in_(archived_ids_subq),
        ~TutorMessage.id.in_(already_read_subq),
        TutorMessage.from_tutor_id != tutor_id,  # Don't mark own messages
    )

    # Apply category filter if specified
    if request.category:
        root_ids_subq = db.query(TutorMessage.id).filter(
            TutorMessage.reply_to_id.is_(None),
            TutorMessage.category == request.category,
        ).scalar_subquery()

        unread_query = unread_query.filter(
            or_(
                and_(TutorMessage.reply_to_id.is_(None), TutorMessage.category == request.category),
                TutorMessage.reply_to_id.in_(root_ids_subq),
            )
        )

    unread_ids = [row[0] for row in unread_query.all()]

    if not unread_ids:
        return MarkAllReadResponse(success=True, count=0)

    # Bulk insert read receipts in a single statement
    values = [{"message_id": msg_id, "tutor_id": tutor_id} for msg_id in unread_ids]
    stmt = mysql_insert(MessageReadReceipt).values(values).prefix_with('IGNORE')
    result = db.execute(stmt)
    count = result.rowcount

    db.commit()
    return MarkAllReadResponse(success=True, count=count)


# ============================================
# Archive Endpoints (must be before {message_id} routes)
# ============================================

@router.post("/messages/archive", response_model=ArchiveResponse)
async def archive_messages(
    request: ArchiveRequest,
    tutor_id: int = Query(..., description="Tutor archiving messages"),
    db: Session = Depends(get_db)
):
    """Archive multiple messages for the current tutor (bulk operation)."""
    count = _bulk_insert_ignore(db, MessageArchive, request.message_ids, tutor_id)
    return ArchiveResponse(success=True, count=count)


@router.delete("/messages/archive", response_model=ArchiveResponse)
async def unarchive_messages(
    request: ArchiveRequest,
    tutor_id: int = Query(..., description="Tutor unarchiving messages"),
    db: Session = Depends(get_db)
):
    """Unarchive multiple messages for the current tutor."""
    count = db.query(MessageArchive).filter(
        MessageArchive.message_id.in_(request.message_ids),
        MessageArchive.tutor_id == tutor_id
    ).delete(synchronize_session=False)

    db.commit()
    return ArchiveResponse(success=True, count=count)


@router.get("/messages/archived", response_model=PaginatedThreadsResponse)
async def get_archived_messages(
    tutor_id: int = Query(..., description="Current tutor ID"),
    limit: int = Query(50, ge=1, le=500, description="Maximum threads to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """Get archived message threads for the current tutor."""


    # Get archived message IDs for this tutor
    archived_ids_subq = db.query(MessageArchive.message_id).filter(
        MessageArchive.tutor_id == tutor_id
    ).scalar_subquery()

    # Base query for archived root messages
    base_query = (
        db.query(TutorMessage)
        .filter(
            TutorMessage.reply_to_id.is_(None),
            TutorMessage.id.in_(archived_ids_subq),
            visible_to_tutor_filter(tutor_id, db),
        )
    )

    # Get total count BEFORE pagination
    total_count = base_query.count()

    # Fetch paginated root messages with eager loading
    root_messages = (
        base_query
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .order_by(desc(TutorMessage.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not root_messages:
        return PaginatedThreadsResponse(
            threads=[],
            total_count=total_count,
            has_more=False,
            limit=limit,
            offset=offset
        )

    root_ids = [m.id for m in root_messages]

    # Batch fetch ALL replies for these roots (exclude pending scheduled)
    all_replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(
            TutorMessage.reply_to_id.in_(root_ids),
            TutorMessage.scheduled_at.is_(None),
        )
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    # Group replies by root_id
    replies_by_root = {}
    for reply in all_replies:
        replies_by_root.setdefault(reply.reply_to_id, []).append(reply)

    # Collect ALL message IDs
    all_message_ids = root_ids + [r.id for r in all_replies]

    # Batch fetch read receipts
    read_receipts = db.query(MessageReadReceipt.message_id).filter(
        MessageReadReceipt.message_id.in_(all_message_ids),
        MessageReadReceipt.tutor_id == tutor_id
    ).all()
    read_ids = set(r.message_id for r in read_receipts)

    # Batch fetch like counts
    like_counts = db.query(
        MessageLike.message_id,
        func.count(MessageLike.id).label('count')
    ).filter(
        MessageLike.message_id.in_(all_message_ids),
        MessageLike.action_type == "LIKE"
    ).group_by(MessageLike.message_id).all()
    like_count_map = {lc.message_id: lc.count for lc in like_counts}

    # Batch fetch "liked by me"
    liked_by_me = _get_liked_by_me(db, all_message_ids, tutor_id)

    # Batch fetch like details (who reacted to each message)
    like_details_map = _fetch_like_details(db, all_message_ids)

    # Batch fetch reply counts (exclude pending scheduled)
    reply_counts = db.query(
        TutorMessage.reply_to_id,
        func.count(TutorMessage.id).label('count')
    ).filter(
        TutorMessage.reply_to_id.in_(all_message_ids),
        TutorMessage.scheduled_at.is_(None),
    ).group_by(TutorMessage.reply_to_id).all()
    reply_count_map = {rc.reply_to_id: rc.count for rc in reply_counts}

    # Batch fetch pinned (star) status
    pinned_receipts = db.query(MessagePin.message_id).filter(
        MessagePin.message_id.in_(all_message_ids),
        MessagePin.tutor_id == tutor_id
    ).all()
    pinned_ids = set(r.message_id for r in pinned_receipts)

    # Batch fetch thread-pinned status
    thread_pinned_ids = _fetch_thread_pin_ids(db, all_message_ids, tutor_id)

    # Batch fetch thread-muted status
    thread_muted_ids = _fetch_thread_mute_ids(db, all_message_ids, tutor_id)

    # Batch fetch snooze data
    snooze_data = _fetch_snooze_data(db, all_message_ids, tutor_id)

    # Batch fetch group message visibility and recipients
    _all_archived_messages = root_messages + all_replies
    _arch_group_ids = [m.id for m in _all_archived_messages if m.to_tutor_id == GROUP_MESSAGE_SENTINEL]
    _arch_group_visible_ids = set()
    if _arch_group_ids:
        _vis_rows = db.query(MessageRecipient.message_id).filter(
            MessageRecipient.message_id.in_(_arch_group_ids),
            MessageRecipient.tutor_id == tutor_id
        ).all()
        _arch_group_visible_ids = set(r.message_id for r in _vis_rows)
    _arch_group_recipients_map, _arch_group_names_map, _arch_group_count_map = _fetch_group_recipients(db, _arch_group_ids)

    def _arch_is_visible(msg):
        return (msg.to_tutor_id == tutor_id or msg.to_tutor_id is None or
                (msg.to_tutor_id == GROUP_MESSAGE_SENTINEL and msg.id in _arch_group_visible_ids))

    # Helper to build MessageResponse
    def build_response(msg: TutorMessage) -> MessageResponse:
        is_group = msg.to_tutor_id == GROUP_MESSAGE_SENTINEL
        if is_group:
            names = _arch_group_names_map.get(msg.id, [])
            to_name = ", ".join(names) if len(names) <= 3 else f"{', '.join(names[:2])} +{len(names) - 2}"
        else:
            to_name = msg.to_tutor.tutor_name if msg.to_tutor else "All"

        return MessageResponse(
            id=msg.id,
            from_tutor_id=msg.from_tutor_id,
            from_tutor_name=msg.from_tutor.tutor_name if msg.from_tutor else None,
            to_tutor_id=msg.to_tutor_id,
            to_tutor_name=to_name,
            subject=msg.subject,
            message=msg.message,
            priority=msg.priority or "Normal",
            category=msg.category,
            created_at=msg.created_at,
            updated_at=msg.updated_at,
            reply_to_id=msg.reply_to_id,
            is_read=msg.id in read_ids,
            is_pinned=msg.id in pinned_ids,
            is_thread_pinned=msg.id in thread_pinned_ids,
            is_thread_muted=msg.id in thread_muted_ids,
            is_snoozed=msg.id in snooze_data,
            snoozed_until=snooze_data.get(msg.id),
            is_group_message=is_group,
            to_tutor_ids=_arch_group_recipients_map.get(msg.id) if is_group else None,
            to_tutor_names=_arch_group_names_map.get(msg.id) if is_group else None,
            like_count=like_count_map.get(msg.id, 0),
            is_liked_by_me=msg.id in liked_by_me,
            like_details=like_details_map.get(msg.id, []),
            reply_count=reply_count_map.get(msg.id, 0)
        )

    # Build thread responses
    threads = []
    for root in root_messages:
        replies = replies_by_root.get(root.id, [])
        all_msgs_in_thread = [root] + replies
        unread_count = sum(1 for m in all_msgs_in_thread if m.id not in read_ids and _arch_is_visible(m))

        threads.append(ThreadResponse(
            root_message=build_response(root),
            replies=[build_response(r) for r in replies],
            total_unread=unread_count
        ))

    return PaginatedThreadsResponse(
        threads=threads,
        total_count=total_count,
        has_more=(offset + len(threads)) < total_count,
        limit=limit,
        offset=offset
    )


# ============================================
# Pin/Star Endpoints (must be before {message_id} routes)
# ============================================

@router.post("/messages/pin", response_model=PinResponse)
async def pin_messages(
    request: PinRequest,
    tutor_id: int = Query(..., description="Tutor pinning messages"),
    db: Session = Depends(get_db)
):
    """Pin/star multiple messages for the current tutor (bulk operation)."""
    count = _bulk_insert_ignore(db, MessagePin, request.message_ids, tutor_id)
    return PinResponse(success=True, count=count)


@router.delete("/messages/pin", response_model=PinResponse)
async def unpin_messages(
    request: PinRequest,
    tutor_id: int = Query(..., description="Tutor unpinning messages"),
    db: Session = Depends(get_db)
):
    """Unpin/unstar multiple messages for the current tutor."""
    count = db.query(MessagePin).filter(
        MessagePin.message_id.in_(request.message_ids),
        MessagePin.tutor_id == tutor_id
    ).delete(synchronize_session=False)

    db.commit()
    return PinResponse(success=True, count=count)


@router.post("/messages/thread-pin", response_model=PinResponse)
async def thread_pin_messages(
    request: PinRequest,
    tutor_id: int = Query(..., description="Tutor pinning threads"),
    db: Session = Depends(get_db)
):
    """Pin threads to top of thread list (separate from star/favorite)."""
    count = _bulk_insert_ignore(db, ThreadPin, request.message_ids, tutor_id)
    return PinResponse(success=True, count=count)


@router.delete("/messages/thread-pin", response_model=PinResponse)
async def thread_unpin_messages(
    request: PinRequest,
    tutor_id: int = Query(..., description="Tutor unpinning threads"),
    db: Session = Depends(get_db)
):
    """Unpin threads from top of thread list."""
    count = db.query(ThreadPin).filter(
        ThreadPin.message_id.in_(request.message_ids),
        ThreadPin.tutor_id == tutor_id
    ).delete(synchronize_session=False)

    db.commit()
    return PinResponse(success=True, count=count)


@router.get("/messages/pinned", response_model=PaginatedThreadsResponse)
async def get_pinned_messages(
    tutor_id: int = Query(..., description="Current tutor ID"),
    limit: int = Query(50, ge=1, le=500, description="Maximum threads to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """Get pinned/starred message threads for the current tutor."""


    # Get pinned message IDs for this tutor
    pinned_ids_subq = db.query(MessagePin.message_id).filter(
        MessagePin.tutor_id == tutor_id
    ).scalar_subquery()

    # Base query for pinned root messages
    base_query = (
        db.query(TutorMessage)
        .filter(
            TutorMessage.reply_to_id.is_(None),
            TutorMessage.id.in_(pinned_ids_subq),
            or_(
                visible_to_tutor_filter(tutor_id, db),
                TutorMessage.from_tutor_id == tutor_id,
            )
        )
    )

    total_count = base_query.count()

    root_messages = (
        base_query
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .order_by(desc(TutorMessage.created_at))
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not root_messages:
        return PaginatedThreadsResponse(
            threads=[],
            total_count=total_count,
            has_more=False,
            limit=limit,
            offset=offset
        )

    root_ids = [m.id for m in root_messages]

    # Batch fetch ALL replies for these roots (exclude pending scheduled)
    all_replies = (
        db.query(TutorMessage)
        .options(
            joinedload(TutorMessage.from_tutor),
            joinedload(TutorMessage.to_tutor)
        )
        .filter(
            TutorMessage.reply_to_id.in_(root_ids),
            TutorMessage.scheduled_at.is_(None),
        )
        .order_by(TutorMessage.created_at.asc())
        .all()
    )

    replies_by_root = {}
    for reply in all_replies:
        replies_by_root.setdefault(reply.reply_to_id, []).append(reply)

    # Build responses using batch function
    all_messages = root_messages + all_replies
    all_responses = batch_build_message_responses(all_messages, tutor_id, db)
    response_map = {r.id: r for r in all_responses}

    threads = []
    for root in root_messages:
        root_resp = response_map[root.id]
        reply_resps = [response_map[r.id] for r in replies_by_root.get(root.id, [])]

        # Calculate unread count
        unread = sum(1 for r in [root_resp] + reply_resps if not r.is_read and r.from_tutor_id != tutor_id)

        threads.append(ThreadResponse(
            root_message=root_resp,
            replies=reply_resps,
            total_unread=unread
        ))

    return PaginatedThreadsResponse(
        threads=threads,
        total_count=total_count,
        has_more=(offset + len(threads)) < total_count,
        limit=limit,
        offset=offset
    )


# ============================================
# Message ID Routes (must be after /archive and /pin routes)
# ============================================

@router.post("/messages/{message_id}/read")
async def mark_as_read(
    message_id: int,
    tutor_id: int = Query(..., description="Tutor marking as read"),
    db: Session = Depends(get_db)
):
    """Mark a message as read by the current tutor."""
    check_user_rate_limit(tutor_id, "message_read")

    from sqlalchemy.dialects.mysql import insert

    # Use INSERT IGNORE to avoid checking if already read (single query)
    stmt = insert(MessageReadReceipt).values(
        message_id=message_id,
        tutor_id=tutor_id
    ).prefix_with('IGNORE')
    result = db.execute(stmt)
    db.commit()

    # Broadcast read receipt to message sender via SSE
    if result.rowcount > 0:
        msg = db.query(TutorMessage.from_tutor_id).filter(TutorMessage.id == message_id).first()
        if msg and msg.from_tutor_id != tutor_id:
            asyncio.create_task(sse_manager.broadcast("message_read", {
                "message_id": message_id,
                "reader_tutor_id": tutor_id,
            }, [msg.from_tutor_id]))

    return {"success": True}


@router.delete("/messages/{message_id}/read")
async def mark_as_unread(
    message_id: int,
    tutor_id: int = Query(..., description="Tutor marking as unread"),
    db: Session = Depends(get_db)
):
    """Mark a message as unread by removing the read receipt."""
    check_user_rate_limit(tutor_id, "message_read")

    deleted = db.query(MessageReadReceipt).filter(
        MessageReadReceipt.message_id == message_id,
        MessageReadReceipt.tutor_id == tutor_id
    ).delete()
    db.commit()

    return {"success": True, "was_read": deleted > 0}


@router.post("/messages/{message_id}/like")
async def toggle_like(
    message_id: int,
    tutor_id: int = Query(..., description="Tutor toggling like"),
    emoji: str = Query("❤️", description="Reaction emoji"),
    db: Session = Depends(get_db)
):
    """Toggle a reaction (emoji) on a message."""
    check_user_rate_limit(tutor_id, "message_like")

    # Get current like status for this specific emoji
    current_like = db.query(MessageLike.action_type).filter(
        MessageLike.message_id == message_id,
        MessageLike.tutor_id == tutor_id,
        MessageLike.emoji == emoji
    ).order_by(MessageLike.liked_at.desc()).first()

    # Toggle: if currently liked with this emoji -> unlike, else -> like
    new_action = "UNLIKE" if (current_like and current_like.action_type == "LIKE") else "LIKE"

    try:
        new_like = MessageLike(
            message_id=message_id,
            tutor_id=tutor_id,
            action_type=new_action,
            emoji=emoji
        )
        db.add(new_like)
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=404, detail="Message not found")

    # Return total like count and per-emoji breakdown
    like_count = db.query(func.count(MessageLike.id)).filter(
        MessageLike.message_id == message_id,
        MessageLike.action_type == "LIKE"
    ).scalar() or 0

    # Check if user currently has this emoji active
    is_liked = new_action == "LIKE"

    # Broadcast reaction event via SSE to message sender
    msg = db.query(TutorMessage.from_tutor_id).filter(TutorMessage.id == message_id).first()
    if msg and msg.from_tutor_id != tutor_id:
        asyncio.create_task(sse_manager.broadcast("reaction", {
            "message_id": message_id,
            "tutor_id": tutor_id,
            "emoji": emoji,
            "action": new_action,
        }, [msg.from_tutor_id]))

    return {
        "success": True,
        "is_liked": is_liked,
        "like_count": like_count,
        "emoji": emoji
    }


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def update_message(
    message_id: int,
    update_data: MessageUpdate,
    tutor_id: int = Query(..., description="Requesting tutor ID"),
    db: Session = Depends(get_db)
):
    """Update a message (only by the sender)."""
    check_user_rate_limit(tutor_id, "message_update")

    message = db.query(TutorMessage).filter(TutorMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Only sender can edit
    if message.from_tutor_id != tutor_id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")

    if update_data.message is not None:
        message.message = sanitize_message_html(update_data.message)
        message.updated_at = hk_now()

    if update_data.image_attachments is not None:
        message.image_attachments = update_data.image_attachments
        message.updated_at = hk_now()

    if update_data.file_attachments is not None:
        message.file_attachments = update_data.file_attachments
        message.updated_at = hk_now()

    db.commit()
    db.refresh(message)

    # Re-parse mentions on edit
    if update_data.message is not None:
        _save_mentions(db, message.id, message.message)

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
    check_user_rate_limit(tutor_id, "message_delete")

    message = db.query(TutorMessage).filter(TutorMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Only sender can delete
    if message.from_tutor_id != tutor_id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    # Nullify message_id on any linked makeup proposals (to avoid FK constraint)
    db.query(MakeupProposal).filter(MakeupProposal.message_id == message_id).update(
        {"message_id": None}, synchronize_session=False
    )

    # Delete related records (read receipts, likes)
    db.query(MessageReadReceipt).filter(MessageReadReceipt.message_id == message_id).delete()
    db.query(MessageLike).filter(MessageLike.message_id == message_id).delete()

    # Delete the message
    db.delete(message)
    db.commit()

    return {"success": True, "message": "Message deleted"}
