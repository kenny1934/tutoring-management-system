"""Academic-year makeup rights and separately audited course participation.

The source lesson keeps its enrollment, revenue and payment identity. Booking
eligibility never creates tuition coverage or settles an outstanding payment.
"""
from collections import defaultdict
from bisect import bisect_right
from datetime import date, timedelta
import os
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import or_

from billing.calculator import BillingPolicy, DAYS
from billing.drafts import DraftConflict, DraftNotFound, digest, utc
from billing.models import BillingAccount, BillingPayment, BillingPaymentLine, utc_now
from models import Enrollment, Holiday, SessionLog, Student, Tutor
from makeup_models import MakeupParticipation, MakeupParticipationEvent
from makeup_schemas import (
    MakeupEligibility, MakeupParticipationBlock, PaidReturnCandidate, ParticipationBooking, ParticipationChange,
    ParticipationDetail, ParticipationHistory, ParticipationPreview,
)

POLICY = BillingPolicy()
SETTLED = {'Paid', 'Waived'}
COMPLETED = {'Attended', 'Attended (Make-up)'}


def _flag(name):
    return os.getenv(name, '').strip().lower() in {'1', 'true', 'yes', 'on'}


def entitlement_enabled():
    return _flag('MAKEUP_ENTITLEMENT_ENABLED')


def storage_enabled():
    return entitlement_enabled() or _flag('MAKEUP_ENTITLEMENT_STORAGE_ENABLED')


def _today():
    from billing.clock import today
    return today()


def invalidate_makeup_entitlements(db):
    for key in list(db.info):
        if key.startswith('makeup_entitlement_'):
            db.info.pop(key, None)


def lock_makeup_entitlement_session(db, session_id):
    """Take the common student/account locks before any source or proposal lock."""
    if not entitlement_enabled():
        return
    owner = db.query(SessionLog.student_id).filter(SessionLog.id == session_id).first()
    if owner is None:
        return
    db.query(Student.id).filter(Student.id == owner.student_id).with_for_update().first()
    account = db.query(BillingAccount).filter(BillingAccount.student_id == owner.student_id,
        BillingAccount.academic_start == POLICY.academic_start).populate_existing().with_for_update().first()
    if account is not None:
        db.info.setdefault('makeup_entitlement_locked_accounts', {})[owner.student_id] = account


def academic_policy_students(db, student_ids, *, source_dates=None):
    if not entitlement_enabled():
        return set()
    ids = set(student_ids)
    key = f'makeup_entitlement_cohort_{POLICY.academic_start}'
    cache = db.info.setdefault(key, {})
    missing = ids - cache.keys()
    if missing:
        active = {row[0] for row in db.query(BillingAccount.student_id).filter(
            BillingAccount.student_id.in_(missing), BillingAccount.academic_start == POLICY.academic_start,
            BillingAccount.active.is_(True),
        ).all()}
        cache.update({sid: sid in active for sid in missing})
    result = {sid for sid in ids if cache[sid]}
    if source_dates is not None:
        result = {sid for sid in result if source_dates.get(sid) is None or
                  POLICY.academic_start <= source_dates[sid] <= POLICY.regular_end}
    return result


def academic_policy_applies(db, student_id, source_date=None):
    if source_date is not None and not POLICY.academic_start <= source_date <= POLICY.regular_end:
        return False
    return student_id in academic_policy_students(db, [student_id])


def participation_states_for_students(db, student_ids, *, as_of=None):
    when = as_of or _today()
    return {sid: status for (sid, _), status in participation_states_for_targets(
        db, ((sid, when) for sid in student_ids),
    ).items()}


