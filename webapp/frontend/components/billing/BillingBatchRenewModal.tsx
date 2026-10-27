'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCcw, Save } from 'lucide-react';
import { Badge, Button, buttonClasses } from '@/components/controls';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { useAuth } from '@/contexts/AuthContext';
import { useOverlayLayer } from '@/hooks/useOverlayLayer';
import { BillingBatchRunner, billingBatchReady, emptyBillingBatchItem, loadBillingBatch, loadBillingBatchItem, type BillingBatchAction, type BillingBatchItem } from '@/lib/billing-batch';
import { formatShortDate } from '@/lib/formatters';
import type { BillingDraftDetail, BillingDraftReview, BillingOptions, BillingQueueRow } from '@/types/billing';
import { BillingDraftFocus, BillingDraftSummaryContent, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingRenewalPanel, type BillingRenewalAction } from './BillingRenewalPanel';

interface BillingBatchRenewModalProps {
  rows: BillingQueueRow[];
  options: BillingOptions;
  trigger: RefObject<HTMLButtonElement | null>;
  onClose: (items?: BillingBatchItem[]) => void;
  onChanged: () => void;
}

function studentOrder(a: BillingQueueRow, b: BillingQueueRow) {
  const first = a.student.school_student_id?.trim() ?? '';
  const second = b.student.school_student_id?.trim() ?? '';
  const firstNumeric = /^\d+$/.test(first); const secondNumeric = /^\d+$/.test(second);
  if (firstNumeric !== secondNumeric) return firstNumeric ? -1 : 1;
  return (firstNumeric ? Number(first) - Number(second) : first.localeCompare(second))
    || a.student.id - b.student.id;
}

export function BillingBatchRenewModal(props: BillingBatchRenewModalProps) {
  const auth = useAuth();
  const scope = JSON.stringify([billingDraftAuthScope(auth), auth.isReadOnly, props.rows.map(row => row.student.id).sort((a, b) => a - b),
    props.options.draft_storage_available, props.options.workflow_available, props.options.workflow_writes_available]);
  return <BatchRenewContent key={scope} {...props} auth={auth} />;
}

