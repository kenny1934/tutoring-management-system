"""Derive one operational run without creating or submitting payments.

Confirmed records retain their frozen method and dates. Planned enrollments are
shown separately and never contribute to the amount ready for collection.
"""
from collections import defaultdict
from datetime import date, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_

from models import Enrollment, SessionLog, Student, Tutor
from .autopay_schemas import AutopayCounts, AutopayReason, AutopayResponse, AutopayRow
from .calculator import BillingPolicy, month_end, next_month, previous_month
from .drafts import storage_enabled, utc
from .evidence import academic_source_filter, load_contexts
from .models import (
    BillingAccount, BillingDraft, BillingDraftRevision, BillingLessonClaim,
    BillingPayment, BillingPaymentLine, BillingPreference,
)
from .queue import apply_draft, intake_draft_row, projection_row
from .schemas import BillingDraftReview, BillingStudent
from .workflow import canonical_time, payment_integrity, workflow_storage_enabled

# These are malformed stored evidence, not infrastructure or programming errors.
BAD_EVIDENCE = (ValueError, TypeError, KeyError, IndexError, AttributeError, ZeroDivisionError)


def reason(code, label):
    return AutopayReason(code=code, label=label)


def collection_bounds(policy=BillingPolicy()):
    return policy.pilot_from.replace(day=1), previous_month(policy.regular_end)


def collection_month(value, as_of, policy=BillingPolicy()):
    first, last = collection_bounds(policy)
    if value is None:
        return min(max(as_of.replace(day=1), first), last)
    try:
        parsed = date.fromisoformat(value + '-01')
    except (TypeError, ValueError):
        raise ValueError('Choose a valid collection month.') from None
    if not first <= parsed <= last:
        raise ValueError(f'Choose {first:%b %Y} to {last:%b %Y}.')
    return parsed


def _students(db, ids):
    return {row.id: BillingStudent(**{**dict(row._mapping), 'is_staff_referral': bool(row.is_staff_referral)})
            for row in db.query(Student.id, Student.student_name, Student.school_student_id,
                                Student.home_location, Student.grade, Student.is_staff_referral,
                                Student.lang_stream, Student.school).filter(Student.id.in_(ids)).all()}


def _shape(review, student_id, policy):
    """Validate relationships that the permissive historical JSON schema cannot."""
    p = review.period
    if review.student.id != student_id:
        return False
    if (p.lesson_count <= 0 or not p.lessons or len(p.lessons) != p.lesson_count
            or len(p.counts_by_slot) != len(review.scenario.slots)
            or sum(p.counts_by_slot) != p.lesson_count or any(n < 0 for n in p.counts_by_slot)
            or sum(c.lessons for c in p.counts_by_month) != p.lesson_count
            or not policy.academic_start <= p.coverage_from <= p.coverage_through <= policy.regular_end
            or p.first_lesson_date != min(l.date for l in p.lessons)
            or p.last_lesson_date != max(l.date for l in p.lessons)
            or p.coverage_from != p.first_lesson_date
            or any(not p.coverage_from <= l.date <= p.coverage_through for l in p.lessons)
            or p.materials_fee is None or p.materials_fee < 0
            or p.total_fee is None or p.total_fee <= 0
            or p.gross_tuition < 0 or p.tuition_after_deductions < 0
            or any(d.amount < 0 for d in p.deductions)
            or p.gross_tuition - sum(d.amount for d in p.deductions) != p.tuition_after_deductions
            or p.tuition_after_deductions + p.materials_fee != p.total_fee):
        return False
    for i, count in enumerate(p.counts_by_slot):
        if sum(l.slot == i for l in p.lessons) != count:
            return False
    if any(l.slot < 0 or l.slot >= len(p.counts_by_slot) for l in p.lessons):
        return False
    c = p.collection
    if c.method == 'autopay' and (p.kind in {'first', 'legacy', 'adjusted_manual'}
                                  or p.first_lesson_date > policy.makeup_end):
        return False
    if c.method == 'autopay':
        if (review.scenario.payment_method != 'autopay' or not c.debit_from or not c.debit_to
                or not c.notice_from or not c.notice_to
                or not c.notice_from <= c.notice_to < c.debit_from <= c.debit_to
                or c.debit_from.replace(day=1) != c.debit_to.replace(day=1)):
            return False
    elif not c.due_before_lesson:
        return False
    return True


