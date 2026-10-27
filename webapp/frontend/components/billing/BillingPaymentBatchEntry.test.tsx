import { useEffect, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingRenewalQueue } from './BillingRenewalQueue';
import type { BillingQueueResponse, BillingQueueRow } from '@/types/billing';
import type { PaymentBatchAction, PaymentBatchTarget } from '@/lib/billing-payment-batch';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), location: vi.fn(), queue: vi.fn(), queueCounts: vi.fn(), options: vi.fn(), receiptCount: vi.fn(), batch: vi.fn(), unmount: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: mocks.location }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { queue: mocks.queue, queueCounts: mocks.queueCounts, options: mocks.options, receiptCount: mocks.receiptCount } }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: mocks.invalidate }));
vi.mock('@/lib/hooks', async original => ({ ...await original<typeof import('@/lib/hooks')>(), usePageTitle: vi.fn(), useVisibilityAwareInterval: () => 0, useUnlistedWaitingCount: () => ({ data: { count: 0 } }) }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('./BillingPaymentSettings', () => ({ BillingPaymentSettings: () => null }));
vi.mock('./BillingCouponImport', () => ({ BillingCouponImportButton: () => null }));
vi.mock('./BillingRenewalWorkspace', () => ({ BillingRenewalWorkspace: () => <div role="dialog" aria-label="Individual enrollment" /> }));
vi.mock('./BillingBatchRenewModal', () => ({ BillingBatchRenewModal: () => <div role="dialog" aria-label="Batch renewal" /> }));
vi.mock('./BillingCardFeeMessage', async original => ({ ...await original<typeof import('./BillingCardFeeMessage')>(), BillingCardFeeMessage: () => null }));

interface BatchProps {
  action: PaymentBatchAction;
  targets: PaymentBatchTarget[];
  writesAvailable: boolean;
  onClose: (completed: string[]) => void;
  onChanged: () => void;
}
vi.mock('./BillingPaymentBatchModal', () => ({ BillingPaymentBatchModal: function Batch(props: BatchProps) {
  mocks.batch(props);
  useEffect(() => () => mocks.unmount(), []);
  return <div role="dialog" aria-label="Payment batch"><button onClick={() => props.onClose([])}>Close payment batch</button><button onClick={() => props.onClose([props.targets[0].paymentId])}>Complete first payment</button><button onClick={props.onChanged}>Payments changed</button></div>;
} }));

function row(id = 4, overrides: Partial<BillingQueueRow> = {}): BillingQueueRow {
  return {
    key: `student-${id}`, student: { id, student_name: `Student ${id}`, school_student_id: String(id), home_location: 'MSA', grade: 'F1', is_staff_referral: false },
    stage: 'send', origin: 'payment', payment_method: 'manual',
    collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null },
    first_lesson_date: '2026-12-04', coverage_through: '2026-12-31', lesson_count: 8, total_fee: 3200, amount_basis: 'reviewed',
    prepare_on: '2026-11-12', due_date: '2026-12-04', overdue: false, ready_now: true,
    draft_id: null, payment_id: `payment-${id}`, enrollment_ids: [id * 10, id * 10 + 1], payment_ids: [`payment-${id}`], issues: [], note: '', action_url: `/billing/students/${id}`,
    ...overrides,
  };
}
function response(rows: BillingQueueRow[]): BillingQueueResponse {
  return { as_of: '2026-11-14', collection_month: '2026-11', counts: { prepare: 1, send: 2, awaiting_payment: 2, attention: 1, no_payment: 0, total: rows.length, actionable: rows.length, overdue: 0 }, total: rows.length, offset: 0, limit: 25, rows };
}
function Wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>;
}
function show(initialStage: Parameters<typeof BillingRenewalQueue>[0]['initialStage'] = 'all') {
  return render(<BillingRenewalQueue initialStage={initialStage} onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />, { wrapper: Wrapper });
}
function rerenderQueue(view: ReturnType<typeof show>) {
  view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockReturnValue({ user: { id: 1 }, isAdmin: true, canViewAdminPages: true, effectiveRole: 'Admin', isLoading: false, isReadOnly: false });
  mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
  mocks.queue.mockResolvedValue(response([row()]));
  mocks.queueCounts.mockImplementation(async ({ collection_month }: { collection_month?: string } = {}) => ({ as_of: '2026-11-14', collection_month: collection_month || '2026-11', ...response([row()]).counts }));
  mocks.options.mockResolvedValue({ workflow_available: true, workflow_writes_available: true });
  mocks.receiptCount.mockResolvedValue({ storage_available: false, writes_available: false, count: 0 });
  mocks.invalidate.mockResolvedValue(undefined);
});

