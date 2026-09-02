"""Refuses to hand work to somebody who will not be there to do it.

The rule this enforces is narrow on purpose. It fires when a write *moves* work
onto a leaver, and never because a row already belongs to one. An admin
clearing up after a departure has to be able to edit those rows freely, change
their dates, mark their attendance and reassign them one at a time over
whatever period the term allows, and none of that is blocked here. What is
blocked is the pile growing: a new session under a departed tutor, or somebody
else's session moved onto them past their last working day.

That distinction is the whole implementation. SQLAlchemy's attribute history
tells us whether the tutor column actually moved during this flush, so setting
it to the value it already had reads as no change and passes straight through.
Everything else in this module is the question of which date to compare
against, which differs per table.

It hangs off ``before_flush`` rather than living in each endpoint because there
are around forty places that write a tutor id and the ones worth worrying about
are the ones nobody remembers to guard. Endpoints that want a friendlier error
than a rolled-back flush can call ``check_assignment`` early, and the publishing
paths do exactly that so a bulk run refuses up front instead of dying halfway
through.

Messages and notifications are deliberately not registered here. A broadcast
writes a recipient row for every tutor on file, leavers included, and it should
carry on doing so.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Callable, Optional

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session
from sqlalchemy.orm.base import PASSIVE_NO_INITIALIZE

from models import (
    Enrollment,
    ExamRevisionSlot,
    MakeupProposal,
    MakeupProposalSlot,
    RegularCourseSlot,
    RegularTutorDuty,
    SessionLog,
    SummerCourseConfig,
    SummerCourseSlot,
    SummerTutorDuty,
    Tutor,
    WaitlistSlotPreference,
)
from utils.employment import can_hold_work_on, has_departed, leaving_clause

logger = logging.getLogger(__name__)


class DepartedTutorAssignment(Exception):
    """A write would have given work to somebody who has left or is about to.

    Carries a message written for whoever is looking at the screen. main.py
    turns it into a 400 so it reads as a refusal rather than a crash.
    """

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


# How a table's work is dated, which decides what a leaver may still be given.
#
#   ON_DATE          the row says when the work happens, so compare with it
#   NO_LEAVERS       the row recurs with no end in sight, so nobody who is
#                    leaving may hold it at all
#   AFTER_DEPARTURE  not work, but something that needs a reply, so only a
#                    person who has already gone is refused
ON_DATE = "on_date"
NO_LEAVERS = "no_leavers"
AFTER_DEPARTURE = "after_departure"


@dataclass(frozen=True)
class Guard:
    column: str
    noun: str
    mode: str
    date_for: Optional[Callable[[object, Session], Optional[date]]] = None


def _summer_horizon(obj, session: Session) -> Optional[date]:
    """The last date a summer slot or duty can produce a lesson on.

    An ad-hoc slot is a single date. Everything else recurs weekly until the
    intake ends, so the config's closing date is the honest horizon: a tutor
    who leaves before it will be short for the tail of the course.
    """
    if getattr(obj, "is_adhoc", False) and getattr(obj, "adhoc_date", None):
        return obj.adhoc_date
    config = session.get(SummerCourseConfig, obj.config_id) if obj.config_id else None
    return config.course_end_date if config else None


# Every column that decides who does a piece of future work. Adding a table
# here is what makes it covered, so a new feature that assigns tutors belongs
# in this list on the day it is written.
GUARDS: dict[type, tuple[Guard, ...]] = {
    SessionLog: (Guard("tutor_id", "session", ON_DATE, lambda o, s: o.session_date),),
    Enrollment: (Guard("tutor_id", "enrollment", ON_DATE, lambda o, s: o.first_lesson_date),),
    ExamRevisionSlot: (Guard("tutor_id", "revision slot", ON_DATE, lambda o, s: o.session_date),),
    MakeupProposalSlot: (
        Guard("proposed_tutor_id", "make-up option", ON_DATE, lambda o, s: o.proposed_date),
    ),
    MakeupProposal: (Guard("needs_input_tutor_id", "make-up question", AFTER_DEPARTURE),),
    SummerCourseSlot: (Guard("tutor_id", "summer slot", ON_DATE, _summer_horizon),),
    SummerTutorDuty: (Guard("tutor_id", "summer duty", ON_DATE, _summer_horizon),),
    # Regular slots and duties have a start date and no end. Anything put on
    # one runs until somebody changes it, so a leaver cannot hold one at all.
    RegularCourseSlot: (Guard("tutor_id", "regular slot", NO_LEAVERS),),
    RegularTutorDuty: (Guard("tutor_id", "regular duty", NO_LEAVERS),),
    WaitlistSlotPreference: (Guard("preferred_tutor_id", "waitlist preference", NO_LEAVERS),),
}


_LEAVERS_KEY = "departure_guard_leavers"


def leavers(session: Session) -> dict[int, Tutor]:
    """Everybody with a leaving date on file, keyed by tutor id.

    Held on the session rather than looked up per row. The obvious spelling,
    ``session.get(Tutor, id)`` per check, looks free because of the identity
    map, but that map holds weak references: the tutor is collected as soon as
    the check returns, so the next row queries again. Writing four hundred
    sessions across a few tutors issued four hundred SELECTs. This dict holds
    strong references for the life of the session, which is one request, so the
    whole feature costs one query, and none at all once the answer is empty.
    """
    cache = session.info.get(_LEAVERS_KEY)
    if cache is None:
        cache = {
            tutor.id: tutor
            for tutor in session.query(Tutor).filter(leaving_clause()).all()
        }
        session.info[_LEAVERS_KEY] = cache
    return cache


def forget_leavers(session: Session) -> None:
    """Drop the cached leavers, because somebody's leaving date just moved."""
    session.info.pop(_LEAVERS_KEY, None)


