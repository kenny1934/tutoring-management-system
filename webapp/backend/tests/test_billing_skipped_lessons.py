"""Ad hoc omissions use synthetic calendars and isolated SQLite records only."""
from datetime import date, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import event
from sqlalchemy.engine import Engine

from billing import bank_run_models, coupon_models  # Register tables before isolated fixture creation.
from billing.calculator import preview_billing
from billing.schemas import BillingPreviewRequest
from models import Enrollment, SessionLog
from tests.test_billing_drafts import env as draft_env
from tests.test_billing_workflow import env, confirmation, confirmed, next_review, pay_payload


@pytest.fixture(autouse=True)
def reject_external_connections():
    def guard(dialect, *_args):
        assert dialect.name == 'sqlite', 'Skip tests may only use synthetic SQLite.'
    event.listen(Engine, 'do_connect', guard)
    yield
    event.remove(Engine, 'do_connect', guard)


def scenario(start='2026-12-10', *, skip='2026-12-10', method='manual', **changes):
    data = dict(first_lesson_date=start, mode='transition', payment_method=method,
                materials_fee=0, mandate_ready=True,
                slots=[dict(weekday='Thu', time_slot='18:30 - 20:00', location='MSA',
                            skipped_lessons=[dict(date=skip, reason='Christmas party')])])
    data.update(changes)
    return BillingPreviewRequest.model_validate(data)


def test_skip_keeps_calendar_boundary_and_reduces_fee():
    result = preview_billing(scenario(), set(), allow_adjustment=True)
    period = result.periods[0]
    assert [lesson.date for lesson in period.lessons] == [date(2026, 12, day) for day in (17, 24, 31)]
    assert period.lesson_count == 3 and period.total_fee == 1200
    assert period.coverage_through == date(2026, 12, 31)
    assert all(lesson.date != date(2026, 12, 10) for period in result.periods for lesson in period.lessons)


@pytest.mark.parametrize('method,end', [('manual', date(2027, 2, 28)), ('autopay', date(2027, 1, 31))])
def test_two_december_lessons_use_normal_transition_grouping(method, end):
    result = preview_billing(scenario('2026-12-17', skip='2026-12-24', method=method), set(), allow_adjustment=True)
    period = result.periods[0]
    assert period.kind == 'situation_two' and period.coverage_through == end
    assert {row.month: row.lessons for row in period.counts_by_month}['2026-12'] == 2
    assert period.total_fee == period.lesson_count * 400
    assert result.periods[1].coverage_from > end


def test_skip_only_affects_its_own_slot():
    request = scenario()
    other = request.slots[0].model_copy(update={'time_slot': '16:45 - 18:15', 'skipped_lessons': []})
    request.slots.append(other)
    result = preview_billing(request, set(), allow_adjustment=True)
    assert result.periods[0].counts_by_slot == [3, 4]
    assert [(l.slot, l.date) for l in result.periods[0].lessons if l.date == date(2026, 12, 10)] == [(1, date(2026, 12, 10))]


def test_coupon_is_rechecked_after_skipping():
    request = scenario(mode='regular', method='autopay', coupon=dict(
        kind='ordinary', value=300, verified=True, expires_on='2027-06-30', available_count=1))
    result = preview_billing(request, set(), allow_adjustment=True)
    assert result.periods[0].deductions == [] and result.periods[0].total_fee == 1200
    assert result.coupon_options[0].reason == 'min_sessions'


@pytest.mark.parametrize('start,skip,covered,holidays', [
    ('2026-12-10', '2026-12-11', None, set()),
    ('2026-12-10', '2026-12-03', None, set()),
    ('2026-12-10', '2027-07-08', None, set()),
    ('2026-12-10', '2026-12-10', date(2026, 12, 10), set()),
    ('2026-12-10', '2026-12-10', None, {date(2026, 12, 10)}),
    ('2026-10-01', '2026-10-08', None, set()),
])
def test_invalid_skip_dates_are_rejected(start, skip, covered, holidays):
    request = scenario(start, skip=skip)
    request.slots[0].covered_through = covered
    with pytest.raises(ValueError):
        preview_billing(request, holidays, allow_adjustment=True)


