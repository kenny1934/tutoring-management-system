'use client';

import Link from 'next/link';
import { useId } from 'react';
import { Button, Field, Select } from '@/components/controls';
import { formatMOP, formatShortDate } from '@/lib/formatters';
import type { BillingCouponBalance } from '@/types/billing';
import { availableRenewalCoupons, matchingRenewalCoupon, type RenewalCouponSelection } from './renewal-coupon-options';
export { availableRenewalCoupons, matchingRenewalCoupon, suggestRenewalCoupon, type RenewalCouponSelection } from './renewal-coupon-options';

export function BillingRenewalCoupon({ studentId, balance, checking, failed, selection, disabled, suggesting = false, onSelect, onRetry, combine, canCombine, onCombine, feedback, combineLabel = 'Include next month', combineReason }: {
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
  feedback?: { tone: 'info' | 'warning'; message: string };
  combineLabel?: string;
  combineReason?: string;
  onCombine: (value: boolean) => void;
}) {
  const combineReasonId = useId();
  const studentBalance = balance?.student_id === studentId ? balance : undefined;
  const groups = availableRenewalCoupons(studentBalance);
  const selected = matchingRenewalCoupon(studentBalance, selection, checking || failed);
  const unavailable = !checking && !failed && !groups.length;
  const staleSelection = !!selection && !selected;
  const combineBlocked = !!disabled || checking || failed || !groups.length || staleSelection || (!combine && !canCombine);
  const unavailableReason = checking ? 'Checking coupons…' : failed ? 'Check student coupons first.'
    : !groups.length ? studentBalance?.usable_count === 0 ? 'No coupons available.' : 'Coupon details need checking.'
    : staleSelection ? 'Select a coupon again.' : combineReason || 'Not available for this enrollment.';
  return <section aria-label="Renewal coupon" className="space-y-2 text-xs">
    <Field label="Coupon" id="renewal-coupon" hint={feedback && <span role="status" className={feedback.tone === 'warning' ? 'text-amber-800 dark:text-amber-300' : 'text-ink-subtle'}>{feedback.message}</span>}><Select id="renewal-coupon" value={selected?.key ?? (selection ? '__changed' : suggesting ? '__suggesting' : '')} disabled={disabled} onChange={event => {
      if (event.target.value && (checking || failed)) return;
      const group = groups.find(item => item.key === event.target.value);
      onSelect(group && studentBalance ? { studentId, version: studentBalance.version, group: { ...group } } : null);
    }}>
      {!selection && suggesting && <option value="__suggesting" disabled>{failed ? 'Select coupon' : 'Checking coupons…'}</option>}
      {selection && !selected && <option value="__changed" disabled>Select coupon again</option>}
      <option value="">No coupon</option>
      {groups.map(group => <option key={group.key} value={group.key} disabled={checking || failed}>{formatMOP(group.value, 0)} {group.kind === 'staff' ? 'staff voucher' : 'coupon'} (expires {formatShortDate(group.expires_on)}; {group.usable_count} available)</option>)}
    </Select></Field>
    {failed && <div role="alert" className="flex items-center gap-2"><span>Could not check coupons.</span><Button size="sm" disabled={disabled} onClick={onRetry}>Retry coupons</Button></div>}
    {!checking && !failed && selection && !selected && <p role="status" className="text-amber-800 dark:text-amber-300">{selection.group.key === '__initial' ? 'Select a coupon to confirm its current details.' : 'Coupon details changed. Select a coupon again.'}</p>}
    <Link href={`/students/${studentId}#student-coupons`} target="_blank" rel="noopener noreferrer" className="text-accent-ink hover:underline">{unavailable || failed ? 'Check student coupons' : 'Manage student coupons'}</Link>
    <div className="space-y-1">
      <label className={`flex items-start gap-2${combineBlocked ? ' text-ink-subtle' : ''}`}><input type="checkbox" checked={combine} disabled={combineBlocked}
        aria-describedby={combineBlocked ? combineReasonId : undefined} onChange={event => { if (!combineBlocked) onCombine(event.target.checked); }} />{combineLabel}</label>
      {combineBlocked && <p id={combineReasonId} role={checking ? 'status' : undefined} className="text-ink-subtle">{unavailableReason}</p>}
    </div>
  </section>;
}
