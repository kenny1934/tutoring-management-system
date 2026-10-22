"use client";

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CalendarRange, CreditCard, FileClock, History, RefreshCw, Route, Settings2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateCaches, usePageTitle } from '@/lib/hooks';
import { billingAPI } from '@/lib/billing-api';
import { formatShortDate, plural } from '@/lib/formatters';
import type { BillingSourceBlock, BillingContextBasis, BillingDraftDetail, BillingPreviewRequest } from '@/types/billing';
import { Badge, Button, Field, PageHeader, Select } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { BillingChecks } from './BillingChecks';
import { BillingPreview } from './BillingPreview';
import { BillingEditorDialog } from './BillingEditorDialog';
import { BillingSavedDrafts } from './BillingSavedDrafts';
import { billingDraftAuthScope } from './BillingDraftReview';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingPayments } from './BillingPayments';
import { BillingEnrollmentIntake } from './BillingEnrollmentIntake';
import { cn } from '@/lib/utils';

function dateOrUnknown(value: string | null) {
  return value ? formatShortDate(value) : 'To confirm';
}

function PaymentStatus({ value }: { value: string }) {
  const unpaid = ['Pending Payment', 'Unpaid'].includes(value);
  return <Badge tone={value === 'Overdue' ? 'danger' : unpaid ? 'warning' : value === 'Paid' ? 'success' : 'neutral'}>{unpaid ? 'Unpaid' : value}</Badge>;
}

