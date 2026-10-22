"""Synthetic source-evidence acceptance tests, with no database or app import.

Run with ``pytest --noconftest tests/test_billing_context.py``. These fixtures
represent recorded lessons and intentionally include damaged legacy evidence.
"""
from dataclasses import replace
from datetime import date, datetime, timedelta

import pytest

from billing.calculator import BillingPolicy, preview_billing
from billing.context import EvidenceBlock, EvidenceLesson, build_student_context
from billing.schemas import BillingStudent, ImportedCouponSnapshot


STUDENT = BillingStudent(id=101, student_name='Synthetic student', home_location='TEST', grade='F2')
AS_OF = date(2026, 10, 17)


def block(id=1, first='2026-10-01', day='Thursday', **changes):
    fields = dict(id=id, student_id=101, tutor_id=1,
                  first_lesson_date=date.fromisoformat(first), assigned_day=day,
                  assigned_time='16:00 - 17:30', location='TEST', lessons_paid=6,
                  payment_status='Paid', tutor_name='Synthetic tutor')
    fields.update(changes)
    return EvidenceBlock(**fields)


def roots(source, count=6, *, start_id=None, statuses=None):
    return [EvidenceLesson(
        id=(start_id or source.id * 100) + i, enrollment_id=source.id,
        student_id=source.student_id, session_date=source.first_lesson_date + timedelta(weeks=i),
        session_status=statuses[i] if statuses else 'Scheduled', time_slot=source.assigned_time,
        location=source.location,
    ) for i in range(count)]


def context(blocks, lessons, **options):
    return build_student_context(STUDENT, blocks, lessons, set(), as_of=AS_OF, **options)


def codes(result):
    return {issue.code for issue in result.issues}


def candidate(result, enrollment_id):
    return next(c for c in result.slot_candidates if c.enrollment_id == enrollment_id)


def test_recorded_originals_define_coverage_while_later_makeups_do_not():
    source = block()
    original = roots(source, statuses=[
        'Attended', 'No Show', 'Sick Leave - Make-up Booked', 'Scheduled',
        'Weather Cancelled - Pending Make-up', 'Scheduled'])
    makeup = EvidenceLesson(id=900, enrollment_id=1, student_id=101,
                            session_date=date(2027, 3, 10), session_status='Make-up Class',
                            make_up_for_id=original[2].id)
    later = replace(makeup, id=901, session_date=date(2027, 4, 10),
                    session_status='Attended (Make-up)', make_up_for_id=900)
    result = context([source], [*original, makeup, later])
    selected = candidate(result, 1)
    assert selected.last_paid_original_date == date(2026, 11, 5)
    assert selected.first_uncovered_date == date(2026, 11, 12)
    assert len(result.source_blocks[0].originals) == 6
    assert result.source_blocks[0].makeup_dates == [date(2027, 3, 10), date(2027, 4, 10)]
    assert 'ORIGINAL_COUNT_REVIEW' not in codes(result)
    assert result.pending_makeup_count == 1


def test_missing_originals_are_not_rebuilt_from_lessons_paid():
    result = context([block()], [])
    assert {'MISSING_ORIGINALS', 'ORIGINAL_COUNT_REVIEW'} <= codes(result)
    assert result.suggested_request is None
    assert candidate(result, 1).last_paid_original_date is None


def test_cancelled_original_does_not_prove_coverage_or_hide_count_mismatch():
    source = block()
    recorded = roots(source)
    recorded[-1] = replace(recorded[-1], session_status='Cancelled')
    result = context([source], recorded)
    assert len(result.source_blocks[0].originals) == 5
    assert candidate(result, 1).last_paid_original_date == date(2026, 10, 29)
    assert 'ORIGINAL_COUNT_REVIEW' in codes(result)


def test_cancelled_enrolment_retains_history_but_has_no_active_coverage_or_makeups():
    source = block(payment_status='Cancelled')
    recorded = roots(source)
    recorded[0] = replace(recorded[0], session_status='Sick Leave - Pending Make-up')
    result = context([source], recorded)
    assert len(result.source_blocks) == 1
    assert result.source_blocks[0].payment_status == 'Cancelled'
    assert result.slot_candidates == []
    assert result.suggested_request is None
    assert result.pending_makeup_count == 0
    assert result.upcoming_original_count == 0


