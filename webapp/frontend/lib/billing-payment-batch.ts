import { billingAPI } from './billing-api';
import type { BillingPaymentDetail, BillingQueueRow, BillingStudent } from '@/types/billing';

export type PaymentBatchAction = 'sent' | 'paid';
export interface PaymentBatchTarget {
  paymentId: string;
  student: BillingStudent;
  enrollmentIds?: number[];
}
export interface PaymentBatchInput {
  language: 'zh' | 'en';
  paymentDate: string;
  method: 'cash' | 'bank_transfer';
}
export interface PaymentBatchItem {
  target: PaymentBatchTarget;
  payment: BillingPaymentDetail | null;
  issues: string[];
  outcome?: { kind: 'done' | 'error'; text: string; retryable: boolean };
}

export function queuePaymentBatchAction(row: BillingQueueRow): PaymentBatchAction | null {
  if (row.origin !== 'payment' || !row.payment_id || row.payment_ids.some(id => id !== row.payment_id)) return null;
  if (row.stage === 'send') return 'sent';
  return row.stage === 'awaiting_payment' && row.collection?.method === 'manual' ? 'paid' : null;
}

export function paymentBatchTarget(row: BillingQueueRow): PaymentBatchTarget {
  return { paymentId: row.payment_id!, student: row.student, enrollmentIds: row.enrollment_ids };
}

export function localPaymentDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function paymentBatchDateValid(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > localPaymentDate()) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function errorText(error: unknown) { return error instanceof Error ? error.message : 'Could not update this payment. Try again.'; }
function sorted(ids: number[]) { return [...ids].sort((a, b) => a - b); }

export function paymentBatchIssues(target: PaymentBatchTarget, payment: BillingPaymentDetail, action: PaymentBatchAction): string[] {
  if (payment.id !== target.paymentId || payment.student_id !== target.student.id || payment.review.student.id !== target.student.id) return ['These records belong to another payment.'];
  if (!payment.lines.length || (target.enrollmentIds && JSON.stringify(sorted(payment.lines.map(line => line.enrollment_id))) !== JSON.stringify(sorted(target.enrollmentIds)))) return ['The linked enrollments changed. Open this payment.'];
  const issues = [...payment.review_issues];
  if (payment.batch_action_issue) issues.push(payment.batch_action_issue);
  if (payment.status !== 'Pending Payment') issues.push(payment.status === 'Paid' ? 'Payment already recorded.' : 'Enrollments cancelled.');
  if (action === 'sent') {
    if (payment.sent_at) issues.push('Message already marked sent.');
    if (!payment.can_copy) issues.push(...payment.review.message.blocked_reasons, 'Check the fee message first.');
  } else {
    if (payment.review.period.collection.method !== 'manual') issues.push('Record this collection through the Autopay list.');
    if (!Number.isSafeInteger(payment.review.period.total_fee) || payment.review.period.total_fee! <= 0) issues.push('Check the full payment amount.');
  }
  return [...new Set(issues)];
}

export async function loadPaymentBatchItem(target: PaymentBatchTarget, action: PaymentBatchAction, tutorId?: number, signal?: AbortSignal): Promise<PaymentBatchItem> {
  try {
    signal?.throwIfAborted();
    const payment = await billingAPI.payment(target.paymentId, tutorId, signal);
    signal?.throwIfAborted();
    return { target: { ...target, enrollmentIds: target.enrollmentIds ?? payment.lines.map(line => line.enrollment_id) }, payment, issues: paymentBatchIssues(target, payment, action) };
  } catch (error) {
    signal?.throwIfAborted();
    return { target, payment: null, issues: [errorText(error)] };
  }
}

function evidence(payment: BillingPaymentDetail) {
  return JSON.stringify([payment.id, payment.student_id, payment.version, payment.status, payment.sent_at,
    payment.review.review_hash, payment.review.period, payment.review.message, payment.lines, payment.batch_action_issue,
    payment.can_copy, payment.review_issues]);
}

