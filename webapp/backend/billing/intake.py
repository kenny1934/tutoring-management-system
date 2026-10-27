"""Verified first-enrollment sources without creating teaching records."""
from datetime import timedelta

from sqlalchemy import or_

from models import Enrollment, SessionLog, Student, StudentCoupon, Tutor
from constants import REGISTRATION_FEE
from .calculator import BillingPolicy, DAYS
from .schemas import (
    BillingIntakeContext, BillingIntakeTrial, BillingPreviewRequest, BillingStudent,
    ImportedCouponSnapshot, PreviewIssue, PreviewSlot,
)


def intake_source(db, student_id, *, as_of, trial_enrollment_id=None, trial_session_id=None,
                  policy=BillingPolicy()):
    """Read all the student's history so an intake cannot hide an existing course."""
    from .drafts import DraftNotFound, digest, utc
    from .workflow import workflow_storage_enabled

    if (trial_enrollment_id is None) != (trial_session_id is None):
        raise ValueError('Choose both the trial enrollment and its attended session.')
    student = db.query(Student.id, Student.student_name, Student.school_student_id,
                       Student.home_location, Student.grade, Student.is_staff_referral,
                       Student.lang_stream, Student.school).filter(Student.id == student_id).first()
    if student is None:
        raise DraftNotFound('Student not found.')
    identity = BillingStudent(**{**dict(student._mapping), 'is_staff_referral': bool(student.is_staff_referral)})
    enrollments = db.query(Enrollment).filter(Enrollment.student_id == student_id).order_by(Enrollment.id).all()
    by_id = {e.id: e for e in enrollments}
    lessons = db.query(SessionLog).filter(or_(SessionLog.student_id == student_id,
        SessionLog.enrollment_id.in_(by_id))).order_by(SessionLog.id).all()
    issues = []

    def issue(code, message):
        issues.append(PreviewIssue(code=code, message=message))

    if any(s.student_id != student_id or (s.enrollment_id is not None and s.enrollment_id not in by_id)
           for s in lessons):
        issue('INTAKE_SOURCE_OWNERSHIP', 'Check which student owns the enrollment and session records before preparing this intake.')

    # A cancelled-only record is not proof of an ongoing course. It still
    # remains in the historical newness/materials decision, matching creation.
    is_new = not any(e.enrollment_type != 'Trial' for e in enrollments)
    current_ids = {e.id for e in enrollments if e.enrollment_type == 'Regular' and
                   e.payment_status != 'Cancelled' and
                   ((e.first_lesson_date and policy.academic_start <= e.first_lesson_date <= policy.regular_end)
                    or any(s.enrollment_id == e.id and s.make_up_for_id is None and
                           policy.academic_start <= s.session_date <= policy.regular_end
                           for s in lessons))}
    if current_ids:
        issue('INTAKE_EXISTING_COURSE', 'This student already has a regular enrollment this teaching year. Open Enrollment renewals to continue it.')
    trial = None
    if trial_enrollment_id is not None:
        enrollment = by_id.get(trial_enrollment_id)
        lesson = db.query(SessionLog).filter(SessionLog.id == trial_session_id).first()
        if (enrollment is None or enrollment.enrollment_type != 'Trial' or lesson is None
                or lesson.student_id != student_id or lesson.enrollment_id != enrollment.id):
            raise DraftNotFound('This trial session does not belong to the student’s trial enrollment.')
        tutor = db.query(Tutor).filter(Tutor.id == lesson.tutor_id).first()
        if tutor is None:
            raise DraftNotFound('The trial tutor is unavailable.')
        trial = BillingIntakeTrial(
            enrollment_id=enrollment.id, session_id=lesson.id, session_date=lesson.session_date,
            time_slot=lesson.time_slot or enrollment.assigned_time or '',
            location=lesson.location or enrollment.location or '', tutor_id=lesson.tutor_id,
            tutor_name=tutor.tutor_name, session_status=lesson.session_status,
        )
        if enrollment.payment_status == 'Cancelled' or lesson.session_status not in {'Attended', 'Attended (Make-up)'}:
            issue('INTAKE_TRIAL_NOT_ATTENDED', 'Choose the attended trial session before converting this student.')
        if any(e.enrollment_type == 'Regular' and e.payment_status != 'Cancelled' and
               (e.renewed_from_enrollment_id == enrollment.id or
                (e.first_lesson_date and e.first_lesson_date > lesson.session_date)) for e in enrollments):
            issue('INTAKE_TRIAL_CONVERTED', 'This trial already has a regular enrollment. Open that enrollment instead.')
    coupon = db.query(StudentCoupon).filter(StudentCoupon.student_id == student_id).first()
    coupon_snapshot = ImportedCouponSnapshot(
        remaining_count=coupon.available_coupons or 0,
        cached_value=str(coupon.coupon_value) if coupon.coupon_value is not None else None,
        synced_at_utc=utc(coupon.last_synced_at) if coupon.last_synced_at else None,
    ) if coupon else None
    from .coupon_accounting import balances_for_students
    balance = balances_for_students(db, [student_id], as_of=as_of).get(student_id)
    if balance is not None:
        coupon_snapshot = ImportedCouponSnapshot(
            remaining_count=balance.observation.remaining_count if balance.observation else 0,
            cached_value=None, synced_at_utc=None,
            accounting=balance,
        )
    method, mandate, preference_version = None, None, 0
    if workflow_storage_enabled():
        from .workflow import get_preferences
        preference = get_preferences(db, student_id, policy)
        method, mandate, preference_version = preference.payment_method, preference.mandate_ready, preference.version
    materials = REGISTRATION_FEE if is_new else 0
    basis = ('First regular enrollment: the standard materials fee applies.' if is_new
             else 'The student has an earlier enrollment. No new-student materials fee is added.')
    suggested = None
    if trial:
        # Staff must verify this proposed date. It never jumps forward to the
        # policy cutoff and therefore preserves the old path for earlier joins.
        first = trial.session_date + timedelta(days=7)
        suggested = BillingPreviewRequest(
            first_lesson_date=first, slots=[PreviewSlot(weekday=DAYS[first.weekday()],
                                                      time_slot=trial.time_slot, location=trial.location)],
            mode='new_student', payment_method=method or 'manual', materials_fee=materials,
            trial_deduction=not issues, mandate_ready=bool(mandate),
        )
    evidence = {
        'student': identity.model_dump(mode='json'),
        'enrollments': [{name: getattr(e, name) for name in (
            'id', 'tutor_id', 'enrollment_type', 'first_lesson_date', 'assigned_day', 'assigned_time',
            'location', 'lessons_paid', 'payment_status', 'payment_date', 'is_new_student',
            'renewed_from_enrollment_id', 'discount_id', 'revenue_total', 'regular_application_id', 'promo_code',
        )} for e in enrollments],
        'lessons': [{name: getattr(s, name) for name in (
            'id', 'enrollment_id', 'student_id', 'tutor_id', 'session_date', 'time_slot', 'location',
            'session_status', 'financial_status', 'make_up_for_id', 'rescheduled_to_id',
        )} for s in lessons],
        'trial': trial.model_dump(mode='json') if trial else None,
        'coupon': coupon_snapshot.model_dump(mode='json') if coupon_snapshot else None,
        'materials_fee': materials, 'is_new_student': is_new,
        'preference': [method, mandate, preference_version], 'policy': vars(policy),
    }
    stable_hash = digest(evidence)
    context = BillingIntakeContext(
        student=identity, source_fingerprint=digest([stable_hash, as_of]), trial=trial,
        is_new_student=is_new, materials_fee=materials, materials_basis=basis, issues=issues,
        coupon_snapshot=coupon_snapshot, recorded_payment_method=method, mandate_ready=mandate,
        suggested_request=suggested,
    )
    return context, stable_hash


