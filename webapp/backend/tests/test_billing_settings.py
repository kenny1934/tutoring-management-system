"""Global pricing configuration is isolated from seasonal intake and frozen payments."""
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingGlobalSettings, BillingSettingsOperation, BillingPayment
from tests.test_billing_intake import intake_env, env, draft_env, intake_request, reviewed, saved, confirmed, save_preference


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Billing settings tests cannot access shared data.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


@pytest.fixture
def configured(intake_env, monkeypatch):
    client, db, user = intake_env
    monkeypatch.setenv('BILLING_SETTINGS_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_SETTINGS_ENABLED', 'true')
    db.add(BillingGlobalSettings(id=1, materials_fee=100, version=1)); db.commit()
    return client, db, user


def update(client, amount, *, version=1, key='settings-1'):
    return client.put('/api/billing/settings', json={'materials_fee': amount,
        'expected_version': version, 'idempotency_key': key})


def test_disabled_storage_defaults_to_100_without_creating_settings(intake_env):
    client, db, _ = intake_env
    assert client.get('/api/billing/settings').json() == {'materials_fee': 100, 'version': 0,
        'storage_available': False, 'writes_available': False}
    assert client.get('/api/billing/options').json()['standard_materials_fee'] == 100
    assert update(client, 125).status_code == 503
    assert db.query(BillingGlobalSettings).count() == db.query(BillingSettingsOperation).count() == 0


def test_missing_schema_is_safe_while_feature_flags_are_already_on(configured):
    client, db, _ = configured
    BillingSettingsOperation.__table__.drop(db.bind)
    value = client.get('/api/billing/settings')
    assert value.status_code == 200
    assert value.json()['storage_available'] is False
    assert client.get('/api/billing/options').json()['standard_materials_fee'] == 100
    assert update(client, 125).status_code == 503


@pytest.mark.parametrize('role', ['Tutor', 'Supervisor', 'Guest'])
def test_settings_require_admin_for_reads_and_writes(configured, role):
    client, _, user = configured; user.role = role
    assert client.get('/api/billing/settings').status_code == 403
    assert update(client, 125).status_code == 403


def test_versioned_update_and_exact_replay_preserve_audit(configured):
    client, db, user = configured
    first = update(client, 125)
    assert first.status_code == 200, first.text
    assert first.json()['materials_fee'] == 125 and first.json()['version'] == 2
    assert client.get('/api/billing/options').json()['standard_materials_fee'] == 125
    assert update(client, 130, version=2, key='settings-2').status_code == 200
    assert update(client, 125).json() == first.json()
    assert client.get('/api/billing/settings').json()['materials_fee'] == 130
    assert update(client, 120).status_code == 409
    assert update(client, 140, version=1, key='stale-settings').status_code == 409
    user.id = 9
    assert update(client, 125).status_code == 409
    assert db.query(BillingSettingsOperation).count() == 2


@pytest.mark.parametrize('amount', [-1, 10001, 100.5, True, '125'])
def test_amount_is_a_bounded_whole_number(configured, amount):
    client, _, _ = configured
    assert update(client, amount).status_code == 422


def test_writes_can_pause_while_configured_amount_stays_readable(configured, monkeypatch):
    client, _, _ = configured
    assert update(client, 125).status_code == 200
    monkeypatch.setenv('BILLING_SETTINGS_ENABLED', 'false')
    settings = client.get('/api/billing/settings').json()
    assert settings['materials_fee'] == 125 and not settings['writes_available']
    assert update(client, 150, version=2, key='paused').status_code == 503


@pytest.mark.parametrize('amount', [0, 125])
def test_materials_is_zero_or_the_configured_amount_without_any_reason(configured, amount):
    client, _, _ = configured
    assert update(client, 125).status_code == 200
    payload = intake_request(client)
    payload['scenario']['materials_fee'] = amount
    value = reviewed(client, payload)
    assert not value['message']['blocked_reasons']
    assert value['period']['materials_fee'] == amount
    assert 'materials_override_reason' not in payload['intake']
    source = client.get('/api/billing/students/102/intake-context').json()
    assert source['standard_materials_fee'] == 125


def test_a_reason_cannot_authorise_an_arbitrary_materials_amount(configured):
    client, _, _ = configured
    payload = intake_request(client)
    payload['scenario']['materials_fee'] = 200
    payload['intake']['materials_override_reason'] = 'Legacy arbitrary override'
    value = reviewed(client, payload)
    assert any(issue['code'] == 'INTAKE_MATERIALS_AMOUNT' for issue in value['issues'])
    assert value['message']['blocked_reasons']


def test_pricing_change_holds_an_unconfirmed_draft_but_never_reprices_confirmed_payments(configured):
    client, db, _ = configured
    save_preference(client)
    payload = intake_request(client)
    draft, _, payment = confirmed(client, payload)
    assert payment['lines'][0]['materials_fee'] == 100
    assert update(client, 125).status_code == 200
    frozen = client.get(f"/api/billing/payments/{payment['id']}").json()
    assert frozen['lines'][0]['materials_fee'] == 100
    assert frozen['review']['period']['materials_fee'] == 100
    assert frozen['review']['period']['total_fee'] == payment['review']['period']['total_fee']


def test_changed_pricing_and_aba_change_make_a_saved_draft_require_review(configured):
    client, db, _ = configured
    save_preference(client)
    draft = saved(client, intake_request(client))
    assert update(client, 125).status_code == 200
    assert update(client, 100, version=2, key='restore-price').status_code == 200
    detail = client.get(f"/api/billing/drafts/{draft['id']}").json()
    assert detail['stale_reasons'] and not detail['can_copy']
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json={
        'expected_revision': 1, 'expected_review_hash': draft['review']['review_hash'],
        'expected_preference_version': 1, 'idempotency_key': 'stale-price-confirm'})
    assert response.status_code == 409
    assert db.query(BillingPayment).count() == 0
