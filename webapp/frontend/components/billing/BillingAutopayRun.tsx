'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole } from '@floating-ui/react';
import { AlertCircle, CheckCircle2, ChevronRight, ClipboardList, Landmark, RefreshCw, SkipForward } from 'lucide-react';
import { Badge, Button, Field, IconButton, Input, PageHeader, Select, buttonClasses } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/contexts/LocationContext';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { useDebouncedValue, usePageTitle, useVisibilityAwareInterval } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { BillingAutopayRow, BillingAutopayStage } from '@/types/billing';
import { BillingDraftFocus, billingDraftAuthScope } from './BillingDraftReview';
import { BillingPayments } from './BillingPayments';
import { BillingAutopayExport, BillingBankFileDialog } from './BillingAutopayExport';

const STAGES = [
  { value: 'ready', label: 'Ready', icon: CheckCircle2, colour: 'text-green-700 dark:text-green-400', help: 'Enrollments are created and the fee message is sent. Bank authorisation is ready and all checks pass.' },
  { value: 'attention', label: 'Needs attention', icon: AlertCircle, colour: 'text-amber-700 dark:text-amber-400', help: 'A payment or enrollment needs checking. See the reason on each row.' },
  { value: 'prepare', label: 'To prepare', icon: ClipboardList, colour: 'text-blue-700 dark:text-blue-400', help: 'Create the enrollments in Renewals. Saved drafts stay here until confirmed.' },
  { value: 'skipped', label: 'Skipped', icon: SkipForward, colour: 'text-ink-subtle', help: 'No debit is due. Check for prepaid lessons, manual payment or cancelled enrollments.' },
] as const;

function AutopayStageTab({ item, selected, count, id, onSelect, onKeyDown }: {
  item: typeof STAGES[number]; selected: boolean; count?: number; id: string;
  onSelect: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open, onOpenChange: setOpen, placement: 'top', strategy: 'fixed', whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { delay: { open: 250, close: 100 } }),
    useFocus(context), useClick(context, { ignoreMouse: true }), useDismiss(context), useRole(context, { role: 'tooltip' }),
  ]);
  return <>
    <button ref={refs.setReference} {...getReferenceProps({ onClick: onSelect, onKeyDown })} id={`${id}-${item.value}-tab`} type="button" role="tab" aria-controls={`${id}-panel`} aria-selected={selected} tabIndex={selected ? 0 : -1}
      className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle', item.value === 'skipped' && 'ml-auto')}>
      <item.icon className={cn('h-4 w-4', item.colour)} aria-hidden="true" />{item.label}{' '}{count !== undefined && <Badge>{count}</Badge>}
    </button>
    {open && <FloatingPortal><div ref={refs.setFloating} {...getFloatingProps()} style={floatingStyles}
      className="z-[100] w-max max-w-[220px] rounded-md bg-[#3d3628] px-3 py-1.5 text-left text-xs font-normal leading-relaxed text-white shadow-lg dark:bg-[#fef9f3] dark:text-[#3d3628]">{item.help}</div></FloatingPortal>}
  </>;
}

const EMPTY: Record<BillingAutopayStage, string> = {
  ready: 'No payments are ready for this collection.',
  attention: 'No autopay payments need attention.',
  prepare: 'No autopay enrollments need preparing.',
  skipped: 'No students are skipped for this collection.',
};

