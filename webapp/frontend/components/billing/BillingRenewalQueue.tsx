'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import useSWR, { useSWRConfig } from 'swr';
import { AlertCircle, CalendarCheck, CalendarRange, CheckCircle2, Clock, Copy, CreditCard, Eye, FilePenLine, History, Landmark, ListTodo, ReceiptText, RefreshCw, Send, UserPlus, X } from 'lucide-react';
import { Badge, Button, Field, IconButton, Input, PageHeader, buttonClasses } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
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
import type { BillingQueueRow, BillingQueueStage, BillingQueueUrgency } from '@/types/billing';
import { BillingChecks } from './BillingChecks';
import { billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingRenewalWorkspace } from './BillingRenewalWorkspace';
import { BillingBatchRenewModal } from './BillingBatchRenewModal';
import { BillingPaymentBatchModal } from './BillingPaymentBatchModal';
import { BillingCardFeeMessage, cardFeeMessageTarget } from './BillingCardFeeMessage';
import { BillingCouponImportButton } from './BillingCouponImport';
import { BillingReceiptsQueue } from './BillingReceiptsQueue';
import type { BillingRenewalAction } from './BillingRenewalPanel';

const STAGES = [
  { value: 'prepare', label: 'To prepare', icon: FilePenLine, colour: 'text-ink-subtle' },
  { value: 'send', label: 'To send', icon: Send, colour: 'text-blue-700 dark:text-blue-300' },
  { value: 'awaiting_payment', label: 'Awaiting payment', icon: CreditCard, colour: 'text-amber-800 dark:text-amber-300' },
  { value: 'attention', label: 'Needs attention', icon: AlertCircle, colour: 'text-red-700 dark:text-red-300' },
] as const;

export type BillingQueueView = 'all' | 'receipts' | BillingQueueStage;
const VIEWS = [{ value: 'all', label: 'All tasks', icon: ListTodo, colour: 'text-ink-subtle' }, ...STAGES.slice(0, 3), { value: 'receipts', label: 'KMS receipts', icon: ReceiptText, colour: 'text-ink-subtle' }, ...STAGES.slice(3), { value: 'no_payment', label: 'No payment this run', icon: CalendarCheck, colour: 'text-ink-subtle' }] as const;
const URGENCY_GROUPS = [
  { value: 'now', label: 'Needs action now', colour: 'red' },
  { value: 'week', label: 'This week', colour: 'orange' },
  { value: 'check_dates', label: 'Check dates', colour: 'purple' },
  { value: 'later', label: 'Later', colour: 'gray' },
] as const;

