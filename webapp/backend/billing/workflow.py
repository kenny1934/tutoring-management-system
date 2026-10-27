"""Confirm exact reviewed teaching dates and settle their combined payment."""
from datetime import date
import os
from uuid import uuid4

from sqlalchemy.orm import Session

from models import Enrollment, Holiday, SessionLog, Student, StudentCoupon, Tutor
from .drafts import DraftConflict, DraftNotFound, digest, draft_discarded, review_draft, utc
from .messages import MESSAGE_TEMPLATE_VERSION
from .models import (
    BillingAccount, BillingDraft, BillingDraftRevision, BillingLessonClaim,
    BillingOperation, BillingPayment, BillingPaymentLine, BillingPreference, utc_now,
)
from .schemas import (
    BillingDraftReview, BillingDraftReviewRequest, BillingPaymentDetail,
    BillingPaymentHistory, BillingPaymentLineDetail, BillingPreferences,
)
from .calculator import BillingPolicy

POLICY = BillingPolicy()


def workflow_enabled():
    return os.getenv('BILLING_WORKFLOW_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def workflow_storage_enabled():
    # Keep reads and legacy protections after new writes are disabled.
    return workflow_enabled() or os.getenv('BILLING_WORKFLOW_STORAGE_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def preferences_writes_enabled():
    # Preference collection can open before teaching and payment mutations.
    # Its flag never implies that migration188 storage has been installed.
    return workflow_enabled() or (workflow_storage_enabled() and
        os.getenv('BILLING_PREFERENCES_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'})


def lock_account(db, student_id, policy=POLICY):
    if db.query(Student.id).filter(Student.id == student_id).with_for_update().first() is None:
        raise DraftNotFound('Student not found.')
    account = db.query(BillingAccount).filter(
        BillingAccount.student_id == student_id, BillingAccount.academic_start == policy.academic_start,
    ).populate_existing().with_for_update().first()
    if account is None:
        account = BillingAccount(student_id=student_id, academic_start=policy.academic_start,
                                 policy_version=policy.version, active=False)
        db.add(account)
        db.flush()
    return account


def lock_sources(db, student_id, policy=POLICY):
    db.query(Enrollment.id).filter(Enrollment.student_id == student_id).order_by(Enrollment.id).with_for_update().all()
    db.query(SessionLog.id).filter(SessionLog.student_id == student_id).order_by(SessionLog.id).with_for_update().all()
    db.query(Holiday.id).filter(Holiday.holiday_date >= policy.academic_start,
                                Holiday.holiday_date <= policy.regular_end).order_by(Holiday.id).with_for_update(read=True).all()
    db.query(StudentCoupon.id).filter(StudentCoupon.student_id == student_id).with_for_update().all()


def operation_key(kind, target, data, actor):
    return digest({'kind': kind, 'target': target, 'actor': actor.id, 'data': data.model_dump(mode='json')})


def replay_operation(db, account, data, payload_hash):
    row = db.query(BillingOperation).filter(BillingOperation.account_id == account.id,
                                            BillingOperation.idempotency_key == data.idempotency_key).with_for_update().first()
    if row and row.payload_hash != payload_hash:
        raise DraftConflict('This request key was used for another action. Reload before making changes.')
    return row


def save_operation(db, account, data, payload_hash, kind, actor, result, payment=None):
    row = BillingOperation(account_id=account.id, payment_id=payment.id if payment else None,
                           idempotency_key=data.idempotency_key, payload_hash=payload_hash, kind=kind,
                           actor_id=actor.id, actor_name=(actor.tutor_name or str(actor.id))[:100],
                           result=result.model_dump(mode='json'))
    db.add(row)
    db.flush()
    return row


def preference_detail(student_id, row):
    return BillingPreferences(student_id=student_id, payment_method=row.payment_method if row else None,
                              mandate_ready=bool(row and row.mandate_ready), version=row.version if row else 0,
                              updated_at=utc(row.updated_at) if row else None)


def get_preferences(db, student_id, policy=POLICY):
    row = db.query(BillingPreference).join(BillingAccount, BillingAccount.id == BillingPreference.account_id).filter(
        BillingAccount.student_id == student_id, BillingAccount.academic_start == policy.academic_start,
    ).first()
    return preference_detail(student_id, row)


def save_preferences(db, student_id, data, actor, policy=POLICY):
    account = lock_account(db, student_id, policy)
    payload_hash = operation_key('preferences', student_id, data, actor)
    replay = replay_operation(db, account, data, payload_hash)
    if replay:
        return BillingPreferences.model_validate(replay.result)
    row = db.query(BillingPreference).filter_by(account_id=account.id).with_for_update().first()
    if data.expected_version != (row.version if row else 0):
        raise DraftConflict('Payment settings changed. Reload them before saving.')
    if row is None:
        row = BillingPreference(account_id=account.id, version=0)
        db.add(row)
    row.payment_method = data.payment_method
    row.mandate_ready = data.mandate_ready
    row.version += 1
    row.updated_at = utc_now()
    db.flush()
    result = preference_detail(student_id, row)
    save_operation(db, account, data, payload_hash, 'preferences', actor, result)
    return result


def allocate_discount(amount, counts):
    """Allocate whole currency units proportionally, breaking ties by slot."""
    total = sum(counts)
    shares = [amount * count // total for count in counts]
    order = sorted(range(len(counts)), key=lambda i: (-(amount * counts[i] % total), i))
    for i in order[:amount - sum(shares)]:
        shares[i] += 1
    return shares


def time_range(value):
    try:
        left, right = value.split('-')
        def minutes(part):
            hour, minute = map(int, part.strip().split(':'))
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError()
            return hour * 60 + minute
        start, end = minutes(left), minutes(right)
        if start >= end:
            raise ValueError()
        return start, end
    except (ValueError, AttributeError):
        raise ValueError('Use a valid start and end time for each class.') from None


def canonical_time(value):
    start, end = time_range(value)
    return f'{start // 60:02}:{start % 60:02}-{end // 60:02}:{end % 60:02}'


def check_lesson_conflicts(db, student_id, lessons):
    from constants import CONFLICTING_SESSION_STATUSES
    dates = {lesson.date for lesson in lessons}
    existing = db.query(SessionLog).filter(SessionLog.student_id == student_id,
                                          SessionLog.session_date.in_(dates),
                                          SessionLog.session_status.in_(CONFLICTING_SESSION_STATUSES)).all()
    proposed = []
    for lesson in lessons:
        start, end = time_range(lesson.time_slot)
        for row in existing:
            if row.session_date == lesson.date:
                other_start, other_end = time_range(row.time_slot)
                if start < other_end and other_start < end:
                    raise DraftConflict(f'The student already has a lesson at this time on {lesson.date:%Y/%m/%d}.')
        for day, other_start, other_end in proposed:
            if day == lesson.date and start < other_end and other_start < end:
                raise DraftConflict('The two classes overlap. Check their times before creating enrollments.')
        proposed.append((lesson.date, start, end))
    claims = db.query(BillingLessonClaim).filter(BillingLessonClaim.student_id == student_id,
                                                BillingLessonClaim.lesson_date.in_(dates)).all()
    if any((claim.lesson_date, claim.time_slot, claim.location) ==
           (lesson.date, canonical_time(lesson.time_slot), lesson.location.strip())
           for claim in claims for lesson in lessons):
        raise DraftConflict('Some lessons already belong to a confirmed payment. Open that payment instead.')


def payment_rows(db, payment):
    return db.query(BillingPaymentLine, Enrollment, Tutor.tutor_name).join(
        Enrollment, Enrollment.id == BillingPaymentLine.enrollment_id,
    ).join(Tutor, Tutor.id == Enrollment.tutor_id).filter(
        BillingPaymentLine.payment_id == payment.id,
    ).order_by(BillingPaymentLine.slot_index).all()


def payment_integrity(db, payment, review, rows, *, preloaded_claims=None, preloaded_sessions=None):
    """Check financial records without repricing an already confirmed period."""
    issues = []
    claims = preloaded_claims if preloaded_claims is not None else db.query(BillingLessonClaim, SessionLog).join(
        SessionLog, SessionLog.id == BillingLessonClaim.session_id,
    ).filter(BillingLessonClaim.payment_id == payment.id).all()
    expected = {(lesson.slot, lesson.date, canonical_time(lesson.time_slot), lesson.location.strip())
                for lesson in review.period.lessons}
    line_by_enrollment = {line.enrollment_id: line for line, _, _ in rows}
    actual = {(line_by_enrollment[claim.enrollment_id].slot_index, claim.lesson_date, claim.time_slot, claim.location)
              for claim, _ in claims if claim.enrollment_id in line_by_enrollment}
    cancelled = payment.status == 'Cancelled'
    if not cancelled and (expected != actual or len(claims) != len(expected)):
        issues.append('The confirmed session links have changed. Review the enrollments.')
    discounts = allocate_discount(sum(d.amount for d in review.period.deductions), review.period.counts_by_slot)
    expected_slots = [i for i, count in enumerate(review.period.counts_by_slot) if count]
    line_evidence = payment.snapshot.get('line_evidence', {})
    if [line.slot_index for line, _, _ in rows] != expected_slots:
        issues.append('The confirmed classes have changed. Review the enrollments.')
    for line, enrollment, _ in rows:
        if line.slot_index not in expected_slots:
            continue
        slot = review.scenario.slots[line.slot_index]
        lesson_dates = [l.date for l in review.period.lessons if l.slot == line.slot_index]
        count = review.period.counts_by_slot[line.slot_index]
        gross = review.period.gross_tuition * count // review.period.lesson_count
        materials = review.period.materials_fee if line.slot_index == expected_slots[0] else 0
        evidence = line_evidence.get(str(line.enrollment_id), {})
        if (enrollment.student_id != review.student.id or enrollment.enrollment_type != 'Regular'
                or enrollment.lessons_paid != line.lesson_count or enrollment.discount_id is not None
                or enrollment.payment_status != payment.status
                or enrollment.revenue_total != line.tuition_amount
                or enrollment.assigned_day != slot.weekday or enrollment.assigned_time != slot.time_slot
                or enrollment.location != slot.location or enrollment.first_lesson_date != min(lesson_dates)
                or enrollment.tutor_id != evidence.get('tutor_id')
                or ('renewed_from_enrollment_id' in evidence and
                    enrollment.renewed_from_enrollment_id != evidence['renewed_from_enrollment_id'])
                or ('is_new_student' in evidence and
                    bool(enrollment.is_new_student) != evidence['is_new_student'])
                or line.lesson_count != count or line.gross_tuition != gross
                or line.discount_amount != discounts[line.slot_index]
                or line.tuition_amount != gross - discounts[line.slot_index]
                or line.materials_fee != materials
                or (payment.status == 'Paid' and enrollment.payment_date != payment.payment_date)):
            issues.append('An enrollment no longer matches this payment. Review it before continuing.')
    for claim, lesson in claims:
        # A missed or rescheduled original still belongs to the paid period.
        # Its replacement remains linked through the existing makeup chain.
        if (lesson.enrollment_id != claim.enrollment_id or lesson.student_id != review.student.id
                or lesson.make_up_for_id is not None or lesson.session_status == 'Cancelled'
                or lesson.session_date != claim.lesson_date or canonical_time(lesson.time_slot) != claim.time_slot
                or (lesson.location or '').strip() != claim.location):
            issues.append('A confirmed lesson was removed or reassigned. Review its enrollment.')
    sessions = (preloaded_sessions if preloaded_sessions is not None else
                db.query(SessionLog).filter(SessionLog.enrollment_id.in_(line_by_enrollment)).all() if rows else [])
    if not cancelled and {s.id for s in sessions if s.make_up_for_id is None} != {claim.session_id for claim, _ in claims}:
        issues.append('The enrollment contains a different set of original lessons. Review its sessions.')
    expected_financial = 'Paid' if payment.status == 'Paid' else 'Unpaid'
    if any(s.financial_status != expected_financial for s in sessions if s.session_status != 'Cancelled'):
        issues.append('The session payment statuses do not match the combined payment.')
    if sum(line.tuition_amount + line.materials_fee for line, _, _ in rows) != review.period.total_fee:
        issues.append('The linked enrollment fees do not match the combined total.')
    return list(dict.fromkeys(issues))


def payment_detail(db, payment, *, include_pending_event=None):
    try:
        review = BillingDraftReview.model_validate(payment.snapshot['review'])
    except (ValueError, TypeError, KeyError):
        raise DraftConflict('The saved payment needs review before it can be opened.') from None
    account = db.query(BillingAccount).filter_by(id=payment.account_id).first()
    if account is None or review.student.id != account.student_id:
        raise DraftConflict('The saved payment needs review before it can be opened.')
    owner = account.student_id
    rows = payment_rows(db, payment)
    if any(enrollment.student_id != owner for _, enrollment, _ in rows):
        raise DraftConflict('The saved payment needs review before it can be opened.')
    try:
        issues = payment_integrity(db, payment, review, rows)
    except (ValueError, TypeError, KeyError, IndexError, AttributeError, ZeroDivisionError):
        raise DraftConflict('The saved payment needs review before it can be opened.') from None
    message_issues = list(issues)
    if payment.status == 'Paid':
        message_issues.append('This payment has already been recorded.')
    if payment.status == 'Cancelled':
        message_issues.append('These enrollments were cancelled.')
    if review.message.template_version != MESSAGE_TEMPLATE_VERSION:
        message_issues.append('The fee message template has changed. Review the confirmed message before sending.')
    if message_issues:
        review = review.model_copy(update={'message': review.message.model_copy(update={
            'zh': None, 'en': None, 'blocked_reasons': message_issues,
        })})
    events = db.query(BillingOperation).filter(BillingOperation.payment_id == payment.id).order_by(
        BillingOperation.id).all()
    history = [BillingPaymentHistory(kind=row.kind, actor_name=row.actor_name, created_at=utc(row.created_at)) for row in events]
    if include_pending_event:
        history.append(BillingPaymentHistory(**include_pending_event))
    from .bank_runs import claimed_payments
    batch_issue = ('Open this earlier-year payment for review.' if account.academic_start != POLICY.academic_start else
                   'This payment account is inactive. Review it first.' if not account.active else
                   'Open this payment in the Autopay list.' if claimed_payments(db, [payment.id]) else None)
    return BillingPaymentDetail(
        id=payment.id, student_id=review.student.id, version=payment.version, status=payment.status,
        review=review, lines=[BillingPaymentLineDetail(
            enrollment_id=line.enrollment_id, slot_index=line.slot_index, tutor_id=enrollment.tutor_id,
            tutor_name=name, lesson_count=line.lesson_count, gross_tuition=line.gross_tuition,
            discount_amount=line.discount_amount, tuition_amount=line.tuition_amount, materials_fee=line.materials_fee,
        ) for line, enrollment, name in rows], created_at=utc(payment.created_at),
        sent_at=utc(payment.sent_at) if payment.sent_at else None, sent_language=payment.sent_language,
        paid_at=utc(payment.paid_at) if payment.paid_at else None, payment_date=payment.payment_date,
        received_method=payment.received_method, receipt_reference=payment.receipt_reference, note=payment.note,
        coupon_status=payment.coupon_status, can_copy=not message_issues and not review.message.blocked_reasons,
        review_issues=issues, batch_action_issue=batch_issue, history=history,
    )


def finish_payment_operation(db, account, payment, data, payload_hash, kind, actor):
    result = payment_detail(db, payment, include_pending_event={
        'kind': kind, 'actor_name': (actor.tutor_name or str(actor.id))[:100], 'created_at': utc_now(),
    })
    save_operation(db, account, data, payload_hash, kind, actor, result, payment)
    return result


def confirm_draft(db, student_id, draft_id, data, actor, *, as_of, policy=POLICY):
    account = lock_account(db, student_id, policy)
    payload_hash = operation_key('confirm', draft_id, data, actor)
    replay = replay_operation(db, account, data, payload_hash)
    if replay:
        return BillingPaymentDetail.model_validate(replay.result)
    draft = db.query(BillingDraft).filter_by(id=draft_id, account_id=account.id).with_for_update().first()
    if draft is None:
        raise DraftNotFound('Draft not found.')
    if db.query(BillingPayment.id).filter_by(draft_id=draft_id).with_for_update().first():
        raise DraftConflict('This draft already has confirmed enrollments. Open its payment.')
    if draft.current_revision != data.expected_revision:
        raise DraftConflict('A newer draft revision exists. Review it before creating enrollments.')
    row = db.query(BillingDraftRevision).filter_by(draft_id=draft.id, revision=draft.current_revision).with_for_update().one()
    if draft_discarded(row):
        raise DraftConflict('This draft was discarded. Prepare a new draft to continue.')
    preference = db.query(BillingPreference).filter_by(account_id=account.id).with_for_update().first()
    if preference is None or preference.version != data.expected_preference_version or preference.payment_method is None:
        raise DraftConflict('Save the parent’s current payment preference before confirming enrollments.')
    lock_sources(db, student_id, policy)
    request = BillingDraftReviewRequest.model_validate(row.snapshot['request'])
    if request.intake:
        db.query(Tutor.id).filter(Tutor.id.in_([s.tutor_id for s in request.intake.slots])).order_by(
            Tutor.id).with_for_update(read=True).all()
    # Source fingerprints include the review day. Stable evidence and the
    # complete review hash decide whether a saved draft can be confirmed later.
    review = review_draft(db, student_id, request, as_of=as_of, admin=True, check_fingerprint=False, policy=policy)
    if review.review_hash != data.expected_review_hash or row.review_hash != data.expected_review_hash:
        raise DraftConflict('The draft calculation or student records changed. Review and save a new revision.')
    if review.message.blocked_reasons:
        raise ValueError('Resolve the review checks before creating enrollments: ' + ' '.join(review.message.blocked_reasons))
    if review.scenario.payment_method != preference.payment_method:
        raise DraftConflict('This draft differs from the saved payment preference. Review it with the agreed method.')
    if review.period.collection.method == 'autopay' and not preference.mandate_ready:
        raise DraftConflict('Record bank authorisation as ready before confirming an autopay payment.')
    if review.period.total_fee is None or review.period.total_fee <= 0:
        raise ValueError('Confirm a positive total fee before creating enrollments.')
    if review.period.first_lesson_date < as_of and 'UNPAID_PAST_DATES' not in request.confirmed_checks:
        raise ValueError('Confirm the past session dates before creating this enrollment.')
    check_lesson_conflicts(db, student_id, review.period.lessons)
    intake_context = None
    if request.intake:
        from .intake import intake_source
        intake_context, _ = intake_source(
            db, student_id, as_of=as_of, trial_enrollment_id=request.intake.trial_enrollment_id,
            trial_session_id=request.intake.trial_session_id, policy=policy,
        )
    else:
        sources = db.query(Enrollment).filter(Enrollment.id.in_(request.selected_enrollment_ids)).all()
        by_slot = {(e.assigned_day[:3], e.assigned_time.strip(), e.location.strip()): e for e in sources}
    counts = review.period.counts_by_slot
    discount = sum(d.amount for d in review.period.deductions)
    shares = allocate_discount(discount, counts)
    coupon = next((d for d in review.period.deductions if d.kind != 'trial'), None)
    from . import coupon_accounting
    if coupon and not coupon_accounting.storage_enabled():
        reserved = db.query(BillingPayment.id).join(BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
            BillingAccount.student_id == student_id,
            BillingPayment.coupon_status.in_(['reserved', 'awaiting_receipt']),
        ).count()
        if reserved >= (request.scenario.coupon.available_count or 0):
            raise DraftConflict('The available coupon is already reserved for another payment. Check its KMS receipt first.')
    payment = BillingPayment(
        id=str(uuid4()), account_id=account.id, draft_id=draft.id, draft_revision=row.revision,
        version=1, status='Pending Payment', snapshot=row.snapshot, created_by=actor.id,
        coupon_value=coupon.amount if coupon else 0, coupon_status='reserved' if coupon else 'none',
    )
    db.add(payment)
    db.flush()
    if coupon:
        coupon_accounting.reserve_payment(db, student_id, payment, request.scenario.coupon, as_of=as_of)
    first_line = True
    line_evidence = {}
    for index, slot in enumerate(review.scenario.slots):
        lessons = [lesson for lesson in review.period.lessons if lesson.slot == index]
        if not lessons:
            continue
        if request.intake:
            intake_slot = request.intake.slots[index]
            tutor_id = intake_slot.tutor_id
            previous_id = request.intake.trial_enrollment_id or intake_slot.renewed_from_enrollment_id
            is_new_student = bool(first_line and intake_context.is_new_student)
        else:
            source = by_slot[(slot.weekday, slot.time_slot.strip(), slot.location.strip())]
            tutor_id, previous_id, is_new_student = source.tutor_id, source.id, False
        tuition = len(lessons) * policy.unit_fee - shares[index]
        materials = review.period.materials_fee if first_line else 0
        first_line = False
        enrollment = Enrollment(
            student_id=student_id, tutor_id=tutor_id, assigned_day=slot.weekday,
            assigned_time=slot.time_slot, location=slot.location, first_lesson_date=min(l.date for l in lessons),
            lessons_paid=len(lessons), enrollment_type='Regular', payment_status='Pending Payment',
            payment_deadline=review.period.collection.debit_to or review.period.collection.due_before_lesson,
            discount_id=None, is_new_student=is_new_student, fee_message_sent=False, revenue_total=tuition,
            renewed_from_enrollment_id=previous_id, last_modified_by=actor.user_email,
        )
        db.add(enrollment)
        db.flush()
        line_evidence[str(enrollment.id)] = {'tutor_id': tutor_id,
            'renewed_from_enrollment_id': previous_id, 'is_new_student': is_new_student}
        db.add(BillingPaymentLine(payment_id=payment.id, enrollment_id=enrollment.id, slot_index=index,
                                  lesson_count=len(lessons), gross_tuition=len(lessons) * policy.unit_fee,
                                  discount_amount=shares[index], tuition_amount=tuition, materials_fee=materials))
        for lesson in lessons:
            session = SessionLog(enrollment_id=enrollment.id, student_id=student_id, tutor_id=tutor_id,
                                 session_date=lesson.date, time_slot=lesson.time_slot, location=lesson.location,
                                 session_status='Scheduled', financial_status='Unpaid', last_modified_by=actor.user_email)
            db.add(session)
            db.flush()
            db.add(BillingLessonClaim(student_id=student_id, payment_id=payment.id,
                                      enrollment_id=enrollment.id, session_id=session.id, lesson_date=lesson.date,
                                      time_slot=canonical_time(lesson.time_slot), location=lesson.location.strip()))
    payment.snapshot = {**row.snapshot, 'line_evidence': line_evidence}
    account.active = True
    db.flush()
    db.info.pop('billing_legacy_lines', None)
    db.info.pop('billing_legacy_metadata', None)
    from services.unlisted_lessons import fill_unlisted_lessons
    fill_unlisted_lessons(db, [student_id], actor.user_email)
    return finish_payment_operation(db, account, payment, data, payload_hash, 'confirmed', actor)


def mutate_payment(db, student_id, payment_id, data, actor, *, kind, as_of, policy=POLICY, manual_only=False):
    if kind in {'receipt', 'sent'} or manual_only:
        # Use the owning account for an existing payment. Receipt follow-up
        # survives rollover; guarded batch actions explain earlier-year holds.
        db.query(Student.id).filter_by(id=student_id).with_for_update().first()
        account = db.query(BillingAccount).join(BillingPayment,
            BillingPayment.account_id == BillingAccount.id).filter(
            BillingPayment.id == payment_id, BillingAccount.student_id == student_id,
        ).populate_existing().with_for_update().first()
        if account is None:
            raise DraftNotFound('Payment not found.')
    else:
        account = lock_account(db, student_id, policy)
    payload_hash = operation_key('manual_paid' if manual_only else kind, payment_id, data, actor)
    replay = replay_operation(db, account, data, payload_hash)
    if replay:
        return BillingPaymentDetail.model_validate(replay.result)
    payment = db.query(BillingPayment).filter_by(id=payment_id, account_id=account.id).populate_existing().with_for_update().first()
    if payment is None:
        raise DraftNotFound('Payment not found.')
    if payment.version != data.expected_version:
        raise DraftConflict('This payment has changed. Reload it before continuing.')
    lock_sources(db, student_id, policy)
    detail = payment_detail(db, payment)
    if detail.review_issues:
        raise DraftConflict(' '.join(detail.review_issues))
    if (manual_only or kind == 'sent') and detail.batch_action_issue:
        raise DraftConflict(detail.batch_action_issue)
    if manual_only and (detail.review.period.collection.method != 'manual'
                        or data.method not in {'cash', 'bank_transfer'}):
        raise ValueError('Record this collection through the Autopay list.')
    rows = payment_rows(db, payment)
    if kind == 'sent':
        if not detail.can_copy:
            raise DraftConflict('This fee message is not ready to send. Review the payment first.')
        from .clock import event_time
        payment.sent_at, payment.sent_language = event_time(), data.language
        for _, enrollment, _ in rows:
            enrollment.fee_message_sent = True
    elif kind == 'paid':
        if payment.status != 'Pending Payment':
            raise DraftConflict('Only an unpaid payment can be recorded. Reload this payment.')
        if data.amount != detail.review.period.total_fee:
            raise ValueError('Enter the full confirmed fee. Partial payments need a separate review.')
        if data.payment_date > as_of:
            raise ValueError('The payment date cannot be in the future.')
        actual_autopay = detail.review.period.collection.method == 'autopay'
        if (data.method == 'autopay') != actual_autopay:
            raise ValueError('Use the collection method confirmed for this payment.')
        payment.status, payment.paid_at = 'Paid', utc_now()
        payment.payment_date, payment.received_amount, payment.received_method = data.payment_date, data.amount, data.method
        payment.receipt_reference = (data.receipt_reference or '').strip() or None
        payment.note = (data.note or '').strip() or None
        if payment.coupon_value:
            payment.coupon_status = 'recorded_in_kms' if payment.receipt_reference else 'awaiting_receipt'
        for _, enrollment, _ in rows:
            enrollment.payment_status, enrollment.payment_date = 'Paid', data.payment_date
            enrollment.last_modified_by = actor.user_email
        ids = [line.enrollment_id for line, _, _ in rows]
        for session in db.query(SessionLog).filter(SessionLog.enrollment_id.in_(ids)).all():
            if session.financial_status == 'Unpaid':
                session.financial_status = 'Paid'
                session.last_modified_by = actor.user_email
    elif kind == 'receipt':
        if payment.status != 'Paid':
            raise ValueError('Record the payment before recording its KMS receipt.')
        if not data.receipt_reference.strip():
            raise ValueError('Enter the KMS receipt reference.')
        if (payment.receipt_reference or '').strip():
            raise DraftConflict('A KMS receipt is already recorded for this payment.')
        payment.receipt_reference = data.receipt_reference.strip()
        if payment.coupon_value:
            payment.coupon_status = 'recorded_in_kms'
    elif kind == 'cancelled':
        if payment.status != 'Pending Payment':
            raise DraftConflict('Only an unpaid payment can be cancelled.')
        if not data.reason.strip():
            raise ValueError('Explain why these enrollments are being cancelled.')
        ids = [line.enrollment_id for line, _, _ in rows]
        sessions = db.query(SessionLog).filter(SessionLog.enrollment_id.in_(ids)).all()
        if any(s.session_status != 'Scheduled' or s.make_up_for_id is not None for s in sessions):
            raise DraftConflict('These enrollments contain attendance or makeup records. Review them before making changes.')
        for _, enrollment, _ in rows:
            enrollment.payment_status = 'Cancelled'
            enrollment.last_modified_by = actor.user_email
        for session in sessions:
            session.previous_session_status = session.session_status
            session.session_status = 'Cancelled'
            session.last_modified_by = actor.user_email
        # The immutable payment snapshot and cancelled sessions retain the
        # original dates. Release only these active claims for a replacement.
        db.query(BillingLessonClaim).filter(BillingLessonClaim.payment_id == payment.id).delete(synchronize_session=False)
        payment.status, payment.coupon_status = 'Cancelled', 'none'
        payment.note = data.reason.strip()
    else:
        raise ValueError('Unknown payment action.')
    from . import coupon_accounting
    if coupon_accounting.storage_enabled():
        reference = (getattr(data, 'receipt_reference', None) or '').strip()
        if kind in {'paid', 'receipt'} and reference:
            duplicate = db.query(BillingPayment.id).join(BillingAccount,
                BillingAccount.id == BillingPayment.account_id).filter(
                BillingAccount.student_id == student_id, BillingPayment.id != payment.id,
                BillingPayment.receipt_reference == reference).first()
            if duplicate and getattr(data, 'acknowledge_duplicate_receipt', None) is not True:
                raise DraftConflict('This student already has this receipt number. Check KMS and acknowledge the duplicate before continuing.')
        coupon_accounting.payment_changed(db, student_id, payment, data, kind=kind, as_of=as_of)
    payment.version += 1
    db.flush()
    db.info.pop('billing_legacy_lines', None)
    db.info.pop('billing_legacy_metadata', None)
    return finish_payment_operation(db, account, payment, data, payload_hash, kind, actor)
