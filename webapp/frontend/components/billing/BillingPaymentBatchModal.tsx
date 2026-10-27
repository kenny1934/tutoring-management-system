'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { Check, CreditCard, Loader2, Send } from 'lucide-react';
import { useSWRConfig } from 'swr';
import { Button, Field, Input, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { useAuth } from '@/contexts/AuthContext';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { billingPaymentHref } from '@/lib/billing-workflow';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { loadPaymentBatchItem, localPaymentDate, paymentBatchDateValid, PaymentBatchRunner, type PaymentBatchAction, type PaymentBatchInput, type PaymentBatchItem, type PaymentBatchTarget } from '@/lib/billing-payment-batch';
import { BillingDraftFocus, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';

interface Props {
  targets: PaymentBatchTarget[];
  action: PaymentBatchAction;
  writesAvailable: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: (completedIds: string[]) => void;
  onChanged: () => void;
}

export function BillingPaymentBatchModal(props: Props) {
  const auth = useAuth();
  const scope = JSON.stringify([billingDraftAuthScope(auth), auth.isReadOnly, props.writesAvailable, props.action,
    props.targets.map(target => [target.paymentId, target.student.id])]);
  return <PaymentBatchContent key={scope} {...props} auth={auth} />;
}

function PaymentBatchContent({ targets, action, writesAvailable, trigger, onClose, onChanged, auth }: Props & { auth: ReturnType<typeof useAuth> }) {
  const { mutate } = useSWRConfig();
  const [initial] = useState(() => [...new Map(targets.map(target => [target.paymentId, target])).values()].sort((a, b) =>
    (a.student.school_student_id ?? '').localeCompare(b.student.school_student_id ?? '', undefined, { numeric: true }) || a.student.id - b.student.id));
  const [items, setItems] = useState<PaymentBatchItem[]>(() => initial.map(target => ({ target, payment: null, issues: [] })));
  const itemsRef = useRef(items); itemsRef.current = items;
  const [inputs, setInputs] = useState<Record<string, PaymentBatchInput>>(() => Object.fromEntries(initial.map(target => [target.paymentId, { language: 'zh', paymentDate: localPaymentDate(), method: 'cash' }])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(true);
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [runner] = useState(() => new PaymentBatchRunner());
  const active = useRef(true);
  const running = useRef(false);
  const operations = useRef(new Set<AbortController>());
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const changedRef = useRef(onChanged); changedRef.current = onChanged;
  const tutorId = billingDraftTutorId(auth);
  const writable = auth.isAdmin && !auth.isReadOnly && writesAvailable;
  const busy = checking || !!workingId || !!rechecking;
  const replace = useCallback((item: PaymentBatchItem) => setItems(previous => previous.map(value => value.target.paymentId === item.target.paymentId ? item : value)), []);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController(); const pending = operations.current; pending.add(controller);
    let next = 0;
    async function worker() {
      while (next < initial.length && !controller.signal.aborted) {
        const target = initial[next++];
        const item = await loadPaymentBatchItem(target, action, tutorId, controller.signal);
        if (!active.current || controller.signal.aborted) return;
        replace(item);
        if (!item.issues.length && item.payment) setSelected(previous => new Set(previous).add(target.paymentId));
      }
    }
    if (auth.isAdmin && !auth.isReadOnly) {
      void Promise.all(Array.from({ length: Math.min(3, initial.length) }, worker)).catch(error => {
        if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not check these payments.');
      }).finally(() => {
        pending.delete(controller);
        if (active.current && !controller.signal.aborted) setChecking(false);
      });
    } else setChecking(false);
    return () => { active.current = false; for (const operation of pending) operation.abort(); pending.clear(); };
  }, [action, initial, tutorId, auth.isAdmin, auth.isReadOnly, replace]);

  const ready = (item: PaymentBatchItem) => !!item.payment && !item.issues.length && !item.outcome;
  const chosen = items.filter(item => selected.has(item.target.paymentId) && ready(item));
  const total = chosen.reduce((sum, item) => sum + (item.payment!.review.period.total_fee ?? 0), 0);
  const completed = items.filter(item => item.outcome?.kind === 'done');
  const reviewCount = items.filter(item => item.issues.length || item.outcome?.kind === 'error').length;
  function sharedValue(field: keyof PaymentBatchInput) {
    const value = chosen.length ? inputs[chosen[0].target.paymentId][field] : '';
    return chosen.every(item => inputs[item.target.paymentId][field] === value) ? value : '';
  }
  const sharedDate = sharedValue('paymentDate');
  const datesVary = chosen.some(item => inputs[item.target.paymentId].paymentDate !== inputs[chosen[0].target.paymentId].paymentDate);
  const sharedMethod = sharedValue('method');
  const sharedLanguage = sharedValue('language');

  function changeInput(id: string, value: Partial<PaymentBatchInput>) {
    setInputs(previous => ({ ...previous, [id]: { ...previous[id], ...value } }));
    setAcknowledged(false);
  }
  function toggle(id: string) {
    setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    setAcknowledged(false);
  }
  function updateSelected(value: Partial<PaymentBatchInput>) {
    if (busy || running.current || !writable || !chosen.length) return;
    setInputs(previous => ({ ...previous, ...Object.fromEntries(chosen.map(item => {
      const id = item.target.paymentId;
      return [id, { ...previous[id], ...value }];
    })) }));
    setAcknowledged(false);
  }

  async function recheck(item: PaymentBatchItem) {
    if (busy || running.current || item.outcome?.retryable) return;
    const controller = new AbortController(); operations.current.add(controller);
    setRechecking(item.target.paymentId); setAcknowledged(false);
    try {
      const fresh = await loadPaymentBatchItem(item.target, action, tutorId, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      replace(fresh);
      setSelected(previous => { const next = new Set(previous); if (!fresh.issues.length && fresh.payment) next.add(item.target.paymentId); else next.delete(item.target.paymentId); return next; });
    } catch { /* Scope changes abort the read without replacing reviewed data. */ }
    finally { operations.current.delete(controller); if (active.current) setRechecking(null); }
  }

  async function run(retry?: PaymentBatchItem) {
    if (busy || running.current || !writable || (!retry && (!acknowledged || !chosen.length)) || (retry && !retry.outcome?.retryable)) return;
    running.current = true; setAcknowledged(false); setFailure(null);
    const controller = new AbortController(); operations.current.add(controller);
    let attempted = false;
    try {
      for (const item of retry ? [retry] : chosen) {
        if (!active.current || controller.signal.aborted) break;
        setWorkingId(item.target.paymentId);
        attempted = true;
        const result = await runner.run(item, action, inputs[item.target.paymentId], tutorId, controller.signal);
        if (!active.current || controller.signal.aborted) break;
        replace(result);
        setSelected(previous => { const next = new Set(previous); next.delete(item.target.paymentId); return next; });
      }
    } catch (error) {
      if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not finish these payments.');
    } finally {
      operations.current.delete(controller); running.current = false;
      // A lost response can follow a successful write, so refresh after attempts too.
      if (attempted) {
        void invalidateRenewalQueueCache().catch(() => {});
        void mutate(key => Array.isArray(key) && ['overdue-enrollments', 'dashboard-stats', 'billing-receipts', 'billing-receipts-count', 'billing-coupons', 'billing-payment', 'billing-payments', 'billing-autopay'].includes(key[0])).catch(() => {});
        changedRef.current();
      }
      if (active.current && !controller.signal.aborted) { setWorkingId(null); resultHeading.current?.focus(); }
    }
  }

  const datesValid = action === 'sent' || chosen.every(item => paymentBatchDateValid(inputs[item.target.paymentId].paymentDate));
  const title = action === 'sent' ? 'Mark messages sent' : 'Record payments';
  return <Modal isOpen onClose={() => { if (!running.current) onClose(completed.map(item => item.target.paymentId)); }} title={title} size="xl" persistent={!!workingId}
    className="min-h-0 [&>div.flex-1]:min-h-0 [&>div:last-child]:shrink-0" footer={<div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm">{plural(chosen.length, 'payment')} selected{action === 'paid' && chosen.length > 0 && <span className="ml-2 font-semibold">{formatMOP(total, 0)}</span>}</p>
      <div className="flex min-w-0 flex-wrap gap-2"><Button disabled={!!workingId} onClick={() => onClose(completed.map(item => item.target.paymentId))}>Close</Button><Button variant="primary" icon={action === 'sent' ? Send : CreditCard} loading={!!workingId} disabled={!writable || busy || !chosen.length || !acknowledged || !datesValid} onClick={() => void run()}>{action === 'sent' ? 'Mark sent' : 'Confirm payments'}</Button></div>
    </div>}>
    <BillingDraftFocus trigger={trigger}><div className="space-y-4">
      {!writable && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{auth.isReadOnly || !auth.isAdmin ? 'Read-only access.' : 'Payment recording is not enabled yet.'}</p>}
      <fieldset disabled={busy || !writable || !chosen.length} className="flex min-w-0 flex-wrap items-start gap-3 rounded-md border border-line bg-wash p-3">
        <legend className="px-1 text-xs font-medium text-ink-subtle">Selected payments</legend>
        {action === 'sent' ? <Field label="Message language" id="batch-message-language"><Select id="batch-message-language" value={sharedLanguage} disabled={busy || !writable || !chosen.length} onChange={event => updateSelected({ language: event.target.value as 'zh' | 'en' })}><option value="" disabled>{chosen.length ? 'Mixed' : 'Select payments'}</option><option value="zh">Chinese</option><option value="en">English</option></Select></Field> : <>
          <Field label="Payment date" id="batch-payment-date" hint={datesVary ? 'Dates vary' : undefined}><Input id="batch-payment-date" type="date" max={localPaymentDate()} value={sharedDate} disabled={busy || !writable || !chosen.length} onChange={event => updateSelected({ paymentDate: event.target.value })} /></Field>
          <Field label="Received by" id="batch-payment-method"><Select id="batch-payment-method" value={sharedMethod} disabled={busy || !writable || !chosen.length} onChange={event => updateSelected({ method: event.target.value as PaymentBatchInput['method'] })}><option value="" disabled>{chosen.length ? 'Mixed' : 'Select payments'}</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></Select></Field>
        </>}
      </fieldset>
      {checking && <p role="status" className="flex items-center gap-2 text-sm text-ink-subtle"><Loader2 className="h-4 w-4 animate-spin" />Checking payments…</p>}
      {failure && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure}</p>}
      <h3 ref={resultHeading} tabIndex={-1} className="text-sm font-semibold outline-none">{plural(initial.length, 'payment')}{completed.length > 0 && <span className="ml-3 text-green-700 dark:text-green-300">{completed.length} completed</span>}{reviewCount > 0 && <span className="ml-3 text-amber-800 dark:text-amber-300">{reviewCount} to check</span>}</h3>
      <div className="space-y-2">{items.map(item => {
        const id = item.target.paymentId; const period = item.payment?.review.period; const input = inputs[id];
        const itemReady = ready(item); const done = item.outcome?.kind === 'done'; const uncertain = item.outcome?.retryable;
        return <article key={id} aria-label={`Payment for ${item.target.student.student_name}`} className="space-y-2 rounded-md border border-line p-3">
          <div className="flex items-start gap-2">
            {itemReady ? <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" aria-label={`Select ${item.target.student.student_name}`} checked={selected.has(id)} disabled={busy} onChange={() => toggle(id)} /> : done ? <Check className="mt-1 h-4 w-4 shrink-0 text-green-700 dark:text-green-300" aria-hidden="true" /> : null}
            <div className="min-w-0 flex-1"><StudentInfoBadges student={{ student_id: item.target.student.id, student_name: item.target.student.student_name,
              school_student_id: item.target.student.school_student_id ?? undefined, grade: item.target.student.grade ?? undefined,
              home_location: item.target.student.home_location ?? undefined }} nameHref={busy ? undefined : `/students/${item.target.student.id}`} /></div>
            {period && <strong className="shrink-0 text-sm">{period.total_fee == null ? 'To check' : formatMOP(period.total_fee, 0)}</strong>}
            {(workingId === id || rechecking === id) && <Loader2 aria-label="Working" className="h-4 w-4 shrink-0 animate-spin" />}
          </div>
          {period && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">{action === 'sent' && <PaymentMethodBadge method={period.collection.method} />}<span>{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.coverage_through)} · {plural(period.lesson_count, 'session')}{item.payment!.lines.length > 1 && ` · ${item.payment!.lines.length} weekly classes`}</span></div>}
          {item.outcome && <p role={done ? 'status' : 'alert'} className={done ? 'text-xs text-green-700 dark:text-green-300' : 'text-xs text-red-700 dark:text-red-300'}>{item.outcome.text}</p>}
          {item.issues.length > 0 && !item.outcome && <p className="text-xs text-amber-800 dark:text-amber-300">{item.issues[0]}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {itemReady && (action === 'sent' ? <Select aria-label={`Message language for ${item.target.student.student_name}`} className="w-36" value={input.language} disabled={busy} onChange={event => changeInput(id, { language: event.target.value as 'zh' | 'en' })}><option value="zh">Chinese</option><option value="en">English</option></Select> : <details className="min-w-0 text-xs"><summary className="cursor-pointer text-accent-ink">{input.method === 'cash' ? 'Cash' : 'Bank transfer'} · {formatShortDate(input.paymentDate)}</summary><div className="mt-2 flex flex-wrap gap-2"><Field label="Payment date" id={`date-${id}`}><Input id={`date-${id}`} type="date" max={localPaymentDate()} value={input.paymentDate} disabled={busy} onChange={event => changeInput(id, { paymentDate: event.target.value })} /></Field><Field label="Received by" id={`method-${id}`}><Select id={`method-${id}`} value={input.method} disabled={busy} onChange={event => changeInput(id, { method: event.target.value as PaymentBatchInput['method'] })}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option></Select></Field></div></details>)}
            <div className="ml-auto flex flex-wrap gap-2">{uncertain ? <Button size="sm" disabled={busy || !writable} onClick={() => void run(item)}>Retry action</Button> : !done && !itemReady && <Button size="sm" disabled={busy} onClick={() => void recheck(item)}>Recheck</Button>}{busy ? <span className="text-xs text-ink-subtle">Open payment</span> : <Link className="text-xs text-accent-ink hover:underline" href={billingPaymentHref(item.target.student.id, id)}>Open payment</Link>}</div>
          </div>
        </article>;
      })}</div>
      {chosen.length > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={acknowledged} disabled={busy || !writable} onChange={event => setAcknowledged(event.target.checked)} />{action === 'sent' ? 'The selected fee messages have been sent.' : 'The full amounts shown have been received.'}</label>}
      {action === 'paid' && <p className="text-xs text-ink-subtle">Record the KMS receipt numbers in the KMS receipts tab after issuing them.</p>}
    </div></BillingDraftFocus>
  </Modal>;
}
