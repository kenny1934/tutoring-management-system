'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/controls';
import { billingAPI } from '@/lib/billing-api';
import { billingToday } from '@/lib/billing-clock';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { shareOrCopy } from '@/lib/share';
import type { BillingPaymentDetail, BillingSupplementDetail } from '@/types/billing';

export function BillingSupplementaryPayments({ detail, canWrite, onUpdate, onBusyChange, collectionOnly = false }: {
  detail: BillingPaymentDetail; canWrite: boolean; collectionOnly?: boolean;
  onUpdate: (detail: BillingPaymentDetail, changed?: boolean) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  if (!detail.supplementary_payments?.length) return null;
  return <section aria-label="Supplementary payments" className="space-y-3 border-t border-line pt-3">
    <h3 className="text-sm font-semibold">Additional sessions</h3>
    {!collectionOnly && (detail.outstanding_supplement_amount ?? 0) > 0 && <p className="text-sm">Partially paid. Additional tuition outstanding: {formatMOP(detail.outstanding_supplement_amount!, 0)}.</p>}
    {detail.supplementary_payments.map(item => <Supplement collectionOnly={collectionOnly} key={item.id} item={item} detail={detail} canWrite={canWrite && detail.review_issues.length === 0} onUpdate={onUpdate} onBusyChange={onBusyChange} />)}
  </section>;
}

function Supplement({ item, detail, canWrite, onUpdate, onBusyChange, collectionOnly }: {
  collectionOnly?: boolean; item: BillingSupplementDetail; detail: BillingPaymentDetail; canWrite: boolean;
  onUpdate: (detail: BillingPaymentDetail, changed?: boolean) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [date, setDate] = useState(billingToday);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [method, setMethod] = useState<'cash' | 'bank_transfer'>('bank_transfer');
  const [receipt, setReceipt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const running = useRef(false);
  const active = useRef(true);
  const retry = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const collect = async () => {
    if (running.current || !canWrite || !confirmed || !date) return;
    running.current = true; setBusy(true); onBusyChange?.(true); setNotice('');
    const body = { expected_version: detail.version, supplement_id: item.id, enrollment_id: item.enrollment_id,
      amount: item.amount, payment_date: date, method, receipt_reference: receipt.trim() || null };
    const payload = JSON.stringify(body);
    if (retry.current?.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
    try {
      const next = await billingAPI.supplementPaid(detail.id, { ...body, idempotency_key: retry.current!.key });
      if (active.current) { await onUpdate(next, true); setNotice('Supplementary payment recorded.'); }
    } catch (error) {
      if (active.current) setNotice(error instanceof Error ? error.message : 'Could not record this payment.');
    } finally {
      running.current = false;
      if (active.current) { setBusy(false); onBusyChange?.(false); }
    }
  };
  return <div className="space-y-3 rounded border border-line p-3">
    <p className="text-sm font-medium">{plural(item.lessons.length, 'additional session')} · {formatMOP(item.amount, 0)} · {item.status === 'Paid' ? 'Paid' : 'Unpaid'}</p>
    <ul className="space-y-1 text-xs">{item.lessons.map(lesson => <li key={lesson.session_id}>{formatShortDate(lesson.date)} · {lesson.time_slot} · {lesson.location}</li>)}</ul>
    {item.status === 'Paid' ? <p className="text-xs text-ink-subtle">Paid {formatShortDate(item.payment_date)}{item.receipt_reference ? ` · KMS receipt ${item.receipt_reference}` : ''}</p> : <>
      {!collectionOnly && item.message && <Field label="Message language" id={`supplement-language-${item.id}`}><Select id={`supplement-language-${item.id}`} value={language} disabled={busy} onChange={event => setLanguage(event.target.value as 'zh' | 'en')}><option value="zh">中文</option><option value="en">English</option></Select></Field>}
      {!collectionOnly && <Button size="sm" disabled={busy || detail.review_issues.length > 0 || !!item.message?.blocked_reasons.length} onClick={async () => {
        try {
          const message = item.message?.[language] ?? `${detail.review.student.student_name}\nAdditional tuition for ${item.lessons.length} sessions: ${formatMOP(item.amount, 0)}.\n${item.lessons.map(lesson => `${lesson.date} ${lesson.time_slot} @ ${lesson.location}`).join('\n')}`;
          const result = await shareOrCopy(message);
          if (active.current && result !== 'cancelled') setNotice(result === 'copied' ? 'Payment message copied.' : 'Payment message shared.');
        } catch { if (active.current) setNotice('Could not copy the payment message.'); }
      }}>Copy payment message</Button>}
      {canWrite && <details open={collectionOnly}><summary className={collectionOnly ? "hidden" : "cursor-pointer text-sm"}>Record supplementary payment</summary><div className="mt-3 space-y-3">
        <Field label="Payment date" id={`supplement-date-${item.id}`}><Input id={`supplement-date-${item.id}`} type="date" max={billingToday()} value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></Field>
        <Field label={collectionOnly ? "Received by" : "Payment method"} id={`supplement-method-${item.id}`}><Select id={`supplement-method-${item.id}`} value={method} disabled={busy} onChange={event => setMethod(event.target.value as 'cash' | 'bank_transfer')}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option></Select></Field>
        <Field label="KMS receipt (optional)" id={`supplement-receipt-${item.id}`}><Input id={`supplement-receipt-${item.id}`} maxLength={100} value={receipt} disabled={busy} onChange={event => setReceipt(event.target.value)} /></Field>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I have received {formatMOP(item.amount, 0)} for these additional sessions.</label>
        <Button size="sm" variant="primary" loading={busy} disabled={busy || !confirmed || !date} onClick={collect}>Record payment</Button>
      </div></details>}
    </>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </div>;
}