function BatchRenewContent({ rows, options, trigger, onClose, onChanged, auth }: BillingBatchRenewModalProps & { auth: ReturnType<typeof useAuth> }) {
  const router = useRouter();
  const layer = useOverlayLayer(true, { lockScroll: true });
  // Queue refreshes must not replace an in-flight student's exact retry state.
  const [initialRows] = useState(() => [...rows].sort(studentOrder));
  const [items, setItems] = useState(() => initialRows.map(emptyBillingBatchItem));
  const itemsRef = useRef(items); itemsRef.current = items;
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(true);
  const [rechecking, setRechecking] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState<BillingBatchAction | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: number; mode: 'summary' | 'edit' } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const previousDetail = useRef<typeof detail>(null);
  const active = useRef(true);
  const running = useRef(false);
  const reloads = useRef(new Map<number, AbortController>());
  const operations = useRef(new Set<AbortController>());
  const [runner] = useState(() => new BillingBatchRunner({
    draftStorageAvailable: auth.isAdmin && !auth.isReadOnly && !!options.draft_storage_available,
    workflowWritesAvailable: auth.isAdmin && !auth.isReadOnly && !!options.workflow_writes_available,
  }));
  const tutorId = billingDraftTutorId(auth);
  const working = !!processing || editorBusy;
  const busy = working || checking || rechecking.size > 0;
  const onChangedRef = useRef(onChanged); onChangedRef.current = onChanged;

  const replace = useCallback((item: BillingBatchItem) => {
    setItems(current => current.map(value => value.row.student.id === item.row.student.id ? item : value));
  }, []);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController(); operations.current.add(controller);
    if (!auth.isAdmin) { setChecking(false); return () => { active.current = false; controller.abort(); }; }
    loadBillingBatch(initialRows, { workflowAvailable: !!options.workflow_available, tutorId, signal: controller.signal }, item => {
      if (!active.current || controller.signal.aborted) return;
      replace(item);
      setLoaded(current => new Set(current).add(item.row.student.id));
      if (billingBatchReady(item)) setSelected(current => new Set(current).add(item.row.student.id));
    }).catch(error => {
      if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not check these renewals.');
    }).finally(() => {
      operations.current.delete(controller);
      if (active.current && !controller.signal.aborted) setChecking(false);
    });
    const pending = operations.current;
    return () => { active.current = false; for (const operation of pending) operation.abort(); pending.clear(); };
  }, [initialRows, options.workflow_available, tutorId, auth.isAdmin, replace]);

  useLayoutEffect(() => {
    if (detail) heading.current?.focus();
    else if (previousDetail.current) {
      (document.querySelector<HTMLButtonElement>(`[data-batch-details="${previousDetail.current.id}"]`) ?? listHeading.current)?.focus();
    }
    previousDetail.current = detail;
  }, [detail]);

  const reload = useCallback(async (item: BillingBatchItem, draft?: BillingDraftDetail) => {
    if (item.outcome?.retryable || !active.current) return;
    const id = item.row.student.id;
    reloads.current.get(id)?.abort();
    const controller = new AbortController(); operations.current.add(controller);
    reloads.current.set(id, controller);
    setRechecking(current => new Set(current).add(id));
    setSelected(current => { const next = new Set(current); next.delete(id); return next; });
    setAcknowledged(null);
    try {
      const row = item.draft ? { ...item.row, draft_id: item.draft.id } : item.row;
      const fresh = await loadBillingBatchItem(row, { workflowAvailable: !!options.workflow_available, tutorId, draft, signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      replace(fresh); setLoaded(current => new Set(current).add(id));
    } catch (error) {
      if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not refresh this renewal.');
    } finally {
      operations.current.delete(controller);
      if (active.current && !controller.signal.aborted) setRechecking(current => { const next = new Set(current); next.delete(id); return next; });
      if (reloads.current.get(id) === controller) reloads.current.delete(id);
    }
  }, [options.workflow_available, tutorId, replace]);

  const ready = items.filter(billingBatchReady);
  const needsReview = items.filter(item => loaded.has(item.row.student.id) && !billingBatchReady(item) && item.outcome?.kind !== 'created');
  const completed = items.filter(item => item.outcome?.kind === 'created');
  const chosen = ready.filter(item => selected.has(item.row.student.id));
  const reviewKey = JSON.stringify(chosen.map(item => [item.row.student.id, item.review?.review_hash, item.draft?.id, item.draft?.revision, item.preferences?.version]));
  const creationBlocked = chosen.some(item => item.creationReasons.length > 0);
  const canSave = auth.isAdmin && !auth.isReadOnly && !!options.draft_storage_available && chosen.length > 0 && !busy;
  const canCreate = canSave && !!options.workflow_writes_available && !creationBlocked && acknowledged === reviewKey;
  const shown = detail ? items.find(item => item.row.student.id === detail.id) : undefined;

  async function run(action: BillingBatchAction, retryItem?: BillingBatchItem) {
    if (!active.current || running.current || busy || !auth.isAdmin || auth.isReadOnly || !options.draft_storage_available) return;
    if (action === 'create' && !options.workflow_writes_available) return;
    const targets = retryItem ? [retryItem] : chosen;
    if (!targets.length || (retryItem ? !retryItem.outcome?.retryable || retryItem.outcome.action !== action : action === 'create' && !canCreate)) return;
    running.current = true;
    const controller = new AbortController(); operations.current.add(controller);
    setProcessing(action); setAcknowledged(null); setFailure(null);
    let changed = false;
    try {
      for (const item of targets) {
        if (controller.signal.aborted || !active.current) break;
        setProcessingId(item.row.student.id);
        const result = await runner.run(item, action, controller.signal);
        if (controller.signal.aborted || !active.current) break;
        replace(result); changed = true;
        if (result.outcome?.kind === 'created' || result.outcome?.kind === 'error') setSelected(current => { const next = new Set(current); next.delete(item.row.student.id); return next; });
      }
    } catch (error) {
      if (active.current && !controller.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not finish this batch.');
    } finally {
      operations.current.delete(controller);
      running.current = false;
      if (active.current && !controller.signal.aborted) {
        setProcessing(null); setProcessingId(null);
        if (changed) onChangedRef.current();
        listHeading.current?.focus();
      }
    }
  }

  const panelChanged = useCallback(() => {
    onChangedRef.current();
    const current = itemsRef.current.find(item => item.row.student.id === detail?.id);
    if (current) void reload(current);
  }, [detail?.id, reload]);
  const panelAction = useCallback((action: BillingRenewalAction) => {
    if (action.kind !== 'payment') return;
    const current = itemsRef.current.find(item => item.row.student.id === detail?.id);
    if (current) { setDetail({ id: current.row.student.id, mode: 'summary' }); void reload(current); }
  }, [detail?.id, reload]);
  const draftSaved = useCallback((draft: BillingDraftDetail) => {
    const current = itemsRef.current.find(item => item.row.student.id === draft.student_id);
    if (!current) return;
    setDetail({ id: draft.student_id, mode: 'summary' }); void reload(current, draft); onChangedRef.current();
  }, [reload]);

  function toggle(id: number) {
    if (busy) return;
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function close() { if (!working && !running.current) onClose(itemsRef.current); }

  function resultActions(item: BillingBatchItem) {
    const paymentId = item.outcome?.payment?.id ?? item.draft?.confirmed_payment_id;
    if (paymentId) return <Link className={buttonClasses({ size: 'sm', variant: 'quiet' })} tabIndex={busy ? -1 : undefined} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }} href={`/billing/students/${item.row.student.id}?view=payments&payment=${encodeURIComponent(paymentId)}`}>Open payment</Link>;
    if (item.outcome?.retryable) return <Button size="sm" disabled={busy || auth.isReadOnly || !options.draft_storage_available || (item.outcome.action === 'create' && !options.workflow_writes_available)} onClick={() => void run(item.outcome!.action, item)}>Retry {item.outcome.action === 'create' ? 'creation' : 'save'}</Button>;
    return <Button size="sm" variant="quiet" disabled={busy} onClick={() => void reload(item)}>Recheck</Button>;
  }

  function comparisonRow(item: BillingBatchItem) {
    const id = item.row.student.id;
    const isReady = billingBatchReady(item);
    const pending = processingId === id || rechecking.has(id);
    return <article key={id} aria-label={`Renewal for ${item.row.student.student_name}`} className="space-y-2 rounded-md border border-line bg-paper p-3">
      <div className="flex items-start gap-2">
        {isReady && <input aria-label={`Select ${item.row.student.student_name}`} type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.has(id)} disabled={busy} onChange={() => toggle(id)} />}
        <div className="min-w-0 flex-1"><BatchStudent row={item.row} /></div>
        {pending && <Loader2 aria-label="Working" className="h-4 w-4 shrink-0 animate-spin text-ink-subtle" />}
      </div>
      {item.review && <BatchComparison review={item.review} />}
      {item.outcome && <p role={item.outcome.kind === 'error' ? 'alert' : 'status'} className={item.outcome.kind === 'error' ? 'text-xs text-red-700 dark:text-red-300' : 'text-xs font-medium text-green-700 dark:text-green-300'}>{item.outcome.text}</p>}
      {item.reasons.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{item.reasons[0]}{item.reasons.length > 1 && <span className="ml-2 text-ink-subtle">+{item.reasons.length - 1} {item.reasons.length === 2 ? 'check' : 'checks'}</span>}</p>}
      {isReady && options.workflow_writes_available && item.creationReasons.length > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{item.creationReasons[0]}{item.creationReasons.length > 1 && <span className="ml-2 text-ink-subtle">+{item.creationReasons.length - 1} {item.creationReasons.length === 2 ? 'check' : 'checks'}</span>}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {item.draft && item.draft.state !== 'discarded' && !item.draft.confirmed_payment_id && !item.outcome && <Badge>Draft saved</Badge>}
        <Button data-batch-details={id} size="sm" disabled={busy} onClick={() => setDetail({ id, mode: 'summary' })}>Details</Button>
        {(!isReady || item.outcome) && resultActions(item)}
      </div>
    </article>;
  }

  const footer = !detail && auth.isAdmin ? <div className="space-y-3">
    {auth.isReadOnly && <p className="text-xs text-ink-subtle">You have read-only access.</p>}
    {!options.workflow_writes_available && <p className="text-xs text-ink-subtle">Enrollment creation is not enabled yet.</p>}
    {!options.draft_storage_available && <p className="text-xs text-ink-subtle">Saving drafts is not available yet.</p>}
    {!auth.isReadOnly && !!options.workflow_writes_available && chosen.length > 0 && (creationBlocked ? <p className="text-xs text-amber-800 dark:text-amber-300">Check the payment settings for the selected students before creating enrollments.</p> : <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged === reviewKey} disabled={busy} onChange={event => setAcknowledged(event.target.checked ? reviewKey : null)} className="mt-1" />I checked the selected session dates and total fees.</label>)}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-ink-subtle">{chosen.length} selected{chosen.length > 0 ? ` · $${chosen.reduce((total, item) => total + (item.review?.period.total_fee ?? 0), 0).toLocaleString('en-US')}` : ''}</span><div className="flex flex-wrap justify-end gap-2"><Button disabled={working} onClick={close}>Close</Button><Button icon={Save} disabled={!canSave} loading={processing === 'save'} onClick={() => void run('save')}>Save drafts</Button><Button icon={RefreshCcw} variant="primary" disabled={!canCreate} loading={processing === 'create'} onClick={() => void run('create')}>Create selected</Button></div></div>
  </div> : undefined;

  return <Modal isOpen title="Batch renewal" size="xl" persistent={working} layer={layer} onClose={close} footer={footer} className="min-w-0 [&>div:not(.overflow-y-auto)]:shrink-0 [&>div.overflow-y-auto]:min-h-0">
    <BillingDraftFocus trigger={trigger} suspended={!layer.isTopmost}>
      {!auth.isAdmin ? <p className="text-sm">An admin can prepare batch renewals.</p> : <div className="min-w-0 space-y-4">
        {failure && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure}</p>}
        {shown ? <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><Button icon={ArrowLeft} size="sm" disabled={busy} onClick={() => setDetail(null)}>Back to batch</Button>{detail?.mode === 'summary' && !auth.isReadOnly && !shown.outcome?.retryable && !shown.draft?.confirmed_payment_id && shown.outcome?.kind !== 'created' && <Button size="sm" disabled={busy} onClick={() => setDetail({ id: shown.row.student.id, mode: 'edit' })}>Review renewal</Button>}</div>
          <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">{shown.row.student.student_name}</h3>
          {detail?.mode === 'edit' ? <BillingRenewalPanel
            row={shown.draft ? { ...shown.row, draft_id: shown.draft.id, origin: 'draft' } : shown.row}
            initialAction={shown.draft ? { kind: 'draft', id: shown.draft.id } : { kind: 'renew' }}
            onBusyChange={setEditorBusy} onChanged={panelChanged} onActionChange={panelAction} onBatchDraftSaved={draftSaved}
            onOpenEnrollment={id => { if (!working) router.push(`/enrollments/${id}`); }}
          /> : rechecking.has(shown.row.student.id) ? <p role="status" className="text-sm text-ink-subtle">Refreshing renewal…</p> : <>
            {shown.review && <BillingDraftSummaryContent review={shown.review} />}
            {shown.outcome && <p role={shown.outcome.kind === 'error' ? 'alert' : 'status'} className="text-sm">{shown.outcome.text}</p>}
            {shown.reasons.length > 0 && <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">{shown.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
            {!!options.workflow_writes_available && shown.creationReasons.length > 0 && <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">{shown.creationReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
            <div className="flex justify-end">{resultActions(shown)}</div>
          </>}
        </div> : <>
          <h3 ref={listHeading} tabIndex={-1} className="sr-only outline-none">Batch renewal results</h3>
          <div className="grid grid-cols-2 gap-2"><div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{ready.length} ready</div><div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{needsReview.length} need review</div></div>
          {checking && <p role="status" className="flex items-center gap-2 text-sm text-ink-subtle"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Checking renewals: {loaded.size} of {items.length}</p>}
          {ready.length > 0 && <section aria-label="Ready renewals" className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Ready</h3><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ready.every(item => selected.has(item.row.student.id))} disabled={busy} onChange={event => { setSelected(event.target.checked ? new Set(ready.map(item => item.row.student.id)) : new Set()); }} />Select ready students</label></div>{ready.map(comparisonRow)}</section>}
          {needsReview.length > 0 && <section aria-label="Renewals needing review" className="space-y-2"><h3 className="text-sm font-semibold">Needs review</h3>{needsReview.map(comparisonRow)}</section>}
          {completed.length > 0 && <section aria-label="Created renewals" className="space-y-2"><h3 className="text-sm font-semibold">Created</h3>{completed.map(comparisonRow)}</section>}
          {!items.length && <p className="text-sm text-ink-subtle">No students are selected.</p>}
        </>}
      </div>}
    </BillingDraftFocus>
  </Modal>;
}

