import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingConfirmDraft } from './BillingConfirmDraft';
import { BillingPayments } from './BillingPayments';
import type { BillingDraftDetail, BillingPaymentDetail, BillingPreferences } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), preferences: vi.fn(), savePreferences: vi.fn(), confirmDraft: vi.fn(), payments: vi.fn(), payment: vi.fn(), markPaymentSent: vi.fn(), recordPayment: vi.fn(), recordReceipt: vi.fn(), cancelPayment: vi.fn(), copy: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('./BillingEnrollmentSessions', () => ({ BillingEnrollmentSessions: ({ enrollmentId }: { enrollmentId: number }) => <div>Actual sessions for enrollment {enrollmentId}</div> }));

function preferences(): BillingPreferences { return { student_id: 4, payment_method: 'manual', mandate_ready: false, version: 2, updated_at: null }; }
function payment(): BillingPaymentDetail {
  return { id: 'payment-1', student_id: 4, version: 1, status: 'Pending Payment', created_at: '2026-10-18', sent_at: null, sent_language: null, paid_at: null, payment_date: null, received_method: null, receipt_reference: null, coupon_status: 'none', note: null, can_copy: true, review_issues: [], history: [{ kind: 'confirmed', actor_name: 'Admin', created_at: '2026-10-18' }],
    lines: [{ enrollment_id: 20, slot_index: 0, tutor_id: 7, tutor_name: 'Tutor A', lesson_count: 3, gross_tuition: 1200, discount_amount: 0, tuition_amount: 1200, materials_fee: 0 }, { enrollment_id: 21, slot_index: 1, tutor_id: 8, tutor_name: 'Tutor B', lesson_count: 4, gross_tuition: 1600, discount_amount: 0, tuition_amount: 1600, materials_fee: 0 }],
    review: { student: { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review', basis: 'paid_only', selected_enrollment_ids: [10, 11], confirmed_checks: [], issues: [],
      scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', location: 'MSA' }, { weekday: 'Thu', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
      message: { template_version: 'v2', zh: '中文收費通知', en: 'English fee message', blocked_reasons: [] },
      period: { number: 1, kind: 'transition', explanation: 'December sessions.', coverage_from: '2026-12-01', coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-31', lesson_count: 7, counts_by_month: [{ month: '2026-12', lessons: 7 }], counts_by_slot: [3, 4], lessons: [{ date: '2026-12-04', weekday: 'Fri', slot: 0, time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }], gross_tuition: 2800, deductions: [], tuition_after_deductions: 2800, materials_fee: 0, total_fee: 2800, adjustment_reason: null, requires_review: false,
        collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null } } } };
}
function draft(): BillingDraftDetail { return { id: 'draft-1', student_id: 4, current_revision: 2, revision: 2, review: payment().review, note: null, created_at: '2026-10-18', created_by_name: 'Admin', stale_reasons: [], can_copy: true, history: [] }; }
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>; }
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true });
  mocks.preferences.mockResolvedValue(preferences());
  mocks.savePreferences.mockResolvedValue({ ...preferences(), version: 3 });
  mocks.confirmDraft.mockResolvedValue(payment());
  mocks.payments.mockResolvedValue([payment()]);
  mocks.payment.mockResolvedValue(payment());
  mocks.markPaymentSent.mockResolvedValue({ ...payment(), version: 2, sent_at: '2026-10-18', sent_language: 'zh' });
  mocks.recordPayment.mockResolvedValue({ ...payment(), version: 2, status: 'Paid', can_copy: false, payment_date: '2026-10-18', received_method: 'cash' });
  mocks.recordReceipt.mockResolvedValue({ ...payment(), version: 3, status: 'Paid', can_copy: false, receipt_reference: 'KMS-123', coupon_status: 'recorded_in_kms' });
  mocks.cancelPayment.mockResolvedValue({ ...payment(), version: 2, status: 'Cancelled', can_copy: false, note: 'Parent postponed the return.' });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy.mockResolvedValue(undefined) } });
});

