"""Departures: keeping CSM's copy current, and reporting what a leaver left behind.

Three things live here. The nightly sync that copies leaving dates out of ARK,
a summary of work still booked past somebody's last day, and a per-tutor
breakdown for their profile page.

Refusing new assignments is not here. That is a rule about writes and it lives
in services/departure_guard.py, where it applies to every endpoint at once.
"""

import logging
import os
import secrets
from dataclasses import asdict
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user, require_admin_view, require_admin_write
from constants import today_hk
from database import get_db
from models import (
    RegularCourseSlot,
    RegularTutorDuty,
    SessionLog,
    SummerCourseSlot,
    SummerTutorDuty,
    Tutor,
    WaitlistSlotPreference,
)
from services.ark_employment_sync import (
    apply_employment,
    fetch_ark_employment,
    tutors_missing_from_ark,
)
from utils.employment import sessions_after_last_day_clause

logger = logging.getLogger(__name__)

router = APIRouter()


def _authorize_sync(
    request: Request,
    db: Session = Depends(get_db),
    x_cron_secret: Optional[str] = Header(default=None, alias="X-Cron-Secret"),
) -> None:
    """Cloud Scheduler by shared secret, or an admin pressing the button."""
    expected = os.environ.get("EMPLOYMENT_SYNC_CRON_SECRET")
    if expected and x_cron_secret and secrets.compare_digest(x_cron_secret, expected):
        return
    user = get_current_user(request, db)
    require_admin_write(request, user)


class EmploymentSyncResponse(BaseModel):
    checked: int
    marked: int
    cleared: int
    unchanged: int
    changes: list[str]
    unlinked_tutor_ids: list[int]
    # Teaching staff ARK has never heard of. The guard only protects people ARK
    # knows about, so this is the gap in the protection, and it belongs in front
    # of whoever ran the sync rather than in a log nobody reads.
    missing_from_ark: list[str]


@router.post("/admin/employment/sync", response_model=EmploymentSyncResponse)
async def sync_employment(
    _auth: None = Depends(_authorize_sync),
    db: Session = Depends(get_db),
):
    """Copy leaving dates from ARK onto the tutor records.

    Runs nightly. The interesting moment is the morning after somebody's last
    day, when they stop being able to log in and drop out of the pickers, and
    only something on a clock can catch that.
    """
    try:
        records = await fetch_ark_employment()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("ARK employment sync failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail="Could not reach ARK")

    result = apply_employment(db, records)

    return EmploymentSyncResponse(
        **asdict(result),
        missing_from_ark=[t.tutor_name for t in tutors_missing_from_ark(db, records)],
    )


class LeaverOverrun(BaseModel):
    tutor_id: int
    tutor_name: str
    departure_effective_on: date
    sessions: int


class OverrunResponse(BaseModel):
    total_sessions: int
    # Sessions belonging to somebody already gone or about to be, which is what
    # turns the notification red. Decided here rather than from dates in the
    # component, so it matches how every other item in that dropdown works.
    critical_sessions: int
    leavers: list[LeaverOverrun]


# A departure stops being something to plan around and starts being a problem
# this many days out, because by then there is no time to arrange cover calmly.
CRITICAL_WINDOW_DAYS = 7


@router.get("/admin/employment/overrun", response_model=OverrunResponse)
def employment_overrun(
    _user: Tutor = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Lessons booked past a leaver's last working day, by tutor.

    Feeds the notification bell and the link into the filtered sessions list.
    It counts sessions only, matching what that list shows. Slots and duties
    are the more urgent fix but they are not sessions, and a count that mixes
    three kinds of thing and then links to one of them stops being trusted.
    """
    rows = (
        db.query(
            Tutor.id,
            Tutor.tutor_name,
            Tutor.departure_effective_on,
            func.count(SessionLog.id),
        )
        .join(SessionLog, SessionLog.tutor_id == Tutor.id)
        .filter(sessions_after_last_day_clause())
        .group_by(Tutor.id, Tutor.tutor_name, Tutor.departure_effective_on)
        .order_by(Tutor.departure_effective_on)
        .all()
    )

    leavers = [
        LeaverOverrun(
            tutor_id=row[0],
            tutor_name=row[1],
            departure_effective_on=row[2],
            sessions=row[3],
        )
        for row in rows
    ]
    soon = today_hk() + timedelta(days=CRITICAL_WINDOW_DAYS)
    return OverrunResponse(
        total_sessions=sum(leaver.sessions for leaver in leavers),
        critical_sessions=sum(
            leaver.sessions for leaver in leavers if leaver.departure_effective_on <= soon
        ),
        leavers=leavers,
    )


class DepartureLoad(BaseModel):
    tutor_id: int
    departure_effective_on: Optional[date] = None
    sessions_after_last_day: int = 0
    summer_slots: int = 0
    summer_duties: int = 0
    regular_slots: int = 0
    regular_duties: int = 0
    waitlist_preferences: int = 0


@router.get("/tutors/{tutor_id}/departure-load", response_model=DepartureLoad)
def departure_load(
    tutor_id: int,
    _user: Tutor = Depends(require_admin_view),
    db: Session = Depends(get_db),
):
    """Everything still pointing at one tutor that somebody has to move.

    Shown on their profile page when a leaving date is set. The sessions can be
    worked through in the sessions list, but the slots and duties cannot, and
    those are the ones that keep generating fresh sessions if they are left
    alone. Hence one place that counts all of it.
    """
    tutor = db.get(Tutor, tutor_id)
    if tutor is None:
        raise HTTPException(status_code=404, detail=f"Tutor {tutor_id} not found")

    load = DepartureLoad(
        tutor_id=tutor_id,
        departure_effective_on=tutor.departure_effective_on,
    )
    if tutor.departure_effective_on is None:
        return load

    def _count(column):
        return (
            db.query(func.count())
            .select_from(column.class_)
            .filter(column == tutor_id)
            .scalar()
            or 0
        )

    load.sessions_after_last_day = (
        db.query(func.count(SessionLog.id))
        .filter(
            SessionLog.tutor_id == tutor_id,
            SessionLog.session_date > tutor.departure_effective_on,
        )
        .scalar()
        or 0
    )
    load.summer_slots = _count(SummerCourseSlot.tutor_id)
    load.summer_duties = _count(SummerTutorDuty.tutor_id)
    load.regular_slots = _count(RegularCourseSlot.tutor_id)
    load.regular_duties = _count(RegularTutorDuty.tutor_id)
    load.waitlist_preferences = _count(WaitlistSlotPreference.preferred_tutor_id)
    return load
