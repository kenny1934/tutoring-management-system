"""KMS preview checks use synthetic SQLite records and mocked upstream HTTP."""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from xml.etree import ElementTree as ET

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import kms_client, kms_preview
from billing.coupon_models import CouponAccount, CouponImport, CouponObservation, CouponUse, CouponVerification, KmsCouponCheck
from billing.kms_schemas import KmsCoupon, KmsSnapshot
from billing.models import BillingPayment
from models import Enrollment, Student, StudentCoupon
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env
from tests.test_billing_coupons import env as coupon_env

NOW = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    monkeypatch.delenv('KMS_ACCOUNTS_FILE', raising=False)
    def reject(dialect, *_):
        assert dialect.name == 'sqlite', 'KMS preview checks refuse external databases.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def coupon(number='CP-A', **changes):
    return KmsCoupon(**{'number': number, 'company_id': 'MSA0021', 'value': 300, 'state': 'active',
        'issued_on': date(2026, 6, 10), 'expires_on': date(2027, 6, 30), **changes})


def snapshot(coupons=None, **changes):
    coupons = coupons if coupons is not None else [coupon(), coupon('CP-B')]
    return KmsSnapshot(**{'branch': 'MSA', 'fetched_at': NOW, 'used_years': [2025, 2026],
        'active_count': sum(c.state == 'active' for c in coupons), 'coupons': coupons, **changes})


@pytest.fixture
def env(coupon_env, monkeypatch):
    monkeypatch.setenv('BILLING_KMS_PREVIEW_ENABLED', 'true')
    source = [snapshot()]
    monkeypatch.setattr(kms_preview, 'KmsClient', lambda branch: SimpleNamespace(read=lambda: source[0]))
    monkeypatch.setattr(kms_preview, 'credentials', lambda branch: ('invented', 'not-a-secret'))
    return (*coupon_env, source)


def checked(client):
    response = client.post('/api/billing/kms-coupons/check', json={'branch': 'MSA'})
    assert response.status_code == 200, response.text
    return response.json()


def financial_counts(db):
    return [db.query(model).count() for model in (CouponAccount, CouponImport, CouponObservation,
            CouponVerification, CouponUse, BillingPayment, Enrollment)]


def test_checks_save_history_without_modifying_financial_records(env):
    client, db, _, _ = env
    before = financial_counts(db)
    result = checked(client)
    assert result['active_count'] == 2 and result['new_count'] == 0
    assert result['previous_fetched_at'] is None
    assert result['students'][0]['company_id'] == 'MSA0021'
    assert db.query(KmsCouponCheck).count() == 1
    assert financial_counts(db) == before
    status = client.get('/api/billing/kms-coupons/status').json()
    assert status['branches'] == ['MSA', 'MSB'] and status['latest'][0]['id'] == result['id']
    reopened = client.get(f"/api/billing/kms-coupons/checks/{result['id']}")
    assert reopened.status_code == 200 and reopened.json()['active_count'] == 2


def test_same_count_addition_and_use_are_detected_by_coupon_number(env):
    client, db, _, source = env
    checked(client)
    source[0] = snapshot([coupon(), coupon('CP-C'), coupon('CP-B', state='used',
        issued_on=None, expires_on=None, used_on=date(2026, 11, 9), receipt_reference='TEST-R1')])
    result = checked(client)
    assert result['active_count'] == 2 and result['new_count'] == 1 and result['used_count'] == 1
    assert result['newly_used_count'] == 1
    assert result['previous_fetched_at'] is not None
    assert {c['coupon']['number']: c['change'] for c in result['students'][0]['coupons']} == {
        'CP-A': 'active', 'CP-B': 'used', 'CP-C': 'new'}
    assert result['students'][0]['previous_count'] == 2


def test_changed_details_and_unexplained_disappearance_require_review(env):
    client, _, _, source = env
    checked(client)
    source[0] = snapshot([coupon(value=200)])
    result = checked(client)
    assert result['changed_count'] == 1 and result['missing_count'] == 1
    assert result['students'][0]['status'] == 'review'
    assert {i['code'] for i in result['students'][0]['issues']} >= {'COUPON_CHANGED', 'COUPON_MISSING'}