type SentBody = Parameters<typeof billingAPI.markPaymentSent>[1];
type PaidBody = Parameters<typeof billingAPI.recordManualPayment>[1];
type Pending = { item: PaymentBatchItem; action: 'sent'; body: SentBody } | { item: PaymentBatchItem; action: 'paid'; body: PaidBody };

/** One existing transaction per payment. A lost response retains its exact request. */
export class PaymentBatchRunner {
  private pending = new Map<string, Pending>();

  async run(item: PaymentBatchItem, action: PaymentBatchAction, input: PaymentBatchInput, tutorId?: number, signal?: AbortSignal): Promise<PaymentBatchItem> {
    if (item.outcome?.kind === 'done') return item;
    let operation = this.pending.get(item.target.paymentId);
    if (operation && operation.action !== action) return { ...item, outcome: { kind: 'error', text: 'Retry the previous action first.', retryable: true } };
    let writing = false;
    try {
      signal?.throwIfAborted();
      if (!operation) {
        if (!item.payment || item.issues.length) return item;
        if (action === 'paid' && !paymentBatchDateValid(input.paymentDate)) {
          return { ...item, outcome: { kind: 'error', text: 'Enter the date the payment was received.', retryable: false } };
        }
        const fresh = await loadPaymentBatchItem(item.target, action, tutorId, signal);
        signal?.throwIfAborted();
        if (!fresh.payment || fresh.issues.length) return { ...fresh, outcome: { kind: 'error', text: fresh.issues[0], retryable: false } };
        if (evidence(fresh.payment) !== evidence(item.payment)) return { ...fresh, issues: ['This payment changed. Check it again.'], outcome: { kind: 'error', text: 'This payment changed. Check it again.', retryable: false } };
        if (action === 'sent' && !fresh.payment.review.message[input.language]) return { ...fresh, issues: ['This language is not available. Open the fee message.'] };
        const common = { expected_version: fresh.payment.version, idempotency_key: crypto.randomUUID() };
        operation = action === 'sent'
          ? { item: fresh, action, body: { ...common, language: input.language } }
          : { item: fresh, action, body: { ...common, payment_date: input.paymentDate, method: input.method, amount: fresh.payment.review.period.total_fee! } };
        this.pending.set(item.target.paymentId, operation);
      }
      signal?.throwIfAborted();
      writing = true;
      const result = operation.action === 'sent'
        ? await billingAPI.markPaymentSent(operation.item.target.paymentId, operation.body, signal)
        : await billingAPI.recordManualPayment(operation.item.target.paymentId, operation.body, signal);
      if (result.id !== operation.item.target.paymentId || result.student_id !== operation.item.target.student.id
          || result.review.student.id !== operation.item.target.student.id || result.review_issues.length
          || JSON.stringify(sorted(result.lines.map(line => line.enrollment_id))) !== JSON.stringify(sorted(operation.item.target.enrollmentIds!))
          || result.review.period.total_fee !== operation.item.payment!.review.period.total_fee
          || result.review.period.lesson_count !== operation.item.payment!.review.period.lesson_count
          || (operation.action === 'sent' ? !result.sent_at || result.sent_language !== operation.body.language
            : result.status !== 'Paid' || result.payment_date !== operation.body.payment_date || result.received_method !== operation.body.method)) {
        throw new Error('Could not verify the result. Retry this action.');
      }
      this.pending.delete(item.target.paymentId);
      return { ...operation.item, payment: result, outcome: { kind: 'done', text: operation.action === 'sent' ? 'Message marked sent' : 'Payment recorded', retryable: false } };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const retryable = writing && (status === undefined || status >= 500 || status === 408 || status === 429);
      if (!retryable) this.pending.delete(item.target.paymentId);
      return { ...(operation?.item ?? item), outcome: { kind: 'error', text: errorText(error), retryable } };
    }
  }
}
