'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Badge, Button } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { useVisibilityAwareInterval } from '@/lib/hooks';
import type { BillingReceiptTask, BillingPaymentDetail } from '@/types/billing';
import { BillingChecks } from './BillingChecks';
import { BillingDraftFocus, billingDraftAuthScope } from './BillingDraftReview';
import { BillingPayments } from './BillingPayments';

export function BillingReceiptsQueue({ location, tutorId, search, searchPending }: { location?: string; tutorId?: number; search: string; searchPending: boolean }) {
  const auth = useAuth();
  const scope = JSON.stringify([billingDraftAuthScope(auth), location, tutorId, search]);
  const [page, setPage] = useState({ scope: '', offset: 0 });
  const offset = page.scope === scope ? page.offset : 0;
  const refreshInterval = useVisibilityAwareInterval(60000);
  const state = useSWR(['billing-receipts', scope, offset], () => billingAPI.receipts({ location, tutor_id: tutorId, search: search || undefined, offset, limit: 25 }), { keepPreviousData: false, refreshInterval });
  const { mutate } = useSWRConfig();
  const current = !state.error && !searchPending ? state.data : undefined;
  const [selected, setSelected] = useState<{ scope: string; row: BillingReceiptTask; canWrite: boolean } | null>(null);
  const [receiptFooter, setReceiptFooter] = useState<HTMLDivElement | null>(null);
  const [completed, setCompleted] = useState<{ scope: string; id: string } | null>(null);
  const justCompleted = completed?.scope === scope ? completed.id : null;
  const next = current?.rows.find(row => row.payment_id !== justCompleted);
  const nextReady = !!justCompleted && !!current?.storage_available && current.writes_available && !state.isValidating && !state.error && !searchPending && !current.rows.some(row => row.payment_id === justCompleted);
  useEffect(() => {
    if (justCompleted && current && !state.isValidating && !current.rows.length && current.total > 0 && offset > 0) {
      setPage({ scope, offset: Math.floor((current.total - 1) / 25) * 25 });
    }
  }, [justCompleted, current, state.isValidating, offset, scope]);
  const receiptSaved = (detail: BillingPaymentDetail) => {
    if (detail.id === selected?.row.payment_id && detail.student_id === selected.row.student.id && detail.receipt_reference?.trim()) setCompleted({ scope, id: detail.id });
  };
  const panel = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const busyNow = useRef(false);
  const reportBusy = useCallback((value: boolean) => { busyNow.current = value; setBusy(value); }, []);
  const changed = () => { void state.mutate().catch(() => {}); void mutate(key => Array.isArray(key) && ['billing-receipts-count', 'renewal-queue-counts', 'billing-renewal-queue'].includes(key[0])).catch(() => {}); };
  return <div ref={panel} tabIndex={-1} className="space-y-3">
    {(state.isLoading || searchPending) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading KMS receipts…</p>}
    {state.error && !searchPending && <div role="alert" className="space-y-2 rounded border border-red-300 p-4 text-sm"><p>Could not load KMS receipts.</p><Button size="sm" onClick={() => { void state.mutate(); }}>Retry receipts</Button></div>}
    {current && (!current.storage_available ? <p className="rounded border border-line p-5 text-sm">KMS receipt follow-up is not available yet.</p> : <>
      <p className="text-xs text-ink-subtle">All outstanding · {plural(current.total, 'receipt')}{location ? ` · ${location}` : ''}</p>
      <div className="space-y-3">{current.rows.map(row => <article key={row.payment_id} aria-label={`${row.student.student_name} KMS receipt`} className="rounded-lg border border-line bg-paper p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-2"><StudentInfoBadges nameHref={`/students/${row.student.id}`} showLocationPrefix={!location} student={{ ...row.student, school_student_id: row.student.school_student_id ?? undefined, home_location: row.student.home_location ?? undefined, grade: row.student.grade ?? undefined, school: row.student.school ?? undefined, lang_stream: row.student.lang_stream ?? undefined }} /><div className="flex flex-wrap gap-2"><Badge tone="success">Paid</Badge>{row.coupon_value != null && row.coupon_value > 0 && <Badge>Coupon {formatMOP(row.coupon_value, 0)}</Badge>}{row.needs_checking && <Badge tone="warning">Check payment</Badge>}</div></div><Button size="sm" onClick={event => { trigger.current = event.currentTarget; setCompleted(null); setSelected({ scope, row, canWrite: current.writes_available }); }}>{auth.isAdmin && !auth.isReadOnly && current.writes_available ? 'Record receipt' : 'View payment'}</Button></div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs"><span>{row.first_lesson_date && row.last_lesson_date ? `${formatShortDate(row.first_lesson_date)} to ${formatShortDate(row.last_lesson_date)}` : 'Check enrollment dates'}</span>{row.lesson_count != null && <span>{plural(row.lesson_count, 'session')}</span>}<strong>{row.received_amount == null ? 'Amount to confirm' : formatMOP(row.received_amount, 0)}</strong>{row.payment_date && <span className="text-ink-subtle">Received {formatShortDate(row.payment_date)}</span>}</div>
        {!!row.issues.length && <div className="mt-2"><BillingChecks issues={row.issues} compact maxVisible={1} /></div>}
      </article>)}</div>
      {!current.rows.length && <p className="rounded border border-line p-5 text-sm">{search ? 'No students match this search.' : 'No KMS receipts are outstanding.'}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-ink-subtle">{current.total ? `${offset + 1}–${Math.min(offset + current.rows.length, current.total)} of ${current.total}` : '0 receipts'}</p><div className="flex gap-2"><Button size="sm" disabled={!offset} onClick={() => setPage({ scope, offset: Math.max(0, offset - 25) })}>Previous</Button><Button size="sm" disabled={offset + 25 >= current.total} onClick={() => setPage({ scope, offset: offset + 25 })}>Next</Button></div></div>
    </>)}
    {selected?.scope === scope && <Modal isOpen title="Payment" size="xl" className="[&>div:has([data-receipt-footer])]:shrink-0" footer={auth.isAdmin && !auth.isReadOnly && selected.canWrite ? <div ref={setReceiptFooter} data-receipt-footer /> : undefined} persistent={busy} onClose={() => { if (!busyNow.current) { setSelected(null); requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); else panel.current?.focus(); }); } }}><BillingDraftFocus trigger={trigger}><BillingPayments key={`${scope}:${selected.row.payment_id}`} inline mode={auth.isAdmin && !auth.isReadOnly && selected.canWrite ? "receipt" : "payment"} receiptTask={selected.row} receiptFooter={receiptFooter} onReceiptSaved={receiptSaved} onNextReceipt={() => { if (nextReady && next && !busyNow.current) { setCompleted(null); setSelected({ scope, row: next, canWrite: current!.writes_available }); } }} receiptQueueComplete={nextReady && current?.total === 0} nextReceiptDisabled={!nextReady || !next} studentId={selected.row.student.id} initialPaymentId={selected.row.payment_id} sourceBlocked={state.isValidating || !!state.error || searchPending} canWrite={selected.canWrite && current?.writes_available !== false && auth.isAdmin && !auth.isReadOnly} onChanged={changed} onBusyChange={reportBusy} /></BillingDraftFocus></Modal>}
  </div>;
}
