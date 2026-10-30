'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Copy, Download, RefreshCw } from 'lucide-react';
import { Badge, Button, Field, Input, Textarea } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { billingAPI } from '@/lib/billing-api';
import { readBankExport } from '@/lib/billing-bank-export';
import { bankRunStatus, checkBankRun, refreshAutopayViews } from '@/lib/billing-bank-runs';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { downloadBlob } from '@/lib/geometry-utils';
import type { BillingAutopayExportScope, BillingBankRunDetail } from '@/types/billing';
import type { BankFileMetadata, SavedBankRun } from './BillingBankRuns';
import { BillingPayments } from './BillingPayments';
import { BillingBankResults } from './BillingBankResults';
import { BillingDraftFocus } from './BillingDraftReview';

export function BillingBankRunDetails({ id, scope, initial, canWrite, onBusyChange, onChanged }: {
  id: string; scope: BillingAutopayExportScope; initial?: SavedBankRun; canWrite: boolean;
  onBusyChange: (busy: boolean) => void; onChanged: (run: BillingBankRunDetail) => void;
}) {
  const [run, setRun] = useState<BillingBankRunDetail | null>(() => initial ? checkBankRun(initial.run, id, scope) : null);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(!initial);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [childBusy, setChildBusy] = useState(false);
  const childBusyNow = useRef(false);
  const reportChildBusy = useCallback((value: boolean) => { childBusyNow.current = value; setChildBusy(value); onBusyChange(value); }, [onBusyChange]);
  const [failure, setFailure] = useState<string | null>(initial?.error ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailsFocus = useRef<HTMLElement | null>(null);
  const noticeFocus = useRef<HTMLParagraphElement | null>(null);
  const focusNotice = useRef(false);
  const [downloaded, setDownloaded] = useState<BankFileMetadata | null>(initial?.downloaded ?? null);
  const [form, setForm] = useState<'submit' | 'discard' | null>(null);
  const [batch, setBatch] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ id: string; studentId: number } | null>(null);
  const paymentTrigger = useRef<HTMLButtonElement | null>(null);
  const running = useRef(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ content: string; token: string } | null>(null);
  const scopeKey = JSON.stringify(scope);
  const locked = busy || childBusy;
  const safe = !!run && !loading && !sourceError && !stale;
  const hasResults = !!run?.latest_import;
  const collapseFile = !!run?.submitted_at || hasResults;
  const openPayment = (paymentId: string, studentId: number, trigger: HTMLButtonElement) => { paymentTrigger.current = trigger; setPayment({ id: paymentId, studentId }); };
  const formKey = JSON.stringify([id, run?.version, form, batch.trim(), reason.trim()]);

  useLayoutEffect(() => { detailsFocus.current?.focus(); }, []);
  useLayoutEffect(() => { if (notice && focusNotice.current) { focusNotice.current = false; noticeFocus.current?.focus(); } }, [notice]);

  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.abort(); onBusyChange(false); }; }, [onBusyChange]);
  useEffect(() => {
    if (initial && generation === 0) return;
    const abort = new AbortController(); setLoading(true); setSourceError(null);
    void billingAPI.bankRun(id, abort.signal).then(result => { if (!abort.signal.aborted) { const next = checkBankRun(result, id, scope); setRun(next); onChanged(next); setStale(false); } })
      .catch(error => { if (!abort.signal.aborted) setSourceError(error instanceof Error ? error.message : 'Could not load this run.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
    // The containing workspace remounts this component when its identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scopeKey, generation]);

  async function act(kind: 'download' | 'copy' | 'submit' | 'discard') {
    if (!run || running.current || childBusyNow.current || (kind !== 'copy' && !safe)
      || (kind === 'download' && !run.can_download) || (kind === 'submit' && (!canWrite || !run.can_submit || confirmed !== formKey))
      || (kind === 'discard' && (!canWrite || !run.can_discard || !reason.trim() || confirmed !== formKey))) return;
    running.current = true; onBusyChange(true); setBusy(true); setFailure(null); setNotice(null);
    const abort = new AbortController(); operation.current = abort;
    try {
      if (kind === 'copy') {
        if (!downloaded) return;
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Copy the total shown here.');
        await navigator.clipboard.writeText(downloaded.total_amount);
        if (active.current && !abort.signal.aborted) setNotice('Total copied.');
      } else if (kind === 'download') {
        const response = await billingAPI.bankRunFile(id, abort.signal);
        if (!active.current || abort.signal.aborted) return;
        const file = await readBankExport(response, run.export_preview, abort.signal);
        if (!active.current || abort.signal.aborted) return;
        downloadBlob(file.blob, file.filename);
        setDownloaded({ filename: file.filename, total_amount: file.total_amount, payment_count: file.payment_count, content_hash: file.content_hash });
      } else {
        const content = JSON.stringify([id, run.version, kind, batch.trim(), reason.trim()]);
        if (retry.current?.content !== content) retry.current = { content, token: crypto.randomUUID() };
        const body = { expected_version: run.version, idempotency_key: retry.current.token };
        const next = kind === 'submit' ? await billingAPI.submitBankRun(id, { ...body, bank_batch_no: batch.trim() || null }, abort.signal)
          : await billingAPI.discardBankRun(id, { ...body, reason: reason.trim() }, abort.signal);
        if (!active.current || abort.signal.aborted) return;
        checkBankRun(next, id, scope); setRun(next); onChanged(next); setForm(null); setConfirmed(null);
        focusNotice.current = true; setNotice(kind === 'submit' ? 'Bank upload recorded.' : 'Run discarded.'); refreshAutopayViews();
      }
    } catch (error) { if (active.current && !abort.signal.aborted) { setFailure(error instanceof Error ? error.message : 'Could not complete this action. Retry the same action.'); if ((error as { status?: number }).status === 409) setStale(true); } }
    finally { running.current = false; if (active.current) { setBusy(false); onBusyChange(false); } }
  }

  const fileSummary = run && (
    <section aria-label={downloaded ? 'Downloaded bank file' : 'Bank file summary'} className="space-y-2 rounded border border-line p-3">
        <p className="break-all text-xs">{downloaded?.filename ?? run.filename}</p>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{plural(downloaded?.payment_count ?? run.payment_count, 'payment')}</span><strong className="tabular-nums">{formatMOP(Number(downloaded?.total_amount ?? run.total_amount), 2)}</strong></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-ink-subtle">Saved {formatShortDate(run.created_at)} · {run.created_by_name}</p>{downloaded && <Badge tone="success">Downloaded</Badge>}</div>
        {downloaded && <div className="flex items-center justify-end gap-2"><code className="text-sm tabular-nums">{downloaded.total_amount}</code><Button size="sm" icon={Copy} disabled={locked} onClick={() => { void act('copy'); }}>Copy total</Button></div>}
      </section>
  );

  return <section ref={detailsFocus} tabIndex={-1} className="space-y-4" aria-label="Saved bank run">
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge tone={run?.status === 'needs_attention' ? 'warning' : run?.status === 'processed' ? 'success' : 'neutral'}>{run ? bankRunStatus[run.status] : 'Loading run'}</Badge><Button size="sm" icon={RefreshCw} disabled={locked || loading} onClick={() => { setStale(true); setGeneration(value => value + 1); }}>Refresh run</Button></div>
    {loading && <p role="status" className="text-sm text-ink-subtle">Refreshing run details…</p>}
    {(sourceError || failure) && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{sourceError || failure}</p>}
    {stale && <p className="text-xs text-amber-800 dark:text-amber-300">Refresh the run before continuing.</p>}
    {run && <>
      <BankRunProgress run={run} />
      {notice && <p ref={noticeFocus} tabIndex={-1} role="status" className="text-sm">{notice}</p>}
      {run.submitted_at && !hasResults && <p className="text-xs text-ink-subtle">Bank upload recorded {formatShortDate(run.submitted_at)}{run.bank_batch_no ? ` · Batch ${run.bank_batch_no}` : ''}</p>}
      {run.discard_reason && <p className="text-sm">{run.discard_reason}</p>}
      {!!run.issues.length && <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">{run.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      <BillingBankResults run={run} disabled={locked || !safe} canWrite={canWrite && safe} onBusyChange={reportChildBusy} onRunRefresh={() => { setStale(true); setGeneration(value => value + 1); }} onRunVersion={version => setRun(current => current && ({ ...current, version }))} onReviewChange={review => setRun(current => current && ({ ...current, version: review.run_version, latest_import_id: review.id, latest_import: review }))} onOpenPayment={openPayment} />
      {collapseFile ? <details key={run.latest_import?.id ?? 'submitted'} className="rounded border border-line"><summary className="cursor-pointer px-3 py-2 text-xs">File details</summary><div className="space-y-2 p-3 pt-0">{fileSummary}<Button size="sm" icon={Download} disabled={!safe || locked || !run.can_download} onClick={() => { void act('download'); }}>Download Excel</Button></div></details> : fileSummary}
      {(!collapseFile || (canWrite && (run.can_submit || run.can_discard))) && <div className="flex flex-wrap gap-2">{!collapseFile && <Button size="sm" icon={Download} disabled={!safe || locked || !run.can_download} onClick={() => { void act('download'); }}>Download Excel</Button>}{canWrite && run.can_submit && <Button size="sm" variant={form === 'submit' ? 'secondary' : 'primary'} disabled={!safe || locked} onClick={() => { setForm(form === 'submit' ? null : 'submit'); setConfirmed(null); }}>Record bank upload</Button>}{canWrite && run.can_discard && <Button size="sm" variant="quiet" disabled={!safe || locked} onClick={() => { setForm(form === 'discard' ? null : 'discard'); setConfirmed(null); }}>Discard run</Button>}</div>}
      {form && <div className="space-y-3 rounded border border-line p-3">{form === 'submit' ? <Field label="Bank batch number (optional)" id="bank-run-batch"><Input maxLength={100} disabled={locked} value={batch} onChange={event => setBatch(event.target.value)} /></Field> : <Field label="Reason" id="bank-run-discard"><Textarea maxLength={1000} disabled={locked} value={reason} onChange={event => setReason(event.target.value)} /></Field>}<label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={locked || !safe} checked={confirmed === formKey} onChange={event => setConfirmed(event.target.checked ? formKey : null)} />{form === 'submit' ? 'I uploaded this file to the bank.' : 'I have not uploaded this file to the bank.'}</label><Button size="sm" variant={form === 'submit' ? 'primary' : 'danger'} disabled={!safe || locked || confirmed !== formKey || (form === 'discard' && !reason.trim())} onClick={() => { void act(form); }}>{form === 'submit' ? 'Confirm bank upload' : 'Confirm discard'}</Button></div>}
      {!hasResults && <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm">Payments in this file</summary><div className="mt-3 divide-y divide-line rounded border border-line">{run.export_preview.rows.map(row => <div key={row.payment_id} className="space-y-1 p-3"><StudentInfoBadges compact nameHref={`/students/${row.student.id}`} student={{ student_name: row.student.student_name, school_student_id: row.student.school_student_id ?? undefined }} /><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-mono">{row.contract_no} · {formatMOP(Number(row.amount), 2)}</span><Button size="sm" variant="quiet" disabled={locked} onClick={event => { openPayment(row.payment_id, row.student.id, event.currentTarget); }}>Payment details</Button></div></div>)}</div></details>}
      {!!run.history.length && <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm">Activity</summary><ul className="mt-2 space-y-2 text-xs">{run.history.map((event, index) => <li key={index}>{({ prepared: 'File saved', submitted: 'Bank upload recorded', discarded: 'Run discarded', results_uploaded: 'Results imported', results_recorded: 'Payments recorded' } as Record<string, string>)[event.kind] || 'Run updated'} · {event.actor_name} · {formatShortDate(event.created_at)}</li>)}</ul></details>}
    </>}
    {payment && <Modal isOpen title="Payment" size="xl" persistent={childBusy} onClose={() => { if (!childBusyNow.current) setPayment(null); }}><BillingDraftFocus trigger={paymentTrigger}><BillingPayments inline studentId={payment.studentId} initialPaymentId={payment.id} canWrite={false} onChanged={() => {}} onBusyChange={reportChildBusy} /></BillingDraftFocus></Modal>}
  </section>;
}

function BankRunProgress({ run }: { run: BillingBankRunDetail }) {
  const review = run.latest_import;
  const complete = !!review && review.rows.length === run.payment_count && review.rows.every(row => row.record_status === 'recorded');
  const steps = [
    { label: 'File saved', done: true }, { label: 'Uploaded to bank', done: !!run.submitted_at },
    { label: 'Results imported', done: !!review }, { label: 'Payments recorded', done: complete },
  ];
  const current = run.status === 'discarded' ? -1 : steps.findIndex(step => !step.done);
  return <div className="space-y-2"><ol aria-label="Bank run progress" className="grid grid-cols-4 gap-2">{steps.map((step, index) => <li key={step.label} aria-current={current === index ? 'step' : undefined} className="min-w-0 space-y-1 text-xs leading-5"><div className={`flex h-5 w-5 items-center justify-center rounded-full border ${step.done ? 'border-green-600 bg-green-50 text-green-800 dark:border-green-600 dark:bg-green-950 dark:text-green-300' : current === index ? 'border-primary text-accent-ink' : 'border-line text-ink-subtle'}`}>{step.done ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}</div><p className={step.done || current === index ? 'text-ink' : 'text-ink-subtle'}>{step.label}</p></li>)}</ol>{review && !complete && <p className="text-xs text-ink-subtle">{review.recorded_count} of {run.payment_count} payments recorded{review.review_count ? ` · ${review.review_count} to check` : ''}{review.failed_count ? ` · ${review.failed_count} not collected` : ''}</p>}</div>;
}
