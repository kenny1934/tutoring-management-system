import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingRenewalQueue } from './BillingRenewalQueue';
import type { BillingDraftDetail, BillingQueueResponse, BillingQueueRow } from '@/types/billing';
import { emptyBillingBatchItem, type BillingBatchItem } from '@/lib/billing-batch';
import type { BillingCardMessageTarget } from './BillingCardFeeMessage';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), location: vi.fn(), queue: vi.fn(), options: vi.fn(), workspace: vi.fn(), batch: vi.fn(), feePanel: vi.fn(), invalidate: vi.fn(), receiptCount: vi.fn(), receipts: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: mocks.location }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { queue: mocks.queue, options: mocks.options, receiptCount: mocks.receiptCount, receipts: mocks.receipts } }));
vi.mock('@/lib/renewal-queue', () => ({ invalidateRenewalQueueCache: mocks.invalidate }));
vi.mock('@/lib/hooks', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/hooks')>(), usePageTitle: vi.fn(), useVisibilityAwareInterval: () => 0, useUnlistedWaitingCount: () => ({ data: { count: 3 } }) }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

vi.mock('./BillingPaymentSettings', () => ({ BillingPaymentSettings: ({ recordedMethod }: { recordedMethod?: string | null }) => <button aria-label="Payment method">{recordedMethod === 'autopay' ? 'Autopay' : recordedMethod === 'manual' ? 'Manual' : 'Not set'}</button> }));
vi.mock('./BillingRenewalWorkspace', () => ({ BillingRenewalWorkspace: (props: { row: BillingQueueRow; initialAction?: { kind: string; id?: string }; onClose: () => void }) => {
  mocks.workspace(props); return <div role="dialog" aria-label="Enrollment renewal"><p>{props.initialAction ? `${props.initialAction.kind}:${props.initialAction.id ?? 'next'}` : 'Enrollment details'}</p><button onClick={props.onClose}>Close workspace</button></div>;
} }));
vi.mock('./BillingBatchRenewModal', () => ({ BillingBatchRenewModal: (props: { rows: BillingQueueRow[]; onClose: (items?: BillingBatchItem[]) => void; onChanged: () => void }) => {
  mocks.batch(props); return <div role="dialog" aria-label="Batch renewal"><p>{props.rows.map(value => value.student.student_name).join(', ')}</p><button onClick={() => props.onClose()}>Close batch</button><button onClick={props.onChanged}>Batch changed</button>
    <button onClick={() => props.onClose(props.rows.map(value => ({ ...emptyBillingBatchItem(value), outcome: { action: 'create', kind: 'created', text: 'Created', retryable: false } })))}>Complete batch</button></div>;
} }));
vi.mock('./BillingCardFeeMessage', async importOriginal => ({ ...await importOriginal<typeof import('./BillingCardFeeMessage')>(),
  BillingCardFeeMessage: (props: { target: BillingCardMessageTarget; onClose: () => void }) => {
    mocks.feePanel(props); return <section aria-label="Card fee message"><p>{props.target.kind}:{props.target.id}</p><button onClick={props.onClose}>Close fee message</button></section>;
  },
}));

function row(): BillingQueueRow {
  return { key: 'student-4', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, stage: 'prepare', origin: 'draft', payment_method: 'manual', collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null }, first_lesson_date: '2026-12-04', coverage_through: '2026-12-31', lesson_count: 3, total_fee: 1200, amount_basis: 'reviewed', prepare_on: '2026-11-12', due_date: '2026-12-04', overdue: false, ready_now: true, draft_id: 'draft-1', payment_id: null, enrollment_ids: [7], payment_ids: [], issues: [], note: '', action_url: '/billing/students/4?view=drafts&draft=draft-1' };
}
function response(rows: BillingQueueRow[] = [row()]): BillingQueueResponse {
  return { as_of: '2026-11-14', collection_month: '2026-11', counts: { prepare: 8, send: 4, awaiting_payment: 6, attention: 2, no_payment: 9, total: 29, actionable: 14, overdue: 1 }, total: rows.length, offset: 0, limit: 25, rows };
}
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>; }
function show(props: Partial<Parameters<typeof BillingRenewalQueue>[0]> = {}) {
  return render(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} {...props} />, { wrapper: Wrapper });
}
beforeEach(() => {
  mocks.auth.mockReturnValue({ user: { id: 1 }, canViewAdminPages: true, isAdmin: true, effectiveRole: 'Admin', isLoading: false });
  mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
  mocks.receiptCount.mockReset().mockResolvedValue({ storage_available: false, writes_available: false, count: 0 });
  mocks.queue.mockReset().mockResolvedValue(response());
  mocks.options.mockReset().mockResolvedValue({ draft_storage_available: true, workflow_available: false });
  mocks.workspace.mockReset();
  mocks.batch.mockReset();
  mocks.feePanel.mockReset();
  mocks.invalidate.mockReset().mockResolvedValue(undefined);
});