def _raw_autopay(payment):
    snapshot = payment.snapshot
    if not isinstance(snapshot, dict):
        return False
    review = snapshot.get('review', {})
    if not isinstance(review, dict):
        return False
    scenario = review.get('scenario', {})
    period = review.get('period', {})
    collection = period.get('collection', {}) if isinstance(period, dict) else {}
    return ((isinstance(scenario, dict) and scenario.get('payment_method') == 'autopay')
            or (isinstance(collection, dict) and collection.get('method') == 'autopay'))


def _window_month(collection):
    day = collection.debit_from if collection.method == 'autopay' else collection.due_before_lesson
    return day.replace(day=1) if day else None


def _covers_target(period, target_start, target_end):
    # A prior payment must cover the entire following calendar interval. A
    # partial first period cannot claim that the whole next run is prepaid.
    return (period.coverage_from <= target_end and period.coverage_through >= target_end
            and any(target_start <= l.date <= target_end for l in period.lessons))


def _payment_evidence(db, payment_ids):
    lines = defaultdict(list)
    claims = defaultdict(list)
    sessions = defaultdict(list)
    if not payment_ids:
        return lines, claims, sessions
    for line, enrollment, name in db.query(BillingPaymentLine, Enrollment, Tutor.tutor_name).join(
            Enrollment, Enrollment.id == BillingPaymentLine.enrollment_id).join(
            Tutor, Tutor.id == Enrollment.tutor_id).filter(BillingPaymentLine.payment_id.in_(payment_ids)).order_by(
            BillingPaymentLine.payment_id, BillingPaymentLine.slot_index).all():
        lines[line.payment_id].append((line, enrollment, name))
    for claim, lesson in db.query(BillingLessonClaim, SessionLog).join(
            SessionLog, SessionLog.id == BillingLessonClaim.session_id).filter(
            BillingLessonClaim.payment_id.in_(payment_ids)).all():
        claims[claim.payment_id].append((claim, lesson))
    by_enrollment = {line.enrollment_id: line.payment_id for values in lines.values() for line, _, _ in values}
    if by_enrollment:
        for lesson in db.query(SessionLog).filter(SessionLog.enrollment_id.in_(by_enrollment)).all():
            sessions[by_enrollment[lesson.enrollment_id]].append(lesson)
    return lines, claims, sessions


