"""Reviewed application and usable-stock invariants on isolated synthetic data."""
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import coupon_accounting as accounting, kms_apply, clock
from billing.coupon_models import (CouponAccount, CouponImport, CouponObservation, CouponUse,
                                  KmsCouponLock, KmsCouponRedemption, KmsCouponVerification)
from billing.models import BillingPayment
from models import Enrollment, Student
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env, confirmed, coupon_payload, pay_payload
from tests.test_billing_coupons import env as coupon_env, preview as count_preview
from tests.test_kms_coupon_preview import env as preview_env, NOW, snapshot, coupon, checked


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_):
        assert dialect.name == 'sqlite', 'KMS update tests refuse external databases.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def env(preview_env, monkeypatch):
    client, db, actor, source = preview_env
    monkeypatch.setenv('BILLING_KMS_STOCK_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_KMS_APPLY_ENABLED', 'true')
    monkeypatch.setattr(kms_apply, 'now', lambda: NOW)
    monkeypatch.setattr(clock, 'today', lambda: NOW.date())
    from routers import billing_coupons
    monkeypatch.setattr(billing_coupons, 'today', lambda: NOW.date())
    db.add_all([KmsCouponLock(branch='MSA'), KmsCouponLock(branch='MSB')]); db.commit()
    return client, db, actor, source


def apply(client, review, key='kms-update-1'):
    return client.post(f"/api/billing/kms-coupons/checks/{review['id']}/apply", json={
        'expected_review_hash': review['update']['review_hash'], 'idempotency_key': key})


def current(client):
    response = client.get('/api/billing/students/101/coupons')
    assert response.status_code == 200, response.text
    return response.json()


def initialise(client):
    review = checked(client)
    assert review['update']['ready_count'] == 1 and review['update']['can_apply']
    response = apply(client, review)
    assert response.status_code == 200, response.text
    return review, response.json()


def paid_coupon(client):
    payment = confirmed(client, payload=coupon_payload(client))[2]
    paid = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment,
        receipt_reference='TEST-R1', coupon_selected=True, coupon_used_on='2026-10-17'))
    assert paid.status_code == 200, paid.text
    return paid.json()


def test_first_update_creates_usable_groups_and_replays_exactly(env):
    client, db, _, _ = env
    enrollment = db.get(Enrollment, 11)
    before = (enrollment.payment_status, enrollment.lessons_paid, enrollment.payment_date)
    review, result = initialise(client)
    assert result['updated_count'] == 1 and result['review']['update']['ready_count'] == 0
    balance = current(client)
    assert balance['usable_count'] == 2 and balance['kms_managed'] and not balance['can_verify']
    assert balance['groups'][0]['quantity'] == 2
    assert db.query(KmsCouponVerification).count() == 1
    assert db.query(BillingPayment).count() == 0
    assert (enrollment.payment_status, enrollment.lessons_paid, enrollment.payment_date) == before
    replay = apply(client, review)
    assert replay.status_code == 200 and replay.json() == result
    assert db.query(CouponObservation).count() == 1


def test_normal_new_enrollment_reserves_from_synced_groups(env):
    client, db, _, _ = env
    initialise(client)
    confirmed(client, payload=coupon_payload(client))
    balance = current(client)
    assert balance['usable_count'] == 1 and balance['reserved_count'] == 1
    assert db.query(KmsCouponRedemption).count() == 0  # No arbitrary CP choice for an unpaid enrollment.


def test_two_to_three_to_two_reconciles_actual_use_without_double_deduction(env):
    client, db, _, source = env
    initialise(client); paid_coupon(client)
    source[0] = snapshot([coupon(), coupon('CP-C'), coupon('CP-B', state='used', issued_on=None,
        expires_on=None, used_on=date(2026, 10, 17), receipt_reference='TEST-R1')])
    review = checked(client)
    assert current(client)['usable_count'] is None  # Known changed identities cannot be spent before review.
    assert review['update']['ready_count'] == 1, review
    response = apply(client, review, 'kms-update-2')
    assert response.status_code == 200, response.text
    balance = current(client)
    assert balance['usable_count'] == 2 and balance['used_awaiting_sync_count'] == 0
    proof = db.query(KmsCouponRedemption).one()
    assert proof.number == 'CP-B' and db.get(CouponUse, proof.use_id).accounted_observation_id


