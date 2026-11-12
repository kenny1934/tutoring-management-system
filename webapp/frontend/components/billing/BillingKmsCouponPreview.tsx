'use client';

import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import Link from 'next/link';
import { RefreshCw, Ticket } from 'lucide-react';
import { Badge, Button, Field, Input, Segmented, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/contexts/AuthContext';
import { kmsCouponsAPI } from '@/lib/kms-coupons-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import type { BillingBankBranch } from '@/types/billing';
import type { KmsCheckReview, KmsCouponChange, KmsPreviewStatus, KmsStudentReview, KmsApplyResult } from '@/types/kms-coupons';
import { BillingDraftFocus, billingDraftAuthScope } from './BillingDraftReview';
import { BillingCouponEnrollmentLink } from './BillingCouponEnrollmentLink';
import { BillingLegacyCouponReceipt } from './BillingLegacyCouponReceipt';
import { BillingPayments } from './BillingPayments';

type Filter = 'active' | 'changes' | 'review' | 'used' | 'unmatched' | 'all';
const changeLabels = { active: 'Active', new: 'New', changed: 'Changed', used: 'Used', expired: 'Expired', missing: 'Not listed' } as const;
const useLabels = { reserved: 'Reserved in CSM', awaiting_receipt: 'Receipt to record', matched: 'Receipt matches', link_receipt: 'Receipt will be linked', review: 'Check receipt' } as const;

function timestamp(value: string) {
  return new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Macau', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function couponMatches(change: KmsCouponChange, filter: Filter) {
  if (filter === 'used') return change.coupon.state === 'used';
  if (filter === 'changes') return change.newly_used || !['active', 'used'].includes(change.change);
  if (filter === 'active') return change.listed_active;
  return true;
}

export function BillingKmsCouponPreviewButton({ defaultBranch, storageAvailable }: { defaultBranch?: string; storageAvailable: boolean }) {
  const auth = useAuth();
  const scope = billingDraftAuthScope(auth);
  const [open, setOpen] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  if (!auth.isAdmin || auth.isReadOnly || !storageAvailable) return null;
  return <><Button ref={trigger} size="sm" icon={Ticket} onClick={() => setOpen(scope)}>Check KMS coupons</Button>{open === scope && <KmsDialog key={scope} defaultBranch={defaultBranch} trigger={trigger} onClose={() => setOpen(null)} />}</>;
}

function KmsDialog({ defaultBranch, trigger, onClose }: { defaultBranch?: string; trigger: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const [status, setStatus] = useState<KmsPreviewStatus | null>(null);
  const [branch, setBranch] = useState(defaultBranch === 'MSA' || defaultBranch === 'MSB' ? defaultBranch : 'both');
  const [reviews, setReviews] = useState<Partial<Record<BillingBankBranch, KmsCheckReview>>>({});
  const [selected, setSelected] = useState<BillingBankBranch>(defaultBranch === 'MSB' ? 'MSB' : 'MSA');
  const [busy, setBusy] = useState<string | null>('Loading KMS checks…');
  const [failure, setFailure] = useState<string | null>(null);
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);
  const receiptNoticeElement = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (receiptNotice) {
      receiptNoticeElement.current?.focus({ preventScroll: true });
      receiptNoticeElement.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [receiptNotice]);
  const [busyUse, setBusyUse] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ studentId: number; id: string; receipt: boolean } | null>(null);
  const paymentTrigger = useRef<HTMLButtonElement | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<Partial<Record<BillingBankBranch, KmsApplyResult>>>({});
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const { mutate } = useSWRConfig();
  const active = useRef(true);
  const running = useRef(false);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController(); operation.current = controller;
    kmsCouponsAPI.status(controller.signal).then(next => {
      if (active.current && !controller.signal.aborted) setStatus(next);
    }).catch(error => {
      if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not load KMS checks.');
    }).finally(() => { if (active.current && !controller.signal.aborted) setBusy(null); });
    return () => { active.current = false; operation.current?.abort(); };
  }, []);

  async function perform(id?: string, preserveView = false) {
    if (running.current || !status?.enabled || busy) return;
    running.current = true; setFailure(null);
    if (!preserveView) setReceiptNotice(null);
    const controller = new AbortController(); operation.current = controller;
    try {
      const branches: BillingBankBranch[] = branch === 'both' ? ['MSA', 'MSB'] : [branch as BillingBankBranch];
      for (const target of id ? [selected] : branches) {
        setBusy(id ? 'Opening saved check…' : `Reading ${target} coupons…`);
        const next = id ? await kmsCouponsAPI.review(id, controller.signal) : await kmsCouponsAPI.check(target, controller.signal);
        if (!active.current || controller.signal.aborted) return;
        if ((!id && next.branch !== target) || (id && next.id !== id)) throw new Error('The KMS check changed. Open it again.');
        setReviews(previous => ({ ...previous, [next.branch]: next }));
        setSelected(next.branch); if (!preserveView) setFilter(next.update ? (next.update.ready_count ? 'active' : next.update.held_count ? 'review' : 'all') : next.review_count ? 'review' : 'active');
        setApplied(previous => ({ ...previous, [next.branch]: undefined }));
        setStatus(previous => previous ? { ...previous, latest: [...previous.latest.filter(r => r.branch !== next.branch), next] } : previous);
      }
    } catch (error) {
      if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not check KMS coupons.');
    } finally {
      running.current = false;
      if (active.current && !controller.signal.aborted) setBusy(null);
    }
  }
  const review = reviews[selected];
  const applying = busy === 'Updating coupons…';
  const blocked = !!busy || busyUse !== null;
  function receiptSaved() {
    setReceiptNotice('Receipt recorded.');
    void mutate(key => Array.isArray(key) && ['billing-coupons', 'student-coupon', 'billing-student-context', 'billing-receipts', 'billing-receipts-count', 'billing-renewal-queue', 'billing-payment', 'billing-payments'].includes(key[0]));
    if (review) void perform(review.id, true);
  }
  async function applyUpdates() {
    if (running.current || blocked || !review?.update?.can_apply) return;
    running.current = true; setBusy('Updating coupons…'); setFailure(null);
    const controller = new AbortController(); operation.current = controller;
    const signature = JSON.stringify([review.id, review.update.review_hash]);
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    try {
      const next = await kmsCouponsAPI.apply(review.id, { expected_review_hash: review.update.review_hash, idempotency_key: retry.current.key }, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      if (next.check_id !== review.id || next.review.id !== review.id || next.review.branch !== review.branch || next.review.source_sha256 !== review.source_sha256) throw new Error('The KMS update changed. Refresh the review.');
      setReviews(previous => ({ ...previous, [review.branch]: next.review }));
      setApplied(previous => ({ ...previous, [review.branch]: next }));
      setFilter(next.held_count ? 'review' : 'all');
      void mutate(key => Array.isArray(key) && ['billing-coupons', 'student-coupon', 'billing-student-context', 'billing-renewal-queue', 'billing-receipts', 'billing-receipts-count', 'renewal-queue-counts', 'billing-payments', 'billing-payment'].includes(key[0]));
    } catch (error) {
      if (active.current && !controller.signal.aborted) {
        setFailure(error instanceof Error ? error.message : 'Could not update coupons. Retry the update.');
        if ((error as { status?: number }).status === 409) {
          try {
            const fresh = await kmsCouponsAPI.review(review.id, controller.signal);
            if (active.current && !controller.signal.aborted && fresh.id === review.id && fresh.branch === review.branch && fresh.source_sha256 === review.source_sha256) setReviews(previous => ({ ...previous, [review.branch]: fresh }));
          } catch { /* Keep the original conflict visible until the next read. */ }
        }
      }
    } finally {
      running.current = false;
      if (active.current && !controller.signal.aborted) setBusy(null);
    }
  }
  const targets = branch === 'both' ? ['MSA', 'MSB'] : [branch];
  const canRead = status?.enabled && targets.every(b => status.branches.includes(b as BillingBankBranch));
  const visible = review?.students.filter(row => {
    const text = `${row.company_id} ${row.student?.student_name ?? ''}`.toLowerCase();
    if (!text.includes(search.trim().toLowerCase())) return false;
    if (review?.update && filter === 'active') return row.update_status === 'ready';
    if (review?.update && filter === 'review') return row.update_status === 'review';
    if (filter === 'review') return row.status === 'review';
    if (filter === 'unmatched') return !row.student;
    if (filter === 'all') return true;
    return row.coupons.some(c => couponMatches(c, filter));
  }) ?? [];
  return <><Modal isOpen title="KMS coupons" size="xl" onClose={onClose} persistent={applying || busyUse !== null} footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-subtle">{review?.update ? `${review.branch} · ${plural(review.update.ready_count, 'student')} ready${review.update.held_count ? ` · ${review.update.held_count} ${review.update.held_count === 1 ? 'needs' : 'need'} checking` : ''}` : 'Preview only. CSM coupon balances stay unchanged.'}</span><div className="flex gap-2"><Button size="sm" disabled={applying || busyUse !== null} onClick={onClose}>Close</Button>{!!review?.update?.ready_count && <Button size="sm" variant="primary" loading={applying} disabled={blocked || !review.update.can_apply} onClick={() => { void applyUpdates(); }}>Update {plural(review.update.ready_count, 'student')}</Button>}</div></div>}><BillingDraftFocus trigger={trigger}><div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3"><Field label="KMS branch" id="kms-preview-branch" className="w-44"><Select value={branch} disabled={blocked} onChange={e => setBranch(e.target.value)}><option value="both">Both branches</option><option>MSA</option><option>MSB</option></Select></Field><Button size="sm" variant={review?.update ? 'secondary' : 'primary'} icon={RefreshCw} loading={!!busy && !applying} disabled={blocked || !canRead} onClick={() => { void perform(); }}>Read from KMS</Button></div>
    {busy && <p role="status" className="text-sm text-ink-subtle">{busy}</p>}
    {failure && <div role="alert" className="rounded border border-red-300 p-3 text-sm">{failure}</div>}
    {receiptNotice && <p ref={receiptNoticeElement} tabIndex={-1} role="status" className="text-sm font-medium text-accent-ink">{receiptNotice}</p>}
    {applied[selected] && <p role="status" className="text-sm font-medium text-accent-ink">Updated {plural(applied[selected]!.updated_count, 'student')}.</p>}
    {review?.update?.issues.map(issue => <p key={issue.code} className="text-sm text-amber-800 dark:text-amber-300">{issue.message}</p>)}
    {status && !status.enabled && <p className="text-sm">KMS coupon checks have not been enabled yet.</p>}
    {status?.enabled && !canRead && !busy && <p className="text-sm text-ink-subtle">The selected KMS accounts have not been configured.</p>}
    {!review && !!status?.latest.length && <div className="divide-y divide-line rounded border border-line">{status.latest.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><span className="font-medium">{item.branch}</span><span className="ml-2 text-ink-subtle">{timestamp(item.fetched_at)}</span><p className="mt-1 text-xs">{plural(item.active_count, 'active coupon')}</p></div><Button size="sm" disabled={blocked} onClick={() => { setSelected(item.branch); void perform(item.id); }}>View check</Button></div>)}</div>}
    {Object.keys(reviews).length > 1 && <Segmented label="KMS check branch" value={selected} onChange={next => { if (!blocked) { setSelected(next); setReceiptNotice(null); } }} options={(['MSA', 'MSB'] as const).filter(b => reviews[b]).map(value => ({ value, label: value, disabled: blocked }))} />}
    {review && <>
      <div className="flex flex-wrap items-start justify-between gap-2 rounded border border-line bg-wash p-3 text-xs"><div><p className="font-medium">{review.branch} · Checked {timestamp(review.fetched_at)}</p><p className="mt-1 text-ink-subtle">{review.previous_fetched_at ? `Compared with ${timestamp(review.previous_fetched_at)}` : 'First check. Coupon numbers are now recorded for comparison.'}</p></div><Badge>{plural(review.active_count, 'active coupon')}</Badge></div>
      <div className="flex flex-wrap items-center justify-between gap-3"><Segmented label="KMS coupon results" className="max-w-full flex-wrap" value={filter} onChange={next => { if (!blocked) setFilter(next); }} options={review.update ? [
        { value: 'active', label: `Updates (${review.update.ready_count})` },
        { value: 'review', label: `Check (${review.update.held_count})` },
        { value: 'all', label: 'All coupons' },
      ] : [
        { value: 'active', label: `Active (${review.active_count})` },
        ...(review.previous_fetched_at || review.expired_count ? [{ value: 'changes' as const, label: `Changes (${review.new_count + review.changed_count + review.newly_used_count + review.expired_count + review.missing_count})` }] : []),
        { value: 'review', label: `Check (${review.review_count})` },
        { value: 'used', label: `Used (${review.used_count})` },
        ...(review.unmatched_count ? [{ value: 'unmatched' as const, label: `Unmatched (${review.unmatched_count})` }] : []),
      ]} /><Input aria-label="Find student in KMS check" placeholder="Find student" className="w-full sm:w-48" value={search} disabled={blocked} onChange={e => setSearch(e.target.value)} /></div>
      {filter === 'used' && <p className="text-xs text-ink-subtle">KMS usage years checked: {review.used_years.join(', ')}.</p>}
      <div className="space-y-2">{visible.map(row => <StudentRow key={`${review.id}-${row.company_id}-${filter}`} row={row} filter={filter} legacyReceiptsAvailable={!!status?.historical_receipts_enabled} disabled={!!busy} busyUse={busyUse}
        onBusyChange={(useId, value) => { if (value) setReceiptNotice(null); setBusyUse(current => value ? useId : current === useId ? null : current); }} onReceiptSaved={receiptSaved} onEnrollmentChanged={() => { if (review) void perform(review.id, true); }}
        onOpenPayment={(id, receipt, trigger) => { if (!blocked && row.student) { paymentTrigger.current = trigger; setReceiptNotice(null); setPayment({ studentId: row.student.id, id, receipt }); } }} />)}{!visible.length && <p className="py-5 text-sm text-ink-subtle">No students in this view.</p>}</div>
    </>}
  </div></BillingDraftFocus></Modal>{payment && <Modal isOpen title="Payment" size="xl" persistent={busyUse === 'payment'} onClose={() => { if (busyUse !== 'payment') setPayment(null); }}><BillingDraftFocus trigger={paymentTrigger}><BillingPayments inline studentId={payment.studentId} initialPaymentId={payment.id} mode={payment.receipt ? 'receipt' : 'payment'} canWrite onChanged={() => { if (review) void perform(review.id, true); }} onReceiptSaved={receiptSaved} onBusyChange={value => { if (value) setReceiptNotice(null); setBusyUse(value ? 'payment' : null); }} /></BillingDraftFocus></Modal>}</>;
}

