import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingRenewalCreator, type RenewalCreationInput } from './billing-renewal-create';
import type { BillingDraftDetail, BillingDraftReview, BillingDraftReviewRequest, BillingPaymentDetail } from '@/types/billing';
const mocks = vi.hoisted(() => ({ preferences: vi.fn(), saveDraft: vi.fn(), reviseDraft: vi.fn(), confirmDraft: vi.fn(), draft: vi.fn(), payment: vi.fn() }));
vi.mock('./billing-api', () => ({ billingAPI: mocks }));
function input(): RenewalCreationInput {
  const scenario = { first_lesson_date: '2026-12-05', slots: [{ weekday: 'Sat', time_slot: '10:00 - 11:30', location: 'MSA', covered_through: '2026-11-28' }], mode: 'existing_student', payment_method: 'manual', mandate_ready: false, materials_fee: 0, trial_deduction: false, coupon: null, adjustment: null };
  return { scope: 'staff-1', studentId: 4, note: '', request: { scenario, basis: 'include_pending', selected_enrollment_ids: [10], expected_source_fingerprint: 'source-1', period_number: 1, confirmed_checks: [] } as BillingDraftReviewRequest,
    review: { review_hash: 'review-1', scenario, period: { total_fee: 1200, collection: { method: 'manual' } }, message: { zh: 'Synthetic fee', en: 'Synthetic fee', blocked_reasons: [] } } as unknown as BillingDraftReview };
}
function saved(value = input()): BillingDraftDetail {
  return { id: 'draft-1', student_id: 4, revision: 1, current_revision: 1, state: 'active', can_copy: true, stale_reasons: [], confirmed_payment_id: null, review: value.review, note: '', created_at: '2026-11-07', created_by_name: 'Admin', history: [] };
}
const payment = { id: 'payment-1', status: 'Pending Payment', lines: [{ enrollment_id: 40 }] } as BillingPaymentDetail;
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.preferences.mockResolvedValue({ student_id: 4, payment_method: 'manual', mandate_ready: false, version: 6 });
  mocks.saveDraft.mockResolvedValue(saved()); mocks.reviseDraft.mockResolvedValue(saved());
  mocks.confirmDraft.mockResolvedValue(payment); mocks.draft.mockResolvedValue(saved()); mocks.payment.mockResolvedValue(payment);
});

