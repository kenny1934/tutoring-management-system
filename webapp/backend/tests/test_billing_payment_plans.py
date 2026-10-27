"""Preference collection uses authorised roster facts without adopting students."""
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing.models import BillingAccount, BillingPayment, BillingPreference
from models import Enrollment, SessionLog, Student, Tutor
from tests.test_billing_drafts import env as draft_env


@pytest.fixture(autouse=True)
def reject_external_connections():
    def reject(dialect, *_args):
        assert dialect.name == 'sqlite', 'Payment-plan checks only use disposable SQLite.'
    event.listen(Engine, 'do_connect', reject)
    yield
    event.remove(Engine, 'do_connect', reject)


def add_source(db, student_id, school_id, *, tutor_id=1, location='MSA'):
    student = db.get(Student, student_id)
    if student is None:
        student = Student(id=student_id, student_name=f'Plan student {student_id}',
                          home_location=location, school_student_id=school_id)
        db.add(student)
    student.school_student_id = school_id
    student.student_name = f'Plan student {student_id}'
    eid = student_id * 10
    enrollment = Enrollment(id=eid, student_id=student_id, tutor_id=tutor_id,
                            enrollment_type='Regular', payment_status='Paid',
                            payment_date=date(2026, 9, 1), first_lesson_date=date(2026, 9, 2),
                            assigned_day='Wed', assigned_time='16:00 - 17:30', location=location,
                            lessons_paid=6, revenue_total=2400, is_new_student=False)
    db.add(enrollment)
    db.flush()
    for number in range(6):
        db.add(SessionLog(enrollment_id=eid, student_id=student_id, tutor_id=tutor_id,
                          session_date=date(2026, 9, 2) + timedelta(weeks=number),
                          time_slot='16:00 - 17:30', location=location,
                          session_status='Scheduled', financial_status='Paid'))
    return student


def add_preference(db, student_id, method, ready=False, *, version=1, year=2026, active=False):
    account = BillingAccount(student_id=student_id, academic_start=date(year, 9, 1),
                             policy_version='synthetic-policy', active=active)
    db.add(account)
    db.flush()
    db.add(BillingPreference(account_id=account.id, payment_method=method,
                             mandate_ready=ready, version=version,
                             updated_at=datetime(2026, 10, 17, 12)))
    return account


@pytest.fixture
def env(draft_env, monkeypatch):
    client, db, user = draft_env
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', 'true')
    monkeypatch.setenv('BILLING_WORKFLOW_ENABLED', '')
    monkeypatch.setenv('BILLING_PREFERENCES_ENABLED', '')
    db.get(Student, 101).school_student_id = '10'
    for student_id, school_id in [(102, '2'), (103, '003'), (104, '4'), (105, '50'), (106, '60')]:
        add_source(db, student_id, school_id)
    add_preference(db, 101, 'manual', version=3)
    add_preference(db, 102, 'autopay', version=4)
    add_preference(db, 103, 'autopay', True, version=5)
    add_preference(db, 104, None, version=6)
    add_preference(db, 106, 'manual', version=9, year=2025, active=True)
    db.commit()
    return client, db, user


COUNTS = dict(total=6, not_recorded=3, manual=1, autopay=2, setup_pending=1)


def roster(client, **params):
    result = client.get('/api/billing/students', params=params)
    assert result.status_code == 200, result.text
    return result.json()


