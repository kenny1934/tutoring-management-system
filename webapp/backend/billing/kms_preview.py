"""Compare KMS identities and CSM commitments without changing coupon stock."""
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import timezone
import os
from threading import Lock
from hashlib import sha256

from sqlalchemy import text
from uuid import uuid4

from . import coupon_accounting as accounting
from .coupon_imports import _students
from .coupon_models import CouponAccount, CouponObservation, CouponUse, KmsCouponCheck
from .drafts import DraftConflict, DraftNotFound, digest
from .kms_client import KmsClient, credentials
from .kms_schemas import (KmsCheckReview, KmsCheckSummary, KmsCouponChange, KmsPreviewStatus,
                          KmsSnapshot, KmsStudentReview, KmsUseMatch)

_branch_locks = {branch: Lock() for branch in ('MSA', 'MSB')}


class KmsCheckBusy(DraftConflict):
    """Another process owns this branch's source-read mutex."""



@contextmanager
def check_guard(branch, db=None):
    require_enabled()
    lock = _branch_locks[branch]
    if not lock.acquire(blocking=False):
        raise KmsCheckBusy(f'A {branch} KMS check is already running. Wait for it to finish.')
    connection = None
    acquired = False
    name = None
    try:
        if db is not None and db.get_bind().dialect.name == 'mysql':
            bind = db.get_bind()
            # Connection-owned locks span the source commit and subsequent
            # apply transaction, including jobs in a different Cloud Run instance.
            name = 'kms-coupons:' + sha256(str(bind.url.database).encode()).hexdigest()[:32] + ':' + branch
            connection = bind.connect()
            try:
                acquired = connection.execute(text('SELECT GET_LOCK(:name, 0)'), {'name': name}).scalar() == 1
            except Exception:
                # A lost reply can leave GET_LOCK held on the server.
                connection.invalidate()
                raise
            if not acquired:
                raise KmsCheckBusy(f'A {branch} KMS check is already running. Wait for it to finish.')
        yield
    finally:
        if connection is not None:
            try:
                if acquired and connection.execute(text('SELECT RELEASE_LOCK(:name)'), {'name': name}).scalar() != 1:
                    connection.invalidate()
            except Exception:
                # Never return a connection that may still own the mutex.
                connection.invalidate()
            finally:
                connection.close()
        lock.release()


def enabled():
    return accounting.storage_enabled() and os.getenv('BILLING_KMS_PREVIEW_ENABLED', '').lower() in {'1', 'true', 'yes', 'on'}


def require_enabled():
    if not enabled():
        raise DraftConflict('KMS coupon checks have not been enabled yet.')


def latest_check(db, branch):
    return db.query(KmsCouponCheck).filter_by(branch=branch).order_by(
        KmsCouponCheck.sequence.desc()).first()


def status(db):
    if not enabled():
        return KmsPreviewStatus(enabled=False, branches=[])
    latest = []
    for branch in ('MSA', 'MSB'):
        row = latest_check(db, branch)
        if row:
            source = KmsSnapshot.model_validate(row.snapshot)
            latest.append(KmsCheckSummary(id=row.id, branch=branch, fetched_at=source.fetched_at,
                                          active_count=source.active_count))
    from . import kms_stock
    return KmsPreviewStatus(enabled=True, historical_receipts_enabled=kms_stock.historical_receipts_enabled(), branches=[b for b in ('MSA', 'MSB') if credentials(b)], latest=latest)


def find_check(db, check_id):
    require_enabled()
    row = db.query(KmsCouponCheck).filter_by(id=str(check_id)).first()
    if row is None:
        raise DraftNotFound('KMS coupon check not found.')
    return row


def check_kms(db, branch, actor):
    require_enabled()
    source = KmsClient(branch).read()
    from . import kms_stock
    if kms_stock.storage_enabled():
        kms_stock.lock_branch(db, branch)
    previous = latest_check(db, branch)
    row = KmsCouponCheck(id=str(uuid4()), branch=branch,
        fetched_at=source.fetched_at.astimezone(timezone.utc).replace(tzinfo=None),
        source_sha256=digest(source.model_dump(mode='json', exclude={'fetched_at'})),
        snapshot=source.model_dump(mode='json'), previous_id=previous.id if previous else None,
        created_by=actor.id)
    db.add(row)
    db.flush()
    if kms_stock.storage_enabled():
        kms_stock.record_used(db, row)
    return review_check(db, row)


def _receipt(value):
    return (value or '').strip().casefold()


