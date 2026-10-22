import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { BillingRoster } from './BillingRoster';
import { StudentBillingJourney } from './StudentBillingJourney';
import type { BillingDraftDetail, BillingPaymentDetail, BillingRosterResponse, StudentBillingContext } from '@/types/billing';

const mocks = vi.hoisted(() => ({ students: vi.fn(), drafts: vi.fn(), draft: vi.fn(), context: vi.fn(), auth: vi.fn(), params: vi.fn(), options: vi.fn(), previewProps: vi.fn(), paymentProps: vi.fn(), settingsProps: vi.fn(), savedDraftProps: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: mocks.params }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: 'MSA' }) }));
vi.mock('@/lib/hooks', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/hooks')>(), usePageTitle: vi.fn() }));
vi.mock('@/lib/hooks/useSummerPreGradeWindow', () => ({ useSummerPreGradeWindow: () => ({ start: null, end: null }) }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { students: mocks.students, studentDrafts: mocks.drafts, draft: mocks.draft, studentContext: mocks.context, options: mocks.options } }));
vi.mock('./BillingSavedDrafts', () => ({ BillingSavedDrafts: (props: { onRevise: (draft: BillingDraftDetail) => void; workflowAvailable?: boolean; onConfirmed: (payment: BillingPaymentDetail) => void }) => { mocks.savedDraftProps(props); return <><button onClick={() => props.onRevise(savedDraft())}>Revise synthetic draft</button>{props.workflowAvailable && <button onClick={() => props.onConfirmed({ id: 'new-payment' } as BillingPaymentDetail)}>Confirm synthetic draft</button>}</>; } }));
vi.mock('./BillingPaymentSettings', () => ({ BillingPaymentSettings: (props: unknown) => { mocks.settingsProps(props); return <div>Recorded payment settings</div>; } }));
vi.mock('./BillingPayments', () => ({ BillingPayments: (props: unknown) => { mocks.paymentProps(props); return <div>Confirmed student payments</div>; } }));
vi.mock('@/components/layout/PageSurface', () => ({ PageSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./BillingPreview', () => ({ BillingPreview: function MockBillingPreview(props: {
  initialRequest: { first_lesson_date: string };
  contextIssues?: unknown[];
  editorContent?: ReactNode;
  couponSnapshot?: StudentBillingContext['coupon_snapshot'];
  sourceLoading?: boolean;
  sourceKey?: string;
  sourceError?: string;
  onRetrySource?: () => void;
  draftContext?: unknown;
  revisionTarget?: unknown;
  onDraftSaved?: (draft: BillingDraftDetail) => void;
  onCancelRevision?: () => void;
}) {
  const { initialRequest, contextIssues = [], editorContent, couponSnapshot, sourceLoading = false, sourceKey, sourceError, onRetrySource } = props;
  mocks.previewProps(props);
  const [editorOpen, setEditorOpen] = useState(false);
  return <>{!sourceLoading && <input aria-label="Scenario start" data-source-checks={contextIssues.length} data-source-key={sourceKey} data-coupon-count={couponSnapshot?.remaining_count} defaultValue={initialRequest.first_lesson_date} />}
    <button onClick={() => setEditorOpen(true)}>Edit preview</button>
    {editorOpen && <section aria-label="Mock preview editor"><input aria-label="Mock discount" defaultValue="none" />{sourceError && <div role="alert">{sourceError}<button onClick={onRetrySource}>Retry</button></div>}{editorContent}</section>}</>;
} }));