def participation_states_for_targets(db, targets):
    """Read participation for several dates without repeating database queries.

    A collection can precede a recorded pause, while the lessons it pays for
    fall during that pause. Read the same dated history for both decisions.
    """
    targets = set(targets)
    active = academic_policy_students(db, {sid for sid, _ in targets})
    if not active:
        return {}
    headers = db.query(MakeupParticipation.id, MakeupParticipation.student_id).filter(
        MakeupParticipation.student_id.in_(active), MakeupParticipation.academic_start == POLICY.academic_start,
    ).all()
    owners = {row.id: row.student_id for row in headers}
    events = db.query(MakeupParticipationEvent).filter(
        MakeupParticipationEvent.participation_id.in_(owners),
    ).all() if owners else []
    grouped = defaultdict(list)
    for event in events:
        grouped[owners[event.participation_id]].append(event)
    return {(sid, when): state.status if (state := _state(grouped[sid], when)) else 'Active'
            for sid, when in targets if sid in active}


def _query(query, locked):
    return query.populate_existing().with_for_update() if locked else query


def _facts(db, student_ids, *, locked=False):
    """A fixed set of batched reads, including all parents and payment facts."""
    ids = sorted(set(student_ids))
    enrollments = _query(db.query(Enrollment).filter(Enrollment.student_id.in_(ids)).order_by(Enrollment.id), locked).all()
    enrollment_ids = [e.id for e in enrollments]
    sessions = _query(db.query(SessionLog).filter(or_(SessionLog.student_id.in_(ids),
        SessionLog.enrollment_id.in_(enrollment_ids))).order_by(SessionLog.id), locked).all()
    headers = _query(db.query(MakeupParticipation).filter(MakeupParticipation.student_id.in_(ids),
        MakeupParticipation.academic_start == POLICY.academic_start).order_by(MakeupParticipation.id), locked).all()
    events = _query(db.query(MakeupParticipationEvent).filter(
        MakeupParticipationEvent.participation_id.in_([h.id for h in headers])
    ).order_by(MakeupParticipationEvent.version), locked).all() if headers else []
    payments = _query(db.query(BillingPaymentLine, BillingPayment).join(
        BillingPayment, BillingPayment.id == BillingPaymentLine.payment_id,
    ).filter(BillingPaymentLine.enrollment_id.in_(enrollment_ids)).order_by(BillingPaymentLine.id), locked).all() if enrollment_ids else []
    holidays = {row[0] for row in db.query(Holiday.holiday_date).filter(
        Holiday.holiday_date >= POLICY.academic_start, Holiday.holiday_date <= POLICY.regular_end,
    ).all()}
    by_student, by_enrollment, courses, event_groups = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    original_dates = defaultdict(list)
    for enrollment in enrollments:
        courses[enrollment.student_id].append(enrollment)
    for session in sessions:
        by_student[session.student_id].append(session)
        by_enrollment[session.enrollment_id].append(session)
        if session.make_up_for_id is None and session.session_status != 'Cancelled':
            key = (session.student_id, DAYS[session.session_date.weekday()],
                   (session.time_slot or '').strip(), (session.location or '').strip())
            original_dates[key].append(session.session_date)
    for item in events:
        event_groups[item.participation_id].append(item)
    return {'enrollments': {e.id: e for e in enrollments}, 'sessions': {s.id: s for s in sessions},
            'headers': {h.student_id: h for h in headers}, 'events': events,
            'payments': {line.enrollment_id: (line, payment) for line, payment in payments}, 'holidays': holidays,
            'sessions_by_student': by_student, 'sessions_by_enrollment': by_enrollment,
            'enrollments_by_student': courses, 'events_by_header': event_groups,
            'original_dates_by_schedule': {key: sorted(days) for key, days in original_dates.items()}}


def _events(facts, student_id):
    header = facts['headers'].get(student_id)
    return facts['events_by_header'].get(header.id, []) if header else []


def _state(events, when):
    effective = [e for e in events if e.effective_on <= when]
    return max(effective, key=lambda e: (e.effective_on, e.version)) if effective else None


def _participation_blocks(events):
    days = {}
    for event in events:
        if event.effective_on not in days or event.version > days[event.effective_on].version:
            days[event.effective_on] = event
    timeline = [days[day] for day in sorted(days)]
    result = []
    for index, event in enumerate(timeline):
        through = timeline[index + 1].effective_on - timedelta(days=1) if index + 1 < len(timeline) else POLICY.makeup_end
        if event.status != 'Active' and event.effective_on <= POLICY.makeup_end and through >= POLICY.academic_start:
            result.append(MakeupParticipationBlock(from_date=max(event.effective_on, POLICY.academic_start),
                through_date=min(through, POLICY.makeup_end), status=event.status))
    return result


