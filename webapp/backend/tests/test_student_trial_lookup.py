"""The enrollment modal reads only the selected student's canonical trials."""
from datetime import date
import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from models import Enrollment, SessionLog
from routers import enrollments
from tests.test_billing_drafts import env

@pytest.fixture(autouse=True)
def sqlite_only():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


def add_trial(session, identity, student, branch, *, cancelled=False):
    session.add(Enrollment(id=identity, student_id=student, tutor_id=1, enrollment_type='Trial', assigned_day='Fri', assigned_time='16:45 - 18:15', location=branch, lessons_paid=1, first_lesson_date=date(2026,11,13), payment_status='Cancelled' if cancelled else 'Paid', is_new_student=False))
    session.flush()
    session.add(SessionLog(id=identity*10, enrollment_id=identity, student_id=student, tutor_id=1, session_date=date(2026,11,13), time_slot='16:45 - 18:15', location=branch, session_status='Attended', financial_status='Paid'))


def test_student_filter_narrows_trials_without_changing_unfiltered_results(env):
    client, session, _ = env
    client.app.include_router(enrollments.router, prefix='/api')
    add_trial(session, 20, 101, 'MSA');add_trial(session, 21, 102, 'MSB');add_trial(session, 22, 101, 'MSA', cancelled=True)
    session.commit()
    all_trials = client.get('/api/enrollments/trials');assert all_trials.status_code == 200
    assert {trial['enrollment_id'] for trial in all_trials.json()} == {20,21}
    selected = client.get('/api/enrollments/trials?student_id=102');assert selected.status_code == 200
    trial, = selected.json();assert trial['student_id'] == 102 and trial['enrollment_id'] == 21
    assert trial['session_id'] == 210 and trial['trial_status'] == 'pending' and trial['session_status'] == 'Attended'
    assert client.get('/api/enrollments/trials?student_id=102&location=MSA').json() == []
    assert client.get('/api/enrollments/trials?student_id=999').json() == []
    assert client.get('/api/enrollments/trials?student_id=0').status_code == 422
