"""One read-only renewal task per student, built from batched evidence.

Recorded unpaid work always takes precedence over another projected renewal.
Draft snapshots can help staff find their work, but their detail page must
revalidate them before enrollment creation or message copying.
"""
from collections import defaultdict
from datetime import date, timedelta
import os
from types import SimpleNamespace

from sqlalchemy import and_, or_

from models import Enrollment, Holiday, SessionLog, Tutor
from .calculator import BillingPolicy, month_end, preview_billing
from .context import PENDING
from .drafts import CONFIRMABLE, INFORMATIONAL_CALCULATION, INFORMATIONAL_SOURCE, digest, storage_enabled
from .evidence import academic_source_filter, load_contexts
from .models import BillingAccount, BillingDraft, BillingDraftRevision, BillingPayment, BillingPaymentLine
from .schemas import (
    BillingDraftReview, BillingQueueCounts, BillingQueueEnrollment, BillingQueueRow, BillingSourceBlock,
    CollectionWindow, PreviewIssue, RecordedOriginalLesson,
)
from .workflow import workflow_enabled, workflow_storage_enabled

URGENCY_ORDER = {'now': 0, 'week': 1, 'check_dates': 2, 'later': 3}


def apply_urgency(row, *, as_of):
    """Describe the next task without changing payment or workflow status."""
    row.urgency = 'check_dates'
    row.action_kind = row.action_from = row.action_by = None
    collection = row.collection
    projected = row.origin in {'projection', 'draft'}
    if projected and row.first_lesson_date and row.first_lesson_date <= as_of:
        row.action_kind = 'renewal'
        row.action_from = row.action_by = row.first_lesson_date
    elif collection:
        if row.stage != 'awaiting_payment' and collection.notice_from and collection.notice_to:
            row.action_kind = 'notice'
            row.action_from, row.action_by = collection.notice_from, collection.notice_to
        else:
            row.action_kind = 'renewal' if projected else 'payment'
            row.action_from = collection.debit_from if collection.method == 'autopay' else row.due_date
            row.action_by = row.due_date
    if row.stage == 'no_payment':
        row.urgency = 'later'
    elif row.overdue:
        row.urgency = 'now'
        # A real overdue payment takes precedence over an unsent notice.
        row.action_kind = 'payment'
        row.action_from = collection.debit_from if collection and collection.method == 'autopay' else row.due_date
        row.action_by = row.due_date
    elif row.action_by:
        missed = (row.action_by < as_of if row.action_kind == 'notice'
                  or (collection and collection.method == 'autopay' and not projected)
                  else row.action_by <= as_of)
        row.urgency = 'now' if missed else 'week' if (
            row.action_from or row.action_by) <= as_of + timedelta(days=7) else 'later'
    return row