def test_waived_coverage_is_settled_without_assuming_future_free_lessons():
    source = block(payment_status='Waived')
    result = context([source], roots(source))
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 5)
    assert result.suggested_request is not None
    assert result.suggested_request.coupon is None
    assert not result.suggested_request.trial_deduction


@pytest.mark.parametrize('basis,retained,next_date', [
    ('paid_only', date(2026, 11, 5), date(2026, 11, 12)),
    ('include_pending', date(2026, 12, 17), date(2026, 12, 24)),
])
def test_pending_successor_is_conditional_and_marked_sent_is_not_paid(basis, retained, next_date):
    paid = block()
    pending = block(2, first='2026-11-12', payment_status='Pending Payment',
                    payment_date=date(2026, 10, 15), fee_message_sent=True,
                    renewed_from_enrollment_id=1)
    result = context([paid, pending], [*roots(paid), *roots(pending)], basis=basis)
    selected = candidate(result, 2)
    assert selected.last_paid_original_date == date(2026, 11, 5)
    assert selected.last_retained_original_date == retained
    assert selected.first_uncovered_date == next_date
    assert result.pending_bill_count == result.sent_pending_bill_count == 1
    assert {'PENDING_BILLS', 'SENT_BILL_REVIEW'} <= codes(result)
    assert ('PENDING_COVERAGE_ASSUMED' in codes(result)) == (basis == 'include_pending')
    pending_evidence = next(s for s in result.source_blocks if s.enrollment_id == 2)
    assert pending_evidence.fee_message_marked_sent
    assert pending_evidence.payment_status == 'Pending Payment'
    assert len(result.source_blocks) == 2


def test_unfamiliar_status_never_becomes_paid_or_retained_coverage():
    source = block(payment_status='Bank submitted')
    result = context([source], roots(source), basis='include_pending')
    assert 'PAYMENT_STATUS_REVIEW' in codes(result)
    assert candidate(result, 1).last_paid_original_date is None
    assert candidate(result, 1).last_retained_original_date is None


def test_tutor_change_same_weekly_slot_is_not_twice_weekly():
    before = block()
    after = block(2, first='2026-11-12', day='Thu', tutor_id=2,
                  tutor_name='Replacement tutor', renewed_from_enrollment_id=1)
    result = context([before, after], [*roots(before), *roots(after)])
    assert len(result.slot_candidates) == 1
    assert result.selected_enrollment_ids == [2]
    assert candidate(result, 2).last_paid_original_date == date(2026, 12, 17)


def test_direct_schedule_successor_is_not_inferred_as_twice_weekly():
    old = block()
    new = block(2, first='2026-10-07', day='Wed', renewed_from_enrollment_id=1)
    result = context([old, new], [*roots(old), *roots(new)])
    assert result.selected_enrollment_ids == [2]
    assert 'TIMETABLE_CHANGE_REVIEW' in codes(result)


def test_transitive_schedule_successor_excludes_grandparent_slot():
    oldest = block()
    middle = block(2, first='2026-10-07', day='Wed', renewed_from_enrollment_id=1)
    latest = block(3, first='2026-10-13', day='Tue', renewed_from_enrollment_id=2)
    result = context([oldest, middle, latest], [*roots(oldest), *roots(middle), *roots(latest)])
    assert result.selected_enrollment_ids == [3]
    assert len(result.slot_candidates) == 3
    assert 'TIMETABLE_CHANGE_REVIEW' in codes(result)


def test_explicit_successor_and_predecessor_selection_warns_against_combining_them():
    old = block()
    new = block(2, first='2026-10-07', day='Wed', renewed_from_enrollment_id=1)
    result = context([old, new], [*roots(old), *roots(new)], selected_enrollment_ids=[1, 2])
    assert 'SUCCESSOR_SLOTS_SELECTED' in codes(result)
    assert result.requires_review


def test_selected_unpaid_changed_schedule_does_not_erase_the_old_paid_context():
    old = block()
    new = block(2, first='2026-11-11', day='Wed', payment_status='Pending Payment',
                renewed_from_enrollment_id=1)
    result = context([old, new], [*roots(old), *roots(new)])
    assert result.selected_enrollment_ids == [2]
    assert candidate(result, 2).last_paid_original_date is None
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 5)
    assert 'TIMETABLE_CHANGE_REVIEW' in codes(result)
    assert len(result.source_blocks) == 2