def _resolve_root(facts, session):
    current, seen = session, set()
    while True:
        if current.id in seen:
            return None, 'The makeup chain contains a cycle. Check the original lesson links.'
        seen.add(current.id)
        if current.student_id != session.student_id or current.enrollment_id != session.enrollment_id:
            return None, 'The makeup and original lesson belong to different students or enrollments.'
        if not current.make_up_for_id:
            return current, None
        parent = facts['sessions'].get(current.make_up_for_id)
        if parent is None:
            return None, 'The original lesson is missing. Check the makeup link.'
        if current.session_status != 'Cancelled' and (parent.rescheduled_to_id != current.id or
                                                     'Make-up Booked' not in parent.session_status):
            return None, 'The makeup and its original have inconsistent booking links.'
        current = parent


def _root(facts, session):
    cache = facts.setdefault('_roots', {})
    if session.id not in cache:
        cache[session.id] = _resolve_root(facts, session)
    return cache[session.id]


def _ancestry_ids(facts, session):
    cache = facts.setdefault('_ancestry_ids', {})
    if session.id in cache:
        return cache[session.id]
    ids = set()
    current = session
    while current and current.id not in ids:
        ids.add(current.id)
        current = facts['sessions'].get(current.make_up_for_id) if current.make_up_for_id else None
    cache[session.id] = ids
    return ids


def _descendants(facts, student_id, root_id):
    grouped = facts.setdefault('_descendants', {})
    if student_id not in grouped:
        by_ancestor = defaultdict(list)
        for session in facts['sessions_by_student'].get(student_id, []):
            if not session.make_up_for_id or session.session_status == 'Cancelled':
                continue
            for ancestor_id in _ancestry_ids(facts, session) - {session.id}:
                by_ancestor[ancestor_id].append(session)
        grouped[student_id] = by_ancestor
    return grouped[student_id].get(root_id, [])


