import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BillingDraftReview, BillingPeriod, BillingPreviewResponse, BillingWeekday } from '@/types/billing';
import { RenewalSessionPreview } from './RenewalSessionPreview';

function lesson(date: string, options: Partial<BillingPeriod['lessons'][number]> = {}): BillingPeriod['lessons'][number] {
  const weekdays: BillingWeekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { date, weekday: weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()], slot: 0,
    time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false, ...options };
}

function review(lessons = ['2026-12-04', '2026-12-11', '2026-12-18'].map(date => lesson(date))): BillingDraftReview {
  return {
    student: { id: 4, student_name: 'Example student', school_student_id: '004', home_location: 'MSA',
      grade: 'F1', school: null, lang_stream: null, is_staff_referral: false },
    source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy',
    scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', time_slot: '16:45 - 18:15', location: 'MSA' }],
      mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
    basis: 'include_pending', selected_enrollment_ids: [10], confirmed_checks: [], review_hash: 'review', issues: [],
    message: { template_version: 'template', zh: 'Example fee message', en: 'Example fee message', blocked_reasons: [] },
    period: { number: 1, kind: 'transition', explanation: '', coverage_from: lessons[0].date, coverage_through: '2026-12-31',
      first_lesson_date: lessons[0].date, last_lesson_date: lessons.at(-1)!.date, lesson_count: lessons.length,
      counts_by_month: [{ month: '2026-12', lessons: lessons.length }], counts_by_slot: [lessons.length], lessons,
      gross_tuition: lessons.length * 400, deductions: [], tuition_after_deductions: lessons.length * 400,
      materials_fee: 0, total_fee: lessons.length * 400, adjustment_reason: null, requires_review: false,
      collection: { method: 'manual', notice_from: null, notice_to: null, debit_from: null, debit_to: null,
        due_before_lesson: lessons[0].date, gap_min_days: null, gap_max_days: null } },
  };
}

function calculation(value: BillingDraftReview, excluded_holidays: string[] = []): BillingPreviewResponse {
  return { policy_version: value.policy_version, regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30',
    payment_method: value.scenario.payment_method, monthly: false, periods: [structuredClone(value.period)],
    skipped_collections: [], excluded_holidays, issues: [], requires_review: false, is_preview: true, creates_records: false };
}

function rows() {
  return within(screen.getByRole('table', { name: 'Sessions included in this enrollment' }))
    .getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell').map(cell => cell.textContent));
}

