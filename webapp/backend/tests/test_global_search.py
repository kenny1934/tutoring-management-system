"""Search relevance and identity, using only the isolated SQLite fixture."""
from datetime import date, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import event

from models import Enrollment, SessionLog, Student, Tutor
from services.global_search import search_records

TODAY = date(2026, 11, 23)


@pytest.fixture
def records(db_session):
    tutor = Tutor(user_email='search@example.test', tutor_name='Ms Search', role='Tutor')
    student = Student(student_name='Search Learner', school_student_id='SEARCH-001', school='Test School',
                      grade='F2', lang_stream='E', home_location='MSA', phone='12345678')
    db_session.add_all([tutor, student]); db_session.flush()

    def enrol(start=TODAY, status='Paid', location='MSA'):
        row = Enrollment(student_id=student.id, tutor_id=tutor.id, first_lesson_date=start,
                         payment_status=status, location=location, assigned_day='Monday',
                         assigned_time='16:45 - 18:15', enrollment_type='Regular')
        db_session.add(row); db_session.flush()
        return row

    def lesson(enrollment, offset=0, status='Scheduled'):
        row = SessionLog(enrollment_id=enrollment.id, student_id=student.id, tutor_id=tutor.id,
                         session_date=TODAY + timedelta(days=offset), time_slot='16:45 - 18:15',
                         location=enrollment.location, session_status=status)
        db_session.add(row); db_session.flush()
        return row

    with patch('services.global_search.hk_now', return_value=datetime(2026, 11, 23, 12)):
        yield db_session, student, enrol, lesson


def test_sessions_prioritise_today_then_nearest_upcoming_then_past(records):
    db, _, enrol, lesson = records
    e = enrol()
    rows = {day: lesson(e, day) for day in [-7, -1, 0, 1, 10, 29]}
    result = search_records(db, 'Search', limit=5)
    assert [s['id'] for s in result['sessions']] == [rows[d].id for d in [0, 1, 10, 29, -1]]
    assert result['has_more']['sessions'] is True
    row = result['sessions'][0]
    assert (row['time_slot'], row['school_student_id'], row['school'], row['lang_stream']) == ('16:45 - 18:15', 'SEARCH-001', 'Test School', 'E')


def test_history_is_explicit_and_preserves_location(records):
    db, _, enrol, lesson = records
    old = lesson(enrol(TODAY - timedelta(days=120)), -90)
    lesson(enrol(location='MSB'), -90)
    assert search_records(db, 'Search', 'MSA')['sessions'] == []
    assert [s['id'] for s in search_records(db, 'Search', 'MSA', include_history=True)['sessions']] == [old.id]


def test_enrolments_include_current_waived_and_future_but_not_old_paid(records):
    db, _, enrol, lesson = records
    old = enrol(TODAY - timedelta(days=180))
    current = enrol(TODAY - timedelta(days=21)); lesson(current, 1)
    waived = enrol(status='Waived')
    future = enrol(TODAY + timedelta(days=7))
    cancelled = enrol(status='Cancelled')
    ids = [e['id'] for e in search_records(db, 'SEARCH-001')['enrollments']]
    assert set(ids) == {current.id, waived.id, future.id}
    assert ids.index(current.id) < ids.index(future.id)
    history = search_records(db, 'SEARCH-001', include_history=True, limit=10)['enrollments']
    assert {e['id'] for e in history} == {old.id, current.id, waived.id, future.id, cancelled.id}
    assert history[0]['id'] in {current.id, waived.id}
    assert history[0]['assigned_day'] == 'Monday' and history[0]['first_lesson_date']


def test_cancelled_future_lesson_does_not_keep_old_enrolment_current(records):
    db, _, enrol, lesson = records
    lesson(enrol(TODAY - timedelta(days=180)), 2, status='Cancelled')
    assert search_records(db, 'Search')['enrollments'] == []


@pytest.mark.parametrize('query', ['SEARCH-001', 'Test School', '16:45', '2026-11-23', 'Learner 16:45'])
def test_search_finds_identifiers_schools_dates_times_and_combined_terms(records, query):
    db, _, enrol, lesson = records
    e = enrol(); s = lesson(e)
    result = search_records(db, query)
    assert [row['id'] for row in result['sessions']] == [s.id]
    assert [row['id'] for row in result['enrollments']] == [e.id]


def test_wildcards_are_literal_and_unmatched_tokens_are_not_ignored(records):
    db, _, enrol, lesson = records
    lesson(enrol())
    for query in ['%%', '__', 'Learner nonexistent']:
        result = search_records(db, query)
        assert result['students'] == result['sessions'] == result['enrollments'] == []


def test_phone_is_not_searchable_or_returned_without_permission(records):
    db, _, _, _ = records
    assert search_records(db, '12345678')['students'] == []
    row = search_records(db, 'Search')['students'][0]
    assert row['phone'] is None and row['contacts'] is None


def test_search_does_not_query_once_per_result(records):
    db, _, enrol, lesson = records
    for _ in range(8): lesson(enrol())
    statements = []
    def count(_conn, _cursor, statement, _params, _context, _many): statements.append(statement)
    event.listen(db.bind, 'before_cursor_execute', count)
    try:
        search_records(db, 'Search')
    finally:
        event.remove(db.bind, 'before_cursor_execute', count)
    assert len(statements) == 5


def test_empty_query_does_not_return_every_record(records):
    db, _, enrol, lesson = records
    lesson(enrol())
    assert search_records(db, '  ')['sessions'] == []


