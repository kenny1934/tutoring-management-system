import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingPlanControl } from './BillingPlanControl';
import type { BillingPreferences, BillingRosterRow } from '@/types/billing';

const mocks = vi.hoisted(() => ({ preferences: vi.fn(), savePreferences: vi.fn(), saved: vi.fn(), reload: vi.fn() }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { preferences: mocks.preferences, savePreferences: mocks.savePreferences } }));

function row(method: BillingPreferences['payment_method'] = null, ready = false): BillingRosterRow {
  return { student: { id: 4, student_name: 'Synthetic plan control', school_student_id: '0004', home_location: 'MSA', grade: 'F2', is_staff_referral: false },
    recorded_payment_method: method, mandate_ready: ready, preference_version: method ? 2 : 0,
    upcoming_original_count: 0, pending_bill_count: 0, sent_pending_bill_count: 0, pending_makeup_count: 0,
    slot_candidate_count: 1, selected_slot_count: 1, last_paid_original_date: null, first_uncovered_date: null,
    next_manual: null, next_autopay: null, issues: [], source_issues: [], method_issues: {}, requires_review: false, source_fingerprint: 'synthetic-source' };
}
function value(source = row()): BillingPreferences {
  return { student_id: source.student.id, payment_method: source.recorded_payment_method ?? null,
    mandate_ready: source.mandate_ready ?? false, version: source.preference_version ?? 0, updated_at: null };
}
function Controls({ initial = row(), canWrite = true, tutorId }: { initial?: BillingRosterRow; canWrite?: boolean; tutorId?: number }) {
  const [current, setCurrent] = useState(initial);
  return <BillingPlanControl row={current} canWrite={canWrite} tutorId={tutorId} onReload={mocks.reload} onSaved={saved => {
    mocks.saved(saved); setCurrent(previous => ({ ...previous, recorded_payment_method: saved.payment_method,
      mandate_ready: saved.mandate_ready, preference_version: saved.version, preference_updated_at: saved.updated_at }));
  }} />;
}
function deferred<T>() {
  let resolve!: (result: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.preferences.mockReset().mockResolvedValue(value());
  mocks.savePreferences.mockReset().mockImplementation(async (_id: number, body: { payment_method: BillingPreferences['payment_method']; mandate_ready: boolean; expected_version: number }) => ({ student_id: 4,
    payment_method: body.payment_method, mandate_ready: body.mandate_ready, version: body.expected_version + 1, updated_at: '2026-10-27T01:00:00Z' }));
});

