"""Pure snapshot-only fee-message checks, without application or DB fixtures."""
import ast
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import pytest

from billing.messages import MESSAGE_TEMPLATE_VERSION, prepare_fee_messages
from billing.schemas import BillingPreviewPeriod, BillingPreviewRequest, BillingStudent
from constants import BASE_FEE_PER_LESSON, REGISTRATION_FEE


@pytest.fixture(scope='module')
def legacy_formatter():
    """Read the real enrollment template without importing its database router."""
    source = Path(__file__).resolve().parents[1] / 'routers' / 'enrollments.py'
    function = next(
        node for node in ast.parse(source.read_text()).body
        if isinstance(node, ast.FunctionDef) and node.name == 'format_fee_message'
    )
    namespace = {
        'Optional': Optional, 'BASE_FEE_PER_LESSON': BASE_FEE_PER_LESSON,
        'REGISTRATION_FEE': REGISTRATION_FEE,
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), 'exec'), namespace)
    return namespace['format_fee_message']


@pytest.fixture
def single_snapshot():
    student = BillingStudent(id=7, student_name='Synthetic Student', school_student_id='TEST007')
    dates = [date(2026, 11, 3) + timedelta(weeks=index) for index in range(6)]
    request = BillingPreviewRequest(
        first_lesson_date=dates[0], mode='transition', materials_fee=0,
        slots=[{'weekday': 'Tue', 'time_slot': '16:00-17:30', 'location': 'MSA'}],
    )
    period = BillingPreviewPeriod(
        number=1, kind='transition', explanation='Synthetic reviewed payment',
        coverage_from=dates[0], coverage_through=date(2026, 12, 31),
        first_lesson_date=dates[0], last_lesson_date=dates[-1], lesson_count=6,
        counts_by_month=[{'month': '2026-11', 'lessons': 4}, {'month': '2026-12', 'lessons': 2}],
        counts_by_slot=[6], lessons=[
            {'date': value, 'slot': 0, 'weekday': 'Tue', 'time_slot': '16:00-17:30', 'location': 'MSA'}
            for value in dates
        ], gross_tuition=2400, deductions=[], tuition_after_deductions=2400,
        materials_fee=0, total_fee=2400,
        collection={'method': 'manual', 'due_before_lesson': dates[0]},
    )
    return student, request, period


@pytest.fixture
def snapshot():
    student = BillingStudent(id=7, student_name='Synthetic Student', school_student_id='TEST007')
    request = BillingPreviewRequest(
        first_lesson_date=date(2026, 12, 1), mode='transition', materials_fee=0,
        slots=[{'weekday': 'Tue', 'time_slot': '16:00-17:30', 'location': 'MSA'},
               {'weekday': 'Thu', 'time_slot': '17:00-18:30', 'location': 'MSA'}],
    )
    period = BillingPreviewPeriod(
        number=1, kind='transition', explanation='Synthetic reviewed payment',
        coverage_from=date(2026, 12, 1), coverage_through=date(2027, 1, 31),
        first_lesson_date=date(2026, 12, 1), last_lesson_date=date(2027, 1, 7),
        lesson_count=4, counts_by_month=[{'month': '2026-12', 'lessons': 2}, {'month': '2027-01', 'lessons': 2}],
        counts_by_slot=[2, 2], lessons=[
            {'date': date(2026, 12, 1), 'slot': 0, 'weekday': 'Tue', 'time_slot': '16:00-17:30', 'location': 'MSA'},
            {'date': date(2026, 12, 3), 'slot': 1, 'weekday': 'Thu', 'time_slot': '17:00-18:30', 'location': 'MSA'},
            {'date': date(2027, 1, 5), 'slot': 0, 'weekday': 'Tue', 'time_slot': '16:00-17:30', 'location': 'MSA'},
            {'date': date(2027, 1, 7), 'slot': 1, 'weekday': 'Thu', 'time_slot': '17:00-18:30', 'location': 'MSA'},
        ], gross_tuition=1600, deductions=[], tuition_after_deductions=1600, materials_fee=0,
        total_fee=1600, collection={'method': 'manual', 'due_before_lesson': date(2026, 12, 1)},
    )
    return student, request, period


def prepare(snapshot, **kwargs):
    return prepare_fee_messages(*snapshot, unit_fee=400, **kwargs)


def assert_blocked(result, text):
    assert result.zh is None and result.en is None
    assert any(text in reason.lower() for reason in result.blocked_reasons), result.blocked_reasons


