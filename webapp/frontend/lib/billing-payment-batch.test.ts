import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPaymentBatchItem, paymentBatchIssues, PaymentBatchRunner, queuePaymentBatchAction, type PaymentBatchInput, type PaymentBatchItem, type PaymentBatchTarget } from './billing-payment-batch';
import type { BillingPaymentDetail, BillingQueueRow } from '@/types/billing';

const api = vi.hoisted(() => ({ payment: vi.fn(), markPaymentSent: vi.fn(), recordManualPayment: vi.fn() }));
vi.mock('./billing-api', () => ({ billingAPI: api }));

function target(): PaymentBatchTarget {
  return { paymentId: 'payment-one', student: { id: 4, student_name: 'Synthetic Student', school_student_id: '0004', home_location: 'MSA', grade: 'F1', is_staff_referral: false }, enrollmentIds: [20, 21] };
}
function payment(): BillingPaymentDetail {
  return {
    id: 'payment-one', student_id: 4, version: 2, status: 'Pending Payment', created_at: '2026-10-19', sent_at: null, sent_language: null, paid_at: null, payment_date: null, received_method: null, receipt_reference: null, coupon_status: 'reserved', note: null, can_copy: true, review_issues: [], batch_action_issue: null, history: [],
    lines: [20, 21].map((id, index) => ({ enrollment_id: id, slot_index: index, tutor_id: 7, tutor_name: 'Synthetic Tutor', lesson_count: 4, gross_tuition: 1600, discount_amount: index === 0 ? 300 : 0, tuition_amount: index === 0 ? 1300 : 1600, materials_fee: 0 })),
    review: { student: target().student, source_fingerprint: 'source', evidence_hash: 'evidence', calendar_hash: 'calendar', policy_version: 'policy', review_hash: 'review', basis: 'paid_only', selected_enrollment_ids: [10, 11], confirmed_checks: [], issues: [],
      scenario: { first_lesson_date: '2026-11-02', slots: [{ weekday: 'Mon', location: 'MSA' }, { weekday: 'Thu', location: 'MSA' }], mode: 'transition', payment_method: 'manual', materials_fee: 0, trial_deduction: false, mandate_ready: false },
      message: { template_version: 'v2', zh: 'Synthetic Chinese message', en: 'Synthetic English message', blocked_reasons: [] },
      period: { number: 1, kind: 'transition', explanation: '', coverage_from: '2026-11-01', coverage_through: '2026-12-31', first_lesson_date: '2026-11-02', last_lesson_date: '2026-12-21', lesson_count: 8, counts_by_month: [{ month: '2026-11', lessons: 4 }, { month: '2026-12', lessons: 4 }], counts_by_slot: [4, 4], lessons: [], gross_tuition: 3200, deductions: [{ kind: 'ordinary', amount: 300 }], tuition_after_deductions: 2900, materials_fee: 0, total_fee: 2900, adjustment_reason: null, requires_review: false,
        collection: { method: 'manual', notice_from: '2026-10-12', notice_to: '2026-10-18', debit_from: null, debit_to: null, due_before_lesson: '2026-11-02', gap_min_days: null, gap_max_days: null } } },
  };
}
function reviewed(value = payment()): PaymentBatchItem { return { target: target(), payment: value, issues: [] }; }
const input: PaymentBatchInput = { language: 'en', paymentDate: '2026-10-20', method: 'bank_transfer' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(complete => { resolve = complete; }); return { promise, resolve }; }

beforeEach(() => {
  vi.clearAllMocks();
  api.payment.mockReset().mockImplementation(async () => payment());
  api.markPaymentSent.mockReset().mockImplementation(async (_id, body) => ({ ...payment(), version: 3, sent_at: '2026-10-22T01:00:00', sent_language: body.language }));
  api.recordManualPayment.mockReset().mockImplementation(async (_id, body) => ({ ...payment(), version: 3, status: 'Paid', payment_date: body.payment_date, received_method: body.method }));
});