function SourceBlock({ block }: { block: BillingSourceBlock }) {
  return <article className="rounded-lg border border-line bg-paper p-3" aria-label={`Recorded enrollment ${block.enrollment_id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href={`/enrollments/${block.enrollment_id}`} className="text-sm font-medium text-accent-ink hover:underline">Enrollment #{block.enrollment_id}</Link>
      <div className="flex flex-wrap gap-1.5"><PaymentStatus value={block.payment_status} />{block.fee_message_marked_sent && <Badge tone="info">Message sent</Badge>}</div>
    </div>
    <p className="mt-2 text-sm">{block.weekday || 'Day to confirm'} {block.time_slot || 'Time to confirm'} @ {block.location || 'Branch to confirm'}</p>
    <p className="mt-1 text-xs text-ink-subtle">{block.tutor_name} · {dateOrUnknown(block.first_lesson_date)} → {dateOrUnknown(block.last_original_date)} · {block.lessons_recorded == null ? 'Session count to confirm' : plural(block.lessons_recorded, 'session')}</p>
    <details className="mt-3 text-xs"><summary className="cursor-pointer font-medium">Session dates and payment details</summary>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><dt className="text-ink-subtle">Payment date</dt><dd>{dateOrUnknown(block.payment_date)}</dd></div>
        <div><dt className="text-ink-subtle">Fee message</dt><dd>{block.fee_message_marked_sent ? 'Marked sent in CSM' : 'Not marked sent'}</dd></div>
      </dl>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Recorded original sessions for enrollment {block.enrollment_id}</caption>
        <thead><tr className="border-b border-line"><th className="py-2 pr-3">Original session</th><th className="pr-3">Time and branch</th><th>Status</th></tr></thead>
        <tbody>{block.originals.map(lesson => <tr key={lesson.id} className="border-b border-line last:border-0"><td className="py-1.5 pr-3 whitespace-nowrap">{formatShortDate(lesson.date)}{lesson.holiday && <Badge className="ml-1">Holiday class</Badge>}</td><td className="pr-3">{lesson.time_slot || 'Time not recorded'} @ {lesson.location || 'Branch not recorded'}</td><td>{lesson.status}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-3">Makeup dates: {block.makeup_dates.length ? block.makeup_dates.map(formatShortDate).join(', ') : 'None recorded'}.</p>
      <p className="mt-1 text-ink-subtle">Makeups do not extend paid tuition coverage.</p>
    </details>
  </article>;
}

function JourneyContent({ studentId, tutorId, scope, initialBasis }: { studentId: number; tutorId?: number; scope: string; initialBasis: BillingContextBasis }) {
  const auth = useAuth();
  const params = useSearchParams();
  const [basis, setBasis] = useState<BillingContextBasis>(initialBasis);
  const [selection, setSelection] = useState<number[] | null>(null);
  const [view, setView] = useState<'journey' | 'enrollments' | 'drafts' | 'payments'>(() => {
    const requested = params.get('view');
    return requested === 'payments' || requested === 'drafts' || requested === 'enrollments' ? requested : 'journey';
  });
  const [paymentId, setPaymentId] = useState<string | null>(params.get('payment'));
  const [restoredScenario, setRestoredScenario] = useState<BillingPreviewRequest | null>(null);
  const [intakeRevision, setIntakeRevision] = useState<string | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<{ id: string; current_revision: number }>();
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [savedRefresh, setSavedRefresh] = useState(0);
  const [savedDraft, setSavedDraft] = useState<{ id: string; revision: number } | null>(null);
  const [draftToOpen, setDraftToOpen] = useState<string | null>(params.get('draft'));
  const [sourceEditorOpen, setSourceEditorOpen] = useState(false);
  const sourceEditorTrigger = useRef<HTMLButtonElement>(null);
  const tabId = useId();
  const { data: options } = useSWR('billing-preview-options', billingAPI.options);
  const storageAvailable = !!options?.draft_storage_available;
  const workflowAvailable = !!options?.workflow_available;
  const workflowWritesAvailable = !!options?.workflow_writes_available;
  const preferenceWritesAvailable = !!options?.preferences_writes_available;
  // Share the list cache so the tab count follows saved and discarded drafts.
  const draftIdentity = JSON.stringify([studentId, scope, billingDraftAuthScope(auth), savedRefresh]);
  const { data: drafts, mutate: refreshDrafts } = useSWR(
    storageAvailable ? ['billing-saved-drafts', draftIdentity, false] : null,
    () => billingAPI.studentDrafts(studentId, undefined, tutorId),
    { keepPreviousData: false },
  );
  const draftCount = drafts?.filter(draft => draft.student_id === studentId && draft.state !== 'discarded').length;
  const activeView = view === 'payments' && !workflowAvailable || view === 'drafts' && !storageAvailable ? 'journey' : view;
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ['billing-student-context', scope, studentId, basis, selection],
    () => billingAPI.studentContext(studentId, { basis, tutor_id: tutorId, selected_enrollment_ids: selection ?? undefined }),
    { keepPreviousData: true },
  );
  // The outer student/scope key isolates identities. Keep this student’s editor
  // mounted while updated coverage loads, and suspend projections separately.
  const context = data;
  const selected = selection ?? context?.selected_enrollment_ids ?? [];
  const sourceError = error ? error instanceof Error ? error.message : 'Could not load this student’s payment journey.' : undefined;

  function chooseSlot(id: number, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter(value => value !== id);
    if (next.length >= 1 && next.length <= 2) setSelection(next.sort((left, right) => left - right));
  }

  function changeTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: (typeof view)[] = ['journey', ...(workflowAvailable ? ['payments' as const] : []), 'enrollments', ...(storageAvailable ? ['drafts' as const] : [])];
    const position = tabs.indexOf(activeView);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(position + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    setView(next);
    document.getElementById(`${tabId}-${next}-tab`)?.focus();
  }

  function reviseDraft(draft: BillingDraftDetail) {
    if (draft.review.intake) { setIntakeRevision(draft.id); return; }
    setSavedDraft(null);
    setBasis(draft.review.basis);
    setSelection(draft.review.selected_enrollment_ids);
    // KMS verification must be deliberately checked again when revising.
    const scenario = draft.review.scenario;
    setRestoredScenario({ ...scenario, coupon: scenario.coupon ? { ...scenario.coupon, verified: false } : null });
    setRevisionTarget({ id: draft.id, current_revision: draft.current_revision });
    setPreviewGeneration(value => value + 1);
    setView('journey');
    document.getElementById(`${tabId}-journey-tab`)?.focus();
  }

  function cancelRevision() {
    setRestoredScenario(null);
    setRevisionTarget(undefined);
    setSelection(null);
    setBasis(initialBasis);
    setPreviewGeneration(value => value + 1);
  }

  const sourceControls = context && <section className="space-y-4" aria-label="Existing enrollment settings">
    <Field label="Start sessions after" id="journey-basis" className="max-w-sm"><Select value={basis} onChange={event => { setBasis(event.target.value as BillingContextBasis); setSelection(null); }}>
      <option value="paid_only">Paid enrollments</option><option value="include_pending">Paid + unpaid enrollments</option>
    </Select></Field>
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Continuing timetable</legend>
      <p className="text-xs text-ink-subtle">Choose up to two weekly sessions for this preview. This does not change the student’s enrollments.</p>
      {context.slot_candidates.length === 0 && <p className="text-sm">No continuing timetable was found. Check the Existing enrollments tab.</p>}
      {context.slot_candidates.map(slot => {
        const checked = selected.includes(slot.enrollment_id);
        return <label key={slot.enrollment_id} className="flex cursor-pointer items-start gap-3 rounded border border-line p-3 text-sm has-[:checked]:border-primary/50">
          <input aria-label={`Use ${slot.weekday || 'unknown day'} ${slot.time_slot || ''} at ${slot.location || 'unknown branch'}, enrollment ${slot.enrollment_id}`} type="checkbox" checked={checked} disabled={checked ? selected.length <= 1 : selected.length >= 2} onChange={event => chooseSlot(slot.enrollment_id, event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-field accent-primary" />
          <span className="min-w-0 space-y-1"><span className="block font-medium">{slot.weekday || 'Day to confirm'} {slot.time_slot || 'Time to confirm'} @ {slot.location || 'Branch to confirm'} <span className="text-xs font-normal text-ink-subtle">· {slot.tutor_name} · #{slot.enrollment_id}</span></span>
            <span className="block text-xs text-ink-subtle">Last paid session: {dateOrUnknown(slot.last_paid_original_date)} · First session to charge {dateOrUnknown(slot.first_uncovered_date)}</span>
            {basis === 'include_pending' && <span className="block text-xs text-ink-subtle">Last session in existing enrollments: {dateOrUnknown(slot.last_retained_original_date)}</span>}</span>
        </label>;
      })}
      {selection !== null && <Button size="sm" onClick={() => setSelection(null)}>Reset timetable</Button>}
    </fieldset>
  </section>;

  if (intakeRevision) return <IntakeDraftJourney studentId={studentId} draftId={intakeRevision} onBack={() => setIntakeRevision(null)} />;
  return <PageSurface><div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <PageHeader title="Payment journey" icon={CalendarRange} titleExtra={!workflowAvailable ? <Badge>Preview</Badge> : undefined} backHref="/billing" backLabel="Back to payment journeys" actions={
      <Button size="sm" aria-label="Refresh records" disabled={isValidating} onClick={() => { void mutate(); if (storageAvailable) void refreshDrafts(); }}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Refresh records</span></Button>
    } />
    {(isLoading || isValidating) && <p role="status" className="py-6 text-sm text-ink-subtle">Loading student records…</p>}
    {error && <div role="alert" className="rounded border border-red-300 p-4 text-sm"><p>{sourceError}</p><Button className="mt-2" size="sm" onClick={() => mutate()}>Retry</Button></div>}
    {context && <>
      <section className="space-y-3" aria-label="Student and enrollment summary">
        <StudentInfoBadges student={{ ...context.student, student_id: context.student.id, lang_stream: context.student.lang_stream ?? undefined, school: context.student.school ?? undefined, grade: context.student.grade ?? undefined, school_student_id: context.student.school_student_id ?? undefined, home_location: context.student.home_location ?? undefined }} nameHref={`/students/${studentId}`} showLocationPrefix />
        <div className="flex flex-wrap items-center gap-1.5">
          {context.pending_bill_count > 0 && <Badge tone="warning">{plural(context.pending_bill_count, 'unpaid enrollment')}</Badge>}
          {context.sent_pending_bill_count > 0 && <Badge tone="info">{plural(context.sent_pending_bill_count, 'message')} sent</Badge>}
          {context.pending_makeup_count > 0 && <Badge>{plural(context.pending_makeup_count, 'pending makeup')}</Badge>}
          <Badge>{selected.length === 2 ? 'Twice weekly' : selected.length === 1 ? 'Weekly' : 'Check timetable'}</Badge>
        </div>
        <div className="space-y-1" aria-label="Continuing timetable">
          {context.slot_candidates.filter(slot => selected.includes(slot.enrollment_id)).map(slot => <div key={slot.enrollment_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
            <p><span className="font-medium">{slot.weekday || 'Day to confirm'} {slot.time_slot || 'Time to confirm'} @ {slot.location || 'Branch to confirm'}</span><span className="ml-2 text-xs text-ink-subtle">{slot.tutor_name}</span></p>
            <p className="text-xs text-ink-subtle">Last paid session: {dateOrUnknown(slot.last_paid_original_date)}</p>
          </div>)}
          {selected.length === 0 && <p className="text-sm text-ink-subtle">Choose a continuing timetable in Edit preview.</p>}
        </div>
        <BillingPaymentSettings storageAvailable={workflowAvailable} canWrite={preferenceWritesAvailable} studentId={studentId} recordedMethod={context.recorded_payment_method} mandateReady={context.mandate_ready} onSaved={() => { void mutate(); }} />
        {basis === 'include_pending' && <p className="text-xs text-amber-800 dark:text-amber-300">Existing unpaid enrollments still need payment.</p>}
      </section>
      <div role="tablist" aria-label="Student payment views" className="flex gap-4 overflow-x-auto border-b border-line">
        {([{ value: 'journey', label: 'Payment journey', icon: Route }, ...(workflowAvailable ? [{ value: 'payments' as const, label: 'Payments', icon: CreditCard }] : []), { value: 'enrollments', label: 'Existing enrollments', icon: History }, ...(storageAvailable ? [{ value: 'drafts' as const, label: 'Saved drafts', icon: FileClock }] : [])] as const).map(tab => <button key={tab.value} type="button" role="tab" id={`${tabId}-${tab.value}-tab`} aria-controls={`${tabId}-${tab.value}-panel`} aria-selected={activeView === tab.value} tabIndex={activeView === tab.value ? 0 : -1} onKeyDown={changeTab} onClick={() => setView(tab.value)} className={cn('flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', activeView === tab.value ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle hover:text-foreground')}>
          <tab.icon className="h-4 w-4" aria-hidden="true" />{tab.label}{' '}{tab.value === 'enrollments' && <Badge>{context.source_blocks.length}</Badge>}{tab.value === 'drafts' && draftCount !== undefined && <Badge>{draftCount}</Badge>}
        </button>)}
      </div>
      {savedDraft && !draftToOpen && <div role="status" className="flex flex-wrap items-center gap-2 text-sm"><span>Draft saved. Revision {savedDraft.revision}.</span><Button size="sm" variant="quiet" onClick={() => { setDraftToOpen(savedDraft.id); setView('drafts'); }}>Open draft</Button></div>}
      <section role="tabpanel" id={`${tabId}-journey-panel`} aria-labelledby={`${tabId}-journey-tab`} hidden={activeView !== 'journey'} className="space-y-3">
        {context.suggested_request ? <BillingPreview key={previewGeneration} sourceLoading={isValidating || !!error} sourceError={sourceError} onRetrySource={() => { void mutate(); }} sourceKey={context.source_fingerprint} initialRequest={restoredScenario ?? context.suggested_request} contextIssues={context.issues} editorContent={sourceControls} couponSnapshot={context.coupon_snapshot}
          draftContext={{ studentId, basis, selectedEnrollmentIds: selected, sourceFingerprint: context.source_fingerprint }} revisionTarget={revisionTarget} onCancelRevision={cancelRevision}
          onDraftSaved={draft => { setSavedRefresh(value => value + 1); setSavedDraft({ id: draft.id, revision: draft.revision }); setDraftToOpen(draft.id); setRevisionTarget(undefined); setView('drafts'); }} embedded />
          : <><div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line p-4"><div className="space-y-3"><p className="text-sm">Check the timetable and records to prepare the next payment.</p><BillingChecks issues={context.issues} /></div><Button ref={sourceEditorTrigger} size="sm" icon={Settings2} onClick={() => setSourceEditorOpen(true)}>Edit preview</Button></div>
            <BillingEditorDialog open={sourceEditorOpen} onClose={() => setSourceEditorOpen(false)} trigger={sourceEditorTrigger}>
              <div className="space-y-4">
                {isValidating && <p role="status" className="text-sm text-ink-subtle">Updating enrollment records…</p>}
                {sourceError && <div role="alert" className="rounded border border-red-300 p-3 text-sm"><p>{sourceError}</p><Button className="mt-2" size="sm" disabled={isValidating} onClick={() => mutate()}>Retry</Button></div>}
                {sourceControls}
              </div>
            </BillingEditorDialog></>}
      </section>
      {storageAvailable && <section role="tabpanel" id={`${tabId}-drafts-panel`} aria-labelledby={`${tabId}-drafts-tab`} hidden={activeView !== 'drafts'} className="space-y-3">
        {activeView === 'drafts' && <BillingSavedDrafts studentId={studentId} scope={scope} refreshKey={savedRefresh} initialDraftId={draftToOpen} savedRevision={savedDraft?.revision}
          onOpenPayment={id => { setPaymentId(id); setView('payments'); }}
          onDraftClosed={() => setDraftToOpen(null)}
          onDiscarded={id => { if (savedDraft?.id === id) setSavedDraft(null); void refreshDrafts(items => items?.filter(draft => draft.id !== id), false); }} onRevise={reviseDraft} workflowAvailable={workflowAvailable} workflowWritesAvailable={workflowWritesAvailable} onConfirmed={payment => { setPaymentId(payment.id); setSavedDraft(null); setSavedRefresh(value => value + 1); setView('payments'); invalidateCaches('enrollments', { studentId }); void mutate(); }} />}
      </section>}
      {workflowAvailable && <section role="tabpanel" id={`${tabId}-payments-panel`} aria-labelledby={`${tabId}-payments-tab`} hidden={activeView !== 'payments'} className="space-y-3">
        {activeView === 'payments' && <BillingPayments canWrite={workflowWritesAvailable} key={paymentId ?? 'payments'} studentId={studentId} initialPaymentId={paymentId} refreshKey={savedRefresh} onChanged={() => { invalidateCaches('enrollments', { studentId }); void mutate(); }} />}
      </section>}
      <section role="tabpanel" id={`${tabId}-enrollments-panel`} aria-labelledby={`${tabId}-enrollments-tab`} hidden={activeView !== 'enrollments'} className="space-y-3">
        {context.source_blocks.length ? context.source_blocks.map(block => <SourceBlock key={block.enrollment_id} block={block} />) : <p className="text-sm">No regular enrollments were found for this teaching year.</p>}
        <p className="text-xs text-ink-subtle">Records checked {formatShortDate(context.as_of)} · {plural(context.upcoming_original_count, 'upcoming original session')}</p>
      </section>
    </>}
  </div></PageSurface>;
}

export function StudentBillingJourney({ studentId }: { studentId: number }) {
  usePageTitle('Student payment journey');
  const params = useSearchParams();
  const initialBasis = params.get('basis') === 'include_pending' ? 'include_pending' : 'paid_only';
  const { user, isLoading, isGuest, effectiveRole, isImpersonating, impersonatedTutor } = useAuth();
  const tutorId = effectiveRole === 'Tutor' ? (isImpersonating && impersonatedTutor?.id ? impersonatedTutor.id : user?.id) : undefined;
  if (isLoading) return <p className="p-6">Loading staff access…</p>;
  if (!user || isGuest) return <p className="p-6">Staff access is required to review a payment journey.</p>;
  if (!Number.isInteger(studentId) || studentId <= 0) return <p className="p-6">Choose a valid student to review.</p>;
  const scope = `${user.id}:${effectiveRole}:${tutorId ?? 'all'}`;
  const identity = `${scope}:${studentId}:${initialBasis}:${params.get('view')}:${params.get('payment')}:${params.get('draft')}`;
  return params.get('view') === 'drafts' && params.get('draft') ? <SavedDraftJourney key={identity} studentId={studentId} tutorId={tutorId} scope={scope} initialBasis={initialBasis} draftId={params.get('draft')!} />
    : <JourneyContent key={identity} studentId={studentId} tutorId={tutorId} scope={scope} initialBasis={initialBasis} />;
}

function IntakeDraftJourney({ studentId, draftId, onBack }: { studentId: number; draftId: string; onBack?: () => void }) {
  return <PageSurface><div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
    <PageHeader title="Enrollment fee preview" icon={CalendarRange} backHref="/admin/renewals" backLabel="Back to enrollment renewals" />
    {onBack && <Button size="sm" onClick={onBack}>Back to payment journey</Button>}
    <BillingEnrollmentIntake studentId={studentId} initialDraftId={draftId} />
  </div></PageSurface>;
}

function SavedDraftJourney({ studentId, tutorId, scope, initialBasis, draftId }: {
  studentId: number; tutorId?: number; scope: string; initialBasis: BillingContextBasis; draftId: string;
}) {
  const request = useSWR(['billing-journey-draft-route', scope, studentId, draftId],
    () => billingAPI.draft(draftId, undefined, undefined, tutorId), { keepPreviousData: false });
  if (request.error) return <div role="alert" className="space-y-2 p-6 text-sm"><p>Could not open this draft.</p><Button size="sm" onClick={() => request.mutate()}>Retry draft</Button></div>;
  if (!request.data) return <p role="status" className="p-6 text-sm text-ink-subtle">Loading draft…</p>;
  if (request.data.student_id !== studentId || request.data.id !== draftId) return <p role="alert" className="p-6 text-sm">This draft does not belong to this student.</p>;
  return request.data.review.intake ? <IntakeDraftJourney studentId={studentId} draftId={draftId} />
    : <JourneyContent studentId={studentId} tutorId={tutorId} scope={scope} initialBasis={initialBasis} />;
}