def test_overlapping_unlinked_weekly_slots_are_candidates_requiring_confirmation():
    thu = block()
    tue = block(2, first='2026-10-06', day='Tuesday')
    result = context([thu, tue], [*roots(thu), *roots(tue)])
    assert set(result.selected_enrollment_ids) == {1, 2}
    assert 'CONTINUING_SLOTS_REVIEW' in codes(result)
    assert result.requires_review
    assert len(result.suggested_request.slots) == 2


def test_more_than_two_candidates_are_not_silently_dropped_into_a_bill():
    sources = [block(), block(2, first='2026-10-06', day='Tue'),
               block(3, first='2026-10-07', day='Wed')]
    result = context(sources, [s for b in sources for s in roots(b)])
    assert len(result.selected_enrollment_ids) == 3
    assert 'TOO_MANY_SLOT_CANDIDATES' in codes(result)
    assert result.suggested_request is None


def test_explicit_slot_selection_is_unsaved_and_can_resolve_three_candidates():
    sources = [block(), block(2, first='2026-10-06', day='Tue'),
               block(3, first='2026-10-07', day='Wed')]
    result = context(sources, [s for b in sources for s in roots(b)], selected_enrollment_ids=[2])
    assert result.selected_enrollment_ids == [2]
    assert 'SCHEDULE_SELECTION_SCENARIO' in codes(result)
    assert len(result.suggested_request.slots) == 1
    assert len(result.source_blocks) == len(result.slot_candidates) == 3


@pytest.mark.parametrize('selection', [[], [1, 1], [1, 2, 3], [999]])
def test_invalid_explicit_selection_is_rejected(selection):
    source = block()
    with pytest.raises(ValueError):
        context([source], roots(source), selected_enrollment_ids=selection)


def test_cancelled_enrolment_cannot_be_selected():
    source = block(payment_status='Cancelled')
    with pytest.raises(ValueError):
        context([source], roots(source), selected_enrollment_ids=[1])


def test_missing_makeup_parent_is_reviewed_without_extending_paid_dates():
    source = block()
    makeup = EvidenceLesson(id=900, enrollment_id=1, student_id=101,
                            session_date=date(2027, 3, 10), session_status='Make-up Class',
                            make_up_for_id=999)
    result = context([source], [*roots(source), makeup])
    assert 'MAKEUP_CHAIN_REVIEW' in codes(result)
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 5)


def test_cyclic_makeup_chain_terminates_with_a_review_flag():
    source = block()
    a = EvidenceLesson(id=900, enrollment_id=1, student_id=101,
                       session_date=date(2027, 3, 10), session_status='Rescheduled - Pending Make-up',
                       make_up_for_id=901)
    b = replace(a, id=901, session_date=date(2027, 4, 10), make_up_for_id=900)
    result = context([source], [*roots(source), a, b])
    assert 'MAKEUP_CHAIN_REVIEW' in codes(result)
    assert result.pending_makeup_count == 0


def test_makeup_of_cancelled_original_requires_review():
    source = block()
    original = roots(source)
    original[0] = replace(original[0], session_status='Cancelled')
    makeup = replace(original[0], id=900, session_date=date(2027, 3, 10),
                     session_status='Make-up Class', make_up_for_id=original[0].id)
    result = context([source], [*original, makeup])
    assert 'MAKEUP_CHAIN_REVIEW' in codes(result)


def test_cancelled_root_does_not_become_an_owed_makeup_via_pending_descendant():
    source = block()
    original = roots(source)
    original[0] = replace(original[0], session_status='Cancelled')
    descendant = replace(original[0], id=900, session_date=date(2027, 3, 10),
                         session_status='Sick Leave - Pending Make-up', make_up_for_id=original[0].id)
    result = context([source], [*original, descendant])
    assert 'MAKEUP_CHAIN_REVIEW' in codes(result)
    assert result.pending_makeup_count == 0


def test_repeated_pending_makeup_descendants_count_one_root_entitlement():
    source = block()
    original = roots(source)
    original[0] = replace(original[0], session_status='Rescheduled - Pending Make-up')
    descendant = replace(original[0], id=900, session_date=date(2027, 1, 10),
                         make_up_for_id=original[0].id)
    result = context([source], [*original, descendant])
    assert result.pending_makeup_count == 1


