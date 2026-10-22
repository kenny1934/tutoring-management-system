import { useEffect, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OverduePaymentsPage from './page';
import type { OverdueEnrollment } from '@/types';
import type { PaymentBatchTarget } from '@/lib/billing-payment-batch';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), location: vi.fn(), overdue: vi.fn(), batch: vi.fn(), unmount: vi.fn(), batchMarkPaid: vi.fn(), update: vi.fn(), toast: vi.fn(), revalidate: vi.fn(), options: vi.fn(), params: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: mocks.location }));
vi.mock('@/contexts/RoleContext', () => ({ useRole: () => ({ viewMode: 'center-view' }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('next/navigation', () => ({ useSearchParams: mocks.params }));
vi.mock('@/lib/hooks', async original => ({ ...await original<typeof import('@/lib/hooks')>(), usePageTitle: vi.fn(), useTutors: () => ({ data: [] }), useOverdueEnrollments: mocks.overdue }));
vi.mock('@/lib/api', () => ({ enrollmentsAPI: { batchMarkPaid: mocks.batchMarkPaid, update: mocks.update } }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: mocks.options } }));
vi.mock('@/lib/design-system', () => ({ PageTransition: ({ children }: { children: ReactNode }) => <div>{children}</div>, StickyNote: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/auth/AdminPageGuard', () => ({ AdminPageGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/selectors/TutorSelector', () => ({ TutorSelector: () => null, ALL_TUTORS: 'all' }));
vi.mock('@/components/enrollments/EnrollmentDetailPopover', () => ({ EnrollmentDetailPopover: () => null }));
vi.mock('@/components/wecom/SendToWecomModal', () => ({ default: () => null }));

interface BatchProps {
  targets: PaymentBatchTarget[];
  action: string;
  writesAvailable: boolean;
  onClose: (completed: string[]) => void;
  onChanged: () => void;
}
vi.mock('@/components/billing/BillingPaymentBatchModal', () => ({ BillingPaymentBatchModal: function Batch(props: BatchProps) {
  mocks.batch(props);
  useEffect(() => () => mocks.unmount(), []);
  return <div role="dialog" aria-label="Combined payments"><button onClick={() => props.onClose([props.targets[0].paymentId])}>Complete first payment</button><button onClick={props.onChanged}>Payments changed</button></div>;
} }));

function row(id = 7, overrides: Partial<OverdueEnrollment> = {}): OverdueEnrollment {
  return { id, student_id: id, student_name: `Student ${id}`, school_student_id: String(id), location: 'MSA', grade: 'F1', assigned_day: 'Friday', assigned_time: '16:00', first_lesson_date: '2026-12-04', lessons_paid: 4, days_overdue: 3, total_fee: 1600, ...overrides };
}
function combined(id = 7, overrides: Partial<OverdueEnrollment> = {}): OverdueEnrollment {
  return row(id, { billing_managed: true, billing_payment_id: `payment-${id}`, billing_payment_method: 'manual', billing_payment_line_count: 2, billing_payment_lesson_count: 8, billing_payment_total_fee: 3200, ...overrides });
}
function Wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>;
}
function show(rows: OverdueEnrollment[]) {
  mocks.overdue.mockReturnValue({ data: rows, isLoading: false, mutate: mocks.revalidate });
  return render(<OverduePaymentsPage />, { wrapper: Wrapper });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, isReadOnly: false, effectiveRole: 'Admin', canViewAdminPages: true });
  mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
  mocks.params.mockReturnValue(new URLSearchParams());
  mocks.options.mockResolvedValue({ workflow_writes_available: true });
  mocks.batchMarkPaid.mockResolvedValue({ count: 2 });
  mocks.revalidate.mockResolvedValue(undefined);
});

