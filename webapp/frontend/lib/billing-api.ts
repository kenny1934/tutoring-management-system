import { fetchAPI, fetchResponse } from '@/lib/api';
import type { BillingContextBasis, BillingDraftDetail, BillingDraftReview, BillingDraftReviewRequest, BillingDraftSaveRequest, BillingDraftSummary, BillingOptions, BillingPreviewRequest, BillingPreviewResponse, BillingRosterResponse, StudentBillingContext, BillingPreferences, BillingPaymentDetail, BillingRecordPaymentRequest, BillingQueueCounts, BillingQueueResponse, BillingQueueStage } from '@/types/billing';
import type { BillingIntakeContext, BillingAutopayResponse, BillingAutopayStage, BillingAutopayExportScope, BillingAutopayExportPreview, BillingBankRunList, BillingBankRunDetail, BillingBankResultReview } from '@/types/billing';
import type { BillingReceiptTasks, BillingReceiptCount } from '@/types/billing';
import type { BillingCouponBalance, BillingCouponVerification, BillingCouponReview, BillingCouponImport, BillingBankBranch } from '@/types/billing';

function queryString(values: Record<string, string | number | boolean | number[] | undefined>) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach(id => params.append(name, String(id)));
    else if (value !== undefined) params.set(name, String(value));
  }
  return params.toString();
}

