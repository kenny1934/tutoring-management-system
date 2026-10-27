"""Read a bounded set of recorded course facts, without loading private contacts.

Teaching roots, payment status and sent flags are separate evidence. Historical
amounts cannot be recovered from the current fee-message formatter, so this
reader never presents a regenerated quote as a previously issued bill.
"""
from collections import defaultdict
from datetime import date, timedelta, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from models import Enrollment, SessionLog, Student, StudentCoupon, Tutor
from .calculator import BillingPolicy
from .context import EvidenceBlock, EvidenceLesson, build_student_context
from .schemas import BillingStudent, ImportedCouponSnapshot, PreviewIssue


def academic_source_filter(policy: BillingPolicy):
    """Include a pre-September block when it contains September teaching."""
    roots_in_year = and_(
        SessionLog.enrollment_id == Enrollment.id,
        SessionLog.make_up_for_id.is_(None),
        SessionLog.session_date >= policy.academic_start,
        SessionLog.session_date <= policy.regular_end,
    )
    return and_(
        Enrollment.enrollment_type == 'Regular',
        or_(
            and_(Enrollment.first_lesson_date >= policy.academic_start - timedelta(days=31),
                 Enrollment.first_lesson_date <= policy.regular_end),
            select(SessionLog.id)
            .where(roots_in_year).correlate(Enrollment).exists(),
        ),
    )


def source_student_ids(db: Session, policy: BillingPolicy, *, tutor_id=None, location=None):
    query = db.query(Enrollment.student_id).filter(
        academic_source_filter(policy), Enrollment.payment_status != 'Cancelled',
    )
    if tutor_id is not None:
        query = query.filter(Enrollment.tutor_id == tutor_id)
    if location:
        query = query.filter(Enrollment.location == location)
    return query.distinct()


def load_contexts(db: Session, student_ids: list[int], holidays: set[date], *,
                  as_of: date, basis='paid_only', selected=None,
                  policy: BillingPolicy = BillingPolicy(), isolate_invalid=False):
    """Batch all facts for a page of students, including their other weekly slot.

    Authorisation is the caller's responsibility. Every query uses explicit
    columns so new model fields cannot accidentally expand this data surface.
    """
    if not student_ids:
        return {}
    students = db.query(
        Student.id, Student.student_name, Student.school_student_id,
        Student.home_location, Student.grade, Student.is_staff_referral,
        Student.lang_stream, Student.school,
    ).filter(Student.id.in_(student_ids)).all()
    blocks = db.query(
        Enrollment.id, Enrollment.student_id, Enrollment.tutor_id,
        Enrollment.first_lesson_date, Enrollment.assigned_day,
        Enrollment.assigned_time, Enrollment.location, Enrollment.lessons_paid,
        Enrollment.payment_status, Enrollment.payment_date,
        Enrollment.fee_message_sent, Enrollment.renewed_from_enrollment_id,
        Enrollment.is_new_student, Tutor.tutor_name,
    ).join(Tutor, Tutor.id == Enrollment.tutor_id).filter(
        Enrollment.student_id.in_(student_ids), academic_source_filter(policy),
    ).all()
    by_student = defaultdict(list)
    for row in blocks:
        data = dict(row._mapping)
        data['fee_message_sent'] = bool(data['fee_message_sent'])
        data['is_new_student'] = bool(data['is_new_student'])
        by_student[row.student_id].append(EvidenceBlock(**data))
    lessons = defaultdict(list)
    if blocks:
        rows = db.query(
            SessionLog.id, SessionLog.enrollment_id, SessionLog.student_id,
            SessionLog.session_date, SessionLog.session_status, SessionLog.time_slot,
            SessionLog.location, SessionLog.make_up_for_id,
        ).filter(SessionLog.enrollment_id.in_([b.id for b in blocks])).all()
        # Do not discard an inconsistent student FK. The pure assembler checks
        # it and the endpoint refuses a source whose ownership is inconsistent.
        block_students = {b.id: b.student_id for b in blocks}
        for row in rows:
            lessons[block_students[row.enrollment_id]].append(EvidenceLesson(**dict(row._mapping)))
    coupons = {}
    for row in db.query(StudentCoupon.student_id, StudentCoupon.available_coupons,
                        StudentCoupon.coupon_value, StudentCoupon.last_synced_at).filter(
                            StudentCoupon.student_id.in_(student_ids)).all():
        synced = row.last_synced_at
        coupons[row.student_id] = ImportedCouponSnapshot(
            remaining_count=row.available_coupons or 0,
            cached_value=str(row.coupon_value) if row.coupon_value is not None else None,
            synced_at_utc=synced.replace(tzinfo=timezone.utc) if synced and synced.tzinfo is None else synced,
        )
    contexts = {}
    from .coupon_accounting import balances_for_students
    for student_id, balance in balances_for_students(db, student_ids, as_of=as_of).items():
        # The observation is KMS stock. Local commitments and checked groups
        # remain separate, and all of this evidence participates in the hash.
        coupons[student_id] = ImportedCouponSnapshot(
            remaining_count=balance.observation.remaining_count if balance.observation else 0,
            cached_value=None, synced_at_utc=None,
            accounting=balance,
        )
    for row in students:
        own_lessons = lessons[row.id]
        invalid_owner = any(lesson.student_id != row.id for lesson in own_lessons)
        if isolate_invalid and invalid_owner:
            # The queue must retain this student's review task without exposing
            # another student's lessons or hiding every other student's work.
            own_lessons = [lesson for lesson in own_lessons if lesson.student_id == row.id]
        context = build_student_context(
            BillingStudent(**{**dict(row._mapping), 'is_staff_referral': bool(row.is_staff_referral)}),
            by_student[row.id], own_lessons, holidays, as_of=as_of, basis=basis,
            selected_enrollment_ids=selected, coupon_snapshot=coupons.get(row.id), policy=policy,
        )
        if isolate_invalid and invalid_owner:
            context.issues.append(PreviewIssue(code='SOURCE_OWNERSHIP_REVIEW',
                                                message='Check which student owns the lesson records.'))
            context.requires_review = True
            context.suggested_request = None
        contexts[row.id] = context
    from .workflow import workflow_storage_enabled
    if workflow_storage_enabled():
        from .models import BillingAccount, BillingPreference
        from .drafts import digest
        preferences = db.query(BillingPreference, BillingAccount.student_id).join(
            BillingAccount, BillingAccount.id == BillingPreference.account_id,
        ).filter(BillingAccount.student_id.in_(student_ids), BillingAccount.academic_start == policy.academic_start).all()
        for preference, student_id in preferences:
            context = contexts.get(student_id)
            if context is None:
                continue
            context.recorded_payment_method = preference.payment_method
            context.mandate_ready = preference.mandate_ready
            context.source_fingerprint = digest([context.source_fingerprint, preference.version,
                                                 preference.payment_method, preference.mandate_ready])
            if context.suggested_request and preference.payment_method:
                context.suggested_request = context.suggested_request.model_copy(update={
                    'payment_method': preference.payment_method, 'mandate_ready': preference.mandate_ready,
                })
    return contexts
