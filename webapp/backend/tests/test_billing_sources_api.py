"""Exercise recorded billing evidence through authenticated, read-only routes.

Every student and lesson here is synthetic. The regular test fixture replaces
the application database with SQLite before any request is made.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from auth.dependencies import get_current_user
from main import app
from models import Enrollment, Holiday, SessionLog, Student, StudentCoupon, Tutor
from tests.helpers import make_auth_token


COOKIE = {'access_token': make_auth_token(99)}
AS_OF = date(2026, 10, 17)


@pytest.fixture
def source_staff(monkeypatch):
    user = Tutor(id=1, user_email='scope@example.com', tutor_name='Scope Tutor', role='Tutor')
    app.dependency_overrides[get_current_user] = lambda: user
    monkeypatch.setattr('routers.billing.today', lambda: AS_OF)
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def evidence(db_session):
    """Create small independent source histories, without application writes."""
    db_session.add_all([
        Tutor(id=1, user_email='one@example.com', tutor_name='Tutor One', role='Tutor'),
        Tutor(id=2, user_email='two@example.com', tutor_name='Tutor Two', role='Tutor'),
    ])
    db_session.commit()

    class Factory:
        def student(self, id_=1, name='Synthetic Alpha', company_id=None):
            row = Student(id=id_, student_name=name, school_student_id=company_id or f'TEST{id_:03}',
                          home_location='Test Branch', grade='F2', phone='PRIVATE PHONE',
                          contacts=[{'phone': 'PRIVATE CONTACT'}], staff_referral_notes='PRIVATE REFERRAL')
            db_session.add(row)
            db_session.commit()
            return row

        def block(self, student_id=1, tutor_id=1, dates=None, *, first=None, weekday='Mon',
                  status='Paid', type_='Regular', sent=False, location='Test Branch',
                  time='16:00-17:00', is_new=False, renewed_from=None, extension=0):
            dates = dates if dates is not None else [date(2026, 10, 12), date(2026, 10, 19)]
            row = Enrollment(student_id=student_id, tutor_id=tutor_id,
                             first_lesson_date=first or dates[0], assigned_day=weekday,
                             assigned_time=time, location=location, lessons_paid=len(dates),
                             payment_status=status, enrollment_type=type_, fee_message_sent=sent,
                             payment_date=date(2026, 10, 1) if status == 'Paid' else None,
                             is_new_student=is_new, renewed_from_enrollment_id=renewed_from,
                             deadline_extension_weeks=extension, revenue_total=Decimal('123.45'))
            db_session.add(row)
            db_session.flush()
            roots = []
            for day in dates:
                root = SessionLog(student_id=student_id, tutor_id=tutor_id, enrollment_id=row.id,
                                  session_date=day, time_slot=time, location=location,
                                  session_status='Scheduled', financial_status='Paid' if status == 'Paid' else 'Unpaid')
                db_session.add(root)
                roots.append(root)
            db_session.commit()
            return row, roots

    return Factory()


def context(client, student_id=1, **params):
    return client.get(f'/api/billing/students/{student_id}/context', params=params, cookies=COOKIE)


def roster(client, **params):
    return client.get('/api/billing/students', params=params, cookies=COOKIE)


def issue_codes(result):
    return {i['code'] for i in result['issues']}


def test_source_routes_require_authentication(client):
    assert client.get('/api/billing/students').status_code == 401
    assert client.get('/api/billing/students/1/context').status_code == 401


def test_tutor_cannot_read_other_tutors_student_or_forge_scope(client, source_staff, evidence):
    evidence.student()
    evidence.block(tutor_id=2)
    assert roster(client).json()['total'] == 0
    assert context(client).status_code == 404
    assert roster(client, tutor_id=2).status_code == 403
    assert context(client, tutor_id=2).status_code == 403
    forged = client.get('/api/billing/students', cookies=COOKIE,
                        headers={'X-Effective-Role': 'Admin'})
    assert forged.status_code == 200 and forged.json()['total'] == 0


def test_superadmin_effective_tutor_is_scoped_to_the_selected_tutor(client, source_staff, evidence):
    evidence.student(1)
    evidence.student(2, 'Synthetic Beta')
    evidence.block(student_id=1, tutor_id=1)
    evidence.block(student_id=2, tutor_id=2)
    source_staff.role = 'Super Admin'
    assert roster(client).json()['total'] == 2
    own = client.get('/api/billing/students', cookies=COOKIE, headers={'X-Effective-Role': 'Tutor'})
    assert [r['student']['id'] for r in own.json()['rows']] == [1]
    other = client.get('/api/billing/students', params={'tutor_id': 2}, cookies=COOKIE,
                       headers={'X-Effective-Role': 'Tutor'})
    assert [r['student']['id'] for r in other.json()['rows']] == [2]
    denied = client.get('/api/billing/students/1/context', params={'tutor_id': 2}, cookies=COOKIE,
                        headers={'X-Effective-Role': 'Tutor'})
    assert denied.status_code == 404


@pytest.mark.parametrize('actual_role,headers', [('Guest', {}), ('Super Admin', {'X-Effective-Role': 'Guest'})])
def test_actual_and_impersonated_guests_cannot_read_sources(client, source_staff, actual_role, headers):
    source_staff.role = actual_role
    assert client.get('/api/billing/students', cookies=COOKIE, headers=headers).status_code == 403
    assert client.get('/api/billing/students/1/context', cookies=COOKIE, headers=headers).status_code == 403


def test_regular_source_excludes_trial_summer_and_previous_academic_year(client, source_staff, evidence):
    for id_, type_, dates in [(1, 'Trial', None), (2, 'Summer', None),
                              (3, 'Regular', [date(2026, 6, 1)]), (4, 'Regular', None)]:
        evidence.student(id_, f'Synthetic {id_}')
        evidence.block(student_id=id_, type_=type_, dates=dates)
    result = roster(client).json()
    assert result['total'] == 1
    assert [r['student']['id'] for r in result['rows']] == [4]
    assert context(client, 1).status_code == 404
    assert context(client, 2).status_code == 404


def test_pre_september_block_is_included_when_an_original_lesson_is_in_the_year(client, source_staff, evidence):
    evidence.student()
    block, _ = evidence.block(first=date(2026, 7, 27),
                              dates=[date(2026, 7, 27), date(2026, 9, 7)])
    response = context(client)
    assert response.status_code == 200, response.text
    result = response.json()
    assert [b['enrollment_id'] for b in result['source_blocks']] == [block.id]
    assert result['slot_candidates'][0]['last_paid_original_date'] == '2026-09-07'
    assert roster(client).json()['total'] == 1


def test_cancelled_block_stays_historical_and_cannot_supply_continuing_coverage(client, source_staff, evidence):
    evidence.student()
    active, _ = evidence.block()
    cancelled, _ = evidence.block(dates=[date(2027, 1, 4)], status='Cancelled')
    result = context(client).json()
    assert {b['enrollment_id'] for b in result['source_blocks']} == {active.id, cancelled.id}
    assert result['selected_enrollment_ids'] == [active.id]
    assert result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-19'
    assert context(client, selected_enrollment_ids=[cancelled.id]).status_code == 422


def test_cancelled_only_student_has_no_active_roster_entry(client, source_staff, evidence):
    evidence.student()
    evidence.block(status='Cancelled')
    assert roster(client).json()['total'] == 0
    assert context(client).status_code == 404


def test_makeup_and_extension_do_not_extend_original_paid_boundary(client, source_staff, evidence, db_session):
    evidence.student()
    block, roots = evidence.block(extension=20)
    roots[0].session_status = 'Rescheduled - Pending Make-up'
    db_session.add(SessionLog(student_id=1, tutor_id=1, enrollment_id=block.id,
                              session_date=date(2027, 3, 1), time_slot='16:00-17:00',
                              location='Test Branch', make_up_for_id=roots[0].id,
                              session_status='Scheduled', financial_status='Paid'))
    db_session.commit()
    result = context(client).json()
    assert result['pending_makeup_count'] == 1
    assert result['source_blocks'][0]['makeup_dates'] == ['2027-03-01']
    assert len(result['source_blocks'][0]['originals']) == 2
    assert result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-19'
    assert result['suggested_request']['first_lesson_date'] == '2026-10-26'


def test_paid_only_and_retained_pending_are_distinct_review_scenarios(client, source_staff, evidence):
    evidence.student()
    paid, _ = evidence.block()
    pending, _ = evidence.block(dates=[date(2026, 10, 26), date(2026, 11, 2)],
                                status='Pending Payment', sent=True, renewed_from=paid.id)
    paid_result = context(client).json()
    pending_result = context(client, basis='include_pending').json()
    assert paid_result['pending_bill_count'] == pending_result['pending_bill_count'] == 1
    assert paid_result['sent_pending_bill_count'] == 1
    assert 'PENDING_BILLS' in issue_codes(paid_result) and 'SENT_BILL_REVIEW' in issue_codes(paid_result)
    assert paid_result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-19'
    assert paid_result['suggested_request']['first_lesson_date'] == '2026-10-26'
    assert pending_result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-19'
    assert pending_result['slot_candidates'][0]['last_retained_original_date'] == '2026-11-02'
    assert pending_result['suggested_request']['first_lesson_date'] == '2026-11-09'
    assert 'PENDING_COVERAGE_ASSUMED' in issue_codes(pending_result)
    assert paid_result['source_fingerprint'] != pending_result['source_fingerprint']
    assert next(b for b in pending_result['source_blocks'] if b['enrollment_id'] == pending.id)['payment_status'] == 'Pending Payment'


def test_imported_coupon_is_utc_unverified_and_does_not_automatically_discount(client, source_staff, evidence, db_session):
    evidence.student()
    evidence.block()
    db_session.add(StudentCoupon(student_id=1, available_coupons=2, coupon_value=Decimal('300.00'),
                                 last_synced_at=datetime(2026, 10, 16, 9, 30),
                                 sync_source_file='PRIVATE SOURCE', notes='PRIVATE COUPON NOTE'))
    db_session.commit()
    result = context(client).json()
    snapshot = result['coupon_snapshot']
    assert snapshot['remaining_count'] == 2 and Decimal(snapshot['cached_value']) == 300
    assert snapshot['verified'] is False
    assert datetime.fromisoformat(snapshot['synced_at_utc'].replace('Z', '+00:00')).utcoffset() == timedelta(0)
    assert result['suggested_request']['coupon'] is None
    serialised = str(result)
    for private in ['PRIVATE PHONE', 'PRIVATE CONTACT', 'PRIVATE REFERRAL', 'PRIVATE SOURCE', 'PRIVATE COUPON NOTE']:
        assert private not in serialised
    assert result['recorded_payment_method'] is None and result['mandate_ready'] is None


def test_authorised_student_context_loads_the_other_tutors_slot_for_combined_billing(client, source_staff, evidence):
    evidence.student()
    monday, _ = evidence.block()
    thursday, _ = evidence.block(tutor_id=2, weekday='Thu',
                                 dates=[date(2026, 10, 15), date(2026, 10, 22)])
    result = context(client).json()
    assert {b['enrollment_id'] for b in result['source_blocks']} == {monday.id, thursday.id}
    assert set(result['selected_enrollment_ids']) == {monday.id, thursday.id}
    assert len(result['suggested_request']['slots']) == 2
    assert 'CONTINUING_SLOTS_REVIEW' in issue_codes(result)
    row = roster(client).json()['rows'][0]
    assert row['selected_slot_count'] == 2
    assert row['next_manual']['collection']['method'] == 'manual'
    assert row['next_autopay']['collection']['method'] in {'manual', 'autopay'}


def test_sources_and_roster_issue_only_bounded_selects_without_n_plus_one(client, source_staff, evidence, db_session):
    for id_ in range(1, 13):
        evidence.student(id_, f'Synthetic {id_:02}')
        evidence.block(student_id=id_)
    statements = []

    def only_select(_connection, _cursor, statement, *_args):
        statements.append(statement)
        assert statement.lstrip().upper().startswith('SELECT'), statement

    event.listen(db_session.bind, 'before_cursor_execute', only_select)
    try:
        small = roster(client, limit=1)
        small_count = len(statements)
        statements.clear()
        page = roster(client, limit=12)
        page_count = len(statements)
        statements.clear()
        detail = context(client)
        detail_count = len(statements)
    finally:
        event.remove(db_session.bind, 'before_cursor_execute', only_select)
    assert small.status_code == page.status_code == detail.status_code == 200
    assert len(page.json()['rows']) == 12
    assert page_count <= small_count + 1
    assert page_count <= 8 and detail_count <= 7
    assert db_session.query(Enrollment).count() == 12
    assert db_session.query(SessionLog).count() == 24


def test_search_pagination_and_branch_filters_include_students_awaiting_renewal(client, source_staff, evidence):
    evidence.student(1, 'Synthetic Alpha', 'REFERENCE_A')
    evidence.student(2, 'Synthetic Beta', 'REFERENCE_B')
    evidence.student(3, 'Synthetic Gamma', 'REFERENCE_C')
    evidence.block(student_id=1)
    evidence.block(student_id=2, dates=[date(2026, 9, 7)])
    evidence.block(student_id=3, location='Other Branch')
    assert roster(client).json()['total'] == 3
    all_students = roster(client, offset=1, limit=1).json()
    assert all_students['total'] == 3
    assert all_students['offset'] == 1 and all_students['limit'] == 1
    assert [r['student']['id'] for r in all_students['rows']] == [2]
    assert roster(client, search='REFERENCE_B').json()['rows'][0]['student']['id'] == 2
    assert roster(client, search='Gamma').json()['rows'][0]['student']['id'] == 3
    assert roster(client, search='3').json()['rows'][0]['student']['id'] == 3
    assert roster(client, location='Test Branch').json()['total'] == 2
    assert roster(client, search='%').json()['total'] == 0
    assert roster(client, search='_').json()['total'] == 3
    assert roster(client, limit=101).status_code == 422
    assert roster(client, offset=-1).status_code == 422


@pytest.mark.parametrize('search', ['9' * 100, '9999999999'])
def test_numeric_search_outside_student_id_range_returns_empty_result(client, source_staff, evidence, search):
    evidence.student()
    evidence.block()
    response = roster(client, search=search)
    assert response.status_code == 200, response.text
    assert response.json()['total'] == 0
    assert response.json()['rows'] == []


def test_ended_enrolment_with_only_upcoming_makeups_stays_on_authorised_roster(client, source_staff, evidence, db_session):
    evidence.student()
    old, roots = evidence.block(dates=[date(2026, 9, 7)])
    evidence.student(2, 'Outside tutor scope')
    evidence.block(student_id=2, tutor_id=2, weekday='Thu', dates=[date(2026, 10, 22)])
    db_session.add(SessionLog(student_id=1, tutor_id=1, enrollment_id=old.id,
                              session_date=date(2026, 10, 19), time_slot='16:00-17:00', location='Test Branch',
                              make_up_for_id=roots[0].id, session_status='Scheduled'))
    db_session.commit()
    result = roster(client).json()
    assert result['total'] == 1
    assert result['rows'][0]['last_paid_original_date'] == '2026-09-07'


def test_slot_selection_rejects_another_student_duplicates_and_same_slot_twice(client, source_staff, evidence):
    evidence.student()
    evidence.student(2, 'Synthetic Other')
    first, _ = evidence.block()
    successor, _ = evidence.block(dates=[date(2026, 10, 26)], renewed_from=first.id)
    other, _ = evidence.block(student_id=2)
    assert context(client, selected_enrollment_ids=[other.id]).status_code == 422
    assert context(client, selected_enrollment_ids=[first.id, first.id]).status_code == 422
    assert context(client, selected_enrollment_ids=[first.id, successor.id]).status_code == 422
    response = context(client, selected_enrollment_ids=[first.id])
    assert response.status_code == 200, response.text
    assert response.json()['selected_enrollment_ids'] == [first.id]
    assert 'SCHEDULE_SELECTION_SCENARIO' in issue_codes(response.json())


def test_recorded_holiday_original_is_preserved_as_explicit_teaching_evidence(client, source_staff, evidence, db_session):
    evidence.student()
    db_session.add(Holiday(holiday_date=date(2026, 10, 23), holiday_name='Synthetic partial closure'))
    evidence.block(weekday='Fri', dates=[date(2026, 10, 16), date(2026, 10, 23)])
    result = context(client).json()
    assert result['source_blocks'][0]['originals'][1]['holiday'] is True
    assert result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-23'
    assert result['suggested_request']['first_lesson_date'] == '2026-10-30'


def test_malformed_session_ownership_is_refused_without_returning_other_student_details(client, source_staff, evidence, db_session):
    evidence.student()
    evidence.student(2, 'PRIVATE OTHER STUDENT')
    _, roots = evidence.block()
    roots[0].student_id = 2
    db_session.commit()
    response = context(client)
    assert response.status_code == 422
    assert 'PRIVATE OTHER STUDENT' not in response.text
    listed = roster(client)
    assert listed.status_code == 200
    assert 'PRIVATE OTHER STUDENT' not in listed.text
    row, = listed.json()['rows']
    assert 'SOURCE_OWNERSHIP_REVIEW' in {issue['code'] for issue in row['issues']}
    assert row['next_manual'] is None and row['next_autopay'] is None


def test_missing_makeup_parent_is_flagged_and_cannot_supply_paid_coverage(client, source_staff, evidence, db_session):
    evidence.student()
    block, _ = evidence.block()
    db_session.add(SessionLog(student_id=1, tutor_id=1, enrollment_id=block.id,
                              session_date=date(2027, 2, 1), time_slot='16:00-17:00',
                              location='Test Branch', make_up_for_id=999999,
                              session_status='Scheduled', financial_status='Paid'))
    db_session.commit()
    result = context(client).json()
    assert 'MAKEUP_CHAIN_REVIEW' in issue_codes(result)
    assert result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-19'
    assert result['suggested_request']['first_lesson_date'] == '2026-10-26'


def test_original_no_show_and_booked_makeup_still_count_as_paid_roots(client, source_staff, evidence, db_session):
    evidence.student()
    _, roots = evidence.block(dates=[date(2026, 10, 5), date(2026, 10, 12), date(2026, 10, 19)])
    roots[0].session_status = 'No Show'
    roots[1].session_status = 'Rescheduled - Make-up Booked'
    db_session.commit()
    result = context(client).json()
    assert len(result['source_blocks'][0]['originals']) == 3
    assert 'ORIGINAL_COUNT_REVIEW' not in issue_codes(result)
    assert result['slot_candidates'][0]['last_paid_original_date'] == '2026-10-19'
    assert result['upcoming_original_count'] == 1


def test_school_student_numbers_sort_numerically_before_pagination(client, source_staff, evidence, db_session):
    # Deliberately oppose alphabetical and numeric order, including tied IDs,
    # leading zeroes and missing/nonnumeric IDs at the end.
    rows = [(1, 'Alpha', '100'), (2, 'Zulu', '2'), (3, 'Beta', '10'),
            (4, 'Later', '002'), (5, 'No number', None),
            (6, 'Reference', 'REFERENCE'), (7, 'Same name', '10'),
            (8, 'Same name', '10')]
    for id_, name, number in rows:
        student = evidence.student(id_, name, number)
        student.school_student_id = number
        evidence.block(student_id=id_)
    db_session.commit()
    expected = [4, 2, 3, 7, 8, 1, 5, 6]
    combined = []
    for offset in (0, 3, 6):
        page = roster(client, offset=offset, limit=3).json()
        assert page['total'] == 8
        combined.extend(row['student']['id'] for row in page['rows'])
    assert combined == expected
