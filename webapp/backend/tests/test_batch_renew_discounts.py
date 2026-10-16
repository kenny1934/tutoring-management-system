"""Batch renewals choose discounts from current entitlements, not the old term."""

import asyncio
from datetime import date

import pytest

from models import Discount, Enrollment, SessionLog, Student, StudentCoupon, Tutor
from routers.enrollments import batch_renew
from schemas import BatchRenewRequest


@pytest.fixture
def run_async():
    # Use a private loop without clearing the process's default loop, which
    # older tests still use through get_event_loop().
    loop = asyncio.new_event_loop()
    try:
        yield loop.run_until_complete
    finally:
        loop.close()


@pytest.mark.parametrize(
    "old_discount,coupon_count,coupon_value,staff,lessons,active,expected",
    [
        ("coupon300", 0, 300, False, 6, True, None),
        ("coupon300", None, 300, False, 6, True, None),
        ("coupon200", 0, 200, False, 6, True, None),
        (None, 1, 300, False, 6, True, "coupon300"),
        ("coupon300", 1, 200, False, 6, True, "coupon200"),
        ("coupon200", 1, 300, False, 6, True, "coupon300"),
        ("coupon300", 1, 300, False, 5, True, None),
        ("coupon300", 1, 300, False, 6, False, None),
        ("coupon300", 0, 300, True, 6, True, "staff"),
        (None, 1, 300, True, 6, True, "staff"),
        ("staff", 0, 300, False, 6, True, None),
        ("staff", 0, 300, True, 5, True, None),
        ("seasonal", 0, 300, False, 6, True, None),
        ("trial", 0, 300, False, 6, True, None),
    ],
)
def test_batch_renew_uses_current_entitlement(
    db_session, run_async, old_discount, coupon_count, coupon_value, staff, lessons, active, expected
):
    tutor = Tutor(user_email="tutor@example.test", tutor_name="Test tutor", role="Admin")
    student = Student(student_name="Test student", home_location="MSA", is_staff_referral=staff)
    # Put the seasonal offer first so matching only on value would choose it.
    discounts = {
        "seasonal": Discount(discount_name="Seasonal offer", discount_type="fixed", discount_value=300, is_active=True),
        "coupon300": Discount(discount_name="Student Discount $300", discount_type="Fixed Amount", discount_value=300, is_active=active),
        "coupon200": Discount(discount_name="Student Discount $200", discount_type="Fixed Amount", discount_value=200, is_active=True),
        "staff": Discount(discount_name="Staff Referral Coupon $500", discount_type="Fixed Amount", discount_value=500, is_active=True),
        "trial": Discount(discount_name="Trial conversion", discount_type="Fixed Amount", discount_value=150, is_active=True),
    }
    db_session.add_all([tutor, student, *discounts.values()])
    db_session.flush()
    if coupon_count is not None:
        db_session.add(StudentCoupon(student_id=student.id, available_coupons=coupon_count, coupon_value=coupon_value))
    source = Enrollment(
        student_id=student.id, tutor_id=tutor.id, assigned_day="Thursday",
        assigned_time="16:00 - 17:30", location="MSA", first_lesson_date=date(2026, 9, 3),
        lessons_paid=6, enrollment_type="Regular", payment_status="Paid",
        discount_id=discounts[old_discount].id if old_discount else None,
    )
    db_session.add(source)
    db_session.commit()

    result = run_async(batch_renew(
        BatchRenewRequest(enrollment_ids=[source.id], lessons_paid=lessons),
        admin=tutor, db=db_session,
    ))

    assert result.created_count == 1
    assert result.failed_count == 0
    renewed = db_session.get(Enrollment, result.results[0].new_enrollment_id)
    assert renewed.discount_id == (discounts[expected].id if expected else None)
    expected_value = int(discounts[expected].discount_value) if expected else 0
    assert renewed.revenue_total == 400 * lessons - expected_value
    assert renewed.payment_status == "Pending Payment"
    assert db_session.query(SessionLog).filter_by(enrollment_id=renewed.id).count() == lessons
    # Coupon inventory is consumed when paid, not when a renewal is created.
    coupon = db_session.query(StudentCoupon).filter_by(student_id=student.id).first()
    assert (coupon.available_coupons if coupon else None) == coupon_count
    assert source.discount_id == (discounts[old_discount].id if old_discount else None)


def test_batch_renew_keeps_each_students_coupon_balance_separate(db_session, run_async):
    tutor = Tutor(user_email="tutor@example.test", tutor_name="Test tutor", role="Admin")
    discount = Discount(discount_name="Student Discount $300", discount_type="Fixed Amount", discount_value=300, is_active=True)
    db_session.add_all([tutor, discount])
    db_session.flush()
    originals = []
    for count in (0, 1):
        student = Student(student_name=f"Student {count}", home_location="MSA")
        db_session.add(student)
        db_session.flush()
        db_session.add(StudentCoupon(student_id=student.id, available_coupons=count, coupon_value=300))
        source = Enrollment(
            student_id=student.id, tutor_id=tutor.id, assigned_day="Thursday",
            assigned_time="16:00 - 17:30", location="MSA", first_lesson_date=date(2026, 9, 3),
            lessons_paid=6, enrollment_type="Regular", payment_status="Paid", discount_id=discount.id,
        )
        db_session.add(source)
        originals.append(source)
    db_session.commit()

    result = run_async(batch_renew(
        BatchRenewRequest(enrollment_ids=[source.id for source in originals]),
        admin=tutor, db=db_session,
    ))

    assert result.created_count == 2
    renewals = [db_session.get(Enrollment, r.new_enrollment_id) for r in result.results]
    assert [r.discount_id for r in renewals] == [None, discount.id]
    assert [r.revenue_total for r in renewals] == [2400, 2100]