describe('recorded payment settings', () => {
  it('keeps stored preferences and payments visible when workflow writes are disabled', async () => {
    render(<><BillingPaymentSettings storageAvailable studentId={4} onSaved={vi.fn()} /><BillingPayments studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} /><BillingConfirmDraft draft={draft()} onConfirmed={vi.fn()} /></>, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Payment method' }));
    await waitFor(() => expect(screen.getByLabelText('Parent’s payment preference')).toHaveValue('manual'));
    expect(screen.getByRole('button', { name: 'Save payment method' })).toBeDisabled();
    await screen.findByRole('link', { name: 'Enrollment #20' });
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create enrollments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel enrollments' })).not.toBeInTheDocument();
  });
  it('saves parent preference separately from bank authorisation with optimistic version and stable retry', async () => {
    mocks.savePreferences.mockRejectedValueOnce(new Error('Connection lost'));
    render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} />, { wrapper: Wrapper });
    const settings = screen.getByRole('button', { name: 'Payment method' });
    fireEvent.click(settings);
    await waitFor(() => expect(screen.getByLabelText('Parent’s payment preference')).toHaveValue('manual'));
    fireEvent.change(screen.getByLabelText('Parent’s payment preference'), { target: { value: 'autopay' } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    await screen.findByRole('alert');
    const first = mocks.savePreferences.mock.calls[0][1];
    expect(first).toEqual(expect.objectContaining({ payment_method: 'autopay', mandate_ready: false, expected_version: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Save payment method' }));
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledTimes(2));
    expect(mocks.savePreferences.mock.calls[1][1].idempotency_key).toBe(first.idempotency_key);
  });
  it('keeps tutor preferences read-only and sends effective tutor scope', async () => {
    mocks.auth.mockReturnValue({ user: { id: 99 }, effectiveRole: 'Tutor', isAdmin: false, isImpersonating: true, impersonatedTutor: { id: 7 } });
    render(<BillingPaymentSettings storageAvailable canWrite studentId={4} onSaved={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Payment method' }));
    await waitFor(() => expect(screen.getByLabelText('Parent’s payment preference')).toHaveValue('manual'));
    expect(mocks.preferences).toHaveBeenCalledWith(4, 7);
    expect(screen.getByLabelText('Parent’s payment preference')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save payment method' })).toBeDisabled();
  });
});

describe('confirmed teaching enrollments', () => {
  it('requires saved matching preference and explicit review confirmation', async () => {
    mocks.preferences.mockResolvedValue({ ...preferences(), payment_method: 'autopay' });
    render(<BillingConfirmDraft canWrite draft={draft()} onConfirmed={vi.fn()} />, { wrapper: Wrapper });
    await screen.findByText('Save the parent’s Manual preference in Payment settings first.');
    expect(screen.getByRole('button', { name: 'Create enrollments' })).toBeDisabled();
    expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });
  it('reuses the exact confirmation token after an uncertain response', async () => {
    mocks.confirmDraft.mockRejectedValueOnce(new Error('Connection lost'));
    const onConfirmed = vi.fn();
    render(<BillingConfirmDraft canWrite draft={draft()} onConfirmed={onConfirmed} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'I checked the session dates and total fee.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollments' }));
    await screen.findByRole('alert');
    const body = mocks.confirmDraft.mock.calls[0][1];
    expect(body).toEqual(expect.objectContaining({ expected_revision: 2, expected_review_hash: 'review', expected_preference_version: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Create enrollments' }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(mocks.confirmDraft.mock.calls[1][1].idempotency_key).toBe(body.idempotency_key);
  });
  it('withholds creation for stale, historical or already confirmed drafts', async () => {
    const view = render(<BillingConfirmDraft canWrite draft={{ ...draft(), stale_reasons: ['Dates changed.'] }} onConfirmed={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.queryByRole('button', { name: 'Create enrollments' })).not.toBeInTheDocument();
    view.rerender(<BillingConfirmDraft canWrite draft={{ ...draft(), revision: 1 }} onConfirmed={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Create enrollments' })).not.toBeInTheDocument();
    view.rerender(<BillingConfirmDraft canWrite draft={{ ...draft(), confirmed_payment_id: 'payment-1' }} onConfirmed={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Create enrollments' })).not.toBeInTheDocument();
  });
});

describe('combined payment collection', () => {
  function show() { return render(<BillingPayments canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper }); }
  it('puts created enrollment IDs first and uses actual session rows in renewal details', async () => {
    render(<BillingPayments inline presentation="renewal" canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper });
    const enrollments = await screen.findByRole('region', { name: 'Linked enrollments' });
    const fee = screen.getByRole('region', { name: 'Enrollment fee' });
    expect(fee).toContainElement(enrollments);
    expect(within(enrollments).getByRole('link', { name: 'Enrollment #20' })).toBeVisible();
    expect(within(enrollments).getByText(/Tutor A/)).toBeVisible();
    expect(screen.getByText('Actual sessions for enrollment 20')).toBeVisible();
    expect(screen.getByText('Actual sessions for enrollment 21')).toBeVisible();
    expect(screen.queryByLabelText('Sessions by month')).not.toBeInTheDocument();
    expect(screen.queryByText('7 session dates')).not.toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel enrollments' });
    expect(cancel.parentElement).toBe(screen.getByRole('button', { name: 'Record payment' }).parentElement);
    expect(cancel).toHaveClass('h-7');
    expect(cancel.querySelector('svg')).toHaveClass('text-red-600');
    fireEvent.click(cancel);
    expect(screen.getByRole('form', { name: 'Cancel linked enrollments' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
    expect(mocks.cancelPayment).not.toHaveBeenCalled();
  });

  it('shows one amount and lesson count for a straightforward renewal, with notes below sessions', async () => {
    const value = payment();
    value.lines = [{ ...value.lines[0], lesson_count: 7 }];
    value.review.issues = [{ code: 'PENDING_COVERAGE_ASSUMED', message: 'Existing unpaid enrollments were counted.', period: null }, { code: 'COVERAGE_ASSUMED', message: 'The recorded end date was used.', period: null }];
    mocks.payment.mockResolvedValue(value);
    render(<BillingPayments inline presentation="renewal" canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper });
    const fee = await screen.findByRole('region', { name: 'Enrollment fee' });
    expect(within(fee).getAllByText('MOP 2,800')).toHaveLength(1);
    expect(within(fee).getAllByText('7 sessions')).toHaveLength(1);
    expect(within(fee).queryByText('Tuition')).not.toBeInTheDocument();
    expect(within(fee).getByText('Unpaid')).toBeVisible();
    expect(screen.queryByText('2 notes')).not.toBeInTheDocument();
    const notes = screen.getByText('Enrollment notes');
    const sessions = screen.getByRole('region', { name: 'Enrollment sessions' });
    expect(sessions.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(notes);
    expect(screen.getByText('Existing unpaid enrollments were counted.')).toBeVisible();
  });

  it('retains the fee breakdown when a coupon changes the total', async () => {
    const value = payment(); value.review.period.deductions = [{ kind: 'ordinary', amount: 300 }];
    value.review.period.total_fee = 2500; value.review.period.tuition_after_deductions = 2500;
    mocks.payment.mockResolvedValue(value);
    render(<BillingPayments inline presentation="renewal" studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper });
    const fee = await screen.findByRole('region', { name: 'Enrollment fee' });
    expect(within(fee).getByText('MOP 2,500')).toBeVisible();
    expect(within(fee).getByText('Tuition')).toBeVisible();
    expect(within(fee).getByText('−MOP 300')).toBeVisible();
    expect(within(fee).getByText('MOP 2,800')).toBeVisible();
  });

  it('shows the exact created snapshot immediately while checking its server record', async () => {
    mocks.payment.mockReturnValue(new Promise(() => {}));
    const created = payment();
    render(<BillingPayments inline presentation="renewal" initialDetail={created} canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: 'Enrollment #20' })).toBeVisible();
    expect(screen.queryByText('Loading payment…')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.payment).toHaveBeenCalledWith('payment-1', undefined));
  });

  it('does not display a created snapshot for another student or authorisation scope', async () => {
    mocks.payment.mockReturnValue(new Promise(() => {}));
    const created = payment();
    const { rerender } = render(<BillingPayments inline initialDetail={created} studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole('link', { name: 'Enrollment #20' })).toBeVisible();
    mocks.auth.mockReturnValue({ user: { id: 9 }, effectiveRole: 'Tutor', isAdmin: false });
    rerender(<BillingPayments inline initialDetail={created} studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />);
    expect(screen.queryByRole('link', { name: 'Enrollment #20' })).not.toBeInTheDocument();
  });

  it('keeps exact combined-payment controls inline and opens teaching records in the workspace', async () => {
    const onOpenEnrollment = vi.fn();
    render(<BillingPayments inline canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} onOpenEnrollment={onOpenEnrollment} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Enrollment #21' }));
    expect(onOpenEnrollment).toHaveBeenCalledWith(21);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Payments' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'The full payment has been received.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    await screen.findByText('Payment recorded for every linked enrollment.');
    expect(mocks.recordPayment).toHaveBeenCalledWith('payment-1', expect.objectContaining({ amount: 2800, expected_version: 1 }), expect.any(AbortSignal));
  });

  it('shows both enrollment links and records one full payment without changing sent status', async () => {
    show();
    expect(await screen.findByRole('link', { name: 'Enrollment #20' })).toHaveAttribute('href', '/enrollments/20');
    expect(screen.getByRole('link', { name: 'Enrollment #21' })).toHaveAttribute('href', '/enrollments/21');
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(screen.queryByRole('option', { name: 'Autopay' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm payment' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2026-10-18' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'The full payment has been received.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }));
    await screen.findByText('Payment recorded for every linked enrollment.');
    expect(mocks.recordPayment).toHaveBeenCalledWith('payment-1', expect.objectContaining({ amount: 2800, method: 'cash', payment_date: '2026-10-18', expected_version: 1 }), expect.any(AbortSignal));
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });
  it('keeps payment collection primary and opens the fee message on demand without resetting its language', async () => {
    show();
    const toggle = await screen.findByRole('button', { name: 'Fee message' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record payment' })).toBeVisible());
    expect(screen.queryByRole('region', { name: 'Fee message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    const message = screen.getByRole('region', { name: 'Fee message' });
    const mark = screen.getByRole('button', { name: 'Mark sent' });
    expect(message.parentElement).toContainElement(mark);
    fireEvent.click(within(message).getByRole('button', { name: 'English' }));
    expect(within(message).getByRole('textbox', { name: 'Fee message' })).toHaveValue('English fee message');
    fireEvent.click(screen.getByRole('button', { name: 'Hide fee message' }));
    expect(message).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mark sent' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fee message' }));
    expect(screen.getByRole('region', { name: 'Fee message' })).toBe(message);
    expect(within(message).getByRole('textbox', { name: 'Fee message' })).toHaveValue('English fee message');
    expect(screen.getByRole('button', { name: 'Mark sent' })).toBeVisible();
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
  });

  it('uses the shared message panel without a language subtitle and copies local edits without changing payment facts', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
    const text = screen.getByRole('textbox', { name: 'Fee message' });
    expect(screen.queryByText('Chinese fee message')).not.toBeInTheDocument();
    expect(screen.queryByText('English fee message')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy message' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Lessons' })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Edit before copying' }));
    fireEvent.change(text, { target: { value: 'A parent-specific message.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('button', { name: 'Copied!' });
    expect(mocks.copy).toHaveBeenCalledWith('A parent-specific message.');
    expect(mocks.markPaymentSent).not.toHaveBeenCalled(); expect(mocks.recordPayment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(text).toHaveValue('中文收費通知');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.queryByText('Message copied.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close fee message' }));
    expect(screen.queryByRole('textbox', { name: 'Fee message' })).not.toBeInTheDocument();
  });

  it('clears copy success when the displayed payment message becomes blocked', async () => {
    const view = show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByRole('button', { name: 'Copied!' });
    view.rerender(<BillingPayments canWrite studentId={4} initialPaymentId="payment-1" sourceBlocked onChanged={vi.fn()} />);
    expect(screen.queryByText('Message copied.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    view.rerender(<BillingPayments canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />);
    expect(screen.queryByText('Message copied.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  it('records the selected message language but copying does not mark sent', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
    await screen.findByRole('button', { name: 'Copy' });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const message = screen.getByRole('region', { name: 'Fee message' });
    await within(message).findByRole('button', { name: 'Copied!' });
    expect(within(message).getByRole('status')).toHaveTextContent('Message copied.');
    expect(mocks.copy).toHaveBeenCalledWith('English fee message');
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark sent' }));
    await screen.findByText('Fee message marked sent.');
    expect(mocks.markPaymentSent).toHaveBeenCalledWith('payment-1', expect.objectContaining({ language: 'en', expected_version: 1 }), expect.any(AbortSignal));
  });
  it('shows clipboard denial beside Copy without marking sent or recording payment', async () => {
    mocks.copy.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    const message = screen.getByRole('region', { name: 'Fee message' });
    expect(await within(message).findByRole('alert')).toHaveTextContent('Clipboard permission denied.');
    expect(within(message).getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(within(message).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(within(message.parentElement!).getByRole('button', { name: 'Refresh payment' }));
    await waitFor(() => expect(within(message).getByRole('button', { name: 'Copy' })).toBeEnabled());
    expect(within(message).queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it('shows changed-payment information beside Copy and resets success on language changes', async () => {
    mocks.payment.mockResolvedValueOnce(payment()).mockResolvedValue({ ...payment(), version: 2 });
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    const message = screen.getByRole('region', { name: 'Fee message' });
    expect(await within(message).findByRole('status')).toHaveTextContent('This payment changed. Check its details before copying.');
    expect(mocks.copy).not.toHaveBeenCalled();
    fireEvent.click(within(message).getByRole('button', { name: 'Copy' }));
    await within(message).findByRole('button', { name: 'Copied!' });
    fireEvent.click(within(message).getByRole('button', { name: 'English' }));
    expect(within(message).queryByRole('status')).not.toBeInTheDocument();
    expect(within(message).getByRole('button', { name: 'Copy' })).toBeVisible();
    expect(mocks.markPaymentSent).not.toHaveBeenCalled();
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it('refuses copying changed payment facts and disables financial actions until refreshed', async () => {
    mocks.payment.mockResolvedValueOnce(payment()).mockRejectedValueOnce(new Error('Could not verify payment.'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Fee message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(await within(screen.getByRole('region', { name: 'Fee message' })).findByRole('alert')).toHaveTextContent('Could not verify payment.');
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh payment' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Record payment' })).toBeEnabled());
  });
  it.each(['awaiting_receipt', 'none'] as const)('records an issued KMS receipt after payment with coupon status %s', async couponStatus => {
    mocks.payment.mockResolvedValue({ ...payment(), status: 'Paid', can_copy: false, payment_date: '2026-10-18', received_method: 'cash', coupon_status: couponStatus });
    show();
    const receipt = await screen.findByLabelText('Issued KMS receipt reference');
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    fireEvent.change(receipt, { target: { value: 'KMS-123' } });
    if (couponStatus === 'awaiting_receipt') fireEvent.click(screen.getByRole('checkbox', { name: 'The coupon was selected on this receipt in KMS.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    await screen.findByText('KMS receipt reference saved.');
    expect(mocks.recordReceipt).toHaveBeenCalledWith('payment-1', expect.objectContaining({ receipt_reference: 'KMS-123', expected_version: 1 }), expect.any(AbortSignal));
    if (couponStatus === 'awaiting_receipt') expect(mocks.recordReceipt.mock.lastCall![1].coupon_selected).toBe(true);
    else expect(mocks.recordReceipt.mock.lastCall![1]).not.toHaveProperty('coupon_selected');
    expect(mocks.recordReceipt.mock.lastCall![1]).not.toHaveProperty('coupon_used_on');
  });
  it('requires coupon selection again when its receipt number changes and leaves the actual KMS date blank', async () => {
    mocks.payment.mockResolvedValue({ ...payment(), status: 'Paid', can_copy: false, payment_date: '2026-10-18', received_method: 'cash', coupon_status: 'awaiting_receipt' }); show(); const reference = await screen.findByLabelText('Issued KMS receipt reference'); fireEvent.change(reference, { target: { value: 'KMS-A' } }); expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox', { name: 'The coupon was selected on this receipt in KMS.' })); expect(screen.getByLabelText('Coupon used on (optional)')).toHaveValue(''); fireEvent.change(reference, { target: { value: 'KMS-B' } }); expect(screen.getByRole('checkbox', { name: 'The coupon was selected on this receipt in KMS.' })).not.toBeChecked(); expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled(); fireEvent.click(screen.getByRole('checkbox', { name: 'The coupon was selected on this receipt in KMS.' })); fireEvent.change(screen.getByLabelText('Coupon used on (optional)'), { target: { value: '2026-10-20' } }); fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' })); await screen.findByText('KMS receipt reference saved.'); expect(mocks.recordReceipt.mock.lastCall![1]).toEqual(expect.objectContaining({ receipt_reference: 'KMS-B', coupon_selected: true, coupon_used_on: '2026-10-20' }));
  });
  it('allows an explicitly checked same-student duplicate receipt with a new retry body', async () => {
    mocks.payment.mockResolvedValue({ ...payment(), status: 'Paid', can_copy: false, payment_date: '2026-10-18', received_method: 'cash' }); mocks.recordReceipt.mockRejectedValueOnce(Object.assign(new Error('This student already has this receipt number. Check KMS and acknowledge the duplicate before continuing.'), { status: 409 })); show(); fireEvent.change(await screen.findByLabelText('Issued KMS receipt reference'), { target: { value: 'KMS-123' } }); fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' })); const acknowledgement = await screen.findByRole('checkbox', { name: 'I checked KMS. This receipt number is correct for this payment.' }); expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Refresh payment' })).not.toBeInTheDocument(); fireEvent.click(acknowledgement); fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' })); await screen.findByText('KMS receipt reference saved.'); expect(mocks.recordReceipt.mock.calls[0][1]).not.toHaveProperty('acknowledge_duplicate_receipt'); expect(mocks.recordReceipt.mock.calls[1][1].acknowledge_duplicate_receipt).toBe(true); expect(mocks.recordReceipt.mock.calls[0][1].idempotency_key).not.toBe(mocks.recordReceipt.mock.calls[1][1].idempotency_key);
  });
  it('reports receipt busy synchronously before starting its write', async () => {
    const busy = vi.fn(); mocks.payment.mockResolvedValue({ ...payment(), status: 'Paid', can_copy: false, payment_date: '2026-10-18', received_method: 'cash' }); mocks.recordReceipt.mockImplementationOnce(async () => { expect(busy).toHaveBeenLastCalledWith(true); return { ...payment(), status: 'Paid', receipt_reference: 'KMS-123', can_copy: false }; }); render(<BillingPayments inline canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} onBusyChange={busy} />, { wrapper: Wrapper }); fireEvent.change(await screen.findByLabelText('Issued KMS receipt reference'), { target: { value: 'KMS-123' } }); fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' })); await screen.findByText('KMS receipt reference saved.');
  });
  it('does not expose collection actions to impersonated tutors', async () => {
    mocks.auth.mockReturnValue({ user: { id: 99 }, effectiveRole: 'Tutor', isAdmin: false, isImpersonating: true, impersonatedTutor: { id: 7 } });
    show(); await screen.findByRole('link', { name: 'Enrollment #20' });
    expect(mocks.payment).toHaveBeenCalledWith('payment-1', 7);
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark .*message sent/ })).not.toBeInTheDocument();
  });
  it('records actual autopay only as a bank debit', async () => {
    const autopay = payment(); autopay.review.period.collection.method = 'autopay';
    mocks.payment.mockResolvedValue(autopay);
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    expect(screen.getByLabelText('Received by')).toHaveValue('autopay');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Autopay' })).toBeInTheDocument();
  });
  it('requires a reason and explicit confirmation to cancel all linked enrollments', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Cancel enrollments' }));
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason for cancellation'), { target: { value: 'Parent postponed the return.' } });
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cancel every linked enrollment and its scheduled sessions.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await screen.findByText('The linked enrollments have been cancelled.');
    expect(screen.getByText('Parent postponed the return.')).toBeInTheDocument();
    expect(mocks.cancelPayment).toHaveBeenCalledWith('payment-1', expect.objectContaining({ reason: 'Parent postponed the return.', expected_version: 1 }), expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });
  it('does not show a returned payment belonging to another selection', async () => {
    mocks.payment.mockResolvedValue({ ...payment(), id: 'different-payment' });
    show(); await waitFor(() => expect(mocks.payment).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Enrollment #20' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
  });
});


it('keeps non-coupon receipts optional after payment', async () => {
  mocks.payment.mockResolvedValue({ ...payment(), status: 'Paid', can_copy: false, payment_date: '2026-10-18', received_method: 'cash', coupon_status: 'none' });
  render(<BillingPayments inline canWrite studentId={4} initialPaymentId="payment-1" onChanged={vi.fn()} />, { wrapper: Wrapper });
  const summary = await screen.findByText('Add KMS receipt (optional)');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  expect(screen.queryByText('KMS receipt pending')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Coupon receipt' })).not.toBeInTheDocument();
  fireEvent.click(summary);
  expect(screen.getByLabelText('Issued KMS receipt reference')).toBeInTheDocument();
});
