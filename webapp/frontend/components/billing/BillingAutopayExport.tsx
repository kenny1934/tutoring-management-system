'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button, Field, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { checkBankExportPreview, readBankExport } from '@/lib/billing-bank-export';
import { formatMOP, plural } from '@/lib/formatters';
import { downloadBlob } from '@/lib/geometry-utils';
import type { BillingAutopayBankFile, BillingAutopayExportPreview, BillingBankBranch, BillingBankRunDetail } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope } from './BillingDraftReview';
import { BillingBankRuns, type SavedBankRun } from './BillingBankRuns';
import { checkBankRun, refreshAutopayViews } from '@/lib/billing-bank-runs';
import { BankRunFooterContext } from './BankRunFooter';

const bankBranch = (value: string): value is BillingBankBranch => value === 'MSA' || value === 'MSB';

export function BillingAutopayExport({ collectionMonth, defaultBranch, disabled = false }: { collectionMonth: string; defaultBranch: string; disabled?: boolean }) {
  const auth = useAuth();
  const scope = JSON.stringify([billingDraftAuthScope(auth), collectionMonth, defaultBranch]);
  const [open, setOpen] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setOpen(previous => previous === scope ? previous : null); }, [scope]);
  if (!auth.isAdmin || auth.isReadOnly) return null;
  return <><Button ref={trigger} size="sm" variant="primary" icon={FileSpreadsheet} disabled={disabled} onClick={() => setOpen(scope)}>Bank file</Button>
    {open === scope && <BillingBankFileDialog key={scope} collectionMonth={collectionMonth} defaultBranch={defaultBranch} trigger={trigger} onClose={() => setOpen(null)} />}
  </>;
}

