import type { BillingBankBranch, BillingStudent } from './billing';

export interface KmsCoupon {
  number: string;
  company_id: string;
  value: number;
  state: 'active' | 'used';
  issued_on: string | null;
  expires_on: string | null;
  used_on: string | null;
  receipt_reference: string | null;
}
export interface KmsCouponChange {
  coupon: KmsCoupon;
  change: 'active' | 'new' | 'changed' | 'used' | 'expired' | 'missing';
  previous: KmsCoupon | null;
  newly_used: boolean;
  listed_active: boolean;
}
export interface KmsStudentReview {
  company_id: string;
  student: BillingStudent | null;
  status: 'matched' | 'unmatched' | 'review';
  active_count: number;
  previous_count: number | null;
  csm_count: number | null;
  coupons: KmsCouponChange[];
  uses: { use_id: string; payment_id: string | null; legacy_enrollment_id: number | null; value: number; receipt_reference: string | null; state: string; result: 'reserved' | 'awaiting_receipt' | 'matched' | 'link_receipt' | 'review'; coupon_number: string | null }[];
  issues: { code: string; message: string }[];
  update_status?: 'ready' | 'unchanged' | 'review' | 'unmatched';
  update_issues?: { code: string; message: string }[];
  available_after?: number;
}
export interface KmsCheckSummary {
  id: string;
  branch: BillingBankBranch;
  fetched_at: string;
  active_count: number;
}
export interface KmsCheckReview extends KmsCheckSummary {
  previous_fetched_at: string | null;
  source_sha256: string;
  used_years: number[];
  new_count: number;
  changed_count: number;
  used_count: number;
  newly_used_count: number;
  expired_count: number;
  missing_count: number;
  review_count: number;
  unmatched_count: number;
  students: KmsStudentReview[];
  update?: { review_hash: string; ready_count: number; held_count: number; unchanged_count: number; can_apply: boolean; issues: { code: string; message: string }[] };
}
export interface KmsApplyResult {
  check_id: string;
  updated_count: number;
  held_count: number;
  skipped_count: number;
  review: KmsCheckReview;
}
export interface KmsPreviewStatus {
  enabled: boolean;
  branches: BillingBankBranch[];
  latest: KmsCheckSummary[];
}
