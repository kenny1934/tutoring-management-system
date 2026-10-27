"""The familiar renewal card uses enrollment expiry and original-session facts."""
from datetime import date

from models import Enrollment, SessionLog
from tests.test_billing_queue import draft_env, env, workflow_env, only_row, legacy_pending, choose_method
from tests.test_billing_workflow import confirmed, second_class


def test_card_restores_timetable_dates_and_original_sessions_remaining(env):
    client, _, _ = env
    summary, = only_row(client)['current_enrollments']
    assert summary['enrollment_id'] == 11
    assert summary['weekday'] == 'Fri' and summary['time_slot'] == '16:00 - 17:30'
    assert summary['location'] == 'MSA' and summary['tutor_name'] == 'Draft Admin'
    assert summary['first_lesson_date'] == '2026-10-02'
    assert summary['effective_end_date'] == summary['last_original_date'] == '2026-11-06'
    assert summary['last_paid_original_date'] == '2026-11-06'
    assert summary['lesson_count'] == 6 and summary['sessions_remaining'] == 3


def test_expiry_extension_and_makeup_never_become_paid_original_coverage(env):
    client, session, _ = env
    session.get(Enrollment, 11).deadline_extension_weeks = 2
    session.add(SessionLog(enrollment_id=11, student_id=101, tutor_id=1,
                           session_date=date(2027, 1, 15), session_status='Scheduled',
                           financial_status='Paid', make_up_for_id=110,
                           time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    summary, = only_row(client)['current_enrollments']
    assert summary['effective_end_date'] == '2026-11-20'
    assert summary['last_original_date'] == summary['last_paid_original_date'] == '2026-11-06'
    assert summary['sessions_remaining'] == 3


def test_twice_weekly_retains_both_enrollment_summaries_and_today_counts(workflow_env):
    client, session, _ = workflow_env
    second_class(session)
    row = only_row(client)
    summaries = {s['enrollment_id']: s for s in row['current_enrollments']}
    assert set(summaries) == {11, 12}
    assert summaries[11]['sessions_remaining'] == 3
    assert summaries[12]['sessions_remaining'] == 4
    assert summaries[12]['effective_end_date'] == '2026-11-07'
    assert summaries[12]['tutor_name'] == 'Second Tutor'


def test_confirmed_card_uses_exact_original_dates_even_when_writes_are_paused(workflow_env, monkeypatch):
    client, session, _ = workflow_env
    _, _, payment = confirmed(client)
    identity = payment['lines'][0]['enrollment_id']
    session.get(Enrollment, identity).deadline_extension_weeks = 20
    session.commit()
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    summary, = only_row(client)['current_enrollments']
    assert summary['enrollment_id'] == identity
    assert summary['effective_end_date'] == payment['review']['period']['last_lesson_date']
    assert summary['sessions_remaining'] == payment['review']['period']['lesson_count']
    assert summary['last_paid_original_date'] == '2026-11-06'


def test_missing_first_date_and_old_legacy_only_sources_keep_the_card_readable(env):
    client, session, _ = env
    source = session.get(Enrollment, 11)
    source.enrollment_type = 'Summer'
    source.payment_status = 'Pending Payment'
    source.first_lesson_date = None
    session.commit()
    summary, = only_row(client)['current_enrollments']
    assert summary['enrollment_id'] == 11 and summary['first_lesson_date'] is None
    assert summary['effective_end_date'] is None
    assert summary['last_paid_original_date'] is None
    assert summary['sessions_remaining'] == 3


def test_unpaid_one_time_expiry_uses_its_actual_sessions_without_losing_the_queue(env):
    client, session, _ = env
    source = session.get(Enrollment, 11)
    source.enrollment_type = 'One-Time'
    source.payment_status = 'Pending Payment'
    session.add(SessionLog(enrollment_id=11, student_id=101, tutor_id=1,
                           session_date=date(2027, 1, 15), session_status='Scheduled',
                           financial_status='Unpaid', make_up_for_id=110,
                           time_slot='16:00 - 17:30', location='MSA'))
    session.commit()
    summary, = only_row(client)['current_enrollments']
    assert summary['effective_end_date'] == '2027-01-15'
    assert summary['last_original_date'] == '2026-11-06'
    assert summary['last_paid_original_date'] is None
    assert summary['sessions_remaining'] == 3


def test_paid_through_matches_the_contexts_normalised_timetable(env):
    client, session, _ = env
    source = session.get(Enrollment, 11)
    source.assigned_time += ' '
    source.location += ' '
    identity = legacy_pending(session)
    session.get(Enrollment, identity).assigned_time = '16:00 - 17:30'
    session.get(Enrollment, identity).location = 'MSA'
    for lesson in session.query(SessionLog).filter_by(enrollment_id=identity):
        lesson.time_slot = '16:00 - 17:30'
        lesson.location = 'MSA'
    session.commit()
    summary, = only_row(client)['current_enrollments']
    assert summary['enrollment_id'] == identity
    assert summary['last_paid_original_date'] == '2026-11-06'


def test_parent_choice_is_separate_from_the_first_actual_manual_collection(workflow_env):
    client, _, _ = workflow_env
    choose_method(client, method='autopay', ready=False)
    row = only_row(client)
    assert row['payment_method'] == 'manual'
    assert row['recorded_payment_method'] == 'autopay'
    assert row['mandate_ready'] is False
