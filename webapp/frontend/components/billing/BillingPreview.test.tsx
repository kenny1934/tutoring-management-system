import { act, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BillingPreview } from './BillingPreview';
import type { BillingPreviewResponse } from '@/types/billing';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), auth: vi.fn(), params: vi.fn(), review: vi.fn() }));
const options = {
  academic_start: '2026-09-01', first_payment_from: '2026-10-30', regular_end: '2027-07-04', makeup_end: '2027-06-30',
  unit_fee: 400, first_minimum: 6, ordinary_coupon_minimum: 4, policy_version: 'test',
};
vi.mock('./BillingCouponPanel', () => ({ BillingCouponPanel: () => null }));
vi.mock('next/navigation', () => ({ useSearchParams: mocks.params }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/hooks', () => ({ usePageTitle: vi.fn() }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: vi.fn(), preview: mocks.preview } }));
vi.mock('swr', () => ({ default: (key: string) => ({ data: key === 'locations' ? ['MSA', 'Various', 'MSB', 'All Locations'] : options, mutate: vi.fn() }) }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

vi.mock('./BillingDraftReview', () => ({ BillingDraftReview: (props: { inline?: boolean; reviewRequest: { period_number: number } }) => { mocks.review(props); return <p>Review period {props.reviewRequest.period_number}</p>; } }));

function response(): BillingPreviewResponse {
  return {
    policy_version: 'test', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30', payment_method: 'manual',
    monthly: true, is_preview: true, creates_records: false, requires_review: false, issues: [], excluded_holidays: [],
    skipped_collections: [{ month: '2026-12', covered_by_period: 1, reason: 'January is already included in payment 1.' }],
    periods: [{
      number: 1, kind: 'first', explanation: 'Six lessons across the weekly slots.', coverage_from: '2026-11-10',
      coverage_through: '2026-11-30', first_lesson_date: '2026-11-10', last_lesson_date: '2026-11-26',
      lesson_count: 6, counts_by_month: [{ month: '2026-11', lessons: 6 }], counts_by_slot: [3, 3],
      lessons: [{ date: '2026-11-10', slot: 0, weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }],
      gross_tuition: 2400, deductions: [{ kind: 'trial', amount: 150 }], tuition_after_deductions: 2250,
      materials_fee: 0, total_fee: 2250, adjustment_reason: null, requires_review: false,
      collection: { method: 'manual', due_before_lesson: '2026-11-10', notice_from: null, notice_to: null,
        debit_from: null, debit_to: null, gap_min_days: null, gap_max_days: null },
    }],
  };
}

function render(ui: React.ReactElement) {
  const view = renderBase(ui);
  fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
  return view;
}

async function calculate() {
  await act(async () => { vi.advanceTimersByTime(301); await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.params.mockReturnValue(new URLSearchParams());
  mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: false, isGuest: false });
  mocks.preview.mockReset().mockResolvedValue(response());
  mocks.review.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('enrollment fee preview', () => {
  it('preserves intake dates, tutor, materials waiver and period exception when saved payment settings refresh', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    const initial = { first_lesson_date: '2026-11-10', mode: 'new_student' as const, payment_method: 'manual' as const, slots: [{ weekday: 'Tue' as const, time_slot: '16:45 - 18:15', location: 'MSA' }], materials_fee: 100, trial_deduction: true, mandate_ready: false };
    const intake = { trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }] };
    const props = { focused: true, embedded: true, initialRequest: initial, sourceKey: 'original', intake, defaultMaterialsFee: 100,
      intakeTutors: [{ id: 9, tutor_name: 'Tutor Nine' }, { id: 12, tutor_name: 'Tutor Twelve' }],
      draftContext: { studentId: 4, basis: 'include_pending' as const, selectedEnrollmentIds: [], sourceFingerprint: 'original' } };
    const view = renderBase(<BillingPreview {...props} />);
    await calculate();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-17' } });
    fireEvent.change(screen.getByLabelText('Tutor'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Reason for materials adjustment'), { target: { value: 'Materials waived.' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.click(screen.getByLabelText('Compare an adjusted first payment'));
    fireEvent.change(screen.getByLabelText('Cover through'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Reason for adjustment'), { target: { value: 'Approved shorter first period.' } });
    view.rerender(<BillingPreview {...props} sourceLoading />);
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    const freshProps = { ...props, initialRequest: { ...initial, payment_method: 'autopay' as const }, sourceKey: 'new-preference', draftContext: { ...props.draftContext, sourceFingerprint: 'new-preference' } };
    view.rerender(<BillingPreview {...freshProps} />);
    expect(screen.getByLabelText('Cover through')).toHaveValue('2026-11-30');
    expect(screen.getByLabelText('Reason for adjustment')).toHaveValue('Approved shorter first period.');
    fireEvent.click(screen.getByRole('tab', { name: 'Enrollment & fees' }));
    expect(screen.getByLabelText('First regular lesson')).toHaveValue('2026-11-17');
    expect(screen.getByLabelText('Tutor')).toHaveValue('12');
    expect(screen.getByLabelText('Materials charge')).toHaveValue(0);
    expect(screen.getByLabelText('Reason for materials adjustment')).toHaveValue('Materials waived.');
    fireEvent.click(screen.getByRole('button', { name: 'Back to renewal' }));
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ expected_source_fingerprint: 'new-preference',
      scenario: expect.objectContaining({ first_lesson_date: '2026-11-17', payment_method: 'autopay', materials_fee: 0, adjustment: { through: '2026-11-30', reason: 'Approved shorter first period.' } }),
      intake: expect.objectContaining({ slots: [{ tutor_id: 12, renewed_from_enrollment_id: 70 }], materials_override_reason: 'Materials waived.' }) }) }));
  });

  it('keeps the intake tutor mapping aligned and withholds review until every class has a tutor', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2026-11-10', mode: 'new_student', payment_method: 'manual', slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' }], materials_fee: 100, trial_deduction: true, mandate_ready: false }}
      intake={{ trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }] }}
      intakeTutors={[{ id: 9, tutor_name: 'Tutor Nine' }, { id: 12, tutor_name: 'Tutor Twelve' }]} defaultMaterialsFee={100}
      draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ intake: expect.objectContaining({ slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }] }) }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add second weekly class' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to renewal' }));
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.change(screen.getAllByLabelText('Tutor')[1], { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to renewal' }));
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ intake: expect.objectContaining({ slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }, { tutor_id: 12 }] }) }) }));
  });

  it('requires an admin reason before reviewing a materials waiver and preserves it with the exact payment', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    renderBase(<BillingPreview focused embedded initialRequest={{ first_lesson_date: '2026-11-10', mode: 'new_student', payment_method: 'manual', slots: [{ weekday: 'Tue' }], materials_fee: 100, trial_deduction: false, mandate_ready: false }}
      intake={{ slots: [{ tutor_id: 9 }] }} defaultMaterialsFee={100} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: 'source' }} />);
    await calculate();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to renewal' }));
    await calculate();
    expect(screen.queryByText('Review period 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.change(screen.getByLabelText('Reason for materials adjustment'), { target: { value: 'Materials waived for this intake.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to renewal' }));
    await calculate();
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequest: expect.objectContaining({ scenario: expect.objectContaining({ materials_fee: 0 }), intake: { slots: [{ tutor_id: 9 }], materials_override_reason: 'Materials waived for this intake.' } }) }));
  });

  it('focuses one exact reviewed period and keeps editing inside the renewal pane', async () => {
    const data = response(); data.periods = [{ ...data.periods[0], number: 1 }, { ...data.periods[0], number: 3 }];
    mocks.preview.mockResolvedValue(data);
    renderBase(<BillingPreview focused embedded focusedPeriodNumber={3} initialRequest={{ first_lesson_date: '2026-11-10', mode: 'transition', payment_method: 'manual', slots: [{ weekday: 'Tue' }], materials_fee: 0, trial_deduction: false, mandate_ready: false }} draftContext={{ studentId: 4, basis: 'include_pending', selectedEnrollmentIds: [7, 8], sourceFingerprint: 'current-source' }} />);
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.review).toHaveBeenLastCalledWith(expect.objectContaining({ inline: true, reviewRequest: expect.objectContaining({ period_number: 3, basis: 'include_pending', selected_enrollment_ids: [7, 8], expected_source_fingerprint: 'current-source' }) }));
    expect(screen.getByText('Review period 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Payment journey')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('First session to charge')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to renewal' }));
    expect(screen.getByText('Review period 3')).toBeInTheDocument();
  });

  it('opens settings on demand and preserves edits when closed and reopened', async () => {
    vi.useRealTimers();
    renderBase(<BillingPreview couponSnapshot={{ remaining_count: 2, cached_value: '300.00', synced_at_utc: '2026-10-10T12:00:00', verified: false }} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('First regular lesson')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit preview' });
    await waitFor(() => expect(within(dialog).getByRole('heading', { name: 'Sessions' })).toBeVisible());
    expect(within(dialog).getByRole('heading', { name: 'Discounts and materials' })).toBeVisible();
    expect(within(dialog).getByText('2 coupons')).toBeVisible();
    expect(within(dialog).getByText('Check KMS before use.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByLabelText('Payment journey')).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit preview' })).toHaveFocus());
    expect(screen.queryByText('Calendar and year-end dates')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment settings')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    expect(screen.getByLabelText('First regular lesson')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('Materials charge')).toHaveValue(0);
    expect(screen.queryByText('Checked in KMS')).not.toBeInTheDocument();
  });

  it('contains keyboard focus and returns it to Edit preview after Escape', async () => {
    vi.useRealTimers();
    renderBase(<BillingPreview />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit preview' });
    const close = within(dialog).getByRole('button', { name: 'Close modal' });
    const done = within(dialog).getByRole('button', { name: 'Done' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(done).toHaveFocus();
    fireEvent.keyDown(done, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit preview' })).toHaveFocus());
  });

  it('keeps the editor and coupon choices while rebasing source dates without showing old totals', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const,
      materials_fee: 0, trial_deduction: false, mandate_ready: false,
      slots: [{ weekday: 'Tue' as const, covered_through: '2026-11-03' }] };
    const view = render(<BillingPreview embedded initialRequest={initial} sourceKey="old-source" />);
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'ordinary' } });
    fireEvent.change(screen.getByLabelText('Coupon amount'), { target: { value: '300' } });
    await calculate();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$2,250')).toBeInTheDocument();
    view.rerender(<BillingPreview embedded initialRequest={initial} sourceKey="old-source" sourceLoading />);
    expect(screen.getByRole('dialog', { name: 'Edit preview' })).toBeInTheDocument();
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Coupon amount')).toHaveValue(300);
    expect(screen.getByLabelText('First session to charge')).toBeDisabled();
    const fresh = response(); fresh.periods[0].total_fee = 1900;
    mocks.preview.mockResolvedValue(fresh);
    view.rerender(<BillingPreview embedded initialRequest={{ ...initial, first_lesson_date: '2026-12-15', slots: [{ weekday: 'Tue', covered_through: '2026-12-08' }] }} sourceKey="new-source" />);
    expect(screen.getByLabelText('First session to charge')).toHaveValue('2026-12-15');
    expect(screen.getByLabelText('Coupon amount')).toHaveValue(300);
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ first_lesson_date: '2026-12-15', coupon: expect.objectContaining({ value: 300 }) }), expect.any(AbortSignal));
    expect(screen.getByRole('dialog', { name: 'Edit preview' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$1,900')).toBeInTheDocument();
  });

  it('requires a materials amount when source changes reveal a first enrollment', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const,
      materials_fee: 0, trial_deduction: false, mandate_ready: false, slots: [{ weekday: 'Tue' as const }] };
    const view = render(<BillingPreview embedded initialRequest={initial} sourceKey="existing" />);
    await calculate();
    const unknown = response(); unknown.periods[0].materials_fee = null; unknown.periods[0].total_fee = null;
    mocks.preview.mockResolvedValue(unknown);
    const first = { ...initial, mode: 'new_student' as const, materials_fee: null };
    view.rerender(<BillingPreview embedded initialRequest={first} sourceKey="first-enrollment" />);
    expect(screen.getByLabelText('Materials charge')).toHaveValue(null);
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'new_student', materials_fee: null }), expect.any(AbortSignal));
    expect(screen.getAllByText('Total to confirm').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '200' } });
    view.rerender(<BillingPreview embedded initialRequest={{ ...first, first_lesson_date: '2026-11-17' }} sourceKey="updated-first-enrollment" />);
    expect(screen.getByLabelText('Materials charge')).toHaveValue(200);
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ materials_fee: 200 }), expect.any(AbortSignal));
  });

  it('invalidates coupon verification when a newer import changes the available evidence', async () => {
    const snapshot = { remaining_count: 1, cached_value: '300.00', synced_at_utc: '2026-10-10T12:00:00', verified: false };
    const view = render(<BillingPreview couponSnapshot={snapshot} />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'ordinary' } });
    fireEvent.change(screen.getByLabelText('Coupon amount'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Coupon expiry'), { target: { value: '2027-07-01' } });
    fireEvent.change(screen.getByLabelText('Remaining coupon count'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Checked in KMS'));
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ verified: true }) }), expect.any(AbortSignal));
    view.rerender(<BillingPreview couponSnapshot={{ ...snapshot, remaining_count: 0, synced_at_utc: '2026-10-18T12:00:00' }} />);
    expect(screen.getByLabelText('Checked in KMS')).not.toBeChecked();
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ coupon: expect.objectContaining({ verified: false, value: 300 }) }), expect.any(AbortSignal));
  });

  it('shows source errors and retry inside the open editor instead of a permanent loader', async () => {
    const initial = { first_lesson_date: '2026-11-10', mode: 'transition' as const, payment_method: 'manual' as const,
      materials_fee: 0, trial_deduction: false, mandate_ready: false,
      slots: [{ weekday: 'Tue' as const, covered_through: '2026-11-03', holiday_exceptions: ['2026-11-10'] }] };
    const retry = vi.fn();
    render(<BillingPreview embedded initialRequest={initial} sourceLoading sourceError="Records could not be refreshed." onRetrySource={retry} />);
    const dialog = screen.getByRole('dialog', { name: 'Edit preview' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Records could not be refreshed.');
    expect(within(dialog).queryByText('Refreshing enrollment records…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    expect(screen.getByLabelText('Existing coverage through')).toBeDisabled();
    expect(screen.getByLabelText('Holiday class date')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add class on a holiday' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry records' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('keeps holiday exceptions out of routine settings and supports keyboard settings tabs', async () => {
    render(<BillingPreview />);
    expect(screen.getByRole('tab', { name: 'Enrollment & fees' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Add class on a holiday' })).not.toBeInTheDocument();
    const adjustments = screen.getByRole('tab', { name: 'Adjustments' });
    const scrollBody = screen.getByRole('dialog').querySelector<HTMLElement>('.overflow-y-auto')!;
    scrollBody.scrollTop = 400;
    fireEvent.click(adjustments);
    expect(scrollBody.scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: 'Add class on a holiday' })).toBeInTheDocument();
    expect(screen.getByText('Add an exception only when a regular class will run on a holiday.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add class on a holiday' }));
    expect(screen.getByLabelText('Holiday class date')).toBeInTheDocument();
    scrollBody.scrollTop = 200;
    fireEvent.keyDown(adjustments, { key: 'ArrowLeft' });
    expect(scrollBody.scrollTop).toBe(0);
    expect(screen.getByRole('tab', { name: 'Enrollment & fees' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Add class on a holiday' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Enrollment & fees' }), { key: 'End' });
    expect(adjustments).toHaveFocus();
    expect(screen.getByLabelText('Holiday class date')).toBeInTheDocument();
    await calculate();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it('excludes placeholder locations even when supplied in the link or initial timetable', async () => {
    mocks.params.mockReturnValue(new URLSearchParams('location=Various'));
    const view = render(<BillingPreview />);
    let branch = screen.getByLabelText('Branch');
    expect(branch).toHaveValue('');
    expect(within(branch).queryByRole('option', { name: 'Various' })).not.toBeInTheDocument();
    expect(within(branch).queryByRole('option', { name: 'All Locations' })).not.toBeInTheDocument();
    fireEvent.change(branch, { target: { value: 'MSB' } });
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ location: 'MSB' })] }), expect.any(AbortSignal));
    fireEvent.click(screen.getByLabelText('Enter a custom timetable'));
    fireEvent.change(screen.getByLabelText('Custom branch for class 1'), { target: { value: 'Various' } });
    expect(screen.getByLabelText('Custom branch for class 1')).toHaveValue('');
    fireEvent.click(screen.getByLabelText('Enter a custom timetable'));
    expect(screen.getByLabelText('Branch')).toHaveValue('');
    await calculate();
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ location: '' })] }), expect.any(AbortSignal));
    view.unmount();
    render(<BillingPreview initialRequest={{ first_lesson_date: '2026-11-10', mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false, slots: [{ weekday: 'Tue', location: 'Various' }] }} />);
    branch = screen.getByLabelText('Branch');
    expect(branch).toHaveValue('');
    expect(within(branch).queryByRole('option', { name: 'Various' })).not.toBeInTheDocument();
  });

  it('waits for both methods so the comparison cannot mix different calculations', async () => {
    let finishAutopay!: (value: BillingPreviewResponse) => void;
    mocks.preview.mockImplementation((request: { payment_method: string }) => request.payment_method === 'autopay'
      ? new Promise(resolve => { finishAutopay = resolve; }) : Promise.resolve(response()));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Payment journey')).not.toBeInTheDocument();
    await act(async () => finishAutopay(response()));
    expect(screen.getByLabelText('Payment journey')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores late responses after new dates have already calculated', async () => {
    const old: ((value: BillingPreviewResponse) => void)[] = [];
    mocks.preview.mockImplementation(() => new Promise(resolve => old.push(resolve)));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    const fresh = response();
    fresh.periods[0].total_fee = 1900;
    mocks.preview.mockResolvedValue(fresh);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-17' } });
    await calculate();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$1,900')).toBeVisible();
    await act(async () => old.forEach(resolve => resolve(response())));
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$1,900')).toBeVisible();
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
  });
  it('waits for a start date and shows exact dates, deductions and skipped collections', async () => {
    render(<BillingPreview />);
    expect(mocks.preview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'trial' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      first_lesson_date: '2026-11-10', slots: [{ weekday: 'Tue' }], trial_deduction: true, materials_fee: 0,
    });
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$2,250')).toBeInTheDocument();
    expect(screen.getByText('Trial deduction')).toBeInTheDocument();
    expect(screen.getAllByText('No additional fee')).toHaveLength(2);
    fireEvent.click(screen.getByText('Show 6 session dates'));
    expect(screen.getByText('Nov 10, 2026 (Tue)')).toBeInTheDocument();
  });

  it('hides a stale result as soon as its inputs change', async () => {
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Materials charge'), { target: { value: '0' } });
    await calculate();
    expect(within(screen.getByLabelText('Selected payment details')).getByText('$2,250')).toBeInTheDocument();
    mocks.preview.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-17' } });
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    await calculate();
    expect(screen.getByText('Updating preview…')).toBeInTheDocument();
  });

  it('never combines the trial deduction with a selected coupon', async () => {
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: 'ordinary' } });
    fireEvent.change(screen.getByLabelText('Coupon amount'), { target: { value: '300' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({ trial_deduction: false, coupon: { kind: 'ordinary', verified: false } });
  });

  it('keeps unknown totals visibly unresolved', async () => {
    const data = response();
    data.periods[0].total_fee = null;
    data.periods[0].materials_fee = null;
    data.issues = [{ code: 'MATERIALS_UNCONFIRMED', period: 1, message: 'Confirm the materials charge or waiver.' }];
    mocks.preview.mockResolvedValue(data);
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(screen.getAllByText('Total to confirm')).toHaveLength(2);
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
    expect(screen.getAllByText('Confirm materials fee').length).toBeGreaterThan(0);
    expect(screen.getByText('Confirm the materials charge or waiver.')).toBeInTheDocument();
  });

  it('offers admin adjustments only to admins and requires a reason before recalculating', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, isLoading: false, isAdmin: true, isGuest: false });
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-11' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.click(screen.getByLabelText('Compare an adjusted first payment'));
    await calculate();
    expect(mocks.preview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Cover through'), { target: { value: '2026-11-30' } });
    fireEvent.change(screen.getByLabelText('Reason for adjustment'), { target: { value: 'Agreed shorter first month' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].adjustment).toEqual({ through: '2026-11-30', reason: 'Agreed shorter first month' });
  });

  it('does not offer tutors an admin adjustment', () => {
    render(<BillingPreview />);
    expect(screen.queryByLabelText('Compare an adjusted first payment')).not.toBeInTheDocument();
  });

  it('prefills a proposed slot after a trial without including student identifiers', async () => {
    mocks.params.mockReturnValue(new URLSearchParams('trial_date=2026-11-03&time_slot=16%3A45+-+18%3A15&location=MSA'));
    render(<BillingPreview />);
    await calculate();
    expect(screen.getByLabelText('First regular lesson')).toHaveValue('2026-11-10');
    expect(mocks.preview.mock.calls[0][0].slots[0]).toMatchObject({ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA' });
    expect(mocks.preview.mock.calls[0][0]).not.toHaveProperty('student_id');
    expect(screen.getByText(/Confirm the first regular lesson after the trial/)).toBeInTheDocument();
  });

  it('shows a calculation failure without leaving the old amount on screen', async () => {
    mocks.preview.mockRejectedValue(new Error('The first lesson is a holiday.'));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(screen.getByRole('alert')).toHaveTextContent('The first lesson is a holiday.');
    expect(screen.queryByText('$2,250')).not.toBeInTheDocument();
  });

  it('keeps a holiday opening attached to its own weekly slot', async () => {
    render(<BillingPreview />);
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.change(screen.getByLabelText('Preview for'), { target: { value: 'transition' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Enrollment & fees' }));
    fireEvent.change(screen.getByLabelText('First session to charge'), { target: { value: '2026-10-23' } });
    fireEvent.click(screen.getByText('Add second weekly class'));
    fireEvent.click(screen.getByRole('tab', { name: 'Adjustments' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add class on a holiday' })[0]);
    fireEvent.change(screen.getByLabelText('Holiday class date'), { target: { value: '2026-10-23' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].slots[0].holiday_exceptions).toEqual(['2026-10-23']);
    expect(mocks.preview.mock.calls[0][0].slots[1].holiday_exceptions).toBeUndefined();
  });

  it('can retry a failed calculation without changing the arrangement', async () => {
    mocks.preview.mockRejectedValueOnce(new Error('Connection interrupted.'));
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted.');
    fireEvent.click(screen.getByText('Retry calculation'));
    await calculate();
    expect(mocks.preview).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not assume a trial deduction in a general new-student scenario', async () => {
    render(<BillingPreview />);
    fireEvent.change(screen.getByLabelText('First regular lesson'), { target: { value: '2026-11-10' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].trial_deduction).toBe(false);
  });

  it('seeds an embedded existing-student journey without carrying trial defaults', async () => {
    render(<BillingPreview embedded initialRequest={{
      first_lesson_date: '2026-12-15', mode: 'transition', payment_method: 'autopay', materials_fee: 0,
      trial_deduction: false, mandate_ready: false,
      slots: [{ weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-12-08' }],
    }} />);
    await calculate();
    expect(screen.getByLabelText('First session to charge')).toHaveValue('2026-12-15');
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      mode: 'transition', payment_method: 'autopay', trial_deduction: false,
      slots: [{ weekday: 'Tue', covered_through: '2026-12-08' }],
    });
    expect(screen.queryByText('Review existing students and their recorded coverage')).not.toBeInTheDocument();
  });

  it('preserves both weekly weekdays when the first uncovered date moves to the second slot', async () => {
    render(<BillingPreview embedded initialRequest={{
      first_lesson_date: '2026-11-10', mode: 'transition', payment_method: 'manual', materials_fee: 0,
      trial_deduction: false, mandate_ready: false, slots: [{ weekday: 'Tue' }, { weekday: 'Thu' }],
    }} />);
    fireEvent.change(screen.getByLabelText('First session to charge'), { target: { value: '2026-11-12' } });
    await calculate();
    expect(mocks.preview.mock.calls[0][0].slots.map((slot: { weekday: string }) => slot.weekday)).toEqual(['Tue', 'Thu']);
  });
});
