import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingSavedDrafts } from './BillingSavedDrafts';
import type { BillingDraftDetail, BillingDraftSummary } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), draft: vi.fn(), discard: vi.fn(), preferences: vi.fn(), clipboard: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { studentDrafts: mocks.list, draft: mocks.draft, discardDraft: mocks.discard, preferences: mocks.preferences } }));
function detail(): BillingDraftDetail {
  return { id: 'draft-1', student_id: 4, current_revision: 2, revision: 2, note: 'Parent chose manual.', created_at: '2026-10-18T12:00:00+08:00', created_by_name: 'Admin', can_copy: true, stale_reasons: [],
    history: [{ revision: 2, created_at: '2026-10-18T12:00:00+08:00', created_by_name: 'Admin', note: 'Parent chose manual.' }, { revision: 1, created_at: '2026-10-17T12:00:00+08:00', created_by_name: 'Tutor', note: null }],
    review: { student: { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', school: null, lang_stream: null, is_staff_referral: false },
      source_fingerprint: 'source-1', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review-2', basis: 'paid_only', selected_enrollment_ids: [10], confirmed_checks: [], issues: [],
      scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
      message: { template_version: 'v1', zh: '中文收費通知', en: 'English fee message', blocked_reasons: [] },
      period: { number: 1, kind: 'transition', explanation: 'December sessions.', coverage_from: '2026-12-01', coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-18', lesson_count: 3,
        counts_by_month: [{ month: '2026-12', lessons: 3 }], counts_by_slot: [3], lessons: [{ date: '2026-12-04', weekday: 'Fri', slot: 0, time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }],
        gross_tuition: 1200, deductions: [], tuition_after_deductions: 1200, materials_fee: 0, total_fee: 1200, adjustment_reason: null, requires_review: false,
        collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null } } } };
}
const summary: BillingDraftSummary = { id: 'draft-1', student_id: 4, current_revision: 2, period_number: 1, lesson_count: 3, total_fee: 1200, payment_method: 'manual', coverage_from: '2026-12-01', coverage_through: '2026-12-31', created_at: '2026-10-17T12:00:00+08:00', updated_at: '2026-10-18T12:00:00+08:00' };
function Wrapper({ children }: { children: React.ReactNode }) { return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, revalidateOnFocus: false }}>{children}</SWRConfig>; }
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true });
  mocks.discard.mockReset(); mocks.preferences.mockReset().mockResolvedValue({ student_id: 4, payment_method: 'manual', mandate_ready: false, version: 1, updated_at: null });
  mocks.list.mockReset().mockResolvedValue([summary]); mocks.draft.mockReset().mockResolvedValue(detail()); mocks.clipboard.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard } });
});
async function open() { fireEvent.click(await screen.findByRole('button', { name: 'View draft' })); return await screen.findByRole('textbox', { name: 'Chinese fee message' }); }

