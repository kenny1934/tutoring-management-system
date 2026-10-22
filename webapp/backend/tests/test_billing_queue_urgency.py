"""Urgency follows collection work without becoming a financial status.

All HTTP checks use invented SQLite records. No application server is started.
"""
from copy import deepcopy
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import queue as service
from billing.models import BillingDraftRevision, BillingPayment
from billing.schemas import BillingQueueRow, BillingStudent, CollectionWindow
from models import Enrollment, SessionLog, Student
from tests.test_billing_drafts import saved
from tests.test_billing_queue import (
    choose_method, coverage, draft_env, env, legacy_pending, on_day, only_row,
    queue, student_source, workflow_env,
)
from tests.test_billing_workflow import confirmed


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Urgency checks refuse non-SQLite connections.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


def task(**changes):
    values = dict(key='student-101', student=BillingStudent(id=101, student_name='Synthetic student'),
                  stage='prepare', origin='projection', note='Synthetic queue task',
                  action_url='/billing/students/101', first_lesson_date=date(2026, 12, 4))
    values.update(changes)
    return BillingQueueRow(**values)


@pytest.mark.parametrize('day,urgency', [(4, 'later'), (5, 'week'), (12, 'week'), (18, 'week'), (19, 'now')])
def test_unsent_notice_window_has_inclusive_seven_day_and_end_boundaries(day, urgency):
    row = task(payment_method='autopay', collection=CollectionWindow(
        method='autopay', notice_from=date(2026, 11, 12), notice_to=date(2026, 11, 18),
        debit_from=date(2026, 11, 20), debit_to=date(2026, 11, 22)))
    service.apply_urgency(row, as_of=date(2026, 11, day))
    assert row.urgency == urgency and not row.overdue
    assert row.action_kind == 'notice'
    assert (row.action_from, row.action_by) == (date(2026, 11, 12), date(2026, 11, 18))


@pytest.mark.parametrize('day,urgency', [(12, 'later'), (13, 'week'), (18, 'week'), (19, 'week'), (22, 'week'), (23, 'now')])
def test_sent_autopay_uses_debit_window_and_ignores_expired_notice(day, urgency):
    row = task(stage='awaiting_payment', origin='payment', payment_method='autopay',
               collection=CollectionWindow(method='autopay', notice_from=date(2026, 11, 12),
                   notice_to=date(2026, 11, 18), debit_from=date(2026, 11, 20), debit_to=date(2026, 11, 22)),
               due_date=date(2026, 11, 22), overdue=day > 22)
    service.apply_urgency(row, as_of=date(2026, 11, day))
    assert row.urgency == urgency
    assert row.action_kind == 'payment'
    assert (row.action_from, row.action_by) == (date(2026, 11, 20), date(2026, 11, 22))
    assert row.overdue is (day > 22)


@pytest.mark.parametrize('day,urgency', [(5, 'later'), (6, 'week'), (12, 'week'), (13, 'now'), (14, 'now')])
def test_no_notice_projection_uses_uncovered_lesson_without_inventing_overdue(day, urgency):
    first = date(2026, 11, 13)
    row = task(first_lesson_date=first, payment_method='manual', due_date=first,
               collection=CollectionWindow(method='manual', due_before_lesson=first))
    service.apply_urgency(row, as_of=date(2026, 11, day))
    assert row.urgency == urgency and row.action_kind == 'renewal'
    assert row.action_by == first and not row.overdue


def test_unknown_dates_are_explicit_and_do_not_use_extension_expiry():
    row = task(first_lesson_date=None, current_enrollments=[])
    service.apply_urgency(row, as_of=date(2026, 11, 13))
    assert row.urgency == 'check_dates'
    assert row.action_kind is row.action_from is row.action_by is None
    assert not row.overdue


def test_no_payment_row_stays_neutral_even_when_later_collection_notice_is_past():
    row = task(stage='no_payment', collection=CollectionWindow(method='manual',
               notice_from=date(2027, 1, 12), notice_to=date(2027, 1, 18),
               due_before_lesson=date(2027, 2, 5)), first_lesson_date=date(2027, 2, 5))
    service.apply_urgency(row, as_of=date(2027, 2, 6))
    assert row.urgency == 'later' and not row.overdue


@pytest.mark.parametrize('day,urgency', [(18, 'week'), (19, 'now')])
def test_unknown_preference_keeps_common_notice_urgency_after_hiding_quote(env, monkeypatch, day, urgency):
    client, session, _ = env
    coverage(session, date(2027, 1, 29))
    on_day(monkeypatch, date(2027, 1, day))
    row = only_row(client, '2027-01')
    assert row['payment_method'] is row['collection'] is row['due_date'] is None
    assert row['total_fee'] is row['lesson_count'] is None
    assert row['urgency'] == urgency and row['action_kind'] == 'notice'
    assert (row['action_from'], row['action_by']) == ('2027-01-12', '2027-01-18')
    assert row['overdue'] is False


