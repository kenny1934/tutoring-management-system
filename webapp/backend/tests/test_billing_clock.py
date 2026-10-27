"""Isolated fee-calendar controls never select a database or change audit time."""
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine, URL

import database
from billing import clock
from billing.models import BillingAccount, BillingOperation, BillingPayment, utc_now
from models import Enrollment, SessionLog
from services import makeup_entitlement as makeup_service
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env as workflow_env, confirmed, pay_payload
from tests.test_billing_coupons import env as coupon_env, balance, observed


@pytest.fixture(autouse=True)
def no_external_connections_or_inherited_clock(monkeypatch):
    monkeypatch.delenv('BILLING_TEST_DATE_FILE', raising=False)
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Clock checks may only connect to disposable SQLite.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def isolated_clock(monkeypatch, tmp_path):
    path = tmp_path / 'synthetic-fee-date.txt'
    path.write_text('2026-11-17\n')
    monkeypatch.setenv('BILLING_TEST_DATE_FILE', str(path))
    monkeypatch.setenv('ARK_DEMO', '1')
    monkeypatch.setattr(database, 'ENVIRONMENT', 'development')
    monkeypatch.setattr(database, 'DB_NAME', 'synthetic_billing_clock_test')
    monkeypatch.setattr(database, 'engine', SimpleNamespace(url=URL.create(
        'mysql+pymysql', host='synthetic.invalid', database='synthetic_billing_clock_test')))
    return path


def freeze_clock(monkeypatch, fixed):
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)
    monkeypatch.setattr(clock, 'datetime', FrozenDatetime)


@pytest.mark.parametrize('configured', [None, '', '   '])
def test_no_configured_file_never_enables_or_reads_an_override(monkeypatch, configured):
    monkeypatch.setattr(database, 'ENVIRONMENT', 'production')
    monkeypatch.setattr(database, 'DB_NAME', 'synthetic_production_name')
    if configured is not None:
        monkeypatch.setenv('BILLING_TEST_DATE_FILE', configured)
    def unexpected_read(*_args, **_kwargs):
        raise AssertionError('No clock file should have been read.')
    monkeypatch.setattr(clock.Path, 'read_text', unexpected_read)
    assert clock.test_date() is None


@pytest.mark.parametrize('environment', ['production', 'test', 'staging', '', 'Development'])
def test_resolved_environment_must_be_development(isolated_clock, monkeypatch, environment):
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setattr(database, 'ENVIRONMENT', environment)
    with pytest.raises(RuntimeError, match='isolated local test database'):
        clock.test_date()


@pytest.mark.parametrize('ark_demo', [None, '', '0', 'true', '01'])
def test_demo_switch_must_be_exactly_one(isolated_clock, monkeypatch, ark_demo):
    if ark_demo is None:
        monkeypatch.delenv('ARK_DEMO')
    else:
        monkeypatch.setenv('ARK_DEMO', ark_demo)
    with pytest.raises(RuntimeError, match='isolated local test database'):
        clock.test_date()


@pytest.mark.parametrize('db_name', [None, '', 'synthetic_demo', 'synthetic_prod', 'synthetic_test_backup', 'synthetic_TEST'])
def test_database_name_requires_test_suffix_even_when_engine_agrees(isolated_clock, monkeypatch, db_name):
    monkeypatch.setattr(database, 'DB_NAME', db_name)
    monkeypatch.setattr(database, 'engine', SimpleNamespace(url=URL.create('mysql+pymysql', database=db_name)))
    with pytest.raises(RuntimeError, match='isolated local test database'):
        clock.test_date()


def test_resolved_engine_must_match_the_resolved_database_name(isolated_clock, monkeypatch):
    monkeypatch.setenv('DB_NAME', 'synthetic_billing_clock_test')
    monkeypatch.setattr(database, 'engine', SimpleNamespace(url=URL.create(
        'mysql+pymysql', database='another_synthetic_test')))
    with pytest.raises(RuntimeError, match='isolated local test database'):
        clock.test_date()


def test_live_environment_cannot_disguise_the_actual_engine_target(isolated_clock, monkeypatch):
    monkeypatch.setenv('DB_NAME', 'synthetic_billing_clock_test')
    monkeypatch.setattr(database, 'DB_NAME', 'synthetic_production_name')
    monkeypatch.setattr(database, 'engine', SimpleNamespace(url=URL.create(
        'mysql+pymysql', database='synthetic_production_name')))
    with pytest.raises(RuntimeError, match='isolated local test database'):
        clock.test_date()


