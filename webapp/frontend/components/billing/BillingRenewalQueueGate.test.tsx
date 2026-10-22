import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingRenewalQueueGate } from './BillingRenewalQueueGate';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), counts: vi.fn(), params: vi.fn(), push: vi.fn(), queueProps: vi.fn(), legacy: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA' }) }));
vi.mock('next/navigation', () => ({ useSearchParams: mocks.params, useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/hooks/useBillingQueueCounts', () => ({ useBillingQueueCounts: mocks.counts }));
vi.mock('./BillingRenewalQueue', () => ({ BillingRenewalQueue: (props: { onShowLegacy: () => void; onShowTaught: () => void }) => { mocks.queueProps(props); return <div>New renewal queue<button onClick={props.onShowLegacy}>Earlier enrollments</button><button onClick={props.onShowTaught}>Taught work</button></div>; } }));

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/renewals');
  mocks.auth.mockReturnValue({ user: { id: 1 }, canViewAdminPages: true, isLoading: false });
  mocks.counts.mockReturnValue({ available: true });
  mocks.params.mockReturnValue(new URLSearchParams());
  mocks.push.mockClear(); mocks.queueProps.mockClear();
  mocks.legacy.mockReset().mockImplementation((onBack?: () => void) => <div>Legacy enrollment tools{onBack && <button onClick={onBack}>Back to enrollment renewals</button>}</div>);
});

describe('renewal queue availability and legacy entry points', () => {
  it('mounts only the queue when storage makes it available', () => {
    render(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(screen.getByText('New renewal queue')).toBeInTheDocument();
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it('preserves the old default page only when availability is explicitly false', () => {
    mocks.counts.mockReturnValue({ available: false });
    render(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(screen.getByText('Legacy enrollment tools')).toBeInTheDocument();
    expect(mocks.legacy).toHaveBeenCalledWith();
    expect(screen.queryByRole('button', { name: 'Back to enrollment renewals' })).not.toBeInTheDocument();
    expect(mocks.queueProps).not.toHaveBeenCalled();
  });

  it('does not fall back to legacy requests while availability is loading or failed', () => {
    mocks.counts.mockReturnValue({ available: undefined, isLoading: true });
    const { rerender } = render(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading enrollment renewals…');
    expect(mocks.legacy).not.toHaveBeenCalled();
    mocks.counts.mockReturnValue({ available: undefined, error: new Error('Offline') });
    rerender(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load enrollment renewals.');
    expect(mocks.legacy).not.toHaveBeenCalled();
  });

  it('opens the preserved taught hash directly and offers a route back', async () => {
    window.history.replaceState(null, '', '/admin/renewals#taught');
    render(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(await screen.findByText('Legacy enrollment tools')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to enrollment renewals' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/admin/renewals');
    expect(screen.getByText('New renewal queue')).toBeInTheDocument();
  });

  it('keeps legacy history available through the query and new taught work through the hash', async () => {
    mocks.params.mockReturnValue(new URLSearchParams('view=legacy'));
    const { rerender } = render(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(screen.getByText('Legacy enrollment tools')).toBeInTheDocument();
    mocks.params.mockReturnValue(new URLSearchParams());
    rerender(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    fireEvent.click(screen.getByRole('button', { name: 'Taught work' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/admin/renewals#taught');
    await screen.findByText('Legacy enrollment tools');
    expect(mocks.legacy).toHaveBeenLastCalledWith(expect.any(Function), true);
    act(() => { window.history.replaceState(null, '', '/admin/renewals'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(screen.getByText('New renewal queue')).toBeInTheDocument());
  });

  it('opens a reminder stage and collection month without losing legacy navigation', () => {
    mocks.params.mockReturnValue(new URLSearchParams('stage=attention&collection_month=2026-11'));
    render(<BillingRenewalQueueGate renderLegacy={mocks.legacy} />);
    expect(mocks.queueProps).toHaveBeenLastCalledWith(expect.objectContaining({ initialStage: 'attention', initialCollectionMonth: '2026-11' }));
    fireEvent.click(screen.getByRole('button', { name: 'Earlier enrollments' }));
    expect(mocks.push).toHaveBeenLastCalledWith('/admin/renewals?view=legacy');
  });
});
