'use client';

import { useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { CreditCard } from 'lucide-react';
import { Button, Field, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP } from '@/lib/formatters';
import type { BillingPaymentDetail } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingSupplementaryPayments } from './BillingSupplementaryPayments';

export function BillingSupplementPaymentButton(props: {
  paymentId: string; studentId: number; enrollmentId?: number; onChanged?: () => void; className?: string;
}) {
  const auth = useAuth();
  return <PaymentButton key={`${props.paymentId}:${props.studentId}:${props.enrollmentId}:${billingDraftAuthScope(auth)}`} {...props} />;
}

function PaymentButton({ paymentId, studentId, enrollmentId, onChanged, className }: {
  paymentId: string; studentId: number; enrollmentId?: number; onChanged?: () => void; className?: string;
}) {
  const auth = useAuth();
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [settled, setSettled] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const scope = `${studentId}:${billingDraftAuthScope(auth)}`;
  const payment = useSWR(open ? ['billing-payment', scope, paymentId] : null, () => billingAPI.payment(paymentId, billingDraftTutorId(auth)), { keepPreviousData: false, shouldRetryOnError: false, dedupingInterval: 0, revalidateOnMount: true });
  const options = useSWR(open ? ['billing-payment-options', billingDraftAuthScope(auth)] : null, () => billingAPI.options(), { keepPreviousData: false, shouldRetryOnError: false });
  const detail = payment.data?.id === paymentId && payment.data.student_id === studentId ? payment.data : null;
  const pending = detail?.supplementary_payments?.filter(item => item.status !== 'Paid' && (enrollmentId === undefined || item.enrollment_id === enrollmentId)) ?? [];
  const item = pending.find(item => item.id === selected) ?? pending[0];
  const verified = !!detail && !payment.error && !payment.isValidating && !payment.isLoading;
  const canWrite = !!options.data?.workflow_writes_available && !options.error && verified && detail.status === 'Paid' && !detail.review_issues.length;

  async function updated(next: BillingPaymentDetail) {
    if (next.id !== paymentId || next.student_id !== studentId) throw new Error('Could not verify this payment. Refresh before continuing.');
    setBusy(false);
    await payment.mutate(next, false);
    const remaining = next.supplementary_payments?.some(item => item.status !== 'Paid' && (enrollmentId === undefined || item.enrollment_id === enrollmentId));
    if (!remaining) { setSettled(true); setOpen(false); }
    onChanged?.();
    void mutate(key => Array.isArray(key) && ['billing-payment', 'billing-payments', 'billing-queue', 'billing-queue-counts', 'billing-receipts', 'billing-receipts-count', 'overdue-enrollments', 'enrollment', 'enrollment-detail', 'enrollments', 'student-enrollments', 'sessions', 'student-sessions'].includes(key[0])).catch(() => {});
  }

  if (!auth.isAdmin || auth.isReadOnly || settled) return null;
  return <>
    <Button ref={trigger} size="sm" icon={CreditCard} className={className} onClick={event => { event.stopPropagation(); setOpen(true); }}>Record payment</Button>
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Record payment" size="lg" persistent={busy}>
      <BillingDraftFocus trigger={trigger}>
        {payment.error || options.error ? <div role="alert" className="space-y-3"><p>Could not refresh this payment. Retry before recording it.</p><Button onClick={() => { void payment.mutate(); void options.mutate(); }}>Retry payment</Button></div>
          : payment.data && !detail ? <p role="alert">This payment no longer belongs to this student. Refresh the enrollment.</p>
          : !verified || !options.data ? <p role="status">Loading payment…</p>
          : !detail ? <p role="alert">This payment no longer belongs to this student. Refresh the enrollment.</p>
          : !canWrite ? <p role="alert">{detail.review_issues.join(' ') || 'Payment changes are currently unavailable.'}</p>
          : !item ? <p role="status">No additional payment is outstanding.</p>
          : <div className="space-y-3">
            <p className="text-sm">Additional tuition only. The original payment is already recorded.</p>
            {pending.length > 1 && <Field id="additional-payment-selection" label="Additional payment"><Select id="additional-payment-selection" value={item.id} disabled={busy} onChange={event => setSelected(event.target.value)}>{pending.map(value => <option key={value.id} value={value.id}>{value.lessons[0]?.date} · {formatMOP(value.amount, 0)}</option>)}</Select></Field>}
            <BillingSupplementaryPayments collectionOnly detail={{ ...detail, supplementary_payments: [item], outstanding_supplement_amount: item.amount }} canWrite onUpdate={updated} onBusyChange={setBusy} />
          </div>}
        <div className="mt-4 flex justify-end"><Button disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
      </BillingDraftFocus>
    </Modal>
  </>;
}