def _planned(db, *, as_of, month, holidays, tutor_id, location, policy, excluded, confirmed_drafts):
    """Reuse queue calculations without parsing or combining unpaid payments."""
    query = db.query(Enrollment.student_id).filter(academic_source_filter(policy), Enrollment.payment_status != 'Cancelled')
    if tutor_id is not None:
        query = query.filter(Enrollment.tutor_id == tutor_id)
    if location:
        query = query.filter(Enrollment.location == location)
    ids = {sid for sid, in query.distinct().all()}
    latest = db.query(BillingDraft, BillingDraftRevision, BillingAccount.student_id).join(
        BillingAccount, BillingAccount.id == BillingDraft.account_id).join(BillingDraftRevision, and_(
            BillingDraftRevision.draft_id == BillingDraft.id, BillingDraftRevision.revision == BillingDraft.current_revision)
        ).filter(BillingAccount.academic_start == policy.academic_start).order_by(
            BillingDraftRevision.created_at.desc(), BillingDraft.id).all()
    drafts = defaultdict(list)
    # Proposed tutor assignment never grants student access.
    owned = set()
    owned_trials = set()
    parsed_drafts = {}
    if tutor_id is not None and latest:
        owned = {sid for sid, in db.query(Enrollment.student_id).filter(
            Enrollment.student_id.in_({sid for _, _, sid in latest}), Enrollment.tutor_id == tutor_id,
            Enrollment.payment_status != 'Cancelled').distinct().all()}
        owned_trials = {(sid, eid, session_id) for sid, eid, session_id in db.query(
            Enrollment.student_id, Enrollment.id, SessionLog.id).join(SessionLog,
                SessionLog.enrollment_id == Enrollment.id).filter(
            Enrollment.student_id.in_({sid for _, _, sid in latest}), Enrollment.enrollment_type == 'Trial',
            Enrollment.payment_status != 'Cancelled', SessionLog.student_id == Enrollment.student_id,
            SessionLog.tutor_id == tutor_id).all()}
    for draft, revision, sid in latest:
        if draft.id in confirmed_drafts or sid in excluded:
            continue
        try:
            if revision.snapshot.get('state') == 'discarded':
                continue
            review = BillingDraftReview.model_validate(revision.snapshot['review'])
            if review.student.id != sid:
                continue
            if location and not any(s.location == location for s in review.scenario.slots):
                continue
            if tutor_id is not None and sid not in ids and sid not in owned:
                # A trial session taught by this tutor is also a valid intake
                # source, checked against both student foreign keys.
                intake = review.intake
                if not intake or (sid, intake.trial_enrollment_id, intake.trial_session_id) not in owned_trials:
                    continue
            if sid not in ids and not review.intake:
                continue
            ids.add(sid)
            drafts[sid].append((draft, revision))
            parsed_drafts[draft.id] = review
        except BAD_EVIDENCE:
            # Its student's ordinary source projection remains visible. A bad
            # saved draft never becomes a confirmed debit candidate.
            continue
    ids.difference_update(excluded)
    contexts = load_contexts(db, sorted(ids), holidays, as_of=as_of, basis='include_pending',
                             policy=policy, isolate_invalid=True)
    rows = []
    legacy_paid = None
    target_start = next_month(month)
    target_end = min(month_end(target_start), policy.regular_end)
    for sid, context in contexts.items():
        selected = drafts[sid]
        intended = context.recorded_payment_method == 'autopay' or any(
            parsed_drafts[draft.id].scenario.payment_method == 'autopay' for draft, _ in selected)
        if not intended:
            continue
        try:
            queued = intake_draft_row(context, selected, holidays, as_of, month_end(month), policy)
            if queued is None:
                queued = projection_row(context, holidays, as_of, month_end(month), policy)
                queued = apply_draft(context, queued, selected, holidays, as_of, month_end(month), policy)
        except BAD_EVIDENCE:
            rows.append(AutopayRow(key=f'prepare-{sid}', student=context.student, stage='attention', origin='projection',
                recorded_payment_method=context.recorded_payment_method, mandate_ready=context.mandate_ready,
                reasons=[reason('ENROLLMENT_REVIEW', 'Check the enrollment records')],
                action_url=f'/billing/students/{sid}'))
            continue
        later_collection = bool(queued.collection and _window_month(queued.collection)
                                and _window_month(queued.collection) > month)
        if later_collection or (queued.stage == 'no_payment' and queued.first_lesson_date is None):
            started = any(b.payment_status != 'Cancelled' and b.first_lesson_date
                          and b.first_lesson_date <= target_end and b.originals for b in context.source_blocks)
            if not started:
                continue
            if legacy_paid is None:
                legacy_paid = _settled_legacy_lessons(db, contexts)
            paid = legacy_paid[sid]
            target_lessons = {lesson for lesson in paid if target_start <= lesson[0] <= target_end}
            fully_paid = bool(target_lessons) and _full_target_paid(context, paid, target_start, target_end, holidays)
            rows.append(AutopayRow(key=f'coverage-{sid}', student=context.student,
                stage='skipped' if fully_paid else 'attention', origin='projection',
                coverage_from=min((lesson[0] for lesson in target_lessons), default=None) if fully_paid else None,
                coverage_through=target_end if fully_paid else None,
                lesson_count=len(target_lessons) if fully_paid else None,
                recorded_payment_method=context.recorded_payment_method, mandate_ready=context.mandate_ready,
                reasons=[reason('PREPAID', 'Already paid for these lessons') if fully_paid
                         else reason('COVERAGE_REVIEW', 'Check payment for every weekly class')],
                enrollment_ids=[b.enrollment_id for b in context.source_blocks if b.payment_status in {'Paid', 'Waived'}
                                and any(target_start <= lesson.date <= target_end for lesson in b.originals)],
                action_url=f'/billing/students/{sid}'))
            continue
        reasons = [reason('DRAFT_NOT_CONFIRMED', 'Confirm the saved enrollment') if queued.origin == 'draft'
                   else reason('ENROLLMENT_NOT_PREPARED', 'Prepare the enrollment')]
        if queued.collection and queued.collection.method == 'manual':
            reasons.append(reason('MANUAL_COLLECTION', 'Collect this enrollment manually'))
        if queued.stage == 'attention':
            reasons.insert(0, reason('ENROLLMENT_REVIEW', 'Check the enrollment records'))
        rows.append(AutopayRow(key=f'prepare-{sid}', student=context.student,
            stage='attention' if queued.stage == 'attention' else 'prepare', origin=queued.origin,
            draft_id=queued.draft_id, collection=queued.collection, coverage_from=queued.first_lesson_date,
            coverage_through=queued.coverage_through, lesson_count=queued.lesson_count,
            total_fee=queued.total_fee, amount_basis='estimate' if queued.total_fee is not None else 'unknown',
            recorded_payment_method=context.recorded_payment_method, mandate_ready=context.mandate_ready,
            reasons=reasons, enrollment_ids=queued.enrollment_ids, action_url=queued.action_url))
    return rows


