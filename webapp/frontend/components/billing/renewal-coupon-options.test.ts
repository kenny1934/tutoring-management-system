import { describe, expect, it, vi } from 'vitest';
import type { BillingCouponBalance, BillingCouponGroup, BillingPreviewCouponOption, BillingPreviewRequest, BillingPreviewResponse } from '@/types/billing';
import { inspectRenewalCoupons, renewalCouponCombineReason, renewalCouponFeedback, renewalCouponMonthLabel } from './renewal-coupon-options';

const request: BillingPreviewRequest = { first_lesson_date: '2026-12-05', mode: 'transition', payment_method: 'autopay',
  slots: [{ weekday: 'Sat' }], materials_fee: 0, trial_deduction: false, mandate_ready: true };
const earlier: BillingCouponGroup = { key: 'earlier200', kind: 'ordinary', value: 200, expires_on: '2026-12-31', quantity: 1, usable_count: 1 };
const later: BillingCouponGroup = { key: 'later300', kind: 'ordinary', value: 300, expires_on: '2027-06-30', quantity: 1, usable_count: 1 };
function balance(groups = [later, earlier]): BillingCouponBalance {
  return { student_id: 4, storage_available: true, writes_available: true, version: 3,
    observation: { id: 'obs', remaining_count: 2, observed_on: '2026-11-12', processed_at: '2026-11-12', source_filename: 'fixture.xls' },
    reserved_count: 0, receipt_pending_count: 0, used_awaiting_sync_count: 0, usable_count: 2, groups,
    checked_at: '2026-11-12', checked_by: 'Fixture', issues: [], uses: [], can_verify: true };
}
function option(overrides: Partial<BillingPreviewCouponOption> = {}): BillingPreviewCouponOption {
  return { period_number: 1, applied: false, reason: 'min_sessions', minimum_sessions: 4,
    can_include_next_month: true, include_next_month_reason: null, include_next_month: '2027-01-01',
    next_month_included: false, ...overrides };
}
function response(scenario: BillingPreviewRequest, metadata: BillingPreviewCouponOption): BillingPreviewResponse {
  // These tests use the calculator's authoritative metadata, without reproducing its fee rules.
  return { coupon_options: [metadata], periods: [{ number: metadata.period_number,
    deductions: metadata.applied && scenario.coupon ? [{ kind: scenario.coupon.kind, amount: scenario.coupon.value }] : [] }] } as BillingPreviewResponse;
}
const empty = { selection: null, option: null, extension: null, extensionOption: null };

