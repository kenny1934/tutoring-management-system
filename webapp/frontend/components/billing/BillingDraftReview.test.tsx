import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingDraftMessage, BillingDraftReview, BillingDraftSummaryContent, type BillingCopyFeedback } from './BillingDraftReview';
import { PaymentJourney } from './PaymentJourney';
import type { BillingDraftDetail, BillingDraftReview as Review, BillingDraftReviewRequest, BillingPreviewResponse } from '@/types/billing';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), review: vi.fn(), save: vi.fn(), revise: vi.fn(), clipboard: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: mocks.auth }));
vi.mock('@/lib/billing-api', () => ({ billingAPI: { draftReview: mocks.review, saveDraft: mocks.save, reviseDraft: mocks.revise } }));
function request(): BillingDraftReviewRequest {
  return { scenario: { first_lesson_date: '2026-12-04', slots: [{ weekday: 'Fri', time_slot: '16:45 - 18:15', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
    basis: 'paid_only', selected_enrollment_ids: [10], expected_source_fingerprint: 'source-1', period_number: 1, confirmed_checks: [] };
}
function review(): Review {
  return { student: { id: 4, student_name: 'Example Student', school_student_id: '004', home_location: 'MSA', grade: 'F1', school: null, lang_stream: null, is_staff_referral: false },
    source_fingerprint: 'source-1', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', scenario: request().scenario,
    basis: 'paid_only', selected_enrollment_ids: [10], confirmed_checks: [], review_hash: 'review-1', issues: [],
    message: { template_version: 'v1', zh: '中文收費通知', en: 'English fee message', blocked_reasons: [] },
    period: { number: 1, kind: 'transition', explanation: 'December sessions.', coverage_from: '2026-12-01', coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-18', lesson_count: 3,
      counts_by_month: [{ month: '2026-12', lessons: 3 }], counts_by_slot: [3], lessons: [{ date: '2026-12-04', weekday: 'Fri', slot: 0, time_slot: '16:45 - 18:15', location: 'MSA', holiday_exception: false }],
      gross_tuition: 1200, deductions: [], tuition_after_deductions: 1200, materials_fee: 0, total_fee: 1200, adjustment_reason: null, requires_review: false,
      collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18', debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null } } };
}
function saved(): BillingDraftDetail { return { id: 'draft-1', student_id: 4, current_revision: 1, revision: 1, review: review(), note: '', created_at: '2026-10-18T12:00:00+08:00', created_by_name: 'Admin', stale_reasons: [], can_copy: true, history: [] }; }
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Admin', isAdmin: true });
  mocks.review.mockReset().mockResolvedValue(review()); mocks.save.mockReset().mockResolvedValue(saved()); mocks.revise.mockReset().mockResolvedValue({ ...saved(), revision: 2, current_revision: 2 }); mocks.clipboard.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard } });
});
async function open() { fireEvent.click(screen.getByRole('button', { name: 'Review payment' })); return await screen.findByRole('textbox', { name: 'Chinese fee message' }); }

