"""Independent acceptance examples for the non-writing billing calculator.

Calendar closures below are explicit synthetic fixtures. They reproduce the
discussed examples without reading private snapshots or a production calendar.
Run with ``pytest --noconftest tests/test_billing_calculator.py`` to avoid the
application-wide fixtures, since this suite requires no database or application.
"""
from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from billing.calculator import preview_billing
from billing.schemas import BillingPreviewRequest


@pytest.fixture
def closures():
    return {
        date(2026, 10, 23),
        date(2026, 12, 25),
        date(2026, 12, 26),
        date(2027, 1, 1),
        date(2027, 2, 6),
        date(2027, 2, 12),
    }


def request(start, weekdays=('Fri',), **options):
    return BillingPreviewRequest(
        first_lesson_date=date.fromisoformat(start),
        slots=[{'weekday': day, 'time_slot': f'{i + 14}:00'} for i, day in enumerate(weekdays)],
        materials_fee=0,
        **options,
    )


def codes(result):
    return {issue.code for issue in result.issues}


def coupon(**changes):
    return dict(kind='ordinary', value=300, verified=True,
                expires_on=date(2027, 12, 31), available_count=1, **changes)


def period_months(period):
    return {count.month: count.lessons for count in period.counts_by_month}


def test_twice_weekly_first_month_and_later_manual_deadline(closures):
    result = preview_billing(request('2026-11-10', ('Tue', 'Thu')), closures)
    first, second, third = result.periods[:3]
    assert (first.lesson_count, first.gross_tuition, first.coverage_through) == (
        6, 2400, date(2026, 11, 30))
    assert first.counts_by_slot == [3, 3]
    assert first.collection.method == 'manual'
    assert first.collection.due_before_lesson == date(2026, 11, 10)
    assert (second.lesson_count, second.gross_tuition) == (10, 4000)
    assert second.collection.due_before_lesson == date(2026, 12, 1)
    assert second.collection.notice_from == date(2026, 11, 12)
    assert second.collection.notice_to == date(2026, 11, 18)
    assert second.collection.gap_min_days == 21
    assert third.lesson_count == 8


def test_twice_weekly_initial_jump_is_visible_and_not_capped(closures):
    result = preview_billing(request('2026-11-11', ('Tue', 'Wed')), closures)
    first = result.periods[0]
    assert period_months(first) == {'2026-11': 5, '2026-12': 10}
    assert first.lesson_count == 15
    assert first.gross_tuition == 6000
    assert first.coverage_through == date(2026, 12, 31)
    assert result.periods[1].coverage_from == date(2027, 1, 5)


def test_reasoned_admin_exception_recalculates_next_month(closures):
    data = request('2026-11-11', ('Tue', 'Wed'), adjustment={
        'through': '2026-11-30', 'reason': 'Family agrees a shorter first payment.'})
    result = preview_billing(data, closures, allow_adjustment=True)
    first, second = result.periods[:2]
    assert (first.lesson_count, first.gross_tuition) == (5, 2000)
    assert first.adjustment_reason == 'Family agrees a shorter first payment.'
    assert 'FIRST_PAYMENT_BELOW_MINIMUM' in codes(result)
    assert first.requires_review
    assert second.lesson_count == 10
    assert second.gross_tuition == 4000
    assert second.collection.due_before_lesson == date(2026, 12, 1)
    with pytest.raises(PermissionError):
        preview_billing(data, closures)


@pytest.mark.parametrize('reason', ['', '   '])
def test_adjustment_requires_meaningful_reason(reason):
    with pytest.raises(ValidationError):
        request('2026-11-11', ('Tue', 'Wed'), adjustment={
            'through': '2026-11-30', 'reason': reason})


def test_adjustment_cannot_create_an_arbitrary_midmonth_boundary(closures):
    data = request('2026-11-11', ('Tue', 'Wed'), adjustment={
        'through': '2026-11-25', 'reason': 'A proposed exception.'})
    with pytest.raises(ValueError, match='month-end'):
        preview_billing(data, closures, allow_adjustment=True)


