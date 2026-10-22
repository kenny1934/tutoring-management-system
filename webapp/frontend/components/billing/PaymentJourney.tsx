'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, CalendarDays, HandCoins, Landmark, Route } from 'lucide-react';
import { Segmented, Select } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { BillingChecks } from '@/components/billing/BillingChecks';
import { JourneyDetailContext } from './JourneyDetailContext';
import { useAsSheet } from '@/hooks/usePopoverSheet';
import { formatShortDate } from '@/lib/formatters';
import { billingCheck, orderedBillingIssues } from '@/lib/billing-presentation';
import { cn } from '@/lib/utils';
import { followingMonth, journeyCycles, journeyEvents, journeySelectionKey, paymentGap, type BillingJourneys, type JourneyEvent } from '@/lib/billing-journey';
import type { BillingMethod, BillingPeriod, BillingSlot } from '@/types/billing';

interface PaymentJourneyProps {
  journeys: BillingJourneys;
  slots: BillingSlot[];
  unitFee: number;
  initialMethod?: BillingMethod;
  actions?: ReactNode;
  renderPaymentActions?: (event: JourneyEvent) => ReactNode;
}

const money = (value: number) => `$${value.toLocaleString('en-US')}`;
const month = (value: string, short = false) => new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC' });
const cycleLabel = (cycle: string) => cycle === 'intro' ? 'First payment' : month(cycle);
const name = (method: BillingMethod) => method === 'autopay' ? 'Autopay' : 'Manual';

function timing(period: BillingPeriod): string {
  const collection = period.collection;
  if (collection.method === 'manual') return collection.due_before_lesson ? `Pay before ${formatShortDate(collection.due_before_lesson)}` : 'Payment deadline to confirm';
  return collection.debit_from && collection.debit_to
    ? `Debit ${formatShortDate(collection.debit_from)} to ${formatShortDate(collection.debit_to)}`
    : 'Debit window to confirm';
}

/** This detail sheet adds focus containment to the shared responsive Modal. */
function SheetFocus({ children, trigger }: { children: ReactNode; trigger: React.RefObject<HTMLButtonElement | null> }) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = content.current?.closest<HTMLElement>('[role="dialog"]');
    const returnTo = trigger.current;
    if (!dialog) return;
    const targets = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter(element => {
      const closed = element.closest('details:not([open])');
      return !element.closest('[hidden]') && (!closed || (element.tagName === 'SUMMARY' && element.parentElement === closed));
    });
    targets()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const options = targets();
      const first = options[0], last = options[options.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, [trigger]);
  return <div ref={content} className="min-w-0">{children}</div>;
}

