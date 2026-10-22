'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Button, Field, Select } from '@/components/controls';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { invalidateCaches } from '@/lib/hooks';
import { formatShortDate } from '@/lib/formatters';
import type { BillingContextBasis, BillingDraftDetail, BillingMethod, BillingQueueRow } from '@/types/billing';
import { billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingChecks } from './BillingChecks';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingPayments } from './BillingPayments';
import { BillingPreview } from './BillingPreview';
import { BillingSavedDrafts } from './BillingSavedDrafts';
import { BillingEnrollmentIntake } from './BillingEnrollmentIntake';

export type BillingRenewalAction = { kind: 'renew' } | { kind: 'draft' | 'payment'; id: string };

/** The renewal workspace and the full journey use the same review and payment controls. */
export function BillingRenewalPanel({ row, initialAction, onChanged, onOpenEnrollment, onActionChange, onBusyChange, onBatchDraftSaved }: {
  row: BillingQueueRow;
  initialAction: BillingRenewalAction;
  onChanged: () => void;
  onOpenEnrollment: (id: number) => void;
  onActionChange: (action: BillingRenewalAction) => void;
  onBusyChange: (busy: boolean) => void;
  onBatchDraftSaved?: (draft: BillingDraftDetail) => void;
}) {
  const auth = useAuth();
  const studentId = row.student.id;
  const scope = `${studentId}:${billingDraftAuthScope(auth)}`;
  const tutorId = billingDraftTutorId(auth);
  const [action, setAction] = useState(initialAction);
  const [basis, setBasis] = useState<BillingContextBasis>('include_pending');
  const [selection, setSelection] = useState<number[] | null>(null);
  const [method, setMethod] = useState<BillingMethod | null | undefined>(undefined);
  const [revision, setRevision] = useState<BillingDraftDetail | null>(null);
  const [intakeDraftId, setIntakeDraftId] = useState<string | null>(
    initialAction.kind === 'draft' && !row.enrollment_ids.length ? initialAction.id : null,
  );
  const [savedRevision, setSavedRevision] = useState<number>();
  const [generation, setGeneration] = useState(0);
  const optionsRequest = useSWR('billing-preview-options', billingAPI.options);
  const options = optionsRequest.data;
  const body = useRef<HTMLDivElement>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const busy = settingsBusy || formBusy;
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => onActionChange(action), [action, onActionChange]);
  useLayoutEffect(() => {
    if (document.activeElement === document.body) body.current?.focus();
  }, [action]);
  const context = useSWR(action.kind === 'renew' ? ['billing-student-context', scope, studentId, basis, selection] : null,
    () => billingAPI.studentContext(studentId, { basis, tutor_id: tutorId, selected_enrollment_ids: selection ?? undefined }), { keepPreviousData: false });
  const source = context.data;
  const selected = selection ?? source?.selected_enrollment_ids ?? [];
  const recordedMethod = source ? source.recorded_payment_method : row.recorded_payment_method;
  const previewMethod = method === undefined ? recordedMethod ?? null : method;
  const sourceError = context.error ? context.error instanceof Error ? context.error.message : 'Could not load enrollment records.' : undefined;

  function changed() {
    invalidateCaches('enrollments', { studentId });
    void context.mutate();
    onChanged();
  }

  function revise(draft: BillingDraftDetail) {
    if (draft.review.intake) { setIntakeDraftId(draft.id); return; }
    setRevision(draft); setBasis(draft.review.basis); setSelection(draft.review.selected_enrollment_ids);
    setMethod(draft.review.scenario.payment_method); setGeneration(value => value + 1); setAction({ kind: 'renew' });
  }

  function resetRevision() {
    setRevision(null); setBasis('include_pending'); setSelection(null); setGeneration(value => value + 1);
  }

  const sourceControls = source && <div className="space-y-3">
    <Field label="Start sessions after" id="renewal-coverage-basis"><Select value={basis} onChange={event => { setBasis(event.target.value as BillingContextBasis); setSelection(null); }}><option value="paid_only">Paid enrollments</option><option value="include_pending">Paid + unpaid enrollments</option></Select></Field>
    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Continuing timetable</legend>
      {source.slot_candidates.map(slot => {
        const checked = selected.includes(slot.enrollment_id);
        return <label key={slot.enrollment_id} className="flex items-start gap-2 rounded border border-line p-3 text-sm"><input className="mt-1" type="checkbox" checked={checked} disabled={checked ? selected.length <= 1 : selected.length >= 2} onChange={event => setSelection((event.target.checked ? [...selected, slot.enrollment_id] : selected.filter(id => id !== slot.enrollment_id)).sort((a, b) => a - b))} /><span>{slot.weekday} {slot.time_slot} @ {slot.location}<span className="mt-1 block text-xs text-ink-subtle">{slot.tutor_name} · Last paid session: {slot.last_paid_original_date ? formatShortDate(slot.last_paid_original_date) : 'Not recorded'}</span></span></label>;
      })}
      {selection !== null && <Button size="sm" onClick={() => setSelection(null)}>Reset timetable</Button>}
    </fieldset>
  </div>;

  const scenario = revision ? { ...revision.review.scenario, coupon: revision.review.scenario.coupon ? { ...revision.review.scenario.coupon, verified: false } : null } : source?.suggested_request;
  if (intakeDraftId) return <BillingEnrollmentIntake studentId={studentId} initialDraftId={intakeDraftId}
    onBusyChange={setFormBusy} onCreated={changed} />;
  return <div ref={body} tabIndex={-1} className="outline-none"><fieldset disabled={busy} className="min-w-0 space-y-4">
    {optionsRequest.error && <div role="alert" className="space-y-2 text-sm"><p>Could not load renewal settings.</p><Button size="sm" onClick={() => optionsRequest.mutate()}>Retry settings</Button></div>}
    {!options && !optionsRequest.error && <p role="status" className="text-sm text-ink-subtle">Loading renewal settings…</p>}
    {options && action.kind !== 'payment' && <BillingPaymentSettings studentId={studentId} presentation="inline" storageAvailable={!!options?.workflow_available} canWrite={!!options?.preferences_writes_available}
      recordedMethod={recordedMethod} mandateReady={source ? source.mandate_ready : row.mandate_ready} previewMethod={previewMethod}
      onPreviewMethod={action.kind === 'renew' ? setMethod : undefined} onBusyChange={setSettingsBusy} onSaved={() => { void context.mutate(); onChanged(); }} />}
    {action.kind === 'renew' && <>
      {!source && !sourceError && <p role="status" className="text-sm text-ink-subtle">Loading enrollment records…</p>}
      {sourceError && <div role="alert" className="space-y-2 text-sm"><p>{sourceError}</p><Button size="sm" onClick={() => context.mutate()}>Retry records</Button></div>}
      {source && !previewMethod && <><p className="text-sm text-ink-subtle">Choose Manual or Autopay to preview the next enrollment.</p><BillingChecks issues={source.issues} compact /></>}
      {source && previewMethod && scenario && <BillingPreview onBusyChange={setFormBusy} key={generation} focused embedded initialRequest={{ ...scenario, payment_method: previewMethod }}
        focusedPeriodNumber={revision?.review.period.number ?? 1} sourceKey={source.source_fingerprint} sourceLoading={context.isValidating || !!sourceError} sourceError={sourceError}
        onRetrySource={() => { void context.mutate(); }} contextIssues={source.issues} editorContent={sourceControls} couponSnapshot={source.coupon_snapshot}
        draftContext={{ studentId, basis, selectedEnrollmentIds: selected, sourceFingerprint: source.source_fingerprint }}
        revisionTarget={revision ? { id: revision.id, current_revision: revision.current_revision } : undefined} onCancelRevision={resetRevision}
        onDraftSaved={draft => { if (onBatchDraftSaved) { onBatchDraftSaved(draft); return; } setSavedRevision(draft.revision); setRevision(null); setAction({ kind: 'draft', id: draft.id }); onChanged(); }} />}
      {source && previewMethod && !scenario && <div className="space-y-3"><p className="text-sm">Check the continuing timetable before preparing the renewal.</p><BillingChecks issues={source.issues} />{sourceControls}</div>}
    </>}
    {action.kind === 'draft' && options && !options.draft_storage_available && <p className="text-sm text-ink-subtle">Saved drafts are not available right now.</p>}
    {action.kind === 'payment' && options && !options.workflow_available && <p className="text-sm text-ink-subtle">Payment records are not available right now.</p>}
    {action.kind === 'draft' && options?.draft_storage_available && <BillingSavedDrafts inline onBusyChange={setFormBusy} key={action.id} studentId={studentId} scope={scope} initialDraftId={action.id} savedRevision={savedRevision}
      workflowAvailable={!!options.workflow_available} workflowWritesAvailable={!!options.workflow_writes_available} onRevise={revise}
      onDiscarded={() => { resetRevision(); setAction({ kind: 'renew' }); onChanged(); }}
      onOpenPayment={id => setAction({ kind: 'payment', id })} onConfirmed={payment => { setAction({ kind: 'payment', id: payment.id }); changed(); }} />}
    {action.kind === 'payment' && options?.workflow_available && <BillingPayments inline onBusyChange={setFormBusy} key={action.id} studentId={studentId} initialPaymentId={action.id} canWrite={!!options.workflow_writes_available} onChanged={changed} onOpenEnrollment={onOpenEnrollment} />}
  </fieldset></div>;
}
