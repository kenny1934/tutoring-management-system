"""Explicit admin backdating uses synthetic sessions and no shared database."""
import asyncio
from datetime import date

import pytest
from fastapi import HTTPException
from models import Enrollment, SessionLog, Student, Tutor
from routers import enrollments
from schemas import ApplyScheduleChangeRequest, ScheduleChangeRequest


@pytest.fixture
def setup(db_session, monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', 'false')
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'false')
    monkeypatch.setattr(enrollments, 'billing_today', lambda fallback: date(2026, 11, 26))
    monkeypatch.setattr(enrollments, 'fill_unlisted_lessons', lambda *args: pytest.fail('Backdating must not fill attendance.'))
    db = db_session
    actor = Tutor(id=1, tutor_name='Synthetic tutor', user_email='backdate@example.test', role='Admin')
    db.add_all([actor, Student(id=101, student_name='Synthetic student')]); db.flush()
    block = Enrollment(id=20, student_id=101, tutor_id=1, assigned_day='Fri', assigned_time='16:00 - 17:30',
        location='MSA', first_lesson_date=date(2026, 11, 6), lessons_paid=4, payment_status='Paid', revenue_total=1600)
    db.add(block); db.flush()
    for day in [6, 13, 20, 27]:
        db.add(SessionLog(student_id=101, tutor_id=1, enrollment_id=20, session_date=date(2026, 11, day),
            time_slot='16:00 - 17:30', location='MSA', session_status='Scheduled' if day == 27 else 'Attended', financial_status='Paid'))
    db.commit()
    return db, actor, block


def request(**extra):
    return dict(assigned_day='Wed', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1, effective_date=date(2026, 11, 25), **extra)


def preview(setup, **changes):
    db, actor, _ = setup
    return asyncio.run(enrollments.preview_schedule_change(20, ScheduleChangeRequest(**request(**changes)), db, actor))


def apply(setup, **changes):
    db, actor, _ = setup
    return asyncio.run(enrollments.apply_schedule_change(20, ApplyScheduleChangeRequest(**request(**changes)), db, actor))


def test_friday_27_moves_to_wednesday_25_after_confirmation(setup):
    db, _, block = setup
    proposal = preview(setup)
    assert proposal.can_apply and len(proposal.updatable_sessions) == 1
    assert proposal.updatable_sessions[0].new_date == date(2026, 11, 25)
    with pytest.raises(HTTPException, match='Confirm the past dates'):
        apply(setup, reason='Timetable changed yesterday.')
    with pytest.raises(HTTPException, match='Explain why'):
        apply(setup, acknowledge_past_dates=True)
    assert block.assigned_day == 'Fri'
    result = apply(setup, acknowledge_past_dates=True, reason='Timetable changed yesterday.')
    assert result.sessions_updated == 1
    row = db.query(SessionLog).filter_by(enrollment_id=20, session_date=date(2026, 11, 25)).one()
    assert row.session_status == 'Scheduled' and row.financial_status == 'Paid'
    assert db.query(SessionLog).filter_by(enrollment_id=20, session_status='Attended').count() == 3
    assert 'Timetable changed yesterday.' in block.remark
    assert block.lessons_paid == 4 and block.payment_status == 'Paid'


@pytest.mark.parametrize('time,blocked', [('16:15 - 17:45', True), ('10:00 - 11:30', False)])
def test_past_conflicts_check_overlapping_times_in_the_same_enrollment(setup, time, blocked):
    db, _, _ = setup
    db.add(SessionLog(student_id=101, tutor_id=1, enrollment_id=20, session_date=date(2026, 11, 25),
        time_slot=time, location='MSB', session_status='Attended', financial_status='Paid')); db.commit()
    assert preview(setup).can_apply is not blocked
    if blocked:
        with pytest.raises(HTTPException, match='already has a lesson'):
            apply(setup, acknowledge_past_dates=True, reason='Timetable change.')
    else:
        apply(setup, acknowledge_past_dates=True, reason='Timetable change.')


