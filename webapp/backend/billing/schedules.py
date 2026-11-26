"""Keep teaching adjustments separate from the price agreed at confirmation."""
from copy import deepcopy
from datetime import date
from uuid import uuid4

from fastapi import HTTPException

from models import Enrollment, SessionLog, Tutor
from .guards import _in_year, _required, lock_student_billing, workflow_enabled
from .models import BillingLessonClaim, BillingPayment, BillingPaymentLine, utc_now


def enrollment_schedule(row):
    return {**{key: getattr(row, key) for key in ('assigned_day', 'assigned_time', 'location', 'tutor_id')},
            'first_lesson_date': row.first_lesson_date.isoformat() if row.first_lesson_date else None}


def lesson_schedule(row):
    from .workflow import canonical_time
    return {'date': row.session_date.isoformat(), 'time_slot': canonical_time(row.time_slot),
            'location': (row.location or '').strip(), 'tutor_id': row.tutor_id}


def claim_schedule(claim, slot):
    return {'slot': slot, 'date': claim.lesson_date.isoformat(),
            'time_slot': claim.time_slot, 'location': claim.location}


def prepare_schedule_change(db, enrollment_id):
    """Lock and verify the whole payment before an existing editor changes it.

    Financial operations take the student lock too. Keep the current ORM rows
    alive so a lock wait cannot leave the editor using an older MySQL snapshot.
    Unlinked enrollments still use their existing teaching workflow.
    """
    if not workflow_enabled() or not enrollment_id:
        return None
    owner = db.query(Enrollment.student_id).filter(Enrollment.id == enrollment_id).first()
    if owner is None:
        return None
    accounts = lock_student_billing(db, [owner.student_id])
    enrollments = db.query(Enrollment).filter(Enrollment.student_id == owner.student_id).order_by(
        Enrollment.id).populate_existing().with_for_update().all()
    lessons = db.query(SessionLog).filter(SessionLog.student_id == owner.student_id).order_by(
        SessionLog.id).populate_existing().with_for_update().all()
    link = db.query(BillingPaymentLine).filter_by(enrollment_id=enrollment_id).with_for_update().first()
    if link is None:
        enrollment = next(row for row in enrollments if row.id == enrollment_id)
        return {'payment': None, 'enrollment': enrollment, 'accounts': accounts, 'lessons': lessons,
                'original_dates': [enrollment.first_lesson_date, *[row.session_date for row in lessons
                    if row.enrollment_id == enrollment_id and row.make_up_for_id is None]]}
    payment = db.query(BillingPayment).filter_by(id=link.payment_id).populate_existing().with_for_update().one()
    if payment.status == 'Cancelled':
        raise HTTPException(409, 'Cancelled payments cannot have their schedules changed.')
    from .schemas import BillingDraftReview
    from .workflow import payment_integrity, payment_rows
    claims = db.query(BillingLessonClaim).filter_by(payment_id=payment.id).populate_existing().with_for_update().all()
    try:
        review = BillingDraftReview.model_validate(payment.snapshot['review'])
    except (ValueError, TypeError, KeyError):
        raise HTTPException(409, 'Review this payment before changing its schedule.') from None
    issues = payment_integrity(db, payment, review, payment_rows(db, payment))
    if issues:
        raise HTTPException(409, 'Review this payment before changing its schedule: ' + ' '.join(issues))
    payment_enrollments = {row.enrollment_id for row in claims}
    return {'payment': payment, 'review': review, 'enrollments': enrollments, 'lessons': lessons,
            'claims': claims, 'account': next(a for a in accounts if a.id == payment.account_id),
            'before_enrollments': {row.id: enrollment_schedule(row) for row in enrollments},
            'before_lessons': {row.id: lesson_schedule(row) for row in lessons if row.enrollment_id in payment_enrollments}}


def finish_schedule_change(db, state, actor):
    """Record authorised schedules and move claims in the editor's transaction.

    The confirmed request, lesson count, fee message and all monetary allocations
    stay intact. The original claim is retained alongside each adjusted claim so
    integrity checks can still trace every sold lesson to its confirmed period.
    """
    # Validate final positions before queries can flush intermediate moves.
    with db.no_autoflush:
        _finish_schedule_change(db, state, actor)


