"""Legacy receipt entry records KMS facts without rewriting financial history."""
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import coupon_accounting as accounting
from billing.coupon_models import CouponAccount, CouponUse, CouponOperation
from models import Discount, Enrollment
from tests.test_billing_coupons import env as coupon_env, workflow_env, draft_env


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_):
        assert dialect.name == 'sqlite'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def env(coupon_env, monkeypatch):
    monkeypatch.setenv('BILLING_KMS_STOCK_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_KMS_APPLY_ENABLED', 'true')
    monkeypatch.setenv('BILLING_KMS_HISTORICAL_RECEIPTS_ENABLED', 'true')
    client, db, actor = coupon_env
    discount = Discount(id=900, discount_name='Synthetic coupon', discount_type='Fixed', discount_value=300)
    db.add(discount); db.flush()
    enrollment = db.get(Enrollment, 11)
    enrollment.discount_id = discount.id
    enrollment.payment_date = date(2026, 10, 17)
    enrollment.payment_status = 'Paid'
    use = CouponUse(id=str(uuid4()), student_id=101, legacy_enrollment_id=11, value=300, state='awaiting_receipt')
    db.add_all([CouponAccount(student_id=101, version=1), use]); db.commit()
    return client, db, actor, use.id


def payload(**changes):
    return dict(expected_version=1, idempotency_key='legacy-ref-1', receipt_reference='KMS-OLD',
                coupon_used_on='2026-10-13', coupon_selected=True, **changes)


def record(env, data=None, student=101, use_id=None):
    client, _, _, uid = env
    return client.post(f'/api/billing/students/{student}/coupon-uses/{use_id or uid}/receipt',json=data or payload())


def test_earlier_receipt_date_is_recorded_without_changing_enrollment(env):
    _, db, _, uid = env
    enrollment = db.get(Enrollment, 11)
    before = (enrollment.payment_status, enrollment.payment_date, enrollment.revenue_total, enrollment.discount_id)
    response = record(env)
    assert response.status_code == 200, response.text
    db.expire_all()
    use = db.get(CouponUse, uid); enrollment = db.get(Enrollment, 11)
    assert use.receipt_reference == 'KMS-OLD' and use.coupon_used_on == date(2026, 10, 13)
    assert use.state == 'receipt_recorded' and use.receipt_recorded_at
    assert use.accounted_observation_id is None and use.expires_on is None
    assert before == (enrollment.payment_status, enrollment.payment_date, enrollment.revenue_total, enrollment.discount_id)
    assert db.get(CouponAccount, 101).version == 2
    assert db.query(CouponOperation).filter_by(kind='legacy_receipt').count() == 1
    assert record(env).json() == response.json()
    assert db.query(CouponOperation).count() == 1


@pytest.mark.parametrize('case', ['wrong_student','wrong_use','unpaid','released','discount_changed','fractional_discount','existing_receipt','stale'])
def test_invalid_or_changed_legacy_use_is_not_written(env, case):
    client, db, _, uid = env
    use = db.get(CouponUse, uid)
    data = payload();student = 101;use_id = uid
    if case == 'wrong_student':student=102
    elif case == 'wrong_use':use_id=str(uuid4())
    elif case == 'unpaid':db.get(Enrollment,11).payment_status='Pending Payment'
    elif case == 'released':use.state='released'
    elif case == 'discount_changed':db.get(Enrollment,11).discount_id=None
    elif case == 'fractional_discount':db.get(Discount,900).discount_value=300.5
    elif case == 'existing_receipt':use.receipt_reference='OTHER'
    elif case == 'stale':data['expected_version']=0
    db.commit()
    response=record(env,data,student,use_id)
    assert response.status_code in {404,409},response.text
    db.expire_all()
    assert db.get(CouponUse,uid).receipt_reference == ('OTHER' if case=='existing_receipt' else None)
    assert db.query(CouponOperation).count()==0


@pytest.mark.parametrize('change', [{'coupon_selected':False},{'coupon_used_on':'2026-10-18'},{'receipt_reference':'  '},{'expected_version':-1}])
def test_receipt_requires_actual_past_date_and_explicit_confirmation(env,change):
    data=payload();data.update(change)
    assert record(env,data).status_code==422
    assert not env[1].get(CouponUse,env[3]).receipt_reference


def test_duplicate_receipt_from_another_enrollment_is_rejected(env):
    _, db, _, uid=env
    db.add(CouponUse(id=str(uuid4()),student_id=101,legacy_enrollment_id=None,value=300,
                     state='receipt_recorded',receipt_reference=' kms-old '));db.commit()
    assert record(env).status_code==409
    assert not db.get(CouponUse,uid).receipt_reference


def test_audit_failure_rolls_receipt_back(env,monkeypatch):
    _,db,_,uid=env
    def fail(*a,**kw):raise ValueError('Synthetic audit failure')
    monkeypatch.setattr(accounting,'save_operation',fail)
    assert record(env).status_code==422
    db.expire_all();assert not db.get(CouponUse,uid).receipt_reference
    assert db.get(CouponAccount,101).version==1


def test_unenabled_historical_feature_cannot_record_receipt(env, monkeypatch):
    monkeypatch.setenv('BILLING_KMS_HISTORICAL_RECEIPTS_ENABLED', 'false')
    response = record(env)
    assert response.status_code == 409
    assert not env[1].get(CouponUse, env[3]).receipt_reference
    assert env[1].get(CouponAccount, 101).version == 1