@pytest.mark.parametrize('lang', ['zh', 'en'])
@pytest.mark.parametrize('branch', ['MSA', 'MSB'])
@pytest.mark.parametrize('coupon', [0, 200, 300])
@pytest.mark.parametrize('materials', [0, 100])
def test_common_manual_messages_match_entire_existing_template(
    single_snapshot, legacy_formatter, lang, branch, coupon, materials,
):
    from billing.schemas import PreviewCoupon, PreviewDeduction
    student, request, period = single_snapshot
    # The existing enrollment branch determines the receiving account, even
    # when the student's home branch is different.
    student.home_location = 'MSB' if branch == 'MSA' else 'MSA'
    request.slots[0].location = branch
    for lesson in period.lessons:
        lesson.location = branch
    request.mode = 'new_student' if materials else 'transition'
    request.materials_fee = period.materials_fee = materials
    if coupon:
        request.coupon = PreviewCoupon(value=coupon, verified=True)
        period.deductions = [PreviewDeduction(kind='ordinary', amount=coupon)]
    period.tuition_after_deductions = period.gross_tuition - coupon
    period.total_fee = period.tuition_after_deductions + materials
    result = prepare(single_snapshot)
    assert result.blocked_reasons == []
    expected = legacy_formatter(
        lang=lang, school_student_id=student.school_student_id,
        student_name=student.student_name, assigned_day='Tue',
        assigned_time=request.slots[0].time_slot, location=branch,
        lessons_paid=period.lesson_count, session_dates=[lesson.date for lesson in period.lessons],
        discount_value=coupon, is_new_student=bool(materials),
    )
    assert getattr(result, lang) == expected


def test_combined_bilingual_message_has_exact_dates_and_one_final_total(snapshot):
    result = prepare(snapshot)
    assert result.template_version == MESSAGE_TEMPLATE_VERSION == 'regular-payment-draft-v2'
    assert result.blocked_reasons == []
    assert '學生編號：TEST007' in result.zh and '學生姓名：Synthetic Student' in result.zh
    assert '常規課程' in result.zh and 'Schedule: Every Tuesday 16:00-17:30 (90 minutes)' in result.en
    assert 'Schedule: Every Thursday 17:00-18:30 (90 minutes)' in result.en
    assert '逢星期二' in result.zh and '逢星期四' in result.zh
    for message in [result.zh, result.en]:
        for day in ['2026/12/01', '2026/12/03', '2027/01/05', '2027/01/07']:
            assert message.count(day) == 1
        assert '2027/01/31' not in message
        assert 'preview' not in message.lower() and '預覽' not in message
    assert result.en.count('Fee: $1,600') == 1
    assert result.zh.count('費用： $1,600') == 1
    assert result.en.count('(2 lessons total)') == 2
    assert '\n\n4 lessons total\n\n' in result.en and '\n\n合共4堂\n\n' in result.zh
    assert result.en.count('Account Number:') == 1
    assert result.en.endswith('MathConcept Secondary Academy (Vasco Center)')
    assert 'materials fee' not in result.en
    assert '教材費' not in result.zh


def test_same_date_distinct_slots_remain_two_lessons(snapshot):
    _, request, period = snapshot
    request.slots[1].weekday = 'Tue'
    for index in [1, 3]:
        period.lessons[index].date = period.lessons[index - 1].date
        period.lessons[index].weekday = 'Tue'
    period.last_lesson_date = date(2027, 1, 5)
    result = prepare(snapshot)
    assert result.blocked_reasons == []
    assert result.en.count('2027/01/05') == 2
    assert '\n\n4 lessons total\n\n' in result.en


@pytest.mark.parametrize('kind,value,en_text,zh_text', [
    ('trial', 150, 'Trial deduction $150 applied', '已扣減$150試堂費'),
    ('ordinary', 300, 'Discounted $300', '已折扣$300學費禮劵'),
    ('staff', 500, 'Staff voucher $500 applied', '已折扣$500職員親友禮券'),
])
def test_deduction_kinds_are_distinct_and_applied_once_to_combined_payment(snapshot, kind, value, en_text, zh_text):
    _, request, period = snapshot
    if kind == 'trial':
        request.mode = 'new_student'
        request.trial_deduction = True
    else:
        from billing.schemas import PreviewCoupon
        request.coupon = PreviewCoupon(kind=kind, value=value)
    from billing.schemas import PreviewDeduction
    period.deductions = [PreviewDeduction(kind=kind, amount=value)]
    period.tuition_after_deductions = period.total_fee = 1600 - value
    result = prepare(snapshot)
    assert result.blocked_reasons == []
    assert result.en.count(en_text) == 1
    assert result.zh.count(zh_text) == 1
    assert f'Fee: ${1600 - value:,}' in result.en
    assert 'original price $1600' in result.en and '原價為$1600' in result.zh
    if kind == 'trial':
        assert 'Discounted' not in result.en and '學費禮劵' not in result.zh


