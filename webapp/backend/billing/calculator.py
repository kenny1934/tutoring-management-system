"""Pure date/fee calculation. No database, enrollment or payment side effects.

Coverage and collection timing are calculated separately. Dates retain their
slot identity so two valid lessons on one date are not collapsed into one.
"""
from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta
import calendar

from constants import BASE_FEE_PER_LESSON
from .schemas import (
    BillingPreviewPeriod, BillingPreviewRequest, BillingPreviewResponse,
    CollectionWindow, PeriodCount, PreviewDeduction, PreviewIssue, PreviewLesson,
    SkippedCollection,
)

DAYS = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')


@dataclass(frozen=True)
class BillingPolicy:
    academic_start: date = date(2026, 9, 1)
    regular_end: date = date(2027, 7, 4)
    makeup_end: date = date(2027, 6, 30)
    transition_from: date = date(2026, 10, 30)
    pilot_from: date = date(2026, 11, 20)
    transition_end: date = date(2026, 12, 31)
    unit_fee: int = BASE_FEE_PER_LESSON
    first_minimum: int = 6
    ordinary_minimum: int = 4
    version: str = 'regular-calendar-preview-v1'


def month_end(day: date) -> date:
    return day.replace(day=calendar.monthrange(day.year, day.month)[1])


def next_month(day: date) -> date:
    return date(day.year + (day.month == 12), day.month % 12 + 1, 1)


def previous_month(day: date) -> date:
    return date(day.year - (day.month == 1), 12 if day.month == 1 else day.month - 1, 1)


def period_end(start: date, months: int, policy: BillingPolicy) -> date:
    end = month_end(start)
    for _ in range(months - 1):
        end = month_end(next_month(end))
    # The last June period contains the remaining early-July regular lessons.
    if end.year == policy.makeup_end.year and end.month == policy.makeup_end.month:
        end = policy.regular_end
    return min(end, policy.regular_end)


