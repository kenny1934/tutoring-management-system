"""
Lessons taught but not in CSM yet.

A tutor sometimes teaches a lesson that CSM doesn't have, usually because the
student's enrolment wasn't renewed in time. The tutor records it as an
unlisted lesson (a row in tutor_memos, the table's old name). Once CSM has the
real lesson, `fill_unlisted_lessons` copies the tutor's record into it: it
marks the lesson attended, adds the classwork and homework, and sets the notes
and rating, without overwriting anything the lesson already has. Then it tells
the tutor through the inbox.

Every route that creates or moves a student's lessons calls it after the new
lessons are flushed and before the commit, so the fill-in lands in the same
transaction as the lessons themselves:

- creating an enrolment, batch renewal, and publishing a regular or summer
  application
- booking a make-up, approving a make-up proposal and enrolling in an exam
  revision slot
- editing a lesson's date and applying a schedule change

A waiting lesson matches a lesson of the same student on the same date that
the student could have attended: one still to be marked, or one already
marked attended. A lesson in the same time slot wins. When nothing matches,
or two lessons match equally well, it keeps waiting, and the lesson's page
offers a one-click fill so a person can choose.
"""
import asyncio
import logging
from typing import Iterable

import anyio
from sqlalchemy import event
from sqlalchemy.orm import Session

from constants import ATTENDABLE_STATUSES, COMPLETED_STATUSES, hk_now
from models import SessionExercise, SessionLog, Tutor, TutorMemo, TutorMessage
from services.attendance import mark_attended

logger = logging.getLogger(__name__)

WAITING, FILLED, DISMISSED = "waiting", "filled", "dismissed"

# Lessons the student could have been at. Anything else (cancelled, moved to
# a make-up, no show, sick leave) says the student wasn't there that day.
FILLABLE_STATUSES = tuple(ATTENDABLE_STATUSES) + tuple(COMPLETED_STATUSES)

# The exercise fields copied into the real lesson, the same list as saving a
# lesson's exercises uses, links included.
EXERCISE_FIELDS = (
    "pdf_name", "page_start", "page_end", "remarks", "url", "url_title",
    "answer_pdf_name", "answer_page_start", "answer_page_end", "answer_remarks",
)

_TYPE_CODES = {"CW": "CW", "Classwork": "CW", "HW": "HW", "Homework": "HW"}


def exercise_type_code(value: str | None) -> str:
    """CW or HW, whichever way the type was written."""
    return _TYPE_CODES.get(value or "", "CW")


def pick_lesson(lesson: TutorMemo, candidates: list[SessionLog]) -> SessionLog | None:
    """The one real lesson an unlisted lesson belongs to, or None if there is
    no clear choice. A lesson in the same time slot wins. Without one, the only
    lesson that day will do. Two equally good lessons are left to a person."""
    if lesson.time_slot:
        same_slot = [c for c in candidates if c.time_slot == lesson.time_slot]
        if len(same_slot) == 1:
            return same_slot[0]
        if len(same_slot) > 1:
            return None
    return candidates[0] if len(candidates) == 1 else None


def fill_lesson(db: Session, lesson: TutorMemo, session: SessionLog, actor_email: str) -> None:
    """Copies an unlisted lesson into the real lesson and marks it filled.

    Nothing the real lesson already has is overwritten. Classwork and homework
    are each added only when the lesson has none of that kind, and the notes
    and rating only when it has none. Attendance is credited to the tutor who
    recorded the lesson.
    """
    recorded_by = lesson.created_by or actor_email
    if session.session_status in ATTENDABLE_STATUSES:
        mark_attended(session, marked_by=recorded_by, modified_by=actor_email)
    else:
        session.last_modified_by = actor_email
        session.last_modified_time = hk_now()

    kinds_present = {
        exercise_type_code(kind)
        for (kind,) in db.query(SessionExercise.exercise_type).filter(SessionExercise.session_id == session.id)
    }
    for kind in ("CW", "HW"):
        items = [ex for ex in (lesson.exercises or []) if exercise_type_code(ex.get("exercise_type")) == kind]
        if not items or kind in kinds_present:
            continue
        for place, item in enumerate(items):
            row = SessionExercise(
                session_id=session.id,
                exercise_type=kind,
                sort_order=place,
                created_by=recorded_by,
                created_at=hk_now(),
            )
            for field in EXERCISE_FIELDS:
                setattr(row, field, item.get(field))
            db.add(row)

    if lesson.notes and not (session.notes or "").strip():
        session.notes = lesson.notes
    if lesson.performance_rating and not (session.performance_rating or "").strip():
        session.performance_rating = lesson.performance_rating

    lesson.status = FILLED
    lesson.linked_session_id = session.id
    lesson.filled_at = hk_now()
    lesson.filled_by = actor_email