def test_paid_gap_is_not_hidden_by_a_later_paid_block():
    before = block()
    after = block(2, first='2026-11-19')
    result = context([before, after], [*roots(before), *roots(after)])
    assert 'PAID_COVERAGE_GAP' in codes(result)
    assert candidate(result, 2).last_paid_original_date == date(2026, 12, 24)
    assert result.requires_review


def test_conditional_pending_coverage_does_not_hide_an_unregistered_week():
    paid = block()
    pending = block(2, first='2026-11-19', payment_status='Pending Payment',
                    renewed_from_enrollment_id=1)
    result = context([paid, pending], [*roots(paid), *roots(pending)], basis='include_pending')
    assert candidate(result, 2).last_paid_original_date == date(2026, 11, 5)
    assert candidate(result, 2).last_retained_original_date == date(2026, 12, 24)
    assert 'CONDITIONAL_COVERAGE_GAP' in codes(result)
    assert result.requires_review


def gap_details(result, code='PAID_COVERAGE_GAP'):
    return next(issue.gap_evidence for issue in result.issues if issue.code == code)


def test_gap_details_identify_each_date_between_complete_enrollments():
    before = block()
    after = block(2, first='2026-11-26', renewed_from_enrollment_id=1)
    result = context([before, after], [*roots(before), *roots(after)])
    details = gap_details(result)
    assert [gap.date for gap in details] == [date(2026, 11, 12), date(2026, 11, 19)]
    assert all(gap.kind == 'between_enrollments' and gap.selected for gap in details)
    assert all(gap.enrollment_id == 2 and gap.weekday == 'Thu' for gap in details)
    first = details[0]
    assert (first.time_slot, first.location) == ('16:00 - 17:30', 'TEST')
    assert (first.before.session_id, first.before.enrollment_id, first.before.date) == (
        105, 1, date(2026, 11, 5))
    assert (first.after.session_id, first.after.enrollment_id, first.after.date) == (
        200, 2, date(2026, 11, 26))
    assert first.before.payment_status == first.after.payment_status == 'Paid'
    assert not first.matching_lessons and not first.nearby_lessons
    assert result.requires_review
    assert candidate(result, 2).last_paid_original_date == date(2026, 12, 31)


def test_gap_details_distinguish_missing_original_inside_enrollment():
    source = block()
    recorded = roots(source)
    result = context([source], [r for r in recorded if r.id != 102])
    detail, = gap_details(result)
    assert detail.date == date(2026, 10, 15)
    assert detail.kind == 'within_enrollment'
    assert detail.before.session_id == 101 and detail.after.session_id == 103
    assert not detail.matching_lessons and not detail.nearby_lessons
    assert {'PAID_COVERAGE_GAP', 'ORIGINAL_COUNT_REVIEW'} <= codes(result)


def test_mid_enrollment_day_change_has_exact_dates_and_old_weekday_evidence():
    source = block(day='Wed')
    recorded = [replace(r, session_status='Attended') if i < 3
                else replace(r, session_date=r.session_date - timedelta(days=1))
                for i, r in enumerate(roots(source))]
    result = context([source], recorded)
    details = gap_details(result)
    assert [gap.date for gap in details] == [date(2026, 10, 7), date(2026, 10, 14)]
    assert all(gap.kind == 'timetable_difference' for gap in details)
    assert [r.date for r in details[1].nearby_lessons] == [date(2026, 10, 8), date(2026, 10, 15)]
    assert details[1].nearby_lessons[-1].status == 'Attended'
    assert len(result.source_blocks[0].originals) == 6
    assert 'ORIGINAL_COUNT_REVIEW' not in codes(result)
    assert {'OFF_SLOT_ORIGINALS', 'PAID_COVERAGE_GAP'} <= codes(result)
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 4)
    assert candidate(result, 1).first_uncovered_date == date(2026, 11, 11)


