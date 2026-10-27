import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPreferenceBatchModal } from './BillingPreferenceBatchModal';
import type { BillingPreferences, BillingRosterRow } from '@/types/billing';

const mocks = vi.hoisted(() => ({ preferences: vi.fn(), savePreferences: vi.fn(), saved: vi.fn(), close: vi.fn(),
  confirmDraft: vi.fn(), recordManualPayment: vi.fn(), markPaymentSent: vi.fn(), recordReceipt: vi.fn(), verifyCoupons: vi.fn() }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: mocks }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));

function row(id: number, changes: Partial<BillingRosterRow> = {}): BillingRosterRow {
  return { student: { id, student_name: `Synthetic Student ${id}`, school_student_id: String(id), home_location: 'MSA', grade: 'F1', is_staff_referral: false },
    recorded_payment_method: null, mandate_ready: false, preference_version: 2,
    upcoming_original_count: 3, pending_bill_count: 0, sent_pending_bill_count: 0, pending_makeup_count: 0,
    slot_candidate_count: 1, selected_slot_count: 1, last_paid_original_date: '2026-11-20', first_uncovered_date: '2026-11-27',
    next_manual: null, next_autopay: null, issues: [], requires_review: false, source_fingerprint: `source-${id}`, ...changes };
}
function preferences(id: number, changes: Partial<BillingPreferences> = {}): BillingPreferences {
  return { student_id: id, payment_method: null, mandate_ready: false, version: 2, updated_at: null, ...changes };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function Wrapper({ children }: { children: ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>; }
function show(rows = [row(10), row(2)], tutorId?: number) {
  return render(<BillingPreferenceBatchModal rows={rows} tutorId={tutorId} trigger={createRef<HTMLButtonElement>()} onSaved={mocks.saved} onClose={mocks.close} />, { wrapper: Wrapper });
}
function item(id: number) { return screen.getByRole('article', { name: `Preference for Synthetic Student ${id}` }); }
function choose(method: 'manual' | 'autopay') { fireEvent.change(screen.getByLabelText('Payment method', { selector: '#batch-preference-method' }), { target: { value: method } }); }
function acknowledge() { fireEvent.click(screen.getByRole('checkbox', { name: 'These preferences match the parents’ responses.' })); }
function save() { fireEvent.click(screen.getByRole('button', { name: 'Save preferences' })); }

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.preferences.mockImplementation(async (id: number) => preferences(id));
  mocks.savePreferences.mockImplementation(async (id: number, body: { payment_method: BillingPreferences['payment_method']; mandate_ready: boolean; expected_version: number }) =>
    preferences(id, { payment_method: body.payment_method, mandate_ready: body.mandate_ready, version: body.expected_version + 1 }));
});
afterEach(() => {
  for (const call of [mocks.confirmDraft, mocks.recordManualPayment, mocks.markPaymentSent, mocks.recordReceipt, mocks.verifyCoupons]) expect(call).not.toHaveBeenCalled();
});

