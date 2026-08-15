"""Copies leaving dates out of ARK and into ``tutors.departure_effective_on``.

ARK is where a resignation is recorded, because that is where HR works. CSM
needs the same fact to stop booking lessons for somebody past their last day,
and it needs it without calling ARK on every login and every write. So the date
is mirrored here and read locally, which also means CSM carries on working when
ARK does not.

A nightly pull rather than a push from ARK. Two reasons. A resignation with
notice does not need to cross within the hour, and an immediate one is handled
by suspending the Google account, which cuts the login straight away whatever
CSM thinks. More importantly the interesting moment is not when the resignation
is recorded, it is the morning after somebody's last day, when they have to
stop being able to log in and drop out of the pickers. Only something that runs
on a clock can do that.

Two readings of ARK's data happen here rather than in ARK, because they are
CSM's business:

A departed status with no end date means gone right now. ARK's own
``has_departed`` reads a blank leaving date that way, and an immediate
termination genuinely has no notice period. It is stored as the date the sync
saw it, so the comparison the rest of CSM makes stays a simple one.

An end date on an active record is stale, a withdrawn resignation or a legacy
import, and is ignored. Reading it as a leaving date would lock somebody out
who never left.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from models import Tutor
from utils.employment import today_hk

logger = logging.getLogger(__name__)

ARK_API_BASE_URL = os.getenv("ARK_API_BASE_URL", "https://ark.mathconceptsecondary.academy/api")
ARK_SERVICE_TOKEN = os.getenv("ARK_SERVICE_TOKEN", "")
ARK_TIMEOUT = 20.0

# Statuses that end employment. Anything else, `external` included, is somebody
# CSM should leave alone: an external record is the passport behind a CSM Pro
# supervisor login, not a person who has left.
DEPARTED_STATUSES = ("resigned", "terminated")


@dataclass
class SyncResult:
    """What the run did, for the response body and the log."""
    checked: int = 0
    marked: int = 0
    cleared: int = 0
    unchanged: int = 0
    unlinked_tutor_ids: Optional[list[int]] = None
    changes: Optional[list[str]] = None

    def __post_init__(self):
        if self.unlinked_tutor_ids is None:
            self.unlinked_tutor_ids = []
        if self.changes is None:
            self.changes = []


def resolve_last_working_day(status: str, end_date: Optional[date], seen_on: date) -> Optional[date]:
    """ARK's employment record as a single date CSM can compare against.

    None means they are not leaving, which covers everybody who is still here
    and every external passport account.
    """
    if status not in DEPARTED_STATUSES:
        return None
    return end_date if end_date is not None else seen_on


async def fetch_ark_employment() -> list[dict]:
    """The linked staff records ARK holds. Raises if ARK cannot be reached."""
    if not ARK_SERVICE_TOKEN:
        raise RuntimeError("ARK integration not configured")

    async with httpx.AsyncClient(timeout=ARK_TIMEOUT) as client:
        response = await client.get(
            f"{ARK_API_BASE_URL}/integration/employment",
            headers={"Authorization": f"Bearer {ARK_SERVICE_TOKEN}"},
        )
    response.raise_for_status()
    return response.json()


def apply_employment(db: Session, records: list[dict], seen_on: Optional[date] = None) -> SyncResult:
    """Write ARK's answer onto the tutor rows and report what moved.

    Only tutors ARK knows about are touched. The Supervisor and Guest accounts
    that exist only in CSM have no ARK record, so a date set on one by hand
    survives every run.
    """
    seen_on = seen_on or today_hk()
    result = SyncResult()

    for record in records:
        tutor_id = record.get("tutoring_system_id")
        if tutor_id is None:
            continue

        tutor = db.get(Tutor, tutor_id)
        if tutor is None:
            # ARK points at a tutor CSM does not have. Worth saying out loud,
            # because it means the link is stale on ARK's side.
            result.unlinked_tutor_ids.append(tutor_id)
            continue

        result.checked += 1
        end_date = record.get("end_date")
        if isinstance(end_date, str):
            end_date = date.fromisoformat(end_date)

        resolved = resolve_last_working_day(record.get("employment_status", ""), end_date, seen_on)
        if resolved == tutor.departure_effective_on:
            result.unchanged += 1
            continue

        was = tutor.departure_effective_on
        tutor.departure_effective_on = resolved
        if resolved is None:
            result.cleared += 1
            result.changes.append(f"{tutor.tutor_name}: no longer leaving (was {was})")
        else:
            result.marked += 1
            result.changes.append(f"{tutor.tutor_name}: last working day {resolved}")

    db.commit()

    if result.changes:
        logger.info("ARK employment sync applied %d change(s): %s", len(result.changes), "; ".join(result.changes))
    if result.unlinked_tutor_ids:
        logger.warning(
            "ARK links to tutor ids CSM does not have: %s", result.unlinked_tutor_ids
        )
    return result


async def sync_employment_from_ark(db: Session) -> SyncResult:
    """Fetch and apply in one step, which is what the cron endpoint calls."""
    return apply_employment(db, await fetch_ark_employment())


def tutors_missing_from_ark(db: Session, records: list[dict]) -> list[Tutor]:
    """Teaching staff ARK has never heard of.

    The guard is only as good as the link, so somebody who teaches but has no
    ARK record would silently never be caught by any of this. The tutors page
    shows this list so the gap is visible rather than assumed away. Supervisors
    and Guests are left out because they do not teach and are not expected to
    exist in ARK at all.
    """
    known = {r.get("tutoring_system_id") for r in records}
    return [
        tutor
        for tutor in db.query(Tutor).filter(Tutor.is_active_tutor.is_(True)).all()
        if tutor.id not in known
    ]
