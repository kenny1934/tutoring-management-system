"""
Marking a lesson attended, in one place.

The Attended button and the fill-in of a lesson that was taught before it was
in CSM (services/unlisted_lessons.py) both mark lessons attended. They have to
leave a lesson in exactly the same state, so that undo, the attendance
reminders and the activity feed treat the two alike.
"""
from constants import hk_now
from models import SessionLog

# What each status that can be marked attended becomes once it is.
ATTENDED_STATUS_FOR = {
    "Scheduled": "Attended",
    "Trial Class": "Attended",
    "Make-up Class": "Attended (Make-up)",
}


def mark_attended(session: SessionLog, marked_by: str, modified_by: str | None = None) -> None:
    """Marks the lesson attended and records who marked it.

    `marked_by` is the person the attendance is credited to. `modified_by` is
    whose action changed the lesson, which is the same person when a tutor
    presses Attended, but an admin when creating an enrolment fills in a
    lesson the tutor recorded earlier. The status before is kept so that undo
    can put it back. The caller checks the lesson can be marked attended.
    """
    now = hk_now()
    session.previous_session_status = session.session_status
    session.session_status = ATTENDED_STATUS_FOR.get(session.session_status, session.session_status)
    session.attendance_marked_by = marked_by
    session.attendance_mark_time = now
    session.last_modified_by = modified_by or marked_by
    session.last_modified_time = now