def test_repeated_previews_do_not_erase_an_unresolved_disappearance(env):
    client, _, _, source = env
    initialise(client)
    source[0] = snapshot([coupon()])
    first = checked(client); second = checked(client)
    assert first['update']['held_count'] == second['update']['held_count'] == 1
    assert second['missing_count'] == 0  # Preview delta is not the applied baseline.
    assert current(client)['usable_count'] is None
    assert apply(client, second, 'held').status_code == 409


def test_partial_update_skips_held_students_without_creating_accounts_for_them(env):
    client, db, _, source = env
    db.get(Student, 102).school_student_id = '0022'; db.commit()
    initialise(client)
    source[0] = snapshot([coupon(), coupon('CP-X', company_id='MSA0022')])
    review = checked(client)
    assert review['update']['ready_count'] == 1 and review['update']['held_count'] == 1
    old_version = db.get(CouponAccount, 101).version
    response = apply(client, review, 'partial')
    assert response.status_code == 200, response.text
    assert response.json()['updated_count'] == 1 and response.json()['held_count'] == 1
    assert db.get(CouponAccount, 101).version == old_version
    assert db.get(CouponAccount, 102).verification_id


def test_same_check_can_update_another_student_after_a_hold_is_resolved(env):
    client, db, _, source = env
    db.get(Student, 102).school_student_id = '0022'; db.commit()
    source[0] = snapshot([coupon(), coupon('CP-X', company_id='MSA0022')])
    # A duplicate profile initially holds only the second student.
    db.add(Student(id=103, student_name='Synthetic duplicate', home_location='MSA', school_student_id='0022')); db.commit()
    review = checked(client)
    response = apply(client, review)
    assert response.status_code == 200, response.text
    db.get(Student, 103).school_student_id = '0099'; db.commit()
    fresh = client.get(f"/api/billing/kms-coupons/checks/{review['id']}").json()
    assert fresh['update']['ready_count'] == 1
    response = apply(client, fresh, 'resolved')
    assert response.status_code == 200, response.text
    assert db.query(CouponImport).count() == 1


def test_account_version_change_invalidates_the_review(env):
    client, db, _, _ = env
    review = checked(client)
    db.add(CouponAccount(student_id=101, version=3)); db.commit()
    assert apply(client, review).status_code == 409
    assert db.query(CouponObservation).count() == 0


def test_newer_or_stale_sources_cannot_be_applied(env, monkeypatch):
    client, db, _, _ = env
    old = checked(client); checked(client)
    assert apply(client, old).status_code == 409
    fresh = checked(client)
    monkeypatch.setattr(kms_apply, 'now', lambda: NOW.replace(day=11))
    assert apply(client, fresh, 'stale').status_code == 409
    assert db.query(CouponObservation).count() == 0


def test_manual_count_import_and_verification_cannot_override_managed_stock(env):
    client, db, _, _ = env
    initialise(client)
    reviewed = count_preview(client, [('MSA0021', 99)])
    assert not reviewed['can_confirm'] and reviewed['invalid_count'] == 1
    source_import = db.query(CouponImport).filter(CouponImport.source_filename.like('KMS-E-Coupons-%')).one()
    assert client.get(f'/api/billing/coupon-imports/{source_import.id}').status_code == 409
    from tests.test_billing_coupons import checked as manual_check
    assert manual_check(client)[0].status_code != 200


@pytest.mark.parametrize('change', ['status', 'receipt', 'payment_date', 'value', 'expiry'])
def test_consumed_identity_remains_checked_after_accounting(env, change):
    client, db, _, source = env
    initialise(client); paid = paid_coupon(client)
    source[0] = snapshot([coupon(), coupon('CP-B', state='used', issued_on=None,
        expires_on=None, used_on=date(2026, 10, 17), receipt_reference='TEST-R1')])
    response = apply(client, checked(client), 'used')
    assert response.status_code == 200, response.text
    payment = db.get(BillingPayment, paid['id'])
    if change == 'status': payment.status = 'Pending Payment'
    elif change == 'receipt': payment.receipt_reference = 'TEST-R2'
    elif change == 'payment_date': payment.payment_date = date(2026, 10, 18)
    elif change == 'value': payment.coupon_value = 500
    else: db.query(CouponUse).filter_by(payment_id=payment.id).one().expires_on = date(2028, 6, 30)
    db.commit()
    balance = current(client)
    assert balance['usable_count'] is None
    assert any(i['code'] == 'COUPON_SOURCE_REVIEW' or i['code'].startswith('KMS_SYNC_') for i in balance['issues'])