@pytest.mark.parametrize('shift_days', [-1, 1, 4])
def test_moved_original_is_nearby_evidence_without_assuming_a_replacement(shift_days):
    source = block()
    recorded = roots(source)
    recorded[2] = replace(recorded[2], session_date=recorded[2].session_date + timedelta(days=shift_days),
                          time_slot='10:00 - 11:30', location='OTHER')
    result = context([source], recorded)
    detail, = gap_details(result)
    assert detail.date == date(2026, 10, 15) and detail.kind == 'timetable_difference'
    moved, = detail.nearby_lessons
    assert moved.session_id == 102 and moved.enrollment_id == 1
    assert moved.date == date(2026, 10, 15) + timedelta(days=shift_days)
    assert moved.time_slot == '10:00 - 11:30' and moved.location == 'OTHER'
    assert not detail.matching_lessons
    assert 'PAID_COVERAGE_GAP' in codes(result) and result.requires_review
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 5)


@pytest.mark.parametrize('basis', ['paid_only', 'include_pending'])
def test_recorded_unpaid_dates_are_identified_without_becoming_paid_coverage(basis):
    before = block(first='2026-09-03', lessons_paid=2)
    pending = block(2, first='2026-09-17', lessons_paid=2, payment_status='Pending Payment')
    after = block(3, first='2026-10-01', lessons_paid=2)
    result = context([before, pending, after],
                     [*roots(before, 2), *roots(pending, 2), *roots(after, 2)], basis=basis)
    details = gap_details(result)
    assert [gap.date for gap in details] == [date(2026, 9, 17), date(2026, 9, 24)]
    assert all(gap.kind == 'recorded_unpaid' for gap in details)
    assert [gap.matching_lessons[0].session_id for gap in details] == [200, 201]
    assert all(gap.matching_lessons[0].payment_status == 'Pending Payment' for gap in details)
    assert all(gap.before.enrollment_id == 1 and gap.after.enrollment_id == 3 for gap in details)
    assert 'PENDING_BILLS' in codes(result) and 'PAID_COVERAGE_GAP' in codes(result)
    assert 'CONDITIONAL_COVERAGE_GAP' not in codes(result)
    assert result.pending_bill_count == 1


@pytest.mark.parametrize('replacement', [False, True])
def test_cancelled_original_is_visible_gap_evidence_and_never_coverage(replacement):
    source = block()
    recorded = roots(source)
    recorded[2] = replace(recorded[2], session_status='Cancelled')
    if replacement:
        recorded.append(replace(recorded[-1], id=999, session_date=date(2026, 11, 12)))
    result = context([source], recorded)
    detail, = gap_details(result)
    assert detail.kind == 'recorded_cancelled' and detail.date == date(2026, 10, 15)
    cancelled, = detail.matching_lessons
    assert cancelled.session_id == 102 and cancelled.status == 'Cancelled'
    assert cancelled.payment_status == 'Paid'
    assert not any(r.id == 102 for r in result.source_blocks[0].originals)
    assert ('ORIGINAL_COUNT_REVIEW' in codes(result)) == (not replacement)
    assert 'PAID_COVERAGE_GAP' in codes(result)


def test_cancelled_enrollment_can_explain_gap_but_never_fills_it():
    before = block(first='2026-09-03', lessons_paid=2)
    cancelled = block(2, first='2026-09-17', lessons_paid=2, payment_status='Cancelled')
    after = block(3, first='2026-10-01', lessons_paid=2)
    cancelled_rows = [replace(r, session_status='Cancelled') for r in roots(cancelled, 2)]
    result = context([before, cancelled, after], [*roots(before, 2), *cancelled_rows, *roots(after, 2)])
    details = gap_details(result)
    assert len(details) == 2 and all(gap.kind == 'recorded_cancelled' for gap in details)
    assert all(gap.matching_lessons[0].enrollment_id == 2 for gap in details)
    assert all(gap.matching_lessons[0].payment_status == 'Cancelled' for gap in details)
    assert result.pending_bill_count == 0 and 'PAID_COVERAGE_GAP' in codes(result)


def test_old_unselected_timetable_is_identified_without_removing_its_guard():
    current = block()
    old = block(2, first='2026-09-05', day='Sat', lessons_paid=5)
    old_rows = [replace(r, session_status='Attended') for r in roots(old) if r.id != 202]
    result = context([current, old], [*roots(current), *old_rows])
    assert result.selected_enrollment_ids == [1]
    detail, = gap_details(result)
    assert detail.date == date(2026, 9, 19) and not detail.selected
    assert detail.weekday == 'Sat' and detail.enrollment_id == 2
    assert detail.before.enrollment_id == detail.after.enrollment_id == 2
    assert result.requires_review and 'PAID_COVERAGE_GAP' in codes(result)


