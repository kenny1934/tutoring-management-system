"""Keep KMS observations separate from finite local coupon commitments."""
from datetime import date, datetime, timezone
import os
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

from models import Enrollment, SessionLog, Student, StudentCoupon
from .coupon_models import CouponAccount, CouponObservation, CouponOperation, CouponUse, CouponVerification
from .coupon_schemas import CouponBalance, CouponGroup, CouponGroupInput, CouponIssue, CouponObservationDetail, CouponUseDetail, CouponVerificationRequest, CouponVerificationReview
from .drafts import DraftConflict, DraftNotFound, digest, utc
from .models import BillingAccount, BillingPayment, utc_now


def _flag(name):
    return os.getenv(name, '').strip().lower() in {'1', 'true', 'yes', 'on'}


def storage_enabled():
    from .workflow import workflow_storage_enabled
    return workflow_storage_enabled() and (_flag('BILLING_COUPON_STORAGE_ENABLED') or _flag('BILLING_COUPON_ENABLED'))


def writes_enabled():
    from .workflow import workflow_enabled
    return storage_enabled() and workflow_enabled() and _flag('BILLING_COUPON_ENABLED')


def require_writes():
    if not writes_enabled():
        raise DraftConflict('Coupon accounting changes are not enabled yet.')


def issue(code, message):
    return CouponIssue(code=code, message=message)


def group_key(group):
    values = group.model_dump(mode='json') if hasattr(group, 'model_dump') else group
    return digest({key: values[key] for key in ('kind', 'value', 'expires_on')})


def lock_student(db, student_id):
    if db.query(Student.id).filter_by(id=student_id).with_for_update().first() is None:
        raise DraftNotFound('Student not found.')
    row = db.query(CouponAccount).filter_by(student_id=student_id).populate_existing().with_for_update().first()
    if row is None:
        row = CouponAccount(student_id=student_id, version=0)
        db.add(row)
        db.flush()
    return row


def operation(db, actor, key, payload_hash, model):
    row = db.query(CouponOperation).filter_by(actor_id=actor.id, idempotency_key=key).with_for_update().first()
    if row:
        if row.payload_hash != payload_hash:
            raise DraftConflict('This request key was used for another action. Refresh before continuing.')
        return model.model_validate(row.result)


def save_operation(db, actor, key, payload_hash, kind, result, *, student_id=None, import_id=None):
    db.add(CouponOperation(student_id=student_id, import_id=import_id, actor_id=actor.id,
        idempotency_key=key, kind=kind, payload_hash=payload_hash, result=result.model_dump(mode='json')))
    db.flush()


HK = ZoneInfo('Asia/Hong_Kong')


def _facts(db, ids, *, current=False):
    def rows(query):
        return (query.populate_existing().with_for_update() if current else query).all()
    accounts = {r.student_id: r for r in rows(db.query(CouponAccount).filter(CouponAccount.student_id.in_(ids)).order_by(CouponAccount.student_id))}
    observations = {r.id: r for r in rows(db.query(CouponObservation).filter(
        CouponObservation.id.in_({a.observation_id for a in accounts.values() if a.observation_id})).order_by(CouponObservation.id))} if accounts else {}
    uses = {sid: [] for sid in ids}
    for use in rows(db.query(CouponUse).filter(CouponUse.student_id.in_(ids)).order_by(CouponUse.created_at, CouponUse.id)):
        uses[use.student_id].append(use)
    verification_ids = {a.verification_id for a in accounts.values() if a.verification_id}
    verification_ids.update(u.verification_id for values in uses.values() for u in values if u.verification_id)
    verifications = {r.id: r for r in rows(db.query(CouponVerification).filter(
        CouponVerification.id.in_(verification_ids)).order_by(CouponVerification.id))} if verification_ids else {}
    payments = {p.id: (p, sid) for p, sid in rows(db.query(BillingPayment, BillingAccount.student_id).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
        BillingAccount.student_id.in_(ids), BillingPayment.coupon_value > 0).order_by(BillingPayment.id))}
    legacy_ids = {u.legacy_enrollment_id for values in uses.values() for u in values if u.legacy_enrollment_id}
    legacy = {r.id: r for r in rows(db.query(Enrollment).filter(Enrollment.id.in_(legacy_ids)).order_by(Enrollment.id))} if legacy_ids else {}
    legacy_dates = {}
    if legacy_ids:
        for row in rows(db.query(SessionLog.enrollment_id, SessionLog.student_id, SessionLog.session_date).filter(
                SessionLog.enrollment_id.in_(legacy_ids), SessionLog.make_up_for_id.is_(None),
                SessionLog.session_status != 'Cancelled').order_by(SessionLog.enrollment_id, SessionLog.id)):
            source = legacy.get(row.enrollment_id)
            if source and row.student_id == source.student_id:
                legacy_dates.setdefault(row.enrollment_id, []).append(row.session_date)
    return accounts, observations, verifications, uses, payments, legacy, legacy_dates