describe('renewal coupon inspector', () => {
  it('selects the earliest coupon usable in the current enrollment without extending it', async () => {
    const stock = balance();
    const original = structuredClone(stock.groups);
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => response(scenario,
      option({ applied: true, reason: null, can_include_next_month: false, include_next_month_reason: 'already_eligible' })));
    const result = await inspectRenewalCoupons(stock, request, 1, calculate, new AbortController().signal);
    expect(result.selection).toMatchObject({ studentId: 4, version: 3, group: earlier });
    expect(result.extension).toBeNull();
    expect(calculate).toHaveBeenCalledOnce();
    expect(calculate.mock.calls[0][0]).toMatchObject({ payment_method: 'autopay', trial_deduction: false,
      coupon: { value: 200, verified: true, available_count: 1, combine_next_month: false } });
    expect(stock.groups).toEqual(original);
  });

  it('prefers a coupon usable now over an earlier voucher requiring an extra month', async () => {
    const staff = { ...earlier, key: 'earlier500', kind: 'staff' as const, value: 500 };
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => response(scenario,
      scenario.coupon?.kind === 'staff' ? option({ reason: 'two_months', minimum_sessions: null })
        : option({ applied: true, reason: null, can_include_next_month: false, include_next_month_reason: 'already_eligible' })));
    const result = await inspectRenewalCoupons(balance([later, staff]), request, 1, calculate, new AbortController().signal);
    expect(result.selection?.group).toEqual(later);
    expect(result.extension).toBeNull();
    expect(calculate.mock.calls.map(([scenario]) => scenario.coupon?.value)).toEqual([500, 300]);
  });

  it('offers the earliest combined-eligible coupon without selecting it automatically', async () => {
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => response(scenario, option()));
    const result = await inspectRenewalCoupons(balance(), request, 1, calculate, new AbortController().signal);
    expect(result.selection).toBeNull();
    expect(result.extension?.group).toEqual(earlier);
    expect(result.option).toEqual(result.extensionOption);
    expect(result.extensionOption?.include_next_month).toBe('2027-01-01');
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(calculate.mock.calls.every(([scenario]) => scenario.coupon?.combine_next_month === false)).toBe(true);
  });

  it('skips an earlier coupon expiring before payment and explains the later usable offer', async () => {
    const expiring = { ...earlier, expires_on: '2026-11-15' };
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => response(scenario, scenario.coupon?.value === 200
      ? option({ reason: 'expired', can_include_next_month: false, include_next_month_reason: 'expired' }) : option()));
    const result = await inspectRenewalCoupons(balance([later, expiring]), request, 1, calculate, new AbortController().signal);
    expect(result.selection).toBeNull();
    expect(result.extension?.group).toEqual(later);
    expect(result.option?.reason).toBe('min_sessions');
    expect(renewalCouponFeedback(result.option, false, 3)?.message).toContain('3 sessions');
  });

  it('keeps the enrollment unchanged when an extra month cannot make any coupon eligible', async () => {
    const metadata = option({ can_include_next_month: false, include_next_month_reason: 'still_ineligible' });
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => response(scenario, metadata));
    const result = await inspectRenewalCoupons(balance(), request, 1, calculate, new AbortController().signal);
    expect(result.selection).toBeNull();
    expect(result.extension).toBeNull();
    expect(result.extensionOption).toBeNull();
    expect(result.option).toEqual(metadata);
  });

  it('never uses a deduction or extra-month offer belonging to a later projected enrollment', async () => {
    const calculate = vi.fn(async (scenario: BillingPreviewRequest) => response(scenario,
      option({ period_number: 2, applied: true, reason: null })));
    expect(await inspectRenewalCoupons(balance(), request, 1, calculate, new AbortController().signal)).toEqual(empty);
  });

  it('withholds all offers when the coupon stock is not verified', async () => {
    const stock = { ...balance(), checked_at: null };
    const calculate = vi.fn();
    expect(await inspectRenewalCoupons(stock, request, 1, calculate, new AbortController().signal)).toEqual(empty);
    expect(calculate).not.toHaveBeenCalled();
  });

  it('does not probe stock when its request is already aborted', async () => {
    const controller = new AbortController(); controller.abort();
    const calculate = vi.fn();
    expect(await inspectRenewalCoupons(balance(), request, 1, calculate, controller.signal)).toEqual(empty);
    expect(calculate).not.toHaveBeenCalled();
  });

  it('discards an eligible late response after its source request is aborted', async () => {
    let finish!: (value: BillingPreviewResponse) => void;
    const controller = new AbortController();
    const calculate = vi.fn(() => new Promise<BillingPreviewResponse>(resolve => { finish = resolve; }));
    const pending = inspectRenewalCoupons(balance(), request, 1, calculate, controller.signal);
    controller.abort();
    finish(response({ ...request, coupon: { ...earlier, available_count: 1, verified: true, combine_next_month: false } },
      option({ applied: true, reason: null })));
    expect(await pending).toEqual(empty);
    expect(calculate).toHaveBeenCalledOnce();
  });

  it('propagates a failed check so the parent can offer retry instead of assuming no coupon', async () => {
    const calculate = vi.fn().mockRejectedValue(new Error('Offline'));
    await expect(inspectRenewalCoupons(balance(), request, 1, calculate, new AbortController().signal)).rejects.toThrow('Offline');
    expect(calculate).toHaveBeenCalledOnce();
  });
});

describe('renewal coupon explanations', () => {
  it('shows an informational reason for No coupon and an amber warning after an explicit unusable selection', () => {
    expect(renewalCouponFeedback(option(), false, 3)).toEqual({ tone: 'info', message: 'This enrollment has 3 sessions. At least 4 are required.' });
    expect(renewalCouponFeedback(option(), true, 3)).toEqual({ tone: 'warning', message: 'Coupon not applied. This enrollment has 3 sessions. At least 4 are required.' });
    expect(renewalCouponFeedback(option({ applied: true, reason: null }), true, 8)).toBeUndefined();
    expect(renewalCouponFeedback(null, false)).toBeUndefined();
  });

  it.each(['two_months', 'expired', 'unverified', 'unavailable', 'already_used'] as const)('explains %s using metadata without middot separators', reason => {
    const message = renewalCouponFeedback(option({ reason }), true, 3);
    expect(message?.tone).toBe('warning');
    expect(message?.message).toMatch(/^Coupon not applied\. /);
    expect(message?.message).not.toMatch(/[·•]/);
  });

  it('labels the offered month explicitly and tolerates absent or invalid metadata', () => {
    expect(renewalCouponMonthLabel(option())).toBe('Include January');
    expect(renewalCouponMonthLabel(option({ include_next_month: '2026-12-01' }))).toBe('Include December');
    expect(renewalCouponMonthLabel(option({ include_next_month: 'invalid' }))).toBe('Include next month');
    expect(renewalCouponMonthLabel(null)).toBe('Include next month');
  });

  it.each(['already_eligible', 'legacy', 'adjusted', 'year_end', 'still_ineligible', 'expired', 'unverified', 'unavailable', 'already_used', 'already_combined'] as const)('gives a short unavailable reason for %s', include_next_month_reason => {
    const reason = renewalCouponCombineReason(option({ include_next_month_reason }));
    expect(reason.length).toBeGreaterThan(10);
    expect(reason).not.toMatch(/[·•]/);
    expect(reason).not.toBe('Check the fee calculation first.');
  });
});