describe('enrollment renewal queue', () => {
  it('puts the counted KMS receipts tab after Awaiting payment and keeps its query independent of month', async () => {
    mocks.receiptCount.mockResolvedValue({ storage_available: true, writes_available: true, count: 9 }); mocks.receipts.mockResolvedValue({ as_of: '2026-10-21', storage_available: true, writes_available: true, total: 0, rows: [], offset: 0, limit: 25 });
    show({ initialCollectionMonth: '2027-02' }); const receiptTab = await screen.findByRole('tab', { name: 'KMS receipts 9' }); const tabs = screen.getAllByRole('tab'); expect(tabs.indexOf(receiptTab)).toBe(tabs.findIndex(tab => tab.textContent?.includes('Awaiting payment')) + 1); fireEvent.click(receiptTab); await screen.findByText('All outstanding · 0 receipts · MSA'); expect(screen.queryByLabelText('Collection month')).not.toBeInTheDocument(); expect(mocks.receipts).toHaveBeenCalledWith({ location: 'MSA', tutor_id: undefined, search: undefined, offset: 0, limit: 25 }); expect(mocks.queue.mock.calls.every(([query]) => query.stage !== 'receipts')).toBe(true); fireEvent.click(screen.getByRole('tab', { name: /To prepare/ })); expect(await screen.findByLabelText('Collection month')).toHaveValue('2027-02');
  });
  it('shows a first-enrollment draft as individual preparation without renewal or batch labels', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), enrollment_ids: [], action_kind: 'renewal', action_by: '2026-12-04' }]));
    show();
    const card = await screen.findByRole('article');
    expect(within(card).getByText('Enrollment:')).toBeInTheDocument();
    expect(within(card).getByText('Prepare before Dec 4, 2026')).toBeInTheDocument();
    expect(within(card).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(card).queryByText('Renewal:')).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Review draft' }));
    expect(mocks.workspace.mock.lastCall![0].initialAction).toEqual({ kind: 'draft', id: 'draft-1' });
  });

  it('restores the card Fee toggle and expands the exact saved message without opening a popup', async () => {
    show();
    const fee = await screen.findByRole('button', { name: 'Copy fee message' });
    expect(fee).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(fee);
    expect(fee).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Card fee message' })).toHaveTextContent('draft:draft-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.feePanel.mock.lastCall![0].target).toEqual({ kind: 'draft', id: 'draft-1', studentId: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Close fee message' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Card fee message' })).not.toBeInTheDocument());
    expect(fee).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(fee).toHaveFocus());
  });

  it('targets one combined payment for both classes and withholds Fee for an unreviewed projection', async () => {
    const combined = { ...row(), stage: 'send' as const, origin: 'payment' as const, payment_id: 'combined-1', payment_ids: ['combined-1'], enrollment_ids: [7, 8] };
    const projected = { ...row(), key: 'student-5', origin: 'projection' as const, draft_id: null, student: { ...row().student, id: 5, student_name: 'Unreviewed Student' } };
    mocks.queue.mockResolvedValue(response([combined, projected]));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy fee message' }));
    expect(mocks.feePanel.mock.lastCall![0].target).toEqual({ kind: 'payment', id: 'combined-1', studentId: 4 });
    expect(within(screen.getByRole('article', { name: 'Unreviewed Student renewal' })).queryByRole('button', { name: 'Copy fee message' })).not.toBeInTheDocument();
  });

  it('does not resurrect an expanded message after changing branch', async () => {
    const view = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy fee message' }));
    expect(screen.getByRole('region', { name: 'Card fee message' })).toBeInTheDocument();
    mocks.location.mockReturnValue({ selectedLocation: 'MSB' });
    view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    await screen.findByRole('article');
    expect(screen.queryByRole('region', { name: 'Card fee message' })).not.toBeInTheDocument();
    mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
    view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    await screen.findByRole('article');
    expect(screen.getByRole('button', { name: 'Copy fee message' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('selects renewal students without opening their workspace and excludes existing payments and skipped collections', async () => {
    const unpaid = { ...row(), key: 'unpaid', student: { ...row().student, id: 5, student_name: 'Unpaid Student' }, origin: 'legacy' as const, stage: 'send' as const };
    const skipped = { ...row(), key: 'skipped', student: { ...row().student, id: 6, student_name: 'Prepaid Student' }, stage: 'no_payment' as const };
    mocks.queue.mockResolvedValue(response([row(), unpaid, skipped]));
    show();
    const select = await screen.findByRole('checkbox', { name: 'Select Synthetic Student' });
    expect(screen.queryByRole('checkbox', { name: 'Select Unpaid Student' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Select Prepaid Student' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument();
    expect(screen.queryByText('Select this page')).not.toBeInTheDocument();
    fireEvent.click(select);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Batch renew' }));
    expect(screen.getByRole('dialog', { name: 'Batch renewal' })).toHaveTextContent('Synthetic Student');
    expect(mocks.batch.mock.lastCall![0].rows).toEqual([row()]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Batch changed' })));
    expect(mocks.invalidate).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close batch' }));
    expect(screen.getByRole('button', { name: 'Batch renew' })).toBeEnabled();
    expect(select).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument());
  });

  it('selects only the displayed page while retaining students explicitly selected on another page', async () => {
    const other = { ...row(), key: 'student-5', student: { ...row().student, id: 5, student_name: 'Second Page Student' } };
    mocks.queue.mockImplementation(({ offset }: { offset: number }) => Promise.resolve({ ...response(offset ? [other] : [row()]), total: 26, offset }));
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Synthetic Student' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('checkbox', { name: 'Select Second Page Student' });
    expect(screen.getByRole('checkbox', { name: 'Select Check dates' })).not.toBeChecked();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Check dates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batch renew' }));
    expect(mocks.batch.mock.lastCall![0].rows.map((value: BillingQueueRow) => value.student.id)).toEqual([4, 5]);
  });

  it('clears batch selection immediately when searching and does not resurrect it after a scope change', async () => {
    const view = show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Synthetic Student' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Find a student' }), { target: { value: 'Synthetic' } });
    await waitFor(() => expect(screen.queryByText('1 selected')).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Synthetic Student' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batch renew' }));
    mocks.location.mockReturnValue({ selectedLocation: 'MSB' });
    view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await screen.findByRole('article');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument());
    mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
    view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    await screen.findByRole('article');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument();
  });

  it('uses the original section checkbox to select or clear the displayed group without collapsing it', async () => {
    const other = { ...row(), key: 'student-5', student: { ...row().student, id: 5, student_name: 'Other Student' } };
    mocks.queue.mockResolvedValue(response([row(), other]));
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Synthetic Student' }));
    const group = screen.getByRole('checkbox', { name: 'Select Check dates' });
    expect(group).toBePartiallyChecked();
    fireEvent.click(group);
    expect(group).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Other Student' })).toBeChecked();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(group);
    expect(screen.getByRole('checkbox', { name: 'Select Synthetic Student' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Other Student' })).not.toBeChecked();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument());
  });

  it('does not expose batch selection to read-only staff', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, canViewAdminPages: true, isAdmin: true, effectiveRole: 'Admin', isReadOnly: true });
    show();
    await screen.findByRole('article');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Batch renew/ })).not.toBeInTheDocument();
  });

  it('clears successful creations when closing the batch and returns focus to the renewal list', async () => {
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Synthetic Student' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batch renew' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete batch' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Batch renew' })).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Select Synthetic Student' })).not.toBeChecked();
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveFocus());
  });

  it('reopens the exact newly saved draft even before the background queue refresh completes', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), origin: 'projection', draft_id: null }]));
    show();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Synthetic Student' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batch renew' }));
    const saved = { ...emptyBillingBatchItem(row()), draft: { id: 'new-reviewed-draft', confirmed_payment_id: null } as BillingDraftDetail };
    act(() => mocks.batch.mock.lastCall![0].onClose([saved]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Batch renew' }));
    expect(mocks.batch.mock.lastCall![0].rows[0]).toMatchObject({ origin: 'draft', draft_id: 'new-reviewed-draft' });
  });

  it('reuses the collapsible urgency sections with complete result counts and preserves student order', async () => {
    const urgent = { ...row(), urgency: 'now' as const, action_kind: 'renewal' as const, action_by: '2026-11-14', overdue: false };
    const soon = { ...row(), key: 'student-5', student: { ...row().student, id: 5, student_name: 'Soon Student' }, urgency: 'week' as const, action_kind: 'notice' as const, action_from: '2026-11-12', action_by: '2026-11-18' };
    const unknown = { ...row(), key: 'student-6', student: { ...row().student, id: 6, student_name: 'Check Student' }, urgency: 'check_dates' as const };
    const later = { ...row(), key: 'student-7', student: { ...row().student, id: 7, student_name: 'Later Student' }, urgency: 'later' as const, action_kind: 'notice' as const, action_from: '2026-12-12', action_by: '2026-12-18' };
    mocks.queue.mockResolvedValue({ ...response([urgent, soon, unknown, later]), total: 30, urgency_counts: { now: 20, week: 5, check_dates: 3, later: 2 } });
    show();
    await screen.findByRole('article', { name: 'Synthetic Student renewal' });
    const labels = screen.getAllByRole('button').filter(button => button.getAttribute('aria-controls')?.includes('-urgency-')).map(button => button.textContent);
    expect(labels).toEqual(['Needs action now (20)', 'This week (5)', 'Check dates (3)', 'Later (2)']);
    expect(screen.getAllByRole('article').map(card => card.getAttribute('aria-label'))).toEqual(['Synthetic Student renewal', 'Soon Student renewal', 'Check Student renewal', 'Later Student renewal']);
    expect(screen.getByText('Renew before Nov 14, 2026')).toHaveClass('text-red-700');
    expect(screen.getByText('Notice by Nov 18, 2026')).toHaveClass('text-orange-700');
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument();
    const section = screen.getByRole('button', { name: 'Needs action now (20)' });
    await act(async () => fireEvent.click(section));
    expect(section).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('article', { name: 'Synthetic Student renewal' })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(section));
    expect(screen.getByRole('article', { name: 'Synthetic Student renewal' })).toBeInTheDocument();
    expect(screen.getByText('1–4 of 30')).toBeInTheDocument();
  });

  it('shows authoritative stage counts and opens the exact saved draft', async () => {
    show();
    const card = await screen.findByRole('article', { name: 'Synthetic Student renewal' });
    expect(within(card).getByRole('button', { name: 'Review draft' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Synthetic Student' })).toHaveAttribute('href', '/students/4');
    expect(within(card).getByText('3 sessions')).toBeInTheDocument();
    expect(within(card).getByText('Manual')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Review draft' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('draft:draft-1');
    expect(screen.getByRole('tab', { name: 'All tasks 20' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'To prepare 8' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'To send 4' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Awaiting payment 6' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Needs attention 2' })).toBeInTheDocument();
    expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ stage: undefined, location: 'MSA', collection_month: undefined, offset: 0 }));
  });

  it('shows attention work on the default view even when nothing needs preparing', async () => {
    const data = response([{ ...row(), stage: 'attention' }]); data.counts.prepare = 0; data.counts.total = 21;
    mocks.queue.mockResolvedValue(data);
    show();
    const card = await screen.findByRole('article');
    expect(screen.getByRole('tab', { name: 'All tasks 12' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'To prepare 0' })).toBeInTheDocument();
    expect(within(card).getByText('Needs attention')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Review draft' })).toBeInTheDocument();
  });

  it('labels projected tuition and keeps an unknown legacy total unknown', async () => {
    const projected = { ...row(), origin: 'projection' as const, draft_id: null, amount_basis: 'tuition_only' as const };
    const legacy = { ...row(), key: 'student-5', student: { ...row().student, id: 5, student_name: 'Legacy Student' }, draft_id: null, origin: 'legacy' as const, amount_basis: 'unknown' as const, total_fee: 9999, action_url: '/enrollments/12' };
    mocks.queue.mockResolvedValue(response([projected, legacy]));
    show();
    expect(await screen.findByText('tuition estimate')).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Legacy Student renewal' });
    expect(within(card).queryByText('Fee to confirm')).not.toBeInTheDocument();
    expect(within(card).queryByText(/9,999/)).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Open enrollment' })).toBeInTheDocument();
  });

  it('opens combined payments and retains each linked record for an attention task', async () => {
    const data = { ...row(), stage: 'attention' as const, origin: 'payment' as const, overdue: true, draft_id: null, payment_ids: ['payment-a', 'payment-b'], enrollment_ids: [7, 8, 9], action_url: '/billing/students/4?view=payments' };
    mocks.queue.mockResolvedValue(response([data]));
    show({ initialStage: 'attention' });
    const card = await screen.findByRole('article', { name: 'Synthetic Student renewal' });
    expect(within(card).getByText('Overdue')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Review enrollments' })).toBeInTheDocument();
    fireEvent.click(within(card).getByText('Linked payments and enrollments'));
    fireEvent.click(within(card).getByRole('button', { name: 'Payment 2' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('payment:payment-b');
    expect(within(card).getByRole('link', { name: 'Enrollment #9' })).toHaveAttribute('href', '/enrollments/9');
    expect(screen.queryByRole('button', { name: /Mark sent|Record payment|Mark paid/ })).not.toBeInTheDocument();
  });

  it('opens a confirmed fee message even when its originating draft id is present', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), stage: 'send', origin: 'payment', payment_id: 'confirmed-1', payment_ids: ['confirmed-1'], action_url: '/billing/students/4?view=payments&payment=confirmed-1' }]));
    show({ initialStage: 'send' });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Open fee message' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('payment:confirmed-1');
    expect(within(card).queryByText('Draft saved')).not.toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Review draft' })).not.toBeInTheDocument();
  });

  it('shows skipped collection as a separate view with its next payment information', async () => {
    show();
    await screen.findByRole('article');
    const skipped = { ...row(), stage: 'no_payment' as const, note: 'January is already paid.', draft_id: null, due_date: '2027-01-20', action_url: '/billing/students/4' };
    mocks.queue.mockResolvedValue(response([skipped]));
    fireEvent.click(screen.getByRole('tab', { name: 'No payment this run 9' }));
    expect(await screen.findByText('January is already paid.')).toBeInTheDocument();
    expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ stage: 'no_payment' }));
    expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Prepare enrollment' })).not.toBeInTheDocument();
  });

  it('does not ask staff to confirm a fee when the teaching year is already paid', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), stage: 'no_payment', origin: 'projection', first_lesson_date: null, lesson_count: null, total_fee: null, amount_basis: 'unknown', collection: null, due_date: null, prepare_on: null, draft_id: null, note: 'Paid through the teaching year', action_url: '/billing/students/4' }]));
    show({ initialStage: 'no_payment' });
    expect(await screen.findByText('Paid through the teaching year')).toBeInTheDocument();
    expect(screen.queryByText('Fee to confirm')).not.toBeInTheDocument();
    expect(screen.queryByText('Payment date to confirm')).not.toBeInTheDocument();
  });

  it('debounces search, resets pagination and withholds old students while loading', async () => {
    mocks.queue.mockResolvedValue({ ...response(), total: 51 });
    show({ initialCollectionMonth: '2026-11' });
    await screen.findByRole('article');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    const search = screen.getByRole('textbox', { name: 'Find a student' });
    fireEvent.change(search, { target: { value: 'New Student' } });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(mocks.queue).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'New Student', offset: 0 })));
    await screen.findByRole('article');
    expect(screen.getByRole('tab', { name: 'To prepare 8' })).toBeInTheDocument();
  });

  it('changes collection month independently of the displayed lesson coverage', async () => {
    show();
    await screen.findByRole('article');
    fireEvent.change(screen.getByLabelText('Collection month'), { target: { value: '2026-12' } });
    await waitFor(() => expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ collection_month: '2026-12', offset: 0 })));
    expect(screen.getByLabelText('Collection month')).toHaveValue('2026-12');
  });

  it('isolates branch and staff scope before an old request resolves', async () => {
    let resolve!: (value: BillingQueueResponse) => void;
    mocks.queue.mockImplementationOnce(() => new Promise<BillingQueueResponse>(done => { resolve = done; })).mockResolvedValue(response([]));
    const { rerender } = show();
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    mocks.location.mockReturnValue({ selectedLocation: 'MSB' });
    mocks.auth.mockReturnValue({ user: { id: 2 }, canViewAdminPages: true, effectiveRole: 'Supervisor', isReadOnly: true });
    rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    await screen.findByText('There are no enrollment tasks for this collection month.');
    await act(async () => resolve(response()));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ location: 'MSB' }));
  });

  it('does not reopen a dismissed workspace when returning to an earlier branch', async () => {
    const view = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Review draft' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    mocks.location.mockReturnValue({ selectedLocation: 'MSB' });
    view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.queue).toHaveBeenLastCalledWith(expect.objectContaining({ location: 'MSB' })));
    mocks.location.mockReturnValue({ selectedLocation: 'MSA' });
    view.rerender(<BillingRenewalQueue onShowLegacy={vi.fn()} onShowTaught={vi.fn()} />);
    await screen.findByRole('article');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps legacy and taught entry points explicit and refreshes reminder counts', async () => {
    const onShowLegacy = vi.fn(); const onShowTaught = vi.fn();
    show({ onShowLegacy, onShowTaught });
    await screen.findByRole('article');
    fireEvent.click(screen.getByRole('button', { name: 'Earlier enrollments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Taught but not in CSM yet 3' }));
    expect(onShowLegacy).toHaveBeenCalledOnce(); expect(onShowTaught).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh renewals' }));
    await waitFor(() => expect(mocks.queue).toHaveBeenCalledTimes(2));
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it('keeps current cards visible during a background refresh', async () => {
    show();
    const card = await screen.findByRole('article');
    let resolve!: (value: BillingQueueResponse) => void;
    mocks.queue.mockImplementationOnce(() => new Promise<BillingQueueResponse>(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh renewals' }));
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    expect(screen.getByRole('article')).toBe(card);
    expect(screen.queryByText('Loading renewals…')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolve(response()));
    expect(screen.getByRole('article')).toBe(card);
  });

  it('keeps a saved attention draft easy to identify and review', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), stage: 'attention', issues: [{ code: 'DRAFT_REVIEW', message: 'Review this saved draft.', period: null }] }]));
    show({ initialStage: 'attention' });
    const card = await screen.findByRole('article');
    expect(within(card).queryByText('Draft saved')).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Review draft' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Review student' })).not.toBeInTheDocument();
  });

  it('preserves links for one combined payment alongside an unlinked enrollment', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), origin: 'payment', stage: 'attention', draft_id: null, payment_id: null, payment_ids: ['combined-1'], enrollment_ids: [7, 8, 9] }]));
    show({ initialStage: 'attention' });
    const card = await screen.findByRole('article');
    fireEvent.click(within(card).getByText('Linked payments and enrollments'));
    fireEvent.click(within(card).getByRole('button', { name: 'Payment 1' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('payment:combined-1');
    expect(within(card).getByRole('link', { name: 'Enrollment #9' })).toHaveAttribute('href', '/enrollments/9');
  });

  it('shows an error rather than an empty queue and retries the same scoped request', async () => {
    mocks.queue.mockRejectedValueOnce(new Error('Connection interrupted.')).mockResolvedValue(response());
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted.');
    expect(screen.queryByText('There are no enrollment tasks for this collection month.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('article');
    expect(mocks.queue).toHaveBeenCalledTimes(2);
  });

  it('keeps both current timetables visible and opens Details before Renew', async () => {
    const current = { enrollment_id: 7, tutor_id: 2, tutor_name: 'Tutor A', weekday: 'Mon', time_slot: '16:45 - 18:15', location: 'MSA', first_lesson_date: '2026-09-07', effective_end_date: '2026-11-30', last_original_date: '2026-11-02', last_paid_original_date: '2026-11-02', payment_status: 'Paid', lesson_count: 6, sessions_remaining: 2, fee_message_marked_sent: true };
    mocks.queue.mockResolvedValue(response([{ ...row(), origin: 'projection', draft_id: null, current_enrollments: [current, { ...current, enrollment_id: 8, weekday: 'Thu', sessions_remaining: 1, effective_end_date: '2026-12-03' }] }]));
    show();
    const card = await screen.findByRole('article');
    expect(within(card).getByText(/Mon 16:45/)).toBeInTheDocument();
    expect(within(card).getByText(/Thu 16:45/)).toBeInTheDocument();
    expect(within(card).getByText('2 sessions remaining')).toBeInTheDocument();
    expect(within(card).getByText('1 session remaining')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Payment method' })).toBeInTheDocument();
    fireEvent.click(within(card).getByText(/Mon 16:45/));
    expect(screen.getByRole('dialog')).toHaveTextContent('Enrollment details');
    fireEvent.click(screen.getByRole('button', { name: 'Close workspace' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Renew' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('renew:next');
  });

  it('shows one expiry and one payment method while leaving repeated enrollment dates in Details', async () => {
    const current = { enrollment_id: 7, tutor_id: 2, tutor_name: 'Tutor A', weekday: 'Fri', time_slot: '16:00 - 17:30', location: 'MSA', first_lesson_date: '2026-09-04', effective_end_date: '2026-11-27', last_original_date: '2026-11-27', last_paid_original_date: '2026-11-27', payment_status: 'Paid', lesson_count: 6, sessions_remaining: 2, fee_message_marked_sent: true };
    mocks.queue.mockResolvedValue(response([{ ...row(), recorded_payment_method: 'manual', current_enrollments: [current] }]));
    show();
    const card = await screen.findByRole('article');
    expect(within(card).getAllByText(/Nov 27, 2026/)).toHaveLength(1);
    expect(within(card).getByText('2 sessions remaining')).toBeInTheDocument();
    expect(within(card).getAllByText('Manual')).toHaveLength(1);
    expect(within(card).queryByText(/Last paid session/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Sep 4, 2026/)).not.toBeInTheDocument();
    expect(within(card).getByText(/Dec 4, 2026 to Dec 31, 2026/)).toBeInTheDocument();
  });

  it('retains distinct paid-through and expiry dates and an initial manual collection for Autopay families', async () => {
    const current = { enrollment_id: 7, tutor_id: 2, tutor_name: 'Tutor A', weekday: 'Fri', time_slot: '16:00 - 17:30', location: 'MSA', first_lesson_date: '2026-09-04', effective_end_date: '2026-11-27', last_original_date: '2026-11-06', last_paid_original_date: '2026-11-06', payment_status: 'Paid', lesson_count: 6, sessions_remaining: 2, fee_message_marked_sent: true };
    mocks.queue.mockResolvedValue(response([{ ...row(), recorded_payment_method: 'autopay', current_enrollments: [current] }]));
    show();
    const card = await screen.findByRole('article');
    expect(within(card).getByText('Last paid session: Nov 6, 2026')).toBeInTheDocument();
    expect(within(card).getByText('Expires Nov 27, 2026')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Payment method' })).toHaveTextContent('Autopay');
    expect(within(card).getByText('Collection')).toHaveTextContent('Collection Manual');
  });

  it.each(['2026-11-14', '2026-11-12'])('does not label a notice date of %s as a future preparation schedule', async prepareOn => {
    mocks.queue.mockResolvedValue(response([{ ...row(), collection: null, first_lesson_date: null, coverage_through: null, lesson_count: null, total_fee: null, amount_basis: 'unknown', due_date: null, prepare_on: prepareOn }]));
    show({ initialStage: 'prepare' });
    const card = await screen.findByRole('article');
    expect(within(card).queryByText(/Prepare from/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/Fee to confirm|Payment date to confirm/)).not.toBeInTheDocument();
  });

  it('shows an actual future notice date before the payment deadline', async () => {
    mocks.queue.mockResolvedValue(response([{ ...row(), prepare_on: '2026-12-12', due_date: '2027-01-08', ready_now: false }]));
    show({ initialStage: 'prepare' });
    const card = await screen.findByRole('article');
    expect(within(card).getByText('Prepare from Dec 12, 2026')).toBeInTheDocument();
    expect(within(card).queryByText(/Pay before/)).not.toBeInTheDocument();
  });

  it('shows only one details action and no repeated coverage/count for an existing unpaid enrollment', async () => {
    const current = { enrollment_id: 7, tutor_id: 2, tutor_name: 'Tutor A', weekday: 'Fri', time_slot: '16:00 - 17:30', location: 'MSA', first_lesson_date: '2026-12-04', effective_end_date: '2026-12-31', last_original_date: '2026-12-31', last_paid_original_date: null, payment_status: 'Pending Payment', lesson_count: 3, sessions_remaining: 3, fee_message_marked_sent: false };
    mocks.queue.mockResolvedValue(response([{ ...row(), origin: 'legacy', stage: 'send', draft_id: null, current_enrollments: [current] }]));
    show();
    const card = await screen.findByRole('article');
    expect(within(card).queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(within(card).queryByText('3 sessions', { exact: true })).not.toBeInTheDocument();
    expect(within(card).queryByText('Payment:')).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Open enrollment' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Enrollment details');
  });

  it('does not fetch renewals without administrative viewing access', () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, canViewAdminPages: false, effectiveRole: 'Tutor' });
    show();
    expect(screen.getByText('Admin access is required to review enrollment renewals.')).toBeInTheDocument();
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