function context(): StudentBillingContext {
  return {
    student: { id: 12, student_name: 'Synthetic Student', school_student_id: 'S012', home_location: 'MSA', grade: 'F2', is_staff_referral: false },
    as_of: '2026-10-17', basis: 'paid_only', upcoming_original_count: 4, pending_bill_count: 1,
    sent_pending_bill_count: 1, pending_makeup_count: 2, recorded_payment_method: null, mandate_ready: null,
    selected_enrollment_ids: [101], source_fingerprint: 'source-v1', requires_review: false, issues: [],
    coupon_snapshot: { remaining_count: 2, cached_value: '300.00', synced_at_utc: '2026-10-10T12:00:00', verified: false },
    slot_candidates: [
      { enrollment_id: 101, weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', tutor_name: 'Synthetic Tutor', selected: true, last_paid_original_date: '2026-11-03', last_retained_original_date: '2026-11-03', first_uncovered_date: '2026-11-10' },
      { enrollment_id: 102, weekday: 'Thu', time_slot: '16:45 - 18:15', location: 'MSA', tutor_name: 'Synthetic Tutor', selected: false, last_paid_original_date: '2026-11-05', last_retained_original_date: '2026-11-05', first_uncovered_date: '2026-11-12' },
    ],
    source_blocks: [{ enrollment_id: 101, tutor_id: 7, tutor_name: 'Synthetic Tutor', weekday: 'Tue', time_slot: '16:45 - 18:15', location: 'MSA', first_lesson_date: '2026-09-29', lessons_recorded: 6, payment_status: 'Pending Payment', payment_date: null, fee_message_marked_sent: true, renewed_from_enrollment_id: null, is_new_student: false, originals: [{ id: 201, date: '2026-11-03', status: 'Scheduled', holiday: false }], last_original_date: '2026-11-03', makeup_dates: ['2026-12-08'] }],
    suggested_request: { first_lesson_date: '2026-11-10', slots: [{ weekday: 'Tue', covered_through: '2026-11-03' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
  };
}

function roster(): BillingRosterResponse {
  const source = context();
  return {
    as_of: source.as_of, basis: 'paid_only', total: 1, offset: 0, limit: 25,
    rows: [{ student: source.student, upcoming_original_count: 4, pending_bill_count: 1, sent_pending_bill_count: 1,
      pending_makeup_count: 2, slot_candidate_count: 2, selected_slot_count: 1,
      last_paid_original_date: '2026-11-03', first_uncovered_date: '2026-11-10', issues: [], requires_review: false,
      source_fingerprint: 'source-v1', next_autopay: null,
      next_manual: { lesson_count: 8, gross_tuition: 3200, first_lesson_date: '2026-11-10', coverage_through: '2026-12-31',
        collection: { method: 'manual', due_before_lesson: '2026-11-10', notice_from: null, notice_to: null, debit_from: null, debit_to: null, gap_min_days: null, gap_max_days: null } },
    }],
  };
}

function savedDraft(): BillingDraftDetail {
  const scenario = context().suggested_request!;
  return { id: 'synthetic-draft', revision: 3, current_revision: 3,
    review: { basis: 'include_pending', selected_enrollment_ids: [102], scenario: { ...scenario,
      first_lesson_date: '2026-11-12', slots: [{ weekday: 'Thu', time_slot: '16:45 - 18:15', location: 'MSA', covered_through: '2026-11-05' }],
      coupon: { kind: 'ordinary', value: 300, verified: true, expires_on: '2027-01-31', available_count: 2, combine_next_month: false } } },
  } as BillingDraftDetail;
}

function show(component: React.ReactNode) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>{component}</SWRConfig>);
}

beforeEach(() => {
  mocks.params.mockReturnValue(new URLSearchParams());
  mocks.auth.mockReturnValue({ user: { id: 7 }, isLoading: false, isAdmin: true, isGuest: false, effectiveRole: 'Admin', isImpersonating: false });
  mocks.students.mockReset().mockResolvedValue(roster());
  mocks.drafts.mockReset().mockResolvedValue([]);
  mocks.draft.mockReset().mockImplementation(async (id: string) => ({ ...savedDraft(), id, student_id: 12 }));
  mocks.context.mockReset().mockResolvedValue(context());
  mocks.options.mockReset().mockResolvedValue({ draft_storage_available: false });
  mocks.previewProps.mockClear();
  mocks.paymentProps.mockClear();
  mocks.savedDraftProps.mockClear();
});

describe('billing source review', () => {
  it('allows preference recording independently of financial workflow writes', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true, workflow_available: true, workflow_writes_available: false, preferences_writes_available: true });
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Recorded payment settings');
    await waitFor(() => expect(mocks.settingsProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ studentId: 12, storageAvailable: true, canWrite: true })));
  });

  it('opens the exact draft selected from the renewal queue and responds to a new draft link', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true });
    mocks.params.mockReturnValue(new URLSearchParams('view=drafts&draft=queue-draft-1'));
    const { rerender } = show(<StudentBillingJourney studentId={12} />);
    const tab = await screen.findByRole('tab', { name: /Saved drafts/ });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(mocks.savedDraftProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ initialDraftId: 'queue-draft-1' }));
    mocks.params.mockReturnValue(new URLSearchParams('view=drafts&draft=queue-draft-2'));
    rerender(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}><StudentBillingJourney studentId={12} /></SWRConfig>);
    await waitFor(() => expect(mocks.savedDraftProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ initialDraftId: 'queue-draft-2' })));
  });

  it('opens existing enrollments from an attention row without requiring workflow storage', async () => {
    mocks.params.mockReturnValue(new URLSearchParams('view=enrollments'));
    show(<StudentBillingJourney studentId={12} />);
    expect(await screen.findByRole('tab', { name: /Existing enrollments/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('article', { name: 'Recorded enrollment 101' })).toBeVisible();
    expect(mocks.paymentProps).not.toHaveBeenCalled();
  });

  it('switches to the confirmed payment when an already-saved draft opens it', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true, workflow_available: true, workflow_writes_available: false });
    show(<StudentBillingJourney studentId={12} />);
    fireEvent.click(await screen.findByRole('tab', { name: /^Saved drafts\b/ }));
    act(() => mocks.savedDraftProps.mock.lastCall?.[0].onOpenPayment('existing-payment'));
    expect(screen.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
    expect(mocks.paymentProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ initialPaymentId: 'existing-payment', canWrite: false }));
  });

  it('clears the saved notice after its draft is discarded', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true });
    mocks.drafts.mockResolvedValue([{ id: 'synthetic-draft', student_id: 12, state: 'active' }]);
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByRole('tab', { name: 'Saved drafts 1' });
    act(() => mocks.previewProps.mock.lastCall?.[0].onDraftSaved(savedDraft()));
    await screen.findByRole('tab', { name: 'Saved drafts 1' });
    const props = mocks.savedDraftProps.mock.lastCall?.[0];
    act(() => { props.onDraftClosed(); props.onDiscarded('synthetic-draft'); });
    expect(mocks.savedDraftProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ initialDraftId: null, savedRevision: undefined }));
    expect(screen.queryByRole('button', { name: 'Open draft' })).not.toBeInTheDocument();
    await screen.findByRole('tab', { name: 'Saved drafts 0' });
  });

  it('opens the confirmed payment and refreshes sources after creating a reviewed enrollment', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true, workflow_available: true, workflow_writes_available: true });
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Recorded payment settings');
    fireEvent.click(screen.getByRole('tab', { name: /^Saved drafts\b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm synthetic draft' }));
    expect(screen.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Confirmed student payments')).toBeVisible();
    expect(mocks.paymentProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ studentId: 12, initialPaymentId: 'new-payment' }));
    await waitFor(() => expect(mocks.context).toHaveBeenCalledTimes(2));
  });

  it('opens the payment requested by a legacy enrollment link', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true, workflow_available: true, workflow_writes_available: true });
    mocks.params.mockReturnValue(new URLSearchParams('view=payments&payment=combined-1'));
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Confirmed student payments');
    expect(mocks.paymentProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ initialPaymentId: 'combined-1' }));
    expect(screen.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
  });

  it('binds payment review to the displayed student source without showing unavailable storage', async () => {
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Synthetic Student');
    expect(mocks.previewProps.mock.lastCall?.[0].draftContext).toEqual({ studentId: 12, basis: 'paid_only', selectedEnrollmentIds: [101], sourceFingerprint: 'source-v1' });
    expect(screen.queryByRole('tab', { name: /^Saved drafts\b/ })).not.toBeInTheDocument();
  });

  it('restores a saved revision with its coverage basis and requests fresh KMS verification', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true });
    show(<StudentBillingJourney studentId={12} />);
    const tab = await screen.findByRole('tab', { name: /^Saved drafts\b/ });
    fireEvent.click(tab);
    fireEvent.click(await screen.findByRole('button', { name: 'Revise synthetic draft' }));
    await waitFor(() => expect(mocks.context).toHaveBeenLastCalledWith(12, expect.objectContaining({ basis: 'include_pending', selected_enrollment_ids: [102] })));
    const restored = mocks.previewProps.mock.lastCall?.[0];
    expect(restored.initialRequest.first_lesson_date).toBe('2026-11-12');
    expect(restored.initialRequest.coupon.verified).toBe(false);
    expect(restored.revisionTarget).toEqual({ id: 'synthetic-draft', current_revision: 3 });
    expect(screen.getByRole('tab', { name: 'Payment journey' })).toHaveAttribute('aria-selected', 'true');
    act(() => restored.onCancelRevision());
    await waitFor(() => expect(mocks.previewProps.mock.lastCall?.[0].revisionTarget).toBeUndefined());
    expect(mocks.previewProps.mock.lastCall?.[0].initialRequest.first_lesson_date).toBe('2026-11-10');
  });

  it('opens saved history after a save and includes the third tab in keyboard navigation', async () => {
    mocks.options.mockResolvedValue({ draft_storage_available: true });
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByRole('tab', { name: /^Saved drafts\b/ });
    act(() => mocks.previewProps.mock.lastCall?.[0].onDraftSaved(savedDraft()));
    expect(mocks.savedDraftProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ initialDraftId: 'synthetic-draft', savedRevision: 3, workflowWritesAvailable: false }));
    await screen.findByRole('tab', { name: 'Saved drafts 0' });
    expect(screen.getByRole('tab', { name: /^Saved drafts\b/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Revise synthetic draft' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('tab', { name: /^Saved drafts\b/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Payment journey' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Payment journey' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: /^Saved drafts\b/ })).toHaveFocus();
  });

  it('shows gross projections and pending messages without presenting them as settled payments', async () => {
    show(<BillingRoster />);
    expect(await screen.findByText('MOP 3,200')).toBeInTheDocument();
    expect(screen.getByText('8 sessions')).toBeInTheDocument();
    expect(screen.getByText('1 unpaid')).toBeInTheDocument();
    expect(screen.getByText('1 message sent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Synthetic Student: open payment journey' })).toHaveAttribute('href', '/billing/students/12');
    expect(screen.getByText(/Tuition excludes discounts and materials/)).toBeInTheDocument();
    expect(mocks.students).toHaveBeenCalledWith(expect.objectContaining({ basis: 'paid_only', location: 'MSA' }));
  });

  it('shows all teaching-year students without an upcoming-session filter', async () => {
    show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    expect(screen.queryByLabelText('Students to show')).not.toBeInTheDocument();
    expect(mocks.students.mock.lastCall?.[0]).not.toHaveProperty('upcoming_only');
  });

  it('keeps the selected unpaid-enrollment option when opening a student journey', async () => {
    const view = show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    fireEvent.change(screen.getByLabelText('Start sessions after'), { target: { value: 'include_pending' } });
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ basis: 'include_pending' })));
    await screen.findByText('Synthetic Student');
    for (const link of screen.getAllByRole('link', { name: /open payment journey|Open journey/ })) {
      expect(link).toHaveAttribute('href', '/billing/students/12?basis=include_pending');
    }
    view.unmount();
    mocks.params.mockReturnValue(new URLSearchParams('basis=include_pending'));
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    expect(screen.getByLabelText('Start sessions after')).toHaveValue('include_pending');
    expect(mocks.context).toHaveBeenLastCalledWith(12, expect.objectContaining({ basis: 'include_pending' }));
    expect(screen.getByText('Existing unpaid enrollments still need payment.')).toBeVisible();
  });

  it('passes the impersonated tutor scope to both source endpoints', async () => {
    mocks.auth.mockReturnValue({ user: { id: 99 }, isLoading: false, isGuest: false, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 42 } });
    const view = show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    expect(mocks.students).toHaveBeenCalledWith(expect.objectContaining({ tutor_id: 42 }));
    view.unmount();
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Synthetic Student');
    expect(mocks.context).toHaveBeenCalledWith(12, expect.objectContaining({ tutor_id: 42 }));
  });

  it('hides previous roster rows while a changed coverage assumption is loading', async () => {
    show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    mocks.students.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('Start sessions after'), { target: { value: 'include_pending' } });
    await waitFor(() => expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Loading students');
    expect(screen.getByText(/Existing unpaid enrollments still need payment/)).toBeInTheDocument();
  });

  it('starts at the first roster page when the effective tutor scope changes', async () => {
    mocks.students.mockResolvedValue({ ...roster(), total: 50 });
    const view = show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    mocks.auth.mockReturnValue({ user: { id: 99 }, isLoading: false, isGuest: false, effectiveRole: 'Tutor', isImpersonating: true, impersonatedTutor: { id: 42 } });
    view.rerender(<SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0 }}><BillingRoster /></SWRConfig>);
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, tutor_id: 42 })));
  });

  it('keeps original and makeup dates distinct on the existing enrollments tab', async () => {
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Synthetic Student');
    expect(screen.getByText('Recorded payment settings')).toBeInTheDocument();
    expect(mocks.settingsProps.mock.lastCall?.[0]).toEqual(expect.objectContaining({ storageAvailable: false, canWrite: false, recordedMethod: null, mandateReady: null }));
    expect(screen.queryByLabelText('Coupon records')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Existing enrollments/ }));
    fireEvent.click(screen.getByText('Session dates and payment details'));
    expect(screen.getByText('Makeup dates: Dec 8, 2026.')).toBeInTheDocument();
    expect(screen.getByText(/Makeups do not extend paid tuition coverage/)).toBeInTheDocument();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Message sent')).toBeInTheDocument();
  });

  it('keeps the editor and discount choice while refreshing a changed timetable', async () => {
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByLabelText('Scenario start');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Scenario start'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Mock discount'), { target: { value: 'coupon' } });
    let finish!: (value: StudentBillingContext) => void;
    mocks.context.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(checkboxes[1]);
    await waitFor(() => expect(mocks.context).toHaveBeenLastCalledWith(12, expect.objectContaining({ selected_enrollment_ids: [101, 102] })));
    expect(screen.queryByLabelText('Scenario start')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mock preview editor')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Use Thu/ })).toBeChecked();
    expect(screen.getByLabelText('Mock discount')).toHaveValue('coupon');
    const updated = context();
    updated.selected_enrollment_ids = [101, 102];
    updated.source_fingerprint = 'source-v2';
    await act(async () => finish(updated));
    expect(await screen.findByLabelText('Scenario start')).toHaveValue('2026-11-10');
    expect(screen.getByLabelText('Scenario start')).toHaveAttribute('data-source-key', 'source-v2');
    expect(screen.getByLabelText('Mock discount')).toHaveValue('coupon');
    expect(screen.getByText('Reset timetable')).toBeVisible();
  });

  it('keeps source controls open while the starting enrollment basis changes', async () => {
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByLabelText('Scenario start');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.change(screen.getByLabelText('Mock discount'), { target: { value: 'coupon' } });
    let finish!: (value: StudentBillingContext) => void;
    mocks.context.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('Start sessions after'), { target: { value: 'include_pending' } });
    await waitFor(() => expect(mocks.context).toHaveBeenLastCalledWith(12, expect.objectContaining({ basis: 'include_pending' })));
    expect(screen.getByLabelText('Start sessions after')).toHaveValue('include_pending');
    expect(screen.getByLabelText('Mock preview editor')).toBeVisible();
    expect(screen.queryByLabelText('Scenario start')).not.toBeInTheDocument();
    const updated = context();
    updated.basis = 'include_pending';
    updated.source_fingerprint = 'source-after-pending';
    updated.suggested_request = { ...updated.suggested_request!, first_lesson_date: '2026-12-01' };
    await act(async () => finish(updated));
    expect(await screen.findByLabelText('Scenario start')).toHaveValue('2026-12-01');
    expect(screen.getByLabelText('Mock discount')).toHaveValue('coupon');
    expect(screen.getByLabelText('Start sessions after')).toBeVisible();
  });

  it('preserves editor choices while hiding failed source refreshes and allowing retries', async () => {
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByLabelText('Scenario start');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    fireEvent.change(screen.getByLabelText('Mock discount'), { target: { value: 'staff voucher' } });
    mocks.context.mockRejectedValueOnce(new Error('Source records unavailable.'));
    fireEvent.click(screen.getByText('Refresh records'));
    expect(await within(screen.getByLabelText('Mock preview editor')).findByRole('alert')).toHaveTextContent('Source records unavailable.');
    expect(screen.queryByLabelText('Scenario start')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mock discount')).toHaveValue('staff voucher');
    fireEvent.click(within(screen.getByLabelText('Mock preview editor')).getByText('Retry'));
    expect(await screen.findByLabelText('Scenario start')).toBeInTheDocument();
    expect(screen.getByLabelText('Mock discount')).toHaveValue('staff voucher');
  });

  it('keeps full check explanations collapsed and attaches setup notes to autopay only', async () => {
    const records = roster();
    records.rows[0].source_issues = [{ code: 'MISSING_ORIGINALS', message: 'Synthetic enrollment 101 is missing original session records.', period: null }];
    records.rows[0].method_issues = {
      manual: [],
      autopay: [{ code: 'MANDATE_NOT_READY', message: 'Synthetic autopay setup needs checking before a bank collection.', period: 1 }],
    };
    mocks.students.mockResolvedValue(records);
    show(<BillingRoster />);
    expect((await screen.findAllByText('Check session records'))[0]).toBeVisible();
    expect(screen.getByText('Synthetic enrollment 101 is missing original session records.')).not.toBeVisible();
    const manual = screen.getByLabelText('Manual comparison');
    const autopay = screen.getByLabelText('Autopay comparison');
    expect(within(manual).queryByText(/Check autopay setup/)).not.toBeInTheDocument();
    expect(within(autopay).getByText(/Check autopay setup/)).not.toBeVisible();
    fireEvent.click(within(autopay).getByText(/1 notes?/).closest('summary')!);
    expect(within(autopay).getByText(/Check autopay setup/)).toBeVisible();
    fireEvent.click(screen.getAllByText('Check session records')[0].closest('summary')!);
    expect(screen.getByText('Synthetic enrollment 101 is missing original session records.')).toBeVisible();
  });

  it('labels an initial manual payment honestly inside the autopay comparison', async () => {
    const records = roster();
    records.rows[0].next_autopay = records.rows[0].next_manual;
    mocks.students.mockResolvedValue(records);
    show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    const autopay = screen.getByLabelText('Autopay comparison');
    expect(within(autopay).getByText('Autopay')).toBeVisible();
    expect(within(autopay).getByText('Manual')).toBeVisible();
    expect(within(autopay).getByText('Due before Nov 10, 2026')).toBeVisible();
  });

  it('debounces search, hides stale results immediately and starts the new search on page one', async () => {
    mocks.students.mockResolvedValue({ ...roster(), total: 50 });
    show(<BillingRoster />);
    await screen.findByText('Synthetic Student');
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    await screen.findByText('Synthetic Student');
    const beforeTyping = mocks.students.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'Syn' } });
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    expect(mocks.students).toHaveBeenCalledTimes(beforeTyping);
    fireEvent.change(screen.getByLabelText('Find a student'), { target: { value: 'Synthetic' } });
    await waitFor(() => expect(mocks.students).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, search: 'Synthetic' })));
    expect(mocks.students).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'Syn' }));
  });

  it('uses page tabs and keeps edited preview state when reviewing existing enrollments', async () => {
    const records = context();
    records.issues = [{ code: 'TIMETABLE_CHANGE_REVIEW', message: 'Check the synthetic timetable change.', period: null }];
    mocks.context.mockResolvedValue(records);
    show(<StudentBillingJourney studentId={12} />);
    const preview = await screen.findByLabelText('Scenario start');
    expect(preview).toHaveAttribute('data-source-checks', '1');
    expect(preview).toHaveAttribute('data-coupon-count', '2');
    expect(screen.queryByLabelText('Coupon records')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Start sessions after')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Payment journey' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(preview, { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('tab', { name: /Existing enrollments/ }));
    expect(screen.getByRole('article', { name: 'Recorded enrollment 101' })).toBeVisible();
    expect(preview).not.toBeVisible();
    expect(preview).toBeInTheDocument();
    expect(screen.getByText('Recorded payment settings')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Payment journey' }));
    expect(preview).toBeVisible();
    expect(preview).toHaveValue('2026-12-01');
    expect(screen.getByText('Enrollment #101')).not.toBeVisible();
  });

  it('supports keyboard tab navigation with the corresponding panel relationships', async () => {
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByLabelText('Scenario start');
    const journeyTab = screen.getByRole('tab', { name: 'Payment journey' });
    const enrollmentsTab = screen.getByRole('tab', { name: /Existing enrollments/ });
    journeyTab.focus();
    fireEvent.keyDown(journeyTab, { key: 'ArrowRight' });
    expect(enrollmentsTab).toHaveFocus();
    expect(enrollmentsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', enrollmentsTab.getAttribute('aria-controls'));
    fireEvent.keyDown(enrollmentsTab, { key: 'Home' });
    expect(journeyTab).toHaveFocus();
    expect(journeyTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(journeyTab, { key: 'End' });
    expect(enrollmentsTab).toHaveFocus();
  });

  it('links only the student name to their profile and gives the helper a standard button', async () => {
    const view = show(<BillingRoster />);
    const helper = await screen.findByRole('link', { name: 'Preview enrollment fees' });
    expect(helper).toHaveAttribute('href', '/billing/preview');
    expect(helper).toHaveClass('bg-primary');
    expect(helper.querySelector('svg')).toBeInTheDocument();
    view.unmount();
    show(<StudentBillingJourney studentId={12} />);
    const profile = await screen.findByRole('link', { name: 'Synthetic Student' });
    expect(profile).toHaveAttribute('href', '/students/12');
    expect(profile.querySelector('svg')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Student profile' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link').filter(link => link.getAttribute('href') === '/students/12')).toHaveLength(1);
  });

  it('limits the timetable comparison to two sessions without allowing an empty selection', async () => {
    const records = context();
    records.selected_enrollment_ids = [101, 102];
    records.slot_candidates.push({ ...records.slot_candidates[1], enrollment_id: 103, weekday: 'Sat' });
    mocks.context.mockResolvedValue(records);
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByLabelText('Scenario start');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    expect(screen.getByRole('checkbox', { name: /Use Tue/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /Use Thu/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /Use Sat/ })).toBeDisabled();
  });

  it('does not retain another student’s scenario while a different profile loads', async () => {
    const view = show(<StudentBillingJourney studentId={12} />);
    await screen.findByLabelText('Scenario start');
    mocks.context.mockReturnValue(new Promise(() => {}));
    view.rerender(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0 }}><StudentBillingJourney studentId={13} /></SWRConfig>);
    expect(screen.queryByLabelText('Scenario start')).not.toBeInTheDocument();
    expect(screen.queryByText('Synthetic Student')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.context).toHaveBeenLastCalledWith(13, expect.objectContaining({ basis: 'paid_only' })));
  });

  it('shows record checks without inventing a zero-fee journey when no forecast is available', async () => {
    const records = context();
    records.suggested_request = null;
    records.issues = [{ code: 'MISSING_ORIGINALS', message: 'Original sessions are missing.', period: null }];
    mocks.context.mockResolvedValue(records);
    show(<StudentBillingJourney studentId={12} />);
    expect(await screen.findByText('Check the timetable and records to prepare the next payment.')).toBeVisible();
    expect(screen.queryByLabelText('Scenario start')).not.toBeInTheDocument();
    expect(screen.getAllByText('Check session records')[0]).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Edit preview' })).toBeVisible());
    expect(screen.getByLabelText('Start sessions after')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /Use Tue/ })).toBeVisible();
  });

  it('lets staff retry source errors inside the source-only editor without showing a permanent loader', async () => {
    const records = context();
    records.suggested_request = null;
    mocks.context.mockResolvedValue(records);
    show(<StudentBillingJourney studentId={12} />);
    await screen.findByText('Check the timetable and records to prepare the next payment.');
    fireEvent.click(screen.getByRole('button', { name: 'Edit preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit preview' });
    let fail!: (reason: Error) => void;
    mocks.context.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
    fireEvent.change(within(dialog).getByLabelText('Start sessions after'), { target: { value: 'include_pending' } });
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Updating enrollment records');
    await act(async () => fail(new Error('Coverage unavailable.')));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Coverage unavailable.');
    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument();
    mocks.context.mockResolvedValue({ ...records, basis: 'include_pending' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument());
    expect(within(dialog).getByLabelText('Start sessions after')).toHaveValue('include_pending');
  });

  it('does not fetch source records for a guest', () => {
    mocks.auth.mockReturnValue({ user: { id: 7 }, isLoading: false, isGuest: true, effectiveRole: 'Guest' });
    const view = show(<BillingRoster />);
    expect(screen.getByText(/Staff access is required/)).toBeInTheDocument();
    view.unmount();
    show(<StudentBillingJourney studentId={12} />);
    expect(mocks.students).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
