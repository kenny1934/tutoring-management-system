"""First-enrollment drafts must remain findable before teaching records exist."""
from datetime import date
import re

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingDraftRevision
from models import Enrollment, SessionLog, Tutor
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_queue import env, queue


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Intake queue checks use synthetic SQLite only.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


def intake_draft(client, *, trial=False, key='intake-queue', tutor=1):
    params = {'trial_enrollment_id': 22, 'trial_session_id': 221} if trial else {}
    response = client.get('/api/billing/students/102/intake-context', params=params)
    assert response.status_code == 200, response.text
    context = response.json()
    review = {
        'scenario': {'mode': 'new_student', 'payment_method': 'manual', 'first_lesson_date': '2026-11-03',
                     'slots': [{'weekday': 'Tue', 'time_slot': '16:00 - 17:30', 'location': 'MSA'}],
                     'materials_fee': context['materials_fee'], 'trial_deduction': trial},
        'intake': {**params, 'slots': [{'tutor_id': tutor}]},
        'expected_source_fingerprint': context['source_fingerprint'],
    }
    response = client.post('/api/billing/students/102/draft-review', json=review)
    assert response.status_code == 200, response.text
    assert response.json()['message']['blocked_reasons'] == [], response.json()
    saved = client.post('/api/billing/students/102/drafts', json={
        'review': review, 'expected_review_hash': response.json()['review_hash'], 'idempotency_key': key,
    })
    assert saved.status_code == 200, saved.text
    return saved.json()


def only_intake(client, **params):
    rows = queue(client, **params)['rows']
    return [row for row in rows if row['student']['id'] == 102]


def test_first_draft_without_any_enrollment_is_visible_with_exact_recovery_link(env):
    client, session, _ = env
    draft = intake_draft(client)
    rows = only_intake(client)
    assert len(rows) == 1
    row = rows[0]
    assert row['origin'] == 'draft' and row['stage'] == 'prepare'
    assert row['draft_id'] == draft['id'] and row['enrollment_ids'] == []
    assert row['lesson_count'] == draft['review']['period']['lesson_count']
    assert row['total_fee'] == draft['review']['period']['total_fee']
    assert row['payment_method'] == row['collection']['method'] == 'manual'
    assert row['recorded_payment_method'] is None
    assert row['action_url'] == f"/billing/preview?student_id=102&draft_id={draft['id']}"
    assert {i['code'] for i in row['issues']} == {'DRAFT_REVIEW', 'PAYMENT_PREFERENCE_REQUIRED'}
    assert session.query(Enrollment).filter_by(student_id=102).count() == 0
    assert session.query(SessionLog).filter_by(student_id=102).count() == 0


def test_intake_branch_filter_uses_proposed_teaching_branch(env):
    client, _, _ = env
    intake_draft(client)
    assert len(only_intake(client, location='MSA')) == 1
    assert only_intake(client, location='MSB') == []


def test_proposed_tutor_does_not_grant_student_scope(env):
    client, session, _ = env
    session.add(Tutor(id=2, user_email='proposed@example.test', tutor_name='Proposed Tutor', role='Tutor'))
    session.commit()
    intake_draft(client, tutor=2)
    assert only_intake(client, tutor_id=2) == []


@pytest.mark.parametrize('enrollment_tutor', [1, 2])
def test_attended_trial_owner_can_find_saved_first_enrollment(env, enrollment_tutor):
    client, session, _ = env
    if enrollment_tutor == 2:
        session.add(Tutor(id=2, user_email='assigned@example.test', tutor_name='Assigned Tutor', role='Tutor'))
    session.add(Enrollment(id=22, student_id=102, tutor_id=enrollment_tutor, assigned_day='Tue',
                           assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
                           first_lesson_date=date(2026, 10, 13), payment_status='Paid', enrollment_type='Trial'))
    session.flush()
    session.add(SessionLog(id=221, enrollment_id=22, student_id=102, tutor_id=1,
                          session_date=date(2026, 10, 13), time_slot='16:00 - 17:30', location='MSA',
                          session_status='Attended', financial_status='Paid'))
    session.commit()
    draft = intake_draft(client, trial=True)
    rows = only_intake(client, tutor_id=1)
    assert len(rows) == 1 and rows[0]['draft_id'] == draft['id']
    assert rows[0]['enrollment_ids'] == []


