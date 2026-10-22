import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MakeupEligibility } from '@/types';
import { useMakeupEligibility } from './useMakeupEligibility';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/api', () => ({ fetchAPI: mocks.fetch }));
vi.mock('@/components/billing/BillingDraftReview', () => ({
  billingDraftAuthScope: (auth: { user: { id: number }; effectiveRole: string }) => JSON.stringify([auth.user.id, auth.effectiveRole]),
  billingDraftTutorId: () => undefined,
}));

const available: MakeupEligibility = { policy: 'academic_year', status: 'available', can_book: true, valid_until: '2027-06-30', paid_through: '2027-03-31', reason: null, advance_booking: false };
const response = (eligibility: MakeupEligibility) => ({ as_of: '2027-03-15', eligibility: { '12': eligibility } });
function wrapper() {
  const cache = new Map();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ provider: () => cache, shouldRetryOnError: false, revalidateOnFocus: false, dedupingInterval: 0 }}>{children}</SWRConfig>;
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isGuest: false });
  mocks.fetch.mockResolvedValue(response(available));
});

describe('makeup eligibility refresh', () => {
  it('withholds a cached booking permission while participation is being rechecked', async () => {
    const { result } = renderHook(() => useMakeupEligibility({ id: 12, makeup_eligibility: available }, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.eligibility?.can_book).toBe(true));
    let finish!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.retry(); });
    await waitFor(() => expect(result.current.eligibility?.can_book).toBe(false));
    expect(result.current.eligibility?.reason).toContain('Checking');
    await act(async () => { finish(response({ ...available, status: 'paused', can_book: false, reason: 'The student is paused.' })); await pending; });
    expect(result.current.eligibility?.status).toBe('paused');
    expect(result.current.eligibility?.can_book).toBe(false);
  });

  it('does not let cached availability override a newly loaded paused session', async () => {
    const { result, rerender } = renderHook(({ evidence }) => useMakeupEligibility({ id: 12, makeup_eligibility: evidence }, true), {
      initialProps: { evidence: available }, wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.eligibility?.can_book).toBe(true));
    let finish!: (value: ReturnType<typeof response>) => void;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const paused: MakeupEligibility = { ...available, status: 'paused', can_book: false, reason: 'The student is paused.' };
    rerender({ evidence: paused });
    expect(result.current.eligibility?.can_book).toBe(false);
    await act(async () => finish(response(paused)));
    await waitFor(() => expect(result.current.eligibility?.status).toBe('paused'));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps legacy eligibility absent and blocks retry failure for an identified new-policy source', async () => {
    mocks.fetch.mockResolvedValueOnce({ as_of: '2027-03-15', eligibility: {} });
    const legacy = renderHook(() => useMakeupEligibility({ id: 12 }, true), { wrapper: wrapper() });
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(legacy.result.current.eligibility).toBeNull();
    legacy.unmount();
    mocks.fetch.mockRejectedValueOnce(new Error('Denied.'));
    const { result } = renderHook(() => useMakeupEligibility({ id: 12, makeup_eligibility: available }, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.eligibility?.can_book).toBe(false);
    expect(result.current.eligibility?.reason).toContain('Retry');
  });
});