function BatchStudent({ row }: { row: BillingQueueRow }) {
  return <StudentInfoBadges student={{
    student_id: row.student.id,
    student_name: row.student.student_name,
    school_student_id: row.student.school_student_id ?? undefined,
    home_location: row.student.home_location ?? undefined,
    grade: row.student.grade ?? undefined,
    school: row.student.school ?? undefined,
    lang_stream: row.student.lang_stream ?? undefined,
  }} showLocationPrefix />;
}

function BatchComparison({ review }: { review: BillingDraftReview }) {
  const period = review.period;
  const discounts = period.deductions.reduce((total, deduction) => total + deduction.amount, 0);
  return <div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto]">
    <div className="min-w-0"><p>{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.last_lesson_date)}</p><p className="mt-1 text-ink-subtle">{period.lesson_count} sessions{period.counts_by_slot.filter(count => count > 0).length > 1 ? ` · ${period.counts_by_slot.filter(count => count > 0).length} classes` : ''}</p></div>
    <dl className="flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-col"><div className="flex items-center gap-2"><dt>Plan</dt><dd><PaymentMethodBadge method={review.scenario.payment_method} /></dd></div>{review.scenario.payment_method !== period.collection.method && <div className="flex items-center gap-2"><dt>This payment</dt><dd><PaymentMethodBadge method={period.collection.method} /></dd></div>}</dl>
    <div className="sm:text-right"><p className="text-sm font-semibold">{period.total_fee == null ? 'Fee to confirm' : `$${period.total_fee.toLocaleString('en-US')}`}</p>{discounts > 0 && <p className="mt-1 text-ink-subtle">Deductions: ${discounts.toLocaleString('en-US')}</p>}{period.materials_fee !== 0 && <p className="mt-1 text-ink-subtle">Materials: {period.materials_fee == null ? 'To confirm' : `$${period.materials_fee.toLocaleString('en-US')}`}</p>}</div>
  </div>;
}