def test_unknown_preference_with_started_lessons_is_urgent_without_financial_overdue(env, monkeypatch):
    client, _, _ = env
    on_day(monkeypatch, date(2026, 11, 13))
    row = only_row(client)
    assert row['payment_method'] is None and row['collection'] is None
    assert row['urgency'] == 'now' and row['action_kind'] == 'renewal'
    assert row['action_by'] == '2026-11-13'
    assert not row['overdue'] and queue(client)['counts']['overdue'] == 0


def test_structural_gap_asks_to_check_dates_instead_of_claiming_started_unpaid_lessons(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    choose_method(client)
    session.get(SessionLog, 112).session_date += timedelta(days=1)
    session.commit()
    on_day(monkeypatch, date(2026, 12, 1))
    row = only_row(client, '2026-12')
    assert row['stage'] == 'attention' and row['first_lesson_date'] is None
    assert any(issue['code'] == 'PAID_COVERAGE_GAP' for issue in row['issues'])
    assert row['urgency'] == 'check_dates'
    assert row['action_kind'] is row['action_from'] is row['action_by'] is None
    assert not row['overdue']


def test_saved_draft_uses_current_source_urgency_instead_of_obsolete_snapshot_deadline(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    choose_method(client)
    _, draft = saved(client)
    revision = session.query(BillingDraftRevision).filter_by(draft_id=draft['id']).one()
    snapshot = deepcopy(revision.snapshot)
    snapshot['review']['policy_version'] = 'obsolete-synthetic-policy'
    snapshot['review']['period']['collection']['due_before_lesson'] = '2027-01-15'
    revision.snapshot = snapshot
    session.commit()
    on_day(monkeypatch, date(2026, 11, 14))
    row = only_row(client)
    assert row['origin'] == 'draft' and row['draft_id'] == draft['id']
    assert any(issue['code'] == 'STALE_DRAFT' for issue in row['issues'])
    assert row['due_date'] == '2027-01-15'
    assert row['urgency'] == 'now' and row['action_kind'] == 'renewal'
    assert row['action_by'] == '2026-11-13' and not row['overdue']


def test_extension_does_not_delay_urgency_past_next_uncovered_lesson(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    choose_method(client)
    session.get(Enrollment, 11).deadline_extension_weeks = 12
    session.commit()
    on_day(monkeypatch, date(2026, 11, 13))
    row = only_row(client)
    assert row['current_enrollments'][0]['effective_end_date'] > '2026-11-13'
    assert row['urgency'] == 'now' and row['action_by'] == '2026-11-13'
    assert not row['overdue']


@pytest.mark.parametrize('day,urgency,overdue', [(12, 'week', False), (13, 'now', True), (14, 'now', True)])
def test_existing_manual_debt_keeps_real_overdue_boundary(env, monkeypatch, day, urgency, overdue):
    client, session, _ = env
    legacy_pending(session, sent=True)
    on_day(monkeypatch, date(2026, 11, day))
    row = only_row(client)
    assert row['urgency'] == urgency and row['action_kind'] == 'payment'
    assert row['action_by'] == '2026-11-13' and row['overdue'] is overdue
    assert queue(client)['counts']['overdue'] == int(overdue)


@pytest.mark.parametrize('sent,urgency,kind', [(False, 'now', 'notice'), (True, 'week', 'payment')])
def test_actual_autopay_sent_state_changes_urgency_reason(workflow_env, monkeypatch, sent, urgency, kind):
    client, session, _ = workflow_env
    coverage(session, date(2026, 11, 27))
    _, _, payment = confirmed(client, method='autopay', ready=True)
    stored = session.get(BillingPayment, payment['id'])
    if sent:
        stored.sent_at = datetime(2026, 11, 16, 12)
        stored.sent_language = 'en'
        session.commit()
    on_day(monkeypatch, date(2026, 11, 19))
    row = only_row(client)
    assert row['urgency'] == urgency and row['action_kind'] == kind
    assert row['stage'] == ('awaiting_payment' if sent else 'send') and not row['overdue']


@pytest.mark.parametrize('sent,urgency,deadline', [(False, 'now', date(2026, 12, 18)), (True, 'week', date(2026, 12, 20))])
def test_combined_debts_preserve_most_urgent_component_even_with_later_due_date(sent, urgency, deadline):
    as_of = date(2026, 12, 19)
    manual = task(origin='legacy', stage='send', enrollment_ids=[11], first_lesson_date=date(2026, 12, 20),
                  payment_method='manual', due_date=date(2026, 12, 20),
                  collection=CollectionWindow(method='manual', due_before_lesson=date(2026, 12, 20)))
    cycle = task(origin='payment', stage='awaiting_payment' if sent else 'send', enrollment_ids=[12],
                 payment_ids=['synthetic-payment'], payment_id='synthetic-payment', payment_method='manual',
                 first_lesson_date=date(2027, 1, 8), due_date=date(2027, 1, 8),
                 collection=CollectionWindow(method='manual', notice_from=date(2026, 12, 12),
                     notice_to=date(2026, 12, 18), due_before_lesson=date(2027, 1, 8)))
    for row in (manual, cycle):
        service.apply_urgency(row, as_of=as_of)
    context = SimpleNamespace(student=manual.student, issues=[], selected_enrollment_ids=[11])
    combined = service.combine_pending(context, [manual, cycle])
    assert combined.urgency == urgency and combined.action_by == deadline
    assert combined.stage == 'attention' and not combined.overdue
    assert combined.enrollment_ids == [11, 12]
    assert combined.total_fee is combined.lesson_count is combined.collection is None


def test_prepaid_run_does_not_surface_obsolete_draft_or_urgency(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    choose_method(client)
    saved(client)
    coverage(session, date(2027, 1, 29))
    on_day(monkeypatch, date(2027, 1, 19))
    hidden = queue(client, '2026-12')
    assert hidden['rows'] == []
    assert hidden['urgency_counts'] == {'now': 0, 'week': 0, 'check_dates': 0, 'later': 0}
    row = only_row(client, '2026-12', stage='no_payment')
    assert row['urgency'] == 'later' and row['draft_id'] is None
    assert not row['overdue']


def test_urgency_sort_and_counts_apply_to_full_filtered_result_before_pagination(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    specifications = [(101, '1', date(2026, 11, 6)), (102, '10', date(2026, 10, 30)),
                      (103, '90', date(2026, 10, 23)), (104, '0', date(2026, 11, 6)),
                      (105, '2', date(2026, 10, 30)), (106, '3', date(2026, 10, 23))]
    for sid, number, end in specifications:
        identity = 11 if sid == 101 else student_source(session, sid, school_id=number, location='MSB' if sid == 102 else 'MSA')
        student = session.get(Student, sid)
        student.school_student_id = number
        student.student_name = f'Urgency case {sid}'
        session.commit()
        coverage(session, end, enrollment_id=identity, start=date(2026, 9, 4))
        choose_method(client, sid)
    missing = session.query(SessionLog).filter_by(enrollment_id=1040, session_date=date(2026, 10, 16)).one()
    session.delete(missing)
    session.commit()
    on_day(monkeypatch, date(2026, 11, 4))
    all_rows = queue(client)
    assert [row['student']['id'] for row in all_rows['rows']] == [106, 103, 105, 102, 104, 101]
    expected = {'now': 2, 'week': 2, 'check_dates': 1, 'later': 1}
    assert all_rows['urgency_counts'] == expected
    for offset, identities in [(0, [106, 103]), (2, [105, 102]), (4, [104, 101])]:
        page = queue(client, offset=offset, limit=2)
        assert [row['student']['id'] for row in page['rows']] == identities
        assert page['urgency_counts'] == expected and page['counts'] == all_rows['counts']
    searched = queue(client, search='case 103', limit=1)
    assert searched['urgency_counts'] == {'now': 1, 'week': 0, 'check_dates': 0, 'later': 0}
    assert searched['counts'] == all_rows['counts']
    prepared = queue(client, stage='prepare', limit=1)
    assert prepared['urgency_counts'] == {'now': 0, 'week': 0, 'check_dates': 0, 'later': 1}
    assert prepared['counts'] == all_rows['counts']
    # The completed sources need continuation confirmation. Their workflow
    # stage remains independent of how soon the next lessons need a decision.
    attention = queue(client, stage='attention', limit=1)
    assert attention['urgency_counts'] == {'now': 2, 'week': 2, 'check_dates': 1, 'later': 0}
    assert [row['student']['id'] for row in attention['rows']] == [106]
    assert attention['counts'] == all_rows['counts']
    branch = queue(client, location='MSB')
    assert branch['urgency_counts'] == {'now': 0, 'week': 1, 'check_dates': 0, 'later': 0}
    assert [row['student']['id'] for row in branch['rows']] == [102]
    counts = client.get('/api/billing/queue/counts?collection_month=2026-11').json()
    assert {key: counts[key] for key in all_rows['counts']} == all_rows['counts']


def test_urgency_stays_read_only_without_workflow_storage(env, monkeypatch):
    client, session, _ = env
    on_day(monkeypatch, date(2026, 11, 13))
    forbidden = {'billing_preferences', 'billing_payments', 'billing_payment_lines', 'billing_lesson_claims', 'billing_operations'}
    statements = []
    def guard(_conn, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement
        assert not any(name in statement.lower() for name in forbidden), statement
    event.listen(session.bind, 'before_cursor_execute', guard)
    try:
        row = only_row(client)
        assert row['urgency'] == 'now' and not row['overdue']
    finally:
        event.remove(session.bind, 'before_cursor_execute', guard)
    assert statements