def only_selects(db, statements):
    def before_execute(_conn, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement
    event.listen(db.bind, 'before_cursor_execute', before_execute)
    return before_execute


def test_roster_returns_current_year_saved_choices_without_adopting_or_writing(env):
    client, db, _ = env
    before = (db.query(BillingAccount).count(), db.query(BillingPreference).count(),
              db.query(Enrollment).count(), db.query(BillingPayment).count())
    statements = []
    guard = only_selects(db, statements)
    try:
        result = roster(client)
    finally:
        event.remove(db.bind, 'before_cursor_execute', guard)
    assert result['preferences_available'] is True
    assert result['preference_counts'] == COUNTS
    assert [row['student']['id'] for row in result['rows']] == [102, 103, 104, 101, 105, 106]
    rows = {row['student']['id']: row for row in result['rows']}
    for sid, method, ready, version in [(101, 'manual', False, 3), (102, 'autopay', False, 4),
                                      (103, 'autopay', True, 5), (104, None, False, 6)]:
        assert rows[sid]['recorded_payment_method'] == method
        assert rows[sid]['mandate_ready'] is ready
        assert rows[sid]['preference_version'] == version
        assert rows[sid]['preference_updated_at'].startswith('2026-10-17T12:00:00')
    for sid in (105, 106):
        assert rows[sid]['recorded_payment_method'] is None
        assert rows[sid]['mandate_ready'] is None
        assert rows[sid]['preference_version'] == 0
        assert rows[sid]['preference_updated_at'] is None
    assert statements
    assert before == (db.query(BillingAccount).count(), db.query(BillingPreference).count(),
                      db.query(Enrollment).count(), db.query(BillingPayment).count())
    assert all(not account.active for account in db.query(BillingAccount).filter_by(academic_start=date(2026, 9, 1)))


@pytest.mark.parametrize('choice,ids', [
    ('all', [102, 103, 104, 101, 105, 106]), ('not_recorded', [104, 105, 106]),
    ('manual', [101]), ('autopay', [102, 103]), ('setup_pending', [102]),
])
def test_preference_filter_uses_the_whole_roster_before_pagination(env, choice, ids):
    client, _, _ = env
    result = roster(client, preference_filter=choice, limit=1)
    assert result['total'] == len(ids)
    assert [row['student']['id'] for row in result['rows']] == ids[:1]
    assert result['preference_counts'] == COUNTS
    if len(ids) > 1:
        second = roster(client, preference_filter=choice, limit=1, offset=1)
        assert [row['student']['id'] for row in second['rows']] == ids[1:2]
        assert second['preference_counts'] == COUNTS


def test_search_scopes_progress_counts_before_the_method_filter(env):
    client, _, _ = env
    result = roster(client, search='Plan student 10', preference_filter='autopay')
    assert result['preference_counts'] == dict(total=5, not_recorded=3, manual=0, autopay=2, setup_pending=1)
    assert [row['student']['id'] for row in result['rows']] == [102, 103]
    no_match = roster(client, search='%')
    assert no_match['total'] == 0
    assert no_match['rows'] == []
    assert no_match['preference_counts'] == dict.fromkeys(COUNTS, 0)


def test_older_year_preferences_do_not_hide_a_missing_current_year_response(env):
    client, db, _ = env
    result = roster(client, search='60', preference_filter='not_recorded')
    assert result['total'] == 1
    assert result['rows'][0]['student']['id'] == 106
    assert result['rows'][0]['preference_version'] == 0
    assert result['preference_counts'] == dict(total=1, not_recorded=1, manual=0, autopay=0, setup_pending=0)
    assert db.query(BillingAccount).filter_by(student_id=106, academic_start=date(2026, 9, 1)).count() == 0


def test_metadata_and_filters_do_not_require_an_activated_billing_account(env):
    client, db, _ = env
    assert not db.query(BillingAccount).filter_by(student_id=101).one().active
    manual = roster(client, preference_filter='manual')
    assert manual['total'] == 1
    assert manual['rows'][0]['preference_version'] == 3
    assert manual['rows'][0]['recorded_payment_method'] == 'manual'


def test_two_weekly_teaching_enrollments_still_count_as_one_student(env):
    client, db, _ = env
    add_source(db, 101, '10')
    db.commit()
    result = roster(client)
    assert result['preference_counts'] == COUNTS
    assert len([row for row in result['rows'] if row['student']['id'] == 101]) == 1
    assert result['total'] == 6


def test_saved_bank_authorisation_does_not_make_a_manual_preference_setup_pending(env):
    client, db, _ = env
    account = db.query(BillingAccount).filter_by(student_id=101, academic_start=date(2026, 9, 1)).one()
    db.get(BillingPreference, account.id).mandate_ready = True
    db.commit()
    result = roster(client, preference_filter='setup_pending')
    assert [row['student']['id'] for row in result['rows']] == [102]
    assert result['preference_counts'] == COUNTS
    manual = roster(client, preference_filter='manual')['rows'][0]
    assert manual['mandate_ready'] is True


def test_autopay_preference_remains_distinct_from_an_initial_manual_collection(env):
    client, db, _ = env
    enrollment = db.get(Enrollment, 1020)
    enrollment.first_lesson_date = date(2026, 9, 30)
    enrollment.payment_date = date(2026, 9, 28)
    for index, lesson in enumerate(db.query(SessionLog).filter_by(enrollment_id=1020).order_by(SessionLog.id)):
        lesson.session_date = date(2026, 9, 30) + timedelta(weeks=index)
    db.commit()
    result = roster(client, preference_filter='autopay')
    own = next(row for row in result['rows'] if row['student']['id'] == 102)
    assert own['recorded_payment_method'] == 'autopay'
    assert own['next_autopay']['collection']['method'] == 'manual'
    assert own['next_autopay']['first_lesson_date'] == '2026-11-11'


def test_roster_retains_a_bad_lesson_owner_for_preference_collection(env):
    client, db, _ = env
    db.add(SessionLog(enrollment_id=11, student_id=102, tutor_id=1,
                      session_date=date(2026, 12, 18), time_slot='16:00 - 17:30',
                      location='MSA', session_status='Scheduled', financial_status='Paid'))
    db.commit()
    result = roster(client)
    assert result['total'] == 6
    row = next(row for row in result['rows'] if row['student']['id'] == 101)
    assert row['recorded_payment_method'] == 'manual'
    assert row['preference_version'] == 3
    assert row['requires_review'] is True
    assert row['next_manual'] is None and row['next_autopay'] is None
    assert 'SOURCE_OWNERSHIP_REVIEW' in {issue['code'] for issue in row['source_issues']}
    assert result['preference_counts'] == COUNTS


def test_schema_off_roster_still_previews_without_reading_billing_tables(env, monkeypatch):
    client, db, _ = env
    monkeypatch.setenv('BILLING_WORKFLOW_STORAGE_ENABLED', '')
    statements = []
    def no_billing_tables(_conn, _cursor, statement, *_args):
        statements.append(statement)
        assert 'billing_' not in statement.lower(), statement
    event.listen(db.bind, 'before_cursor_execute', no_billing_tables)
    try:
        result = roster(client)
        filtered = client.get('/api/billing/students', params={'preference_filter': 'manual'})
    finally:
        event.remove(db.bind, 'before_cursor_execute', no_billing_tables)
    assert result['preferences_available'] is False
    assert result['preference_counts'] is None
    assert result['total'] == 6
    assert all(row['recorded_payment_method'] is None and row['preference_version'] == 0 for row in result['rows'])
    assert filtered.status_code == 503
    assert statements


@pytest.mark.parametrize('choice', ['cash', 'bank_transfer', 'unknown', ''])
def test_unknown_preference_filters_are_rejected(env, choice):
    client, _, _ = env
    assert client.get('/api/billing/students', params={'preference_filter': choice}).status_code == 422


def add_foreign_source(db):
    db.add(Tutor(id=2, tutor_name='Second plan tutor', user_email='second-plan@example.test', role='Tutor'))
    db.flush()
    add_source(db, 201, '1', tutor_id=2, location='MSB')
    add_preference(db, 201, 'manual', version=8)
    db.commit()


def test_branch_filter_limits_rows_and_every_progress_count(env):
    client, db, _ = env
    add_foreign_source(db)
    msa = roster(client, location='MSA')
    assert msa['preference_counts'] == COUNTS
    msb = roster(client, location='MSB')
    assert [row['student']['id'] for row in msb['rows']] == [201]
    assert msb['preference_counts'] == dict(total=1, not_recorded=0, manual=1, autopay=0, setup_pending=0)
    empty = roster(client, location='Various')
    assert empty['total'] == 0
    assert empty['preference_counts'] == dict.fromkeys(COUNTS, 0)


def test_tutor_counts_cannot_reveal_another_tutors_choices(env):
    client, db, user = env
    add_foreign_source(db)
    user.role = 'Tutor'
    result = roster(client)
    assert result['preference_counts'] == COUNTS
    assert 201 not in {row['student']['id'] for row in result['rows']}
    result = client.get('/api/billing/students', params={'tutor_id': 2})
    assert result.status_code == 403


def test_super_admin_tutor_impersonation_counts_only_the_viewed_tutor(env):
    client, db, user = env
    add_foreign_source(db)
    user.role = 'Super Admin'
    response = client.get('/api/billing/students', params={'tutor_id': 2}, headers={'X-Effective-Role': 'Tutor'})
    assert response.status_code == 200, response.text
    result = response.json()
    assert [row['student']['id'] for row in result['rows']] == [201]
    assert result['preference_counts'] == dict(total=1, not_recorded=0, manual=1, autopay=0, setup_pending=0)


def test_guest_cannot_read_preference_metadata_or_progress(env):
    client, db, user = env
    user.role = 'Guest'
    statements = []
    def observe(_conn, _cursor, statement, *_args):
        statements.append(statement)
    event.listen(db.bind, 'before_cursor_execute', observe)
    try:
        response = client.get('/api/billing/students')
    finally:
        event.remove(db.bind, 'before_cursor_execute', observe)
    assert response.status_code == 403
    assert statements == []


def test_supervisor_can_read_saved_choices_but_cannot_record_them(env, monkeypatch):
    from routers import billing_workflow
    client, _, user = env
    client.app.include_router(billing_workflow.router, prefix='/api')
    monkeypatch.setenv('BILLING_PREFERENCES_ENABLED', 'true')
    user.role = 'Supervisor'
    assert roster(client)['preference_counts'] == COUNTS
    response = client.put('/api/billing/students/101/preferences', json={
        'payment_method': 'autopay', 'mandate_ready': False,
        'expected_version': 3, 'idempotency_key': 'read-only-choice',
    })
    assert response.status_code == 403


def test_preferences_only_activation_saves_a_choice_without_creating_enrollments(env, monkeypatch):
    from routers import billing_workflow
    client, db, _ = env
    client.app.include_router(billing_workflow.router, prefix='/api')
    monkeypatch.setenv('BILLING_PREFERENCES_ENABLED', 'true')
    before = db.query(Enrollment).count()
    row = roster(client, preference_filter='manual')['rows'][0]
    body = {'payment_method': 'autopay', 'mandate_ready': False,
            'expected_version': row['preference_version'], 'idempotency_key': 'plan-only-choice'}
    response = client.put('/api/billing/students/101/preferences', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['version'] == 4
    updated = roster(client, search='10', preference_filter='setup_pending')
    own = next(row for row in updated['rows'] if row['student']['id'] == 101)
    assert own['recorded_payment_method'] == 'autopay'
    assert own['mandate_ready'] is False
    assert own['preference_version'] == 4
    assert db.query(Enrollment).count() == before
    assert db.query(BillingPayment).count() == 0
    assert not db.query(BillingAccount).filter_by(student_id=101, academic_start=date(2026, 9, 1)).one().active
