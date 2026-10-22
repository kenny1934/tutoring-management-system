import type { BillingPreviewResponse } from '@/types/billing';

export type BillingIssue = BillingPreviewResponse['issues'][number];
export type BillingCheckSeverity = 'blocking' | 'warning' | 'info';
type Check = { label: string; severity: BillingCheckSeverity };

// Keep unknown checks visible as warnings. A new server-side check must never
// disappear just because its short staff-facing label has not been added yet.
const CHECKS: Record<string, Check> = {
  DRAFT_REVIEW: { label: 'Review saved draft', severity: 'warning' },
  STALE_DRAFT: { label: 'Refresh saved draft', severity: 'warning' },
  STALE_DRAFT_COVERAGE: { label: 'Check draft dates', severity: 'warning' },
  MULTIPLE_DRAFTS: { label: 'Choose a draft', severity: 'warning' },
  PAYMENT_PREFERENCE_REQUIRED: { label: 'Record payment preference', severity: 'warning' },
  MULTIPLE_UNPAID_ENROLLMENTS: { label: 'Check unpaid enrollments', severity: 'warning' },
  QUEUE_CALCULATION_REVIEW: { label: 'Check fee calculation', severity: 'warning' },
  SOURCE_OWNERSHIP_REVIEW: { label: 'Check lesson owner', severity: 'blocking' },
  MISSING_ORIGINALS: { label: 'Check session records', severity: 'blocking' },
  ORIGINAL_COUNT_REVIEW: { label: 'Check session count', severity: 'blocking' },
  INCOMPLETE_SCHEDULE: { label: 'Complete timetable', severity: 'blocking' },
  UNSUPPORTED_SCHEDULE: { label: 'Check timetable', severity: 'blocking' },
  PAYMENT_STATUS_REVIEW: { label: 'Check payment status', severity: 'blocking' },
  MAKEUP_CHAIN_REVIEW: { label: 'Check makeup record', severity: 'blocking' },
  OVERLAPPING_ORIGINALS: { label: 'Overlapping sessions', severity: 'blocking' },
  PAID_COVERAGE_GAP: { label: 'Check lesson dates', severity: 'blocking' },
  CONDITIONAL_COVERAGE_GAP: { label: 'Check lesson dates', severity: 'blocking' },
  TOO_MANY_SLOT_CANDIDATES: { label: 'Choose timetable', severity: 'blocking' },
  PARTIAL_SLOT_FORECAST: { label: 'Check each class', severity: 'blocking' },
  COVERAGE_AFTER_YEAR_END: { label: 'Check year-end dates', severity: 'blocking' },
  PRE_YEAR_COVERAGE_REVIEW: { label: 'Starts before this teaching year', severity: 'blocking' },
  MATERIALS_UNCONFIRMED: { label: 'Confirm materials fee', severity: 'blocking' },
  SHORT_FIRST_TRIAL_REVIEW: { label: 'Confirm trial deduction', severity: 'blocking' },
  FIRST_PAYMENT_BELOW_MINIMUM: { label: 'Fewer than 6 sessions', severity: 'warning' },
  TIMETABLE_CHANGE_REVIEW: { label: 'Choose next class', severity: 'warning' },
  OFF_SLOT_ORIGINALS: { label: 'Timetable differs', severity: 'warning' },
  CONTINUING_SLOTS_REVIEW: { label: 'Check twice-weekly classes', severity: 'warning' },
  SUCCESSOR_SLOTS_SELECTED: { label: 'Linked renewals selected', severity: 'warning' },
  CONTINUATION_UNCONFIRMED: { label: 'No upcoming lessons', severity: 'warning' },
  UNPAID_PAST_DATES: { label: 'Past sessions to charge', severity: 'warning' },
  FIRST_PAYMENT_REVIEW: { label: 'Confirm first payment', severity: 'warning' },
  STAGGERED_COVERAGE: { label: 'Different enrollment end dates', severity: 'warning' },
  COMBINED_TRANSITION_REVIEW: { label: 'Check December grouping', severity: 'warning' },
  LEGACY_MULTISLOT_REVIEW: { label: 'Check both renewals', severity: 'warning' },
  COLLECTION_BEFORE_LESSON: { label: 'Check payment timing', severity: 'warning' },
  FIRST_AUTOPAY_TIMING: { label: 'Check next debit date', severity: 'warning' },
  COUPON_UNVERIFIED: { label: 'Check coupon in KMS', severity: 'warning' },
  COUPON_UNAVAILABLE: { label: 'No coupon available', severity: 'warning' },
  COUPON_EXPIRY_REVIEW: { label: 'Check coupon expiry', severity: 'warning' },
  SAVED_COUPON_EXPIRY: { label: 'Check saved coupon expiry', severity: 'warning' },
  ADMIN_ADJUSTMENT: { label: 'End date adjusted', severity: 'warning' },
  HOLIDAY_OPENING_ASSUMED: { label: 'Holiday class', severity: 'info' },
  COUPON_SAVED: { label: 'Coupon saved for later', severity: 'info' },
  TRIAL_COUPON_CHOICE: { label: 'Coupon replaces trial discount', severity: 'info' },
  MANDATE_NOT_READY: { label: 'Check autopay setup', severity: 'info' },
  COVERAGE_ASSUMED: { label: 'Check existing end dates', severity: 'info' },
  SCHEDULE_SELECTION_SCENARIO: { label: 'Classes selected for preview', severity: 'info' },
  PENDING_COVERAGE_ASSUMED: { label: 'After unpaid enrollments', severity: 'info' },
  PENDING_BILLS: { label: 'Unpaid enrollments', severity: 'info' },
  SENT_BILL_REVIEW: { label: 'Message sent', severity: 'info' },
};

export function billingCheck(code: string): Check {
  return CHECKS[code] || { label: 'Check arrangement', severity: 'warning' };
}

export function orderedBillingIssues(issues: BillingIssue[]) {
  const order = { blocking: 0, warning: 1, info: 2 };
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.code}:${issue.period ?? ''}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => order[billingCheck(a.code).severity] - order[billingCheck(b.code).severity]);
}