def _settled_legacy_lessons(db, contexts):
    paid_lessons = defaultdict(set)
    # Old six-session enrollments may cover the early part of a transition
    # month. Their settled original lessons count too. Enrollments linked
    # to any combined payment must instead pass that payment's integrity.
    linked = {eid for eid, in db.query(BillingPaymentLine.enrollment_id).join(
        BillingPayment, BillingPayment.id == BillingPaymentLine.payment_id).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
        BillingAccount.student_id.in_(contexts)).all()} if workflow_storage_enabled() and contexts else set()
    legacy = {b.enrollment_id: (sid, b) for sid, context in contexts.items() for b in context.source_blocks
              if b.enrollment_id not in linked and b.payment_status in {'Paid', 'Waived'}
              and b.originals and len(b.originals) == b.lessons_recorded}
    financial = {sid: status for sid, status in db.query(SessionLog.id, SessionLog.financial_status).filter(
        SessionLog.id.in_({l.id for _, b in legacy.values() for l in b.originals})).all()} if legacy else {}
    for sid, block in legacy.values():
        try:
            slot_time = canonical_time(block.time_slot)
            if (block.first_lesson_date != min(l.date for l in block.originals)
                    or len({l.date for l in block.originals}) != len(block.originals)
                    or any(financial.get(l.id) != block.payment_status
                           or l.status == 'Cancelled' or canonical_time(l.time_slot) != slot_time
                           or (l.location or '').strip() != (block.location or '').strip()
                           or ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')[l.date.weekday()] != block.weekday
                           for l in block.originals)):
                continue
            paid_lessons[sid].update((l.date, slot_time, (block.location or '').strip()) for l in block.originals)
        except BAD_EVIDENCE:
            continue
    return paid_lessons


def _full_target_paid(context, paid_lessons, start, end, holidays):
    if context is None:
        return False
    blocked = {'SOURCE_OWNERSHIP_REVIEW', 'TIMETABLE_CHANGE_REVIEW', 'TOO_MANY_SLOT_CANDIDATES',
               'UNSUPPORTED_SCHEDULE', 'SOURCE_DATE_REVIEW', 'ORIGINAL_COUNT_REVIEW'}
    if any(issue.code in blocked for issue in context.issues):
        return False
    blocks = [b for b in context.source_blocks if b.payment_status != 'Cancelled' and b.originals]
    selected = [c for c in context.slot_candidates if c.selected]
    if not selected:
        return False
    def key(item):
        return ((item.weekday or '')[:3], canonical_time(item.time_slot), (item.location or '').strip())
    try:
        slots = {key(c) for c in selected}
        # Recorded future lessons in another slot cannot disappear because a
        # single paid period happened to be confirmed first.
        slots.update(key(b) for b in blocks if b.first_lesson_date and b.first_lesson_date <= end
                     and b.last_original_date and b.last_original_date >= start)
        for weekday, time, branch in slots:
            sources = [b for b in blocks if key(b) == (weekday, time, branch)]
            if not sources:
                return False
            joined = min(l.date for b in sources for l in b.originals)
            openings = {l.date for b in sources for l in b.originals if l.date in holidays}
            current = max(start, joined)
            index = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun').index(weekday)
            current += timedelta(days=(index - current.weekday()) % 7)
            while current <= end:
                if (current not in holidays or current in openings) and (current, time, branch) not in paid_lessons:
                    return False
                current += timedelta(days=7)
        return True
    except BAD_EVIDENCE:
        return False


