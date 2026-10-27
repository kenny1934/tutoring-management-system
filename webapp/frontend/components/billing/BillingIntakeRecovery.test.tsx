import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentBillingJourney } from './StudentBillingJourney';
import { BillingRenewalPanel } from './BillingRenewalPanel';
import type { BillingDraftDetail, BillingQueueRow } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), params: vi.fn(), draft: vi.fn(), context: vi.fn(), options: vi.fn(), intake: vi.fn(), invalidate: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: mocks.params }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/hooks', () => ({ usePageTitle: vi.fn(), invalidateCaches: mocks.invalidate }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { draft: mocks.draft, studentContext: mocks.context, options: mocks.options } }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./BillingEnrollmentIntake', () => ({ BillingEnrollmentIntake: (props: { studentId: number; initialDraftId?: string; onCreated?: () => void }) => {
  mocks.intake(props); return <section aria-label="Recovered first enrollment"><p>{props.studentId}:{props.initialDraftId}</p><button onClick={props.onCreated}>Created enrollment</button></section>;
} }));

function saved(id = 'intake-draft', student = 12): BillingDraftDetail {
  return { id, student_id: student, review: { intake: { slots: [{ tutor_id: 7 }] } } } as BillingDraftDetail;
}
function wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>;
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.auth.mockReturnValue({ user: { id: 7 }, effectiveRole: 'Admin', isAdmin: true, isGuest: false, isLoading: false });
  mocks.params.mockReturnValue(new URLSearchParams('view=drafts&draft=intake-draft'));
  mocks.draft.mockResolvedValue(saved());
  mocks.options.mockResolvedValue({ draft_storage_available: true });
});

describe('saved first-enrollment recovery', () => {
  it('reopens the exact intake draft without requiring a Regular source', async () => {
    render(<StudentBillingJourney studentId={12} />, { wrapper });
    expect(await screen.findByRole('region', { name: 'Recovered first enrollment' })).toHaveTextContent('12:intake-draft');
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.draft).toHaveBeenCalledWith('intake-draft', undefined, undefined, undefined);
  });

  it('withholds a draft returned for another student', async () => {
    mocks.draft.mockResolvedValue(saved('intake-draft', 13));
    render(<StudentBillingJourney studentId={12} />, { wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent('does not belong to this student');
    expect(mocks.intake).not.toHaveBeenCalled();
  });

  it('keeps a scoped denial visible and permits a deliberate retry', async () => {
    mocks.draft.mockRejectedValueOnce(new Error('Not available'));
    render(<StudentBillingJourney studentId={12} />, { wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open this draft.');
    expect(mocks.intake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry draft' }));
    expect(await screen.findByRole('region', { name: 'Recovered first enrollment' })).toBeInTheDocument();
  });

  it('passes effective tutor scope when opening a draft', async () => {
    mocks.auth.mockReturnValue({ user: { id: 7 }, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 22 } });
    render(<StudentBillingJourney studentId={12} />, { wrapper });
    await screen.findByRole('region', { name: 'Recovered first enrollment' });
    expect(mocks.draft).toHaveBeenCalledWith('intake-draft', undefined, undefined, 22);
  });

  it('does not reveal an earlier draft after the student changes during loading', async () => {
    let finish!: (draft: BillingDraftDetail) => void;
    mocks.draft.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(saved('intake-draft', 13));
    const view = render(<StudentBillingJourney studentId={12} />, { wrapper });
    await waitFor(() => expect(mocks.draft).toHaveBeenCalledTimes(1));
    view.rerender(<StudentBillingJourney studentId={13} />);
    expect(await screen.findByRole('region', { name: 'Recovered first enrollment' })).toHaveTextContent('13:intake-draft');
    await act(async () => finish(saved()));
    expect(screen.getByRole('region', { name: 'Recovered first enrollment' })).toHaveTextContent('13:intake-draft');
    expect(mocks.intake.mock.calls.every(([props]) => props.studentId === 13)).toBe(true);
  });

  it('uses the intake workflow directly for a queue draft without a teaching enrollment', async () => {
    const row = { student: { id: 12 }, origin: 'draft', enrollment_ids: [], payment_ids: [], recorded_payment_method: null } as unknown as BillingQueueRow;
    const changed = vi.fn();
    render(<BillingRenewalPanel row={row} initialAction={{ kind: 'draft', id: 'intake-draft' }} onChanged={changed} onOpenEnrollment={vi.fn()} onActionChange={vi.fn()} onBusyChange={vi.fn()} />, { wrapper });
    expect(screen.getByRole('region', { name: 'Recovered first enrollment' })).toHaveTextContent('12:intake-draft');
    expect(mocks.context).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Created enrollment' })));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith('enrollments', { studentId: 12 });
  });
});
