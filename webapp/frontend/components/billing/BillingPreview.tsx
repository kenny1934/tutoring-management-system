"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Calculator, Calendar, Clock, Loader2, MapPin, Settings2, type LucideIcon } from 'lucide-react';
import { TimeRangeInput } from '@/components/controls/TimeRangeInput';
import { parseTimeRange } from '@/lib/time-slots';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/lib/hooks';
import { statsAPI, tutorsAPI } from '@/lib/api';
import { billingAPI } from '@/lib/billing-api';
import { BILLING_DAYS, suggestedStartAfterTrial, weekdayForDate } from '@/lib/billing-preview';
import type { Tutor } from '@/types';
import type { BillingRenewalCreator } from '@/lib/billing-renewal-create';
import type { BillingRenewalSource } from '@/lib/billing-renewal';
import { pickableTutors, isHomeBranch } from '@/lib/employment';
import { getTutorSortName } from '@/components/zen/utils/sessionSorting';
import { DAY_NAMES, WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS } from '@/lib/constants';
import type { BillingContextBasis, BillingDraftDetail, BillingIntakeRequest, BillingMethod, BillingPaymentDetail, BillingMode, BillingPreviewRequest, BillingPreviewResponse, BillingSlot, BillingWeekday, StudentBillingContext } from '@/types/billing';
import { Badge, Button, Field, Input, PageHeader, Select, Textarea } from '@/components/controls';
import { PageSurface } from '@/components/layout/PageSurface';
import { BillingCouponPanel } from './BillingCouponPanel';
import { BillingRenewalCoupon, matchingRenewalCoupon, type RenewalCouponSelection } from './BillingRenewalCoupon';
import { BillingChecks } from './BillingChecks';
import { PaymentJourney } from './PaymentJourney';
import { BillingEditorDialog } from './BillingEditorDialog';
import { BillingDraftReview, billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';

function RenewalScheduleSelect({ icon: Icon, ...props }: ComponentProps<typeof Select> & { icon: LucideIcon }) {
  return <div className="relative"><Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" /><Select {...props} className="pl-10" /></div>;
}

function selectableBranch(location: string) {
  return location !== 'Various' && location !== 'All Locations';
}

function customTimeIndices(slots: BillingSlot[]) {
  return new Set(slots.flatMap((slot, index) => {
    const times: readonly string[] = slot.weekday === 'Sat' || slot.weekday === 'Sun' ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
    return slot.time_slot && !times.includes(slot.time_slot) ? [index] : [];
  }));
}

export function BillingPreview({ initialRequest, embedded = false, contextIssues = [], editorContent, couponSnapshot, sourceLoading = false, sourceKey, sourceError, onRetrySource, draftContext, revisionTarget, onDraftSaved, onCancelRevision, focused = false, focusedPeriodNumber = 1, onBusyChange, intake, intakeTutors = [], defaultMaterialsFee, materialsBasis, renewalSource, renewalCreator, onEnrollmentCreated, draftSaveLabel }: {
  renewalCreator?: BillingRenewalCreator;
  onEnrollmentCreated?: (payment: BillingPaymentDetail) => void;
  draftSaveLabel?: string;
  renewalSource?: BillingRenewalSource;
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
  const auth = useAuth();
  const { user, isLoading: authLoading, isAdmin, isGuest } = auth;
  const routineRenewal = focused && !intake;
  const routineCreation = focused;
  const [compareSchedules, setCompareSchedules] = useState(false);
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
  const [customRenewalTimes, setCustomRenewalTimes] = useState(() => customTimeIndices(initialRequest?.slots ?? []));
  const presetTimes = useRef(new Map<number, string>());
  const [materials, setMaterials] = useState(initialRequest?.materials_fee == null ? '' : String(initialRequest.materials_fee));
  const [materialsEdited, setMaterialsEdited] = useState(initialRequest?.mode === 'new_student' && initialRequest.materials_fee != null);
  const [deduction, setDeduction] = useState(() => initialRequest ? initialRequest.coupon?.kind || (initialRequest.trial_deduction ? 'trial' : 'none') : params.get('trial_date') ? 'trial' : 'none');
  const [couponValue, setCouponValue] = useState(initialRequest?.coupon ? String(initialRequest.coupon.value) : '');
  const [couponExpiry, setCouponExpiry] = useState(initialRequest?.coupon?.expires_on || '');
  const [couponCount, setCouponCount] = useState(initialRequest?.coupon?.available_count == null ? '' : String(initialRequest.coupon.available_count));
  const [couponVerified, setCouponVerified] = useState(initialRequest?.coupon?.verified || false);
  const [renewalCouponSnapshot, setRenewalCouponSnapshot] = useState(JSON.stringify(couponSnapshot ?? null));
  const [renewalCoupon, setRenewalCoupon] = useState<RenewalCouponSelection | null>(() => routineCreation && initialRequest?.coupon ? {
    studentId: draftContext?.studentId ?? -1, version: -1, group: { key: '__initial', kind: initialRequest.coupon.kind,
      value: initialRequest.coupon.value, expires_on: initialRequest.coupon.expires_on || '', quantity: 0, usable_count: null },
  } : null);
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
  const [renewalTutorIds, setRenewalTutorIds] = useState<number[]>(() => [...(renewalSource?.selectedTutorIds ?? renewalSource?.tutorIds ?? [])]);
  const [renewalReason, setRenewalReason] = useState(renewalSource?.reason || '');
  const [editorView, setEditorView] = useState<'details' | 'adjustments'>('details');
  const editorId = useId();
  const editorRoot = useRef<HTMLDivElement | null>(null);
  const [customTimetable, setCustomTimetable] = useState(false);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const enabled = !!user && !isGuest;
  const sourceBlocked = sourceLoading || !!sourceError;
  const { data: options, error: optionsError, mutate: reloadOptions } = useSWR(enabled ? 'billing-preview-options' : null, billingAPI.options);
  const savedPreferences = useSWR(enabled && routineCreation && draftContext && options?.workflow_available
    ? ['billing-preferences', `${draftContext.studentId}:${billingDraftAuthScope(auth)}`] : null,
    () => billingAPI.preferences(draftContext!.studentId, billingDraftTutorId(auth)), { keepPreviousData: false });
  const renewalCouponState = useSWR(enabled && routineCreation && draftContext
    ? ['billing-coupons', `${draftContext.studentId}:${billingDraftAuthScope(auth)}`] : null,
    () => billingAPI.couponBalance(draftContext!.studentId, billingDraftTutorId(auth)), { keepPreviousData: false });
  const renewalCouponBalance = renewalCouponState.data?.student_id === draftContext?.studentId ? renewalCouponState.data : undefined;
  const renewalCouponFailed = !!renewalCouponState.error || (!!renewalCouponState.data && !renewalCouponBalance);
  const renewalCouponChecking = !renewalCouponFailed && (!!renewalCouponState.isValidating || !renewalCouponBalance);
  const currentCouponSnapshot = JSON.stringify(couponSnapshot ?? null);
  const previousCouponSnapshot = useRef(currentCouponSnapshot);
  useEffect(() => {
    if (previousCouponSnapshot.current === currentCouponSnapshot) return;
    previousCouponSnapshot.current = currentCouponSnapshot;
    if (routineCreation && draftContext) void renewalCouponState.mutate();
  }, [currentCouponSnapshot, routineCreation, draftContext, renewalCouponState]);
  const renewalSelection = renewalCoupon && renewalCouponSnapshot !== JSON.stringify(couponSnapshot ?? null) ? { ...renewalCoupon, version: -1 } : renewalCoupon;
  const selectedRenewalCoupon = matchingRenewalCoupon(renewalCouponBalance, renewalSelection,
    renewalCouponChecking || renewalCouponFailed);
  const effectiveMandateReady = routineCreation && savedPreferences.data ? savedPreferences.data.mandate_ready : mandateReady;
  const { data: locations = [] } = useSWR(enabled ? 'locations' : null, statsAPI.getLocations);
  const tutorRoster = useSWR<Tutor[]>(enabled && focused && !intake ? 'tutors' : null, () => tutorsAPI.getAll());
  const tutors = pickableTutors(Array.isArray(tutorRoster.data) ? tutorRoster.data : []);
  const couponSelected = deduction === 'ordinary' || deduction === 'staff';
  const materialsChanged = !!intake && (materials === '' ? null : Number(materials)) !== defaultMaterialsFee;
  const intakeRequest: BillingIntakeRequest | undefined = intake ? { ...intake, slots: intakeSlots,
    materials_override_reason: materialsChanged ? materialsReason.trim() || null : null } : undefined;
  const intakeReady = !intake || (intakeSlots.length === slots.length && intakeSlots.every(slot => slot.tutor_id > 0)
    && (!materialsChanged || (isAdmin && !!materialsReason.trim())));

  useEffect(() => {
    if (!needsRebase || !initialRequest) return;
    if (!intake) {
      setRenewalReason(renewalSource?.reason || '');
      setRenewalTutorIds([...(renewalSource?.selectedTutorIds ?? renewalSource?.tutorIds ?? [])]);
      setFirstDate(initialRequest.first_lesson_date);
      setCustomRenewalTimes(customTimeIndices(initialRequest.slots));
      presetTimes.current.clear();
      setMode(initialRequest.mode);
      if (initialRequest.mode === 'new_student' && !materialsEdited) setMaterials(initialRequest.materials_fee == null ? '' : String(initialRequest.materials_fee));
      setSlots(initialRequest.slots.map(slot => ({ ...slot,
        location: selectableBranch(slot.location || '') ? slot.location : '',
        holiday_exceptions: slot.holiday_exceptions?.slice(),
      })));
      if (initialRequest.mode !== 'new_student' && deduction === 'trial') setDeduction('none');
    } else setCouponVerified(false);
    setAppliedSourceVersion(sourceVersion);
  }, [needsRebase, initialRequest, sourceVersion, deduction, materialsEdited, intake, renewalSource]);

  useEffect(() => {
    if (!couponEvidenceChanged) return;
    setCouponVerified(false);
    setVerifiedCouponVersion(couponVersion);
  }, [couponEvidenceChanged, couponVersion]);

  const request = useMemo<BillingPreviewRequest | null>(() => {
    if (routineCreation && renewalCoupon && !selectedRenewalCoupon) return null;
    if (routineCreation && slots.some((slot, index) => customRenewalTimes.has(index) && !parseTimeRange(slot.time_slot || ''))) return null;
    if (!firstDate || !weekdayForDate(firstDate) || (adjust && isAdmin && (!adjustThrough || !adjustReason.trim()))) return null;
    if (mode === 'new_student' && materials !== '' && (!Number.isInteger(Number(materials)) || Number(materials) < 0)) return null;
    if (!routineCreation && couponSelected && deduction !== 'staff' && (!Number.isInteger(Number(couponValue)) || Number(couponValue) <= 0)) return null;
    if (!routineCreation && couponSelected && couponCount !== '' && (!Number.isInteger(Number(couponCount)) || Number(couponCount) < 0)) return null;
    if (slots.some(slot => slot.holiday_exceptions?.some(day => !weekdayForDate(day)))) return null;
    return {
      first_lesson_date: firstDate, slots: mode === 'new_student' ? slots.map(slot => ({ ...slot, covered_through: null })) : slots, mode, payment_method: method,
      materials_fee: mode === 'new_student' ? (materials === '' ? null : Number(materials)) : 0,
      trial_deduction: mode === 'new_student' && deduction === 'trial' && (!routineCreation || !selectedRenewalCoupon), mandate_ready: effectiveMandateReady,
      adjustment: adjust && isAdmin ? { through: adjustThrough, reason: adjustReason.trim() } : null,
      coupon: routineCreation ? (selectedRenewalCoupon ? {
        kind: selectedRenewalCoupon.kind, value: selectedRenewalCoupon.value, expires_on: selectedRenewalCoupon.expires_on,
        available_count: selectedRenewalCoupon.usable_count, verified: true, combine_next_month: combineCoupon,
      } : null) : couponSelected ? {
        kind: deduction as 'ordinary' | 'staff', value: deduction === 'staff' ? 500 : Number(couponValue),
        expires_on: couponExpiry || null, available_count: couponCount === '' ? null : Number(couponCount),
        verified: couponVerified && !couponEvidenceChanged, combine_next_month: combineCoupon,
      } : null,
    };
  }, [firstDate, slots, mode, method, materials, deduction, effectiveMandateReady, adjust, adjustThrough, adjustReason,
    isAdmin, routineCreation, customRenewalTimes, renewalCoupon, selectedRenewalCoupon, couponSelected, couponValue, couponExpiry, couponCount, couponVerified, couponEvidenceChanged, combineCoupon]);
  const renewalTutorsChanged = !!renewalSource?.tutorIds && JSON.stringify(renewalTutorIds) !== JSON.stringify(renewalSource.tutorIds);
  const renewalTutorsReady = !renewalTutorsChanged || (renewalTutorIds.length === slots.length && renewalTutorIds.every(id => id > 0));
  const renewalChanged = !!renewalSource && (renewalTutorsChanged || firstDate !== renewalSource.scenario.first_lesson_date
    || JSON.stringify(slots.map(slot => [slot.weekday, slot.time_slot?.trim(), slot.location?.trim()]))
      !== JSON.stringify(renewalSource.scenario.slots.map(slot => [slot.weekday, slot.time_slot?.trim(), slot.location?.trim()])));
  const renewalChange = renewalChanged && renewalSource ? { source_enrollment_ids: renewalSource.enrollmentIds, ...(renewalTutorsChanged ? { tutor_ids: renewalTutorIds } : {}), reason: renewalReason.trim() } : undefined;
  const renewalReady = renewalTutorsReady && (!renewalChanged || !!renewalReason.trim());
  const renewalDetailsBlocked = sourceBlocked || reviewBusy || (routineRenewal && !!draftContext && !renewalSource);
  const currentKey = JSON.stringify({ request, sourceVersion, intake: intakeRequest, intakeReady, renewal: renewalChange });
  const preview = !sourceBlocked && !needsRebase && result?.key === currentKey ? result.data : null;
  const error = !sourceBlocked && !needsRebase && failure?.key === currentKey ? failure.message : null;

  useEffect(() => {
    if (!enabled || !options || !request || sourceBlocked || needsRebase) return;
    const key = currentKey;
    const controller = new AbortController();
    setResult(previous => previous?.key === key ? previous : null);
    setFailure(null);
    const timer = setTimeout(() => {
      const methods: BillingMethod[] = focused && !compareSchedules ? [request.payment_method] : request.payment_method === 'autopay' ? ['autopay', 'manual'] : ['manual', 'autopay'];
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
  }, [enabled, options, request, attempt, sourceBlocked, needsRebase, currentKey, focused, compareSchedules]);

  function updateSlot(index: number, change: Partial<BillingSlot>) {
    if (change.location && !selectableBranch(change.location)) change = { ...change, location: '' };
    setSlots(current => current.map((slot, i) => i === index ? { ...slot, ...(routineRenewal && change.weekday && change.weekday !== slot.weekday ? { holiday_exceptions: [] } : {}), ...change } : slot));
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

  const couponPeriod = preview?.[method]?.periods.find(period => period.number === focusedPeriodNumber);
  const couponUsedEarlier = preview?.[method]?.periods.some(period => period.number < focusedPeriodNumber && period.deductions.some(item => item.kind === 'ordinary' || item.kind === 'staff'));
  const canCombineRenewalCoupon = selectedRenewalCoupon?.kind === 'ordinary' && !couponUsedEarlier && !!couponPeriod
    && couponPeriod.kind !== 'legacy' && couponPeriod.kind !== 'transition' && !(adjust && couponPeriod.number === 1)
    && couponPeriod.coverage_through < (options?.regular_end || '')
    && (combineCoupon || couponPeriod.lesson_count < (options?.ordinary_coupon_minimum ?? 4));
  const discountField = <Field label="Discount" id="billing-deduction"><Select value={deduction} onChange={e => { setDeduction(e.target.value); setCouponVerified(false); }}><option value="none">No discount</option>{mode === 'new_student' && (!intake || intake.trial_enrollment_id) && <option value="trial">$150 trial deduction</option>}<option value="ordinary">Coupon</option><option value="staff">$500 staff voucher</option></Select></Field>;
  const feeFields = !routineRenewal && <section className="space-y-3 border-t border-line pt-4" aria-label="Discount details">
      <h3 className="text-sm font-semibold">Discounts and materials</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {discountField}
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
    </section>;

  const dateExceptions = <section className="space-y-3 border-t border-line pt-4" aria-labelledby="preview-adjustments">
      <h3 id="preview-adjustments" className="text-sm font-semibold">Date exceptions</h3>
      <p className="text-xs text-ink-subtle">Add an exception only when a regular class will run on a holiday.</p>
      {slots.map((slot, i) => <fieldset key={i} className="space-y-3 rounded-md border border-line p-3">
        <legend className="px-1 text-xs font-medium text-ink-subtle">{slot.weekday} {slot.time_slot}</legend>
        {mode !== 'new_student' && !routineRenewal && <Field label="Existing coverage through" id={`billing-covered-${i}`}><Input type="date" disabled={sourceBlocked} value={slot.covered_through || ''} max={options?.regular_end} onChange={e => updateSlot(i, { covered_through: e.target.value || null })} /></Field>}
        {(slot.holiday_exceptions || []).map((day, index) => <div key={index} className="flex items-end gap-2">
          <Field label="Holiday class date" id={`billing-holiday-${i}-${index}`}><Input type="date" disabled={sourceBlocked} value={day} min={options?.academic_start} max={options?.regular_end} onChange={e => updateSlot(i, { holiday_exceptions: slot.holiday_exceptions!.map((current, j) => j === index ? e.target.value : current) })} /></Field>
          <Button size="sm" disabled={sourceBlocked} onClick={() => updateSlot(i, { holiday_exceptions: slot.holiday_exceptions!.filter((_, j) => j !== index) })}>Remove</Button>
        </div>)}
        <Button size="sm" disabled={sourceBlocked || (slot.holiday_exceptions?.length || 0) >= 30} onClick={() => updateSlot(i, { holiday_exceptions: [...(slot.holiday_exceptions || []), ''] })}>Add class on a holiday</Button>
      </fieldset>)}
      {isAdmin && <>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} />{routineRenewal ? 'Adjust enrollment end date' : 'Compare an adjusted first payment'}</label>
        {adjust && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cover through" id="billing-adjust-through" hint="Use month-end or the final teaching day."><Input type="date" min={firstDate} max={options?.regular_end} value={adjustThrough} onChange={e => setAdjustThrough(e.target.value)} /></Field>
          <Field label="Reason for adjustment" id="billing-adjust-reason"><Textarea value={adjustReason} maxLength={500} onChange={e => setAdjustReason(e.target.value)} /></Field>
        </div>}
      </>}
    </section>;

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
            <Field label="Weekday" id={`billing-day-${i}`}><Select disabled={sourceBlocked} value={slot.weekday} onChange={e => updateSlot(i, { weekday: e.target.value as BillingWeekday })}>{DAY_NAMES.map(day => <option key={day}>{day}</option>)}</Select></Field>
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
    {feeFields}

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
    {dateExceptions}
    </div>
  </div>;

  function changeRenewalDay(index: number, weekday: BillingWeekday) {
    updateSlot(index, { weekday });
    if (!weekdayForDate(firstDate)) return;
    const nextSlots = slots.map((slot, i) => i === index ? { ...slot, weekday } : slot);
    if (nextSlots.some(slot => slot.weekday === weekdayForDate(firstDate))) return;
    const day = new Date(`${firstDate}T00:00:00Z`);
    for (let offset = 1; offset <= 7; offset++) {
      day.setUTCDate(day.getUTCDate() + 1);
      const next = day.toISOString().slice(0, 10);
      if (nextSlots.some(slot => slot.weekday === weekdayForDate(next))) { setFirstDate(next); break; }
    }
  }
  const renewalEditor = <section aria-label={intake ? "New enrollment details" : "Renewal enrollment details"} className="space-y-4">

    {slots.map((slot, index) => {
      const times: readonly string[] = ['Sat', 'Sun'].includes(slot.weekday) ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
      const branches = [...new Set([...locations, slot.location || ''].filter(value => !!value && selectableBranch(value)))];
      const offered = (intake ? [...intakeTutors] : tutors.filter(tutor => isHomeBranch(tutor, slot.location || ''))).sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)));
      const chosenId = (intake ? intakeSlots[index]?.tutor_id : renewalTutorIds[index]) || '';
      const inheritedTutorId = renewalSource?.tutorIds?.[index] || null;
      const chosen = (Array.isArray(tutorRoster.data) ? tutorRoster.data : []).find(tutor => tutor.id === chosenId);
      return <fieldset key={index} className="space-y-2" disabled={renewalDetailsBlocked}>
        {slots.length > 1 && <legend className="mb-2 text-xs font-medium text-ink-subtle">Class {index + 1}</legend>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tutor" id={`renewal-tutor-${index}`}><Select id={`renewal-tutor-${index}`} disabled={!intake && !renewalSource?.tutorIds?.every(id => id > 0)} value={chosenId} onChange={event => intake ? setIntakeSlots(current => current.map((slot, i) => i === index ? { ...slot, tutor_id: Number(event.target.value) } : slot)) : setRenewalTutorIds(current => current.map((id, i) => i === index ? Number(event.target.value) : id))}>
            <option value="">{!chosenId && renewalSource?.tutorNames[index] ? renewalSource.tutorNames[index] : 'Select tutor...'}</option>
            {chosenId && !offered.some(tutor => tutor.id === chosenId) && <option value={chosenId}>{chosen?.tutor_name || renewalSource?.tutorNames[index] || 'Current tutor'}</option>}
            {inheritedTutorId && inheritedTutorId !== chosenId && !offered.some(tutor => tutor.id === inheritedTutorId) && <option value={inheritedTutorId}>{renewalSource?.tutorNames[index] || 'Original tutor'}</option>}
            {offered.map(tutor => <option key={tutor.id} value={tutor.id}>{tutor.tutor_name}</option>)}
          </Select></Field>
          <Field label="Location" id={`renewal-branch-${index}`}><RenewalScheduleSelect icon={MapPin} id={`renewal-branch-${index}`} value={slot.location || ''} onChange={event => updateSlot(index, { location: event.target.value })}><option value="">Choose branch</option>{branches.map(branch => <option key={branch}>{branch}</option>)}</RenewalScheduleSelect></Field>
          <Field label="Day of week" id={`renewal-weekday-${index}`}><RenewalScheduleSelect icon={Calendar} id={`renewal-weekday-${index}`} value={slot.weekday} onChange={event => changeRenewalDay(index, event.target.value as BillingWeekday)}>{DAY_NAMES.map(day => <option key={day}>{day}</option>)}</RenewalScheduleSelect></Field>
          <div className="space-y-1">
            <Field label="Time slot" id={`renewal-time-${index}`}>
              {customRenewalTimes.has(index)
                ? <TimeRangeInput id={`renewal-time-${index}`} value={slot.time_slot || ''} onChange={value => updateSlot(index, { time_slot: value })} />
                : <RenewalScheduleSelect icon={Clock} id={`renewal-time-${index}`} value={slot.time_slot || ''} onChange={event => updateSlot(index, { time_slot: event.target.value })}><option value="">Choose time</option>{slot.time_slot && !times.includes(slot.time_slot) && <option value={slot.time_slot}>{slot.time_slot}</option>}{times.map(time => <option key={time}>{time}</option>)}</RenewalScheduleSelect>}
            </Field>
            {customRenewalTimes.has(index)
              ? <button type="button" className="text-xs text-accent-ink hover:underline" onClick={() => {
                setCustomRenewalTimes(current => { const next = new Set(current); next.delete(index); return next; });
                const previous = presetTimes.current.get(index);
                updateSlot(index, { time_slot: previous && times.includes(previous) ? previous : times[0] });
              }}>Use preset time slots</button>
              : <button type="button" className="text-xs text-accent-ink hover:underline" onClick={() => {
                presetTimes.current.set(index, slot.time_slot || times[0]);
                setCustomRenewalTimes(current => new Set(current).add(index));
              }}>Use custom time</button>}
          </div>
        </div>
      </fieldset>;
    })}
    <div className="grid grid-cols-2 gap-3"><Field label="First lesson date" id="renewal-first-lesson"><Input id="renewal-first-lesson" type="date" disabled={renewalDetailsBlocked} value={firstDate} min={intake ? options?.first_payment_from : options?.academic_start} max={options?.regular_end} onChange={event => {
      setFirstDate(event.target.value);
      const day = weekdayForDate(event.target.value);
      if (day && slots.length === 1) updateSlot(0, { weekday: day });
    }} /></Field>{!intake && draftContext ? <BillingRenewalCoupon studentId={draftContext.studentId} balance={renewalCouponBalance} checking={renewalCouponChecking} failed={renewalCouponFailed}
      selection={renewalSelection} disabled={renewalDetailsBlocked} onSelect={value => { setRenewalCoupon(value); setRenewalCouponSnapshot(JSON.stringify(couponSnapshot ?? null)); setCombineCoupon(false); }} onRetry={() => { void renewalCouponState.mutate(); }}
      combine={combineCoupon} canCombine={canCombineRenewalCoupon} onCombine={setCombineCoupon} /> : null}</div>
    {intake && <Button size="sm" variant="quiet" disabled={renewalDetailsBlocked} onClick={() => {
      setSlots(current => current.length === 1 ? [...current, { weekday: BILLING_DAYS[(BILLING_DAYS.indexOf(current[0].weekday) + 2) % 7], location: current[0].location }] : current.slice(0, 1));
      setIntakeSlots(current => current.length === 1 ? [...current, { tutor_id: 0 }] : current.slice(0, 1));
    }}>{slots.length === 1 ? 'Add second weekly class' : 'Remove second weekly class'}</Button>}
    {tutorRoster.error && <div role="alert" className="text-sm"><p>Could not load tutors.</p><Button size="sm" onClick={() => { void tutorRoster.mutate(); }}>Retry tutors</Button></div>}
    {renewalChanged && <Field label="Reason for change" id="renewal-change-reason"><Textarea id="renewal-change-reason" rows={2} maxLength={500} disabled={sourceBlocked || reviewBusy} value={renewalReason} onChange={event => setRenewalReason(event.target.value)} /></Field>}

  </section>;

  const intakeFees = intake && <section aria-label="First enrollment charges" className="space-y-3 border-t border-line pt-4">
    <div className="grid grid-cols-2 gap-3">
      <Field label="Materials" id="intake-materials"><Input id="intake-materials" disabled={sourceBlocked || reviewBusy || !isAdmin} type="number" min="0" max="10000" step="1" value={materials} placeholder="To confirm" onChange={event => { setMaterials(event.target.value); setMaterialsEdited(true); }} /></Field>
      <Field label="Discount" id="intake-discount"><Select id="intake-discount" disabled={sourceBlocked || reviewBusy} value={selectedRenewalCoupon || renewalCoupon || deduction === 'coupon' ? 'coupon' : deduction === 'trial' ? 'trial' : 'none'} onChange={event => {
        setDeduction(event.target.value); setRenewalCoupon(null); setCombineCoupon(false);
      }}><option value="none">No discount</option>{!!intake.trial_enrollment_id && <option value="trial">$150 trial deduction</option>}<option value="coupon">Coupon</option></Select></Field>
    </div>
    {isAdmin && (adjust || preview?.[method]?.issues.some(issue => issue.code === 'FIRST_PAYMENT_BELOW_MINIMUM')) && <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={adjust} disabled={sourceBlocked || reviewBusy} onChange={event => setAdjust(event.target.checked)} />Adjust first payment end date</label>
      {adjust && <div className="grid grid-cols-2 gap-3"><Field label="Cover through" id="intake-through"><Input id="intake-through" type="date" min={firstDate} max={options?.regular_end} value={adjustThrough} disabled={sourceBlocked || reviewBusy} onChange={event => setAdjustThrough(event.target.value)} /></Field><Field label="Reason for adjustment" id="intake-adjustment-reason"><Textarea id="intake-adjustment-reason" rows={2} value={adjustReason} disabled={sourceBlocked || reviewBusy} maxLength={500} onChange={event => setAdjustReason(event.target.value)} /></Field></div>}
    </div>}
    {materialsChanged && <Field label="Reason for materials adjustment" id="intake-materials-reason"><Textarea id="intake-materials-reason" rows={2} disabled={sourceBlocked || reviewBusy || !isAdmin} value={materialsReason} maxLength={500} onChange={event => setMaterialsReason(event.target.value)} /></Field>}
    {(deduction === 'coupon' || !!renewalCoupon) && draftContext && <BillingRenewalCoupon studentId={draftContext.studentId} balance={renewalCouponBalance} checking={renewalCouponChecking} failed={renewalCouponFailed}
      selection={renewalSelection} disabled={sourceBlocked || reviewBusy} onSelect={value => { setRenewalCoupon(value); setDeduction(value ? 'coupon' : 'none'); setRenewalCouponSnapshot(JSON.stringify(couponSnapshot ?? null)); setCombineCoupon(false); }} onRetry={() => { void renewalCouponState.mutate(); }}
      combine={combineCoupon} canCombine={false} onCombine={setCombineCoupon} />}
  </section>;

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
        preferencesAvailable={!!options?.workflow_available} storageAvailable={!!options?.draft_storage_available} revisionTarget={revisionTarget} onSaved={onDraftSaved} /> : undefined} />}
  </div>;
  if (routineCreation) {
    const period = preview?.[method]?.periods.find(value => value.number === focusedPeriodNumber);
    const hasReview = !!(period && draftContext && request && intakeReady && renewalReady);
    return <div className="space-y-4" aria-label={intake ? "First enrollment calculation" : "Renewal calculation"}>
      {revisionTarget && <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Revision {revisionTarget.current_revision + 1}</h3><Button size="sm" variant="quiet" onClick={onCancelRevision}>Cancel revision</Button></div>}
      {sourceFailure}{policyError}{calculationError}
      <div className={intake ? "flex min-w-0 flex-wrap items-start gap-5" : "space-y-4"}>
      <div className={intake ? "min-w-0 flex-[1_1_19rem] space-y-4" : "space-y-4"}>{renewalEditor}{intakeFees}</div>
      <div className={intake ? "min-h-[22rem] min-w-0 flex-[1_1_22rem] space-y-4" : "space-y-4"}>
      {!hasReview && <BillingChecks issues={contextIssues} presentation="renewal" />}
      {!request && <p className="text-sm text-ink-subtle">{renewalCoupon && !selectedRenewalCoupon ? 'Check coupons or select No coupon to continue.' : 'Complete the enrollment details to calculate its fee.'}</p>}
      {intake && !intakeReady && <p role="status" className="text-sm text-ink-subtle">{materialsChanged && !materialsReason.trim() ? 'Enter a reason for the materials adjustment.' : 'Choose a tutor for each class.'}</p>}
      {!renewalReady && <p role="status" className="text-xs text-ink-subtle">{renewalTutorsReady ? 'Enter a reason to review the changed enrollment.' : 'Select a tutor for each class.'}</p>}
      {sourceLoading && <p role="status" className="text-sm text-ink-subtle">Refreshing enrollment records…</p>}
      {!sourceBlocked && request && options && !preview && !error && <p role="status" className="text-sm text-ink-subtle">Calculating enrollment…</p>}
      {preview && !period && <p className="text-sm text-ink-subtle">No payment is needed for this period.</p>}
      {hasReview && period && draftContext && request && <BillingDraftReview inline summaryPresentation="renewal" onBusyChange={reviewBusyChanged} key={`${currentKey}:${method}:${period.number}`}
        studentId={draftContext.studentId} calculation={preview?.[method]}
        directCreation={renewalCreator && onEnrollmentCreated ? { creator: renewalCreator, canWrite: !!options?.workflow_writes_available, onCreated: onEnrollmentCreated } : undefined}
        saveLabel={draftSaveLabel} onStaleReview={onRetrySource}
        reviewRequest={{ scenario: { ...request, payment_method: method }, basis: draftContext.basis,
          selected_enrollment_ids: draftContext.selectedEnrollmentIds, expected_source_fingerprint: draftContext.sourceFingerprint,
          period_number: period.number, confirmed_checks: [], ...(renewalChange ? { renewal: renewalChange } : {}), ...(intakeRequest ? { intake: intakeRequest } : {}) }}
        preferencesAvailable={!!options?.workflow_available} storageAvailable={!!options?.draft_storage_available} revisionTarget={revisionTarget} onSaved={onDraftSaved} />}
      </div></div>
      {intake && <div className="space-y-3 border-t border-line pt-3"><Button size="sm" variant="quiet" disabled={reviewBusy} aria-expanded={compareSchedules} onClick={() => setCompareSchedules(value => !value)}>{compareSchedules ? 'Hide payment schedules' : 'Compare payment schedules'}</Button>{compareSchedules && preview?.manual && preview?.autopay && <PaymentJourney journeys={preview} slots={slots} unitFee={options!.unit_fee} initialMethod={method} />}</div>}
    </div>;
  }
  const Surface = embedded ? 'div' : PageSurface;
  return <Surface><div className={embedded ? 'space-y-4' : 'w-full min-w-0 space-y-5 p-4 sm:p-6 xl:p-8'}>
    {!embedded && <PageHeader title="Enrollment fee preview" icon={Calculator} titleExtra={<Badge>Preview</Badge>} backHref="/billing" backLabel="Back to payment plans" />}
    {!editorOpen && policyError}
    {journey}
    <BillingEditorDialog open={editorOpen} onClose={() => setEditorOpen(false)} trigger={editorTrigger}
      status={sourceFailure || calculationError || policyError || (sourceLoading ? <span role="status">Refreshing enrollment records…</span> : request && options && !preview ? <span role="status">Updating preview…</span> : null)}>{editor}</BillingEditorDialog>
  </div></Surface>;
}