describe('one-action renewal creation', () => {
  it('uses checked preferences and the exact reviewed snapshot, then creates an unpaid enrollment', async () => {
    const request = input(); request.note = 'Synthetic note';
    const result = await new BillingRenewalCreator().create(request);
    expect(result).toEqual(payment);
    expect(mocks.saveDraft).toHaveBeenCalledWith(4, expect.objectContaining({ review: request.request, expected_review_hash: 'review-1', note: 'Synthetic note', idempotency_key: expect.any(String) }), undefined);
    expect(mocks.confirmDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ expected_revision: 1, expected_review_hash: 'review-1', expected_preference_version: 6, idempotency_key: expect.any(String) }), undefined);
  });
  it('confirms an exact first enrollment manually while retaining Autopay without bank authorisation', async () => {
    const data = input();
    data.request.scenario = { ...data.request.scenario, mode: 'new_student', payment_method: 'autopay', materials_fee: 100, trial_deduction: true };
    data.request.selected_enrollment_ids = [];
    data.request.intake = { trial_enrollment_id: 70, trial_session_id: 71, slots: [{ tutor_id: 9, renewed_from_enrollment_id: 70 }], materials_override_reason: null };
    data.review.scenario = data.request.scenario;
    mocks.preferences.mockResolvedValue({ student_id: 4, payment_method: 'autopay', mandate_ready: false, version: 8 });
    mocks.saveDraft.mockResolvedValue(saved(data));
    await new BillingRenewalCreator().create(data);
    expect(mocks.saveDraft).toHaveBeenCalledWith(4, expect.objectContaining({ review: data.request }), undefined);
    expect(mocks.confirmDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ expected_preference_version: 8 }), undefined);
  });
  it('asks staff to record an unknown preference before any creation write', async () => {
    mocks.preferences.mockResolvedValue({ student_id: 4, payment_method: null, mandate_ready: false, version: 0 });
    await expect(new BillingRenewalCreator().create(input())).rejects.toThrow('Save Autopay or Manual in Payment plan');
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });
  it('uses a saved bank authorisation without a per-payment checkbox', async () => {
    const data = input(); data.request.scenario.payment_method = 'autopay'; data.request.scenario.mandate_ready = true;
    data.review.scenario = data.request.scenario; data.review.period.collection.method = 'autopay';
    mocks.preferences.mockResolvedValue({ payment_method: 'autopay', mandate_ready: true, version: 8 }); mocks.saveDraft.mockResolvedValue(saved(data));
    await new BillingRenewalCreator().create(data);
    expect(mocks.confirmDraft.mock.calls[0][1].expected_preference_version).toBe(8);
  });
  it.each(['method', 'bank'])('rejects a changed %s before any write', async change => {
    const data = input();
    if (change === 'method') mocks.preferences.mockResolvedValue({ payment_method: 'autopay', mandate_ready: false, version: 7 });
    else { data.request.scenario.payment_method = 'autopay'; data.request.scenario.mandate_ready = true; data.review.scenario = data.request.scenario; data.review.period.collection.method = 'autopay'; mocks.preferences.mockResolvedValue({ payment_method: 'autopay', mandate_ready: false, version: 7 }); }
    await expect(new BillingRenewalCreator().create(data)).rejects.toThrow(change === 'method' ? /payment method changed/ : /Record bank authorisation/);
    expect(mocks.saveDraft).not.toHaveBeenCalled(); expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });
  it('requires the review to catch up after authorisation changes even for a manual first payment', async () => {
    const data = input(); data.request.scenario.payment_method = 'autopay'; data.review.scenario = data.request.scenario;
    mocks.preferences.mockResolvedValue({ payment_method: 'autopay', mandate_ready: true, version: 7 });
    await expect(new BillingRenewalCreator().create(data)).rejects.toThrow(/Bank authorisation changed/);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });
  it.each(['blocked', 'amount'])('does not create a %s review', async reason => {
    const data = input(); if (reason === 'blocked') data.review.message.blocked_reasons = ['Review source']; else data.review.period.total_fee = null;
    await expect(new BillingRenewalCreator().create(data)).rejects.toThrow(/Check the enrollment/);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });
  it('replays the exact save after a lost response', async () => {
    const creator = new BillingRenewalCreator(); const data = input(); mocks.saveDraft.mockRejectedValueOnce(new Error('Network unavailable'));
    await expect(creator.create(data)).rejects.toThrow('Network unavailable');
    const first = mocks.saveDraft.mock.calls[0][1]; await creator.create(data);
    expect(mocks.saveDraft.mock.calls[1][1]).toEqual(first); expect(mocks.confirmDraft).toHaveBeenCalledTimes(1);
  });
  it('replays the exact confirmation after a lost response without creating another draft', async () => {
    const creator = new BillingRenewalCreator(); const data = input(); mocks.confirmDraft.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(creator.create(data)).rejects.toThrow('Connection lost');
    const original = mocks.confirmDraft.mock.calls[0][1]; mocks.preferences.mockResolvedValue({ payment_method: 'manual', mandate_ready: false, version: 99 });
    expect(await creator.create(data)).toEqual(payment); expect(mocks.confirmDraft.mock.calls[1][1]).toEqual(original);
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1); expect(mocks.preferences).toHaveBeenCalledTimes(1);
  });
  it('does not submit edited details while an earlier confirmation is unresolved', async () => {
    const creator = new BillingRenewalCreator(); const data = input(); mocks.confirmDraft.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(creator.create(data)).rejects.toThrow();
    await expect(creator.create({ ...data, note: 'Changed details' })).rejects.toThrow(/previous creation needs checking/);
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1); expect(mocks.confirmDraft).toHaveBeenCalledTimes(1);
  });
  it('recovers an already-confirmed previous attempt instead of creating an edited replacement', async () => {
    const creator = new BillingRenewalCreator(); const data = input(); mocks.confirmDraft.mockRejectedValueOnce(new Error('Connection lost'));
    await expect(creator.create(data)).rejects.toThrow(); mocks.draft.mockResolvedValue({ ...saved(), confirmed_payment_id: 'payment-1' });
    expect(await creator.create({ ...data, note: 'Changed' })).toEqual(payment); expect(mocks.payment).toHaveBeenCalledWith('payment-1', undefined, undefined);
    expect(mocks.confirmDraft).toHaveBeenCalledTimes(1);
  });
  it.each([{ can_copy: false }, { stale_reasons: ['Source changed'] }, { current_revision: 2 }, { student_id: 99 }])('rejects an unsafe saved response: %j', async change => {
    mocks.saveDraft.mockResolvedValue({ ...saved(), ...change });
    await expect(new BillingRenewalCreator().create(input())).rejects.toThrow(/enrollment changed/); expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });
  it('updates an existing review using the expected revision rather than saving a second draft', async () => {
    const data = { ...input(), revisionTarget: { id: 'draft-1', current_revision: 2 } }; mocks.reviseDraft.mockResolvedValue({ ...saved(), revision: 3, current_revision: 3 });
    await new BillingRenewalCreator().create(data);
    expect(mocks.saveDraft).not.toHaveBeenCalled(); expect(mocks.reviseDraft.mock.calls[0][1].expected_revision).toBe(2);
    expect(mocks.confirmDraft.mock.calls[0][1].expected_revision).toBe(3);
  });
  it('coalesces double submission and remembers the completed result', async () => {
    const creator = new BillingRenewalCreator(); const data = input();
    expect(await Promise.all([creator.create(data), creator.create(data)])).toEqual([payment, payment]);
    expect(await creator.create(data)).toEqual(payment); expect(mocks.saveDraft).toHaveBeenCalledTimes(1); expect(mocks.confirmDraft).toHaveBeenCalledTimes(1);
  });
  it('does not start when already aborted', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(new BillingRenewalCreator().create(input(), abort.signal)).rejects.toThrow(); expect(mocks.preferences).not.toHaveBeenCalled();
  });
  it('validates the saved response after an abort and before resuming confirmation', async () => {
    const creator = new BillingRenewalCreator(); const data = input(); const abort = new AbortController();
    mocks.saveDraft.mockImplementationOnce(async () => { abort.abort(); return { ...saved(), can_copy: false }; });
    await expect(creator.create(data, abort.signal)).rejects.toThrow();
    await expect(creator.create(data)).rejects.toThrow(/enrollment changed/); expect(mocks.confirmDraft).not.toHaveBeenCalled();
  });
  it('recovers a completed confirmation after the caller aborts', async () => {
    const creator = new BillingRenewalCreator(); const data = input(); const abort = new AbortController();
    mocks.confirmDraft.mockImplementationOnce(async () => { abort.abort(); return payment; });
    await expect(creator.create(data, abort.signal)).rejects.toThrow(); expect(await creator.create(data)).toEqual(payment);
    expect(mocks.confirmDraft).toHaveBeenCalledTimes(1);
  });
});
