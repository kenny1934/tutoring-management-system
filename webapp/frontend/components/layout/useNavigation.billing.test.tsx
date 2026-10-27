import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavigation } from './useNavigation';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), options: vi.fn(), queue: vi.fn(), renewals: vi.fn(), dashboard: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA', mounted: true }) }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: mocks.options } }));
vi.mock('@/lib/hooks/useBillingQueueCounts', () => ({ useBillingQueueCounts: mocks.queue }));
vi.mock('@/lib/hooks', () => ({
  useUnreadMessageCount: () => ({ data: { count: 0 } }), useRenewalCounts: mocks.renewals,
  usePendingExtensionCount: () => ({ data: { count: 2 } }), useUnseenUpdates: () => false,
  useSummerSidebarBadge: () => ({ isOpen: false, actionableCount: 0 }),
  useRegularSidebarBadge: () => ({ isOpen: false, actionableCount: 0 }), useRegularIntakeOpen: () => false,
  useDashboardStats: mocks.dashboard,
}));
function wrapper() {
  const cache = new Map();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ provider: () => cache, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>;
  };
}
const admin = { user: { id: 7 }, isGuest: false, isSupervisor: false, canViewAdminPages: true, effectiveRole: 'Admin', isImpersonating: false, impersonatedTutor: null };
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockReturnValue(admin);
  mocks.options.mockResolvedValue({ queue_available: false, workflow_available: true, preferences_writes_available: true, workflow_writes_available: false });
  mocks.queue.mockReturnValue({ available: false });
  mocks.renewals.mockReturnValue({ data: { expiring_soon: 3, expired: 4, total: 7 } });
  mocks.dashboard.mockReturnValue({ data: { pending_payment_enrollments: 5 } });
});
describe('preference-only navigation and retained reminders', () => {
  it('shows Payment plans beside Renewals and hides Autopay while retaining legacy reminders', async () => {
    const { result } = renderHook(useNavigation, { wrapper: wrapper() });
    await waitFor(() => expect(mocks.options).toHaveBeenCalled());
    expect(result.current.adminNavigation.slice(0, 2).map(item => [item.name, item.href])).toEqual([['Renewals', '/admin/renewals'], ['Payment plans', '/billing']]);
    expect(result.current.adminNavigation.some(item => item.name === 'Autopay')).toBe(false);
    expect(result.current.adminBadgeFor('Renewals').count).toBe(7); expect(result.current.pendingPayments).toBe(5);
    expect(mocks.renewals).toHaveBeenCalledWith(true, 'MSA'); expect(mocks.dashboard).toHaveBeenCalledWith('MSA', undefined, true);
  });
  it('shows Autopay after queue activation and uses grouped reminders without legacy totals', async () => {
    mocks.options.mockResolvedValue({ queue_available: true }); mocks.queue.mockReturnValue({ available: true, data: { actionable: 8, overdue: 6 } });
    const { result } = renderHook(useNavigation, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.adminNavigation.some(item => item.name === 'Autopay')).toBe(true));
    expect(result.current.adminBadgeFor('Renewals').count).toBe(8); expect(result.current.pendingPayments).toBe(6);
    expect(mocks.renewals).toHaveBeenCalledWith(false, 'MSA'); expect(mocks.dashboard).toHaveBeenCalledWith('MSA', undefined, false);
  });
  it('does not guess legacy reminders or expose Autopay while availability is unknown', () => {
    mocks.options.mockReturnValue(new Promise(() => {})); mocks.queue.mockReturnValue({ available: undefined });
    const { result } = renderHook(useNavigation, { wrapper: wrapper() });
    expect(result.current.adminNavigation.some(item => item.name === 'Autopay')).toBe(false);
    expect(result.current.adminBadgeFor('Renewals').count).toBeUndefined(); expect(result.current.pendingPayments).toBe(0);
    expect(mocks.renewals).toHaveBeenCalledWith(false, 'MSA');
  });
  it('drops a previous admin scope’s Autopay entry while the next scope loads', async () => {
    mocks.options.mockResolvedValue({ queue_available: true });
    const { result, rerender } = renderHook(useNavigation, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.adminNavigation.some(item => item.name === 'Autopay')).toBe(true));
    mocks.auth.mockReturnValue({ ...admin, user: { id: 8 } }); mocks.options.mockReturnValue(new Promise(() => {})); mocks.queue.mockReturnValue({ available: undefined });
    act(() => rerender()); expect(result.current.adminNavigation.some(item => item.name === 'Autopay')).toBe(false);
  });
  it('does not request admin options under an effective Tutor scope', () => {
    mocks.auth.mockReturnValue({ ...admin, canViewAdminPages: false, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 9 } });
    const { result } = renderHook(useNavigation, { wrapper: wrapper() });
    expect(result.current.isAdminOrAbove).toBe(false); expect(mocks.options).not.toHaveBeenCalled(); expect(result.current.adminNavigation.some(item => item.name === 'Autopay')).toBe(false);
  });
});
