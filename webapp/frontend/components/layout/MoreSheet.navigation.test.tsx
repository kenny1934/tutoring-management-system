import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoreSheet } from './MoreSheet';

const mocks = vi.hoisted(() => ({ pathname: vi.fn(), close: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: mocks.pathname }));
vi.mock('next/link', () => ({ default: ({ href, onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) =>
  <a href={href} {...props} onClick={event => { event.preventDefault(); onClick?.(event); }}>{children}</a>,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { name: 'Synthetic admin' }, isSuperAdmin: true, effectiveRole: 'Super Admin',
  isImpersonating: false, impersonatedTutor: null, logout: vi.fn(),
}) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA', setSelectedLocation: vi.fn(), locations: ['MSA'] }) }));
vi.mock('@/contexts/RoleContext', () => ({ useRole: () => ({ viewMode: 'center-view', setViewMode: vi.fn() }) }));
vi.mock('@/components/ui/mobile-bottom-sheet', () => ({ MobileBottomSheet: ({ isOpen, onClose, header, children }: {
  isOpen: boolean; onClose: () => void; header: (close: () => void) => ReactNode; children: ReactNode;
}) => isOpen ? <div role="dialog">{header(onClose)}{children}</div> : null }));
vi.mock('@/components/ui/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/ui/SurfacePicker', () => ({ SurfacePicker: () => null }));
vi.mock('@/components/auth', () => ({ RoleSwitcher: () => null }));
vi.mock('./BottomTabBar', () => ({ TAB_HREFS: ['/', '/students', '/sessions', '/inbox'] }));
vi.mock('./useNavigation', () => ({ useNavigation: () => ({
  isAdminOrAbove: true, hasUnseenUpdates: false,
  mainNavigation: [{ name: 'Documents', href: '/documents', icon: () => null }],
  adminNavigation: [{ name: 'Renewals', href: '/admin/renewals', icon: () => null }, { name: 'Payment plans', href: '/billing', icon: () => null }],
  adminBadgeFor: () => ({ count: 0, showOpen: false }),
}) }));

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); mocks.pathname.mockReturnValue('/billing');
});
afterEach(() => vi.useRealTimers());

function show() { render(<MoreSheet isOpen onClose={mocks.close} />); }

describe('More sheet navigation keeps pending routes alive', () => {
  it.each([
    ['Renewals', '/admin/renewals'], ['Documents', '/documents'], ['Settings', '/settings'],
    ["What's new", '/whats-new'], ['Debug', '/admin/debug'],
  ])('does not close eagerly when selecting %s on another route', (name, href) => {
    show();
    const link = screen.getByRole('link', { name: name === 'Documents' ? /^Documents/ : name });
    expect(link).toHaveAttribute('href', href);
    fireEvent.click(link);
    expect(mocks.close).not.toHaveBeenCalled();
    // A slow route remains pending past the overlay's former 300ms cleanup.
    act(() => vi.advanceTimersByTime(500));
    expect(mocks.close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it.each([
    ['Payment plans', '/billing'], ['Renewals', '/admin/renewals'], ['Settings', '/settings'],
    ["What's new", '/whats-new'], ['Debug', '/admin/debug'], ['Documents', '/documents'],
  ])('closes immediately when %s is already the current route', (name, path) => {
    mocks.pathname.mockReturnValue(path); show();
    fireEvent.click(screen.getByRole('link', { name: name === 'Documents' ? /^Documents/ : name }));
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing immediate close for the external guide tab', () => {
    show();
    const guide = screen.getByRole('link', { name: 'User guide' });
    expect(guide).toHaveAttribute('target', '_blank');
    fireEvent.click(guide);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