def test_an_edited_used_receipt_is_a_change_not_unchanged_history(env):
    client, _, _, source = env
    used = coupon('CP-B', state='used', issued_on=None, expires_on=None,
                  used_on=date(2026, 11, 8), receipt_reference='TEST-R1')
    source[0] = snapshot([used]); checked(client)
    source[0] = snapshot([used.model_copy(update={'receipt_reference': 'TEST-R2'})])
    result = checked(client)
    assert result['changed_count'] == 1 and result['used_count'] == 1
    assert result['students'][0]['coupons'][0]['change'] == 'changed'
    assert result['students'][0]['status'] == 'review'


@pytest.mark.parametrize('kind', ['cache', 'observation'])
def test_first_check_includes_positive_csm_balances_missing_entirely_from_kms(env, kind):
    client, db, _, source = env
    if kind == 'cache':
        db.add(StudentCoupon(student_id=101, available_coupons=2)); db.commit()
    else:
        from tests.test_billing_coupons import observed
        observed(client, count=2)
    source[0] = snapshot([])
    result = checked(client)
    assert result['active_count'] == 0 and result['review_count'] == 1
    assert result['students'][0]['csm_count'] == 2
    assert result['students'][0]['active_count'] == 0
    assert any(i['code'] == 'CSM_COUNT_DIFFERS' for i in result['students'][0]['issues'])


def test_first_check_includes_untracked_csm_coupon_payments_without_kms_rows(env):
    client, db, _, source = env
    from tests.test_billing_workflow import confirmed
    payment = confirmed(client)[2]
    db.get(BillingPayment, payment['id']).coupon_value = 300
    db.commit()
    source[0] = snapshot([])
    result = checked(client)
    assert result['review_count'] == 1
    assert any(i['code'] == 'UNTRACKED_COUPON_PAYMENT' for i in result['students'][0]['issues'])


def test_missing_expired_coupon_is_not_marked_used(env):
    client, _, _, source = env
    source[0] = snapshot([coupon(expires_on=date(2026, 11, 8))], fetched_at=NOW.replace(day=7))
    checked(client)
    source[0] = snapshot([])
    result = checked(client)
    assert result['expired_count'] == 1 and result['used_count'] == 0 and result['missing_count'] == 0


def test_exact_owned_receipt_matches_without_clearing_use(env):
    client, db, _, source = env
    use = CouponUse(id='synthetic-use', student_id=101, legacy_enrollment_id=11,
        value=300, expires_on=date(2027, 6, 30), state='receipt_recorded',
        receipt_reference='TEST-R1', coupon_used_on=date(2026, 11, 9))
    db.add(use); db.commit()
    source[0] = snapshot([coupon('CP-B', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 11, 9), receipt_reference='TEST-R1')])
    result = checked(client)
    assert result['students'][0]['uses'][0]['result'] == 'matched'
    assert result['students'][0]['uses'][0]['coupon_number'] == 'CP-B'
    assert db.get(CouponUse, use.id).accounted_observation_id is None


@pytest.mark.parametrize('mismatch', ['student', 'value', 'receipt'])
def test_receipt_matching_never_guesses_or_crosses_student_scope(env, mismatch):
    client, db, _, source = env
    db.add(CouponUse(id='synthetic-use', student_id=101, legacy_enrollment_id=11,
        value=300, state='receipt_recorded', receipt_reference='TEST-R1'))
    db.commit()
    changes = {'company_id': 'MSA9999'} if mismatch == 'student' else {'value': 200} if mismatch == 'value' else {'receipt_reference': 'TEST-R2'}
    used = coupon('CP-B', state='used', issued_on=None, expires_on=None, used_on=date(2026, 11, 9), receipt_reference='TEST-R1')
    source[0] = snapshot([used.model_copy(update=changes)])
    result = checked(client)
    own = next(r for r in result['students'] if r['company_id'] == 'MSA0021')
    assert own['uses'][0]['result'] == 'review'
    assert own['uses'][0]['coupon_number'] is None


def test_reservation_shortfall_is_visible_and_no_coupon_is_assigned(env):
    client, db, _, source = env
    db.get(Enrollment, 11).payment_status = 'Pending Payment'
    db.add(CouponUse(id='synthetic-use', student_id=101, legacy_enrollment_id=11,
        value=500, expires_on=date(2027, 6, 30), state='reserved'))
    db.commit()
    result = checked(client)
    assert result['students'][0]['uses'][0]['result'] == 'reserved'
    assert result['students'][0]['uses'][0]['coupon_number'] is None
    assert any(i['code'] == 'RESERVATION_SHORTFALL' for i in result['students'][0]['issues'])


