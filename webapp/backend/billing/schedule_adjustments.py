"""Review permanent timetable changes without losing prepaid entitlements.

Supplementary collections are stored alongside their owning payment's snapshot.
They have independent session membership, amounts and receipt evidence; the
original paid quote, payment date and receipt are never rewritten.
"""
from copy import deepcopy
from datetime import date, timedelta
from uuid import uuid4

from fastapi import HTTPException

from models import Enrollment, Holiday, SessionLog, Tutor
from .calculator import BillingPolicy
from .drafts import digest
from .models import BillingLessonClaim, BillingPayment, BillingPaymentLine, utc_now
from .schemas import BillingDraftReview


def supplements(payment, enrollment_id=None):
    return [item for item in payment.snapshot.get('supplementary_payments', [])
            if enrollment_id is None or item['enrollment_id'] == enrollment_id]


def extra_lessons(payment, enrollment_id=None):
    return [lesson for item in supplements(payment, enrollment_id) for lesson in item['lessons']]


def enrollment_status(payment, enrollment_id):
    return ('Partially Paid' if payment.status == 'Paid' and any(
        item['status'] != 'Paid' for item in supplements(payment, enrollment_id)) else payment.status)


def supplement_for_root(payment, session, by_id):
    seen = set()
    while session.make_up_for_id and session.id not in seen:
        seen.add(session.id)
        session = by_id.get(session.make_up_for_id)
        if session is None:
            return None
    return next((item for item in supplements(payment)
                 if any(lesson['session_id'] == session.id for lesson in item['lessons'])), None)


def _link(db, enrollment_id):
    return db.query(BillingPaymentLine, BillingPayment).join(
        BillingPayment, BillingPayment.id == BillingPaymentLine.payment_id).filter(
        BillingPaymentLine.enrollment_id == enrollment_id).first()


def period_start(review, slot_index):
    """A continuing calendar period can begin before its first old weekday.

    Previous retained coverage still owns its dates. A joining or returning
    student's first payment keeps its actual agreed start.
    """
    if review.period.number == 1 and review.scenario.mode in {'new_student', 'returning_student'}:
        return review.period.coverage_from
    start = review.period.coverage_from.replace(day=1)
    retained = review.scenario.slots[slot_index].covered_through
    return max(start, retained + timedelta(days=1)) if retained else start