def _build_intervals(facts, student_id):
    """Return verified settled coverage; legacy dates never gain extension weeks."""
    intervals, problems = [], []
    for enrollment in facts['enrollments_by_student'].get(student_id, []):
        if enrollment.enrollment_type != 'Regular' or enrollment.payment_status not in SETTLED:
            continue
        originals = sorted([s for s in facts['sessions_by_enrollment'].get(enrollment.id, [])
                            if s.make_up_for_id is None and s.session_status != 'Cancelled'], key=lambda s: (s.session_date, s.id))
        if not originals or not any(POLICY.academic_start <= s.session_date <= POLICY.regular_end for s in originals):
            continue
        if (any(s.student_id != student_id or s.financial_status not in SETTLED for s in originals)
                or len(originals) != enrollment.lessons_paid):
            problems.append('A paid enrollment’s lesson records need review.')
            continue
        linked = facts['payments'].get(enrollment.id)
        payment_id = None
        start, through = originals[0].session_date, originals[-1].session_date
        continuity = through
        if linked:
            line, payment = linked
            try:
                period = payment.snapshot['review']['period']
                expected = {(date.fromisoformat(l['date']), l['time_slot'], l['location'])
                            for l in period['lessons'] if l['slot'] == line.slot_index}
                actual = {(s.session_date, s.time_slot, s.location) for s in originals}
                if (payment.status != 'Paid' or payment.snapshot['review']['student']['id'] != student_id
                        or line.lesson_count != len(originals) or expected != actual
                        or line.lesson_count != period['counts_by_slot'][line.slot_index]
                        or line.tuition_amount != enrollment.revenue_total):
                    raise ValueError()
                through = date.fromisoformat(period['coverage_through'])
                if through < originals[-1].session_date or through > POLICY.regular_end:
                    raise ValueError()
                if period['kind'] not in {'first', 'legacy', 'adjusted_manual'}:
                    # A partial transition/return must not become paid before
                    # its real start. Month-start coverage is established only
                    # when this line includes the first teaching occurrence.
                    slots = payment.snapshot['review'].get('scenario', {}).get('slots', [])
                    slot = slots[line.slot_index] if line.slot_index < len(slots) else {}
                    weekday = slot.get('weekday', (enrollment.assigned_day or '')[:3])
                    openings = {date.fromisoformat(day) for day in slot.get('holiday_exceptions', [])}
                    if weekday in DAYS:
                        first_month = start.replace(day=1)
                        expected_first = first_month + timedelta(days=(DAYS.index(weekday) - first_month.weekday()) % 7)
                        while expected_first in facts['holidays'] and expected_first not in openings:
                            expected_first += timedelta(days=7)
                        if start == expected_first:
                            start = first_month
                continuity, payment_id = through, payment.id
            except (KeyError, IndexError, TypeError, ValueError):
                problems.append('The paid enrollment no longer matches its reviewed payment.')
                continue
        else:
            weekday = (enrollment.assigned_day or '')[:3]
            schedule = (weekday, (enrollment.assigned_time or '').strip(), (enrollment.location or '').strip())
            if (weekday not in DAYS or any((DAYS[s.session_date.weekday()], (s.time_slot or '').strip(),
                    (s.location or '').strip()) != schedule for s in originals)):
                problems.append('The paid enrollment’s continuing timetable needs review.')
                continue
            # The ordinary gap before the next weekly lesson is continuity,
            # while paid_through remains the last actual prepaid lesson.
            recorded_dates = facts['original_dates_by_schedule'].get((student_id, *schedule), [])
            next_index = bisect_right(recorded_dates, through)
            next_due = through + timedelta(days=7)
            while next_due in facts['holidays']:
                next_due += timedelta(days=7)
            if next_index < len(recorded_dates):
                next_due = min(next_due, recorded_dates[next_index])
            continuity = min(next_due - timedelta(days=1), POLICY.regular_end)
        intervals.append({'enrollment_id': enrollment.id, 'payment_id': payment_id,
            'from': start, 'through': through, 'continuity': continuity, 'paid_on': enrollment.payment_date})
    return intervals, problems


def _intervals(facts, student_id):
    cache = facts.setdefault('_intervals', {})
    if student_id not in cache:
        cache[student_id] = _build_intervals(facts, student_id)
    return cache[student_id]


def _paid(facts, student_id, as_of):
    cache = facts.setdefault('_paid', {})
    if (student_id, as_of) in cache:
        return cache[(student_id, as_of)]
    intervals, problems = _intervals(facts, student_id)
    current = [item for item in intervals if item['from'] <= as_of <= item['continuity']]
    paid_through = max((item['through'] for item in current), default=None)
    if current:
        continuity = max(item['continuity'] for item in current)
        while True:
            connected = [item for item in intervals if item['from'] <= continuity + timedelta(days=1)
                         and item['continuity'] >= as_of]
            expanded = max(item['continuity'] for item in connected)
            paid_through = max(item['through'] for item in connected)
            if expanded == continuity:
                break
            continuity = expanded
    result = paid_through, bool(current), intervals, problems
    cache[(student_id, as_of)] = result
    return result


