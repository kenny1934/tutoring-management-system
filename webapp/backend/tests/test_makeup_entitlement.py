"""Reviewed participation against synthetic SQLite only. No shared data access."""
from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.drafts import DraftConflict
from billing.models import BillingAccount
from models import Enrollment, SessionLog, Student
from makeup_models import MakeupParticipationEvent
from makeup_schemas import ParticipationChange, ParticipationConfirm
from routers import makeup_entitlement as router
from services import makeup_entitlement as service
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env


AS_OF = date(2026, 10, 17)


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Makeup checks must only use synthetic SQLite fixtures.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


@pytest.fixture
def makeup_env(env, monkeypatch):
    client, db, actor = env
    monkeypatch.setenv('MAKEUP_ENTITLEMENT_ENABLED', 'true')
    monkeypatch.setattr(router, 'today', lambda: AS_OF)
    client.app.include_router(router.router, prefix='/api')
    db.add(BillingAccount(student_id=101, academic_start=service.POLICY.academic_start,
                          policy_version=service.POLICY.version, active=True))
    db.add(Enrollment(id=30, student_id=101, tutor_id=1, enrollment_type='Regular', assigned_day='Fri',
                      assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
                      first_lesson_date=date(2026, 9, 4), payment_status='Paid'))
    db.flush()
    db.add(SessionLog(id=300, enrollment_id=30, student_id=101, tutor_id=1,
                      session_date=date(2026, 9, 4), time_slot='16:00 - 17:30', location='MSA',
                      session_status='Sick Leave - Pending Make-up', financial_status='Paid'))
    db.commit()
    return client, db, actor


def booking(db, *, when=date(2026, 11, 14), status='Make-up Class'):
    root = db.get(SessionLog, 300)
    root.session_status = 'Sick Leave - Make-up Booked'
    root.rescheduled_to_id = 301
    db.add(SessionLog(id=301, enrollment_id=30, student_id=101, tutor_id=1,
        session_date=when, time_slot='10:00 - 11:30', location='MSA', session_status=status,
        make_up_for_id=300, financial_status='Paid'))
    db.commit()


def preview(client, *, status='Paused', when='2026-10-17', return_id=None):
    data = {'status': status, 'effective_on': when, 'reason': 'Reviewed with the parent',
            'return_enrollment_id': return_id}
    response = client.post('/api/billing/students/101/participation/preview', json=data)
    assert response.status_code == 200, response.text
    return data, response.json()


def confirm(client, data, reviewed, *, key='participation-first'):
    payload = {**data, 'expected_version': reviewed['version'],
        'expected_review_hash': reviewed['review_hash'], 'idempotency_key': key}
    response = client.post('/api/billing/students/101/participation', json=payload)
    return payload, response


def test_advance_booking_uses_current_payment_and_june_cap(makeup_env):
    client, db, _ = makeup_env
    result = service.eligibility_for_sessions(db, [300], target_date=date(2027, 6, 30), as_of=AS_OF)[300]
    assert result.can_book and result.advance_booking and result.paid_through == date(2026, 11, 6)
    assert result.valid_until == date(2027, 6, 30)
    assert service.eligibility_for_sessions(db, [300], target_date=date(2027, 7, 1), as_of=AS_OF)[300].status == 'expired'
    response = client.get('/api/makeup/eligibility', params=[('session_ids', 300), ('target_date', '2027-06-30')])
    assert response.status_code == 200 and response.json()['eligibility']['300']['advance_booking']


def test_payment_required_does_not_create_a_pause(makeup_env):
    _, db, _ = makeup_env
    result = service.eligibility_for_sessions(db, [300], as_of=date(2026, 11, 13))[300]
    assert result.status == 'payment_required'
    detail = service.participation_detail(db, 101, as_of=date(2026, 11, 13))
    assert detail.status == 'Active' and detail.version == 0