@pytest.mark.parametrize('materials,expected', [
    (100, 'includes $100 materials fee'), (250, 'includes $250 materials fee'),
    (0, 'materials fee waived'),
])
def test_new_first_payment_itemises_confirmed_materials_or_waiver(snapshot, materials, expected):
    _, request, period = snapshot
    request.mode = 'new_student'
    request.materials_fee = period.materials_fee = materials
    period.total_fee = 1600 + materials
    result = prepare(snapshot)
    assert result.blocked_reasons == []
    assert expected in result.en
    assert f'Fee: ${1600 + materials:,}' in result.en
    if materials == 0:
        assert '教材費已豁免' in result.zh
    else:
        assert f'含${materials}教材費' in result.zh


def test_actual_manual_collection_wins_over_autopay_preference(snapshot):
    snapshot[1].payment_method = 'autopay'
    result = prepare(snapshot)
    assert 'Please settle tuition on or before the first lesson of each term.' in result.en
    assert 'Parents may choose one of the following payment methods:' in result.en
    assert '請於每期第一堂或之前繳交學費。' in result.zh
    assert '家長可選擇以下繳費方式：' in result.zh
    assert 'Planned debit' not in result.en


def test_autopay_collection_uses_supplied_debit_dates_without_success_claim(snapshot):
    from billing.schemas import CollectionWindow
    snapshot[2].collection = CollectionWindow(method='autopay', debit_from=date(2026, 11, 20), debit_to=date(2026, 11, 22))
    result = prepare(snapshot)
    assert result.blocked_reasons == []
    assert 'Payment method: Autopay. Planned debit dates: 2026/11/20 to 2026/11/22.' in result.en
    assert '預計扣款日期：2026/11/20 至 2026/11/22' in result.zh
    assert 'Account Number:' not in result.en and 'Cash payment' not in result.en
    assert '銀行：' not in result.zh and '交付現金' not in result.zh
    assert 'A $200 handling fee will be charged for late payment' in result.en
    assert '逾期繳費者，本中心將收取$200手續費' in result.zh


@pytest.mark.parametrize('time_slot,expected_en,expected_zh', [
    ('16:00 - 18:00', ' (120 minutes)', ' (120分鐘)'),
    ('16:00', '', ''),
])
def test_schedule_uses_actual_duration_and_does_not_assume_ninety_minutes(single_snapshot, time_slot, expected_en, expected_zh):
    _, request, period = single_snapshot
    request.slots[0].time_slot = time_slot
    for lesson in period.lessons:
        lesson.time_slot = time_slot
    result = prepare(single_snapshot)
    assert result.blocked_reasons == []
    assert f'Schedule: Every Tuesday {time_slot}{expected_en}\n' in result.en
    assert f'上課時間：逢星期二 {time_slot}{expected_zh}\n' in result.zh
    assert '90 minutes' not in result.en and '90分鐘' not in result.zh


@pytest.mark.parametrize('method', ['manual', 'autopay'])
def test_combined_message_never_chooses_one_of_two_branch_accounts(snapshot, method):
    from billing.schemas import CollectionWindow
    _, request, period = snapshot
    request.slots[1].location = 'MSB'
    for lesson in period.lessons:
        if lesson.slot == 1:
            lesson.location = 'MSB'
    if method == 'autopay':
        period.collection = CollectionWindow(method=method, debit_from=date(2026, 11, 20), debit_to=date(2026, 11, 22))
    assert_blocked(prepare(snapshot), 'same branch')


def test_unknown_manual_receiving_account_withholds_message(single_snapshot):
    _, request, period = single_snapshot
    request.slots[0].location = 'Other Branch'
    for lesson in period.lessons:
        lesson.location = 'Other Branch'
    assert_blocked(prepare(single_snapshot), 'branch bank account')


def test_external_blockers_withhold_both_messages_and_preserve_readable_unique_reasons(snapshot):
    result = prepare(snapshot, blocked_reasons=[' Review the existing unpaid enrollment. ', 'Review the existing unpaid enrollment.'])
    assert result.zh is None and result.en is None
    assert result.blocked_reasons == ['Review the existing unpaid enrollment.']


