'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import useSWR, { useSWRConfig } from 'swr';
import { CalendarCheck, CalendarRange, CheckCircle2, Clock, Copy, CreditCard, Eye, FilePenLine, Landmark, ListTodo, ReceiptText, RefreshCw, Send, LayoutGrid, List, SlidersHorizontal, ChevronDown, X } from 'lucide-react';
import { Badge, Button, Field, IconButton, Input, Select, Segmented, PageHeader, buttonClasses } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from '@/contexts/LocationContext';
import { billingAPI } from '@/lib/billing-api';
import { canBatchRenew } from '@/lib/billing-batch';
import { paymentBatchTarget, queuePaymentBatchAction, type PaymentBatchAction, type PaymentBatchTarget } from '@/lib/billing-payment-batch';
import type { BillingBatchItem } from '@/lib/billing-batch';
import { formatMOP, formatShortDate, plural } from '@/lib/formatters';
import { useDebouncedValue, usePageTitle, useUnlistedWaitingCount, useVisibilityAwareInterval } from '@/lib/hooks';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { cn } from '@/lib/utils';
import type { BillingPreferences, BillingQueueCounts, BillingQueueRow, BillingQueueStage, BillingQueueUrgency, BillingQueueFilters, BillingWeekday } from '@/types/billing';
import { BillingChecks } from './BillingChecks';
import { billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingRenewalWorkspace } from './BillingRenewalWorkspace';
import { BillingBatchRenewModal } from './BillingBatchRenewModal';
import { BillingPaymentBatchModal } from './BillingPaymentBatchModal';
import { BillingCardFeeMessage, cardFeeMessageTarget } from './BillingCardFeeMessage';
import { RenewalTools, RenewalMenuItems, renewalMenuItemClass } from './RenewalTools';
import { RenewalPagination } from './RenewalPagination';
import { RenewalExpiryFilter } from './RenewalExpiryFilter';
import { RenewalCollectionMonth } from './RenewalCollectionMonth';
import { BillingReceiptsQueue } from './BillingReceiptsQueue';
import type { BillingRenewalAction } from './BillingRenewalPanel';

const STAGES = [
  { value: 'prepare', label: 'To prepare', icon: FilePenLine, colour: 'text-ink-subtle' },
  { value: 'send', label: 'To send', icon: Send, colour: 'text-blue-700 dark:text-blue-300' },
  { value: 'awaiting_payment', label: 'Awaiting payment', icon: CreditCard, colour: 'text-amber-800 dark:text-amber-300' },
] as const;

export type BillingQueueView = 'all' | 'receipts' | BillingQueueStage;
const VIEWS = [{ value: 'all', label: 'All tasks', icon: ListTodo, colour: 'text-ink-subtle' }, ...STAGES, { value: 'receipts', label: 'KMS receipts', icon: ReceiptText, colour: 'text-ink-subtle' }, { value: 'no_payment', label: 'No payment this run', icon: CalendarCheck, colour: 'text-ink-subtle' }] as const;
const URGENCY_GROUPS = [
  { value: 'now', label: 'Needs action now', colour: 'red' },
  { value: 'week', label: 'This week', colour: 'orange' },
  { value: 'check_dates', label: 'Check dates', colour: 'purple' },
  { value: 'later', label: 'Later', colour: 'gray' },
] as const;

const EMPTY: Record<BillingQueueView, string> = {
  receipts: 'No coupon receipts need checking.',
  all: 'There are no enrollment tasks for this collection month.',
  prepare: 'No enrollments need preparing for this collection month.',
  send: 'No fee messages are waiting to be sent.',
  awaiting_payment: 'No students are awaiting payment.',
  attention: 'No renewals need attention.',
  no_payment: 'No students are skipping this collection run.',
};

function actionLabel(row: BillingQueueRow) {
  if (row.origin === 'draft' && row.draft_id) return 'Review draft';
  if (row.origin === 'legacy') return row.stage === 'attention' ? 'Review enrollment' : 'Open enrollment';
  if (row.origin === 'payment' && row.payment_id) return row.stage === 'send' ? 'Open fee message' : 'Open payment';
  if (row.origin === 'payment' && !row.payment_id) return 'Review enrollments';
  if (row.stage === 'no_payment') return 'View details';
  if (row.stage === 'send') return 'Open fee message';
  if (row.stage === 'awaiting_payment') return 'Open payment';
  return 'Renew';
}

function collectionLabel(row: BillingQueueRow, asOf: string) {
  if (row.action_kind === 'notice' && row.action_by) return row.action_from && row.action_from > asOf
    ? `Prepare from ${formatShortDate(row.action_from)}` : `Notice by ${formatShortDate(row.action_by)}`;
  if (row.action_kind === 'renewal' && row.action_by) return `${row.origin === 'draft' && !row.enrollment_ids.length ? 'Prepare' : 'Renew'} before ${formatShortDate(row.action_by)}`;
  if (row.prepare_on && row.prepare_on > asOf) return `Prepare from ${formatShortDate(row.prepare_on)}`;
  if (row.collection?.method === 'autopay' && row.collection.debit_from && row.collection.debit_to) {
    return `Debit ${formatShortDate(row.collection.debit_from)} to ${formatShortDate(row.collection.debit_to)}`;
  }
  if (row.due_date) return `Pay before ${formatShortDate(row.due_date)}`;
  return null;
}

function worklistAction(row: BillingQueueRow): BillingRenewalAction | undefined {
  if (row.origin === 'payment' && row.payment_id) return { kind: 'payment', id: row.payment_id };
  if (row.origin === 'draft' && row.draft_id) return { kind: 'draft', id: row.draft_id };
  if (row.origin === 'projection' && row.stage !== 'no_payment') return { kind: 'renew' };
  return undefined;
}

const COMPACT_GRID = { display: 'grid', gridTemplateColumns: 'minmax(11rem,1.25fr) minmax(10rem,1.2fr) minmax(8rem,1fr) minmax(9rem,1fr) minmax(10rem,1fr)', gap: '1rem' };