def test_kms_receipt_match_does_not_hide_unpaid_csm_payment(env):
    client, db, _, source = env
    db.get(Enrollment, 11).payment_status = 'Pending Payment'
    db.add(CouponUse(id='synthetic-use', student_id=101, legacy_enrollment_id=11,
        value=300, expires_on=date(2027, 6, 30), state='receipt_recorded', receipt_reference='TEST-R1'))
    db.commit()
    source[0] = snapshot([coupon('CP-B', state='used', issued_on=None, expires_on=None,
        used_on=date(2026, 11, 9), receipt_reference='TEST-R1')])
    result = checked(client)
    own = result['students'][0]
    assert own['status'] == 'review'
    assert any(i['code'] == 'COUPON_SOURCE_REVIEW' for i in own['issues'])
    assert db.get(Enrollment, 11).payment_status == 'Pending Payment'


def test_unmatched_and_duplicate_profiles_are_not_silently_assigned(env):
    client, db, _, source = env
    db.add(Student(id=103, student_name='Synthetic duplicate', home_location='MSA', school_student_id='0021'))
    db.commit()
    source[0] = snapshot([coupon(), coupon('CP-Z', company_id='MSA9999')])
    result = checked(client)
    assert result['unmatched_count'] == 2
    assert all(r['student'] is None for r in result['students'])
    assert any(i['code'] == 'AMBIGUOUS_STUDENT' for r in result['students'] for i in r['issues'])


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_non_admin_roles_cannot_read_or_fetch_branch_coupon_data(env, role):
    client, db, actor, _ = env
    actor.role = role
    for path in ('/api/billing/kms-coupons/status', '/api/billing/kms-coupons/checks/11111111-1111-1111-1111-111111111111'):
        assert client.get(path).status_code == 403
    assert client.post('/api/billing/kms-coupons/check', json={'branch': 'MSA'}).status_code == 403
    assert db.query(KmsCouponCheck).count() == 0


def test_disabled_checks_do_not_access_preview_storage_or_kms(env, monkeypatch):
    client, db, _, _ = env
    monkeypatch.setenv('BILLING_KMS_PREVIEW_ENABLED', 'false')
    assert client.get('/api/billing/kms-coupons/status').json() == {'enabled': False, 'branches': [], 'latest': []}
    assert client.post('/api/billing/kms-coupons/check', json={'branch': 'MSA'}).status_code == 409
    assert db.query(KmsCouponCheck).count() == 0


def test_failed_upstream_does_not_create_a_check_or_change_balances(env, monkeypatch):
    client, db, _, _ = env
    def fail():
        raise kms_client.KmsReadError('KMS could not be reached. No coupon balances were changed.')
    monkeypatch.setattr(kms_preview, 'KmsClient', lambda branch: SimpleNamespace(read=fail))
    before = financial_counts(db)
    result = client.post('/api/billing/kms-coupons/check', json={'branch': 'MSA'})
    assert result.status_code == 422 and 'could not be reached' in result.json()['detail']
    assert db.query(KmsCouponCheck).count() == 0 and financial_counts(db) == before


def xml_rows(rows):
    root = ET.Element('dataset')
    for values in rows:
        record = ET.SubElement(root, 'record')
        for name, value in values.items():
            ET.SubElement(record, name).text = str(value)
    return ET.tostring(root)


def active_row():
    return {'couponnum': 'CP-A', 'studentcode': 'MSA0021', 'amount': '300', 'date': '2026-06-10', 'expiry': '2027-06-30'}


