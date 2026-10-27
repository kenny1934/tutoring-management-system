"""Turn recorded evidence into a reviewable scenario without changing records.

An original lesson counts once even if missed, moved or followed by several
makeups. Its descendants and extension deadlines never extend paid coverage.
"""
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
import hashlib
import json

from .calculator import BillingPolicy, DAYS
from .schemas import (
    BillingGapEvidence, BillingGapLesson, BillingPreviewRequest, BillingSourceBlock, BillingStudent, ContextBasis,
    ContinuingSlotCandidate, ImportedCouponSnapshot, PreviewIssue, PreviewSlot,
    RecordedOriginalLesson, StudentBillingContext,
)

SETTLED = {'Paid', 'Waived'}
PENDING = {'Pending Payment', 'Overdue', 'Unpaid'}


@dataclass(frozen=True)
class EvidenceBlock:
    id: int
    student_id: int
    tutor_id: int
    first_lesson_date: date | None
    assigned_day: str | None
    assigned_time: str | None
    location: str | None
    lessons_paid: int | None
    payment_status: str
    payment_date: date | None = None
    fee_message_sent: bool = False
    renewed_from_enrollment_id: int | None = None
    is_new_student: bool = False
    tutor_name: str = ''


@dataclass(frozen=True)
class EvidenceLesson:
    id: int
    enrollment_id: int
    student_id: int
    session_date: date
    session_status: str
    time_slot: str | None = None
    location: str | None = None
    make_up_for_id: int | None = None


def slot_key(block: EvidenceBlock):
    return ((block.assigned_day or '')[:3], (block.assigned_time or '').strip(), (block.location or '').strip())


