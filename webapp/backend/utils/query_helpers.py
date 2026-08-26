"""
Shared query helper functions.

Centralizes common SQLAlchemy query patterns like joinedload options
to reduce duplication across routers.
"""
from sqlalchemy.orm import Session, joinedload
from models import Enrollment, SessionLog, MakeupProposal, MakeupProposalSlot, PrimaryProspect, SummerApplication, RegularApplication


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
    """Return the P6 prospect that became this student, if there is one.

    A prospect reaches a student record through whichever application they
    actually submitted. Most came through summer and then stayed on for the
    regular year, but plenty skipped summer entirely and only applied when
    the regular course opened, so we have to check both routes. Each link is
    1:1 and only unambiguous matches are ever stored on the prospect row.

    Summer is checked first so that a prospect who did both keeps showing the
    same handover it has always shown. In the rare case where two different
    prospects point at one student, that ordering also means the older, more
    established summer link wins instead of the result flipping around.
    """
    for link_column, application in (
        (PrimaryProspect.summer_application_id, SummerApplication),
        (PrimaryProspect.regular_application_id, RegularApplication),
    ):
        prospect = (
            db.query(PrimaryProspect)
            .join(application, link_column == application.id)
            .filter(application.existing_student_id == student_id)
            .first()
        )
        if prospect:
            return prospect
    return None
