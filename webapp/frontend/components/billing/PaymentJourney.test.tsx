import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PaymentJourney } from './PaymentJourney';
import type { BillingMethod, BillingPeriod, BillingPreviewResponse } from '@/types/billing';

const slots = [{ weekday: 'Fri' as const, time_slot: '16:45 - 18:15', location: 'MSA' }];
function period(number: number, notice: string | null, method: BillingMethod = 'manual'): BillingPeriod {
  return {
    number, kind: 'regular', explanation: 'These dates complete the calendar month.', coverage_from: '2026-12-18', coverage_through: '2027-01-31',
    first_lesson_date: '2026-12-18', last_lesson_date: '2027-01-29', lesson_count: 6,
    counts_by_month: [{ month: '2026-12', lessons: 2 }, { month: '2027-01', lessons: 4 }], counts_by_slot: [6],
    lessons: [{ date: '2026-12-18', slot: 0, weekday: 'Fri', time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: true }],
    gross_tuition: 2400, deductions: [{ kind: 'ordinary', amount: 300 }], tuition_after_deductions: 2100, materials_fee: 0, total_fee: 2100,
    adjustment_reason: null, requires_review: false,
    collection: { method, notice_from: notice, notice_to: notice?.replace(/12$/, '18') ?? null,
      debit_from: method === 'autopay' ? '2026-11-20' : null, debit_to: method === 'autopay' ? '2026-11-22' : null,
      due_before_lesson: method === 'manual' ? '2026-12-18' : null, gap_min_days: null, gap_max_days: null },
  };
}
function journey(method: BillingMethod, periods = [period(1, '2026-11-12', method)]): BillingPreviewResponse {
  return { policy_version: 'test', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30', payment_method: method,
    monthly: method === 'autopay', periods, skipped_collections: [{ month: '2026-12', covered_by_period: 1, reason: 'January is already included in payment 1.' }],
    issues: [], excluded_holidays: [], requires_review: false, is_preview: true, creates_records: false };
}
beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 }); });

