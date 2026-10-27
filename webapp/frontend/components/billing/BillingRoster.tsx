"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { ArrowRight, Calculator, CalendarRange, RefreshCw, Settings2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/contexts/LocationContext';
import { useDebouncedValue, usePageTitle } from '@/lib/hooks';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { cn } from '@/lib/utils';
import type { BillingRosterPeriod, BillingContextBasis, BillingMethod, BillingPreviewResponse, BillingRosterRow, BillingPreferences, BillingPreferenceFilter, BillingPreferenceCounts } from '@/types/billing';
import { Badge, Button, buttonClasses, Field, IconButton, Input, PageHeader, Select } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { BillingChecks } from './BillingChecks';
import { BillingPlanControl } from './BillingPlanControl';
import { BillingPreferenceBatchModal } from './BillingPreferenceBatchModal';
import { billingDraftAuthScope } from './BillingDraftReview';

const FILTERS = [
  { value: 'all', label: 'All', count: 'total' },
  { value: 'not_recorded', label: 'Not recorded', count: 'not_recorded' },
  { value: 'manual', label: 'Manual', count: 'manual' },
  { value: 'autopay', label: 'Autopay', count: 'autopay' },
  { value: 'setup_pending', label: 'Setup pending', count: 'setup_pending' },
] as const;

function matches(row: BillingRosterRow, filter: BillingPreferenceFilter) {
  if (filter === 'all') return true;
  if (filter === 'not_recorded') return !row.recorded_payment_method;
  if (filter === 'setup_pending') return row.recorded_payment_method === 'autopay' && !row.mandate_ready;
  return row.recorded_payment_method === filter;
}