def queue_available():
    # Preference collection must not replace the existing renewal workflow.
    # A reviewed queue may be enabled separately, including while writes pause.
    enabled = workflow_enabled() or os.getenv('BILLING_RENEWAL_QUEUE_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}
    return enabled and (storage_enabled() or workflow_storage_enabled())


def issue(code, message):
    return PreviewIssue(code=code, message=message)


def structural_checks(context):
    return [i for i in context.issues if i.code not in INFORMATIONAL_SOURCE | CONFIRMABLE]


def preparation_stage(checks):
    # Choosing the parent's method and reviewing a draft are ordinary work in
    # preparing an enrollment. Reserve attention for a problem to resolve.
    normal_steps = {'PAYMENT_PREFERENCE_REQUIRED', 'DRAFT_REVIEW'}
    return 'attention' if any(i.code not in normal_steps for i in checks) else 'prepare'


def collection_dates(collection):
    due = collection.debit_to if collection.method == 'autopay' else collection.due_before_lesson
    # A manual collection can be prepared now without having a notice window.
    # Keep that availability separate from an actual scheduled notice date.
    return collection.notice_from, due


def apply_window(row, *, as_of, through, actual=False):
    """Eligibility never expires when the notice window closes."""
    if row.collection:
        row.prepare_on, row.due_date = collection_dates(row.collection)
    # Keep no-notice work out of earlier collection months without presenting
    # today's date as a scheduled notice to staff.
    eligible_from = row.prepare_on
    if row.collection and eligible_from is None:
        eligible_from = min(as_of, row.due_date or as_of)
    row.ready_now = row.prepare_on is None or row.prepare_on <= as_of
    if actual and row.due_date:
        row.overdue = (as_of > row.due_date if row.payment_method == 'autopay'
                       else as_of >= row.due_date)
    if row.overdue:
        row.stage = 'attention'
        row.note = 'Payment overdue'
    elif eligible_from and eligible_from > through:
        row.stage = 'no_payment'
        row.ready_now = False
        row.note = 'Next collection is later'
    return apply_urgency(row, as_of=as_of)


def base_row(context, **values):
    return BillingQueueRow(
        key=f'student-{context.student.id}', student=context.student,
        recorded_payment_method=context.recorded_payment_method, mandate_ready=context.mandate_ready,
        action_url=f'/billing/students/{context.student.id}', **values,
    )


def projection_row(context, holidays, as_of, through, policy):
    checks = [i for i in context.issues if i.code not in INFORMATIONAL_SOURCE]
    structural = structural_checks(context)
    if structural:
        return base_row(context, stage='attention', origin='projection', ready_now=True,
                        payment_method=context.recorded_payment_method,
                        enrollment_ids=context.selected_enrollment_ids, issues=checks,
                        note='Check the enrollment records')
    selected = [c for c in context.slot_candidates if c.selected]
    complete = bool(selected) and all(
        c.first_uncovered_date is None and c.last_retained_original_date is not None for c in selected
    )
    if complete:
        return base_row(context, stage='no_payment', origin='projection', urgency='later',
                        enrollment_ids=context.selected_enrollment_ids,
                        payment_method=context.recorded_payment_method,
                        coverage_through=policy.regular_end, note='Paid through the teaching year')
    if not context.suggested_request:
        return base_row(context, stage='attention', origin='projection', ready_now=True,
                        enrollment_ids=context.selected_enrollment_ids, issues=checks,
                        note='Check the enrollment dates')
    try:
        preview = preview_billing(context.suggested_request, holidays, policy=policy)
    except ValueError:
        return base_row(context, stage='attention', origin='projection', ready_now=True,
                        enrollment_ids=context.selected_enrollment_ids,
                        issues=checks + [issue('QUEUE_CALCULATION_REVIEW', 'Check the lesson dates and payment settings.')],
                        note='Check the enrollment dates')
    if not preview.periods:
        return base_row(context, stage='attention', origin='projection', ready_now=True,
                        issues=checks, note='Check the next enrollment')
    period = preview.periods[0]
    checks += [i for i in preview.issues if i.code not in INFORMATIONAL_CALCULATION
               and i.period in (None, period.number)
               and not (i.code == 'MANDATE_NOT_READY' and period.collection.method == 'manual')
               and not any(existing.code == i.code for existing in checks)]
    if context.recorded_payment_method is None:
        checks.append(issue('PAYMENT_PREFERENCE_REQUIRED', 'Choose Manual or Autopay.'))
    row = base_row(
        context, stage=preparation_stage(checks), origin='projection',
        payment_method=period.collection.method if context.recorded_payment_method else None,
        collection=period.collection, first_lesson_date=period.first_lesson_date,
        coverage_through=period.coverage_through, lesson_count=period.lesson_count,
        total_fee=period.gross_tuition, amount_basis='tuition_only',
        enrollment_ids=context.selected_enrollment_ids, issues=checks,
        note='Check the next enrollment' if preparation_stage(checks) == 'attention' else 'Prepare the next enrollment',
    )
    row = apply_window(row, as_of=as_of, through=through)
    if context.recorded_payment_method is None:
        # Preparation starts at the same notice window for either method, but
        # the number of months and amount can differ. Do not present the
        # calculator's Manual default as the parent's chosen collection.
        row.collection = None
        row.coverage_through = None
        row.lesson_count = None
        row.total_fee = None
        row.amount_basis = 'unknown'
        row.due_date = None
    return row


def pending_rows(context, payments, payment_enrollments, linked_ids, deadlines, as_of, through):
    rows = []
    for payment in payments:
        if payment.status != 'Pending Payment':
            continue
        review = BillingDraftReview.model_validate(payment.snapshot['review'])
        period = review.period
        row = base_row(
            context, stage='awaiting_payment' if payment.sent_at else 'send', origin='payment',
            payment_method=period.collection.method, collection=period.collection,
            first_lesson_date=period.first_lesson_date, coverage_through=period.coverage_through,
            lesson_count=period.lesson_count, total_fee=period.total_fee, amount_basis='reviewed',
            draft_id=payment.draft_id, payment_id=payment.id, payment_ids=[payment.id],
            enrollment_ids=payment_enrollments[payment.id],
            note='Awaiting payment' if payment.sent_at else 'Send the fee message',
        )
        row.action_url += f'?view=payments&payment={payment.id}'
        rows.append(apply_window(row, as_of=as_of, through=through, actual=True))
    for block in context.source_blocks:
        if block.payment_status not in PENDING or block.enrollment_id in linked_ids:
            continue
        first = min((r.date for r in block.originals), default=block.first_lesson_date)
        due = deadlines.get(block.enrollment_id) or first
        row = base_row(
            context, stage='awaiting_payment' if block.fee_message_marked_sent else 'send', origin='legacy',
            payment_method='manual', collection=CollectionWindow(method='manual', due_before_lesson=due),
            first_lesson_date=first, coverage_through=block.last_original_date,
            lesson_count=len(block.originals) or block.lessons_recorded,
            enrollment_ids=[block.enrollment_id],
            note='Awaiting payment' if block.fee_message_marked_sent else 'Send the fee message',
        )
        row.action_url = f'/enrollments/{block.enrollment_id}'
        if first is None:
            row.stage = 'attention'
            row.issues = [issue('MISSING_ORIGINALS', 'Check the enrollment dates.')]
            row.note = 'Check the enrollment dates'
        rows.append(apply_window(row, as_of=as_of, through=through, actual=True))
    structural = structural_checks(context)
    if structural:
        for row in rows:
            row.stage = 'attention'
            row.ready_now = True
            row.issues = structural
            row.note = 'Check the enrollment records'
    return rows


def combine_pending(context, rows):
    if len(rows) == 1:
        return rows[0]
    relevant = [r for r in rows if r.stage != 'no_payment']
    candidates = relevant or rows
    first = min(candidates, key=lambda r: (r.due_date or date.max, r.enrollment_ids))
    row = first.model_copy(deep=True)
    row.stage = 'attention' if relevant else 'no_payment'
    row.origin = 'payment' if any(r.origin == 'payment' for r in rows) else 'legacy'
    row.payment_id = None
    row.draft_id = None
    row.enrollment_ids = sorted({id_ for r in rows for id_ in r.enrollment_ids})
    row.payment_ids = sorted({id_ for r in rows for id_ in r.payment_ids})
    row.overdue = any(r.overdue for r in rows)
    row.ready_now = any(r.ready_now for r in candidates) if relevant else False
    row.payment_method = first.payment_method if all(r.payment_method == first.payment_method for r in rows) else None
    urgent = min(candidates, key=lambda r: (URGENCY_ORDER[r.urgency], r.action_by or date.max))
    for field in ('urgency', 'action_kind', 'action_from', 'action_by'):
        setattr(row, field, getattr(urgent, field))
    # Separate existing records may overlap. Never advertise their sum as one
    # reviewed collection or imply that their dates form continuous coverage.
    row.collection = None
    row.first_lesson_date = None
    row.coverage_through = None
    row.lesson_count = None
    row.total_fee = None
    row.amount_basis = 'unknown'
    row.issues = structural_checks(context) + [issue('MULTIPLE_UNPAID_ENROLLMENTS', 'Check the unpaid enrollments before preparing another payment.')]
    row.note = 'Check unpaid enrollments'
    row.action_url = f'/billing/students/{context.student.id}?view=' + ('payments' if row.payment_ids else 'enrollments')
    if not row.payment_ids and not context.selected_enrollment_ids:
        row.action_url = first.action_url
    return row


def apply_draft(context, row, drafts, holidays, as_of, through, policy):
    if not drafts or (row.stage == 'no_payment' and row.first_lesson_date is None):
        return row
    # Do not hide an earlier uncovered period behind a later saved scenario.
    candidates = []
    for draft, revision in drafts:
        review = BillingDraftReview.model_validate(revision.snapshot['review'])
        if row.first_lesson_date is None or review.period.first_lesson_date == row.first_lesson_date:
            candidates.append((draft, review))
    if not candidates:
        return row
    draft, review = candidates[0]
    period = review.period
    checks = list(row.issues) + [issue('DRAFT_REVIEW', 'Review the saved draft before creating an enrollment.')]
    if review.policy_version != policy.version or review.calendar_hash != digest(sorted(holidays)):
        checks.append(issue('STALE_DRAFT', 'Refresh the saved draft.'))
    if row.first_lesson_date != period.first_lesson_date:
        checks.append(issue('STALE_DRAFT_COVERAGE', 'Check the draft against the latest enrollment dates.'))
    if len(candidates) > 1:
        checks.append(issue('MULTIPLE_DRAFTS', 'Choose the draft to use.'))
    result = base_row(
        context, stage=preparation_stage(checks), origin='draft',
        payment_method=period.collection.method if context.recorded_payment_method else None,
        collection=period.collection, first_lesson_date=period.first_lesson_date,
        coverage_through=period.coverage_through, lesson_count=period.lesson_count,
        total_fee=period.total_fee, amount_basis='reviewed', draft_id=draft.id,
        enrollment_ids=review.selected_enrollment_ids, issues=checks, note='Review saved draft',
    )
    result.action_url += f'?view=drafts&draft={draft.id}'
    result = apply_window(result, as_of=as_of, through=through)
    # The snapshot may be stale. Current source dates determine urgency.
    for field in ('urgency', 'action_kind', 'action_from', 'action_by'):
        setattr(result, field, getattr(row, field))
    if structural_checks(context):
        result.stage = 'attention'
        result.ready_now = True
        result.first_lesson_date = result.coverage_through = None
        result.total_fee = result.lesson_count = None
        result.amount_basis = 'unknown'
        result.collection = None
        result.prepare_on = result.due_date = None
    return result


def intake_draft_row(context, drafts, holidays, as_of, through, policy):
    """Keep first-enrollment work visible before teaching records exist.

    This row describes a saved calculation. Opening it still revalidates the
    exact trial and intake source before copying or confirming anything.
    """
    candidates = [(draft, BillingDraftReview.model_validate(revision.snapshot['review']))
                  for draft, revision in drafts if revision.snapshot.get('review', {}).get('intake')]
    if not candidates:
        return None
    draft, review = candidates[0]
    period = review.period
    checks = [issue('DRAFT_REVIEW', 'Review the saved draft before creating an enrollment.')]
    checks += [i for i in review.issues if i.code not in (
        INFORMATIONAL_SOURCE | INFORMATIONAL_CALCULATION | set(review.confirmed_checks))
        and i.period in (None, period.number)
        and not (i.code == 'MANDATE_NOT_READY' and period.collection.method == 'manual')
        and not (i.code == 'FIRST_PAYMENT_BELOW_MINIMUM' and review.scenario.adjustment)]
    if context.recorded_payment_method is None:
        checks.append(issue('PAYMENT_PREFERENCE_REQUIRED', 'Choose Manual or Autopay.'))
    if review.policy_version != policy.version or review.calendar_hash != digest(sorted(holidays)):
        checks.append(issue('STALE_DRAFT', 'Refresh the saved draft.'))
    if any(b.payment_status != 'Cancelled' for b in context.source_blocks):
        checks.append(issue('INTAKE_EXISTING_COURSE', 'Check the saved first enrollment against the current enrollments.'))
    if len(candidates) > 1:
        checks.append(issue('MULTIPLE_DRAFTS', 'Choose the draft to use.'))
    row = base_row(
        context, stage=preparation_stage(checks), origin='draft',
        payment_method=period.collection.method, collection=period.collection,
        first_lesson_date=period.first_lesson_date, coverage_through=period.coverage_through,
        lesson_count=period.lesson_count, total_fee=period.total_fee, amount_basis='reviewed',
        draft_id=draft.id, enrollment_ids=[], issues=checks, note='Review saved draft',
    )
    row.action_url = f'/billing/preview?student_id={context.student.id}&draft_id={draft.id}'
    return apply_window(row, as_of=as_of, through=through)


def pending_history(db, contexts, holidays):
    """Keep older, trial and summer collection work visible without forecasting it.

    Current-year Regular facts still determine future renewals. These additional
    sources are only existing unpaid enrollments, so replacing the old reminders
    cannot silently lose a family's earlier outstanding payment.
    """
    rows = db.query(
        Enrollment.id, Enrollment.student_id, Enrollment.tutor_id, Tutor.tutor_name,
        Enrollment.assigned_day, Enrollment.assigned_time, Enrollment.location,
        Enrollment.first_lesson_date, Enrollment.lessons_paid, Enrollment.payment_status,
        Enrollment.payment_date, Enrollment.fee_message_sent, Enrollment.renewed_from_enrollment_id,
        Enrollment.is_new_student, Enrollment.payment_deadline,
    ).join(Tutor, Tutor.id == Enrollment.tutor_id).filter(
        Enrollment.student_id.in_(list(contexts)), Enrollment.payment_status.in_(PENDING),
    ).all()
    known = {b.enrollment_id for c in contexts.values() for b in c.source_blocks}
    additional = {r.id: r for r in rows if r.id not in known}
    originals = defaultdict(list)
    if additional:
        lessons = db.query(
            SessionLog.id, SessionLog.enrollment_id, SessionLog.student_id,
            SessionLog.session_date, SessionLog.session_status, SessionLog.time_slot, SessionLog.location,
        ).filter(SessionLog.enrollment_id.in_(list(additional)), SessionLog.make_up_for_id.is_(None),
                 SessionLog.session_status != 'Cancelled').all()
        for lesson in lessons:
            source = additional[lesson.enrollment_id]
            context = contexts[source.student_id]
            if lesson.student_id != source.student_id:
                if not any(i.code == 'SOURCE_OWNERSHIP_REVIEW' for i in context.issues):
                    context.issues.append(issue('SOURCE_OWNERSHIP_REVIEW', 'Check which student owns the lesson records.'))
                continue
            originals[source.id].append(RecordedOriginalLesson(
                id=lesson.id, date=lesson.session_date, status=lesson.session_status,
                holiday=lesson.session_date in holidays, time_slot=lesson.time_slot, location=lesson.location,
            ))
    for source in additional.values():
        context = contexts[source.student_id]
        roots = sorted(originals[source.id], key=lambda r: (r.date, r.id))
        if len(roots) != source.lessons_paid:
            context.issues.append(issue('ORIGINAL_COUNT_REVIEW', 'Check the unpaid enrollment’s session count.'))
        context.source_blocks.append(BillingSourceBlock(
            enrollment_id=source.id, tutor_id=source.tutor_id, tutor_name=source.tutor_name,
            weekday=source.assigned_day, time_slot=source.assigned_time, location=source.location,
            first_lesson_date=source.first_lesson_date, lessons_recorded=source.lessons_paid,
            payment_status=source.payment_status, payment_date=source.payment_date,
            fee_message_marked_sent=bool(source.fee_message_sent),
            renewed_from_enrollment_id=source.renewed_from_enrollment_id, is_new_student=bool(source.is_new_student),
            originals=roots, last_original_date=roots[-1].date if roots else None, makeup_dates=[],
        ))
    return {r.id: r.payment_deadline for r in rows}


def attach_current_enrollments(db, rows, contexts, linked_ids, as_of):
    """Restore the familiar card's enrollment facts with bounded reads.

    Expiry uses the existing enrollment calculation. Paid coverage and remaining
    original sessions use recorded roots, so makeups and extensions cannot
    become additional prepaid tuition in the renewal proposal.
    """
    from routers.enrollments import bulk_load_summer_end_dates, calculate_effective_end_date_bulk

    ids = {id_ for row in rows for id_ in row.enrollment_ids}
    if not ids:
        return
    facts = db.query(
        Enrollment.id, Enrollment.student_id, Enrollment.first_lesson_date, Enrollment.lessons_paid,
        Enrollment.deadline_extension_weeks, Enrollment.enrollment_type, Enrollment.summer_application_id,
    ).filter(Enrollment.id.in_(ids)).all()
    if not facts:
        return
    first_dates = [e.first_lesson_date for e in facts if e.first_lesson_date]
    holidays = {}
    if first_dates:
        through = max(e.first_lesson_date + timedelta(weeks=max(
            30, 2 * ((e.lessons_paid or 0) + (e.deadline_extension_weeks or 0)),
        )) for e in facts if e.first_lesson_date)
        holidays = {day: True for day, in db.query(Holiday.holiday_date).filter(
            Holiday.holiday_date >= min(first_dates), Holiday.holiday_date <= through,
        ).all()}
    enrollment_facts = {e.id: SimpleNamespace(**dict(e._mapping)) for e in facts}
    one_time = [e.id for e in facts if e.enrollment_type == 'One-Time']
    if one_time:
        for id_ in one_time:
            enrollment_facts[id_].sessions = []
        for lesson in db.query(SessionLog.enrollment_id, SessionLog.student_id,
                               SessionLog.session_date, SessionLog.session_status).filter(
            SessionLog.enrollment_id.in_(one_time),
        ).all():
            fact = enrollment_facts[lesson.enrollment_id]
            if lesson.student_id == fact.student_id:
                fact.sessions.append(SimpleNamespace(session_date=lesson.session_date,
                                                      session_status=lesson.session_status))
    summer_ends = bulk_load_summer_end_dates(db, list(enrollment_facts.values()))
    for row in rows:
        context = contexts[row.student.id]
        blocks = {b.enrollment_id: b for b in context.source_blocks}
        summaries = []
        for id_ in row.enrollment_ids:
            block = blocks.get(id_)
            fact = enrollment_facts.get(id_)
            if block is None or fact is None or block.payment_status == 'Cancelled':
                continue
            if id_ in linked_ids:
                # Confirmed enrollments use their exact claimed originals,
                # including when workflow writes have subsequently been paused.
                expiry = block.last_original_date or block.first_lesson_date
            else:
                expiry = calculate_effective_end_date_bulk(fact, holidays, summer_ends)
            def slot(source):
                return ((source.weekday or '')[:3], (source.time_slot or '').strip(),
                        (source.location or '').strip())

            same_slot = [b for b in context.source_blocks if slot(b) == slot(block)]
            paid = [lesson.date for b in same_slot if b.payment_status in {'Paid', 'Waived'}
                    for lesson in b.originals]
            summaries.append(BillingQueueEnrollment(
                enrollment_id=id_, tutor_id=block.tutor_id, tutor_name=block.tutor_name,
                weekday=block.weekday, time_slot=block.time_slot, location=block.location,
                first_lesson_date=block.first_lesson_date, effective_end_date=expiry,
                last_original_date=block.last_original_date, last_paid_original_date=max(paid, default=None),
                payment_status=block.payment_status, lesson_count=block.lessons_recorded,
                sessions_remaining=sum(lesson.status == 'Scheduled' and lesson.date >= as_of for lesson in block.originals),
                fee_message_marked_sent=block.fee_message_marked_sent,
            ))
        row.current_enrollments = sorted(summaries, key=lambda e: (
            e.weekday or '', e.time_slot or '', e.location or '', e.enrollment_id,
        ))


def build_queue(db, *, as_of, collection_month, holidays, tutor_id=None, location=None,
                policy=BillingPolicy()):
    """Every list and reminder uses this same batched classification."""
    through = month_end(date.fromisoformat(collection_month + '-01'))
    query = db.query(Enrollment.student_id).filter(or_(
        and_(academic_source_filter(policy), Enrollment.payment_status != 'Cancelled'),
        Enrollment.payment_status.in_(PENDING),
    ))
    if tutor_id is not None:
        query = query.filter(Enrollment.tutor_id == tutor_id)
    if location:
        query = query.filter(Enrollment.location == location)
    ids = {r[0] for r in query.distinct().all()}
    current = db.query(BillingDraft, BillingDraftRevision, BillingAccount.student_id).join(
        BillingAccount, BillingAccount.id == BillingDraft.account_id,
    ).join(BillingDraftRevision, and_(BillingDraftRevision.draft_id == BillingDraft.id,
                                   BillingDraftRevision.revision == BillingDraft.current_revision)).filter(
        BillingAccount.academic_start == policy.academic_start,
    ).order_by(BillingDraftRevision.created_at.desc(), BillingDraft.id).all()
    intake_candidates = {}
    for draft, revision, student_id in current:
        saved = revision.snapshot.get('review', {})
        if (revision.snapshot.get('state') == 'discarded' or not saved.get('intake')
                or saved.get('student', {}).get('id') != student_id):
            continue
        if location and not any(s.get('location') == location for s in saved.get('scenario', {}).get('slots', [])):
            continue
        intake_candidates[draft.id] = (student_id, saved['intake'])
    intake_ids = {student_id for student_id, _ in intake_candidates.values()}
    intake_draft_ids = set(intake_candidates)
    if tutor_id is not None and intake_ids:
        # A proposed tutor in a saved draft does not grant access to a student.
        # Use current teaching/trial ownership, as the intake reader does.
        owned_history = {r[0] for r in db.query(Enrollment.student_id).filter(
            Enrollment.student_id.in_(intake_ids), Enrollment.tutor_id == tutor_id,
            Enrollment.payment_status != 'Cancelled',
        ).all()}
        owned_trials = {(student_id, enrollment_id, session_id) for student_id, enrollment_id, session_id in db.query(
            Enrollment.student_id, Enrollment.id, SessionLog.id,
        ).join(SessionLog, SessionLog.enrollment_id == Enrollment.id).filter(
            Enrollment.student_id.in_(intake_ids), SessionLog.student_id == Enrollment.student_id,
            Enrollment.enrollment_type == 'Trial', Enrollment.payment_status != 'Cancelled',
            or_(Enrollment.tutor_id == tutor_id, SessionLog.tutor_id == tutor_id),
        ).all()}
        intake_draft_ids = {draft_id for draft_id, (student_id, source) in intake_candidates.items()
                            if ((student_id, source.get('trial_enrollment_id'), source.get('trial_session_id')) in owned_trials
                                if source.get('trial_enrollment_id') else student_id in owned_history)}
        intake_ids = {intake_candidates[draft_id][0] for draft_id in intake_draft_ids}
    ids.update(intake_ids)
    ids = sorted(ids)
    if not ids:
        return []
    contexts = load_contexts(db, ids, holidays, as_of=as_of, basis='include_pending', policy=policy,
                             isolate_invalid=True)
    deadlines = pending_history(db, contexts, holidays)
    payments = defaultdict(list)
    payment_enrollments = defaultdict(list)
    linked_ids = set()
    confirmed_drafts = set()
    if workflow_storage_enabled():
        payment_rows = db.query(BillingPayment, BillingAccount.student_id).join(
            BillingAccount, BillingAccount.id == BillingPayment.account_id,
        ).filter(BillingAccount.student_id.in_(ids), BillingAccount.academic_start == policy.academic_start).all()
        for payment, student_id in payment_rows:
            payments[student_id].append(payment)
            confirmed_drafts.add(payment.draft_id)
        if payment_rows:
            for payment_id, enrollment_id in db.query(BillingPaymentLine.payment_id, BillingPaymentLine.enrollment_id).filter(
                BillingPaymentLine.payment_id.in_([p.id for p, _ in payment_rows]),
            ).all():
                payment_enrollments[payment_id].append(enrollment_id)
                linked_ids.add(enrollment_id)
    drafts = defaultdict(list)
    for draft, revision, student_id in current:
        if revision.snapshot.get('review', {}).get('intake') and draft.id not in intake_draft_ids:
            continue
        if student_id in ids and draft.id not in confirmed_drafts and revision.snapshot.get('state') != 'discarded':
            drafts[student_id].append((draft, revision))
    rows = []
    for context in contexts.values():
        pending = pending_rows(context, payments[context.student.id], payment_enrollments,
                               linked_ids, deadlines, as_of, through)
        if pending:
            rows.append(combine_pending(context, pending))
        else:
            first = intake_draft_row(context, drafts[context.student.id], holidays, as_of, through, policy)
            if first is not None:
                rows.append(first)
            else:
                row = projection_row(context, holidays, as_of, through, policy)
                rows.append(apply_draft(context, row, drafts[context.student.id], holidays, as_of, through, policy))
    # A recorded stop holds unconfirmed renewals. Existing unpaid payments
    # remain collection tasks and are never cancelled by a participation action.
    from services.makeup_entitlement import participation_states_for_students
    participation = participation_states_for_students(db, ids, as_of=as_of)
    for row in rows:
        status = participation.get(row.student.id)
        if status in {'Paused', 'Left'} and row.origin in {'projection', 'draft'} and not row.payment_ids:
            row.stage = 'no_payment'
            row.ready_now = False
            row.note = 'Student paused' if status == 'Paused' else 'Student has left'
    attach_current_enrollments(db, rows, contexts, linked_ids, as_of)
    return rows


def queue_counts(rows):
    counts = BillingQueueCounts(total=len(rows))
    for row in rows:
        setattr(counts, row.stage, getattr(counts, row.stage) + 1)
        counts.overdue += int(row.overdue)
        counts.actionable += int(row.ready_now and not row.overdue and row.stage in {'prepare', 'send', 'attention'})
    return counts