def test_every_gap_and_slot_survives_issue_deduplication_and_input_reordering():
    first = block()
    second = block(2, first='2026-10-03', day='Sat')
    recorded = [r for r in [*roots(first), *roots(second)] if r.id not in {102, 104, 202, 204}]
    result = context([first, second], recorded)
    details = gap_details(result)
    assert len([i for i in result.issues if i.code == 'PAID_COVERAGE_GAP']) == 1
    assert {(gap.date, gap.weekday, gap.enrollment_id) for gap in details} == {
        (date(2026, 10, 15), 'Thu', 1), (date(2026, 10, 29), 'Thu', 1),
        (date(2026, 10, 17), 'Sat', 2), (date(2026, 10, 31), 'Sat', 2),
    }
    assert all(gap.selected for gap in details)
    reordered = context([second, first], list(reversed(recorded)))
    assert gap_details(reordered) == details


def test_conditional_gap_keeps_exact_paid_and_pending_boundary_records():
    paid = block()
    pending = block(2, first='2026-11-19', payment_status='Pending Payment')
    result = context([paid, pending], [*roots(paid), *roots(pending)], basis='include_pending')
    detail, = gap_details(result, 'CONDITIONAL_COVERAGE_GAP')
    assert detail.date == date(2026, 11, 12) and detail.kind == 'between_enrollments'
    assert detail.before.payment_status == 'Paid' and detail.after.payment_status == 'Pending Payment'
    assert detail.before.enrollment_id == 1 and detail.after.enrollment_id == 2
    assert candidate(result, 2).last_paid_original_date == date(2026, 11, 5)
    assert candidate(result, 2).last_retained_original_date == date(2026, 12, 24)


def test_makeups_are_not_gap_evidence_or_a_replacement_for_missing_originals():
    source = block()
    recorded = roots(source)
    missing = recorded.pop(2)
    makeup = replace(missing, id=900, session_date=date(2026, 10, 16),
                     session_status='Make-up Class', make_up_for_id=recorded[1].id)
    result = context([source], [*recorded, makeup])
    detail, = gap_details(result)
    assert detail.kind == 'within_enrollment' and not detail.nearby_lessons
    assert not detail.matching_lessons
    assert 'PAID_COVERAGE_GAP' in codes(result)
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 5)


def test_gap_evidence_omits_holidays_and_dates_before_loaded_calendar():
    source = block(first='2026-08-20')
    recorded = [replace(r, session_date=r.session_date + timedelta(weeks=1)) if i else r
                for i, r in enumerate(roots(source))]
    recorded = [r for r in recorded if r.session_date not in {date(2026, 9, 10), date(2026, 9, 17)}]
    result = build_student_context(STUDENT, [source], recorded, {date(2026, 9, 10)}, as_of=AS_OF)
    details = gap_details(result)
    assert [gap.date for gap in details] == [date(2026, 9, 17)]


def test_recorded_pending_holiday_opening_is_still_identified_as_unpaid():
    before = block(first='2026-10-01', lessons_paid=2)
    pending = block(2, first='2026-10-15', lessons_paid=1, payment_status='Pending Payment')
    after = block(3, first='2026-10-22', lessons_paid=2)
    result = build_student_context(STUDENT, [before, pending, after],
                                   [*roots(before, 2), *roots(pending, 1), *roots(after, 2)],
                                   {date(2026, 10, 15)}, as_of=AS_OF)
    detail, = gap_details(result)
    assert detail.date == date(2026, 10, 15) and detail.kind == 'recorded_unpaid'
    assert detail.matching_lessons[0].enrollment_id == 2


def test_gap_evidence_changes_when_recorded_lesson_changes():
    source = block()
    recorded = roots(source)
    recorded[2] = replace(recorded[2], session_date=date(2026, 10, 16))
    before = context([source], recorded)
    recorded[2] = replace(recorded[2], session_date=date(2026, 10, 17))
    after = context([source], recorded)
    assert before.source_fingerprint != after.source_fingerprint
    assert gap_details(before)[0].nearby_lessons != gap_details(after)[0].nearby_lessons


