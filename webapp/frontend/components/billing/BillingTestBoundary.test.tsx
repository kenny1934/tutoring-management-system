import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { SWRConfig, useSWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingTestBoundary } from './BillingTestBoundary';
import { LayoutShell } from '@/components/layout/LayoutShell';
import { billingToday, setBillingTestDate } from '@/lib/billing-clock';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), options: vi.fn(), mounted: vi.fn(), pathname: '/billing' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: mocks.options } }));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/layout/PullToRefresh', () => ({ PullToRefresh: () => null }));
vi.mock('@/components/layout/BottomTabBar', () => ({ BottomTabBar: () => null }));
vi.mock('@/components/layout/MoreSheet', () => ({ MoreSheet: () => null }));
vi.mock('@/components/layout/AppBadge', () => ({ AppBadge: () => null }));
vi.mock('@/components/layout/ScrollMemory', () => ({ ScrollMemory: () => null }));
vi.mock('@/components/layout/useNavigation', () => ({ useNavigation: () => ({}) }));
vi.mock('@/components/brand/Logo', () => ({ Logo: () => null }));
vi.mock('@/components/dashboard/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/contexts/CommandPaletteContext', () => ({ useCommandPalette: () => ({ open: () => {} }) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({}) }));
vi.mock('@/lib/app-chrome', () => ({ useBottomBarHidden: () => true }));
vi.mock('@/lib/shape', () => ({ applyShape: () => {} }));

