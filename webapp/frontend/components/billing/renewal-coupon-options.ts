import type { BillingCouponBalance, BillingCouponGroup, BillingPreviewCouponOption, BillingPreviewRequest, BillingPreviewResponse } from '@/types/billing';
export interface RenewalCouponSelection {
  studentId: number;
  version: number;
  group: BillingCouponGroup;
}

/** Only fresh, reconciled ledger stock can be offered for a renewal. */
export function availableRenewalCoupons(balance?: BillingCouponBalance) {
  if (!balance?.storage_available || !balance.observation || !balance.checked_at || !(balance.usable_count && balance.usable_count > 0)) return [];
  return balance.groups.filter(group => group.usable_count != null && group.usable_count > 0)
    .sort((a, b) => a.expires_on.localeCompare(b.expires_on) || a.key.localeCompare(b.key));
}

export function matchingRenewalCoupon(balance: BillingCouponBalance | undefined, selection: RenewalCouponSelection | null, checking: boolean) {
  if (checking || !selection || selection.studentId !== balance?.student_id || selection.version !== balance.version) return null;
  return availableRenewalCoupons(balance).find(group => group.key === selection.group.key && group.kind === selection.group.kind
    && group.value === selection.group.value && group.expires_on === selection.group.expires_on && group.usable_count === selection.group.usable_count) ?? null;
}

export interface RenewalCouponOptions {
  selection: RenewalCouponSelection | null;
  option: BillingPreviewCouponOption | null;
  extension: RenewalCouponSelection | null;
  extensionOption: BillingPreviewCouponOption | null;
}

/** A proposal never changes coverage until the admin chooses to include the month. */
export async function inspectRenewalCoupons(
  balance: BillingCouponBalance,
  request: BillingPreviewRequest,
  periodNumber: number,
  calculate: (request: BillingPreviewRequest, signal: AbortSignal) => Promise<BillingPreviewResponse>,
  signal: AbortSignal,
): Promise<RenewalCouponOptions> {
  const result: RenewalCouponOptions = { selection: null, option: null, extension: null, extensionOption: null };
  for (const group of availableRenewalCoupons(balance)) {
    if (signal.aborted) return result;
    const response = await calculate({ ...request, trial_deduction: false, coupon: {
      kind: group.kind, value: group.value, expires_on: group.expires_on,
      available_count: group.usable_count, verified: true, combine_next_month: false,
    } }, signal);
    if (signal.aborted) return result;
    const option = response.coupon_options?.find(item => item.period_number === periodNumber) ?? null;
    const selection = { studentId: balance.student_id, version: balance.version, group: { ...group } };
    result.option ??= option;
    if (response.periods.find(item => item.number === periodNumber)?.deductions.some(item => item.kind === group.kind && item.amount === group.value)) {
      return { selection, option, extension: null, extensionOption: null };
    }
    if (!result.extension && option?.can_include_next_month) {
      result.extension = selection;
      result.extensionOption = option;
    }
  }
  // Prefer explaining a usable next-month offer over an earlier expired group.
  result.option = result.extensionOption ?? result.option;
  return result;
}

/** Retain the selection-only interface for callers that do not need the offer details. */
export async function suggestRenewalCoupon(
  balance: BillingCouponBalance,
  request: BillingPreviewRequest,
  periodNumber: number,
  calculate: (request: BillingPreviewRequest, signal: AbortSignal) => Promise<BillingPreviewResponse>,
  signal: AbortSignal,
): Promise<RenewalCouponSelection | null> {
  return (await inspectRenewalCoupons(balance, request, periodNumber, calculate, signal)).selection;
}

export function renewalCouponFeedback(option: BillingPreviewCouponOption | null | undefined, selected: boolean, lessons?: number) {
  if (!option?.reason || option.applied) return undefined;
  const reason = option.reason === 'min_sessions'
    ? option.minimum_sessions == null ? 'This enrollment has too few sessions for the coupon.'
      : lessons == null ? `This coupon requires at least ${option.minimum_sessions} sessions.`
      : `This enrollment has ${lessons} session${lessons === 1 ? '' : 's'}. At least ${option.minimum_sessions} are required.`
    : option.reason === 'two_months' ? 'Staff vouchers require an enrollment covering two months.'
    : option.reason === 'expired' ? 'The coupon expires before payment.'
    : option.reason === 'unverified' ? 'Check the coupon details before use.'
    : option.reason === 'unavailable' ? 'No coupons are available.'
    : 'The coupon is applied to an earlier enrollment.';
  return { tone: selected ? 'warning' as const : 'info' as const,
    message: `${selected ? 'Coupon not applied. ' : ''}${reason}` };
}

export function renewalCouponMonthLabel(option?: BillingPreviewCouponOption | null) {
  if (!option?.include_next_month) return 'Include next month';
  const month = new Date(`${option.include_next_month}T12:00:00Z`);
  return Number.isNaN(month.getTime()) ? 'Include next month' : `Include ${month.toLocaleString('en', { month: 'long', timeZone: 'UTC' })}`;
}

export function renewalCouponCombineReason(option?: BillingPreviewCouponOption | null) {
  switch (option?.include_next_month_reason) {
    case 'already_eligible': return 'This enrollment already covers enough lessons.';
    case 'legacy': return 'Six-session enrollments keep their original end date.';
    case 'adjusted': return 'The end date has been set manually.';
    case 'year_end': return 'There are no more lessons this teaching year.';
    case 'still_ineligible': return 'Including next month would not meet the coupon rules.';
    case 'expired': return 'The coupon expires before payment.';
    case 'unverified': return 'Check the coupon details first.';
    case 'unavailable': return 'No coupons are available.';
    case 'already_used': return 'The coupon is applied to an earlier enrollment.';
    case 'already_combined': return 'A month is already included in an earlier enrollment.';
    default: return 'Check the fee calculation first.';
  }
}