def test_short_first_exception_does_not_silently_waive_trial_eligibility(closures):
    data = request('2026-11-11', ('Tue', 'Wed'), trial_deduction=True, adjustment={
        'through': '2026-11-30', 'reason': 'Family agrees a shorter first payment.'})
    result = preview_billing(data, closures, allow_adjustment=True)
    assert result.periods[0].lesson_count == 5
    assert result.periods[0].deductions == []
    assert result.periods[0].total_fee is None
    assert 'SHORT_FIRST_TRIAL_REVIEW' in codes(result)


def test_short_first_exception_still_uses_four_lesson_ordinary_coupon_floor(closures):
    data = request('2026-11-11', ('Tue', 'Wed'), coupon=coupon(), adjustment={
        'through': '2026-11-30', 'reason': 'Family agrees a shorter first payment.'})
    result = preview_billing(data, closures, allow_adjustment=True)
    assert result.periods[0].lesson_count == 5
    assert result.periods[0].tuition_after_deductions == 1700


def test_admin_short_period_does_not_override_coupon_floor_or_boundary(closures):
    data = request('2026-11-13', coupon=coupon(combine_next_month=True), adjustment={
        'through': '2026-11-30', 'reason': 'Three initial lessons are approved.'})
    result = preview_billing(data, closures, allow_adjustment=True)
    assert result.periods[0].lesson_count == 3
    assert result.periods[0].coverage_through == date(2026, 11, 30)
    assert result.periods[0].deductions == []
    assert result.periods[0].tuition_after_deductions == 1200
    assert 'COUPON_SAVED' in codes(result)


def test_once_weekly_manual_pairs_roll_from_individual_first_boundary(closures):
    result = preview_billing(request('2026-11-20'), closures)
    assert period_months(result.periods[0]) == {
        '2026-11': 2, '2026-12': 3, '2027-01': 4}
    assert result.periods[0].lesson_count == 9
    assert [p.coverage_through for p in result.periods] == [
        date(2027, 1, 31), date(2027, 3, 31), date(2027, 5, 31), date(2027, 7, 4)]
    assert list(period_months(result.periods[1])) == ['2027-02', '2027-03']
    assert list(period_months(result.periods[2])) == ['2027-04', '2027-05']


def test_february_newcomer_does_not_extend_to_april_for_global_alignment(closures):
    result = preview_billing(request('2027-02-05'), closures)
    assert result.periods[0].coverage_through == date(2027, 3, 31)
    assert result.periods[0].lesson_count == 7
    assert result.periods[1].coverage_through == date(2027, 5, 31)


def test_first_payment_stays_manual_before_autopay_and_shows_short_gap(closures):
    result = preview_billing(request('2026-11-10', ('Tue', 'Thu'),
                                     payment_method='autopay', mandate_ready=True), closures)
    first, second = result.periods[:2]
    assert first.collection.method == 'manual'
    assert second.collection.debit_from == date(2026, 11, 20)
    assert second.collection.debit_to == date(2026, 11, 22)
    assert (second.collection.gap_min_days, second.collection.gap_max_days) == (10, 12)
    assert 'FIRST_AUTOPAY_TIMING' in codes(result)


@pytest.mark.parametrize('method', ['manual', 'autopay'])
def test_three_december_lessons_preserve_december_boundary(closures, method):
    result = preview_billing(request('2026-12-04', mode='transition',
                                     payment_method=method), closures)
    first = result.periods[0]
    assert first.lesson_count == 3
    assert first.coverage_through == date(2026, 12, 31)
    assert first.gross_tuition == 1200


@pytest.mark.parametrize('method,end,next_end', [
    ('autopay', date(2027, 1, 31), date(2027, 2, 28)),
    ('manual', date(2027, 2, 28), date(2027, 4, 30)),
])
def test_once_weekly_situation_two_has_correct_prepaid_boundary(closures, method, end, next_end):
    result = preview_billing(request('2026-12-19', ('Sat',), mode='transition',
                                     payment_method=method), closures)
    first, second = result.periods[:2]
    assert first.kind == 'situation_two'
    assert first.coverage_through == end
    assert second.coverage_through == next_end
    assert '2026-12' in {skip.month for skip in result.skipped_collections}
    if method == 'autopay':
        assert first.collection.debit_from == date(2026, 11, 20)
        assert second.collection.debit_from == date(2027, 1, 20)
    else:
        assert first.lesson_count == 9
        assert first.gross_tuition == 3600
        assert second.coverage_from == date(2027, 3, 6)