def fill_unlisted_lessons(db: Session, student_ids: Iterable[int], actor_email: str) -> list[tuple[TutorMemo, SessionLog]]:
    """Fills every waiting unlisted lesson of these students that now has a
    clear real lesson, tells each tutor, and returns what was filled. It
    doesn't commit. The caller's commit saves the fill-in with everything
    else it did."""
    student_ids = {sid for sid in student_ids if sid}
    if not student_ids:
        return []
    db.flush()

    waiting = (
        db.query(TutorMemo)
        .filter(TutorMemo.student_id.in_(student_ids), TutorMemo.status == WAITING)
        .order_by(TutorMemo.memo_date, TutorMemo.id)
        .all()
    )
    if not waiting:
        return []

    dates = {lesson.memo_date for lesson in waiting}
    sessions = (
        db.query(SessionLog)
        .filter(
            SessionLog.student_id.in_(student_ids),
            SessionLog.session_date.in_(dates),
            SessionLog.session_status.in_(FILLABLE_STATUSES),
        )
        .order_by(SessionLog.id)
        .all()
    )
    # A real lesson takes one unlisted lesson at most, including any filled
    # before today.
    taken = {
        sid for (sid,) in db.query(TutorMemo.linked_session_id).filter(
            TutorMemo.linked_session_id.in_([s.id for s in sessions] or [0]),
            TutorMemo.status == FILLED,
        )
    }

    filled = []
    for lesson in waiting:
        candidates = [
            s for s in sessions
            if s.student_id == lesson.student_id and s.session_date == lesson.memo_date and s.id not in taken
        ]
        session = pick_lesson(lesson, candidates)
        if session is None:
            continue
        fill_lesson(db, lesson, session, actor_email)
        taken.add(session.id)
        filled.append((lesson, session))

    if filled:
        tell_tutors(db, filled, actor_email)
    return filled


def _lesson_line(lesson: TutorMemo, session: SessionLog) -> str:
    when = session.session_date.strftime("%a %-d %b %Y")
    slot = f", {session.time_slot}" if session.time_slot else ""
    return f"{when}{slot}"


def tell_tutors(db: Session, filled: list[tuple[TutorMemo, SessionLog]], actor_email: str) -> list[TutorMessage]:
    """Sends each tutor an inbox message saying their lesson is now in CSM and
    filled in. A tutor whose own action filled it in already knows, so they
    get nothing. The message comes from the person whose action did it."""
    actor = db.query(Tutor).filter(Tutor.user_email == actor_email).first()
    if actor is None:
        return []
    student_names = {}
    messages = []
    for lesson, session in filled:
        if lesson.tutor_id == actor.id:
            continue
        if lesson.student_id not in student_names:
            student_names[lesson.student_id] = lesson.student.student_name if lesson.student else "your student"
        name = student_names[lesson.student_id]
        message = TutorMessage(
            from_tutor_id=actor.id,
            to_tutor_id=lesson.tutor_id,
            subject=f"Your lesson with {name} is now in CSM",
            message=(
                f"You recorded a lesson with {name} on {_lesson_line(lesson, session)} before it was in CSM. "
                "It's there now, and it has been filled in from your record: attendance, classwork, "
                "homework, notes and rating, wherever the lesson didn't already have them."
            ),
            priority="Normal",
            category="Schedule",
        )
        db.add(message)
        messages.append(message)
    if messages:
        db.flush()
        _deliver_after_commit(db, messages, actor)
    return messages


def _deliver_after_commit(db: Session, messages: list[TutorMessage], actor: Tutor) -> None:
    """Delivers the messages live once the caller commits, the way a message
    written in the inbox is delivered: an event to the open inbox and a push
    to the tutor's devices. The delivery has to run on the server's event
    loop. Async endpoints are already on it. Plain ones run in a worker
    thread and hand the work to the loop. Anywhere without a loop, such as a
    script, the messages simply wait in the inbox."""
    events = [
        {
            "recipient": m.to_tutor_id,
            "data": {
                "message_id": m.id,
                "thread_id": m.id,
                "from_tutor_id": actor.id,
                "from_tutor_name": actor.tutor_name,
                "subject": m.subject,
                "preview": (m.message or "")[:100],
                "category": m.category,
                "priority": m.priority,
                "mentioned_tutor_ids": [],
            },
        }
        for m in messages
    ]

    def schedule():
        from sse import sse_manager
        from routers.push_notifications import send_push_to_tutors
        loop = asyncio.get_running_loop()
        for item in events:
            loop.create_task(sse_manager.broadcast("new_message", item["data"], [item["recipient"]]))
            send_push_to_tutors([item["recipient"]], {
                "title": actor.tutor_name,
                "body": item["data"]["preview"],
                "data": {"threadId": item["data"]["thread_id"], "url": "/inbox"},
            })

    def deliver(_session):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            try:
                anyio.from_thread.run_sync(schedule)
            except Exception:
                logger.info("No event loop to deliver %d message(s) live, they wait in the inbox", len(events))
            return
        schedule()

    event.listen(db, "after_commit", deliver, once=True)