describe('renewal session preview', () => {
  it('keeps the old numbered date/status layout and shows skipped holidays without charging them', () => {
    const value = review();
    render(<RenewalSessionPreview review={value} calculation={calculation(value, ['2026-12-25', '2026-12-08', '2027-01-01', '2026-11-27'])} />);
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['#', 'Date', 'Status']);
    expect(rows()).toEqual([
      ['1', 'Fri, Dec 4, 2026', 'OK'], ['2', 'Fri, Dec 11, 2026', 'OK'],
      ['3', 'Fri, Dec 18, 2026', 'OK'], ['-', 'Fri, Dec 25, 2026', 'Holiday skipped'],
    ]);
    expect(screen.getByText('3 sessions')).toBeInTheDocument();
    expect(screen.getByText('Dec 18, 2026')).toBeInTheDocument();
    expect(screen.queryByText('16:45 - 18:15')).not.toBeInTheDocument();
    expect(screen.queryByText('MSA')).not.toBeInTheDocument();
  });

  it('shows holidays before the first charged session when they follow the selected start', () => {
    const value = review(['2027-01-08', '2027-01-15'].map(date => lesson(date)));
    value.scenario.first_lesson_date = '2026-12-25';
    value.period.coverage_through = '2027-01-31';
    render(<RenewalSessionPreview review={value} calculation={calculation(value, ['2026-12-25', '2027-01-01'])} />);
    expect(rows().map(row => [row[0], row[1], row[2]])).toEqual([
      ['-', 'Fri, Dec 25, 2026', 'Holiday skipped'], ['-', 'Fri, Jan 1, 2027', 'Holiday skipped'],
      ['1', 'Fri, Jan 8, 2027', 'OK'], ['2', 'Fri, Jan 15, 2027', 'OK'],
    ]);
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
  });

  it.each(['policy', 'method', 'period', 'missing'] as const)('withholds extra calendar rows for a %s calculation mismatch', mismatch => {
    const value = review();
    const preview = calculation(value, ['2026-12-25']);
    if (mismatch === 'policy') preview.policy_version = 'older';
    if (mismatch === 'method') preview.payment_method = 'autopay';
    if (mismatch === 'period') preview.periods[0].lessons.push(lesson('2026-12-25'));
    render(<RenewalSessionPreview review={value} calculation={mismatch === 'missing' ? undefined : preview} />);
    expect(rows()).toHaveLength(3);
    expect(screen.queryByText('Holiday skipped')).not.toBeInTheDocument();
    expect(screen.queryByText('Fri, Dec 25, 2026')).not.toBeInTheDocument();
  });

  it('keeps a running holiday class charged while another class on that date is skipped', () => {
    const value = review([lesson('2026-12-25', { holiday_exception: true })]);
    value.scenario.slots = [
      { weekday: 'Fri', time_slot: '16:45 - 18:15', location: 'MSA', holiday_exceptions: ['2026-12-25'] },
      { weekday: 'Fri', time_slot: '18:30 - 20:00', location: 'MSB' },
    ];
    value.period.counts_by_slot = [1, 0];
    render(<RenewalSessionPreview review={value} calculation={calculation(value, ['2026-12-25', '2026-12-25'])} />);
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['#', 'Date', 'Class', 'Status']);
    expect(rows()).toEqual([
      ['1', 'Fri, Dec 25, 2026', '16:45 - 18:15 @ MSA', 'Holiday class'],
      ['-', 'Fri, Dec 25, 2026', '18:30 - 20:00 @ MSB', 'Holiday skipped'],
    ]);
    expect(screen.getByText('1 session')).toBeInTheDocument();
  });

  it.each([false, true])('respects prior periods and paid slot coverage (January already covered: %s)', alreadyCovered => {
    const value = review([lesson('2027-01-08')]);
    value.scenario.first_lesson_date = '2026-12-04';
    value.scenario.slots[0].covered_through = alreadyCovered ? '2027-01-01' : '2026-11-30';
    value.period.number = 2;
    value.period.coverage_through = '2027-01-31';
    const preview = calculation(value, ['2026-12-25', '2027-01-01']);
    preview.periods.unshift({ ...review().period, coverage_through: '2026-12-31' });
    render(<RenewalSessionPreview review={value} calculation={preview} />);
    expect(screen.queryByText('Fri, Dec 25, 2026')).not.toBeInTheDocument();
    expect(rows()).toHaveLength(alreadyCovered ? 1 : 2);
    expect(screen.queryByText('Holiday skipped') !== null).toBe(!alreadyCovered);
  });

  it('does not describe uncertain dates as OK or invent a specific conflicting date', () => {
    const value = review();
    value.issues = [{ code: 'RENEWAL_SESSION_CONFLICT', message: 'The two classes overlap.', period: 1 }];
    render(<RenewalSessionPreview review={value} calculation={calculation(value, ['2026-12-25'])} />);
    expect(screen.getByRole('status')).toHaveTextContent('Check session conflicts.');
    expect(screen.getAllByText('Check schedule')).toHaveLength(3);
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
    expect(screen.getByText('Holiday skipped')).toBeInTheDocument();
  });

  it('keeps unrelated later-period checks out of the current session status', () => {
    const value = review();
    value.issues = [{ code: 'RENEWAL_SESSION_CONFLICT', message: 'Later conflict.', period: 2 }];
    render(<RenewalSessionPreview review={value} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByText('OK')).toHaveLength(3);
  });

  it('shows actual timetable variations even within one weekly slot', () => {
    const value = review([lesson('2026-12-04'), lesson('2026-12-11', { time_slot: '17:00 - 18:30', location: 'MSB' })]);
    render(<RenewalSessionPreview review={value} />);
    expect(screen.getByRole('columnheader', { name: 'Class' })).toBeInTheDocument();
    expect(screen.getByText('17:00 - 18:30 @ MSB')).toBeInTheDocument();
  });
});