def build_autopay_run(db, *, as_of, month, holidays, tutor_id=None, location=None, policy=BillingPolicy()):
    """Read batched evidence. No locks, flushes, record changes or bank actions."""
    confirmed_available = workflow_storage_enabled()
    preparation_available = storage_enabled() or confirmed_available
    target_start = next_month(month)
    target_end = min(month_end(target_start), policy.regular_end)
    rows = []
    confirmed_drafts = set()
    relevant = []
    earlier_debt = set()
    students = {}
    if confirmed_available:
        query = db.query(BillingPayment, BillingAccount.student_id, BillingAccount.active,
                         BillingPreference.payment_method, BillingPreference.mandate_ready).join(
            BillingAccount, BillingAccount.id == BillingPayment.account_id).outerjoin(
            BillingPreference, BillingPreference.account_id == BillingAccount.id).filter(
            BillingAccount.academic_start == policy.academic_start)
        if tutor_id is not None:
            owned = db.query(Enrollment.student_id).filter(
                academic_source_filter(policy), Enrollment.payment_status != 'Cancelled', Enrollment.tutor_id == tutor_id)
            exact_owned = db.query(BillingPaymentLine.payment_id).join(Enrollment,
                Enrollment.id == BillingPaymentLine.enrollment_id).filter(Enrollment.tutor_id == tutor_id,
                    Enrollment.student_id == BillingAccount.student_id,
                    BillingPaymentLine.payment_id == BillingPayment.id).correlate(BillingAccount, BillingPayment)
            query = query.filter(or_(BillingAccount.student_id.in_(owned), exact_owned.exists()))
        if location:
            branch_payments = db.query(BillingPaymentLine.payment_id).join(Enrollment,
                Enrollment.id == BillingPaymentLine.enrollment_id).filter(Enrollment.location == location)
            query = query.filter(BillingPayment.id.in_(branch_payments))
        payments = query.all()
        students = _students(db, {sid for _, sid, _, _, _ in payments})
        for payment, sid, active, method, mandate in payments:
            confirmed_drafts.add(payment.draft_id)
            if sid not in students or not (_raw_autopay(payment) or method == 'autopay'):
                continue
            try:
                review = BillingDraftReview.model_validate(payment.snapshot['review'])
                valid = _shape(review, sid, policy)
                # Never return foreign snapshot amounts, dates or identity.
                if review.student.id != sid:
                    review = None
                window = _window_month(review.period.collection) if review else None
                covers = bool(review and _covers_target(review.period, target_start, target_end))
                due = bool(window == month)
                if (payment.status == 'Pending Payment' and review and review.period.collection.method == 'autopay'
                        and window and window < month):
                    earlier_debt.add(sid)
                if valid and not due and not (covers and window and (window < month or payment.status == 'Paid'
                        or review.period.collection.method == 'manual')):
                    continue
            except BAD_EVIDENCE:
                review, valid, due, covers, window = None, False, False, False, None
            relevant.append((payment, sid, active, method, bool(mandate), review, valid, due, covers, window))
        lines, claims, sessions = _payment_evidence(db, [p.id for p, *_ in relevant])
        due_counts = defaultdict(int)
        for payment, sid, _, _, _, review, valid, due, _, _ in relevant:
            if payment.status == 'Pending Payment' and due:
                due_counts[sid] += 1
            if (payment.status == 'Pending Payment' and review and review.period.collection.method == 'autopay'
                    and _window_month(review.period.collection) and _window_month(review.period.collection) < month):
                earlier_debt.add(sid)
        for payment, sid, active, method, mandate, review, valid, due, covers, window in relevant:
            row = AutopayRow(key=f'payment-{payment.id}', student=students[sid], stage='attention', origin='payment',
                payment_id=payment.id, payment_version=payment.version, payment_status=payment.status,
                draft_id=payment.draft_id, recorded_payment_method=method if method in {'manual', 'autopay'} else None,
                mandate_ready=mandate, sent_at=utc(payment.sent_at) if payment.sent_at else None,
                enrollment_ids=[line.enrollment_id for line, enrollment, _ in lines[payment.id]
                                if enrollment.student_id == sid],
                action_url=f'/billing/students/{sid}?view=payments&payment={payment.id}')
            integrity = []
            if valid:
                try:
                    integrity = payment_integrity(db, payment, review, lines[payment.id],
                        preloaded_claims=claims[payment.id], preloaded_sessions=sessions[payment.id])
                except BAD_EVIDENCE:
                    valid = False
            if valid:
                p = review.period
                row.collection, row.coverage_from, row.coverage_through = p.collection, p.coverage_from, p.coverage_through
                row.lesson_count, row.total_fee, row.amount_basis = p.lesson_count, p.total_fee, 'confirmed'
            if not valid or integrity:
                row.reasons.append(reason('PAYMENT_INTEGRITY', 'Check the confirmed enrollment'))
                # A corrupt total is never presented as an approved amount.
                if not valid:
                    row.total_fee, row.amount_basis = None, 'unknown'
            elif payment.status == 'Cancelled':
                row.stage = 'skipped'
                row.reasons.append(reason('CANCELLED', 'Enrollment cancelled'))
            elif payment.status == 'Paid':
                row.stage = 'skipped'
                row.reasons.append(reason('ALREADY_PAID' if due else 'PREPAID',
                    'Payment already received' if due else 'Already paid for these lessons'))
            elif payment.status != 'Pending Payment':
                row.reasons.append(reason('PAYMENT_STATUS', 'Check the payment status'))
            elif review.period.collection.method != 'autopay':
                row.stage = 'skipped'
                row.reasons.append(reason('MANUAL_COLLECTION', 'Collect this enrollment manually'))
            else:
                if not due:
                    row.reasons.append(reason('EARLIER_PAYMENT_UNPAID', 'Earlier payment still unpaid'))
                if not active:
                    row.reasons.append(reason('ACCOUNT_INACTIVE', 'Check fee scheme setup'))
                if method != 'autopay':
                    row.reasons.append(reason('PREFERENCE_CHANGED', 'Check the saved payment method'))
                if not mandate:
                    row.reasons.append(reason('MANDATE_NOT_READY', 'Check bank authorisation'))
                if not payment.sent_at:
                    row.reasons.append(reason('MESSAGE_NOT_SENT', 'Send the fee message'))
                if (payment.sent_at and review.period.collection.notice_to
                        and utc(payment.sent_at).astimezone(ZoneInfo('Asia/Hong_Kong')).date() > review.period.collection.notice_to):
                    row.reasons.append(reason('MESSAGE_SENT_LATE', 'Check the fee message date'))
                if sid in earlier_debt and due:
                    row.reasons.append(reason('OUTSTANDING_PAYMENT', 'Check the earlier unpaid payment'))
                if (not month.replace(day=20) <= review.period.collection.debit_from <= month.replace(day=22)
                        or not month.replace(day=20) <= review.period.collection.debit_to <= month.replace(day=22)):
                    row.reasons.append(reason('COLLECTION_DATES_REVIEW', 'Check the collection dates'))
                if due_counts[sid] > 1:
                    row.reasons.append(reason('MULTIPLE_DUE_PAYMENTS', 'Check multiple payments in this run'))
                if review.period.collection.debit_to and as_of > review.period.collection.debit_to:
                    row.reasons.append(reason('DEBIT_WINDOW_PASSED', 'Collection dates have passed'))
                if not row.reasons:
                    row.stage = 'ready'
                    row.reasons.append(reason('READY', 'Ready for this collection'))
            rows.append(row)
    # A paid date span is not proof that a second weekly class is also paid.
    # Check the family's current timetable against settled, integrity-checked
    # confirmed lessons before calling a later collection prepaid.
    paid_rows = [r for r in rows if r.stage == 'skipped' and r.payment_status == 'Paid']
    if paid_rows:
        contexts = load_contexts(db, sorted({r.student.id for r in paid_rows}), holidays,
                                 as_of=as_of, basis='include_pending', policy=policy, isolate_invalid=True)
        paid_lessons = _settled_legacy_lessons(db, contexts)
        paid_ids = {r.payment_id for r in paid_rows}
        for payment, sid, _, _, _, review, valid, _, _, _ in relevant:
            if review and payment.id in paid_ids:
                for lesson in review.period.lessons:
                    paid_lessons[sid].add((lesson.date, canonical_time(lesson.time_slot), lesson.location.strip()))
        for row in paid_rows:
            if not _full_target_paid(contexts.get(row.student.id), paid_lessons[row.student.id],
                                     target_start, target_end, holidays):
                row.stage = 'attention'
                row.reasons = [reason('COVERAGE_REVIEW', 'Check payment for every weekly class')]
    excluded = {row.student.id for row in rows}
    if preparation_available:
        rows.extend(_planned(db, as_of=as_of, month=month, holidays=holidays, tutor_id=tutor_id,
                             location=location, policy=policy, excluded=excluded, confirmed_drafts=confirmed_drafts))
    from services.makeup_entitlement import participation_states_for_targets
    targets = set()
    by_payment = {p.id: review for p, _, _, _, _, review, *_ in relevant}
    for row in rows:
        targets.add((row.student.id, as_of))
        collection = row.collection
        if collection and collection.debit_from and collection.debit_to:
            current_day = collection.debit_from
            while current_day <= collection.debit_to:
                targets.add((row.student.id, current_day))
                current_day += timedelta(days=1)
        review = by_payment.get(row.payment_id)
        if review:
            targets.update((row.student.id, lesson.date) for lesson in review.period.lessons)
        elif row.coverage_from and row.coverage_through:
            # Planned amounts remain estimates, so stop/return changes within
            # their proposed period also need an explicit enrollment review.
            targets.add((row.student.id, row.coverage_from))
            targets.add((row.student.id, row.coverage_through))
    participation = participation_states_for_targets(db, targets)
    stopped = defaultdict(set)
    for (sid, _), status in participation.items():
        if status in {'Paused', 'Left'}:
            stopped[sid].add(status)
    for row in rows:
        statuses = stopped[row.student.id]
        if statuses and row.payment_status not in {'Paid', 'Cancelled'}:
            row.stage = 'attention'
            row.reasons = [r for r in row.reasons if r.code != 'READY']
            status = 'Left' if 'Left' in statuses else 'Paused'
            row.reasons.insert(0, reason('STUDENT_PAUSED' if status == 'Paused' else 'STUDENT_LEFT',
                                        'Student paused' if status == 'Paused' else 'Student has left'))
    return rows