@pytest.mark.parametrize('value', [
    '', '20261117', '2026-W47-2', '2026-1-17', '2026-11-7', '2026/11/17',
    '2026-11-17T00:00:00', '2026-11-17\n2026-11-18', '2026-02-29',
    '2026-13-01', '2026-00-10', '2026-11-00', 'not a date', '\ufeff2026-11-17',
])
def test_invalid_configured_file_fails_closed(isolated_clock, value):
    isolated_clock.write_text(value)
    for function in (clock.test_date, clock.today, clock.logical_now, clock.event_time):
        with pytest.raises(RuntimeError, match='unavailable or invalid'):
            function()


def test_missing_file_and_directory_fail_closed(isolated_clock, monkeypatch):
    isolated_clock.unlink()
    with pytest.raises(RuntimeError, match='unavailable or invalid'):
        clock.today()
    monkeypatch.setenv('BILLING_TEST_DATE_FILE', str(isolated_clock.parent))
    with pytest.raises(RuntimeError, match='unavailable or invalid'):
        clock.today()


def test_valid_file_is_reloaded_without_caching(isolated_clock):
    assert clock.test_date() == date(2026, 11, 17)
    assert clock.today(date(1999, 1, 1)) == date(2026, 11, 17)
    isolated_clock.write_text('2027-01-20\n')
    assert clock.test_date() == clock.today() == date(2027, 1, 20)
    isolated_clock.write_text(' 2028-02-29\n')
    assert clock.today() == date(2028, 2, 29)


def test_wall_clock_fallback_uses_hong_kong_day_and_keeps_supplied_legacy_day(monkeypatch):
    instant = datetime(2026, 10, 22, 16, 30, 45, tzinfo=timezone.utc)
    freeze_clock(monkeypatch, instant)
    assert clock.today() == date(2026, 10, 23)
    assert clock.today(date(2026, 10, 17)) == date(2026, 10, 17)
    assert clock.logical_now() == instant
    assert clock.logical_now().tzinfo == timezone.utc
    assert clock.event_time() == instant.replace(tzinfo=None)


def test_logical_time_keeps_hong_kong_time_of_day_and_returns_utc(isolated_clock, monkeypatch):
    freeze_clock(monkeypatch, datetime(2026, 10, 22, 16, 30, 45, 123456, tzinfo=timezone.utc))
    expected = datetime(2026, 11, 16, 16, 30, 45, 123456, tzinfo=timezone.utc)
    assert clock.logical_now() == expected
    assert clock.logical_now().astimezone(ZoneInfo('Asia/Hong_Kong')).date() == clock.today()
    assert clock.event_time() == expected.replace(tzinfo=None)
    assert clock.event_time().tzinfo is None


def test_business_date_does_not_shift_model_audit_time_or_jwt_expiry(isolated_clock):
    from auth.jwt_handler import create_access_token
    from jose import jwt
    isolated_clock.write_text('2032-02-29\n')
    before = datetime.now(timezone.utc)
    timestamp = utc_now()
    token = create_access_token({'sub': 'synthetic-clock-user'}, expires_delta=timedelta(hours=1))
    after = datetime.now(timezone.utc)
    assert before.replace(tzinfo=None) <= timestamp <= after.replace(tzinfo=None)
    assert timestamp.date() != clock.today()
    claims = jwt.get_unverified_claims(token)
    assert int((before + timedelta(hours=1)).timestamp()) <= claims['exp'] <= int((after + timedelta(hours=1)).timestamp())


def test_options_exposes_the_authoritative_day_and_only_an_active_override(workflow_env, isolated_clock, monkeypatch):
    from routers import billing
    client, _, _ = workflow_env
    monkeypatch.setattr(billing, 'today', clock.today)
    response = client.get('/api/billing/options')
    assert response.status_code == 200, response.text
    assert response.json()['as_of'] == response.json()['test_date'] == '2026-11-17'
    isolated_clock.write_text('2027-01-20\n')
    changed = client.get('/api/billing/options').json()
    assert changed['as_of'] == changed['test_date'] == '2027-01-20'
    monkeypatch.delenv('BILLING_TEST_DATE_FILE')
    normal = client.get('/api/billing/options').json()
    assert normal['test_date'] is None and normal['as_of'] == clock.today().isoformat()