def test_recorded_holiday_opening_is_kept_as_original_coverage():
    source = block(first='2026-10-02', day='Fri')
    result = build_student_context(STUDENT, [source], roots(source), {date(2026, 10, 23)}, as_of=AS_OF)
    recorded = next(r for r in result.source_blocks[0].originals if r.date == date(2026, 10, 23))
    assert recorded.holiday
    assert len(result.source_blocks[0].originals) == 6
    assert candidate(result, 1).last_paid_original_date == date(2026, 11, 6)
    assert 'PAID_COVERAGE_GAP' not in codes(result)


def test_holiday_in_pending_source_is_retained_only_as_conditional_opening():
    source = block(first='2026-10-02', day='Fri', payment_status='Pending Payment')
    result = build_student_context(STUDENT, [source], roots(source), {date(2026, 10, 23)},
                                   as_of=AS_OF, basis='paid_only')
    assert candidate(result, 1).last_paid_original_date is None
    assert result.suggested_request.first_lesson_date == date(2026, 10, 2)
    assert result.suggested_request.slots[0].holiday_exceptions == [date(2026, 10, 23)]
    assert 'PENDING_BILLS' in codes(result)


def test_unpaid_new_first_bill_is_distinct_from_an_existing_student_renewal():
    source = block(first='2026-11-10', day='Tue', payment_status='Pending Payment',
                   is_new_student=True)
    result = context([source], roots(source))
    assert result.suggested_request.mode == 'new_student'
    assert result.suggested_request.first_lesson_date == date(2026, 11, 10)
    assert result.suggested_request.materials_fee is None
    assert not result.suggested_request.trial_deduction
    assert result.suggested_request.slots[0].covered_through is None
    assert 'FIRST_PAYMENT_REVIEW' in codes(result)
    conditional = context([source], roots(source), basis='include_pending')
    assert conditional.suggested_request.mode != 'new_student'


def test_historical_paid_block_prevents_automatic_new_student_classification():
    old = block()
    pending = block(2, first='2026-11-12', payment_status='Pending Payment',
                    is_new_student=True, renewed_from_enrollment_id=1)
    result = context([old, pending], [*roots(old), *roots(pending)])
    assert result.suggested_request.mode == 'transition'
    assert 'FIRST_PAYMENT_REVIEW' not in codes(result)


def test_staff_flag_and_imported_coupon_are_not_automatic_benefits():
    source = block()
    imported = ImportedCouponSnapshot(remaining_count=6, cached_value='500.00',
                                      synced_at_utc=datetime(2026, 10, 15, 23, 0))
    student = STUDENT.model_copy(update={'is_staff_referral': True})
    result = build_student_context(student, [source], roots(source), set(), as_of=AS_OF,
                                   coupon_snapshot=imported)
    assert result.coupon_snapshot.remaining_count == 6
    assert not result.coupon_snapshot.verified
    assert result.suggested_request.coupon is None
    assert not result.suggested_request.trial_deduction
    assert result.recorded_payment_method is None
    assert result.mandate_ready is None


def test_fingerprint_is_order_independent_and_tracks_source_changes():
    first = block()
    second = block(2, first='2026-11-12', renewed_from_enrollment_id=1)
    lessons = [*roots(first), *roots(second)]
    before = context([first, second], lessons)
    reordered = context([second, first], list(reversed(lessons)))
    assert before.source_fingerprint == reordered.source_fingerprint
    changed = context([first, replace(second, fee_message_sent=True)], lessons)
    assert before.source_fingerprint != changed.source_fingerprint
    assert second.fee_message_sent is False
    assert len(lessons) == 12


def test_fingerprint_changes_with_as_of_basis_holidays_and_policy():
    source = block()
    lessons = roots(source)
    baseline = context([source], lessons)
    changed_day = build_student_context(STUDENT, [source], lessons, set(), as_of=date(2026, 10, 18))
    changed_basis = context([source], lessons, basis='include_pending')
    changed_calendar = build_student_context(STUDENT, [source], lessons, {date(2026, 12, 25)}, as_of=AS_OF)
    changed_policy = context([source], lessons, policy=replace(BillingPolicy(), version='another-policy'))
    fingerprints = {r.source_fingerprint for r in [baseline, changed_day, changed_basis,
                                                  changed_calendar, changed_policy]}
    assert len(fingerprints) == 5


