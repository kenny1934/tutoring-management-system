import { billingAPI } from './billing-api';
import type {
  BillingDraftDetail, BillingDraftReview, BillingDraftReviewRequest, BillingDraftSaveRequest,
  BillingPaymentDetail, BillingPreferences, BillingQueueRow, StudentBillingContext,
} from '@/types/billing';

export type BillingBatchAction = 'save' | 'create';
export interface BillingBatchItem {
  row: BillingQueueRow;
  context: StudentBillingContext | null;
  request: BillingDraftReviewRequest | null;
  review: BillingDraftReview | null;
  draft: BillingDraftDetail | null;
  preferences: BillingPreferences | null;
  reasons: string[];
  creationReasons: string[];
  outcome?: {
    action: BillingBatchAction;
    kind: 'saved' | 'created' | 'error';
    text: string;
    retryable: boolean;
    payment?: BillingPaymentDetail;
  };
}

export interface BillingBatchLoadOptions {
  workflowAvailable: boolean;
  signal?: AbortSignal;
  tutorId?: number;
  draft?: BillingDraftDetail;
}

export function canBatchRenew(row: BillingQueueRow): boolean {
  return (row.origin === 'projection' || row.origin === 'draft')
    && (row.stage === 'prepare' || row.stage === 'attention')
    && (row.origin !== 'draft' || row.enrollment_ids.length > 0)
    && !row.payment_id && !row.payment_ids.length;
}

export function billingBatchReady(item: BillingBatchItem): boolean {
  return !!item.review && !!item.request && !item.reasons.length
    && item.outcome?.kind !== 'created' && item.outcome?.kind !== 'error';
}

function unique(values: string[]) { return [...new Set(values)]; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Could not check this renewal. Try again.'; }
function checkAbort(signal?: AbortSignal) { signal?.throwIfAborted(); }

export function emptyBillingBatchItem(row: BillingQueueRow): BillingBatchItem {
  return { row, context: null, request: null, review: null, draft: null, preferences: null, reasons: [], creationReasons: [] };
}

function draftReasons(draft: BillingDraftDetail): string[] {
  return [
    ...(draft.state === 'discarded' ? ['This draft was discarded.'] : []),
    ...(draft.confirmed_payment_id ? ['Enrollments have already been created. Open the payment.'] : []),
    ...(draft.revision !== draft.current_revision ? ['Review the latest draft revision.'] : []),
    ...draft.stale_reasons,
    ...draft.review.message.blocked_reasons,
    ...(!draft.can_copy && !draft.stale_reasons.length && !draft.review.message.blocked_reasons.length ? ['Review this draft before creating enrollments.'] : []),
  ];
}

function creationReasons(item: BillingBatchItem): string[] {
  const preferences = item.preferences;
  if (!preferences?.payment_method) return ['Save the parent’s payment plan first.'];
  if (preferences.payment_method !== item.review?.scenario.payment_method) return ['The preview differs from the saved payment plan.'];
  if (item.review?.period.collection.method === 'autopay' && !preferences.mandate_ready) return ['Record bank authorisation first.'];
  return [];
}

/** Preparation is read-only. A saved draft retains its exact reviewed decisions. */
export async function loadBillingBatchItem(row: BillingQueueRow, options: BillingBatchLoadOptions): Promise<BillingBatchItem> {
  let item = emptyBillingBatchItem(row);
  const { signal, tutorId } = options;
  try {
    checkAbort(signal);
    if (!canBatchRenew(row)) return { ...item, reasons: ['Open the existing enrollment or payment.'] };
    let draft = options.draft ?? null;
    if (!draft && row.draft_id) draft = await billingAPI.draft(row.draft_id, undefined, signal, tutorId);
    checkAbort(signal);
    if (draft && draft.student_id !== row.student.id) return { ...item, reasons: ['The draft belongs to another student.'] };
    const context = await billingAPI.studentContext(row.student.id, {
      basis: draft?.review.basis ?? 'include_pending', tutor_id: tutorId,
      selected_enrollment_ids: draft?.review.selected_enrollment_ids,
    }, signal);
    checkAbort(signal);
    item = { ...item, context, draft };
    const reasons: string[] = [];
    if (context.student.id !== row.student.id) reasons.push('These records belong to another student.');
    if (context.pending_bill_count > 0 || context.source_blocks.some(block => ['Pending Payment', 'Overdue', 'Unpaid'].includes(block.payment_status))) {
      reasons.push('Review the existing unpaid enrollment first.');
    }
    if (!context.recorded_payment_method && !draft) reasons.push('Choose a payment plan.');
    // A balance alone cannot establish the voucher's value, expiry or use.
    // An individually saved draft records the staff member's deliberate choice.
    if (!draft && (context.coupon_snapshot?.remaining_count ?? 0) > 0) reasons.push('Review the student’s available coupons.');
    if (!draft && context.student.is_staff_referral) reasons.push('Review the staff benefit.');
    if (draft) reasons.push(...draftReasons(draft));
    const scenario = draft?.review.scenario ?? (context.recorded_payment_method && context.suggested_request ? {
      ...context.suggested_request, payment_method: context.recorded_payment_method, mandate_ready: context.mandate_ready === true,
    } : null);
    if (!scenario) {
      if (context.recorded_payment_method || draft) reasons.push('Check the timetable and next lesson date.');
      return { ...item, reasons: unique(reasons) };
    }
    const request: BillingDraftReviewRequest = {
      scenario, basis: context.basis, selected_enrollment_ids: context.selected_enrollment_ids,
      expected_source_fingerprint: context.source_fingerprint, period_number: draft?.review.period.number ?? 1,
      confirmed_checks: draft?.review.confirmed_checks ?? [],
    };
    item = { ...item, request };
    const review = await billingAPI.draftReview(row.student.id, request, signal, tutorId);
    checkAbort(signal);
    reasons.push(...review.message.blocked_reasons);
    if (review.period.total_fee === null || review.period.total_fee <= 0) reasons.push('Confirm the total fee.');
    if (draft && review.review_hash !== draft.review.review_hash) reasons.push('The draft calculation changed. Review and save a revision.');
    item = { ...item, review, reasons: unique(reasons) };
    if (options.workflowAvailable) {
      const preferences = await billingAPI.preferences(row.student.id, tutorId, signal);
      checkAbort(signal);
      item = { ...item, preferences };
    }
    return { ...item, creationReasons: creationReasons(item) };
  } catch (error) {
    checkAbort(signal);
    return { ...item, reasons: unique([...item.reasons, errorText(error)]) };
  }
}

/** Bound parallel reads and retain each student's result when another fails. */
export async function loadBillingBatch(
  rows: BillingQueueRow[], options: BillingBatchLoadOptions,
  onItem: (item: BillingBatchItem) => void,
): Promise<void> {
  const students = [...new Map(rows.map(row => [row.student.id, row])).values()];
  let next = 0;
  async function worker() {
    while (next < students.length) {
      checkAbort(options.signal);
      const row = students[next++];
      const item = await loadBillingBatchItem(row, options);
      checkAbort(options.signal);
      onItem(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, students.length) }, worker));
}

