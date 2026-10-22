"use client";

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, Calculator, CalendarRange, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/contexts/LocationContext';
import { useDebouncedValue, usePageTitle } from '@/lib/hooks';
import { billingAPI } from '@/lib/billing-api';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import type { BillingRosterPeriod, BillingContextBasis, BillingMethod, BillingPreviewResponse } from '@/types/billing';
import { Badge, Button, buttonClasses, Field, IconButton, Input, PageHeader, Select } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { BillingChecks } from './BillingChecks';

function Scenario({ period, method, issues = [] }: { period: BillingRosterPeriod | null; method: BillingMethod; issues?: BillingPreviewResponse['issues'] }) {
  const collection = period?.collection;
  return <div className="min-w-0 rounded-lg border border-line bg-paper p-3" aria-label={`${method === 'manual' ? 'Manual' : 'Autopay'} comparison`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><PaymentMethodBadge method={method} size="sm" />
      {period && <span className="text-xs text-ink-subtle">{plural(period.lesson_count, 'session')}</span>}
    </div>
    {period ? <>
      <p className="text-lg font-semibold tabular-nums">{formatMOP(period.gross_tuition, 0)} <span className="text-xs font-normal text-ink-subtle">tuition</span></p>
      <p className="mt-1 text-xs text-ink-subtle">{formatShortDate(period.first_lesson_date)} → {formatShortDate(period.coverage_through)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
        {collection?.method !== method && <PaymentMethodBadge method={collection?.method ?? null} size="sm" />}
        <span>{collection?.method === 'manual' && collection.due_before_lesson
          ? `Due before ${formatShortDate(collection.due_before_lesson)}`
          : collection?.debit_from && collection.debit_to
            ? `Debit ${formatShortDate(collection.debit_from)}–${formatShortDate(collection.debit_to)}`
            : 'Check payment date'}</span>
      </div>
    </> : <p className="text-sm text-ink-subtle">Open journey to review</p>}
    {issues.length > 0 && <div className="mt-2"><BillingChecks issues={issues} compact maxVisible={1} /></div>}
  </div>;
}

export function BillingRoster() {
  usePageTitle('Payment journeys');
  const { user, isLoading: authLoading, isGuest, effectiveRole, isImpersonating, impersonatedTutor } = useAuth();
  const { selectedLocation } = useLocation();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250).trim();
  const searchPending = search.trim() !== debouncedSearch;
  const [basis, setBasis] = useState<BillingContextBasis>('paid_only');
  const [page, setPage] = useState({ scope: '', offset: 0 });
  const limit = 25;
  const tutorId = effectiveRole === 'Tutor' ? (isImpersonating && impersonatedTutor?.id ? impersonatedTutor.id : user?.id) : undefined;
  const location = selectedLocation === 'All Locations' ? undefined : selectedLocation;
  const scope = JSON.stringify([user?.id, effectiveRole, tutorId, location, debouncedSearch, basis]);
  const offset = page.scope === scope ? page.offset : 0;
  function setOffset(value: number | ((current: number) => number)) {
    setPage({ scope, offset: typeof value === 'function' ? value(offset) : value });
  }
  const enabled = !!user && !isGuest && !authLoading;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    enabled ? ['billing-students', user.id, effectiveRole, tutorId, location, debouncedSearch, basis, offset] : null,
    () => billingAPI.students({ offset, limit, search: debouncedSearch || undefined, basis, tutor_id: tutorId, location }),
    { keepPreviousData: false },
  );
  const current = !error && !isValidating && !searchPending ? data : undefined;

  if (authLoading) return <p className="p-6">Loading staff access…</p>;
  if (!enabled) return <p className="p-6">Staff access is required to review payment journeys.</p>;

  return <PageSurface><div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <PageHeader title="Payment journeys" subtitle="Compare the next manual and autopay payments" icon={CalendarRange} titleExtra={<Badge>Preview</Badge>} actions={
      <div className="flex items-center gap-2">
        <Link href="/billing/preview" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
          <Calculator className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Preview enrollment fees
        </Link>
        <span aria-hidden="true" className="mx-1 h-4 border-l border-line" />
        <IconButton size="sm" label="Refresh records" title="Refresh" icon={RefreshCw} iconClassName={isValidating ? 'animate-spin' : undefined} disabled={isValidating || searchPending} onClick={() => { void mutate(); }} />
      </div>
    } />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Find a student" id="billing-search"><Input value={search} placeholder="Name or student number" onChange={event => setSearch(event.target.value)} /></Field>
      <Field label="Start sessions after" id="billing-basis"><Select value={basis} onChange={event => setBasis(event.target.value as BillingContextBasis)}>
        <option value="paid_only">Paid enrollments</option><option value="include_pending">Paid + unpaid enrollments</option>
      </Select></Field>
    </div>
    {basis === 'include_pending' && <p className="text-xs text-amber-800 dark:text-amber-300">Existing unpaid enrollments still need payment.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-subtle">
      <p>{current ? `${plural(current.total, 'student')} · Review date: ${formatShortDate(current.as_of)}${location ? ` · ${location}` : ''}` : 'Student payment comparison'}</p>
      <details className="max-w-lg"><summary className="cursor-pointer">Tuition before discounts and materials</summary><p className="mt-1">Tuition excludes discounts and materials. No payments are recorded or fee messages sent.</p></details>
    </div>
    {(isLoading || isValidating || searchPending) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading students…</p>}
    {error && !searchPending && <div role="alert" className="rounded border border-red-300 p-4 text-sm"><p>{error instanceof Error ? error.message : 'Could not load the payment journeys.'}</p><Button className="mt-2" size="sm" onClick={() => mutate()}>Retry</Button></div>}
    {current && <>
      {current.rows.length === 0 ? <p className="rounded border border-line p-5 text-sm">No students match these filters.</p> : <div className="space-y-3" aria-label="Student payment comparisons">
        {current.rows.map(row => <article key={row.student.id} className="rounded-lg border border-line bg-paper p-3 sm:p-4" aria-label={`${row.student.student_name} payment comparison`}>
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.5fr)]">
            <div className="min-w-0 space-y-2">
              <Link href={`/billing/students/${row.student.id}${basis === 'include_pending' ? '?basis=include_pending' : ''}`} className="inline-block rounded hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`${row.student.student_name}: open payment journey`}>
                <StudentInfoBadges student={{ ...row.student, lang_stream: row.student.lang_stream ?? undefined, school: row.student.school ?? undefined, grade: row.student.grade ?? undefined, school_student_id: row.student.school_student_id ?? undefined, home_location: row.student.home_location ?? undefined }} showLocationPrefix />
              </Link>
              <p className="text-xs text-ink-subtle">Last paid session: {row.last_paid_original_date ? formatShortDate(row.last_paid_original_date) : 'date to confirm'}</p>
              <div className="flex flex-wrap gap-1.5">
                {row.pending_bill_count > 0 && <Badge tone="warning">{row.pending_bill_count} unpaid</Badge>}
                {row.sent_pending_bill_count > 0 && <Badge tone="info">{plural(row.sent_pending_bill_count, 'message')} sent</Badge>}
                {row.pending_makeup_count > 0 && <Badge>{plural(row.pending_makeup_count, 'makeup')}</Badge>}
                {row.selected_slot_count > 1 && <Badge>{row.selected_slot_count} sessions/week</Badge>}
              </div>
              <BillingChecks issues={row.source_issues ?? row.issues} compact maxVisible={2} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2"><Scenario period={row.next_manual} method="manual" issues={row.method_issues?.manual} /><Scenario period={row.next_autopay} method="autopay" issues={row.method_issues?.autopay} /></div>
          </div>
          <div className="mt-3 flex justify-end border-t border-line pt-2"><Link href={`/billing/students/${row.student.id}${basis === 'include_pending' ? '?basis=include_pending' : ''}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">Open journey <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
        </article>)}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-ink-subtle">{current.total ? `${current.offset + 1}–${Math.min(current.offset + current.rows.length, current.total)} of ${current.total}` : '0 students'}</span>
        <div className="flex gap-2"><Button size="sm" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - limit))}>Previous</Button>
          <Button size="sm" disabled={offset + limit >= current.total} onClick={() => setOffset(value => value + limit)}>Next</Button></div>
      </div>
    </>}
  </div></PageSurface>;
}
