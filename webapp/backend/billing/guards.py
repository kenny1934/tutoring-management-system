"""Keep legacy enrollment actions from splitting a confirmed payment.

The storage flag remains enabled once the new schema is in use, including
when new workflow writes are paused. Writes lock students before accounts
and enrollments, matching confirmation and payment recording.
"""
from datetime import date
import os

from fastapi import HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from models import Enrollment, SessionLog, Student


def workflow_enabled() -> bool:
    # Keep this tiny check independent of the workflow service. Legacy routers
    # are imported by that service for teaching helpers.
    return any(os.getenv(flag, "").strip().lower() in {"1", "true", "yes", "on"} for flag in (
        "BILLING_WORKFLOW_STORAGE_ENABLED", "BILLING_WORKFLOW_ENABLED"
    ))


def _models():
    from billing.models import BillingAccount, BillingPaymentLine
    return BillingAccount, BillingPaymentLine


def _in_year(first_lesson_date, academic_start):
    return bool(first_lesson_date and academic_start <= first_lesson_date < date(academic_start.year + 1, 9, 1))


def _required(student_id, payment_id=None, action="manage this enrollment"):
    return HTTPException(status_code=409, detail={
        "code": "BILLING_WORKFLOW_REQUIRED",
        "message": f"Open this student's Billing page to {action}.",
        "student_id": student_id,
        "payment_id": payment_id,
    })


def lock_student_billing(db: Session, student_ids):
    """Return current account rows while holding student locks in ID order."""
    if not workflow_enabled():
        return []
    ids = sorted(set(sid for sid in student_ids if sid is not None))
    if not ids:
        return []
    account, _ = _models()
    db.query(Student.id).filter(Student.id.in_(ids)).order_by(Student.id).with_for_update().all()
    return db.query(account).filter(account.student_id.in_(ids)).order_by(
        account.student_id, account.academic_start
    ).populate_existing().with_for_update().all()


def lock_billing_session(db: Session, session_id: int) -> bool:
    """Serialise descendant creation with payment recording and cancellation.

    Return whether the source belongs to a grouped payment. Existing legacy
    approval behaviour can then stay unchanged outside the new workflow.
    """
    from services.makeup_entitlement import lock_makeup_entitlement_session
    lock_makeup_entitlement_session(db, session_id)
    if not workflow_enabled():
        return False
    owner = db.query(SessionLog.student_id).filter(SessionLog.id == session_id).first()
    if owner is None:
        return False
    lock_student_billing(db, [owner.student_id])
    source = db.query(SessionLog).filter(SessionLog.id == session_id).populate_existing().with_for_update().first()
    if source is None:
        return False
    # SQLAlchemy's identity map holds weak references. Keep this current read
    # alive for the request so a later relationship-loading query cannot reload
    # the source from MySQL's older repeatable-read snapshot after a lock wait.
    db.info.setdefault("billing_locked_session_sources", {})[source.id] = source
    if source.enrollment_id is None:
        return False
    _, line = _models()
    link = db.query(line.payment_id).filter(line.enrollment_id == source.enrollment_id).with_for_update().first()
    if link is None:
        return False
    from billing.models import BillingPayment
    payment = db.query(BillingPayment).filter(BillingPayment.id == link.payment_id).populate_existing().with_for_update().first()
    if payment is None or payment.status == "Cancelled":
        raise _required(source.student_id, link.payment_id, "review this cancelled payment")
    return True


def assert_legacy_creation_allowed(db: Session, student_id: int, first_lesson_date,
                                   enrollment_type="Regular", *, lesson_dates=None):
    if enrollment_type != "Regular" or not workflow_enabled():
        return
    accounts = lock_student_billing(db, [student_id])
    dates = [first_lesson_date, *(lesson_dates or [])]
    if any(a.active and any(_in_year(day, a.academic_start) for day in dates) for a in accounts):
        raise _required(student_id, action="prepare the next enrollment")


def assert_generic_regular_policy(student_id, first_lesson_date, enrollment_type='Regular'):
    """Route generic calendar-policy intake through review after activation.

    Seasonal application publishers have their own verified pricing context and
    do not call this guard. Storage availability alone does not enable cutover.
    """
    if enrollment_type != 'Regular' or os.getenv('BILLING_WORKFLOW_ENABLED', '').strip().lower() not in {'1', 'true', 'yes', 'on'}:
        return
    from .calculator import BillingPolicy
    policy = BillingPolicy()
    if first_lesson_date and policy.transition_from <= first_lesson_date <= policy.regular_end:
        raise _required(student_id, action='prepare the first enrollment')