def _use_state(use, payments, legacy):
    source = payments.get(use.payment_id) if use.payment_id else None
    payment = source[0] if source and source[1] == use.student_id else None
    enrollment = legacy.get(use.legacy_enrollment_id) if use.legacy_enrollment_id else None
    if enrollment is not None and enrollment.student_id != use.student_id:
        enrollment = None
    if payment is None and enrollment is None:
        return use.state, issue('COUPON_SOURCE_REVIEW', 'Check the payment linked to this coupon.')
    status = payment.status if payment else enrollment.payment_status
    if use.state == 'released':
        if status == 'Paid' or use.receipt_reference:
            return ('receipt_recorded' if use.receipt_reference else 'awaiting_receipt'), issue(
                'COUPON_SOURCE_REVIEW', 'The enrollment was reopened after its coupon reservation was released.')
        return 'released', None
    if status == 'Cancelled' and use.state == 'reserved' and not use.receipt_reference:
        return 'released', None
    if status != 'Paid' and (use.receipt_reference or use.state in {'awaiting_receipt', 'receipt_recorded'}):
        return ('receipt_recorded' if use.receipt_reference else 'awaiting_receipt'), issue(
            'COUPON_SOURCE_REVIEW', 'The payment changed after this coupon was committed. Check KMS.')
    if use.receipt_reference:
        if status != 'Paid':
            return use.state, issue('COUPON_SOURCE_REVIEW', 'Check the payment linked to this receipt.')
        return 'receipt_recorded', None
    return ('awaiting_receipt' if status == 'Paid' else 'reserved'), None


def _use_context(use, facts):
    """Expose only owned payment evidence, without repricing or guessing dates."""
    payments, legacy = facts[4:6]
    source = payments.get(use.payment_id) if use.payment_id else None
    if source and source[1] == use.student_id:
        payment = source[0]
        context = {'payment_date': payment.payment_date, 'received_amount': payment.received_amount}
        try:
            from .schemas import BillingDraftReview
            review = BillingDraftReview.model_validate((payment.snapshot or {}).get('review'))
            period = review.period
            if (review.student.id != use.student_id or period.lesson_count <= 0
                    or period.first_lesson_date > period.last_lesson_date):
                return context
            context.update(first_lesson_date=period.first_lesson_date,
                           last_lesson_date=period.last_lesson_date, lesson_count=period.lesson_count)
        except (ValueError, TypeError, AttributeError):
            pass
        return context
    enrollment = legacy.get(use.legacy_enrollment_id)
    if enrollment is not None and enrollment.student_id == use.student_id:
        dates = facts[6].get(enrollment.id, []) if len(facts) > 6 else []
        return {'payment_date': enrollment.payment_date,
                'first_lesson_date': min(dates) if dates else None,
                'last_lesson_date': max(dates) if dates else None,
                'lesson_count': len(dates) if dates else None}
    return {}


