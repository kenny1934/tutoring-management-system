"""Record verified receipt facts for paid enrollments from the earlier scheme."""
from uuid import UUID

from models import Enrollment
from . import coupon_accounting as accounting, kms_stock
from .coupon_models import CouponUse
from .coupon_schemas import CouponBalance
from .drafts import DraftConflict, DraftNotFound, digest
from .models import BillingAccount, BillingPayment, utc_now


def record_receipt(db, student_id, use_id: UUID, data, actor, *, as_of):
    accounting.require_writes()
    if not kms_stock.historical_receipts_enabled():
        raise DraftConflict('Earlier enrollment receipts have not been enabled yet.')
    account = accounting.lock_student(db, student_id)
    payload_hash = digest({'kind': 'legacy_receipt', 'student_id': student_id,
                           'use_id': str(use_id), 'data': data.model_dump(mode='json')})
    replay = accounting.operation(db, actor, data.idempotency_key, payload_hash, CouponBalance)
    if replay:
        return replay
    if account.version != data.expected_version:
        raise DraftConflict('Coupon records changed. Reload receipt details before continuing.')
    use = db.query(CouponUse).filter_by(id=str(use_id), student_id=student_id).with_for_update().first()
    if use is None or use.payment_id is not None or not use.legacy_enrollment_id:
        raise DraftNotFound('Earlier enrollment coupon use not found.')
    enrollment = db.query(Enrollment).filter_by(id=use.legacy_enrollment_id,
        student_id=student_id).with_for_update().first()
    if enrollment is None:
        raise DraftNotFound('Earlier enrollment not found.')
    if enrollment.payment_status != 'Paid' or use.state == 'released':
        raise DraftConflict('Record payment for this enrollment before its KMS receipt.')
    if use.value <= 0 or not enrollment.discount or enrollment.discount.discount_value != use.value:
        raise DraftConflict('The enrollment discount differs from this coupon. Review it first.')
    if (use.receipt_reference or '').strip():
        raise DraftConflict('A KMS receipt is already recorded. Reload receipt details.')
    reference = data.receipt_reference.strip()
    if not reference:
        raise ValueError('Enter the issued KMS receipt reference.')
    if data.coupon_used_on > as_of:
        raise ValueError('The KMS receipt date cannot be in the future.')
    # Old enrollment.payment_date was often set by Mark paid, after the real
    # receipt was issued. Preserve that entry date instead of rewriting history.
    refs = [ref for ref, in db.query(CouponUse.receipt_reference).filter(
        CouponUse.student_id == student_id, CouponUse.id != use.id,
        CouponUse.receipt_reference.isnot(None)).all()]
    refs += [ref for ref, in db.query(BillingPayment.receipt_reference).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
        BillingAccount.student_id == student_id, BillingPayment.receipt_reference.isnot(None)).all()]
    if any((ref or '').strip().casefold() == reference.casefold() for ref in refs):
        raise DraftConflict('This student already has this receipt number. Check the enrollment before continuing.')
    use.receipt_reference = reference
    use.coupon_used_on = data.coupon_used_on
    use.state = 'receipt_recorded'
    use.receipt_recorded_at = utc_now()
    account.version += 1
    db.flush()
    result = accounting.balance_for_student(db, student_id, as_of=as_of)
    accounting.save_operation(db, actor, data.idempotency_key, payload_hash,
                              'legacy_receipt', result, student_id=student_id)
    return result
