"""
Shared query helper functions.

Centralizes common SQLAlchemy query patterns like joinedload options
to reduce duplication across routers.
"""
from sqlalchemy.orm import joinedload
from models import Enrollment, SessionLog


def enrollment_with_relations():
    """
    Standard joinedload options for enrollment queries.

    Loads student, tutor, and discount relationships.

    Usage:
        query.options(*enrollment_with_relations())
    """
    return [
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
        joinedload(Enrollment.discount),
    ]


def enrollment_with_student_tutor():
    """
    Joinedload options for enrollment queries without discount.

    Loads only student and tutor relationships.

    Usage:
        query.options(*enrollment_with_student_tutor())
    """
    return [
        joinedload(Enrollment.student),
        joinedload(Enrollment.tutor),
    ]


def session_with_relations():
    """
    Standard joinedload options for session queries.

    Loads student, tutor, and exercises relationships.

    Usage:
        query.options(*session_with_relations())
    """
    return [
        joinedload(SessionLog.student),
        joinedload(SessionLog.tutor),
        joinedload(SessionLog.exercises),
    ]