def preview(db, enrollment, change, *, as_of, locked=False):
    """Return a read-only proposal. A fresh proposal is required when applying."""
    from .workflow import canonical_time, payment_integrity, payment_rows, time_range
    from constants import CONFLICTING_SESSION_STATUSES
    link = _link(db, enrollment.id)
    if not link:
        return None
    line, payment = link
    review = BillingDraftReview.model_validate(payment.snapshot['review'])
    if review.period.kind == 'legacy':
        # Old six-session blocks retain their existing editor.
        return None
    if change.effective_date is None and not getattr(change, 'review_period', False):
        return None
    start, through = period_start(review, line.slot_index), review.period.coverage_through
    effective = change.effective_date or max(as_of, start)
    if not max(as_of, start) <= effective <= through:
        raise HTTPException(422, 'Choose an effective date within the remaining billing period.')
    if (enrollment.assigned_day or '')[:3] == change.assigned_day[:3]:
        return None
    tutor = db.get(Tutor, change.tutor_id)
    if tutor is None:
        raise HTTPException(422, 'Choose an existing tutor.')
    issues = payment_integrity(db, payment, review, payment_rows(db, payment))
    if payment.status not in {'Paid', 'Pending Payment'}:
        issues.append('This payment cannot have its session count changed.')
    from .bank_runs import claimed_payments
    if payment.status == 'Pending Payment' and claimed_payments(db, [payment.id]):
        issues.append('Review this payment in its Autopay run before changing the enrollment.')
    query = db.query(SessionLog).filter_by(student_id=enrollment.student_id).order_by(SessionLog.id)
    all_sessions = (query.populate_existing().with_for_update() if locked else query).all()
    own = [row for row in all_sessions if row.enrollment_id == enrollment.id]
    surplus_ids = {session_id for entry in payment.snapshot.get('period_schedule_changes', [])
                   for session_id in entry['pending_session_ids']}
    movable = sorted([row for row in own if row.make_up_for_id is None
                      and (row.session_status == 'Scheduled' or
                           (row.id in surplus_ids and row.session_status == 'Rescheduled - Pending Make-up')) and row.session_date >= effective
                      and effective <= row.session_date <= through
                      and row.rescheduled_to_id is None
                      and not any(other.make_up_for_id == row.id for other in own)],
                     key=lambda row: (row.session_date, row.id))
    # Completed lessons, missed originals and existing makeup chains remain
    # sold entitlements. They cannot become additional weekly charges.
    protected = [row for row in own if row.make_up_for_id is None and row not in movable]
    if any(effective <= row.session_date <= through and row.session_status != 'Scheduled' for row in protected):
        issues.append('Existing attendance or make-up arrangements in the affected dates need review before changing the weekly session count.')
    holiday_query = db.query(Holiday.holiday_date).filter(Holiday.holiday_date >= effective, Holiday.holiday_date <= through)
    holidays = {day for day, in (holiday_query.with_for_update(read=True) if locked else holiday_query).all()}
    weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    if change.assigned_day[:3] not in weekdays:
        raise HTTPException(422, 'Choose a valid weekday.')
    slot = review.scenario.slots[line.slot_index]
    excluded = {item.date for item in slot.skipped_lessons}
    openings = set(slot.holiday_exceptions)
    target_dates = []
    day = effective + timedelta(days=(weekdays.index(change.assigned_day[:3]) - effective.weekday()) % 7)
    while day <= through:
        if day not in excluded and (day not in holidays or day in openings):
            # An existing protected original already accounts for its date.
            if not any(row.session_date == day and canonical_time(row.time_slot) == canonical_time(change.assigned_time)
                       and row.location == change.location for row in protected):
                target_dates.append(day)
        day += timedelta(days=7)
    moves = [{'session_id': row.id, 'from_date': row.session_date.isoformat(), 'date': day.isoformat()}
             for row, day in zip(movable, target_dates)]
    pending = [row.id for row in movable[len(target_dates):]]
    added = [day.isoformat() for day in target_dates[len(movable):]]
    deadline = BillingPolicy().makeup_end
    if pending and (as_of > deadline or any(row.id in pending and row.session_date > deadline for row in movable)):
        issues.append('Arrange alternative dates for the remaining sessions before changing this enrollment, because they cannot enter the existing make-up deadline.')
    # A paid addition uses the existing agreed gross rate. Previously redeemed
    # deductions stay on the original payment and are never used twice.
    unit, remainder = divmod(review.period.gross_tuition, review.period.lesson_count)
    if remainder or unit <= 0:
        issues.append('Review the agreed per-session fee before changing this enrollment.')
    positions = [(move['date'], change.assigned_time) for move in moves] + [(day, change.assigned_time) for day in added]
    excluded_ids = {row.id for row in movable}
    for day, time in positions:
        begin, end = time_range(time)
        if any(other.id not in excluded_ids and other.session_date.isoformat() == day
               and other.session_status in CONFLICTING_SESSION_STATUSES
               and begin < time_range(other.time_slot)[1] and time_range(other.time_slot)[0] < end
               for other in all_sessions):
            issues.append(f'The student already has a lesson at this time on {day}.')
    # Claims protect originals even when they are pending makeup or absent.
    claim_query = db.query(BillingLessonClaim).filter_by(student_id=enrollment.student_id)
    for claim in (claim_query.populate_existing().with_for_update() if locked else claim_query).all():
        if claim.session_id in excluded_ids:
            continue
        for day, time in positions:
            begin, end = time_range(time)
            other_begin, other_end = time_range(claim.time_slot)
            if claim.lesson_date.isoformat() == day and begin < other_end and other_begin < end:
                issues.append(f'Another confirmed lesson already covers {day}.')
    proposal = {'payment_id': payment.id, 'payment_version': payment.version,
                'effective_date': effective.isoformat(), 'coverage_from': start.isoformat(),
                'coverage_through': through.isoformat(), 'previous_count': enrollment.lessons_paid,
                'regular_count': len(moves) + len(added), 'new_count': enrollment.lessons_paid + len(added),
                'moves': moves, 'pending_session_ids': pending, 'added_dates': added,
                'additional_amount': unit * len(added), 'original_payment_status': payment.status,
                'issues': list(dict.fromkeys(issues))}
    proposal['review_hash'] = digest({'proposal': proposal, 'change': {field: getattr(change, field) for field in ('assigned_day', 'assigned_time', 'location', 'tutor_id')},
        'quote': payment.snapshot, 'sources': [[row.id, row.session_date, row.time_slot, row.location,
        row.session_status, row.financial_status, row.make_up_for_id, row.rescheduled_to_id] for row in all_sessions],
        'holidays': sorted(holidays)})
    return proposal