def _balance(student_id, facts, *, as_of):
    accounts, observations, verifications, uses, payments, legacy = facts[:6]
    account = accounts.get(student_id)
    observed = observations.get(account.observation_id) if account else None
    check = verifications.get(account.verification_id) if account else None
    problems = []
    if observed and observed.student_id != student_id:
        observed = None
    current_check = bool(check and observed and check.student_id == student_id and check.observation_id == observed.id)
    result = CouponBalance(student_id=student_id, storage_available=True, writes_available=writes_enabled(),
        version=account.version if account else 0, can_verify=bool(observed and writes_enabled()))
    if observed:
        result.observation = CouponObservationDetail(id=observed.id, remaining_count=observed.remaining_count,
            observed_on=observed.observed_on, processed_at=utc(observed.processed_at),
            source_filename=observed.source_filename, source_sha256=observed.source_sha256)
    else:
        problems.append(issue('KMS_OBSERVATION_REQUIRED', 'Import a current KMS coupon list.'))
    groups = {}
    decisions = {}
    if current_check:
        try:
            for raw in check.groups:
                group = CouponGroupInput.model_validate(raw)
                key = group_key(group)
                if key in groups:
                    raise ValueError('Duplicate coupon group')
                groups[key] = CouponGroup(**group.model_dump(), key=key, usable_count=group.quantity)
            if sum(g.quantity for g in groups.values()) > observed.remaining_count:
                raise ValueError('Group counts exceed observation')
            decisions = {r['use_id']: r['included_in_observation'] for r in check.reconciliations}
            result.checked_at, result.checked_by = utc(check.checked_at), check.checked_by_name
        except (ValueError, TypeError, KeyError):
            current_check = False
            groups = {}
            problems.append(issue('COUPON_DETAILS_REVIEW', 'Check the saved coupon details.'))
    if observed and not current_check:
        problems.append(issue('COUPON_DETAILS_REQUIRED', 'Check the coupon values and expiry in KMS.'))
    own_uses = uses.get(student_id, [])
    unaccounted_uses = False
    tracked = {u.payment_id for u in own_uses if u.payment_id}
    if any(sid == student_id and p.status != 'Cancelled' and p.id not in tracked for p, sid in payments.values()):
        problems.append(issue('UNTRACKED_COUPON_PAYMENT', 'Review the earlier coupon payment.'))
    for use in own_uses:
        state, source_issue = _use_state(use, payments, legacy)
        if source_issue and not use.accounted_observation_id:
            problems.append(source_issue)
        accounted = bool(use.accounted_observation_id)
        result.uses.append(CouponUseDetail(id=use.id, payment_id=use.payment_id,
            legacy_enrollment_id=use.legacy_enrollment_id, value=use.value, expires_on=use.expires_on,
            state=state, accounted_in_observation=accounted, receipt_reference=use.receipt_reference,
            coupon_used_on=use.coupon_used_on, **_use_context(use, facts)))
        if state == 'released':
            continue
        if not accounted:
            unaccounted_uses = True
        if state == 'reserved':
            result.reserved_count += 1
        elif state == 'awaiting_receipt':
            result.receipt_pending_count += 1
        elif not accounted:
            result.used_awaiting_sync_count += 1
        payment = payments.get(use.payment_id)
        paid_on = payment[0].payment_date if payment and payment[1] == student_id else None
        if not accounted and use.expires_on and ((paid_on and paid_on > use.expires_on)
                               or (use.coupon_used_on and use.coupon_used_on > use.expires_on)):
            problems.append(issue('COUPON_EXPIRY_DISPUTE', 'Check this coupon’s late payment or KMS redemption.'))
        if (not accounted and use.expires_on and use.receipt_reference and not use.coupon_used_on
                and (not use.receipt_recorded_at or utc(use.receipt_recorded_at).astimezone(HK).date() > use.expires_on)):
            problems.append(issue('COUPON_REDEMPTION_DATE_REVIEW', 'Check the actual KMS redemption date for this expired coupon.'))
        if accounted:
            continue
        if (state != 'reserved' and current_check and use.verification_id != check.id and use.id not in decisions):
            problems.append(issue('COUPON_RECONCILIATION_REQUIRED', 'Check which coupon uses this KMS count includes.'))
        if current_check:
            group = groups.get(use.group_key)
            if group is None:
                problems.append(issue('COUPON_GROUP_REVIEW', 'Match the earlier coupon use to its KMS value and expiry.'))
            else:
                group.usable_count -= 1
                if group.usable_count < 0:
                    problems.append(issue('COUPON_BALANCE_REVIEW', 'The coupon commitments exceed the checked count.'))
    for group in groups.values():
        if group.expires_on < as_of:
            group.usable_count = 0
        group.usable_count = max(0, group.usable_count)
    result.groups = sorted(groups.values(), key=lambda g: (g.expires_on, g.value, g.kind))
    # A trustworthy zero observation needs no denomination or expiry details.
    # It cannot, however, identify or clear any outstanding coupon commitment.
    safe_zero = bool(observed and observed.remaining_count == 0 and not unaccounted_uses
                     and not any(p.code != 'COUPON_DETAILS_REQUIRED' for p in problems))
    if safe_zero:
        problems = [p for p in problems if p.code != 'COUPON_DETAILS_REQUIRED']
    result.issues = list({(p.code, p.message): p for p in problems}.values())
    if safe_zero:
        result.usable_count = 0
    elif observed and current_check and not result.issues:
        result.usable_count = sum(g.usable_count for g in result.groups)
    return result


