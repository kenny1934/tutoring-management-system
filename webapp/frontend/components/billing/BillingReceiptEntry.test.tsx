import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingReceiptsQueue } from './BillingReceiptsQueue';
import type { BillingPaymentDetail, BillingReceiptTask, BillingReceiptTasks } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), receipts: vi.fn(), payment: vi.fn(), payments: vi.fn(), recordReceipt: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/hooks', () => ({ useVisibilityAwareInterval: () => 0 }));

function task(id = 'payment-one'): BillingReceiptTask {
  return { payment_id: id, student: { id: 4, student_name: 'Synthetic Student', school_student_id: '0004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, first_lesson_date: '2026-11-02', last_lesson_date: '2026-12-21', lesson_count: 8, total_amount: 2900, received_amount: 2900, payment_date: '2026-10-20', received_method: 'bank_transfer', coupon_value: 300, coupon_status: 'awaiting_receipt', receipt_reference: null, needs_checking: false, issues: [] };
}
function response(rows = [task(), task('payment-two')], overrides: Partial<BillingReceiptTasks> = {}): BillingReceiptTasks {
  return { as_of: '2026-10-22', storage_available: true, writes_available: true, total: rows.length, offset: 0, limit: 25, rows, ...overrides };
}
function payment(id = 'payment-one', overrides: Partial<BillingPaymentDetail> = {}): BillingPaymentDetail {
  return {
    id, student_id: 4, version: 2, status: 'Paid', created_at: '2026-10-19', sent_at: '2026-10-19', sent_language: 'zh', paid_at: '2026-10-20', payment_date: '2026-10-20', received_method: 'bank_transfer', receipt_reference: null, coupon_status: 'awaiting_receipt', note: null, can_copy: false, review_issues: [], history: [],
    lines: [{ enrollment_id: 20, slot_index: 0, tutor_id: 7, tutor_name: 'Synthetic Tutor', lesson_count: 8, gross_tuition: 3200, discount_amount: 300, tuition_amount: 2900, materials_fee: 0 }],
    review: { student: task().student, source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review', basis: 'paid_only', selected_enrollment_ids: [10], confirmed_checks: [], issues: [],
      scenario: { first_lesson_date: '2026-11-02', slots: [{ weekday: 'Mon', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
      message: { template_version: 'v2', zh: null, en: null, blocked_reasons: [] },
      period: { number: 1, kind: 'transition', explanation: 'November and December.', coverage_from: '2026-11-01', coverage_through: '2026-12-31', first_lesson_date: '2026-11-02', last_lesson_date: '2026-12-21', lesson_count: 8, counts_by_month: [{ month: '2026-11', lessons: 4 }, { month: '2026-12', lessons: 4 }], counts_by_slot: [8], lessons: [{ date: '2026-11-02', weekday: 'Mon', slot: 0, time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }], gross_tuition: 3200, deductions: [{ kind: 'ordinary', amount: 300 }], tuition_after_deductions: 2900, materials_fee: 0, total_fee: 2900, adjustment_reason: null, requires_review: false,
        collection: { method: 'manual', notice_from: '2026-10-12', notice_to: '2026-10-18', debit_from: null, debit_to: null, due_before_lesson: '2026-11-02', gap_min_days: null, gap_max_days: null } } },
    ...overrides,
  };
}
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 0 }}>{children}</SWRConfig>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(complete => { resolve = complete; }); return { promise, resolve }; }
async function openFirst() {
  const buttons = await screen.findAllByRole('button', { name: 'Record receipt' }); fireEvent.click(buttons[0]);
  const dialog = await screen.findByRole('dialog', { name: 'Payment' }); await within(dialog).findByLabelText('Issued KMS receipt reference'); return dialog;
}
function fillReceipt(dialog: HTMLElement, value = 'KMS-ONE') {
  fireEvent.change(within(dialog).getByLabelText('Issued KMS receipt reference'), { target: { value } });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'The coupon was selected on this receipt in KMS.' }));
  fireEvent.change(within(dialog).getByLabelText('Coupon used on (optional)'), { target: { value: '2026-10-21' } });
}
let remaining: BillingReceiptTask[];
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, effectiveRole: 'Admin', isReadOnly: false });
  remaining = [task(), task('payment-two')];
  mocks.receipts.mockImplementation(async () => response(remaining));
  mocks.payment.mockImplementation(async (id: string) => payment(id));
  mocks.payments.mockResolvedValue([]);
  mocks.recordReceipt.mockImplementation(async (id: string, body: { receipt_reference: string }) => { remaining = remaining.filter(row => row.payment_id !== id); return payment(id, { version: 3, receipt_reference: body.receipt_reference, coupon_status: 'recorded_in_kms' }); });
});