describe('payment preference batch review', () => {
  it('starts with no assumed method, deduplicates students and sorts school numbers', async () => {
    show([row(10), row(2), row(2)]);
    await screen.findByRole('dialog', { name: 'Set payment method' });
    expect(screen.getAllByRole('article').map(element => element.getAttribute('aria-label'))).toEqual(['Preference for Synthetic Student 2', 'Preference for Synthetic Student 10']);
    expect(screen.getByLabelText('Payment method')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    expect(mocks.preferences).not.toHaveBeenCalled(); expect(mocks.savePreferences).not.toHaveBeenCalled();
    expect(screen.getByText('2 students')).toBeInTheDocument();
  });

  it('requires both an explicit choice and confirmation of parent responses', async () => {
    show(); await screen.findByRole('dialog');
    acknowledge(); expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    choose('manual'); expect(screen.getByRole('checkbox')).not.toBeChecked();
    acknowledge(); expect(screen.getByRole('button', { name: 'Save preferences' })).toBeEnabled();
    choose('autopay'); expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it.each(['manual', 'autopay'] as const)('records %s with a fresh scoped read per student and preserves authorisation facts', async method => {
    mocks.preferences.mockImplementation(async (id: number) => preferences(id, { mandate_ready: id === 10 }));
    show([row(10, { mandate_ready: true }), row(2)], 7); await screen.findByRole('dialog');
    choose(method); acknowledge(); save();
    await screen.findByText('2 saved');
    expect(mocks.preferences.mock.calls.map(call => call[0])).toEqual([2, 10]);
    expect(mocks.preferences).toHaveBeenNthCalledWith(1, 2, 7, expect.any(AbortSignal));
    expect(mocks.savePreferences).toHaveBeenNthCalledWith(1, 2, expect.objectContaining({ payment_method: method, mandate_ready: false, expected_version: 2 }), expect.any(AbortSignal));
    expect(mocks.savePreferences).toHaveBeenNthCalledWith(2, 10, expect.objectContaining({ payment_method: method, mandate_ready: true, expected_version: 2 }), expect.any(AbortSignal));
    expect(mocks.saved.mock.calls.map(call => call[0].student_id)).toEqual([2, 10]);
    expect(within(item(2)).getByLabelText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    expect(screen.getByLabelText('Payment method')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(mocks.close).toHaveBeenCalledWith([2, 10]);
  });

  it('continues other students after a stale preference and rechecks before applying a new reviewed choice', async () => {
    mocks.preferences.mockImplementation(async (id: number) => preferences(id, { version: id === 2 ? 3 : 2, mandate_ready: id === 2 }));
    show(); await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await screen.findByText('1 saved');
    expect(within(item(2)).getByText('Preference changed. Reload this list.')).toBeInTheDocument();
    expect(mocks.savePreferences).toHaveBeenCalledOnce(); expect(mocks.savePreferences.mock.calls[0][0]).toBe(10);
    fireEvent.click(within(item(2)).getByRole('button', { name: 'Recheck' }));
    await waitFor(() => expect(within(item(2)).queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox')).not.toBeChecked(); choose('manual'); acknowledge(); save();
    await screen.findByText('2 saved');
    expect(mocks.savePreferences).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({ payment_method: 'manual', mandate_ready: true, expected_version: 3 }), expect.any(AbortSignal));
    expect(mocks.saved).toHaveBeenCalledTimes(2);
  });

  it('shows and retries the uncertain Autopay intention after the remaining ready choice changes to Manual', async () => {
    let failed = false;
    mocks.preferences.mockImplementation(async (id: number) => preferences(id, { version: id === 3 ? 3 : 2 }));
    mocks.savePreferences.mockImplementation(async (id: number, body) => {
      if (id === 2 && !failed) { failed = true; throw new Error('Reply lost'); }
      return preferences(id, { payment_method: body.payment_method, mandate_ready: body.mandate_ready, version: body.expected_version + 1 });
    });
    show([row(10), row(3), row(2)]); await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await screen.findByText('1 saved');
    const original = structuredClone(mocks.savePreferences.mock.calls.find(call => call[0] === 2)![1]);
    expect(within(item(2)).getByRole('button', { name: 'Retry save' })).toBeInTheDocument();
    expect(within(item(2)).getByText('Unconfirmed')).toBeInTheDocument();
    expect(within(item(2)).getByText('Autopay', { exact: true })).toBeInTheDocument();
    fireEvent.click(within(item(3)).getByRole('button', { name: 'Recheck' }));
    await waitFor(() => expect(within(item(3)).queryByRole('alert')).not.toBeInTheDocument());
    choose('manual');
    expect(screen.getByLabelText('Payment method')).toHaveValue('manual');
    expect(within(item(2)).getByText('Unconfirmed')).toBeInTheDocument();
    expect(within(item(2)).getByText('Autopay', { exact: true })).toBeInTheDocument();
    expect(within(item(2)).queryByText('Manual', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(within(item(2)).getByRole('button', { name: 'Retry save' }));
    await screen.findByText('2 saved');
    const retries = mocks.savePreferences.mock.calls.filter(call => call[0] === 2);
    expect(retries).toHaveLength(2); expect(retries[1][1]).toEqual(original);
    expect(mocks.savePreferences.mock.calls.filter(call => call[0] === 10)).toHaveLength(1);
    expect(screen.getByRole('checkbox')).not.toBeChecked(); acknowledge(); save();
    await screen.findByText('3 saved');
    expect(mocks.savePreferences.mock.calls.find(call => call[0] === 3)![1]).toMatchObject({ payment_method: 'manual', expected_version: 3 });
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(mocks.close).toHaveBeenCalledWith([2, 3, 10]);
  });

  it('completes already-matching parent responses without writing or changing their versions', async () => {
    mocks.preferences.mockImplementation(async (id: number) => preferences(id, { payment_method: 'manual', mandate_ready: id === 10 }));
    show([row(10, { recorded_payment_method: 'manual', mandate_ready: true }), row(2, { recorded_payment_method: 'manual' })]);
    await screen.findByRole('dialog'); choose('manual'); acknowledge(); save();
    await screen.findByText('2 saved');
    expect(mocks.preferences.mock.calls.map(call => call[0])).toEqual([2, 10]); expect(mocks.savePreferences).not.toHaveBeenCalled();
    expect(mocks.saved.mock.calls.map(call => call[0])).toEqual([
      preferences(2, { payment_method: 'manual' }), preferences(10, { payment_method: 'manual', mandate_ready: true }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ })); expect(mocks.close).toHaveBeenCalledWith([2, 10]);
  });

  it('only writes students whose current choice differs in a mixed existing/new response batch', async () => {
    mocks.preferences.mockImplementation(async (id: number) => preferences(id, { payment_method: id === 2 ? 'autopay' : null, mandate_ready: id === 2 }));
    show([row(2, { recorded_payment_method: 'autopay', mandate_ready: true }), row(10)]);
    await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await screen.findByText('2 saved'); expect(mocks.savePreferences).toHaveBeenCalledOnce();
    expect(mocks.savePreferences.mock.calls[0][0]).toBe(10);
    expect(mocks.savePreferences.mock.calls[0][1]).toMatchObject({ payment_method: 'autopay', mandate_ready: false });
    expect(mocks.saved.mock.calls.map(call => call[0].version)).toEqual([2, 3]);
  });

  it.each([null, { student_id: 99 }, { version: -1 }, { mandate_ready: 'true' }])('holds malformed ownership/version evidence (%j) without blocking the other student', async changes => {
    mocks.preferences.mockImplementation(async (id: number) => id === 2 ? changes === null ? null : { ...preferences(id), ...changes } : preferences(id));
    show(); await screen.findByRole('dialog'); choose('manual'); acknowledge(); save();
    await screen.findByText('1 saved');
    expect(within(item(2)).getByRole('alert')).toHaveTextContent('Could not verify');
    expect(within(item(2)).getByRole('button', { name: 'Recheck' })).toBeInTheDocument();
    expect(mocks.savePreferences.mock.calls.map(call => call[0])).toEqual([10]);
    expect(mocks.saved.mock.calls.map(call => call[0].student_id)).toEqual([10]);
  });

  it('retains an uncertain malformed save reply and only completes after its exact replay is verified', async () => {
    mocks.savePreferences.mockResolvedValueOnce(preferences(99, { version: 3, payment_method: 'autopay' }));
    show([row(2)]); await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await within(item(2)).findByRole('button', { name: 'Retry save' });
    expect(mocks.saved).not.toHaveBeenCalled();
    const body = structuredClone(mocks.savePreferences.mock.calls[0][1]);
    fireEvent.click(within(item(2)).getByRole('button', { name: 'Retry save' }));
    await screen.findByText('1 saved'); expect(mocks.savePreferences.mock.calls[1][1]).toEqual(body);
    expect(mocks.preferences).toHaveBeenCalledOnce(); expect(mocks.saved).toHaveBeenCalledOnce();
  });

  it('treats a known conflict as a recheck and sends a new key only after fresh parent confirmation', async () => {
    mocks.savePreferences.mockRejectedValueOnce(Object.assign(new Error('Saved choice changed'), { status: 409 }));
    show([row(2)]); await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await within(item(2)).findByRole('button', { name: 'Recheck' });
    const first = mocks.savePreferences.mock.calls[0][1].idempotency_key;
    mocks.preferences.mockResolvedValue(preferences(2, { version: 3, mandate_ready: true }));
    fireEvent.click(within(item(2)).getByRole('button', { name: 'Recheck' }));
    await waitFor(() => expect(within(item(2)).queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
    choose('manual'); acknowledge(); save(); await screen.findByText('1 saved');
    expect(mocks.savePreferences.mock.calls[1][1]).toMatchObject({ expected_version: 3, payment_method: 'manual', mandate_ready: true });
    expect(mocks.savePreferences.mock.calls[1][1].idempotency_key).not.toBe(first);
  });

  it('keeps the dialog open and disables choices while a save is pending', async () => {
    const pending = deferred<BillingPreferences>(); mocks.savePreferences.mockReturnValueOnce(pending.promise);
    show([row(2)]); await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Payment method')).toBeDisabled(); expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Close$/ })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => pending.resolve(preferences(2, { version: 3, payment_method: 'autopay' })));
    await screen.findByText('1 saved');
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ })); expect(mocks.close).toHaveBeenCalledWith([2]);
  });

  it('aborts an in-flight evidence read on unmount and never starts another student', async () => {
    const pending = deferred<BillingPreferences>(); mocks.preferences.mockReturnValueOnce(pending.promise);
    const view = show(); await screen.findByRole('dialog'); choose('manual'); acknowledge(); save();
    await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
    const signal = mocks.preferences.mock.calls[0][2] as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(preferences(2)));
    expect(mocks.savePreferences).not.toHaveBeenCalled(); expect(mocks.preferences).toHaveBeenCalledOnce(); expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('does not report a late save or proceed to the next student after its owner unmounts', async () => {
    const pending = deferred<BillingPreferences>(); mocks.savePreferences.mockReturnValueOnce(pending.promise);
    const view = show(); await screen.findByRole('dialog'); choose('autopay'); acknowledge(); save();
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(preferences(2, { version: 3, payment_method: 'autopay' })));
    expect(mocks.saved).not.toHaveBeenCalled(); expect(mocks.preferences).toHaveBeenCalledOnce(); expect(mocks.savePreferences).toHaveBeenCalledOnce();
  });

  it('closes without recording any choice if the review is abandoned', async () => {
    show(); await screen.findByRole('dialog'); choose('manual');
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    expect(mocks.close).toHaveBeenCalledWith([]); expect(mocks.preferences).not.toHaveBeenCalled(); expect(mocks.savePreferences).not.toHaveBeenCalled();
  });
});