function QueueCard({ compact = false, row, asOf, showLocation, showStage, selected, onOpen, onSettingsSaved, refreshFailed, workflowAvailable, preferencesWritable, workflowWritesAvailable, batchSelected, showCheckboxes, onBatchToggle, feeExpanded, onToggleFee }: {
  compact?: boolean; row: BillingQueueRow; asOf: string; showLocation: boolean; showStage: boolean; selected: boolean;
  onOpen: (row: BillingQueueRow, trigger: HTMLButtonElement | null, action?: BillingRenewalAction) => void;
  onSettingsSaved: (preferences?: BillingPreferences) => void; refreshFailed: boolean; workflowAvailable: boolean; preferencesWritable: boolean; workflowWritesAvailable: boolean;
  batchSelected?: boolean; showCheckboxes?: boolean; onBatchToggle?: () => void;
  feeExpanded: boolean; onToggleFee: () => void;
}) {
  const feeButton = useRef<HTMLButtonElement | null>(null);
  const feePanelElement = useRef<HTMLDivElement | null>(null);
  const feeId = useId();
  const feeTarget = cardFeeMessageTarget(row);
  const primaryMessage = row.stage === 'send' && !!feeTarget;
  const [savedPreference, setSavedPreference] = useState<{ row: BillingQueueRow; value: BillingPreferences } | null>(null);
  const updatingPreference = savedPreference?.row === row;
  const controlsStale = updatingPreference || refreshFailed;
  const collection = collectionLabel(row, asOf);
  const enrollments = row.current_enrollments ?? [];
  const recordedMethod = updatingPreference ? savedPreference.value.payment_method
    : row.recorded_payment_method === undefined ? row.payment_method : row.recorded_payment_method;
  const savedMandate = updatingPreference ? savedPreference.value.mandate_ready : row.mandate_ready;
  function preferenceSaved(value: BillingPreferences) {
    const currentMethod = row.recorded_payment_method === undefined ? row.payment_method : row.recorded_payment_method;
    if (value.payment_method !== currentMethod || value.mandate_ready !== !!row.mandate_ready) setSavedPreference({ row, value });
    onSettingsSaved(value);
  }
  const differentCollectionMethod = row.payment_method !== null && row.payment_method !== recordedMethod;
  const nextEnrollment = row.origin === 'projection' || row.origin === 'draft';
  const firstEnrollment = row.origin === 'draft' && !row.enrollment_ids.length;
  const showCoverage = nextEnrollment || !enrollments.length;
  const showLessonCount = row.lesson_count !== null && (nextEnrollment || enrollments.length !== 1 || enrollments[0].sessions_remaining !== row.lesson_count);
  const feeKnown = row.total_fee !== null && row.amount_basis !== 'unknown';
  const isMultiple = row.payment_ids.length > 1 || (row.enrollment_ids.length > 1 && !row.payment_id);
  const note = row.stage === 'no_payment' || (row.stage === 'attention' && !row.issues.length) ? row.note : '';
  const status = STAGES.find(stage => stage.value === row.stage);
  const action = worklistAction(row);
  const actions = (<div className={cn("flex shrink-0 items-end gap-2", compact ? "flex-wrap justify-end" : "flex-col sm:flex-row")}>
          {(action || primaryMessage) && <Button data-open-details size="sm" variant="quiet" icon={Eye} onClick={event => onOpen(row, event.currentTarget)}>View</Button>}
          {primaryMessage ? <Button ref={feeButton} size="sm" icon={Copy} disabled={controlsStale} aria-expanded={feeExpanded} aria-controls={feeExpanded ? feeId : undefined} onClick={onToggleFee}>Fee message</Button> : <Button data-open-details={!action || undefined} size="sm" disabled={controlsStale} icon={action?.kind === 'renew' ? RefreshCw : undefined} onClick={event => onOpen(row, event.currentTarget, action)}>{actionLabel(row)}</Button>}
          {feeTarget && !primaryMessage && <Button ref={feeButton} size="sm" icon={Copy} aria-label="Copy fee message" title="Copy fee message" disabled={controlsStale} aria-pressed={feeExpanded} aria-expanded={feeExpanded} aria-controls={feeExpanded ? feeId : undefined}
            className={cn(feeExpanded && 'bg-tint')} onClick={onToggleFee}>Fee</Button>}
        </div>);
  return <article aria-label={`${row.student.student_name} renewal`} className={cn('overflow-hidden rounded-lg border border-line bg-paper transition-colors hover:border-line-strong', selected && 'ring-2 ring-primary ring-offset-2')}>
    <div className={cn("group cursor-pointer p-3", !compact && "sm:p-4")} onClick={event => {
      if (!event.currentTarget.contains(event.target as Node)) return;
      if (!(event.target as HTMLElement).closest('a,button,input,select,textarea,summary,label')) onOpen(row, event.currentTarget.querySelector<HTMLButtonElement>('[data-open-details]'));
    }}>
      {compact ? (<div style={COMPACT_GRID} className="items-start text-xs">
        <div className="flex items-start gap-3">
          <div className="flex w-4 shrink-0 justify-center pt-0.5">
            {onBatchToggle && <input type="checkbox" aria-label={`Select ${row.student.student_name}`} checked={!!batchSelected} disabled={controlsStale} onChange={onBatchToggle} className="h-4 w-4 shrink-0" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <StudentInfoBadges compact student={{ ...row.student, student_id: row.student.id, school_student_id: row.student.school_student_id ?? undefined, grade: row.student.grade ?? undefined, school: row.student.school ?? undefined, lang_stream: row.student.lang_stream ?? undefined, home_location: row.student.home_location ?? undefined }} nameHref={`/students/${row.student.id}`} showLocationPrefix={showLocation} />
          <div className="flex flex-wrap items-center gap-1.5"><BillingPaymentSettings studentId={row.student.id} presentation="badge" recordedMethod={recordedMethod} mandateReady={savedMandate} storageAvailable={workflowAvailable} canWrite={preferencesWritable} onSaved={preferenceSaved} />{showStage && status && <Badge tone={row.stage === 'awaiting_payment' ? 'warning' : 'neutral'}>{status.label}</Badge>}{row.overdue && <Badge tone="danger">Overdue</Badge>}</div>
          </div>
        </div>
        <div className="min-w-0 space-y-2">{enrollments.length ? enrollments.map(enrollment => <div key={enrollment.enrollment_id}><p>{enrollment.weekday || 'Day to confirm'} {enrollment.time_slot || 'Time to confirm'}</p><p className="text-ink-subtle">{enrollment.location || 'Branch to confirm'} · {enrollment.tutor_name}</p></div>) : <span className="text-ink-subtle">{firstEnrollment ? 'New enrollment' : 'Timetable to review'}</span>}</div>
        <div className="min-w-0 space-y-2">{enrollments.map(enrollment => <div key={enrollment.enrollment_id} className="space-y-1">
          {enrollment.effective_end_date && <p>{enrollment.effective_end_date < asOf ? 'Expired' : 'Expires'} {formatShortDate(enrollment.effective_end_date)}</p>}
          <p className="text-ink-subtle">{plural(enrollment.sessions_remaining, 'session')} remaining</p>
          {enrollment.last_paid_original_date && enrollment.last_paid_original_date !== enrollment.effective_end_date && <p className="text-ink-subtle">Last paid session: {formatShortDate(enrollment.last_paid_original_date)}</p>}
          {enrollment.payment_status !== 'Paid' && <Badge tone="warning">{enrollment.payment_status === 'Pending Payment' ? 'Unpaid' : enrollment.payment_status}</Badge>}
        </div>)}</div>
        <div className="min-w-0 space-y-1">{updatingPreference ? <p role="status" className="text-ink-subtle">Updating enrollment…</p> : <>{row.first_lesson_date && row.coverage_through && <p>{formatShortDate(row.first_lesson_date)} to {formatShortDate(row.coverage_through)}</p>}{row.lesson_count !== null && <p className="text-ink-subtle">{plural(row.lesson_count, 'session')}</p>}{feeKnown ? <p className="font-semibold">{formatMOP(row.total_fee!, 0)}{row.amount_basis === 'tuition_only' && <span className="font-normal text-ink-subtle"> tuition estimate</span>}</p> : <p className="text-ink-subtle">Fee to review</p>}{differentCollectionMethod && <p>Collection <PaymentMethodBadge method={row.payment_method} /></p>}</>}</div>
        <div className="min-w-0 space-y-2">{actions}{collection && <p className={cn('text-right', row.urgency === 'now' || row.overdue ? 'text-red-700 dark:text-red-300' : 'text-ink-subtle')}>{collection}</p>}</div>
      </div>) : <>      <div className="flex items-start justify-between gap-3">
        {onBatchToggle && <div onClick={event => { event.stopPropagation(); if (!controlsStale) onBatchToggle(); }} className={cn(
          'flex items-center justify-center transition-opacity -m-2 p-2 pt-2.5 [@media(pointer:coarse)]:-m-3 [@media(pointer:coarse)]:p-3 [@media(pointer:coarse)]:pt-3.5',
          !showCheckboxes && '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        )}><input type="checkbox" aria-label={`Select ${row.student.student_name}`} checked={!!batchSelected} disabled={controlsStale} onChange={() => {}}
          className="h-4 w-4 rounded border-gray-300 text-accent-ink focus:ring-primary cursor-pointer" /></div>}
        <div className="min-w-0 flex-1 space-y-2">
          <StudentInfoBadges student={{ ...row.student, student_id: row.student.id, school_student_id: row.student.school_student_id ?? undefined, grade: row.student.grade ?? undefined, school: row.student.school ?? undefined, lang_stream: row.student.lang_stream ?? undefined, home_location: row.student.home_location ?? undefined }} nameHref={`/students/${row.student.id}`} showLocationPrefix={showLocation} />
          {enrollments.map(enrollment => <div key={enrollment.enrollment_id} className="space-y-1 text-xs">
            <p className="text-sm text-foreground/70">{enrollment.weekday || 'Day to confirm'} {enrollment.time_slot || 'Time to confirm'} @ {enrollment.location || 'Branch to confirm'}<span className="ml-2 hidden text-xs text-ink-subtle sm:inline">with {enrollment.tutor_name}</span></p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-subtle">
              {enrollment.effective_end_date && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{enrollment.effective_end_date < asOf ? 'Expired' : 'Expires'} {formatShortDate(enrollment.effective_end_date)}</span>}
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{plural(enrollment.sessions_remaining, 'session')} remaining</span>
              {enrollment.last_paid_original_date && enrollment.last_paid_original_date !== enrollment.effective_end_date && <span>Last paid session: {formatShortDate(enrollment.last_paid_original_date)}</span>}
              {enrollment.payment_status !== 'Paid' && <Badge tone="warning">{enrollment.payment_status === 'Pending Payment' ? 'Unpaid' : enrollment.payment_status}</Badge>}
            </div>
          </div>)}
          <div className="flex flex-wrap items-center gap-2"><BillingPaymentSettings studentId={row.student.id} presentation="badge" recordedMethod={recordedMethod} mandateReady={savedMandate} storageAvailable={workflowAvailable} canWrite={preferencesWritable} onSaved={preferenceSaved} />{showStage && status && <Badge tone={row.stage === 'attention' ? 'danger' : row.stage === 'awaiting_payment' ? 'warning' : row.stage === 'send' ? 'info' : 'neutral'}><status.icon className="h-3 w-3" aria-hidden="true" />{status.label}</Badge>}{row.overdue && <Badge tone="danger">Overdue</Badge>}</div>
        </div>
        {actions}
      </div>
      {updatingPreference && <p role="status" className="mt-3 border-t border-line pt-2 text-xs text-ink-subtle">{refreshFailed ? 'Refresh this enrollment to continue.' : 'Updating enrollment…'}</p>}
      {!updatingPreference && ((showCoverage && row.first_lesson_date && row.coverage_through) || collection || showLessonCount || feeKnown || differentCollectionMethod) && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs">
        {showCoverage && row.first_lesson_date && row.coverage_through && <span><span className="font-medium">{firstEnrollment ? 'Enrollment' : nextEnrollment ? 'Renewal' : 'Payment'}: </span>{formatShortDate(row.first_lesson_date)} to {formatShortDate(row.coverage_through)}</span>}
        {showLessonCount && <span>{plural(row.lesson_count!, 'session')}</span>}
        {feeKnown && <span className="font-medium">{formatMOP(row.total_fee!, 0)}{row.amount_basis === 'tuition_only' && <span className="font-normal text-ink-subtle"> tuition estimate</span>}</span>}
        {differentCollectionMethod && <span className="inline-flex items-center gap-1">Collection <PaymentMethodBadge method={row.payment_method} /></span>}
        {collection && <span className={cn(row.urgency === 'now' || row.overdue ? 'text-red-700 dark:text-red-300' : row.urgency === 'week' ? 'text-orange-700 dark:text-orange-400' : 'text-ink-subtle')}>{collection}</span>}
      </div>}</>}
    </div>
    {!updatingPreference && (note || row.issues.length > 0 || isMultiple) && <div className="space-y-2 border-t border-line px-3 py-2 sm:px-4">
      {note && <p className="text-xs text-ink-subtle">{note}</p>}
      {row.issues.length > 0 && <BillingChecks issues={row.issues} compact maxVisible={1} />}
      {isMultiple && <details className="text-xs"><summary className="cursor-pointer text-accent-ink">Linked payments and enrollments</summary><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {row.payment_ids.map((paymentId, index) => <Button key={paymentId} size="sm" variant="quiet" onClick={event => onOpen(row, event.currentTarget, { kind: 'payment', id: paymentId })}>Payment {index + 1}</Button>)}
        {row.enrollment_ids.map(enrollmentId => <Link key={enrollmentId} className="text-accent-ink hover:underline" href={`/enrollments/${enrollmentId}`}>Enrollment #{enrollmentId}</Link>)}
      </div></details>}
    </div>}
    <AnimatePresence>{feeExpanded && feeTarget && <motion.div ref={feePanelElement} id={feeId} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} onAnimationComplete={() => {
      // A quick copy can finish before the card has finished expanding.
      if (feeButton.current?.getAttribute('aria-expanded') !== 'true') return;
      const feedback = feePanelElement.current?.querySelector<HTMLElement>('[data-billing-copy-feedback]');
      feedback?.closest<HTMLElement>('[data-billing-copy-actions]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }}>
      <BillingCardFeeMessage expectsUnsent={row.stage === 'send'} canWrite={workflowWritesAvailable} target={feeTarget} onClose={() => { onToggleFee(); requestAnimationFrame(() => feeButton.current?.focus()); }} onChanged={onSettingsSaved} />
    </motion.div>}</AnimatePresence>
  </article>;
}

export function BillingRenewalQueue({ initialStage = 'all', initialCollectionMonth = '', onShowLegacy, onShowTaught }: {
  initialStage?: BillingQueueView;
  initialCollectionMonth?: string;
  onShowLegacy: () => void;
  onShowTaught: () => void;
}) {
  usePageTitle('Enrollment renewals');
  const auth = useAuth();
  const { selectedLocation } = useLocation();
  const location = selectedLocation === 'All Locations' ? undefined : selectedLocation;
  const enabled = !!auth.user && !auth.isLoading && auth.canViewAdminPages;
  const tutorId = billingDraftTutorId(auth);
  const { mutate: refreshCache } = useSWRConfig();
  const receiptScope = JSON.stringify([billingDraftAuthScope(auth), location, tutorId]);
  const receiptCount = useSWR(enabled ? ['billing-receipts-count', receiptScope] : null, () => billingAPI.receiptCount({ location, tutor_id: tutorId }), { keepPreviousData: false });
  const [stage, setStage] = useState<Exclude<BillingQueueView, 'attention'>>(initialStage === 'attention' ? 'prepare' : initialStage);
  const [preparationFilter, setPreparationFilter] = useState<'all' | 'checking'>(initialStage === 'attention' ? 'checking' : 'all');
  const [collapsed, setCollapsed] = useState<Set<BillingQueueUrgency>>(() => new Set());
  const [month, setMonth] = useState(initialCollectionMonth);
  const [sort, setSort] = useState<'expiry' | 'student_id'>('expiry');
  const queueSort = stage === 'prepare' ? sort : undefined;
  const needsChecking = stage === 'prepare' && preparationFilter === 'checking' ? true : undefined;
  const [weekday, setWeekday] = useState<BillingWeekday | ''>('');
  const [timeSlot, setTimeSlot] = useState('');
  const [expiresFrom, setExpiresFrom] = useState('');
  const [expiresTo, setExpiresTo] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const relatedTrigger = useRef<HTMLButtonElement>(null);
  const [display, setDisplay] = useState<'compact' | 'cards'>('compact');
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const filters: BillingQueueFilters = { weekday: weekday || undefined, time_slot: timeSlot || undefined,
    expires_from: expiresFrom || undefined, expires_to: expiresTo || undefined };
  const filtersInvalid = !!expiresFrom && !!expiresTo && expiresFrom > expiresTo;
  const compact = desktop && display === 'compact';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250).trim();
  const searchPending = search.trim() !== debouncedSearch;
  const scope = JSON.stringify([billingDraftAuthScope(auth), location, tutorId, month, stage, debouncedSearch, queueSort, needsChecking, filters]);
  const workspaceTrigger = useRef<HTMLButtonElement | null>(null);
  type NavigationItem = { key: string; student_id: number };
  const [workspace, setWorkspace] = useState<{ scope: string; row: BillingQueueRow; action?: BillingRenewalAction; navigation: NavigationItem[]; index: number; collectionMonth: string } | null>(null);
  const [navigationBusy, setNavigationBusy] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [navigationEnd, setNavigationEnd] = useState(false);
  const navigationRequest = useRef<AbortController | null>(null);
  const selectedWorkspace = workspace?.scope === scope ? workspace : null;
  useEffect(() => {
    navigationRequest.current?.abort(); setNavigationBusy(false); setNavigationError(''); setNavigationEnd(false);
    setWorkspace(current => current && current.scope !== scope ? null : current);
    return () => navigationRequest.current?.abort();
  }, [scope]);
  const batchScope = JSON.stringify([scope, search.trim(), auth.isReadOnly]);
  const [selection, setSelection] = useState<{ scope: string; rows: BillingQueueRow[] }>({ scope: '', rows: [] });
  const [batchOpen, setBatchOpen] = useState<string | null>(null);
  const [paymentBatch, setPaymentBatch] = useState<{ scope: string; action: PaymentBatchAction; targets: PaymentBatchTarget[] } | null>(null);
  const batchTrigger = useRef<HTMLButtonElement | null>(null);
  const selectedRows = selection.scope === batchScope ? selection.rows : [];
  const selectionAction = selectedRows.length ? canBatchRenew(selectedRows[0]) ? 'renew' : queuePaymentBatchAction(selectedRows[0]) : null;
  const canSelect = auth.isAdmin && !auth.isReadOnly;
  useEffect(() => {
    setSelection(previous => previous.scope === batchScope ? previous : { scope: batchScope, rows: [] });
    setBatchOpen(previous => previous === batchScope ? previous : null);
    setPaymentBatch(previous => previous?.scope === batchScope ? previous : null);
  }, [batchScope]);
  const { data: options } = useSWR(enabled ? 'billing-preview-options' : null, billingAPI.options);
  const [page, setPage] = useState({ scope: '', offset: 0 });
  const offset = page.scope === scope ? page.offset : 0;
  const feeScope = JSON.stringify([scope, search.trim(), offset]);
  const [feePanel, setFeePanel] = useState<{ scope: string; key: string } | null>(null);
  useEffect(() => { setFeePanel(previous => previous?.scope === feeScope ? previous : null); }, [feeScope]);
  const limit = 25;
  const refreshInterval = useVisibilityAwareInterval(60000);
  const countsScope = JSON.stringify([billingDraftAuthScope(auth), location, tutorId, month, filters]);
  const counts = useSWR<BillingQueueCounts>(
    enabled && !filtersInvalid ? ['renewal-queue-counts', countsScope] : null,
    () => billingAPI.queueCounts({ collection_month: month || undefined, location, tutor_id: tutorId, ...filters }),
    { keepPreviousData: false, refreshInterval },
  );
  const stageCounts = !filtersInvalid && !counts.error && counts.data && (!month || counts.data.collection_month === month) ? counts.data : undefined;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    enabled && !filtersInvalid && stage !== 'receipts' ? ['billing-renewal-queue', scope, offset] : null,
    () => billingAPI.queue({ collection_month: month || undefined, stage: stage === 'all' || stage === 'receipts' ? undefined : stage, sort: queueSort, needs_checking: needsChecking, search: debouncedSearch || undefined, location, tutor_id: tutorId, offset, limit, ...filters }),
    { keepPreviousData: false, refreshInterval },
  );
  const { data: waitingTaught } = useUnlistedWaitingCount(enabled, location);
  const current = stage !== 'receipts' && !searchPending && !filtersInvalid ? data : undefined;
  const selectedKeys = new Set(selectedRows.map(row => row.key));
  const listPanel = useRef<HTMLElement | null>(null);
  const tabId = useId();
  const tabBar = useRef<HTMLDivElement>(null);
  const serverMonth = useRef('');
  if (stageCounts?.collection_month) serverMonth.current = stageCounts.collection_month;
  else if (data?.collection_month) serverMonth.current = data.collection_month;
  const countsReady = stage === 'receipts' ? !!receiptCount.data : stageCounts !== undefined;
  useEffect(() => {
    const bar = tabBar.current;
    const selected = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!bar || !selected) return;
    const parent = bar.getBoundingClientRect(); const tab = selected.getBoundingClientRect();
    if (tab.right > parent.right) bar.scrollLeft += tab.right - parent.right + 12;
    else if (tab.left < parent.left) bar.scrollLeft -= parent.left - tab.left + 12;
  }, [stage, countsReady, stageCounts, receiptCount.data?.count]);

  useEffect(() => {
    const tabs = tabBar.current;
    if (!tabs) return;
    // LayoutShell scrolls main beneath the phone navigation. Reserve the
    // sticky tabs' height there so keyboard focus and scrollIntoView stay visible.
    const scroller = tabs.closest('main') ?? document.scrollingElement as HTMLElement | null;
    if (!scroller) return;
    const previous = scroller.style.getPropertyValue('scroll-padding-top');
    const priority = scroller.style.getPropertyPriority('scroll-padding-top');
    const minimum = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0;
    let applied = '';
    const update = () => {
      applied = `${Math.max(minimum, Math.ceil(tabs.getBoundingClientRect().height) + 8)}px`;
      scroller.style.setProperty('scroll-padding-top', applied);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(tabs);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      if (scroller.style.getPropertyValue('scroll-padding-top') === applied) {
        if (previous) scroller.style.setProperty('scroll-padding-top', previous, priority);
        else scroller.style.removeProperty('scroll-padding-top');
      }
    };
  }, [enabled, auth.isLoading]);

  const timeSlots = data?.time_slots ?? [];
  const pageCount = Math.max(1, Math.ceil((current?.total ?? 0) / limit));
  useEffect(() => {
    if (current && offset > 0 && offset >= current.total) setPage({ scope, offset: Math.max(0, (Math.ceil(current.total / limit) - 1) * limit) });
  }, [current, offset, scope]);

  function closeWorkspace() {
    navigationRequest.current?.abort(); setWorkspace(null); setNavigationBusy(false); setNavigationError('');
  }
  function openWorkspace(row: BillingQueueRow, trigger: HTMLButtonElement | null, action?: BillingRenewalAction) {
    navigationRequest.current?.abort(); setNavigationBusy(false); setNavigationError(''); setNavigationEnd(false);
    workspaceTrigger.current = trigger;
    const seen = new Set<number>();
    const navigation = (current?.navigation ?? current?.rows.map(value => ({ key: value.key, student_id: value.student.id })) ?? [])
      .filter(value => { if (seen.has(value.student_id)) return false; seen.add(value.student_id); return true; });
    setWorkspace({ scope, row, action, navigation, collectionMonth: current?.collection_month || month || serverMonth.current, index: Math.max(0, navigation.findIndex(value => value.student_id === row.student.id)) });
  }
  async function nextStudent() {
    if (!selectedWorkspace || navigationBusy) return;
    const active = selectedWorkspace;
    const candidates = active.navigation.slice(active.index + 1);
    if (!candidates.length) return;
    const controller = new AbortController(); navigationRequest.current?.abort(); navigationRequest.current = controller;
    setNavigationBusy(true); setNavigationError('');
    let candidate = candidates[0];
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await billingAPI.queue({ collection_month: active.collectionMonth || undefined,
          stage: stage === 'all' || stage === 'receipts' ? undefined : stage, sort: queueSort, needs_checking: needsChecking,
          search: debouncedSearch || undefined, location, tutor_id: tutorId, ...filters, row_key: candidate.key, offset: 0, limit: 1 }, controller.signal);
        if (controller.signal.aborted) return;
        const row = result.rows.find(value => value.student.id === candidate.student_id);
        if (row) {
          setWorkspace(previous => previous === active ? { ...active, row, action: worklistAction(row),
            index: active.navigation.findIndex(value => value.student_id === row.student.id) } : previous);
          setNavigationEnd(false); return;
        }
        // The next task may have changed stage while this student was open.
        // Use the fresh scoped keys, rather than an offset shifted by removals.
        const live = new Map(result.navigation?.map(value => [value.student_id, value.key]) ?? []);
        const remaining = candidates.find(value => live.has(value.student_id));
        if (!remaining) { setNavigationEnd(true); setNavigationError('No more students remain in this worklist.'); return; }
        candidate = { ...remaining, key: live.get(remaining.student_id)! };
      }
      throw new Error('The worklist changed. Close and refresh it before continuing.');
    } catch (error) {
      if (!controller.signal.aborted) setNavigationError(error instanceof Error ? error.message : 'Could not load the next student. Try again.');
    } finally { if (!controller.signal.aborted) setNavigationBusy(false); }
  }

  function refreshQueue(preferences?: BillingPreferences) {
    if (preferences) setSelection(previous => ({ ...previous, rows: previous.rows.filter(row => row.student.id !== preferences.student_id) }));
    void invalidateRenewalQueueCache(refreshCache);
  }
  function selectStage(next: Exclude<BillingQueueView, 'attention'>) { setStage(next); }
  function selectable(row: BillingQueueRow) {
    const action = canBatchRenew(row) ? 'renew' : queuePaymentBatchAction(row);
    return !error && !!action && (!selectionAction || selectionAction === action);
  }
  function toggleBatch(row: BillingQueueRow) {
    setSelection({ scope: batchScope, rows: selectedKeys.has(row.key) ? selectedRows.filter(value => value.key !== row.key) : [...selectedRows, row] });
  }
  function toggleSection(rows: BillingQueueRow[]) {
    const eligible = rows.filter(selectable);
    const sectionKeys = new Set(eligible.map(row => row.key));
    const allChecked = eligible.every(row => selectedKeys.has(row.key));
    setSelection({ scope: batchScope, rows: allChecked ? selectedRows.filter(row => !sectionKeys.has(row.key))
      : [...selectedRows, ...eligible.filter(row => !selectedKeys.has(row.key))] });
  }
  function closeBatch(items?: BillingBatchItem[]) {
    setBatchOpen(null);
    const results = new Map(items?.map(item => [item.row.key, item]));
    const latest = new Map(current?.rows.map(row => [row.key, row]));
    const retained = selectedRows.flatMap(row => {
      const item = results.get(row.key);
      if (item?.outcome?.kind === 'created' || item?.draft?.confirmed_payment_id) return [];
      if (item?.draft) return [{ ...row, origin: 'draft' as const, draft_id: item.draft.id }];
      const fresh = latest.get(row.key);
      return fresh ? canBatchRenew(fresh) ? [fresh] : [] : [row];
    });
    setSelection({ scope: batchScope, rows: retained });
    if (!retained.length) requestAnimationFrame(() => listPanel.current?.focus());
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = VIEWS.map(item => item.value);
    const currentIndex = tabs.indexOf(stage);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    selectStage(next); document.getElementById(`${tabId}-${next}-tab`)?.focus();
  }

  const classFilterCount = Number(!!weekday) + Number(!!timeSlot) + Number(!!(expiresFrom || expiresTo));
  const activeFilters = [
    ...(stage !== 'receipts' && weekday ? [{ key: 'day', label: `Day: ${weekday}`, clear: () => { setWeekday(''); setTimeSlot(''); } }] : []),
    ...(stage !== 'receipts' && timeSlot ? [{ key: 'time', label: `Time: ${timeSlot}`, clear: () => setTimeSlot('') }] : []),
    ...(stage !== 'receipts' && (expiresFrom || expiresTo) ? [{ key: 'expiry', label: `Expiry: ${expiresFrom ? formatShortDate(expiresFrom) : 'Any start'} to ${expiresTo ? formatShortDate(expiresTo) : 'Any end'}`, clear: () => { setExpiresFrom(''); setExpiresTo(''); } }] : []),
    ...(search.trim() ? [{ key: 'search', label: `Search: ${search.trim()}`, clear: () => setSearch('') }] : []),
  ];

  if (auth.isLoading) return <p className="p-6">Loading staff access…</p>;
  if (!enabled) return <p className="p-6">Admin access is required to review enrollment renewals.</p>;

  return <PageSurface><div className={cn('w-full min-w-0 space-y-4 p-4 sm:p-6 xl:p-8', selectedRows.length > 0 && 'pb-28 sm:pb-28 xl:pb-28')}>
    <PageHeader className="mb-0" title="Enrollment renewals" icon={RefreshCw} titleExtra={auth.isReadOnly && <Badge>Read-only</Badge>} actions={
      <div role="group" aria-label="Renewal header controls" className={cn('flex items-center', desktop ? 'gap-2' : 'rounded-md border border-line bg-field-fill')}>
        {!desktop && stage !== 'receipts' && <RenewalCollectionMonth id={`${tabId}-month`} value={month || serverMonth.current} onChange={setMonth} grouped />}
        {!desktop && stage !== 'receipts' && <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />}
        {desktop ? <nav aria-label="Related billing pages" className="flex items-center gap-1">
          <Link href={`/admin/autopay${month || serverMonth.current ? `?collection_month=${month || serverMonth.current}` : ''}`} className={buttonClasses({ size: 'sm', variant: 'quiet' })}><Landmark className="h-3.5 w-3.5" aria-hidden="true" />Autopay list</Link>
          <Link href="/billing" className={buttonClasses({ size: 'sm', variant: 'quiet' })}><CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />Payment plans</Link>
        </nav> : <DropdownMenu align="right" menuClassName="bg-paper dark:bg-paper border-line dark:border-line" trigger={({ triggerProps }) => <Button {...triggerProps} ref={relatedTrigger} aria-label="Related pages" variant="quiet" size="sm" className="rounded-none pointer-coarse:after:inset-x-0"><span className="sm:hidden">Pages</span><span className="hidden sm:inline">Related pages</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></Button>}>
          {close => <RenewalMenuItems close={close} trigger={relatedTrigger}>
            <Link role="menuitem" href={`/admin/autopay${month || serverMonth.current ? `?collection_month=${month || serverMonth.current}` : ''}`} className={renewalMenuItemClass} onClick={close}><Landmark className="h-4 w-4" aria-hidden="true" />Autopay list</Link>
            <Link role="menuitem" href="/billing" className={renewalMenuItemClass} onClick={close}><CalendarRange className="h-4 w-4" aria-hidden="true" />Payment plans</Link>
          </RenewalMenuItems>}
        </DropdownMenu>}
        {!desktop && <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />}
        <RenewalTools grouped={!desktop} canManage={auth.isAdmin && !auth.isReadOnly} scope={billingDraftAuthScope(auth)} couponStorage={!!options?.coupon_storage_available}
          couponWrites={!!options?.coupon_writes_available} waitingCount={waitingTaught?.count} onShowLegacy={onShowLegacy} onShowTaught={onShowTaught} />
      </div>
    }>
      {desktop && stage !== 'receipts' && <RenewalCollectionMonth id={`${tabId}-month`} value={month || serverMonth.current} onChange={setMonth} showLabel />}
    </PageHeader>
    <div ref={tabBar} role="tablist" aria-label="Renewal stages" style={{ background: 'var(--surface-bar-fill)' }} className="sticky top-0 z-30 flex gap-4 overflow-x-auto border-b border-line pt-2">
      {VIEWS.map(item => <button key={item.value} type="button" role="tab" id={`${tabId}-${item.value}-tab`} aria-controls={`${tabId}-panel`} aria-selected={stage === item.value} tabIndex={stage === item.value ? 0 : -1} onKeyDown={keyDown} onClick={() => selectStage(item.value)} className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', stage === item.value ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle', item.value === 'no_payment' && 'ml-auto')}>
        <item.icon className={cn('h-4 w-4', item.colour)} aria-hidden="true" />{item.label}{' '}{item.value === 'receipts' ? receiptCount.data?.storage_available && !receiptCount.error ? <Badge>{receiptCount.data.count}</Badge> : null : stageCounts && <Badge>{item.value === 'all' ? stageCounts.total - stageCounts.no_payment : stageCounts[item.value]}</Badge>}
      </button>)}
    </div>
    <div className="space-y-3" role="region" aria-label="Renewal filters">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Find a student" id={`${tabId}-search`} className="min-w-0 flex-1 sm:max-w-sm"><Input value={search} placeholder="Name or student number" onChange={event => setSearch(event.target.value)} /></Field>
        {!desktop && stage !== 'receipts' && <Button icon={SlidersHorizontal} aria-expanded={mobileFiltersOpen} aria-controls={`${tabId}-class-filters`} onClick={() => setMobileFiltersOpen(value => !value)}>Filters{' '}{classFilterCount > 0 && <Badge>{classFilterCount}</Badge>}</Button>}
        {stage !== 'receipts' && (desktop || mobileFiltersOpen) && <div id={`${tabId}-class-filters`} className={cn('flex flex-wrap items-end gap-3', !desktop && 'w-full rounded-lg border border-line bg-paper p-3')}>
          <div className="flex flex-wrap items-end gap-3"><Field label="Day" id={`${tabId}-weekday`} className="w-32"><Select value={weekday} onChange={event => { setWeekday(event.target.value as BillingWeekday | ''); setTimeSlot(''); }}><option value="">All days</option>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <option key={day}>{day}</option>)}</Select></Field>
          <Field label="Time slot" id={`${tabId}-time`} className="w-44"><Select value={timeSlot} onChange={event => setTimeSlot(event.target.value)}><option value="">All times</option>{timeSlots.map(time => <option key={time}>{time}</option>)}</Select></Field></div>
          <RenewalExpiryFilter from={expiresFrom} through={expiresTo} today={data?.as_of} onChange={(from, through) => { setExpiresFrom(from); setExpiresTo(through); }} />
        </div>}
      </div>
      {activeFilters.length > 0 && <div aria-label="Applied renewal filters" className="flex flex-wrap items-center gap-2">
        {activeFilters.map(filter => <Button key={filter.key} size="sm" className="max-w-full rounded-full bg-tint" aria-label={`Remove ${filter.label} filter`} onClick={filter.clear}><span className="truncate">{filter.label}</span><X className="h-3 w-3 shrink-0" aria-hidden="true" /></Button>)}
        <Button size="sm" variant="quiet" onClick={() => { setWeekday(''); setTimeSlot(''); setExpiresFrom(''); setExpiresTo(''); setSearch(''); if (stage === 'prepare') setPreparationFilter('all'); }}>Clear filters</Button>
      </div>}
    </div>
    {filtersInvalid && stage !== 'receipts' && <p role="alert" className="text-sm text-red-700 dark:text-red-300">The expiry start date must be on or before the end date.</p>}
    {stage !== 'receipts' && <div className="flex flex-wrap items-center justify-between gap-3" role="region" aria-label="Renewal results controls">
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-xs text-ink-subtle">{searchPending || !current ? 'Updating results…' : `${plural(current.total, stage === 'all' ? 'task' : 'student')}${activeFilters.length || needsChecking ? ' matching filters' : ''}${location ? ` · ${location}` : ''}`}</p>
        {stage === 'prepare' && <Button size="sm" variant="quiet" aria-pressed={preparationFilter === 'checking'} className={cn(preparationFilter === 'checking' && 'bg-tint ring-1 ring-line-strong')} onClick={() => setPreparationFilter(value => value === 'all' ? 'checking' : 'all')}>Needs checking</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {stage === 'prepare' && <div className="flex items-center gap-2"><label htmlFor={`${tabId}-sort`} className="shrink-0 text-xs text-ink-subtle">Sort by</label><Select id={`${tabId}-sort`} size="sm" className="w-32" value={sort} onChange={event => setSort(event.target.value as 'expiry' | 'student_id')}><option value="expiry">Expiry date</option><option value="student_id">Student ID</option></Select></div>}
        {desktop && <Segmented label="Renewal display" value={display} onChange={setDisplay} options={[{ value: 'compact', label: 'Compact', icon: List }, { value: 'cards', label: 'Cards', icon: LayoutGrid }]} />}
      </div>
    </div>}
    {counts.error && <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle"><span>Tab counts unavailable.</span><Button size="sm" variant="quiet" onClick={() => { void counts.mutate(); }}>Retry counts</Button></div>}
    <section ref={listPanel} tabIndex={-1} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${stage}-tab`} aria-busy={isValidating || searchPending} className="space-y-3 outline-none">
      {stage === 'receipts' && <BillingReceiptsQueue location={location} tutorId={tutorId} search={debouncedSearch} searchPending={searchPending} />}
      {stage !== 'receipts' && (isLoading || searchPending) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading renewals…</p>}
      {stage !== 'receipts' && error && !searchPending && <div role="alert" className="rounded border border-red-300 p-4 text-sm"><p>{error instanceof Error ? error.message : 'Could not load enrollment renewals.'}</p>{data && <p className="mt-1 text-xs">These records could not be refreshed. Retry before continuing.</p>}<Button size="sm" className="mt-2" onClick={() => mutate()}>Retry</Button></div>}
      {current && <>
        {compact && current.rows.length > 0 && <div style={COMPACT_GRID} className="border-b border-line px-3 pb-2 text-xs font-medium text-ink-subtle" aria-hidden="true"><span className="pl-7">Student</span><span>Class</span><span>Current coverage</span><span>Next period & fee</span><span className="text-right">Action</span></div>}
        {current.rows.length ? URGENCY_GROUPS.map(group => {
          const rows = current.rows.filter(row => (row.stage === 'no_payment' ? 'later' : row.urgency ?? 'check_dates') === group.value);
          if (!rows.length) return null;
          const selectableRows = canSelect ? rows.filter(selectable) : [];
          return <CollapsibleSection key={group.value} id={`${tabId}-urgency-${group.value}`} label={group.label} colorTheme={group.colour}
            showCheckbox={selectedRows.length > 0 && selectableRows.length > 0} isAllChecked={selectableRows.length > 0 && selectableRows.every(row => selectedKeys.has(row.key))}
            isSomeChecked={selectableRows.some(row => selectedKeys.has(row.key))} onCheckboxClick={event => { event.stopPropagation(); toggleSection(rows); }}
            annotation={selectedRows.length > 0 && selectableRows.length > 0 && (current.urgency_counts?.[group.value] ?? rows.length) > rows.length ? `${rows.length} on this page` : undefined}
            count={current.urgency_counts?.[group.value] ?? rows.length} isCollapsed={collapsed.has(group.value)} onToggle={() => setCollapsed(previous => {
              const next = new Set(previous); if (next.has(group.value)) next.delete(group.value); else next.add(group.value); return next;
            })}>
            {rows.map(row => <QueueCard key={`${scope}:${row.key}`} compact={compact} row={row} asOf={current.as_of} showLocation={selectedLocation === 'All Locations'} showStage={stage === 'all'} selected={selectedWorkspace?.row.key === row.key}
              workflowAvailable={!!options?.workflow_available} workflowWritesAvailable={!!options?.workflow_writes_available} preferencesWritable={!!options?.preferences_writes_available} refreshFailed={!!error} onSettingsSaved={refreshQueue}
              batchSelected={selectedKeys.has(row.key)} showCheckboxes={selectedRows.length > 0} onBatchToggle={canSelect && selectable(row) ? () => toggleBatch(row) : undefined}
              feeExpanded={feePanel?.scope === feeScope && feePanel.key === row.key} onToggleFee={() => setFeePanel(previous => previous?.scope === feeScope && previous.key === row.key ? null : { scope: feeScope, key: row.key })}
              onOpen={openWorkspace} />)}
          </CollapsibleSection>;
        }) : <p className="rounded border border-line p-5 text-sm">{debouncedSearch ? 'No students match this search.' : EMPTY[stage]}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-ink-subtle">{current.total ? `${current.offset + 1}–${Math.min(current.offset + current.rows.length, current.total)} of ${plural(current.total, stage === 'all' ? 'task' : 'student')}` : stage === 'all' ? '0 tasks' : '0 students'}</p><RenewalPagination key={`${scope}:${pageCount}`} page={Math.min(pageCount, Math.floor(offset / limit) + 1)} pages={pageCount} disabled={isValidating || searchPending} onPage={number => setPage({ scope, offset: (number - 1) * limit })} /></div>
      </>}
    </section>
    <AnimatePresence>{canSelect && selectedRows.length > 0 && <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-[calc(1rem+var(--app-bottom-inset))] sm:bottom-[calc(1.5rem+var(--app-bottom-inset))] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-foreground">{selectedRows.length} selected</span>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
        <Button ref={batchTrigger} variant="primary" icon={selectionAction === 'sent' ? Send : selectionAction === 'paid' ? CreditCard : RefreshCw} disabled={!options || searchPending || !!error} onClick={() => {
          setWorkspace(null);
          if (selectionAction === 'renew') setBatchOpen(batchScope);
          else if (selectionAction) setPaymentBatch({ scope: batchScope, action: selectionAction, targets: selectedRows.map(paymentBatchTarget) });
        }}>{selectionAction === 'sent' ? 'Mark messages sent' : selectionAction === 'paid' ? 'Record payments' : 'Batch renew'}</Button>
        <IconButton icon={X} label="Clear selection" onClick={() => setSelection({ scope: batchScope, rows: [] })} />
      </div>
    </motion.div>}</AnimatePresence>
    {selectedWorkspace && <BillingRenewalWorkspace key={scope} row={selectedWorkspace.row} initialAction={selectedWorkspace.action} trigger={workspaceTrigger} onClose={closeWorkspace} onChanged={() => refreshQueue()}
      onNext={nextStudent} nextAvailable={!navigationEnd && selectedWorkspace.index + 1 < selectedWorkspace.navigation.length} navigating={navigationBusy} navigationError={navigationError}
      position={selectedWorkspace.index + 1} worklistSize={selectedWorkspace.navigation.length} />}
    {canSelect && paymentBatch?.scope === batchScope && <BillingPaymentBatchModal key={batchScope} targets={paymentBatch.targets} action={paymentBatch.action}
      writesAvailable={!!options?.workflow_writes_available} trigger={batchTrigger} onChanged={() => refreshQueue()} onClose={completedIds => {
        setPaymentBatch(null);
        const completed = new Set(completedIds);
        setSelection({ scope: batchScope, rows: selectedRows.filter(row => !row.payment_id || !completed.has(row.payment_id)) });
        requestAnimationFrame(() => (batchTrigger.current ?? listPanel.current)?.focus());
      }} />}
    {canSelect && batchOpen === batchScope && options && <BillingBatchRenewModal key={batchScope} rows={selectedRows} options={options} trigger={batchTrigger}
      onClose={closeBatch} onChanged={() => refreshQueue()} />}
  </div></PageSurface>;
}