def test_other_owned_history_does_not_reveal_another_tutors_trial_draft(env):
    client, session, _ = env
    session.add(Tutor(id=2, user_email='trial-owner@example.test', tutor_name='Trial Owner', role='Tutor'))
    session.add(Enrollment(id=23, student_id=102, tutor_id=1, assigned_day='Tue',
                           assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
                           first_lesson_date=date(2025, 7, 1), payment_status='Paid', enrollment_type='One-Time'))
    session.add(Enrollment(id=22, student_id=102, tutor_id=2, assigned_day='Tue',
                           assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
                           first_lesson_date=date(2026, 10, 13), payment_status='Paid', enrollment_type='Trial'))
    session.flush()
    session.add(SessionLog(id=221, enrollment_id=22, student_id=102, tutor_id=2,
                          session_date=date(2026, 10, 13), time_slot='16:00 - 17:30', location='MSA',
                          session_status='Attended', financial_status='Paid'))
    session.commit()
    intake_draft(client, trial=True, tutor=2)
    assert only_intake(client, tutor_id=1) == []
    assert len(only_intake(client, tutor_id=2)) == 1


def test_discarded_intake_no_longer_creates_a_queue_candidate(env):
    client, _, _ = env
    draft = intake_draft(client)
    response = client.post(f"/api/billing/drafts/{draft['id']}/discard", json={
        'expected_revision': draft['revision'], 'idempotency_key': 'discard-intake-queue',
    })
    assert response.status_code == 200, response.text
    assert only_intake(client) == []


def test_multiple_intake_drafts_stay_one_student_task_and_require_a_choice(env):
    client, _, _ = env
    intake_draft(client, key='first-choice')
    intake_draft(client, key='second-choice')
    rows = only_intake(client)
    assert len(rows) == 1 and rows[0]['stage'] == 'attention'
    assert 'MULTIPLE_DRAFTS' in {i['code'] for i in rows[0]['issues']}


def test_intake_draft_does_not_hide_existing_regular_renewal_tasks(env):
    client, _, _ = env
    before = [row for row in queue(client)['rows'] if row['student']['id'] == 101]
    intake_draft(client)
    after = [row for row in queue(client)['rows'] if row['student']['id'] == 101]
    assert before == after


def test_legacy_wrong_owner_snapshot_is_not_added_as_intake_candidate(env):
    client, session, _ = env
    draft = intake_draft(client)
    row = session.query(BillingDraftRevision).filter_by(draft_id=draft['id']).one()
    row.snapshot = {**row.snapshot, 'review': {**row.snapshot['review'], 'student': {
        **row.snapshot['review']['student'], 'id': 999,
    }}}
    session.commit()
    assert only_intake(client) == []


def test_draft_only_intake_never_queries_unavailable_workflow_tables(env):
    client, session, _ = env
    workflow_tables = re.compile(r'\bbilling_(preferences|payments|payment_lines|lesson_claims|operations)\b', re.I)

    def reject_workflow_table(_connection, _cursor, statement, *_args):
        assert not workflow_tables.search(statement), 'Draft-only intake must work before migration188.'

    event.listen(session.bind, 'before_cursor_execute', reject_workflow_table)
    try:
        draft = intake_draft(client)
        assert client.get(f"/api/billing/drafts/{draft['id']}").json()['can_copy']
        assert client.get('/api/billing/students/102/drafts').json()[0]['id'] == draft['id']
        assert only_intake(client)[0]['draft_id'] == draft['id']
    finally:
        event.remove(session.bind, 'before_cursor_execute', reject_workflow_table)