def balances_for_students(db, student_ids, *, as_of=None):
    ids = sorted(set(student_ids))
    if not storage_enabled() or not ids:
        return {}
    facts = _facts(db, ids)
    return {sid: _balance(sid, facts, as_of=as_of or datetime.now(HK).date()) for sid in ids}


def balance_for_student(db, student_id, *, as_of=None):
    balances = balances_for_students(db, [student_id], as_of=as_of)
    if balances:
        return balances[student_id]
    cached = db.query(StudentCoupon).filter_by(student_id=student_id).first()
    return CouponBalance(student_id=student_id, storage_available=False, writes_available=False, version=0,
        legacy_display={'remaining_count': cached.available_coupons or 0,
            'cached_value': str(cached.coupon_value) if cached.coupon_value is not None else None,
            'synced_at': utc(cached.last_synced_at).isoformat() if cached.last_synced_at else None} if cached else None)


def review_verification(db, student_id, data, *, as_of, current=False):
    if not storage_enabled():
        raise DraftConflict('Coupon accounting is not available yet.')
    facts = _facts(db, [student_id], current=current)
    accounts, observations, verifications, uses, payments, legacy = facts[:6]
    account = accounts.get(student_id)
    observed = observations.get(account.observation_id) if account else None
    errors = []
    if not observed or observed.id != data.observation_id or observed.student_id != student_id:
        errors.append(issue('OBSERVATION_CHANGED', 'Refresh the current KMS observation.'))
    if data.expected_version != (account.version if account else 0):
        errors.append(issue('COUPON_VERSION_CHANGED', 'The coupon records changed. Refresh before reviewing.'))
    checked_at = utc(data.checked_at)
    if checked_at > datetime.now(timezone.utc) or checked_at.astimezone(HK).date() > as_of:
        errors.append(issue('CHECK_DATE', 'The KMS check time cannot be in the future.'))
    if observed and checked_at.astimezone(HK).date() < observed.observed_on:
        errors.append(issue('CHECK_DATE', 'Check KMS on or after the observation date.'))
    keys = [group_key(g) for g in data.groups]
    if len(set(keys)) != len(keys):
        errors.append(issue('DUPLICATE_COUPON_GROUP', 'Combine coupon groups with the same value and expiry.'))
    if observed and sum(g.quantity for g in data.groups) > observed.remaining_count:
        errors.append(issue('GROUP_COUNT', 'The checked coupon groups exceed the KMS remaining count.'))
    decisions = {r.use_id: r.included_in_observation for r in data.reconciliations}
    if len(decisions) != len(data.reconciliations):
        errors.append(issue('DUPLICATE_RECONCILIATION', 'Review each coupon use once.'))
    own = {u.id: u for u in uses[student_id]}
    for use_id, included in decisions.items():
        use = own.get(use_id)
        if use is None:
            errors.append(issue('COUPON_USE_SCOPE', 'Choose a coupon use belonging to this student.'))
            continue
        state, _ = _use_state(use, payments, legacy)
        if included and state in {'reserved', 'released'}:
            errors.append(issue('UNPAID_COUPON_INCLUDED', 'An unpaid reservation cannot already be redeemed in KMS.'))
        old_check = verifications.get(use.verification_id)
        if included and observed and old_check and old_check.observation_id == observed.id:
            errors.append(issue('OLD_OBSERVATION', 'This observation predates the coupon commitment. Import a newer KMS list.'))
        if included and observed and use.coupon_used_on and use.coupon_used_on > observed.observed_on:
            errors.append(issue('OBSERVATION_BEFORE_REDEMPTION', 'The KMS observation is earlier than this redemption.'))
        if use.accounted_observation_id and not included:
            errors.append(issue('RECONCILIATION_CHANGED', 'An already accounted coupon use cannot be subtracted again.'))
    # Simulate the exact reviewed reconciliation without changing ORM objects.
    candidate_uses = []
    for use in uses[student_id]:
        values = {c.name: getattr(use, c.name) for c in CouponUse.__table__.columns}
        if decisions.get(use.id) and observed:
            values['accounted_observation_id'] = observed.id
        candidate_uses.append(SimpleNamespace(**values))
    check = SimpleNamespace(id='review', student_id=student_id, observation_id=data.observation_id,
        groups=[g.model_dump(mode='json') for g in data.groups],
        reconciliations=[r.model_dump(mode='json') for r in data.reconciliations], checked_at=data.checked_at, checked_by_name='KMS check')
    candidate_account = SimpleNamespace(student_id=student_id, version=account.version if account else 0,
        observation_id=account.observation_id if account else None, verification_id='review')
    balance = _balance(student_id, ({student_id: candidate_account}, observations, {'review': check},
        {student_id: candidate_uses}, payments, legacy, facts[6]), as_of=as_of)
    errors.extend(balance.issues)
    errors = list({(p.code, p.message): p for p in errors}.values())
    values = {'student_id': student_id, 'expected_version': data.expected_version,
        'data': CouponVerificationRequest.model_validate(data.model_dump()).model_dump(mode='json'),
        'current': _balance(student_id, facts, as_of=as_of).model_dump(mode='json'),
        'preview': balance.model_dump(mode='json'), 'issues': [i.model_dump() for i in errors]}
    return CouponVerificationReview(student_id=student_id, expected_version=data.expected_version,
        review_hash=digest(values), balance=balance, can_confirm=writes_enabled() and not errors, issues=errors)


