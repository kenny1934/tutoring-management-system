'use client';

import { useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { CreditCard, Pencil, XCircle, ReceiptText, MessageSquareText, MoreHorizontal } from 'lucide-react';
import { Button, IconButton } from '@/components/controls';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate } from '@/lib/formatters';
import type { Enrollment } from '@/types';
import type { BillingPaymentDetail } from '@/types/billing';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { BillingDraftFocus, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingPayments, type BillingPaymentAction } from './BillingPayments';
import { BillingPaymentStatus, BillingPaymentMessageStatus } from './BillingPaymentStatus';

export function BillingEnrollmentPaymentCard(props: { enrollment: Enrollment; onChanged: () => void }) {
  const auth = useAuth();
  return <EnrollmentPaymentCard key={`${props.enrollment.id}:${props.enrollment.billing_payment_id}:${billingDraftAuthScope(auth)}`} {...props} />;
}

function EnrollmentPaymentCard({ enrollment, onChanged }: { enrollment: Enrollment; onChanged: () => void }) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const scope = `${enrollment.student_id}:${billingDraftAuthScope(auth)}`;
  const paymentId = enrollment.billing_payment_id!;
  const payment = useSWR(['billing-payment', scope, paymentId], () => billingAPI.payment(paymentId, tutorId), { keepPreviousData: false, shouldRetryOnError: false });
  const admin = auth.isAdmin && !auth.isReadOnly;
  const options = useSWR(admin ? ['billing-payment-options', billingDraftAuthScope(auth)] : null, () => billingAPI.options(), { keepPreviousData: false, shouldRetryOnError: false });
  const [action, setAction] = useState<Exclude<BillingPaymentAction, 'message'> | 'summary' | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageOpened, setMessageOpened] = useState(false);
  const [notice, setNotice] = useState('');
  const messageId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const detail = payment.data?.id === paymentId && payment.data.student_id === enrollment.student_id ? payment.data : null;
  const line = detail?.lines.find(item => item.enrollment_id === enrollment.id);
  const canWrite = !!admin && !!options.data?.workflow_writes_available && !options.error;
  const sourceBlocked = !!payment.error || !line || !!detail?.review_issues.length;
  const held = !!detail?.batch_action_issue;
  const canAct = canWrite && !sourceBlocked && !held;
  const pending = detail?.status === 'Pending Payment';
  const editable = !!detail && ((['new_student', 'returning_student'].includes(detail.review.scenario.mode) && detail.review.period.number === 1) || detail.review.period.deductions.length > 0);

  function open(next: Exclude<BillingPaymentAction, 'message'> | 'summary', button: HTMLButtonElement) {
    trigger.current = button;
    setAction(next); setMessageOpen(false); setNotice('');
  }
  function changed(kind: BillingPaymentAction) {
    onChanged();
    if (kind !== 'message') setAction(null);
    setNotice(kind === 'charges' ? 'Charges and fee message updated.' : kind === 'paid' ? 'Payment recorded.' : kind === 'cancel' ? 'Enrollment cancelled.' : 'Fee message marked sent.');
  }

  return <section aria-label="Payment summary" className="min-w-0 space-y-4">
    <header className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><CreditCard className="h-4 w-4 text-ink-subtle" aria-hidden="true" />Payment summary</h3>
      {pending && admin && <div className="flex shrink-0 items-center gap-1">
        {editable && <IconButton label="Edit charges" icon={Pencil} size="sm" disabled={!canAct || busy} onClick={event => open('charges', event.currentTarget)} />}
        <DropdownMenu align="right" menuClassName="bg-paper dark:bg-paper border-line dark:border-line" trigger={({ triggerProps }) => <IconButton {...triggerProps} ref={menuTrigger} label="More payment actions" icon={MoreHorizontal} size="sm" disabled={!canAct || busy} />}>
          {close => <button type="button" role="menuitem" autoFocus
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-tint focus-visible:bg-tint focus-visible:outline-none dark:text-red-400 disabled:opacity-50"
            disabled={!canAct || busy} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); menuTrigger.current?.focus(); } }}
            onClick={() => { close(); if (menuTrigger.current) open('cancel', menuTrigger.current); }}>
            <XCircle className="h-4 w-4" aria-hidden="true" />Cancel {detail?.lines.length && detail.lines.length > 1 ? 'enrollments' : 'enrollment'}
          </button>}
        </DropdownMenu>
      </div>}
    </header>
    {payment.error && <div role="alert" className="space-y-2 text-sm"><p>Could not refresh this payment. Refresh before making changes.</p><Button size="sm" onClick={() => { void payment.mutate(); }}>Retry payment</Button></div>}
    {!detail ? !payment.error && <p role="status" className="text-sm text-ink-subtle">Loading payment…</p> : !line ? <p role="alert" className="text-sm">This enrollment is no longer linked to this payment. Refresh the enrollment to continue.</p> : <>
      <EnrollmentFee detail={detail} enrollment={enrollment} />
      {!!detail.review_issues.length && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{detail.review_issues.join(' ')}</p>}
      {admin && options.error && <div role="alert" className="space-y-2 text-sm"><p>Could not load payment settings. Payment changes are unavailable.</p><Button size="sm" onClick={() => { void options.mutate(); }}>Retry settings</Button></div>}
      {admin && !options.error && !options.data && <p role="status" className="text-xs text-ink-subtle">Checking payment settings…</p>}
      {admin && options.data && !options.data.workflow_writes_available && <p className="text-xs text-ink-subtle">Payment changes are currently disabled.</p>}
      {detail.batch_action_issue && <p className="text-xs text-amber-800 dark:text-amber-300">{detail.batch_action_issue}</p>}
      {detail.message_needs_resend && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">Charges changed after the fee message was sent. Send the revised message to the parent.</p>}
      {detail.status === 'Cancelled' && detail.note && <section className="space-y-1"><h4 className="text-xs font-medium text-ink-subtle">Reason for cancellation</h4><p className="whitespace-pre-wrap break-words text-sm">{detail.note}</p></section>}
      <div className="space-y-2 border-t border-line pt-3">
        {pending && admin && <Button variant="primary" icon={CreditCard} className="w-full" disabled={!canAct || busy} onClick={event => open('paid', event.currentTarget)}>Record payment</Button>}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" icon={ReceiptText} disabled={busy} onClick={event => open('summary', event.currentTarget)}>Open payment</Button>
          <Button size="sm" variant="secondary" icon={MessageSquareText} disabled={busy} aria-expanded={messageOpen} aria-controls={messageId} onClick={() => { setMessageOpen(value => !value); setMessageOpened(true); }}>{messageOpen ? 'Close message' : 'Fee message'}</Button>
        </div>
      </div>
      <div id={messageId} hidden={!messageOpen} inert={!messageOpen} className="border-t border-line pt-3">
        {messageOpened && <BillingPayments inline action="message" studentId={enrollment.student_id} initialPaymentId={paymentId} initialDetail={detail} canWrite={canAct} sourceBlocked={sourceBlocked} onBusyChange={setBusy} onActionClose={() => setMessageOpen(false)} onChanged={() => changed('message')} />}
      </div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      <Modal isOpen={!!action} onClose={() => { if (!busy) setAction(null); }} title={action === 'summary' ? 'Payment' : action === 'charges' ? 'Edit charges' : action === 'paid' ? 'Record payment' : detail.lines.length > 1 ? 'Cancel enrollments' : 'Cancel enrollment'} size={action === 'summary' ? "xl" : "lg"} persistent={busy}>
        {action && <BillingDraftFocus trigger={trigger}><BillingPayments key={action} inline action={action === 'summary' ? undefined : action} studentId={enrollment.student_id} initialPaymentId={paymentId} initialDetail={detail} canWrite={canAct} sourceBlocked={sourceBlocked} onBusyChange={setBusy} onActionClose={() => setAction(null)} onChanged={() => { if (action === 'summary') onChanged(); else changed(action); }} /></BillingDraftFocus>}
      </Modal>
    </>}
  </section>;
}

