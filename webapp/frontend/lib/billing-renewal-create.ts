import { billingAPI } from './billing-api';
import type { BillingDraftDetail, BillingDraftReview, BillingDraftReviewRequest, BillingDraftSaveRequest, BillingPaymentDetail } from '@/types/billing';

export interface RenewalCreationInput {
  scope: string;
  studentId: number;
  request: BillingDraftReviewRequest;
  review: BillingDraftReview;
  note: string;
  revisionTarget?: { id: string; current_revision: number };
}

type ConfirmBody = Parameters<typeof billingAPI.confirmDraft>[1];
interface Attempt {
  key: string;
  input: RenewalCreationInput;
  save: BillingDraftSaveRequest;
  draft: BillingDraftDetail | null;
  confirm: ConfirmBody | null;
}

/** Keep the reviewed snapshot and exact retry bodies behind one Create action. */
export class BillingRenewalCreator {
  private pending: Attempt | null = null;
  private completed = new Map<string, BillingPaymentDetail>();
  private running: { key: string; promise: Promise<BillingPaymentDetail> } | null = null;

  async create(input: RenewalCreationInput, signal?: AbortSignal): Promise<BillingPaymentDetail> {
    signal?.throwIfAborted();
    const key = JSON.stringify(input);
    if (this.running) {
      if (this.running.key === key) return this.running.promise;
      throw new Error('An enrollment is being created. Wait for it to finish.');
    }
    const promise = this.perform(structuredClone(input), signal);
    this.running = { key, promise };
    try { return await promise; }
    finally { if (this.running?.promise === promise) this.running = null; }
  }

  private async perform(input: RenewalCreationInput, signal?: AbortSignal): Promise<BillingPaymentDetail> {
    signal?.throwIfAborted();
    const key = JSON.stringify([input.scope, input.studentId, input.request, input.review.review_hash, input.note, input.revisionTarget]);
    const complete = this.completed.get(key);
    if (complete) return complete;
    if (this.pending && this.pending.key !== key) {
      if (this.pending.confirm) {
        // A changed form must not silently retry a different set of dates.
        const previous = await billingAPI.draft(this.pending.draft!.id, undefined, signal);
        if (previous.confirmed_payment_id) {
          const payment = await billingAPI.payment(previous.confirmed_payment_id, undefined, signal);
          this.completed.set(this.pending.key, payment); this.pending = null;
          return payment;
        }
        throw new Error('The previous creation needs checking. Restore its details before retrying.');
      }
      // An unconfirmed saved review cannot charge or create teaching records.
      this.pending = null;
    }
    let attempt = this.pending;
    try {
      if (!attempt) {
        if (input.review.message.blocked_reasons.length || input.review.period.total_fee === null) {
          throw new Error('Check the enrollment details before creating it.');
        }
        const preference = await billingAPI.preferences(input.studentId, undefined, signal);
        signal?.throwIfAborted();
        if (preference.payment_method !== input.review.scenario.payment_method) {
          throw new Error('The payment method changed. Review the enrollment again.');
        }
        if (input.review.period.collection.method === 'autopay' && !preference.mandate_ready) {
          throw new Error('Record bank authorisation in Payment settings first.');
        }
        if (!!input.request.scenario.mandate_ready !== preference.mandate_ready) {
          throw new Error('Bank authorisation changed. Review the enrollment again.');
        }
        attempt = { key, input: structuredClone(input), draft: null, confirm: null, save: {
          review: structuredClone(input.request), expected_review_hash: input.review.review_hash,
          idempotency_key: crypto.randomUUID(), note: input.note,
        } };
        // Hold the version actually checked for this attempt, including retries.
        attempt.confirm = null;
        this.pending = attempt;
        if (input.revisionTarget) {
          attempt.draft = await billingAPI.reviseDraft(input.revisionTarget.id,
            { ...attempt.save, expected_revision: input.revisionTarget.current_revision }, signal);
        } else attempt.draft = await billingAPI.saveDraft(input.studentId, attempt.save, signal);
        signal?.throwIfAborted();
        this.checkDraft(attempt);
        attempt.confirm = { expected_revision: attempt.draft.revision, expected_review_hash: attempt.input.review.review_hash,
          expected_preference_version: preference.version, idempotency_key: crypto.randomUUID() };
      } else if (!attempt.draft) {
        // The save response may have been lost. Replay exactly that save first.
        const target = attempt.input.revisionTarget;
        attempt.draft = target ? await billingAPI.reviseDraft(target.id,
          { ...attempt.save, expected_revision: target.current_revision }, signal)
          : await billingAPI.saveDraft(attempt.input.studentId, attempt.save, signal);
        signal?.throwIfAborted();
        this.checkDraft(attempt);
      }
      if (!attempt.confirm) {
        this.checkDraft(attempt);
        const preference = await billingAPI.preferences(attempt.input.studentId, undefined, signal);
        signal?.throwIfAborted();
        if (preference.payment_method !== attempt.input.review.scenario.payment_method
          || (attempt.input.review.period.collection.method === 'autopay' && !preference.mandate_ready)
          || preference.mandate_ready !== !!attempt.input.request.scenario.mandate_ready) {
          this.pending = null;
          throw new Error('Payment settings changed. Review the enrollment again.');
        }
        attempt.confirm = { expected_revision: attempt.draft!.revision, expected_review_hash: attempt.input.review.review_hash,
          expected_preference_version: preference.version, idempotency_key: crypto.randomUUID() };
      }
      signal?.throwIfAborted();
      const payment = await billingAPI.confirmDraft(attempt.draft!.id, attempt.confirm, signal);
      this.completed.set(attempt.key, payment); this.pending = null;
      signal?.throwIfAborted();
      return payment;
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status !== undefined && status < 500 && status !== 408 && status !== 429) this.pending = null;
      throw error;
    }
  }

  private checkDraft(attempt: Attempt) {
    const draft = attempt.draft!;
    if (draft.student_id !== attempt.input.studentId || draft.state === 'discarded' || draft.confirmed_payment_id
      || !draft.can_copy || draft.stale_reasons.length || draft.revision !== draft.current_revision
      || draft.review.review_hash !== attempt.input.review.review_hash || draft.review.message.blocked_reasons.length) {
      this.pending = null;
      throw new Error('The enrollment changed. Review the latest dates and fee before creating it.');
    }
  }
}