def review_intake_source(db, student_id, data, *, as_of, admin, policy=BillingPolicy()):
    """Validate chosen tutors and prior links in addition to the source itself."""
    from .drafts import digest
    from .workflow import time_range
    source = data.intake
    context, stable_hash = intake_source(
        db, student_id, as_of=as_of, trial_enrollment_id=source.trial_enrollment_id,
        trial_session_id=source.trial_session_id, policy=policy,
    )
    issues = list(context.issues)

    def issue(code, message):
        issues.append(PreviewIssue(code=code, message=message))

    tutors = db.query(Tutor.id, Tutor.tutor_name).filter(Tutor.id.in_([s.tutor_id for s in source.slots])).order_by(Tutor.id).all()
    tutor_ids = {t.id for t in tutors}
    if any(slot.tutor_id not in tutor_ids for slot in source.slots):
        issue('INTAKE_TUTOR_UNAVAILABLE', 'Choose an existing tutor for every weekly class.')
    if len({s.location.strip() for s in data.scenario.slots}) != 1:
        issue('INTAKE_BRANCH_REVIEW', 'Both weekly classes must use the same teaching branch.')
    from .messages import _BANK_ACCOUNTS
    for slot in data.scenario.slots:
        try:
            time_range(slot.time_slot)
        except ValueError as error:
            issue('INTAKE_TIME_REVIEW', str(error))
        if slot.location.strip() not in _BANK_ACCOUNTS:
            issue('INTAKE_BRANCH_REVIEW', 'Choose a configured teaching branch for every class.')
    if context.trial and data.scenario.first_lesson_date <= context.trial.session_date:
        issue('INTAKE_START_BEFORE_TRIAL', 'The first regular lesson must be after the attended trial.')
    if data.scenario.trial_deduction and not context.trial:
        issue('INTAKE_TRIAL_REQUIRED', 'Choose the attended trial before applying its $150 deduction.')
    if data.scenario.first_lesson_date < as_of and 'UNPAID_PAST_DATES' not in data.confirmed_checks:
        issue('UNPAID_PAST_DATES', 'The first payment includes past sessions. Check attendance before collecting fees.')
    if data.scenario.materials_fee != context.materials_fee:
        if not source.materials_override_reason:
            issue('INTAKE_MATERIALS_REASON', 'Explain the materials fee change before preparing this enrollment.')
        if not admin:
            issue('INTAKE_MATERIALS_ADMIN', 'Ask an admin to approve a materials fee change.')
    links = []
    for slot in source.slots:
        link_id = slot.renewed_from_enrollment_id
        if context.trial:
            if link_id not in {None, context.trial.enrollment_id}:
                issue('INTAKE_SOURCE_LINK_MISMATCH', 'The conversion must stay linked to its actual trial enrollment.')
            continue
        if link_id is not None:
            previous = db.query(Enrollment).filter(Enrollment.id == link_id).first()
            if previous is None or previous.student_id != student_id:
                issue('INTAKE_SOURCE_LINK_MISMATCH', 'The previous enrollment must belong to this student.')
            elif previous.enrollment_type == 'Trial':
                issue('INTAKE_TRIAL_REQUIRED', 'Choose the attended trial session when linking a trial enrollment.')
            elif previous.payment_status == 'Cancelled':
                issue('INTAKE_SOURCE_LINK_MISMATCH', 'A cancelled enrollment cannot be the previous course for this intake.')
            else:
                links.append([previous.id, previous.tutor_id, previous.payment_status])
                dates = [row[0] for row in db.query(SessionLog.session_date).filter(
                    SessionLog.enrollment_id == previous.id, SessionLog.make_up_for_id.is_(None),
                    SessionLog.session_status != 'Cancelled',
                ).all()]
                last_covered = max(dates, default=previous.first_lesson_date)
                if last_covered and last_covered >= data.scenario.first_lesson_date:
                    issue('INTAKE_PREVIOUS_COVERAGE', 'The first lesson must follow the previous enrollment’s covered lessons.')
    evidence_hash = digest([stable_hash, [list(t) for t in tutors], links])
    return context, evidence_hash, issues
