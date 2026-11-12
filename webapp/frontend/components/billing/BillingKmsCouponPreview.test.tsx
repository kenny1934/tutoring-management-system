import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingKmsCouponPreviewButton } from './BillingKmsCouponPreview';
import { BillingCouponImportButton } from './BillingCouponImport';
import type { KmsCheckReview, KmsCoupon, KmsStudentReview } from '@/types/kms-coupons';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), status: vi.fn(), check: vi.fn(), review: vi.fn(), apply: vi.fn(), enrollmentLink: vi.fn(), legacyReceipt: vi.fn(), paymentEditor: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/kms-coupons-api', () => ({ kmsCouponsAPI: mocks }));
vi.mock('./BillingCouponEnrollmentLink', () => ({ BillingCouponEnrollmentLink: (props: { enrollmentId: number; studentId: number }) => <button onClick={() => mocks.enrollmentLink(props)}>Enrollment #{props.enrollmentId}</button> }));
vi.mock('./BillingLegacyCouponReceipt', () => ({ BillingLegacyCouponReceipt: (props: { studentId: number; useId: string; onSaved: () => void; onBusyChange: (busy: boolean) => void }) => <button onClick={() => mocks.legacyReceipt(props)}>Record receipt</button> }));
vi.mock('./BillingPayments', () => ({ BillingPayments: (props: { studentId: number; initialPaymentId: string; mode: string }) => { mocks.paymentEditor(props); return <p>Receipt editor</p>; } }));


function coupon(number: string, overrides: Partial<KmsCoupon> = {}): KmsCoupon {
  return { number, company_id: 'MSA0021', value: 300, state: 'active', issued_on: '2026-06-10', expires_on: '2027-06-30', used_on: null, receipt_reference: null, ...overrides };
}
function student(overrides: Partial<KmsStudentReview> = {}): KmsStudentReview {
  return { company_id: 'MSA0021', student: { id: 101, student_name: 'Synthetic Student', school_student_id: '0021', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, status: 'matched', active_count: 2, previous_count: null, csm_count: 2, coupons: [{ coupon: coupon('A'), change: 'active', previous: null, newly_used: false, listed_active: true }, { coupon: coupon('B'), change: 'active', previous: null, newly_used: false, listed_active: true }], uses: [], issues: [], ...overrides };
}
function result(overrides: Partial<KmsCheckReview> = {}): KmsCheckReview {
  return { id: '11111111-1111-1111-1111-111111111111', branch: 'MSA', fetched_at: '2026-11-09T12:00:00Z', previous_fetched_at: null, source_sha256: 'a'.repeat(64), used_years: [2025, 2026], active_count: 2, new_count: 0, changed_count: 0, used_count: 0, newly_used_count: 0, expired_count: 0, missing_count: 0, review_count: 0, unmatched_count: 0, students: [student()], ...overrides };
}
function ready(overrides: Partial<KmsCheckReview> = {}): KmsCheckReview {
  return result({ update: { review_hash: 'b'.repeat(64), ready_count: 1, held_count: 0, unchanged_count: 0, can_apply: true, issues: [] }, students: [student({ update_status: 'ready', update_issues: [], available_after: 2 })], ...overrides });
}
function applied() {
  return { check_id: result().id, updated_count: 1, held_count: 0, skipped_count: 0, review: ready({ update: { review_hash: 'c'.repeat(64), ready_count: 0, held_count: 0, unchanged_count: 1, can_apply: false, issues: [] }, students: [student({ update_status: 'unchanged', update_issues: [], available_after: 2 })] }) };
}
async function open(defaultBranch?: string) {
  const view = render(<BillingKmsCouponPreviewButton storageAvailable defaultBranch={defaultBranch} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check KMS coupons' }));
  const dialog = await screen.findByRole('dialog', { name: 'KMS coupons' });
  await waitFor(() => expect(within(dialog).queryByText('Loading KMS checks…')).not.toBeInTheDocument());
  return { view, dialog };
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.status.mockResolvedValue({ enabled: true, historical_receipts_enabled: true, branches: ['MSA', 'MSB'], latest: [] });
  mocks.check.mockResolvedValue(result()); mocks.review.mockResolvedValue(result());
  mocks.apply.mockResolvedValue(applied());
});

describe('KMS coupon preview', () => {
  it('only reads KMS after a deliberate click and has no balance apply action', async () => {
    const { dialog } = await open('MSA');
    expect(mocks.check).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    await within(dialog).findByText(/First check/);
    expect(mocks.check.mock.lastCall![0]).toBe('MSA');
    expect(within(dialog).getByText('Preview only. CSM coupon balances stay unchanged.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /apply|confirm|record payment/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Changes/ })).not.toBeInTheDocument();
  });
  it('shows the added and used coupons together when the total remains two', async () => {
    const a = coupon('A'), b = coupon('B', { state: 'used', issued_on: null, expires_on: null, used_on: '2026-11-09', receipt_reference: 'TEST-R1' }), c = coupon('C');
    mocks.check.mockResolvedValue(result({ previous_fetched_at: '2026-11-08T12:00:00Z', new_count: 1, used_count: 1, newly_used_count: 1, students: [student({ previous_count: 2, coupons: [
      { coupon: a, change: 'active', previous: a, newly_used: false, listed_active: true },
      { coupon: b, change: 'used', previous: coupon('B'), newly_used: true, listed_active: false },
      { coupon: c, change: 'new', previous: null, newly_used: false, listed_active: true },
    ] })] }));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Changes (2)' }));
    expect(within(dialog).getByText('CP# B')).toBeInTheDocument();
    expect(within(dialog).getByText('CP# C')).toBeInTheDocument();
    expect(within(dialog).queryByText('CP# A')).not.toBeInTheDocument();
    expect(within(dialog).getByText('TEST-R1')).toBeInTheDocument();
  });
  it('reads branches serially and preserves a successful first branch when the second fails', async () => {
    let finish!: (value: KmsCheckReview) => void;
    mocks.check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('MSB could not be reached.'));
    const { dialog } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    expect(mocks.check).toHaveBeenCalledTimes(1);
    expect(mocks.check.mock.calls[0][0]).toBe('MSA');
    await act(async () => finish(result()));
    await within(dialog).findByRole('alert');
    expect(mocks.check.mock.calls[1][0]).toBe('MSB');
    expect(within(dialog).getByText('MSB could not be reached.')).toBeInTheDocument();
    expect(within(dialog).getByText('Synthetic Student')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Read from KMS' })).toBeEnabled());
  });
  it('opens a saved check without logging into KMS again', async () => {
    mocks.status.mockResolvedValue({ enabled: true, branches: ['MSA'], latest: [{ id: result().id, branch: 'MSA', fetched_at: result().fetched_at, active_count: 2 }] });
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'View check' }));
    await within(dialog).findByText('Synthetic Student');
    expect(mocks.review.mock.lastCall![0]).toBe(result().id);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it('shows disabled setup without attempting a source read', async () => {
    mocks.status.mockResolvedValue({ enabled: false, branches: [], latest: [] });
    const { dialog } = await open();
    expect(within(dialog).getByText('KMS coupon checks have not been enabled yet.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Read from KMS' })).toBeDisabled();
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it('aborts and discards a held result when effective access changes', async () => {
    let finish!: (value: KmsCheckReview) => void;
    mocks.check.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { view, dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    const signal = mocks.check.mock.lastCall![1] as AbortSignal;
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Supervisor', isAdmin: false, isReadOnly: true });
    view.rerender(<BillingKmsCouponPreviewButton storageAvailable defaultBranch="MSA" />);
    await act(async () => finish(result()));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
  });
  it('rejects a response from a different branch', async () => {
    mocks.check.mockResolvedValue(result({ branch: 'MSB' }));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    await within(dialog).findByText('The KMS check changed. Open it again.');
    expect(within(dialog).queryByText('Synthetic Student')).not.toBeInTheDocument();
  });
  it('keeps expired coupons listed by KMS visible in the Active view', async () => {
    mocks.check.mockResolvedValue(result({ active_count: 1, expired_count: 1, review_count: 1, students: [student({
      active_count: 1, status: 'review', coupons: [{ coupon: coupon('A', { expires_on: '2026-11-08' }), change: 'expired', previous: null, newly_used: false, listed_active: true }],
      issues: [{ code: 'ACTIVE_EXPIRED', message: 'KMS lists an expired coupon as active.' }],
    })] }));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Active (1)' }));
    expect(within(dialog).getByText('CP# A')).toBeInTheDocument();
    expect(within(dialog).getByText('Expired')).toBeInTheDocument();
    expect(within(dialog).queryByText('No students in this view.')).not.toBeInTheDocument();
  });
  it('distinguishes duplicate CSM profiles from students absent from CSM', async () => {
    mocks.check.mockResolvedValue(result({ review_count: 1, unmatched_count: 1, students: [student({ student: null, status: 'review', issues: [{ code: 'AMBIGUOUS_STUDENT', message: 'More than one CSM student has this branch and student ID.' }] })] }));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Unmatched (1)' }));
    expect(within(dialog).getByText('Duplicate student ID')).toBeInTheDocument();
    expect(within(dialog).queryByText('Not in CSM')).not.toBeInTheDocument();
  });
  it('aborts a held status request when the dialog closes', async () => {
    mocks.status.mockImplementationOnce(() => new Promise(() => {}));
    render(<BillingKmsCouponPreviewButton storageAvailable defaultBranch="MSA" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check KMS coupons' }));
    const dialog = await screen.findByRole('dialog', { name: 'KMS coupons' });
    const signal = mocks.status.mock.lastCall![0] as AbortSignal;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(signal.aborted).toBe(true);
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it('uses three views and one update action with a clear success result', async () => {
    mocks.check.mockResolvedValue(ready());
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    const update = await within(dialog).findByRole('button', { name: 'Update 1 student' });
    expect(within(dialog).getByRole('button', { name: 'Updates (1)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'All coupons' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Changes|Used \(/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Available after update: 2 coupons')).toBeInTheDocument();
    fireEvent.click(update);
    await within(dialog).findByText('Updated 1 student.');
    expect(mocks.apply.mock.lastCall![0]).toBe(result().id);
    expect(mocks.apply.mock.lastCall![1]).toEqual({ expected_review_hash: 'b'.repeat(64), idempotency_key: expect.any(String) });
    expect(within(dialog).queryByRole('button', { name: 'Update 1 student' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Up to date')).toBeInTheDocument();
  });
  it('retries an uncertain update with exactly the same operation key', async () => {
    mocks.check.mockResolvedValue(ready()); mocks.apply.mockRejectedValueOnce(new Error('Connection interrupted.'));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Update 1 student' }));
    await within(dialog).findByRole('alert');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Update 1 student' })).toBeEnabled());
    const sent = mocks.apply.mock.calls[0][1];
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update 1 student' }));
    await within(dialog).findByText('Updated 1 student.');
    expect(mocks.apply.mock.calls[1][1]).toEqual(sent);
  });
  it('refreshes a changed review after conflict and requires another deliberate update', async () => {
    mocks.check.mockResolvedValue(ready());
    mocks.apply.mockRejectedValueOnce(Object.assign(new Error('Coupon records changed.'), { status: 409 }));
    mocks.review.mockResolvedValue(ready({ update: { ...ready().update!, review_hash: 'd'.repeat(64) } }));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Update 1 student' }));
    await within(dialog).findByText('Coupon records changed.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Update 1 student' })).toBeEnabled());
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update 1 student' }));
    await within(dialog).findByText('Updated 1 student.');
    expect(mocks.apply.mock.calls[1][1].expected_review_hash).toBe('d'.repeat(64));
    expect(mocks.apply.mock.calls[1][1].idempotency_key).not.toBe(mocks.apply.mock.calls[0][1].idempotency_key);
  });
  it('blocks duplicate starts and closing while an update is running', async () => {
    mocks.check.mockResolvedValue(ready());
    let finish!: (value: ReturnType<typeof applied>) => void;
    mocks.apply.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { dialog } = await open('MSA');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    const update = await within(dialog).findByRole('button', { name: 'Update 1 student' });
    fireEvent.click(update); fireEvent.click(update);
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
    await act(async () => finish(applied()));
    await within(dialog).findByText('Updated 1 student.');
  });
  it('keeps success visible when the student switches from manual verification to KMS management', async () => {
    mocks.check.mockResolvedValue(ready());
    const view = render(<BillingCouponImportButton storageAvailable writesAvailable defaultBranch="MSA" />);
    fireEvent.click(screen.getByRole('button', { name: 'Check KMS coupons' }));
    const dialog = await screen.findByRole('dialog', { name: 'KMS coupons' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Read from KMS' })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Update 1 student' }));
    await within(dialog).findByText('Updated 1 student.');
    view.rerender(<BillingCouponImportButton storageAvailable writesAvailable defaultBranch="MSA" manualFallback={false} />);
    expect(screen.getByRole('dialog', { name: 'KMS coupons' })).toBeInTheDocument();
    expect(screen.getByText('Updated 1 student.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import MSA KMS list' })).not.toBeInTheDocument();
  });
});

it('shows an automatic receipt proposal before updating without a separate confirmation', async () => {
  mocks.check.mockResolvedValue(ready({ students: [student({ update_status: 'ready', available_after: 1,
    uses: [{ use_id: 'use-1', payment_id: 'payment-1', legacy_enrollment_id: null, value: 300,
      receipt_reference: 'AUTO-R1', state: 'awaiting_receipt', result: 'link_receipt', coupon_number: 'CP-B' }],
  })] }));
  const { dialog } = await open('MSA');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
  await within(dialog).findByRole('button', { name: 'Update 1 student' });
  fireEvent.click(within(dialog).getByText('MSA0021'));
  expect(within(dialog).getByText('Receipt will be linked')).toBeVisible();
  expect(within(dialog).getByText('Receipt AUTO-R1 · CP# CP-B')).toBeVisible();
  expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  expect(mocks.apply).not.toHaveBeenCalled();
});


it('opens the linked enrollment and records a legacy receipt directly within its KMS review', async () => {
  const held = ready({ update: { review_hash: 'd'.repeat(64), ready_count: 0, held_count: 1, unchanged_count: 0, can_apply: false, issues: [] }, students: [student({
    update_status: 'review', update_issues: [{ code: 'KMS_SYNC_RECEIPT', message: 'Record the KMS receipt for this enrollment.' }],
    uses: [{ use_id: 'legacy-use', payment_id: null, legacy_enrollment_id: 77, enrollment_ids: [77], payment_date: '2026-11-09', value: 300,
      receipt_reference: null, state: 'awaiting_receipt', result: 'awaiting_receipt', coupon_number: null }],
  })] });
  mocks.check.mockResolvedValue(held); mocks.review.mockResolvedValue(ready());
  const { dialog } = await open('MSA');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
  await within(dialog).findByRole('button', { name: 'Check (1)' });
  fireEvent.click(within(dialog).getByText('MSA0021'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Enrollment #77' }));
  expect(mocks.enrollmentLink).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: 77, studentId: 101 }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record receipt' }));
  const props = mocks.legacyReceipt.mock.lastCall![0];
  expect(props).toMatchObject({ studentId: 101, useId: 'legacy-use' });
  act(() => props.onBusyChange(true));
  expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
  expect(within(dialog).getByLabelText('Find student in KMS check')).toBeDisabled();
  act(() => props.onBusyChange(false));
  act(() => props.onSaved());
  await within(dialog).findByText('Receipt recorded.');
  await waitFor(() => expect(mocks.review).toHaveBeenCalledWith(held.id, expect.any(AbortSignal)));
  expect(within(dialog).getByRole('button', { name: 'Check (0)' })).toHaveAttribute('aria-pressed', 'true');
  expect(mocks.check).toHaveBeenCalledTimes(1);
});

it('opens the existing receipt editor for a new-scheme payment from the KMS review', async () => {
  mocks.check.mockResolvedValue(ready({ students: [student({ update_status: 'ready', available_after: 1,
    uses: [{ use_id: 'new-use', payment_id: 'payment-1', legacy_enrollment_id: null, enrollment_ids: [88], value: 300,
      receipt_reference: null, state: 'awaiting_receipt', result: 'awaiting_receipt', coupon_number: null }],
  })] }));
  const { dialog } = await open('MSA');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
  await within(dialog).findByRole('button', { name: 'Update 1 student' });
  fireEvent.click(within(dialog).getByText('MSA0021'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record receipt' }));
  await screen.findByRole('dialog', { name: 'Payment' });
  expect(mocks.paymentEditor.mock.lastCall![0]).toMatchObject({ studentId: 101, initialPaymentId: 'payment-1', mode: 'receipt', canWrite: true });
});

it('keeps legacy enrollment inspection available before receipt recording is enabled', async () => {
  mocks.status.mockResolvedValue({ enabled: true, branches: ['MSA'], latest: [] });
  mocks.check.mockResolvedValue(ready({ students: [student({ update_status: 'ready', available_after: 0,
    uses: [{ use_id: 'legacy-disabled', payment_id: null, legacy_enrollment_id: 77, enrollment_ids: [77], value: 300,
      receipt_reference: null, state: 'awaiting_receipt', result: 'awaiting_receipt', coupon_number: null }],
  })] }));
  const { dialog } = await open('MSA');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Read from KMS' }));
  await within(dialog).findByRole('button', { name: 'Update 1 student' });
  fireEvent.click(within(dialog).getByText('MSA0021'));
  expect(within(dialog).getByRole('button', { name: 'Enrollment #77' })).toBeVisible();
  expect(within(dialog).queryByRole('button', { name: 'Record receipt' })).not.toBeInTheDocument();
});
