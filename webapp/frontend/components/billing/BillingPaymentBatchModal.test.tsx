import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPaymentBatchModal } from './BillingPaymentBatchModal';
import type { PaymentBatchAction, PaymentBatchTarget } from '@/lib/billing-payment-batch';
import type { BillingPaymentDetail } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), payment: vi.fn(), markPaymentSent: vi.fn(), recordManualPayment: vi.fn(), invalidate: vi.fn(), close: vi.fn(), changed: vi.fn(), clipboard: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: mocks.invalidate }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));

function target(id: number): PaymentBatchTarget & { enrollmentIds: number[] } {
  return { paymentId: `payment-${id}`, student: { id, student_name: `Synthetic Student ${id}`, school_student_id: String(id), home_location: 'MSA', grade: 'F1', is_staff_referral: false }, enrollmentIds: [id * 10, id * 10 + 1] };
}
function payment(id: number): BillingPaymentDetail {
  return { id: `payment-${id}`, student_id: id, version: 2, status: 'Pending Payment', created_at: '2026-10-19', sent_at: null, sent_language: null, paid_at: null, payment_date: null, received_method: null, receipt_reference: null, coupon_status: 'reserved', note: null, can_copy: true, review_issues: [], batch_action_issue: null, history: [],
    lines: target(id).enrollmentIds.map((enrollment_id, index) => ({ enrollment_id, slot_index: index, tutor_id: 7, tutor_name: 'Synthetic Tutor', lesson_count: 4, gross_tuition: 1600, discount_amount: index === 0 ? 300 : 0, tuition_amount: index === 0 ? 1300 : 1600, materials_fee: 0 })),
    review: { student: target(id).student, source_fingerprint: `source-${id}`, evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review', basis: 'paid_only', selected_enrollment_ids: [], confirmed_checks: [], issues: [],
      scenario: { first_lesson_date: '2026-11-02', slots: [{ weekday: 'Mon', location: 'MSA' }, { weekday: 'Thu', location: 'MSA' }], mode: 'transition', payment_method: 'autopay', materials_fee: 0, trial_deduction: false, mandate_ready: false },
      message: { template_version: 'v2', zh: 'Synthetic Chinese message', en: 'Synthetic English message', blocked_reasons: [] },
      period: { number: 1, kind: 'transition', explanation: '', coverage_from: '2026-11-01', coverage_through: '2026-12-31', first_lesson_date: '2026-11-02', last_lesson_date: '2026-12-21', lesson_count: 8, counts_by_month: [{ month: '2026-11', lessons: 4 }, { month: '2026-12', lessons: 4 }], counts_by_slot: [4, 4], lessons: [], gross_tuition: 3200, deductions: [{ kind: 'ordinary', amount: 300 }], tuition_after_deductions: 2900, materials_fee: 0, total_fee: 2900, adjustment_reason: null, requires_review: false,
        collection: { method: 'manual', notice_from: '2026-10-12', notice_to: '2026-10-18', debit_from: null, debit_to: null, due_before_lesson: '2026-11-02', gap_min_days: null, gap_max_days: null } } },
  };
}
function studentId(paymentId: string) { return Number(paymentId.split('-')[1]); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>; }
function show(action: PaymentBatchAction = 'paid', targets = [target(10), target(2)], writesAvailable = true) {
  const props = { targets, action, writesAvailable, trigger: createRef<HTMLButtonElement>(), onClose: mocks.close, onChanged: mocks.changed };
  return { ...render(<BillingPaymentBatchModal {...props} />, { wrapper: Wrapper }), props };
}
async function ready() {
  await waitFor(() => expect(screen.queryByText('Checking payments…')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
}
function row(id: number) { return screen.getByRole('article', { name: `Payment for Synthetic Student ${id}` }); }
function acknowledge(action: PaymentBatchAction = 'paid') { fireEvent.click(screen.getByRole('checkbox', { name: action === 'paid' ? 'The full amounts shown have been received.' : 'The selected fee messages have been sent.' })); }
function confirm(action: PaymentBatchAction = 'paid') { fireEvent.click(screen.getByRole('button', { name: action === 'paid' ? 'Confirm payments' : 'Mark sent' })); }
function sharedDate() { return screen.getByLabelText('Payment date', { selector: '#batch-payment-date' }); }
function sharedMethod() { return screen.getByLabelText('Received by', { selector: '#batch-payment-method' }); }
function sharedLanguage() { return screen.getByLabelText('Message language', { selector: '#batch-message-language' }); }
function selectStudent(id: number) { fireEvent.click(within(row(id)).getByRole('checkbox', { name: `Select Synthetic Student ${id}` })); }
function openIndividualPayment(id: number) { fireEvent.click(within(row(id)).getByText(/^(Cash|Bank transfer) ·/)); }

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard } });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin', isReadOnly: false });
  mocks.payment.mockImplementation(async (id: string) => payment(studentId(id)));
  mocks.recordManualPayment.mockImplementation(async (id: string, body: { payment_date: string; method: 'cash' | 'bank_transfer' }) => ({ ...payment(studentId(id)), version: 3, status: 'Paid', payment_date: body.payment_date, received_method: body.method }));
  mocks.markPaymentSent.mockImplementation(async (id: string, body: { language: 'zh' | 'en' }) => ({ ...payment(studentId(id)), version: 3, sent_at: '2026-10-22T01:00:00', sent_language: body.language }));
  mocks.invalidate.mockResolvedValue(undefined);
});

