import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingBatchRenewModal } from './BillingBatchRenewModal';
import type { BillingBatchAction, BillingBatchItem, BillingBatchLoadOptions } from '@/lib/billing-batch';
import type { BillingDraftDetail, BillingDraftReview, BillingOptions, BillingPaymentDetail, BillingQueueRow } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), loadItem: vi.fn(), run: vi.fn(), panel: vi.fn(), push: vi.fn(), changed: vi.fn(), close: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => false }));
vi.mock('@/lib/billing-batch', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/billing-batch')>(),
  loadBillingBatch: mocks.load, loadBillingBatchItem: mocks.loadItem,
  BillingBatchRunner: class { run = mocks.run; },
}));
vi.mock('./BillingRenewalPanel', () => ({ BillingRenewalPanel: (props: {
  onBusyChange: (busy: boolean) => void; onChanged: () => void; onBatchDraftSaved: (draft: BillingDraftDetail) => void;
}) => {
  mocks.panel(props);
  return <section aria-label="Shared renewal editor">
    <button onClick={() => props.onBatchDraftSaved(draft(2))}>Save individual draft</button>
    <button onClick={props.onChanged}>Save individual preferences</button>
    <button onClick={() => props.onBusyChange(true)}>Start individual save</button>
    <button onClick={() => props.onBusyChange(false)}>Finish individual save</button>
  </section>;
} }));