def test_a_redeemed_coupon_cannot_reappear_as_available(env):
    client, _, _, source = env
    initialise(client); paid_coupon(client)
    used = coupon('CP-B', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 10, 17), receipt_reference='TEST-R1')
    source[0] = snapshot([coupon(), used])
    assert apply(client, checked(client), 'used').status_code == 200
    source[0] = snapshot([coupon(), coupon('CP-B')])
    review = checked(client)
    assert review['update']['held_count'] == 1 and not review['update']['can_apply']
    assert current(client)['usable_count'] is None


def test_apply_flag_off_keeps_previews_and_balances_readable(env, monkeypatch):
    client, _, _, _ = env
    initialise(client)
    monkeypatch.setenv('BILLING_KMS_APPLY_ENABLED', 'false')
    assert current(client)['usable_count'] == 2
    assert not checked(client)['update']['can_apply']


def test_used_number_cannot_move_to_another_student_after_repeated_previews(env):
    client, db, _, source = env
    db.get(Student, 102).school_student_id = '0022'; db.commit()
    source[0] = snapshot([coupon('CP-USED', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 10, 17), receipt_reference='TEST-OLD')])
    checked(client)  # Source evidence is durable even without a CSM redemption.
    source[0] = snapshot([coupon('CP-USED', company_id='MSA0022')])
    checked(client); review = checked(client)
    assert review['update']['ready_count'] == 0 and review['update']['held_count'] == 1
    assert any(i['code'] == 'KMS_SYNC_REAPPEARED' for r in review['students'] for i in r['update_issues'])


def test_actual_redeemed_coupon_expiry_cannot_borrow_the_reserved_groups_later_expiry(env, monkeypatch):
    client, db, _, source = env
    source[0] = snapshot([coupon(expires_on=date(2026, 12, 31)), coupon('CP-B')])
    initialise(client); paid_coupon(client)
    use = db.query(CouponUse).one()
    assert use.expires_on == date(2027, 6, 30)
    use.coupon_used_on = date(2027, 1, 10); db.commit()
    when = datetime(2027, 1, 15, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(kms_apply, 'now', lambda: when)
    monkeypatch.setattr(clock, 'today', lambda: when.date())
    from routers import billing_coupons
    monkeypatch.setattr(billing_coupons, 'today', lambda: when.date())
    source[0] = snapshot([coupon('CP-B'), coupon('CP-A', state='used', issued_on=None, expires_on=None,
        used_on=date(2027, 1, 10), receipt_reference='TEST-R1')], fetched_at=when, used_years=[2026, 2027])
    review = checked(client)
    assert review['update']['held_count'] == 1
    assert any(i['code'] == 'KMS_SYNC_EXPIRY' for i in review['students'][0]['update_issues'])


def test_manually_accounted_uses_still_check_the_underlying_payment_receipt(env):
    client, db, _, _ = env
    initialise(client); paid = paid_coupon(client)
    use = db.query(CouponUse).one()
    use.accounted_observation_id = db.get(CouponAccount, 101).observation_id
    db.get(BillingPayment, paid['id']).receipt_reference = 'TEST-DIFFERENT'; db.commit()
    assert db.query(KmsCouponRedemption).count() == 0
    assert current(client)['usable_count'] is None


def test_payment_version_change_invalidates_an_otherwise_safe_review(env):
    client, db, _, source = env
    initialise(client); paid = paid_coupon(client)
    source[0] = snapshot([coupon(), coupon('CP-B', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 10, 17), receipt_reference='TEST-R1')])
    review = checked(client)
    db.get(BillingPayment, paid['id']).version += 1; db.commit()
    assert apply(client, review, 'changed-payment').status_code == 409


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_only_effective_admins_can_apply_updates(env, role):
    client, db, actor, _ = env
    review = checked(client)
    actor.role = role
    assert apply(client, review).status_code == 403
    assert db.query(CouponObservation).count() == 0


def test_clients_cannot_choose_coupon_values_or_force_student_selection(env):
    client, db, _, _ = env
    review = checked(client)
    response = client.post(f"/api/billing/kms-coupons/checks/{review['id']}/apply", json={
        'expected_review_hash': review['update']['review_hash'], 'idempotency_key': 'forged',
        'student_ids': [101], 'coupons': [{'value': 10000}]})
    assert response.status_code == 422 and db.query(CouponObservation).count() == 0


