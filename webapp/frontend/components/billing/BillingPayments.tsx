'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import useSWR, { useSWRConfig } from 'swr';
import { Check, CreditCard, Send } from 'lucide-react';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/controls';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { Modal } from '@/components/ui/modal';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import type { BillingPaymentDetail, BillingReceiptMethod, BillingReceiptTask } from '@/types/billing';
import { BillingCopyFeedbackNotice, BillingDraftFocus, BillingDraftMessage, BillingDraftSummaryContent, billingDraftAuthScope, billingDraftTutorId, type BillingCopyFeedback } from './BillingDraftReview';

function localToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function BillingPayments({ studentId, refreshKey, initialPaymentId, onChanged, canWrite = false, inline = false, onOpenEnrollment, onBusyChange, sourceBlocked = false, mode = 'payment', receiptTask, receiptFooter, onReceiptSaved, onNextReceipt, nextReceiptDisabled = true, receiptQueueComplete = false }: { receiptQueueComplete?: boolean; mode?: 'payment' | 'receipt'; receiptTask?: BillingReceiptTask; receiptFooter?: HTMLElement | null; onReceiptSaved?: (detail: BillingPaymentDetail) => void; onNextReceipt?: () => void; nextReceiptDisabled?: boolean; sourceBlocked?: boolean; onBusyChange?: (busy: boolean) => void; onOpenEnrollment?: (id: number) => void; inline?: boolean; canWrite?: boolean; studentId: number; refreshKey?: number; initialPaymentId?: string | null; onChanged: () => void }) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const { mutate: refreshCache } = useSWRConfig();
  const scope = `${studentId}:${billingDraftAuthScope(auth)}`;
  const list = useSWR(['billing-payments', scope, refreshKey], () => billingAPI.payments(studentId, tutorId), { keepPreviousData: false });
  const [selection, setSelection] = useState<{ scope: string; id: string } | null>(() => initialPaymentId ? { scope, id: initialPaymentId } : null);
  const selected = selection?.scope === scope ? selection.id : null;
  const details = useSWR(selected ? ['billing-payment', scope, selected] : null, () => billingAPI.payment(selected!, tutorId), { keepPreviousData: false });
  const detail = details.data?.student_id === studentId && details.data?.id === selected ? details.data : null;
  const trigger = useRef<HTMLButtonElement | null>(null);

  const content = <>{details.error ? <div role="alert" className="space-y-2 text-sm"><p>Could not load this payment.</p><Button onClick={() => details.mutate()}>Retry payment</Button></div> : !detail ? <p role="status" className="text-sm text-ink-subtle">Loading payment…</p> : <PaymentContent key={`${scope}:${detail.id}:${canWrite}`} detail={detail} receiptTask={receiptTask} mode={mode} receiptFooter={receiptFooter} onReceiptSaved={onReceiptSaved} onNextReceipt={onNextReceipt} nextReceiptDisabled={nextReceiptDisabled} receiptQueueComplete={receiptQueueComplete} sourceBlocked={sourceBlocked} canWrite={canWrite} onBusyChange={onBusyChange} onOpenEnrollment={onOpenEnrollment} onUpdate={async (next, changed) => { await details.mutate(next, false); if (changed) { void list.mutate().catch(() => {}); void refreshCache(key => Array.isArray(key) && ['billing-receipts', 'billing-receipts-count', 'billing-coupons'].includes(key[0])).catch(() => {}); onChanged(); } else { await list.mutate(); } }} />}</>;

  return <section className="space-y-3" aria-label="Student payments">
    {!inline && <><h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-ink-subtle" aria-hidden="true" />Payments</h2>
    {list.error && <div role="alert" className="flex flex-wrap gap-2 text-sm"><p>Could not load payments.</p><Button size="sm" onClick={() => list.mutate()}>Retry</Button></div>}
    {!list.data && !list.error && <p role="status" className="text-sm text-ink-subtle">Loading payments…</p>}
    {list.data?.length === 0 && <p className="text-sm text-ink-subtle">Create an enrollment from a saved draft to start collecting payment.</p>}
    <div className="grid gap-2 sm:grid-cols-2">{list.data?.filter(item => item.student_id === studentId).map(item => {
      const period = item.review.period;
      const deadline = period.collection.method === 'autopay' ? period.collection.debit_to : period.collection.due_before_lesson;
      const overdue = item.status === 'Pending Payment' && !!deadline && deadline < localToday();
      return <button key={item.id} type="button" onClick={event => { trigger.current = event.currentTarget; setSelection({ scope, id: item.id }); }} className="space-y-2 rounded-md border border-line bg-paper p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.last_lesson_date)}</span><PaymentMethodBadge method={period.collection.method} /></div>
        <p className="text-sm">{plural(period.lesson_count, 'session')} · ${period.total_fee?.toLocaleString('en-US')}</p>
        <div className="flex flex-wrap gap-1.5"><Badge tone={item.status === 'Cancelled' ? 'neutral' : item.status === 'Paid' ? 'success' : overdue ? 'danger' : 'warning'}>{item.status === 'Cancelled' ? 'Cancelled' : item.status === 'Paid' ? 'Paid' : overdue ? 'Overdue' : 'Unpaid'}</Badge>{item.sent_at && <Badge tone="info">Message sent</Badge>}{item.review_issues.length > 0 && <Badge tone="warning">Check enrollment</Badge>}</div>
      </button>;
    })}</div>
    </>}
    {inline ? content : <Modal key={scope} isOpen={!!selected} onClose={() => setSelection(null)} title="Payment" size="xl" className="min-w-0"><BillingDraftFocus trigger={trigger}>{content}</BillingDraftFocus></Modal>}
  </section>;
}