def _eligibility(facts, session, *, as_of, target_date=None):
    root, error = _root(facts, session)
    enrollment = facts['enrollments'].get(session.enrollment_id)
    if session.summer_session_id is not None or (enrollment and enrollment.enrollment_type != 'Regular'):
        return None
    if root and not POLICY.academic_start <= root.session_date <= POLICY.regular_end:
        return None
    paid_through, current_paid, intervals, payment_problems = _paid(facts, session.student_id, as_of)
    result = MakeupEligibility(status='available', can_book=True, valid_until=POLICY.makeup_end,
        paid_through=paid_through, root_session_id=root.id if root else None,
        participation_blocks=_participation_blocks(_events(facts, session.student_id)))

    def block(status, code, reason):
        updates = {'status': status, 'can_book': False, 'reason_code': code, 'reason': reason}
        if code == 'MAKEUP_SOURCE_REVIEW':
            updates.update(valid_until=None, root_session_id=None)
        return result.model_copy(update=updates)

    if error or enrollment is None:
        return block('needs_review', 'MAKEUP_SOURCE_REVIEW', error or 'The source enrollment is missing.')
    if session.session_status == 'Cancelled':
        return block('needs_review', 'MAKEUP_CANCELLED_HISTORY', 'This booking was cancelled. Rebook from the pending original lesson.')
    if session.session_status in COMPLETED:
        return block('needs_review', 'MAKEUP_ALREADY_USED', 'This lesson is already attended. Keep its attendance history.')
    if session.session_status == 'Make-up Class' and session.make_up_for_id is None:
        return block('needs_review', 'MAKEUP_SOURCE_REVIEW', 'This makeup has no original lesson link.')
    if enrollment.student_id != session.student_id or root.session_status == 'Cancelled' or enrollment.payment_status == 'Cancelled':
        return block('needs_review', 'MAKEUP_SOURCE_REVIEW', 'The original lesson or enrollment was cancelled or reassigned.')
    if as_of > POLICY.makeup_end or root.session_date > POLICY.makeup_end or (target_date and target_date > POLICY.makeup_end):
        return block('expired', 'MAKEUP_YEAR_ENDED', 'Regular-course makeups must take place by 30 June of their original teaching year.')
    if target_date and target_date < root.session_date:
        # Revision may consume a future Scheduled lesson. That route already
        # distinguishes a pending makeup from deliberate advance consumption.
        if 'Pending Make-up' in session.session_status or session.make_up_for_id:
            return block('needs_review', 'MAKEUP_BEFORE_ORIGINAL', 'Choose a makeup date on or after the original missed lesson.')
    if enrollment.payment_status not in SETTLED or root.financial_status not in SETTLED:
        return block('payment_required', 'MAKEUP_SOURCE_UNPAID', 'Record payment for the original enrollment before booking its makeup.')
    if enrollment.id not in {item['enrollment_id'] for item in intervals}:
        return block('needs_review', 'MAKEUP_PAYMENT_REVIEW', 'The original enrollment’s paid lesson records need review.')
    ancestry = _ancestry_ids(facts, session)
    descendants = [s for s in _descendants(facts, session.student_id, root.id) if s.id != session.id]
    for descendant in descendants:
        if descendant.session_status in COMPLETED:
            return block('needs_review', 'MAKEUP_ALREADY_USED', 'This original lesson already has an attended makeup. Check its history.')
        if descendant.id not in ancestry and descendant.rescheduled_to_id is None:
            return block('needs_review', 'MAKEUP_ALREADY_BOOKED', 'This original lesson has another live or pending makeup. Check its booking history.')
    events = _events(facts, session.student_id)
    state = _state(events, as_of)
    target_state = _state(events, target_date) if target_date else None
    blocked_state = state if state and state.status != 'Active' else target_state if target_state and target_state.status != 'Active' else None
    if blocked_state:
        return block('paused' if blocked_state.status == 'Paused' else 'left', 'MAKEUP_PARTICIPATION_REQUIRED',
                     'This student is paused. Confirm their paid return before booking.' if blocked_state.status == 'Paused'
                     else 'This student has left. Confirm their paid return before booking.')
    if not current_paid:
        if payment_problems:
            return block('needs_review', 'MAKEUP_PAYMENT_REVIEW', payment_problems[0])
        return block('payment_required', 'MAKEUP_CURRENT_PAYMENT_REQUIRED', 'The next regular enrollment needs payment before another makeup can be booked.')
    if target_date and paid_through and target_date > paid_through:
        result.advance_booking = True
        result.reason_code = 'MAKEUP_ADVANCE_BOOKING'
        result.reason = 'This makeup is booked ahead of paid coverage. Review it if the target period remains unpaid.'
    return result