def test_twice_weekly_manual_situation_two_uses_january_boundary_and_flags_classification(closures):
    result = preview_billing(request('2026-12-29', ('Tue', 'Thu'), mode='transition'), closures)
    first, second = result.periods[:2]
    assert first.lesson_count == 10
    assert first.coverage_through == date(2027, 1, 31)
    assert second.coverage_through == date(2027, 2, 28)
    assert 'COMBINED_TRANSITION_REVIEW' in codes(result)
    assert '2026-12' in {skip.month for skip in result.skipped_collections}


@pytest.mark.parametrize('method', ['manual', 'autopay'])
def test_november_remainder_transition_stops_in_december(closures, method):
    result = preview_billing(request('2026-11-20', mode='transition',
                                     payment_method=method), closures)
    assert result.periods[0].kind == 'transition'
    assert result.periods[0].coverage_through == date(2026, 12, 31)
    assert result.periods[0].lesson_count == 5
    if method == 'autopay':
        assert 'COLLECTION_BEFORE_LESSON' in codes(result)


def test_existing_pre_pilot_renewal_is_manual_through_december(closures):
    result = preview_billing(request('2026-11-14', ('Sat',), mode='transition',
                                     payment_method='autopay', mandate_ready=True), closures)
    first, second = result.periods[:2]
    assert first.kind == 'adjusted_manual'
    assert (first.lesson_count, first.coverage_through) == (6, date(2026, 12, 31))
    assert first.collection.method == 'manual'
    assert second.collection.debit_from == date(2026, 12, 20)
    assert '2026-11' in {skip.month for skip in result.skipped_collections}


def test_legacy_october_renewal_is_still_six_lessons(closures):
    result = preview_billing(request('2026-10-24', ('Sat',), mode='transition'), closures)
    assert result.periods[0].kind == 'legacy'
    assert result.periods[0].lesson_count == 6
    assert result.periods[0].last_lesson_date == date(2026, 11, 28)
    assert result.periods[1].coverage_through == date(2026, 12, 31)


def test_legacy_multislot_renewal_keeps_six_lessons_per_teaching_enrolment(closures):
    result = preview_billing(request('2026-10-24', ('Sat', 'Mon'), mode='transition'), closures)
    first = result.periods[0]
    assert first.kind == 'legacy'
    assert first.counts_by_slot == [6, 6]
    assert first.lesson_count == 12
    assert first.gross_tuition == 4800
    assert first.last_lesson_date == date(2026, 11, 30)
    assert 'LEGACY_MULTISLOT_REVIEW' in codes(result)
    assert result.periods[1].coverage_through == date(2026, 12, 31)


def test_legacy_and_adjusted_slots_remain_separate_without_duplicate_or_missing_dates(closures):
    data = request('2026-10-24', ('Sat', 'Mon'), mode='transition')
    data.slots[1].covered_through = date(2026, 10, 31)
    result = preview_billing(data, closures)
    legacy, adjusted = result.periods[:2]
    assert legacy.counts_by_slot == [6, 0]
    assert adjusted.kind == 'adjusted_manual'
    assert adjusted.counts_by_slot == [3, 9]
    assert adjusted.coverage_from == date(2026, 11, 2)
    assert adjusted.coverage_through == date(2026, 12, 31)
    assert adjusted.collection.gap_min_days == 9
    assert 'LEGACY_MULTISLOT_REVIEW' in codes(result)
    # A partial-slot legacy payment cannot claim to cover the student's whole
    # November collection when the second slot still requires payment.
    assert not any(s.month == '2026-10' and s.covered_by_period == legacy.number
                   for s in result.skipped_collections)
    identities = [(e.date, e.slot) for p in result.periods for e in p.lessons]
    assert len(identities) == len(set(identities))
    assert (date(2026, 11, 2), 1) in identities
    assert (date(2026, 10, 26), 1) not in identities