def verify_coupons(db, student_id, data, actor, *, as_of):
    require_writes()
    account = lock_student(db, student_id)
    payload_hash = digest({'kind': 'verified', 'student_id': student_id, 'data': data.model_dump(mode='json')})
    replay = operation(db, actor, data.idempotency_key, payload_hash, CouponBalance)
    if replay:
        return replay
    review = review_verification(db, student_id, CouponVerificationRequest.model_validate(
        data.model_dump(exclude={'idempotency_key', 'expected_review_hash'})), as_of=as_of, current=True)
    if review.review_hash != data.expected_review_hash:
        raise DraftConflict('The coupon review changed. Refresh and review it again.')
    if not review.can_confirm:
        raise DraftConflict('Resolve the coupon checks before confirming.')
    check = CouponVerification(id=str(uuid4()), student_id=student_id, observation_id=data.observation_id,
        checked_at=utc(data.checked_at).replace(tzinfo=None), checked_by=actor.id,
        checked_by_name=(actor.tutor_name or str(actor.id))[:100],
        groups=[g.model_dump(mode='json') for g in data.groups],
        reconciliations=[r.model_dump(mode='json') for r in data.reconciliations], reason=data.reason.strip())
    db.add(check)
    db.flush()
    for reconciliation in data.reconciliations:
        if reconciliation.included_in_observation:
            use = db.query(CouponUse).filter_by(id=reconciliation.use_id, student_id=student_id).with_for_update().one()
            use.accounted_observation_id = data.observation_id
    account.verification_id, account.version = check.id, account.version + 1
    db.flush()
    result = _balance(student_id, _facts(db, [student_id], current=True), as_of=as_of)
    save_operation(db, actor, data.idempotency_key, payload_hash, 'verified', result, student_id=student_id)
    return result


def reserve_payment(db, student_id, payment, coupon, *, as_of):
    if not storage_enabled():
        return False
    require_writes()
    account = lock_student(db, student_id)
    facts = _facts(db, [student_id], current=True)
    # The just-flushed payment is about to receive its first commitment.
    # It is not an older untracked use.
    facts[4].pop(payment.id, None)
    balance = _balance(student_id, facts, as_of=as_of)
    key = group_key({'kind': coupon.kind, 'value': coupon.value, 'expires_on': coupon.expires_on.isoformat()})
    group = next((g for g in balance.groups if g.key == key), None)
    if balance.usable_count is None or group is None or group.usable_count < 1:
        raise DraftConflict('Check the available coupon group in KMS before confirming this payment.')
    db.add(CouponUse(id=str(uuid4()), student_id=student_id, payment_id=payment.id,
        verification_id=account.verification_id, group_key=key, value=coupon.value,
        expires_on=coupon.expires_on, state='reserved'))
    account.version += 1
    db.flush()
    return True


