"""Individual KMS evidence behind the existing finite coupon groups.

Reservations remain interchangeable within value/expiry groups. A particular
KMS number is bound only after its receipt proves which coupon was redeemed.
"""
from collections import Counter
import os

from .coupon_models import KmsCouponCheck, KmsCouponLock, KmsCouponRedemption, KmsCouponVerification, KmsCouponSeenUsed
from .coupon_schemas import CouponIssue
from .drafts import DraftConflict
from .kms_schemas import KmsSnapshot, KmsCoupon


def storage_enabled():
    from .coupon_accounting import storage_enabled as coupon_storage
    return coupon_storage() and os.getenv('BILLING_KMS_STOCK_STORAGE_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def writes_enabled():
    from .coupon_accounting import writes_enabled as coupon_writes
    return storage_enabled() and coupon_writes() and os.getenv('BILLING_KMS_APPLY_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def historical_receipts_enabled():
    return writes_enabled() and os.getenv('BILLING_KMS_HISTORICAL_RECEIPTS_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def lock_branch(db, branch):
    row = db.query(KmsCouponLock).filter_by(branch=branch).populate_existing().with_for_update().first()
    if row is None:
        raise DraftConflict('KMS coupon update storage is not ready.')


def managed_ids(db, student_ids):
    if not storage_enabled() or not student_ids:
        return set()
    return {sid for sid, in db.query(KmsCouponVerification.student_id).filter(
        KmsCouponVerification.student_id.in_(student_ids)).distinct().all()}


def facts(db, ids):
    if not storage_enabled():
        return None
    from models import Student
    links = db.query(KmsCouponVerification).filter(KmsCouponVerification.student_id.in_(ids)).all()
    redeemed = db.query(KmsCouponRedemption).filter(KmsCouponRedemption.student_id.in_(ids)).all()
    codes = {s.id: (s.home_location or '') + (s.school_student_id or '') for s in db.query(
        Student.id, Student.home_location, Student.school_student_id).filter(Student.id.in_(ids)).all()}
    branches = {code[:3] for code in codes.values()} | {r.company_id[:3] for r in links}
    known = {(branch, number) for branch, number in db.query(KmsCouponSeenUsed.branch, KmsCouponSeenUsed.number).filter(
        KmsCouponSeenUsed.branch.in_(branches)).all()}
    latest = {}
    for branch in {r.company_id[:3] for r in links}:
        check = db.query(KmsCouponCheck).filter_by(branch=branch).order_by(KmsCouponCheck.sequence.desc()).first()
        if check:
            latest[branch] = check
    return {'links': {r.verification_id: r for r in links}, 'managed': {r.student_id for r in links},
            'redemptions': {r.use_id: r for r in redeemed}, 'latest': latest, 'codes': codes, 'known_used': known,
            'latest_sources': {branch: KmsSnapshot.model_validate(row.snapshot) for branch, row in latest.items()}}


def inventory(source, company_id):
    return {c.number: c for c in source.coupons if c.company_id == company_id and c.state == 'active'}


def groups(coupons):
    from .coupon_schemas import CouponGroupInput
    counts = Counter(('staff' if c.value == 500 else 'ordinary', c.value, c.expires_on) for c in coupons)
    return [CouponGroupInput(kind=kind, value=value, expires_on=expiry, quantity=count)
            for (kind, value, expiry), count in sorted(counts.items(), key=lambda item: (item[0][2], item[0][1]))]


def receipt(value):
    return (value or '').strip().casefold()


def known_used(evidence, student_id):
    return evidence['known_used']


def record_used(db, row):
    source = KmsSnapshot.model_validate(row.snapshot)
    numbers = {c.number for c in source.coupons if c.state == 'used'}
    old = {number for number, in db.query(KmsCouponSeenUsed.number).filter(
        KmsCouponSeenUsed.branch == row.branch, KmsCouponSeenUsed.number.in_(numbers)).all()}
    db.add_all([KmsCouponSeenUsed(branch=row.branch, number=number, check_id=row.id) for number in sorted(numbers - old)])
    db.flush()


def financial_issues(use, ledger_facts):
    """Validate the frozen financial source, including old accounted uses."""
    from .coupon_accounting import _use_state
    problems = []
    _, problem = _use_state(use, ledger_facts[4], ledger_facts[5])
    if problem:
        problems.append(problem)
    paid = ledger_facts[4].get(use.payment_id) if use.payment_id else None
    legacy = ledger_facts[5].get(use.legacy_enrollment_id) if use.legacy_enrollment_id else None
    # Legacy Mark paid dates can be entry dates, later than the actual receipt.
    paid_on = paid[0].payment_date if paid else None
    if use.payment_id is not None and use.legacy_enrollment_id is not None:
        problems.append(CouponIssue(code='KMS_SYNC_SOURCE', message='Check which enrollment owns this coupon use.'))
    if paid and use.expires_on is None:
        problems.append(CouponIssue(code='KMS_SYNC_EXPIRY', message='Check the saved coupon expiry for this payment.'))
    deduction = paid[0].coupon_value if paid else int(legacy.discount.discount_value) if legacy and legacy.discount else None
    if deduction != use.value:
        problems.append(CouponIssue(code='KMS_SYNC_PAYMENT_VALUE', message='The coupon deduction differs from its CSM enrollment.'))
    if paid and receipt(paid[0].receipt_reference) != receipt(use.receipt_reference):
        problems.append(CouponIssue(code='KMS_SYNC_RECEIPT', message='The payment and coupon receipt numbers differ.'))
    if paid_on and use.coupon_used_on and use.coupon_used_on < paid_on:
        problems.append(CouponIssue(code='KMS_SYNC_PAYMENT_DATE', message='The KMS coupon use is before the recorded payment.'))
    if use.expires_on and ((paid_on and paid_on > use.expires_on)
                           or (use.coupon_used_on and use.coupon_used_on > use.expires_on)):
        problems.append(CouponIssue(code='KMS_SYNC_EXPIRY', message='Check the coupon expiry and payment date.'))
    return problems


def use_issues(use, source_coupon, ledger_facts):
    from .coupon_accounting import _use_state
    problems = financial_issues(use, ledger_facts)
    state, _ = _use_state(use, ledger_facts[4], ledger_facts[5])
    if state != 'receipt_recorded' or not use.receipt_reference:
        problems.append(CouponIssue(code='KMS_SYNC_PAYMENT', message='Check the payment and its KMS receipt.'))
    if (use.value != source_coupon.value or receipt(use.receipt_reference) != receipt(source_coupon.receipt_reference)
            or (use.coupon_used_on and use.coupon_used_on != source_coupon.used_on)):
        problems.append(CouponIssue(code='KMS_SYNC_RECEIPT', message='The KMS coupon use differs from the CSM receipt.'))
    paid = ledger_facts[4].get(use.payment_id) if use.payment_id else None
    legacy = ledger_facts[5].get(use.legacy_enrollment_id) if use.legacy_enrollment_id else None
    paid_on = paid[0].payment_date if paid else None
    if paid_on and source_coupon.used_on and source_coupon.used_on < paid_on:
        problems.append(CouponIssue(code='KMS_SYNC_PAYMENT_DATE', message='The KMS coupon use is before the recorded payment.'))
    if use.expires_on and source_coupon.used_on and source_coupon.used_on > use.expires_on:
        problems.append(CouponIssue(code='KMS_SYNC_EXPIRY', message='Check the coupon expiry and payment date.'))
    return problems


def balance_issues(student_id, ledger_facts, result, *, as_of):
    evidence = ledger_facts[7] if len(ledger_facts) > 7 else None
    if not evidence or student_id not in evidence['managed']:
        return [], False
    from .coupon_accounting import group_key, _use_state
    from .drafts import digest
    problems = []
    def warn(code, message):
        problems.append(CouponIssue(code=code, message=message))
    account = ledger_facts[0].get(student_id)
    link = evidence['links'].get(account.verification_id) if account else None
    if not link or link.student_id != student_id or evidence['codes'].get(student_id) != link.company_id:
        return [CouponIssue(code='KMS_SYNC_REQUIRED', message='Update this student’s coupons from KMS.')], True
    try:
        applied = KmsSnapshot.model_validate(link.snapshot)
        current = evidence['latest_sources'][applied.branch]
    except (ValueError, KeyError):
        return [CouponIssue(code='KMS_SYNC_REQUIRED', message='Read the current coupon list from KMS.')], True
    source_active = inventory(applied, link.company_id)
    if any(c.issued_on > as_of for c in source_active.values()):
        warn('KMS_SYNC_DATE', 'A coupon was issued after the current fee date.')
    expected = {group_key(g): g.quantity for g in groups(source_active.values())}
    actual = {g.key: g.quantity for g in result.groups}
    if (applied.branch != link.company_id[:3] or expected != actual or not result.observation
            or result.observation.remaining_count != len(source_active)
            or result.observation.source_sha256 != digest({'kms_check_id': link.check_id})):
        warn('KMS_SYNC_PROVENANCE', 'The saved coupon details need a KMS update.')
    if inventory(current, link.company_id) != source_active:
        warn('KMS_SYNC_CHANGED', 'KMS coupons changed. Review the update before using them.')
    current_numbers = {c.number: c for c in current.coupons}
    own_uses = {u.id: u for u in ledger_facts[3].get(student_id, [])}
    for use in own_uses.values():
        state, _ = _use_state(use, ledger_facts[4], ledger_facts[5])
        if state == 'released' and use.id not in evidence['redemptions']:
            continue
        problems.extend(financial_issues(use, ledger_facts))
    if any((current.branch, number) in known_used(evidence, student_id) for number in inventory(current, link.company_id)):
        warn('KMS_SYNC_REAPPEARED', 'KMS lists a previously used coupon as active.')
    for use_id, redemption in evidence['redemptions'].items():
        if redemption.student_id != student_id:
            continue
        try:
            coupon = KmsCoupon.model_validate(redemption.coupon)
            use = own_uses[use_id]
        except (ValueError, KeyError, StopIteration):
            warn('KMS_SYNC_RECEIPT', 'Check the saved KMS coupon receipt.')
            continue
        if (coupon.company_id != link.company_id or coupon.company_id[:3] != redemption.branch
                or coupon.number != redemption.number or coupon.state != 'used' or coupon.value != redemption.value):
            warn('KMS_SYNC_OWNER', 'Check which student owns this coupon.')
        if use.expires_on != redemption.expires_on or use.value != redemption.value:
            warn('KMS_SYNC_EXPIRY', 'The saved coupon value or expiry changed after redemption.')
        problems.extend(use_issues(use, coupon, ledger_facts))
        latest = current_numbers.get(redemption.number)
        if latest and latest != coupon:
            warn('KMS_SYNC_REDEMPTION', 'A redeemed coupon changed in KMS. Check its receipt.')
        elif not latest and coupon.used_on.year in current.used_years:
            warn('KMS_SYNC_REDEMPTION', 'A recorded coupon use is no longer in KMS. Check its receipt.')
    return list({(p.code, p.message): p for p in problems}.values()), True
