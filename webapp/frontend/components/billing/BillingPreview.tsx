"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Calculator, Loader2, Settings2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/lib/hooks';
import { statsAPI } from '@/lib/api';
import { billingAPI } from '@/lib/billing-api';
import { BILLING_DAYS, suggestedStartAfterTrial, weekdayForDate } from '@/lib/billing-preview';
import { WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS } from '@/lib/constants';
import type { BillingContextBasis, BillingDraftDetail, BillingIntakeRequest, BillingMethod, BillingMode, BillingPreviewRequest, BillingPreviewResponse, BillingSlot, BillingWeekday, StudentBillingContext } from '@/types/billing';
import { Badge, Button, Field, Input, PageHeader, Select, Textarea } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { BillingCouponPanel } from './BillingCouponPanel';
import { BillingChecks } from './BillingChecks';
import { PaymentJourney } from './PaymentJourney';
import { BillingEditorDialog } from './BillingEditorDialog';
import { BillingDraftReview } from './BillingDraftReview';

function selectableBranch(location: string) {
  return location !== 'Various' && location !== 'All Locations';
}

export function BillingPreview({ initialRequest, embedded = false, contextIssues = [], editorContent, couponSnapshot, sourceLoading = false, sourceKey, sourceError, onRetrySource, draftContext, revisionTarget, onDraftSaved, onCancelRevision, focused = false, focusedPeriodNumber = 1, onBusyChange, intake, intakeTutors = [], defaultMaterialsFee, materialsBasis }: {
  initialRequest?: BillingPreviewRequest;
  embedded?: boolean;
  /** Show the next reviewed collection inside the renewal workspace. */
  focused?: boolean;
  focusedPeriodNumber?: number;
  onBusyChange?: (busy: boolean) => void;
  contextIssues?: BillingPreviewResponse['issues'];
  editorContent?: ReactNode;
  couponSnapshot?: StudentBillingContext['coupon_snapshot'];
  sourceLoading?: boolean;
  sourceKey?: string;
  sourceError?: string;
  onRetrySource?: () => void;
  draftContext?: { studentId: number; basis: BillingContextBasis; selectedEnrollmentIds: number[]; sourceFingerprint: string };
  revisionTarget?: { id: string; current_revision: number };
  onDraftSaved?: (draft: BillingDraftDetail) => void;
  onCancelRevision?: () => void;
  intake?: BillingIntakeRequest;
  intakeTutors?: { id: number; tutor_name: string }[];
  defaultMaterialsFee?: number | null;
  materialsBasis?: string;
}) {
  usePageTitle(focused ? undefined : embedded && !intake ? 'Student payment journey' : 'Enrollment fee preview');
  const params = useSearchParams();
  const { user, isLoading: authLoading, isAdmin, isGuest } = useAuth();
  const [firstDate, setFirstDate] = useState(() => initialRequest?.first_lesson_date || suggestedStartAfterTrial(params.get('trial_date') || ''));
  const [mode, setMode] = useState<BillingMode>(initialRequest?.mode || 'new_student');
  const sourceVersion = sourceKey ?? JSON.stringify(initialRequest);
  const [appliedSourceVersion, setAppliedSourceVersion] = useState(sourceVersion);
  const needsRebase = sourceVersion !== appliedSourceVersion;
  const method = initialRequest?.payment_method || 'manual';
  const [slots, setSlots] = useState<BillingSlot[]>(() => initialRequest?.slots.map(slot => ({ ...slot, location: selectableBranch(slot.location || '') ? slot.location : '', holiday_exceptions: slot.holiday_exceptions?.slice() })) || [{
    weekday: weekdayForDate(suggestedStartAfterTrial(params.get('trial_date') || '')) || 'Mon',
    time_slot: params.get('time_slot') || '', location: selectableBranch(params.get('location') || '') ? params.get('location') || '' : '',
  }]);
  const [materials, setMaterials] = useState(initialRequest?.materials_fee == null ? '' : String(initialRequest.materials_fee));
  const [materialsEdited, setMaterialsEdited] = useState(initialRequest?.mode === 'new_student' && initialRequest.materials_fee != null);
  const [deduction, setDeduction] = useState(() => initialRequest ? initialRequest.coupon?.kind || (initialRequest.trial_deduction ? 'trial' : 'none') : params.get('trial_date') ? 'trial' : 'none');
  const [couponValue, setCouponValue] = useState(initialRequest?.coupon ? String(initialRequest.coupon.value) : '');
  const [couponExpiry, setCouponExpiry] = useState(initialRequest?.coupon?.expires_on || '');
  const [couponCount, setCouponCount] = useState(initialRequest?.coupon?.available_count == null ? '' : String(initialRequest.coupon.available_count));
  const [couponVerified, setCouponVerified] = useState(initialRequest?.coupon?.verified || false);
  const [couponBalanceVersion, setCouponBalanceVersion] = useState<number | null>(null);
  const couponVersion = JSON.stringify([couponSnapshot ?? null, couponBalanceVersion]);
  const [verifiedCouponVersion, setVerifiedCouponVersion] = useState(couponVersion);
  const couponEvidenceChanged = couponVersion !== verifiedCouponVersion;
  const [combineCoupon, setCombineCoupon] = useState(initialRequest?.coupon?.combine_next_month || false);
  const [mandateReady, setMandateReady] = useState(initialRequest?.mandate_ready || false);
  const [adjust, setAdjust] = useState(!!initialRequest?.adjustment);
  const [adjustThrough, setAdjustThrough] = useState(initialRequest?.adjustment?.through || '');
  const [adjustReason, setAdjustReason] = useState(initialRequest?.adjustment?.reason || '');
  const [intakeSlots, setIntakeSlots] = useState(() => intake?.slots.map(slot => ({ ...slot })) || []);
  const [materialsReason, setMaterialsReason] = useState(intake?.materials_override_reason || '');
  const [reviewBusy, setReviewBusy] = useState(false);
  const reviewBusyChanged = useCallback((busy: boolean) => { setReviewBusy(busy); onBusyChange?.(busy); }, [onBusyChange]);
  const [result, setResult] = useState<{ key: string; data: Record<BillingMethod, BillingPreviewResponse> } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorView, setEditorView] = useState<'details' | 'adjustments'>('details');
  const editorId = useId();
  const editorRoot = useRef<HTMLDivElement | null>(null);
  const [customTimetable, setCustomTimetable] = useState(false);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const enabled = !!user && !isGuest;
  const sourceBlocked = sourceLoading || !!sourceError;
  const { data: options, error: optionsError, mutate: reloadOptions } = useSWR(enabled ? 'billing-preview-options' : null, billingAPI.options);
  const { data: locations = [] } = useSWR(enabled ? 'locations' : null, statsAPI.getLocations);
  const couponSelected = deduction === 'ordinary' || deduction === 'staff';
  const materialsChanged = !!intake && (materials === '' ? null : Number(materials)) !== defaultMaterialsFee;
  const intakeRequest: BillingIntakeRequest | undefined = intake ? { ...intake, slots: intakeSlots,
    materials_override_reason: materialsChanged ? materialsReason.trim() || null : null } : undefined;
  const intakeReady = !intake || (intakeSlots.length === slots.length && intakeSlots.every(slot => slot.tutor_id > 0)
    && (!materialsChanged || (isAdmin && !!materialsReason.trim())));

  useEffect(() => {
    if (!needsRebase || !initialRequest) return;
    if (!intake) {
      setFirstDate(initialRequest.first_lesson_date);
      setMode(initialRequest.mode);
      if (initialRequest.mode === 'new_student' && !materialsEdited) setMaterials(initialRequest.materials_fee == null ? '' : String(initialRequest.materials_fee));
      setSlots(initialRequest.slots.map(slot => ({ ...slot,
        location: selectableBranch(slot.location || '') ? slot.location : '',
        holiday_exceptions: slot.holiday_exceptions?.slice(),
      })));
      if (initialRequest.mode !== 'new_student' && deduction === 'trial') setDeduction('none');
    } else setCouponVerified(false);
    setAppliedSourceVersion(sourceVersion);
  }, [needsRebase, initialRequest, sourceVersion, deduction, materialsEdited, intake]);

  useEffect(() => {
    if (!couponEvidenceChanged) return;
    setCouponVerified(false);
    setVerifiedCouponVersion(couponVersion);
  }, [couponEvidenceChanged, couponVersion]);

  const request = useMemo<BillingPreviewRequest | null>(() => {
    if (!firstDate || !weekdayForDate(firstDate) || (adjust && isAdmin && (!adjustThrough || !adjustReason.trim()))) return null;
    if (mode === 'new_student' && materials !== '' && (!Number.isInteger(Number(materials)) || Number(materials) < 0)) return null;
    if (couponSelected && deduction !== 'staff' && (!Number.isInteger(Number(couponValue)) || Number(couponValue) <= 0)) return null;
    if (couponSelected && couponCount !== '' && (!Number.isInteger(Number(couponCount)) || Number(couponCount) < 0)) return null;
    if (slots.some(slot => slot.holiday_exceptions?.some(day => !weekdayForDate(day)))) return null;
    return {
      first_lesson_date: firstDate, slots: mode === 'new_student' ? slots.map(slot => ({ ...slot, covered_through: null })) : slots, mode, payment_method: method,
      materials_fee: mode === 'new_student' ? (materials === '' ? null : Number(materials)) : 0,
      trial_deduction: mode === 'new_student' && deduction === 'trial', mandate_ready: mandateReady,
      adjustment: adjust && isAdmin ? { through: adjustThrough, reason: adjustReason.trim() } : null,
      coupon: couponSelected ? {
        kind: deduction as 'ordinary' | 'staff', value: deduction === 'staff' ? 500 : Number(couponValue),
        expires_on: couponExpiry || null, available_count: couponCount === '' ? null : Number(couponCount),
        verified: couponVerified && !couponEvidenceChanged, combine_next_month: combineCoupon,
      } : null,
    };
  }, [firstDate, slots, mode, method, materials, deduction, mandateReady, adjust, adjustThrough, adjustReason,
    isAdmin, couponSelected, couponValue, couponExpiry, couponCount, couponVerified, couponEvidenceChanged, combineCoupon]);
  const currentKey = JSON.stringify({ request, sourceVersion, intake: intakeRequest, intakeReady });
  const preview = !sourceBlocked && !needsRebase && result?.key === currentKey ? result.data : null;
  const error = !sourceBlocked && !needsRebase && failure?.key === currentKey ? failure.message : null;

  useEffect(() => {
    if (!enabled || !options || !request || sourceBlocked || needsRebase) return;
    const key = currentKey;
    const controller = new AbortController();
    setResult(null);
    setFailure(null);
    const timer = setTimeout(() => {
      const methods: BillingMethod[] = focused ? [request.payment_method] : request.payment_method === 'autopay' ? ['autopay', 'manual'] : ['manual', 'autopay'];
      Promise.all(methods.map(async payment_method => [payment_method,
        await billingAPI.preview({ ...request, payment_method }, controller.signal)] as const)).then(entries => {
        const data = Object.fromEntries(entries) as Record<BillingMethod, BillingPreviewResponse>;
        if (!controller.signal.aborted) {
          setResult({ key, data });
          setFailure(null);
        }
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setFailure({ key, message: error instanceof Error ? error.message : 'Could not calculate this payment.' });
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, options, request, attempt, sourceBlocked, needsRebase, currentKey, focused]);

  function updateSlot(index: number, change: Partial<BillingSlot>) {
    if (change.location && !selectableBranch(change.location)) change = { ...change, location: '' };
    setSlots(current => current.map((slot, i) => i === index ? { ...slot, ...change } : slot));
  }

  if (authLoading) return <p className="p-6">Loading…</p>;
  if (!user || isGuest) return <p className="p-6">Staff access is required to preview enrollment fees.</p>;

  function selectEditorView(next: 'details' | 'adjustments') {
    setEditorView(next);
    const dialog = editorRoot.current?.closest('[role="dialog"]');
    let container = editorRoot.current?.parentElement;
    while (container && container !== dialog) {
      container.scrollTop = 0;
      container = container.parentElement;
    }
  }

  function changeEditorTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'details' : event.key === 'End' ? 'adjustments' : editorView === 'details' ? 'adjustments' : 'details';
    selectEditorView(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-editor-tab="${next}"]`)?.focus();
  }

  const editor = <div ref={editorRoot} className="space-y-5">
    <div role="tablist" aria-label="Preview settings" className="sticky -top-3 z-10 flex gap-4 border-b border-line bg-paper pb-3 pt-3 sm:-top-4">
      {([{ value: 'details', label: 'Enrollment & fees' }, { value: 'adjustments', label: 'Adjustments' }] as const).map(tab => <button key={tab.value} type="button" role="tab" data-editor-tab={tab.value} id={`${editorId}-${tab.value}-tab`} aria-controls={`${editorId}-${tab.value}-panel`} aria-selected={editorView === tab.value} tabIndex={editorView === tab.value ? 0 : -1} onKeyDown={changeEditorTab} onClick={() => selectEditorView(tab.value)} className={`border-b-2 pb-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${editorView === tab.value ? 'border-primary text-accent-ink' : 'border-transparent text-ink-subtle hover:text-foreground'}`}>
        {tab.label}
      </button>)}
    </div>
    <div role="tabpanel" id={`${editorId}-details-panel`} aria-labelledby={`${editorId}-details-tab`} hidden={editorView !== 'details'} className="space-y-5">
    <section className="space-y-3" aria-labelledby="preview-starting-point">
      <h3 id="preview-starting-point" className="text-sm font-semibold">Sessions</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={mode === 'new_student' ? 'First regular lesson' : 'First session to charge'} id="billing-start"><Input type="date" disabled={sourceBlocked} value={firstDate} min={mode === 'new_student' ? options?.first_payment_from : options?.academic_start} max={options?.regular_end} onChange={e => {
          setFirstDate(e.target.value);
          const day = weekdayForDate(e.target.value);
          if (day && slots.length === 1) updateSlot(0, { weekday: day });
        }} /></Field>
      </div>
      {params.get('trial_date') && <p className="text-xs text-ink-subtle">Confirm the first regular lesson after the trial.</p>}
    </section>
    <section className="space-y-3 border-t border-line pt-4" aria-labelledby="preview-classes">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="preview-classes" className="text-sm font-semibold">Classes</h3>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={customTimetable} onChange={e => setCustomTimetable(e.target.checked)} />Enter a custom timetable</label>
      </div>
      {slots.map((slot, i) => {
        const times: readonly string[] = ['Sat', 'Sun'].includes(slot.weekday) ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
        const branches = [...new Set([...locations, slot.location || ''].filter(branch => !!branch && selectableBranch(branch)))];
        return <fieldset key={i} className="rounded-md border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-subtle">{slots.length === 1 ? 'Weekly class' : `Class ${i + 1}`}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Weekday" id={`billing-day-${i}`}><Select disabled={sourceBlocked} value={slot.weekday} onChange={e => updateSlot(i, { weekday: e.target.value as BillingWeekday })}>{BILLING_DAYS.map(day => <option key={day}>{day}</option>)}</Select></Field>
            {intake && <Field label="Tutor" id={`billing-tutor-${i}`}><Select disabled={sourceBlocked} value={intakeSlots[i]?.tutor_id || ''} onChange={event => setIntakeSlots(current => current.map((value, index) => index === i ? { ...value, tutor_id: Number(event.target.value) } : value))}><option value="">Choose tutor</option>{intakeTutors.map(tutor => <option key={tutor.id} value={tutor.id}>{tutor.tutor_name}</option>)}</Select></Field>}
            {customTimetable ? <>
              <Field label={`Custom time for class ${i + 1}`} id={`billing-custom-time-${i}`}><Input disabled={sourceBlocked} value={slot.time_slot || ''} placeholder="16:45 - 18:15" maxLength={100} onChange={e => updateSlot(i, { time_slot: e.target.value })} /></Field>
              <Field label={`Custom branch for class ${i + 1}`} id={`billing-custom-location-${i}`}><Input disabled={sourceBlocked} value={slot.location || ''} placeholder="MSA" maxLength={100} onChange={e => updateSlot(i, { location: e.target.value })} /></Field>
            </> : <>
              <Field label="Time" id={`billing-time-${i}`}><Select disabled={sourceBlocked} value={slot.time_slot || ''} onChange={e => updateSlot(i, { time_slot: e.target.value })}><option value="">Choose time</option>{slot.time_slot && !times.includes(slot.time_slot) && <option value={slot.time_slot}>{slot.time_slot}</option>}{times.map(time => <option key={time}>{time}</option>)}</Select></Field>
              <Field label="Branch" id={`billing-location-${i}`}><Select disabled={sourceBlocked} value={slot.location || ''} onChange={e => updateSlot(i, { location: e.target.value })}><option value="">Choose branch</option>{branches.map(branch => <option key={branch}>{branch}</option>)}</Select></Field>
            </>}
          </div>
        </fieldset>;
      })}
      <Button size="sm" variant="quiet" disabled={sourceBlocked} onClick={() => {
        setSlots(current => current.length === 1 ? [...current, { weekday: BILLING_DAYS[(BILLING_DAYS.indexOf(current[0].weekday) + 2) % 7], location: current[0].location }] : current.slice(0, 1));
        if (intake) setIntakeSlots(current => current.length === 1 ? [...current, { tutor_id: 0 }] : current.slice(0, 1));
      }}>{slots.length === 1 ? 'Add second weekly class' : 'Remove second weekly class'}</Button>
    </section>
    <section className="space-y-3 border-t border-line pt-4" aria-labelledby="preview-discounts">
      <h3 id="preview-discounts" className="text-sm font-semibold">Discounts and materials</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Discount" id="billing-deduction"><Select value={deduction} onChange={e => { setDeduction(e.target.value); setCouponVerified(false); }}><option value="none">No discount</option>{mode === 'new_student' && (!intake || intake.trial_enrollment_id) && <option value="trial">$150 trial deduction</option>}<option value="ordinary">Coupon</option><option value="staff">$500 staff voucher</option></Select></Field>
        {mode === 'new_student' && <Field label="Materials charge" id="billing-materials" hint={materialsBasis || 'Enter 0 if waived.'}><Input disabled={!!intake && !isAdmin} type="number" min="0" max="10000" step="1" placeholder="To confirm" value={materials} onChange={e => { setMaterials(e.target.value); setMaterialsEdited(true); }} /></Field>}
        {materialsChanged && <Field label="Reason for materials adjustment" id="billing-materials-reason"><Textarea disabled={!isAdmin} value={materialsReason} maxLength={500} onChange={event => setMaterialsReason(event.target.value)} /></Field>}
      </div>
      {draftContext ? <BillingCouponPanel studentId={draftContext.studentId} legacyCount={couponSnapshot?.remaining_count} onVersion={setCouponBalanceVersion} onChanged={onRetrySource} onSelect={group => { setDeduction(group.kind); setCouponValue(String(group.value)); setCouponExpiry(group.expires_on); setCouponCount(String(group.usable_count)); setCouponVerified(true); }} /> : couponSnapshot && <div className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle"><Badge>{couponSnapshot.remaining_count} {couponSnapshot.remaining_count === 1 ? 'coupon' : 'coupons'}</Badge><span>Check KMS before use.</span></div>}
      {couponSelected && <fieldset className="rounded-md border border-line p-3 space-y-3">
        <legend className="px-1 text-xs font-medium">Coupon details</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {deduction !== 'staff' && <Field label="Coupon amount" id="billing-coupon-value"><Input type="number" min="1" max="10000" step="1" value={couponValue} onChange={e => { setCouponValue(e.target.value); setCouponVerified(false); }} /></Field>}
          <Field label="Coupon expiry" id="billing-coupon-expiry"><Input type="date" value={couponExpiry} onChange={e => { setCouponExpiry(e.target.value); setCouponVerified(false); }} /></Field>
          <Field label="Remaining coupon count" id="billing-coupon-count"><Input type="number" min="0" step="1" value={couponCount} onChange={e => { setCouponCount(e.target.value); setCouponVerified(false); }} /></Field>
        </div>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={couponVerified} onChange={e => setCouponVerified(e.target.checked)} />Checked in KMS</label>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={combineCoupon} onChange={e => setCombineCoupon(e.target.checked)} />Include the next month if needed for this coupon</label>
      </fieldset>}
    </section>

    </div>
    <div role="tabpanel" id={`${editorId}-adjustments-panel`} aria-labelledby={`${editorId}-adjustments-tab`} hidden={editorView !== 'adjustments'} className="space-y-5">
    {editorContent && <section className="space-y-3" aria-labelledby="preview-enrollment-records">
      <h3 id="preview-enrollment-records" className="text-sm font-semibold">Existing enrollments</h3>
      {editorContent}
    </section>}
    <section className="space-y-3 border-t border-line pt-4" aria-labelledby="preview-autopay">
      <h3 id="preview-autopay" className="text-sm font-semibold">Payment schedule</h3>
{!intake && <Field label="Preview for" id="billing-mode"><Select value={mode} onChange={e => {
          const next = e.target.value as BillingMode;
          if (next === 'new_student' && !materialsEdited) setMaterials('');
          setMode(next); setDeduction(next === 'new_student' && params.get('trial_date') ? 'trial' : 'none'); setAdjust(false);
        }}><option value="new_student">New or returning student</option><option value="transition">Existing student transition</option><option value="regular">Ongoing payments</option></Select></Field>}
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={mandateReady} onChange={e => setMandateReady(e.target.checked)} />Compare with autopay setup complete</label>
    </section>
    <section className="space-y-3 border-t border-line pt-4" aria-labelledby="preview-adjustments">
      <h3 id="preview-adjustments" className="text-sm font-semibold">Date exceptions</h3>
      <p className="text-xs text-ink-subtle">Add an exception only when a regular class will run on a holiday.</p>
      {slots.map((slot, i) => <fieldset key={i} className="space-y-3 rounded-md border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink-subtle">{slot.weekday} {slot.time_slot}</legend>
        {mode !== 'new_student' && <Field label="Existing coverage through" id={`billing-covered-${i}`}><Input type="date" disabled={sourceBlocked} value={slot.covered_through || ''} max={options?.regular_end} onChange={e => updateSlot(i, { covered_through: e.target.value || null })} /></Field>}
        {(slot.holiday_exceptions || []).map((day, index) => <div key={index} className="flex items-end gap-2">
          <Field label="Holiday class date" id={`billing-holiday-${i}-${index}`}><Input type="date" disabled={sourceBlocked} value={day} min={options?.academic_start} max={options?.regular_end} onChange={e => updateSlot(i, { holiday_exceptions: slot.holiday_exceptions!.map((current, j) => j === index ? e.target.value : current) })} /></Field>
          <Button size="sm" disabled={sourceBlocked} onClick={() => updateSlot(i, { holiday_exceptions: slot.holiday_exceptions!.filter((_, j) => j !== index) })}>Remove</Button>
        </div>)}
        <Button size="sm" disabled={sourceBlocked || (slot.holiday_exceptions?.length || 0) >= 30} onClick={() => updateSlot(i, { holiday_exceptions: [...(slot.holiday_exceptions || []), ''] })}>Add class on a holiday</Button>
      </fieldset>)}
      {isAdmin && <>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} />Compare an adjusted first payment</label>
        {adjust && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cover through" id="billing-adjust-through" hint="Use month-end or the final teaching day."><Input type="date" min={firstDate} max={options?.regular_end} value={adjustThrough} onChange={e => setAdjustThrough(e.target.value)} /></Field>
          <Field label="Reason for adjustment" id="billing-adjust-reason"><Textarea value={adjustReason} maxLength={500} onChange={e => setAdjustReason(e.target.value)} /></Field>
        </div>}
      </>}
    </section>
    </div>
  </div>;

  const editAction = <Button ref={editorTrigger} size="sm" icon={Settings2} disabled={reviewBusy} onClick={() => setEditorOpen(true)}>Edit preview</Button>;
  const sourceFailure = sourceError && <div role="alert" className="space-y-2"><p>{sourceError}</p>{onRetrySource && <Button size="sm" onClick={onRetrySource}>Retry records</Button>}</div>;
  const calculationError = error && <div role="alert" className="space-y-2"><p>{error}</p><Button size="sm" onClick={() => setAttempt(value => value + 1)}>Retry calculation</Button></div>;
  const policyError = optionsError && <div role="alert" className="space-y-2"><p>Could not load the fee policy.</p><Button size="sm" onClick={() => reloadOptions()}>Retry</Button></div>;
  const journey = <div className="min-w-0 space-y-4" aria-live="polite" aria-busy={!!request && !!options && !preview && !error && !sourceError}>
    {revisionTarget && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-wash px-3 py-2 text-sm"><span>Preparing revision {revisionTarget.current_revision + 1}</span><Button size="sm" variant="quiet" onClick={onCancelRevision}>Cancel revision</Button></div>}
    {!preview && <div className="flex justify-end">{editAction}</div>}
    <BillingChecks issues={contextIssues} compact />
    {intake && !intakeReady && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{materialsChanged && !materialsReason.trim() ? 'Enter a reason for the materials adjustment before reviewing the payment.' : 'Choose a tutor for each weekly class before reviewing the payment.'}</p>}
    {!request && <p className="rounded-md border border-line p-4 text-sm text-ink-subtle">Open Edit preview to enter the enrollment details.</p>}
    {sourceLoading && !editorOpen && <p role="status" className="text-sm text-ink-subtle">Refreshing enrollment records…</p>}
    {!editorOpen && !sourceBlocked && request && options && !preview && !error && <p role="status" className="flex items-center gap-2 text-sm text-ink-subtle"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Calculating both payment methods…</p>}
    {!editorOpen && calculationError}
    {preview && <PaymentJourney journeys={preview} slots={slots} unitFee={options!.unit_fee} initialMethod={method} actions={editAction}
      renderPaymentActions={draftContext && request && intakeReady ? event => (!intake || event.period.number === 1) && <BillingDraftReview key={`${currentKey}:${event.method}:${event.period.number}`}
        studentId={draftContext.studentId}
        onBusyChange={reviewBusyChanged}
        calculation={preview[event.method]}
        reviewRequest={{ scenario: { ...request, payment_method: event.method }, basis: draftContext.basis,
          selected_enrollment_ids: draftContext.selectedEnrollmentIds, expected_source_fingerprint: draftContext.sourceFingerprint,
          period_number: event.period.number, confirmed_checks: [], ...(intakeRequest ? { intake: intakeRequest } : {}) }}
        storageAvailable={!!options?.draft_storage_available} revisionTarget={revisionTarget} onSaved={onDraftSaved} /> : undefined} />}
  </div>;
  if (focused) {
    const period = preview?.[method]?.periods.find(value => value.number === focusedPeriodNumber);
    return <div className="space-y-4" aria-label="Renewal calculation">
      {editorOpen ? <><Button size="sm" onClick={() => setEditorOpen(false)}>Back to renewal</Button>{sourceFailure}{calculationError}{policyError}{editor}</> : <>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{revisionTarget ? `Revision ${revisionTarget.current_revision + 1}` : 'Next enrollment'}</h3>{editAction}</div>
        {revisionTarget && <Button size="sm" variant="quiet" onClick={onCancelRevision}>Cancel revision</Button>}
        {sourceFailure}{policyError}{calculationError}
        <BillingChecks issues={contextIssues} compact />
        {!request && <p className="text-sm text-ink-subtle">Open Edit preview to check the enrollment details.</p>}
        {sourceLoading && <p role="status" className="text-sm text-ink-subtle">Refreshing enrollment records…</p>}
        {!sourceBlocked && request && options && !preview && !error && <p role="status" className="text-sm text-ink-subtle">Calculating enrollment…</p>}
        {preview && !period && <p className="text-sm text-ink-subtle">No payment is needed for this period.</p>}
        {period && draftContext && request && intakeReady && <BillingDraftReview inline onBusyChange={reviewBusyChanged} key={`${currentKey}:${method}:${period.number}`}
          studentId={draftContext.studentId}
          calculation={preview?.[method]}
          reviewRequest={{ scenario: { ...request, payment_method: method }, basis: draftContext.basis,
            selected_enrollment_ids: draftContext.selectedEnrollmentIds, expected_source_fingerprint: draftContext.sourceFingerprint,
            period_number: period.number, confirmed_checks: [], ...(intakeRequest ? { intake: intakeRequest } : {}) }}
          storageAvailable={!!options?.draft_storage_available} revisionTarget={revisionTarget} onSaved={onDraftSaved} />}
      </>}
    </div>;
  }
  const Surface = embedded ? 'div' : PageSurface;
  return <Surface><div className={embedded ? 'space-y-4' : 'mx-auto max-w-7xl space-y-5 p-4 sm:p-6'}>
    {!embedded && <PageHeader title="Enrollment fee preview" icon={Calculator} titleExtra={<Badge>Preview</Badge>} backHref="/billing" backLabel="Back to payment journeys" />}
    {!editorOpen && policyError}
    {journey}
    <BillingEditorDialog open={editorOpen} onClose={() => setEditorOpen(false)} trigger={editorTrigger}
      status={sourceFailure || calculationError || policyError || (sourceLoading ? <span role="status">Refreshing enrollment records…</span> : request && options && !preview ? <span role="status">Updating preview…</span> : null)}>{editor}</BillingEditorDialog>
  </div></Surface>;
}