describe('saved payment drafts', () => {
  it('shows the exact saved draft inline with the gated creation step and history', async () => {
    render(<BillingSavedDrafts inline studentId={4} scope="admin" initialDraftId="draft-1" savedRevision={2} />, { wrapper: Wrapper });
    await screen.findByText('Draft saved. Revision 2.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Saved drafts' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create enrollment' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Draft revision' })).toHaveValue('2');
    expect(mocks.preferences).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith('中文收費通知'));
    expect(mocks.draft).toHaveBeenCalledTimes(2);
    const message = screen.getByRole('region', { name: 'Fee message preview' });
    expect(await within(message).findByRole('button', { name: 'Copied' })).toBeVisible();
    expect(within(message).getByRole('status')).toHaveTextContent('Message copied.');
    fireEvent.click(within(message).getByRole('button', { name: 'English' }));
    expect(within(message).queryByRole('status')).not.toBeInTheDocument();
    expect(within(message).getByRole('button', { name: 'Copy message' })).toBeVisible();
  });

  it('shows clipboard denial beside Copy and keeps its safe revision retry nearby', async () => {
    mocks.clipboard.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    const message = screen.getByRole('region', { name: 'Fee message preview' });
    expect(await within(message).findByRole('alert')).toHaveTextContent('Clipboard permission denied.');
    expect(within(message).getByRole('button', { name: 'Copy message' })).toBeDisabled();
    expect(within(message).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(within(message.parentElement!).getByRole('button', { name: 'Retry revision' }));
    await waitFor(() => expect(within(message).getByRole('button', { name: 'Copy message' })).toBeEnabled());
    expect(within(message).queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it('does not restore copied feedback after leaving and returning to the same draft scope', async () => {
    const view = render(<BillingSavedDrafts inline studentId={4} scope="admin" initialDraftId="draft-1" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Copy message' }));
    await screen.findByRole('button', { name: 'Copied' });
    view.rerender(<BillingSavedDrafts inline studentId={4} scope="other" initialDraftId="draft-1" />);
    await screen.findByRole('button', { name: 'Copy message' });
    view.rerender(<BillingSavedDrafts inline studentId={4} scope="admin" initialDraftId="draft-1" />);
    await screen.findByRole('button', { name: 'Copy message' });
    expect(screen.queryByText('Message copied.')).not.toBeInTheDocument();
  });

  it('opens the exact saved draft with a visible creation step while workflow storage is unavailable', async () => {
    render(<BillingSavedDrafts studentId={4} scope="admin" initialDraftId="draft-1" savedRevision={2} />, { wrapper: Wrapper });
    const dialog = await screen.findByRole('dialog', { name: 'Saved payment draft' });
    await within(dialog).findByText('Draft saved. Revision 2.');
    expect(within(dialog).getByRole('button', { name: 'Create enrollment' })).toBeDisabled();
    expect(within(dialog).getByText('Enrollment creation is not enabled yet.')).toBeInTheDocument();
    expect(mocks.draft).toHaveBeenCalledWith('draft-1', undefined, undefined, undefined);
    expect(mocks.preferences).not.toHaveBeenCalled();
  });

  it('makes the creation step available directly from a writable saved draft', async () => {
    render(<BillingSavedDrafts studentId={4} scope="admin" workflowAvailable workflowWritesAvailable onConfirmed={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Review & create enrollment' }));
    await screen.findByRole('checkbox', { name: 'I checked the session dates and total fee.' });
    const create = screen.getByRole('region', { name: 'Create reviewed enrollment' });
    const message = screen.getByRole('region', { name: 'Fee message preview' });
    expect(create.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(create).getByRole('button', { name: 'Create enrollment' })).toBeDisabled();
  });

  it('discards only after confirmation and preserves the retry token and accessible history', async () => {
    const discarded = { ...detail(), state: 'discarded' as const, revision: 3, current_revision: 3, can_copy: false };
    const onDiscarded = vi.fn();
    mocks.discard.mockRejectedValueOnce(new Error('Connection interrupted.')).mockResolvedValue(discarded);
    render(<BillingSavedDrafts studentId={4} scope="admin" onDiscarded={onDiscarded} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    await screen.findByText('Discard draft?');
    expect(mocks.discard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    await screen.findByText('Connection interrupted.');
    const token = mocks.discard.mock.calls[0][1].idempotency_key;
    mocks.list.mockImplementation((_student: number, _signal: unknown, _tutor: unknown, includeDiscarded?: boolean) => Promise.resolve(includeDiscarded ? [{ ...summary, state: 'discarded', current_revision: 3 }] : []));
    mocks.draft.mockResolvedValue(discarded);
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    await screen.findByText('Draft discarded.');
    expect(onDiscarded).toHaveBeenCalledWith('draft-1');
    expect(mocks.discard).toHaveBeenNthCalledWith(2, 'draft-1', { expected_revision: 2, idempotency_key: token }, expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: 'View draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show discarded' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View history' }));
    expect(mocks.list).toHaveBeenLastCalledWith(4, undefined, undefined, true);
    const dialog = await screen.findByRole('dialog', { name: 'Saved payment draft' });
    await within(dialog).findByText('Discarded');
    expect(within(dialog).queryByRole('button', { name: /Create enrollment|Revise draft|Discard draft|Copy message/ })).not.toBeInTheDocument();
  });

  it('keeps the underlying draft open when Escape cancels discard', async () => {
    const user = userEvent.setup();
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    const dialog = screen.getByRole('dialog', { name: 'Saved payment draft' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard draft' }));
    const keep = await screen.findByRole('button', { name: 'Keep draft' });
    await waitFor(() => expect(keep).toHaveFocus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Discard draft' })).toHaveFocus();
    await user.tab();
    await waitFor(() => expect(keep).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Discard draft?')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Saved payment draft' })).toBe(dialog);
    expect(within(dialog).getByRole('textbox', { name: 'Chinese fee message' })).toBeInTheDocument();
    expect(mocks.discard).not.toHaveBeenCalled();
  });

  it('masks cached active actions immediately when opening discarded history', async () => {
    render(<BillingSavedDrafts studentId={4} scope="admin" onRevise={vi.fn()} />, { wrapper: Wrapper });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const discarded = { ...detail(), state: 'discarded' as const, current_revision: 3, revision: 3 };
    mocks.discard.mockResolvedValue(discarded);
    mocks.list.mockImplementation((_student: number, _signal: unknown, _tutor: unknown, includeDiscarded?: boolean) => Promise.resolve(includeDiscarded ? [{ ...summary, state: 'discarded', current_revision: 3 }] : []));
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    await screen.findByText('Discard draft?');
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    await screen.findByText('Draft discarded.');
    let resolve!: (value: BillingDraftDetail) => void;
    mocks.draft.mockImplementation(() => new Promise<BillingDraftDetail>(done => { resolve = done; }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show discarded' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Saved payment draft' });
    expect(within(dialog).getByText('Discarded')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Create enrollment|Revise draft|Discard draft|Copy message/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    await act(async () => resolve(discarded));
  });

  it('ignores a pending discard after scope changes and leaves the new scope usable', async () => {
    let resolve!: (value: BillingDraftDetail) => void;
    mocks.discard.mockImplementation(() => new Promise<BillingDraftDetail>(done => { resolve = done; }));
    const onDiscarded = vi.fn();
    const { rerender } = render(<BillingSavedDrafts studentId={4} scope="admin" onDiscarded={onDiscarded} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }));
    await screen.findByText('Discard draft?');
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    rerender(<BillingSavedDrafts studentId={4} scope="admin-refreshed" onDiscarded={onDiscarded} />);
    expect(await screen.findByRole('button', { name: 'Discard draft' })).not.toBeDisabled();
    await act(async () => resolve({ ...detail(), state: 'discarded' }));
    expect(onDiscarded).not.toHaveBeenCalled();
    expect(screen.queryByText('Draft discarded.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(await screen.findByRole('button', { name: 'Keep draft' })).not.toBeDisabled();
  });

  it('does not reopen a dismissed saved draft when the list refreshes', async () => {
    const { rerender } = render(<BillingSavedDrafts studentId={4} scope="admin" initialDraftId="draft-1" savedRevision={2} refreshKey={1} />, { wrapper: Wrapper });
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<BillingSavedDrafts studentId={4} scope="admin" initialDraftId="draft-1" savedRevision={2} refreshKey={2} />);
    await screen.findByRole('button', { name: 'View draft' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    rerender(<BillingSavedDrafts studentId={4} scope="admin" initialDraftId={null} savedRevision={2} refreshKey={2} />);
    rerender(<BillingSavedDrafts studentId={4} scope="admin" initialDraftId="draft-1" savedRevision={2} refreshKey={2} />);
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
  });

  it('withholds every write and message on historical versions of a discarded draft', async () => {
    const discarded = { ...detail(), state: 'discarded' as const, revision: 1, current_revision: 3, history: [{ revision: 3, action: 'discarded' as const, created_by_name: 'Admin', created_at: '2026-10-19T12:00:00+08:00', note: null }] };
    mocks.list.mockResolvedValue([{ ...summary, state: 'discarded' }]);
    mocks.draft.mockResolvedValue(discarded);
    render(<BillingSavedDrafts studentId={4} scope="admin" workflowAvailable workflowWritesAvailable onConfirmed={vi.fn()} onRevise={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show discarded' }));
    fireEvent.click(await screen.findByRole('button', { name: 'View history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Saved payment draft' });
    await within(dialog).findByText('Draft note');
    expect(within(dialog).getByRole('combobox', { name: 'Draft revision' })).toHaveValue('1');
    expect(within(dialog).queryByRole('button', { name: /Create enrollment|Revise draft|Discard draft|Copy message/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.preferences).not.toHaveBeenCalled();
  });

  it('does not copy a draft that was discarded after it opened', async () => {
    mocks.draft.mockResolvedValueOnce(detail()).mockResolvedValue({ ...detail(), state: 'discarded' });
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByText('This draft changed. Review the latest payment before copying.');
    const dialog = screen.getByRole('dialog', { name: 'Saved payment draft' });
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Create enrollment|Revise draft|Discard draft|Copy message/ })).not.toBeInTheDocument();
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });

  it('opens the exact combined payment from either confirmed-draft action without discarding it', async () => {
    const onOpenPayment = vi.fn();
    mocks.list.mockResolvedValue([{ ...summary, confirmed_payment_id: 'combined-1' }]);
    mocks.draft.mockResolvedValue({ ...detail(), confirmed_payment_id: 'combined-1' });
    render(<BillingSavedDrafts studentId={4} scope="admin" onOpenPayment={onOpenPayment} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Open payment' }));
    expect(onOpenPayment).toHaveBeenLastCalledWith('combined-1');
    fireEvent.click(screen.getByRole('button', { name: 'View draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Saved payment draft' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Open payment' }));
    expect(onOpenPayment).toHaveBeenCalledTimes(2);
    expect(onOpenPayment).toHaveBeenLastCalledWith('combined-1');
    expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not expose discard or creation under a tutor role', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false });
    render(<BillingSavedDrafts studentId={4} scope="tutor" workflowAvailable workflowWritesAvailable onConfirmed={vi.fn()} />, { wrapper: Wrapper });
    await open();
    expect(screen.queryByRole('button', { name: /Create enrollment|Review & create enrollment|Discard draft/ })).not.toBeInTheDocument();
    expect(mocks.preferences).not.toHaveBeenCalled();
  });

  it('rechecks a saved revision before copying and withholds its old message after source changes', async () => {
    const fresh = detail(); fresh.can_copy = false; fresh.stale_reasons = ['The timetable changed.'];
    mocks.draft.mockResolvedValueOnce(detail()).mockResolvedValueOnce(fresh);
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByText('This draft changed. Review the latest payment before copying.');
    expect(mocks.clipboard).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('shows revision history without exposing historical message text and revises only the current version', async () => {
    const old = detail(); old.revision = 1; old.can_copy = false; old.review.review_hash = 'review-1';
    mocks.draft.mockImplementation((_id: string, revision?: number) => Promise.resolve(revision === 1 ? old : detail()));
    const onRevise = vi.fn();
    render(<BillingSavedDrafts studentId={4} scope="admin" onRevise={onRevise} />, { wrapper: Wrapper });
    await open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Draft revision' }), { target: { value: '1' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Draft revision' })).toHaveValue('1'));
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise draft' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Draft revision' }), { target: { value: '2' } });
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    fireEvent.click(screen.getByRole('button', { name: 'Revise draft' }));
    expect(onRevise).toHaveBeenCalledWith(expect.objectContaining({ current_revision: 2, revision: 2 }));
  });

  it('keeps the revision chooser focused while the selected revision loads and withholds the previous message', async () => {
    let resolve!: (value: BillingDraftDetail) => void;
    mocks.draft.mockImplementation((_id: string, revision?: number) => revision === 1 ? new Promise<BillingDraftDetail>(done => { resolve = done; }) : Promise.resolve(detail()));
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    const chooser = screen.getByRole('combobox', { name: 'Draft revision' });
    chooser.focus();
    fireEvent.change(chooser, { target: { value: '1' } });
    expect(chooser).toHaveFocus();
    expect(screen.getByRole('combobox', { name: 'Draft revision' })).toBe(chooser);
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    const old = detail(); old.revision = 1; old.can_copy = false;
    await act(async () => resolve(old));
    expect(chooser).toHaveFocus();
    expect(chooser).toHaveValue('1');
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
  });

  it('immediately isolates the selected draft when the student or effective role changes', async () => {
    const { rerender } = render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    mocks.list.mockResolvedValue([]);
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false });
    rerender(<BillingSavedDrafts studentId={5} scope="tutor-2" />);
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise draft' })).not.toBeInTheDocument();
    await screen.findByText('No saved drafts yet.');
    expect(mocks.list).toHaveBeenLastCalledWith(5, undefined, 1);
  });

  it('keeps a revision-load error and retry inside the open dialog', async () => {
    mocks.draft.mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValue(detail());
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'View draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Saved payment draft' });
    await within(dialog).findByText('Could not load this revision.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry revision' }));
    await within(dialog).findByRole('textbox', { name: 'Chinese fee message' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('withholds old saved text when copy-time verification fails and offers an in-dialog retry', async () => {
    mocks.draft.mockResolvedValueOnce(detail()).mockRejectedValueOnce(new Error('Could not confirm the source.')).mockResolvedValue(detail());
    render(<BillingSavedDrafts studentId={4} scope="admin" />, { wrapper: Wrapper });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(await within(screen.getByRole('region', { name: 'Fee message preview' })).findByRole('alert')).toHaveTextContent('Could not confirm the source.');
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry revision' }));
    await within(dialog).findByRole('textbox', { name: 'Chinese fee message' });
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });
});