describe('inline payment preference control', () => {
  it('does not fetch per-row preferences until a choice is made and never infers bank readiness', async () => {
    render(<Controls />);
    const choice = screen.getByRole('combobox', { name: 'Payment method for Synthetic plan control' });
    expect(choice).toHaveValue(''); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mocks.preferences).not.toHaveBeenCalled();
    fireEvent.change(choice, { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.preferences).toHaveBeenCalledWith(4, undefined, expect.any(AbortSignal));
    expect(mocks.savePreferences).toHaveBeenCalledWith(4, expect.objectContaining({ payment_method: 'autopay', mandate_ready: false,
      expected_version: 0, idempotency_key: expect.any(String) }), expect.any(AbortSignal));
    expect(screen.getByRole('checkbox', { name: 'Bank authorisation ready' })).not.toBeChecked();
    expect(choice).toHaveValue('autopay');
  });

  it('records bank authorisation separately and retains the saved Autopay method', async () => {
    const source = row('autopay'); mocks.preferences.mockResolvedValue(value(source));
    render(<Controls initial={source} tutorId={42} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bank authorisation ready' }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.preferences).toHaveBeenCalledWith(4, 42, expect.any(AbortSignal));
    expect(mocks.savePreferences).toHaveBeenCalledWith(4, expect.objectContaining({ payment_method: 'autopay', mandate_ready: true, expected_version: 2 }), expect.any(AbortSignal));
    expect(screen.getByRole('combobox')).toHaveValue('autopay');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('changing the method preserves separately recorded bank authorisation evidence', async () => {
    const source = row('autopay', true); mocks.preferences.mockResolvedValue(value(source));
    render(<Controls initial={source} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manual' } });
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.savePreferences).toHaveBeenCalledWith(4, expect.objectContaining({ payment_method: 'manual', mandate_ready: true }), expect.any(AbortSignal));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('manual');
  });

  it('allows an explicit return to Not recorded without turning it into Manual', async () => {
    const source = row('manual'); mocks.preferences.mockResolvedValue(value(source));
    render(<Controls initial={source} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.savePreferences).toHaveBeenCalledWith(4, expect.objectContaining({ payment_method: null }), expect.any(AbortSignal));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('gives read-only staff only the saved method and setup status', () => {
    render(<Controls initial={row('autopay')} canWrite={false} />);
    expect(screen.getByText('Autopay')).toBeVisible(); expect(screen.getByText('Setup pending')).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(mocks.preferences).not.toHaveBeenCalled(); expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('holds a version conflict for an explicit reload without issuing a stale write', async () => {
    mocks.preferences.mockResolvedValue({ ...value(row('manual')), version: 3 });
    render(<Controls initial={row('manual')} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Preference changed');
    expect(screen.getByRole('combobox')).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' })); expect(mocks.reload).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    expect(screen.getByRole('combobox')).toHaveValue('manual');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries an uncertain response with the exact request and does not fetch or infer a second choice', async () => {
    mocks.savePreferences.mockRejectedValueOnce(new Error('Synthetic response lost.'));
    render(<Controls />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await screen.findByText('Synthetic response lost.');
    expect(screen.getByRole('combobox')).toBeDisabled(); expect(screen.getByRole('checkbox')).toBeDisabled();
    const first = structuredClone(mocks.savePreferences.mock.calls[0][1]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.preferences).toHaveBeenCalledOnce(); expect(mocks.savePreferences).toHaveBeenCalledTimes(2);
    expect(mocks.savePreferences.mock.calls[1][1]).toEqual(first);
    expect(first.payment_method).toBe('autopay'); expect(first.mandate_ready).toBe(false);
  });

  it('withholds foreign success replies and offers the exact retry', async () => {
    mocks.savePreferences.mockResolvedValueOnce({ ...value(), student_id: 99, payment_method: 'autopay', version: 1 });
    render(<Controls />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not verify');
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' })); await waitFor(() => expect(mocks.saved).toHaveBeenCalledOnce());
    expect(mocks.savePreferences.mock.calls[1][1]).toEqual(mocks.savePreferences.mock.calls[0][1]);
  });

  it('aborts its pending read on unmount and ignores late results', async () => {
    const delayed = deferred<BillingPreferences>(); mocks.preferences.mockReturnValue(delayed.promise);
    const view = render(<Controls />); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
    const signal = mocks.preferences.mock.calls[0][2] as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve(value()));
    expect(mocks.savePreferences).not.toHaveBeenCalled(); expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('aborts an in-flight write on unmount and never applies its late reply to a new owner', async () => {
    const delayed = deferred<BillingPreferences>(); mocks.savePreferences.mockReturnValue(delayed.promise);
    const view = render(<Controls />); fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    view.unmount(); expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve({ ...value(), payment_method: 'autopay', version: 1 }));
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('reloads a known rejected write without retaining an unconfirmed local choice', async () => {
    const source = row('manual'); mocks.preferences.mockResolvedValue(value(source));
    mocks.savePreferences.mockRejectedValueOnce(Object.assign(new Error('Synthetic preference rejected.'), { status: 409 }));
    render(<Controls initial={source} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await screen.findByText('Synthetic preference rejected.');
    expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    expect(screen.getByRole('combobox')).toHaveValue('manual');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.saved).not.toHaveBeenCalled();
  });


  it('aborts a read when write permission is lost even without an outer unmount', async () => {
    const delayed = deferred<BillingPreferences>(); mocks.preferences.mockReturnValue(delayed.promise);
    const view = render(<Controls canWrite />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.preferences).toHaveBeenCalledOnce());
    const signal = mocks.preferences.mock.calls[0][2] as AbortSignal;
    view.rerender(<Controls canWrite={false} />);
    expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve(value()));
    expect(mocks.savePreferences).not.toHaveBeenCalled(); expect(mocks.saved).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('ignores a late write reply after write permission is withdrawn', async () => {
    const delayed = deferred<BillingPreferences>(); mocks.savePreferences.mockReturnValue(delayed.promise);
    const view = render(<Controls canWrite />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    const signal = mocks.savePreferences.mock.calls[0][2] as AbortSignal;
    view.rerender(<Controls canWrite={false} />); expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve({ ...value(), payment_method: 'autopay', version: 1 }));
    expect(mocks.saved).not.toHaveBeenCalled();
  });


  it('discards the old retry state across lost and restored write capability', async () => {
    const source = row('manual'); mocks.preferences.mockResolvedValue(value(source));
    const delayed = deferred<BillingPreferences>(); mocks.savePreferences.mockReturnValueOnce(delayed.promise);
    const view = render(<Controls initial={source} canWrite />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledOnce());
    view.rerender(<Controls initial={source} canWrite={false} />);
    const committed = { ...value(source), payment_method: 'autopay' as const, version: 3 };
    mocks.preferences.mockResolvedValue(committed);
    await act(async () => delayed.resolve(committed));
    expect(mocks.saved).not.toHaveBeenCalled();
    view.rerender(<Controls initial={source} canWrite />);
    expect(screen.getByRole('combobox')).toHaveValue('manual');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'autopay' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Preference changed');
    expect(mocks.preferences).toHaveBeenCalledTimes(2);
    expect(mocks.savePreferences).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument();
  });

});