def _finish_schedule_change(db, state, actor):
    if state is None:
        return
    if state['payment'] is None:
        enrollment = state['enrollment']
        if enrollment.enrollment_type == 'Regular':
            for account in state['accounts']:
                if account.active and not any(_in_year(day, account.academic_start) for day in state['original_dates']):
                    if any(_in_year(row.session_date, account.academic_start) for row in state['lessons']
                           if row.enrollment_id == enrollment.id and row.make_up_for_id is None):
                        raise _required(enrollment.student_id, action='review schedule changes')
        return
    from constants import CONFLICTING_SESSION_STATUSES
    from .workflow import canonical_time, payment_integrity, payment_rows, time_range
    payment = state['payment']
    rows = payment_rows(db, payment)
    slots = {line.enrollment_id: line.slot_index for line, _, _ in rows}
    own = {row.id: row for row in state['lessons'] if row.enrollment_id in slots}
    changed = [row for row in own.values() if lesson_schedule(row) != state['before_lessons'][row.id]]
    changed_enrollments = [row for _, row, _ in rows
                           if enrollment_schedule(row) != state['before_enrollments'][row.id]]
    if not changed and not changed_enrollments:
        return
    tutor_ids = {row.tutor_id for row in [*changed, *changed_enrollments]}
    if db.query(Tutor.id).filter(Tutor.id.in_(tutor_ids)).count() != len(tutor_ids):
        raise HTTPException(422, 'Choose an existing tutor.')
    moved_ids = {row.id for row in changed if any(
        lesson_schedule(row)[key] != state['before_lessons'][row.id][key]
        for key in ('date', 'time_slot', 'location'))}
    for lesson in changed:
        if lesson.id not in moved_ids:
            continue
        if not state['account'].academic_start <= lesson.session_date < date(state['account'].academic_start.year + 1, 9, 1):
            raise HTTPException(409, 'Keep this lesson within its teaching year.')
        start, end = time_range(lesson.time_slot)
        for other in state['lessons']:
            if (other.id == lesson.id or other.session_date != lesson.session_date
                    or other.session_status not in CONFLICTING_SESSION_STATUSES):
                continue
            other_start, other_end = time_range(other.time_slot)
            if start < other_end and other_start < end:
                raise HTTPException(409, f'The student already has a lesson at this time on {lesson.session_date:%Y/%m/%d}.')
    snapshot = deepcopy(payment.snapshot)
    schedules = snapshot.setdefault('teaching_schedules', {'enrollments': {}, 'lessons': {}})
    for row in changed_enrollments:
        schedules['enrollments'][str(row.id)] = enrollment_schedule(row)
    changed_ids = {row.id for row in changed}
    moving = []
    for claim in state['claims']:
        if claim.session_id not in changed_ids:
            continue
        lesson = own[claim.session_id]
        evidence = schedules['lessons'].setdefault(str(lesson.id), {
            'original': claim_schedule(claim, slots[claim.enrollment_id]),
        })
        evidence['current'] = {'slot': slots[claim.enrollment_id], **lesson_schedule(lesson)}
        if lesson.id in moved_ids:
            moving.append((claim, lesson))
    # Check claims even when their original has a non-attendable status. That
    # lesson still owns its place in a payment and must not be sold twice.
    other_claims = db.query(BillingLessonClaim).filter(
        BillingLessonClaim.student_id == state['account'].student_id,
        ~BillingLessonClaim.session_id.in_(changed_ids),
    ).with_for_update().all() if changed_ids else []
    for _, lesson in moving:
        start, end = time_range(lesson.time_slot)
        for claim in other_claims:
            if claim.lesson_date == lesson.session_date:
                other_start, other_end = time_range(claim.time_slot)
                if start < other_end and other_start < end:
                    raise HTTPException(409, 'Another confirmed lesson already covers this time.')
        for _, other in moving:
            if other.id != lesson.id and other.session_date == lesson.session_date:
                other_start, other_end = time_range(other.time_slot)
                if start < other_end and other_start < end:
                    raise HTTPException(409, 'The changed lessons overlap. Choose different times.')
    # MySQL checks its session-slot unique index after each row update. Free
    # the old positions before putting multiple lessons into their final places,
    # so a date exchange cannot collide with the other lesson halfway through.
    # These temporary values are never committed or visible to another request.
    if len(changed) > 1:
        final_times = {row.id: row.time_slot for row in changed}
        token = uuid4().hex
        for row in changed:
            row.time_slot = f'schedule-{token}-{row.id}'
        db.flush()
        for row in changed:
            row.time_slot = final_times[row.id]
    # Recreate only the moved claims, preserving their IDs. Removing them first
    # also avoids intermediate collisions in the claim-slot unique constraint.
    replacements = []
    for claim, lesson in moving:
        replacements.append(BillingLessonClaim(id=claim.id, student_id=claim.student_id,
            payment_id=claim.payment_id, enrollment_id=claim.enrollment_id, session_id=claim.session_id,
            lesson_date=lesson.session_date, time_slot=canonical_time(lesson.time_slot),
            location=(lesson.location or '').strip()))
        db.delete(claim)
    db.flush()
    db.add_all(replacements)
    snapshot.setdefault('schedule_changes', []).append({
        'actor_id': actor.id, 'changed_at': utc_now().isoformat(),
        'enrollments': [{'id': row.id, 'before': state['before_enrollments'][row.id],
                         'after': enrollment_schedule(row)} for row in changed_enrollments],
        'lessons': [{'id': row.id, 'before': state['before_lessons'][row.id],
                     'after': lesson_schedule(row)} for row in changed],
    })
    payment.snapshot = snapshot
    payment.version += 1
    db.flush()
    issues = payment_integrity(db, payment, state['review'], rows)
    if issues:
        raise HTTPException(409, 'The schedule could not be saved: ' + ' '.join(issues))