type ConfirmPayload = Parameters<typeof billingAPI.confirmDraft>[1];
interface PendingOperation {
  item: BillingBatchItem;
  action: BillingBatchAction;
  save: BillingDraftSaveRequest | null;
  confirm: ConfirmPayload | null;
  draft: BillingDraftDetail | null;
}

/** Each student uses existing atomic services. Ambiguous retries keep exact bodies. */
export class BillingBatchRunner {
  private operations = new Map<number, PendingOperation>();
  constructor(private capabilities: { draftStorageAvailable: boolean; workflowWritesAvailable: boolean }) {}

  async run(item: BillingBatchItem, action: BillingBatchAction, signal?: AbortSignal): Promise<BillingBatchItem> {
    checkAbort(signal);
    if (item.outcome?.kind === 'created') return item;
    let operation = this.operations.get(item.row.student.id);
    if (operation && operation.action !== action) return {
      ...item, outcome: { action: operation.action, kind: 'error', text: 'Retry the previous action before starting another one.', retryable: true },
    };
    if (!operation) {
      if (!billingBatchReady(item)) return item;
      if (!this.capabilities.draftStorageAvailable) return { ...item, outcome: { action, kind: 'error', text: 'Saving drafts is not available yet.', retryable: false } };
      if (action === 'create' && (!this.capabilities.workflowWritesAvailable || item.creationReasons.length)) return {
        ...item, outcome: { action, kind: 'error', text: !this.capabilities.workflowWritesAvailable ? 'Enrollment creation is not enabled yet.' : item.creationReasons.join(' '), retryable: false },
      };
      operation = {
        item, action, draft: item.draft, confirm: null,
        save: item.draft ? null : {
          review: structuredClone(item.request!), expected_review_hash: item.review!.review_hash, idempotency_key: crypto.randomUUID(),
        },
      };
      this.operations.set(item.row.student.id, operation);
    }
    // Replay an unresolved request before accepting any replacement input.
    const original = operation.item;
    let writeStarted = false;
    try {
      if (!operation.draft) {
        checkAbort(signal);
        writeStarted = true;
        operation.draft = await billingAPI.saveDraft(original.row.student.id, operation.save!, signal);
        checkAbort(signal);
      }
      const draft = operation.draft;
      const blocked = draftReasons(draft);
      if (blocked.length || draft.review.review_hash !== original.review!.review_hash) {
        this.operations.delete(original.row.student.id);
        return { ...original, draft, reasons: unique([...blocked, ...(draft.review.review_hash !== original.review!.review_hash ? ['The calculation changed. Review the draft.'] : [])]), outcome: { action: operation.action, kind: 'error', text: 'Review the saved draft before continuing.', retryable: false } };
      }
      if (operation.action === 'save') {
        this.operations.delete(original.row.student.id);
        return { ...original, draft, outcome: { action: 'save', kind: 'saved', text: 'Draft saved', retryable: false } };
      }
      if (!operation.confirm) operation.confirm = {
        expected_revision: draft.revision, expected_review_hash: original.review!.review_hash,
        expected_preference_version: original.preferences!.version, idempotency_key: crypto.randomUUID(),
      };
      checkAbort(signal);
      writeStarted = true;
      const payment = await billingAPI.confirmDraft(draft.id, operation.confirm, signal);
      checkAbort(signal);
      this.operations.delete(original.row.student.id);
      return { ...original, draft, outcome: { action: 'create', kind: 'created', text: payment.lines.length > 1 ? 'Enrollments created' : 'Enrollment created', retryable: false, payment } };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const retryable = writeStarted && (status === undefined || status >= 500 || status === 408 || status === 429);
      if (!retryable) this.operations.delete(original.row.student.id);
      // Even aborts may follow a committed request. Retain its body for retry.
      return { ...original, draft: operation.draft, outcome: { action: operation.action, kind: 'error', text: errorText(error), retryable } };
    }
  }
}