describe('visual payment journey', () => {
  it('compares both plans by default and selects only the clicked skipped cycle', () => {
    render(<PaymentJourney journeys={{ manual: journey('manual'), autopay: journey('autopay') }} slots={slots} unitFee={400} />);
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Manual: no additional fee in December/ }));
    const chosen = screen.getAllByRole('button', { pressed: true }).filter(button => button.getAttribute('aria-label')?.includes('payment'));
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toHaveAccessibleName(/no additional fee/);
    const details = screen.getByLabelText('Selected payment details');
    expect(within(details).getByText(/January 2027 sessions are included/)).toBeInTheDocument();
    expect(screen.queryByText('January paid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Autopay' }));
    expect(screen.queryByRole('button', { name: /Manual payment/ })).not.toBeInTheDocument();
  });

  it('keeps an autopay-plan first payment manual and never substitutes an unknown total', () => {
    const first = period(1, null);
    first.total_fee = null; first.materials_fee = null;
    const result = journey('autopay', [first]);
    result.issues = [{ code: 'MATERIALS_UNCONFIRMED', period: 1, message: 'Confirm the materials fee.' }];
    render(<PaymentJourney journeys={{ autopay: result }} slots={slots} unitFee={400} />);
    const card = screen.getByRole('button', { name: /Autopay payment 1, total to confirm/ });
    expect(within(card).getByText('Manual', { exact: true })).toBeInTheDocument();
    expect(within(card).getByText('First payment is manual')).toBeInTheDocument();
    expect(within(card).getByText('Total to confirm')).toBeInTheDocument();
    const details = screen.getByLabelText('Selected payment details');
    expect(within(details).getAllByText('To confirm')).toHaveLength(2);
    fireEvent.click(within(details).getByText('Show 6 session dates'));
    expect(within(details).getByText('16:45 - 18:15 · MSA · Holiday lesson')).toBeVisible();
    expect(within(details).getByText('Confirm the materials fee.')).toBeInTheDocument();
  });

  it('changes the header range without moving focus or losing the selected payment', async () => {
    const user = userEvent.setup();
    const periods = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].map((month, i) => period(i + 1, `${month}-12`));
    const result = journey('manual', periods); result.skipped_collections = []; result.regular_end_date = '2027-06-28';
    render(<PaymentJourney journeys={{ manual: result }} slots={slots} unitFee={400} actions={<button>Edit preview</button>} />);
    const controls = screen.getByLabelText('Journey controls');
    const range = within(controls).getByRole('combobox', { name: 'Journey range' });
    expect(range).toHaveValue('next');
    expect(within(controls).getByRole('button', { name: 'Edit preview' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manual payment 5/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Manual payment 2/ }));
    await user.selectOptions(range, 'all');
    expect(range).toHaveFocus();
    expect(within(range).getByRole('option', { name: 'Through Jun 28, 2027' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manual payment 5/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manual payment 2/ })).toHaveAttribute('aria-pressed', 'true');
    await user.selectOptions(range, 'next');
    expect(range).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Manual payment 5/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manual payment 2/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Show through|Show next cycles/ })).not.toBeInTheDocument();
  });

  it('keeps global coupon checks visible and scopes bank setup notes to the autopay plan', () => {
    const manual = journey('manual');
    const autopay = journey('autopay');
    manual.issues = [{ code: 'COUPON_UNVERIFIED', period: null, message: 'Check the available coupon in KMS.' }];
    autopay.issues = [...manual.issues, { code: 'MANDATE_NOT_READY', period: null, message: 'Complete the bank mandate before the debit.' }];
    render(<PaymentJourney journeys={{ manual, autopay }} slots={slots} unitFee={400} />);
    const manualChecks = screen.getByLabelText('Manual plan checks');
    expect(within(manualChecks).getAllByText('Check coupon in KMS', { selector: 'span' })[0]).toBeVisible();
    expect(within(manualChecks).queryByText('Check autopay setup')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('Autopay plan checks')).getAllByText('Check autopay setup', { selector: 'span' })[0]).toBeVisible();
    const details = screen.getByLabelText('Selected payment details');
    expect(within(details).getByText('Check the available coupon in KMS.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }));
    expect(screen.queryByLabelText('Autopay plan checks')).not.toBeInTheDocument();
    expect(screen.queryByText('Complete the bank mandate before the debit.')).not.toBeInTheDocument();
    expect(screen.queryByText('Check autopay setup')).not.toBeInTheDocument();
  });

  it('keeps saved-coupon information neutral and shows actionable unknown-total checks on unselected cards', () => {
    const first = period(1, '2026-11-12');
    const second = period(2, '2027-01-12');
    second.total_fee = null;
    second.materials_fee = null;
    const result = journey('manual', [first, second]);
    result.issues = [
      { code: 'COUPON_SAVED', period: 1, message: 'Save this coupon for a later payment.' },
      { code: 'MATERIALS_UNCONFIRMED', period: 2, message: 'Confirm the materials fee.' },
    ];
    render(<PaymentJourney journeys={{ manual: result }} slots={slots} unitFee={400} />);
    const firstCard = screen.getByRole('button', { name: /Manual payment 1/ });
    expect(within(firstCard).getByText('Coupon saved for later')).not.toHaveClass('bg-amber-100');
    expect(within(firstCard).queryByText(/checks|Review/)).not.toBeInTheDocument();
    const unknownCard = screen.getByRole('button', { name: /Manual payment 2, total to confirm/ });
    expect(unknownCard).toHaveAttribute('aria-pressed', 'false');
    expect(within(unknownCard).getByText('Confirm materials fee')).toBeVisible();
    expect(within(unknownCard).getByText('Total to confirm')).toBeVisible();
  });

  it('keeps holiday exclusions and final-year cutoffs inside the affected session details', () => {
    const final = period(1, '2027-05-12');
    final.coverage_from = '2027-06-01';
    final.coverage_through = '2027-07-04';
    final.first_lesson_date = '2027-06-04';
    final.last_lesson_date = '2027-07-02';
    final.lessons = [{ ...final.lessons[0], date: '2027-06-04', holiday_exception: false }];
    const result = journey('manual', [final]);
    result.skipped_collections = [];
    result.excluded_holidays = ['2027-04-02', '2027-06-11', '2027-07-09'];
    render(<PaymentJourney journeys={{ manual: result }} slots={slots} unitFee={400} />);
    const details = screen.getByLabelText('Selected payment details');
    expect(within(details).getByText('Teaching year ends')).not.toBeVisible();
    fireEvent.click(within(details).getByText('Show 6 session dates'));
    expect(within(details).getByText('Teaching year ends')).toBeVisible();
    expect(within(details).getByText('Makeup deadline')).toBeVisible();
    within(details).getAllByText('Jul 4, 2027').forEach(element => expect(element).toBeVisible());
    expect(within(details).getByText('Jun 30, 2027')).toBeVisible();
    expect(within(details).getByText('Holidays excluded: Jun 11, 2027')).toBeVisible();
    expect(within(details).queryByText(/Apr 2, 2027|Jul 9, 2027/)).not.toBeInTheDocument();
  });

  it('opens the mobile sheet from the keyboard, contains focus and returns to that card after Escape', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const user = userEvent.setup();
    render(<PaymentJourney journeys={{ manual: journey('manual') }} slots={slots} unitFee={400} />);
    const card = screen.getByRole('button', { name: /Manual: no additional fee/ });
    card.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Payment details' });
    const close = within(dialog).getByRole('button', { name: 'Close modal' });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(within(dialog).getByText('Why these sessions?')).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(card).toHaveFocus());
    expect(screen.queryByLabelText('Selected payment details')).not.toBeInTheDocument();
  });
});
