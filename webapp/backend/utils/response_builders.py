"""
Shared response builder functions.

Centralizes the common patterns for building API response objects
from SQLAlchemy models with loaded relationships.
"""
from models import SessionLog, Tutor
from schemas import SessionResponse, SessionExerciseResponse, LinkedSessionInfo


def build_session_response(session: SessionLog) -> SessionResponse:
    """
    Build a SessionResponse from a SessionLog with student/tutor/exercise data.

    Centralizes the common pattern of populating student fields, tutor name,
    and exercises from the loaded session relationships.

    Args:
        session: SessionLog with student, tutor, and exercises relationships loaded

    Returns:
        SessionResponse with all fields populated
    """
    data = SessionResponse.model_validate(session)
    data.student_name = session.student.student_name if session.student else None
    data.tutor_name = session.tutor.tutor_name if session.tutor else None
    data.school_student_id = session.student.school_student_id if session.student else None
    data.grade = session.student.grade if session.student else None
    data.lang_stream = session.student.lang_stream if session.student else None
    data.school = session.student.school if session.student else None
    data.exercises = [
        SessionExerciseResponse.model_validate(ex)
        for ex in session.exercises
    ] if session.exercises else []
    # Extension request info (if exists)
    if session.extension_request:
        data.extension_request_id = session.extension_request.id
        data.extension_request_status = session.extension_request.request_status
    return data


def build_linked_session_info(session: SessionLog, tutor: Tutor = None) -> LinkedSessionInfo:
    """
    Build a LinkedSessionInfo object from a session.

    Used for representing linked sessions (rescheduled_to, make_up_for) in responses.

    Args:
        session: SessionLog to build info from
        tutor: Optional Tutor object (if already loaded separately)

    Returns:
        LinkedSessionInfo with basic session details
    """
    return LinkedSessionInfo(
        id=session.id,
        session_date=session.session_date,
        time_slot=session.time_slot,
        tutor_name=tutor.tutor_name if tutor else None,
        session_status=session.session_status
    )
