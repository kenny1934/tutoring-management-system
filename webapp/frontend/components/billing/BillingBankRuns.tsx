'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Badge, Button, Segmented } from '@/components/controls';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { bankRunStatus } from '@/lib/billing-bank-runs';
import type { BillingAutopayBankFile, BillingAutopayExportScope, BillingBankRunDetail, BillingBankRunList, BillingBankRunSummary } from '@/types/billing';
import { BillingBankRunDetails } from './BillingBankRunDetails';

export type BankFileMetadata = Omit<BillingAutopayBankFile, 'blob'>;
export type SavedBankRun = { run: BillingBankRunDetail; downloaded?: BankFileMetadata; error?: string };

export function BillingBankRuns({ collectionMonth, branch, onBusyChange, renderPrepare, initialRunId }: {
  collectionMonth: string;
  branch: BillingAutopayExportScope['branch'];
  onBusyChange: (busy: boolean) => void;
  initialRunId?: string;
  renderPrepare: (capabilities: Pick<BillingBankRunList, 'storage_available' | 'writes_available'>, onSaved: (value: SavedBankRun) => void, onHistory: () => void, onBusyChange: (busy: boolean) => void) => ReactNode;
}) {
  const [view, setView] = useState<'prepare' | 'history'>(initialRunId ? 'history' : 'prepare');
  const [list, setList] = useState<BillingBankRunList | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; seed?: SavedBankRun } | null>(initialRunId ? { id: initialRunId } : null);
  const busy = useRef(false);
  const workspace = useRef<HTMLDivElement | null>(null);
  const reportBusy = useCallback((value: boolean) => { busy.current = value; onBusyChange(value); }, [onBusyChange]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(null);
    void billingAPI.bankRuns({ collection_month: collectionMonth, branch }, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      if (result.runs.some(run => run.branch !== branch || run.collection_month !== collectionMonth)) throw new Error('Could not verify this run history. Refresh the list.');
      setList(result);
    }).catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load bank runs.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [collectionMonth, branch, generation]);

  const update = useCallback((run: BillingBankRunDetail) => setList(current => current && ({ ...current, runs: [run, ...current.runs.filter(item => item.id !== run.id)] })), []);
  const openSaved = (value: SavedBankRun) => { update(value.run); setSelected({ id: value.run.id, seed: value }); setView('history'); };
  return <div ref={workspace} className="space-y-3">
    <Segmented label="Bank file views" value={view} options={[{ value: 'prepare', label: 'Prepare file' }, { value: 'history', label: <>Run history{list?.storage_available ? ` (${list.runs.length})` : ''}</> }]} onChange={next => { if (!busy.current) { setView(next); setSelected(null); } }} />
    {loading && <p role="status" className="text-sm text-ink-subtle">Loading bank runs…</p>}
    {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button size="sm" onClick={() => setGeneration(value => value + 1)}>Retry bank runs</Button></div>}
    {!loading && !error && list && (view === 'prepare' ? renderPrepare(list, openSaved, () => { if (!busy.current) setView('history'); }, reportBusy) : !list.storage_available ? <p className="text-sm text-ink-subtle">Run history is not available yet.</p> : selected ? <>
      <Button size="sm" variant="quiet" icon={ArrowLeft} onClick={() => { if (!busy.current) { setSelected(null); workspace.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus(); } }}>Run history</Button>
      <BillingBankRunDetails key={selected.id} id={selected.id} scope={{ collection_month: collectionMonth, branch }} initial={selected.seed} canWrite={list.writes_available} onBusyChange={reportBusy} onChanged={update} />
    </> : <>
      <div className="flex justify-end"><Button size="sm" icon={RefreshCw} onClick={() => setGeneration(value => value + 1)}>Refresh history</Button></div>
      {list.runs.length ? <div className="divide-y divide-line rounded border border-line">{list.runs.map(run => <RunRow key={run.id} run={run} onOpen={() => setSelected({ id: run.id })} />)}</div> : <p className="text-sm text-ink-subtle">No saved bank runs for this month and branch.</p>}
    </>)}
  </div>;
}

function RunRow({ run, onOpen }: { run: BillingBankRunSummary; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="w-full space-y-2 p-3 text-left text-sm hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex flex-wrap items-center justify-between gap-2"><Badge tone={run.status === 'needs_attention' ? 'warning' : run.status === 'processed' ? 'success' : 'neutral'}>{bankRunStatus[run.status]}</Badge><span className="font-semibold tabular-nums">{formatMOP(Number(run.total_amount), 2)}</span></div>
    <p className="text-xs">{plural(run.payment_count, 'payment')} · {formatShortDate(run.created_at)} · {run.created_by_name}</p><p className="break-all text-[11px] text-ink-subtle">{run.filename}</p>
  </button>;
}
