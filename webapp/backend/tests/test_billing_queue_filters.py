"""Class filters and navigation stay within the scoped read-only worklist."""
from datetime import date

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.schemas import BillingQueueRow
from routers import billing_queue
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_queue import env


@pytest.fixture(autouse=True)
def sqlite_only():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


def lesson(day, time, end, location='MSA'):
    return dict(enrollment_id=1, tutor_id=1, tutor_name='Synthetic Tutor', weekday=day, time_slot=time,
                location=location, first_lesson_date='2026-09-01', effective_end_date=end,
                last_original_date=end, last_paid_original_date=end, payment_status='Paid',
                lesson_count=6, sessions_remaining=2, fee_message_marked_sent=False)


def task(id_, classes, stage='prepare'):
    return BillingQueueRow.model_validate(dict(key=f'student-{id_}', student=dict(id=id_, student_name=f'Student {id_}',
        school_student_id=str(id_), home_location='MSA'), stage=stage, origin='projection', payment_method='manual',
        collection=None, first_lesson_date='2026-12-03', coverage_through='2026-12-31', lesson_count=4,
        total_fee=1600, amount_basis='reviewed', prepare_on=None, due_date='2026-12-03', overdue=False,
        ready_now=True, urgency='week', draft_id=None, payment_id=None, enrollment_ids=[id_], payment_ids=[],
        issues=[], note='', action_url='/billing', current_enrollments=classes))


@pytest.fixture
def rows(env, monkeypatch):
    client, db, user = env
    values = [task(i, [lesson('Thu', '18:30-20:00', '2026-12-03')]) for i in range(1, 32)]
    values.extend([task(40, [lesson('Mon', '16:45 - 18:15', '2026-11-30')]),
                   task(41, [lesson('Thu', '18:30 - 20:00', '2026-12-10')], stage='send'),
                   task(42, [lesson('Thu', '16:45 - 18:15', '2026-12-03'), lesson('Mon', '18:30 - 20:00', '2026-12-10')])])
    monkeypatch.setattr(billing_queue, 'build_queue', lambda *args, **kwargs: values)
    return client, values


def test_filters_run_before_pagination_and_match_the_same_class(rows):
    client, _ = rows
    result = client.get('/api/billing/queue', params=dict(weekday='Thu', time_slot='18:30 - 20:00',
        expires_from='2026-12-03', expires_to='2026-12-03', offset=25, limit=25)).json()
    assert result['total'] == 31 and len(result['rows']) == 6
    assert result['counts']['prepare'] == 31 and result['counts']['send'] == 0
    assert len(result['navigation']) == 31
    assert all(item['student_id'] != 42 for item in result['navigation'])
    assert {'18:30-20:00', '16:45 - 18:15'} <= set(result['time_slots'])


def test_count_endpoint_and_scoped_key_lookup_use_identical_filters(rows):
    client, _ = rows
    filters = dict(weekday='Thu', time_slot='18:30 - 20:00', expires_to='2026-12-03')
    counts = client.get('/api/billing/queue/counts', params=filters).json()
    result = client.get('/api/billing/queue', params={**filters, 'row_key': 'student-30', 'limit': 1}).json()
    assert counts['prepare'] == result['counts']['prepare'] == 31
    assert [row['student']['id'] for row in result['rows']] == [30]
    assert len(result['navigation']) == 31
    absent = client.get('/api/billing/queue', params={**filters, 'row_key': 'student-41'}).json()
    assert absent['rows'] == [] and absent['total'] == 31 and len(absent['navigation']) == 31


@pytest.mark.parametrize('params', [dict(weekday='Monday'), dict(expires_from='2026-12-31', expires_to='2026-12-01'), dict(expires_to='bad-date')])
def test_invalid_filters_are_rejected(rows, params):
    client, _ = rows
    assert client.get('/api/billing/queue', params=params).status_code == 422
    assert client.get('/api/billing/queue/counts', params=params).status_code == 422


def test_other_class_branch_cannot_satisfy_current_branch_filters(rows):
    client, values = rows
    values[:] = [task(1, [lesson('Mon', '16:45 - 18:15', '2026-12-01'), lesson('Thu', '18:30 - 20:00', '2026-12-03', 'MSB')])]
    assert client.get('/api/billing/queue', params=dict(location='MSA', weekday='Thu')).json()['rows'] == []
    assert len(client.get('/api/billing/queue', params=dict(location='MSB', weekday='Thu')).json()['rows']) == 1


def test_navigation_is_filtered_by_stage_search_and_needs_checking(rows):
    client, values = rows
    values[30].needs_checking = True
    result = client.get('/api/billing/queue', params=dict(stage='prepare', search='Student 31', needs_checking=True)).json()
    assert result['navigation'] == [dict(key='student-31', student_id=31)]
    assert result['total'] == 1


def test_time_options_follow_selected_day_and_branch_even_with_other_filters(rows):
    client, values = rows
    values[:] = [task(1, [lesson('Sun', '09:00 - 10:30', '2026-12-01'),
                         lesson('Thu', '18:30 - 20:00', '2026-12-03'),
                         lesson('Sun', '11:00 - 12:30', '2026-12-03', 'MSB')])]
    result = client.get('/api/billing/queue', params=dict(weekday='Sun', location='MSA', expires_from='2027-01-01')).json()
    assert result['rows'] == []
    assert result['time_slots'] == ['09:00 - 10:30']
    assert client.get('/api/billing/queue', params=dict(weekday='Thu', location='MSA')).json()['time_slots'] == ['18:30 - 20:00']
    assert client.get('/api/billing/queue', params=dict(weekday='Sat', location='MSA')).json()['time_slots'] == []
