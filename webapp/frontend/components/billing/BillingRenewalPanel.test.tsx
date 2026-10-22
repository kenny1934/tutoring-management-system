import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BillingDraftDetail, BillingPreviewRequest, BillingQueueRow, StudentBillingContext } from '@/types/billing';
import { BillingRenewalPanel } from './BillingRenewalPanel';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), options: vi.fn(), context: vi.fn(), preview: vi.fn(), drafts: vi.fn(), payments: vi.fn(), changed: vi.fn(), action: vi.fn(), busy: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { options: mocks.options, studentContext: mocks.context } }));
vi.mock('@/lib/hooks', () => ({ invalidateCaches: mocks.invalidate }));
vi.mock('./BillingPaymentSettings', () => ({ BillingPaymentSettings: ({ onPreviewMethod }: { onPreviewMethod?: (method: 'manual' | null) => void }) => <><button onClick={() => onPreviewMethod?.('manual')}>Preview Manual</button><button onClick={() => onPreviewMethod?.(null)}>Clear preview plan</button></> }));
vi.mock('./BillingPreview', () => ({ BillingPreview: (props: { initialRequest: BillingPreviewRequest; onDraftSaved: (detail: BillingDraftDetail) => void }) => { mocks.preview(props); return <div aria-label="Focused calculation"><p>{props.initialRequest.payment_method}</p><button onClick={() => props.onDraftSaved(saved())}>Save exact draft</button></div>; } }));
vi.mock('./BillingSavedDrafts', () => ({ BillingSavedDrafts: (props: { initialDraftId: string; onRevise: (draft: BillingDraftDetail) => void; onConfirmed: (payment: { id: string }) => void }) => { mocks.drafts(props); return <div><p>Saved detail {props.initialDraftId}</p><button onClick={() => props.onRevise(saved())}>Revise exact draft</button><button onClick={() => props.onConfirmed({ id: 'created-payment' })}>Complete confirmation</button></div>; } }));
vi.mock('./BillingPayments', () => ({ BillingPayments: (props: { initialPaymentId: string }) => { mocks.payments(props); return <p>Payment detail {props.initialPaymentId}</p>; } }));

const student = { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', is_staff_referral: false };
const scenario: BillingPreviewRequest = { mode: 'transition', payment_method: 'manual', first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', location: 'MSA' }, { weekday: 'Thu', location: 'MSA' }], materials_fee: 0, trial_deduction: false, mandate_ready: false };
function saved(): BillingDraftDetail {
  return { id: 'exact-draft', student_id: 4, revision: 3, current_revision: 3, created_at: '2026-11-14', created_by_name: 'Admin', can_copy: true, stale_reasons: [], note: null, history: [], review: {
    student, scenario: { ...scenario, coupon: { kind: 'ordinary', value: 300, verified: true, expires_on: null, available_count: 1, combine_next_month: false } }, basis: 'paid_only', selected_enrollment_ids: [10, 11], source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review', confirmed_checks: [], issues: [], message: { template_version: 'v1', zh: 'Fee message', en: 'Fee message', blocked_reasons: [] },
    period: { number: 3, kind: 'transition', explanation: '', coverage_from: '2026-12-01', coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-31', lesson_count: 7, counts_by_month: [{ month: '2026-12', lessons: 7 }], counts_by_slot: [3, 4], lessons: [], gross_tuition: 2800, deductions: [], tuition_after_deductions: 2800, materials_fee: 0, total_fee: 2800, adjustment_reason: null, requires_review: false, collection: { method: 'manual', notice_from: null, notice_to: null, due_before_lesson: '2026-12-04', debit_from: null, debit_to: null, gap_min_days: null, gap_max_days: null } },
  } };
}
function context(): StudentBillingContext {
  return { student, as_of: '2026-11-14', basis: 'include_pending', source_blocks: [], slot_candidates: [], selected_enrollment_ids: [10, 11], upcoming_original_count: 2, pending_bill_count: 0, sent_pending_bill_count: 0, pending_makeup_count: 0, coupon_snapshot: null, suggested_request: scenario, issues: [], requires_review: false, source_fingerprint: 'source', recorded_payment_method: null, mandate_ready: null };
}
function row(): BillingQueueRow {
  return { key: 'student-4', student, origin: 'projection', stage: 'prepare', payment_method: null, collection: null, first_lesson_date: null, coverage_through: null, lesson_count: null, total_fee: null, amount_basis: 'unknown', prepare_on: null, due_date: null, overdue: false, ready_now: true, draft_id: null, payment_id: null, enrollment_ids: [10, 11], payment_ids: [], issues: [], note: '', action_url: '/billing/students/4' };
}
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false, shouldRetryOnError: false }}>{children}</SWRConfig>; }
function show(initialAction: Parameters<typeof BillingRenewalPanel>[0]['initialAction'] = { kind: 'renew' }) { return render(<BillingRenewalPanel row={row()} initialAction={initialAction} onChanged={mocks.changed} onOpenEnrollment={vi.fn()} onActionChange={mocks.action} onBusyChange={mocks.busy} />, { wrapper: Wrapper }); }
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true });
  mocks.options.mockResolvedValue({ draft_storage_available: true, workflow_available: true, workflow_writes_available: true, preferences_writes_available: true });
  mocks.context.mockResolvedValue(context());
});