def assert_legacy_enrollments_mutable(db: Session, enrollment_ids, *, structural=False,
                                     action="manage this payment"):
    """Protect grouped finances and structural edits after conversion.

    Old unlinked payments can still be settled. Structural changes to their
    teaching dates must be reviewed through Billing once the year is active.
    """
    if not workflow_enabled():
        return
    ids = sorted(set(enrollment_ids))
    if not ids:
        return
    owners = db.query(Enrollment.student_id).filter(Enrollment.id.in_(ids)).all()
    accounts = lock_student_billing(db, [sid for (sid,) in owners])
    rows = db.query(Enrollment).filter(Enrollment.id.in_(ids)).order_by(
        Enrollment.id
    ).populate_existing().with_for_update().all()
    _, line = _models()
    links = {item.enrollment_id: item for item in db.query(line).filter(
        line.enrollment_id.in_(ids)
    ).populate_existing().with_for_update().all()}
    original_dates = {}
    if structural and accounts:
        for eid, day in db.query(SessionLog.enrollment_id, SessionLog.session_date).filter(
            SessionLog.enrollment_id.in_(ids), SessionLog.make_up_for_id.is_(None)
        ).with_for_update().all():
            original_dates.setdefault(eid, []).append(day)
    for row in rows:
        if row.id in links:
            raise _required(row.student_id, links[row.id].payment_id, action)
        if structural and row.enrollment_type == "Regular" and any(
            a.student_id == row.student_id and a.active and any(
                _in_year(day, a.academic_start)
                for day in [row.first_lesson_date, *original_dates.get(row.id, [])]
            )
            for a in accounts
        ):
            raise _required(row.student_id, action=action)


def assert_legacy_fee_message_allowed(db: Session, enrollment):
    """Keep old unlinked messages available while grouped fees use one message."""
    if not workflow_enabled():
        return
    metadata = billing_metadata(db, [enrollment])[enrollment.id]
    if metadata["billing_payment_id"]:
        raise _required(enrollment.student_id, metadata["billing_payment_id"], "prepare this fee message")


def billing_metadata(db: Session, enrollments):
    """Load route metadata, allocated fees and exact boundaries for a list."""
    rows = list(enrollments)
    defaults = {row.id: {"billing_payment_id": None, "billing_payment_method": None, "billing_managed": False} for row in rows}
    if not rows or not workflow_enabled():
        return defaults
    account, line = _models()
    accounts = db.query(account).filter(
        account.student_id.in_({row.student_id for row in rows}), account.active.is_(True)
    ).all()
    students_by_year = {}
    for item in accounts:
        students_by_year.setdefault(item.academic_start, []).append(item.student_id)
    # An August enrollment can contain September lessons. Its recorded roots
    # determine whether it belongs to the active year, not only its start date.
    managed_roots = {eid for (eid,) in db.query(SessionLog.enrollment_id).filter(
        SessionLog.enrollment_id.in_(defaults), SessionLog.make_up_for_id.is_(None),
        SessionLog.session_status != "Cancelled", or_(*[
            and_(SessionLog.student_id.in_(student_ids), SessionLog.session_date >= start,
                 SessionLog.session_date < date(start.year + 1, 9, 1))
            for start, student_ids in students_by_year.items()
        ])
    ).distinct().all()} if students_by_year else set()
    from billing.models import BillingPayment
    line_rows = db.query(line, BillingPayment.snapshot).join(
        BillingPayment, BillingPayment.id == line.payment_id
    ).filter(line.enrollment_id.in_(defaults)).all()
    lines = {item.enrollment_id: item for item, _snapshot in line_rows}
    methods = {}
    for item, snapshot in line_rows:
        method = (snapshot or {}).get("review", {}).get("period", {}).get("collection", {}).get("method")
        methods[item.enrollment_id] = method if method in ("manual", "autopay") else None
    end_dates = dict(db.query(
        SessionLog.enrollment_id, func.max(SessionLog.session_date)
    ).filter(SessionLog.enrollment_id.in_(lines), SessionLog.make_up_for_id.is_(None)).group_by(
        SessionLog.enrollment_id
    ).all()) if lines else {}
    cache = db.info.setdefault("billing_legacy_lines", {})
    for row in rows:
        entry = lines.get(row.id)
        cache[row.id] = entry
        defaults[row.id] = {
            "billing_payment_id": entry.payment_id if entry else None,
            "billing_payment_method": methods.get(row.id),
            "billing_managed": bool(entry) or (row.enrollment_type == "Regular" and (row.id in managed_roots or any(
                a.student_id == row.student_id and _in_year(row.first_lesson_date, a.academic_start)
                for a in accounts
            ))),
        }
        # ORM attributes feed from_attributes responses without extra queries.
        for name, value in defaults[row.id].items():
            setattr(row, name, value)
        row._billing_end_date = end_dates.get(row.id)
    db.info.setdefault("billing_legacy_metadata", {}).update(defaults)
    return defaults