def eligibility_for_targets(db, targets, *, as_of=None):
    if not entitlement_enabled() or not targets:
        return {}
    as_of = as_of or _today()
    session_ids = {sid for sid, _ in targets}
    owners = db.query(SessionLog.id, SessionLog.student_id).filter(SessionLog.id.in_(set(session_ids))).all()
    active = academic_policy_students(db, [row.student_id for row in owners])
    if not active:
        return {}
    facts = _facts(db, active)
    result = {}
    owner_map = {row.id: row.student_id for row in owners}
    for sid, target_date in set(targets):
        student_id = owner_map.get(sid)
        if student_id not in active:
            continue
        outcome = _eligibility(facts, facts['sessions'][sid], as_of=as_of, target_date=target_date)
        if outcome:
            result[(sid, target_date)] = outcome
    return result


def eligibility_for_sessions(db, session_ids, *, target_date=None, as_of=None):
    results = eligibility_for_targets(db, [(sid, target_date) for sid in session_ids], as_of=as_of)
    return {sid: outcome for (sid, _), outcome in results.items()}


def assert_makeup_entitlement(db, session, target_date, *, as_of=None):
    if not entitlement_enabled():
        return False
    # Match every financial writer's student/account lock order. These current
    # reads also protect old source enrollments that have no combined payment.
    db.query(Student.id).filter(Student.id == session.student_id).with_for_update().first()
    account = db.query(BillingAccount).filter(BillingAccount.student_id == session.student_id,
        BillingAccount.academic_start == POLICY.academic_start).populate_existing().with_for_update().first()
    if account is None or not account.active:
        return False
    facts = _facts(db, [session.student_id], locked=True)
    current = facts['sessions'].get(session.id)
    if current is None:
        raise HTTPException(status_code=409, detail={'error': 'MAKEUP_SOURCE_REVIEW', 'message': 'The makeup source is missing.'})
    outcome = _eligibility(facts, current, as_of=as_of or _today(), target_date=target_date)
    if outcome is None:
        return False
    if not outcome.can_book:
        raise HTTPException(status_code=409, detail={'error': outcome.reason_code,
            'message': outcome.reason, 'makeup_eligibility': outcome.model_dump(mode='json')})
    return True


def assert_extension_not_required(db, student_id, source_date=None):
    if academic_policy_applies(db, student_id, source_date):
        raise HTTPException(status_code=409, detail={'error': 'MAKEUP_EXTENSION_NOT_REQUIRED',
            'message': 'This student uses academic-year makeup validity. An enrollment extension is no longer required.'})


def participation_detail(db, student_id, *, as_of=None, can_manage=False, facts=None):
    as_of = as_of or _today()
    if db.query(Student.id).filter(Student.id == student_id).first() is None:
        raise DraftNotFound('Student not found.')
    active = academic_policy_applies(db, student_id)
    if not storage_enabled():
        return ParticipationDetail(student_id=student_id, enabled=False, policy_active=False,
                                   academic_start=POLICY.academic_start)
    facts = facts or _facts(db, [student_id])
    header = facts['headers'].get(student_id)
    events = _events(facts, student_id)
    state = _state(events, as_of)
    scheduled = sorted([e for e in events if e.effective_on > as_of], key=lambda e: (e.effective_on, -e.version))
    next_state = scheduled[0] if scheduled else None
    paid_through, _, intervals, _ = _paid(facts, student_id, as_of)
    return ParticipationDetail(student_id=student_id, enabled=entitlement_enabled(), can_manage=bool(can_manage and active),
        policy_active=active, academic_start=POLICY.academic_start,
        status=state.status if state else 'Active', effective_on=state.effective_on if state else None,
        scheduled_status=next_state.status if next_state else None,
        scheduled_effective_on=next_state.effective_on if next_state else None,
        version=header.version if header else 0, paid_through=paid_through,
        history=[ParticipationHistory(id=e.id, version=e.version, status=e.status, effective_on=e.effective_on,
            reason=e.reason, return_enrollment_id=e.return_enrollment_id,
            released_session_ids=e.snapshot.get('released_session_ids', []), actor_name=e.actor_name,
            created_at=utc(e.created_at)) for e in sorted(events, key=lambda e: e.version, reverse=True)],
        return_candidates=[PaidReturnCandidate(enrollment_id=item['enrollment_id'], payment_id=item['payment_id'],
            coverage_from=item['from'], coverage_through=item['through'], paid_on=item['paid_on']) for item in intervals])


