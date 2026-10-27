'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Button, Field, Input, Select, Textarea } from '@/components/controls';
import { Tooltip } from '@/components/ui/tooltip';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/contexts/AuthContext';
import { billingLocalDateTime } from '@/lib/billing-clock';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import type { BillingCouponBalance, BillingCouponGroup, BillingCouponReview, BillingCouponVerification } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingPayments } from './BillingPayments';
import { BillingCouponImportButton } from './BillingCouponImport';

export function BillingCouponPanel({ studentId, branch, legacyCount, onSelect, onChanged, onVersion }: { studentId: number; branch?: string | null; legacyCount?: number; onSelect?: (group: BillingCouponGroup) => void; onChanged?: () => void; onVersion?: (version: number) => void }) {
  const panel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (window.location.hash !== '#student-coupons') return;
    const frame = requestAnimationFrame(() => { panel.current?.scrollIntoView?.({ block: 'start' }); panel.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [studentId]);
  const auth = useAuth();
  const scope = `${studentId}:${billingDraftAuthScope(auth)}`;
  const tutorId = billingDraftTutorId(auth);
  const state = useSWR(['billing-coupons', scope], () => billingAPI.couponBalance(studentId, tutorId), { keepPreviousData: false });
  const balance = state.data?.student_id === studentId ? state.data : undefined;
  const checking = state.isValidating || !!state.error;
  const [open, setOpen] = useState<{ scope: string; balance: BillingCouponBalance } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const { mutate } = useSWRConfig();
  useEffect(() => { if (balance?.storage_available && !checking) onVersion?.(balance.version); }, [balance?.storage_available, balance?.version, checking, onVersion]);
  const changed = () => { void state.mutate(); void mutate(key => Array.isArray(key) && ['billing-student-context', 'student-coupon'].includes(key[0])); onChanged?.(); };
  const nextCheck = !balance?.observation ? 'Import a current KMS list' : balance.issues.some(issue => ['COUPON_RECONCILIATION_REQUIRED', 'UNTRACKED_COUPON_PAYMENT', 'COUPON_GROUP_REVIEW'].includes(issue.code)) ? 'Check earlier coupon uses' : balance.issues.some(issue => issue.code.includes('EXPIRY') || issue.code.includes('REDEMPTION')) ? 'Check coupon expiry' : 'Check coupon values and expiry';
  return <section ref={panel} tabIndex={-1} id="student-coupons" aria-label="KMS coupon balance" className="scroll-mt-24 space-y-3 text-xs">
    {state.error && <div role="alert" className="flex flex-wrap items-center gap-2"><span>Could not check coupons.</span><Button size="sm" onClick={() => { void state.mutate(); }}>Retry coupons</Button></div>}
    {!balance && !state.error && <p role="status" className="text-ink-subtle">Checking coupons…</p>}
    {balance && <>
      {!balance.storage_available ? <p className="text-ink-subtle">Cached KMS count: {balance.legacy_display?.remaining_count ?? legacyCount ?? 'Unknown'} · Check KMS</p> : <>
        <div className="space-y-1"><p className="text-base font-semibold" role="status">{checking ? 'Checking coupons…' : balance.usable_count == null ? nextCheck : `${plural(balance.usable_count, 'coupon')} available`}</p><p className="text-ink-subtle">KMS count: {balance.observation?.remaining_count ?? 'Unknown'}{balance.observation ? ` · ${formatShortDate(balance.observation.observed_on)}` : ''}</p></div>
        <div className="flex flex-wrap gap-2">{[
          { label: 'On unpaid enrollments', count: balance.reserved_count, hint: 'These coupons are reserved for enrollments that have not been paid.' },
          { label: 'Receipts to record', count: balance.receipt_pending_count, hint: 'Record the issued KMS receipt reference for these paid enrollments.' },
          { label: 'Used coupons to check', count: balance.used_awaiting_sync_count, hint: 'These uses stay unavailable until you check whether the KMS count already includes their deduction.' },
        ].filter(item => item.count > 0).map(item => <Tooltip key={item.label} content={item.hint} className="group-focus-within:opacity-100 group-focus-within:scale-100"><button type="button" title={item.hint} aria-label={`${item.label}: ${item.count}. ${item.hint}`} className="rounded border border-line px-2 py-1 text-ink-subtle underline decoration-dotted underline-offset-4">{item.label} <strong className="text-ink-strong">{item.count}</strong></button></Tooltip>)}</div>
        {!!balance.groups.length && <div className="divide-y divide-line rounded border border-line">{balance.groups.map(group => <div key={group.key} className="flex flex-wrap items-center justify-between gap-2 p-2"><div><span className="font-medium">{formatMOP(group.value, 0)} {group.kind === 'staff' ? 'staff voucher' : 'coupon'}</span><p className="mt-1 text-ink-subtle">{group.usable_count == null ? 'Check details' : `${group.usable_count} available`} · {group.quantity} in KMS</p><p className="mt-1 text-ink-subtle">Expires {formatShortDate(group.expires_on)}</p></div>{onSelect && <Button size="sm" disabled={checking || !balance.usable_count || !group.usable_count} onClick={() => onSelect(group)}>Use coupon</Button>}</div>)}</div>}
        {balance.checked_at && <p className="text-ink-subtle">Checked {formatShortDate(balance.checked_at)}{balance.checked_by ? ` by ${balance.checked_by}` : ''}</p>}
        {!!balance.issues.length && <details><summary className="cursor-pointer text-amber-800 dark:text-amber-300">{plural(balance.issues.length, 'check')}</summary><ul className="mt-2 space-y-1">{balance.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></details>}
      </>}
      {auth.isAdmin && !auth.isReadOnly && <div className="flex flex-wrap gap-2">{balance.storage_available && <Button ref={trigger} size="sm" disabled={checking || !balance.can_verify} title={!balance.observation ? 'Import a current KMS list first.' : undefined} onClick={() => setOpen({ scope, balance })}>Verify coupon details</Button>}<BillingCouponImportButton defaultBranch={branch ?? undefined} storageAvailable={balance.storage_available} writesAvailable={balance.writes_available} onChanged={changed} /></div>}
      {open?.scope === scope && auth.isAdmin && !auth.isReadOnly && balance.writes_available && <VerifyDialog key={scope} balance={open.balance} trigger={trigger} onClose={() => setOpen(null)} onSaved={changed} onStale={changed} />}
    </>}
  </section>;
}

function localDateTime() { return billingLocalDateTime(); }
function VerifyDialog({ balance, trigger, onClose, onSaved, onStale }: { balance: BillingCouponBalance; trigger: React.RefObject<HTMLButtonElement | null>; onClose: () => void; onSaved: () => void; onStale: () => void }) {
  const [groups, setGroups] = useState(() => balance.groups.map(group => ({ kind: group.kind, value: String(group.value), expires_on: group.expires_on, quantity: String(group.quantity) })));
  const [checkedAt, setCheckedAt] = useState(localDateTime);
  const [reason, setReason] = useState('');
  const paidUses = balance.uses.filter(use => !use.accounted_in_observation && (use.state === 'awaiting_receipt' || use.state === 'receipt_recorded'));
  const [payment, setPayment] = useState<string | null>(null);
  const paymentTrigger = useRef<HTMLButtonElement | null>(null);
  const [childBusy, setChildBusy] = useState(false);
  const childBusyNow = useRef(false);
  const reportChildBusy = useCallback((value: boolean) => { childBusyNow.current = value; setChildBusy(value); }, []);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<{ body: BillingCouponVerification; value: BillingCouponReview } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const running = useRef(false); const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ hash: string; key: string } | null>(null);
  const notice = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.abort(); }; }, []);
  useLayoutEffect(() => { if (saved) notice.current?.focus(); }, [saved]);
  const valid = !!checkedAt && !!balance.observation && (groups.length > 0 || balance.observation.remaining_count === 0) && groups.every(group => /^\d+$/.test(group.value) && Number(group.value) > 0 && /^\d+$/.test(group.quantity) && Number(group.quantity) > 0 && (group.kind === 'staff' ? Number(group.value) === 500 : Number(group.value) !== 500) && !!group.expires_on) && paidUses.every(use => matches[use.id] === 'yes' || matches[use.id] === 'no');
  function edit() { setReviewed(null); setConfirmed(false); setFailure(null); }
  async function perform(save: boolean) {
    if (running.current || childBusyNow.current || !valid || stale || (save && (!reviewed?.value.can_confirm || !confirmed))) return;
    running.current = true; setBusy(true); setFailure(null);
    const abort = new AbortController(); operation.current = abort;
    try {
      const body: BillingCouponVerification = reviewed?.body ?? { expected_version: balance.version, observation_id: balance.observation!.id, checked_at: new Date(`${checkedAt}+08:00`).toISOString(), groups: groups.map(group => ({ ...group, value: Number(group.value), quantity: Number(group.quantity) })), reconciliations: paidUses.map(use => ({ use_id: use.id, included_in_observation: matches[use.id] === 'yes' })), reason: reason.trim() };
      if (save) {
        if (retry.current?.hash !== reviewed!.value.review_hash) retry.current = { hash: reviewed!.value.review_hash, key: crypto.randomUUID() };
        const result = await billingAPI.verifyCoupons(balance.student_id, { ...body, expected_review_hash: reviewed!.value.review_hash, idempotency_key: retry.current.key }, abort.signal);
        if (!active.current || abort.signal.aborted) return;
        if (result.student_id !== balance.student_id) throw new Error('Could not verify this student. Reopen coupon details.');
        setSaved(true); onSaved();
      } else {
        const result = await billingAPI.reviewCoupons(balance.student_id, body, abort.signal);
        if (!active.current || abort.signal.aborted) return;
        if (result.student_id !== balance.student_id || result.balance.student_id !== balance.student_id || result.expected_version !== balance.version || !/^[a-f0-9]{64}$/.test(result.review_hash)) throw new Error('Coupon details changed. Reopen this review.');
        setReviewed({ body, value: result }); setConfirmed(false);
      }
    } catch (error) { if (active.current && !abort.signal.aborted) { setFailure(error instanceof Error ? error.message : 'Could not save coupon details.'); if ((error as { status?: number }).status === 409) { setStale(true); setConfirmed(false); onStale(); } } }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  return <><Modal isOpen title="Verify coupon details" size="lg" persistent={busy || childBusy} onClose={() => { if (!running.current && !childBusyNow.current) onClose(); }}><BillingDraftFocus trigger={trigger}><div className="space-y-4">
    {saved ? <p ref={notice} tabIndex={-1} role="status">Coupon details saved.</p> : <>
      <p className="text-xs text-ink-subtle">KMS count: {balance.observation?.remaining_count} · {formatShortDate(balance.observation?.observed_on)}</p>
      <Field label="Checked in KMS at" id="coupon-checked-at"><Input type="datetime-local" disabled={busy} value={checkedAt} onChange={event => { edit(); setCheckedAt(event.target.value); }} /></Field>
      <div className="space-y-2">{groups.map((group, index) => <fieldset key={index} className="rounded border border-line p-3"><legend className="px-1 text-xs">Coupon group {index + 1}</legend><div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.1fr_0.8fr_0.7fr_1.1fr_auto]"><Field label="Type" id={`coupon-group-kind-${index}`}><Select disabled={busy} value={group.kind} onChange={event => { edit(); setGroups(current => current.map((item, i) => i === index ? { ...item, kind: event.target.value as 'ordinary' | 'staff' } : item)); }}><option value="ordinary">Ordinary coupon</option><option value="staff">Staff voucher</option></Select></Field>{(['value', 'quantity', 'expires_on'] as const).map(key => <Field key={key} label={{ value: 'Value (MOP)', quantity: 'Quantity in KMS', expires_on: 'Expiry' }[key]} id={`coupon-group-${key}-${index}`}><Input disabled={busy} type={key === 'expires_on' ? 'date' : 'number'} min={1} step="1" value={group[key]} onChange={event => { edit(); setGroups(current => current.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item)); }} /></Field>)}<Button size="sm" variant="quiet" disabled={busy} aria-label={`Remove coupon group ${index + 1}`} onClick={() => { edit(); setGroups(current => current.filter((_, i) => i !== index)); }}>Remove</Button></div></fieldset>)}</div>
      <Button size="sm" disabled={busy} onClick={() => { edit(); setGroups(current => [...current, { kind: 'ordinary', value: '', quantity: '', expires_on: '' }]); }}>Add coupon group</Button>
      {!!paidUses.length && <section className="space-y-3"><h3 className="text-sm font-semibold">Check earlier coupon uses</h3>{paidUses.map(use => <div key={use.id} className="space-y-2 rounded border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><strong>{formatMOP(use.value, 0)} coupon</strong><span className="text-ink-subtle">{use.receipt_reference ? `Receipt ${use.receipt_reference}` : 'Receipt reference not recorded'}</span></div>
        {(use.payment_date || use.first_lesson_date) && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-subtle">{use.payment_date && <span>Paid {formatShortDate(use.payment_date)}</span>}{use.first_lesson_date && use.last_lesson_date && <span>{formatShortDate(use.first_lesson_date)} to {formatShortDate(use.last_lesson_date)}</span>}{use.lesson_count != null && <span>{plural(use.lesson_count, 'session')}</span>}</div>}
        <Field label="Has KMS already deducted this coupon in this export?" id={`coupon-use-${use.id}`}><Select disabled={busy} value={matches[use.id] || ''} onChange={event => { edit(); setMatches(current => ({ ...current, [use.id]: event.target.value })); }}><option value="">Choose after checking KMS</option><option value="yes">Yes, already deducted</option><option value="no">No, not yet deducted</option></Select></Field>
        {use.payment_id ? <Button size="sm" variant="quiet" disabled={busy} onClick={event => { paymentTrigger.current = event.currentTarget; setPayment(use.payment_id); }}>Payment details</Button> : use.legacy_enrollment_id != null && <Link className="text-xs text-accent-ink hover:underline" href={`/enrollments/${use.legacy_enrollment_id}`} target="_blank" rel="noopener noreferrer">Enrollment #{use.legacy_enrollment_id}</Link>}
      </div>)}</section>}
      <Field label="Note (optional)" id="coupon-check-reason"><Textarea disabled={busy} value={reason} maxLength={1000} onChange={event => { edit(); setReason(event.target.value); }} /></Field>
      {reviewed && <section className="space-y-2 rounded border border-line p-3"><p className="text-sm">{reviewed.value.balance.usable_count == null ? 'Check KMS before use.' : `${plural(reviewed.value.balance.usable_count, 'coupon')} available`}</p>{reviewed.value.issues.map((issue, index) => <p key={index} className="text-xs text-amber-800 dark:text-amber-300">{issue.message}</p>)}<label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} disabled={busy || stale || !reviewed.value.can_confirm} onChange={event => setConfirmed(event.target.checked)} />These details match KMS.</label></section>}
      <div className="flex flex-wrap justify-end gap-2"><Button size="sm" disabled={busy || stale || !valid} onClick={() => { void perform(false); }}>Review details</Button><Button size="sm" variant="primary" disabled={busy || stale || !reviewed?.value.can_confirm || !confirmed} onClick={() => { void perform(true); }}>Save verified details</Button></div>
    </>}
    {failure && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure}</p>}{stale && <p className="text-xs text-amber-800 dark:text-amber-300">Close and reopen to check the latest KMS record.</p>}
  </div></BillingDraftFocus></Modal>{payment && <Modal isOpen title="Payment" size="xl" persistent={childBusy} onClose={() => { if (!childBusyNow.current) setPayment(null); }}><BillingDraftFocus trigger={paymentTrigger}><BillingPayments inline studentId={balance.student_id} initialPaymentId={payment} canWrite={false} onChanged={() => {}} onBusyChange={reportChildBusy} /></BillingDraftFocus></Modal>}</>;
}
