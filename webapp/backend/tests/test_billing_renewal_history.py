"""Admins can renew past imperfect history without bypassing new-session safety."""
from datetime import date

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import drafts
from billing.models import BillingPayment
from billing.schemas import PreviewIssue
from models import Enrollment, SessionLog
from tests.test_billing_workflow import env, draft_env, next_review, confirmed, preference, confirmation, second_class


@pytest.fixture(autouse=True)
def sqlite_only():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Renewal history tests only use synthetic SQLite.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def request(client):
    payload = next_review(client, [11])
    payload['confirmed_checks'] = []
    return payload


def reviewed(client, payload):
    response = client.post('/api/billing/students/101/draft-review', json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def history_snapshot(session):
    return [tuple(row) for row in session.query(SessionLog.id, SessionLog.enrollment_id,
        SessionLog.session_date, SessionLog.time_slot, SessionLog.location, SessionLog.session_status,
        SessionLog.financial_status).filter(SessionLog.enrollment_id == 11).order_by(SessionLog.id)]


@pytest.mark.parametrize('damage,expected', [
    ('time', 'OFF_SLOT_ORIGINALS'), ('count', 'ORIGINAL_COUNT_REVIEW'),
    ('gap', 'PAID_COVERAGE_GAP'), ('duplicate', 'OVERLAPPING_ORIGINALS'),
    ('makeup', 'MAKEUP_CHAIN_REVIEW'), ('stopped', 'CONTINUATION_UNCONFIRMED'),
    ('empty_old', 'MISSING_ORIGINALS'), ('payment_status', 'PAYMENT_STATUS_REVIEW'),
])
def test_historical_discrepancies_remain_visible_while_valid_admin_renewal_is_created(env, damage, expected):
    client, session, _ = env
    if damage == 'time':
        session.get(SessionLog, 110).time_slot = '18:25 - 19:55'
    elif damage == 'count':
        session.get(Enrollment, 11).lessons_paid = 7
    elif damage == 'gap':
        session.delete(session.get(SessionLog, 112))
    elif damage == 'duplicate':
        session.add(SessionLog(id=119, enrollment_id=11, student_id=101, tutor_id=1,
            session_date=date(2026, 10, 2), time_slot='16:00 - 17:30', location='MSA',
            session_status='Attended', financial_status='Paid'))
    elif damage == 'makeup':
        session.add(SessionLog(id=119, enrollment_id=11, student_id=101, tutor_id=1,
            session_date=date(2026, 10, 3), time_slot='16:00 - 17:30', location='MSA',
            session_status='Attended (Make-up)', financial_status='Paid', make_up_for_id=999))
    elif damage == 'stopped':
        session.query(SessionLog).filter_by(enrollment_id=11).update({'session_status': 'Attended'})
    else:
        session.add(Enrollment(id=12, student_id=101, tutor_id=1, assigned_day='Fri',
            assigned_time='10:00 - 11:30', location='MSA', lessons_paid=1,
            first_lesson_date=date(2026, 9, 4), payment_status='Paid' if damage == 'empty_old' else 'Unknown legacy state',
            enrollment_type='Regular', is_new_student=False))
        if damage == 'payment_status':
            session.add(SessionLog(id=120, enrollment_id=12, student_id=101, tutor_id=1,
                session_date=date(2026, 9, 4), time_slot='10:00 - 11:30', location='MSA',
                session_status='Attended', financial_status='Paid'))
    session.commit()
    before = history_snapshot(session)
    payload = request(client)
    assert 'renewal' not in payload
    value = reviewed(client, payload)
    issue = next(issue for issue in value['issues'] if issue['code'] == expected)
    assert issue['blocks_creation'] is False
    assert value['message']['blocked_reasons'] == []
    assert value['message']['zh'] and value['message']['en']
    assert value['period']['first_lesson_date'] == '2026-11-13'
    draft, _, payment = confirmed(client, payload=payload)
    assert draft['can_copy'] and draft['stale_reasons'] == []
    assert payment['status'] == 'Pending Payment'
    assert payment['review']['confirmed_checks'] == []
    assert history_snapshot(session) == before
    assert session.query(BillingPayment).count() == 1


def test_admin_can_confirm_two_configured_classes_without_reconfirming_historical_schedule(env):
    client, session, _ = env
    second_class(session)
    payload = next_review(client, [11, 12])
    payload['confirmed_checks'] = []
    value = reviewed(client, payload)
    schedule = [issue for issue in value['issues'] if issue['code'] in drafts.ADVISORY_RENEWAL_CALCULATION
                or issue['code'] in drafts.ADVISORY_RENEWAL_SOURCE]
    assert any(issue['code'] == 'CONTINUING_SLOTS_REVIEW' for issue in schedule)
    assert all(issue['blocks_creation'] is False for issue in schedule)
    assert not value['message']['blocked_reasons']
    _, _, payment = confirmed(client, payload=payload)
    assert len(payment['lines']) == 2


def test_unknown_source_issue_remains_blocking_for_admin_renewal(env, monkeypatch):
    client, _, _ = env
    payload = request(client)
    original = drafts.load_contexts
    def unknown(*args, **kwargs):
        contexts = original(*args, **kwargs)
        contexts[101].issues.append(PreviewIssue(code='UNKNOWN_SAFETY_CHECK', message='Unknown safety check.'))
        return contexts
    monkeypatch.setattr(drafts, 'load_contexts', unknown)
    value = reviewed(client, payload)
    assert value['message']['blocked_reasons'] == ['Unknown safety check.']
    assert next(issue for issue in value['issues'] if issue['code'] == 'UNKNOWN_SAFETY_CHECK')['blocks_creation'] is True


def test_advisory_history_does_not_waive_actual_new_session_overlap(env):
    client, session, _ = env
    session.get(SessionLog, 110).time_slot = '18:25 - 19:55'
    session.add(Enrollment(id=22, student_id=101, tutor_id=1, assigned_day='Fri', assigned_time='17:00 - 18:30',
        location='MSB', lessons_paid=1, first_lesson_date=date(2026, 11, 13), payment_status='Paid',
        enrollment_type='One-Time', is_new_student=False))
    session.flush()
    session.add(SessionLog(id=220, enrollment_id=22, student_id=101, tutor_id=1,
        session_date=date(2026, 11, 13), time_slot='17:00 - 18:30', location='MSB',
        session_status='Scheduled', financial_status='Paid'))
    session.commit()
    payload = request(client)
    assert 'renewal' not in payload
    value = reviewed(client, payload)
    assert next(issue for issue in value['issues'] if issue['code'] == 'OFF_SLOT_ORIGINALS')['blocks_creation'] is False
    conflict = next(issue for issue in value['issues'] if issue['code'] == 'RENEWAL_SESSION_CONFLICT')
    assert conflict['blocks_creation'] is True
    assert value['message']['blocked_reasons'] and value['message']['en'] is None
    assert conflict['record_evidence'][0]['session_id'] == 220
    assert conflict['record_evidence'][0]['date'] == '2026-11-13'
    preference(client)
    payload = request(client)
    draft, data = confirmation(client, payload=payload)
    response = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=data)
    assert response.status_code == 422
    assert session.query(BillingPayment).count() == 0
