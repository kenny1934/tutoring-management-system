"""
Shared query helper functions.

Centralizes common SQLAlchemy query patterns like joinedload options
to reduce duplication across routers.
"""
from sqlalchemy.orm import Session, joinedload
from models import Enrollment, SessionLog, MakeupProposal, MakeupProposalSlot, PrimaryProspect, SummerApplication


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


def proposal_with_slots():
    """
    Standard joinedload options for makeup proposal queries.

    Loads proposed_by_tutor, needs_input_tutor, and slots with
    their proposed_tutor and resolved_by_tutor relationships.

    Usage:
        query.options(*proposal_with_slots())
    """
    return [
        joinedload(MakeupProposal.proposed_by_tutor),
        joinedload(MakeupProposal.needs_input_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.proposed_tutor),
        joinedload(MakeupProposal.slots).joinedload(MakeupProposalSlot.resolved_by_tutor),
    ]


def get_handover_prospect(db: Session, student_id: int) -> PrimaryProspect | None:
    """Return the P6 prospect linked to this student via summer application, if any.

    Link is 1:1 — only unambiguous matches stored on PrimaryProspect.summer_application_id.
    """
    return (
        db.query(PrimaryProspect)
        .join(SummerApplication, PrimaryProspect.summer_application_id == SummerApplication.id)
        .filter(SummerApplication.existing_student_id == student_id)
        .first()
    )