def test_skip_requires_admin_and_a_nonblank_reason():
    with pytest.raises(PermissionError):
        preview_billing(scenario(), set())
    with pytest.raises(ValidationError):
        scenario(slots=[dict(weekday='Thu', skipped_lessons=[dict(date='2026-12-10', reason='  ')])])
    request = scenario()
    request.slots[0].skipped_lessons *= 2
    with pytest.raises(ValueError, match='different'):
        preview_billing(request, set(), allow_adjustment=True)


def thursday_source(db, first=date(2026, 10, 29)):
    source = db.get(Enrollment, 11)
    source.first_lesson_date = first
    source.assigned_day = 'Thu'
    for index, lesson in enumerate(db.query(SessionLog).filter_by(enrollment_id=11).order_by(SessionLog.id)):
        lesson.session_date = first + timedelta(weeks=index)
    db.commit()


@pytest.mark.parametrize('paid', [False, True])
def test_confirmation_preserves_skip_and_next_renewal_does_not_resell_it(env, paid):
    client, db, _ = env
    thursday_source(db)
    payload = next_review(client, [11])
    payload['scenario']['slots'][0]['skipped_lessons'] = [dict(date='2026-12-31', reason='Christmas party')]
    draft, confirm_request, payment = confirmed(client, payload=payload)
    period = payment['review']['period']
    assert period['lesson_count'] == 3 and period['total_fee'] == 1200
    assert period['coverage_through'] == '2026-12-31'
    assert '2026/12/31' not in payment['review']['message']['en']
    assert '2026/12/24' in payment['review']['message']['en']
    enrollment_id = payment['lines'][0]['enrollment_id']
    actual = db.query(SessionLog).filter_by(enrollment_id=enrollment_id).all()
    assert len(actual) == 3 and all(lesson.make_up_for_id is None and lesson.session_status == 'Scheduled' for lesson in actual)
    assert db.get(Enrollment, enrollment_id).lessons_paid == 3
    if paid:
        response = client.post(f"/api/billing/payments/{payment['id']}/paid", json=pay_payload(payment))
        assert response.status_code == 200, response.text
    detail = client.get(f"/api/billing/drafts/{draft['id']}").json()
    assert detail['review']['scenario']['slots'][0]['skipped_lessons'] == [dict(date='2026-12-31', reason='Christmas party')]
    context = client.get('/api/billing/students/101/context', params=[
        ('basis', 'paid_only' if paid else 'include_pending'), ('selected_enrollment_ids', enrollment_id)]).json()
    assert context['suggested_request']['first_lesson_date'] == '2027-01-07'
    assert context['slot_candidates'][0]['last_retained_original_date'] == '2026-12-24'
    assert context['suggested_request']['slots'][0]['covered_through'] == '2026-12-31'
    assert not any(issue['code'] in {'PAID_COVERAGE_GAP', 'CONDITIONAL_COVERAGE_GAP'} for issue in context['issues'])
    replay = client.post(f"/api/billing/drafts/{draft['id']}/confirm", json=confirm_request)
    assert replay.status_code == 200 and replay.json()['id'] == payment['id']
    next_payload = next_review(client, [enrollment_id])
    next_draft, next_confirm = confirmation(client, payload=next_payload, key='next-confirm', draft_key='next-draft')
    next_payment = client.post(f"/api/billing/drafts/{next_draft['id']}/confirm", json=next_confirm)
    assert next_payment.status_code == 200, next_payment.text
    assert next_payment.json()['review']['period']['first_lesson_date'] == '2027-01-07'
    assert all(lesson['date'] > '2026-12-31' for lesson in next_payment.json()['review']['period']['lessons'])


