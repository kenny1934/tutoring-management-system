"""Returning enrollment and materials decisions against synthetic SQLite only."""
from datetime import date
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingPayment
from models import Enrollment
from routers import billing, billing_drafts, billing_workflow
from tests.test_billing_intake import intake_env, env, draft_env, intake_request, reviewed, confirmed


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Returning-intake tests cannot access shared data.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def earlier(db, *, course='Regular', status='Paid'):
    db.add(Enrollment(id=31, student_id=102, tutor_id=1, enrollment_type=course,
        first_lesson_date=date(2026, 6, 6), lessons_paid=6, assigned_day='Sat',
        assigned_time='16:00 - 17:30', location='MSA', payment_status=status))
    db.commit()


def clock(monkeypatch, day):
    for module in (billing, billing_drafts, billing_workflow):
        monkeypatch.setattr(module, 'today', lambda: day)


def preferences(client, *, method='manual', ready=False):
    response = client.put('/api/billing/students/102/preferences', json={
        'payment_method': method, 'mandate_ready': ready, 'expected_version': 0,
        'idempotency_key': 'returning-preferences'})
    assert response.status_code == 200, response.text


@pytest.mark.parametrize('course,status,new', [
    ('Regular', 'Paid', False), ('Regular', 'Cancelled', False),
    ('Summer', 'Paid', False), ('One-Time', 'Paid', False), ('Trial', 'Paid', True),
])
def test_newness_uses_all_non_trial_history_not_just_this_teaching_year(intake_env, course, status, new):
    client, db, _ = intake_env
    earlier(db, course=course, status=status)
    response = client.get('/api/billing/students/102/intake-context', params={'trial_enrollment_id': 21, 'trial_session_id': 210})
    assert response.status_code == 200, response.text
    source = response.json()
    assert source['is_new_student'] is new
    assert source['materials_fee'] == (100 if new else 0)
    assert source['standard_materials_fee'] == 100
    assert source['suggested_request']['mode'] == ('new_student' if new else 'returning_student')


def test_returning_student_can_publish_a_short_calendar_payment_without_new_materials(intake_env, monkeypatch):
    client, db, _ = intake_env
    earlier(db); clock(monkeypatch, date(2027, 1, 20)); preferences(client)
    payload = intake_request(client, trial=False)
    payload['scenario'].update(first_lesson_date='2027-01-30', slots=[{'weekday': 'Sat', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}])
    value = reviewed(client, payload)
    assert value['scenario']['mode'] == 'returning_student'
    assert value['period']['lesson_count'] == 5 and value['period']['coverage_through'] == '2027-02-28'
    assert value['period']['materials_fee'] == 0 and not value['message']['blocked_reasons']
    _, _, payment = confirmed(client, payload)
    enrollment = db.get(Enrollment, payment['lines'][0]['enrollment_id'])
    assert enrollment.is_new_student is False
    assert enrollment.lessons_paid == 5 and enrollment.first_lesson_date == date(2027, 1, 30)


def test_returning_verified_trial_keeps_150_credit_without_changing_identity(intake_env):
    client, db, _ = intake_env
    earlier(db); preferences(client)
    payload = intake_request(client)
    value = reviewed(client, payload)
    assert value['scenario']['mode'] == 'returning_student'
    assert value['period']['deductions'] == [{'kind': 'trial', 'amount': 150}]
    assert value['period']['materials_fee'] == 0
    _, _, payment = confirmed(client, payload)
    assert db.get(Enrollment, payment['lines'][0]['enrollment_id']).is_new_student is False


@pytest.mark.parametrize('as_of,method', [(date(2026, 11, 18), 'autopay'), (date(2026, 11, 19), 'manual')])
def test_server_notice_deadline_controls_returning_autopay(intake_env, monkeypatch, as_of, method):
    client, db, _ = intake_env
    earlier(db); clock(monkeypatch, as_of); preferences(client, method='autopay', ready=True)
    payload = intake_request(client, trial=False)
    payload['scenario'].update(first_lesson_date='2026-12-05', slots=[{'weekday': 'Sat', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}], payment_method='autopay', mandate_ready=True)
    value = reviewed(client, payload)
    assert value['period']['collection']['method'] == method
    assert not value['message']['blocked_reasons']
    response = client.post('/api/billing/preview', json=payload['scenario'])
    assert response.status_code == 200, response.text
    assert response.json()['periods'][0]['collection']['method'] == method
    _, _, payment = confirmed(client, payload)
    assert payment['review']['period']['collection']['method'] == method
    assert client.get('/api/billing/students/102/preferences').json()['payment_method'] == 'autopay'


@pytest.mark.parametrize('new', [False, True])
def test_raw_mode_cannot_forge_the_server_history_decision(intake_env, new):
    client, db, _ = intake_env
    if not new:
        earlier(db)
    payload = intake_request(client, trial=False)
    payload['scenario']['mode'] = 'returning_student' if new else 'new_student'
    value = reviewed(client, payload)
    assert any(issue['code'] == 'INTAKE_BILLING_MODE' for issue in value['issues'])
    assert value['message']['blocked_reasons']
    assert db.query(BillingPayment).count() == 0
    payload['scenario']['onboarding_as_of'] = '2020-01-01'
    assert client.post('/api/billing/students/102/draft-review', json=payload).status_code == 422


def test_past_return_still_requires_actual_past_date_confirmation(intake_env, monkeypatch):
    client, db, _ = intake_env
    earlier(db); clock(monkeypatch, date(2026, 11, 23)); preferences(client, method='autopay', ready=True)
    payload = intake_request(client, trial=False)
    payload['scenario'].update(payment_method='autopay', mandate_ready=True)
    value = reviewed(client, payload)
    assert value['period']['collection']['method'] == 'manual'
    assert any(issue['code'] == 'UNPAID_PAST_DATES' for issue in value['issues'])
    assert value['message']['blocked_reasons']
    payload['confirmed_checks'] = ['UNPAID_PAST_DATES']
    assert not reviewed(client, payload)['message']['blocked_reasons']


@pytest.mark.parametrize('forged', [False, True])
def test_recorded_bank_authorisation_controls_the_returning_first_payment(intake_env, monkeypatch, forged):
    client, db, _ = intake_env
    earlier(db); clock(monkeypatch, date(2026, 11, 18)); preferences(client, method='autopay', ready=False)
    payload = intake_request(client, trial=False)
    payload['scenario'].update(first_lesson_date='2026-12-05', slots=[{'weekday': 'Sat', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}],
                               payment_method='autopay', mandate_ready=forged)
    value = reviewed(client, payload)
    if forged:
        assert any(issue['code'] == 'INTAKE_BANK_AUTHORISATION' for issue in value['issues'])
        assert value['message']['blocked_reasons'] and value['message']['en'] is None
        assert db.query(BillingPayment).count() == 0
    else:
        assert value['period']['collection']['method'] == 'manual'
        assert not value['message']['blocked_reasons']
        _, _, payment = confirmed(client, payload)
        assert payment['review']['period']['collection']['method'] == 'manual'
        assert client.get('/api/billing/students/102/preferences').json()['payment_method'] == 'autopay'