def test_entered_coverage_through_december_does_not_generate_a_november_payment(closures):
    data = request('2026-12-04', mode='transition')
    data.slots[0].covered_through = date(2026, 12, 31)
    result = preview_billing(data, closures)
    assert result.periods[0].coverage_from == date(2027, 1, 8)
    assert 'COVERAGE_ASSUMED' in codes(result)
    assert not any(p.collection.debit_from and p.collection.debit_from.month == 11
                   for p in result.periods)


def test_three_lesson_transition_saves_coupon_for_january_without_extension(closures):
    result = preview_billing(request('2026-12-04', mode='transition', coupon=coupon()), closures)
    first, second = result.periods[:2]
    assert first.coverage_through == date(2026, 12, 31)
    assert first.deductions == []
    assert 'COUPON_SAVED' in codes(result)
    assert [(d.kind, d.amount) for d in second.deductions] == [('ordinary', 300)]
    assert sum(len(p.deductions) for p in result.periods) == 1


def test_saved_coupon_earlier_expiry_needs_review_and_is_not_silently_used(closures):
    selected = coupon()
    selected['expires_on'] = date(2026, 12, 31)
    result = preview_billing(request('2026-12-04', mode='transition', coupon=selected), closures)
    assert {'SAVED_COUPON_EXPIRY', 'COUPON_EXPIRY_REVIEW'} <= codes(result)
    assert all(not p.deductions for p in result.periods)


def test_coupon_expiry_is_compared_to_collection_not_last_covered_lesson(closures):
    selected = coupon()
    selected['expires_on'] = date(2026, 11, 30)
    result = preview_billing(request('2026-12-19', ('Sat',), mode='transition',
                                     payment_method='autopay', coupon=selected), closures)
    assert result.periods[0].coverage_through == date(2027, 1, 31)
    assert result.periods[0].collection.debit_to == date(2026, 11, 22)
    assert result.periods[0].deductions[0].amount == 300


def test_expiry_during_autopay_window_is_provisional_not_automatic_deduction(closures):
    selected = coupon()
    selected['expires_on'] = date(2026, 11, 21)
    result = preview_billing(request('2026-12-01', ('Tue',), mode='regular',
                                     payment_method='autopay', coupon=selected), closures)
    assert result.periods[0].deductions == []
    assert 'COUPON_EXPIRY_REVIEW' in codes(result)


@pytest.mark.parametrize('changes,expected_flag', [
    ({'verified': False}, 'COUPON_UNVERIFIED'),
    ({'expires_on': None}, 'COUPON_UNVERIFIED'),
    ({'available_count': None}, 'COUPON_UNVERIFIED'),
    ({'available_count': 0}, 'COUPON_UNAVAILABLE'),
])
def test_unknown_or_unavailable_coupon_never_reduces_total(closures, changes, expected_flag):
    selected = coupon()
    selected.update(changes)
    result = preview_billing(request('2026-11-10', ('Tue', 'Thu'), coupon=selected), closures)
    assert expected_flag in codes(result)
    assert all(not p.deductions for p in result.periods)


def test_one_coupon_for_combined_twice_weekly_payment(closures):
    result = preview_billing(request('2026-11-10', ('Tue', 'Thu'), coupon=coupon()), closures)
    assert result.periods[0].tuition_after_deductions == 2100
    assert result.periods[0].counts_by_slot == [3, 3]
    assert sum(d.amount for p in result.periods for d in p.deductions) == 300


def test_coupon_can_optionally_combine_regular_short_month(closures):
    selected = coupon(combine_next_month=True)
    result = preview_billing(request('2026-12-04', mode='regular',
                                     payment_method='autopay', coupon=selected), closures)
    assert result.periods[0].coverage_through == date(2027, 1, 31)
    assert result.periods[0].tuition_after_deductions == 2500
    assert {s.month for s in result.skipped_collections} >= {'2026-12'}
    assert result.periods[1].collection.debit_from == date(2027, 1, 20)


def test_staff_transition_six_lessons_qualifies(closures):
    selected = coupon()
    selected.update(kind='staff', value=500)
    result = preview_billing(request('2026-11-14', ('Sat',), mode='transition', coupon=selected), closures)
    assert result.periods[0].lesson_count == 6
    assert result.periods[0].tuition_after_deductions == 1900