function Scenario({ period, method, issues = [], saved = false }: { period: BillingRosterPeriod | null; method: BillingMethod; issues?: BillingPreviewResponse['issues']; saved?: boolean }) {
  const collection = period?.collection;
  return <div className="min-w-0 rounded-lg border border-line bg-wash p-3" aria-label={`${method === 'manual' ? 'Manual' : 'Autopay'} comparison`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-2">{saved && <span className="text-xs text-ink-subtle">Next</span>}<PaymentMethodBadge method={saved ? collection?.method ?? method : method} size="sm" /></span>{period && <span className="text-xs text-ink-subtle">{plural(period.lesson_count, 'session')}</span>}</div>
    {!saved && collection && collection.method !== method && <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">First collection <PaymentMethodBadge method={collection.method} size="sm" /></p>}
    {period ? <>
      <p className="text-lg font-semibold tabular-nums">{formatMOP(period.gross_tuition, 0)} <span className="text-xs font-normal text-ink-subtle">tuition</span></p>
      <p className="mt-1 text-xs text-ink-subtle">{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.coverage_through)}</p>
      <p className="mt-2 text-xs text-ink-subtle">{collection?.method === 'manual' && collection.due_before_lesson ? `Due before ${formatShortDate(collection.due_before_lesson)}` : collection?.debit_from && collection.debit_to ? `Debit ${formatShortDate(collection.debit_from)} to ${formatShortDate(collection.debit_to)}` : 'Check payment date'}</p>
    </> : <p className="text-sm text-ink-subtle">Open journey to review</p>}
    {issues.length > 0 && <div className="mt-2"><BillingChecks issues={issues} compact maxVisible={1} /></div>}
  </div>;
}

export function BillingRoster() {
  usePageTitle('Payment plans');
  const auth = useAuth();
  const { user, isLoading: authLoading, isGuest, effectiveRole, isImpersonating, impersonatedTutor } = auth;
  const { selectedLocation } = useLocation();
  const { mutate: refreshCache } = useSWRConfig();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250).trim();
  const searchPending = search.trim() !== debouncedSearch;
  const [basis, setBasis] = useState<BillingContextBasis>('include_pending');
  const [filter, setFilter] = useState<BillingPreferenceFilter>('all');
  const [page, setPage] = useState({ scope: '', offset: 0 });
  const limit = 25;
  const tutorId = effectiveRole === 'Tutor' ? (isImpersonating && impersonatedTutor?.id ? impersonatedTutor.id : user?.id) : undefined;
  const location = selectedLocation === 'All Locations' ? undefined : selectedLocation;
  const authScope = billingDraftAuthScope(auth);
  const scope = JSON.stringify([authScope, tutorId, location, debouncedSearch, basis, filter]);
  const offset = page.scope === scope ? page.offset : 0;
  const enabled = !!user && !isGuest && !authLoading;
  const options = useSWR(enabled ? ['billing-plan-options', authScope] : null, billingAPI.options, { keepPreviousData: false });
  const writable = !!(auth.isAdmin && !auth.isReadOnly && !options.error && options.data?.workflow_available && options.data?.preferences_writes_available);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    enabled ? ['billing-students', scope, offset] : null,
    () => billingAPI.students({ offset, limit, search: debouncedSearch || undefined, basis, tutor_id: tutorId, location, preference_filter: filter === 'all' ? undefined : filter }),
    { keepPreviousData: false },
  );
  const current = !error && !searchPending ? data : undefined;
  const progressScope = JSON.stringify([authScope, tutorId, location, debouncedSearch]);
  const progress = useRef<{ scope: string; available: boolean; counts?: BillingPreferenceCounts | null } | null>(null);
  if (current) progress.current = { scope: progressScope, available: !!current.preferences_available, counts: current.preference_counts };
  const scopedProgress = !error && !searchPending && progress.current?.scope === progressScope ? progress.current : null;
  const filtersAvailable = !error && (scopedProgress?.available ?? (!options.error && !!options.data?.workflow_available));
  const selectionScope = JSON.stringify([scope, search.trim(), writable, auth.isReadOnly]);
  const [selection, setSelection] = useState<{ scope: string; rows: BillingRosterRow[] }>({ scope: '', rows: [] });
  const [batch, setBatch] = useState<string | null>(null);
  const selected = selection.scope === selectionScope ? selection.rows : [];
  const selectedIds = new Set(selected.map(row => row.student.id));
  const pageSelected = !!current?.rows.length && current.rows.every(row => selectedIds.has(row.student.id));
  const pagePartlySelected = !pageSelected && !!current?.rows.some(row => selectedIds.has(row.student.id));
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const tabsId = useId();
  const canSelect = writable && !!current?.preferences_available;
  useEffect(() => {
    setSelection(previous => previous.scope === selectionScope ? previous : { scope: selectionScope, rows: [] });
    setBatch(previous => previous === selectionScope ? previous : null);
  }, [selectionScope]);

  function refreshRelated() {
    void invalidateRenewalQueueCache().catch(() => {});
    void refreshCache(key => Array.isArray(key) && ['billing-student-context', 'billing-preferences', 'billing-autopay'].includes(key[0])).catch(() => {});
  }
  function acceptPreference(value: BillingPreferences, revalidate = true) {
    const index = current?.rows.findIndex(row => row.student.id === value.student_id) ?? 0;
    const update = (row: BillingRosterRow): BillingRosterRow => row.student.id !== value.student_id || (row.preference_version ?? 0) > value.version ? row : {
      ...row, recorded_payment_method: value.payment_method, mandate_ready: value.mandate_ready, preference_version: value.version, preference_updated_at: value.updated_at,
    };
    setSelection(previous => previous.scope === selectionScope ? { ...previous, rows: previous.rows.map(update) } : previous);
    void mutate(previous => {
      if (!previous) return previous;
      const rows = previous.rows.map(update).filter(row => matches(row, filter));
      return { ...previous, rows, total: previous.total - (previous.rows.length - rows.length) };
    }, { revalidate }).catch(() => {});
    if (revalidate) refreshRelated();
    if (revalidate && filter !== 'all') requestAnimationFrame(() => {
      const controls = list.current?.querySelectorAll<HTMLSelectElement>('select');
      if (controls?.length) controls[Math.min(Math.max(index, 0), controls.length - 1)]?.focus({ preventScroll: true });
    });
  }
  function toggle(row: BillingRosterRow) {
    setSelection({ scope: selectionScope, rows: selectedIds.has(row.student.id) ? selected.filter(value => value.student.id !== row.student.id) : [...selected, row] });
  }
  function togglePage() {
    if (!current) return;
    const ids = new Set(current.rows.map(row => row.student.id));
    const all = current.rows.every(row => selectedIds.has(row.student.id));
    setSelection({ scope: selectionScope, rows: all ? selected.filter(row => !ids.has(row.student.id)) : [...selected, ...current.rows.filter(row => !selectedIds.has(row.student.id))] });
  }
  function changeTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const available = FILTERS.filter(item => item.value === 'all' || filtersAvailable);
    const index = available.findIndex(item => item.value === filter);
    const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available[available.length - 1] : available[(index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length];
    setFilter(next.value); document.getElementById(`${tabsId}-${next.value}`)?.focus();
  }

  if (authLoading) return <p className="p-6">Loading staff access…</p>;
  if (!enabled) return <p className="p-6">Staff access is required to review payment plans.</p>;
  return <PageSurface><div className={cn('mx-auto max-w-7xl space-y-4 p-4 sm:p-6', selected.length > 0 && 'pb-28 sm:pb-28')}>
    <PageHeader title="Payment plans" icon={CalendarRange} actions={<div className="flex flex-wrap items-center gap-2">
      <Link href="/admin/renewals" className={buttonClasses({ size: 'sm', variant: 'secondary' })}>Renewals</Link>
      <Link href="/billing/preview" className={buttonClasses({ size: 'sm', variant: 'primary' })}><Calculator className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Preview enrollment fees</Link>
      <span aria-hidden="true" className="mx-1 h-4 border-l border-line" /><IconButton size="sm" label="Refresh records" title="Refresh" icon={RefreshCw} iconClassName={isValidating ? 'animate-spin' : undefined} disabled={isValidating || searchPending} onClick={() => { void mutate(); }} />
    </div>} />
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Find a student" id="billing-search"><Input value={search} placeholder="Name or student number" onChange={event => setSearch(event.target.value)} /></Field>
      <Field label="Count existing enrollments" id="billing-basis"><Select title="The next enrollment starts after the enrollments counted here." value={basis} onChange={event => setBasis(event.target.value as BillingContextBasis)}><option value="include_pending">Paid and unpaid</option><option value="paid_only">Paid only</option></Select></Field></div>
    {basis === 'include_pending' && <p className="text-xs text-amber-800 dark:text-amber-300">Existing unpaid enrollments still need payment.</p>}
    <div role="tablist" aria-label="Payment preferences" className="flex gap-4 overflow-x-auto border-b border-line">{FILTERS.map(item => <button key={item.value} id={`${tabsId}-${item.value}`} role="tab" type="button" aria-selected={filter === item.value} aria-controls={`${tabsId}-panel`} tabIndex={filter === item.value ? 0 : -1} disabled={item.value !== 'all' && !filtersAvailable} onKeyDown={changeTab} onClick={() => setFilter(item.value)} className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', filter === item.value ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle')}>{item.label}{' '}{scopedProgress?.counts && <Badge>{scopedProgress.counts[item.count]}</Badge>}</button>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-subtle"><div className="flex items-center gap-3">
      {canSelect && current && current.rows.length > 0 && <label className="flex items-center gap-2"><input ref={node => { if (node) node.indeterminate = pagePartlySelected; }} type="checkbox" className="h-4 w-4 rounded border-gray-300 text-accent-ink focus:ring-primary" aria-label="Select this page" checked={pageSelected} onChange={togglePage} />Select this page</label>}
      <span>{current ? `${plural(current.total, 'student')}${location ? ` · ${location}` : ''}` : 'Payment plans'}</span></div><span>Tuition before discounts and materials</span></div>
    {(isLoading || searchPending) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading students…</p>}
    {error && !searchPending && <div role="alert" className="rounded border border-red-300 p-4 text-sm"><p>{error instanceof Error ? error.message : 'Could not load payment plans.'}</p><Button className="mt-2" size="sm" onClick={() => mutate()}>Retry</Button></div>}
    {current && <section id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${filter}`} className="space-y-4">
      {current.rows.length === 0 ? <p className="rounded border border-line p-5 text-sm">No students match these filters.</p> : <div ref={list} className="space-y-3" aria-label="Student payment plans">{current.rows.map(row => {
        const method = row.recorded_payment_method ?? null;
        const href = `/billing/students/${row.student.id}?basis=${basis}`;
        return <article key={row.student.id} className={cn('group rounded-lg border border-line bg-paper p-3 sm:p-4', selectedIds.has(row.student.id) && 'ring-2 ring-primary ring-offset-2')} aria-label={`${row.student.student_name} payment comparison`}>
          <div className="flex items-start gap-3">
            {canSelect && <label className={cn('flex shrink-0 cursor-pointer items-center justify-center -m-2 p-2 pt-2.5 transition-opacity [@media(pointer:coarse)]:-m-3 [@media(pointer:coarse)]:p-3', !selected.length && '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100')}><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-accent-ink focus:ring-primary" aria-label={`Select ${row.student.student_name}`} checked={selectedIds.has(row.student.id)} onChange={() => toggle(row)} /></label>}
            <div className="grid min-w-0 flex-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(160px,0.8fr)] lg:grid-cols-[minmax(180px,1fr)_minmax(160px,0.8fr)_minmax(0,1.8fr)]">
              <div className="min-w-0 space-y-2"><Link href={href} className="inline-flex max-w-full items-start gap-1.5 rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" title="Open journey" aria-label={`${row.student.student_name}: open payment journey`}><StudentInfoBadges student={{ ...row.student, lang_stream: row.student.lang_stream ?? undefined, school: row.student.school ?? undefined, grade: row.student.grade ?? undefined, school_student_id: row.student.school_student_id ?? undefined, home_location: row.student.home_location ?? undefined }} showLocationPrefix /><ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" /></Link>
                <p className="text-xs text-ink-subtle">Last paid session: {row.last_paid_original_date ? formatShortDate(row.last_paid_original_date) : 'date to confirm'}</p>
                <div className="flex flex-wrap gap-1.5">{row.pending_bill_count > 0 && <Badge tone="warning">{row.pending_bill_count} unpaid</Badge>}{row.sent_pending_bill_count > 0 && <Badge tone="info">{plural(row.sent_pending_bill_count, 'message')} sent</Badge>}{row.pending_makeup_count > 0 && <Badge>{plural(row.pending_makeup_count, 'makeup')}</Badge>}{row.selected_slot_count > 1 && <Badge>{row.selected_slot_count} sessions/week</Badge>}</div>
                <BillingChecks issues={row.source_issues ?? row.issues} compact maxVisible={2} /></div>
              <div className="min-w-0 space-y-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Saved preference</p><BillingPlanControl key={`${selectionScope}:${row.student.id}:${canSelect}:${Number.isSafeInteger(row.preference_version)}`} row={row} canWrite={canSelect && Number.isSafeInteger(row.preference_version)} tutorId={tutorId} onSaved={acceptPreference} onReload={() => mutate()} /></div>
              <div className={cn('grid min-w-0 gap-2 md:col-span-2 lg:col-span-1', !method && 'sm:grid-cols-2')}>
                {(!method || method === 'manual') && <Scenario period={row.next_manual} method="manual" issues={row.method_issues?.manual} saved={!!method} />}
                {(!method || method === 'autopay') && <Scenario period={row.next_autopay} method="autopay" issues={row.method_issues?.autopay} saved={!!method} />}
              </div>
            </div>
          </div>
        </article>;
      })}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-ink-subtle">{current.total ? `${current.offset + 1}–${Math.min(current.offset + current.rows.length, current.total)} of ${current.total}` : '0 students'}</span><div className="flex gap-2"><Button size="sm" disabled={offset === 0} onClick={() => setPage({ scope, offset: Math.max(0, offset - limit) })}>Previous</Button><Button size="sm" disabled={offset + limit >= current.total} onClick={() => setPage({ scope, offset: offset + limit })}>Next</Button></div></div>
    </section>}
    <AnimatePresence>{canSelect && selected.length > 0 && <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="fixed bottom-[calc(1rem+var(--app-bottom-inset))] sm:bottom-[calc(1.5rem+var(--app-bottom-inset))] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40"><div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"><span className="text-sm font-medium">{selected.length} selected</span><Button ref={trigger} variant="primary" icon={Settings2} disabled={searchPending} onClick={() => setBatch(selectionScope)}>Set payment method</Button><IconButton icon={X} label="Clear selection" onClick={() => setSelection({ scope: selectionScope, rows: [] })} /></div></motion.div>}</AnimatePresence>
    {canSelect && batch === selectionScope && <BillingPreferenceBatchModal rows={selected} tutorId={tutorId} trigger={trigger} onSaved={value => acceptPreference(value, false)} onClose={completed => { setBatch(null); setSelection(previous => ({ scope: selectionScope, rows: previous.rows.filter(row => !completed.includes(row.student.id)) })); void mutate(); refreshRelated(); requestAnimationFrame(() => trigger.current?.focus()); }} />}
  </div></PageSurface>;
}