def _evidence(facts, student_id):
    return digest({'enrollments': [[e.id, e.student_id, e.tutor_id, e.enrollment_type, e.payment_status,
        e.payment_date, e.first_lesson_date, e.lessons_paid, e.assigned_day, e.assigned_time, e.location]
        for e in facts['enrollments'].values()],
        'sessions': [[s.id, s.student_id, s.enrollment_id, s.tutor_id, s.session_date, s.time_slot, s.location,
            s.session_status, s.previous_session_status, s.financial_status, s.make_up_for_id, s.rescheduled_to_id,
            s.attendance_mark_time, s.exam_revision_slot_id, s.summer_session_id] for s in facts['sessions'].values()],
        'payments': [[key, p.version, p.status, p.payment_date, p.snapshot] for key, (_, p) in facts['payments'].items()],
        'participation': [[e.id, e.version, e.status, e.effective_on, e.return_enrollment_id] for e in _events(facts, student_id)],
        'holidays': sorted(facts['holidays'])})


def preview_participation(db, student_id, change, *, as_of=None, facts=None):
    as_of = as_of or _today()
    if not entitlement_enabled() or not academic_policy_applies(db, student_id):
        raise ValueError('Academic-year makeup management is not enabled for this student.')
    facts = facts or _facts(db, [student_id])
    header = facts['headers'].get(student_id)
    events = _events(facts, student_id)
    reasons, warnings, affected = [], [], []
    if not POLICY.academic_start <= change.effective_on <= POLICY.makeup_end:
        reasons.append('Choose a participation date within this makeup teaching year.')
    if events and change.effective_on < max(e.effective_on for e in events):
        reasons.append('A later participation change is already recorded. Review it before changing an earlier date.')
    if change.status == 'Active':
        selected = next((item for item in _intervals(facts, student_id)[0]
                         if item['enrollment_id'] == change.return_enrollment_id), None)
        prior_pauses = [e for e in events if e.status in {'Paused', 'Left'} and e.effective_on <= change.effective_on]
        last_pause = max(prior_pauses, key=lambda e: (e.effective_on, e.version)) if prior_pauses else None
        if (selected is None or not selected['from'] <= change.effective_on <= selected['continuity']
                or (last_pause and selected['from'] < last_pause.effective_on)):
            reasons.append('Select an actual paid regular enrollment covering the return date.')
        if last_pause is None:
            reasons.append('This student has no recorded pause or departure to resume.')
    else:
        tutors = {row.id: row.tutor_name for row in db.query(Tutor.id, Tutor.tutor_name).filter(
            Tutor.id.in_({s.tutor_id for s in facts['sessions'].values()})).all()}
        for session in facts['sessions'].values():
            if session.student_id != student_id or not session.make_up_for_id or session.session_date < max(as_of, change.effective_on):
                continue
            enrollment = facts['enrollments'].get(session.enrollment_id)
            if not enrollment or enrollment.enrollment_type != 'Regular' or session.summer_session_id is not None or session.session_status == 'Cancelled':
                continue
            root, error = _root(facts, session)
            if root and not POLICY.academic_start <= root.session_date <= POLICY.regular_end:
                continue
            if session.session_status in COMPLETED:
                warnings.append('Attendance already recorded on or after this date will be retained.')
                continue
            if session.session_status != 'Make-up Class':
                continue
            parent = facts['sessions'].get(session.make_up_for_id)
            if error or parent is None or parent.rescheduled_to_id != session.id or 'Make-up Booked' not in parent.session_status:
                reasons.append('A future makeup has inconsistent original links. Review it before pausing.')
                continue
            affected.append(ParticipationBooking(session_id=session.id, source_session_id=parent.id,
                root_session_id=root.id, session_date=session.session_date, time_slot=session.time_slot,
                location=session.location, tutor_id=session.tutor_id, tutor_name=tutors.get(session.tutor_id, ''),
                exam_revision_slot_id=session.exam_revision_slot_id))
        warnings.append('Regular enrollments, payments, refunds and sent fee messages will stay unchanged.')
    result = ParticipationPreview(student_id=student_id, academic_start=POLICY.academic_start,
        version=header.version if header else 0, change=change, review_hash='',
        affected_bookings=sorted(affected, key=lambda b: (b.session_date, b.session_id)),
        warnings=list(dict.fromkeys(warnings)), can_confirm=not reasons, blocked_reasons=list(dict.fromkeys(reasons)))
    result.review_hash = digest([result.model_dump(mode='json', exclude={'review_hash'}), _evidence(facts, student_id)])
    return result