const EMPTY: Record<BillingQueueView, string> = {
  receipts: 'No KMS receipts are outstanding.',
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

function QueueCard({ row, asOf, showLocation, showStage, selected, onOpen, onSettingsSaved, workflowAvailable, preferencesWritable, batchSelected, showCheckboxes, onBatchToggle, feeExpanded, onToggleFee }: {
  row: BillingQueueRow; asOf: string; showLocation: boolean; showStage: boolean; selected: boolean;
  onOpen: (row: BillingQueueRow, trigger: HTMLButtonElement | null, action?: BillingRenewalAction) => void;
  onSettingsSaved: () => void; workflowAvailable: boolean; preferencesWritable: boolean;
  batchSelected?: boolean; showCheckboxes?: boolean; onBatchToggle?: () => void;
  feeExpanded: boolean; onToggleFee: () => void;
}) {
  const feeButton = useRef<HTMLButtonElement | null>(null);
  const feePanelElement = useRef<HTMLDivElement | null>(null);
  const feeId = useId();
  const feeTarget = cardFeeMessageTarget(row);
  const collection = collectionLabel(row, asOf);
  const enrollments = row.current_enrollments ?? [];
  const recordedMethod = row.recorded_payment_method === undefined ? row.payment_method : row.recorded_payment_method;
  const differentCollectionMethod = row.payment_method !== null && row.payment_method !== recordedMethod;
  const nextEnrollment = row.origin === 'projection' || row.origin === 'draft';
  const firstEnrollment = row.origin === 'draft' && !row.enrollment_ids.length;
  const showCoverage = nextEnrollment || !enrollments.length;
  const showLessonCount = row.lesson_count !== null && (nextEnrollment || enrollments.length !== 1 || enrollments[0].sessions_remaining !== row.lesson_count);
  const feeKnown = row.total_fee !== null && row.amount_basis !== 'unknown';
  const isMultiple = row.payment_ids.length > 1 || (row.enrollment_ids.length > 1 && !row.payment_id);
  const note = row.stage === 'no_payment' || (row.stage === 'attention' && !row.issues.length) ? row.note : '';
  const status = STAGES.find(stage => stage.value === row.stage);
  const action: BillingRenewalAction | undefined = row.origin === 'payment' && row.payment_id ? { kind: 'payment', id: row.payment_id }
    : row.origin === 'draft' && row.draft_id ? { kind: 'draft', id: row.draft_id }
    : row.origin === 'projection' && row.stage !== 'no_payment' ? { kind: 'renew' } : undefined;
  return <article aria-label={`${row.student.student_name} renewal`} className={cn('overflow-hidden rounded-lg border border-line bg-paper transition-colors hover:border-line-strong', selected && 'ring-2 ring-primary ring-offset-2')}>
    <div className="group cursor-pointer p-3 sm:p-4" onClick={event => {
      if (!event.currentTarget.contains(event.target as Node)) return;
      if (!(event.target as HTMLElement).closest('a,button,input,select,textarea,summary,label')) onOpen(row, event.currentTarget.querySelector<HTMLButtonElement>('[data-open-details]'));
    }}>
      <div className="flex items-start justify-between gap-3">
        {onBatchToggle && <div onClick={event => { event.stopPropagation(); onBatchToggle(); }} className={cn(
          'flex items-center justify-center transition-opacity -m-2 p-2 pt-2.5 [@media(pointer:coarse)]:-m-3 [@media(pointer:coarse)]:p-3 [@media(pointer:coarse)]:pt-3.5',
          !showCheckboxes && '[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        )}><input type="checkbox" aria-label={`Select ${row.student.student_name}`} checked={!!batchSelected} onChange={() => {}}
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
          <div className="flex flex-wrap items-center gap-2"><BillingPaymentSettings studentId={row.student.id} presentation="badge" recordedMethod={recordedMethod} mandateReady={row.mandate_ready} storageAvailable={workflowAvailable} canWrite={preferencesWritable} onSaved={onSettingsSaved} />{showStage && status && <Badge tone={row.stage === 'attention' ? 'danger' : row.stage === 'awaiting_payment' ? 'warning' : row.stage === 'send' ? 'info' : 'neutral'}><status.icon className="h-3 w-3" aria-hidden="true" />{status.label}</Badge>}{row.overdue && <Badge tone="danger">Overdue</Badge>}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
          {action && <Button data-open-details size="sm" variant="quiet" icon={Eye} onClick={event => onOpen(row, event.currentTarget)}>View</Button>}
          <Button data-open-details={!action || undefined} size="sm" icon={action?.kind === 'renew' ? RefreshCw : undefined} onClick={event => onOpen(row, event.currentTarget, action)}>{actionLabel(row)}</Button>
          {feeTarget && <Button ref={feeButton} size="sm" icon={Copy} aria-label="Copy fee message" title="Copy fee message" aria-pressed={feeExpanded} aria-expanded={feeExpanded} aria-controls={feeExpanded ? feeId : undefined}
            className={cn(feeExpanded && 'bg-tint')} onClick={onToggleFee}>Fee</Button>}
        </div>
      </div>
      {((showCoverage && row.first_lesson_date && row.coverage_through) || collection || showLessonCount || feeKnown || differentCollectionMethod) && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs">
        {showCoverage && row.first_lesson_date && row.coverage_through && <span><span className="font-medium">{firstEnrollment ? 'Enrollment' : nextEnrollment ? 'Renewal' : 'Payment'}: </span>{formatShortDate(row.first_lesson_date)} to {formatShortDate(row.coverage_through)}</span>}
        {showLessonCount && <span>{plural(row.lesson_count!, 'session')}</span>}
        {feeKnown && <span className="font-medium">{formatMOP(row.total_fee!, 0)}{row.amount_basis === 'tuition_only' && <span className="font-normal text-ink-subtle"> tuition estimate</span>}</span>}
        {differentCollectionMethod && <span className="inline-flex items-center gap-1">Collection <PaymentMethodBadge method={row.payment_method} /></span>}
        {collection && <span className={cn(row.urgency === 'now' || row.overdue ? 'text-red-700 dark:text-red-300' : row.urgency === 'week' ? 'text-orange-700 dark:text-orange-400' : 'text-ink-subtle')}>{collection}</span>}
      </div>}
    </div>
    {(note || row.issues.length > 0 || isMultiple) && <div className="space-y-2 border-t border-line px-3 py-2 sm:px-4">
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
      <BillingCardFeeMessage target={feeTarget} onClose={() => { onToggleFee(); requestAnimationFrame(() => feeButton.current?.focus()); }} onChanged={onSettingsSaved} />
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
  const [stage, setStage] = useState<BillingQueueView>(initialStage);
  const [collapsed, setCollapsed] = useState<Set<BillingQueueUrgency>>(() => new Set());
  const [month, setMonth] = useState(initialCollectionMonth);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250).trim();
  const searchPending = search.trim() !== debouncedSearch;
  const scope = JSON.stringify([billingDraftAuthScope(auth), location, tutorId, month, stage, debouncedSearch]);
  const workspaceTrigger = useRef<HTMLButtonElement | null>(null);
  const [workspace, setWorkspace] = useState<{ scope: string; row: BillingQueueRow; action?: BillingRenewalAction } | null>(null);
  const selectedWorkspace = workspace?.scope === scope ? workspace : null;
  useEffect(() => { setWorkspace(current => current && current.scope !== scope ? null : current); }, [scope]);
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
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    enabled && stage !== 'receipts' ? ['billing-renewal-queue', scope, offset] : null,
    () => billingAPI.queue({ collection_month: month || undefined, stage: stage === 'all' || stage === 'receipts' ? undefined : stage, search: debouncedSearch || undefined, location, tutor_id: tutorId, offset, limit }),
    { keepPreviousData: false, refreshInterval },
  );
  const { data: waitingTaught } = useUnlistedWaitingCount(enabled, location);
  const current = stage !== 'receipts' && !error && !searchPending ? data : undefined;
  const selectedIds = new Set(selectedRows.map(row => row.student.id));
  const listPanel = useRef<HTMLElement | null>(null);
  const tabId = useId();
  const tabBar = useRef<HTMLDivElement>(null);
  const serverMonth = useRef('');
  if (data?.collection_month) serverMonth.current = data.collection_month;
  const title = VIEWS.find(item => item.value === stage)!.label;
  const countsReady = stage === 'receipts' ? !!receiptCount.data : current !== undefined;
  useEffect(() => {
    const bar = tabBar.current;
    const selected = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!bar || !selected) return;
    const parent = bar.getBoundingClientRect(); const tab = selected.getBoundingClientRect();
    if (tab.right > parent.right) bar.scrollLeft += tab.right - parent.right + 12;
    else if (tab.left < parent.left) bar.scrollLeft -= parent.left - tab.left + 12;
  }, [stage, countsReady, receiptCount.data?.count]);

  function selectStage(next: BillingQueueView) { setStage(next); }
  function selectable(row: BillingQueueRow) {
    const action = canBatchRenew(row) ? 'renew' : queuePaymentBatchAction(row);
    return !!action && (!selectionAction || selectionAction === action);
  }
  function toggleBatch(row: BillingQueueRow) {
    setSelection({ scope: batchScope, rows: selectedIds.has(row.student.id) ? selectedRows.filter(value => value.student.id !== row.student.id) : [...selectedRows, row] });
  }
  function toggleSection(rows: BillingQueueRow[]) {
    const eligible = rows.filter(selectable);
    const sectionIds = new Set(eligible.map(row => row.student.id));
    const allChecked = eligible.every(row => selectedIds.has(row.student.id));
    setSelection({ scope: batchScope, rows: allChecked ? selectedRows.filter(row => !sectionIds.has(row.student.id))
      : [...selectedRows, ...eligible.filter(row => !selectedIds.has(row.student.id))] });
  }
  function closeBatch(items?: BillingBatchItem[]) {
    setBatchOpen(null);
    const results = new Map(items?.map(item => [item.row.student.id, item]));
    const latest = new Map(current?.rows.map(row => [row.student.id, row]));
    const retained = selectedRows.flatMap(row => {
      const item = results.get(row.student.id);
      if (item?.outcome?.kind === 'created' || item?.draft?.confirmed_payment_id) return [];
      if (item?.draft) return [{ ...row, origin: 'draft' as const, draft_id: item.draft.id }];
      const fresh = latest.get(row.student.id);
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

  if (auth.isLoading) return <p className="p-6">Loading staff access…</p>;
  if (!enabled) return <p className="p-6">Admin access is required to review enrollment renewals.</p>;

  return <PageSurface><div className={cn('mx-auto max-w-7xl space-y-4 p-4 sm:p-6', selectedRows.length > 0 && 'pb-28 sm:pb-28')}>
    <PageHeader title="Enrollment renewals" subtitle="Prepare enrollments and follow up payments" icon={RefreshCw} titleExtra={auth.isReadOnly && <Badge>Read-only</Badge>} actions={
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/autopay${month || serverMonth.current ? `?collection_month=${month || serverMonth.current}` : ''}`} className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
          <Landmark className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          Autopay list
        </Link>
        <Link href="/billing" className={buttonClasses({ size: 'sm', variant: 'secondary' })}>
          <CalendarRange className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
          Payment journeys
        </Link>
        <BillingCouponImportButton storageAvailable={!!options?.coupon_storage_available} writesAvailable={!!options?.coupon_writes_available} />
        <div className="flex items-center gap-2">
          <Button size="sm" icon={History} onClick={onShowLegacy}>Earlier enrollments</Button>
          <span aria-hidden="true" className="mx-1 h-4 border-l border-line" />
          <IconButton size="sm" label="Refresh renewals" title="Refresh" icon={RefreshCw} iconClassName={isValidating ? 'animate-spin' : undefined} disabled={isValidating || searchPending} onClick={() => { void mutate(); void refreshCache(key => Array.isArray(key) && ['billing-receipts', 'billing-receipts-count'].includes(key[0])); void invalidateRenewalQueueCache(); }} />
        </div>
      </div>
    } />
    <div className="flex flex-wrap items-end gap-3">
      {stage !== 'receipts' && <Field label="Collection month" id={`${tabId}-month`} className="w-44"><Input type="month" value={month || serverMonth.current} onChange={event => setMonth(event.target.value)} /></Field>}
      <Field label="Find a student" id={`${tabId}-search`} className="min-w-52 flex-1"><Input value={search} placeholder="Name or student number" onChange={event => setSearch(event.target.value)} /></Field>
      <Button size="sm" icon={UserPlus} onClick={onShowTaught}>Taught but not in CSM yet{' '}{waitingTaught && <Badge>{waitingTaught.count}</Badge>}</Button>
    </div>
    <div ref={tabBar} role="tablist" aria-label="Renewal stages" className="flex gap-4 overflow-x-auto border-b border-line">
      {VIEWS.map(item => <button key={item.value} type="button" role="tab" id={`${tabId}-${item.value}-tab`} aria-controls={`${tabId}-panel`} aria-selected={stage === item.value} tabIndex={stage === item.value ? 0 : -1} onKeyDown={keyDown} onClick={() => selectStage(item.value)} className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', stage === item.value ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle', item.value === 'no_payment' && 'ml-auto')}>
        <item.icon className={cn('h-4 w-4', item.colour)} aria-hidden="true" />{item.label}{' '}{item.value === 'receipts' ? receiptCount.data?.storage_available && !receiptCount.error ? <Badge>{receiptCount.data.count}</Badge> : null : current && <Badge>{item.value === 'all' ? current.counts.total - current.counts.no_payment : current.counts[item.value]}</Badge>}
      </button>)}
    </div>
    <section ref={listPanel} tabIndex={-1} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${stage}-tab`} aria-busy={isValidating || searchPending} className="space-y-3 outline-none">
      {stage === 'receipts' && <BillingReceiptsQueue location={location} tutorId={tutorId} search={debouncedSearch} searchPending={searchPending} />}
      {stage !== 'receipts' && (isLoading || searchPending) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading renewals…</p>}
      {stage !== 'receipts' && error && !searchPending && <div role="alert" className="rounded border border-red-300 p-4 text-sm"><p>{error instanceof Error ? error.message : 'Could not load enrollment renewals.'}</p><Button size="sm" className="mt-2" onClick={() => mutate()}>Retry</Button></div>}
      {current && <>
        <p className="text-xs text-ink-subtle">{title} · {plural(current.total, 'student')}{location ? ` · ${location}` : ''}</p>
        {current.rows.length ? URGENCY_GROUPS.map(group => {
          const rows = current.rows.filter(row => (row.stage === 'no_payment' ? 'later' : row.urgency ?? 'check_dates') === group.value);
          if (!rows.length) return null;
          const selectableRows = canSelect ? rows.filter(selectable) : [];
          return <CollapsibleSection key={group.value} id={`${tabId}-urgency-${group.value}`} label={group.label} colorTheme={group.colour}
            showCheckbox={selectedRows.length > 0 && selectableRows.length > 0} isAllChecked={selectableRows.length > 0 && selectableRows.every(row => selectedIds.has(row.student.id))}
            isSomeChecked={selectableRows.some(row => selectedIds.has(row.student.id))} onCheckboxClick={event => { event.stopPropagation(); toggleSection(rows); }}
            annotation={selectedRows.length > 0 && selectableRows.length > 0 && (current.urgency_counts?.[group.value] ?? rows.length) > rows.length ? `${rows.length} on this page` : undefined}
            count={current.urgency_counts?.[group.value] ?? rows.length} isCollapsed={collapsed.has(group.value)} onToggle={() => setCollapsed(previous => {
              const next = new Set(previous); if (next.has(group.value)) next.delete(group.value); else next.add(group.value); return next;
            })}>
            {rows.map(row => <QueueCard key={row.key} row={row} asOf={current.as_of} showLocation={selectedLocation === 'All Locations'} showStage={stage === 'all'} selected={selectedWorkspace?.row.key === row.key}
              workflowAvailable={!!options?.workflow_available} preferencesWritable={!!options?.preferences_writes_available} onSettingsSaved={() => { void mutate(); }}
              batchSelected={selectedIds.has(row.student.id)} showCheckboxes={selectedRows.length > 0} onBatchToggle={canSelect && selectable(row) ? () => toggleBatch(row) : undefined}
              feeExpanded={feePanel?.scope === feeScope && feePanel.key === row.key} onToggleFee={() => setFeePanel(previous => previous?.scope === feeScope && previous.key === row.key ? null : { scope: feeScope, key: row.key })}
              onOpen={(value, trigger, action) => { workspaceTrigger.current = trigger; setWorkspace({ scope, row: value, action }); }} />)}
          </CollapsibleSection>;
        }) : <p className="rounded border border-line p-5 text-sm">{debouncedSearch ? 'No students match this search.' : EMPTY[stage]}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-ink-subtle">{current.total ? `${current.offset + 1}–${Math.min(current.offset + current.rows.length, current.total)} of ${current.total}` : '0 students'}</p><div className="flex gap-2">
          <Button size="sm" disabled={offset === 0} onClick={() => setPage({ scope, offset: Math.max(0, offset - limit) })}>Previous</Button>
          <Button size="sm" disabled={offset + limit >= current.total} onClick={() => setPage({ scope, offset: offset + limit })}>Next</Button>
        </div></div>
      </>}
    </section>
    <AnimatePresence>{canSelect && selectedRows.length > 0 && <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed bottom-[calc(1rem+var(--app-bottom-inset))] sm:bottom-[calc(1.5rem+var(--app-bottom-inset))] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40">
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-medium text-foreground">{selectedRows.length} selected</span>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
        <Button ref={batchTrigger} variant="primary" icon={selectionAction === 'sent' ? Send : selectionAction === 'paid' ? CreditCard : RefreshCw} disabled={!options || searchPending} onClick={() => {
          setWorkspace(null);
          if (selectionAction === 'renew') setBatchOpen(batchScope);
          else if (selectionAction) setPaymentBatch({ scope: batchScope, action: selectionAction, targets: selectedRows.map(paymentBatchTarget) });
        }}>{selectionAction === 'sent' ? 'Mark messages sent' : selectionAction === 'paid' ? 'Record payments' : 'Batch renew'}</Button>
        <IconButton icon={X} label="Clear selection" onClick={() => setSelection({ scope: batchScope, rows: [] })} />
      </div>
    </motion.div>}</AnimatePresence>
    {selectedWorkspace && <BillingRenewalWorkspace key={`${scope}:${selectedWorkspace.row.key}`} row={selectedWorkspace.row} initialAction={selectedWorkspace.action} trigger={workspaceTrigger} onClose={() => setWorkspace(null)} onChanged={() => { void mutate(); void invalidateRenewalQueueCache(); }} />}
    {canSelect && paymentBatch?.scope === batchScope && <BillingPaymentBatchModal key={batchScope} targets={paymentBatch.targets} action={paymentBatch.action}
      writesAvailable={!!options?.workflow_writes_available} trigger={batchTrigger} onChanged={() => { void mutate(); void invalidateRenewalQueueCache(); }} onClose={completedIds => {
        setPaymentBatch(null);
        const completed = new Set(completedIds);
        setSelection({ scope: batchScope, rows: selectedRows.filter(row => !row.payment_id || !completed.has(row.payment_id)) });
        requestAnimationFrame(() => (batchTrigger.current ?? listPanel.current)?.focus());
      }} />}
    {canSelect && batchOpen === batchScope && options && <BillingBatchRenewModal key={batchScope} rows={selectedRows} options={options} trigger={batchTrigger}
      onClose={closeBatch} onChanged={() => { void mutate(); void invalidateRenewalQueueCache(); }} />}
  </div></PageSurface>;
}