export function BillingBankFileDialog({ collectionMonth, defaultBranch, trigger, onClose, initialRunId }: { collectionMonth: string; defaultBranch: string; trigger: React.RefObject<HTMLButtonElement | null>; onClose: () => void; initialRunId?: string }) {
  const [branch, setBranch] = useState<BillingBankBranch | ''>(bankBranch(defaultBranch) ? defaultBranch : '');
  const [initialRun, setInitialRun] = useState(initialRunId);
  const [busy, setBusy] = useState(false);
  const [footerActive, setFooterActive] = useState(false);
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const footerContext = useMemo(() => ({ target: footerTarget, onActiveChange: setFooterActive }), [footerTarget]);
  const busyNow = useRef(false);
  const changeBusy = useCallback((value: boolean) => { busyNow.current = value; setBusy(value); }, []);
  const id = useId();
  const month = new Date(`${collectionMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <BankRunFooterContext.Provider value={footerContext}><Modal isOpen title="Bank file" size="lg" className="[&>div:has([data-bank-run-footer])]:shrink-0" persistent={busy} footer={footerActive ? <div ref={setFooterTarget} data-bank-run-footer /> : undefined} onClose={() => { if (!busyNow.current) onClose(); }}>
    <BillingDraftFocus trigger={trigger}><div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4"><Field label="Profile branch" id={`${id}-branch`} className="w-44"><Select value={branch} disabled={busy} onChange={event => { if (!busyNow.current) { setInitialRun(undefined); setBranch(event.target.value as BillingBankBranch | ''); } }}><option value="">Choose branch</option><option value="MSA">MSA</option><option value="MSB">MSB</option></Select></Field><p className="pb-1 text-sm">{month}</p></div>
      <p className="text-xs text-ink-subtle">The file includes all Ready payments for this profile branch. Search and list filters do not apply.</p>
      {branch ? <BillingBankRuns key={`${collectionMonth}:${branch}`} collectionMonth={collectionMonth} branch={branch} initialRunId={initialRun} onBusyChange={changeBusy} renderPrepare={(capabilities, onSaved, onHistory, reportBusy) => <ExportContent collectionMonth={collectionMonth} branch={branch} onBusyChange={reportBusy} runMode={{ ...capabilities, onSaved, onHistory }} />} /> : <p className="text-sm text-ink-subtle">Choose a branch to preview the bank file.</p>}
    </div></BillingDraftFocus>
  </Modal></BankRunFooterContext.Provider>;
}

function ExportContent({ collectionMonth, branch, onBusyChange, runMode }: { collectionMonth: string; branch: BillingBankBranch; onBusyChange: (busy: boolean) => void; runMode: { storage_available: boolean; writes_available: boolean; onSaved: (value: SavedBankRun) => void; onHistory: () => void } }) {
  const [generation, setGeneration] = useState(0);
  const [review, setReview] = useState<{ generation: number; value: BillingAutopayExportPreview } | null>(null);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const [downloaded, setDownloaded] = useState<Omit<BillingAutopayBankFile, 'blob'> | null>(null);
  const operation = useRef<AbortController | null>(null);
  const saveRetry = useRef<{ hash: string; token: string } | null>(null);
  const running = useRef(false);
  const active = useRef(true);
  const latestGeneration = useRef(generation); latestGeneration.current = generation;
  const preview = review?.generation === generation ? review.value : null;
  const busy = checking || downloading || copying;
  useEffect(() => { active.current = true; return () => { active.current = false; operation.current?.abort(); onBusyChange(false); }; }, [onBusyChange]);
  useEffect(() => {
    const abort = new AbortController();
    onBusyChange(true); setChecking(true); setFailure(null);
    void billingAPI.autopayExportPreview({ collection_month: collectionMonth, branch }, abort.signal).then(result => {
      if (!abort.signal.aborted && active.current) setReview({ generation, value: checkBankExportPreview(result, { collection_month: collectionMonth, branch }) });
    }).catch(error => { if (!abort.signal.aborted && active.current) setFailure(error instanceof Error ? error.message : 'Could not load the bank preview.'); })
      .finally(() => { if (!abort.signal.aborted && active.current) { setChecking(false); onBusyChange(false); } });
    return () => abort.abort();
  }, [collectionMonth, branch, generation, onBusyChange]);

  async function download() {
    if (!preview?.can_download || busy || running.current || (runMode.storage_available && !runMode.writes_available)) return;
    running.current = true; onBusyChange(true); setDownloading(true); setFailure(null);
    const abort = new AbortController(); operation.current = abort;
    let savedRun: BillingBankRunDetail | null = null;
    try {
      let response: Response;
      if (runMode.storage_available) {
        if (saveRetry.current?.hash !== preview.content_hash) saveRetry.current = { hash: preview.content_hash, token: crypto.randomUUID() };
        const saved = await billingAPI.saveBankRun({ collection_month: collectionMonth, branch, expected_content_hash: preview.content_hash, idempotency_key: saveRetry.current.token }, abort.signal);
        if (abort.signal.aborted || !active.current) return;
        const checked = checkBankRun(saved, null, { collection_month: collectionMonth, branch });
        if (checked.content_hash !== preview.content_hash) throw new Error('Could not verify the saved file against this preview. Refresh the preview.');
        savedRun = checked;
        response = await billingAPI.bankRunFile(savedRun.id, abort.signal);
      } else response = await billingAPI.autopayExport({ collection_month: collectionMonth, branch, expected_content_hash: preview.content_hash }, abort.signal);
      if (abort.signal.aborted || !active.current || latestGeneration.current !== generation) return;
      const file = await readBankExport(response, savedRun?.export_preview ?? preview, abort.signal);
      if (abort.signal.aborted || !active.current || latestGeneration.current !== generation) return;
      downloadBlob(file.blob, file.filename);
      const metadata = { filename: file.filename, total_amount: file.total_amount, payment_count: file.payment_count, content_hash: file.content_hash };
      if (savedRun) { refreshAutopayViews(); onBusyChange(false); runMode.onSaved({ run: savedRun, downloaded: metadata }); }
      else setDownloaded(metadata);
      setCopyFeedback(null);
    } catch (error) {
      if (!abort.signal.aborted && active.current) {
        const message = (error as { status?: number }).status === 409 ? 'Ready payments changed. Refresh the preview.' : error instanceof Error ? error.message : 'Could not download the bank file. Refresh the preview.';
        if (savedRun) { refreshAutopayViews(); onBusyChange(false); runMode.onSaved({ run: savedRun, error: message }); }
        else { if (!runMode.storage_available || (error as { status?: number }).status === 409) setReview(null); setFailure(message); }
      }
    } finally { running.current = false; if (active.current) { setDownloading(false); onBusyChange(false); } }
  }

  async function copyTotal() {
    if (!downloaded || busy || running.current) return;
    running.current = true; onBusyChange(true); setCopying(true); setCopyFeedback(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Copy the total shown here.');
      await navigator.clipboard.writeText(downloaded.total_amount);
      if (active.current) setCopyFeedback({ text: 'Total copied.' });
    } catch (error) { if (active.current) setCopyFeedback({ text: error instanceof Error ? error.message : 'Could not copy the total.', error: true }); }
    finally { running.current = false; if (active.current) { setCopying(false); onBusyChange(false); } }
  }

  return <div className="space-y-4">
    {downloaded && <section aria-label="Downloaded bank file" className="space-y-2 rounded border border-line bg-tint p-3">
      <p className="text-sm font-semibold">Downloaded file</p><p className="break-all text-xs">{downloaded.filename}</p>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{plural(downloaded.payment_count, 'payment')} · {formatMOP(Number(downloaded.total_amount), 2)}</p><div className="flex items-center gap-2"><code className="text-sm tabular-nums">{downloaded.total_amount}</code><Button size="sm" icon={Copy} disabled={busy} onClick={copyTotal}>Copy total</Button></div></div>
      {copyFeedback && <p role={copyFeedback.error ? 'alert' : 'status'} className="text-xs">{copyFeedback.text}</p>}
    </section>}
    {checking && <p role="status" className="text-sm text-ink-subtle">Checking all Ready payments…</p>}
    {failure && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure}</p>}
    {preview && !checking && <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">{plural(preview.payment_count, 'payment')}</p><p className="text-lg font-semibold tabular-nums">{preview.total_amount == null ? 'Total to confirm' : formatMOP(Number(preview.total_amount), 2)}</p></div>
      {!!preview.excluded_claimed_count && <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle"><span>{plural(preview.excluded_claimed_count, 'payment')} in saved runs</span><Button size="sm" variant="quiet" disabled={busy} onClick={runMode.onHistory}>View run history</Button></div>}
      {!!preview.issues.length && <ul aria-label="Bank file issues" className="space-y-2 rounded border border-amber-300 p-3 text-sm dark:border-amber-800">{preview.issues.map((issue, index) => <li key={`${issue.code}:${index}`}>{issue.message}{issue.student_id && <Link href={`/students/${issue.student_id}`} className="ml-2 text-xs text-accent-ink hover:underline">Open student</Link>}</li>)}</ul>}
      {!!preview.rows.length && <div className="max-h-72 overflow-y-auto overscroll-contain rounded border border-line"><div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 border-b border-line bg-tint px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle"><span>Contract No</span><span className="text-right">Amount</span></div>{preview.rows.map((row, index) => <div key={`${row.payment_id}:${index}`} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 border-b border-line p-3 last:border-b-0"><div className="min-w-0 space-y-1"><p className="break-all font-mono text-sm">{row.contract_no || 'Contract number to confirm'}</p><StudentInfoBadges compact nameHref={`/students/${row.student.id}`} student={{ student_name: row.student.student_name, school_student_id: row.student.school_student_id ?? undefined }} /></div><p className="text-right text-sm tabular-nums">{row.amount == null ? 'To confirm' : formatMOP(Number(row.amount), 2)}</p></div>)}</div>}
    </>}
    {runMode.storage_available && !runMode.writes_available && <p className="text-xs text-ink-subtle">Saving bank runs is not available yet.</p>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Button size="sm" icon={RefreshCw} disabled={busy} onClick={() => { if (!busy && !running.current) { onBusyChange(true); setChecking(true); setGeneration(value => value + 1); } }}>Refresh preview</Button><Button size="sm" variant="primary" icon={Download} loading={downloading} disabled={busy || !preview?.can_download || (runMode.storage_available && !runMode.writes_available)} onClick={download}>{runMode.storage_available ? 'Save and download' : 'Download Excel'}</Button></div>
  </div>;
}
