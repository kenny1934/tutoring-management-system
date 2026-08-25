"""Who still works here, where they work, and what they can still be given.

Two questions a tutor picker has to answer together before it can offer a name.
The first half of this module is about employment and the second is about which
branch somebody may be offered at. They are separate facts, but every picker
asks both at once, so they live in one place and get imported together.

Employment first. CSM has one column for it, ``tutors.departure_effective_on``,
holding a leaver's last working day. ARK is where the fact is recorded and
the nightly sync copies it across, so the awkward cases are already resolved by
the time the date lands here. See ``services/ark_employment_sync.py``.

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

from sqlalchemy import and_ as sa_and, or_ as sa_or

from constants import (
    NON_ACTIVE_SESSION_STATUSES,
    WEEKDAY_NAMES,
    normalize_secondary_location,
    today_hk,
)
from models import SessionLog, Tutor


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


def sessions_after_last_day_clause():
    """Lessons booked for somebody past their own last working day.

    Needs SessionLog joined to Tutor. It lives here because three places ask
    the question: the notification count, the filtered sessions list, and the
    departure load on a leaver's profile. The banner on that list quotes the
    count as though all three agree, and written out three times they would
    eventually not.

    Only work somebody actually has to turn up for counts. A cancelled lesson
    needs nobody, and neither does a make-up origin row: once a lesson has been
    moved, whether the make-up is already booked or still owed to the student,
    the row keeps its original date but nobody is teaching in that slot any
    more. Leaving those in sends an admin hunting for cover that does not need
    arranging, which is how the list stops being read at all. A row with no
    status at all is treated as real work, because the mistake worth avoiding
    here is the lesson nobody notices.
    """
    return sa_and(
        leaving_clause(),
        SessionLog.session_date > Tutor.departure_effective_on,
        sa_or(
            SessionLog.session_status.is_(None),
            SessionLog.session_status.notin_(NON_ACTIVE_SESSION_STATUSES),
        ),
    )


def still_here_clause(today: Optional[date] = None):
    """Everybody whose last working day has not passed, leavers on notice included."""
    return sa_or(
        Tutor.departure_effective_on.is_(None),
        Tutor.departure_effective_on >= (today or today_hk()),
    )


# ---------------------------------------------------------------------------
# Which branch a tutor may be offered at
# ---------------------------------------------------------------------------
# A separate question from employment, but the same practical one: which names
# may this picker put in front of somebody. A tutor belongs to a branch through
# tutors.default_location, and covering another one is recorded as rows in
# tutor_branch_coverage. See migration 163 for why it is a table rather than a
# column on the tutor.

def normalise_location(location: Optional[str]) -> Optional[str]:
    """A branch name in the short-code form everything else compares against.

    Callers reach this helper holding whichever form their own screen works
    in, so both are accepted and anything unrecognised is passed through
    untouched. The map itself lives in ``constants`` and is shared with the
    summer and regular intakes, so a new branch is one edit rather than three.
    """
    if not location:
        return None
    return normalize_secondary_location(location.strip())


def covers_on(coverage, work_date: Optional[date]) -> bool:
    """Whether one coverage row applies to ``work_date``.

    With no date in hand the row counts as long as it has not already run out.
    That is the right answer for a filter, which is asking whether this tutor
    has anything at the branch at all rather than about one particular day.

    With a date, every bound that is set has to agree. An empty bound is not a
    restriction: a row with nothing filled in means they simply also work
    there.
    """
    if work_date is None:
        return coverage.effective_until is None or coverage.effective_until >= today_hk()
    if coverage.effective_from is not None and work_date < coverage.effective_from:
        return False
    if coverage.effective_until is not None and work_date > coverage.effective_until:
        return False
    if coverage.weekday and coverage.weekday != WEEKDAY_NAMES[work_date.weekday()]:
        return False
    return True


def works_at(tutor: Tutor, location: Optional[str], work_date: Optional[date] = None) -> bool:
    """Whether this tutor may be offered at ``location``.

    Their own branch always counts. Beyond that it takes a coverage row that
    applies, which is what lets an MSA tutor be put on an MSB lesson while they
    are covering there.

    Asking without a date is the permissive reading, and it is what the filter
    toolbars want. Asking with one is the strict reading, and it is what the
    pickers that actually assign a lesson want, since they know the day the
    lesson falls on.

    No location at all means no narrowing is being applied, so everybody is
    offerable. That keeps the "All Locations" case out of every call site.
    """
    if not location:
        return True
    wanted = normalise_location(location)
    if normalise_location(tutor.default_location) == wanted:
        return True
    return any(
        normalise_location(row.location) == wanted and covers_on(row, work_date)
        for row in (tutor.branch_coverage or [])
    )