def payment_line(db: Session, enrollment):
    if not workflow_enabled() or not enrollment.id:
        return None
    cache = db.info.setdefault("billing_legacy_lines", {})
    if enrollment.id not in cache:
        billing_metadata(db, [enrollment])
    return cache[enrollment.id]


def _annotate_makeup_policy(db, items):
    from services.makeup_entitlement import academic_policy_students, entitlement_enabled
    if not entitlement_enabled():
        return
    from billing.calculator import BillingPolicy
    policy = BillingPolicy()
    applicable = [item for item in items if hasattr(item, 'makeup_policy')]
    ids = {getattr(item, 'id', None) or getattr(item, 'enrollment_id', None)
           or getattr(item, 'renewed_from_enrollment_id', None) for item in applicable}
    rows = db.query(Enrollment).filter(Enrollment.id.in_(ids)).all() if ids else []
    students = academic_policy_students(db, [row.student_id for row in rows])
    governed = {row.id for row in rows if row.student_id in students
                and row.enrollment_type == 'Regular' and row.first_lesson_date
                and policy.academic_start <= row.first_lesson_date <= policy.regular_end}
    for item in applicable:
        enrollment_id = getattr(item, 'id', None) or getattr(item, 'enrollment_id', None) or getattr(item, 'renewed_from_enrollment_id', None)
        if enrollment_id in governed:
            item.makeup_policy = 'academic_year'


def annotate_billing_response(db: Session, responses):
    """Attach metadata to constructed response models in a single batch."""
    items = list(responses)
    _annotate_makeup_policy(db, items)
    if not items or not workflow_enabled():
        return items
    def enrollment_id(item):
        return getattr(item, "id", None) or getattr(item, "enrollment_id", None) or item.renewed_from_enrollment_id
    ids = {enrollment_id(item) for item in items}
    ids.update(item.renewal_enrollment_id for item in items if getattr(item, "renewal_enrollment_id", None))
    metadata = db.info.setdefault("billing_legacy_metadata", {})
    missing = ids - metadata.keys()
    if missing:
        rows = db.query(Enrollment).filter(Enrollment.id.in_(missing)).all()
        billing_metadata(db, rows)
    for item in items:
        for name, value in metadata.get(enrollment_id(item), {}).items():
            setattr(item, name, value)
        if hasattr(item, "renewal_billing_payment_id"):
            item.renewal_billing_payment_id = metadata.get(item.renewal_enrollment_id, {}).get("billing_payment_id")
        line = db.info.get("billing_legacy_lines", {}).get(enrollment_id(item))
        if line is not None:
            if hasattr(item, "total_fee"):
                item.total_fee = line.tuition_amount + line.materials_fee
            if hasattr(item, "registration_fee"):
                item.registration_fee = line.materials_fee
    return items


def combine_overdue_payments(db: Session, responses, today):
    """Show one collection task for each combined payment, keeping its link."""
    ids = {row.billing_payment_id for row in responses if row.billing_payment_id}
    if not ids or not workflow_enabled():
        return responses
    from billing.models import BillingPayment, BillingPaymentLine
    totals = {row.payment_id: row for row in db.query(
        BillingPaymentLine.payment_id,
        func.sum(BillingPaymentLine.tuition_amount + BillingPaymentLine.materials_fee).label("total_fee"),
        func.sum(BillingPaymentLine.lesson_count).label("lesson_count"),
        func.count(BillingPaymentLine.id).label("line_count"),
    ).filter(BillingPaymentLine.payment_id.in_(ids)).group_by(BillingPaymentLine.payment_id).all()}
    payments = {row.id: row for row in db.query(BillingPayment).filter(BillingPayment.id.in_(ids)).all()}
    seen, result = set(), []
    for row in responses:
        payment_id = row.billing_payment_id
        if not payment_id:
            result.append(row)
            continue
        if payment_id in seen:
            continue
        seen.add(payment_id)
        total = totals.get(payment_id)
        payment = payments.get(payment_id)
        if total is not None:
            # MySQL SUM(integer) returns Decimal. These response fields are
            # assigned after validation, so keep their JSON values numeric.
            row.billing_payment_total_fee = int(total.total_fee)
            row.billing_payment_lesson_count = int(total.lesson_count)
            row.billing_payment_line_count = int(total.line_count)
        collection = payment.snapshot.get("review", {}).get("period", {}).get("collection", {}) if payment else {}
        method = collection.get("method")
        row.billing_payment_method = method if method in ("manual", "autopay") else None
        due = collection.get("debit_to") if method == "autopay" else collection.get("due_before_lesson")
        row.billing_payment_due_date = date.fromisoformat(due) if due else row.payment_deadline or row.first_lesson_date
        row.days_overdue = (today - row.billing_payment_due_date).days
        result.append(row)
    return sorted(result, key=lambda row: row.days_overdue, reverse=True)