def _history(obj, column: str):
    """The attribute's change history, without building one for every column.

    ``inspect(obj).attrs[column]`` memoises an AttributeState for the object's
    entire namespace to read one key, which is forty throwaway objects per
    enrollment and thirty-two per session row. Every flushed row is a fresh
    object, so none of that memoising is ever reused.
    """
    return inspect(obj).get_history(column, PASSIVE_NO_INITIALIZE)


def _incoming_value(obj, column: str) -> Optional[int]:
    """The tutor id this flush is writing into ``column``, changed or not."""
    history = _history(obj, column)
    if not history.has_changes():
        return None
    added = [value for value in history.added if value is not None]
    return added[0] if added else None


def _previous_value(session: Session, obj, column: str) -> Optional[int]:
    """What ``column`` held before this flush, or None for a brand-new row.

    Usually SQLAlchemy already knows, because the row was loaded and the old
    value sits in the attribute's history. It does not know when the attribute
    was never loaded or has been expired by an earlier commit in the same
    request, and in that case setting the column to the value it already had
    looks like a change. That would refuse an admin editing the notes on a
    leaver's session, which is exactly what must keep working, so when the old
    value is not to hand it is worth one small query to ask.
    """
    state = inspect(obj)
    if state.pending or state.transient:
        return None

    history = _history(obj, column)
    if history.deleted:
        return history.deleted[0]
    if history.unchanged:
        return history.unchanged[0]

    identity = state.identity
    if not identity:
        return None
    model = type(obj)
    return session.query(getattr(model, column)).filter(model.id == identity[0]).scalar()


def _leaving_phrase(tutor: Tutor) -> str:
    """"left on 22 August 2026" or "leaves on 22 August 2026", as appropriate."""
    stamp = tutor.departure_effective_on.strftime("%-d %B %Y")
    return f"left on {stamp}" if has_departed(tutor) else f"leaves on {stamp}"


