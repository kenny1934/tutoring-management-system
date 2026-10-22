"""The old enrollment paths must share finite stock after activation."""
import asyncio
import importlib.util
from pathlib import Path

import pytest
from fastapi import HTTPException

from billing import coupon_accounting as accounting, coupon_legacy
from billing.coupon_models import CouponUse
from models import Student, StudentCoupon
from routers.enrollments import batch_mark_paid, update_enrollment
from schemas import BatchEnrollmentRequest, EnrollmentUpdate
from tests.test_batch_mark_paid_coupons import enrollment
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env
from tests.test_billing_coupon_verification import coupon_env, observation, verify, group, DAY


@pytest.fixture
def loop():
    value = asyncio.new_event_loop()
    yield value.run_until_complete
    value.close()


def pending(db, actor):
    student = db.get(Student, 101)
    value = enrollment(db, student, actor, 300)
    db.add(StudentCoupon(student_id=101, available_coupons=9, coupon_value=300))
    db.commit()
    return value


def test_old_batch_paid_records_commitment_once_without_decrementing_kms(coupon_env, loop):
    _client, db, actor = coupon_env
    value = pending(db, actor)
    result = loop(batch_mark_paid(BatchEnrollmentRequest(enrollment_ids=[value.id]), db=db, current_user=actor))
    assert result.count == 1
    assert db.query(StudentCoupon).one().available_coupons == 9
    use = db.query(CouponUse).one()
    assert use.legacy_enrollment_id == value.id and use.state == 'awaiting_receipt'
    assert value.revenue_total == 2100
    assert loop(batch_mark_paid(BatchEnrollmentRequest(enrollment_ids=[value.id]), db=db, current_user=actor)).count == 0
    assert db.query(CouponUse).count() == 1


def test_old_individual_paid_advances_checked_hold_and_keeps_raw_stock(coupon_env, loop):
    _client, db, actor = coupon_env
    value = pending(db, actor)
    observation(db)
    verify(db, actor, [group()])
    coupon_legacy.reserve(db, value, actor, as_of=DAY)
    db.commit()
    assert accounting.balance_for_student(db, 101, as_of=DAY).usable_count == 0
    loop(update_enrollment(value.id, EnrollmentUpdate(payment_status='Paid', payment_date=DAY), admin=actor, db=db))
    assert db.query(StudentCoupon).one().available_coupons == 9
    assert db.query(CouponUse).one().state == 'awaiting_receipt'
    assert value.revenue_total == 2100
    with pytest.raises(HTTPException, match='recorded coupon use'):
        coupon_legacy.guard_edit(db, value, {'payment_status':'Pending Payment'})


def test_legacy_automatic_coupon_uses_checked_group_and_holds_finite_stock(coupon_env):
    _client, db, actor = coupon_env
    value = pending(db, actor)
    observation(db, count=1)
    verify(db, actor, [group(200)])
    assert coupon_legacy.automatic_value(db, 101, as_of=DAY) == 200
    with pytest.raises(HTTPException, match='available coupon group'):
        coupon_legacy.reserve(db, value, actor, as_of=DAY)
    assert db.query(CouponUse).count() == 0


def test_cancelled_legacy_hold_releases_once_and_cannot_be_reopened(coupon_env):
    _client, db, actor = coupon_env
    value = pending(db, actor)
    observation(db)
    verify(db, actor, [group()])
    coupon_legacy.reserve(db, value, actor, as_of=DAY)
    coupon_legacy.cancel(db, value)
    value.payment_status = 'Cancelled'
    db.commit()
    coupon_legacy.cancel(db, value)
    db.commit()
    assert accounting.balance_for_student(db, 101, as_of=DAY).usable_count == 1
    assert db.query(CouponUse).one().state == 'released'
    with pytest.raises(HTTPException, match='recorded coupon use'):
        coupon_legacy.guard_edit(db, value, {'payment_status':'Pending Payment'})


def test_raw_import_refuses_before_any_database_connection(monkeypatch):
    path = Path(__file__).resolve().parents[3] / 'scripts/apply_coupon_sql.py'
    spec = importlib.util.spec_from_file_location('coupon_sql_guard_test', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setenv('BILLING_COUPON_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    for operation in (module.dry_run, module.apply):
        with pytest.raises(RuntimeError, match='Upload the KMS list'):
            operation([])