def test_legacy_gap_preserves_last_teaching_date_without_inventing_late_grace(makeup_env):
    _, db, _ = makeup_env
    result = service.eligibility_for_sessions(db, [300], as_of=date(2026, 11, 12))[300]
    assert result.can_book and result.paid_through == date(2026, 11, 6)
    assert not service.eligibility_for_sessions(db, [300], as_of=date(2026, 11, 13))[300].can_book


def test_explicit_pause_release_is_reviewed_audited_and_replayable(makeup_env):
    client, db, _ = makeup_env
    booking(db)
    data, reviewed = preview(client)
    assert [b['session_id'] for b in reviewed['affected_bookings']] == [301]
    assert db.get(SessionLog, 301).session_status == 'Make-up Class'
    payload, response = confirm(client, data, reviewed)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved['status'] == 'Paused' and saved['version'] == 1
    assert saved['history'][0]['released_session_ids'] == [301]
    assert db.get(SessionLog, 301).session_status == 'Cancelled'
    assert db.get(SessionLog, 301).make_up_for_id == 300
    assert db.get(SessionLog, 300).session_status == 'Sick Leave - Pending Make-up'
    assert db.get(SessionLog, 300).rescheduled_to_id is None
    assert db.get(Enrollment, 30).payment_status == 'Paid'
    replay = client.post('/api/billing/students/101/participation', json=payload)
    assert replay.status_code == 200 and replay.json() == saved
    assert db.query(MakeupParticipationEvent).count() == 1
    assert service.eligibility_for_sessions(db, [300], as_of=AS_OF)[300].status == 'paused'


def test_future_pause_blocks_target_dates_and_exposes_confirmed_interval(makeup_env):
    client, db, _ = makeup_env
    data, reviewed = preview(client, when='2026-11-01')
    _, response = confirm(client, data, reviewed)
    assert response.status_code == 200
    assert response.json()['status'] == 'Active' and response.json()['scheduled_status'] == 'Paused'
    current = service.eligibility_for_sessions(db, [300], as_of=AS_OF)[300]
    assert current.can_book and current.participation_blocks[0].from_date == date(2026, 11, 1)
    target = service.eligibility_for_sessions(db, [300], target_date=date(2026, 11, 14), as_of=AS_OF)[300]
    assert target.status == 'paused' and not target.can_book


def test_recorded_attendance_is_retained_and_changed_preview_conflicts(makeup_env):
    client, db, _ = makeup_env
    booking(db)
    data, reviewed = preview(client)
    db.get(SessionLog, 301).session_status = 'Attended (Make-up)'
    db.commit()
    _, response = confirm(client, data, reviewed)
    assert response.status_code == 409
    _, fresh = preview(client)
    assert fresh['affected_bookings'] == [] and fresh['warnings']
    _, response = confirm(client, data, fresh)
    assert response.status_code == 200
    assert db.get(SessionLog, 301).session_status == 'Attended (Make-up)'


@pytest.mark.parametrize('field,value', [('session_status', 'Cancelled'), ('make_up_for_id', 99999)])
def test_cancelled_or_broken_source_cannot_be_reactivated(makeup_env, field, value):
    _, db, _ = makeup_env
    booking(db)
    setattr(db.get(SessionLog, 301), field, value)
    db.commit()
    result = service.eligibility_for_sessions(db, [301], as_of=AS_OF)[301]
    assert not result.can_book and result.status == 'needs_review'


def test_disabled_feature_reads_no_new_tables(makeup_env, monkeypatch):
    client, db, _ = makeup_env
    monkeypatch.delenv('MAKEUP_ENTITLEMENT_ENABLED')
    monkeypatch.delenv('MAKEUP_ENTITLEMENT_STORAGE_ENABLED', raising=False)
    def reject_new(_conn, _cursor, statement, *_args):
        assert 'makeup_participation' not in statement.lower()
    event.listen(db.bind, 'before_cursor_execute', reject_new)
    try:
        assert service.eligibility_for_sessions(db, [300], as_of=AS_OF) == {}
        response = client.get('/api/billing/students/101/participation')
        assert response.status_code == 200 and not response.json()['enabled']
    finally:
        event.remove(db.bind, 'before_cursor_execute', reject_new)


