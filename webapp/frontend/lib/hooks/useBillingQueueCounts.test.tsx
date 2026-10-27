import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBillingQueueCounts } from './useBillingQueueCounts';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), options: vi.fn(), counts: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: mocks.options, queueCounts: mocks.counts } }));

const counts = { as_of: '2026-11-15', collection_month: '2026-11', prepare: 3, send: 2, awaiting_payment: 8, attention: 4, no_payment: 20, total: 37, actionable: 5, overdue: 4 };
const admin = { user: { id: 7 }, effectiveRole: 'Admin', isImpersonating: false, impersonatedTutor: null, canViewAdminPages: true };

function wrapper() {
  const cache = new Map();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ provider: () => cache, keepPreviousData: true, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue(admin);
  mocks.options.mockResolvedValue({ queue_available: true });
  mocks.counts.mockResolvedValue(counts);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

afterEach(() => vi.useRealTimers());

describe('shared enrollment reminder counts', () => {
  it('shares one request between all-location sidebar and bell consumers', async () => {
    const { result } = renderHook(() => [
      useBillingQueueCounts({ location: 'All Locations' }),
      useBillingQueueCounts(),
    ], { wrapper: wrapper() });
    await waitFor(() => expect(result.current[0].data?.actionable).toBe(5));
    expect(result.current[1].data).toEqual(counts);
    expect(mocks.options).toHaveBeenCalledTimes(1);
    expect(mocks.counts).toHaveBeenCalledTimes(1);
    expect(mocks.counts).toHaveBeenCalledWith({ location: undefined, tutor_id: undefined });
  });

  it('pauses count polling while hidden and resumes when the tab is visible', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const { result } = renderHook(() => useBillingQueueCounts(), { wrapper: wrapper() });
    await act(async () => {});
    expect(result.current.data?.actionable).toBe(5);
    expect(mocks.counts).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(mocks.counts).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(mocks.counts).toHaveBeenCalledTimes(2);
  });

  it('does not request queue data when availability explicitly selects legacy', async () => {
    mocks.options.mockResolvedValue({ queue_available: false });
    const { result } = renderHook(() => useBillingQueueCounts(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(mocks.counts).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('withholds availability until options resolve and never turns errors into legacy fallback', async () => {
    let reject!: (error: Error) => void;
    mocks.options.mockReturnValue(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const { result } = renderHook(() => useBillingQueueCounts(), { wrapper: wrapper() });
    expect(result.current.available).toBeUndefined();
    await act(async () => reject(new Error('Unavailable')));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.available).toBeUndefined();
    expect(mocks.counts).not.toHaveBeenCalled();
  });

  it('keeps an authoritative zero and suppresses stale values during a branch change', async () => {
    let resolve!: (data: typeof counts) => void;
    const { result, rerender } = renderHook(({ location }) => useBillingQueueCounts({ location }), {
      initialProps: { location: 'MSA' }, wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.data?.overdue).toBe(4));
    mocks.counts.mockReturnValueOnce(new Promise(resolvePromise => { resolve = resolvePromise; }));
    rerender({ location: 'MSB' });
    expect(result.current.data).toBeUndefined();
    await act(async () => resolve({ ...counts, actionable: 0, overdue: 0 }));
    await waitFor(() => expect(result.current.data?.actionable).toBe(0));
    expect(result.current.data?.overdue).toBe(0);
    expect(mocks.counts).toHaveBeenLastCalledWith({ location: 'MSB', tutor_id: undefined });
  });

  it('isolates impersonated roles and hides cached admin counts from tutors', async () => {
    const { result, rerender } = renderHook(() => useBillingQueueCounts({ location: 'MSA' }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.actionable).toBe(5));
    mocks.auth.mockReturnValue({ ...admin, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 9 }, canViewAdminPages: false });
    rerender();
    expect(result.current.available).toBeUndefined();
    expect(result.current.data).toBeUndefined();
    expect(mocks.counts).toHaveBeenCalledTimes(1);
    mocks.auth.mockReturnValue({ ...admin, effectiveRole: 'Supervisor', isImpersonating: true });
    mocks.counts.mockResolvedValue({ ...counts, actionable: 1 });
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.actionable).toBe(1));
    expect(mocks.options).toHaveBeenCalledTimes(2);
    expect(mocks.counts).toHaveBeenCalledTimes(2);
  });

  it('separates explicit tutor filters without inheriting the preceding count', async () => {
    const { result, rerender } = renderHook(({ tutorId }) => useBillingQueueCounts({ tutorId }), {
      initialProps: { tutorId: 4 }, wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.data?.actionable).toBe(5));
    mocks.counts.mockResolvedValue({ ...counts, actionable: 2 });
    rerender({ tutorId: 5 });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.actionable).toBe(2));
    expect(mocks.counts).toHaveBeenLastCalledWith({ location: undefined, tutor_id: 5 });
  });
});