def test_native_sent_uses_logical_day_while_payment_and_operation_audits_stay_real(workflow_env, monkeypatch, tmp_path):
    from routers import billing_workflow
    client, db, _ = workflow_env
    _, _, payment = confirmed(client)
    path = tmp_path / 'synthetic-native-fee-date.txt'
    path.write_text('2026-11-17\n')
    monkeypatch.setenv('BILLING_TEST_DATE_FILE', str(path))
    monkeypatch.setenv('ARK_DEMO', '1')
    monkeypatch.setattr(database, 'ENVIRONMENT', 'development')
    monkeypatch.setattr(database, 'DB_NAME', 'synthetic_native_clock_test')
    monkeypatch.setattr(database, 'engine', SimpleNamespace(url=URL.create(
        'mysql+pymysql', database='synthetic_native_clock_test')))
    monkeypatch.setattr(billing_workflow, 'today', clock.today)
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    sent = client.post(f"/api/billing/payments/{payment['id']}/sent", json={
        'expected_version': payment['version'], 'idempotency_key': 'synthetic-clock-sent', 'language': 'zh',
    })
    assert sent.status_code == 200, sent.text
    paid = client.post(f"/api/billing/payments/{payment['id']}/manual-paid", json=pay_payload(
        sent.json(), payment_date='2026-11-17'))
    assert paid.status_code == 200, paid.text
    after = datetime.now(timezone.utc).replace(tzinfo=None)
    stored = db.get(BillingPayment, payment['id'])
    sent_day = stored.sent_at.replace(tzinfo=timezone.utc).astimezone(ZoneInfo('Asia/Hong_Kong')).date()
    assert sent_day == date(2026, 11, 17)
    assert stored.payment_date == date(2026, 11, 17)
    assert before <= stored.paid_at <= after
    operations = db.query(BillingOperation).filter(BillingOperation.payment_id == payment['id'],
        BillingOperation.kind.in_(['sent', 'paid'])).all()
    assert len(operations) == 2 and all(before <= operation.created_at <= after for operation in operations)


def test_makeup_eligibility_uses_the_clock_without_an_explicit_as_of(workflow_env, isolated_clock, monkeypatch):
    _, db, _ = workflow_env
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_ENABLED', 'true')
    db.add(BillingAccount(student_id=101, academic_start=makeup_service.POLICY.academic_start,
        policy_version=makeup_service.POLICY.version, active=True))
    db.add(Enrollment(id=30, student_id=101, tutor_id=1, enrollment_type='Regular', assigned_day='Fri',
        assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
        first_lesson_date=date(2026, 9, 4), payment_status='Paid'))
    db.flush()
    db.add(SessionLog(id=300, enrollment_id=30, student_id=101, tutor_id=1,
        session_date=date(2026, 9, 4), time_slot='16:00 - 17:30', location='MSA',
        session_status='Sick Leave - Pending Make-up', financial_status='Paid'))
    db.commit()
    isolated_clock.write_text('2026-11-12\n')
    assert makeup_service._today() == date(2026, 11, 12)
    assert makeup_service.eligibility_for_sessions(db, [300])[300].can_book
    isolated_clock.write_text('2026-11-13\n')
    assert makeup_service.eligibility_for_sessions(db, [300])[300].status == 'payment_required'
    isolated_clock.write_text('2027-07-01\n')
    assert makeup_service.eligibility_for_sessions(db, [300])[300].status == 'expired'
    assert makeup_service.eligibility_for_sessions(db, [300], as_of=date(2026, 10, 17))[300].can_book


def test_coupon_verification_checks_against_logical_time(coupon_env, isolated_clock, monkeypatch):
    from routers import billing_coupons
    client, _, _ = coupon_env
    monkeypatch.setattr(billing_coupons, 'today', clock.today)
    freeze_clock(monkeypatch, datetime(2026, 10, 22, 2, 30, tzinfo=timezone.utc))
    observed(client, observed_on='2026-11-17')
    current = balance(client)
    payload = {'expected_version': current['version'], 'observation_id': current['observation']['id'],
        'checked_at': '2026-11-17T01:00:00Z',
        'groups': [{'kind': 'ordinary', 'value': 300, 'expires_on': '2027-06-30', 'quantity': 1}],
        'reconciliations': [], 'reason': 'Synthetic future-day KMS check.'}
    reviewed = client.post('/api/billing/students/101/coupons/review', json=payload)
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()['can_confirm'], reviewed.json()
    future = client.post('/api/billing/students/101/coupons/review', json={
        **payload, 'checked_at': '2026-11-17T03:00:00Z'})
    assert future.status_code == 200, future.text
    assert not future.json()['can_confirm']
    assert any(issue['code'] == 'CHECK_DATE' for issue in future.json()['issues'])