export const billingAPI = {
  couponBalance: (id: number, tutorId?: number, signal?: AbortSignal) => fetchAPI<BillingCouponBalance>(`/billing/students/${id}/coupons?${queryString({ tutor_id: tutorId })}`, { signal }),
  reviewCoupons: (id: number, data: BillingCouponVerification, signal?: AbortSignal) => fetchAPI<BillingCouponReview>(`/billing/students/${id}/coupons/review`, { method: 'POST', body: JSON.stringify(data), signal }),
  verifyCoupons: (id: number, data: BillingCouponVerification & { expected_review_hash: string; idempotency_key: string }, signal?: AbortSignal) => fetchAPI<BillingCouponBalance>(`/billing/students/${id}/coupons/verify`, { method: 'POST', body: JSON.stringify(data), signal }),
  previewCouponImport: (file: File, branch: BillingBankBranch, observedOn: string, signal?: AbortSignal) => {
    const form = new FormData(); form.append('file', file); form.append('branch', branch); form.append('observed_on', observedOn);
    return fetchAPI<BillingCouponImport>('/billing/coupon-imports/preview', { method: 'POST', body: form, signal });
  },
  couponImport: (id: string, signal?: AbortSignal) => fetchAPI<BillingCouponImport>(`/billing/coupon-imports/${encodeURIComponent(id)}`, { signal }),
  confirmCouponImport: (id: string, data: { expected_review_hash: string; idempotency_key: string; acknowledge_unmatched: boolean; acknowledge_same_day?: boolean }, signal?: AbortSignal) => fetchAPI<BillingCouponImport>(`/billing/coupon-imports/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(data), signal }),
  receipts: (params: { location?: string; tutor_id?: number; search?: string; offset?: number; limit?: number } = {}) =>
    fetchAPI<BillingReceiptTasks>(`/billing/receipts?${queryString(params)}`),
  receiptCount: (params: { location?: string; tutor_id?: number } = {}) =>
    fetchAPI<BillingReceiptCount>(`/billing/receipts/count?${queryString(params)}`),
  options: () => fetchAPI<BillingOptions>('/billing/options'),
  intakeContext: (studentId: number, params: { trial_enrollment_id?: number; trial_session_id?: number; tutor_id?: number } = {}, signal?: AbortSignal) =>
    fetchAPI<BillingIntakeContext>(`/billing/students/${studentId}/intake-context?${queryString(params)}`, { signal }),
  queue: (params: { collection_month?: string; stage?: BillingQueueStage; search?: string; location?: string; tutor_id?: number; offset?: number; limit?: number } = {}) =>
    fetchAPI<BillingQueueResponse>(`/billing/queue?${queryString(params)}`),
  queueCounts: (params: { collection_month?: string; location?: string; tutor_id?: number } = {}) =>
    fetchAPI<BillingQueueCounts>(`/billing/queue/counts?${queryString(params)}`),
  autopay: (params: { collection_month?: string; stage?: BillingAutopayStage; location?: string; search?: string; tutor_id?: number; offset?: number; limit?: number } = {}) =>
    fetchAPI<BillingAutopayResponse>(`/billing/autopay?${queryString(params)}`),
  autopayExportPreview: (data: BillingAutopayExportScope, signal?: AbortSignal) =>
    fetchAPI<BillingAutopayExportPreview>('/billing/autopay/export-preview', { method: 'POST', body: JSON.stringify(data), signal }),
  autopayExport: (data: BillingAutopayExportScope & { expected_content_hash: string }, signal?: AbortSignal) =>
    fetchResponse('/billing/autopay/export', { method: 'POST', body: JSON.stringify(data), signal }),
  bankRuns: (scope: BillingAutopayExportScope, signal?: AbortSignal) =>
    fetchAPI<BillingBankRunList>(`/billing/autopay/runs?${queryString({ ...scope })}`, { signal }),
  saveBankRun: (data: BillingAutopayExportScope & { expected_content_hash: string; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingBankRunDetail>('/billing/autopay/runs', { method: 'POST', body: JSON.stringify(data), signal }),
  bankRun: (id: string, signal?: AbortSignal) => fetchAPI<BillingBankRunDetail>(`/billing/autopay/runs/${encodeURIComponent(id)}`, { signal }),
  bankRunFile: (id: string, signal?: AbortSignal) => fetchResponse(`/billing/autopay/runs/${encodeURIComponent(id)}/file`, { signal }),
  submitBankRun: (id: string, data: { expected_version: number; idempotency_key: string; bank_batch_no?: string | null }, signal?: AbortSignal) =>
    fetchAPI<BillingBankRunDetail>(`/billing/autopay/runs/${encodeURIComponent(id)}/submitted`, { method: 'POST', body: JSON.stringify(data), signal }),
  discardBankRun: (id: string, data: { expected_version: number; idempotency_key: string; reason: string }, signal?: AbortSignal) =>
    fetchAPI<BillingBankRunDetail>(`/billing/autopay/runs/${encodeURIComponent(id)}/discard`, { method: 'POST', body: JSON.stringify(data), signal }),
  previewBankResult: (id: string, file: File, expectedVersion: number, signal?: AbortSignal) => {
    const form = new FormData(); form.append('file', file); form.append('expected_version', String(expectedVersion));
    return fetchAPI<BillingBankResultReview>(`/billing/autopay/runs/${encodeURIComponent(id)}/results`, { method: 'POST', body: form, signal });
  },
  bankResult: (id: string, importId: string, signal?: AbortSignal) => fetchAPI<BillingBankResultReview>(`/billing/autopay/runs/${encodeURIComponent(id)}/results/${encodeURIComponent(importId)}`, { signal }),
  confirmBankResult: (id: string, importId: string, data: { expected_review_hash: string; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingBankResultReview>(`/billing/autopay/runs/${encodeURIComponent(id)}/results/${encodeURIComponent(importId)}/confirm`, { method: 'POST', body: JSON.stringify(data), signal }),
  preview: (data: BillingPreviewRequest, signal?: AbortSignal) =>
    fetchAPI<BillingPreviewResponse>('/billing/preview', {
      method: 'POST', body: JSON.stringify(data), signal,
    }),
  students: (params: {
    offset?: number; limit?: number; search?: string;
    basis?: BillingContextBasis; tutor_id?: number; location?: string;
  } = {}) => fetchAPI<BillingRosterResponse>(`/billing/students?${queryString(params)}`),
  studentContext: (id: number, params: {
    basis?: BillingContextBasis; tutor_id?: number; selected_enrollment_ids?: number[];
  } = {}, signal?: AbortSignal) => fetchAPI<StudentBillingContext>(`/billing/students/${id}/context?${queryString(params)}`, { signal }),
  draftReview: (studentId: number, data: BillingDraftReviewRequest, signal?: AbortSignal, tutorId?: number) =>
    fetchAPI<BillingDraftReview>(`/billing/students/${studentId}/draft-review${tutorId === undefined ? '' : `?tutor_id=${tutorId}`}`, { method: 'POST', body: JSON.stringify(data), signal }),
  saveDraft: (studentId: number, data: BillingDraftSaveRequest, signal?: AbortSignal) =>
    fetchAPI<BillingDraftDetail>(`/billing/students/${studentId}/drafts`, { method: 'POST', body: JSON.stringify(data), signal }),
  reviseDraft: (id: string, data: BillingDraftSaveRequest & { expected_revision: number }, signal?: AbortSignal) =>
    fetchAPI<BillingDraftDetail>(`/billing/drafts/${encodeURIComponent(id)}/revisions`, { method: 'PUT', body: JSON.stringify(data), signal }),
  studentDrafts: (studentId: number, signal?: AbortSignal, tutorId?: number, includeDiscarded = false) =>
    fetchAPI<BillingDraftSummary[]>(`/billing/students/${studentId}/drafts?${queryString({ tutor_id: tutorId, include_discarded: includeDiscarded || undefined })}`, { signal }),
  draft: (id: string, revision?: number, signal?: AbortSignal, tutorId?: number) =>
    fetchAPI<BillingDraftDetail>(`/billing/drafts/${encodeURIComponent(id)}?${queryString({ revision, tutor_id: tutorId })}`, { signal }),
  discardDraft: (id: string, data: { expected_revision: number; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingDraftDetail>(`/billing/drafts/${encodeURIComponent(id)}/discard`, { method: 'POST', body: JSON.stringify(data), signal }),
  preferences: (studentId: number, tutorId?: number, signal?: AbortSignal) =>
    fetchAPI<BillingPreferences>(`/billing/students/${studentId}/preferences?${queryString({ tutor_id: tutorId })}`, { signal }),
  savePreferences: (studentId: number, data: Pick<BillingPreferences, 'payment_method' | 'mandate_ready'> & { expected_version: number; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingPreferences>(`/billing/students/${studentId}/preferences`, { method: 'PUT', body: JSON.stringify(data), signal }),
  confirmDraft: (id: string, data: { expected_revision: number; expected_review_hash: string; expected_preference_version: number; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail>(`/billing/drafts/${encodeURIComponent(id)}/confirm`, { method: 'POST', body: JSON.stringify(data), signal }),
  payments: (studentId: number, tutorId?: number, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail[]>(`/billing/students/${studentId}/payments?${queryString({ tutor_id: tutorId })}`, { signal }),
  payment: (id: string, tutorId?: number, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail>(`/billing/payments/${encodeURIComponent(id)}?${queryString({ tutor_id: tutorId })}`, { signal }),
  markPaymentSent: (id: string, data: { language: 'zh' | 'en'; expected_version: number; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail>(`/billing/payments/${encodeURIComponent(id)}/sent`, { method: 'POST', body: JSON.stringify(data), signal }),
  recordPayment: (id: string, data: BillingRecordPaymentRequest, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail>(`/billing/payments/${encodeURIComponent(id)}/paid`, { method: 'POST', body: JSON.stringify(data), signal }),
  recordReceipt: (id: string, data: { receipt_reference: string; expected_version: number; idempotency_key: string; coupon_selected?: boolean; coupon_used_on?: string; acknowledge_duplicate_receipt?: boolean }, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail>(`/billing/payments/${encodeURIComponent(id)}/receipt`, { method: 'POST', body: JSON.stringify(data), signal }),
  cancelPayment: (id: string, data: { reason: string; expected_version: number; idempotency_key: string }, signal?: AbortSignal) =>
    fetchAPI<BillingPaymentDetail>(`/billing/payments/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify(data), signal }),
};
