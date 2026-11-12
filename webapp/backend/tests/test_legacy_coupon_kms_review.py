"""Legacy receipt facts reconcile archival uses without inventing future stock."""
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.coupon_models import CouponAccount, CouponUse, KmsCouponRedemption
from models import Discount, Enrollment
from tests.test_kms_coupon_apply import (
    env as apply_env, preview_env, coupon_env, workflow_env, draft_env,
    apply, checked, coupon, current, initialise, paid_coupon, snapshot,
)


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_):
        assert dialect.name == 'sqlite', 'Legacy reconciliation tests refuse external databases.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def legacy_env(apply_env, monkeypatch):
    monkeypatch.setenv('BILLING_KMS_HISTORICAL_RECEIPTS_ENABLED', 'true')
    client, db, actor, source = apply_env
    discount = Discount(id=900, discount_name='Synthetic earlier coupon',
                        discount_type='Fixed', discount_value=300)
    db.add(discount); db.flush()
    enrollment = db.get(Enrollment, 11)
    enrollment.discount_id = discount.id
    enrollment.payment_status = 'Paid'
    enrollment.payment_date = date(2026, 11, 9)
    use = CouponUse(id=str(uuid4()), student_id=101, legacy_enrollment_id=11,
                    value=300, state='awaiting_receipt')
    db.add_all([CouponAccount(student_id=101, version=1), use]); db.commit()
    source[0] = snapshot([used()])
    return client, db, actor, source, use.id


def used(**changes):
    values = dict(state='used', issued_on=None, expires_on=None,
                  used_on=date(2026, 10, 13), receipt_reference='EARLIER-R1')
    values.update(changes)
    return coupon('EARLIER-CP', **values)


def enter_receipt(env, reference='EARLIER-R1'):
    client, _, _, _, uid = env
    response = client.post(f'/api/billing/students/101/coupon-uses/{uid}/receipt', json={
        'expected_version': 1, 'idempotency_key': 'earlier-receipt',
        'receipt_reference': reference, 'coupon_used_on': '2026-10-13', 'coupon_selected': True})
    assert response.status_code == 200, response.text
    return response.json()


def test_late_legacy_entry_can_reconcile_unknown_expiry_without_creating_available_stock(legacy_env):
    client, db, _, source, uid = legacy_env
    enrollment = db.get(Enrollment, 11)
    before = (enrollment.payment_status, enrollment.payment_date, enrollment.revenue_total, enrollment.discount_id)
    enter_receipt(legacy_env)
    review = checked(client)
    assert review['update']['ready_count'] == 1, review
    response = apply(client, review, 'archive-earlier-receipt')
    assert response.status_code == 200, response.text
    db.expire_all()
    proof = db.query(KmsCouponRedemption).one()
    use = db.get(CouponUse, uid)
    assert proof.number == 'EARLIER-CP' and proof.expires_on is None
    assert use.accounted_observation_id and use.expires_on is None
    balance = current(client)
    assert balance['usable_count'] == 0 and balance['groups'] == []
    assert balance['receipt_pending_count'] == balance['used_awaiting_sync_count'] == 0
    enrollment = db.get(Enrollment, 11)
    assert before == (enrollment.payment_status, enrollment.payment_date, enrollment.revenue_total, enrollment.discount_id)
    again = checked(client)
    assert again['update']['held_count'] == 0 and again['update']['ready_count'] == 0
    assert db.query(KmsCouponRedemption).count() == 1


@pytest.mark.parametrize('expiry,allowed', [(date(2026, 10, 15), True), (date(2026, 10, 10), False)])
def test_known_legacy_expiry_checks_actual_use_not_later_csm_entry(legacy_env, expiry, allowed):
    client, db, _, _, uid = legacy_env
    db.get(CouponUse, uid).expires_on = expiry; db.commit()
    enter_receipt(legacy_env)
    review = checked(client)
    assert bool(review['update']['ready_count']) is allowed, review
    if allowed:
        response = apply(client, review, 'known-earlier-expiry')
        assert response.status_code == 200, response.text
        assert db.query(KmsCouponRedemption).one().expires_on == expiry
    else:
        assert review['update']['held_count'] == 1
        assert any(i['code'] in {'KMS_SYNC_EXPIRY', 'COUPON_EXPIRY_DISPUTE'}
                   for row in review['students'] for i in row['update_issues'])
        assert db.query(KmsCouponRedemption).count() == 0


@pytest.mark.parametrize('case', ['wrong_reference', 'duplicate_source_reference', 'wrong_source_date'])
def test_historical_legacy_receipt_still_needs_exact_unique_kms_evidence(legacy_env, case):
    client, db, _, source, _ = legacy_env
    if case == 'duplicate_source_reference':
        source[0] = snapshot([used(), coupon('OTHER-CP', state='used', issued_on=None, expires_on=None,
                                           used_on=date(2026, 10, 13), receipt_reference='EARLIER-R1')])
    elif case == 'wrong_source_date':
        source[0] = snapshot([used(used_on=date(2026, 10, 12))])
    enter_receipt(legacy_env, reference='DIFFERENT-R1' if case == 'wrong_reference' else 'EARLIER-R1')
    review = checked(client)
    assert review['update']['held_count'] == 1 and not review['update']['can_apply'], review
    assert any(i['code'] == 'KMS_SYNC_RECEIPT' for row in review['students'] for i in row['update_issues'])
    assert db.query(KmsCouponRedemption).count() == 0