@pytest.mark.parametrize('problem', [None, 'login', 'branch', 'count', 'redirect', 'network'])
def test_collector_uses_only_inspected_read_requests_and_checks_complete_inventory(monkeypatch, problem):
    monkeypatch.setenv('KMS_MSA_USERNAME', 'reader@example.test')
    monkeypatch.setenv('KMS_MSA_PASSWORD', 'synthetic-password')
    actions = []
    count_calls = []
    def upstream(request):
        assert request.url.host == 'kms.kidsconcept.net' and request.url.scheme == 'https'
        if request.method == 'GET':
            if problem == 'network':
                raise httpx.ConnectError('synthetic-password', request=request)
            if problem == 'redirect':
                return httpx.Response(302, headers={'location': 'https://untrusted.example.test'})
            return httpx.Response(200, text='<html>Login</html>')
        if request.url.path.endswith('/ERP'):
            return httpx.Response(200, text='<html>E-Coupon<script>var gComID="5";</script></html>')
        action = request.headers['action']; actions.append(action)
        if action == 'DOLOGIN':
            return httpx.Response(200, text='USERLOGINFAIL' if problem == 'login' else 'uid-reader@example.test')
        assert action == 'SEARCHQUERY'
        query = request.headers['query']
        data = {'loadStaffSite': [{'site': '1'}], 'searchSite': [{'id': '1', 'code': 'MSA'}],
                'searchActiveCouponCount': [{'count': '1'}], 'searchActiveCoupon': [active_row()], 'searchUsedCoupon': []}
        if problem == 'branch':
            data['searchSite'] = [{'id': '1', 'code': 'MSB'}]
        if query == 'searchActiveCouponCount':
            count_calls.append(True)
            if problem == 'count' and len(count_calls) > 1:
                data[query] = [{'count': '2'}]
        return httpx.Response(200, content=xml_rows(data[query]))
    client = httpx.Client(base_url=kms_client.ORIGIN, transport=httpx.MockTransport(upstream))
    if problem:
        with pytest.raises(kms_client.KmsReadError) as error:
            kms_client.KmsClient('MSA', client=client).read(fetched_at=NOW)
        assert 'synthetic-password' not in str(error.value)
        return
    source = kms_client.KmsClient('MSA', client=client).read(fetched_at=NOW)
    assert source.active_count == 1 and source.coupons[0].issued_on == date(2026, 6, 10)
    assert source.used_years == [2025, 2026]
    assert set(actions) == {'DOLOGIN', 'SEARCHQUERY'}


@pytest.mark.parametrize('problem', ['duplicate', 'foreign_branch', 'missing_row', 'bad_amount', 'bad_expiry', 'used_active_overlap', 'wrong_usage_year'])
def test_bad_upstream_inventory_is_rejected_as_a_whole(problem):
    active, used, count = [active_row()], [], 1
    if problem == 'duplicate': active.append(active_row()); count = 2
    if problem == 'foreign_branch': active[0]['studentcode'] = 'MSB0021'
    if problem == 'missing_row': count = 2
    if problem == 'bad_amount': active[0]['amount'] = 'NaN'
    if problem == 'bad_expiry': active[0]['expiry'] = '2020-01-01'
    if problem in {'used_active_overlap', 'wrong_usage_year'}:
        used.append({'couponnum': 'CP-A' if problem == 'used_active_overlap' else 'CP-B', 'code': 'MSA0021',
                     'amount': '300', 'date': '2026-01-01' if problem == 'used_active_overlap' else '2023-01-01', 'fullinvoice': 'TEST-R1'})
    with pytest.raises(kms_client.KmsReadError):
        kms_client.parse_coupon_rows(active, used, branch='MSA', active_count=count, fetched_at=NOW, years=[2025, 2026])


@pytest.mark.parametrize('content', [b'<html>Login</html>', b'<!DOCTYPE dataset [<!ENTITY x "sensitive">]><dataset/>', b'<dataset><record>'])
def test_login_pages_entities_and_malformed_xml_are_not_empty_inventories(content):
    with pytest.raises(kms_client.KmsReadError):
        kms_client._xml(content)


def test_kms_display_prefix_and_bare_used_student_id_preserve_leading_zeroes():
    active = [{**active_row(), 'couponnum': '#00042'}]
    used = [{'couponnum': '#00043', 'code': '0021', 'amount': '300', 'date': '2026-11-08 18:30', 'fullinvoice': 'MSA-000123'}]
    result = kms_client.parse_coupon_rows(active, used, branch='MSA', active_count=1, fetched_at=NOW, years=[2025, 2026])
    assert {c.number for c in result.coupons} == {'00042', '00043'}
    assert {c.company_id for c in result.coupons} == {'MSA0021'}
