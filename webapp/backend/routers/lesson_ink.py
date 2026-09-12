"""Lesson ink saved on the server, one page at a time.

The lesson views used to keep a tutor's ink in the browser tab only, so
leaving a lesson lost it unless it was downloaded first. The views now send
each page they change a couple of seconds after the last stroke, and fetch a
lesson's ink when they open it. The one-student view asks for its session and
the one before it, and the multi-student view asks for every session in the
slot, so the read takes a list of sessions.

A page is named by its session, a target and its page index. The target is
``ex:<exercise id>`` for an exercise, or ``preview:<file id>`` for a
parallel-version preview, which isn't an exercise row. The multi-student view
files a preview under the slot's first session. The page index is the page of
the PDF counted from 0, or a Draft sheet's own index, 1000 and up, so ink
stays on its page when someone edits an exercise's page range.

When two people change the same page, the later save wins. Every write puts
the page's version up by one, and the views remember the version they last
saw. A view that fetches a page and finds a newer version than its own knows
that its change was replaced, and says so. Clearing a page keeps an empty row
with a new version for the same reason, because an open view can't notice a
row that has gone.
"""
import logging
import os
import secrets
from datetime import timedelta
from typing import List, Literal, Optional, Tuple

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, reject_read_only, require_admin_write
from constants import hk_now, today_hk
from database import get_db
from models import LessonInk, SessionExercise, SessionLog, Tutor

logger = logging.getLogger(__name__)
router = APIRouter()

# A slot has twelve sessions at most, and the one-student view asks for two.
MAX_SESSIONS_PER_READ = 40
# The views send only the pages that changed since their last save, which is
# usually one. The cap is there to stop a runaway page, not a busy lesson.
MAX_PAGES_PER_SAVE = 50
# Ink is kept for a year after its lesson, then the nightly purge deletes it.
KEEP_FOR = timedelta(days=365)


class StrokeIn(BaseModel):
    """One stroke as the lesson views store it. Each point is [x, y, pressure]."""
    points: List[Tuple[float, float, float]] = Field(..., min_length=1, max_length=20000)
    color: str = Field(..., max_length=32)
    size: float = Field(..., gt=0, le=500)
    # Pen strokes leave this out, and highlighter strokes say so.
    kind: Optional[Literal["highlighter"]] = None


class InkPageIn(BaseModel):
    session_id: int
    target_key: str = Field(..., pattern=r"^(ex|preview):[1-9][0-9]{0,9}$")
    page_index: int = Field(..., ge=0, le=9999)
    pdf_page: Optional[int] = Field(None, gt=0)
    pdf_name: Optional[str] = Field(None, max_length=500)
    strokes: List[StrokeIn] = Field(..., max_length=5000)


class InkSaveRequest(BaseModel):
    pages: List[InkPageIn] = Field(..., min_length=1, max_length=MAX_PAGES_PER_SAVE)


PageKey = Tuple[int, str, int]


def _key_out(key: PageKey) -> dict:
    session_id, target_key, page_index = key
    return {"session_id": session_id, "target_key": target_key, "page_index": page_index}


def _exercise_id(target_key: str) -> Optional[int]:
    kind, _, value = target_key.partition(":")
    return int(value) if kind == "ex" else None


def _parse_session_ids(raw: str) -> List[int]:
    try:
        ids = sorted({int(part) for part in raw.split(",") if part.strip()})
    except ValueError:
        raise HTTPException(status_code=400, detail="session_ids must be a comma-separated list of numbers")
    if not ids:
        raise HTTPException(status_code=400, detail="session_ids is empty")
    if len(ids) > MAX_SESSIONS_PER_READ:
        raise HTTPException(status_code=400, detail=f"At most {MAX_SESSIONS_PER_READ} sessions at a time")
    return ids