def test_new_payment_still_rejects_coupon_use_before_actual_payment_date(apply_env):
    client, db, _, source = apply_env
    initialise(client); paid = paid_coupon(client)
    use = db.query(CouponUse).filter_by(payment_id=paid['id']).one()
    use.coupon_used_on = date(2026, 10, 13); db.commit()
    source[0] = snapshot([coupon(), coupon('CP-B', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 10, 13), receipt_reference='TEST-R1')])
    review = checked(client)
    assert review['update']['held_count'] == 1
    assert any(i['code'] == 'KMS_SYNC_PAYMENT_DATE' for row in review['students'] for i in row['update_issues'])
    assert db.query(KmsCouponRedemption).count() == 0


@pytest.mark.parametrize('legacy_pointer', [False, True])
def test_new_payment_cannot_archive_a_coupon_with_unknown_expiry(apply_env, legacy_pointer):
    client, db, _, source = apply_env
    initialise(client); paid = paid_coupon(client)
    use = db.query(CouponUse).filter_by(payment_id=paid['id']).one()
    use.expires_on = None
    if legacy_pointer: use.legacy_enrollment_id = 11
    db.commit()
    source[0] = snapshot([coupon(), coupon('CP-B'), coupon('OTHER-USED', state='used', issued_on=None,
        expires_on=None, used_on=date(2026, 10, 17), receipt_reference='TEST-R1')])
    review = checked(client)
    assert review['update']['held_count'] == 1
    assert any(i['code'] == 'KMS_SYNC_EXPIRY' for row in review['students'] for i in row['update_issues'])
    assert db.query(KmsCouponRedemption).count() == 0


@pytest.mark.parametrize('role,header', [('Tutor', None), ('Supervisor', None), ('Super Admin', 'Tutor'), ('Super Admin', 'Supervisor')])
def test_legacy_receipt_entry_requires_effective_admin_write_access(legacy_env, role, header):
    client, db, actor, _, uid = legacy_env
    actor.role = role
    response = client.post(f'/api/billing/students/101/coupon-uses/{uid}/receipt',
        headers={'X-Effective-Role': header} if header else {}, json={
            'expected_version': 1, 'idempotency_key': 'no-receipt-access',
            'receipt_reference': 'EARLIER-R1', 'coupon_used_on': '2026-10-13', 'coupon_selected': True})
    assert response.status_code == 403
    assert db.get(CouponUse, uid).receipt_reference is None
    assert db.get(CouponAccount, 101).version == 1


def test_legacy_receipt_entry_cannot_run_when_coupon_writes_are_disabled(legacy_env, monkeypatch):
    client, db, _, _, uid = legacy_env
    monkeypatch.setenv('BILLING_COUPON_ENABLED', 'false')
    response = client.post(f'/api/billing/students/101/coupon-uses/{uid}/receipt', json={
        'expected_version': 1, 'idempotency_key': 'disabled-receipt',
        'receipt_reference': 'EARLIER-R1', 'coupon_used_on': '2026-10-13', 'coupon_selected': True})
    assert response.status_code == 409
    assert db.get(CouponUse, uid).receipt_reference is None
    assert db.get(CouponAccount, 101).version == 1


def test_modern_payment_receipt_cannot_be_changed_through_legacy_endpoint(apply_env, monkeypatch):
    monkeypatch.setenv('BILLING_KMS_HISTORICAL_RECEIPTS_ENABLED', 'true')
    client, db, _, _ = apply_env
    initialise(client); paid = paid_coupon(client)
    use = db.query(CouponUse).filter_by(payment_id=paid['id']).one()
    expected = db.get(CouponAccount, 101).version
    response = client.post(f'/api/billing/students/101/coupon-uses/{use.id}/receipt', json={
        'expected_version': expected, 'idempotency_key': 'wrong-receipt-path',
        'receipt_reference': 'DIFFERENT-R1', 'coupon_used_on': '2026-10-13', 'coupon_selected': True})
    assert response.status_code == 404
    assert use.receipt_reference == 'TEST-R1'



def test_unknown_legacy_expiry_requires_the_migration_activation_flag(legacy_env, monkeypatch):
    from billing.coupon_models import CouponObservation
    client, db, _, _, uid = legacy_env
    enter_receipt(legacy_env)
    monkeypatch.setenv('BILLING_KMS_HISTORICAL_RECEIPTS_ENABLED', 'false')
    review = checked(client)
    assert review['update']['held_count'] == 1 and not review['update']['can_apply'], review
    before = db.get(CouponAccount, 101).version
    assert apply(client, review, 'historical-storage-disabled').status_code == 409
    assert db.query(KmsCouponRedemption).count() == 0
    assert db.query(CouponObservation).count() == 0
    assert db.get(CouponAccount, 101).version == before
    assert db.get(CouponUse, uid).accounted_observation_id is None


def test_nullable_historical_schema_does_not_hide_missing_modern_archival_expiry(apply_env):
    client, db, _, source = apply_env
    initialise(client); paid = paid_coupon(client)
    source[0] = snapshot([coupon(), coupon('CP-B', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 10, 17), receipt_reference='TEST-R1')])
    response = apply(client, checked(client), 'modern-known-proof')
    assert response.status_code == 200, response.text
    proof = db.query(KmsCouponRedemption).one()
    use = db.query(CouponUse).filter_by(payment_id=paid['id']).one()
    proof.expires_on = None
    use.expires_on = None
    db.commit()
    balance = current(client)
    assert balance['usable_count'] is None
    assert any(i['code'] == 'KMS_SYNC_EXPIRY' for i in balance['issues'])