@pytest.mark.parametrize('combine_next_month', [False, True])
def test_new_first_bill_during_transition_uses_six_lesson_staff_rule_without_extension(closures, combine_next_month):
    selected = coupon()
    selected.update(kind='staff', value=500, combine_next_month=combine_next_month)
    result = preview_billing(request('2026-11-10', ('Tue', 'Thu'), coupon=selected), closures)
    first, second = result.periods[:2]
    assert first.coverage_through == date(2026, 11, 30)
    assert first.lesson_count == 6
    assert [(d.kind, d.amount) for d in first.deductions] == [('staff', 500)]
    assert first.tuition_after_deductions == 1900
    assert second.coverage_from == date(2026, 12, 1)
    assert second.lesson_count == 10
    assert second.deductions == []


@pytest.mark.parametrize('mode,start', [
    ('regular', '2026-11-10'),
    ('new_student', '2027-01-05'),
])
def test_temporary_staff_first_payment_rule_does_not_apply_to_regular_or_later_new_bills(closures, mode, start):
    selected = coupon()
    selected.update(kind='staff', value=500)
    result = preview_billing(request(start, ('Tue', 'Thu'), mode=mode, coupon=selected), closures)
    assert result.periods[0].lesson_count >= 6
    assert len(period_months(result.periods[0])) == 1
    assert all(not p.deductions for p in result.periods)


def test_short_transition_first_exception_does_not_waive_staff_six_lesson_floor(closures):
    selected = coupon()
    selected.update(kind='staff', value=500)
    data = request('2026-11-27', coupon=selected, adjustment={
        'through': '2026-12-31', 'reason': 'Four initial lessons are approved.'})
    result = preview_billing(data, closures, allow_adjustment=True)
    assert period_months(result.periods[0]) == {'2026-11': 1, '2026-12': 3}
    assert result.periods[0].deductions == []
    assert 'COUPON_SAVED' in codes(result)


def test_staff_voucher_is_not_eligible_for_ordinary_twice_weekly_month(closures):
    selected = coupon()
    selected.update(kind='staff', value=500)
    result = preview_billing(request('2027-01-05', ('Tue', 'Thu'), mode='regular', coupon=selected), closures)
    assert result.periods[0].lesson_count == 8
    assert all(not p.deductions for p in result.periods)


def test_june_july_tail_is_not_two_months_for_staff_voucher(closures):
    selected = coupon()
    selected.update(kind='staff', value=500)
    result = preview_billing(request('2027-06-04', mode='regular',
                                     payment_method='autopay', coupon=selected), closures)
    assert period_months(result.periods[0]) == {'2027-06': 4, '2027-07': 1}
    assert result.periods[0].deductions == []
    assert result.periods[0].coverage_through == date(2027, 7, 4)


def test_trial_deduction_materials_and_unknown_materials_are_explicit(closures):
    data = request('2026-11-10', ('Tue', 'Thu'), trial_deduction=True)
    data.materials_fee = 100
    result = preview_billing(data, closures)
    assert result.periods[0].tuition_after_deductions == 2250
    assert result.periods[0].total_fee == 2350
    assert all(p.materials_fee == 0 and not p.deductions for p in result.periods[1:])
    data.materials_fee = None
    unknown = preview_billing(data, closures)
    assert unknown.periods[0].total_fee is None
    assert 'MATERIALS_UNCONFIRMED' in codes(unknown)


def test_trial_deduction_cannot_stack_with_coupon():
    with pytest.raises(ValidationError, match='cannot be combined'):
        request('2026-11-10', ('Tue', 'Thu'), trial_deduction=True, coupon=coupon())


def test_confirmed_holiday_opening_is_retained_and_shown(closures):
    data = request('2026-10-23', mode='transition')
    data.slots[0].holiday_exceptions = [date(2026, 10, 23)]
    result = preview_billing(data, closures)
    first_lesson = result.periods[0].lessons[0]
    assert first_lesson.date == date(2026, 10, 23)
    assert first_lesson.holiday_exception
    assert 'HOLIDAY_OPENING_ASSUMED' in codes(result)
    assert date(2026, 10, 23) not in result.excluded_holidays
    with pytest.raises(ValueError, match='holiday'):
        preview_billing(request('2026-10-23', mode='transition'), closures)


