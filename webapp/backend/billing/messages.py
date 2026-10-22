"""Render combined fee-message previews from reviewed calculation snapshots.

This module does not decide discount eligibility or generate lesson dates. A
caller supplies the reviewed request and one calculated payment, together with
any unresolved source checks which must prevent a payable message.
"""
from collections import Counter
from typing import Sequence

from utils.regular_messages import (
    _DATE_INDENT, _DAY_EN, _DAY_ZH, _LOCATION_EN, _LOCATION_ZH,
    _duration_minutes, _identity_lines,
)

from .schemas import (
    BillingPreviewPeriod, BillingPreviewRequest, BillingStudent, FeeMessagePreview,
)


MESSAGE_TEMPLATE_VERSION = 'regular-payment-draft-v2'
_DAYS = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
# These are the same receiving accounts used by the existing enrollment fee
# template. A combined payment belongs to one teaching branch.
_BANK_ACCOUNTS = {'MSA': '185000380468369', 'MSB': '185000010473304'}


def _whole_amount(value, *, positive=False):
    return type(value) is int and value >= (1 if positive else 0)


def _snapshot_checks(student, request, period, unit_fee):
    """Check snapshot consistency without applying current billing policy."""
    reasons = []

    def check(condition, message):
        if not condition and message not in reasons:
            reasons.append(message)

    check(bool(student.student_name.strip()), 'Confirm the student name before preparing a fee message.')
    check(_whole_amount(unit_fee, positive=True), 'Confirm the per-session tuition before preparing a fee message.')
    for slot in request.slots:
        check(bool(slot.time_slot.strip()), 'Confirm the time of each class before preparing a fee message.')
        check(bool(slot.location.strip()) and slot.location.strip() not in {'Various', 'All Locations'},
              'Confirm the branch of each class before preparing a fee message.')
    locations = {slot.location for slot in request.slots}
    check(len(locations) == 1,
          'Both classes must belong to the same branch for one fee message.')
    if period.collection.method == 'manual':
        check(locations <= _BANK_ACCOUNTS.keys(),
              'Confirm the branch bank account before preparing a fee message.')

    lessons = period.lessons
    check(bool(lessons) and period.lesson_count == len(lessons),
          'The payment session count does not match its recorded lesson dates.')
    check(len({(lesson.date, lesson.slot) for lesson in lessons}) == len(lessons),
          'A lesson is repeated within this payment. Review the session dates.')
    counts_by_slot = [0] * len(request.slots)
    for lesson in lessons:
        if not 0 <= lesson.slot < len(request.slots):
            check(False, 'A payment lesson refers to a class outside the reviewed timetable.')
            continue
        slot = request.slots[lesson.slot]
        counts_by_slot[lesson.slot] += 1
        check(lesson.weekday == slot.weekday == _DAYS[lesson.date.weekday()],
              'A payment lesson date does not match its reviewed class weekday.')
        check(lesson.time_slot == slot.time_slot and lesson.location == slot.location,
              'A payment lesson does not match its reviewed class time or branch.')
        check(period.coverage_from <= lesson.date <= period.coverage_through
              and lesson.date >= request.first_lesson_date
              and (slot.covered_through is None or lesson.date > slot.covered_through),
              'A payment lesson falls outside the reviewed unpaid coverage dates.')
    check(period.counts_by_slot == counts_by_slot,
          'The class session counts do not match this payment’s lesson dates.')
    months = Counter(lesson.date.strftime('%Y-%m') for lesson in lessons)
    check(len(period.counts_by_month) == len(months)
          and {row.month: row.lessons for row in period.counts_by_month} == dict(months),
          'The monthly session counts do not match this payment’s lesson dates.')
    if lessons:
        first, last = min(lesson.date for lesson in lessons), max(lesson.date for lesson in lessons)
        check(period.coverage_from == period.first_lesson_date == first
              and period.last_lesson_date == last and last <= period.coverage_through,
              'The payment date range does not match its first and last lesson.')

    check(_whole_amount(period.gross_tuition) and period.gross_tuition == unit_fee * len(lessons),
          'The gross tuition does not match the session count and per-session fee.')
    check(len(period.deductions) <= 1,
          'A combined payment can use only one deduction. Review the discount choice.')
    for deduction in period.deductions:
        check(_whole_amount(deduction.amount, positive=True), 'Confirm each deduction amount before preparing a fee message.')
        if deduction.kind == 'trial':
            check(request.trial_deduction and request.coupon is None,
                  'The trial deduction does not match the reviewed discount choice.')
        else:
            check(request.coupon is not None and not request.trial_deduction
                  and request.coupon.kind == deduction.kind and request.coupon.value == deduction.amount,
                  'The coupon deduction does not match the reviewed discount choice.')
    discount = sum(row.amount for row in period.deductions)
    check(_whole_amount(period.tuition_after_deductions)
          and period.tuition_after_deductions == period.gross_tuition - discount,
          'The tuition after deductions does not match the itemised payment amounts.')
    check(period.materials_fee is not None, 'Confirm the materials fee or its waiver before preparing a fee message.')
    check(period.total_fee is not None, 'Confirm the final payable total before preparing a fee message.')
    if period.materials_fee is not None:
        check(_whole_amount(period.materials_fee), 'Confirm the materials fee amount before preparing a fee message.')
        expected_materials = request.materials_fee if request.mode == 'new_student' and period.number == 1 else 0
        check(period.materials_fee == expected_materials,
              'The materials fee does not match the reviewed payment settings.')
        if period.total_fee is not None:
            check(_whole_amount(period.total_fee)
                  and period.total_fee == period.tuition_after_deductions + period.materials_fee,
                  'The final total does not match tuition, deductions and materials.')

    collection = period.collection
    if collection.method == 'manual':
        check(collection.due_before_lesson is not None
              and collection.due_before_lesson == period.first_lesson_date,
              'Confirm the manual payment deadline before preparing a fee message.')
    else:
        check(collection.debit_from is not None and collection.debit_to is not None
              and collection.debit_from <= collection.debit_to,
              'Confirm the autopay debit dates before preparing a fee message.')
    return reasons


