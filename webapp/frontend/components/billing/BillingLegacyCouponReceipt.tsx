'use client';

import { useEffect, useId as useReactId, useRef, useState } from 'react';
import { Button, Field, Input } from '@/components/controls';
import { useAuth } from '@/contexts/AuthContext';
import { billingToday } from '@/lib/billing-clock';
import { billingAPI } from '@/lib/billing-api';
import { formatShortDate } from '@/lib/formatters';
import type { BillingCouponBalance } from '@/types/billing';
import { billingDraftAuthScope } from './BillingDraftReview';

interface Props {
  studentId: number;
  useId: string;
  disabled?: boolean;
  embedded?: boolean;
  onSaved: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function BillingLegacyCouponReceipt(props: Props) {
  const auth = useAuth();
  if (!auth.isAdmin || auth.isReadOnly) return null;
  return <ReceiptForm key={`${props.studentId}:${props.useId}:${billingDraftAuthScope(auth)}`} {...props} />;
}

function ReceiptForm({ studentId, useId, disabled, embedded = false, onSaved, onBusyChange }: Props) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<BillingCouponBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [usedOn, setUsedOn] = useState('');
  const [selected, setSelected] = useState(false);
  const inputId = useReactId();
  const notice = useRef<HTMLParagraphElement | null>(null);
  const referenceInput = useRef<HTMLInputElement | null>(null);
  const active = useRef(true);
  const running = useRef(false);
  const reportingBusy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const retry = useRef<{ signature: string; payload: { expected_version: number; idempotency_key: string; receipt_reference: string; coupon_used_on: string; coupon_selected: boolean } } | null>(null);
  const busyCallback = useRef(onBusyChange); busyCallback.current = onBusyChange;
  const savedCallback = useRef(onSaved); savedCallback.current = onSaved;
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; controller.current?.abort(); if (reportingBusy.current) busyCallback.current?.(false); };
  }, []);
  useEffect(() => { if (saved) notice.current?.focus({ preventScroll: true }); }, [saved]);
  const use = balance?.uses.find(item => item.id === useId);
  const eligible = !!balance?.storage_available && balance.writes_available && balance.student_id === studentId
    && !!use && use.payment_id === null && use.legacy_enrollment_id != null
    && use.state === 'awaiting_receipt' && !use.receipt_reference?.trim();
  useEffect(() => {
    if (open && eligible && !loading && !saved && !stale) referenceInput.current?.focus({ preventScroll: true });
  }, [open, eligible, loading, saved, stale]);

  async function load() {
    if (running.current || disabled) return;
    running.current = true; setOpen(true); setLoading(true); setFailure(null); setBalance(null);
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    try {
      const result = await billingAPI.couponBalance(studentId, undefined, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      const item = result.uses.find(value => value.id === useId);
      if (result.student_id !== studentId || !item || item.payment_id !== null || item.legacy_enrollment_id == null) {
        throw new Error('Could not verify this enrollment. Reload receipt details.');
      }
      setBalance(result); setStale(false); retry.current = null;
      setReference(''); setUsedOn(''); setSelected(false);
      if (!result.storage_available || !result.writes_available) setFailure('Receipt recording is unavailable.');
      else if (item.receipt_reference?.trim()) setFailure('A receipt is already recorded for this enrollment.');
      else if (item.state !== 'awaiting_receipt') setFailure('This enrollment is not awaiting a coupon receipt.');
    } catch (error) {
      if (active.current && !abort.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not load receipt details.');
    } finally {
      running.current = false;
      if (active.current && !abort.signal.aborted) setLoading(false);
    }
  }

  const valid = eligible && !!reference.trim() && /^\d{4}-\d{2}-\d{2}$/.test(usedOn) && usedOn <= billingToday() && selected;
  async function save() {
    if (running.current || disabled || stale || !valid || !balance) return;
    running.current = true; setBusy(true); setFailure(null); reportingBusy.current = true; busyCallback.current?.(true);
    const abort = new AbortController(); controller.current = abort;
    const body = { expected_version: balance.version, receipt_reference: reference.trim(), coupon_used_on: usedOn, coupon_selected: selected };
    const signature = JSON.stringify(body);
    if (retry.current?.signature !== signature) retry.current = { signature, payload: { ...body, idempotency_key: crypto.randomUUID() } };
    try {
      const result = await billingAPI.recordLegacyCouponReceipt(studentId, useId, retry.current.payload, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      const recorded = result.uses.find(item => item.id === useId);
      if (result.student_id !== studentId || !recorded || recorded.payment_id !== null
          || recorded.legacy_enrollment_id !== use?.legacy_enrollment_id || recorded.state !== 'receipt_recorded'
          || recorded.receipt_reference?.trim() !== body.receipt_reference || result.version <= balance.version) {
        throw new Error('Could not verify the saved receipt. Retry or reload receipt details.');
      }
      setSaved(true); retry.current = null; savedCallback.current();
    } catch (error) {
      if (active.current && !abort.signal.aborted) {
        setFailure(error instanceof Error ? error.message : 'Could not record the receipt. Retry the save.');
        if ((error as { status?: number }).status === 409) setStale(true);
      }
    } finally {
      running.current = false;
      if (active.current && !abort.signal.aborted) { setBusy(false); reportingBusy.current = false; busyCallback.current?.(false); }
    }
  }

  if (!open) return <Button size="sm" disabled={disabled} onClick={() => { void load(); }}>Record receipt</Button>;
  if (saved) return embedded ? null : <p ref={notice} tabIndex={-1} role="status" className="text-xs font-medium text-accent-ink outline-none">Receipt recorded.</p>;
  return <div className="w-full space-y-2 border-t border-line pt-3">
    {loading && <p role="status" className="text-xs text-ink-subtle">Loading receipt details…</p>}
    {eligible && <form aria-label="Record coupon receipt" className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      {!embedded && <p className="text-xs text-ink-subtle">Enrollment #{use.legacy_enrollment_id}{use.payment_date ? ` · CSM payment entry ${formatShortDate(use.payment_date)}` : ''}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Issued KMS receipt reference" id={`${inputId}-reference`}><Input ref={referenceInput} required maxLength={100} disabled={busy || disabled || stale} value={reference} onChange={event => { setReference(event.target.value); setUsedOn(''); setSelected(false); }} /></Field>
        <Field label="Coupon used on" id={`${inputId}-date`}><Input required type="date" max={billingToday()} disabled={busy || disabled || stale} value={usedOn} onChange={event => setUsedOn(event.target.value)} /></Field>
      </div>
      {use.payment_date && usedOn && usedOn < use.payment_date && <p role="status" className="text-xs text-ink-subtle">Receipt date is earlier than the CSM entry.</p>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy || disabled || stale} checked={selected} onChange={event => setSelected(event.target.checked)} />This receipt is for this enrollment and the coupon was selected in KMS.</label>
      <Button type="submit" size="sm" variant="primary" loading={busy} disabled={busy || disabled || stale || !valid}>Record KMS receipt</Button>
    </form>}
    {failure && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{failure}</p>}
    {(stale || (!loading && !eligible)) && <Button size="sm" disabled={busy || disabled} onClick={() => { void load(); }}>Reload receipt details</Button>}
    <Button size="sm" variant="quiet" disabled={busy || disabled} onClick={() => { controller.current?.abort(); setOpen(false); }}>Cancel</Button>
  </div>;
}
