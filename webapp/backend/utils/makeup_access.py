"""Keep new-policy booking access tied to actual teaching records."""
from fastapi import HTTPException

from models import Enrollment
from services.makeup_entitlement import academic_policy_applies


def verify_makeup_access(db, session, user):
    if not academic_policy_applies(db, session.student_id):
        return
    if user.role in {'Admin', 'Super Admin'} or session.tutor_id == user.id:
        return
    from billing.calculator import BillingPolicy
    policy = BillingPolicy()
    owned = db.query(Enrollment.id).filter(
        Enrollment.student_id == session.student_id,
        Enrollment.tutor_id == user.id,
        Enrollment.enrollment_type == 'Regular',
        Enrollment.payment_status != 'Cancelled',
        Enrollment.first_lesson_date >= policy.academic_start,
        Enrollment.first_lesson_date <= policy.regular_end,
    ).first()
    if owned is None:
        raise HTTPException(status_code=403, detail="You can only arrange makeups for your students.")