def review_check(db, row, *, with_update=True):
    require_enabled()
    source = KmsSnapshot.model_validate(row.snapshot)
    previous_row = db.query(KmsCouponCheck).filter_by(id=row.previous_id).first() if row.previous_id else None
    if previous_row and previous_row.branch != row.branch:
        raise DraftConflict('The earlier KMS check belongs to another branch.')
    previous = KmsSnapshot.model_validate(previous_row.snapshot) if previous_row else None
    if source.branch != row.branch:
        raise DraftConflict('The KMS check belongs to another branch.')
    from zoneinfo import ZoneInfo
    as_of = source.fetched_at.astimezone(ZoneInfo('Asia/Hong_Kong')).date()
    old = {c.number: c for c in previous.coupons} if previous else {}
    current = {c.number: c for c in source.coupons}
    grouped = defaultdict(list)
    for coupon in source.coupons:
        before = old.get(coupon.number)
        change = 'used' if coupon.state == 'used' else 'active'
        newly_used = False
        if coupon.state == 'used':
            newly_used = bool(previous and ((before and before.state == 'active') or
                (not before and coupon.used_on >= previous.fetched_at.astimezone(ZoneInfo('Asia/Hong_Kong')).date())))
            if before and before.state == 'used' and before != coupon:
                change = 'changed'
        if coupon.state == 'active':
            if coupon.expires_on < as_of:
                change = 'expired'
            elif before and before != coupon:
                change = 'changed'
            elif previous and not before:
                change = 'new'
        grouped[coupon.company_id].append(KmsCouponChange(coupon=coupon, change=change, previous=before,
                                                        newly_used=newly_used, listed_active=coupon.state == 'active'))
    for coupon in old.values():
        now = current.get(coupon.number)
        if coupon.state == 'active' and (not now or now.company_id != coupon.company_id):
            grouped[coupon.company_id].append(KmsCouponChange(coupon=coupon,
                change='expired' if coupon.expires_on < as_of and not now else 'missing', previous=coupon))

    # Also include CSM students with outstanding uses, even if KMS has no row.
    from models import Enrollment, Student, StudentCoupon
    from .models import BillingAccount, BillingPayment, BillingPaymentLine
    outstanding = db.query(Student.home_location, Student.school_student_id).join(
        CouponUse, CouponUse.student_id == Student.id).filter(
        Student.home_location == source.branch, CouponUse.state != 'released',
        CouponUse.accounted_observation_id.is_(None)).all()
    observed_students = db.query(Student.home_location, Student.school_student_id).join(
        CouponAccount, CouponAccount.student_id == Student.id).join(
        CouponObservation, CouponObservation.id == CouponAccount.observation_id).filter(
        Student.home_location == source.branch, CouponObservation.remaining_count > 0).all()
    cached = db.query(Student.home_location, Student.school_student_id, StudentCoupon.available_coupons).join(
        StudentCoupon, StudentCoupon.student_id == Student.id).filter(
        Student.home_location == source.branch).all()
    cached_counts = {branch + school_id: count for branch, school_id, count in cached if school_id and school_id.isdigit()}
    untracked = db.query(Student.home_location, Student.school_student_id).join(
        BillingAccount, BillingAccount.student_id == Student.id).join(
        BillingPayment, BillingPayment.account_id == BillingAccount.id).outerjoin(
        CouponUse, CouponUse.payment_id == BillingPayment.id).filter(
        Student.home_location == source.branch, BillingPayment.coupon_value > 0,
        BillingPayment.status != 'Cancelled', CouponUse.id.is_(None)).all()
    positive_cached = [(branch, school_id) for branch, school_id, count in cached if count and count > 0]
    for branch, student_id in [*outstanding, *observed_students, *positive_cached, *untracked]:
        if student_id and str(student_id).isdigit():
            grouped.setdefault(branch + str(student_id), [])
    matches = _students(db, source.branch, grouped)
    ids = {s.id for students in matches.values() for s in students}
    ledger_facts = accounting._facts(db, ids) if ids else None
    balances = {sid: accounting._balance(sid, ledger_facts, as_of=as_of) for sid in ids}
    payment_enrollments = defaultdict(list)
    if ledger_facts and ledger_facts[4]:
        for payment_id, enrollment_id, owner in db.query(
            BillingPaymentLine.payment_id, Enrollment.id, Enrollment.student_id).join(
            Enrollment, Enrollment.id == BillingPaymentLine.enrollment_id).filter(
            BillingPaymentLine.payment_id.in_(ledger_facts[4])).order_by(Enrollment.id).all():
            if ledger_facts[4][payment_id][1] == owner:
                payment_enrollments[payment_id].append(enrollment_id)
    prior_counts = Counter(c.company_id for c in previous.coupons if c.state == 'active') if previous else None
    reviews = []
    for company_id, changes in grouped.items():
        candidates = matches.get(company_id, [])
        student = candidates[0] if len(candidates) == 1 else None
        balance = balances.get(student.id) if student else None
        active = [c.coupon for c in changes if c.listed_active]
        used = [c.coupon for c in changes if c.coupon.state == 'used']
        issues, uses = [], []
        def warn(code, message):
            if not any(i.code == code for i in issues):
                issues.append(accounting.issue(code, message))
        if len(candidates) > 1:
            warn('AMBIGUOUS_STUDENT', 'More than one CSM student has this branch and student ID.')
        for change in changes:
            if change.change == 'missing':
                warn('COUPON_MISSING', 'A coupon is no longer listed for this student. Check KMS.')
            if change.change == 'changed':
                warn('COUPON_CHANGED', 'Coupon details changed. Check the previous and current records.')
            if change.change == 'expired' and change.coupon.number in current:
                warn('ACTIVE_EXPIRED', 'KMS lists an expired coupon as active.')
            if change.previous and change.previous.company_id != change.coupon.company_id:
                warn('COUPON_OWNER_CHANGED', 'This coupon was previously assigned to another student.')
        reservations = Counter()
        claimed_used = set()
        if balance:
            csm_count = balance.observation.remaining_count if balance.observation else cached_counts.get(company_id)
            if csm_count is not None and csm_count != len(active):
                warn('CSM_COUNT_DIFFERS', 'The last CSM coupon count differs from KMS.')
            financial_issues = {'COUPON_SOURCE_REVIEW', 'UNTRACKED_COUPON_PAYMENT',
                                'COUPON_EXPIRY_DISPUTE', 'COUPON_REDEMPTION_DATE_REVIEW'}
            for problem in balance.issues:
                if problem.code in financial_issues or problem.code.startswith('KMS_SYNC_'):
                    warn(problem.code, problem.message)
            receipt_claims = Counter((_receipt(use.receipt_reference), use.value) for use in balance.uses
                if use.receipt_reference and use.state != 'released' and not use.accounted_in_observation)
            for use in balance.uses:
                if use.state == 'released' or use.accounted_in_observation:
                    continue
                exact = [c for c in used if use.receipt_reference and _receipt(c.receipt_reference) == _receipt(use.receipt_reference)
                         and c.value == use.value]
                number = None
                if (len(exact) == 1 and exact[0].number not in claimed_used
                        and receipt_claims[(_receipt(use.receipt_reference), use.value)] == 1):
                    result, number = 'matched', exact[0].number
                    claimed_used.add(number)
                    if use.state == 'reserved':
                        warn('UNPAID_COUPON_USED', 'KMS shows coupon usage for an unpaid CSM enrollment.')
                elif exact:
                    result = 'review'
                    warn('AMBIGUOUS_RECEIPT', 'Match the coupons and CSM payments sharing this receipt.')
                elif use.state == 'reserved':
                    result = 'reserved'
                    reservations[(use.value, use.expires_on)] += 1
                elif use.state == 'awaiting_receipt' and not use.receipt_reference:
                    result = 'awaiting_receipt'
                else:
                    result = 'review'
                    warn('RECEIPT_NOT_FOUND', 'The CSM coupon receipt was not found in the KMS usage years checked.')
                uses.append(KmsUseMatch(use_id=use.id, payment_id=use.payment_id,
                    legacy_enrollment_id=use.legacy_enrollment_id, value=use.value,
                    receipt_reference=use.receipt_reference, state=use.state, result=result, coupon_number=number,
                    enrollment_ids=([use.legacy_enrollment_id] if use.legacy_enrollment_id else payment_enrollments[use.payment_id]),
                    payment_date=use.payment_date))
            available = Counter((c.value, c.expires_on) for c in active if c.expires_on >= as_of)
            if any(available[group] < count for group, count in reservations.items()):
                warn('RESERVATION_SHORTFALL', 'KMS has fewer matching coupons than CSM has reserved.')
        reviews.append(KmsStudentReview(company_id=company_id, student=student,
            status='review' if issues else 'matched' if student else 'unmatched', active_count=len(active),
            previous_count=prior_counts.get(company_id, 0) if prior_counts is not None else None,
            csm_count=(balance.observation.remaining_count if balance and balance.observation else cached_counts.get(company_id)),
            coupons=sorted(changes, key=lambda c: (c.coupon.state != 'active', c.coupon.number)), uses=uses, issues=issues))
    reviews.sort(key=lambda r: (int(r.company_id[3:]), r.company_id))
    counts = Counter(c.change for r in reviews for c in r.coupons)
    result = KmsCheckReview(id=row.id, branch=row.branch, fetched_at=source.fetched_at,
        previous_fetched_at=previous.fetched_at if previous else None, source_sha256=row.source_sha256,
        used_years=source.used_years, active_count=source.active_count, new_count=counts['new'],
        changed_count=counts['changed'], used_count=sum(c.state == 'used' for c in source.coupons),
        newly_used_count=sum(c.newly_used for r in reviews for c in r.coupons), expired_count=counts['expired'],
        missing_count=counts['missing'], review_count=sum(r.status == 'review' for r in reviews),
        unmatched_count=sum(r.student is None for r in reviews), students=reviews)
    if with_update:
        from . import kms_apply, kms_stock
        from .clock import today
        if kms_stock.storage_enabled():
            kms_apply.assess(db, row, result, ledger_facts or accounting._facts(db, []), as_of=today())
    return result
