"""Review and save immutable draft revisions without reserving teaching dates.

The account row serialises draft writes. It remains inactive, and these services
never create enrolments, sessions, payments or coupon reservations.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from uuid import uuid4

from sqlalchemy.orm import Session

from models import Enrollment, Holiday, SessionLog, Student, StudentCoupon
from .calculator import BillingPolicy, preview_billing
from .evidence import load_contexts
from .messages import MESSAGE_TEMPLATE_VERSION, prepare_fee_messages
from .models import BillingAccount, BillingDraft, BillingDraftRevision
from .schemas import (
    BillingDraftDetail, BillingDraftDiscardRequest, BillingDraftHistory, BillingDraftReview, BillingDraftReviewRequest,
    BillingDraftSaveRequest, BillingDraftSummary, PreviewIssue,
)

POLICY = BillingPolicy()
INFORMATIONAL_SOURCE = {
    'PENDING_BILLS', 'SENT_BILL_REVIEW', 'PENDING_COVERAGE_ASSUMED',
    'SCHEDULE_SELECTION_SCENARIO', 'FIRST_PAYMENT_REVIEW',
}
INFORMATIONAL_CALCULATION = {
    'COVERAGE_ASSUMED', 'ADMIN_ADJUSTMENT', 'TRIAL_COUPON_CHOICE',
    'COUPON_SAVED', 'SAVED_COUPON_EXPIRY', 'FIRST_AUTOPAY_TIMING',
}
CONFIRMABLE = {'CONTINUING_SLOTS_REVIEW', 'CONTINUATION_UNCONFIRMED', 'HOLIDAY_OPENING_ASSUMED', 'UNPAID_PAST_DATES'}


class DraftConflict(ValueError):
    pass


class DraftNotFound(ValueError):
    pass


def storage_enabled():
    return os.getenv('BILLING_DRAFT_STORAGE_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def digest(value):
    return hashlib.sha256(json.dumps(value, default=str, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def draft_discarded(row):
    return row.snapshot.get('state') == 'discarded'


def current_holidays(db, policy=POLICY):
    return {row[0] for row in db.query(Holiday.holiday_date).filter(
        Holiday.holiday_date >= policy.academic_start, Holiday.holiday_date <= policy.regular_end,
    ).all()}


def evidence_hash(db, context):
    """Ignore the review day, while retaining original and descendant facts."""
    data = context.model_dump(mode='json', exclude={
        'as_of', 'source_fingerprint', 'upcoming_original_count', 'issues', 'requires_review', 'suggested_request',
    })
    ids = [b.enrollment_id for b in context.source_blocks]
    data['financial_rows'] = [list(row) for row in db.query(
        Enrollment.id, Enrollment.discount_id, Enrollment.revenue_total, Enrollment.promo_code,
    ).filter(Enrollment.id.in_(ids)).order_by(Enrollment.id).all()]
    data['lesson_rows'] = [list(row) for row in db.query(
        SessionLog.id, SessionLog.enrollment_id, SessionLog.student_id,
        SessionLog.session_date, SessionLog.time_slot, SessionLog.location,
        SessionLog.session_status, SessionLog.financial_status, SessionLog.make_up_for_id,
        SessionLog.rescheduled_to_id,
    ).filter(SessionLog.enrollment_id.in_(ids)).order_by(SessionLog.id).all()]
    return digest(data)


def review_draft(db: Session, student_id: int, data: BillingDraftReviewRequest, *,
                 as_of, admin=False, check_fingerprint=True, policy=POLICY):
    if data.confirmed_checks and not admin:
        raise PermissionError('Only an admin can confirm timetable, continuation or holiday checks.')
    holidays = current_holidays(db, policy)
    intake_evidence = None
    if data.intake:
        from .intake import review_intake_source
        context, intake_evidence, source_issues = review_intake_source(
            db, student_id, data, as_of=as_of, admin=admin, policy=policy,
        )
    else:
        contexts = load_contexts(db, [student_id], holidays, as_of=as_of, basis=data.basis,
                                 selected=data.selected_enrollment_ids, policy=policy)
        context = contexts.get(student_id)
        source_issues = list(context.issues) if context else []
    if context is None:
        raise DraftNotFound('No student source is available.')
    if check_fingerprint and context.source_fingerprint != data.expected_source_fingerprint:
        raise DraftConflict('Student records have changed. Refresh records and review this payment again.')
    scenario = data.scenario
    calculation = preview_billing(scenario, holidays, policy=policy, allow_adjustment=admin)
    if data.period_number > len(calculation.periods):
        raise ValueError('Choose a payment present in this calculation.')
    period = calculation.periods[data.period_number - 1]
    issues = list(source_issues) + list(calculation.issues)
    reasons = []
    confirmed = set(data.confirmed_checks)

    def block(code, message):
        if message not in reasons:
            reasons.append(message)
        if not any(i.code == code for i in issues):
            issues.append(PreviewIssue(code=code, message=message, period=period.number))

    for issue in source_issues:
        if issue.code not in INFORMATIONAL_SOURCE and issue.code not in confirmed:
            block(issue.code, issue.message)
    for issue in calculation.issues:
        if issue.period is not None and issue.period != period.number:
            continue
        if issue.code in INFORMATIONAL_CALCULATION or issue.code in confirmed:
            continue
        if issue.code == 'MANDATE_NOT_READY' and period.collection.method == 'manual':
            continue
        if issue.code == 'STAGGERED_COVERAGE' and 'CONTINUING_SLOTS_REVIEW' in confirmed:
            continue
        if issue.code == 'FIRST_PAYMENT_BELOW_MINIMUM' and scenario.adjustment and admin:
            continue
        block(issue.code, issue.message)

    if not data.intake:
        selected = {c.enrollment_id: c for c in context.slot_candidates if c.selected}
        expected_keys = {((c.weekday or '')[:3], (c.time_slot or '').strip(), (c.location or '').strip()): c
                         for c in selected.values()}
        actual_keys = {(s.weekday, s.time_slot.strip(), s.location.strip()) for s in scenario.slots}
        if len(selected) != len(scenario.slots) or actual_keys != set(expected_keys):
            block('SCENARIO_SOURCE_MISMATCH', 'These classes do not match the selected enrollments. Check the timetable in Edit preview.')
    if data.intake:
        if period.collection.method != 'manual':
            block('INTAKE_FIRST_PAYMENT_MANUAL', 'The first enrollment must be collected manually.')
    elif context.suggested_request is None:
        block('SOURCE_FORECAST_UNAVAILABLE', 'The next payment cannot be calculated from these enrollments. Check their timetable and session dates.')
    else:
        if scenario.mode != context.suggested_request.mode:
            block('SCENARIO_POLICY_MISMATCH', 'This payment uses a different fee scheme from the student’s records. Check Preview for in Edit preview.')
        if scenario.first_lesson_date != context.suggested_request.first_lesson_date:
            block('SOURCE_DATE_MISMATCH', 'The start date does not match the next uncovered lesson. Check the date in Edit preview.')
        for slot in scenario.slots:
            candidate = expected_keys.get((slot.weekday, slot.time_slot.strip(), slot.location.strip()))
            if candidate:
                expected = candidate.last_retained_original_date
                actual = slot.covered_through
                if scenario.mode == 'new_student':
                    expected = None
                elif expected is None:
                    expected = candidate.first_uncovered_date
                    if expected:
                        from datetime import timedelta
                        expected -= timedelta(days=1)
                if actual != expected:
                    block('SOURCE_COVERAGE_MISMATCH', 'Previous coverage does not match the selected enrollments. Check the dates in Edit preview.')

    if data.intake:
        existing = {(r.session_date, (r.time_slot or '').strip(), (r.location or '').strip())
                    for r in db.query(SessionLog).join(Enrollment, Enrollment.id == SessionLog.enrollment_id).filter(
                        Enrollment.student_id == student_id, Enrollment.payment_status != 'Cancelled',
                        SessionLog.make_up_for_id.is_(None), SessionLog.session_status != 'Cancelled',
                    ).all()}
    else:
        existing = {(r.date, (r.time_slot or b.time_slot or '').strip(), (r.location or b.location or '').strip())
                    for b in context.source_blocks if b.payment_status != 'Cancelled' for r in b.originals}
    if any((lesson.date, lesson.time_slot.strip(), lesson.location.strip()) in existing for lesson in period.lessons):
        block('EXISTING_ORIGINALS_OVERLAP', 'Some sessions are already in an enrollment. Check that enrollment before preparing another fee message.')
    if period.number > 1:
        block('FUTURE_PAYMENT_PREVIEW', 'This later payment depends on earlier payments being confirmed. Prepare the student’s next payment first.')
    if period.collection.method == 'autopay' and not scenario.mandate_ready:
        block('MANDATE_NOT_READY', 'Confirm bank authorisation before preparing an autopay fee message.')
    if period.collection.method == 'autopay' and not admin:
        block('MANDATE_NOT_READY', 'Ask an admin to confirm bank authorisation before preparing this autopay message.')
    if scenario.coupon and (not scenario.coupon.verified or scenario.coupon.available_count is None
                            or scenario.coupon.expires_on is None or scenario.coupon.available_count < 1):
        block('COUPON_DETAILS_UNCONFIRMED', 'Check the coupon amount, expiry and remaining count in KMS.')
    if any(d.kind != 'trial' and d.amount > 0 for d in period.deductions):
        from .coupon_accounting import storage_enabled as coupon_storage_enabled
        if coupon_storage_enabled():
            balance = context.coupon_snapshot.accounting if context.coupon_snapshot else None
            selected_coupon = scenario.coupon
            group = next((g for g in balance.groups if selected_coupon
                          and g.kind == selected_coupon.kind and g.value == selected_coupon.value
                          and g.expires_on == selected_coupon.expires_on), None) if balance else None
            # This financial check cannot be dismissed by confirmed_checks.
            # Review and message preparation share the exact finite stock
            # requirement enforced again under locks during confirmation.
            if (balance is None or balance.student_id != student_id or balance.usable_count is None
                    or balance.usable_count < 1 or group is None or group.usable_count < 1):
                block('COUPON_STOCK_REVIEW', 'Choose an available checked coupon group before preparing this fee message.')
    message = prepare_fee_messages(context.student, scenario, period, policy.unit_fee, blocked_reasons=reasons)
    result = BillingDraftReview(
        student=context.student, source_fingerprint=context.source_fingerprint,
        evidence_hash=intake_evidence or evidence_hash(db, context), calendar_hash=digest(sorted(holidays)),
        policy_version=policy.version, scenario=scenario, basis=data.basis,
        selected_enrollment_ids=data.selected_enrollment_ids, intake=data.intake, confirmed_checks=sorted(confirmed),
        period=period, issues=issues, message=message, review_hash='',
    )
    result.review_hash = digest(result.model_dump(mode='json', exclude={'review_hash', 'source_fingerprint', 'issues'}))
    return result


def draft_detail(db, draft, row, *, as_of, policy=POLICY):
    """Withhold stale copy in the response without altering stored snapshots."""
    saved = BillingDraftReview.model_validate(row.snapshot['review'])
    request = BillingDraftReviewRequest.model_validate(row.snapshot['request'])
    history = db.query(BillingDraftRevision).filter(BillingDraftRevision.draft_id == draft.id).order_by(
        BillingDraftRevision.revision.desc()).all()
    discarded = draft_discarded(history[0])
    reasons = []
    try:
        current = review_draft(db, saved.student.id, request, as_of=as_of, admin=True,
                               check_fingerprint=False, policy=policy)
        if current.evidence_hash != saved.evidence_hash:
            reasons.append('Student or enrollment records have changed. Review this draft again.')
        if current.calendar_hash != saved.calendar_hash:
            reasons.append('The holiday calendar has changed. Review this draft again.')
        if current.policy_version != saved.policy_version:
            reasons.append('The fee rules have changed. Review this draft again.')
        if current.message.blocked_reasons and not saved.message.blocked_reasons:
            reasons.append('Current checks need another review before this message can be copied.')
        if not reasons and current.review_hash != saved.review_hash:
            reasons.append('The reviewed calculation has changed. Review it again before copying a message.')
    except (ValueError, PermissionError):
        reasons.append('This draft no longer matches the student’s records. Review it again.')
    if saved.message.template_version != MESSAGE_TEMPLATE_VERSION:
        reasons.append('The fee message template has changed. Review this draft again.')
    if row.revision != draft.current_revision:
        reasons.append('A newer revision replaces this draft.')
    if discarded:
        reasons = ['This draft was discarded.']
    if reasons:
        saved = saved.model_copy(update={'message': saved.message.model_copy(update={
            'zh': None, 'en': None, 'blocked_reasons': list(dict.fromkeys(saved.message.blocked_reasons + reasons)),
        })})
    confirmed_id = confirmed_payments(db, [draft.id]).get(draft.id)
    return BillingDraftDetail(
        id=draft.id, student_id=saved.student.id, current_revision=draft.current_revision,
        revision=row.revision, review=saved, note=row.note, created_at=utc(row.created_at),
        created_by_name=row.actor_name, stale_reasons=reasons,
        can_copy=bool(saved.message.zh and saved.message.en and not saved.message.blocked_reasons),
        history=[BillingDraftHistory(revision=r.revision, note=r.note, created_at=utc(r.created_at),
                                     created_by_name=r.actor_name,
                                     action='discarded' if draft_discarded(r) else 'saved') for r in history],
        confirmed_payment_id=confirmed_id,
        state='discarded' if discarded else 'active',
    )


def save_draft(db, student_id, data: BillingDraftSaveRequest, actor, *, as_of, draft_id=None, policy=POLICY):
    """The caller authorises the student and owns the commit/rollback boundary."""
    student = db.query(Student.id).filter(Student.id == student_id).with_for_update().first()
    if student is None:
        raise DraftNotFound('Student not found.')
    account = db.query(BillingAccount).filter(
        BillingAccount.student_id == student_id, BillingAccount.academic_start == policy.academic_start,
    ).with_for_update().first()
    if account is None:
        account = BillingAccount(student_id=student_id, academic_start=policy.academic_start,
                                 policy_version=policy.version, active=False)
        db.add(account)
        db.flush()
    payload_hash = digest({'operation': 'revise' if draft_id else 'create', 'draft_id': draft_id,
                           'student_id': student_id, 'actor_id': actor.id, 'request': data.model_dump(mode='json')})
    replay = db.query(BillingDraftRevision).filter(
        BillingDraftRevision.account_id == account.id,
        BillingDraftRevision.idempotency_key == data.idempotency_key,
    ).with_for_update().first()
    if replay:
        if replay.payload_hash != payload_hash:
            raise DraftConflict('This request key was already used for another draft action. Use a new key for changes.')
        draft = db.query(BillingDraft).filter(BillingDraft.id == replay.draft_id).with_for_update().one()
        return draft, replay
    draft = None
    if draft_id:
        draft = db.query(BillingDraft).filter(BillingDraft.id == draft_id,
                                              BillingDraft.account_id == account.id).with_for_update().first()
        if draft is None:
            raise DraftNotFound('Draft not found.')
        if draft.current_revision != data.expected_revision:
            raise DraftConflict('Another revision was saved. Reload the draft before changing it.')
        current = db.query(BillingDraftRevision).filter_by(
            draft_id=draft.id, revision=draft.current_revision,
        ).with_for_update().one()
        if draft_discarded(current):
            raise DraftConflict('This draft was discarded. Prepare a new draft to continue.')
        from .workflow import workflow_storage_enabled
        if workflow_storage_enabled():
            from .models import BillingPayment
            if db.query(BillingPayment.id).filter_by(draft_id=draft_id).with_for_update().first():
                raise DraftConflict('This draft has confirmed enrollments. Open its payment instead of revising the draft.')
    # These current reads establish a stable source for a new snapshot. Other
    # draft writers take the student/account locks first in the same order.
    db.query(Enrollment.id).filter(Enrollment.student_id == student_id).order_by(Enrollment.id).with_for_update().all()
    db.query(SessionLog.id).filter(SessionLog.student_id == student_id).order_by(SessionLog.id).with_for_update().all()
    db.query(Holiday.id).filter(Holiday.holiday_date >= policy.academic_start,
                                Holiday.holiday_date <= policy.regular_end).order_by(Holiday.id).with_for_update(read=True).all()
    db.query(StudentCoupon.id).filter(StudentCoupon.student_id == student_id).with_for_update().all()
    reviewed = review_draft(db, student_id, data.review, as_of=as_of, admin=True, policy=policy)
    if reviewed.review_hash != data.expected_review_hash:
        raise DraftConflict('The reviewed payment changed. Review the latest calculation before saving.')
    if draft is None:
        draft = BillingDraft(id=str(uuid4()), account_id=account.id, current_revision=1, created_by=actor.id)
        db.add(draft)
        db.flush()
    else:
        draft.current_revision += 1
    row = BillingDraftRevision(
        draft_id=draft.id, account_id=account.id, revision=draft.current_revision,
        idempotency_key=data.idempotency_key, payload_hash=payload_hash, review_hash=reviewed.review_hash,
        snapshot={'review': reviewed.model_dump(mode='json'), 'request': data.review.model_dump(mode='json')},
        note=data.note, created_by=actor.id, actor_name=(actor.tutor_name or str(actor.id))[:100],
    )
    db.add(row)
    db.flush()
    return draft, row


def discard_draft(db, student_id, draft_id, data: BillingDraftDiscardRequest, actor, *, policy=POLICY):
    """Append a discard revision while preserving every saved calculation."""
    student = db.query(Student.id).filter(Student.id == student_id).with_for_update().first()
    if student is None:
        raise DraftNotFound('Student not found.')
    account_id = db.query(BillingDraft.account_id).filter(BillingDraft.id == draft_id).scalar_subquery()
    account = db.query(BillingAccount).filter(
        BillingAccount.student_id == student_id, BillingAccount.id == account_id,
    ).with_for_update().first()
    if account is None:
        raise DraftNotFound('Draft not found.')
    payload_hash = digest({'operation': 'discard', 'draft_id': draft_id, 'student_id': student_id,
                           'actor_id': actor.id, 'request': data.model_dump(mode='json')})
    replay = db.query(BillingDraftRevision).filter_by(
        account_id=account.id, idempotency_key=data.idempotency_key,
    ).with_for_update().first()
    if replay and replay.payload_hash != payload_hash:
        raise DraftConflict('This request key was already used for another draft action. Use a new key for changes.')
    draft = db.query(BillingDraft).filter_by(id=draft_id, account_id=account.id).with_for_update().one()
    if replay:
        return draft, replay
    if draft.current_revision != data.expected_revision:
        raise DraftConflict('Another revision was saved. Reload the draft before discarding it.')
    current = db.query(BillingDraftRevision).filter_by(
        draft_id=draft.id, revision=draft.current_revision,
    ).with_for_update().one()
    if draft_discarded(current):
        raise DraftConflict('This draft was already discarded.')
    from .workflow import workflow_storage_enabled
    if workflow_storage_enabled():
        from .models import BillingPayment
        if db.query(BillingPayment.id).filter_by(draft_id=draft_id).with_for_update().first():
            raise DraftConflict('This draft has confirmed enrollments. Open its payment instead of discarding the draft.')
    draft.current_revision += 1
    row = BillingDraftRevision(
        draft_id=draft.id, account_id=account.id, revision=draft.current_revision,
        idempotency_key=data.idempotency_key, payload_hash=payload_hash, review_hash=current.review_hash,
        snapshot={**current.snapshot, 'state': 'discarded'}, note=current.note,
        created_by=actor.id, actor_name=(actor.tutor_name or str(actor.id))[:100],
    )
    db.add(row)
    db.flush()
    return draft, row


def draft_summaries(db, student_id, *, include_discarded=False):
    rows = db.query(BillingDraft, BillingDraftRevision).join(
        BillingAccount, BillingAccount.id == BillingDraft.account_id,
    ).join(BillingDraftRevision, (BillingDraftRevision.draft_id == BillingDraft.id)
           & (BillingDraftRevision.revision == BillingDraft.current_revision)).filter(
        BillingAccount.student_id == student_id,
    ).order_by(BillingDraftRevision.created_at.desc(), BillingDraft.id).all()
    if not include_discarded:
        rows = [(draft, row) for draft, row in rows if not draft_discarded(row)]
    confirmed = confirmed_payments(db, [draft.id for draft, _ in rows])
    return [BillingDraftSummary(
        id=draft.id, student_id=student_id, current_revision=draft.current_revision,
        period_number=(review := BillingDraftReview.model_validate(row.snapshot['review'])).period.number,
        lesson_count=review.period.lesson_count, total_fee=review.period.total_fee,
        payment_method=review.period.collection.method, coverage_from=review.period.coverage_from,
        coverage_through=review.period.coverage_through, created_at=utc(draft.created_at), updated_at=utc(row.created_at),
        confirmed_payment_id=confirmed.get(draft.id),
        state='discarded' if draft_discarded(row) else 'active',
    ) for draft, row in rows]


def confirmed_payments(db, draft_ids):
    from .workflow import workflow_storage_enabled
    if not draft_ids or not workflow_storage_enabled():
        return {}
    from .models import BillingPayment
    return dict(db.query(BillingPayment.draft_id, BillingPayment.id).filter(BillingPayment.draft_id.in_(draft_ids)).all())