@pytest.mark.parametrize('field,reason', [('materials_fee', 'materials'), ('total_fee', 'total')])
def test_unknown_amount_never_becomes_a_payable_message(snapshot, field, reason):
    setattr(snapshot[2], field, None)
    assert_blocked(prepare(snapshot), reason)


@pytest.mark.parametrize('field,value,reason', [
    ('lesson_count', 5, 'session count'),
    ('counts_by_slot', [1, 3], 'class session counts'),
    ('gross_tuition', 2000, 'gross tuition'),
    ('tuition_after_deductions', 1500, 'tuition after deductions'),
    ('materials_fee', 100, 'materials fee does not match'),
    ('total_fee', 1500, 'final total'),
    ('first_lesson_date', date(2026, 12, 2), 'date range'),
    ('last_lesson_date', date(2027, 1, 6), 'date range'),
])
def test_inconsistent_reviewed_payment_is_blocked(snapshot, field, value, reason):
    setattr(snapshot[2], field, value)
    assert_blocked(prepare(snapshot), reason)


def test_duplicate_lesson_identity_and_invalid_slot_cannot_be_rendered(snapshot):
    original = deepcopy(snapshot)
    snapshot[2].lessons[1] = snapshot[2].lessons[0].model_copy()
    assert_blocked(prepare(snapshot), 'repeated')
    original[2].lessons[1].slot = 9
    assert_blocked(prepare(original), 'outside the reviewed timetable')


@pytest.mark.parametrize('field,value,reason', [
    ('weekday', 'Fri', 'weekday'), ('time_slot', '15:00-16:00', 'time or branch'),
    ('location', 'Other Branch', 'time or branch'), ('date', date(2027, 2, 2), 'coverage dates'),
])
def test_lesson_ownership_must_match_reviewed_slot_and_dates(snapshot, field, value, reason):
    setattr(snapshot[2].lessons[0], field, value)
    assert_blocked(prepare(snapshot), reason)


def test_lesson_already_covered_in_reviewed_request_is_blocked(snapshot):
    snapshot[1].slots[0].covered_through = date(2026, 12, 1)
    assert_blocked(prepare(snapshot), 'unpaid coverage dates')


def test_month_counts_and_duplicate_month_rows_are_checked(snapshot):
    original = deepcopy(snapshot)
    snapshot[2].counts_by_month[0].lessons = 3
    assert_blocked(prepare(snapshot), 'monthly session counts')
    original[2].counts_by_month.append(original[2].counts_by_month[0].model_copy())
    assert_blocked(prepare(original), 'monthly session counts')


def test_multiple_or_unselected_deductions_are_blocked(snapshot):
    from billing.schemas import PreviewDeduction
    snapshot[2].deductions = [PreviewDeduction(kind='ordinary', amount=300)]
    assert_blocked(prepare(snapshot), 'discount choice')
    snapshot[2].deductions.append(PreviewDeduction(kind='trial', amount=150))
    assert_blocked(prepare(snapshot), 'only one deduction')


@pytest.mark.parametrize('method', ['manual', 'autopay'])
def test_incomplete_collection_dates_withhold_the_payment_request(snapshot, method):
    from billing.schemas import CollectionWindow
    snapshot[2].collection = CollectionWindow(method=method)
    assert_blocked(prepare(snapshot), 'deadline' if method == 'manual' else 'debit dates')


def test_missing_name_schedule_or_reserved_branch_requires_review(snapshot):
    original = deepcopy(snapshot)
    snapshot[0].student_name = '  '
    assert_blocked(prepare(snapshot), 'student name')
    original[1].slots[0].time_slot = ''
    assert_blocked(prepare(original), 'time of each class')
    original[1].slots[0].location = 'All Locations'
    assert_blocked(prepare(original), 'branch of each class')


def test_missing_student_number_is_omitted_without_a_blank_label(snapshot):
    snapshot[0].school_student_id = None
    result = prepare(snapshot)
    assert result.blocked_reasons == []
    assert 'Student ID:' not in result.en and '學生編號' not in result.zh


def test_formatter_does_not_mutate_or_reprice_snapshots_or_claim_payment_received(snapshot):
    original = deepcopy(snapshot)
    first = prepare(snapshot)
    assert snapshot == original
    assert first == prepare(snapshot)
    for message in [first.zh, first.en]:
        for forbidden in ['已收款', '已繳付', 'fee_message_sent']:
            assert forbidden not in message
    assert 'paid successfully' not in first.en.lower()
    assert first.en.count('A $200 handling fee') == 1
    assert first.zh.count('$200手續費') == 1