def preview_billing(
    request: BillingPreviewRequest,
    holidays: set[date],
    *,
    policy: BillingPolicy = BillingPolicy(),
    allow_adjustment: bool = False,
) -> BillingPreviewResponse:
    if not policy.academic_start <= request.first_lesson_date <= policy.regular_end:
        raise ValueError('Choose a first lesson within this teaching year.')
    if request.mode == 'new_student' and request.first_lesson_date < policy.transition_from:
        raise ValueError('The new scheme does not apply to this start date. Use the old six-session renewal.')
    if DAYS[request.first_lesson_date.weekday()] not in {s.weekday for s in request.slots}:
        raise ValueError('Choose a first lesson date that matches a selected weekday.')
    exceptions = {(day, i) for i, slot in enumerate(request.slots) for day in slot.holiday_exceptions}
    if not {d for d, _ in exceptions} <= holidays:
        raise ValueError('Only dates marked as holidays can be added as holiday classes.')
    if any(DAYS[d.weekday()] != request.slots[i].weekday for d, i in exceptions):
        raise ValueError('Each holiday class must match that class’s weekday.')
    if request.adjustment and not allow_adjustment:
        raise PermissionError('Ask an admin to adjust the sessions covered by the first payment.')
    if request.adjustment:
        boundary = request.adjustment.through
        if not request.first_lesson_date <= boundary <= policy.regular_end:
            raise ValueError('Choose an end date between the first lesson and the end of the teaching year.')
        if boundary != month_end(boundary) and boundary != policy.regular_end:
            raise ValueError('Choose month-end or the final regular teaching day as the end date.')

    issues: list[PreviewIssue] = []

    def review(code: str, message: str, number: int | None = None):
        issues.append(PreviewIssue(code=code, message=message, period=number))

    if request.materials_fee is None and request.mode == 'new_student':
        review('MATERIALS_UNCONFIRMED', 'Enter the materials fee, or 0 if waived, to show the total.', 1)
    if request.mode == 'new_student' and request.coupon:
        review('TRIAL_COUPON_CHOICE', 'This preview uses a coupon, so the $150 trial deduction is not applied. Check separately whether it can be used later.')
    if request.payment_method == 'autopay' and not request.mandate_ready:
        review('MANDATE_NOT_READY', 'Check bank authorisation and the setup deadline before using these debit dates.')
    if exceptions:
        review('HOLIDAY_OPENING_ASSUMED', 'Check that the student will attend the holiday classes shown.')
    if any(s.covered_through for s in request.slots):
        review('COVERAGE_ASSUMED', 'Check the existing enrollments against the end dates entered in Payment settings.')
    if len(request.slots) > 1 and len({s.covered_through for s in request.slots}) > 1:
        review('STAGGERED_COVERAGE', 'The two classes have different enrollment end dates. Check when payment is next needed for each class.')
    if request.mode == 'transition' and len(request.slots) > 1:
        review('CONTINUING_SLOTS_REVIEW', 'Check that the student will attend both classes each week.')

    events: list[PreviewLesson] = []
    excluded = set()
    for index, slot in enumerate(request.slots):
        if slot.covered_through and slot.covered_through > policy.regular_end:
            raise ValueError('Existing enrollments cannot end after this teaching year in this preview.')
        first = max(request.first_lesson_date, slot.covered_through + timedelta(days=1)) if slot.covered_through else request.first_lesson_date
        current = first + timedelta(days=(DAYS.index(slot.weekday) - first.weekday()) % 7)
        while current <= policy.regular_end:
            if current in holidays and (current, index) not in exceptions:
                excluded.add(current)
            else:
                events.append(PreviewLesson(date=current, slot=index, weekday=slot.weekday,
                                            time_slot=slot.time_slot, location=slot.location,
                                            holiday_exception=current in holidays))
            current += timedelta(days=7)
    events.sort(key=lambda event: (event.date, event.slot))
    if request.first_lesson_date in holidays and not any(e.date == request.first_lesson_date for e in events):
        raise ValueError('The first lesson is a holiday. Choose another date or add it as a holiday class.')

    monthly = request.payment_method == 'autopay' or len(request.slots) > 1
    remaining = list(events)
    periods: list[BillingPreviewPeriod] = []
    coupon = request.coupon
    coupon_used = False
    coupon_combined = False
    previous_collection: tuple[date, date] | None = None

    def take(boundary: date, kind: str, explanation: str, *, manual=False, transition=False, first=False, selected=None):
        nonlocal remaining, coupon_used, coupon_combined, previous_collection
        number = len(periods) + 1
        covered = selected if selected is not None else [e for e in remaining if e.date <= boundary]
        if not covered:
            raise ValueError('This payment has no sessions to charge. Check the start and end dates.')
        issue_start = len(issues)
        reason = None
        if number == 1 and request.adjustment:
            boundary = request.adjustment.through
            covered = [e for e in remaining if e.date <= boundary]
            if not covered:
                raise ValueError('The adjusted payment has no sessions to charge. Check the session end date.')
            reason = request.adjustment.reason
            explanation += ' The session end date for the first payment has been adjusted.'
            review('ADMIN_ADJUSTMENT', 'An admin must confirm the session end date and reason before collecting this payment.', number)

        # Coupon choice is explicit. A short transition never adds months just
        # to make an ordinary coupon fit. Later regular periods can be prepaid.
        def qualifies(lessons):
            if coupon.kind == 'ordinary':
                return len(lessons) >= policy.ordinary_minimum
            initial_transition = first and policy.transition_from <= lessons[0].date <= policy.transition_end
            if transition or kind == 'legacy' or initial_transition:
                return len(lessons) >= 6
            # Early July belongs to June's final payment for voucher eligibility.
            months = {(policy.makeup_end.year, policy.makeup_end.month)
                      if policy.makeup_end < e.date <= policy.regular_end
                      else (e.date.year, e.date.month) for e in lessons}
            return len(months) >= 2

        if coupon and not coupon_used and not coupon_combined and not transition and kind != 'legacy' and coupon.combine_next_month:
            eligible = qualifies(covered)
            if not eligible and boundary < policy.regular_end and not (number == 1 and request.adjustment):
                boundary = period_end(next_month(boundary), 1, policy)
                covered = [e for e in remaining if e.date <= boundary]
                coupon_combined = True
                explanation += ' The next month is included for the coupon option selected.'

        deductions = []
        short_trial = first and request.trial_deduction and len(covered) < policy.first_minimum
        if first and request.trial_deduction and not short_trial:
            deductions.append(PreviewDeduction(kind='trial', amount=150))
        if coupon and not coupon_used:
            eligible = qualifies(covered)
            can_verify = coupon.verified and coupon.expires_on is not None and coupon.available_count is not None
            if not can_verify:
                if not any(i.code == 'COUPON_UNVERIFIED' for i in issues):
                    review('COUPON_UNVERIFIED', 'Check the coupon amount, count and expiry in KMS. No coupon is deducted yet.')
            elif coupon.available_count == 0:
                if not any(i.code == 'COUPON_UNAVAILABLE' for i in issues):
                    review('COUPON_UNAVAILABLE', 'The entered coupon count is 0. No coupon is deducted.')
            elif eligible:
                # Eligibility depends on the payment date, not its last lesson.
                method = 'manual' if manual else request.payment_method
                payment_latest = (previous_month(covered[0].date).replace(day=22)
                                  if method == 'autopay' else covered[0].date)
                if transition and method == 'autopay':
                    payment_latest = policy.pilot_from.replace(day=22)
                if coupon.expires_on >= payment_latest:
                    deductions.append(PreviewDeduction(kind=coupon.kind, amount=coupon.value))
                    coupon_used = True
                else:
                    review('COUPON_EXPIRY_REVIEW', 'The coupon may expire before payment. Check the payment date before applying it.', number)
            elif number == 1:
                review('COUPON_SAVED', 'This payment does not meet the coupon rules. Keep the session end date and save the coupon for a later payment.', number)
                if coupon.expires_on and boundary < policy.regular_end and coupon.expires_on < next_month(boundary):
                    review('SAVED_COUPON_EXPIRY', 'The coupon expires before the next lessons start. Check the next payment date before saving it.', number)

        if first and len(covered) < policy.first_minimum:
            review('FIRST_PAYMENT_BELOW_MINIMUM', 'This first payment covers fewer than six sessions. An admin must approve it and record a reason.', number)
            if short_trial:
                review('SHORT_FIRST_TRIAL_REVIEW', 'Check whether this shorter first payment can use the $150 trial deduction. It is not applied yet.', number)
        method = 'manual' if manual else request.payment_method
        collection = CollectionWindow(method=method)
        if method == 'manual':
            collection.due_before_lesson = covered[0].date
            window = (covered[0].date, covered[0].date)
        else:
            previous = policy.pilot_from.replace(day=1) if transition else previous_month(covered[0].date)
            collection.debit_from = previous.replace(day=20)
            collection.debit_to = previous.replace(day=22)
            window = (collection.debit_from, collection.debit_to)
            if collection.debit_to >= covered[0].date:
                review('COLLECTION_BEFORE_LESSON', 'The debit window ends on or after the first lesson. Arrange earlier manual payment if needed.', number)
        if kind not in ('first', 'legacy', 'adjusted_manual'):
            previous = policy.pilot_from.replace(day=1) if transition else previous_month(covered[0].date)
            collection.notice_from = previous.replace(day=12)
            collection.notice_to = previous.replace(day=18)
        if previous_collection:
            collection.gap_min_days = (window[0] - previous_collection[1]).days
            collection.gap_max_days = (window[1] - previous_collection[0]).days
            # Expose the interval; there is deliberately no invented threshold.
        if first and request.payment_method == 'autopay':
            review('FIRST_AUTOPAY_TIMING', 'Check how soon the next bank debit follows this first manual payment.', number)
        previous_collection = window
        counts = Counter(e.date.strftime('%Y-%m') for e in covered)
        gross = len(covered) * policy.unit_fee
        discount = sum(d.amount for d in deductions)
        if discount > gross:
            raise ValueError('The discount is larger than this payment’s tuition. Check the discount amount.')
        materials = request.materials_fee if number == 1 and request.mode == 'new_student' else 0
        periods.append(BillingPreviewPeriod(
            number=number, kind=kind, explanation=explanation, coverage_from=covered[0].date,
            coverage_through=boundary, first_lesson_date=covered[0].date, last_lesson_date=covered[-1].date,
            lesson_count=len(covered), counts_by_month=[PeriodCount(month=m, lessons=n) for m, n in sorted(counts.items())],
            counts_by_slot=[sum(e.slot == i for e in covered) for i in range(len(request.slots))], lessons=covered,
            gross_tuition=gross, deductions=deductions, tuition_after_deductions=gross - discount,
            materials_fee=materials, total_fee=None if materials is None or short_trial else gross - discount + materials,
            collection=collection, adjustment_reason=reason,
            requires_review=len(issues) > issue_start or any(i.period == number for i in issues),
        ))
        identities = {(e.date, e.slot) for e in covered}
        remaining = [e for e in remaining if (e.date, e.slot) not in identities]

    if remaining and request.mode == 'new_student':
        boundary = period_end(remaining[0].date, 1, policy)
        while sum(e.date <= boundary for e in remaining) < policy.first_minimum and boundary < policy.regular_end:
            boundary = period_end(next_month(boundary), 1, policy)
        take(boundary, 'first', 'The first payment is manual. It normally covers at least six sessions through month-end.', manual=True, first=True)
    elif remaining and request.mode == 'transition':
        while remaining and remaining[0].date < policy.transition_from:
            legacy = []
            for slot in range(len(request.slots)):
                slot_events = [e for e in remaining if e.slot == slot]
                if slot_events and slot_events[0].date < policy.transition_from:
                    legacy.extend(slot_events[:6])
            legacy.sort(key=lambda e: (e.date, e.slot))
            if len(request.slots) > 1:
                review('LEGACY_MULTISLOT_REVIEW', 'The old scheme charges six sessions per enrollment. Check both classes and the date of the following payment.')
            take(legacy[-1].date, 'legacy', 'Use the old six-session renewal for each enrollment before the new scheme starts.', manual=True, selected=legacy)
        if remaining and remaining[0].date < policy.pilot_from:
            take(policy.transition_end, 'adjusted_manual', 'One manual payment covers sessions through December, avoiding another payment soon afterwards.', manual=True, transition=True)
        elif remaining and remaining[0].date <= policy.transition_end:
            december_start = policy.transition_end.replace(day=1)
            dec = [e for e in remaining if december_start <= e.date <= policy.transition_end]
            two = remaining[0].date >= december_start and len(dec) in (1, 2)
            boundary = period_end(next_month(policy.transition_end), 1 if monthly else 2, policy) if two else policy.transition_end
            if two and len(request.slots) > 1:
                review('COMBINED_TRANSITION_REVIEW', 'Only one or two December sessions remain across both classes. Check both classes before using this grouping.')
            take(boundary, 'situation_two' if two else 'transition',
                 'Monthly payments cover the remaining December sessions and January. Once-weekly manual payments also cover February.' if two
                 else 'This payment covers sessions through December for either payment method.', transition=True)
    while remaining:
        take(period_end(remaining[0].date, 1 if monthly else 2, policy), 'regular',
             'Charge the next calendar month.' if monthly else 'Charge the next two calendar months after the sessions covered by the previous payment.')

    # Explicit skip explanations follow prepaid coverage, never merely a plan
    # label. A two-month manual payment has no intervening duplicate collection.
    skipped = []
    for p in periods:
        if p.kind == 'legacy':
            continue
        identities = {(e.date, e.slot) for e in p.lessons}
        current = next_month(p.first_lesson_date)
        while current <= p.coverage_through:
            if current.year == policy.regular_end.year and current.month == policy.regular_end.month and current.month == 7:
                break
            month = previous_month(current).strftime('%Y-%m')
            run_end = previous_month(current).replace(day=22)
            # Do not claim a run before this family joined was skipped.
            target_month = {(e.date, e.slot) for e in events
                            if e.date.year == current.year and e.date.month == current.month}
            after_joining = request.mode != 'new_student' or p.number != 1 or run_end >= request.first_lesson_date
            if target_month and target_month <= identities and after_joining and run_end >= policy.pilot_from:
                skipped.append(SkippedCollection(month=month, covered_by_period=p.number,
                                                  reason=f'{current:%B %Y} is already included in payment {p.number}.'))
            current = next_month(current)
    # A skip is a later run, never the run that takes this payment itself.
    skipped = [s for s in skipped if not any(
        p.number == s.covered_by_period and p.collection.debit_from
        and p.collection.debit_from.strftime('%Y-%m') == s.month for p in periods)]
    allocated = [(e.date, e.slot) for p in periods for e in p.lessons]
    if Counter(allocated) != Counter((e.date, e.slot) for e in events) or len(allocated) != len(set(allocated)):
        raise ValueError('Some sessions are missing from the payment schedule or charged twice. Check the lesson dates.')
    return BillingPreviewResponse(
        policy_version=policy.version, regular_end_date=policy.regular_end,
        makeup_end_date=policy.makeup_end, payment_method=request.payment_method, monthly=monthly,
        periods=periods, skipped_collections=skipped, excluded_holidays=sorted(excluded),
        issues=issues, requires_review=bool(issues),
    )