function StudentRow({ row, filter, legacyReceiptsAvailable, disabled, busyUse, onBusyChange, onReceiptSaved, onEnrollmentChanged, onOpenPayment }: {
  row: KmsStudentReview; filter: Filter; legacyReceiptsAvailable: boolean; disabled: boolean; busyUse: string | null;
  onBusyChange: (useId: string, busy: boolean) => void; onReceiptSaved: () => void; onEnrollmentChanged: () => void;
  onOpenPayment: (paymentId: string, receipt: boolean, trigger: HTMLButtonElement) => void;
}) {
  const coupons = row.coupons.filter(c => filter === 'all' ? c.listed_active || c.newly_used || ['changed', 'missing', 'expired'].includes(c.change) : couponMatches(c, filter));
  const history = filter === 'all' ? row.coupons.filter(c => c.coupon.state === 'used' && !coupons.includes(c)) : [];
  const issues = row.update_status ? row.update_issues ?? [] : row.issues;
  const held = row.update_status ? row.update_status === 'review' : row.status === 'review';
  return <details className="rounded border border-line bg-surface"><summary className="cursor-pointer p-3 text-sm"><span className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 align-middle"><span className="font-medium">{row.company_id}</span><span>{row.student?.student_name ?? (row.issues.some(i => i.code === 'AMBIGUOUS_STUDENT') ? 'Duplicate student ID' : 'Not in CSM')}</span><span className="text-xs text-ink-subtle">{plural(row.active_count, 'active coupon')}</span>{held ? <Badge tone="warning">Check</Badge> : row.update_status === 'ready' ? <Badge tone="success">Ready</Badge> : row.update_status === 'unchanged' ? <Badge>Up to date</Badge> : null}</span></summary><div className="space-y-3 border-t border-line p-3">
    {row.student && <div className="flex flex-wrap justify-between gap-2 text-xs"><Link className="font-medium text-accent-ink hover:underline" href={`/students/${row.student.id}#student-coupons`}>View student coupons</Link><span className="text-ink-subtle">CSM count: {row.csm_count ?? 'Not recorded'}{row.previous_count !== null ? ` · Previous KMS check: ${row.previous_count}` : ''}</span></div>}
    {row.update_status === 'ready' && row.available_after !== undefined && <p className="text-xs font-medium">Available after update: {plural(row.available_after, 'coupon')}</p>}
    {!!issues.length && <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">{issues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>}
    <div className="grid gap-2 sm:grid-cols-2">{coupons.map(change => <CouponCard key={`${change.coupon.number}-${change.change}`} change={change} />)}</div>
    {!!history.length && <details className="text-xs"><summary className="cursor-pointer text-ink-subtle">{plural(history.length, 'used coupon')}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2">{history.map(change => <CouponCard key={change.coupon.number} change={change} />)}</div></details>}
    {!!row.uses.length && <div className="space-y-2 text-xs"><p className="font-medium">CSM enrollments</p>{row.uses.map(use => <div key={use.use_id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2"><div className="min-w-0 space-y-1"><p>{formatMOP(use.value, 0)} coupon</p>{row.student && <div className="flex flex-wrap gap-2">{(use.enrollment_ids ?? (use.legacy_enrollment_id ? [use.legacy_enrollment_id] : [])).map(id => <BillingCouponEnrollmentLink key={id} enrollmentId={id} studentId={row.student!.id} disabled={disabled || busyUse !== null} onChanged={onEnrollmentChanged} />)}</div>}{use.payment_date && <p className="text-ink-subtle">{use.legacy_enrollment_id ? 'CSM payment entry' : 'Paid'} {formatShortDate(use.payment_date)}</p>}{use.receipt_reference && <p className="break-all text-ink-subtle">Receipt {use.receipt_reference}{use.coupon_number ? ` · CP# ${use.coupon_number}` : ''}</p>}</div><div className="flex flex-wrap items-center gap-2"><Badge tone={['matched', 'link_receipt'].includes(use.result) ? 'success' : use.result === 'review' ? 'warning' : 'neutral'}>{useLabels[use.result]}</Badge>{use.payment_id && <Button size="sm" disabled={disabled || busyUse !== null} onClick={event => onOpenPayment(use.payment_id!, use.state === 'awaiting_receipt' && !use.receipt_reference, event.currentTarget)}>{use.state === 'awaiting_receipt' && !use.receipt_reference ? 'Record receipt' : 'Payment details'}</Button>}</div>{legacyReceiptsAvailable && row.student && use.legacy_enrollment_id && use.state === 'awaiting_receipt' && !use.receipt_reference && <div className="w-full"><BillingLegacyCouponReceipt embedded studentId={row.student.id} useId={use.use_id} disabled={disabled || (busyUse !== null && busyUse !== use.use_id)} onBusyChange={value => onBusyChange(use.use_id, value)} onSaved={onReceiptSaved} /></div>}</div>)}</div>}
  </div></details>;
}

function CouponCard({ change }: { change: KmsCouponChange }) {
  const { coupon, previous } = change;
  return <div className="space-y-2 rounded border border-line bg-wash p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">CP# {coupon.number}</span><Badge tone={change.change === 'new' ? 'success' : ['changed', 'missing'].includes(change.change) ? 'warning' : 'neutral'}>{changeLabels[change.change]}</Badge></div><p className="text-sm font-semibold">{formatMOP(coupon.value, 0)}</p><dl className="grid grid-cols-2 gap-x-3 gap-y-2">{coupon.issued_on && <div><dt className="text-ink-subtle">Issued</dt><dd>{formatShortDate(coupon.issued_on)}</dd></div>}{coupon.expires_on && <div><dt className="text-ink-subtle">Expires</dt><dd>{formatShortDate(coupon.expires_on)}</dd></div>}{coupon.used_on && <div><dt className="text-ink-subtle">Used</dt><dd>{formatShortDate(coupon.used_on)}</dd></div>}{coupon.receipt_reference && <div className="min-w-0"><dt className="text-ink-subtle">Receipt</dt><dd className="break-all">{coupon.receipt_reference}</dd></div>}</dl>{change.change === 'changed' && previous && <p className="text-ink-subtle">Previously {formatMOP(previous.value, 0)}{previous.expires_on ? ` · Expiry ${formatShortDate(previous.expires_on)}` : ''}{previous.issued_on !== coupon.issued_on && previous.issued_on ? ` · Issued ${formatShortDate(previous.issued_on)}` : ''}{previous.receipt_reference !== coupon.receipt_reference && previous.receipt_reference ? ` · Receipt ${previous.receipt_reference}` : ''}{previous.used_on !== coupon.used_on && previous.used_on ? ` · Used ${formatShortDate(previous.used_on)}` : ''}{previous.company_id !== coupon.company_id ? ` · ${previous.company_id}` : ''}</p>}</div>;
}
