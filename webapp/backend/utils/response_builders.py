"""
Shared response builder functions.

Centralizes the common patterns for building API response objects
from SQLAlchemy models with loaded relationships.
"""
from typing import Optional
from datetime import date
from sqlalchemy.orm import Session
from models import SessionLog, Tutor
from schemas import SessionResponse, SessionExerciseResponse, LinkedSessionInfo


def _find_root_original_session_date(session: SessionLog, db: Session):
    """
    Trace back through make_up_for_id chain to find the root original session's date.

    Returns None if not a makeup session or if chain traversal fails.
    """
    if not session.make_up_for_id:
        return None

    visited = set()
    current = session

    while current.make_up_for_id and current.id not in visited:
        visited.add(current.id)
        parent = db.query(SessionLog).filter(
            SessionLog.id == current.make_up_for_id
        ).first()
        if not parent:
            break
        current = parent

    return current.session_date


def batch_find_root_original_session_dates(
    sessions: list,
    db: Session,
) -> dict[int, date]:
    """
    Batch-resolve root original session dates for a list of sessions.

    Returns a dict mapping session_id -> root_original_date for sessions
    that are makeups. Non-makeup sessions are excluded from the result.
    """
    makeup_sessions = [s for s in sessions if s.make_up_for_id]
    if not makeup_sessions:
        return {}

    # Build a map of all sessions we already have
    known_sessions = {s.id: s for s in sessions}

    # Collect parent IDs we need to trace
    ids_to_fetch = {s.make_up_for_id for s in makeup_sessions}

    # Iteratively load parent sessions until all chains are resolved
    while ids_to_fetch - set(known_sessions.keys()):
        missing_ids = list(ids_to_fetch - set(known_sessions.keys()))
        parents = db.query(SessionLog).filter(
            SessionLog.id.in_(missing_ids)
        ).all()
        if not parents:
            break
        for p in parents:
            known_sessions[p.id] = p
            if p.make_up_for_id:
                ids_to_fetch.add(p.make_up_for_id)

    # Trace each makeup session to its root
    result = {}
    for s in makeup_sessions:
        visited = set()
        current = s
        while current.make_up_for_id and current.id not in visited:
            visited.add(current.id)
            parent = known_sessions.get(current.make_up_for_id)
            if not parent:
                break
            current = parent
        result[s.id] = current.session_date

    return result


def build_session_response(session: SessionLog, db: Optional[Session] = None, root_dates: Optional[dict] = None) -> SessionResponse:
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
    data.tutor_nickname = session.tutor.nickname if session.tutor else None
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
    # Compute root original session date for makeup sessions (for 60-day rule)
    if session.make_up_for_id:
        if root_dates is not None:
            data.root_original_session_date = root_dates.get(session.id)
        elif db:
            data.root_original_session_date = _find_root_original_session_date(session, db)
    # Enrollment payment status (if enrollment is loaded)
    if hasattr(session, 'enrollment') and session.enrollment:
        data.enrollment_payment_status = session.enrollment.payment_status
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
        tutor_nickname=tutor.nickname if tutor else None,
        session_status=session.session_status
    )
