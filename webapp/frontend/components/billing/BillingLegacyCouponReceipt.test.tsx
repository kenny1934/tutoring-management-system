import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingLegacyCouponReceipt } from './BillingLegacyCouponReceipt';
import type { BillingCouponBalance } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), couponBalance: vi.fn(), recordLegacyCouponReceipt: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/billing-clock', () => ({ billingToday: () => '2026-11-12' }));

function balance(changes: Partial<BillingCouponBalance> = {}): BillingCouponBalance {
  return { student_id: 4, storage_available: true, writes_available: true, version: 3,
    observation: null, reserved_count: 0, receipt_pending_count: 1, used_awaiting_sync_count: 0,
    usable_count: null, groups: [], checked_at: null, checked_by: null, issues: [], can_verify: false,
    uses: [{ id: 'use-1', payment_id: null, legacy_enrollment_id: 22, value: 300, expires_on: null,
      state: 'awaiting_receipt', accounted_in_observation: false, receipt_reference: null, payment_date: '2026-11-09' }], ...changes };
}
function saved() {
  const initial = balance();
  return balance({ version: 4, receipt_pending_count: 0, uses: [{ ...initial.uses[0], state: 'receipt_recorded', receipt_reference: 'KMS-123' }] });
}
function show(props: Partial<Parameters<typeof BillingLegacyCouponReceipt>[0]> = {}) {
  return render(<BillingLegacyCouponReceipt studentId={4} useId="use-1" onSaved={vi.fn()} {...props} />);
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Record receipt' }));
  return screen.findByLabelText('Issued KMS receipt reference');
}
async function fill(date = '2026-11-09') {
  fireEvent.change(screen.getByLabelText('Issued KMS receipt reference'), { target: { value: 'KMS-123' } });
  fireEvent.change(screen.getByLabelText('Coupon used on'), { target: { value: date } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'This receipt is for this enrollment and the coupon was selected in KMS.' }));
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.couponBalance.mockResolvedValue(balance());
  mocks.recordLegacyCouponReceipt.mockResolvedValue(saved());
});

describe('legacy coupon receipt entry', () => {
  it('loads only when opened and requires actual receipt evidence while allowing an earlier receipt date', async () => {
    show(); expect(mocks.couponBalance).not.toHaveBeenCalled();
    await open();
    expect(mocks.couponBalance).toHaveBeenCalledWith(4, undefined, expect.any(AbortSignal));
    expect(screen.getByLabelText('Issued KMS receipt reference')).toHaveFocus();
    expect(screen.getByText(/Enrollment #22 · CSM payment entry/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Issued KMS receipt reference'), { target: { value: 'KMS-123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Coupon used on'), { target: { value: '2026-10-13' } });
    expect(screen.getByText('Receipt date is earlier than the CSM entry.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeEnabled();
    expect(mocks.recordLegacyCouponReceipt).not.toHaveBeenCalled();
  });
  it('records only receipt metadata with the current version and reports success within the row', async () => {
    const onSaved = vi.fn(), onBusyChange = vi.fn(); show({ onSaved, onBusyChange });
    await open(); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Receipt recorded.');
    expect(screen.getByRole('status')).toHaveFocus();
    expect(mocks.recordLegacyCouponReceipt).toHaveBeenCalledWith(4, 'use-1', {
      expected_version: 3, idempotency_key: expect.any(String), receipt_reference: 'KMS-123', coupon_used_on: '2026-11-09', coupon_selected: true,
    }, expect.any(AbortSignal));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenCalledWith(true); expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it('omits duplicate context and success copy when embedded in the parent review', async () => {
    const onSaved = vi.fn(); show({ embedded: true, onSaved });
    await open();
    expect(screen.queryByText(/Enrollment #22 · CSM payment entry/)).not.toBeInTheDocument();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Receipt recorded.')).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Record coupon receipt' })).not.toBeInTheDocument();
  });
  it('retains the same request and key after an uncertain failure', async () => {
    mocks.recordLegacyCouponReceipt.mockRejectedValueOnce(new Error('Connection lost'));
    show(); await open(); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    await screen.findByText('Connection lost');
    const first = mocks.recordLegacyCouponReceipt.mock.calls[0][2];
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    await screen.findByText('Receipt recorded.');
    expect(mocks.recordLegacyCouponReceipt.mock.calls[1][2]).toEqual(first);
  });
  it('requires reloading after a stale-version conflict and uses the newly loaded version', async () => {
    mocks.recordLegacyCouponReceipt.mockRejectedValueOnce(Object.assign(new Error('Coupon changed'), { status: 409 }));
    show(); await open(); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    await screen.findByText('Coupon changed');
    expect(screen.getByRole('button', { name: 'Record KMS receipt' })).toBeDisabled();
    mocks.couponBalance.mockResolvedValue(balance({ version: 5 }));
    mocks.recordLegacyCouponReceipt.mockResolvedValue({ ...saved(), version: 6 });
    fireEvent.click(screen.getByRole('button', { name: 'Reload receipt details' }));
    await waitFor(() => expect(screen.getByLabelText('Issued KMS receipt reference')).toHaveValue(''));
    await fill(); fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    await screen.findByText('Receipt recorded.');
    expect(mocks.recordLegacyCouponReceipt.mock.lastCall![2].expected_version).toBe(5);
  });
  it.each(['student', 'use', 'new_payment', 'unpaid', 'writes_disabled'])('withholds the form for invalid %s records', async kind => {
    const data = balance();
    if (kind === 'student') data.student_id = 9;
    if (kind === 'use') data.uses = [];
    if (kind === 'new_payment') data.uses[0].payment_id = 'payment-1';
    if (kind === 'unpaid') data.uses[0].state = 'reserved';
    if (kind === 'writes_disabled') data.writes_available = false;
    mocks.couponBalance.mockResolvedValue(data); show();
    fireEvent.click(screen.getByRole('button', { name: 'Record receipt' }));
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('Issued KMS receipt reference')).not.toBeInTheDocument();
    expect(mocks.recordLegacyCouponReceipt).not.toHaveBeenCalled();
  });
  it('aborts a held save on identity change and discards its late success', async () => {
    let complete!: (value: BillingCouponBalance) => void;
    mocks.recordLegacyCouponReceipt.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const onSaved = vi.fn(); const view = show({ onSaved }); await open(); await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Record KMS receipt' }));
    const signal = mocks.recordLegacyCouponReceipt.mock.lastCall![3] as AbortSignal;
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    view.rerender(<BillingLegacyCouponReceipt studentId={5} useId="use-2" onSaved={onSaved} />);
    expect(signal.aborted).toBe(true);
    await act(async () => complete(saved()));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByText('Receipt recorded.')).not.toBeInTheDocument();
  });
  it('hides receipt controls for read-only and tutor roles', () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: true });
    const view = show(); expect(screen.queryByRole('button')).not.toBeInTheDocument();
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false });
    view.rerender(<BillingLegacyCouponReceipt studentId={4} useId="use-1" onSaved={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(mocks.couponBalance).not.toHaveBeenCalled();
  });
});