def payment_changed(db, student_id, payment, data, *, kind, as_of):
    if not storage_enabled() or not payment.coupon_value:
        return
    use = db.query(CouponUse).filter_by(payment_id=payment.id, student_id=student_id).with_for_update().first()
    if use is None:
        if kind in {'receipt', 'cancelled'} or getattr(data, 'receipt_reference', None):
            raise DraftConflict('Review the earlier coupon payment before changing its KMS receipt.')
        return  # Receiving actual money remains recordable, with an untracked-use warning.
    has_receipt = kind == 'receipt' or (kind == 'paid' and bool((data.receipt_reference or '').strip()))
    if has_receipt:
        require_writes()
        if data.coupon_selected is not True:
            raise ValueError('Confirm that this coupon was selected on the KMS receipt.')
        used_on = data.coupon_used_on
        if used_on and used_on > as_of:
            raise ValueError('The KMS redemption date cannot be in the future.')
        use.receipt_reference = payment.receipt_reference
        use.coupon_used_on, use.state = used_on, 'receipt_recorded'
        use.receipt_recorded_at = utc_now()
    elif kind == 'cancelled':
        require_writes()
        use.state = 'released'
    elif kind == 'paid' and writes_enabled():
        use.state = 'awaiting_receipt'
    else:
        return
    account = lock_student(db, student_id)
    account.version += 1
    db.flush()


def record_legacy_paid(db, enrollment, actor, *, as_of):
    if not storage_enabled():
        return False
    require_writes()
    account = lock_student(db, enrollment.student_id)
    use = db.query(CouponUse).filter_by(legacy_enrollment_id=enrollment.id).with_for_update().first()
    if use is None:
        db.add(CouponUse(id=str(uuid4()), student_id=enrollment.student_id,
            legacy_enrollment_id=enrollment.id, value=int(enrollment.discount.discount_value), state='awaiting_receipt'))
        account.version += 1
        db.flush()
    elif use.state == 'reserved':
        use.state = 'awaiting_receipt'
        account.version += 1
        db.flush()
    elif use.state == 'released':
        raise DraftConflict('This coupon reservation was released. Review the enrollment before recording payment.')
    return True


def reserve_legacy_enrollment(db, enrollment, actor, *, as_of):
    if not storage_enabled():
        return False
    require_writes()
    account = lock_student(db, enrollment.student_id)
    existing = db.query(CouponUse).filter_by(legacy_enrollment_id=enrollment.id).with_for_update().first()
    if existing:
        if existing.state == 'released' or existing.value != int(enrollment.discount.discount_value):
            raise DraftConflict('Review the previous coupon commitment before changing this enrollment.')
        return True
    balance = _balance(enrollment.student_id, _facts(db, [enrollment.student_id], current=True), as_of=as_of)
    groups = [g for g in balance.groups if g.kind == 'ordinary'
              and g.value == int(enrollment.discount.discount_value) and g.usable_count > 0]
    if balance.usable_count is None or not groups:
        raise DraftConflict('Check the available coupon group in KMS before preparing this enrollment.')
    group = min(groups, key=lambda g: (g.expires_on, g.key))
    db.add(CouponUse(id=str(uuid4()), student_id=enrollment.student_id, legacy_enrollment_id=enrollment.id,
        verification_id=account.verification_id, group_key=group.key, value=group.value, expires_on=group.expires_on,
        state='awaiting_receipt' if enrollment.payment_status == 'Paid' else 'reserved'))
    account.version += 1
    db.flush()
    return True


def tracked_legacy_enrollments(db, enrollment_ids):
    ids = set(enrollment_ids)
    if not storage_enabled() or not ids:
        return set()
    return {eid for eid, in db.query(CouponUse.legacy_enrollment_id).filter(
        CouponUse.legacy_enrollment_id.in_(ids)).with_for_update().all()}


def release_legacy_reservation(db, enrollment, *, as_of=None):
    if not storage_enabled():
        return False
    require_writes()
    account = lock_student(db, enrollment.student_id)
    use = db.query(CouponUse).filter_by(legacy_enrollment_id=enrollment.id).with_for_update().first()
    if use is None or use.state == 'released':
        return True
    if (use.state != 'reserved' or use.receipt_reference or enrollment.payment_status == 'Paid'):
        raise DraftConflict('A paid or used coupon needs a KMS review before changing its enrollment.')
    use.state = 'released'
    account.version += 1
    db.flush()
    return True
