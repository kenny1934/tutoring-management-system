import { fetchAPI } from './api';
import type { BillingBankBranch } from '@/types/billing';
import type { KmsCheckReview, KmsPreviewStatus, KmsApplyResult } from '@/types/kms-coupons';

export const kmsCouponsAPI = {
  status: (signal?: AbortSignal) => fetchAPI<KmsPreviewStatus>('/billing/kms-coupons/status', { signal }),
  check: (branch: BillingBankBranch, signal?: AbortSignal) => fetchAPI<KmsCheckReview>('/billing/kms-coupons/check', { method: 'POST', body: JSON.stringify({ branch }), signal }),
  review: (id: string, signal?: AbortSignal) => fetchAPI<KmsCheckReview>(`/billing/kms-coupons/checks/${encodeURIComponent(id)}`, { signal }),
  apply: (id: string, data: { expected_review_hash: string; idempotency_key: string }, signal?: AbortSignal) => fetchAPI<KmsApplyResult>(`/billing/kms-coupons/checks/${encodeURIComponent(id)}/apply`, { method: 'POST', body: JSON.stringify(data), signal }),
};
