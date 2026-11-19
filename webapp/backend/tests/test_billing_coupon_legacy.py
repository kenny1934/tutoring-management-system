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


@pytest.mark.parametrize('tracked', [False, True])
def test_admin_can_remove_incorrect_unverified_discount_from_paid_legacy_enrollment(coupon_env, loop, tracked):
    from billing.coupon_models import CouponOperation

    _client, db, actor = coupon_env
    value = pending(db, actor)
    value.payment_status = 'Paid'
    value.payment_date = DAY
    db.commit()
    if tracked:
        accounting.record_legacy_paid(db, value, actor, as_of=DAY)
        db.commit()
    old_payment_date = value.payment_date
    result = loop(update_enrollment(value.id, EnrollmentUpdate(discount_id=None), admin=actor, db=db))
    assert value.discount_id is None and result.discount_name is None
    assert value.revenue_total == 2400
    assert value.payment_status == 'Paid' and value.payment_date == old_payment_date
    assert db.query(StudentCoupon).one().available_coupons == 9
    changes = db.query(CouponOperation).filter_by(kind='legacy_discount_removed').all()
    assert len(changes) == 1
    assert changes[0].actor_id == actor.id and changes[0].result['previous_discount_value'] == 300
    if tracked:
        assert db.query(CouponUse).one().state == 'released'
        balance = accounting.balance_for_student(db, value.student_id, as_of=DAY)
        assert balance.receipt_pending_count == 0
        assert balance.uses[0].state == 'released'
        assert not any(issue.code == 'COUPON_SOURCE_REVIEW' for issue in balance.issues)
    loop(update_enrollment(value.id, EnrollmentUpdate(discount_id=None), admin=actor, db=db))
    assert db.query(CouponOperation).filter_by(kind='legacy_discount_removed').count() == 1


@pytest.mark.parametrize('evidence', ['receipt', 'accounted', 'verified'])
def test_paid_discount_removal_preserves_coupon_evidence(coupon_env, loop, evidence):
    _client, db, actor = coupon_env
    value = pending(db, actor)
    value.payment_status = 'Paid'
    db.commit()
    if evidence == 'verified':
        observation(db)
        verify(db, actor, [group()])
        accounting.reserve_legacy_enrollment(db, value, actor, as_of=DAY)
    else:
        accounting.record_legacy_paid(db, value, actor, as_of=DAY)
    use = db.query(CouponUse).one()
    if evidence == 'receipt':
        use.receipt_reference = 'OLD-RECEIPT'
        use.state = 'receipt_recorded'
    elif evidence == 'accounted':
        use.accounted_observation_id = observation(db).id
    db.commit()
    previous_discount_id = value.discount_id
    with pytest.raises(HTTPException, match='KMS records'):
        loop(update_enrollment(value.id, EnrollmentUpdate(discount_id=None), admin=actor, db=db))
    db.rollback()
    assert value.discount_id == previous_discount_id
    assert value.revenue_total == 2100
    assert db.query(CouponUse).one().state != 'released'


def test_failed_enrollment_update_rolls_back_coupon_correction(coupon_env, loop, monkeypatch):
    from billing.coupon_models import CouponOperation
    from routers import enrollments

    _client, db, actor = coupon_env
    value = pending(db, actor)
    value.payment_status = 'Paid'
    accounting.record_legacy_paid(db, value, actor, as_of=DAY)
    db.commit()
    previous_discount_id = value.discount_id

    def fail(*args, **kwargs):
        raise RuntimeError('Synthetic calculation failure')

    monkeypatch.setattr(enrollments, 'compute_enrollment_revenue_total', fail)
    with pytest.raises(RuntimeError, match='Synthetic calculation failure'):
        loop(update_enrollment(value.id, EnrollmentUpdate(discount_id=None), admin=actor, db=db))
    db.rollback()
    assert value.discount_id == previous_discount_id
    assert db.query(CouponUse).one().state == 'awaiting_receipt'
    assert db.query(CouponOperation).filter_by(kind='legacy_discount_removed').count() == 0