def test_same_key_with_changed_body_is_refused(makeup_env):
    client, _, _ = makeup_env
    data, reviewed = preview(client)
    payload, response = confirm(client, data, reviewed)
    assert response.status_code == 200
    response = client.post('/api/billing/students/101/participation', json={**payload, 'reason': 'Different reason'})
    assert response.status_code == 409


def test_tutor_can_read_own_student_but_cannot_preview_or_confirm(makeup_env):
    client, _, actor = makeup_env
    actor.role = 'Tutor'
    response = client.get('/api/billing/students/101/participation')
    assert response.status_code == 200 and not response.json()['can_manage']
    response = client.post('/api/billing/students/101/participation/preview', json={
        'status': 'Paused', 'effective_on': '2026-10-17', 'reason': 'Requested pause'})
    assert response.status_code == 403


def test_batched_targets_share_one_fact_read(makeup_env, monkeypatch):
    _, db, _ = makeup_env
    calls = []
    original = service._facts
    def count(*args, **kwargs):
        calls.append(True)
        return original(*args, **kwargs)
    monkeypatch.setattr(service, '_facts', count)
    targets = [(300, date(2027, 6, day)) for day in range(1, 21)] + [(300, None)]
    result = service.eligibility_for_targets(db, targets, as_of=AS_OF)
    assert len(result) == 21 and len(calls) == 1


def test_multi_student_targets_build_each_paid_history_once(makeup_env, monkeypatch):
    _, db, _ = makeup_env
    targets = []
    for student_id in range(201, 211):
        source_enrollment, current_enrollment = student_id * 10, student_id * 10 + 1
        source_id = student_id * 100
        db.add(Student(id=student_id, student_name=f'Synthetic batch {student_id}'))
        db.add(BillingAccount(student_id=student_id, academic_start=service.POLICY.academic_start,
            policy_version=service.POLICY.version, active=True))
        db.add_all([Enrollment(id=source_enrollment, student_id=student_id, tutor_id=1, enrollment_type='Regular',
            assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', lessons_paid=1,
            first_lesson_date=date(2026, 9, 4), payment_status='Paid'),
            Enrollment(id=current_enrollment, student_id=student_id, tutor_id=1, enrollment_type='Regular',
            assigned_day='Fri', assigned_time='16:00 - 17:30', location='MSA', lessons_paid=6,
            first_lesson_date=date(2026, 10, 2), payment_status='Paid')])
        db.flush()
        db.add(SessionLog(id=source_id, student_id=student_id, enrollment_id=source_enrollment, tutor_id=1,
            session_date=date(2026, 9, 4), time_slot='16:00 - 17:30', location='MSA', financial_status='Paid',
            session_status='Sick Leave - Pending Make-up'))
        for index in range(6):
            from datetime import timedelta
            db.add(SessionLog(id=source_id + 10 + index, student_id=student_id, enrollment_id=current_enrollment,
                tutor_id=1, session_date=date(2026, 10, 2) + timedelta(weeks=index), time_slot='16:00 - 17:30',
                location='MSA', session_status='Scheduled', financial_status='Paid'))
        targets.extend([(source_id, None), (source_id, date(2027, 6, 30))])
    db.commit()
    builds, selects = [], []
    original = service._build_intervals
    def build(facts, student_id):
        builds.append(student_id)
        return original(facts, student_id)
    def count(_conn, _cursor, statement, *_args):
        if statement.lstrip().upper().startswith('SELECT'):
            selects.append(statement)
    monkeypatch.setattr(service, '_build_intervals', build)
    event.listen(db.bind, 'before_cursor_execute', count)
    try:
        results = service.eligibility_for_targets(db, targets, as_of=AS_OF)
        assert len(results) == 20 and all(result.can_book for result in results.values())
        assert len(builds) == len(set(builds)) == 10
        assert len(selects) <= 8
    finally:
        event.remove(db.bind, 'before_cursor_execute', count)