const options: BillingOptions = {
  academic_start: '2026-09-01', first_payment_from: '2026-10-30', regular_end: '2027-07-04', makeup_end: '2027-06-30',
  unit_fee: 400, first_minimum: 6, ordinary_coupon_minimum: 4, policy_version: 'test',
  draft_storage_available: true, workflow_available: true, workflow_writes_available: true,
};
function row(id: number): BillingQueueRow {
  return { key: `student-${id}`, student: { id, student_name: `Student ${id}`, school_student_id: String(id), home_location: 'MSA', grade: 'F1', is_staff_referral: false },
    stage: 'prepare', origin: 'projection', payment_method: 'manual', collection: null,
    first_lesson_date: '2026-12-04', coverage_through: '2026-12-31', lesson_count: 3, total_fee: 1200,
    amount_basis: 'tuition_only', prepare_on: '2026-11-12', due_date: '2026-12-04', overdue: false, ready_now: true,
    draft_id: null, payment_id: null, enrollment_ids: [id * 10], payment_ids: [], issues: [], note: '', action_url: `/billing/students/${id}` };
}
function review(id: number): BillingDraftReview {
  return { student: row(id).student, source_fingerprint: `source-${id}`, evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'test',
    scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', location: 'MSA', time_slot: '16:45 - 18:15' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
    basis: 'include_pending', selected_enrollment_ids: [id * 10], confirmed_checks: [], review_hash: `review-${id}`, issues: [],
    message: { template_version: 'test', zh: 'Synthetic fee message', en: 'Synthetic fee message', blocked_reasons: [] },
    period: { number: 1, kind: 'transition', explanation: '', coverage_from: '2026-12-04', coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-18',
      lesson_count: 3, counts_by_month: [{ month: '2026-12', lessons: 3 }], counts_by_slot: [3], lessons: [{ date: '2026-12-04', weekday: 'Fri', slot: 0, location: 'MSA', time_slot: '16:45 - 18:15', holiday_exception: false }],
      gross_tuition: 1200, deductions: [], tuition_after_deductions: 1200, materials_fee: 0, total_fee: 1200, adjustment_reason: null, requires_review: false,
      collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', due_before_lesson: '2026-12-04', debit_from: null, debit_to: null, gap_min_days: null, gap_max_days: null } } };
}
function item(id: number): BillingBatchItem {
  const reviewed = review(id);
  return { row: row(id), context: null, review: reviewed,
    request: { scenario: reviewed.scenario, basis: 'include_pending', selected_enrollment_ids: [id * 10], expected_source_fingerprint: reviewed.source_fingerprint, period_number: 1, confirmed_checks: [] },
    draft: null, preferences: { student_id: id, payment_method: 'manual', mandate_ready: false, version: 2, updated_at: null }, reasons: [], creationReasons: [] };
}
function draft(id: number): BillingDraftDetail {
  return { id: `draft-${id}`, student_id: id, revision: 1, current_revision: 1, review: review(id), note: null, created_at: '2026-11-12', created_by_name: 'Admin', can_copy: true, stale_reasons: [], history: [] };
}
function payment(id: number): BillingPaymentDetail {
  return { id: `payment-${id}`, student_id: id, version: 1, status: 'Pending Payment', review: review(id), lines: [],
    created_at: '2026-11-12', sent_at: null, sent_language: null, paid_at: null, payment_date: null, received_method: null,
    receipt_reference: null, coupon_status: 'none', note: null, can_copy: true, review_issues: [], history: [] };
}
function outcome(value: BillingBatchItem, action: BillingBatchAction): BillingBatchItem {
  return { ...value, draft: draft(value.row.student.id), outcome: action === 'save'
    ? { action, kind: 'saved', text: 'Draft saved', retryable: false }
    : { action, kind: 'created', text: 'Enrollment created', retryable: false, payment: payment(value.row.student.id) } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
function show(rows = [row(10), row(2)], capabilities = options) {
  return render(<BillingBatchRenewModal rows={rows} options={capabilities} trigger={createRef()} onClose={mocks.close} onChanged={mocks.changed} />);
}
async function ready() {
  await waitFor(() => expect(screen.queryByText(/Checking renewals:/)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
}
function acknowledge() { fireEvent.click(screen.getByRole('checkbox', { name: 'I checked the selected session dates and total fees.' })); }
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: false });
  mocks.load.mockImplementation(async (rows: BillingQueueRow[], _options: BillingBatchLoadOptions, callback: (value: BillingBatchItem) => void) => { rows.forEach(row => callback(item(row.student.id))); });
  mocks.loadItem.mockImplementation(async (row: BillingQueueRow, options: BillingBatchLoadOptions) => ({ ...item(row.student.id), draft: options.draft ?? (row.draft_id ? draft(row.student.id) : null) }));
  mocks.run.mockImplementation(async (value: BillingBatchItem, action: BillingBatchAction) => outcome(value, action));
});

describe('batch renewal comparison', () => {
  it('orders students by school ID and keeps twice-weekly lessons in one selected payment', async () => {
    mocks.load.mockImplementation(async (_rows: BillingQueueRow[], _options: BillingBatchLoadOptions, callback: (value: BillingBatchItem) => void) => {
      const twiceWeekly = item(2);
      twiceWeekly.review!.period.lesson_count = 7; twiceWeekly.review!.period.counts_by_slot = [3, 4];
      twiceWeekly.review!.scenario.payment_method = 'autopay';
      callback(item(10)); callback(twiceWeekly);
    });
    show(); await ready();
    expect(within(screen.getByRole('region', { name: 'Ready renewals' })).getAllByRole('article').map(row => row.getAttribute('aria-label'))).toEqual(['Renewal for Student 2', 'Renewal for Student 10']);
    const combined = screen.getByRole('article', { name: 'Renewal for Student 2' });
    expect(within(combined).getByText('7 sessions · 2 classes')).toBeVisible();
    expect(within(combined).getByText('Autopay')).toBeVisible();
    expect(within(combined).getByText('This payment')).toBeVisible();
    expect(within(combined).getByText('Manual')).toBeVisible();
    expect(within(combined).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Create selected' })).toBeDisabled();
    acknowledge();
    expect(screen.getByRole('button', { name: 'Create selected' })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 10' }));
    expect(screen.getByRole('button', { name: 'Create selected' })).toBeDisabled();
  });

  it('keeps source facts in Needs review and exposes full reasons only in Details', async () => {
    const blocked = item(2); blocked.reasons = ['Choose a payment plan.', 'Check the past session dates.', 'Review available coupons.'];
    mocks.load.mockImplementation(async (_rows: BillingQueueRow[], _options: BillingBatchLoadOptions, callback: (value: BillingBatchItem) => void) => callback(blocked));
    show([row(2)]); await ready();
    expect(screen.queryByRole('checkbox', { name: 'Select Student 2' })).not.toBeInTheDocument();
    expect(screen.getByText('Choose a payment plan.')).toBeVisible();
    expect(screen.getByText('+2 checks')).toBeVisible();
    expect(screen.queryByText('Check the past session dates.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Check the past session dates.')).toBeVisible();
    expect(screen.getByText('Review available coupons.')).toBeVisible();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('allows optional draft saving while enrollment creation is disabled', async () => {
    show([row(2)], { ...options, workflow_available: false, workflow_writes_available: false }); await ready();
    expect(mocks.load).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ workflowAvailable: false }), expect.any(Function));
    expect(screen.getByText('Enrollment creation is not enabled yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create selected' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'I checked the selected session dates and total fees.' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save drafts' }));
    await screen.findByText('Draft saved');
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ request: expect.objectContaining({ confirmed_checks: [] }) }), 'save', expect.any(AbortSignal));
    expect(mocks.changed).toHaveBeenCalledOnce();
  });

  it('blocks creation for a selected preference mismatch without silently skipping that student', async () => {
    mocks.load.mockImplementation(async (rows: BillingQueueRow[], _options: BillingBatchLoadOptions, callback: (value: BillingBatchItem) => void) => rows.forEach(row => callback({ ...item(row.student.id), creationReasons: row.student.id === 2 ? ['The preview differs from the saved payment plan.'] : [] })));
    show(); await ready();
    expect(screen.getByRole('button', { name: 'Save drafts' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create selected' })).toBeDisabled();
    expect(screen.getByText('Check the payment settings for the selected students before creating enrollments.')).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Student 2' }));
    acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Create selected' }));
    await screen.findByRole('region', { name: 'Created renewals' });
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ row: expect.objectContaining({ student: expect.objectContaining({ id: 10 }) }) }), 'create', expect.any(AbortSignal));
  });

  it('holds the modal open during writes and rejects synchronous duplicate clicks', async () => {
    const pending = deferred<BillingBatchItem>();
    mocks.run.mockReturnValueOnce(pending.promise);
    show([row(2)]); await ready(); acknowledge();
    const button = screen.getByRole('button', { name: 'Create selected' });
    act(() => { button.click(); button.click(); });
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => pending.resolve(outcome(item(2), 'create')));
    expect(screen.getByRole('link', { name: 'Open payment' })).toHaveAttribute('href', '/billing/students/2?view=payments&payment=payment-2');
    expect(screen.getByRole('heading', { name: 'Batch renewal results' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('reports partial success and retries only the unresolved original action', async () => {
    mocks.run.mockImplementationOnce(async value => outcome(value, 'create')).mockImplementationOnce(async value => ({
      ...value, draft: draft(value.row.student.id), outcome: { action: 'create', kind: 'error', text: 'Connection lost.', retryable: true },
    })).mockImplementation(async value => outcome(value, 'create'));
    show(); await ready(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Create selected' }));
    const retry = await screen.findByRole('button', { name: 'Retry creation' });
    expect(screen.getByRole('region', { name: 'Created renewals' })).toHaveTextContent('Student 2');
    const unresolved = screen.getByRole('article', { name: 'Renewal for Student 10' });
    expect(within(unresolved).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(unresolved).queryByRole('button', { name: 'Recheck' })).not.toBeInTheDocument();
    fireEvent.click(within(unresolved).getByRole('button', { name: 'Details' }));
    expect(screen.queryByRole('button', { name: 'Review renewal' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to batch' }));
    expect(within(screen.getByRole('article', { name: 'Renewal for Student 10' })).getByRole('button', { name: 'Details' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: retry.textContent! }));
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Open payment' })).toHaveLength(2));
    expect(mocks.run.mock.calls.map(call => [call[0].row.student.id, call[1]])).toEqual([[2, 'create'], [10, 'create'], [10, 'create']]);
    expect(mocks.loadItem).not.toHaveBeenCalled();
  });

  it('rechecks a definitive failure through its existing saved draft', async () => {
    mocks.run.mockImplementation(async value => ({ ...value, draft: draft(2), outcome: { action: 'create', kind: 'error', text: 'Records changed.', retryable: false } }));
    show([row(2)]); await ready(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Create selected' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recheck' }));
    await waitFor(() => expect(mocks.loadItem).toHaveBeenCalledWith(expect.objectContaining({ draft_id: 'draft-2' }), expect.objectContaining({ signal: expect.any(AbortSignal) })));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Select Student 2' })).not.toBeChecked());
  });

  it('uses the shared editor and adopts the exact individually saved draft in the batch', async () => {
    show([row(2)]); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByRole('heading', { name: 'Student 2' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Review renewal' }));
    expect(screen.getByRole('region', { name: 'Shared renewal editor' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save individual draft' }));
    await waitFor(() => expect(mocks.loadItem).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ draft: expect.objectContaining({ id: 'draft-2' }) })));
    await waitFor(() => expect(screen.queryByText('Refreshing renewal…')).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Shared renewal editor' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Student 2' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Review renewal' }));
    expect(mocks.panel).toHaveBeenLastCalledWith(expect.objectContaining({ initialAction: { kind: 'draft', id: 'draft-2' } }));
  });

  it('keeps the individual editor mounted while saved preferences refresh the comparison', async () => {
    const pending = deferred<BillingBatchItem>(); mocks.loadItem.mockReturnValue(pending.promise);
    show([row(2)]); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review renewal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save individual preferences' }));
    expect(screen.getByRole('region', { name: 'Shared renewal editor' })).toBeVisible();
    await act(async () => pending.resolve(item(2)));
    expect(screen.getByRole('region', { name: 'Shared renewal editor' })).toBeVisible();
  });

  it('ignores an older recheck when a newer individual change completes first', async () => {
    const older = deferred<BillingBatchItem>(); const newer = deferred<BillingBatchItem>();
    mocks.loadItem.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    show([row(2)]); await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review renewal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save individual preferences' }));
    const signal = mocks.loadItem.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'Save individual preferences' }));
    expect(signal.aborted).toBe(true);
    await act(async () => newer.resolve({ ...item(2), reasons: ['Current source needs review.'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to batch' }));
    await act(async () => older.resolve(item(2)));
    expect(screen.getByRole('region', { name: 'Renewals needing review' })).toHaveTextContent('Current source needs review.');
    expect(screen.queryByRole('checkbox', { name: 'Select Student 2' })).not.toBeInTheDocument();
  });

  it('does not present discarded or confirmed drafts as saved work to create', async () => {
    const confirmed = { ...draft(2), confirmed_payment_id: 'already-created' };
    const discarded = { ...draft(10), state: 'discarded' as const };
    mocks.load.mockImplementation(async (_rows: BillingQueueRow[], _options: BillingBatchLoadOptions, callback: (value: BillingBatchItem) => void) => {
      callback({ ...item(2), draft: confirmed, reasons: ['Enrollments have already been created. Open the payment.'] });
      callback({ ...item(10), draft: discarded, reasons: ['This draft was discarded.'] });
    });
    show(); await ready();
    expect(screen.queryByText('Draft saved')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Select Student/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open payment' })).toHaveAttribute('href', '/billing/students/2?view=payments&payment=already-created');
  });

  it('blocks all write actions under read-only access and isolates a changed staff scope', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true, isReadOnly: true });
    const view = show([row(2)]); await ready();
    expect(screen.getByRole('button', { name: 'Save drafts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create selected' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.queryByRole('button', { name: 'Review renewal' })).not.toBeInTheDocument();
    mocks.auth.mockReturnValue({ user: { id: 2 }, effectiveRole: 'Tutor', isAdmin: false, isReadOnly: false });
    view.rerender(<BillingBatchRenewModal rows={[row(2)]} options={options} trigger={createRef()} onClose={mocks.close} onChanged={mocks.changed} />);
    await waitFor(() => expect(screen.getByText('An admin can prepare batch renewals.')).toBeVisible());
    expect(screen.queryByText('Student 2')).not.toBeInTheDocument();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('aborts a pending write and ignores its late result after the effective staff changes', async () => {
    const pending = deferred<BillingBatchItem>(); mocks.run.mockReturnValueOnce(pending.promise);
    const view = show([row(2)]); await ready(); acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Create selected' }));
    const signal = mocks.run.mock.calls[0][2] as AbortSignal;
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false, isImpersonating: true, impersonatedTutor: { id: 8 } });
    view.rerender(<BillingBatchRenewModal rows={[row(2)]} options={options} trigger={createRef()} onClose={mocks.close} onChanged={mocks.changed} />);
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(outcome(item(2), 'create')));
    expect(screen.queryByRole('link', { name: 'Open payment' })).not.toBeInTheDocument();
    expect(mocks.changed).not.toHaveBeenCalled();
  });
});