function PaymentContent({ detail, onUpdate, canWrite, onOpenEnrollment, onBusyChange, sourceBlocked, mode, receiptTask, receiptFooter, onReceiptSaved, onNextReceipt, nextReceiptDisabled, receiptQueueComplete }: { receiptQueueComplete: boolean; mode: 'payment' | 'receipt'; receiptTask?: BillingReceiptTask; receiptFooter?: HTMLElement | null; onReceiptSaved?: (detail: BillingPaymentDetail) => void; onNextReceipt?: () => void; nextReceiptDisabled: boolean; sourceBlocked: boolean; onBusyChange?: (busy: boolean) => void; onOpenEnrollment?: (id: number) => void; canWrite: boolean; detail: BillingPaymentDetail; onUpdate: (next: BillingPaymentDetail, changed?: boolean) => Promise<void> }) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const identity = JSON.stringify([detail.id, billingDraftAuthScope(auth)]);
  const current = useRef(identity); current.current = identity;
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ content: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; onBusyChange?.(running.current); return () => { active.current = false; onBusyChange?.(false); }; }, [onBusyChange]);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ version: number; value: BillingCopyFeedback } | null>(null);
  const resultNotice = useRef<HTMLParagraphElement>(null);
  const [unverified, setUnverified] = useState(false);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [collecting, setCollecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [date, setDate] = useState(localToday);
  const [method, setMethod] = useState<BillingReceiptMethod>(detail.review.period.collection.method === 'autopay' ? 'autopay' : 'cash');
  const receiptFormId = useId();
  const receiptInput = useRef<HTMLInputElement | null>(null);
  const [receipt, setReceipt] = useState('');
  const [couponSelected, setCouponSelected] = useState(false);
  const [couponUsedOn, setCouponUsedOn] = useState('');
  const [duplicateReceipt, setDuplicateReceipt] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const couponReceipt = detail.coupon_status !== 'none' || detail.review.period.deductions.some(value => value.kind !== 'trial');
  const receiptProof = receipt.trim() ? { ...(couponReceipt && couponSelected ? { coupon_selected: true } : {}), ...(couponReceipt && couponUsedOn ? { coupon_used_on: couponUsedOn } : {}), ...(duplicateReceipt && duplicateAcknowledged ? { acknowledge_duplicate_receipt: true } : {}) } : {};
  const receiptReady = !receipt.trim() || ((!couponReceipt || couponSelected) && (!duplicateReceipt || duplicateAcknowledged));
  const changeReceipt = (value: string) => { setReceipt(value); setCouponSelected(false); setCouponUsedOn(''); setDuplicateReceipt(false); setDuplicateAcknowledged(false); };
  const [note, setNote] = useState('');
  const [received, setReceived] = useState(false);
  useEffect(() => () => operation.current?.abort(), [identity]);
  useEffect(() => {
    // A completed action can remove the form that held keyboard focus.
    if (notice && document.activeElement === document.body) resultNotice.current?.focus();
  }, [notice]);
  const safe = !detail.review_issues.length && !unverified && !sourceBlocked;
  const canCopy = safe && detail.can_copy;
  useLayoutEffect(() => {
    if (mode !== 'receipt' || detail.receipt_reference || !canWrite) return;
    const frame = requestAnimationFrame(() => receiptInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode, detail.id, canWrite, detail.receipt_reference]);
  const review = canCopy ? detail.review : { ...detail.review, message: { ...detail.review.message, zh: null, en: null, blocked_reasons: detail.review_issues.length ? detail.review_issues : detail.review.message.blocked_reasons.length ? detail.review.message.blocked_reasons : ['Refresh this payment before using the fee message.'] } };

  async function run(kind: 'copy' | 'sent' | 'paid' | 'refresh' | 'receipt' | 'cancel', copyLanguage = language) {
    if ((sourceBlocked && kind !== 'copy' && kind !== 'refresh') || running.current || busy || (kind !== 'copy' && kind !== 'refresh' && (!auth.isAdmin || !canWrite))) return;
    const abort = new AbortController(); operation.current = abort; running.current = true; onBusyChange?.(true); setBusy(true); setNotice(null); setCopyFeedback(null);
    let checkedVersion = detail.version;
    try {
      if (kind === 'copy' || kind === 'refresh') {
        const fresh = await billingAPI.payment(detail.id, tutorId, abort.signal);
        if (abort.signal.aborted || current.current !== identity) return;
        checkedVersion = fresh.version;
        await onUpdate(fresh);
        if (abort.signal.aborted || current.current !== identity) return;
        setUnverified(false);
        if (kind === 'copy') {
          if (!fresh.can_copy || fresh.review_issues.length || fresh.version !== detail.version || fresh.review.review_hash !== detail.review.review_hash || !fresh.review.message[copyLanguage]) {
            setCopyFeedback({ version: fresh.version, value: { kind: 'info', message: 'This payment changed. Check its details before copying.' } }); return;
          }
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable in this browser.');
          if (abort.signal.aborted || current.current !== identity) return;
          await navigator.clipboard.writeText(fresh.review.message[copyLanguage]);
          if (!abort.signal.aborted && current.current === identity) setCopyFeedback({ version: fresh.version, value: { kind: 'success', message: 'Message copied.' } });
        }
        return;
      }
      if (!safe || detail.status === 'Cancelled' || (kind === 'sent' && !canCopy) || (detail.status === 'Paid' && kind !== 'receipt')) return;
      const body = kind === 'cancel' ? { reason: cancelReason.trim(), expected_version: detail.version } : kind === 'receipt' ? { receipt_reference: receipt.trim(), ...receiptProof, expected_version: detail.version } : kind === 'sent' ? { language, expected_version: detail.version } : { payment_date: date, amount: detail.review.period.total_fee!, method, receipt_reference: receipt.trim() || null, note: note.trim() || null, ...receiptProof, expected_version: detail.version };
      if ((kind === 'receipt' || kind === 'paid') && !receiptReady) return;
      if (kind === 'receipt' && !receipt.trim()) return;
      if (kind === 'cancel' && (!cancelConfirmed || !cancelReason.trim())) return;
      if (kind === 'paid' && (!received || !date)) return;
      const content = JSON.stringify([identity, kind, body]);
      if (retry.current?.content !== content) retry.current = { content, token: crypto.randomUUID() };
      const token = retry.current.token;
      const result = kind === 'cancel' ? await billingAPI.cancelPayment(detail.id, { reason: cancelReason.trim(), expected_version: detail.version, idempotency_key: token }, abort.signal) : kind === 'receipt' ? await billingAPI.recordReceipt(detail.id, { receipt_reference: receipt.trim(), ...receiptProof, expected_version: detail.version, idempotency_key: token }, abort.signal) : kind === 'sent'
        ? await billingAPI.markPaymentSent(detail.id, { language, expected_version: detail.version, idempotency_key: token }, abort.signal)
        : await billingAPI.recordPayment(detail.id, { payment_date: date, amount: detail.review.period.total_fee!, method, receipt_reference: receipt.trim() || null, note: note.trim() || null, ...receiptProof, expected_version: detail.version, idempotency_key: token }, abort.signal);
      if (abort.signal.aborted || current.current !== identity) return;
      if (result.id !== detail.id || result.student_id !== detail.student_id || (kind === 'receipt' && (result.status !== 'Paid' || !result.receipt_reference?.trim()))) throw new Error('Could not verify this payment. Refresh before continuing.');
      retry.current = null; await onUpdate(result, true);
      if (abort.signal.aborted || current.current !== identity || !active.current) return;
      if (kind === 'receipt' && result.receipt_reference?.trim()) onReceiptSaved?.(result);
      setCollecting(false); setCancelling(false); setReceived(false);
      setNotice({ text: kind === 'cancel' ? 'The linked enrollments have been cancelled.' : kind === 'receipt' ? 'KMS receipt reference saved.' : kind === 'sent' ? 'Fee message marked sent.' : 'Payment recorded for every linked enrollment.' });
    } catch (failure) {
      if (!abort.signal.aborted && current.current === identity) {
        const duplicate = (failure as { status?: number }).status === 409 && failure instanceof Error && failure.message.startsWith('This student already has this receipt number.');
        if (duplicate) { setDuplicateReceipt(true); setDuplicateAcknowledged(false); }
        else if (kind === 'copy' || (failure as { status?: number }).status === 409) setUnverified(true);
        if (kind === 'copy') setCopyFeedback({ version: checkedVersion, value: { kind: 'error', message: failure instanceof Error ? failure.message : 'Could not copy this message.' } });
        else setNotice({ text: failure instanceof Error ? failure.message : 'Could not update this payment. Try again.', error: true });
      }
    } finally { running.current = false; if (active.current && current.current === identity) { setBusy(false); onBusyChange?.(false); } }
  }

  if (mode === 'receipt') {
    const task = receiptTask?.payment_id === detail.id && receiptTask.student.id === detail.student_id ? receiptTask : null;
    const student = task?.student ?? detail.review.student;
    const saved = !!detail.receipt_reference?.trim();
    const controls = <div className="flex flex-wrap items-center justify-between gap-2" data-receipt-actions>
      {saved ? <><span className="min-w-0 break-words text-xs text-ink-subtle">Receipt {detail.receipt_reference}</span>{receiptQueueComplete ? <span className="text-xs text-ink-subtle">No more outstanding receipts.</span> : <Button size="sm" variant="primary" disabled={busy || sourceBlocked || nextReceiptDisabled} onClick={onNextReceipt}>Next receipt</Button>}</> : <><span className="text-xs text-ink-subtle">{couponReceipt ? 'One receipt covers all linked enrollments.' : 'Enter the issued KMS receipt number.'}</span>{auth.isAdmin && canWrite && <Button type="submit" form={receiptFormId} variant="primary" loading={busy} disabled={busy || !safe || !receipt.trim() || !receiptReady}>Record KMS receipt</Button>}</>}
    </div>;
    return <div className="space-y-4" data-receipt-entry>
      <section aria-label="Receipt payment" className="space-y-3 rounded-lg border border-line bg-wash p-3">
        <div className="flex flex-wrap items-center gap-2"><StudentInfoBadges showLocationPrefix nameHref={`/students/${student.id}`} student={{ ...student, school_student_id: student.school_student_id ?? undefined, home_location: student.home_location ?? undefined, grade: student.grade ?? undefined, school: student.school ?? undefined, lang_stream: student.lang_stream ?? undefined }} />{task?.coupon_value != null && task.coupon_value > 0 && <Badge>Coupon {formatMOP(task.coupon_value, 0)}</Badge>}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{task?.received_amount != null ? formatMOP(task.received_amount, 0) : 'Amount to check'}</strong><span className="text-ink-subtle">Received {formatShortDate(task?.payment_date ?? detail.payment_date)}</span><Badge tone="success">Paid</Badge></div>
      </section>
      {!!detail.review_issues.length && <div role="alert" className="text-sm text-amber-800 dark:text-amber-300">{detail.review_issues.join(' ')}</div>}
      {saved ? <div className="space-y-1 rounded border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30"><p ref={resultNotice} tabIndex={-1} role="status" className="text-sm font-medium outline-none">KMS receipt reference saved.</p><p className="break-words text-sm">{student.student_name} · {detail.receipt_reference}</p></div> : auth.isAdmin && canWrite ? <form id={receiptFormId} aria-label="Record KMS receipt" className="space-y-3" onSubmit={event => { event.preventDefault(); void run('receipt'); }}>
        <Field label="Issued KMS receipt reference" id="issued-kms-receipt"><Input ref={receiptInput} id="issued-kms-receipt" required value={receipt} maxLength={100} disabled={busy} onChange={event => changeReceipt(event.target.value)} /></Field>
        {couponReceipt && <ReceiptCouponCheck selected={couponSelected} onSelect={setCouponSelected} usedOn={couponUsedOn} onDate={setCouponUsedOn} busy={busy} />}
        {duplicateReceipt && <DuplicateReceiptCheck checked={duplicateAcknowledged} onChange={setDuplicateAcknowledged} busy={busy} />}
      </form> : <p className="text-sm text-ink-subtle">KMS receipt not recorded.</p>}
      {notice?.error && <p ref={resultNotice} tabIndex={-1} role="alert" className="text-sm text-red-700 dark:text-red-300">{notice.text}</p>}
      {unverified && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}
      <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Enrollment details</summary><div className="mt-3 space-y-4"><BillingDraftSummaryContent review={detail.review} /><section aria-label="Linked enrollments" className="space-y-2">{detail.lines.map(line => <Link key={line.enrollment_id} href={`/enrollments/${line.enrollment_id}`} className="flex flex-wrap justify-between gap-2 rounded border border-line p-3 text-xs"><span>Enrollment #{line.enrollment_id} · {line.tutor_name}</span><span>{plural(line.lesson_count, 'session')}</span></Link>)}</section></div></details>
      {receiptFooter ? createPortal(controls, receiptFooter) : controls}
    </div>;
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2"><Badge tone={detail.status === 'Cancelled' ? 'neutral' : detail.status === 'Paid' ? 'success' : 'warning'}>{detail.status === 'Cancelled' ? 'Cancelled' : detail.status === 'Paid' ? 'Paid' : 'Unpaid'}</Badge>{detail.sent_at && <span className="text-xs text-ink-subtle">Message sent {formatShortDate(detail.sent_at)} ({detail.sent_language === 'en' ? 'English' : '中文'})</span>}</div>
    {detail.status !== 'Pending Payment' && detail.review_issues.length > 0 && <ul role="alert" className="list-inside list-disc text-sm text-amber-800 dark:text-amber-300">{detail.review_issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    <BillingDraftSummaryContent review={detail.review} />
    <section className="space-y-2" aria-label="Linked enrollments"><h3 className="text-sm font-semibold">Enrollments</h3>{detail.lines.map(line => <div key={line.enrollment_id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3 text-xs"><div>{onOpenEnrollment ? <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => onOpenEnrollment(line.enrollment_id)}>Enrollment #{line.enrollment_id}</button> : <Link className="font-medium text-accent-ink hover:underline" href={`/enrollments/${line.enrollment_id}`}>Enrollment #{line.enrollment_id}</Link>}<p className="mt-1 text-ink-subtle">{line.tutor_name} · {plural(line.lesson_count, 'session')}</p></div><span>${(line.tuition_amount + line.materials_fee).toLocaleString('en-US')}</span></div>)}</section>
    {detail.status === 'Pending Payment' ? <div className="space-y-2">
      <BillingDraftMessage review={review} canCopy={canCopy} busy={busy} feedback={copyFeedback?.version === detail.version ? copyFeedback.value : null} onLanguageChange={value => { setLanguage(value); setCopyFeedback(null); }} onCopy={value => { void run('copy', value); }} />
      {unverified && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}
    </div> : copyFeedback?.version === detail.version && <BillingCopyFeedbackNotice feedback={copyFeedback.value} />}
    {auth.isAdmin && canWrite && detail.status === 'Pending Payment' && <div className="flex flex-wrap gap-2"><Button icon={Send} disabled={!canCopy || busy || !!detail.sent_at} onClick={() => { void run('sent'); }}>{detail.sent_at ? 'Message sent' : `Mark ${language === 'zh' ? 'Chinese' : 'English'} message sent`}</Button><Button icon={CreditCard} variant="primary" disabled={!safe || busy} onClick={() => { setCollecting(value => !value); setCancelling(false); }}>Record payment</Button></div>}
    {collecting && auth.isAdmin && canWrite && detail.status === 'Pending Payment' && <form aria-label="Record received payment" className="space-y-4 rounded-lg border border-line bg-wash p-4" onSubmit={event => { event.preventDefault(); void run('paid'); }}>
      <h3 className="font-semibold">Record received payment</h3>
      <p className="text-sm">${detail.review.period.total_fee?.toLocaleString('en-US')} covers all {plural(detail.review.period.lesson_count, 'session')}.</p>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Payment date" id="received-payment-date"><Input id="received-payment-date" type="date" required value={date} max={localToday()} disabled={busy} onChange={event => { setDate(event.target.value); setReceived(false); }} /></Field><Field label="Received by" id="received-payment-method"><Select id="received-payment-method" value={method} disabled={busy} onChange={event => { setMethod(event.target.value as BillingReceiptMethod); setReceived(false); }}>{detail.review.period.collection.method === 'autopay' ? <option value="autopay">Autopay</option> : <><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></>}</Select></Field></div>
      <Field label="KMS receipt reference (optional)" id="payment-receipt"><Input id="payment-receipt" value={receipt} maxLength={100} disabled={busy} onChange={event => changeReceipt(event.target.value)} /></Field>
      <p className="text-xs text-ink-subtle">Enter a reference only after the receipt has been issued in KMS.</p>
      <Field label="Payment note (optional)" id="payment-note"><Textarea id="payment-note" value={note} maxLength={5000} disabled={busy} onChange={event => setNote(event.target.value)} /></Field>
      {receipt.trim() && couponReceipt && <ReceiptCouponCheck selected={couponSelected} onSelect={setCouponSelected} usedOn={couponUsedOn} onDate={setCouponUsedOn} busy={busy} />}{duplicateReceipt && <DuplicateReceiptCheck checked={duplicateAcknowledged} onChange={setDuplicateAcknowledged} busy={busy} />}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={received} disabled={busy} onChange={event => setReceived(event.target.checked)} />The full payment has been received.</label>
      <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={() => setCollecting(false)}>Cancel</Button><Button type="submit" icon={Check} variant="primary" loading={busy} disabled={!safe || !received || !date || !receiptReady}>Confirm payment</Button></div>
    </form>}
    {detail.status === 'Paid' && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded border border-line p-3 text-sm"><dt className="text-ink-subtle">Payment date</dt><dd>{formatShortDate(detail.payment_date)}</dd><dt className="text-ink-subtle">Received by</dt><dd>{detail.received_method === 'bank_transfer' ? 'Bank transfer' : detail.received_method === 'autopay' ? 'Autopay' : 'Cash'}</dd>{detail.receipt_reference && <><dt className="text-ink-subtle">KMS receipt</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{detail.receipt_reference}</dd></>}{detail.note && <><dt className="text-ink-subtle">Note</dt><dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{detail.note}</dd></>}</dl>}
    {detail.status === 'Cancelled' && detail.note && <section className="space-y-1 rounded border border-line p-3"><h3 className="text-sm font-semibold">Reason for cancellation</h3><p className="min-w-0 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{detail.note}</p></section>}
    {detail.status === 'Paid' && !detail.receipt_reference && <section className="space-y-3 rounded border border-line p-3"><h3 className="text-sm font-semibold">KMS receipt pending</h3>{auth.isAdmin && canWrite && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run('receipt'); }}><Field label="Issued KMS receipt reference" id="issued-kms-receipt"><Input id="issued-kms-receipt" required value={receipt} maxLength={100} disabled={busy} onChange={event => changeReceipt(event.target.value)} /></Field>{couponReceipt && <ReceiptCouponCheck selected={couponSelected} onSelect={setCouponSelected} usedOn={couponUsedOn} onDate={setCouponUsedOn} busy={busy} />}{duplicateReceipt && <DuplicateReceiptCheck checked={duplicateAcknowledged} onChange={setDuplicateAcknowledged} busy={busy} />}<Button type="submit" disabled={busy || !safe || !receipt.trim() || !receiptReady}>Record KMS receipt</Button></form>}</section>}
    {auth.isAdmin && canWrite && detail.status === 'Pending Payment' && <section className="space-y-3 border-t border-line pt-3">
      <Button variant="quiet" disabled={busy || !safe} onClick={() => { setCancelling(value => !value); setCollecting(false); }}>Cancel {detail.lines.length > 1 ? 'enrollments' : 'enrollment'}</Button>
      {cancelling && <form className="space-y-3" aria-label="Cancel linked enrollments" onSubmit={event => { event.preventDefault(); void run('cancel'); }}>
        <Field label="Reason for cancellation" id="payment-cancellation-reason"><Textarea id="payment-cancellation-reason" required maxLength={500} value={cancelReason} disabled={busy} onChange={event => setCancelReason(event.target.value)} /></Field>
        {detail.sent_at && <p className="text-xs text-ink-subtle">Contact the parent separately about the cancelled fee message.</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={cancelConfirmed} disabled={busy} onChange={event => setCancelConfirmed(event.target.checked)} />Cancel every linked enrollment and its scheduled sessions.</label>
        <Button type="submit" variant="danger" disabled={busy || !safe || !cancelConfirmed || !cancelReason.trim()}>Confirm cancellation</Button>
      </form>}
    </section>}
    <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm">Payment history</summary><ol className="mt-3 space-y-2 text-xs">{detail.history.map((event, index) => <li key={index}>{({ confirmed: 'Enrollment created', sent: 'Message marked sent', paid: 'Payment recorded', receipt: 'KMS receipt recorded', cancelled: 'Enrollment cancelled', cancel: 'Enrollment cancelled' } as Record<string, string>)[event.kind] ?? event.kind} · {event.actor_name} · {formatShortDate(event.created_at)}</li>)}</ol></details>
    {notice && <p ref={resultNotice} tabIndex={-1} role={notice.error ? 'alert' : 'status'} className="text-sm">{notice.text}</p>}
    {unverified && detail.status !== 'Pending Payment' && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}
  </div>;
}

function ReceiptCouponCheck({ selected, onSelect, usedOn, onDate, busy }: { selected: boolean; onSelect: (value: boolean) => void; usedOn: string; onDate: (value: string) => void; busy: boolean }) {
  return <div className="space-y-2"><label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected} onChange={event => onSelect(event.target.checked)} />The coupon was selected on this receipt in KMS.</label>{selected && <Field label="Coupon used on (optional)" id="kms-coupon-used-on"><Input type="date" disabled={busy} value={usedOn} onChange={event => onDate(event.target.value)} /></Field>}</div>;
}
function DuplicateReceiptCheck({ checked, onChange, busy }: { checked: boolean; onChange: (value: boolean) => void; busy: boolean }) {
  return <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={checked} onChange={event => onChange(event.target.checked)} />I checked KMS. This receipt number is correct for this payment.</label>;
}
