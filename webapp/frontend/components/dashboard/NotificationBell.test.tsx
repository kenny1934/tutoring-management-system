import { fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';
import { useNavigation } from '@/components/layout/useNavigation';

const mocks = vi.hoisted(() => ({ queue: vi.fn(), renewal: vi.fn(), taught: vi.fn(), stats: vi.fn() }));
vi.mock('swr', () => ({ default: () => ({ data: { count: 0 } }) }));
vi.mock('@/lib/hooks/useBillingQueueCounts', () => ({ useBillingQueueCounts: mocks.queue }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 7 }, effectiveRole: 'Admin', canViewAdminPages: true, isGuest: false, isSupervisor: false }) }));
vi.mock('@/contexts/RoleContext', () => ({ useRole: () => ({ viewMode: 'center-view' }) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA', mounted: true }) }));
vi.mock('@/lib/hooks', () => ({
  useRenewalCounts: mocks.renewal, useUnlistedWaitingCount: mocks.taught, useDashboardStats: mocks.stats,
  useUnreadMessageCount: () => ({ data: { count: 0 } }), usePendingProposalCount: () => ({ data: { count: 0 } }),
  useUncheckedAttendanceCount: () => ({ data: { total: 0 } }), usePendingExtensionCount: () => ({ data: { count: 0 } }),
  useTerminationReviewCount: () => ({ data: { count: 0 } }), useAgedPendingMakeupsCount: () => ({ data: { count: 0 } }),
  useEmploymentOverrun: () => ({ data: { total_sessions: 0 } }), useUnseenUpdates: () => false,
  useSummerSidebarBadge: () => ({ isOpen: false, actionableCount: 0 }),
  useRegularSidebarBadge: () => ({ isOpen: false, actionableCount: 0 }), useRegularIntakeOpen: () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queue.mockReturnValue({ available: true, data: { actionable: 3, overdue: 2 } });
  mocks.renewal.mockReturnValue({ data: { total: 9, expired: 4 } });
  mocks.taught.mockReturnValue({ data: { count: 0 } });
  mocks.stats.mockReturnValue({ data: { pending_payment_enrollments: 99 } });
});

describe('renewal and collection reminders', () => {
  it('uses canonical task counts once and preserves taught lessons separately', () => {
    mocks.taught.mockReturnValue({ data: { count: 4 } });
    render(<NotificationBell pendingPayments={99} showOverduePayments location="MSA" />);
    fireEvent.click(screen.getByRole('button', { name: '9 notifications' }));
    expect(within(screen.getByRole('link', { name: /Renewals\s*3/ })).getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Overdue Payments\s*2/ })).toHaveAttribute('href', '/overdue-payments');
    expect(screen.getByRole('link', { name: /Taught but not in CSM yet\s*4/ })).toHaveAttribute('href', '/admin/renewals#taught');
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(mocks.renewal).toHaveBeenCalledWith(false, 'MSA');
  });

  it('uses the same canonical quantities for navigation badges', () => {
    const { result } = renderHook(useNavigation);
    expect(result.current.adminBadgeFor('Renewals').count).toBe(3);
    expect(result.current.adminBadgeFor('Overdue payments').count).toBe(2);
    expect(result.current.pendingPayments).toBe(2);
    expect(mocks.renewal).toHaveBeenCalledWith(false, 'MSA');
    expect(mocks.stats).toHaveBeenCalledWith('MSA', undefined, false);
  });

  it('treats queue zero as authoritative despite nonzero legacy counts', () => {
    mocks.queue.mockReturnValue({ available: true, data: { actionable: 0, overdue: 0 } });
    render(<NotificationBell pendingPayments={99} showOverduePayments location="MSA" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const { result } = renderHook(useNavigation);
    expect(result.current.adminBadgeFor('Renewals').count).toBe(0);
    expect(result.current.pendingPayments).toBe(0);
  });

  it('restores legacy quantities only when queue availability is explicitly false', () => {
    mocks.queue.mockReturnValue({ available: false });
    render(<NotificationBell pendingPayments={99} showOverduePayments location="MSA" />);
    expect(screen.getByRole('button', { name: '108 notifications' })).toBeInTheDocument();
    expect(mocks.renewal).toHaveBeenCalledWith(true, 'MSA');
    const { result } = renderHook(useNavigation);
    expect(result.current.adminBadgeFor('Renewals').count).toBe(9);
    expect(result.current.pendingPayments).toBe(99);
    expect(mocks.stats).toHaveBeenCalledWith('MSA', undefined, true);
  });

  it.each([
    { available: undefined },
    { available: undefined, error: new Error('Options failed') },
    { available: true },
    { available: true, error: new Error('Counts failed') },
  ])('does not revive legacy alerts while queue counts are unavailable: %o', queue => {
    mocks.queue.mockReturnValue(queue);
    render(<NotificationBell pendingPayments={99} showOverduePayments location="MSA" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const { result } = renderHook(useNavigation);
    expect(result.current.adminBadgeFor('Renewals').count).toBeUndefined();
    expect(result.current.pendingPayments).toBe(0);
  });
});