function EnrollmentFee({ detail, enrollment }: { detail: BillingPaymentDetail; enrollment: Enrollment }) {
  const line = detail.lines.find(item => item.enrollment_id === enrollment.id)!;
  const period = detail.review.period;
  const multiple = detail.lines.length > 1;
  const deduction = period.deductions[0];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs text-ink-subtle">{multiple ? 'This enrollment' : 'Total fee'}</p><p className="text-2xl font-semibold tabular-nums">{formatMOP(line.tuition_amount + line.materials_fee, 0)}</p></div>
      <BillingPaymentStatus detail={detail} />
    </div>
    {(line.materials_fee > 0 || line.discount_amount > 0) && <dl aria-label="Fee breakdown" className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
      <dt className="text-ink-subtle">Tuition</dt><dd>{formatMOP(line.gross_tuition, 0)}</dd>
      {line.discount_amount > 0 && <><dt className="text-ink-subtle">{deduction?.kind === 'trial' ? 'Trial deduction' : deduction?.kind === 'staff' ? 'Staff voucher' : 'Coupon'}</dt><dd>−{formatMOP(line.discount_amount, 0)}</dd></>}
      {(line.materials_fee > 0 || enrollment.is_new_student) && <><dt className="text-ink-subtle">Materials fee</dt><dd>{formatMOP(line.materials_fee, 0)}</dd></>}
    </dl>}
    {(detail.status !== 'Cancelled' || (enrollment.is_new_student && !line.materials_fee && !line.discount_amount)) && <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-line pt-3 text-xs">
      {detail.status === 'Paid' ? <><dt className="text-ink-subtle">Payment date</dt><dd className="text-right">{formatShortDate(detail.payment_date)}</dd><dt className="text-ink-subtle">Received by</dt><dd className="text-right">{detail.received_method === 'bank_transfer' ? 'Bank transfer' : detail.received_method === 'autopay' ? 'Autopay' : detail.received_method === 'cash' ? 'Cash' : 'Not recorded'}</dd>{detail.receipt_reference && <><dt className="text-ink-subtle">KMS receipt</dt><dd className="break-words text-right">{detail.receipt_reference}</dd></>}</> : detail.status === 'Pending Payment' ? <>
        <dt className="text-ink-subtle">Collection</dt><dd className="text-right"><PaymentMethodBadge method={period.collection.method} /></dd>
        <dt className="text-ink-subtle">{period.collection.method === 'manual' ? 'Pay before' : 'Debit dates'}</dt><dd className="text-right">{period.collection.method === 'manual' ? formatShortDate(period.collection.due_before_lesson) : `${formatShortDate(period.collection.debit_from)} to ${formatShortDate(period.collection.debit_to)}`}</dd>
      </> : null}
      {enrollment.is_new_student && !line.materials_fee && !line.discount_amount && <><dt className="text-ink-subtle">Materials fee</dt><dd className="text-right">{formatMOP(0, 0)}</dd></>}
    </dl>}
    {multiple && <p className="rounded border border-line bg-wash p-2 text-xs text-ink-subtle">This enrollment is part of a payment covering {detail.lines.length} enrollments. Payment total: <strong className="font-semibold text-foreground">{period.total_fee == null ? 'To confirm' : formatMOP(period.total_fee, 0)}</strong>.</p>}
    <BillingPaymentMessageStatus detail={detail} />
    {detail.status === 'Paid' && detail.note && <section className="space-y-1"><h4 className="text-xs font-medium text-ink-subtle">Payment note</h4><p className="whitespace-pre-wrap break-words text-sm">{detail.note}</p></section>}
  </div>;
}