@router.get("/lesson-ink")
def read_lesson_ink(
    session_ids: str = Query(..., description="Comma-separated session ids"),
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every page of ink for the given sessions, cleared pages included."""
    rows = db.query(LessonInk).filter(LessonInk.session_id.in_(_parse_session_ids(session_ids))).all()

    # The views name whoever changed a page under someone else, so they get
    # the name here and never have to look it up.
    emails = {row.updated_by for row in rows}
    names = dict(
        db.query(Tutor.user_email, Tutor.tutor_name).filter(Tutor.user_email.in_(emails)).all()
    ) if emails else {}

    return {"pages": [
        {
            **_key_out((row.session_id, row.target_key, row.page_index)),
            "pdf_page": row.pdf_page,
            "pdf_name": row.pdf_name,
            "strokes": row.strokes,
            "version": row.version,
            "updated_by": row.updated_by,
            "updated_by_name": names.get(row.updated_by),
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]}


def _save_pages(db: Session, pages: List[InkPageIn], user: Tutor) -> dict:
    # A page sent twice in one batch is saved once, with its last strokes.
    by_key = {(p.session_id, p.target_key, p.page_index): p for p in pages}
    session_ids = {key[0] for key in by_key}
    target_keys = {key[1] for key in by_key}

    known_sessions = {
        sid for (sid,) in db.query(SessionLog.id).filter(SessionLog.id.in_(session_ids))
    }
    exercise_ids = {eid for eid in map(_exercise_id, target_keys) if eid is not None}
    exercise_session = dict(
        db.query(SessionExercise.id, SessionExercise.session_id)
        .filter(SessionExercise.id.in_(exercise_ids)).all()
    ) if exercise_ids else {}

    existing = {
        (row.session_id, row.target_key, row.page_index): row
        for row in db.query(LessonInk).filter(
            LessonInk.session_id.in_(session_ids), LessonInk.target_key.in_(target_keys),
        )
    }

    now = hk_now()
    saved: List[PageKey] = []
    dropped: List[PageKey] = []
    for key, page in by_key.items():
        exercise_id = _exercise_id(page.target_key)
        # An exercise that has been taken off its lesson has lost its ink
        # already, so a page still on its way is dropped. The view is told, so
        # it stops trying to send it.
        if page.session_id not in known_sessions or (
            exercise_id is not None and exercise_session.get(exercise_id) != page.session_id
        ):
            dropped.append(key)
            continue

        row = existing.get(key)
        if row is None:
            row = LessonInk(
                session_id=page.session_id,
                target_key=page.target_key,
                page_index=page.page_index,
                session_exercise_id=exercise_id,
                version=1,
            )
            db.add(row)
        else:
            # Done in SQL, so two saves landing together still count twice.
            row.version = LessonInk.version + 1
        row.pdf_page = page.pdf_page
        row.pdf_name = page.pdf_name
        row.strokes = [stroke.model_dump(exclude_none=True) for stroke in page.strokes]
        row.updated_by = user.user_email
        row.updated_at = now
        saved.append(key)

    db.commit()

    versions = {}
    if saved:
        versions = {
            (sid, target, index): version
            for sid, target, index, version in db.query(
                LessonInk.session_id, LessonInk.target_key, LessonInk.page_index, LessonInk.version,
            ).filter(
                LessonInk.session_id.in_({key[0] for key in saved}),
                LessonInk.target_key.in_({key[1] for key in saved}),
            )
        }
    return {
        "saved": [{**_key_out(key), "version": versions[key]} for key in saved],
        "dropped": [_key_out(key) for key in dropped],
    }


@router.put("/lesson-ink")
def save_lesson_ink(
    body: InkSaveRequest,
    user: Tutor = Depends(reject_read_only),
    db: Session = Depends(get_db),
):
    """Save a batch of pages. The later save of a page always wins.

    Any member of staff who isn't read-only may write ink on any lesson, the
    same as editing its exercises. The one-student view shows the previous
    lesson, which is often another tutor's, and cover lessons need it too.
    """
    try:
        return _save_pages(db, body.pages, user)
    except IntegrityError:
        # Two saves inserted the same new page at once, and this one lost the
        # race on the unique key. The row exists now, so trying again updates it.
        db.rollback()
        return _save_pages(db, body.pages, user)


def _authorize_purge(
    request: Request,
    db: Session = Depends(get_db),
    x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret"),
) -> None:
    """Cloud Scheduler by shared secret, or an admin pressing the button."""
    expected = os.environ.get("LESSON_INK_CRON_SECRET")
    if expected and x_cron_secret and secrets.compare_digest(x_cron_secret, expected):
        return
    user = get_current_user(request, db)
    require_admin_write(request, user)


@router.post("/admin/lesson-ink/purge", dependencies=[Depends(_authorize_purge)])
def purge_old_lesson_ink(db: Session = Depends(get_db)):
    """Delete the ink from lessons more than a year old. Runs nightly."""
    cutoff = today_hk() - KEEP_FOR
    old_sessions = select(SessionLog.id).where(SessionLog.session_date < cutoff)
    deleted = db.query(LessonInk).filter(
        LessonInk.session_id.in_(old_sessions)
    ).delete(synchronize_session=False)
    db.commit()
    logger.info("lesson ink purge removed %s pages from lessons before %s", deleted, cutoff)
    return {"deleted": deleted, "cutoff": cutoff.isoformat()}
