'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/controls';
import { StudentInfoBadges } from '@/components/ui/student-info-badges';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveTutors, invalidateCaches } from '@/lib/hooks';
import { billingAPI } from '@/lib/billing-api';
import { formatShortDate } from '@/lib/formatters';
import { BillingRenewalCreator } from '@/lib/billing-renewal-create';
import { suggestedStartAfterTrial } from '@/lib/billing-preview';
import type { BillingDraftDetail, BillingIntakeContext, BillingIntakeRequest, BillingMethod, BillingPreviewRequest, BillingPaymentDetail, BillingSlot } from '@/types/billing';
import { billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';
import { BillingChecks } from './BillingChecks';
import { BillingPaymentSettings } from './BillingPaymentSettings';
import { BillingPayments } from './BillingPayments';
import { BillingPreview } from './BillingPreview';
import { BillingSavedDrafts } from './BillingSavedDrafts';

export interface BillingEnrollmentIntakeProps {
  studentId: number;
  trialEnrollmentId?: number;
  trialSessionId?: number;
  initialFirstLessonDate?: string;
  initialSlots?: BillingSlot[];
  initialIntakeSlots?: BillingIntakeRequest['slots'];
  initialDraftId?: string;
  initialContext?: { data: BillingIntakeContext; authScope: string };
  onCreated?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

/** The existing enrollment modal keeps its schedule form and uses this reviewed first payment. */
export function BillingEnrollmentIntake(props: BillingEnrollmentIntakeProps) {
  const auth = useAuth();
  const scope = JSON.stringify([props.studentId, props.trialEnrollmentId, props.trialSessionId, props.initialDraftId,
    props.initialContext?.data.source_fingerprint, billingDraftAuthScope(auth)]);
  return <IntakeContent key={scope} {...props} scope={scope} />;
}

function IntakeContent({ studentId, trialEnrollmentId, trialSessionId, initialFirstLessonDate, initialSlots, initialIntakeSlots, initialDraftId, initialContext, onCreated, onBusyChange, scope }: BillingEnrollmentIntakeProps & { scope: string }) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const enabled = !!auth.user && !auth.isGuest;
  const { data: tutors = [] } = useActiveTutors();
  const options = useSWR(enabled ? 'billing-preview-options' : null, billingAPI.options);
  const preparedContext = initialContext?.authScope === billingDraftAuthScope(auth) ? initialContext.data : null;
  const initialSource = preparedContext?.student.id === studentId
    && (trialEnrollmentId === undefined || (preparedContext.trial?.enrollment_id === trialEnrollmentId && preparedContext.trial.session_id === trialSessionId)) ? preparedContext : null;
  const preparedKey = useRef(initialSource ? JSON.stringify([studentId, trialEnrollmentId, trialSessionId, tutorId, 0]) : null);
  const [context, setContext] = useState<BillingIntakeContext | null>(initialSource);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedContextKey, setLoadedContextKey] = useState<string | null>(preparedKey.current);
  const creator = useRef(new BillingRenewalCreator());
  const [createdPayment, setCreatedPayment] = useState<BillingPaymentDetail | null>(null);
  const success = useRef<HTMLDivElement>(null);
  useEffect(() => { if (createdPayment) success.current?.focus(); }, [createdPayment]);
  const [method, setMethod] = useState<BillingMethod | undefined>();
  const [action, setAction] = useState<{ kind: 'preview' } | { kind: 'draft' | 'payment'; id: string }>(initialDraftId ? { kind: 'draft', id: initialDraftId } : { kind: 'preview' });
  const [revision, setRevision] = useState<BillingDraftDetail | null>(null);
  const contextTrialEnrollment = revision?.review.intake?.trial_enrollment_id ?? trialEnrollmentId;
  const contextTrialSession = revision?.review.intake?.trial_session_id ?? trialSessionId;
  const contextKey = JSON.stringify([studentId, contextTrialEnrollment, contextTrialSession, tutorId, retry]);
  const contextPending = loadedContextKey !== contextKey;
  const [generation, setGeneration] = useState(0);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const busy = settingsBusy || formBusy;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    window.addEventListener('billing-settings-updated', refresh);
    return () => window.removeEventListener('billing-settings-updated', refresh);
  }, []);

  useEffect(() => {
    if (!enabled || preparedKey.current === contextKey) return;
    preparedKey.current = null;
    const abort = new AbortController();
    setLoading(true); setFailure(null);
    billingAPI.intakeContext(studentId, { trial_enrollment_id: contextTrialEnrollment, trial_session_id: contextTrialSession, tutor_id: tutorId }, abort.signal)
      .then(data => {
        if (abort.signal.aborted) return;
        if (data.student.id !== studentId || (contextTrialEnrollment !== undefined && (data.trial?.enrollment_id !== contextTrialEnrollment || data.trial.session_id !== contextTrialSession))) throw new Error('The trial or student changed. Open the enrollment again.');
        setContext(data);
        setLoadedContextKey(contextKey);
      }).catch(error => { if (!abort.signal.aborted) setFailure(error instanceof Error ? error.message : 'Could not load enrollment details.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [enabled, studentId, contextTrialEnrollment, contextTrialSession, tutorId, retry, contextKey]);

  if (auth.isLoading) return <p role="status" className="text-sm text-ink-subtle">Loading enrollment details…</p>;
  if (!enabled) return <p className="text-sm">Staff access is required to preview enrollment fees.</p>;
  if (options.error) return <div role="alert" className="space-y-2 text-sm"><p>Could not load the fee policy.</p><Button size="sm" onClick={() => options.mutate()}>Retry settings</Button></div>;
  if (failure && !context) return <div role="alert" className="space-y-2 text-sm"><p>{failure}</p><Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry enrollment details</Button></div>;
  if (!context || !options.data) return <p role="status" className="text-sm text-ink-subtle">Checking enrollment details…</p>;

  const trial = context.trial;
  const firstDate = initialFirstLessonDate || context.suggested_request?.first_lesson_date || (trial ? suggestedStartAfterTrial(trial.session_date) : '');
  const plan = method ?? context.recorded_payment_method ?? 'manual';
  const slots = initialSlots ?? context.suggested_request?.slots ?? [];
  const mappings = initialIntakeSlots ?? (trial ? [{ tutor_id: trial.tutor_id, renewed_from_enrollment_id: trial.enrollment_id }] : []);
  const intake: BillingIntakeRequest = revision?.review.intake ?? { trial_enrollment_id: trial?.enrollment_id ?? null,
    trial_session_id: trial?.session_id ?? null, slots: mappings };
  const scenario: BillingPreviewRequest = revision ? { ...revision.review.scenario, mode: context.is_new_student ? 'new_student' : 'returning_student', payment_method: plan,
    coupon: revision.review.scenario.coupon ? { ...revision.review.scenario.coupon, verified: false } : null } : {
    first_lesson_date: firstDate, slots, mode: context.is_new_student ? 'new_student' : 'returning_student', payment_method: plan, materials_fee: context.materials_fee,
    trial_deduction: !!trial, mandate_ready: !!context.mandate_ready,
  };
  const canPreview = !!scenario.first_lesson_date && scenario.slots.length > 0 && intake.slots.length === scenario.slots.length;

  function changed() {
    invalidateCaches('enrollments', { studentId });
  }
  function created(payment: BillingPaymentDetail) {
    setCreatedPayment(payment); setRevision(null); setAction({ kind: 'payment', id: payment.id });
    changed(); onCreated?.();
  }
  function revise(draft: BillingDraftDetail) {
    setRevision(draft); setMethod(draft.review.scenario.payment_method); setGeneration(value => value + 1); setAction({ kind: 'preview' });
  }

  return <div className="space-y-4" aria-label="First enrollment payment">
    <StudentInfoBadges student={{ student_id: context.student.id, student_name: context.student.student_name,
      school_student_id: context.student.school_student_id ?? undefined, grade: context.student.grade ?? undefined,
      lang_stream: context.student.lang_stream ?? undefined, school: context.student.school ?? undefined }} nameHref={busy ? undefined : `/students/${studentId}`} />
    {action.kind === 'preview' && scenario.first_lesson_date && scenario.first_lesson_date < options.data.first_payment_from ? <div className="space-y-3"><p className="text-sm">The proposed first lesson is {formatShortDate(scenario.first_lesson_date)}. Use the existing enrollment flow for dates before {formatShortDate(options.data.first_payment_from)}.</p><Link href="/trials" className="text-sm font-medium text-accent-ink hover:underline">Open trials</Link></div> : <fieldset disabled={busy} className="min-w-0 space-y-4">
      {action.kind !== 'payment' && <BillingPaymentSettings studentId={studentId} presentation="inline" storageAvailable={!!options.data.workflow_available}
        canWrite={!!options.data.preferences_writes_available} recordedMethod={context.recorded_payment_method} mandateReady={context.mandate_ready}
        previewMethod={plan} onPreviewMethod={value => setMethod(value ?? 'manual')} onBusyChange={setSettingsBusy}
        onSaved={() => setRetry(value => value + 1)} />}
      {action.kind === 'preview' && <>
        {!canPreview ? <><p className="text-sm">Choose the actual first lesson and weekly classes in the enrollment form.</p><BillingChecks issues={context.issues} /></> : <BillingPreview key={generation} embedded focused initialRequest={scenario}
          renewalCreator={creator.current} onEnrollmentCreated={created}
          sourceKey={context.source_fingerprint} intakeScheduleKey={JSON.stringify([initialFirstLessonDate, initialSlots, initialIntakeSlots])} contextIssues={context.issues} couponSnapshot={context.coupon_snapshot}
          sourceLoading={loading || (contextPending && !failure)} sourceError={failure ?? undefined} onRetrySource={() => setRetry(value => value + 1)}
          intake={intake} intakeTutors={tutors} defaultMaterialsFee={context.materials_fee} standardMaterialsFee={context.standard_materials_fee} materialsBasis={context.materials_basis}
          draftContext={{ studentId, basis: 'include_pending', selectedEnrollmentIds: [], sourceFingerprint: context.source_fingerprint }}
          revisionTarget={revision ? { id: revision.id, current_revision: revision.current_revision } : undefined}
          onCancelRevision={() => { setRevision(null); setGeneration(value => value + 1); }}
          onBusyChange={setFormBusy} onDraftSaved={draft => { setRevision(null); setAction({ kind: 'draft', id: draft.id }); }} />}
      </>}
      {action.kind === 'draft' && <><Button size="sm" variant="quiet" icon={ArrowLeft} disabled={busy} onClick={() => setAction({ kind: 'preview' })}>Back to enrollment</Button><BillingSavedDrafts key={action.id} inline studentId={studentId} scope={scope} initialDraftId={action.id}
        workflowAvailable={!!options.data.workflow_available} workflowWritesAvailable={!!options.data.workflow_writes_available}
        onBusyChange={setFormBusy} onRevise={revise} onDiscarded={() => { setRevision(null); setAction({ kind: 'preview' }); }}
        onOpenPayment={id => setAction({ kind: 'payment', id })} onConfirmed={created} /></>}
      {createdPayment && action.kind === 'payment' && <div ref={success} role="status" tabIndex={-1} className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800 outline-none dark:border-green-800 dark:bg-green-950 dark:text-green-200"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />{createdPayment.lines?.length > 1 ? 'Enrollments created.' : 'Enrollment created.'}</div>}
      {action.kind === 'payment' && <BillingPayments presentation="renewal" initialDetail={createdPayment?.id === action.id ? createdPayment : undefined} key={action.id} inline studentId={studentId} initialPaymentId={action.id} canWrite={!!options.data.workflow_writes_available} onBusyChange={setFormBusy} onChanged={changed} />}
    </fieldset>}
  </div>;
}