def _fee_description(request, period, *, zh):
    """Keep the enrollment template's compact fee line with reviewed amounts."""
    parts = []
    for deduction in period.deductions:
        amount = deduction.amount
        if zh:
            parts.append({
                'trial': f'已扣減${amount}試堂費',
                'ordinary': f'已折扣${amount}學費禮劵',
                'staff': f'已折扣${amount}職員親友禮券',
            }[deduction.kind])
        else:
            parts.append({
                'trial': f'Trial deduction ${amount} applied',
                'ordinary': f'Discounted ${amount}',
                'staff': f'Staff voucher ${amount} applied',
            }[deduction.kind])
    if period.materials_fee:
        parts.append(f'含${period.materials_fee}教材費' if zh
                     else f'includes ${period.materials_fee} materials fee')
    if period.deductions:
        original = f'${period.gross_tuition}'
        if period.materials_fee:
            original += (f'+${period.materials_fee}教材費' if zh
                         else f' + ${period.materials_fee} materials fee')
        parts.append(f'原價為{original}' if zh else f'original price {original}')
    if request.mode == 'new_student' and period.number == 1 and period.materials_fee == 0:
        parts.append('教材費已豁免' if zh else 'materials fee waived')
    return f' ({("，" if zh else ", ").join(parts)})' if parts else ''


