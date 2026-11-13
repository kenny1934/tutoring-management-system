"""Concrete, read-only historical and conflict details for renewal review."""
from dataclasses import replace
from datetime import date
from tests.test_billing_context import block, roots, context
from tests.test_billing_renewal_changes import env, draft_env, renewal, review
from models import Enrollment, SessionLog


def test_actual_and_enrollment_timetables_are_both_retained():
    source = block()
    recorded = roots(source)
    recorded[0] = replace(recorded[0], time_slot='18:00 - 19:30')
    result = context([source], recorded)
    issue = next(issue for issue in result.issues if issue.code == 'OFF_SLOT_ORIGINALS')
    detail, = issue.record_evidence
    assert (detail.enrollment_id, detail.session_id, detail.date) == (source.id, recorded[0].id, recorded[0].session_date)
    assert detail.time_slot == '18:00 - 19:30'
    assert detail.expected_time_slot == source.assigned_time and detail.expected_weekday == 'Thu'


def test_conflict_details_identify_the_existing_session(env):
    client, session, _ = env
    session.add(Enrollment(id=22, student_id=101, tutor_id=1, assigned_day='Thu', assigned_time='18:30 - 20:00', location='MSB', lessons_paid=1, first_lesson_date=date(2026, 11, 12), payment_status='Paid', enrollment_type='One-Time', is_new_student=False))
    session.flush()
    session.add(SessionLog(id=220, enrollment_id=22, student_id=101, tutor_id=1, session_date=date(2026, 11, 12), time_slot='18:30 - 20:00', location='MSB', session_status='Scheduled', financial_status='Paid'))
    session.commit()
    result = review(client, renewal(client))
    issue = next(issue for issue in result['issues'] if issue['code'] == 'RENEWAL_SESSION_CONFLICT')
    detail, = issue['record_evidence']
    assert detail['enrollment_id'] == 22 and detail['session_id'] == 220
    assert detail['date'] == '2026-11-12' and detail['time_slot'] == '18:30 - 20:00' and detail['location'] == 'MSB'
    assert issue['blocks_creation'] and result['message']['blocked_reasons']