describe('combined-payment batch review', () => {
  it('deduplicates payments, sorts school IDs and displays both weekly classes as one payment', async () => {
    show('paid', [target(10), target(2), target(2)]); await ready();
    expect(screen.getAllByRole('article').map(element => element.getAttribute('aria-label'))).toEqual(['Payment for Synthetic Student 2', 'Payment for Synthetic Student 10']);
    expect(mocks.payment).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(within(row(2)).getByText(/8 sessions.*2 weekly classes/)).toBeVisible());
    expect(within(row(2)).getByText('MOP 2,900')).toBeVisible();
    expect(within(row(2)).getByRole('link', { name: 'Synthetic Student 2' })).toHaveAttribute('href', '/students/2');
    expect(screen.getByText('MOP 5,800')).toBeVisible();
    expect(mocks.recordManualPayment).not.toHaveBeenCalled(); expect(mocks.markPaymentSent).not.toHaveBeenCalled(); expect(mocks.clipboard).not.toHaveBeenCalled();
  });

  it('requires explicit receipt acknowledgement and resets it after selection or individual input changes', async () => {
    show(); await ready();
    const submit = screen.getByRole('button', { name: 'Confirm payments' }); expect(submit).toBeDisabled();
    acknowledge(); expect(submit).toBeEnabled();
    fireEvent.click(within(row(10)).getByRole('checkbox', { name: 'Select Synthetic Student 10' })); expect(submit).toBeDisabled();
    acknowledge(); expect(submit).toBeEnabled();
    fireEvent.click(within(row(2)).getByText(/^Cash ·/));
    fireEvent.change(within(row(2)).getByLabelText('Received by'), { target: { value: 'bank_transfer' } });
    expect(submit).toBeDisabled(); expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('changes selected payments immediately and reflects preserved unselected values when reselected', async () => {
    show(); await ready();
    expect(screen.queryByRole('button', { name: 'Apply to selected' })).not.toBeInTheDocument();
    openIndividualPayment(2);
    fireEvent.change(within(row(2)).getByLabelText('Payment date'), { target: { value: '2026-10-19' } });
    selectStudent(2);
    fireEvent.change(sharedDate(), { target: { value: '2026-10-20' } });
    acknowledge();
    fireEvent.change(sharedMethod(), { target: { value: 'bank_transfer' } });
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    expect(within(row(2)).getByLabelText('Payment date')).toHaveValue('2026-10-19'); expect(within(row(2)).getByLabelText('Received by')).toHaveValue('cash');
    expect(within(row(10)).getByText(/^Bank transfer ·/)).toBeVisible();
    selectStudent(2);
    expect(sharedMethod()).toHaveDisplayValue('Mixed');
    expect(sharedDate()).toHaveValue('');
    expect(screen.getByText('Dates vary')).toBeVisible();
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.recordManualPayment).toHaveBeenNthCalledWith(1, 'payment-2', expect.objectContaining({ amount: 2900, method: 'cash', payment_date: '2026-10-19' }), expect.any(AbortSignal));
    expect(mocks.recordManualPayment).toHaveBeenNthCalledWith(2, 'payment-10', expect.objectContaining({ amount: 2900, method: 'bank_transfer', payment_date: '2026-10-20' }), expect.any(AbortSignal));
    expect(mocks.changed).toHaveBeenCalledOnce(); expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(screen.queryByRole('checkbox', { name: /^Select Synthetic/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(mocks.close).toHaveBeenCalledWith(['payment-2', 'payment-10']);
  });

  it('records the changed shared method without an extra apply step and preserves individual dates', async () => {
    show(); await ready();
    const originalDate = (sharedDate() as HTMLInputElement).value;
    openIndividualPayment(2);
    fireEvent.change(within(row(2)).getByLabelText('Payment date'), { target: { value: '2026-10-19' } });
    acknowledge();
    fireEvent.change(sharedMethod(), { target: { value: 'bank_transfer' } });
    expect(sharedMethod()).toHaveDisplayValue('Bank transfer');
    expect(within(row(2)).getByLabelText('Payment date')).toHaveValue('2026-10-19');
    expect(within(row(2)).getByLabelText('Received by')).toHaveValue('bank_transfer');
    expect(within(row(10)).getByText(/^Bank transfer ·/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.recordManualPayment).toHaveBeenNthCalledWith(1, 'payment-2', expect.objectContaining({ method: 'bank_transfer', payment_date: '2026-10-19' }), expect.any(AbortSignal));
    expect(mocks.recordManualPayment).toHaveBeenNthCalledWith(2, 'payment-10', expect.objectContaining({ method: 'bank_transfer', payment_date: originalDate }), expect.any(AbortSignal));
  });

  it('updates only the shared date while preserving mixed individual methods', async () => {
    show(); await ready();
    openIndividualPayment(2);
    fireEvent.change(within(row(2)).getByLabelText('Received by'), { target: { value: 'bank_transfer' } });
    expect(sharedMethod()).toHaveDisplayValue('Mixed');
    acknowledge();
    fireEvent.change(sharedDate(), { target: { value: '2026-10-20' } });
    expect(sharedDate()).toHaveValue('2026-10-20');
    expect(sharedMethod()).toHaveDisplayValue('Mixed');
    expect(screen.queryByText('Dates vary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.recordManualPayment).toHaveBeenNthCalledWith(1, 'payment-2', expect.objectContaining({ method: 'bank_transfer', payment_date: '2026-10-20' }), expect.any(AbortSignal));
    expect(mocks.recordManualPayment).toHaveBeenNthCalledWith(2, 'payment-10', expect.objectContaining({ method: 'cash', payment_date: '2026-10-20' }), expect.any(AbortSignal));
  });

  it('derives shared fields from selected students and disables editing when none are selected', async () => {
    show(); await ready();
    const originalDate = (sharedDate() as HTMLInputElement).value;
    openIndividualPayment(2);
    fireEvent.change(within(row(2)).getByLabelText('Received by'), { target: { value: 'bank_transfer' } });
    fireEvent.change(within(row(2)).getByLabelText('Payment date'), { target: { value: '2026-10-19' } });
    expect(sharedMethod()).toHaveDisplayValue('Mixed');
    expect(screen.getByText('Dates vary')).toBeVisible();
    selectStudent(2);
    expect(sharedMethod()).toHaveDisplayValue('Cash');
    expect(sharedDate()).toHaveValue(originalDate);
    expect(screen.queryByText('Dates vary')).not.toBeInTheDocument();
    selectStudent(10);
    expect(sharedMethod()).toBeDisabled(); expect(sharedDate()).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'The full amounts shown have been received.' })).not.toBeInTheDocument();
    selectStudent(2);
    expect(sharedMethod()).toHaveDisplayValue('Bank transfer');
    expect(sharedDate()).toHaveValue('2026-10-19');
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('holds confirmation for an empty common date without describing matching dates as mixed', async () => {
    show(); await ready(); acknowledge();
    fireEvent.change(sharedDate(), { target: { value: '' } });
    expect(sharedDate()).toHaveValue('');
    expect(screen.queryByText('Dates vary')).not.toBeInTheDocument();
    for (const id of [2, 10]) expect(within(row(id)).getByLabelText('Payment date')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    acknowledge();
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('updates the selected message languages immediately and shows mixed individual choices', async () => {
    show('sent'); await ready();
    expect(screen.queryByRole('button', { name: 'Apply to selected' })).not.toBeInTheDocument();
    acknowledge('sent');
    fireEvent.change(sharedLanguage(), { target: { value: 'en' } });
    expect(screen.getByRole('button', { name: 'Mark sent' })).toBeDisabled();
    for (const id of [2, 10]) expect(within(row(id)).getByLabelText(`Message language for Synthetic Student ${id}`)).toHaveValue('en');
    fireEvent.change(within(row(2)).getByLabelText('Message language for Synthetic Student 2'), { target: { value: 'zh' } });
    expect(sharedLanguage()).toHaveDisplayValue('Mixed');
    selectStudent(2);
    expect(sharedLanguage()).toHaveDisplayValue('English');
    fireEvent.change(sharedLanguage(), { target: { value: 'zh' } });
    expect(within(row(2)).getByLabelText('Message language for Synthetic Student 2')).toHaveValue('zh');
    selectStudent(2);
    expect(sharedLanguage()).toHaveDisplayValue('Chinese');
    selectStudent(2);
    fireEvent.change(sharedLanguage(), { target: { value: 'en' } });
    expect(within(row(2)).getByLabelText('Message language for Synthetic Student 2')).toHaveValue('zh');
    expect(within(row(10)).getByLabelText('Message language for Synthetic Student 10')).toHaveValue('en');
    selectStudent(2);
    expect(sharedLanguage()).toHaveDisplayValue('Mixed');
    acknowledge('sent'); confirm('sent');
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.markPaymentSent).toHaveBeenNthCalledWith(1, 'payment-2', expect.objectContaining({ language: 'zh' }), expect.any(AbortSignal));
    expect(mocks.markPaymentSent).toHaveBeenNthCalledWith(2, 'payment-10', expect.objectContaining({ language: 'en' }), expect.any(AbortSignal));
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });

  it('requires sent acknowledgement and sends each chosen language without copying messages', async () => {
    show('sent'); await ready();
    expect(screen.getByRole('button', { name: 'Mark sent' })).toBeDisabled();
    fireEvent.change(within(row(2)).getByLabelText('Message language for Synthetic Student 2'), { target: { value: 'en' } });
    acknowledge('sent'); confirm('sent');
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.markPaymentSent).toHaveBeenNthCalledWith(1, 'payment-2', expect.objectContaining({ language: 'en' }), expect.any(AbortSignal));
    expect(mocks.markPaymentSent).toHaveBeenNthCalledWith(2, 'payment-10', expect.objectContaining({ language: 'zh' }), expect.any(AbortSignal));
    expect(mocks.clipboard).not.toHaveBeenCalled(); expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('blocks Autopay and bank-claimed records while leaving eligible students selected', async () => {
    mocks.payment.mockImplementation(async (id: string) => {
      const value = payment(studentId(id));
      if (id === 'payment-2') value.review.period.collection.method = 'autopay';
      if (id === 'payment-3') value.batch_action_issue = 'Payment is already in a bank file.';
      return value;
    });
    show('paid', [target(2), target(3), target(10)]); await ready();
    expect(within(row(2)).getByText('Record this collection through the Autopay list.')).toBeVisible();
    expect(within(row(3)).getByText('Payment is already in a bank file.')).toBeVisible();
    expect(within(row(2)).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(row(3)).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('2 to check')).toBeVisible();
    fireEvent.change(sharedMethod(), { target: { value: 'bank_transfer' } });
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('1 completed')).toBeVisible());
    expect(mocks.recordManualPayment).toHaveBeenCalledOnce(); expect(mocks.recordManualPayment.mock.calls[0][0]).toBe('payment-10');
    expect(mocks.recordManualPayment.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'bank_transfer' }));
  });

  it('stops a changed latest payment and retains separate successful results for the other student', async () => {
    show(); await ready();
    mocks.payment.mockImplementation(async (id: string) => { const value = payment(studentId(id)); if (id === 'payment-2') value.version = 3; return value; });
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('1 completed')).toBeVisible());
    expect(within(row(2)).getByRole('alert')).toHaveTextContent('This payment changed. Check it again.');
    expect(within(row(10)).getByRole('status')).toHaveTextContent('Payment recorded');
    expect(mocks.recordManualPayment).toHaveBeenCalledOnce();
    expect(screen.getByText('1 to check')).toBeVisible();
    fireEvent.click(within(row(2)).getByRole('button', { name: 'Recheck' }));
    await waitFor(() => expect(within(row(2)).getByRole('checkbox', { name: 'Select Synthetic Student 2' })).toBeChecked());
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.recordManualPayment).toHaveBeenCalledTimes(2);
    expect(mocks.recordManualPayment.mock.calls.map(call => call[0])).toEqual(['payment-10', 'payment-2']);
  });

  it('keeps successful students complete while an uncertain request retries its exact original body', async () => {
    mocks.recordManualPayment.mockImplementation(async (id: string, body: { payment_date: string; method: 'cash' | 'bank_transfer' }) => {
      if (id === 'payment-2' && mocks.recordManualPayment.mock.calls.filter(call => call[0] === id).length === 1) throw new TypeError('Response lost.');
      return { ...payment(studentId(id)), version: 3, status: 'Paid', payment_date: body.payment_date, received_method: body.method };
    });
    show(); await ready(); acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('1 completed')).toBeVisible());
    const request = mocks.recordManualPayment.mock.calls[0][1];
    expect(within(row(2)).getByRole('alert')).toHaveTextContent('Response lost.');
    expect(within(row(2)).queryByLabelText('Payment date')).not.toBeInTheDocument();
    expect(within(row(2)).queryByRole('button', { name: 'Recheck' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Received by'), { target: { value: 'bank_transfer' } });
    fireEvent.click(within(row(2)).getByRole('button', { name: 'Retry action' }));
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.recordManualPayment.mock.calls.map(call => call[0])).toEqual(['payment-2', 'payment-10', 'payment-2']);
    expect(mocks.recordManualPayment.mock.calls[2][1]).toBe(request);
    expect(mocks.payment).toHaveBeenCalledTimes(4);
    expect(within(row(10)).queryByRole('button', { name: 'Retry action' })).not.toBeInTheDocument();
  });

  it('keeps an uncertain cash request frozen when another ready payment changes to bank transfer', async () => {
    mocks.recordManualPayment.mockImplementation(async (id: string, body: { payment_date: string; method: 'cash' | 'bank_transfer' }) => {
      if (id === 'payment-2' && mocks.recordManualPayment.mock.calls.filter(call => call[0] === id).length === 1) throw new TypeError('Response lost.');
      return { ...payment(studentId(id)), version: 4, status: 'Paid', payment_date: body.payment_date, received_method: body.method };
    });
    show('paid', [target(2), target(3), target(10)]); await ready();
    mocks.payment.mockImplementation(async (id: string) => { const value = payment(studentId(id)); if (id === 'payment-3') value.version = 3; return value; });
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('1 completed')).toBeVisible());
    const originalRequest = mocks.recordManualPayment.mock.calls[0][1];
    expect(originalRequest).toEqual(expect.objectContaining({ method: 'cash' }));
    expect(within(row(2)).getByRole('button', { name: 'Retry action' })).toBeVisible();
    fireEvent.click(within(row(3)).getByRole('button', { name: 'Recheck' }));
    await waitFor(() => expect(within(row(3)).getByRole('checkbox', { name: 'Select Synthetic Student 3' })).toBeChecked());
    fireEvent.change(sharedMethod(), { target: { value: 'bank_transfer' } });
    fireEvent.change(sharedDate(), { target: { value: '2026-10-20' } });
    expect(within(row(3)).getByText(/^Bank transfer ·/)).toBeVisible();
    expect(within(row(2)).queryByLabelText('Received by')).not.toBeInTheDocument();
    expect(within(row(10)).queryByLabelText('Received by')).not.toBeInTheDocument();
    fireEvent.click(within(row(2)).getByRole('button', { name: 'Retry action' }));
    await waitFor(() => expect(screen.getByText('2 completed')).toBeVisible());
    expect(mocks.recordManualPayment.mock.calls[2][0]).toBe('payment-2');
    expect(mocks.recordManualPayment.mock.calls[2][1]).toBe(originalRequest);
    expect(sharedMethod()).toHaveDisplayValue('Bank transfer');
    expect(sharedDate()).toHaveValue('2026-10-20');
    acknowledge(); confirm();
    await waitFor(() => expect(screen.getByText('3 completed')).toBeVisible());
    expect(mocks.recordManualPayment.mock.calls.map(call => call[0])).toEqual(['payment-2', 'payment-10', 'payment-2', 'payment-3']);
    expect(mocks.recordManualPayment.mock.calls[3][1]).toEqual(expect.objectContaining({ method: 'bank_transfer', payment_date: '2026-10-20' }));
  });

  it('shows a missing language as a review issue and never marks that message sent', async () => {
    mocks.payment.mockImplementation(async (id: string) => { const value = payment(studentId(id)); value.review.message.en = null; return value; });
    show('sent', [target(2)]); await ready();
    fireEvent.change(screen.getByLabelText('Message language for Synthetic Student 2'), { target: { value: 'en' } });
    acknowledge('sent'); confirm('sent');
    expect(await screen.findByText('This language is not available. Open the fee message.')).toBeVisible();
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark sent' })).toBeDisabled();
  });

  it.each(['read-only role', 'another administrator', 'writes disabled'] as const)('aborts a held write and stops remaining students on %s change', async change => {
    const held = deferred<BillingPaymentDetail>(); mocks.recordManualPayment.mockReturnValue(held.promise);
    const view = show(); await ready(); acknowledge(); confirm();
    await waitFor(() => expect(mocks.recordManualPayment).toHaveBeenCalledOnce());
    const signal = mocks.recordManualPayment.mock.calls[0][2] as AbortSignal;
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByText('Open payment').every(element => element.tagName === 'SPAN')).toBe(true);
    expect(screen.getByRole('button', { name: /^Close$/ })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(mocks.close).not.toHaveBeenCalled();
    const nextProps = { ...view.props };
    if (change === 'read-only role') mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, effectiveRole: 'Supervisor', isReadOnly: true });
    if (change === 'another administrator') mocks.auth.mockReturnValue({ user: { id: 9 }, isAdmin: true, effectiveRole: 'Admin', isReadOnly: false });
    if (change === 'writes disabled') nextProps.writesAvailable = false;
    view.rerender(<BillingPaymentBatchModal {...nextProps} />);
    expect(signal.aborted).toBe(true);
    const request = mocks.recordManualPayment.mock.calls[0][1];
    await act(async () => held.resolve({ ...payment(2), status: 'Paid', payment_date: request.payment_date, received_method: request.method }));
    expect(mocks.recordManualPayment).toHaveBeenCalledOnce();
    expect(screen.queryByText('Payment recorded')).not.toBeInTheDocument();
  });

  it('aborts held initial reads on unmount without any mutations', async () => {
    const held = deferred<BillingPaymentDetail>(); mocks.payment.mockReturnValue(held.promise);
    const view = show(); const signals = mocks.payment.mock.calls.map(call => call[2] as AbortSignal);
    view.unmount(); expect(signals.every(signal => signal.aborted)).toBe(true);
    await act(async () => held.resolve(payment(2)));
    expect(mocks.recordManualPayment).not.toHaveBeenCalled(); expect(mocks.markPaymentSent).not.toHaveBeenCalled();
  });

  it('keeps disabled activation and read-only access from confirming payments', async () => {
    const view = show('paid', [target(2)], false); await ready();
    expect(screen.getByText('Payment recording is not enabled yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm payments' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'The full amounts shown have been received.' })).toBeDisabled();
    mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, effectiveRole: 'Tutor', isReadOnly: true });
    view.rerender(<BillingPaymentBatchModal {...view.props} />);
    await waitFor(() => expect(screen.getByText('Read-only access.')).toBeVisible());
    expect(mocks.recordManualPayment).not.toHaveBeenCalled();
  });

  it('focuses results after confirmation and returns focus to the original trigger on unmount', async () => {
    const trigger = document.createElement('button'); trigger.textContent = 'Open batch'; document.body.append(trigger);
    const ref = { current: trigger } as RefObject<HTMLButtonElement>;
    const props = { targets: [target(2)], action: 'paid' as const, writesAvailable: true, trigger: ref, onClose: mocks.close, onChanged: mocks.changed };
    const view = render(<BillingPaymentBatchModal {...props} />, { wrapper: Wrapper }); await ready();
    expect(screen.getByRole('dialog', { name: 'Record payments' })).toBeVisible();
    acknowledge(); confirm();
    const result = await screen.findByRole('heading', { name: /1 payment.*1 completed/ }); await waitFor(() => expect(result).toHaveFocus());
    view.unmount(); expect(trigger).toHaveFocus(); trigger.remove();
  });
});