describe('payment draft review', () => {
  it.each([1280, 390])('keeps the %ipx review open during draft save and hands off its completed result', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    let finish!: (value: BillingDraftDetail) => void;
    mocks.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const onSaved = vi.fn();
    const journey: BillingPreviewResponse = { policy_version: 'policy', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30', payment_method: 'manual', monthly: false, periods: [review().period], skipped_collections: [], excluded_holidays: [], issues: [], requires_review: false, is_preview: true, creates_records: false };
    render(<PaymentJourney journeys={{ manual: journey }} slots={request().scenario.slots} unitFee={400} renderPaymentActions={() => <BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable onSaved={onSaved} />} />);
    if (width === 390) fireEvent.click(screen.getByRole('button', { name: /Manual payment 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const abort = mocks.save.mock.calls[0][2] as AbortSignal;
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));
    const back = screen.queryByRole('button', { name: 'Back to payment details' });
    if (back) { expect(back).toBeDisabled(); fireEvent.click(back); }
    expect(screen.getByRole('textbox', { name: 'Chinese fee message' })).toBeVisible();
    expect(abort.aborted).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    await act(async () => finish(saved()));
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'draft-1' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('briefly confirms copying beside the action and resets when language or reviewed content changes', () => {
    vi.useFakeTimers();
    try {
      const feedback: BillingCopyFeedback = { kind: 'success', message: 'Message copied.' };
      const props = { review: review(), canCopy: true, onCopy: vi.fn(), feedback };
      const view = render(<BillingDraftMessage {...props} />);
      const message = screen.getByRole('region', { name: 'Fee message preview' });
      expect(within(message).getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(within(message).getByRole('status')).toHaveTextContent('Message copied.');
      act(() => vi.advanceTimersByTime(2500));
      expect(within(message).getByRole('button', { name: 'Copy message' })).toBeVisible();
      expect(within(message).queryByRole('status')).not.toBeInTheDocument();

      view.rerender(<BillingDraftMessage {...props} feedback={{ ...feedback }} />);
      fireEvent.click(within(message).getByRole('button', { name: 'English' }));
      fireEvent.click(within(message).getByRole('button', { name: '中文' }));
      expect(within(message).queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();

      const freshFeedback = { ...feedback };
      view.rerender(<BillingDraftMessage {...props} feedback={freshFeedback} />);
      expect(within(message).getByRole('button', { name: 'Copied' })).toBeVisible();
      view.rerender(<BillingDraftMessage {...props} feedback={freshFeedback} review={{ ...props.review, review_hash: 'changed-review' }} />);
      expect(within(message).queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();

      view.rerender(<BillingDraftMessage {...props} review={{ ...props.review, review_hash: 'new-review' }} feedback={{ kind: 'info', message: 'Review the updated message before copying.' }} />);
      expect(within(message).getByRole('status')).toHaveTextContent('Review the updated message before copying.');
      expect(within(message).getByRole('button', { name: 'Copy message' })).toBeVisible();
    } finally { vi.useRealTimers(); }
  });

  it('keeps clipboard errors at the copy action and allows a fresh retry without saving', async () => {
    mocks.clipboard.mockRejectedValueOnce(new Error('Clipboard permission denied.'));
    render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    const message = screen.getByRole('region', { name: 'Fee message preview' });
    expect(await within(message).findByRole('alert')).toHaveTextContent('Clipboard permission denied.');
    expect(within(message).getByRole('textbox', { name: 'Chinese fee message' })).toBeVisible();
    fireEvent.click(within(message).getByRole('button', { name: 'Copy message' }));
    await within(message).findByRole('button', { name: 'Copied' });
    expect(within(message).queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.review).toHaveBeenCalledTimes(3);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('does not restore an old copied status when returning to an earlier source', async () => {
    const initial = request();
    const view = render(<BillingDraftReview inline studentId={4} reviewRequest={initial} storageAvailable />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy message' }));
    await screen.findByRole('button', { name: 'Copied' });
    view.rerender(<BillingDraftReview inline studentId={4} reviewRequest={{ ...initial, expected_source_fingerprint: 'source-2' }} storageAvailable />);
    await screen.findByRole('button', { name: 'Copy message' });
    view.rerender(<BillingDraftReview inline studentId={4} reviewRequest={initial} storageAvailable />);
    await screen.findByRole('button', { name: 'Copy message' });
    expect(screen.queryByText('Message copied.')).not.toBeInTheDocument();
  });

  it.each([
    ['first', 'The first payment is collected manually.'],
    ['legacy', 'This six-session renewal is collected manually.'],
    ['adjusted_manual', 'Manual payment is needed before the first bank collection run.'],
  ])('explains a manual %s payment under an Autopay plan without inventing future dates', (kind, reason) => {
    const data = review(); data.scenario.payment_method = 'autopay'; data.period.kind = kind;
    render(<BillingDraftSummaryContent review={data} />);
    expect(within(screen.getByText('Payment plan').closest('div')!).getByText('Autopay')).toBeVisible();
    expect(within(screen.getByText('This payment').closest('div')!).getByText('Manual')).toBeVisible();
    expect(screen.getByText(reason)).toBeVisible();
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
  });

  it('finds the first later actual Autopay period after a revised period and skips intervening manual payments', () => {
    const data = review(); data.scenario.payment_method = 'autopay'; data.period.kind = 'legacy'; data.period.number = 2;
    const autopay = { ...data.period, kind: 'regular', collection: { ...data.period.collection, method: 'autopay' as const, debit_from: '2026-12-20', debit_to: '2026-12-22' } };
    const calculation: BillingPreviewResponse = {
      policy_version: data.policy_version, payment_method: 'autopay', monthly: true, regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30',
      periods: [{ ...autopay, number: 1 }, data.period, { ...data.period, number: 3, kind: 'adjusted_manual' }, { ...autopay, number: 4 }],
      excluded_holidays: [], skipped_collections: [], issues: [], requires_review: false, is_preview: true, creates_records: false,
    };
    const view = render(<BillingDraftSummaryContent review={data} calculation={calculation} />);
    expect(screen.getByText('Next planned debit: Dec 20, 2026 to Dec 22, 2026.')).toBeVisible();
    view.rerender(<BillingDraftSummaryContent review={data} calculation={{ ...calculation, policy_version: 'old-policy' }} />);
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
    view.rerender(<BillingDraftSummaryContent review={{ ...data, period: { ...data.period, total_fee: 1100 } }} calculation={calculation} />);
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
    view.rerender(<BillingDraftSummaryContent review={data} calculation={{ ...calculation, periods: calculation.periods.slice(0, 3) }} />);
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
    view.rerender(<BillingDraftSummaryContent review={data} calculation={{ ...calculation, periods: [data.period, { ...autopay, number: 4, collection: { ...autopay.collection, debit_to: null } }] }} />);
    expect(screen.queryByText(/Next planned debit:/)).not.toBeInTheDocument();
  });

  it('uses the same fresh review and save checks inline without opening another dialog', async () => {
    const onSaved = vi.fn();
    render(<BillingDraftReview inline studentId={4} reviewRequest={request()} storageAvailable onSaved={onSaved} />);
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review payment' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.save).toHaveBeenCalledWith(4, expect.objectContaining({ expected_review_hash: expect.any(String), idempotency_key: expect.any(String) }), expect.any(AbortSignal));
  });

  it('reviews and rechecks a bilingual message before copying while draft storage is unavailable', async () => {
    const firstManual = request(); firstManual.scenario.payment_method = 'autopay'; firstManual.scenario.mandate_ready = true;
    render(<BillingDraftReview studentId={4} reviewRequest={firstManual} storageAvailable={false} />);
    expect(await open()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByText('Saving drafts is not available yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith('English fee message'));
    expect(mocks.review).toHaveBeenCalledTimes(2);
    expect(mocks.review.mock.calls[0][1].scenario.mandate_ready).toBe(false);
    expect(screen.queryByLabelText('Bank authorisation is ready for this payment.')).not.toBeInTheDocument();
    const message = screen.getByRole('region', { name: 'Fee message preview' });
    expect(await within(message).findByRole('status')).toHaveTextContent('Message copied.');
    await waitFor(() => expect(within(message).getByRole('button', { name: 'Copied' })).toBeVisible());
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('allows an unresolved draft to be saved without exposing a parent message', async () => {
    const unresolved = review(); unresolved.period.total_fee = null; unresolved.period.materials_fee = null;
    unresolved.message = { template_version: 'v1', zh: null, en: null, blocked_reasons: ['Confirm the materials fee.'] };
    mocks.review.mockResolvedValue(unresolved);
    render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByText('Resolve these checks before copying:');
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(screen.getAllByText('To confirm').length).toBeGreaterThan(1);
  });

  it('retains its idempotency key after an ambiguous save failure and changes it after a note edit', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Network interrupted')).mockRejectedValueOnce(new Error('Network interrupted'));
    const onSaved = vi.fn();
    render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable onSaved={onSaved} />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Network interrupted');
    const firstKey = mocks.save.mock.calls[0][1].idempotency_key;
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1].idempotency_key).toBe(firstKey);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Draft note'), { target: { value: 'Confirmed with parent.' } });
    expect(screen.getByLabelText('Draft note')).toHaveAttribute('maxlength', '5000');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.save.mock.calls[2][1].idempotency_key).not.toBe(firstKey);
    expect(mocks.save.mock.calls[2][1].note).toBe('Confirmed with parent.');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Review payment' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Review payment' })).toBeEnabled();
  });

  it('suppresses an old response immediately after the source changes', async () => {
    let resolve!: (value: Review) => void;
    mocks.review.mockReturnValueOnce(new Promise<Review>(done => { resolve = done; }));
    const props = { studentId: 4, reviewRequest: request(), storageAvailable: true };
    const { rerender } = render(<BillingDraftReview {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledTimes(1));
    rerender(<BillingDraftReview {...props} reviewRequest={{ ...request(), expected_source_fingerprint: 'source-2' }} />);
    await act(async () => { resolve(review()); });
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(mocks.review.mock.calls[0][2].aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(mocks.review.mock.calls.at(-1)?.[1].expected_source_fingerprint).toBe('source-2');
  });

  it('requires a new review before copying content changed on the server', async () => {
    const changed = review(); changed.review_hash = 'review-2'; changed.message.en = 'Updated fee message';
    mocks.review.mockResolvedValueOnce(review()).mockResolvedValueOnce(changed);
    render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable />);
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByText('The payment changed. Review the updated message before copying.');
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });

  it('hides a loaded message immediately when its source scope changes and sends the selected tutor scope', async () => {
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false, isImpersonating: true, impersonatedTutor: { id: 7 } });
    const { rerender } = render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable />);
    await open();
    expect(mocks.review.mock.calls[0][3]).toBe(7);
    mocks.review.mockReturnValue(new Promise(() => {}));
    rerender(<BillingDraftReview studentId={4} reviewRequest={{ ...request(), expected_source_fingerprint: 'source-2' }} storageAvailable />);
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(screen.getByText('Checking payment details…')).toBeInTheDocument();
  });

  it('withholds a message when copy-time verification cannot confirm the source', async () => {
    mocks.review.mockResolvedValueOnce(review()).mockRejectedValueOnce(new Error('Student records changed. Refresh the student.'));
    render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable />);
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByText('Student records changed. Refresh the student.');
    expect(within(screen.getByRole('region', { name: 'Fee message preview' })).getByRole('alert')).toHaveTextContent('Student records changed. Refresh the student.');
    expect(screen.queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry review' })).toBeInTheDocument();
    expect(mocks.clipboard).not.toHaveBeenCalled();
  });

  it('requires an explicit payment authorisation even when the preview assumed autopay was ready', async () => {
    const previewReady = request(); previewReady.scenario.payment_method = 'autopay'; previewReady.scenario.mandate_ready = true;
    mocks.review.mockImplementation((_student: number, outgoing: BillingDraftReviewRequest) => {
      const result = review(); result.scenario = outgoing.scenario;
      result.period.collection = { ...result.period.collection, method: 'autopay', due_before_lesson: null, debit_from: '2026-11-20', debit_to: '2026-11-22' };
      if (!outgoing.scenario.mandate_ready) result.message = { template_version: 'v1', zh: null, en: null, blocked_reasons: ['Confirm bank authorisation before copying.'] };
      return Promise.resolve(result);
    });
    const { rerender } = render(<BillingDraftReview studentId={4} reviewRequest={previewReady} storageAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    const confirm = await screen.findByRole('checkbox', { name: 'Bank authorisation is ready for this payment.' });
    expect(confirm).not.toBeChecked();
    expect(mocks.review.mock.calls[0][1].scenario.mandate_ready).toBe(false);
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
    confirm.focus(); fireEvent.click(confirm);
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(confirm).toHaveFocus();
    expect(mocks.review.mock.calls.at(-1)?.[1].scenario.mandate_ready).toBe(true);
    expect(screen.getByRole('button', { name: 'Copy message' })).not.toBeDisabled();
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false });
    rerender(<BillingDraftReview studentId={4} reviewRequest={previewReady} storageAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByText('Confirm bank authorisation before copying.');
    expect(screen.queryByRole('checkbox', { name: 'Bank authorisation is ready for this payment.' })).not.toBeInTheDocument();
    expect(mocks.review.mock.calls.at(-1)?.[1].scenario.mandate_ready).toBe(false);
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled();
  });

  it('recalculates explicit confirmations and does not offer administrative writes under tutor role', async () => {
    const data = review(); data.issues = [{ code: 'CONTINUING_SLOTS_REVIEW', message: 'Confirm both classes.', period: null }];
    mocks.review.mockResolvedValue(data);
    const { rerender } = render(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable revisionTarget={{ id: 'draft-1', current_revision: 1 }} />);
    await open();
    fireEvent.click(screen.getByLabelText('The student will attend both weekly classes.'));
    await waitFor(() => expect(mocks.review.mock.calls.at(-1)?.[1].confirmed_checks).toEqual(['CONTINUING_SLOTS_REVIEW']));
    await screen.findByRole('button', { name: 'Save revision' });
    fireEvent.click(screen.getByRole('button', { name: 'Save revision' }));
    await waitFor(() => expect(mocks.revise).toHaveBeenCalledWith('draft-1', expect.objectContaining({ expected_revision: 1, review: expect.objectContaining({ confirmed_checks: ['CONTINUING_SLOTS_REVIEW'] }) }), expect.any(AbortSignal)));
    mocks.auth.mockReturnValue({ user: { id: 1 }, effectiveRole: 'Tutor', isAdmin: false });
    rerender(<BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable />);
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    await screen.findByRole('textbox', { name: 'Chinese fee message' });
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('reuses the phone payment sheet and restores its review action without nesting dialogs', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const user = userEvent.setup();
    const journey: BillingPreviewResponse = { policy_version: 'policy', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30', payment_method: 'manual', monthly: false, periods: [review().period], skipped_collections: [], excluded_holidays: [], issues: [], requires_review: false, is_preview: true, creates_records: false };
    render(<PaymentJourney journeys={{ manual: journey }} slots={request().scenario.slots} unitFee={400} renderPaymentActions={() => <BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable={false} />} />);
    await user.click(screen.getByRole('button', { name: /Manual payment 1/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Review payment' }));
    await within(dialog).findByRole('textbox', { name: 'Chinese fee message' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const back = within(dialog).getByRole('button', { name: 'Back to payment details' });
    expect(back).toHaveFocus();
    await user.click(back);
    expect(within(dialog).getByRole('button', { name: 'Review payment' })).toHaveFocus();
    expect(within(dialog).queryByRole('textbox', { name: 'Chinese fee message' })).not.toBeInTheDocument();
  });

  it('closes the phone payment sheet when handing the saved draft to the next step', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    const journey: BillingPreviewResponse = { policy_version: 'policy', regular_end_date: '2027-07-04', makeup_end_date: '2027-06-30', payment_method: 'manual', monthly: false, periods: [review().period], skipped_collections: [], excluded_holidays: [], issues: [], requires_review: false, is_preview: true, creates_records: false };
    render(<PaymentJourney journeys={{ manual: journey }} slots={request().scenario.slots} unitFee={400} renderPaymentActions={() => <BillingDraftReview studentId={4} reviewRequest={request()} storageAvailable onSaved={onSaved} />} />);
    await user.click(screen.getByRole('button', { name: /Manual payment 1/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Review payment' }));
    await within(dialog).findByRole('textbox', { name: 'Chinese fee message' });
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'draft-1', revision: 1 })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