def _render(student, request, period, *, zh):
    """Use the established parent template without its legacy recalculation."""
    sections = [
        '家長您好，以下是 MathConcept中學教室 常規課程 之【繳費提示訊息】：' if zh else
        'Dear Parent,\n\nThis is a payment reminder for MathConcept Secondary Academy regular course:',
    ]
    schedules = []
    for index, slot in enumerate(request.slots):
        dates = sorted(lesson.date for lesson in period.lessons if lesson.slot == index)
        if not dates:
            continue
        duration = _duration_minutes(slot.time_slot)
        suffix = (f' ({duration}分鐘)' if zh else f' ({duration} minutes)') if duration else ''
        lines = [f'上課時間：逢星期{_DAY_ZH[slot.weekday]} {slot.time_slot}{suffix}' if zh
                 else f'Schedule: Every {_DAY_EN[slot.weekday]} {slot.time_slot}{suffix}']
        lines.append('上課日期：' if zh else 'Lesson Dates:')
        lines.extend(f'{_DATE_INDENT}{value:%Y/%m/%d}' for value in dates)
        lines.append(f'{_DATE_INDENT}(共{len(dates)}堂)' if zh
                     else f'{_DATE_INDENT}({len(dates)} lessons total)')
        schedules.append('\n'.join(lines))
    sections.append(_identity_lines(student.school_student_id, student.student_name, 'zh' if zh else 'en')
                    + '\n' + '\n\n'.join(schedules))
    if len(schedules) > 1:
        sections.append(f'合共{period.lesson_count}堂' if zh else f'{period.lesson_count} lessons total')
    sections.append((f'費用： ${period.total_fee:,}' if zh else f'Fee: ${period.total_fee:,}')
                    + _fee_description(request, period, zh=zh))
    late_clause = ('逾期繳費者，本中心將收取$200手續費，並保留權利拒絕學生上課。' if zh else
                   'A $200 handling fee will be charged for late payment, and we reserve the right to refuse class attendance.')
    branch = request.slots[0].location
    collection = period.collection
    if collection.method == 'manual':
        sections.append(('請於每期第一堂或之前繳交學費。' if zh else
                         'Please settle tuition on or before the first lesson of each term. ') + late_clause)
        sections.append(
            '家長可選擇以下繳費方式：\n1. 交付現金 或\n'
            '2. 把學費存入以下戶口，請於備註註明學生姓名及其編號，並發收條至中心微信群。\n'
            '銀行：中國銀行\n名稱：弘教數學教育中心\n'
            f'號碼：{_BANK_ACCOUNTS[branch]}' if zh else
            'Parents may choose one of the following payment methods:\n1. Cash payment, or\n'
            '2. Bank transfer to the following account. Please include the student name and ID in the remarks, '
            "and send the receipt to our center's WeChat group.\n"
            'Bank: Bank of China\nAccount Name: 弘教數學教育中心\n'
            f'Account Number: {_BANK_ACCOUNTS[branch]}'
        )
    else:
        sections.append(f'繳費方式：自動轉賬。預計扣款日期：{collection.debit_from:%Y/%m/%d} 至 {collection.debit_to:%Y/%m/%d}。' if zh
                        else f'Payment method: Autopay. Planned debit dates: {collection.debit_from:%Y/%m/%d} to {collection.debit_to:%Y/%m/%d}.')
        sections.append(late_clause)
    sections.append(f'MathConcept 中學教室 ({_LOCATION_ZH.get(branch, branch)})' if zh else
                    f'MathConcept Secondary Academy ({_LOCATION_EN.get(branch, branch)})')
    return '\n\n'.join(sections)


def prepare_fee_messages(
    student: BillingStudent,
    request: BillingPreviewRequest,
    period: BillingPreviewPeriod,
    unit_fee: int,
    blocked_reasons: Sequence[str] = (),
) -> FeeMessagePreview:
    """Return both language drafts, or clear blockers with neither draft."""
    reasons = list(dict.fromkeys(reason.strip() for reason in blocked_reasons if reason.strip()))
    for reason in _snapshot_checks(student, request, period, unit_fee):
        if reason not in reasons:
            reasons.append(reason)
    if reasons:
        return FeeMessagePreview(template_version=MESSAGE_TEMPLATE_VERSION, zh=None, en=None, blocked_reasons=reasons)
    return FeeMessagePreview(
        template_version=MESSAGE_TEMPLATE_VERSION,
        zh=_render(student, request, period, zh=True),
        en=_render(student, request, period, zh=False),
        blocked_reasons=[],
    )
