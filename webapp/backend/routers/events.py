"""What staff actually reach, as opposed to what the browser fetched.

The School Progress panel is the reason this exists. Its suggestions load when
a tutor hovers the exercise button, so the request count in the server logs
measured how often the page guessed somebody might open the modal, not how
often anybody read the result. The only thing that reached the database was
the handful of confirmations somebody tapped, which made "has anyone used this
since we launched it" a question about log archaeology rather than a query.

This endpoint takes the moments in between: a panel that rendered, a question
that was put to somebody, a section somebody opened. Every key is checked
against ALLOWED_EVENT_KEYS below, so the table only holds events we chose to
keep, and a page cannot invent its own. Events are advisory. Losing one to a
race costs a row in a report and nothing else, so nothing here is allowed to
fail a request the tutor is waiting on.
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from constants import today_hk
from database import get_db
from models import FeatureEvent, Tutor

logger = logging.getLogger(__name__)
router = APIRouter()


# Every key the app is allowed to record, with what it means. Adding a key is
# a deliberate act: it should name a moment somebody would later want counted.
ALLOWED_EVENT_KEYS = frozenset({
    # The School Progress strip rendered inside the exercise modal. Deduped to
    # once per tutor per session per day, so this counts sessions where the
    # panel was in front of somebody, not renders.
    "school_progress.shown",
    # The tutor opened the section to read the suggested topics and files.
    "school_progress.expanded",
    # A question was put to the tutor on the collapsed strip. The suffix is
    # why it was worth asking, which is what the daily limit is spent on:
    #   blind    nothing at all is known about this school week
    #   split    two classes at this school are reported on different topics
    #   stale    the last answer is old enough that the school may have moved
    #   routine  the ordinary case, evidence exists but no human has confirmed
    "school_progress.asked.blind",
    "school_progress.asked.split",
    "school_progress.asked.stale",
    "school_progress.asked.routine",
    # The tutor answered "Not sure". Worth as much as a yes for knowing the
    # question was read, and it is the only answer that writes nothing else.
    "school_progress.answered_unsure",
})

MAX_EVENTS_PER_CALL = 20


class EventIn(BaseModel):
    event_key: str = Field(..., max_length=64)
    entity_type: Optional[str] = Field(None, max_length=32)
    entity_id: Optional[int] = None
    context: Optional[Dict[str, Any]] = None
    # Set when the event should count once rather than every time it is sent.
    # The tutor and the day are added server-side, so two people can send the
    # same key without colliding, nobody can suppress somebody else's event,
    # and "once per day" means the office's day rather than whatever the
    # browser's clock believes.
    dedupe_key: Optional[str] = Field(None, max_length=120)


class EventBatch(BaseModel):
    events: List[EventIn] = Field(..., min_length=1, max_length=MAX_EVENTS_PER_CALL)


@router.post("/events")
def record_events(
    body: EventBatch,
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a batch of interface events for the signed-in member of staff.

    An unknown key fails the whole batch rather than being dropped quietly,
    because the only caller is our own frontend and a typo there should be
    loud in development instead of silently producing an empty report weeks
    later.
    """
    unknown = sorted({e.event_key for e in body.events} - ALLOWED_EVENT_KEYS)
    if unknown:
        raise HTTPException(
            status_code=400, detail=f"Unknown event key(s): {', '.join(unknown)}")

    day = today_hk()
    keyed = [
        (f"{user.id}:{e.dedupe_key}:{day.isoformat()}" if e.dedupe_key else None, e)
        for e in body.events
    ]
    # One lookup for the whole batch. The keys are exact, so asking for all of
    # them at once costs the same round trip as asking for one, and a page
    # that sends several should not pay a query each.
    wanted = {key for key, _ in keyed if key}
    seen = set()
    if wanted:
        seen = {
            row[0] for row in db.query(FeatureEvent.dedupe_key)
            .filter(FeatureEvent.dedupe_key.in_(wanted)).all()
        }

    rows = []
    for dedupe, e in keyed:
        if dedupe:
            # Also covers a key repeated inside this batch, which would
            # otherwise be inserted twice and cost the whole batch to the
            # unique index.
            if dedupe in seen:
                continue
            seen.add(dedupe)
        rows.append(FeatureEvent(
            tutor_id=user.id,
            event_key=e.event_key,
            entity_type=e.entity_type,
            entity_id=e.entity_id,
            context=e.context,
            dedupe_key=dedupe,
            event_day=day,
        ))

    if not rows:
        return {"recorded": 0}

    try:
        db.add_all(rows)
        db.commit()
    except SQLAlchemyError:
        # Two tabs sending the same deduped event at once is the expected
        # cause, and losing the row is the correct outcome for that. Nothing
        # the tutor is doing depends on this call.
        db.rollback()
        logger.info("feature events dropped for tutor=%s", user.id, exc_info=True)
        return {"recorded": 0}

    return {"recorded": len(rows)}