def test_holiday_opening_for_one_same_day_slot_does_not_open_the_other(closures):
    data = request('2026-10-23', ('Fri', 'Fri'), mode='transition')
    data.slots[0].holiday_exceptions = [date(2026, 10, 23)]
    result = preview_billing(data, closures)
    holiday_lessons = [lesson for period in result.periods for lesson in period.lessons
                       if lesson.date == date(2026, 10, 23)]
    assert len(holiday_lessons) == 1
    assert holiday_lessons[0].slot == 0
    assert holiday_lessons[0].holiday_exception
    assert date(2026, 10, 23) in result.excluded_holidays


def test_new_first_payment_policy_is_not_applied_before_its_effective_date(closures):
    with pytest.raises(ValueError, match='30 October|2026-10-30|transition|scheme'):
        preview_billing(request('2026-10-16'), closures)


def test_late_year_first_payment_stops_at_final_regular_day_and_needs_exception(closures):
    result = preview_billing(request('2027-06-27', ('Sun',)), closures)
    assert len(result.periods) == 1
    assert [e.date for e in result.periods[0].lessons] == [date(2027, 6, 27), date(2027, 7, 4)]
    assert 'FIRST_PAYMENT_BELOW_MINIMUM' in codes(result)
    assert result.regular_end_date == date(2027, 7, 4)
    assert result.makeup_end_date == date(2027, 6, 30)


def test_same_day_distinct_slots_keep_two_lesson_identities(closures):
    result = preview_billing(request('2026-11-10', ('Tue', 'Tue')), closures)
    first = result.periods[0]
    assert first.lesson_count == 6
    assert first.counts_by_slot == [3, 3]
    assert [e.date for e in first.lessons] == [
        date(2026, 11, 10), date(2026, 11, 10), date(2026, 11, 17),
        date(2026, 11, 17), date(2026, 11, 24), date(2026, 11, 24)]
    assert len({(e.date, e.slot) for e in first.lessons}) == 6


def test_staggered_previous_coverage_requires_review_and_excludes_covered_lessons(closures):
    data = request('2026-12-01', ('Tue', 'Thu'), mode='transition')
    data.slots[0].covered_through = date(2026, 12, 22)
    data.slots[1].covered_through = date(2026, 12, 24)
    result = preview_billing(data, closures)
    assert {'STAGGERED_COVERAGE', 'CONTINUING_SLOTS_REVIEW', 'COMBINED_TRANSITION_REVIEW'} <= codes(result)
    assert result.periods[0].lessons[0].date == date(2026, 12, 29)
    assert result.periods[0].requires_review or result.requires_review


@pytest.mark.parametrize('mode,start', [
    ('new_student', '2026-10-30'), ('new_student', '2026-11-11'),
    ('transition', '2026-10-24'), ('transition', '2026-11-20'),
    ('transition', '2026-12-04'), ('regular', '2027-01-05'),
    ('new_student', '2027-06-27'),
])
@pytest.mark.parametrize('method', ['manual', 'autopay'])
def test_all_future_lesson_identities_allocated_exactly_once(closures, mode, start, method):
    first = date.fromisoformat(start)
    weekdays = {0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun'}
    data = request(start, (weekdays[first.weekday()], weekdays[(first.weekday() + 2) % 7]),
                   mode=mode, payment_method=method)
    before = data.model_dump(mode='json')
    result = preview_billing(data, closures)
    # Enumerate individual days independently of the calculator's weekly walk.
    expected = []
    day = first
    while day <= date(2027, 7, 4):
        for slot_id, slot in enumerate(data.slots):
            if weekdays[day.weekday()] == slot.weekday and day not in closures:
                expected.append((day, slot_id))
        day += timedelta(days=1)
    allocated = [(lesson.date, lesson.slot) for period in result.periods for lesson in period.lessons]
    assert sorted(allocated) == expected
    assert len(allocated) == len(set(allocated))
    assert sum(p.gross_tuition for p in result.periods) == 400 * len(expected)
    assert all(sum(c.lessons for c in p.counts_by_month) == p.lesson_count for p in result.periods)
    assert all(sum(p.counts_by_slot) == p.lesson_count for p in result.periods)
    assert data.model_dump(mode='json') == before
    assert result.is_preview and not result.creates_records