describe('combined-payment batch entry in renewals', () => {
  it('opens Sent from the original student checkbox and bottom bar for a combined payment', async () => {
    show('send');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Student 4' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument();
    expect(screen.queryByText('Select this page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark messages sent' }));
    expect(mocks.batch.mock.lastCall![0]).toMatchObject({ action: 'sent', writesAvailable: true, targets: [{ paymentId: 'payment-4', student: { id: 4 }, enrollmentIds: [40, 41] }] });
  });

  it('offers Paid for the actual initial manual collection even when the recorded preference is Autopay', async () => {
    mocks.queue.mockResolvedValue(response([row(4, { stage: 'awaiting_payment', payment_method: 'autopay', recorded_payment_method: 'autopay' })]));
    show('awaiting_payment');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Student 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record payments' }));
    expect(mocks.batch.mock.lastCall![0].action).toBe('paid');
    expect(mocks.batch.mock.lastCall![0].targets).toHaveLength(1);
  });

  it('excludes Autopay collections, multiple unpaid payments, legacy payments and attention rows', async () => {
    const manual = row();
    mocks.queue.mockResolvedValue(response([
      manual,
      row(5, { stage: 'awaiting_payment', collection: { ...manual.collection!, method: 'autopay' } }),
      row(6, { payment_ids: ['payment-6', 'other-payment'] }),
      row(7, { origin: 'legacy', payment_id: null, payment_ids: [] }),
      row(8, { stage: 'attention' }),
    ]));
    show();
    await screen.findByRole('article', { name: 'Student 8 renewal' });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Select Student 4' })).toBeEnabled();
  });

  it('keeps Sent, Paid and renewal selection families separate and preserves the section checkbox', async () => {
    mocks.queue.mockResolvedValue(response([
      row(), row(5), row(6, { stage: 'awaiting_payment' }),
      row(7, { stage: 'prepare', origin: 'projection', payment_id: null, payment_ids: [] }),
    ]));
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Student 4' }));
    expect(screen.queryByRole('checkbox', { name: 'Select Student 6' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Student 7' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Check dates' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark messages sent' }));
    expect(mocks.batch.mock.lastCall![0].targets.map((target: PaymentBatchTarget) => target.paymentId)).toEqual(['payment-4', 'payment-5']);
    fireEvent.click(screen.getByRole('button', { name: 'Close payment batch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 6' }));
    expect(screen.getByRole('button', { name: 'Record payments' })).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Select Student 4' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 7' }));
    expect(screen.getByRole('button', { name: 'Batch renew' })).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Select Student 6' })).not.toBeInTheDocument();
  });

  it('clears only completed payment targets and refreshes the existing renewal caches', async () => {
    mocks.queue.mockResolvedValue(response([row(), row(5)]));
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Student 4' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark messages sent' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Payments changed' })));
    expect(mocks.invalidate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Complete first payment' }));
    expect(screen.getByRole('checkbox', { name: 'Select Student 4' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Student 5' })).toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark messages sent' }));
    expect(mocks.batch.mock.lastCall![0].targets.map((target: PaymentBatchTarget) => target.paymentId)).toEqual(['payment-5']);
  });

  it.each(['branch', 'read-only', 'user', 'month', 'search', 'stage'] as const)('unmounts the active batch and clears selection when %s changes', async kind => {
    const view = show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Student 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark messages sent' }));
    expect(screen.getByRole('dialog', { name: 'Payment batch' })).toBeInTheDocument();
    if (kind === 'branch') { mocks.location.mockReturnValue({ selectedLocation: 'MSB' }); rerenderQueue(view); }
    if (kind === 'read-only') { mocks.auth.mockReturnValue({ ...mocks.auth(), isReadOnly: true }); rerenderQueue(view); }
    if (kind === 'user') { mocks.auth.mockReturnValue({ ...mocks.auth(), user: { id: 2 } }); rerenderQueue(view); }
    if (kind === 'month') fireEvent.change(screen.getByLabelText('Collection month'), { target: { value: '2026-12' } });
    if (kind === 'search') fireEvent.change(screen.getByRole('textbox', { name: 'Find a student' }), { target: { value: 'Student' } });
    if (kind === 'stage') fireEvent.click(screen.getByRole('tab', { name: /Awaiting payment/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.unmount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mark messages sent' })).not.toBeInTheDocument();
    if (kind === 'branch' || kind === 'read-only' || kind === 'user') {
      mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
      mocks.auth.mockReturnValue({ ...mocks.auth(), user: { id: 1 }, isReadOnly: false });
      rerenderQueue(view);
      await screen.findByRole('article');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    }
  });

  it('passes disabled workflow writes through to the review dialog without hiding reviewed payments', async () => {
    mocks.options.mockResolvedValue({ workflow_available: true, workflow_writes_available: false });
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Student 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark messages sent' }));
    expect(mocks.batch.mock.lastCall![0].writesAvailable).toBe(false);
  });
});
