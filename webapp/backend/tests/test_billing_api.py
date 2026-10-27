"""The preview must be authenticated, role-aware and unable to write records."""
from datetime import date

import pytest
from sqlalchemy import event

from auth.dependencies import get_current_user
from main import app
from models import Holiday, Tutor
from tests.helpers import make_auth_token

COOKIE = {'access_token': make_auth_token(99)}


@pytest.fixture
def staff():
    user = Tutor(id=99, user_email='preview@example.com', tutor_name='Preview Tutor', role='Tutor')
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


def payload(**changes):
    return dict(first_lesson_date='2026-11-10', slots=[{'weekday': 'Tue'}, {'weekday': 'Thu'}],
                materials_fee=0, trial_deduction=True, **changes)


def test_preview_requires_sign_in(client):
    assert client.post('/api/billing/preview', json=payload()).status_code == 401
    assert client.get('/api/billing/options').status_code == 401


def test_preview_queries_only_and_returns_monthly_journey(client, staff, db_session):
    db_session.add(Holiday(holiday_date=date(2026, 12, 25), holiday_name='Synthetic closure'))
    db_session.commit()
    statements = []

    def only_select(_conn, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement

    event.listen(db_session.bind, 'before_cursor_execute', only_select)
    try:
        response = client.post('/api/billing/preview', json=payload(), cookies=COOKIE)
    finally:
        event.remove(db_session.bind, 'before_cursor_execute', only_select)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['is_preview'] is True and result['creates_records'] is False
    assert [p['lesson_count'] for p in result['periods'][:3]] == [6, 10, 8]
    assert result['periods'][0]['total_fee'] == 2250
    assert result['periods'][1]['collection']['due_before_lesson'] == '2026-12-01'
    assert statements


def test_tutor_cannot_preview_admin_adjustment(client, staff):
    response = client.post('/api/billing/preview', json=payload(
        adjustment={'through': '2026-11-30', 'reason': 'Discuss shorter first payment'}), cookies=COOKIE)
    assert response.status_code == 403


def test_admin_can_preview_exception_without_confirming_it(client, staff):
    staff.role = 'Admin'
    response = client.post('/api/billing/preview', json={
        'first_lesson_date': '2026-11-11', 'slots': [{'weekday': 'Tue'}, {'weekday': 'Wed'}],
        'materials_fee': 0, 'adjustment': {'through': '2026-11-30', 'reason': 'Approved shorter first month'},
    }, cookies=COOKIE)
    assert response.status_code == 200, response.text
    first, second = response.json()['periods'][:2]
    assert first['lesson_count'] == 5 and first['total_fee'] == 2000
    assert first['adjustment_reason'] == 'Approved shorter first month'
    assert first['requires_review'] is True
    assert second['lesson_count'] == 10


def test_impersonation_restricts_admin_adjustment(client, staff):
    staff.role = 'Super Admin'
    response = client.post('/api/billing/preview', json=payload(
        adjustment={'through': '2026-11-30', 'reason': 'Test'}),
        cookies=COOKIE, headers={'X-Effective-Role': 'Tutor'})
    assert response.status_code == 403


def test_forged_effective_role_does_not_elevate_tutor(client, staff):
    response = client.post('/api/billing/preview', json=payload(
        adjustment={'through': '2026-11-30', 'reason': 'Test'}),
        cookies=COOKIE, headers={'X-Effective-Role': 'Admin'})
    assert response.status_code == 403


def test_guest_cannot_preview_fees(client, staff):
    staff.role = 'Guest'
    assert client.get('/api/billing/options', cookies=COOKIE).status_code == 403
    assert client.post('/api/billing/preview', json=payload(), cookies=COOKIE).status_code == 403


def test_unconfirmed_materials_do_not_become_final_total(client, staff):
    data = payload()
    data.pop('materials_fee')
    result = client.post('/api/billing/preview', json=data, cookies=COOKIE).json()
    assert result['periods'][0]['total_fee'] is None
    assert result['periods'][0]['tuition_after_deductions'] == 2250
    assert any(i['code'] == 'MATERIALS_UNCONFIRMED' for i in result['issues'])


def test_coupon_cannot_stack_with_trial_deduction(client, staff):
    data = payload(coupon={'kind': 'ordinary', 'value': 300})
    assert client.post('/api/billing/preview', json=data, cookies=COOKIE).status_code == 422


def test_options_are_authenticated_policy_metadata(client, staff):
    result = client.get('/api/billing/options', cookies=COOKIE)
    assert result.status_code == 200
    assert result.json()['unit_fee'] == 400
    assert result.json()['regular_end'] == '2027-07-04'