describe('focused receipt entry in the outstanding queue', () => {
  it('focuses the reference and retains success until explicit Next opens a clean second payment for the same student', async () => {
    mocks.recordReceipt.mockRejectedValueOnce(Object.assign(new Error('This student already has this receipt number. Check KMS and acknowledge the duplicate before continuing.'), { status: 409 }));
    render(<BillingReceiptsQueue location="MSA" search="" searchPending={false} />, { wrapper: Wrapper });
    const dialog = await openFirst();
    await waitFor(() => expect(within(dialog).getByLabelText('Issued KMS receipt reference')).toHaveFocus());
    expect(within(dialog).getByRole('region', { name: 'Receipt payment' })).toHaveTextContent('Synthetic Student');
    expect(within(dialog).getByRole('region', { name: 'Receipt payment' })).toHaveTextContent('MOP 2,900');
    const summary = within(dialog).getByText('Enrollment details');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    const submit = within(dialog).getByRole('button', { name: 'Record KMS receipt' });
    expect(submit).toHaveAttribute('form', within(dialog).getByRole('form', { name: 'Record KMS receipt' }).id);
    expect(submit.closest('[data-receipt-footer]')).not.toBeNull();
    fillReceipt(dialog); fireEvent.click(submit);
    const duplicate = await within(dialog).findByRole('checkbox', { name: 'I checked KMS. This receipt number is correct for this payment.' });
    expect(submit).toBeDisabled(); fireEvent.click(duplicate); fireEvent.click(submit);
    await within(dialog).findByText('KMS receipt reference saved.');
    expect(within(dialog).getByText('Synthetic Student · KMS-ONE')).toBeInTheDocument();
    const next = within(dialog).getByRole('button', { name: 'Next receipt' }); await waitFor(() => expect(next).toBeEnabled());
    expect(mocks.payment).not.toHaveBeenCalledWith('payment-two', expect.anything());
    expect(mocks.recordReceipt).toHaveBeenCalledWith('payment-one', expect.objectContaining({ receipt_reference: 'KMS-ONE', coupon_selected: true, coupon_used_on: '2026-10-21', expected_version: 2 }), expect.any(AbortSignal));
    fireEvent.click(next);
    await waitFor(() => expect(mocks.payment).toHaveBeenCalledWith('payment-two', undefined));
    expect(await within(dialog).findByLabelText('Issued KMS receipt reference')).toHaveValue('');
    expect(within(dialog).getByRole('checkbox', { name: 'The coupon was selected on this receipt in KMS.' })).not.toBeChecked();
    expect(within(dialog).queryByLabelText('Coupon used on (optional)')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: 'I checked KMS. This receipt number is correct for this payment.' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Synthetic Student · KMS-ONE')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled();
  });

  it('keeps successful receipt evidence visible while a failed list refresh prevents Next', async () => {
    render(<BillingReceiptsQueue search="" searchPending={false} />, { wrapper: Wrapper }); const dialog = await openFirst();
    fillReceipt(dialog); mocks.receipts.mockRejectedValue(new Error('List refresh failed.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record KMS receipt' }));
    await screen.findByText('Could not load KMS receipts.');
    expect(await within(dialog).findByText('Synthetic Student · KMS-ONE')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next receipt' })).toBeDisabled();
    expect(mocks.payment).not.toHaveBeenCalledWith('payment-two', expect.anything());
    mocks.receipts.mockImplementation(async () => response(remaining)); fireEvent.click(screen.getByRole('button', { name: 'Retry receipts' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Next receipt' })).toBeEnabled());
  });

  it('waits for a held fresh response and refuses Next when the completed payment is still returned', async () => {
    render(<BillingReceiptsQueue search="" searchPending={false} />, { wrapper: Wrapper }); const dialog = await openFirst();
    const fresh = deferred<BillingReceiptTasks>(); mocks.receipts.mockReturnValue(fresh.promise);
    fillReceipt(dialog); fireEvent.click(within(dialog).getByRole('button', { name: 'Record KMS receipt' }));
    await within(dialog).findByText('KMS receipt reference saved.');
    expect(within(dialog).getByRole('button', { name: 'Next receipt' })).toBeDisabled();
    await act(async () => fresh.resolve(response([task(), task('payment-two')])));
    expect(within(dialog).getByRole('button', { name: 'Next receipt' })).toBeDisabled();
    expect(mocks.payment).not.toHaveBeenCalledWith('payment-two', expect.anything());
  });

  it('loads a fresh preceding page before offering Next after the last row on the final page is completed', async () => {
    let saved = false; const previousPage = deferred<BillingReceiptTasks>();
    mocks.receipts.mockImplementation(({ offset }: { offset: number }) => {
      if (!saved) return Promise.resolve(response(offset ? [task('payment-two')] : [task()], { offset, total: 26 }));
      return offset ? Promise.resolve(response([], { offset, total: 25 })) : previousPage.promise;
    });
    mocks.recordReceipt.mockImplementation(async (id: string) => { saved = true; return payment(id, { version: 3, receipt_reference: 'KMS-TWO' }); });
    render(<BillingReceiptsQueue tutorId={7} search="student" searchPending={false} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mocks.receipts).toHaveBeenCalledWith(expect.objectContaining({ offset: 25, tutor_id: 7, search: 'student' })));
    const dialog = await openFirst(); fillReceipt(dialog, 'KMS-TWO'); fireEvent.click(within(dialog).getByRole('button', { name: 'Record KMS receipt' }));
    await within(dialog).findByText('KMS receipt reference saved.');
    await waitFor(() => expect(mocks.receipts).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, tutor_id: 7, search: 'student' })));
    expect(within(dialog).getByRole('button', { name: 'Next receipt' })).toBeDisabled();
    await act(async () => previousPage.resolve(response([task()], { total: 25 })));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Next receipt' })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next receipt' }));
    expect(await within(dialog).findByLabelText('Issued KMS receipt reference')).toHaveValue('');
    await waitFor(() => expect(mocks.payment).toHaveBeenLastCalledWith('payment-one', undefined));
  });

  it('aborts a held receipt write and suppresses its completion after effective access changes', async () => {
    const held = deferred<BillingPaymentDetail>(); mocks.recordReceipt.mockReturnValue(held.promise);
    const view = render(<BillingReceiptsQueue search="" searchPending={false} />, { wrapper: Wrapper }); const dialog = await openFirst(); fillReceipt(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record KMS receipt' }));
    const signal = mocks.recordReceipt.mock.lastCall![2] as AbortSignal;
    fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.getByRole('dialog')).toBe(dialog);
    mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: false, effectiveRole: 'Supervisor', isReadOnly: true });
    view.rerender(<BillingReceiptsQueue search="" searchPending={false} />);
    await act(async () => held.resolve(payment('payment-one', { receipt_reference: 'KMS-ONE', version: 3 })));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('KMS receipt reference saved.')).not.toBeInTheDocument();
  });
});