def apply(db, enrollment_id, change, actor, *, as_of):
    from . import workflow
    from decimal import Decimal
    from .schedules import prepare_schedule_change, finish_schedule_change
    from schemas import ScheduleChangeResult
    if not workflow.workflow_enabled():
        raise HTTPException(503, 'Enrollment changes are not enabled yet.')
    state = prepare_schedule_change(db, enrollment_id)
    if not state or not state['payment']:
        raise HTTPException(409, 'Reload the enrollment before reviewing its billing period.')
    payment = state['payment']
    account = state['account']
    payload_hash = workflow.operation_key('schedule_adjusted', enrollment_id, change, actor)
    replay = workflow.replay_operation(db, account, change, payload_hash)
    if replay:
        return ScheduleChangeResult.model_validate(replay.result)
    enrollment = next(row for row in state['enrollments'] if row.id == enrollment_id)
    proposal = preview(db, enrollment, change, as_of=as_of, locked=True)
    if proposal is None or proposal['review_hash'] != change.expected_adjustment_hash:
        raise HTTPException(409, 'The enrollment changed. Review the new dates and amount before saving.')
    if proposal['issues']:
        raise HTTPException(409, ' '.join(proposal['issues']))
    if not change.apply_to_sessions or change.date_overrides or change.time_overrides:
        raise HTTPException(422, 'Apply the reviewed period dates together. Reschedule individual sessions afterwards.')
    if not change.reason or not change.reason.strip():
        raise HTTPException(422, 'Explain why the enrollment schedule is changing.')
    own = {row.id: row for row in state['lessons'] if row.enrollment_id == enrollment_id}
    for field in ('assigned_day', 'assigned_time', 'location', 'tutor_id'):
        setattr(enrollment, field, getattr(change, field))
    for move in proposal['moves']:
        row = own[move['session_id']]
        row.session_date = date.fromisoformat(move['date'])
        if row.id in {sid for entry in payment.snapshot.get('period_schedule_changes', []) for sid in entry['pending_session_ids']} and row.session_status == 'Rescheduled - Pending Make-up':
            row.previous_session_status = row.session_status
            row.session_status = 'Scheduled'
        row.time_slot, row.location, row.tutor_id = change.assigned_time, change.location, change.tutor_id
        row.last_modified_by = actor.user_email
    for session_id in proposal['pending_session_ids']:
        row = own[session_id]
        row.previous_session_status = row.session_status
        row.session_status = 'Rescheduled - Pending Make-up'
        row.last_modified_by = actor.user_email
    # Existing moves are verified and their claims updated before additions.
    finish_schedule_change(db, state, actor)
    snapshot = deepcopy(payment.snapshot)
    before_review = deepcopy(snapshot['review'])
    before_request = deepcopy(snapshot['request'])
    previous_sent_at = payment.sent_at.isoformat() if payment.sent_at else None
    line = db.query(BillingPaymentLine).filter_by(enrollment_id=enrollment_id).one()
    additions = []
    for day in proposal['added_dates']:
        lesson = SessionLog(enrollment_id=enrollment.id, student_id=enrollment.student_id,
            tutor_id=change.tutor_id, session_date=date.fromisoformat(day), time_slot=change.assigned_time,
            location=change.location, session_status='Scheduled', financial_status='Unpaid',
            last_modified_by=actor.user_email)
        db.add(lesson)
        db.flush()
        db.add(BillingLessonClaim(student_id=enrollment.student_id, payment_id=payment.id,
            enrollment_id=enrollment.id, session_id=lesson.id, lesson_date=lesson.session_date,
            time_slot=workflow.canonical_time(lesson.time_slot), location=lesson.location.strip()))
        additions.append({'session_id': lesson.id, 'slot': line.slot_index, 'date': day,
                          'time_slot': workflow.canonical_time(change.assigned_time), 'location': change.location.strip()})
    if additions:
        enrollment.lessons_paid += len(additions)
        enrollment.revenue_total += proposal['additional_amount']
        if payment.status == 'Paid':
            snapshot.setdefault('supplementary_payments', []).append({
                'id': str(uuid4()), 'enrollment_id': enrollment.id, 'status': 'Pending Payment',
                'amount': proposal['additional_amount'], 'lessons': additions,
                'created_at': utc_now().isoformat(), 'reason': change.reason.strip(),
                'payment_date': None, 'received_method': None, 'receipt_reference': None})
            enrollment.payment_status = 'Partially Paid'
            enrollment.payment_deadline = min(date.fromisoformat(lesson['date']) for item in snapshot['supplementary_payments'] if item['enrollment_id'] == enrollment.id and item['status'] == 'Pending Payment' for lesson in item['lessons'])
        else:
            # Extend an unpaid quote, preserving the previous agreed revision.
            _extend_unpaid(db, payment, snapshot, additions, proposal, actor)
            enrollment.fee_message_sent = False
    if payment.status == 'Pending Payment':
        from .messages import prepare_adjusted_fee_messages
        reviewed = BillingDraftReview.model_validate(snapshot['review'])
        if reviewed.period.collection.method == 'manual':
            ids = [row.enrollment_id for row, _, _ in workflow.payment_rows(db, payment)]
            originals = db.query(SessionLog).filter(SessionLog.enrollment_id.in_(ids),
                SessionLog.make_up_for_id.is_(None), SessionLog.session_status != 'Cancelled').all()
            first = min(row.session_date for row in originals)
            reviewed.period.collection.due_before_lesson = first
            for _, row, _ in workflow.payment_rows(db, payment):
                row.payment_deadline = first
        reviewed.message = prepare_adjusted_fee_messages(db, payment, reviewed, snapshot=snapshot)
        if reviewed.message.blocked_reasons:
            raise HTTPException(409, ' '.join(reviewed.message.blocked_reasons))
        reviewed.review_hash = digest(reviewed.model_dump(mode='json', exclude={'review_hash', 'source_fingerprint', 'issues'}))
        snapshot['review'] = reviewed.model_dump(mode='json')
        snapshot['request'] = {**snapshot['request'], 'scenario': reviewed.scenario.model_dump(mode='json')}
        payment.sent_at, payment.sent_language = None, None
        for _, row, _ in workflow.payment_rows(db, payment):
            row.fee_message_sent = False
    snapshot.setdefault('period_schedule_changes', []).append({
        **proposal, 'before_review': before_review, 'before_request': before_request, 'sent_at': previous_sent_at, 'reason': change.reason.strip(),
        'actor_id': actor.id, 'changed_at': utc_now().isoformat()})
    payment.snapshot = snapshot
    # A supplement must not reallocate discounts from lessons already taught.
    # All descendants retain the monetary value of their sold original.
    for financial_line, block, _ in workflow.payment_rows(db, payment):
        sessions = db.query(SessionLog).filter_by(enrollment_id=block.id).all()
        by_id = {row.id: row for row in sessions}
        base_rate = Decimal(financial_line.tuition_amount) / financial_line.lesson_count
        for row in sessions:
            member = supplement_for_root(payment, row, by_id)
            row.billing_tuition_amount = (Decimal(member['amount']) / len(member['lessons'])) if member else base_rate
    payment.version += 1
    enrollment.last_modified_by = actor.user_email
    db.flush()
    issues = workflow.payment_integrity(db, payment, BillingDraftReview.model_validate(snapshot['review']), workflow.payment_rows(db, payment))
    if issues:
        raise HTTPException(409, 'The schedule could not be saved: ' + ' '.join(issues))
    result = ScheduleChangeResult(enrollment_id=enrollment.id, sessions_updated=len(proposal['moves']),
        message=(f"Schedule updated. {len(additions)} additional session(s); "
                 f"{len(proposal['pending_session_ids'])} session(s) need rescheduling."))
    workflow.save_operation(db, account, change, payload_hash, 'schedule_adjusted', actor, result, payment)
    return result