export function PaymentJourney({ journeys, slots, unitFee, initialMethod, actions, renderPaymentActions }: PaymentJourneyProps) {
  const available = (['manual', 'autopay'] as const).filter(method => journeys[method]);
  const [view, setView] = useState<BillingMethod | 'compare'>(() => available.length === 2 ? 'compare' : initialMethod ?? available[0] ?? 'manual');
  const [expanded, setExpanded] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const rangeId = useId();
  const asSheet = useAsSheet();
  const methods = view === 'compare' ? available : available.includes(view) ? [view] : available;
  const cycles = journeyCycles(journeys);
  const shownCycles = expanded ? cycles : cycles.slice(0, 4);
  const events = methods.flatMap(method => shownCycles.flatMap(cycle => journeyEvents(journeys, method, cycle)));
  const selected = events.find(event => journeySelectionKey(event) === selectedKey) ?? events.find(event => !event.skipMonth) ?? events[0];
  const end = Object.values(journeys).map(journey => journey.regular_end_date).sort().at(-1);
  const closeSheet = () => { setSheetOpen(false); setReviewing(false); };

  function select(event: JourneyEvent, button: HTMLButtonElement) {
    if (detailBusy) return;
    trigger.current = button;
    setSelectedKey(journeySelectionKey(event));
    setReviewing(false);
    if (asSheet) setSheetOpen(true);
  }

  function card(event: JourneyEvent) {
    const { period, method, skipMonth } = event;
    const active = selected && journeySelectionKey(event) === journeySelectionKey(selected);
    const issues = journeys[method]?.issues.filter(issue => issue.period === period.number) ?? [];
    const attention = orderedBillingIssues(issues).filter(issue => billingCheck(issue.code).severity !== 'info');
    const notes = orderedBillingIssues(issues).filter(issue => billingCheck(issue.code).severity === 'info');
    return <button key={journeySelectionKey(event)} type="button" aria-pressed={!!active} disabled={detailBusy}
      aria-label={skipMonth ? `${name(method)}: no additional fee in ${month(skipMonth)}; view payment ${period.number}` : `${name(method)} payment ${period.number}, ${period.total_fee === null ? 'total to confirm' : money(period.total_fee)}, ${period.lesson_count} sessions`}
      onClick={eventClick => select(event, eventClick.currentTarget)}
      className={cn('relative w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-line bg-paper hover:border-line-strong', skipMonth && 'border-dashed bg-wash')}>
      {skipMonth ? <>
        <ArrowDownToLine className="mb-2 h-4 w-4 text-ink-subtle" aria-hidden="true" />
        <span className="block text-sm font-medium">No additional fee</span>
        <span className="mt-1 block text-xs text-ink-subtle">{month(followingMonth(skipMonth), true)} sessions included in Payment {period.number}</span>
      </> : <>
        <div className="flex flex-wrap items-center justify-between gap-1.5"><PaymentMethodBadge method={period.collection.method} size="sm" /><span className="text-[10px] text-ink-subtle">Payment {period.number}</span></div>
        <span className="mt-2 block text-xl font-semibold tabular-nums">{period.total_fee === null ? 'Total to confirm' : money(period.total_fee)}</span>
        <span className="block text-xs text-ink-subtle">{period.lesson_count} sessions{period.total_fee === null ? ` · ${money(period.tuition_after_deductions)} tuition` : ''}</span>
        <div className="my-2 flex flex-wrap gap-1">{period.counts_by_month.map(count => <span key={count.month} className="rounded bg-tint px-1.5 py-0.5 text-xs">{month(count.month, true)} <span className="text-ink-subtle">· {count.lessons}</span></span>)}</div>
        <span className="block text-xs font-medium">{timing(period)}</span>
        {paymentGap(period) && <span className="mt-1 block text-[11px] text-ink-subtle">{paymentGap(period)}</span>}
        {method === 'autopay' && period.collection.method === 'manual' && <span className="mt-1 block text-[11px] text-ink-subtle">First payment is manual</span>}
        {attention.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{attention.slice(0, 2).map(issue => <span key={issue.code} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{billingCheck(issue.code).label}</span>)}{attention.length > 2 && <span className="text-[11px] text-ink-subtle">+{attention.length - 2} checks</span>}</span>}
        {notes.length > 0 && <span className="mt-2 block text-[11px] text-ink-subtle">{billingCheck(notes[0].code).label}</span>}
      </>}
    </button>;
  }

  function detail(event: JourneyEvent) {
    const { period, method, skipMonth } = event;
    const journey = journeys[method];
    const issues = journey?.issues.filter(issue => issue.period === null || issue.period === period.number) ?? [];
    const holidays = journey?.excluded_holidays.filter(date => date >= period.coverage_from && date <= period.coverage_through) ?? [];
    const isFinalPeriod = !!journey && period.coverage_through >= journey.regular_end_date;
    return <JourneyDetailContext.Provider value={{ inDialog: asSheet, active: !asSheet || sheetOpen, setReviewing, setBusy: setDetailBusy, closeDetails: closeSheet }}><div className="space-y-4"><div hidden={asSheet && reviewing}><div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-ink-subtle">{name(method)} preview · Payment {period.number}</p><h3 className="mt-1 font-semibold">{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.last_lesson_date)}</h3></div><PaymentMethodBadge method={period.collection.method} /></div>
        {skipMonth && <p className="rounded bg-tint p-2 text-sm">{month(followingMonth(skipMonth))} sessions are included in this proposed payment.</p>}
        <div className="flex flex-wrap gap-2">{slots.map((slot, i) => <span key={i} className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs"><CalendarDays aria-hidden="true" className="h-3 w-3" />{slot.weekday} {slot.time_slot}{slot.location ? ` · ${slot.location}` : ''}</span>)}</div>
        <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-ink-subtle">Fee message</dt><dd className="mt-1">{period.collection.notice_from ? `${formatShortDate(period.collection.notice_from)} to ${formatShortDate(period.collection.notice_to)}` : 'Manual arrangement'}</dd></div><div><dt className="text-ink-subtle">{period.collection.method === 'manual' ? 'Payment deadline' : 'Bank debit window'}</dt><dd className="mt-1">{timing(period)}</dd></div><div><dt className="text-ink-subtle">Tuition through</dt><dd className="mt-1">{formatShortDate(period.coverage_through)}</dd></div><div><dt className="text-ink-subtle">Sessions</dt><dd className="mt-1">{period.counts_by_month.map(count => `${month(count.month, true)}: ${count.lessons}`).join(' · ')}</dd></div></dl>
        <BillingChecks issues={issues} />
        <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Show {period.lesson_count} session dates</summary><ul className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">{period.lessons.map(lesson => <li key={`${lesson.date}:${lesson.slot}`}><span className="font-medium">{formatShortDate(lesson.date)} ({lesson.weekday})</span><span className="block text-ink-subtle">{lesson.time_slot}{lesson.location ? ` · ${lesson.location}` : ''}{lesson.holiday_exception ? ' · Holiday lesson' : ''}</span></li>)}</ul>
          {holidays.length > 0 && <p className="mt-3 border-t border-line pt-3 text-xs text-ink-subtle">Holidays excluded: {holidays.map(formatShortDate).join(' · ')}</p>}
          {isFinalPeriod && <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs"><div><dt className="text-ink-subtle">Teaching year ends</dt><dd className="mt-1">{formatShortDate(journey.regular_end_date)}</dd></div><div><dt className="text-ink-subtle">Makeup deadline</dt><dd className="mt-1">{formatShortDate(journey.makeup_end_date)}</dd></div></dl>}
        </details>
        <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Why these sessions?</summary><p className="mt-2 text-sm text-ink-subtle">{period.explanation}</p>{period.adjustment_reason && <p className="mt-2 text-sm">Adjustment: {period.adjustment_reason}</p>}</details>
      </div>
      <div className="rounded-lg bg-wash p-4"><h4 className="mb-3 text-sm font-semibold">Fee breakdown</h4><dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>{period.lesson_count} sessions × {money(unitFee)}</dt><dd>{money(period.gross_tuition)}</dd></div>{period.deductions.map((deduction, i) => <div key={i} className="flex justify-between gap-3"><dt>{deduction.kind === 'trial' ? 'Trial deduction' : deduction.kind === 'staff' ? 'Staff coupon' : 'Coupon'}</dt><dd>−{money(deduction.amount)}</dd></div>)}<div className="flex justify-between gap-3"><dt>Materials</dt><dd>{period.materials_fee === null ? 'To confirm' : money(period.materials_fee)}</dd></div><div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold"><dt>Total</dt><dd>{period.total_fee === null ? 'To confirm' : money(period.total_fee)}</dd></div></dl></div>
    </div></div>{renderPaymentActions && <div key={journeySelectionKey(event)}>{renderPaymentActions(event)}</div>}</div></JourneyDetailContext.Provider>;
  }

  if (!available.length) return null;
  return <section aria-label="Payment journey" className="space-y-4 text-gray-900 dark:text-gray-100">
    <div className="flex flex-wrap items-center justify-between gap-3" aria-label="Journey controls"><h2 className="flex items-center gap-2 font-semibold"><Route className="h-4 w-4 text-ink-subtle" aria-hidden="true" />Payment journey</h2><div className="flex flex-wrap items-center gap-2"><Segmented label="Payment journey view" value={view} onChange={next => { setView(next); setSheetOpen(false); }} options={[
      ...(available.length === 2 ? [{ value: 'compare' as const, label: 'Compare', icon: Route, disabled: detailBusy }] : []),
      ...available.map(method => ({ value: method, label: name(method), icon: method === 'autopay' ? Landmark : HandCoins, disabled: detailBusy })),
    ]} /><div className="flex items-center gap-2 text-xs text-ink-subtle"><label htmlFor={rangeId}>Show</label><Select id={rangeId} aria-label="Journey range" size="sm" disabled={detailBusy} className="w-[156px] sm:w-auto" value={expanded ? 'all' : 'next'} onChange={event => setExpanded(event.target.value === 'all')}><option value="next">Next 4 cycles</option><option value="all">Through {end ? formatShortDate(end) : 'year end'}</option></Select></div>{actions}</div></div>
    {methods.some(method => journeys[method]?.issues.some(issue => issue.period === null && issue.code !== 'COVERAGE_ASSUMED')) && <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
      {methods.map(method => {
        // The preview label already establishes that entered coverage is a
        // scenario. Its complete note remains in the selected payment's details.
        const globalIssues = journeys[method]?.issues.filter(issue => issue.period === null && issue.code !== 'COVERAGE_ASSUMED') ?? [];
        if (!globalIssues.length) return null;
        return <div key={method} aria-label={`${name(method)} plan checks`} className="flex min-w-0 flex-wrap items-start gap-2">
          <PaymentMethodBadge method={method} size="sm" />
          <BillingChecks issues={globalIssues} maxVisible={2} />
        </div>;
      })}
    </div>}
    {!asSheet && <div className="overflow-x-auto pb-2"><div style={{ minWidth: `${130 + shownCycles.length * 210}px` }}>
      <div className="grid gap-3 pb-2 text-xs text-ink-subtle" style={{ gridTemplateColumns: `120px repeat(${shownCycles.length}, minmax(195px, 1fr))` }}><span>Fee message month</span>{shownCycles.map(cycle => <span key={cycle}>{cycleLabel(cycle)}</span>)}</div>
      {methods.map(method => <div key={method} className="grid gap-3" style={{ gridTemplateColumns: `120px repeat(${shownCycles.length}, minmax(195px, 1fr))` }}><div className="pt-8"><PaymentMethodBadge method={method} /><p className="mt-2 text-xs text-ink-subtle">{journeys[method]?.monthly ? 'Monthly' : 'Rolling 2 months'}</p></div>{shownCycles.map(cycle => <div key={cycle} className={cn('relative border-t-2 pb-4 pt-5', method === 'autopay' ? 'border-blue-200 dark:border-blue-900' : 'border-stone-300 dark:border-stone-700')}><span aria-hidden="true" className={cn('absolute -top-1.5 left-4 h-2.5 w-2.5 rounded-full border-2 border-paper', method === 'autopay' ? 'bg-blue-500' : 'bg-stone-500')} /><div className="space-y-2">{journeyEvents(journeys, method, cycle).length ? journeyEvents(journeys, method, cycle).map(card) : <p className="p-3 text-xs text-ink-subtle">No new payment in this cycle</p>}</div></div>)}</div>)}
    </div></div>}
    {asSheet && <div className="space-y-5">{shownCycles.map(cycle => <div key={cycle} className="relative border-l-2 border-line pl-4"><span aria-hidden="true" className="absolute -left-1.5 top-1 h-2.5 w-2.5 rounded-full bg-primary" /><h3 className="mb-3 text-sm font-semibold">{cycle === 'intro' ? 'First payment' : `${month(cycle)} fee message`}</h3><div className={cn('grid gap-3', methods.length === 2 && 'min-[420px]:grid-cols-2')}>{methods.map(method => <div key={method} className="min-w-0 space-y-2"><PaymentMethodBadge method={method} size="sm" />{journeyEvents(journeys, method, cycle).length ? journeyEvents(journeys, method, cycle).map(card) : <p className="p-2 text-xs text-ink-subtle">No new payment in this cycle</p>}</div>)}</div></div>)}</div>}
    {selected && !asSheet && <div className="rounded-lg border border-line bg-paper p-4" aria-label="Selected payment details">{detail(selected)}</div>}
    <Modal isOpen={sheetOpen && asSheet && !!selected} onClose={() => { if (!detailBusy) closeSheet(); }} persistent={detailBusy} title="Payment details" size="xl" className="min-w-0">{selected && <SheetFocus trigger={trigger}>{detail(selected)}</SheetFocus>}</Modal>
  </section>;
}
