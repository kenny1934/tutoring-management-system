"""Batch payment consumes coupons only for the enrollments using them."""

import asyncio
from datetime import date

import pytest

from models import Discount, Enrollment, SessionLog, Student, StudentCoupon, Tutor
from routers.enrollments import batch_mark_paid
from schemas import BatchEnrollmentRequest


@pytest.fixture
def pay_batch(db_session):
    loop = asyncio.new_event_loop()
    admin = Tutor(user_email="admin@example.test", tutor_name="Test admin", role="Admin")
    db_session.add(admin)
    db_session.flush()
    try:
        yield lambda ids: loop.run_until_complete(batch_mark_paid(
            BatchEnrollmentRequest(enrollment_ids=ids), db=db_session, current_user=admin,
        )), admin
    finally:
        loop.close()


def enrollment(db, student, tutor, value=None, status="Pending Payment"):
    discount = None
    if value is not None:
        discount = Discount(discount_name=f"Test discount {value}", discount_type="Fixed Amount",
                            discount_value=value, is_active=True)
        db.add(discount)
        db.flush()
    row = Enrollment(
        student_id=student.id, tutor_id=tutor.id, assigned_day="Thursday",
        assigned_time="16:00 - 17:30", location="MSA", first_lesson_date=date(2026, 10, 1),
        lessons_paid=6, enrollment_type="Regular", payment_status=status,
        discount_id=discount.id if discount else None, revenue_total=2400 - (value or 0),
    )
    db.add(row)
    db.flush()
    db.add(SessionLog(
        enrollment_id=row.id, student_id=student.id, tutor_id=tutor.id,
        session_date=date(2026, 10, 1), time_slot="16:00 - 17:30", location="MSA",
        session_status="Scheduled", financial_status="Paid" if status == "Paid" else "Unpaid",
    ))
    return row


@pytest.mark.parametrize("other_value", [None, 0, 150, 500, 200, 300])
@pytest.mark.parametrize("coupon_value", [200, 300])
def test_mixed_batch_checks_each_enrollments_discount(db_session, pay_batch, coupon_value, other_value):
    pay, admin = pay_batch
    student = Student(student_name="Mixed payment student", home_location="MSA")
    other_student = Student(student_name="Other student", home_location="MSA")
    db_session.add_all([student, other_student])
    db_session.flush()
    balance = StudentCoupon(student_id=student.id, available_coupons=3, coupon_value=300)
    other_balance = StudentCoupon(student_id=other_student.id, available_coupons=3, coupon_value=300)
    db_session.add_all([balance, other_balance])
    rows = [enrollment(db_session, student, admin, coupon_value),
            enrollment(db_session, student, admin, other_value),
            enrollment(db_session, other_student, admin)]
    db_session.commit()

    result = pay([row.id for row in reversed(rows)])

    assert set(result.updated) == {row.id for row in rows}
    assert result.count == 3
    assert balance.available_coupons == 3 - 1 - (other_value in (200, 300))
    assert other_balance.available_coupons == 3
    assert all(row.payment_status == "Paid" and row.payment_date for row in rows)
    assert [row.revenue_total for row in rows] == [2400 - coupon_value, 2400 - (other_value or 0), 2400]
    assert {row.financial_status for row in db_session.query(SessionLog).all()} == {"Paid"}
    # Repeating a completed batch must neither consume again nor report new payments.
    repeated = pay([row.id for row in rows])
    assert repeated.count == 0
    assert balance.available_coupons == 3 - 1 - (other_value in (200, 300))


@pytest.mark.parametrize("count", [None, 0, 1])
def test_missing_or_exhausted_balance_never_goes_negative(db_session, pay_batch, count):
    pay, admin = pay_batch
    student = Student(student_name="Limited coupon student", home_location="MSA")
    db_session.add(student)
    db_session.flush()
    balance = None
    if count is not None:
        balance = StudentCoupon(student_id=student.id, available_coupons=count, coupon_value=300)
        db_session.add(balance)
    rows = [enrollment(db_session, student, admin, 200), enrollment(db_session, student, admin, 300)]
    db_session.commit()

    result = pay([row.id for row in rows])

    assert result.count == 2
    assert balance is None or balance.available_coupons == 0


def test_already_paid_coupon_is_not_consumed_with_another_unpaid_enrollment(db_session, pay_batch):
    pay, admin = pay_batch
    student = Student(student_name="Previously paid student", home_location="MSA")
    db_session.add(student)
    db_session.flush()
    balance = StudentCoupon(student_id=student.id, available_coupons=2, coupon_value=300)
    db_session.add(balance)
    paid = enrollment(db_session, student, admin, 300, status="Paid")
    unpaid = enrollment(db_session, student, admin)
    db_session.commit()

    result = pay([paid.id, unpaid.id])

    assert result.updated == [unpaid.id]
    assert balance.available_coupons == 2