def test_an_audit_write_failure_rolls_back_the_entire_update(env, monkeypatch):
    client, db, _, _ = env
    review = checked(client)
    def fail(*args, **kwargs):
        raise ValueError('Synthetic audit failure')
    monkeypatch.setattr(accounting, 'save_operation', fail)
    assert apply(client, review).status_code == 422
    assert db.query(CouponObservation).count() == 0 and db.query(CouponAccount).count() == 0


def test_incomplete_compact_receipt_evidence_holds_stock_without_crashing(env):
    client, db, _, source = env
    initialise(client); paid_coupon(client)
    source[0] = snapshot([coupon(), coupon('CP-B', state='used', issued_on=None,
        expires_on=None, used_on=date(2026, 10, 17), receipt_reference='TEST-R1')])
    assert apply(client, checked(client), 'used').status_code == 200
    proof = db.query(KmsCouponRedemption).one()
    proof.coupon = {**proof.coupon, 'used_on': None}; db.commit()
    balance = current(client)
    assert balance['usable_count'] is None
    assert any(i['code'] == 'KMS_SYNC_RECEIPT' for i in balance['issues'])
    fresh = checked(client)
    assert fresh['update']['held_count'] == 1


def receiptless_payment(client):
    payment = confirmed(client, payload=coupon_payload(client))[2]
    response = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment))
    assert response.status_code == 200, response.text
    return response.json()


def used_coupon(number='CP-B', **changes):
    return coupon(number, state='used', issued_on=None, expires_on=None,
                  used_on=changes.pop('used_on', date(2026, 10, 17)),
                  receipt_reference=changes.pop('receipt_reference', 'AUTO-R1'), **changes)


def test_automatic_receipt_links_only_when_reviewed_and_is_idempotent(env):
    from billing.models import BillingOperation
    client, db, _, source = env
    initialise(client)
    paid = receiptless_payment(client)
    source[0] = snapshot([coupon(), used_coupon()])
    review = checked(client)
    assert review['update']['ready_count'] == 1, review
    match = review['students'][0]['uses'][0]
    assert match['result'] == 'link_receipt' and match['receipt_reference'] == 'AUTO-R1'
    db.expire_all()
    payment = db.get(BillingPayment, paid['id'])
    assert payment.receipt_reference is None  # Reading/previewing never writes.
    original = (payment.status, payment.received_amount, payment.payment_date, payment.version)
    response = apply(client, review, 'auto-receipt')
    assert response.status_code == 200, response.text
    db.expire_all()
    payment = db.get(BillingPayment, paid['id'])
    use = db.query(CouponUse).filter_by(payment_id=payment.id).one()
    assert payment.receipt_reference == use.receipt_reference == 'AUTO-R1'
    assert payment.coupon_status == 'recorded_in_kms' and use.state == 'receipt_recorded'
    assert (payment.status, payment.received_amount, payment.payment_date) == original[:3]
    assert payment.version == original[3] + 1 and use.coupon_used_on == date(2026, 10, 17)
    assert db.query(KmsCouponRedemption).one().use_id == use.id
    assert db.query(BillingOperation).filter_by(kind='kms_receipt', payment_id=payment.id).count() == 1
    assert current(client)['usable_count'] == 1
    assert apply(client, review, 'auto-receipt').json() == response.json()
    assert db.query(BillingOperation).filter_by(kind='kms_receipt').count() == 1


