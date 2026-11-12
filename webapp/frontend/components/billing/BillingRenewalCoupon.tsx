'use client';

import Link from 'next/link';
import { Button, Field, Select } from '@/components/controls';
import { formatMOP, formatShortDate } from '@/lib/formatters';
import type { BillingCouponBalance, BillingCouponGroup, BillingPreviewRequest, BillingPreviewResponse } from '@/types/billing';

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

/** Ask the fee calculator so expiry, short payments and staff vouchers follow the same rules as publishing. */
export async function suggestRenewalCoupon(
  balance: BillingCouponBalance,
  request: BillingPreviewRequest,
  periodNumber: number,
  calculate: (request: BillingPreviewRequest, signal: AbortSignal) => Promise<BillingPreviewResponse>,
  signal: AbortSignal,
): Promise<RenewalCouponSelection | null> {
  for (const group of availableRenewalCoupons(balance)) {
    if (signal.aborted) return null;
    const result = await calculate({ ...request, trial_deduction: false, coupon: {
      kind: group.kind, value: group.value, expires_on: group.expires_on,
      available_count: group.usable_count, verified: true, combine_next_month: false,
    } }, signal);
    if (signal.aborted) return null;
    const period = result.periods.find(item => item.number === periodNumber);
    if (period?.deductions.some(item => item.kind === group.kind && item.amount === group.value)) {
      return { studentId: balance.student_id, version: balance.version, group: { ...group } };
    }
  }
  return null;
}

export function matchingRenewalCoupon(balance: BillingCouponBalance | undefined, selection: RenewalCouponSelection | null, checking: boolean) {
  if (checking || !selection || selection.studentId !== balance?.student_id || selection.version !== balance.version) return null;
  return availableRenewalCoupons(balance).find(group => group.key === selection.group.key && group.kind === selection.group.kind
    && group.value === selection.group.value && group.expires_on === selection.group.expires_on && group.usable_count === selection.group.usable_count) ?? null;
}

export function BillingRenewalCoupon({ studentId, balance, checking, failed, selection, disabled, suggesting = false, onSelect, onRetry, combine, canCombine, onCombine }: {
  studentId: number;
  balance?: BillingCouponBalance;
  checking: boolean;
  failed: boolean;
  selection: RenewalCouponSelection | null;
  disabled?: boolean;
  suggesting?: boolean;
  onSelect: (value: RenewalCouponSelection | null) => void;
  onRetry: () => void;
  combine: boolean;
  canCombine: boolean;
  onCombine: (value: boolean) => void;
}) {
  const studentBalance = balance?.student_id === studentId ? balance : undefined;
  const groups = availableRenewalCoupons(studentBalance);
  const selected = matchingRenewalCoupon(studentBalance, selection, checking || failed);
  const unavailable = !checking && !failed && !groups.length;
  return <section aria-label="Renewal coupon" className="space-y-2 text-xs">
    <Field label="Coupon" id="renewal-coupon"><Select id="renewal-coupon" value={selected?.key ?? (selection ? '__changed' : suggesting ? '__suggesting' : '')} disabled={disabled} onChange={event => {
      if (event.target.value && (checking || failed)) return;
      const group = groups.find(item => item.key === event.target.value);
      onSelect(group && studentBalance ? { studentId, version: studentBalance.version, group: { ...group } } : null);
    }}>
      {!selection && suggesting && <option value="__suggesting" disabled>{failed ? 'Select coupon' : 'Checking coupons…'}</option>}
      {selection && !selected && <option value="__changed" disabled>Select coupon again</option>}
      <option value="">No coupon</option>
      {groups.map(group => <option key={group.key} value={group.key} disabled={checking || failed}>{formatMOP(group.value, 0)} {group.kind === 'staff' ? 'staff voucher' : 'coupon'} · expires {formatShortDate(group.expires_on)} · {group.usable_count} available</option>)}
    </Select></Field>
    {checking && <p role="status" className="text-ink-subtle">Checking coupons…</p>}
    {failed && <div role="alert" className="flex items-center gap-2"><span>Could not check coupons.</span><Button size="sm" disabled={disabled} onClick={onRetry}>Retry coupons</Button></div>}
    {unavailable && <p className="text-ink-subtle">{studentBalance?.usable_count === 0 ? 'No coupons available.' : 'Coupon details need checking.'}</p>}
    {!checking && !failed && selection && !selected && <p role="status" className="text-amber-800 dark:text-amber-300">{selection.group.key === '__initial' ? 'Select a coupon to confirm its current details.' : 'Coupon details changed. Select a coupon again.'}</p>}
    <Link href={`/students/${studentId}#student-coupons`} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">{unavailable || failed ? 'Check student coupons' : 'Manage student coupons'}</Link>
    {selected?.kind === 'ordinary' && canCombine && <label className="flex items-start gap-2"><input type="checkbox" checked={combine} disabled={disabled} onChange={event => onCombine(event.target.checked)} />Include next month to reach 4 sessions</label>}
  </section>;
}
