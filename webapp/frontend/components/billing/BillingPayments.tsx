'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import useSWR, { useSWRConfig } from 'swr';
import { ArrowLeft, Calendar, Check, CreditCard, UserRound, XCircle } from 'lucide-react';
import { Badge, Button, IconButton, Field, Input, Select, Textarea } from '@/components/controls';
import { FeeMessageContent } from '@/components/enrollments/FeeMessageContent';
import { shareOrCopy, useCanShare } from '@/lib/share';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { Modal } from '@/components/ui/modal';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { useAuth } from '@/contexts/AuthContext';
import { billingToday } from '@/lib/billing-clock';
import { BillingPaymentStatus, BillingPaymentMessageStatus, billingPaymentStatus } from './BillingPaymentStatus';
import { BillingChecks } from './BillingChecks';
import { BillingEnrollmentSessions } from './BillingEnrollmentSessions';
import { billingCheck } from '@/lib/billing-presentation';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import type { BillingConfirmableCheck, BillingPaymentDetail, BillingReceiptMethod, BillingReceiptTask } from '@/types/billing';
import { BillingCopyFeedbackNotice, BillingDraftFocus, BillingDraftSummaryContent, billingDraftAuthScope, billingDraftTutorId, type BillingCopyFeedback } from './BillingDraftReview';

function paymentMessageProof(detail: BillingPaymentDetail, language: 'zh' | 'en', sourceBlocked: boolean) {
  return JSON.stringify([detail.id, detail.version, detail.status, detail.review.source_fingerprint,
    detail.review.review_hash, detail.review.message, detail.saved_message, detail.can_copy, detail.review_issues, language, sourceBlocked]);
}

export type BillingPaymentAction = 'charges' | 'paid' | 'message' | 'cancel';

function localToday() {
  return billingToday();
}