@pytest.mark.parametrize('case', ['two_coupons', 'different_date', 'unpaid', 'wrong_value', 'wrong_student', 'bad_amount', 'bad_lesson'])
def test_unclear_coupon_receipts_are_never_linked(env, case):
    from billing.models import BillingOperation
    client, db, _, source = env
    initialise(client)
    if case == 'unpaid':
        paid = confirmed(client, payload=coupon_payload(client))[2]
    else:
        paid = receiptless_payment(client)
    used = used_coupon()
    coupons = [coupon(), used]
    if case == 'two_coupons': coupons.append(used_coupon('CP-C', receipt_reference='AUTO-R2'))
    elif case == 'different_date': coupons[1] = used_coupon(used_on=date(2026, 10, 18))
    elif case == 'wrong_value': coupons[1] = used_coupon(value=500)
    elif case == 'wrong_student': coupons[1] = used_coupon(company_id='MSA0022')
    elif case == 'bad_amount': db.get(BillingPayment, paid['id']).received_amount = 1; db.commit()
    elif case == 'bad_lesson':
        from models import SessionLog
        from billing.models import BillingLessonClaim
        claim = db.query(BillingLessonClaim).filter_by(payment_id=paid['id']).first()
        db.get(SessionLog, claim.session_id).student_id = 102; db.commit()
    source[0] = snapshot(coupons)
    review = checked(client)
    assert not any(u['result'] == 'link_receipt' for r in review['students'] for u in r['uses'])
    if review['update']['can_apply']:
        assert apply(client, review, 'unclear').status_code == 200
    db.expire_all()
    assert not db.get(BillingPayment, paid['id']).receipt_reference
    assert db.query(BillingOperation).filter_by(kind='kms_receipt').count() == 0


def test_automatic_receipt_rolls_back_with_failed_audit(env, monkeypatch):
    from billing.models import BillingOperation
    client, db, _, source = env
    initialise(client); paid = receiptless_payment(client)
    source[0] = snapshot([coupon(), used_coupon()])
    review = checked(client)
    monkeypatch.setattr(accounting, 'save_operation', lambda *args, **kwargs: (_ for _ in ()).throw(ValueError('Audit failed')))
    assert apply(client, review, 'failed-receipt').status_code == 422
    db.expire_all()
    assert not db.get(BillingPayment, paid['id']).receipt_reference
    assert db.query(BillingOperation).filter_by(kind='kms_receipt').count() == 0
    assert db.query(KmsCouponRedemption).count() == 0


@pytest.mark.parametrize('case', ['another_payment', 'accounted_payment', 'legacy_payment', 'untracked_legacy', 'receipt_on_noncoupon_payment', 'existing_use_date'])
def test_automatic_receipt_does_not_steal_other_payment_evidence(env, case):
    from uuid import uuid4
    client, db, _, source = env
    initialise(client); paid = receiptless_payment(client)
    payment = db.get(BillingPayment, paid['id'])
    use = db.query(CouponUse).filter_by(payment_id=payment.id).one()
    if case == 'existing_use_date':
        use.coupon_used_on = date(2026, 10, 16)
    elif case in {'legacy_payment', 'untracked_legacy'}:
        from models import Discount
        discount = Discount(id=901, discount_name='Synthetic coupon', discount_type='Fixed', discount_value=300)
        db.add(discount); db.flush()
        enrollment = db.get(Enrollment, 11)
        enrollment.payment_status = 'Paid'; enrollment.payment_date = date(2026, 10, 17)
        enrollment.discount_id = discount.id
        if case == 'legacy_payment': db.add(CouponUse(id=str(uuid4()), student_id=101, legacy_enrollment_id=enrollment.id,
            value=use.value, expires_on=use.expires_on, state='awaiting_receipt',
            accounted_observation_id=db.get(CouponAccount, 101).observation_id))
    else:
        values = {c.name: getattr(payment, c.name) for c in payment.__table__.columns}
        from billing.models import BillingDraft
        draft = BillingDraft(id=str(uuid4()), account_id=payment.account_id, current_revision=1)
        db.add(draft); db.flush()
        values.update(id=str(uuid4()), draft_id=draft.id)
        other = BillingPayment(**values)
        if case == 'receipt_on_noncoupon_payment':
            other.coupon_value = 0; other.receipt_reference = 'AUTO-R1'
        db.add(other); db.flush()
        if case != 'receipt_on_noncoupon_payment':
            values = {c.name: getattr(use, c.name) for c in use.__table__.columns}
            values.update(id=str(uuid4()), payment_id=other.id)
            if case == 'accounted_payment': values['accounted_observation_id'] = db.get(CouponAccount, 101).observation_id
            db.add(CouponUse(**values))
    db.commit()
    source[0] = snapshot([coupon(), used_coupon()])
    review = checked(client)
    assert not any(u['result'] == 'link_receipt' for r in review['students'] for u in r['uses'])
    if review['update']['can_apply']:
        assert apply(client, review, 'other-owner').status_code == 200
    db.expire_all()
    assert not db.get(BillingPayment, paid['id']).receipt_reference