def test_backdating_does_not_move_a_booked_makeup(setup):
    db, _, _ = setup
    row = db.query(SessionLog).filter_by(enrollment_id=20, session_status='Scheduled').one()
    row.session_status = 'Rescheduled - Make-up Booked'; db.commit()
    assert preview(setup).can_apply is False
    with pytest.raises(HTTPException, match='make-up arrangements'):
        apply(setup, acknowledge_past_dates=True, reason='Timetable change.')
    assert row.session_date == date(2026, 11, 27)


def test_backdated_manual_override_cannot_escape_the_period(setup):
    db, _, _ = setup
    row = db.query(SessionLog).filter_by(enrollment_id=20, session_status='Scheduled').one()
    with pytest.raises(HTTPException, match='within the enrollment period'):
        apply(setup, acknowledge_past_dates=True, reason='Timetable change.', date_overrides={row.id: '2026-11-05'})
    assert row.session_date == date(2026, 11, 27)


def test_default_mapping_stays_forward_until_an_effective_date_is_selected():
    assert enrollments.calculate_new_session_date(date(2026, 11, 27), 'Fri', 'Wed') == date(2026, 12, 2)
    assert enrollments.calculate_new_session_date(date(2026, 11, 27), 'Fri', 'Wed', date(2026, 11, 25)) == date(2026, 11, 25)


def test_manual_past_override_requires_confirmation_even_without_an_effective_date(setup):
    db, actor, _ = setup
    row = db.query(SessionLog).filter_by(enrollment_id=20, session_status='Scheduled').one()
    data = dict(assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', tutor_id=1,
        date_overrides={row.id: '2026-11-25'}, reason='Correct a late timetable update.')
    with pytest.raises(HTTPException, match='Confirm the past dates'):
        asyncio.run(enrollments.apply_schedule_change(20, ApplyScheduleChangeRequest(**data), db, actor))
    asyncio.run(enrollments.apply_schedule_change(20, ApplyScheduleChangeRequest(**data, acknowledge_past_dates=True), db, actor))
    assert row.session_date == date(2026, 11, 25) and row.session_status == 'Scheduled'


def test_backdated_unlinked_enrollment_also_works_with_billing_storage_enabled(setup, monkeypatch):
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    apply(setup, acknowledge_past_dates=True, reason='Timetable began yesterday.')
    db, _, _ = setup
    assert db.query(SessionLog).filter_by(enrollment_id=20, session_date=date(2026, 11, 25), session_status='Scheduled').count() == 1


def test_completed_sources_cannot_be_overridden_by_a_stale_client(setup):
    db, _, _ = setup
    attended = db.query(SessionLog).filter_by(enrollment_id=20, session_status='Attended').first()
    before = attended.session_date
    with pytest.raises(HTTPException, match='can no longer be changed'):
        apply(setup, acknowledge_past_dates=True, reason='Timetable correction.', date_overrides={attended.id: '2026-11-25'})
    assert attended.session_date == before and attended.session_status == 'Attended'


def test_earlier_first_weekday_updates_an_unlinked_enrollment_start(setup):
    db, _, block = setup
    db.query(SessionLog).filter(SessionLog.enrollment_id == block.id, SessionLog.session_date < date(2026, 11, 27)).delete()
    block.first_lesson_date = date(2026, 11, 27)
    db.commit()
    proposal = preview(setup)
    assert proposal.effective_date_min == date(2026, 11, 23)
    assert proposal.can_apply and proposal.updatable_sessions[0].new_date == date(2026, 11, 25)
    apply(setup, acknowledge_past_dates=True, reason='The first lesson moved to Wednesday.')
    assert block.first_lesson_date == date(2026, 11, 25)
    assert block.payment_status == 'Paid' and block.lessons_paid == 4
