"""Returning-intake calendar examples without a database or application server."""
from datetime import date
import pytest
from pydantic import ValidationError
from billing.calculator import DAYS, preview_billing
from billing.schemas import BillingPreviewRequest

CLOSURES = {date(2026, 12, 25), date(2026, 12, 26), date(2027, 1, 1), date(2027, 2, 6)}


def request(start='2027-01-30', *, method='autopay', ready=True, **changes):
    first = date.fromisoformat(start)
    return BillingPreviewRequest(first_lesson_date=first, slots=[{
        'weekday': DAYS[first.weekday()], 'time_slot': '16:00 - 17:30', 'location': 'MSA'}],
        mode='returning_student', payment_method=method, mandate_ready=ready, materials_fee=0, **changes)


@pytest.mark.parametrize('first,as_of,method,end,next_debit', [
    ('2026-12-05', '2026-11-18', 'autopay', '2026-12-31', '2026-12-20'),
    ('2026-12-05', '2026-11-19', 'manual', '2026-12-31', '2026-12-20'),
    ('2026-11-23', '2026-11-23', 'manual', '2026-12-31', '2026-12-20'),
    ('2027-01-02', '2026-12-18', 'autopay', '2027-01-31', '2027-01-20'),
    ('2027-01-02', '2026-12-19', 'manual', '2027-01-31', '2027-01-20'),
    ('2027-01-30', '2027-01-30', 'manual', '2027-02-28', '2027-02-20'),
    ('2027-01-30', '2027-01-17', 'manual', '2027-02-28', '2027-02-20'),
    ('2027-02-10', '2027-02-10', 'manual', '2027-02-28', '2027-02-20'),
    ('2027-02-19', '2027-02-19', 'manual', '2027-03-31', '2027-03-20'),
])
def test_first_collection_uses_a_real_upcoming_run_or_a_calendar_manual_payment(first, as_of, method, end, next_debit):
    result = preview_billing(request(first), CLOSURES, onboarding_as_of=date.fromisoformat(as_of))
    initial, following = result.periods[:2]
    assert initial.collection.method == method
    assert initial.coverage_through == date.fromisoformat(end)
    assert following.collection.method == 'autopay'
    assert following.collection.debit_from == date.fromisoformat(next_debit)
    assert following.collection.debit_to < following.first_lesson_date
    assert 'FIRST_PAYMENT_BELOW_MINIMUM' not in {issue.code for issue in result.issues}
    if method == 'manual':
        assert initial.collection.due_before_lesson == initial.first_lesson_date
        assert initial.collection.notice_from is None and initial.adjustment_reason is None
        assert any(issue.code == 'RETURNING_FIRST_MANUAL' and issue.period == 1 for issue in result.issues)
        assert following.collection.notice_to >= max(date.fromisoformat(as_of), initial.first_lesson_date)
    else:
        assert initial.collection.debit_to < initial.first_lesson_date
        assert initial.collection.notice_to >= date.fromisoformat(as_of)


@pytest.mark.parametrize('first', ['2026-11-20', '2026-11-21', '2026-11-22'])
def test_first_lesson_during_bank_run_is_manual(first):
    result = preview_billing(request(first), CLOSURES, onboarding_as_of=date(2026, 11, 18))
    assert result.periods[0].collection.method == 'manual'
    assert result.periods[0].coverage_through == date(2026, 12, 31)
    assert not any(issue.code == 'COLLECTION_BEFORE_LESSON' and issue.period == 1 for issue in result.issues)


def test_missing_mandate_uses_manual_first_without_changing_saved_autopay_plan():
    result = preview_billing(request('2026-12-05', ready=False), CLOSURES, onboarding_as_of=date(2026, 11, 18))
    assert result.payment_method == 'autopay'
    assert result.periods[0].collection.method == 'manual'
    assert result.periods[1].collection.method == 'autopay'
    assert any(issue.code == 'RETURNING_FIRST_MANUAL' and 'authorisation' in issue.message for issue in result.issues)


def test_returning_manual_payment_has_no_six_session_floor_and_can_keep_trial_credit():
    data = request(method='manual', trial_deduction=True)
    result = preview_billing(data, CLOSURES, onboarding_as_of=date(2027, 1, 20))
    first = result.periods[0]
    assert first.lesson_count == 4 and first.coverage_through == date(2027, 2, 28)
    assert [(item.kind, item.amount) for item in first.deductions] == [('trial', 150)]
    assert first.total_fee == 1450
    genuinely_new = preview_billing(data.model_copy(update={'mode': 'new_student'}), CLOSURES)
    assert genuinely_new.periods[0].lesson_count >= 6
    assert genuinely_new.periods[0].coverage_through == date(2027, 3, 31)


@pytest.mark.parametrize('method,end', [('manual', date(2027, 2, 28)), ('autopay', date(2027, 1, 31))])
def test_december_situation_two_keeps_existing_grouping(method, end):
    result = preview_billing(request('2026-12-19', method=method), CLOSURES, onboarding_as_of=date(2026, 11, 18))
    assert result.periods[0].kind == 'situation_two' and result.periods[0].coverage_through == end


def test_late_manual_entry_does_not_schedule_a_past_first_bank_run():
    result = preview_billing(request('2026-11-10'), CLOSURES, onboarding_as_of=date(2026, 11, 23))
    assert result.periods[0].collection.method == 'manual'
    assert result.periods[0].first_lesson_date == date(2026, 11, 10)
    assert all(period.collection.debit_from is None or period.collection.debit_from >= date(2026, 11, 23)
               for period in result.periods)


def test_late_january_return_does_not_claim_a_missed_january_run_was_skipped():
    result = preview_billing(request(), CLOSURES, onboarding_as_of=date(2027, 1, 30))
    assert all(item.month != '2027-01' for item in result.skipped_collections)


def test_server_date_is_required_and_cannot_be_supplied_by_the_caller():
    with pytest.raises(ValueError, match='server onboarding date'):
        preview_billing(request(), CLOSURES)
    raw = request().model_dump(mode='json'); raw['onboarding_as_of'] = '2026-01-01'
    with pytest.raises(ValidationError):
        BillingPreviewRequest.model_validate(raw)


def test_returning_trial_credit_still_excludes_coupon_use():
    with pytest.raises(ValidationError, match='cannot be combined'):
        request(trial_deduction=True, coupon={'kind': 'ordinary', 'value': 300, 'verified': True,
            'available_count': 1, 'expires_on': '2027-06-30'})


def test_returning_intake_before_the_cutover_uses_the_existing_manual_route():
    with pytest.raises(ValueError, match='old six-session renewal'):
        preview_billing(request('2026-10-24'), CLOSURES, onboarding_as_of=date(2026, 10, 20))