def test_grade_stream_and_nearest_future_enrolment(records):
    db, _, enrol, lesson = records
    near = enrol(TODAY + timedelta(days=7)); lesson(near, 7)
    enrol(TODAY + timedelta(days=21))
    result = search_records(db, 'F2E')
    assert result['sessions'][0]['id']
    assert result['enrollments'][0]['id'] == near.id


@pytest.mark.parametrize('role,office,expected', [('Tutor', False, False), ('Supervisor', False, False), ('Tutor', True, True), ('Admin', False, True)])
def test_route_preserves_contact_permissions_and_passes_search_options(monkeypatch, role, office, expected):
    from routers import stats
    from unittest.mock import Mock
    search = Mock(return_value={'students': []})
    monkeypatch.setattr('services.global_search.search_records', search)
    monkeypatch.setattr(stats, 'get_effective_role', lambda request, user: role)
    monkeypatch.setattr(stats, 'is_office_ip', lambda request, db: office)
    db, request, user = object(), object(), object()
    stats.global_search(request=request, q='learner', location='MSA', limit=10, include_history=True, current_user=user, db=db, category=None, offset=0, from_date=None, to_date=None, tutor_id=None, status=None, student_id=None)
    search.assert_called_once_with(db, 'learner', 'MSA', 10, True, expected, category=None, offset=0, from_date=None, to_date=None, tutor_id=None, status=None, student_id=None)


def test_content_matching_combines_student_and_exercise_without_duplicate_lessons(records):
    from models import SessionExercise
    db, student, enrol, lesson = records
    row = lesson(enrol()); row.notes = 'Revisit factorisation before the next test.'
    for title in ['Factorisation practice', 'Factorisation answers']:
        db.add(SessionExercise(session_id=row.id, exercise_type='CW', pdf_name='factorisation.pdf', url_title=title, created_by='test'))
    db.flush()
    result = search_records(db, 'Learner factorisation', category='sessions')
    assert [s['id'] for s in result['sessions']] == [row.id]
    contexts = result['sessions'][0]['match_context']
    assert contexts[0]['label'] == 'Comment' and 'factorisation' in contexts[0]['text']
    assert contexts[1]['label'] == 'CW' and len(contexts) == 2
    assert result['students'] == result['enrollments'] == []


def test_homework_filename_is_searchable_and_explained(records):
    from models import SessionExercise
    db, _, enrol, lesson = records
    row = lesson(enrol())
    db.add(SessionExercise(session_id=row.id, exercise_type='Homework', pdf_name='algebra_revision.pdf', created_by='test'))
    db.flush()
    contexts = search_records(db, 'algebra_revision', category='sessions')['sessions'][0]['match_context']
    assert contexts == [{'label': 'HW', 'text': 'algebra_revision.pdf'}]


def test_category_pagination_has_no_duplicates_or_missing_records(records):
    db, _, enrol, lesson = records
    e = enrol(); rows = [lesson(e) for _ in range(13)]
    ids = []
    for offset in [0, 5, 10]:
        data = search_records(db, 'Search', category='sessions', offset=offset)
        ids.extend(s['id'] for s in data['sessions'])
        assert data['has_more']['sessions'] == (offset < 10)
    assert ids == [row.id for row in rows]


def test_filter_only_search_uses_date_tutor_status_and_student(records):
    db, student, enrol, lesson = records
    e = enrol(); wanted = lesson(e); lesson(e, 1); lesson(e, status='Attended')
    data = search_records(db, '', category='sessions', from_date=TODAY, to_date=TODAY,
                          tutor_id=e.tutor_id, student_id=student.id, status='unmarked')
    assert [s['id'] for s in data['sessions']] == [wanted.id]
    assert search_records(db, '', category='sessions')['sessions'] == []
    assert search_records(db, '', category='sessions', tutor_id=e.tutor_id + 999)['sessions'] == []


def test_explicit_date_range_reaches_beyond_default_history_window(records):
    db, _, enrol, lesson = records
    row = lesson(enrol(), -150)
    data = search_records(db, '', category='sessions', from_date=row.session_date, to_date=row.session_date)
    assert [s['id'] for s in data['sessions']] == [row.id]


def test_next_lesson_excludes_cancelled_attended_and_finished_slots(records):
    db, _, enrol, lesson = records
    e = enrol(); lesson(e, status='Cancelled'); lesson(e, status='Attended')
    finished = lesson(e); finished.time_slot = '09:00 - 10:30'
    expected = lesson(e, 1)
    data = search_records(db, '', category='sessions', student_id=e.student_id, from_date=TODAY, status='upcoming')
    assert [s['id'] for s in data['sessions']] == [expected.id]


def test_search_route_accepts_filter_only_query_and_rejects_reversed_dates(records, client, monkeypatch):
    from routers import stats
    from tests.helpers import make_auth_token
    db, _, enrol, lesson = records
    e = enrol(); row = lesson(e)
    db.commit()
    monkeypatch.setattr(stats, 'is_office_ip', lambda *_: False)
    cookies = {'access_token': make_auth_token(e.tutor_id)}
    response = client.get('/api/search', params={'category': 'sessions', 'from_date': TODAY.isoformat(), 'to_date': TODAY.isoformat()}, cookies=cookies)
    assert response.status_code == 200
    assert [s['id'] for s in response.json()['sessions']] == [row.id]
    reversed_dates = client.get('/api/search', params={'from_date': '2026-12-01', 'to_date': '2026-11-01'}, cookies=cookies)
    assert reversed_dates.status_code == 422