def test_pre_september_block_with_current_year_roots_remains_coverage():
    source = block(first='2026-08-27', day='Thu')
    result = context([source], roots(source))
    assert candidate(result, 1).last_paid_original_date == date(2026, 10, 1)
    assert candidate(result, 1).first_uncovered_date == date(2026, 10, 8)
    assert 'UNPAID_PAST_DATES' in codes(result)


def test_pre_year_gap_does_not_assume_an_unloaded_holiday_calendar():
    source = block(first='2026-08-20')
    original = roots(source)
    # The pre-year closure is intentionally outside the supplied calendar.
    original = [original[0], *[replace(r, session_date=r.session_date + timedelta(days=7))
                                for r in original[1:]]]
    result = context([source], original)
    assert candidate(result, 1).last_paid_original_date == date(2026, 10, 1)
    assert 'PAID_COVERAGE_GAP' not in codes(result)


def test_overlapping_original_slot_records_need_review():
    first = block()
    second = block(2, first='2026-10-08')
    result = context([first, second], [*roots(first), *roots(second)])
    assert 'OVERLAPPING_ORIGINALS' in codes(result)


def test_evidence_for_another_student_is_rejected():
    source = block(student_id=102)
    with pytest.raises(ValueError, match='this student'):
        context([source], roots(source))


def test_incomplete_weekday_and_off_weekday_roots_are_visible_review_issues():
    source = block(assigned_day=None)
    result = context([source], roots(source))
    assert 'INCOMPLETE_SCHEDULE' in codes(result)
    assert result.suggested_request is None
    changed = block(day='Wed')
    mismatch = context([changed], roots(changed))
    assert 'OFF_SLOT_ORIGINALS' in codes(mismatch)


def test_original_actual_time_and_branch_are_preserved_when_timetable_has_changed():
    source = block()
    recorded = roots(source)
    recorded[0] = replace(recorded[0], time_slot='09:00 - 10:30', location='OLD')
    result = context([source], recorded)
    assert 'OFF_SLOT_ORIGINALS' in codes(result)
    original = next(r for r in result.source_blocks[0].originals if r.id == recorded[0].id)
    assert original.time_slot == '09:00 - 10:30'
    assert original.location == 'OLD'
    assert result.source_blocks[0].time_slot == source.assigned_time
    assert result.source_blocks[0].location == source.location


def test_valid_database_schedule_lengths_survive_source_to_preview_unchanged():
    source = block(location='L' * 31, assigned_time='T' * 51)
    result = context([source], roots(source))
    assert result.source_blocks[0].location == 'L' * 31
    assert result.source_blocks[0].time_slot == 'T' * 51
    assert result.suggested_request.slots[0].location == 'L' * 31
    assert result.suggested_request.slots[0].time_slot == 'T' * 51
    projection = preview_billing(result.suggested_request, set())
    assert projection.periods[0].lessons[0].location == 'L' * 31
    assert projection.periods[0].lessons[0].time_slot == 'T' * 51


@pytest.mark.parametrize('changes', [dict(location='L' * 101), dict(assigned_time='T' * 101)])
def test_unsupported_source_schedule_is_preserved_with_review_instead_of_crashing(changes):
    source = block(**changes)
    result = context([source], roots(source))
    assert result.suggested_request is None
    assert 'UNSUPPORTED_SCHEDULE' in codes(result)
    assert result.source_blocks[0].location == source.location
    assert result.source_blocks[0].time_slot == source.assigned_time
    assert candidate(result, 1).location == source.location
    assert candidate(result, 1).time_slot == source.assigned_time


def test_upcoming_records_and_concurrent_classes_use_the_remaining_teaching_year():
    monday = block(first='2026-12-07', day='Mon')
    thursday = block(2, first='2026-12-10', day='Thu')
    recorded = [*roots(monday), *roots(thursday)]
    result = context([monday, thursday], recorded)
    assert result.upcoming_original_count == 12
    assert set(result.selected_enrollment_ids) == {1, 2}
    assert 'CONTINUATION_UNCONFIRMED' not in codes(result)
    assert 'CONTINUING_SLOTS_REVIEW' in codes(result)
    assert len(result.suggested_request.slots) == 2