describe('combined-payment batch eligibility', () => {
  it('offers queue actions only for one confirmed payment and the actual collection method', () => {
    const row = { origin: 'payment', payment_id: 'payment-one', payment_ids: ['payment-one'], stage: 'send', collection: { method: 'manual' }, payment_method: 'autopay' } as BillingQueueRow;
    expect(queuePaymentBatchAction(row)).toBe('sent');
    expect(queuePaymentBatchAction({ ...row, stage: 'awaiting_payment' })).toBe('paid');
    expect(queuePaymentBatchAction({ ...row, stage: 'awaiting_payment', collection: { ...row.collection!, method: 'autopay' } })).toBeNull();
    expect(queuePaymentBatchAction({ ...row, payment_ids: ['payment-one', 'other'] })).toBeNull();
    expect(queuePaymentBatchAction({ ...row, origin: 'legacy' })).toBeNull();
  });

  it.each(['payment id', 'student id', 'review student id', 'enrollment membership'] as const)('blocks a mismatched %s before any write', async field => {
    const value = payment();
    if (field === 'payment id') value.id = 'other';
    if (field === 'student id') value.student_id = 99;
    if (field === 'review student id') value.review.student.id = 99;
    if (field === 'enrollment membership') value.lines[1].enrollment_id = 99;
    api.payment.mockResolvedValue(value);
    const item = await loadPaymentBatchItem(target(), 'paid', 7);
    expect(item.issues).not.toHaveLength(0);
    expect(api.payment).toHaveBeenCalledWith('payment-one', 7, undefined);
    await new PaymentBatchRunner().run(item, 'paid', input);
    expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it('compares the full enrollment set without depending on line order', () => {
    const value = payment(); value.lines.reverse();
    expect(paymentBatchIssues(target(), value, 'paid')).toEqual([]);
    value.lines[1].enrollment_id = value.lines[0].enrollment_id;
    expect(paymentBatchIssues(target(), value, 'paid')).toContain('The linked enrollments changed. Open this payment.');
  });

  it('requires real linked enrollments even when an entry point has no original membership list', () => {
    const fromOverdue = { ...target(), enrollmentIds: undefined };
    expect(paymentBatchIssues(fromOverdue, payment(), 'paid')).toEqual([]);
    const value = payment(); value.lines = [];
    expect(paymentBatchIssues(fromOverdue, value, 'paid')).toContain('The linked enrollments changed. Open this payment.');
  });

  it('freezes native enrollment membership on the first Overdue review and holds a later membership change', async () => {
    const fromOverdue = { ...target(), enrollmentIds: undefined };
    const item = await loadPaymentBatchItem(fromOverdue, 'paid');
    expect(fromOverdue.enrollmentIds).toBeUndefined();
    expect(item.target.enrollmentIds).toEqual([20, 21]); expect(item.issues).toEqual([]);
    const fresh = payment(); fresh.lines[1].enrollment_id = 99;
    api.payment.mockResolvedValue(fresh);
    const result = await new PaymentBatchRunner().run(item, 'paid', input);
    expect(result.issues).toContain('The linked enrollments changed. Open this payment.');
    expect(result.outcome?.retryable).toBe(false); expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it('uses the frozen manual collection even when the family chose Autopay for later periods', async () => {
    const value = payment(); value.review.scenario.payment_method = 'autopay';
    api.payment.mockResolvedValue(value);
    const item = await loadPaymentBatchItem(target(), 'paid');
    expect(item.issues).toEqual([]);
    const result = await new PaymentBatchRunner().run(item, 'paid', input);
    expect(result.outcome?.kind).toBe('done');
    expect(api.recordManualPayment).toHaveBeenCalledOnce();
  });

  it.each(['Autopay', 'bank claim', 'earlier teaching year', 'inactive participation', 'already paid', 'cancelled'] as const)('holds %s payments', async reason => {
    const value = payment();
    if (reason === 'Autopay') value.review.period.collection.method = 'autopay';
    else if (reason === 'already paid') value.status = 'Paid';
    else if (reason === 'cancelled') value.status = 'Cancelled';
    else value.batch_action_issue = `Check ${reason}.`;
    api.payment.mockResolvedValue(value);
    const item = await loadPaymentBatchItem(target(), 'paid');
    expect(item.issues).not.toHaveLength(0);
    await new PaymentBatchRunner().run(item, 'paid', input);
    expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it.each([null, 0, -1, 400.5, Number.MAX_SAFE_INTEGER + 1])('holds invalid full amount %s', amount => {
    const value = payment(); value.review.period.total_fee = amount;
    expect(paymentBatchIssues(target(), value, 'paid')).toContain('Check the full payment amount.');
  });

  it('loads review data without recording Sent, payment or clipboard actions', async () => {
    const clipboard = vi.fn(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
    expect((await loadPaymentBatchItem(target(), 'sent')).issues).toEqual([]);
    expect(api.markPaymentSent).not.toHaveBeenCalled(); expect(api.recordManualPayment).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled();
  });

  it('holds blocked fee messages and already-sent messages', () => {
    const value = payment(); value.can_copy = false; value.review.message.blocked_reasons = ['Check the branch.'];
    expect(paymentBatchIssues(target(), value, 'sent')).toEqual(['Check the branch.', 'Check the fee message first.']);
    value.can_copy = true; value.sent_at = '2026-10-21';
    expect(paymentBatchIssues(target(), value, 'sent')).toEqual(['Message already marked sent.']);
  });
});

describe('explicit per-payment batch execution', () => {
  it('records one full combined amount through the manual endpoint', async () => {
    const result = await new PaymentBatchRunner().run(reviewed(), 'paid', input);
    expect(api.payment).toHaveBeenCalledOnce();
    expect(api.recordManualPayment).toHaveBeenCalledWith('payment-one', { expected_version: 2, idempotency_key: expect.any(String), amount: 2900, payment_date: '2026-10-20', method: 'bank_transfer' }, undefined);
    expect(result.outcome).toEqual({ kind: 'done', text: 'Payment recorded', retryable: false });
    expect(api.markPaymentSent).not.toHaveBeenCalled();
  });

  it('records the explicitly selected message language', async () => {
    const result = await new PaymentBatchRunner().run(reviewed(), 'sent', { ...input, language: 'en' });
    expect(api.markPaymentSent).toHaveBeenCalledWith('payment-one', { language: 'en', expected_version: 2, idempotency_key: expect.any(String) }, undefined);
    expect(result.outcome?.kind).toBe('done');
    expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it('does not mark Sent when the chosen language has no message', async () => {
    const value = payment(); value.review.message.en = null; api.payment.mockResolvedValue(value);
    const result = await new PaymentBatchRunner().run(reviewed(value), 'sent', input);
    expect(result.issues).toContain('This language is not available. Open the fee message.');
    expect(api.markPaymentSent).not.toHaveBeenCalled();
  });

  it.each(['version', 'review hash', 'coverage', 'message', 'lines', 'collection', 'eligibility'] as const)('stops when latest %s changed after review', async field => {
    const fresh = payment();
    if (field === 'version') fresh.version++;
    if (field === 'review hash') fresh.review.review_hash = 'changed';
    if (field === 'coverage') fresh.review.period.coverage_through = '2027-01-31';
    if (field === 'message') fresh.review.message.en = 'Changed fee message';
    if (field === 'lines') fresh.lines[0].tuition_amount++;
    if (field === 'collection') fresh.review.period.collection.method = 'autopay';
    if (field === 'eligibility') fresh.batch_action_issue = 'Payment is already in a bank file.';
    api.payment.mockResolvedValue(fresh);
    const result = await new PaymentBatchRunner().run(reviewed(), 'paid', input);
    expect(result.outcome?.kind).toBe('error'); expect(result.outcome?.retryable).toBe(false);
    expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it.each(['payment identity', 'student identity', 'enrollment set'] as const)('rechecks %s immediately before writing', async change => {
    const fresh = payment();
    if (change === 'payment identity') fresh.id = 'other';
    if (change === 'student identity') fresh.student_id = 99;
    if (change === 'enrollment set') fresh.lines.pop();
    api.payment.mockResolvedValue(fresh);
    const result = await new PaymentBatchRunner().run(reviewed(), 'paid', input);
    expect(result.outcome).toEqual(expect.objectContaining({ kind: 'error', retryable: false }));
    expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-date', '2999-01-01', '2026-02-30', '2026-04-31', '2026-13-01'])('does not write with invalid received date %s', async paymentDate => {
    const result = await new PaymentBatchRunner().run(reviewed(), 'paid', { ...input, paymentDate });
    expect(result.outcome?.kind).toBe('error'); expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it('retries the exact lost-response manual request despite changed fields and current server data', async () => {
    const runner = new PaymentBatchRunner(); api.recordManualPayment.mockRejectedValueOnce(new TypeError('Network response lost.'));
    const failed = await runner.run(reviewed(), 'paid', input);
    expect(failed.outcome).toEqual({ kind: 'error', text: 'Network response lost.', retryable: true });
    const originalRequest = api.recordManualPayment.mock.calls[0][1];
    api.payment.mockRejectedValue(new Error('A retry must not regenerate its evidence.'));
    const result = await runner.run(failed, 'paid', { ...input, method: 'cash', paymentDate: '2026-10-01' });
    expect(result.outcome?.kind).toBe('done'); expect(api.payment).toHaveBeenCalledOnce();
    expect(api.recordManualPayment.mock.calls[1][1]).toEqual(originalRequest);
    expect(api.recordManualPayment.mock.calls[1][1]).toBe(originalRequest);
  });

  it('replays the original Sent language and key after a lost response', async () => {
    const runner = new PaymentBatchRunner(); api.markPaymentSent.mockRejectedValueOnce(new Error('Response lost.'));
    const failed = await runner.run(reviewed(), 'sent', input);
    const first = api.markPaymentSent.mock.calls[0][1];
    const rejectedOtherAction = await runner.run(failed, 'paid', input);
    expect(rejectedOtherAction.outcome?.text).toBe('Retry the previous action first.');
    await runner.run(failed, 'sent', { ...input, language: 'zh' });
    expect(api.markPaymentSent.mock.calls[1][1]).toBe(first); expect(first.language).toBe('en');
    expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it.each([408, 429, 500, 503])('keeps an exact replay for HTTP %s', async status => {
    api.recordManualPayment.mockRejectedValueOnce(Object.assign(new Error('Temporary failure.'), { status }));
    const runner = new PaymentBatchRunner(); const failed = await runner.run(reviewed(), 'paid', input);
    expect(failed.outcome?.retryable).toBe(true); await runner.run(failed, 'paid', input);
    expect(api.recordManualPayment.mock.calls[1][1]).toBe(api.recordManualPayment.mock.calls[0][1]);
  });

  it('does not treat a rejected 409 as an uncertain write and rechecks before another action', async () => {
    api.recordManualPayment.mockRejectedValueOnce(Object.assign(new Error('Payment changed.'), { status: 409 }));
    const runner = new PaymentBatchRunner(); const failed = await runner.run(reviewed(), 'paid', input);
    expect(failed.outcome?.retryable).toBe(false);
    await runner.run(failed, 'paid', input);
    expect(api.payment).toHaveBeenCalledTimes(2);
    expect(api.recordManualPayment.mock.calls[1][1].idempotency_key).not.toBe(api.recordManualPayment.mock.calls[0][1].idempotency_key);
  });

  it('holds an unverifiable write response for exact replay', async () => {
    api.recordManualPayment.mockResolvedValueOnce({ ...payment(), id: 'foreign-payment', status: 'Paid', payment_date: input.paymentDate, received_method: input.method });
    const runner = new PaymentBatchRunner(); const failed = await runner.run(reviewed(), 'paid', input);
    expect(failed.outcome?.retryable).toBe(true);
    expect(failed.outcome?.text).toBe('Could not verify the result. Retry this action.');
    await runner.run(failed, 'paid', input);
    expect(api.recordManualPayment.mock.calls[1][1]).toBe(api.recordManualPayment.mock.calls[0][1]);
  });

  it.each(['student', 'status', 'date', 'method'] as const)('does not accept a manual response with the wrong %s', async field => {
    const result = { ...payment(), status: 'Paid' as const, payment_date: input.paymentDate, received_method: input.method };
    if (field === 'student') result.student_id = 99;
    const response: BillingPaymentDetail = result;
    if (field === 'status') response.status = 'Pending Payment';
    if (field === 'date') response.payment_date = '2026-10-01';
    if (field === 'method') response.received_method = 'cash';
    api.recordManualPayment.mockResolvedValue(response);
    expect((await new PaymentBatchRunner().run(reviewed(), 'paid', input)).outcome).toEqual(expect.objectContaining({ kind: 'error', retryable: true }));
  });

  it.each(['missing sent date', 'another language'] as const)('does not accept a Sent response with %s', async change => {
    const response = payment();
    response.sent_at = change === 'missing sent date' ? null : '2026-10-22';
    response.sent_language = change === 'another language' ? 'zh' : 'en';
    api.markPaymentSent.mockResolvedValue(response);
    expect((await new PaymentBatchRunner().run(reviewed(), 'sent', input)).outcome).toEqual(expect.objectContaining({ kind: 'error', retryable: true }));
  });

  it.each((['paid', 'sent'] as const).flatMap(action =>
    (['review owner', 'review issue', 'enrollment membership', 'total', 'session count'] as const).map(field => ({ action, field }))))('holds $action with malformed returned $field and retries the exact original request', async ({ action, field }) => {
    const response: BillingPaymentDetail = { ...payment(), status: action === 'paid' ? 'Paid' : 'Pending Payment', payment_date: input.paymentDate, received_method: input.method, sent_at: '2026-10-22', sent_language: input.language };
    if (field === 'review owner') response.review.student.id = 99;
    if (field === 'review issue') response.review_issues = ['Check the changed review.'];
    if (field === 'enrollment membership') response.lines[1].enrollment_id = 99;
    if (field === 'total') response.review.period.total_fee = 9999;
    if (field === 'session count') response.review.period.lesson_count++;
    const write = action === 'paid' ? api.recordManualPayment : api.markPaymentSent;
    write.mockResolvedValueOnce(response);
    const runner = new PaymentBatchRunner(); const failed = await runner.run(reviewed(), action, input);
    expect(failed.outcome).toEqual({ kind: 'error', text: 'Could not verify the result. Retry this action.', retryable: true });
    const original = write.mock.calls[0][1];
    const done = await runner.run(failed, action, { ...input, paymentDate: '2026-10-01', method: 'cash', language: 'zh' });
    expect(done.outcome?.kind).toBe('done');
    expect(write.mock.calls[1][1]).toBe(original); expect(api.payment).toHaveBeenCalledOnce();
  });

  it('never reruns a completed item', async () => {
    const runner = new PaymentBatchRunner(); const done = await runner.run(reviewed(), 'paid', input);
    expect(await runner.run(done, 'paid', input)).toBe(done);
    expect(api.payment).toHaveBeenCalledOnce(); expect(api.recordManualPayment).toHaveBeenCalledOnce();
  });

  it('does not write after aborting the final fresh-data read', async () => {
    const controller = new AbortController(); const held = deferred<BillingPaymentDetail>(); api.payment.mockReturnValue(held.promise);
    const run = new PaymentBatchRunner().run(reviewed(), 'paid', input, 7, controller.signal);
    controller.abort(); held.resolve(payment());
    expect((await run).outcome?.kind).toBe('error'); expect(api.recordManualPayment).not.toHaveBeenCalled();
  });

  it('rejects a cancelled load without turning it into a selectable missing record', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(loadPaymentBatchItem(target(), 'paid', 7, controller.signal)).rejects.toThrow();
    expect(api.payment).not.toHaveBeenCalled();
  });
});
