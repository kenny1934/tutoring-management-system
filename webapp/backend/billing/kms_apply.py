"""Reviewed KMS updates reuse finite observations, groups and commitments."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from . import coupon_accounting as accounting, kms_stock, kms_receipts
from .coupon_models import (CouponImport, CouponObservation, CouponVerification, KmsCouponRedemption,
                            KmsCouponVerification, KmsCouponSeenUsed, KmsCouponCheck)
from .drafts import DraftConflict, digest, utc
from .kms_schemas import KmsApplyResult, KmsSnapshot, KmsUpdateSummary, KmsCoupon
from .models import BillingOperation, utc_now


def now():
    return datetime.now(timezone.utc)


def assess(db, row, review, facts, *, as_of):
    """Prepare server-owned actions; no values or reconciliation come from UI."""
    if not kms_stock.storage_enabled():
        return {}
    from .kms_preview import latest_check
    source = KmsSnapshot.model_validate(row.snapshot)
    evidence = facts[7]
    latest = latest_check(db, row.branch)
    global_issues = []
    if not latest or latest.id != row.id:
        global_issues.append(accounting.issue('KMS_CHECK_NEWER', 'A newer KMS check is available. Read the latest list.'))
    age = now() - utc(source.fetched_at)
    if age > timedelta(hours=24) or age < -timedelta(minutes=5):
        global_issues.append(accounting.issue('KMS_CHECK_STALE', 'Read a fresh list from KMS before updating.'))
    source_numbers = {c.number: c for c in source.coupons}
    existing_claims = {(r.branch, r.number): r for r in db.query(KmsCouponRedemption).filter(
        KmsCouponRedemption.branch == row.branch).all()}
    seen_used = {r.number: r for r in db.query(KmsCouponSeenUsed).filter_by(branch=row.branch).all()}
    seen_sources = {}
    plans = {}
    for student_row in review.students:
        if not student_row.student:
            student_row.update_status = 'review' if student_row.status == 'review' else 'unmatched'
            student_row.update_issues = student_row.issues
            continue
        sid = student_row.student.id
        active = kms_stock.inventory(source, student_row.company_id)
        groups = kms_stock.groups(active.values())
        account = facts[0].get(sid)
        link = evidence['links'].get(account.verification_id) if account else None
        problems = []
        def warn(code, message):
            if not any(p.code == code for p in problems):
                problems.append(accounting.issue(code, message))
        for issue in student_row.issues:
            if issue.code not in {'CSM_COUNT_DIFFERS', 'COUPON_CHANGED', 'COUPON_MISSING',
                                  'KMS_SYNC_CHANGED', 'RESERVATION_SHORTFALL', 'COUPON_REDEMPTION_DATE_REVIEW'}:
                warn(issue.code, issue.message)
        applied = None
        if sid in evidence['managed']:
            if not link or link.company_id != student_row.company_id:
                warn('KMS_SYNC_PROVENANCE', 'Check this student’s saved KMS coupon source.')
            else:
                applied = KmsSnapshot.model_validate(link.snapshot)
                for number, old in kms_stock.inventory(applied, student_row.company_id).items():
                    current = source_numbers.get(number)
                    if not current and old.expires_on >= as_of:
                        warn('KMS_SYNC_MISSING', 'A previously saved coupon is no longer listed. Check KMS.')
                    elif current and current.company_id != student_row.company_id:
                        warn('KMS_SYNC_OWNER', 'A coupon moved to another student. Check KMS.')
        elif any(c.change == 'missing' for c in student_row.coupons):
            warn('KMS_SYNC_MISSING', 'A previously listed coupon is missing. Check KMS.')
        if any(c.issued_on > as_of or c.expires_on < as_of for c in active.values()):
            warn('KMS_SYNC_DATES', 'Check the issue and expiry dates before using these coupons.')
        for number in active:
            if (row.branch, number) in existing_claims or (row.branch, number) in kms_stock.known_used(evidence, sid):
                warn('KMS_SYNC_REAPPEARED', 'KMS lists a redeemed coupon as active. Check its receipt.')
        carry, consumed = {}, {}
        uses = facts[3].get(sid, [])
        auto_receipts = kms_receipts.proposals(db, sid, student_row.company_id, source, facts, existing_claims)
        receipt_claims = Counter((kms_stock.receipt(u.receipt_reference), u.value) for u in uses
            if u.receipt_reference and accounting._use_state(u, facts[4], facts[5])[0] != 'released')
        receipt_claims.update((kms_stock.receipt(c.receipt_reference), c.value) for c in auto_receipts.values())
        for use in uses:
            use_facts = facts
            automatic = auto_receipts.get(use.id)
            if automatic:
                from .workflow import payment_detail
                try:
                    detail = payment_detail(db, facts[4][use.payment_id][0])
                    paid = facts[4][use.payment_id][0]
                    if (detail.review_issues or paid.received_amount != detail.review.period.total_fee
                            or paid.received_method not in {'cash', 'bank_transfer', 'autopay'}):
                        warn('KMS_SYNC_PAYMENT', 'Check the recorded payment before linking its receipt.')
                except DraftConflict:
                    warn('KMS_SYNC_PAYMENT', 'Check the recorded payment before linking its receipt.')
                use, use_facts = kms_receipts.proposed_context(use, automatic, facts)
            state, issue = accounting._use_state(use, use_facts[4], use_facts[5])
            if issue:
                warn(issue.code, issue.message)
            if state == 'released':
                continue
            for issue in kms_stock.financial_issues(use, use_facts):
                warn(issue.code, issue.message)
            payment = facts[4].get(use.payment_id) if use.payment_id else None
            legacy = facts[5].get(use.legacy_enrollment_id) if use.legacy_enrollment_id else None
            actual_value = payment[0].coupon_value if payment else int(legacy.discount.discount_value) if legacy and legacy.discount else None
            if actual_value != use.value:
                warn('KMS_SYNC_PAYMENT_VALUE', 'The coupon deduction differs from its CSM enrollment.')
            bound = evidence['redemptions'].get(use.id)
            if bound:
                try:
                    old_used = KmsCoupon.model_validate(bound.coupon)
                except ValueError:
                    old_used = None
                current = source_numbers.get(bound.number)
                if not old_used or old_used.company_id != student_row.company_id:
                    warn('KMS_SYNC_RECEIPT', 'Check the saved coupon receipt evidence.')
                else:
                    for issue in kms_stock.use_issues(use, old_used, use_facts):
                        warn(issue.code, issue.message)
                    if current and current != old_used:
                        warn('KMS_SYNC_RECEIPT', 'A redeemed coupon changed in KMS. Check its receipt.')
                    elif not current and old_used.used_on.year in source.used_years:
                        warn('KMS_SYNC_RECEIPT', 'A recorded coupon use is missing from KMS.')
            if use.accounted_observation_id:
                continue
            if use.receipt_reference:
                exact = [c for c in source.coupons if c.state == 'used' and c.company_id == student_row.company_id
                    and c.value == use.value and kms_stock.receipt(c.receipt_reference) == kms_stock.receipt(use.receipt_reference)]
                if len(exact) != 1 or receipt_claims[(kms_stock.receipt(use.receipt_reference), use.value)] != 1:
                    warn('KMS_SYNC_RECEIPT', 'Match this enrollment with its KMS coupon receipt.')
                    continue
                used = exact[0]
                original = seen_used.get(used.number)
                if original:
                    if original.check_id not in seen_sources:
                        stored = db.query(KmsCouponCheck).filter_by(id=original.check_id).first()
                        seen_sources[original.check_id] = KmsSnapshot.model_validate(stored.snapshot)
                    earlier_use = next((c for c in seen_sources[original.check_id].coupons
                                        if c.number == used.number and c.state == 'used'), None)
                    if not earlier_use or earlier_use != used:
                        warn('KMS_SYNC_RECEIPT', 'This coupon use differs from the earlier KMS record.')
                for issue in kms_stock.use_issues(use, used, use_facts):
                    warn(issue.code, issue.message)
                expiry = use.expires_on
                if applied:
                    earlier = kms_stock.inventory(applied, student_row.company_id).get(used.number)
                    if earlier:
                        if earlier.value != use.value or (expiry and earlier.expires_on != expiry):
                            warn('KMS_SYNC_EXPIRY', 'The redeemed coupon differs from the reserved value or expiry.')
                        expiry = earlier.expires_on
                        if used.used_on < earlier.issued_on:
                            warn('KMS_SYNC_DATE', 'The coupon was used before its issue date.')
                if not expiry:
                    warn('KMS_SYNC_EXPIRY', 'Check the expiry of the earlier coupon use.')
                elif used.used_on > expiry:
                    warn('KMS_SYNC_EXPIRY', 'The KMS coupon was used after its saved expiry.')
                paid_on = payment[0].payment_date if payment else legacy.payment_date if legacy else None
                if expiry and paid_on and paid_on > expiry:
                    warn('KMS_SYNC_EXPIRY', 'Check the coupon expiry and payment date.')
                if used.used_on > as_of:
                    warn('KMS_SYNC_DATE', 'The KMS coupon use is after the current fee date.')
                owner = existing_claims.get((row.branch, used.number))
                if owner and (owner.use_id != use.id or owner.student_id != sid):
                    warn('KMS_SYNC_DUPLICATE', 'This KMS coupon is already linked to another enrollment.')
                consumed[use.id] = {'number': used.number, 'used_on': used.used_on, 'expires_on': expiry,
                                    'coupon': used.model_dump(mode='json'),
                                    'receipt_reference': use.receipt_reference, 'automatic_receipt': automatic is not None}
            elif state in {'reserved', 'awaiting_receipt'}:
                options = [g for g in groups if g.value == use.value and (not use.expires_on or g.expires_on == use.expires_on)]
                if len(options) != 1:
                    if state == 'awaiting_receipt':
                        warn('KMS_SYNC_RECEIPT', 'Record the KMS receipt for this enrollment.')
                    else:
                        warn('KMS_SYNC_RESERVATION', 'Check the value and expiry of the existing coupon reservation.')
                    continue
                group = options[0]
                carry[use.id] = {'group_key': accounting.group_key(group), 'expires_on': group.expires_on}
            else:
                warn('KMS_SYNC_RECEIPT', 'Record the KMS receipt for this enrollment.')
        capacities = {accounting.group_key(g): g.quantity for g in groups}
        reserved = Counter(v['group_key'] for v in carry.values())
        if any(count > capacities.get(key, 0) for key, count in reserved.items()):
            warn('KMS_SYNC_RESERVATION', 'KMS has fewer coupons than CSM has reserved.')
        target = bool(active or student_row.csm_count or uses or sid in evidence['managed'])
        unchanged = bool(applied and kms_stock.inventory(applied, student_row.company_id) == active and not consumed)
        student_row.update_status = 'review' if problems else 'unchanged' if not target or unchanged else 'ready'
        student_row.update_issues = problems
        if not problems:
            for match in student_row.uses:
                proof = consumed.get(match.use_id)
                if proof and proof['automatic_receipt']:
                    match.result = 'link_receipt'
                    match.receipt_reference = proof['receipt_reference']
                    match.coupon_number = proof['number']
        student_row.available_after = max(0, sum(g.quantity for g in groups) - len(carry)) if not problems else None
        plans[sid] = {'company_id': student_row.company_id, 'version': account.version if account else 0,
            'observation_id': account.observation_id if account else None,
            'verification_id': account.verification_id if account else None,
            'groups': [g.model_dump(mode='json') for g in groups], 'active_count': len(active),
            'carry': carry, 'consumed': consumed, 'status': student_row.update_status,
            'uses': [{c.name: getattr(u, c.name) for c in u.__table__.columns} for u in uses],
            'payments': [(p.id, p.version, p.status, p.receipt_reference, p.payment_date, p.received_amount, p.coupon_value)
                         for p, owner in facts[4].values() if owner == sid],
            'enrollments': [(e.id, e.payment_status, e.payment_date, e.discount_id,
                            int(e.discount.discount_value) if e.discount else None)
                           for e in facts[5].values() if e.student_id == sid],
            'issues': [p.model_dump() for p in problems]}
    ready = sum(r.update_status == 'ready' for r in review.students)
    held = sum(r.update_status == 'review' for r in review.students)
    summary_issues = list(global_issues)
    if not kms_stock.writes_enabled():
        summary_issues.append(accounting.issue('KMS_UPDATES_DISABLED', 'KMS coupon updates have not been enabled yet.'))
    review.update = KmsUpdateSummary(review_hash=digest({'check_id': row.id, 'latest_id': latest.id if latest else None,
        'source': digest(source.model_dump(mode='json')), 'as_of': as_of, 'plans': plans}), ready_count=ready, held_count=held,
        unchanged_count=sum(r.update_status == 'unchanged' for r in review.students),
        can_apply=kms_stock.writes_enabled() and not global_issues and ready > 0, issues=summary_issues)
    return plans


def apply_check(db, check_id, data, actor, *, as_of):
    if not kms_stock.writes_enabled():
        raise DraftConflict('KMS coupon updates have not been enabled yet.')
    from models import Student
    from . import kms_preview
    initial = kms_preview.find_check(db, check_id)
    branch = initial.branch
    db.rollback()
    kms_stock.lock_branch(db, branch)
    payload_hash = digest({'kind': 'kms_applied', 'check_id': str(check_id), 'data': data.model_dump(mode='json')})
    replay = accounting.operation(db, actor, data.idempotency_key, payload_hash, KmsApplyResult)
    if replay:
        return replay
    row = kms_preview.find_check(db, check_id)
    initial_review = kms_preview.review_check(db, row, with_update=False)
    ids = sorted({r.student.id for r in initial_review.students if r.student})
    # Restart after discovery so the first consistent read follows the locks.
    db.rollback()
    kms_stock.lock_branch(db, branch)
    db.query(Student.id).filter(Student.id.in_(ids)).order_by(Student.id).with_for_update().all()
    from .coupon_models import CouponAccount
    db.query(CouponAccount).filter(CouponAccount.student_id.in_(ids)).order_by(
        CouponAccount.student_id).populate_existing().with_for_update().all()
    replay = accounting.operation(db, actor, data.idempotency_key, payload_hash, KmsApplyResult)
    if replay:
        return replay
    row = kms_preview.find_check(db, check_id)
    review = kms_preview.review_check(db, row, with_update=False)
    kms_stock.record_used(db, row)
    facts = accounting._facts(db, ids, current=True)
    plans = assess(db, row, review, facts, as_of=as_of)
    if not review.update or review.update.review_hash != data.expected_review_hash:
        raise DraftConflict('Coupon records changed. Review the updated list before applying.')
    if not review.update.can_apply:
        raise DraftConflict('Read a fresh KMS list and resolve the coupon checks before applying.')
    ready = {sid: p for sid, p in plans.items() if p['status'] == 'ready'}
    source = KmsSnapshot.model_validate(row.snapshot)
    observed_on = source.fetched_at.astimezone(accounting.HK).date()
    sha = digest({'kms_check_id': row.id})
    imported = db.query(CouponImport).filter_by(branch=branch, observed_on=observed_on, source_sha256=sha).first()
    if imported is None:
        imported = CouponImport(id=str(uuid4()), branch=branch, observed_on=observed_on,
            source_sha256=sha, source_filename=f'KMS-E-Coupons-{row.id}.json',
            parsed_rows={'kind': 'kms_ecoupons', 'check_id': row.id},
            created_by_name=(actor.tutor_name or str(actor.id))[:100], applied_at=utc_now())
        db.add(imported); db.flush()
    linked_payments = []
    for sid, plan in ready.items():
        account = facts[0].get(sid) or accounting.lock_student(db, sid)
        observation = CouponObservation(id=str(uuid4()), student_id=sid, import_id=imported.id,
            remaining_count=plan['active_count'], observed_on=observed_on,
            source_filename=imported.source_filename, source_sha256=sha)
        db.add(observation); db.flush()
        verification = CouponVerification(id=str(uuid4()), student_id=sid, observation_id=observation.id,
            checked_at=utc(source.fetched_at).replace(tzinfo=None), checked_by=actor.id,
            checked_by_name=(actor.tutor_name or str(actor.id))[:100], groups=plan['groups'],
            reconciliations=[{'use_id': use_id, 'included_in_observation': use_id in plan['consumed']}
                             for use_id in [*plan['carry'], *plan['consumed']]],
            reason='Reviewed individual E-Coupon records from KMS.')
        db.add(verification); db.flush()
        scoped = source.model_copy(update={'coupons': list(kms_stock.inventory(source, plan['company_id']).values()),
                                           'active_count': plan['active_count']})
        db.add(KmsCouponVerification(verification_id=verification.id, student_id=sid,
                                    company_id=plan['company_id'], check_id=row.id, snapshot=scoped.model_dump(mode='json')))
        for use in facts[3][sid]:
            if use.id in plan['consumed']:
                proof = plan['consumed'][use.id]
                if proof['automatic_receipt']:
                    payment = facts[4][use.payment_id][0]
                    payment.receipt_reference = proof['receipt_reference']
                    payment.coupon_status = 'recorded_in_kms'
                    payment.version += 1
                    use.receipt_reference = proof['receipt_reference']
                    use.state = 'receipt_recorded'
                    use.receipt_recorded_at = utc_now()
                    linked_payments.append((payment, proof))
                use.accounted_observation_id = observation.id
                use.coupon_used_on = proof['used_on']
                if use.expires_on is None:
                    use.expires_on = proof['expires_on']
                if use.id not in facts[7]['redemptions']:
                    db.add(KmsCouponRedemption(branch=branch, number=proof['number'], use_id=use.id,
                                               student_id=sid, check_id=row.id,
                                               value=use.value, expires_on=proof['expires_on'], coupon=proof['coupon']))
            elif use.id in plan['carry']:
                use.group_key = plan['carry'][use.id]['group_key']
                use.expires_on = plan['carry'][use.id]['expires_on']
                use.verification_id = verification.id
        account.observation_id, account.verification_id = observation.id, verification.id
        account.version += 1
    db.flush()
    from .workflow import payment_detail
    for payment, proof in linked_payments:
        event_time = utc_now()
        actor_name = (actor.tutor_name or str(actor.id))[:100]
        detail = payment_detail(db, payment, include_pending_event={
            'kind': 'kms_receipt', 'actor_name': actor_name, 'created_at': event_time})
        db.add(BillingOperation(account_id=payment.account_id, payment_id=payment.id,
            idempotency_key=f'kms-receipt:{payment.id}', kind='kms_receipt',
            payload_hash=digest({'check_id': row.id, 'payment_id': payment.id, 'proof': proof}),
            actor_id=actor.id, actor_name=actor_name, created_at=event_time,
            result=detail.model_dump(mode='json')))
    db.flush()
    result = KmsApplyResult(check_id=row.id, updated_count=len(ready), held_count=review.update.held_count,
        skipped_count=sum(r.update_status in {'unmatched', 'unchanged'} for r in review.students),
        review=kms_preview.review_check(db, row))
    accounting.save_operation(db, actor, data.idempotency_key, payload_hash, 'kms_applied', result, import_id=imported.id)
    return result
