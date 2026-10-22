import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingBatchRunner, billingBatchReady, canBatchRenew, loadBillingBatch, loadBillingBatchItem,
  type BillingBatchItem,
} from './billing-batch';
import type {
  BillingDraftDetail, BillingDraftReview, BillingDraftReviewRequest, BillingPaymentDetail,
  BillingPreferences, BillingPreviewRequest, BillingQueueRow, StudentBillingContext,
} from '@/types/billing';

const api = vi.hoisted(() => ({
  studentContext: vi.fn(), draft: vi.fn(), draftReview: vi.fn(), preferences: vi.fn(),
  saveDraft: vi.fn(), reviseDraft: vi.fn(), confirmDraft: vi.fn(),
}));
vi.mock('./billing-api', () => ({ billingAPI: api }));

function scenario(): BillingPreviewRequest {
  return {
    mode: 'transition', payment_method: 'manual', first_lesson_date: '2026-12-04',
    slots: [{ weekday: 'Fri', time_slot: '16:00 - 17:30', location: 'MSA', covered_through: '2026-11-27' }],
    materials_fee: 0, trial_deduction: false, mandate_ready: false,
  };
}
function row(id = 101): BillingQueueRow {
  return {
    key: `student-${id}`, student: { id, student_name: `Synthetic ${id}`, school_student_id: String(id), home_location: 'MSA', grade: 'F2', is_staff_referral: false },
    stage: 'prepare', origin: 'projection', recorded_payment_method: 'manual', payment_method: 'manual',
    collection: null, first_lesson_date: '2026-12-04', coverage_through: '2026-12-31',
    lesson_count: 3, total_fee: 1200, amount_basis: 'tuition_only', prepare_on: '2026-11-12',
    due_date: '2026-12-04', overdue: false, ready_now: true, draft_id: null, payment_id: null,
    enrollment_ids: [id * 10], payment_ids: [], issues: [], note: '', action_url: `/billing/students/${id}`,
  };
}
function context(id = 101): StudentBillingContext {
  return {
    student: row(id).student, as_of: '2026-11-12', basis: 'include_pending',
    source_blocks: [], slot_candidates: [], selected_enrollment_ids: [id * 10],
    upcoming_original_count: 2, pending_bill_count: 0, sent_pending_bill_count: 0,
    pending_makeup_count: 0, coupon_snapshot: null, suggested_request: scenario(), issues: [],
    requires_review: false, source_fingerprint: `source-${id}`, recorded_payment_method: 'manual', mandate_ready: false,
  };
}
function request(id = 101): BillingDraftReviewRequest {
  return { scenario: scenario(), basis: 'include_pending', selected_enrollment_ids: [id * 10],
    expected_source_fingerprint: `source-${id}`, period_number: 1, confirmed_checks: [] };
}
function review(id = 101, body = request(id)): BillingDraftReview {
  return {
    student: row(id).student, source_fingerprint: body.expected_source_fingerprint,
    evidence_hash: `evidence-${id}`, calendar_hash: 'calendar', policy_version: 'policy',
    scenario: structuredClone(body.scenario), basis: body.basis, selected_enrollment_ids: body.selected_enrollment_ids,
    confirmed_checks: body.confirmed_checks ?? [], issues: [], review_hash: `review-${id}`,
    message: { template_version: 'template', zh: 'Synthetic message', en: 'Synthetic message', blocked_reasons: [] },
    period: {
      number: body.period_number, kind: 'transition', explanation: '', coverage_from: '2026-12-04',
      coverage_through: '2026-12-31', first_lesson_date: '2026-12-04', last_lesson_date: '2026-12-18',
      lesson_count: 3, counts_by_month: [{ month: '2026-12', lessons: 3 }], counts_by_slot: [3],
      lessons: [4, 11, 18].map(day => ({ date: `2026-12-${String(day).padStart(2, '0')}`, slot: 0,
        weekday: 'Fri' as const, time_slot: '16:00 - 17:30', location: 'MSA', holiday_exception: false })),
      gross_tuition: 1200, deductions: [], tuition_after_deductions: 1200, materials_fee: 0, total_fee: 1200,
      collection: { method: 'manual', notice_from: '2026-11-12', notice_to: '2026-11-18',
        debit_from: null, debit_to: null, due_before_lesson: '2026-12-04', gap_min_days: null, gap_max_days: null },
      adjustment_reason: null, requires_review: false,
    },
  };
}
function preferences(id = 101): BillingPreferences {
  return { student_id: id, payment_method: 'manual', mandate_ready: false, version: 3, updated_at: null };
}
function draft(id = 101, reviewed = review(id)): BillingDraftDetail {
  return {
    id: `draft-${id}`, student_id: id, revision: 2, current_revision: 2, state: 'active',
    confirmed_payment_id: null, review: reviewed, note: 'Individual review',
    created_at: '2026-11-12T00:00:00Z', created_by_name: 'Synthetic Admin',
    stale_reasons: [], can_copy: true, history: [],
  };
}
function payment(id = 101): BillingPaymentDetail {
  return {
    id: `payment-${id}`, student_id: id, version: 1, status: 'Pending Payment', review: review(id),
    lines: [], created_at: '2026-11-12T00:00:00Z', sent_at: null, sent_language: null,
    paid_at: null, payment_date: null, received_method: null, receipt_reference: null,
    coupon_status: 'none', note: null, can_copy: true, review_issues: [], history: [],
  };
}
function ready(id = 101): BillingBatchItem {
  return { row: row(id), context: context(id), request: request(id), review: review(id),
    draft: null, preferences: preferences(id), reasons: [], creationReasons: [] };
}
function failure(status?: number) {
  return Object.assign(new Error(status === 409 ? 'Records changed. Review again.' : 'Synthetic connection failed.'), { status });
}
function runner() {
  return new BillingBatchRunner({ draftStorageAvailable: true, workflowWritesAvailable: true });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  Object.values(api).forEach(mock => mock.mockReset());
  api.studentContext.mockImplementation(async (id: number) => context(id));
  api.draft.mockImplementation(async (id: string) => draft(Number(id.split('-')[1])));
  api.draftReview.mockImplementation(async (id: number, body: BillingDraftReviewRequest) => review(id, body));
  api.preferences.mockImplementation(async (id: number) => preferences(id));
  api.saveDraft.mockImplementation(async (id: number) => draft(id));
  api.confirmDraft.mockImplementation(async (id: string) => payment(Number(id.split('-')[1])));
});