def run_response(rows, *, as_of, month, offset=0, limit=50, stage=None, search=None, policy=BillingPolicy()):
    """Summary follows scope/search, while tab and pagination only filter rows."""
    from routers.billing import student_number_order
    if search and search.strip():
        term = search.strip().casefold()
        rows = [r for r in rows if term in r.student.student_name.casefold()
                or term in (r.student.school_student_id or '').casefold()]
    rows.sort(key=lambda r: (student_number_order(r.student), r.key))
    counts = AutopayCounts()
    ready_total = 0
    for row in rows:
        setattr(counts, row.stage, getattr(counts, row.stage) + 1)
        if row.stage == 'ready':
            ready_total += row.total_fee or 0
    if stage:
        rows = [r for r in rows if r.stage == stage]
    return AutopayResponse(as_of=as_of, collection_month=month.strftime('%Y-%m'),
        confirmed_storage_available=workflow_storage_enabled(),
        preparation_available=storage_enabled() or workflow_storage_enabled(),
        notice_from=month.replace(day=12), notice_to=month.replace(day=18),
        debit_from=month.replace(day=20), debit_to=month.replace(day=22),
        counts=counts, ready_total=ready_total, total=len(rows), offset=offset, limit=limit,
        rows=rows[offset:offset + limit])
