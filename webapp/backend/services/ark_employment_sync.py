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

ARK answers both halves itself, using the same helpers its own leave and
payroll code uses: ``last_working_day`` for the date, and ``departed`` for
somebody already gone. Which statuses end employment, and the rule that an end
date sitting on an active record is stale, are ARK's to decide and ARK's to
change. CSM deriving them from the raw columns would mean a new status in ARK's
enum leaving CSM quietly booking lessons for somebody who had left.

That leaves one decision here, and it is genuinely CSM's: a departure ARK
reports with no date at all, which is what an immediate termination looks like.
It is stored as the date the sync saw it, so every comparison the rest of CSM
makes stays a simple one against a real date.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from constants import today_hk
from models import Tutor

logger = logging.getLogger(__name__)


@dataclass
class SyncResult:
    """What the run did, for the response body and the log."""
    checked: int = 0
    marked: int = 0
    cleared: int = 0
    unchanged: int = 0
    unlinked_tutor_ids: list[int] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)


def resolve_last_working_day(record: dict, seen_on: date) -> Optional[date]:
    """One ARK record as a single date CSM can compare against.

    None means they are not leaving, which covers everybody still here and
    every external passport account. A departure with no date is the immediate
    termination case, and reads as gone on the day we saw it.
    """
    last_day = record.get("last_working_day")
    if isinstance(last_day, str):
        last_day = date.fromisoformat(last_day)
    if last_day is not None:
        return last_day
    return seen_on if record.get("departed") else None


async def fetch_ark_employment() -> list[dict]:
    """The linked staff records ARK holds. Raises if ARK cannot be reached.

    Goes through the same configuration and pooled client as the leave proxy,
    so the ARK base URL and token are declared once and a nightly run reuses a
    warm connection. No X-Acting-Email: there is nobody behind this call, which
    is why ARK gave the endpoint a service-token-only dependency.
    """
    from routers.ark_proxy import ARK_API_BASE_URL, ARK_SERVICE_TOKEN, _get_client

    if not ARK_SERVICE_TOKEN:
        raise RuntimeError("ARK integration not configured")

    response = await _get_client().get(
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

    # One query for the whole run. Per-record db.get() looks free because of
    # the identity map, but that map holds weak references, so each lookup goes
    # back to the database.
    wanted = {r.get("tutoring_system_id") for r in records} - {None}
    by_id = {
        tutor.id: tutor
        for tutor in db.query(Tutor).filter(Tutor.id.in_(wanted)).all()
    } if wanted else {}

    for record in records:
        tutor_id = record.get("tutoring_system_id")
        if tutor_id is None:
            continue

        tutor = by_id.get(tutor_id)
        if tutor is None:
            # ARK points at a tutor CSM does not have. Worth saying out loud,
            # because it means the link is stale on ARK's side.
            result.unlinked_tutor_ids.append(tutor_id)
            continue

        result.checked += 1
        resolved = resolve_last_working_day(record, seen_on)
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


def tutors_missing_from_ark(db: Session, records: list[dict]) -> list[Tutor]:
    """Teaching staff ARK has never heard of.

    The guard is only as good as the link, so somebody who teaches but has no
    ARK record would never be caught by any of this. The sync reports them by
    name so the gap is visible rather than assumed away. Supervisors and Guests
    are left out because they do not teach and are not expected to exist in ARK
    at all.
    """
    known = {r.get("tutoring_system_id") for r in records}
    return [
        tutor
        for tutor in db.query(Tutor).filter(Tutor.is_active_tutor.is_(True)).all()
        if tutor.id not in known
    ]