def confirm_participation(db, student_id, data, actor, *, as_of=None):
    """Caller commits. The reviewed release and its audit event are atomic."""
    as_of = as_of or _today()
    if not entitlement_enabled():
        raise ValueError('Participation changes are not enabled yet.')
    if db.query(Student.id).filter(Student.id == student_id).with_for_update().first() is None:
        raise DraftNotFound('Student not found.')
    account = db.query(BillingAccount).filter(BillingAccount.student_id == student_id,
        BillingAccount.academic_start == POLICY.academic_start).populate_existing().with_for_update().first()
    if account is None or not account.active:
        raise ValueError('This student has not joined the academic-year makeup policy.')
    header = db.query(MakeupParticipation).filter_by(student_id=student_id,
        academic_start=POLICY.academic_start).populate_existing().with_for_update().first()
    payload_hash = digest({'student_id': student_id, 'actor_id': actor.id, 'request': data.model_dump(mode='json')})
    if header:
        replay = db.query(MakeupParticipationEvent).filter_by(participation_id=header.id,
            idempotency_key=data.idempotency_key).with_for_update().first()
        if replay:
            if replay.payload_hash != payload_hash:
                raise DraftConflict('This request key was already used for a different participation change.')
            return ParticipationDetail.model_validate(replay.result)
    if data.expected_version != (header.version if header else 0):
        raise DraftConflict('Participation changed. Reload and review it again.')
    facts = _facts(db, [student_id], locked=True)
    change = ParticipationChange.model_validate(data.model_dump(include=set(ParticipationChange.model_fields)))
    reviewed = preview_participation(db, student_id, change, as_of=as_of, facts=facts)
    if reviewed.review_hash != data.expected_review_hash:
        raise DraftConflict('The student’s bookings or payment records changed. Review this action again.')
    if not reviewed.can_confirm:
        raise ValueError(' '.join(reviewed.blocked_reasons))
    if header is None:
        header = MakeupParticipation(student_id=student_id, academic_start=POLICY.academic_start, version=0)
        db.add(header)
        db.flush()
    released = []
    for booking in reviewed.affected_bookings:
        session = facts['sessions'][booking.session_id]
        parent = facts['sessions'][booking.source_session_id]
        session.previous_session_status = session.session_status
        session.session_status = 'Cancelled'
        session.last_modified_by, session.last_modified_time = actor.user_email, utc_now()
        # Keep the historical descendant and its source link. Releasing the
        # revision-slot association permits a later deliberate rebooking.
        session.exam_revision_slot_id = None
        parent.session_status = parent.session_status.replace('Make-up Booked', 'Pending Make-up')
        parent.rescheduled_to_id = None
        parent.last_modified_by, parent.last_modified_time = actor.user_email, utc_now()
        released.append(session.id)
    header.version += 1
    header.updated_at = utc_now()
    event_row = MakeupParticipationEvent(id=str(uuid4()), participation_id=header.id, version=header.version,
        status=change.status, effective_on=change.effective_on, reason=change.reason,
        return_enrollment_id=change.return_enrollment_id, idempotency_key=data.idempotency_key,
        payload_hash=payload_hash, review_hash=reviewed.review_hash,
        snapshot={'preview': reviewed.model_dump(mode='json'), 'released_session_ids': released}, result={},
        actor_id=actor.id, actor_name=(actor.tutor_name or str(actor.id))[:100])
    db.add(event_row)
    db.flush()
    invalidate_makeup_entitlements(db)
    result = participation_detail(db, student_id, as_of=as_of, can_manage=True)
    event_row.result = result.model_dump(mode='json')
    db.flush()
    return result