def _extend_unpaid(db, payment, snapshot, additions, proposal, actor):
    from .workflow import allocate_discount, payment_rows
    from .messages import prepare_fee_messages
    from .schemas import PreviewLesson, PeriodCount
    from collections import Counter
    review = BillingDraftReview.model_validate(snapshot['review'])
    period = review.period.model_copy(deep=True)
    for lesson in additions:
        period.lessons.append(PreviewLesson(date=lesson['date'], slot=lesson['slot'],
            weekday=['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][date.fromisoformat(lesson['date']).weekday()],
            time_slot=lesson['time_slot'], location=lesson['location']))
        period.counts_by_slot[lesson['slot']] += 1
    period.lessons.sort(key=lambda lesson: (lesson.date, lesson.slot))
    period.lesson_count += len(additions)
    period.gross_tuition += proposal['additional_amount']
    period.tuition_after_deductions += proposal['additional_amount']
    period.total_fee += proposal['additional_amount']
    period.first_lesson_date = min(lesson.date for lesson in period.lessons)
    period.last_lesson_date = max(lesson.date for lesson in period.lessons)
    period.coverage_from = period.first_lesson_date
    period.counts_by_month = [PeriodCount(month=month, lessons=count) for month, count in sorted(Counter(lesson.date.strftime('%Y-%m') for lesson in period.lessons).items())]
    review.scenario.first_lesson_date = min(review.scenario.first_lesson_date, period.first_lesson_date)
    if period.collection.method == 'manual':
        period.collection.due_before_lesson = period.first_lesson_date
    unit = period.gross_tuition // period.lesson_count
    review.period = period
    review.message = prepare_fee_messages(review.student, review.scenario, period, unit,
                                          blocked_reasons=review.message.blocked_reasons)
    review.review_hash = digest(review.model_dump(mode='json', exclude={'review_hash', 'source_fingerprint', 'issues'}))
    snapshot['review'] = review.model_dump(mode='json')
    shares = allocate_discount(sum(item.amount for item in period.deductions), period.counts_by_slot)
    for line, enrollment, _ in payment_rows(db, payment):
        line.lesson_count = period.counts_by_slot[line.slot_index]
        line.gross_tuition = unit * line.lesson_count
        line.discount_amount = shares[line.slot_index]
        line.tuition_amount = line.gross_tuition - line.discount_amount
        enrollment.revenue_total = line.tuition_amount
        enrollment.first_lesson_date = min(lesson.date for lesson in period.lessons if lesson.slot == line.slot_index)
        enrollment.fee_message_sent = False
        enrollment.last_modified_by = actor.user_email
    payment.sent_at, payment.sent_language = None, None


def record_supplement(db, payment, data, actor, *, as_of):
    from . import workflow
    from .guards import lock_student_billing
    account = lock_student_billing(db, [db.query(Enrollment.student_id).filter_by(id=data.enrollment_id).scalar()])
    payment = db.query(BillingPayment).filter_by(id=payment.id).populate_existing().with_for_update().one()
    owning_account = next((item for item in account if item.id == payment.account_id), None)
    if owning_account is None:
        raise HTTPException(404, 'Supplementary payment not found.')
    payload_hash = workflow.operation_key('supplement_paid', payment.id, data, actor)
    replay = workflow.replay_operation(db, owning_account, data, payload_hash)
    if replay:
        return workflow.BillingPaymentDetail.model_validate(replay.result)
    if payment.version != data.expected_version:
        raise HTTPException(409, 'This payment changed. Reload it before continuing.')
    workflow.lock_sources(db, owning_account.student_id)
    detail = workflow.payment_detail(db, payment)
    if detail.review_issues:
        raise HTTPException(409, ' '.join(detail.review_issues))
    snapshot = deepcopy(payment.snapshot)
    supplement = next((item for item in snapshot.get('supplementary_payments', [])
                       if item['id'] == str(data.supplement_id) and item['enrollment_id'] == data.enrollment_id), None)
    if supplement is None or supplement['status'] != 'Pending Payment' or payment.status != 'Paid':
        raise HTTPException(409, 'This supplementary payment is no longer outstanding.')
    if data.amount != supplement['amount'] or data.payment_date > as_of:
        raise HTTPException(422, 'Enter the exact outstanding amount and a payment date that is not in the future.')
    supplement.update(status='Paid', payment_date=data.payment_date.isoformat(), received_method=data.method,
                      receipt_reference=(data.receipt_reference or '').strip() or None,
                      paid_at=utc_now().isoformat(), received_amount=data.amount)
    payment.snapshot = snapshot
    enrollment = db.get(Enrollment, data.enrollment_id)
    enrollment.payment_status = enrollment_status(payment, enrollment.id)
    sessions = db.query(SessionLog).filter_by(enrollment_id=enrollment.id).all()
    by_id = {row.id: row for row in sessions}
    for row in sessions:
        member = supplement_for_root(payment, row, by_id)
        if member and member['id'] == supplement['id']:
            row.financial_status = 'Paid'
            row.last_modified_by = actor.user_email
    payment.version += 1
    db.flush()
    result = workflow.payment_detail(db, payment)
    if result.review_issues:
        raise HTTPException(409, ' '.join(result.review_issues))
    workflow.save_operation(db, owning_account, data, payload_hash, 'supplement_paid', actor, result, payment)
    return result