describe('overdue combined-payment batch entry', () => {
  it('keeps the old batch API for selected legacy and Summer enrollments', async () => {
    show([row(), row(8, { enrollment_type: 'Summer Course', locked_discount_code: 'early_bird', locked_discount_amount: 100 })]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 8' }));
    await act(async () => fireEvent.click(within(screen.getByText('2 selected').parentElement!).getByRole('button', { name: 'Confirm payment' })));
    expect(mocks.batchMarkPaid).toHaveBeenCalledExactlyOnceWith([7, 8]);
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('opens the shared Paid dialog for a linked combined payment without calling the legacy API', async () => {
    show([combined()]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record payments' }));
    await waitFor(() => expect(mocks.batch.mock.lastCall![0].writesAvailable).toBe(true));
    expect(mocks.batch.mock.lastCall![0]).toMatchObject({ action: 'paid', targets: [{ paymentId: 'payment-7', student: { id: 7 } }] });
    expect(mocks.batchMarkPaid).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('keeps legacy and combined selections separate and leaves Autopay unselectable', async () => {
    show([combined(), row(8), combined(9, { billing_payment_method: 'autopay' }), row(10, { billing_managed: true })]);
    await act(async () => {});
    expect(screen.getByRole('checkbox', { name: 'Select Student 9' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Select Student 10' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    expect(screen.getByRole('checkbox', { name: 'Select Student 8' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 8' }));
    expect(screen.getByRole('checkbox', { name: 'Select Student 7' })).toBeDisabled();
    expect(within(screen.getByText('1 selected').parentElement!).getByRole('button', { name: 'Confirm payment' })).toBeEnabled();
  });

  it('restricts the existing section checkbox to the selected payment family', async () => {
    show([combined(), combined(8), row(9), combined(10, { billing_payment_method: 'autopay' })]);
    await act(async () => {});
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every enrollment in 1-7 days overdue' }));
    expect(screen.getByRole('checkbox', { name: 'Select Student 8' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Student 9' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Student 10' })).not.toBeChecked();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('removes all selected enrollment rows of a completed payment while retaining other payments', async () => {
    show([combined(), combined(8, { billing_payment_id: 'payment-7', student_id: 7 }), combined(9)]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every enrollment in 1-7 days overdue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record payments' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Payments changed' })));
    expect(mocks.revalidate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Complete first payment' }));
    expect(screen.getByRole('checkbox', { name: 'Select Student 7' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Student 8' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Student 9' })).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(mocks.batchMarkPaid).not.toHaveBeenCalled();
  });

  it.each(['branch', 'read-only', 'user', 'search', 'urgency'] as const)('unmounts the dialog and clears checked IDs when %s changes', async kind => {
    const view = show([combined()]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record payments' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    if (kind === 'branch') mocks.location.mockReturnValue({ selectedLocation: 'MSB' });
    if (kind === 'read-only') mocks.auth.mockReturnValue({ ...mocks.auth(), isReadOnly: true });
    if (kind === 'user') mocks.auth.mockReturnValue({ ...mocks.auth(), user: { id: 2 } });
    if (kind === 'urgency') mocks.params.mockReturnValue(new URLSearchParams('urgency=new'));
    if (kind === 'search') fireEvent.change(screen.getByRole('textbox', { name: 'Search overdue enrollments' }), { target: { value: 'Student' } });
    else view.rerender(<OverduePaymentsPage />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    expect(mocks.unmount).toHaveBeenCalledTimes(1);
    expect(mocks.batchMarkPaid).not.toHaveBeenCalled();
  });

  it.each(['combined', 'orphaned', 'autopay'] as const)('drops an old selection when a list refresh changes its payment family to %s', async kind => {
    const view = show([row()]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    const fresh = kind === 'combined' ? combined() : kind === 'orphaned' ? row(7, { billing_managed: true }) : combined(7, { billing_payment_method: 'autopay' });
    mocks.overdue.mockReturnValue({ data: [fresh], isLoading: false, mutate: mocks.revalidate });
    await act(async () => view.rerender(<OverduePaymentsPage />));
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Student 7' })).not.toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.batchMarkPaid).not.toHaveBeenCalled();
  });

  it('does not switch a selected combined payment into the legacy workflow after a refresh', async () => {
    const view = show([combined()]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    mocks.overdue.mockReturnValue({ data: [row()], isLoading: false, mutate: mocks.revalidate });
    await act(async () => view.rerender(<OverduePaymentsPage />));
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Student 7' })).not.toBeChecked();
    expect(mocks.batchMarkPaid).not.toHaveBeenCalled();
  });
});