export function BillingPayments({ action, onActionClose, presentation = 'default', initialDetail, studentId, refreshKey, initialPaymentId, onChanged, canWrite = false, inline = false, onOpenEnrollment, onBusyChange, sourceBlocked = false, mode = 'payment', receiptTask, receiptFooter, onReceiptSaved, onNextReceipt, nextReceiptDisabled = true, receiptQueueComplete = false }: { action?: BillingPaymentAction; onActionClose?: () => void; presentation?: 'default' | 'renewal'; initialDetail?: BillingPaymentDetail; receiptQueueComplete?: boolean; mode?: 'payment' | 'receipt'; receiptTask?: BillingReceiptTask; receiptFooter?: HTMLElement | null; onReceiptSaved?: (detail: BillingPaymentDetail) => void; onNextReceipt?: () => void; nextReceiptDisabled?: boolean; sourceBlocked?: boolean; onBusyChange?: (busy: boolean) => void; onOpenEnrollment?: (id: number) => void; inline?: boolean; canWrite?: boolean; studentId: number; refreshKey?: number; initialPaymentId?: string | null; onChanged: () => void }) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const { mutate: refreshCache } = useSWRConfig();
  const scope = `${studentId}:${billingDraftAuthScope(auth)}`;
  const list = useSWR(['billing-payments', scope, refreshKey], () => billingAPI.payments(studentId, tutorId), { keepPreviousData: false });
  const [selection, setSelection] = useState<{ scope: string; id: string } | null>(() => initialPaymentId ? { scope, id: initialPaymentId } : null);
  const selected = selection?.scope === scope ? selection.id : null;
  const initialScope = useRef(scope);
  const fallbackDetail = initialScope.current === scope && initialDetail?.student_id === studentId && initialDetail.id === selected ? initialDetail : undefined;
  const details = useSWR(selected ? ['billing-payment', scope, selected] : null, () => billingAPI.payment(selected!, tutorId), { keepPreviousData: false, fallbackData: fallbackDetail });
  const detail = details.data?.student_id === studentId && details.data?.id === selected ? details.data : null;
  const trigger = useRef<HTMLButtonElement | null>(null);

  const content = <>{details.error ? <div role="alert" className="space-y-2 text-sm"><p>Could not load this payment.</p><Button onClick={() => details.mutate()}>Retry payment</Button></div> : !detail ? <p role="status" className="text-sm text-ink-subtle">Loading payment…</p> : <PaymentContent action={action} onActionClose={onActionClose} presentation={presentation} key={`${scope}:${detail.id}:${canWrite}:${action ?? 'summary'}`} detail={detail} receiptTask={receiptTask} mode={mode} receiptFooter={receiptFooter} onReceiptSaved={onReceiptSaved} onNextReceipt={onNextReceipt} nextReceiptDisabled={nextReceiptDisabled} receiptQueueComplete={receiptQueueComplete} sourceBlocked={sourceBlocked} canWrite={canWrite} onBusyChange={onBusyChange} onOpenEnrollment={onOpenEnrollment} onUpdate={async (next, changed) => { await details.mutate(next, false); if (changed) { void list.mutate().catch(() => {}); void refreshCache(key => Array.isArray(key) && ['billing-receipts', 'billing-receipts-count', 'billing-coupons'].includes(key[0])).catch(() => {}); onChanged(); } else { await list.mutate(); } }} />}</>;

  return <section className="space-y-3" aria-label="Student payments">
    {!inline && <><h2 className="flex items-center gap-2 font-semibold"><CreditCard className="h-4 w-4 text-ink-subtle" aria-hidden="true" />Payments</h2>
    {list.error && <div role="alert" className="flex flex-wrap gap-2 text-sm"><p>Could not load payments.</p><Button size="sm" onClick={() => list.mutate()}>Retry</Button></div>}
    {!list.data && !list.error && <p role="status" className="text-sm text-ink-subtle">Loading payments…</p>}
    {list.data?.length === 0 && <p className="text-sm text-ink-subtle">Create an enrollment from a saved draft to start collecting payment.</p>}
    <div className="grid gap-2 sm:grid-cols-2">{list.data?.filter(item => item.student_id === studentId).map(item => {
      const period = item.review.period;
      const overdue = billingPaymentStatus(item) === 'Overdue';
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

function PaymentContent({ action, onActionClose, presentation, detail, onUpdate, canWrite, onOpenEnrollment, onBusyChange, sourceBlocked, mode, receiptTask, receiptFooter, onReceiptSaved, onNextReceipt, nextReceiptDisabled, receiptQueueComplete }: { action?: BillingPaymentAction; onActionClose?: () => void; presentation: 'default' | 'renewal'; receiptQueueComplete: boolean; mode: 'payment' | 'receipt'; receiptTask?: BillingReceiptTask; receiptFooter?: HTMLElement | null; onReceiptSaved?: (detail: BillingPaymentDetail) => void; onNextReceipt?: () => void; nextReceiptDisabled: boolean; sourceBlocked: boolean; onBusyChange?: (busy: boolean) => void; onOpenEnrollment?: (id: number) => void; canWrite: boolean; detail: BillingPaymentDetail; onUpdate: (next: BillingPaymentDetail, changed?: boolean) => Promise<void> }) {
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
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; value: BillingCopyFeedback } | null>(null);
  const resultNotice = useRef<HTMLParagraphElement>(null);
  const [unverified, setUnverified] = useState(false);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const canShare = useCanShare();
  const [messageEditable, setMessageEditable] = useState(false);
  const [messageEdit, setMessageEdit] = useState<{ key: string; text: string } | null>(null);
  const [messageOpen, setMessageOpen] = useState(action === 'message');
  const messageRegionId = useId();
  const [collecting, setCollecting] = useState(action === 'paid');
  const [cancelling, setCancelling] = useState(action === 'cancel');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const cancelRegionId = useId();
  const [editingCharges, setEditingCharges] = useState(action === 'charges');
  const [chargeMaterials, setChargeMaterials] = useState(action === 'charges' && (detail.review.period.materials_fee ?? 0) > 0);
  const [keepDeduction, setKeepDeduction] = useState(true);
  const [chargeReason, setChargeReason] = useState('');
  const [chargeVersion, setChargeVersion] = useState(detail.version);
  const chargeRegionId = useId();
  const chargeOptions = useSWR(editingCharges ? ['billing-charge-options', identity] : null, () => billingAPI.options(), { keepPreviousData: false, shouldRetryOnError: false });
  const existingMaterials = detail.review.period.materials_fee ?? 0;
  const chargeAmount = existingMaterials || chargeOptions.data?.standard_materials_fee;
  const hasDeduction = detail.review.period.deductions.length > 0;
  const canEditMaterials = ['new_student', 'returning_student'].includes(detail.review.scenario.mode) && detail.review.period.number === 1;
  const newChargeTotal = detail.review.period.gross_tuition
    - (keepDeduction ? detail.review.period.deductions.reduce((sum, deduction) => sum + deduction.amount, 0) : 0)
    + (chargeMaterials ? chargeAmount ?? 0 : 0);
  const chargesChanged = chargeMaterials !== (existingMaterials > 0) || (hasDeduction && !keepDeduction);
  const chargesReady = chargesChanged && !!chargeReason.trim() && (!chargeMaterials || chargeAmount !== undefined)
    && detail.version === chargeVersion && newChargeTotal > 0 && !detail.batch_action_issue;
  const [date, setDate] = useState(localToday);
  const [method, setMethod] = useState<BillingReceiptMethod>(detail.review.period.collection.method === 'autopay' ? 'autopay' : 'bank_transfer');
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

  const messageKey = JSON.stringify([identity, detail.version, review.review_hash, language]);
  const originalMessage = review.message[language] || '';
  const message = messageEdit?.key === messageKey ? messageEdit.text : originalMessage;
  const messageBlocks = review.message.blocked_reasons;
  const messageProof = paymentMessageProof(detail, language, sourceBlocked);
  const currentCopyFeedback = copyFeedback?.key === messageProof ? copyFeedback.value : null;
  useEffect(() => { setCopyFeedback(current => current?.key === messageProof ? current : null); }, [messageProof]);

  async function run(kind: 'copy' | 'copy_saved' | 'sent' | 'paid' | 'refresh' | 'receipt' | 'cancel' | 'charges', copyLanguage = language, copyText?: string) {
    const reading = kind === 'copy' || kind === 'copy_saved' || kind === 'refresh';
    if ((sourceBlocked && !reading) || running.current || busy || (!reading && (!auth.isAdmin || !canWrite))) return;
    const abort = new AbortController(); operation.current = abort; running.current = true; onBusyChange?.(true); setBusy(true); setNotice(null); setCopyFeedback(null);
    let checkedPayment = detail;
    try {
      if (reading) {
        const fresh = await billingAPI.payment(detail.id, tutorId, abort.signal);
        if (abort.signal.aborted || current.current !== identity) return;
        if (fresh.id !== detail.id || fresh.student_id !== detail.student_id) throw new Error('Could not verify this payment. Refresh before continuing.');
        checkedPayment = fresh;
        await onUpdate(fresh);
        if (abort.signal.aborted || current.current !== identity) return;
        setUnverified(false);
        if (kind === 'copy' || kind === 'copy_saved') {
          const saved = kind === 'copy_saved';
          const text = saved ? fresh.saved_message?.[copyLanguage] : fresh.review.message[copyLanguage];
          const eligible = saved
            ? fresh.status !== 'Pending Payment' && fresh.status === detail.status && !sourceBlocked && JSON.stringify(fresh.saved_message) === JSON.stringify(detail.saved_message)
            : fresh.can_copy;
          if (!eligible || fresh.review_issues.length || fresh.version !== detail.version || fresh.review.review_hash !== detail.review.review_hash || !text) {
            setCopyFeedback({ key: paymentMessageProof(fresh, copyLanguage, sourceBlocked), value: { kind: 'info', message: 'This payment changed. Check its details before copying.' } }); return;
          }
          if (abort.signal.aborted || current.current !== identity) return;
          const result = await shareOrCopy(saved ? text : copyText ?? text);
          if (result === 'cancelled') return;
          if (!abort.signal.aborted && current.current === identity) setCopyFeedback({ key: paymentMessageProof(fresh, copyLanguage, sourceBlocked), value: { kind: 'success', message: result === 'copied' ? 'Message copied.' : 'Message shared.' } });
        }
        return;
      }
      if (!safe || detail.status === 'Cancelled' || (kind === 'sent' && !canCopy) || (detail.status === 'Paid' && kind !== 'receipt')) return;
      const chargeBody = { charge_materials: chargeMaterials, keep_deduction: keepDeduction, expected_total: newChargeTotal, reason: chargeReason.trim(), expected_version: chargeVersion };
      const body = kind === 'charges' ? chargeBody : kind === 'cancel' ? { reason: cancelReason.trim(), expected_version: detail.version } : kind === 'receipt' ? { receipt_reference: receipt.trim(), ...receiptProof, expected_version: detail.version } : kind === 'sent' ? { language, expected_version: detail.version } : { payment_date: date, amount: detail.review.period.total_fee!, method, receipt_reference: receipt.trim() || null, note: note.trim() || null, ...receiptProof, expected_version: detail.version };
      if ((kind === 'receipt' || kind === 'paid') && !receiptReady) return;
      if (kind === 'receipt' && !receipt.trim()) return;
      if (kind === 'cancel' && (!cancelConfirmed || !cancelReason.trim())) return;
      if (kind === 'paid' && (!received || !date)) return;
      if (kind === 'charges' && !chargesReady) return;
      const content = JSON.stringify([identity, kind, body]);
      if (retry.current?.content !== content) retry.current = { content, token: crypto.randomUUID() };
      const token = retry.current.token;
      const result = kind === 'charges' ? await billingAPI.editCharges(detail.id, { ...chargeBody, idempotency_key: token }, abort.signal) : kind === 'cancel' ? await billingAPI.cancelPayment(detail.id, { reason: cancelReason.trim(), expected_version: detail.version, idempotency_key: token }, abort.signal) : kind === 'receipt' ? await billingAPI.recordReceipt(detail.id, { receipt_reference: receipt.trim(), ...receiptProof, expected_version: detail.version, idempotency_key: token }, abort.signal) : kind === 'sent'
        ? await billingAPI.markPaymentSent(detail.id, { language, expected_version: detail.version, idempotency_key: token }, abort.signal)
        : await billingAPI.recordPayment(detail.id, { payment_date: date, amount: detail.review.period.total_fee!, method, receipt_reference: receipt.trim() || null, note: note.trim() || null, ...receiptProof, expected_version: detail.version, idempotency_key: token }, abort.signal);
      if (abort.signal.aborted || current.current !== identity) return;
      if (result.id !== detail.id || result.student_id !== detail.student_id || (kind === 'receipt' && (result.status !== 'Paid' || !result.receipt_reference?.trim()))) throw new Error('Could not verify this payment. Refresh before continuing.');
      retry.current = null; await onUpdate(result, true);
      if (abort.signal.aborted || current.current !== identity || !active.current) return;
      if (kind === 'receipt' && result.receipt_reference?.trim()) onReceiptSaved?.(result);
      setCollecting(false); setCancelling(false); setEditingCharges(false); setReceived(false);
      setNotice({ text: kind === 'charges' ? (detail.sent_at ? 'Charges updated. Send the revised fee message to the parent.' : 'Charges and fee message updated.') : kind === 'cancel' ? 'The linked enrollments have been cancelled.' : kind === 'receipt' ? 'KMS receipt reference saved.' : kind === 'sent' ? 'Fee message marked sent.' : 'Payment recorded for every linked enrollment.' });
    } catch (failure) {
      if (!abort.signal.aborted && current.current === identity) {
        const duplicate = (failure as { status?: number }).status === 409 && failure instanceof Error && failure.message.startsWith('This student already has this receipt number.');
        if (duplicate) { setDuplicateReceipt(true); setDuplicateAcknowledged(false); }
        else if (kind === 'copy' || kind === 'copy_saved' || (failure as { status?: number }).status === 409) setUnverified(true);
        if (kind === 'copy' || kind === 'copy_saved') setCopyFeedback({ key: paymentMessageProof(checkedPayment, copyLanguage, sourceBlocked), value: { kind: 'error', message: failure instanceof Error ? failure.message : 'Could not copy this message.' } });
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

  const chargeEditor = auth.isAdmin && canWrite && detail.status === 'Pending Payment' && editingCharges && <section id={chargeRegionId} className="space-y-3 border-t border-line pt-3">
      <form aria-label="Edit enrollment charges" className="space-y-3" onSubmit={event => { event.preventDefault(); void run('charges'); }}>
        {!action && <p className="text-sm text-ink-subtle">Changes apply to every enrollment in this payment. The student’s new-student status is preserved.</p>}
        {canEditMaterials && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={chargeMaterials} disabled={busy || chargeAmount === undefined} onChange={event => setChargeMaterials(event.target.checked)} />Charge materials fee{chargeAmount !== undefined ? ` (${formatMOP(chargeAmount, 0)})` : ''}</label>}
        {chargeOptions.error && !existingMaterials && <p role="alert" className="text-sm">Could not load the standard materials fee. <Button size="sm" onClick={() => { void chargeOptions.mutate(); }}>Retry settings</Button></p>}
        {hasDeduction && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={keepDeduction} disabled={busy} onChange={event => setKeepDeduction(event.target.checked)} />Keep existing deduction ({formatMOP(detail.review.period.deductions.reduce((sum, item) => sum + item.amount, 0), 0)})</label>}
        <Field label="Reason for change" id={`${chargeRegionId}-reason`}><Textarea id={`${chargeRegionId}-reason`} required maxLength={500} value={chargeReason} disabled={busy} onChange={event => setChargeReason(event.target.value)} /></Field>
        <p className="text-sm">Total: {formatMOP(detail.review.period.total_fee ?? 0, 0)} → {formatMOP(newChargeTotal, 0)}</p>
        {detail.sent_at && <p className="text-sm text-amber-800 dark:text-amber-300">The fee message was already marked sent. Send the revised message after saving.</p>}
        {chargeVersion !== detail.version && <p role="alert" className="text-sm">This payment changed. Close and reopen the charge editor before saving.</p>}
        <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => action ? onActionClose?.() : setEditingCharges(false)}>Cancel changes</Button><Button type="submit" variant="primary" disabled={busy || !safe || !chargesReady}>Save charges</Button></div>
      </form>
    </section>;
  const cancellationForm = auth.isAdmin && canWrite && detail.status === 'Pending Payment' && cancelling && <section id={cancelRegionId} className="space-y-3 border-t border-line pt-3">
      <form className="space-y-3" aria-label="Cancel linked enrollments" onSubmit={event => { event.preventDefault(); void run('cancel'); }}>
        <Field label="Reason for cancellation" id="payment-cancellation-reason"><Textarea id="payment-cancellation-reason" required maxLength={500} value={cancelReason} disabled={busy} onChange={event => setCancelReason(event.target.value)} /></Field>
        {detail.sent_at && <p className="text-xs text-ink-subtle">Contact the parent separately about the cancelled fee message.</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={cancelConfirmed} disabled={busy} onChange={event => setCancelConfirmed(event.target.checked)} />Cancel every linked enrollment and its scheduled sessions.</label>
        <Button type="submit" variant="danger" disabled={busy || !safe || !cancelConfirmed || !cancelReason.trim()}>Confirm cancellation</Button>
      </form>
    </section>;
  const messagePanel = detail.status === 'Pending Payment' ? <div id={messageRegionId} hidden={!messageOpen} inert={!messageOpen} className="space-y-3">
      <FeeMessageContent language={language} onLanguageChange={value => { setLanguage(value); setCopyFeedback(null); setMessageEditable(false); }}
        lessons={detail.review.period.lesson_count} message={message} originalMessage={originalMessage}
        editable={messageEditable} onEditableChange={setMessageEditable}
        onMessageChange={value => { setMessageEdit({ key: messageKey, text: value }); setCopyFeedback(null); }}
        onReset={() => { setMessageEdit(null); setMessageEditable(false); setCopyFeedback(null); }}
        busy={busy} canCopy={canCopy && !!message.trim()} copied={currentCopyFeedback?.kind === 'success' && currentCopyFeedback.message === 'Message copied.'} canShare={canShare}
        onCopy={() => { void run('copy', language, message); }} onClose={() => action ? onActionClose?.() : setMessageOpen(false)} closeLabel="Close fee message"
        onMarkSent={auth.isAdmin && canWrite && !detail.sent_at ? () => { void run('sent'); } : undefined}
        error={messageBlocks.length ? <>{currentCopyFeedback?.kind === 'error' && <p>{currentCopyFeedback.message}</p>}<ul>{messageBlocks.map(reason => <li key={reason}>{reason}</li>)}</ul>{unverified && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}</> : undefined}
        feedback={currentCopyFeedback && !(messageBlocks.length && currentCopyFeedback.kind === 'error') && <BillingCopyFeedbackNotice feedback={currentCopyFeedback} />} />
    </div> : <div id={messageRegionId} hidden={!messageOpen} inert={!messageOpen} className="space-y-3">
      <p className="text-xs text-ink-subtle">Saved fee message for reference. {detail.status === 'Paid' ? 'This payment has already been recorded.' : 'These enrollments were cancelled.'}</p>
      <FeeMessageContent language={language} onLanguageChange={setLanguage} lessons={detail.review.period.lesson_count}
        message={detail.saved_message?.[language] ?? ''} canCopy={safe && !!detail.saved_message?.[language]?.trim()} onCopy={() => { void run('copy_saved'); }} busy={busy}
        canShare={canShare} copied={currentCopyFeedback?.kind === 'success' && currentCopyFeedback.message === 'Message copied.'}
        feedback={currentCopyFeedback && <BillingCopyFeedbackNotice feedback={currentCopyFeedback} />}
        onClose={() => action ? onActionClose?.() : setMessageOpen(false)} closeLabel="Close fee message"
        error={!detail.saved_message?.[language] ? 'The saved fee message is unavailable for this payment.' : undefined} />
    </div>;
  const collectionForm = collecting && auth.isAdmin && canWrite && detail.status === 'Pending Payment' && <form aria-label="Record received payment" className={presentation === 'default' ? "space-y-4" : "space-y-4 rounded-lg border border-line bg-wash p-4"} onSubmit={event => { event.preventDefault(); void run('paid'); }}>
      {!action && presentation === 'renewal' && <h3 className="font-semibold">Record received payment</h3>}
      <p className="text-sm">${detail.review.period.total_fee?.toLocaleString('en-US')} covers all {plural(detail.review.period.lesson_count, 'session')}.</p>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Payment date" id="received-payment-date"><Input id="received-payment-date" type="date" required value={date} max={localToday()} disabled={busy} onChange={event => { setDate(event.target.value); setReceived(false); }} /></Field><Field label="Received by" id="received-payment-method"><Select id="received-payment-method" value={method} disabled={busy} onChange={event => { setMethod(event.target.value as BillingReceiptMethod); setReceived(false); }}>{detail.review.period.collection.method === 'autopay' ? <option value="autopay">Autopay</option> : <><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></>}</Select></Field></div>
      <Field label="KMS receipt reference (optional)" id="payment-receipt"><Input id="payment-receipt" value={receipt} maxLength={100} disabled={busy} onChange={event => changeReceipt(event.target.value)} /></Field>
      <p className="text-xs text-ink-subtle">Enter a reference only after the receipt has been issued in KMS.</p>
      <Field label="Payment note (optional)" id="payment-note"><Textarea id="payment-note" value={note} maxLength={5000} disabled={busy} onChange={event => setNote(event.target.value)} /></Field>
      {receipt.trim() && couponReceipt && <ReceiptCouponCheck selected={couponSelected} onSelect={setCouponSelected} usedOn={couponUsedOn} onDate={setCouponUsedOn} busy={busy} />}{duplicateReceipt && <DuplicateReceiptCheck checked={duplicateAcknowledged} onChange={setDuplicateAcknowledged} busy={busy} />}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={received} disabled={busy} onChange={event => setReceived(event.target.checked)} />The full payment has been received.</label>
      <div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={() => action ? onActionClose?.() : setCollecting(false)}>Cancel</Button><Button type="submit" icon={Check} variant="primary" loading={busy} disabled={!safe || !received || !date || !receiptReady}>Confirm payment</Button></div>
    </form>;

  if (action) {
    const canEdit = auth.isAdmin && canWrite && safe;
    const hasEditableCharges = canEditMaterials || hasDeduction;
    return <div className="space-y-3">
      {action !== 'message' && <div className="space-y-2 text-sm">
        <BillingPaymentStatus detail={detail} />
        <p className="text-ink-subtle">{detail.lines.length > 1 ? `This action applies to all ${detail.lines.length} enrollments in this payment.` : `Enrollment #${detail.lines[0]?.enrollment_id}`}</p>
        {detail.lines.length > 1 && <ul className="space-y-1 text-xs text-ink-subtle">{detail.lines.map(line => <li key={line.enrollment_id}>#{line.enrollment_id} · {line.tutor_name} · {plural(line.lesson_count, 'session')}</li>)}</ul>}
      </div>}
      {!!detail.review_issues.length && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{detail.review_issues.join(' ')}</p>}
      {action !== 'message' && !canEdit && <p role="status" className="text-sm text-ink-subtle">Payment changes are unavailable. Refresh the payment or check your access.</p>}
      {action === 'charges' && canEdit && !hasEditableCharges && <p className="text-sm">This payment has no materials charge or deduction to edit.</p>}
      {action === 'charges' && canEdit && detail.batch_action_issue && <p role="alert" className="text-sm">{detail.batch_action_issue}</p>}
      {action === 'charges' && canEdit && hasEditableCharges && !detail.batch_action_issue && chargeEditor}
      {action === 'paid' && canEdit && collectionForm}
      {action === 'cancel' && canEdit && <>{cancellationForm}<Button disabled={busy} onClick={onActionClose}>Keep enrollment</Button></>}
      {action === 'message' && messagePanel}
      {notice && <p ref={resultNotice} tabIndex={-1} role={notice.error ? 'alert' : 'status'} className="text-sm">{notice.text}</p>}
      {unverified && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}
    </div>;
  }

  const receiptEntryForm = auth.isAdmin && canWrite && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void run('receipt'); }}><Field label="Issued KMS receipt reference" id="issued-kms-receipt"><Input id="issued-kms-receipt" required value={receipt} maxLength={100} disabled={busy} onChange={event => changeReceipt(event.target.value)} /></Field>{couponReceipt && <ReceiptCouponCheck selected={couponSelected} onSelect={setCouponSelected} usedOn={couponUsedOn} onDate={setCouponUsedOn} busy={busy} />}{duplicateReceipt && <DuplicateReceiptCheck checked={duplicateAcknowledged} onChange={setDuplicateAcknowledged} busy={busy} />}<Button type="submit" disabled={busy || !safe || !receipt.trim() || !receiptReady}>Record KMS receipt</Button></form>;
  const renewalChecks = paymentReviewChecks(detail);
  const renewalWarnings = renewalChecks.filter(issue => billingCheck(issue.code).severity !== 'info');
  const renewalNotes = renewalChecks.filter(issue => billingCheck(issue.code).severity === 'info');
  if (presentation === 'default' && ((detail.status === 'Pending Payment' && (collecting || editingCharges || cancelling)) || messageOpen)) {
    return <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Back to payment" icon={ArrowLeft} size="sm" disabled={busy} onClick={() => { setCollecting(false); setEditingCharges(false); setCancelling(false); setMessageOpen(false); }} />
        <h3 className="min-w-0 flex-1 font-semibold">{collecting ? 'Record payment' : editingCharges ? 'Edit charges' : cancelling ? (detail.lines.length > 1 ? 'Cancel enrollments' : 'Cancel enrollment') : 'Fee message'}</h3><BillingPaymentStatus detail={detail} /></div>
      <p className="text-xs text-ink-subtle">{detail.lines.length > 1 ? `This payment covers all ${detail.lines.length} enrollments.` : `Enrollment #${detail.lines[0]?.enrollment_id}`}</p>
      {!!detail.review_issues.length && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{detail.review_issues.join(' ')}</p>}
      {chargeEditor}{cancellationForm}{messagePanel}{collectionForm}
      {notice && <p ref={resultNotice} tabIndex={-1} role={notice.error ? 'alert' : 'status'} className="text-sm">{notice.text}</p>}
      {unverified && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}
    </div>;
  }
  return <div className="space-y-4">
    <PaymentSummary detail={detail} onOpenEnrollment={onOpenEnrollment} flat={presentation === 'default'} />
    {detail.review_issues.length > 0 && <ul role="alert" className="list-inside list-disc text-sm text-amber-800 dark:text-amber-300">{detail.review_issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    <BillingChecks issues={renewalWarnings} compact />

    {detail.message_needs_resend && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">Charges changed after the fee message was sent. Send the revised message to the parent.</p>}
    {detail.status === 'Pending Payment' && <div className="flex flex-wrap gap-2">
      {auth.isAdmin && canWrite && <Button size="sm" icon={CreditCard} variant="primary" disabled={!safe || busy} onClick={() => { setCollecting(value => !value); setCancelling(false); setEditingCharges(false); }}>Record payment</Button>}
      {auth.isAdmin && canWrite && (canEditMaterials || hasDeduction) && <Button size="sm" variant="secondary" disabled={busy || !safe || !!detail.batch_action_issue} title={detail.batch_action_issue || undefined} aria-expanded={editingCharges} aria-controls={chargeRegionId} onClick={() => {
        setEditingCharges(value => !value); setChargeMaterials(existingMaterials > 0); setKeepDeduction(true);
        setChargeReason(''); setChargeVersion(detail.version); setCollecting(false); setCancelling(false);
      }}>Edit charges</Button>}
      {auth.isAdmin && canWrite && <Button size="sm" variant="secondary" icon={XCircle} iconClassName="text-red-600 dark:text-red-400" disabled={busy || !safe} aria-expanded={cancelling} aria-controls={cancelRegionId} onClick={() => { setCancelling(value => !value); setCollecting(false); setEditingCharges(false); }}>Cancel {detail.lines.length > 1 ? 'enrollments' : 'enrollment'}</Button>}
    </div>}
    {chargeEditor}
    {cancellationForm}
    {messagePanel}
    {collectionForm}
    {detail.status === 'Paid' && <section aria-label="Received payment" className="space-y-3 border-t border-line pt-3"><h3 className="text-sm font-semibold">Received payment</h3><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-ink-subtle">Payment date</dt><dd>{formatShortDate(detail.payment_date)}</dd><dt className="text-ink-subtle">Received by</dt><dd>{detail.received_method === 'bank_transfer' ? 'Bank transfer' : detail.received_method === 'autopay' ? 'Autopay' : detail.received_method === 'cash' ? 'Cash' : 'Not recorded'}</dd>{detail.receipt_reference && <><dt className="text-ink-subtle">KMS receipt</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{detail.receipt_reference}</dd></>}{detail.note && <><dt className="text-ink-subtle">Payment note</dt><dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{detail.note}</dd></>}</dl></section>}
    <BillingPaymentMessageStatus detail={detail} disabled={busy} expanded={messageOpen} controls={messageRegionId} onOpen={() => setMessageOpen(value => !value)} />
    {detail.status === 'Cancelled' && detail.note && <section className="space-y-1 border-t border-line pt-3"><h3 className="text-sm font-semibold">Reason for cancellation</h3><p className="min-w-0 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{detail.note}</p></section>}
    {detail.status === 'Paid' && !detail.receipt_reference && (couponReceipt
      ? <section className="space-y-3 rounded border border-line p-3"><h3 className="text-sm font-semibold">Coupon receipt</h3>{receiptEntryForm}</section>
      : auth.isAdmin && canWrite && <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm">Add KMS receipt (optional)</summary><div className="mt-3">{receiptEntryForm}</div></details>)}

    <section aria-label="Enrollment sessions" className="space-y-3 border-t border-line pt-3">
      {presentation === 'default' ? <section aria-label="Linked enrollments" className="space-y-4">
        <p className="text-xs text-ink-subtle">Coverage: {formatShortDate(detail.review.period.first_lesson_date)} to {formatShortDate(detail.review.period.last_lesson_date)}</p>
        {detail.lines.map(line => <div key={line.enrollment_id} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {onOpenEnrollment ? <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => onOpenEnrollment(line.enrollment_id)}>Enrollment #{line.enrollment_id}</button> : <Link className="font-medium text-accent-ink hover:underline" href={`/enrollments/${line.enrollment_id}`}>Enrollment #{line.enrollment_id}</Link>}
            <span className="text-ink-subtle">{line.tutor_name}</span>
          </div>
          <BillingEnrollmentSessions enrollmentId={line.enrollment_id} studentId={detail.student_id} />
        </div>)}
      </section> : detail.lines.map(line => <div key={line.enrollment_id} className="space-y-2">{detail.lines.length > 1 && <h4 className="text-sm font-medium">Enrollment #{line.enrollment_id}</h4>}<BillingEnrollmentSessions enrollmentId={line.enrollment_id} studentId={detail.student_id} /></div>)}
    </section>
    <BillingChecks issues={renewalNotes} presentation="renewal" />
    <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm">Payment history</summary><ol className="mt-3 space-y-2 text-xs">{detail.history.map((event, index) => <li key={index}>{({ charges: 'Charges updated', confirmed: 'Enrollment created', sent: 'Message marked sent', paid: 'Payment recorded', receipt: 'KMS receipt recorded', kms_receipt: 'KMS receipt linked automatically', cancelled: 'Enrollment cancelled', cancel: 'Enrollment cancelled' } as Record<string, string>)[event.kind] ?? event.kind} · {event.actor_name} · {formatShortDate(event.created_at)}{event.reason && <p className="mt-1 whitespace-pre-wrap">{event.reason} · {formatMOP(event.previous_total ?? 0, 0)} → {formatMOP(event.total ?? 0, 0)}</p>}</li>)}</ol></details>
    {notice && <p ref={resultNotice} tabIndex={-1} role={notice.error ? 'alert' : 'status'} className="text-sm">{notice.text}</p>}
    {unverified && <Button size="sm" disabled={busy} onClick={() => { void run('refresh'); }}>Refresh payment</Button>}
  </div>;
}

function paymentReviewChecks(detail: BillingPaymentDetail) {
  const period = detail.review.period;
  return detail.review.issues.filter(issue => (issue.period === null || issue.period === period.number)
    && !detail.review.confirmed_checks.includes(issue.code as BillingConfirmableCheck)
    && !(issue.code === 'MANDATE_NOT_READY' && period.collection.method === 'manual'));
}

function PaymentSummary({ detail, onOpenEnrollment, flat = false }: { flat?: boolean; detail: BillingPaymentDetail; onOpenEnrollment?: (id: number) => void }) {
  const period = detail.review.period;
  const multiple = detail.lines.length > 1;
  const breakdown = period.deductions.length > 0 || period.materials_fee !== 0;
  const status = billingPaymentStatus(detail);
  if (flat) return <section aria-label="Enrollment fee" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-xs font-medium text-ink-subtle">{multiple ? 'Combined payment total' : 'Payment total'}</h3><p className="text-2xl font-semibold tabular-nums">{period.total_fee === null ? 'To confirm' : formatMOP(period.total_fee, 0)}</p></div>
      <BillingPaymentStatus detail={detail} />
    </div>
    {breakdown && <dl aria-label="Fee breakdown" className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
      <dt className="text-ink-subtle">Tuition</dt><dd>{formatMOP(period.gross_tuition, 0)}</dd>
      {period.deductions.map((deduction, index) => <div key={index} className="contents"><dt className="text-ink-subtle">{deduction.kind === 'trial' ? 'Trial deduction' : deduction.kind === 'staff' ? 'Staff voucher' : 'Coupon'}</dt><dd>−{formatMOP(deduction.amount, 0)}</dd></div>)}
      {period.materials_fee !== 0 && <><dt className="text-ink-subtle">Materials fee</dt><dd>{period.materials_fee === null ? 'To confirm' : formatMOP(period.materials_fee, 0)}</dd></>}
    </dl>}
    {detail.status === 'Pending Payment' && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
      <dt className="text-ink-subtle">Collection</dt><dd className="text-right"><PaymentMethodBadge method={period.collection.method} /></dd>
      <dt className="text-ink-subtle">{period.collection.method === 'manual' ? 'Pay before' : 'Debit dates'}</dt><dd className="text-right">{period.collection.method === 'manual' ? formatShortDate(period.collection.due_before_lesson) : `${formatShortDate(period.collection.debit_from)} to ${formatShortDate(period.collection.debit_to)}`}</dd>
    </dl>}
  </section>;
  return <section aria-label="Enrollment fee" className="overflow-hidden rounded-lg border border-line">
    <section aria-label="Linked enrollments" className="divide-y divide-line px-3">
      {detail.lines.map((line, index) => {
        const slot = detail.review.scenario.slots[line.slot_index];
        const enrollment = `Enrollment #${line.enrollment_id}`;
        return <div key={line.enrollment_id} className="space-y-2 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {onOpenEnrollment ? <button type="button" className="text-sm font-semibold text-accent-ink hover:underline" onClick={() => onOpenEnrollment(line.enrollment_id)}>{enrollment}</button> : <Link className="text-sm font-semibold text-accent-ink hover:underline" href={`/enrollments/${line.enrollment_id}`}>{enrollment}</Link>}
            {index === 0 && <Badge tone={status === 'Cancelled' ? 'neutral' : status === 'Paid' ? 'success' : status === 'Overdue' ? 'danger' : 'warning'}>{status}</Badge>}
          </div>
          <p className="flex items-center gap-2 text-sm"><UserRound className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />{line.tutor_name}{multiple && <span className="ml-auto text-xs text-ink-subtle">{plural(line.lesson_count, 'session')}</span>}</p>
          {slot && <p className="flex items-center gap-2 text-xs text-ink-subtle"><Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{[slot.weekday, slot.time_slot, slot.location].filter(Boolean).join(' · ')}</span></p>}
        </div>;
      })}
    </section>
    <div className="space-y-3 border-t border-line bg-wash p-3">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
        <dt className="text-ink-subtle">Dates</dt><dd className="text-right">{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.last_lesson_date)}</dd>
        {detail.status === 'Pending Payment' && <><dt className="text-ink-subtle">{period.collection.method === 'manual' ? 'Pay before' : 'Debit dates'}</dt><dd className="text-right">{period.collection.method === 'manual' ? formatShortDate(period.collection.due_before_lesson) : `${formatShortDate(period.collection.debit_from)} to ${formatShortDate(period.collection.debit_to)}`}</dd></>}
      </dl>
      <div className="flex flex-wrap items-end justify-between gap-2 border-t border-line pt-3"><div><strong className="text-lg">{period.total_fee === null ? 'To confirm' : formatMOP(period.total_fee, 0)}</strong><p className="mt-0.5 text-xs text-ink-subtle">{plural(period.lesson_count, 'session')}</p></div><PaymentMethodBadge method={period.collection.method} /></div>
      {breakdown && <dl aria-label="Fee breakdown" className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line pt-2 text-xs">
        <dt>Tuition</dt><dd>{formatMOP(period.gross_tuition, 0)}</dd>
        {period.deductions.map((deduction, index) => <div key={index} className="contents"><dt>{deduction.kind === 'trial' ? 'Trial deduction' : deduction.kind === 'staff' ? 'Staff voucher' : 'Coupon'}</dt><dd>−{formatMOP(deduction.amount, 0)}</dd></div>)}
        {period.materials_fee !== 0 && <><dt>Materials</dt><dd>{period.materials_fee === null ? 'To confirm' : formatMOP(period.materials_fee, 0)}</dd></>}
      </dl>}
    </div>
  </section>;
}

function ReceiptCouponCheck({ selected, onSelect, usedOn, onDate, busy }: { selected: boolean; onSelect: (value: boolean) => void; usedOn: string; onDate: (value: string) => void; busy: boolean }) {
  return <div className="space-y-2"><label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected} onChange={event => onSelect(event.target.checked)} />The coupon was selected on this receipt in KMS.</label>{selected && <Field label="Coupon used on (optional)" id="kms-coupon-used-on"><Input type="date" disabled={busy} value={usedOn} onChange={event => onDate(event.target.value)} /></Field>}</div>;
}
function DuplicateReceiptCheck({ checked, onChange, busy }: { checked: boolean; onChange: (value: boolean) => void; busy: boolean }) {
  return <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={checked} onChange={event => onChange(event.target.checked)} />I checked KMS. This receipt number is correct for this payment.</label>;
}