describe('batch preparation safeguards', () => {
  it('keeps first-enrollment drafts in their individual intake workflow', async () => {
    const first = { ...row(), origin: 'draft' as const, draft_id: 'first-intake', enrollment_ids: [] };
    expect(canBatchRenew(first)).toBe(false);
    const result = await loadBillingBatchItem(first, { workflowAvailable: true });
    expect(result.review).toBeNull();
    expect(api.draft).not.toHaveBeenCalled();
    expect(api.studentContext).not.toHaveBeenCalled();
  });

  it.each([
    { origin: 'legacy' as const }, { origin: 'payment' as const },
    { stage: 'no_payment' as const }, { payment_id: 'existing' }, { payment_ids: ['existing'] },
  ])('excludes existing collection work before any student request: %j', async change => {
    const source = { ...row(), ...change };
    expect(canBatchRenew(source)).toBe(false);
    expect(billingBatchReady(await loadBillingBatchItem(source, { workflowAvailable: true }))).toBe(false);
    expect(api.studentContext).not.toHaveBeenCalled();
  });

  it('does not invent Manual when the saved parent preference is missing', async () => {
    api.studentContext.mockResolvedValue({ ...context(), recorded_payment_method: null });
    const item = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(item.reasons).toContain('Choose a payment plan.');
    expect(item.request).toBeNull();
    expect(api.draftReview).not.toHaveBeenCalled();
  });

  it('requires individual coupon review even when the suggested scenario contains no coupon', async () => {
    api.studentContext.mockResolvedValue({ ...context(), coupon_snapshot: { remaining_count: 2, cached_value: '500', verified: false, synced_at_utc: '2026-11-01T00:00:00Z' } });
    const item = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(item.reasons).toContain('Review the student’s available coupons.');
    expect(billingBatchReady(item)).toBe(false);
    expect(item.request?.scenario.coupon).toBeUndefined();
  });

  it('requires individual staff-benefit review even with no imported coupon balance', async () => {
    api.studentContext.mockResolvedValue({ ...context(), student: { ...row().student, is_staff_referral: true },
      coupon_snapshot: { remaining_count: 0, cached_value: null, verified: false, synced_at_utc: null } });
    const item = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(item.reasons).toContain('Review the staff benefit.');
    expect(billingBatchReady(item)).toBe(false);
    api.draft.mockResolvedValue(draft());
    const individuallyReviewed = await loadBillingBatchItem({ ...row(), draft_id: 'draft-101' }, { workflowAvailable: true });
    expect(billingBatchReady(individuallyReviewed)).toBe(true);
  });

  it.each(['count', 'Pending Payment', 'Unpaid', 'Overdue'])('catches a new unpaid enrollment after the queue was loaded via %s', async evidence => {
    const current = context();
    if (evidence === 'count') current.pending_bill_count = 1;
    else current.source_blocks = [{
      enrollment_id: 99, tutor_id: 1, tutor_name: 'Synthetic Tutor', weekday: 'Fri', time_slot: '16:00 - 17:30',
      location: 'MSA', first_lesson_date: '2026-12-04', lessons_recorded: 3, payment_status: evidence,
      payment_date: null, fee_message_marked_sent: true, renewed_from_enrollment_id: 1010, is_new_student: false,
      originals: [], last_original_date: '2026-12-18', makeup_dates: [],
    }];
    api.studentContext.mockResolvedValue(current);
    const item = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(item.reasons).toContain('Review the existing unpaid enrollment first.');
    expect(billingBatchReady(item)).toBe(false);
  });

  it('keeps preparation read-only and omits workflow storage endpoints when unavailable', async () => {
    const abort = new AbortController();
    const item = await loadBillingBatchItem(row(), { workflowAvailable: false, tutorId: 17, signal: abort.signal });
    expect(billingBatchReady(item)).toBe(true);
    expect(api.studentContext).toHaveBeenCalledWith(101, expect.objectContaining({ tutor_id: 17, basis: 'include_pending' }), abort.signal);
    expect(api.draftReview).toHaveBeenCalledWith(101, expect.objectContaining({ confirmed_checks: [] }), abort.signal, 17);
    expect(api.preferences).not.toHaveBeenCalled();
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(api.confirmDraft).not.toHaveBeenCalled();
    expect(item.creationReasons).toContain('Save the parent’s payment plan first.');
  });

  it('preserves deliberate saved coupon, materials, date and acknowledgement decisions', async () => {
    const saved = draft();
    saved.review.scenario = { ...scenario(), materials_fee: 80,
      adjustment: { through: '2026-12-31', reason: 'Individually agreed collection' },
      coupon: { kind: 'ordinary', value: 500, verified: true, expires_on: '2027-01-31', available_count: 1, combine_next_month: false } };
    saved.review.confirmed_checks = ['CONTINUING_SLOTS_REVIEW'];
    api.draft.mockResolvedValue(saved);
    api.studentContext.mockResolvedValue({ ...context(), coupon_snapshot: { remaining_count: 1, cached_value: '500', synced_at_utc: null, verified: false } });
    const item = await loadBillingBatchItem({ ...row(), origin: 'draft', draft_id: saved.id }, { workflowAvailable: true });
    expect(billingBatchReady(item)).toBe(true);
    expect(item.request).toMatchObject({ scenario: saved.review.scenario, confirmed_checks: ['CONTINUING_SLOTS_REVIEW'], period_number: 1 });
    expect(api.reviseDraft).not.toHaveBeenCalled();
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it.each([
    { state: 'discarded' as const }, { confirmed_payment_id: 'already-created' }, { current_revision: 3 },
    { stale_reasons: ['The holiday calendar changed.'] }, { can_copy: false },
  ])('withholds an unsafe saved draft: %j', async change => {
    api.draft.mockResolvedValue({ ...draft(), ...change });
    const item = await loadBillingBatchItem({ ...row(), origin: 'draft', draft_id: 'draft-101' }, { workflowAvailable: true });
    expect(billingBatchReady(item)).toBe(false);
    expect(item.reasons.length).toBeGreaterThan(0);
  });

  it('does not silently replace a changed saved quote with a new one', async () => {
    api.draft.mockResolvedValue(draft());
    api.draftReview.mockResolvedValue({ ...review(), review_hash: 'new-calculation' });
    const item = await loadBillingBatchItem({ ...row(), origin: 'draft', draft_id: 'draft-101' }, { workflowAvailable: true });
    expect(item.reasons).toContain('The draft calculation changed. Review and save a revision.');
    expect(api.reviseDraft).not.toHaveBeenCalled();
  });

  it('requires source acknowledgements individually without adding any to the request', async () => {
    api.draftReview.mockResolvedValue({ ...review(), message: { ...review().message, blocked_reasons: ['Confirm the two continuing classes.'] } });
    const item = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(item.request?.confirmed_checks).toEqual([]);
    expect(item.reasons).toEqual(['Confirm the two continuing classes.']);
    expect(billingBatchReady(item)).toBe(false);
  });

  it.each([null, 0, -1])('withholds an unconfirmed or invalid fee %s', async total => {
    api.draftReview.mockResolvedValue({ ...review(), period: { ...review().period, total_fee: total } });
    expect(billingBatchReady(await loadBillingBatchItem(row(), { workflowAvailable: true }))).toBe(false);
  });

  it('uses actual collection for bank readiness while retaining the Autopay plan', async () => {
    api.studentContext.mockResolvedValue({ ...context(), recorded_payment_method: 'autopay', mandate_ready: false });
    api.preferences.mockResolvedValue({ ...preferences(), payment_method: 'autopay', mandate_ready: false });
    const manual = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(manual.review?.scenario.payment_method).toBe('autopay');
    expect(manual.review?.period.collection.method).toBe('manual');
    expect(manual.creationReasons).toEqual([]);
    api.draftReview.mockImplementation(async (id: number, body: BillingDraftReviewRequest) => ({
      ...review(id, body), period: { ...review(id, body).period, collection: { ...review().period.collection, method: 'autopay' } },
    }));
    expect((await loadBillingBatchItem(row(), { workflowAvailable: true })).creationReasons).toContain('Record bank authorisation first.');
  });

  it('does not use a changed persisted preference to confirm the displayed quote', async () => {
    api.preferences.mockResolvedValue({ ...preferences(), payment_method: 'autopay', version: 4 });
    const item = await loadBillingBatchItem(row(), { workflowAvailable: true });
    expect(item.review?.scenario.payment_method).toBe('manual');
    expect(item.creationReasons).toContain('The preview differs from the saved payment plan.');
  });

  it('retains other students when one fresh review fails', async () => {
    api.draftReview.mockImplementation(async (id: number, body: BillingDraftReviewRequest) => {
      if (id === 102) throw failure(409);
      return review(id, body);
    });
    const items: BillingBatchItem[] = [];
    await loadBillingBatch([row(101), row(102), row(103)], { workflowAvailable: true }, item => items.push(item));
    expect(items).toHaveLength(3);
    expect(items.filter(billingBatchReady).map(item => item.row.student.id).sort()).toEqual([101, 103]);
    expect(items.find(item => item.row.student.id === 102)?.reasons).toEqual(['Records changed. Review again.']);
  });

  it('prepares a twice-weekly student only once when both teaching rows were selected', async () => {
    const items: BillingBatchItem[] = [];
    await loadBillingBatch([row(), { ...row(), enrollment_ids: [1011] }, row(102)],
      { workflowAvailable: true }, item => items.push(item));
    expect(items.map(item => item.row.student.id).sort()).toEqual([101, 102]);
    expect(api.studentContext).toHaveBeenCalledTimes(2);
    expect(api.draftReview).toHaveBeenCalledTimes(2);
  });

  it('refuses a draft owned by another student before loading or reviewing its source', async () => {
    api.draft.mockResolvedValue(draft(102));
    const item = await loadBillingBatchItem({ ...row(), draft_id: 'wrong-owner' }, { workflowAvailable: true });
    expect(billingBatchReady(item)).toBe(false);
    expect(item.reasons).toEqual(['The draft belongs to another student.']);
    expect(api.studentContext).not.toHaveBeenCalled();
    expect(api.draftReview).not.toHaveBeenCalled();
  });

  it('bounds parallel source reads to three and stops stale results after abort', async () => {
    const pending = [101, 102, 103, 104, 105].map(() => deferred<StudentBillingContext>());
    let active = 0, maximum = 0;
    api.studentContext.mockImplementation(async (id: number) => {
      active++; maximum = Math.max(maximum, active);
      try { return await pending[id - 101].promise; } finally { active--; }
    });
    const abort = new AbortController(), onItem = vi.fn();
    const loading = loadBillingBatch([101, 102, 103, 104, 105].map(row), { workflowAvailable: true, signal: abort.signal }, onItem);
    const result = expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.studentContext).toHaveBeenCalledTimes(3);
    abort.abort();
    pending.slice(0, 3).forEach((value, index) => value.resolve(context(101 + index)));
    await result;
    expect(maximum).toBe(3);
    expect(api.studentContext).toHaveBeenCalledTimes(3);
    expect(onItem).not.toHaveBeenCalled();
    expect(api.draftReview).not.toHaveBeenCalled();
  });
});

describe('batch persistence and partial failures', () => {
  it('saves then confirms the exact reviewed quote, leaving payment Pending', async () => {
    const result = await runner().run(ready(), 'create');
    expect(result.outcome).toMatchObject({ kind: 'created', payment: { status: 'Pending Payment', sent_at: null, paid_at: null } });
    expect(api.saveDraft).toHaveBeenCalledWith(101, expect.objectContaining({ review: request(), expected_review_hash: 'review-101' }), undefined);
    expect(api.confirmDraft).toHaveBeenCalledWith('draft-101', expect.objectContaining({ expected_revision: 2, expected_review_hash: 'review-101', expected_preference_version: 3 }), undefined);
    expect(api.preferences).not.toHaveBeenCalled();
    expect(api.reviseDraft).not.toHaveBeenCalled();
  });

  it('reuses an existing reviewed draft without appending or replacing its decisions', async () => {
    const source = { ...ready(), draft: draft() };
    expect((await runner().run(source, 'create')).outcome?.kind).toBe('created');
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(api.reviseDraft).not.toHaveBeenCalled();
  });

  it('saves for later and subsequently creates using that same draft', async () => {
    const operations = runner();
    const saved = await operations.run(ready(), 'save');
    expect(saved.outcome?.kind).toBe('saved');
    expect(api.confirmDraft).not.toHaveBeenCalled();
    expect((await operations.run(saved, 'create')).outcome?.kind).toBe('created');
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('retries only the failed student after another student was created', async () => {
    api.confirmDraft.mockImplementationOnce(async () => payment(101))
      .mockRejectedValueOnce(failure(503)).mockImplementation(async () => payment(102));
    const operations = runner();
    const first = await operations.run(ready(101), 'create');
    const failed = await operations.run(ready(102), 'create');
    expect(failed.outcome).toMatchObject({ kind: 'error', retryable: true });
    expect(await operations.run(first, 'create')).toBe(first);
    expect((await operations.run(failed, 'create')).outcome?.kind).toBe('created');
    expect(api.saveDraft).toHaveBeenCalledTimes(2);
    expect(api.confirmDraft.mock.calls.map(call => call[0])).toEqual(['draft-101', 'draft-102', 'draft-102']);
    expect(api.confirmDraft.mock.calls[1][1]).toEqual(api.confirmDraft.mock.calls[2][1]);
  });

  it('replays a lost save response with its original payload and key before confirming', async () => {
    api.saveDraft.mockRejectedValueOnce(failure()).mockResolvedValueOnce(draft());
    const operations = runner(), failed = await operations.run(ready(), 'create');
    expect(api.confirmDraft).not.toHaveBeenCalled();
    const altered = { ...failed, request: { ...request(), expected_source_fingerprint: 'later-source' }, review: { ...review(), review_hash: 'later-hash' } };
    expect((await operations.run(altered, 'create')).outcome?.kind).toBe('created');
    expect(api.saveDraft.mock.calls[0][1]).toEqual(api.saveDraft.mock.calls[1][1]);
    expect(api.confirmDraft.mock.calls[0][1].expected_review_hash).toBe('review-101');
  });

  it('replays a lost confirm response without replacing the preference version or operation key', async () => {
    api.confirmDraft.mockRejectedValueOnce(failure(503)).mockResolvedValueOnce(payment());
    const operations = runner(), failed = await operations.run(ready(), 'create');
    expect((await operations.run({ ...failed, preferences: { ...preferences(), version: 9 } }, 'create')).outcome?.kind).toBe('created');
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.confirmDraft.mock.calls[0][1]).toEqual(api.confirmDraft.mock.calls[1][1]);
    expect(api.confirmDraft.mock.calls[1][1].expected_preference_version).toBe(3);
  });

  it('keeps a conflict for individual review without automatically saving or retrying', async () => {
    api.confirmDraft.mockRejectedValue(failure(409));
    const operations = runner(), failed = await operations.run(ready(), 'create');
    expect(failed.outcome).toMatchObject({ kind: 'error', retryable: false });
    expect(failed.draft?.id).toBe('draft-101');
    await operations.run(failed, 'create');
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(api.confirmDraft).toHaveBeenCalledTimes(1);
  });

  it('does not turn Save drafts into Create enrollments after an unresolved create', async () => {
    api.confirmDraft.mockRejectedValueOnce(failure(503));
    const operations = runner(), failed = await operations.run(ready(), 'create');
    const result = await operations.run(failed, 'save');
    expect(result.outcome?.kind).not.toBe('created');
    expect(api.confirmDraft).toHaveBeenCalledTimes(1);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps an abort after a potentially committed request retryable with the same body', async () => {
    const controller = new AbortController();
    api.confirmDraft.mockImplementationOnce(async () => { controller.abort(); return payment(); }).mockResolvedValue(payment());
    const operations = runner(), failed = await operations.run(ready(), 'create', controller.signal);
    expect(failed.outcome).toMatchObject({ kind: 'error', retryable: true });
    expect((await operations.run(failed, 'create')).outcome?.kind).toBe('created');
    expect(api.confirmDraft.mock.calls[0][1]).toEqual(api.confirmDraft.mock.calls[1][1]);
  });

  it('does not confirm a save response that has become stale or was concurrently discarded', async () => {
    api.saveDraft.mockResolvedValue({ ...draft(), state: 'discarded', stale_reasons: ['The draft was discarded.'] });
    const result = await runner().run(ready(), 'create');
    expect(result.outcome).toMatchObject({ kind: 'error', retryable: false });
    expect(api.confirmDraft).not.toHaveBeenCalled();
  });

  it.each([
    { draftStorageAvailable: false, workflowWritesAvailable: true },
    { draftStorageAvailable: true, workflowWritesAvailable: false },
  ])('keeps creation unavailable under capability %j', async capabilities => {
    const result = await new BillingBatchRunner(capabilities).run(ready(), 'create');
    expect(result.outcome).toMatchObject({ kind: 'error', retryable: false });
    expect(api.saveDraft).not.toHaveBeenCalled();
    expect(api.confirmDraft).not.toHaveBeenCalled();
  });
});