function validMonth(value: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function localMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`;
}
function monthLabel(value: string) { return new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function dates(from?: string | null, through?: string | null) {
  return from && through ? `${formatShortDate(from)} to ${formatShortDate(through)}` : 'Dates to confirm';
}
function amountLabel(row: BillingAutopayRow) {
  if (row.total_fee != null) return formatMOP(row.total_fee, 0);
  return row.stage === 'skipped' ? 'No debit' : 'To confirm';
}

export function BillingAutopayEntry() {
  const params = useSearchParams();
  const month = params.get('collection_month') || '';
  return <BillingAutopayRun key={month || 'default'} initialCollectionMonth={month} />;
}

const BANK_FOLLOW_UP = { prepared: 'File saved', awaiting_results: 'Awaiting bank results', rejected: 'Not collected', review: 'Needs checking', record_payment: 'To record', recorded: 'Recorded' };

function AutopayRow({ row, onOpen, onOpenRun }: { row: BillingAutopayRow; onOpen: (trigger: HTMLButtonElement) => void; onOpenRun?: (trigger: HTMLButtonElement) => void }) {
  const student = row.student;
  const estimated = row.amount_basis === 'estimate';
  const method = row.collection?.method ?? row.recorded_payment_method ?? null;
  const bankReason = row.bank_run?.follow_up === 'prepared' ? row.stage === 'attention' ? row.reasons[0]?.label : undefined
    : row.bank_run && ['review', 'rejected'].includes(row.bank_run.follow_up) ? row.bank_run.reason : undefined;
  return <article aria-label={`${student.student_name} autopay`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-3 border-t border-line px-3 py-3 first:border-t-0 sm:px-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_8.5rem_minmax(0,1fr)_auto] lg:items-center">
    <div className="col-span-2 min-w-0 space-y-1.5 lg:col-span-1">
      <StudentInfoBadges nameHref={`/students/${student.id}`} student={{ student_name: student.student_name, school_student_id: student.school_student_id ?? undefined, home_location: student.home_location ?? undefined, grade: student.grade ?? undefined, lang_stream: student.lang_stream ?? undefined, school: student.school ?? undefined }} showLocationPrefix />
      <PaymentMethodBadge method={method} />
    </div>
    <div className="min-w-0 text-xs"><span className="text-ink-subtle lg:hidden">Lessons: </span><span>{dates(row.coverage_from, row.coverage_through)}</span>{row.lesson_count != null && <p className="mt-1 text-ink-subtle">{plural(row.lesson_count, 'session')}</p>}</div>
    <div className="text-right text-sm font-semibold tabular-nums">{amountLabel(row)}{row.payment_status === 'Paid' ? <p className="mt-0.5 text-[11px] font-normal text-green-700 dark:text-green-400">Paid</p> : estimated && <p className="mt-0.5 text-[11px] font-normal text-ink-subtle">{row.origin === 'projection' ? 'Est. tuition' : 'Draft amount'}</p>}</div>
    <div className="min-w-0 space-y-1 text-xs">{row.bank_run ? <><Badge tone={row.bank_run.follow_up === 'review' || row.bank_run.follow_up === 'rejected' ? 'warning' : row.bank_run.follow_up === 'recorded' ? 'success' : 'neutral'}>{BANK_FOLLOW_UP[row.bank_run.follow_up]}</Badge>{bankReason && bankReason !== BANK_FOLLOW_UP[row.bank_run.follow_up] && <p>{bankReason}</p>}{onOpenRun && <div><Button size="sm" variant="quiet" onClick={event => onOpenRun(event.currentTarget)} aria-label={`Open bank run for ${student.student_name}`}>Open run<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></div>}</> : <p>{row.reasons[0]?.label || (row.stage === 'ready' ? 'Message sent' : 'Review details')}</p>}{row.reasons.length > 1 && <p className="text-ink-subtle">+{row.reasons.length - 1} {row.reasons.length === 2 ? 'check' : 'checks'}</p>}</div>
    <div className="flex justify-end"><Button size="sm" variant="quiet" onClick={event => onOpen(event.currentTarget)} aria-label={`Details for ${student.student_name}`}>Details<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></div>
  </article>;
}

function AutopayDetails({ row, trigger, onClose, checking, checkError, onRetry }: { row: BillingAutopayRow; trigger: React.RefObject<HTMLButtonElement | null>; onClose: () => void; checking: boolean; checkError?: string; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  const hasPayment = row.origin === 'payment' && !!row.payment_id;
  const unverified = checking || !!checkError;
  return <Modal isOpen title={hasPayment ? 'Payment' : 'Autopay details'} size={hasPayment ? 'xl' : 'md'} persistent={busy} onClose={() => { if (!busy) onClose(); }}>
    <BillingDraftFocus trigger={trigger}>
      {unverified && <div className="space-y-2 text-sm" role={checkError ? 'alert' : 'status'}><p>{checkError || 'Checking collection…'}</p>{checkError && <Button size="sm" onClick={onRetry}>Retry collection</Button>}</div>}
      {/* Preserve the viewer during a refresh so an in-flight read or copy can finish. */}
      <div className="space-y-4" hidden={unverified} inert={unverified}>
        <div className="flex flex-wrap items-center gap-2"><PaymentMethodBadge method={row.collection?.method ?? row.recorded_payment_method ?? null} /><Badge tone={row.stage === 'ready' ? 'success' : row.stage === 'attention' ? 'warning' : 'neutral'}>{STAGES.find(stage => stage.value === row.stage)?.label}</Badge></div>
        {!!row.reasons.length && <ul className="space-y-1 text-sm">{row.reasons.map((reason, index) => <li key={`${reason.code}:${index}`}>{reason.label}</li>)}</ul>}
        {hasPayment ? <BillingPayments key={row.payment_id} inline studentId={row.student.id} initialPaymentId={row.payment_id} canWrite={false} onChanged={() => {}} onBusyChange={setBusy} /> : <>
          <StudentInfoBadges nameHref={`/students/${row.student.id}`} student={{ student_name: row.student.student_name, school_student_id: row.student.school_student_id ?? undefined, home_location: row.student.home_location ?? undefined }} showLocationPrefix />
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm"><dt className="text-ink-subtle">Lessons</dt><dd>{dates(row.coverage_from, row.coverage_through)}{row.lesson_count != null && <span className="mt-1 block text-xs">{plural(row.lesson_count, 'session')}</span>}</dd><dt className="text-ink-subtle">{row.amount_basis === 'estimate' ? row.origin === 'projection' ? 'Est. tuition' : 'Draft amount' : 'Amount'}</dt><dd>{amountLabel(row)}</dd></dl>
          {row.amount_basis === 'estimate' && <p className="text-xs text-ink-subtle">Confirm the amount when reviewing the enrollment.</p>}
        </>}
        {row.collection && <dl className="grid gap-2 border-t border-line pt-3 text-xs sm:grid-cols-2"><div><dt className="text-ink-subtle">Notice</dt><dd className="mt-1">{dates(row.collection.notice_from, row.collection.notice_to)}</dd></div><div><dt className="text-ink-subtle">{row.collection.method === 'autopay' ? 'Bank debit' : 'Manual payment due'}</dt><dd className="mt-1">{row.collection.method === 'autopay' ? dates(row.collection.debit_from, row.collection.debit_to) : formatShortDate(row.collection.due_before_lesson)}</dd></div></dl>}
        <div className="flex justify-end border-t border-line pt-3"><Link aria-disabled={busy} tabIndex={busy ? -1 : undefined} onClick={event => { if (busy) event.preventDefault(); }} href={row.action_url || `/billing/students/${row.student.id}`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>{hasPayment ? 'Open payment' : row.draft_id ? 'Review draft' : row.stage === 'prepare' ? 'Review enrollment' : 'Open payment journey'}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
      </div>
    </BillingDraftFocus>
  </Modal>;
}

export function BillingAutopayRun({ initialCollectionMonth = '' }: { initialCollectionMonth?: string }) {
  usePageTitle('Autopay');
  const auth = useAuth();
  const { selectedLocation, setSelectedLocation, locations } = useLocation();
  const branches = [...new Set((locations || []).filter(value => value !== 'Various' && value !== 'All Locations'))];
  const branch = branches.includes(selectedLocation) ? selectedLocation : 'All Locations';
  const location = branch === 'All Locations' ? undefined : branch;
  const enabled = !!auth.user && !auth.isLoading && auth.canViewAdminPages;
  const [month, setMonth] = useState(initialCollectionMonth);
  const [stage, setStage] = useState<BillingAutopayStage>('ready');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250).trim();
  const searchPending = search.trim() !== debouncedSearch;
  const options = useSWR(enabled ? 'billing-preview-options' : null, billingAPI.options);
  const firstMonth = options.data?.autopay_first_collection_month || '';
  const lastMonth = options.data?.autopay_last_collection_month || '';
  const rangeReady = !!firstMonth && !!lastMonth && validMonth(firstMonth) && validMonth(lastMonth) && firstMonth <= lastMonth;
  const defaultMonth = rangeReady ? [firstMonth, localMonth(), lastMonth].sort()[1] : '';
  const requestedMonth = month || defaultMonth;
  const monthError = rangeReady && (!validMonth(requestedMonth) || requestedMonth < firstMonth || requestedMonth > lastMonth)
    ? `Choose a collection month from ${monthLabel(firstMonth)} to ${monthLabel(lastMonth)}.` : null;
  const scope = JSON.stringify([billingDraftAuthScope(auth), location, requestedMonth, stage, debouncedSearch]);
  const [page, setPage] = useState({ scope: '', offset: 0 });
  const offset = page.scope === scope ? page.offset : 0;
  const refreshInterval = useVisibilityAwareInterval(60000);
  const limit = 25;
  const state = useSWR(enabled && rangeReady && !monthError ? ['billing-autopay', scope, offset] : null,
    () => billingAPI.autopay({ collection_month: requestedMonth, stage, location, search: debouncedSearch || undefined, offset, limit }),
    { keepPreviousData: false, refreshInterval });
  const current = enabled && !monthError && !state.error && !state.isValidating && !searchPending && state.data?.collection_month === requestedMonth ? state.data : undefined;
  const selectionScope = JSON.stringify([scope, offset, search.trim()]);
  const [selection, setSelection] = useState<{ scope: string; key: string } | null>(null);
  const selected = enabled && selection?.scope === selectionScope && state.data?.collection_month === requestedMonth
    ? state.data.rows.find(row => row.key === selection.key) ?? null : null;
  useEffect(() => { setSelection(previous => previous?.scope === selectionScope ? previous : null); }, [selectionScope]);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const runTrigger = useRef<HTMLButtonElement | null>(null);
  const runScope = JSON.stringify([billingDraftAuthScope(auth), location, requestedMonth]);
  const [runSelection, setRunSelection] = useState<{ scope: string; run: NonNullable<BillingAutopayRow['bank_run']> } | null>(null);
  const canOpenRun = auth.isAdmin && !auth.isReadOnly;
  const id = useId();
  const tabBar = useRef<HTMLDivElement>(null);
  const countsReady = current !== undefined;
  useEffect(() => {
    if (selection?.scope !== selectionScope || !current || current.rows.some(row => row.key === selection.key)) return;
    setSelection(null);
    requestAnimationFrame(() => document.getElementById(`${id}-${stage}-tab`)?.focus());
  }, [current, selection, selectionScope, id, stage]);
  useEffect(() => {
    const bar = tabBar.current; const tab = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!bar || !tab) return;
    const bounds = bar.getBoundingClientRect(); const selectedBounds = tab.getBoundingClientRect();
    if (selectedBounds.right > bounds.right) bar.scrollLeft += selectedBounds.right - bounds.right + 12;
    else if (selectedBounds.left < bounds.left) bar.scrollLeft -= bounds.left - selectedBounds.left + 12;
  }, [stage, countsReady]);
  function changeTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = STAGES.findIndex(item => item.value === stage);
    const next = event.key === 'Home' ? STAGES[0] : event.key === 'End' ? STAGES[STAGES.length - 1] : STAGES[(index + (event.key === 'ArrowRight' ? 1 : -1) + STAGES.length) % STAGES.length];
    setStage(next.value); document.getElementById(`${id}-${next.value}-tab`)?.focus();
  }
  function closeDetails() {
    setSelection(null);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else document.getElementById(`${id}-${stage}-tab`)?.focus();
    });
  }
  if (auth.isLoading) return <p className="p-6">Loading staff access…</p>;
  if (!enabled) return <p className="p-6">Admin access is required to review autopay.</p>;
  return <PageSurface><div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <PageHeader title="Autopay" subtitle="Review the monthly bank collection" icon={Landmark} actions={
      <div className="flex items-center gap-2">
        <BillingAutopayExport collectionMonth={requestedMonth} defaultBranch={branch} disabled={!rangeReady || !!monthError} />
        <Link href="/admin/renewals" className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
          <ClipboardList className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          Renewals
        </Link>
        <span aria-hidden="true" className="mx-1 h-4 border-l border-line" />
        <IconButton size="sm" label="Refresh autopay" title="Refresh" icon={RefreshCw} iconClassName={state.isValidating ? 'animate-spin' : undefined} disabled={!rangeReady || !!monthError || state.isValidating || searchPending} onClick={() => { void state.mutate(); }} />
      </div>
    } />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-[11rem_11rem_minmax(0,1fr)]"><Field label="Collection month" id={`${id}-month`} error={monthError || undefined}><Input type="month" min={firstMonth} max={lastMonth} disabled={!rangeReady} value={requestedMonth} onChange={event => setMonth(event.target.value)} /></Field><Field label="Branch" id={`${id}-branch`}><Select value={branch} onChange={event => setSelectedLocation(event.target.value)}><option>All Locations</option>{branches.map(value => <option key={value}>{value}</option>)}</Select></Field><Field label="Find a student" id={`${id}-search`} className="col-span-2 lg:col-span-1"><Input value={search} placeholder="Name or student number" onChange={event => setSearch(event.target.value)} /></Field></div>
    {options.isLoading && <p role="status" className="text-sm text-ink-subtle">Loading collection dates…</p>}
    {(options.error || (!options.isLoading && !rangeReady)) && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm"><p>{options.error instanceof Error ? options.error.message : 'Autopay collection dates are unavailable.'}</p><Button size="sm" onClick={() => { void options.mutate(); }}>Retry collection dates</Button></div>}
    {rangeReady && !monthError && !state.error && <section aria-label="Collection summary" aria-busy={!current} className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-line bg-paper p-3 sm:p-4 lg:grid-cols-[1fr_1fr_auto]">
      <div className="text-sm"><p className="text-xs text-ink-subtle">Notice</p><p className="mt-1">{current ? dates(current.notice_from, current.notice_to) : 'Checking dates…'}</p></div><div className="text-sm"><p className="text-xs text-ink-subtle">Bank debit</p><p className="mt-1">{current ? dates(current.debit_from, current.debit_to) : 'Checking dates…'}</p></div><div className="col-span-2 border-t border-line pt-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><p className="text-xs text-ink-subtle">Ready to collect{current ? ` · ${plural(current.counts.ready, 'payment')}` : ''}</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{current ? formatMOP(current.ready_total, 0) : 'Checking…'}</p></div>
    </section>}
    {current && !current.confirmed_storage_available && <p className="text-xs text-amber-800 dark:text-amber-300">Confirmed payments are not available yet.</p>}
    <div ref={tabBar} role="tablist" aria-label="Autopay stages" className="flex gap-4 overflow-x-auto border-b border-line">{STAGES.map(item => <AutopayStageTab key={item.value} item={item} selected={stage === item.value} count={current?.counts[item.value]} id={id} onSelect={() => setStage(item.value)} onKeyDown={changeTab} />)}</div>
    <section role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${stage}-tab`} aria-busy={state.isValidating || searchPending} className="space-y-3">
      {(state.isLoading || state.isValidating || searchPending) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading autopay…</p>}
      {state.error && !searchPending && <div role="alert" className="rounded border border-red-300 p-4 text-sm"><p>{state.error instanceof Error ? state.error.message : 'Could not load autopay.'}</p><Button size="sm" className="mt-2" onClick={() => { void state.mutate(); }}>Retry</Button></div>}
      {current && <><p className="text-xs text-ink-subtle">{plural(current.total, 'entry', 'entries')} · Student number order</p>{current.rows.length ? <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper"><div aria-hidden="true" className="hidden gap-5 border-b border-line bg-tint px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_8.5rem_minmax(0,1fr)_auto]"><span>Student</span><span>Lessons covered</span><span className="text-right">Amount</span><span>Status</span><span className="w-[5.5rem]" /></div>{current.rows.map(row => <AutopayRow key={row.key} row={row} onOpen={element => { trigger.current = element; setSelection({ scope: selectionScope, key: row.key }); }} onOpenRun={canOpenRun && row.bank_run ? element => { runTrigger.current = element; setRunSelection({ scope: runScope, run: row.bank_run! }); } : undefined} />)}</div> : <p className="rounded border border-line p-5 text-sm">{debouncedSearch ? 'No students match this search.' : stage === 'prepare' && !current.preparation_available ? 'Enrollment preparation is unavailable.' : EMPTY[stage]}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-ink-subtle">{current.total ? `${current.offset + 1}–${Math.min(current.offset + current.rows.length, current.total)} of ${current.total}` : '0 entries'}</p><div className="flex gap-2"><Button size="sm" disabled={offset === 0} onClick={() => setPage({ scope, offset: Math.max(0, offset - limit) })}>Previous</Button><Button size="sm" disabled={offset + limit >= current.total} onClick={() => setPage({ scope, offset: offset + limit })}>Next</Button></div></div></>}
    </section>
    {selected && <AutopayDetails key={`${selectionScope}:${selected.key}`} row={selected} trigger={trigger} checking={state.isValidating} checkError={state.error ? state.error instanceof Error ? state.error.message : 'Could not refresh this collection.' : undefined} onRetry={() => { void state.mutate(); }} onClose={closeDetails} />}
    {canOpenRun && runSelection?.scope === runScope && <BillingBankFileDialog key={`${runScope}:${runSelection.run.id}`} collectionMonth={runSelection.run.collection_month} defaultBranch={runSelection.run.branch} initialRunId={runSelection.run.id} trigger={runTrigger} onClose={() => { setRunSelection(null); requestAnimationFrame(() => { if (runTrigger.current?.isConnected) runTrigger.current.focus(); else document.getElementById(`${id}-${stage}-tab`)?.focus(); }); }} />}
  </div></PageSurface>;
}
