import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentPaymentPlan } from './StudentPaymentPlan';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), options: vi.fn(), preferences: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: mocks.options, preferences: mocks.preferences } }));
function Wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.options.mockResolvedValue({ workflow_available: true, preferences_writes_available: true });
  mocks.preferences.mockImplementation(async (student_id: number) => ({ student_id, payment_method: 'autopay', mandate_ready: true, version: 1 }));
});

describe('student profile payment plan', () => {
  it('shows the recorded preference and authorisation with a journey for this student', async () => {
    render(<StudentPaymentPlan studentId={4} isMobile={false} />, { wrapper: Wrapper });
    expect(await screen.findByRole('button', { name: 'Payment method: Autopay' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Bank authorisation' })).toHaveTextContent('Authorisation ready');
    expect(screen.getByRole('link', { name: 'Payment journey' })).toHaveAttribute('href', '/billing/students/4');
  });

  it('withholds the previous student’s preference while the next student loads', async () => {
    const view = render(<StudentPaymentPlan studentId={4} isMobile />, { wrapper: Wrapper });
    await screen.findByRole('button', { name: 'Payment method: Autopay' });
    mocks.preferences.mockImplementation(() => new Promise(() => {}));
    view.rerender(<StudentPaymentPlan studentId={5} isMobile />);
    expect(screen.queryByRole('button', { name: 'Payment method: Autopay' })).not.toBeInTheDocument();
    expect(screen.getByText('Loading payment plan…')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Payment journey' })).toHaveAttribute('href', '/billing/students/5');
  });

  it('does not show bank authorisation for manual or unrecorded preferences', async () => {
    mocks.preferences.mockResolvedValue({ student_id: 4, payment_method: null, mandate_ready: false, version: 0 });
    render(<StudentPaymentPlan studentId={4} isMobile />, { wrapper: Wrapper });
    await screen.findByRole('button', { name: 'Payment method: Not set' });
    expect(screen.queryByRole('button', { name: 'Bank authorisation' })).not.toBeInTheDocument();
    expect(screen.queryByText('Authorisation needed')).not.toBeInTheDocument();
  });

  it('uses the effective tutor scope and keeps authorisation read-only', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false, isReadOnly: false, isImpersonating: true, impersonatedTutor: { id: 9 } });
    render(<StudentPaymentPlan studentId={4} isMobile />, { wrapper: Wrapper });
    await screen.findByText('Authorisation ready');
    expect(mocks.preferences).toHaveBeenCalledWith(4, 9);
    expect(screen.queryByRole('button', { name: 'Bank authorisation' })).not.toBeInTheDocument();
  });

  it('avoids reading preferences when storage is unavailable and reports read errors', async () => {
    mocks.options.mockResolvedValue({ workflow_available: false });
    const view = render(<StudentPaymentPlan studentId={4} isMobile />, { wrapper: Wrapper });
    await screen.findByText('Payment settings are unavailable.');
    expect(mocks.preferences).not.toHaveBeenCalled();
    view.unmount();
    mocks.options.mockResolvedValue({ workflow_available: true });
    mocks.preferences.mockRejectedValue(new Error('Unavailable'));
    render(<StudentPaymentPlan studentId={4} isMobile />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load payment plan.'));
    expect(screen.queryByRole('button', { name: 'Payment method: Not set' })).not.toBeInTheDocument();
  });
});
