"""Keep old enrollment actions inside the activated coupon ledger."""
from fastapi import HTTPException
from models import Student

from . import coupon_accounting as accounting
from .drafts import DraftConflict, DraftNotFound


def ordinary_coupon(enrollment):
    discount = enrollment.discount
    return bool(discount and discount.discount_value and int(discount.discount_value) in (200, 300))


def action(callback):
    try:
        return callback()
    except (DraftConflict, DraftNotFound) as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


def reserve(db, enrollment, actor, *, as_of):
    if ordinary_coupon(enrollment):
        action(lambda: accounting.reserve_legacy_enrollment(db, enrollment, actor, as_of=as_of))


def paid(db, enrollment, actor, *, as_of):
    return action(lambda: accounting.record_legacy_paid(db, enrollment, actor, as_of=as_of))


def guard_edit(db, enrollment, update):
    if not accounting.storage_enabled():
        return
    db.query(Student.id).filter_by(id=enrollment.student_id).with_for_update().first()
    db.refresh(enrollment, with_for_update=True)
    if (enrollment.payment_status == 'Paid' and 'discount_id' in update
            and update['discount_id'] != enrollment.discount_id):
        raise HTTPException(status_code=409, detail='Review the recorded payment before changing its discount.')
    if enrollment.id not in accounting.tracked_legacy_enrollments(db, [enrollment.id]):
        return
    if (('discount_id' in update and update['discount_id'] != enrollment.discount_id)
            or (enrollment.payment_status == 'Paid' and 'payment_status' in update
                and update['payment_status'] != 'Paid')
            or (enrollment.payment_status == 'Cancelled' and 'payment_status' in update
                and update['payment_status'] != 'Cancelled')):
        raise HTTPException(status_code=409, detail='This enrollment has a recorded coupon use. Review it before changing the discount or payment status.')


def cancel(db, enrollment):
    if accounting.storage_enabled():
        action(lambda: accounting.release_legacy_reservation(db, enrollment))


def lock_student_ids(db, student_ids):
    if not accounting.storage_enabled():
        return
    db.query(Student.id).filter(Student.id.in_(set(student_ids))).order_by(Student.id).with_for_update().all()


def lock_students(db, enrollments):
    lock_student_ids(db, [e.student_id for e in enrollments])


def automatic_value(db, student_id, *, as_of):
    """None means checked stock is empty. Unknown stock needs a staff review."""
    balance = accounting.balance_for_student(db, student_id, as_of=as_of)
    if balance.usable_count is None:
        raise HTTPException(status_code=409, detail='Check this student’s coupon count, values and expiry in KMS before renewing.')
    groups = [g for g in balance.groups if g.kind == 'ordinary' and g.value in (200, 300) and g.usable_count > 0]
    return min(groups, key=lambda g: (g.expires_on, g.value)).value if groups else None