function options(date: string | null = '2026-11-20', asOf = date) { return { test_date: date, as_of: asOf }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function Child() {
  const [initialDate] = useState(() => billingToday());
  useEffect(() => { mocks.mounted(initialDate); }, [initialDate]);
  return <p>Form date: {initialDate}</p>;
}
let refreshOptions: () => Promise<unknown>;
function CacheControl() {
  const { mutate } = useSWRConfig();
  refreshOptions = () => mutate(key => Array.isArray(key) && key[0] === 'billing-test-calendar');
  return null;
}
function Wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 0 }}><CacheControl />{children}</SWRConfig>;
}
function show() { return render(<BillingTestBoundary><Child /></BillingTestBoundary>, { wrapper: Wrapper }); }

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('NEXT_PUBLIC_BILLING_TEST_MODE', '1');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T16:37:42Z'));
  setBillingTestDate(null);
  for (const mock of [mocks.auth, mocks.options, mocks.mounted]) mock.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isLoading: false, isImpersonating: false, impersonatedTutor: null });
  mocks.options.mockResolvedValue(options()); mocks.pathname = '/billing';
});
afterEach(() => { setBillingTestDate(null); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('the development billing database boundary', () => {
  it.each([
    ['production', '1'], ['development', '0'], ['development', ''], ['test', undefined], ['test', '1'],
  ])('leaves ordinary %s operation unchanged with flag %s', (environment, flag) => {
    vi.stubEnv('NODE_ENV', environment); vi.stubEnv('NEXT_PUBLIC_BILLING_TEST_MODE', flag);
    show();
    expect(screen.getByText('Form date: 2026-10-23')).toBeVisible();
    expect(mocks.auth).not.toHaveBeenCalled(); expect(mocks.options).not.toHaveBeenCalled();
    expect(screen.queryByText(/Billing test data/)).not.toBeInTheDocument();
  });

  it('does not request options or block the logged-out login page', () => {
    mocks.auth.mockReturnValue({ user: null, effectiveRole: null, isLoading: false });
    mocks.pathname = '/login';
    render(<LayoutShell><p>Sign in</p></LayoutShell>, { wrapper: Wrapper });
    expect(screen.getByText('Sign in')).toBeVisible(); expect(mocks.options).not.toHaveBeenCalled();
    expect(billingToday()).toBe('2026-10-23');
  });

  it.each(['/apply', '/status/example', '/summer/apply', '/regular/apply', '/zen'])('does not put the test gate on the public or shell-free route %s', pathname => {
    mocks.pathname = pathname;
    render(<LayoutShell><p>Parent or shell-free page</p></LayoutShell>, { wrapper: Wrapper });
    expect(screen.getByText('Parent or shell-free page')).toBeVisible();
    expect(mocks.options).not.toHaveBeenCalled();
  });

  it('holds page forms until the backend date is verified and mounts them with that date', async () => {
    const held = deferred<ReturnType<typeof options>>(); mocks.options.mockReturnValue(held.promise);
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Checking the billing test database');
    expect(mocks.mounted).not.toHaveBeenCalled(); expect(screen.queryByText(/Form date:/)).not.toBeInTheDocument();
    expect(billingToday()).toBe('2026-10-23');
    await act(async () => held.resolve(options()));
    expect(await screen.findByText('Form date: 2026-11-20')).toBeVisible();
    expect(mocks.mounted).toHaveBeenCalledExactlyOnceWith('2026-11-20');
    expect(screen.getByRole('status')).toHaveTextContent('Billing test data');
    expect(screen.getByRole('button', { name: 'Reload test date' })).toBeVisible();
  });

  it.each([
    { test_date: null, as_of: '2026-11-20' },
    { test_date: '2026-11-20', as_of: '2026-11-21' },
    { test_date: '2026-11-20' },
    {},
  ])('holds missing or mismatched backend date evidence %j', async response => {
    mocks.options.mockResolvedValue(response); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('not connected to its billing test database');
    expect(screen.getByRole('button', { name: 'Check again' })).toBeVisible();
    expect(mocks.mounted).not.toHaveBeenCalled(); expect(billingToday()).toBe('2026-10-23');
  });

  it('holds a failed backend read without mounting fee forms', async () => {
    mocks.options.mockRejectedValue(new Error('Backend is unavailable.')); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Restart its backend');
    expect(mocks.mounted).not.toHaveBeenCalled(); expect(billingToday()).toBe('2026-10-23');
  });

  it.each(['2026-02-30', '2026-13-01', 'not-a-date'])('holds invalid authoritative date %s without crashing or exposing forms', async date => {
    mocks.options.mockResolvedValue(options(date)); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('not connected to its billing test database');
    expect(mocks.mounted).not.toHaveBeenCalled(); expect(billingToday()).toBe('2026-10-23');
  });

  it('discards late results from another signed-in account before opening the new scope', async () => {
    const first = deferred<ReturnType<typeof options>>(); const second = deferred<ReturnType<typeof options>>();
    mocks.options.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = show(); expect(mocks.options).toHaveBeenCalledOnce();
    mocks.auth.mockReturnValue({ user: { id: 9 }, effectiveRole: 'Admin', isLoading: false });
    view.rerender(<BillingTestBoundary><Child /></BillingTestBoundary>);
    await waitFor(() => expect(mocks.options).toHaveBeenCalledTimes(2));
    await act(async () => first.resolve(options('2026-11-12')));
    expect(mocks.mounted).not.toHaveBeenCalled(); expect(billingToday()).toBe('2026-10-23');
    await act(async () => second.resolve(options('2026-12-20')));
    expect(await screen.findByText('Form date: 2026-12-20')).toBeVisible();
    expect(mocks.mounted).toHaveBeenCalledExactlyOnceWith('2026-12-20');
  });

  it('unmounts the old form and resets the clock while a new effective role is checked', async () => {
    const view = show(); await screen.findByText('Form date: 2026-11-20');
    const second = deferred<ReturnType<typeof options>>(); mocks.options.mockReturnValueOnce(second.promise);
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isLoading: false, isImpersonating: true, impersonatedTutor: { id: 7 } });
    view.rerender(<BillingTestBoundary><Child /></BillingTestBoundary>);
    expect(screen.queryByText('Form date: 2026-11-20')).not.toBeInTheDocument();
    expect(billingToday()).toBe('2026-10-23');
    await act(async () => second.resolve(options('2026-12-20')));
    expect(await screen.findByText('Form date: 2026-12-20')).toBeVisible();
    expect(mocks.mounted.mock.calls.map(call => call[0])).toEqual(['2026-11-20', '2026-12-20']);
  });

  it.each(['another tutor', 'impersonation ended'] as const)('checks the authoritative date again when the scope changes to %s', async change => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isLoading: false, isImpersonating: true, impersonatedTutor: { id: 7 } });
    const view = show(); await screen.findByText('Form date: 2026-11-20');
    const second = deferred<ReturnType<typeof options>>(); mocks.options.mockReturnValueOnce(second.promise);
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isLoading: false, isImpersonating: change === 'another tutor', impersonatedTutor: change === 'another tutor' ? { id: 8 } : null });
    view.rerender(<BillingTestBoundary><Child /></BillingTestBoundary>);
    expect(screen.queryByText('Form date: 2026-11-20')).not.toBeInTheDocument();
    expect(billingToday()).toBe('2026-10-23');
    await waitFor(() => expect(mocks.options).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(options('2026-12-20')));
    expect(await screen.findByText('Form date: 2026-12-20')).toBeVisible();
  });

  it('recreates forms with a changed same-scope authoritative date instead of retaining their old initial state', async () => {
    show(); await screen.findByText('Form date: 2026-11-20');
    mocks.options.mockResolvedValueOnce(options('2026-12-20'));
    await act(async () => { await refreshOptions(); });
    expect(await screen.findByText('Form date: 2026-12-20')).toBeVisible();
    expect(screen.queryByText('Form date: 2026-11-20')).not.toBeInTheDocument();
    expect(billingToday()).toBe('2026-12-20');
    expect(mocks.mounted.mock.calls.map(call => call[0])).toEqual(['2026-11-20', '2026-12-20']);
  });

  it('holds forms when later backend evidence is mismatched even if a previous date was verified', async () => {
    show(); await screen.findByText('Form date: 2026-11-20');
    mocks.options.mockResolvedValueOnce(options('2026-12-20', '2026-12-21'));
    await act(async () => { await refreshOptions(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('not connected to its billing test database');
    expect(screen.queryByText(/Form date:/)).not.toBeInTheDocument();
    expect(billingToday()).toBe('2026-10-23');
  });

  it('hides forms after a revalidation error and remounts with the verified date after recovery', async () => {
    show(); await screen.findByText('Form date: 2026-11-20');
    mocks.options.mockRejectedValueOnce(new Error('The backend disconnected.'));
    await act(async () => { await refreshOptions().catch(() => {}); });
    expect(await screen.findByRole('alert')).toHaveTextContent('not connected to its billing test database');
    expect(screen.queryByText(/Form date:/)).not.toBeInTheDocument();
    expect(billingToday()).toBe('2026-10-23');
    mocks.options.mockResolvedValueOnce(options('2026-12-20'));
    await act(async () => { await refreshOptions(); });
    expect(await screen.findByText('Form date: 2026-12-20')).toBeVisible();
    expect(mocks.mounted.mock.calls.map(call => call[0])).toEqual(['2026-11-20', '2026-12-20']);
  });

  it('clears the verified override when the test boundary unmounts', async () => {
    const view = show(); await screen.findByText('Form date: 2026-11-20');
    view.unmount(); expect(billingToday()).toBe('2026-10-23');
  });
});
