"""Outstanding receipts span collection months and keep one task per payment."""
from collections import defaultdict

from sqlalchemy import and_, func, or_

from models import Enrollment, Student
from .models import BillingAccount, BillingPayment, BillingPaymentLine
from .receipt_schemas import ReceiptRow
from .schemas import BillingDraftReview, BillingStudent, PreviewIssue
from .workflow import workflow_storage_enabled


def outstanding_query(db, *, tutor_id=None, location=None):
    """Scope through each payment's own teaching lines, without multiplying rows."""
    reference = BillingPayment.receipt_reference
    # Match Python strip() for legacy references containing only whitespace.
    # SQL TRIM alone recognises only spaces on both supported databases.
    whitespace = ' \t\r\n\v\f\x1c\x1d\x1e\x1f\x85\xa0\u1680\u2028\u2029\u202f\u205f\u3000'
    whitespace += ''.join(chr(value) for value in range(0x2000, 0x200b))
    length = func.length(reference)
    whitespace_length = sum(length - func.length(func.replace(reference, char, '')) for char in whitespace)
    query = db.query(BillingPayment.id).join(
        BillingAccount, BillingAccount.id == BillingPayment.account_id,
    ).join(Student, Student.id == BillingAccount.student_id).filter(
        BillingPayment.status == 'Paid',
        or_(BillingPayment.receipt_reference.is_(None), length == whitespace_length),
    )
    owned = db.query(BillingPaymentLine.id).join(
        Enrollment, Enrollment.id == BillingPaymentLine.enrollment_id,
    ).filter(BillingPaymentLine.payment_id == BillingPayment.id,
             Enrollment.student_id == BillingAccount.student_id)
    scoped = owned
    if tutor_id is not None:
        scoped = scoped.filter(Enrollment.tutor_id == tutor_id)
    if location:
        scoped = scoped.filter(Enrollment.location == location)
    if tutor_id is not None:
        query = query.filter(scoped.exists())
    elif location:
        # Admins can still find a damaged task after its teaching link was lost.
        query = query.filter(or_(scoped.exists(), and_(~owned.exists(), Student.home_location == location)))
    return query


def outstanding_count(db, *, tutor_id=None, location=None):
    if not workflow_storage_enabled():
        return 0
    return outstanding_query(db, tutor_id=tutor_id, location=location).count()


def outstanding_receipts(db, *, tutor_id=None, location=None, search=None, offset=0, limit=50):
    if not workflow_storage_enabled():
        return 0, []
    from routers.billing import student_number_order

    candidates = outstanding_query(db, tutor_id=tutor_id, location=location).with_entities(
        BillingPayment.id.label('payment_id'), BillingPayment.payment_date,
        Student.id, Student.student_name, Student.school_student_id, Student.home_location,
        Student.grade, Student.lang_stream, Student.school, Student.is_staff_referral,
    ).all()
    identities = {}
    for row in candidates:
        values = dict(row._mapping)
        values.pop('payment_id')
        values.pop('payment_date')
        values['is_staff_referral'] = bool(values['is_staff_referral'])
        identities[row.payment_id] = BillingStudent(**values)
    term = (search or '').strip().casefold()
    if term:
        candidates = [row for row in candidates if term in identities[row.payment_id].student_name.casefold()
                      or term in (identities[row.payment_id].school_student_id or '').casefold()]
    candidates.sort(key=lambda row: (student_number_order(identities[row.payment_id]),
                                    row.payment_date.isoformat() if row.payment_date else '', row.payment_id))
    total = len(candidates)
    selected = candidates[offset:offset + limit]
    if not selected:
        return total, []
    ids = [row.payment_id for row in selected]
    # The large saved calculation is loaded only for the displayed page.
    payments = {row.id: row for row in db.query(
        BillingPayment.id, BillingPayment.snapshot, BillingPayment.received_amount,
        BillingPayment.payment_date, BillingPayment.received_method, BillingPayment.coupon_value,
        BillingPayment.coupon_status, BillingPayment.receipt_reference,
    ).filter(BillingPayment.id.in_(ids)).all()}
    lines = defaultdict(list)
    for row in db.query(
        BillingPaymentLine.payment_id, Enrollment.student_id,
    ).outerjoin(Enrollment, Enrollment.id == BillingPaymentLine.enrollment_id).filter(
        BillingPaymentLine.payment_id.in_(ids),
    ).all():
        lines[row.payment_id].append(row.student_id)
    result = []
    for candidate in selected:
        payment = payments[candidate.payment_id]
        student = identities[candidate.payment_id]
        issues = []
        dates = {}
        try:
            review = BillingDraftReview.model_validate((payment.snapshot or {}).get('review'))
            if review.student.id != student.id:
                raise ValueError('Saved student identity differs.')
            period = review.period
            if period.lesson_count <= 0 or period.total_fee is None or period.total_fee <= 0:
                raise ValueError('Saved fee or lesson count is incomplete.')
            dates = dict(first_lesson_date=period.first_lesson_date, last_lesson_date=period.last_lesson_date,
                         lesson_count=period.lesson_count, total_amount=period.total_fee)
            if payment.received_amount != period.total_fee:
                issues.append(PreviewIssue(code='RECEIPT_AMOUNT_REVIEW', message='Check the received amount.'))
        except (ValueError, TypeError, AttributeError):
            issues.append(PreviewIssue(code='RECEIPT_SNAPSHOT_REVIEW', message='Check the saved enrollment details.'))
        if not lines[payment.id] or any(owner != student.id for owner in lines[payment.id]):
            issues.append(PreviewIssue(code='RECEIPT_LINK_REVIEW', message='Check the linked enrollments.'))
        method = payment.received_method if payment.received_method in {'cash', 'bank_transfer', 'autopay'} else None
        if not payment.payment_date or method is None or not payment.received_amount or payment.received_amount <= 0:
            issues.append(PreviewIssue(code='RECEIPT_PAYMENT_REVIEW', message='Check the recorded payment details.'))
        result.append(ReceiptRow(payment_id=payment.id, student=student, **dates,
            received_amount=payment.received_amount, payment_date=payment.payment_date,
            received_method=method, coupon_value=payment.coupon_value or 0,
            coupon_status=payment.coupon_status or 'none', receipt_reference=payment.receipt_reference,
            needs_checking=bool(issues), issues=issues))
    return total, result