def test_interior_skip_is_not_a_missing_lesson_but_tampering_still_is(env):
    client, db, _ = env
    thursday_source(db)
    payload = next_review(client, [11])
    payload['scenario']['slots'][0]['skipped_lessons'] = [dict(date='2026-12-17', reason='Christmas party')]
    _, _, payment = confirmed(client, payload=payload)
    enrollment_id = payment['lines'][0]['enrollment_id']
    context = client.get('/api/billing/students/101/context', params={'basis': 'include_pending'}).json()
    assert not any(issue['code'] == 'CONDITIONAL_COVERAGE_GAP' for issue in context['issues'])
    actual = db.query(SessionLog).filter_by(enrollment_id=enrollment_id, session_date=date(2026, 12, 24)).one()
    actual.session_status = 'Cancelled'
    db.commit()
    context = client.get('/api/billing/students/101/context', params={'basis': 'include_pending'}).json()
    assert any(issue['code'] == 'CONDITIONAL_COVERAGE_GAP' for issue in context['issues'])


def test_future_skip_cannot_be_lost_when_only_current_payment_is_created(env):
    client, db, _ = env
    thursday_source(db)
    payload = next_review(client, [11])
    payload['scenario']['slots'][0]['skipped_lessons'] = [dict(date='2027-03-04', reason='Future party')]
    response = client.post('/api/billing/students/101/draft-review', json=payload)
    assert response.status_code == 422 and 'payment being created' in response.text


def test_new_student_minimum_is_applied_after_skips():
    request = BillingPreviewRequest.model_validate(dict(
        first_lesson_date='2026-11-10', mode='new_student', materials_fee=100,
        slots=[dict(weekday='Tue', time_slot='16:45 - 18:15', location='MSA'),
               dict(weekday='Thu', time_slot='16:45 - 18:15', location='MSA',
                    skipped_lessons=[dict(date='2026-11-12', reason='Private event')])]))
    result = preview_billing(request, set(), allow_adjustment=True)
    assert result.periods[0].coverage_through == date(2026, 12, 31)
    assert {row.month: row.lessons for row in result.periods[0].counts_by_month}['2026-11'] == 5
    assert result.periods[0].total_fee == result.periods[0].lesson_count * 400 + 100


def test_non_admin_cannot_submit_skip_in_preview_or_review(env):
    client, db, user = env
    thursday_source(db)
    payload = next_review(client, [11])
    payload['scenario']['slots'][0]['skipped_lessons'] = [dict(date='2026-12-10', reason='Christmas party')]
    user.role = 'Tutor'
    assert client.post('/api/billing/preview', json=payload['scenario']).status_code == 403
    assert client.post('/api/billing/students/101/draft-review', json=payload).status_code == 403


def test_creation_from_intake_uses_only_retained_dates(env):
    from tests.test_billing_intake import intake_request, save_preference, confirmed as confirm_intake
    client, db, _ = env
    save_preference(client)
    payload = intake_request(client, trial=False)
    payload['scenario'].update(first_lesson_date='2026-12-03', slots=[dict(
        weekday='Thu', time_slot='18:30 - 20:00', location='MSA',
        skipped_lessons=[dict(date='2026-12-10', reason='Christmas party')])])
    _, _, payment = confirm_intake(client, payload)
    period = payment['review']['period']
    assert period['coverage_through'] == '2027-01-31'  # New-student six-lesson minimum still applies.
    assert period['lesson_count'] == 8 and period['total_fee'] == 3300
    enrollment = db.get(Enrollment, payment['lines'][0]['enrollment_id'])
    assert enrollment.lessons_paid == 8
    assert db.query(SessionLog).filter_by(enrollment_id=enrollment.id, session_date=date(2026, 12, 10)).count() == 0
    assert '2026/12/10' not in payment['review']['message']['en']
