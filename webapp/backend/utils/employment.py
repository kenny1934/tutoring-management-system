"""Who still works here, and what they can still be given.

CSM has one column for this, ``tutors.departure_effective_on``, holding a
leaver's last working day. ARK is where the fact is recorded and the nightly
sync copies it across, so the awkward cases are already resolved by the time
the date lands here. See ``services/ark_employment_sync.py``.

The distinction that matters is between somebody who is leaving and somebody
who has left, because they need opposite treatment. A tutor serving notice is
still here. They teach, they mark attendance, they appear in the pickers, and
refusing to schedule them would be wrong. What must be refused is work dated
after their last day, from the moment the resignation is known, because that is
the lesson nobody will be there to teach.

Once the last day has passed they lose their login and drop out of the pickers,
but everything already assigned to them stays exactly as it is. Their sessions
remain editable so an admin can reassign them at whatever pace the term allows,
which is usually slower than the departure. Nothing here freezes history.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import or_ as sa_or

from constants import hk_now
from models import Tutor


def today_hk() -> date:
    """The current date in Hong Kong, which is the only date the office uses."""
    return hk_now().date()


def is_leaving(tutor: Tutor) -> bool:
    """Whether a last working day is on file, past or future."""
    return tutor.departure_effective_on is not None


def has_departed(tutor: Tutor, today: Optional[date] = None) -> bool:
    """Whether their last working day is behind them.

    The last day itself counts as employed. Somebody leaving on the 22nd works
    the 22nd.
    """
    if tutor.departure_effective_on is None:
        return False
    return tutor.departure_effective_on < (today or today_hk())


def can_hold_work_on(tutor: Tutor, work_date: date) -> bool:
    """Whether this tutor can be given work happening on ``work_date``.

    True for everybody who is not leaving. For a leaver it is the comparison
    that the whole feature exists for: up to and including the last working
    day, yes, and after it, no.
    """
    if tutor.departure_effective_on is None:
        return True
    return work_date <= tutor.departure_effective_on


def leaving_clause():
    """`is_leaving` as a filter over the Tutor table."""
    return Tutor.departure_effective_on.isnot(None)


def departed_clause(today: Optional[date] = None):
    """`has_departed` as a filter over the Tutor table."""
    return Tutor.departure_effective_on < (today or today_hk())


def still_here_clause(today: Optional[date] = None):
    """Everybody whose last working day has not passed, leavers on notice included."""
    return sa_or(
        Tutor.departure_effective_on.is_(None),
        Tutor.departure_effective_on >= (today or today_hk()),
    )
