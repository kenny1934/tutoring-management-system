'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Field, Input, Segmented } from '@/components/controls';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { billingAPI } from '@/lib/billing-api';
import { checkBankResult, refreshAutopayViews } from '@/lib/billing-bank-runs';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { invalidateCaches } from '@/lib/hooks';
import { BankRunFooter } from './BankRunFooter';
import type { BillingBankResultReview, BillingBankResultRow, BillingBankRunDetail } from '@/types/billing';

export function BillingBankResults({ run, canWrite, disabled, onBusyChange, onRunVersion, onRunRefresh, onReviewChange, onOpenPayment }: {
  run: BillingBankRunDetail; canWrite: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void;
  onRunVersion: (version: number) => void; onRunRefresh: () => void;
  onReviewChange?: (review: BillingBankResultReview) => void;
  onOpenPayment?: (paymentId: string, studentId: number, trigger: HTMLButtonElement) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const sectionFocus = useRef<HTMLElement | null>(null);
  const importTrigger = useRef<HTMLButtonElement | null>(null);
  const focusAfterImportChange = useRef<'input' | 'review' | 'trigger' | null>(null);
  const [review, setReview] = useState<BillingBankResultReview | null>(run.latest_import);
  const [view, setView] = useState<ResultGroup>('ready');
  const [importerOpen, setImporterOpen] = useState(!run.latest_import);
  useLayoutEffect(() => {
    const target = focusAfterImportChange.current;
    if (!target) return;
    focusAfterImportChange.current = null;
    (target === 'input' ? input.current : target === 'review' ? sectionFocus.current : importTrigger.current)?.focus();
  }, [importerOpen]);
  useEffect(() => {
    if (!review) return;
    setView(current => review.rows.some(row => inGroup(row, current)) ? current
      : (['ready', 'review', 'unpaid', 'recorded'] as const).find(group => review.rows.some(row => inGroup(row, group))) ?? 'ready');
  }, [review]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeFocus = useRef<HTMLParagraphElement | null>(null);
  const focusNotice = useRef(false);
  useLayoutEffect(() => { if (notice && focusNotice.current) { focusNotice.current = false; noticeFocus.current?.focus(); } }, [notice]);
  const running = useRef(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ hash: string; token: string } | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.abort(); onBusyChange(false); }; }, [onBusyChange]);
  useEffect(() => { if (run.latest_import) { setReview(run.latest_import); setConfirmed(null); setStale(false); } }, [run.latest_import]);
  const locked = disabled || busy;

  async function perform(kind: 'upload' | 'confirm' | 'refresh') {
    if (running.current || disabled || (kind === 'upload' && (!canWrite || !run.can_import_results || !file))
      || (kind === 'confirm' && (!canWrite || !review?.can_confirm || !review.ready_count || stale || importerOpen || confirmed !== review.review_hash))
      || (kind === 'refresh' && !review)) return;
    running.current = true; onBusyChange(true); setBusy(true); setFailure(null); setNotice(null);
    const abort = new AbortController(); operation.current = abort;
    try {
      let next: BillingBankResultReview;
      if (kind === 'upload') next = await billingAPI.previewBankResult(run.id, file!, run.version, abort.signal);
      else if (kind === 'refresh') next = await billingAPI.bankResult(run.id, review!.id, abort.signal);
      else {
        if (retry.current?.hash !== review!.review_hash) retry.current = { hash: review!.review_hash, token: crypto.randomUUID() };
        next = await billingAPI.confirmBankResult(run.id, review!.id, { expected_review_hash: review!.review_hash, idempotency_key: retry.current.token }, abort.signal);
      }
      if (!active.current || abort.signal.aborted) return;
      checkBankResult(next, run);
      if (kind !== 'upload' && next.id !== review!.id) throw new Error('The bank result changed. Refresh the run before continuing.');
      setReview(next); onReviewChange?.(next); onRunVersion(next.run_version); setConfirmed(null); setStale(false);
      if (kind === 'upload') { focusAfterImportChange.current = 'review'; setImporterOpen(false); setFile(null); if (input.current) input.current.value = ''; onRunRefresh(); }
      if (kind === 'confirm') {
        focusNotice.current = true; setNotice('Payments recorded.');
        for (const row of next.rows) if (row.student) { invalidateCaches('enrollments', { studentId: row.student.id }); invalidateCaches('sessions', { studentId: row.student.id }); }
        refreshAutopayViews(); onRunRefresh();
      } else if (next.recorded_count > 0 && !next.ready_count) setNotice(next.rows.every(row => row.record_status === 'recorded') ? 'These results are already recorded.' : 'No new payments to record.');
    } catch (error) {
      if (!active.current || abort.signal.aborted) return;
      setFailure(error instanceof Error ? error.message : 'Could not review the bank results. Retry this action.');
      if ((error as { status?: number }).status === 409) { setStale(true); setConfirmed(null); if (kind === 'upload') onRunRefresh(); }
    } finally { running.current = false; if (active.current) { setBusy(false); onBusyChange(false); } }
  }

  const groups = [
    { value: 'ready', label: 'To record' }, { value: 'recorded', label: 'Recorded' },
    { value: 'unpaid', label: 'Not collected' }, { value: 'review', label: 'Needs checking' },
  ] as const;
  const counts = Object.fromEntries(groups.map(group => [group.value, review?.rows.filter(row => inGroup(row, group.value)).length ?? 0]));
  const rows = review?.rows.filter(row => inGroup(row, view)) ?? [];
  if (!run.submitted_at && !review) return null;
  return <section ref={sectionFocus} tabIndex={-1} aria-label="Bank result review" className="space-y-3 border-t border-line pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Bank results</h3>{review && canWrite && run.can_import_results && !importerOpen && <Button ref={importTrigger} size="sm" variant="quiet" disabled={locked} onClick={() => { focusAfterImportChange.current = 'input'; setImporterOpen(true); setConfirmed(null); }}>Import another file</Button>}</div>
    {canWrite && run.can_import_results && importerOpen && <div className="space-y-2 rounded border border-line p-3"><Field label="Bank result file" id="bank-result-file"><Input ref={input} type="file" accept=".xls,.txt" disabled={locked} onChange={event => { setFile(event.target.files?.[0] ?? null); setConfirmed(null); setFailure(null); }} /></Field><div className="flex flex-wrap gap-2"><Button size="sm" variant="primary" disabled={locked || !file} loading={busy} onClick={() => { void perform('upload'); }}>Preview results</Button>{review && <Button size="sm" variant="quiet" disabled={locked} onClick={() => { focusAfterImportChange.current = 'trigger'; setImporterOpen(false); setFile(null); setConfirmed(null); setFailure(null); }}>Cancel import</Button>}</div></div>}
    {failure && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure}</p>}
    {notice && <p ref={noticeFocus} tabIndex={-1} role="status" className="text-sm">{notice}</p>}
    {stale && <p className="text-xs text-amber-800 dark:text-amber-300">Refresh the results before recording payments.</p>}
    {review && <>
      <div className="flex flex-wrap items-start justify-between gap-3 text-xs"><div><p className="text-ink-subtle">Actual debit date</p><p className="mt-1 font-medium">{review.debit_date ? formatShortDate(review.debit_date) : 'Date to confirm'}</p></div><div className="text-right"><p className="text-ink-subtle">{plural(review.payment_count, 'payment')}</p><p className="mt-1 font-medium tabular-nums">{resultAmount(review.total_amount)}</p></div></div>
      <details className="text-xs"><summary className="cursor-pointer text-ink-subtle">Bank report details</summary><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1"><dt>Bank batch</dt><dd className="break-all">{review.bank_batch_no || 'To confirm'}</dd><dt>Collected · {review.success_count}</dt><dd>{resultAmount(review.successful_amount)}</dd><dt>Not collected · {review.failed_count}</dt><dd>{resultAmount(review.failed_amount)}</dd></dl></details>
      {!!review.issues.length && <ul className="space-y-1 rounded border border-amber-300 p-3 text-xs dark:border-amber-800">{review.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
      <Segmented className="max-w-full flex-wrap" label="Bank result outcomes" value={view} onChange={setView} options={groups.map(group => ({ ...group, label: `${group.label} (${counts[group.value]})` }))} />
      <div className="max-h-72 divide-y divide-line overflow-y-auto overscroll-contain rounded border border-line">{rows.length ? rows.map((row, index) => <article key={`${row.contract_no}:${index}`} className="space-y-2 p-3 text-xs">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1">{row.student ? <StudentInfoBadges compact nameHref={`/students/${row.student.id}`} student={{ student_name: row.student.student_name, school_student_id: row.student.school_student_id ?? undefined, home_location: row.student.home_location ?? undefined, grade: row.student.grade ?? undefined, lang_stream: row.student.lang_stream ?? undefined, school: row.student.school ?? undefined }} /> : <span className="break-all font-mono">{row.contract_no || 'Contract to confirm'}</span>}</div><strong className="tabular-nums">{resultAmount(row.amount)}</strong></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 flex-1 break-words">{row.reason}</span>{row.payment_id && row.student && onOpenPayment && <Button size="sm" variant="quiet" disabled={locked} onClick={event => onOpenPayment(row.payment_id!, row.student!.id, event.currentTarget)}>Payment details</Button>}</div>
        <details><summary className="cursor-pointer text-ink-subtle">Bank status and code</summary><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1"><dt>Contract</dt><dd className="break-all font-mono">{row.contract_no || 'To confirm'}</dd><dt>Status</dt><dd className="break-all">{row.raw_status || 'Not provided'}</dd><dt>Code</dt><dd className="break-all">{row.reject_code || 'None'}</dd></dl></details>
      </article>) : <p className="p-3 text-xs text-ink-subtle">No payments in this group.</p>}</div>
      <div className="flex justify-end"><Button size="sm" variant="quiet" disabled={locked} onClick={() => { void perform('refresh'); }}>Refresh results</Button></div>
      <BankRunFooter><section aria-label="Record reviewed payments" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{review.ready_count ? `${plural(review.ready_count, 'payment')} to record` : review.recorded_count ? `${plural(review.recorded_count, 'payment')} recorded` : 'No payments to record'}</span><strong className="tabular-nums">{resultAmount(review.ready_count ? review.ready_amount : review.recorded_count ? review.recorded_amount : '0.00')}</strong></div>
        {review.ready_count > 0 && review.recorded_count > 0 && <p className="text-xs text-ink-subtle">Recorded: {review.recorded_count} · {resultAmount(review.recorded_amount)}</p>}
        {canWrite && review.ready_count > 0 && <><label className="flex items-start gap-2 text-xs"><input type="checkbox" disabled={locked || stale || importerOpen || !review.can_confirm} checked={confirmed === review.review_hash} onChange={event => setConfirmed(event.target.checked ? review.review_hash : null)} />I checked the collected payments and debit date.</label><Button size="sm" variant="primary" className="w-full sm:w-auto" disabled={locked || stale || importerOpen || !review.can_confirm || confirmed !== review.review_hash} onClick={() => { void perform('confirm'); }}>Record {plural(review.ready_count, 'payment')}</Button></>}
      </section></BankRunFooter>
    </>}
  </section>;
}

type ResultGroup = 'ready' | 'recorded' | 'unpaid' | 'review';
function inGroup(row: BillingBankResultRow, group: ResultGroup) { return row.record_status === group; }
function resultAmount(amount: string | null) {
  return amount != null && /^\d+\.\d{2}$/.test(amount) ? formatMOP(Number(amount), 2) : 'Amount to confirm';
}
