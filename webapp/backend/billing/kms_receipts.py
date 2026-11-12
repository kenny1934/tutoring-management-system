"""Propose receipt links only when both sides identify a single paid payment."""
from collections import Counter
from types import SimpleNamespace

from . import coupon_accounting as accounting, kms_stock
from .models import BillingAccount, BillingPayment, BillingPaymentLine
from models import Discount, Enrollment


def proposals(db, student_id, company_id, source, facts, claims):
    uses = facts[3].get(student_id, [])
    candidates = {}
    for use in uses:
        state, problem = accounting._use_state(use, facts[4], facts[5])
        payment = facts[4].get(use.payment_id) if use.payment_id else None
        if (problem or state != 'awaiting_receipt' or use.accounted_observation_id
                or use.receipt_reference or not payment or payment[1] != student_id):
            continue
        paid = payment[0]
        if paid.status != 'Paid' or paid.receipt_reference or not paid.payment_date or paid.coupon_value != use.value:
            continue
        options = [coupon for coupon in source.coupons if coupon.state == 'used'
                   and coupon.company_id == company_id and coupon.value == use.value
                   and coupon.used_on == paid.payment_date
                   and (not use.coupon_used_on or use.coupon_used_on == coupon.used_on)]
        if len(options) == 1:
            candidates[use.id] = options[0]
    if not candidates:
        return {}
    counts = Counter(c.number for c in candidates.values())
    tracked_legacy = {u.legacy_enrollment_id for u in uses if u.legacy_enrollment_id}
    represented = db.query(BillingPaymentLine.id).filter(BillingPaymentLine.enrollment_id == Enrollment.id)
    untracked_legacy = db.query(Enrollment.payment_date, Discount.discount_value).join(
        Discount, Discount.id == Enrollment.discount_id).filter(
        Enrollment.student_id == student_id, Enrollment.payment_status == 'Paid',
        Enrollment.payment_date.in_({c.used_on for c in candidates.values()}),
        ~represented.exists())
    if tracked_legacy:
        untracked_legacy = untracked_legacy.filter(Enrollment.id.notin_(tracked_legacy))
    old_payments = untracked_legacy.all()
    def possible_owners(coupon):
        owners = 0
        for use in uses:
            state, _ = accounting._use_state(use, facts[4], facts[5])
            payment = facts[4].get(use.payment_id) if use.payment_id else None
            legacy = facts[5].get(use.legacy_enrollment_id) if use.legacy_enrollment_id else None
            source_payment = payment[0] if payment and payment[1] == student_id else legacy
            status = (source_payment.status if payment else source_payment.payment_status) if source_payment else None
            if (state != 'released' and status == 'Paid' and use.value == coupon.value
                    and source_payment.payment_date == coupon.used_on):
                owners += 1
        return owners + sum(paid_on == coupon.used_on and value == coupon.value
                            for paid_on, value in old_payments)
    # A receipt must not already belong to another payment, including payments
    # without a coupon and earlier academic years.
    receipts = {kms_stock.receipt(ref) for ref, in db.query(BillingPayment.receipt_reference).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id).filter(
        BillingAccount.student_id == student_id, BillingPayment.receipt_reference.isnot(None)).all()}
    receipts.update(kms_stock.receipt(u.receipt_reference) for u in uses if u.receipt_reference)
    return {use_id: coupon for use_id, coupon in candidates.items()
            if counts[coupon.number] == 1 and possible_owners(coupon) == 1
            and (source.branch, coupon.number) not in claims
            and kms_stock.receipt(coupon.receipt_reference) not in receipts
            and sum(c.state == 'used' and c.company_id == company_id
                    and kms_stock.receipt(c.receipt_reference) == kms_stock.receipt(coupon.receipt_reference)
                    for c in source.coupons) == 1}


def proposed_context(use, coupon, facts):
    """Validate proposed evidence without changing ORM objects during preview."""
    proposed = SimpleNamespace(**{c.name: getattr(use, c.name) for c in use.__table__.columns})
    proposed.receipt_reference = coupon.receipt_reference.strip()
    proposed.coupon_used_on = coupon.used_on
    proposed.state = 'receipt_recorded'
    context = list(facts)
    context[4] = dict(facts[4])
    payment, owner = context[4][use.payment_id]
    values = {c.name: getattr(payment, c.name) for c in payment.__table__.columns}
    values['receipt_reference'] = proposed.receipt_reference
    context[4][use.payment_id] = (SimpleNamespace(**values), owner)
    return proposed, context