describe('renewal panel handoffs', () => {
  it('uses the queue coverage basis and waits for an explicit unknown-method choice', async () => {
    show();
    await screen.findByText('Choose Manual or Autopay to preview the next enrollment.');
    expect(mocks.context).toHaveBeenCalledWith(4, { basis: 'include_pending', tutor_id: undefined, selected_enrollment_ids: undefined });
    expect(mocks.preview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Manual' }));
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ focused: true, focusedPeriodNumber: 1, draftContext: expect.objectContaining({ basis: 'include_pending', selectedEnrollmentIds: [10, 11] }) }));
  });

  it('keeps an explicitly cleared preview unknown even when the recorded plan is Manual', async () => {
    mocks.context.mockResolvedValue({ ...context(), recorded_payment_method: 'manual' });
    show();
    await screen.findByLabelText('Focused calculation');
    fireEvent.click(screen.getByRole('button', { name: 'Clear preview plan' }));
    expect(screen.queryByLabelText('Focused calculation')).not.toBeInTheDocument();
    expect(screen.getByText('Choose Manual or Autopay to preview the next enrollment.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Manual' }));
    expect(screen.getByLabelText('Focused calculation')).toBeVisible();
  });

  it('hands the exact saved draft to inline confirmation and then its exact payment', async () => {
    mocks.context.mockResolvedValue({ ...context(), recorded_payment_method: 'manual' });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Save exact draft' }));
    await screen.findByText('Saved detail exact-draft');
    expect(mocks.drafts).toHaveBeenLastCalledWith(expect.objectContaining({ inline: true, initialDraftId: 'exact-draft', savedRevision: 3 }));
    expect(mocks.action).toHaveBeenLastCalledWith({ kind: 'draft', id: 'exact-draft' });
    fireEvent.click(screen.getByRole('button', { name: 'Complete confirmation' }));
    await screen.findByText('Payment detail created-payment');
    expect(mocks.payments).toHaveBeenLastCalledWith(expect.objectContaining({ inline: true, initialPaymentId: 'created-payment' }));
    expect(mocks.action).toHaveBeenLastCalledWith({ kind: 'payment', id: 'created-payment' });
    expect(mocks.invalidate).toHaveBeenCalledWith('enrollments', { studentId: 4 });
  });

  it('returns an edited draft to its batch without opening another saved-draft page', async () => {
    mocks.context.mockResolvedValue({ ...context(), recorded_payment_method: 'manual' });
    const onBatchDraftSaved = vi.fn();
    render(<BillingRenewalPanel row={row()} initialAction={{ kind: 'renew' }} onChanged={mocks.changed} onOpenEnrollment={vi.fn()}
      onActionChange={mocks.action} onBusyChange={mocks.busy} onBatchDraftSaved={onBatchDraftSaved} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Save exact draft' }));
    expect(onBatchDraftSaved).toHaveBeenCalledWith(saved());
    expect(mocks.drafts).not.toHaveBeenCalled();
    expect(mocks.action).toHaveBeenLastCalledWith({ kind: 'renew' });
    expect(screen.getByLabelText('Focused calculation')).toBeInTheDocument();
  });

  it('preserves a saved revision’s exact period and requires fresh coupon verification', async () => {
    show({ kind: 'draft', id: 'exact-draft' });
    fireEvent.click(await screen.findByRole('button', { name: 'Revise exact draft' }));
    await screen.findByLabelText('Focused calculation');
    expect(mocks.context).toHaveBeenLastCalledWith(4, expect.objectContaining({ basis: 'paid_only', selected_enrollment_ids: [10, 11] }));
    expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({ focusedPeriodNumber: 3, revisionTarget: { id: 'exact-draft', current_revision: 3 }, initialRequest: expect.objectContaining({ coupon: expect.objectContaining({ verified: false }) }) }));
  });

  it('disables both settings and calculation controls during a mutation', async () => {
    mocks.context.mockResolvedValue({ ...context(), recorded_payment_method: 'manual' });
    show();
    await screen.findByLabelText('Focused calculation');
    const onBusyChange = mocks.preview.mock.calls.at(-1)![0].onBusyChange;
    act(() => onBusyChange(true));
    expect(screen.getByRole('button', { name: 'Preview Manual' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save exact draft' })).toBeDisabled();
    expect(mocks.busy).toHaveBeenLastCalledWith(true);
    act(() => onBusyChange(false));
    expect(screen.getByRole('button', { name: 'Save exact draft' })).toBeEnabled();
  });

  it('distinguishes failed settings from unavailable payment storage', async () => {
    mocks.options.mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValue({ workflow_available: false });
    show({ kind: 'payment', id: 'exact-payment' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load renewal settings.');
    expect(screen.queryByText('Payment records are not available right now.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry settings' }));
    await waitFor(() => expect(screen.getByText('Payment records are not available right now.')).toBeInTheDocument());
    expect(mocks.payments).not.toHaveBeenCalled();
  });
});