def _refusal(guard: Guard, obj, tutor: Tutor, session: Session) -> Optional[str]:
    """The message to refuse this assignment with, or None to allow it."""
    if guard.mode == AFTER_DEPARTURE:
        if has_departed(tutor):
            return f"{tutor.tutor_name} {_leaving_phrase(tutor)} and cannot be asked."
        return None

    if guard.mode == NO_LEAVERS:
        return (
            f"{tutor.tutor_name} {_leaving_phrase(tutor)}, so they cannot take a "
            f"{guard.noun}. A {guard.noun} carries on until somebody changes it, "
            "so it needs a tutor who will still be here."
        )

    work_date = guard.date_for(obj, session) if guard.date_for else None
    if work_date is None:
        # No date to judge by. Refusing is the safe reading, and the message
        # says why rather than pretending to know when the work happens.
        return (
            f"{tutor.tutor_name} {_leaving_phrase(tutor)}, and this {guard.noun} "
            "has no date on it yet, so it cannot be assigned to them."
        )

    if can_hold_work_on(tutor, work_date):
        return None

    return (
        f"{tutor.tutor_name} {_leaving_phrase(tutor)}, so a {guard.noun} on "
        f"{work_date.strftime('%-d %B %Y')} cannot be assigned to them."
    )


def check_assignment(
    db: Session, tutor_id: Optional[int], work_date: Optional[date], noun: str = "session"
) -> Optional[str]:
    """The refusal message for giving ``tutor_id`` work on ``work_date``, if any.

    For endpoints that would rather say no before writing anything. Returns
    None when the assignment is fine, which includes every tutor who is not
    leaving.
    """
    if tutor_id is None:
        return None
    tutor = leavers(db).get(tutor_id)
    if tutor is None:
        return None
    if work_date is not None and can_hold_work_on(tutor, work_date):
        return None
    if work_date is None:
        return f"{tutor.tutor_name} {_leaving_phrase(tutor)}."
    return (
        f"{tutor.tutor_name} {_leaving_phrase(tutor)}, so a {noun} on "
        f"{work_date.strftime('%-d %B %Y')} cannot be assigned to them."
    )


def _before_flush(session: Session, flush_context, instances) -> None:
    changed = list(session.new) + list(session.dirty)

    # A leaving date being written is the one thing that makes the cached
    # answer wrong, so the guard notices it rather than asking every caller to
    # remember. Cheap: only Tutor rows are inspected, and only when one is
    # being written at all.
    if any(
        isinstance(obj, Tutor) and _history(obj, "departure_effective_on").has_changes()
        for obj in changed
    ):
        forget_leavers(session)

    known_leavers = None
    for obj in changed:
        guards = GUARDS.get(type(obj))
        if not guards:
            continue
        for guard in guards:
            tutor_id = _incoming_value(obj, guard.column)
            if tutor_id is None:
                continue
            # Loaded once per flush, and not at all unless something assigns a
            # tutor. When nobody is leaving this is an empty dict and every
            # check below is a dictionary miss.
            if known_leavers is None:
                known_leavers = leavers(session)
            tutor = known_leavers.get(tutor_id)
            if tutor is None:
                continue
            if _previous_value(session, obj, guard.column) == tutor_id:
                continue
            problem = _refusal(guard, obj, tutor, session)
            if problem:
                logger.info(
                    "Refused %s.%s = %s (%s)",
                    type(obj).__name__, guard.column, tutor_id, tutor.tutor_name,
                )
                raise DepartedTutorAssignment(problem)


_installed = False


def install() -> None:
    """Attach the guard to every session in the process.

    Listening on the Session class rather than our sessionmaker means anything
    that opens a session is covered, including scripts and tests. Importing
    this module installs it, and main.py calls this as well so that the wiring
    is visible from the place people go looking for it.
    """
    global _installed
    if _installed:
        return
    event.listen(Session, "before_flush", _before_flush)
    _installed = True


install()