def build_student_context(
    student: BillingStudent,
    blocks: list[EvidenceBlock],
    lessons: list[EvidenceLesson],
    holidays: set[date],
    *,
    as_of: date,
    basis: ContextBasis = 'paid_only',
    selected_enrollment_ids: list[int] | None = None,
    coupon_snapshot: ImportedCouponSnapshot | None = None,
    policy: BillingPolicy = BillingPolicy(),
) -> StudentBillingContext:
    issues = []

    def flag(code, message, *, gap_evidence=None):
        existing = next((i for i in issues if i.code == code), None)
        if existing is None:
            existing = PreviewIssue(code=code, message=message)
            issues.append(existing)
        if gap_evidence:
            existing.gap_evidence.extend(gap_evidence)

    if any(b.student_id != student.id for b in blocks) or any(s.student_id != student.id for s in lessons):
        raise ValueError('Use enrollments and lessons belonging to this student.')
    original_rows = defaultdict(list)
    all_original_rows = defaultdict(list)
    descendants = defaultdict(list)
    by_id = {s.id: s for s in lessons}
    by_block = {b.id: b for b in blocks}
    pending_roots = set()
    for lesson in lessons:
        if lesson.make_up_for_id is None:
            all_original_rows[lesson.enrollment_id].append(lesson)
            if lesson.session_status != 'Cancelled':
                original_rows[lesson.enrollment_id].append(lesson)
        else:
            descendants[lesson.enrollment_id].append(lesson)
        current = lesson
        seen = set()
        while current.make_up_for_id is not None:
            if current.id in seen:
                flag('MAKEUP_CHAIN_REVIEW', 'A makeup links back to itself. Check its original lesson and linked makeups.')
                break
            seen.add(current.id)
            parent = by_id.get(current.make_up_for_id)
            if parent is None:
                flag('MAKEUP_CHAIN_REVIEW', 'A makeup has no matching original lesson in these records. Check the lesson link.')
                break
            if parent.student_id != current.student_id or parent.enrollment_id != current.enrollment_id:
                flag('MAKEUP_CHAIN_REVIEW', 'A makeup and its original belong to different students or enrollments. Check both records.')
            current = parent
        else:
            if current.session_status == 'Cancelled' and lesson.make_up_for_id and lesson.session_status != 'Cancelled':
                flag('MAKEUP_CHAIN_REVIEW', 'A makeup is linked to a cancelled lesson. Check whether it should still be booked.')
            if ('Pending Make-up' in lesson.session_status and current.session_status != 'Cancelled'
                    and current.enrollment_id in by_block
                    and by_block[current.enrollment_id].payment_status != 'Cancelled'):
                pending_roots.add(current.id)

    sources = []
    active = [b for b in blocks if b.payment_status != 'Cancelled']
    groups = defaultdict(list)
    evidence_groups = defaultdict(list)
    for b in blocks:
        evidence_groups[slot_key(b)].append(b)
    for b in active:
        groups[slot_key(b)].append(b)
    for b in sorted(blocks, key=lambda b: (b.first_lesson_date or date.min, b.id), reverse=True):
        roots = sorted(original_rows[b.id], key=lambda r: (r.session_date, r.id))
        sources.append(BillingSourceBlock(
            enrollment_id=b.id, tutor_id=b.tutor_id, tutor_name=b.tutor_name,
            weekday=b.assigned_day, time_slot=b.assigned_time, location=b.location,
            first_lesson_date=b.first_lesson_date, lessons_recorded=b.lessons_paid,
            payment_status=b.payment_status, payment_date=b.payment_date,
            fee_message_marked_sent=b.fee_message_sent,
            renewed_from_enrollment_id=b.renewed_from_enrollment_id, is_new_student=b.is_new_student,
            originals=[RecordedOriginalLesson(id=r.id, date=r.session_date, status=r.session_status,
                                             holiday=r.session_date in holidays, time_slot=r.time_slot,
                                             location=r.location) for r in roots],
            last_original_date=roots[-1].session_date if roots else None,
            makeup_dates=sorted(s.session_date for s in descendants[b.id] if s.session_status != 'Cancelled'),
        ))
        if b.payment_status == 'Cancelled':
            continue
        if not roots:
            flag('MISSING_ORIGINALS', 'An enrollment has no regular lesson records. Check its sessions before collecting fees.')
        if b.lessons_paid != len(roots):
            flag('ORIGINAL_COUNT_REVIEW', 'The enrollment’s session count does not match its lesson records. Check cancelled or changed lessons.')
        if not b.first_lesson_date or slot_key(b)[0] not in DAYS:
            flag('INCOMPLETE_SCHEDULE', 'An enrollment needs a valid first lesson date and weekday. Check its timetable.')
        if b.payment_status not in SETTLED | PENDING:
            flag('PAYMENT_STATUS_REVIEW', 'An enrollment has an unknown payment status. Check whether it has been paid.')
        for root in roots:
            if (DAYS[root.session_date.weekday()] != slot_key(b)[0]
                    or (root.time_slot is not None and root.time_slot.strip() != slot_key(b)[1])
                    or (root.location is not None and root.location.strip() != slot_key(b)[2])):
                flag('OFF_SLOT_ORIGINALS', 'Some lessons do not match the enrollment’s timetable. Confirm the class to use for the next payment.')
            if root.session_date > policy.regular_end:
                flag('COVERAGE_AFTER_YEAR_END', 'A regular lesson falls after the teaching year ends. Check its date.')

    # Repeated roots at the same actual slot can represent duplicate renewals.
    positions = Counter((s.session_date, s.time_slot, s.location) for b in active for s in original_rows[b.id])
    if any(n > 1 for n in positions.values()):
        flag('OVERLAPPING_ORIGINALS', 'More than one regular lesson is recorded at the same date, time and branch. Check for duplicate enrollments.')

    def sort_block(b):
        return (b.first_lesson_date or date.min, b.id)

    representatives = [max(group, key=sort_block) for group in groups.values()]
    representatives.sort(key=sort_block, reverse=True)

    def upcoming_weeks(block):
        return {r.session_date.isocalendar()[:2] for b in groups[slot_key(block)] for r in original_rows[b.id]
                if r.session_status == 'Scheduled' and as_of <= r.session_date <= policy.regular_end}

    def is_successor(left, right):
        seen = set()
        current = left
        while current and current.id not in seen:
            seen.add(current.id)
            if current.renewed_from_enrollment_id == right.id:
                return True
            current = by_block.get(current.renewed_from_enrollment_id)
        return False

    if selected_enrollment_ids is not None:
        if not 1 <= len(selected_enrollment_ids) <= 2 or len(set(selected_enrollment_ids)) != len(selected_enrollment_ids):
            raise ValueError('Choose one or two different enrollments for the next payment.')
        selected = []
        for id_ in selected_enrollment_ids:
            b = by_block.get(id_)
            if b is None or b.payment_status == 'Cancelled':
                raise ValueError('Choose this student’s enrollments. Cancelled enrollments cannot be used.')
            selected.append(b)
        if len({slot_key(b) for b in selected}) != len(selected):
            raise ValueError('Choose each weekly class only once.')
        flag('SCHEDULE_SELECTION_SCENARIO', 'These classes are used for this preview only. The timetable has not changed.')
    else:
        selected = representatives[:1]
        if selected:
            primary_weeks = upcoming_weeks(selected[0])
            for candidate in representatives[1:]:
                weeks = upcoming_weeks(candidate)
                # An explicit renewal link says these schedules are successors.
                related = is_successor(candidate, selected[0]) or is_successor(selected[0], candidate)
                if weeks & primary_weeks and not related:
                    selected.append(candidate)
                elif weeks:
                    flag('TIMETABLE_CHANGE_REVIEW', 'Another timetable has upcoming lessons. Confirm which class the student will attend.')
    if len(selected) > 1:
        flag('CONTINUING_SLOTS_REVIEW', 'Check whether the student will attend both classes each week or is changing class.')
        if any(is_successor(left, right) or is_successor(right, left)
               for i, left in enumerate(selected) for right in selected[i + 1:]):
            flag('SUCCESSOR_SLOTS_SELECTED', 'One selected enrollment renews the other. Check that these are two weekly classes before combining their fees.')
    if len(selected) > 2:
        flag('TOO_MANY_SLOT_CANDIDATES', 'More than two weekly classes were found. Choose the classes to use for the next payment.')

    pending = [b for b in active if b.payment_status in PENDING]
    if pending:
        flag('PENDING_BILLS', 'This student has unpaid enrollments. Check them before collecting fees for the same lessons again.')
    if any(b.fee_message_sent for b in pending):
        flag('SENT_BILL_REVIEW', 'An unpaid enrollment is marked “Message sent”. Check that fee message before changing the requested fee.')
    if basis == 'include_pending' and pending:
        flag('PENDING_COVERAGE_ASSUMED', 'The next payment covers sessions after existing unpaid enrollments. Those enrollments still need payment.')
    upcoming_count = sum(r.session_status == 'Scheduled' and as_of <= r.session_date <= policy.regular_end
                         for b in active for r in original_rows[b.id])
    if not upcoming_count:
        flag('CONTINUATION_UNCONFIRMED', 'No upcoming regular lessons are recorded this teaching year. Check whether the student needs renewal or has stopped.')

    candidates = []
    slots = []
    starts = []
    selected_keys = {slot_key(b): b for b in selected}
    display_candidates = {slot_key(b): b for b in representatives}
    display_candidates.update(selected_keys)

    def gap_lesson(row):
        return BillingGapLesson(
            session_id=row.id, enrollment_id=row.enrollment_id, date=row.session_date,
            status=row.session_status, payment_status=by_block[row.enrollment_id].payment_status,
            time_slot=row.time_slot, location=row.location,
        )

    def gap_detail(day, key, representative, coverage_rows, evidence_rows):
        before = max((r for r in coverage_rows if r.session_date < day),
                     key=lambda r: (r.session_date, r.id), default=None)
        after = min((r for r in coverage_rows if r.session_date > day),
                    key=lambda r: (r.session_date, r.id), default=None)
        matching = [r for r in evidence_rows if r.session_date == day]
        before_ids = {r.enrollment_id for r in coverage_rows if r.session_date < day}
        after_ids = {r.enrollment_id for r in coverage_rows if r.session_date > day}
        enclosing_ids = before_ids & after_ids
        related_ids = enclosing_ids | {r.enrollment_id for r in (before, after) if r is not None}
        # A nearby original can explain why the weekly pattern differs. It
        # does not prove that this lesson replaced the questioned date.
        nearby = [r for r in evidence_rows
                  if r.enrollment_id in related_ids and r.session_status != 'Cancelled'
                  and by_block[r.enrollment_id].payment_status != 'Cancelled'
                  and 0 < abs((r.session_date - day).days) <= 6
                  and DAYS[r.session_date.weekday()] != key[0]]
        if any(r.session_status != 'Cancelled' and by_block[r.enrollment_id].payment_status in PENDING
               for r in matching):
            kind = 'recorded_unpaid'
        elif any(r.session_status == 'Cancelled' or by_block[r.enrollment_id].payment_status == 'Cancelled'
                 for r in matching):
            kind = 'recorded_cancelled'
        elif nearby:
            kind = 'timetable_difference'
        else:
            kind = 'within_enrollment' if enclosing_ids else 'between_enrollments'
        return BillingGapEvidence(
            date=day, weekday=key[0], time_slot=key[1], location=key[2],
            selected=key in selected_keys, enrollment_id=representative.id, kind=kind,
            before=gap_lesson(before) if before is not None else None,
            after=gap_lesson(after) if after is not None else None,
            matching_lessons=[gap_lesson(r) for r in matching],
            nearby_lessons=[gap_lesson(r) for r in nearby],
        )

    for key, b in display_candidates.items():
        group = groups[key]
        paid_rows = [r for e in group if e.payment_status in SETTLED for r in original_rows[e.id]]
        retained_rows = [r for e in group if e.payment_status in SETTLED or
                         (basis == 'include_pending' and e.payment_status in PENDING) for r in original_rows[e.id]]
        paid_dates = [r.session_date for r in paid_rows]
        retained_dates = [r.session_date for r in retained_rows]
        evidence_rows = sorted((r for e in evidence_groups[key] for r in all_original_rows[e.id]),
                               key=lambda r: (r.session_date, r.id))
        paid_end = max(paid_dates, default=None)
        retained_end = max(retained_dates, default=None)
        if key in selected_keys and not paid_dates and any(
                e.payment_status in SETTLED and slot_key(e) != key for e in active):
            flag('TIMETABLE_CHANGE_REVIEW', 'Paid lessons use another timetable. Confirm when the student changed class and check for any unpaid lessons.')
        roots = original_rows[b.id]
        openings = sorted({r.session_date for e in group for r in original_rows[e.id]
                           if r.session_date in holidays and DAYS[r.session_date.weekday()] == key[0]})
        for coverage_rows, code, message in (
            (paid_rows, 'PAID_COVERAGE_GAP', 'Check these dates against the paid enrollments.'),
            (retained_rows if basis == 'include_pending' else [], 'CONDITIONAL_COVERAGE_GAP',
             'Check these dates against the paid and unpaid enrollments.'),
        ):
            dates = {r.session_date for r in coverage_rows}
            if key[0] in DAYS and dates:
                # Earlier roots remain visible, but the loaded holiday
                # calendar only establishes cadence inside this teaching year.
                current = max(min(dates), policy.academic_start)
                current += timedelta(days=(DAYS.index(key[0]) - current.weekday()) % 7)
                gaps = []
                while current < max(dates):
                    if current not in dates and (current not in holidays or current in openings):
                        gaps.append(gap_detail(current, key, b, coverage_rows, evidence_rows))
                    current += timedelta(days=7)
                if gaps:
                    flag(code, message, gap_evidence=gaps)
        first = None
        if key[0] in DAYS and roots:
            current = retained_end + timedelta(days=1) if retained_end else min(r.session_date for r in roots)
            current += timedelta(days=(DAYS.index(key[0]) - current.weekday()) % 7)
            while current in holidays and current not in openings:
                current += timedelta(days=7)
            if current <= policy.regular_end:
                first = current
        candidates.append(ContinuingSlotCandidate(
            enrollment_id=b.id, weekday=b.assigned_day, time_slot=b.assigned_time, location=b.location,
            tutor_name=b.tutor_name, selected=key in selected_keys,
            last_paid_original_date=paid_end, last_retained_original_date=retained_end,
            first_uncovered_date=first,
        ))
        supported = len(b.assigned_time or '') <= 100 and len(b.location or '') <= 100
        if key in selected_keys and not supported:
            flag('UNSUPPORTED_SCHEDULE', 'A time or branch entry is too long to use. Check the enrollment details below.')
        if key in selected_keys and first and supported:
            starts.append(first)
            slots.append(PreviewSlot(weekday=key[0], time_slot=b.assigned_time or '', location=b.location or '',
                                     covered_through=retained_end or first - timedelta(days=1),
                                     holiday_exceptions=[d for d in openings if d >= first]))
        elif key in selected_keys and retained_end and retained_end > policy.regular_end:
            flag('COVERAGE_AFTER_YEAR_END', 'The selected enrollment has lessons after the teaching year ends. Check their dates.')
    suggestion = None
    if slots and len(slots) == len(selected) and len(slots) <= 2:
        first = min(starts)
        if first < as_of:
            flag('UNPAID_PAST_DATES', 'The next payment includes past sessions. Check attendance and existing enrollments before collecting fees.')
        if first < policy.academic_start:
            flag('PRE_YEAR_COVERAGE_REVIEW', 'The next payment includes sessions before this teaching year. Check the older enrollments first.')
        else:
            is_first_new = (basis == 'paid_only' and all(b.is_new_student for b in selected)
                            and not any(b.payment_status in SETTLED for b in active)
                            and first >= policy.transition_from)
            if is_first_new:
                for slot in slots:
                    slot.covered_through = None
                flag('FIRST_PAYMENT_REVIEW', 'This looks like the student’s first unpaid enrollment. Confirm the start date, trial deduction and materials fee.')
            suggestion = BillingPreviewRequest(
                first_lesson_date=first, slots=slots,
                mode='new_student' if is_first_new else 'transition' if first <= policy.transition_end else 'regular',
                materials_fee=None if is_first_new else 0,
            )
    if any(c.selected and c.first_uncovered_date is None for c in candidates) and slots:
        flag('PARTIAL_SLOT_FORECAST', 'A next payment could not be calculated for every selected class. Check each class’s enrollments.')

    fingerprint_data = {
        'student': student.model_dump(mode='json'), 'basis': basis, 'as_of': as_of,
        'policy': vars(policy),
        'blocks': [b.model_dump(mode='json') for b in sources],
        'lessons': [vars(s) for s in sorted(lessons, key=lambda s: s.id)],
        'selected': sorted(b.id for b in selected), 'holidays': sorted(holidays),
        'coupon': coupon_snapshot.model_dump(mode='json') if coupon_snapshot else None,
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, default=str, sort_keys=True).encode()).hexdigest()
    return StudentBillingContext(
        student=student, as_of=as_of, basis=basis, source_blocks=sources, slot_candidates=candidates,
        selected_enrollment_ids=[b.id for b in selected], upcoming_original_count=upcoming_count,
        pending_bill_count=len(pending), sent_pending_bill_count=sum(b.fee_message_sent for b in pending),
        pending_makeup_count=len(pending_roots), coupon_snapshot=coupon_snapshot,
        suggested_request=suggestion, issues=issues, requires_review=bool(issues), source_fingerprint=fingerprint,
    )
