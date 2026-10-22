'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, Check, ClipboardCopy, FileCheck2, Save } from 'lucide-react';
import { Button, Label, Segmented, Textarea } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { BillingChecks } from './BillingChecks';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { useJourneyDetail } from './JourneyDetailContext';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { formatShortDate } from '@/lib/formatters';
import type { BillingConfirmableCheck, BillingDraftDetail, BillingDraftReview as Review, BillingDraftReviewRequest, BillingPreviewResponse } from '@/types/billing';

export function billingDraftAuthScope(auth: ReturnType<typeof useAuth>): string {
  return JSON.stringify([auth.user?.id, auth.effectiveRole, auth.isImpersonating, auth.impersonatedTutor?.id, auth.isAdmin]);
}

export function billingDraftTutorId(auth: ReturnType<typeof useAuth>): number | undefined {
  return auth.effectiveRole === 'Tutor' ? auth.isImpersonating ? auth.impersonatedTutor?.id : auth.user?.id : undefined;
}

/** Focus stays inside the shared dialog and returns to its opening action. */
export function BillingDraftFocus({ children, trigger, suspended = false }: { children: ReactNode; trigger: RefObject<HTMLButtonElement | null>; suspended?: boolean }) {
  const body = useRef<HTMLDivElement>(null);
  const paused = useRef(suspended); paused.current = suspended;
  useEffect(() => {
    const dialog = body.current?.closest<HTMLElement>('[role="dialog"]');
    const original = trigger.current;
    if (!dialog) return;
    const targets = () => [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter(element => {
        const closed = element.closest('details:not([open])');
        return !element.matches(':disabled') && !element.closest('[hidden]') && (!closed || (element.tagName === 'SUMMARY' && element.parentElement === closed));
      });
    targets()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || paused.current) return;
      const options = targets();
      if (!options.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? options.at(-1) : options[0])?.focus();
      }
      else if (event.shiftKey && document.activeElement === options[0]) { event.preventDefault(); options.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === options.at(-1)) { event.preventDefault(); options[0]?.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => { dialog.removeEventListener('keydown', trap); if (original?.isConnected) original.focus({ preventScroll: true }); };
  }, [trigger]);
  return <div ref={body} className="min-w-0">{children}</div>;
}

const manualCollectionReasons: Record<string, string> = {
  first: 'The first payment is collected manually.',
  legacy: 'This six-session renewal is collected manually.',
  adjusted_manual: 'Manual payment is needed before the first bank collection run.',
};

export function BillingDraftSummaryContent({ review, calculation }: { review: Review; calculation?: BillingPreviewResponse }) {
  const period = review.period;
  const manualUnderAutopay = review.scenario.payment_method === 'autopay' && period.collection.method === 'manual';
  const manualReason = manualUnderAutopay ? manualCollectionReasons[period.kind] : undefined;
  // This is forecast information only. Saved reviews do not contain a future schedule.
  // A changed review must never inherit dates from an older calculation.
  const matchingCalculation = calculation?.policy_version === review.policy_version
    && calculation.payment_method === review.scenario.payment_method
    && JSON.stringify(calculation.periods.find(value => value.number === period.number)) === JSON.stringify(period);
  const nextAutopay = manualUnderAutopay && matchingCalculation ? calculation?.periods
    .filter(value => value.number > period.number && value.collection.method === 'autopay')
    .sort((a, b) => a.number - b.number)[0] : undefined;
  const checks = review.issues.filter(issue => (issue.period === null || issue.period === period.number)
    && !review.confirmed_checks.includes(issue.code as BillingConfirmableCheck)
    && !(issue.code === 'MANDATE_NOT_READY' && period.collection.method === 'manual'));
  return <div className="space-y-3">
    <div><p className="font-semibold">{review.student.student_name}</p><p className="text-xs text-ink-subtle">{formatShortDate(period.first_lesson_date)} to {formatShortDate(period.last_lesson_date)}</p></div>
    <div className="space-y-2">
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs"><div className="flex items-center gap-2"><dt>Payment plan</dt><dd><PaymentMethodBadge method={review.scenario.payment_method} /></dd></div><div className="flex items-center gap-2"><dt>This payment</dt><dd><PaymentMethodBadge method={period.collection.method} /></dd></div></dl>
      {manualReason && <p className="text-xs text-ink-subtle">{manualReason}</p>}
      {nextAutopay?.collection.debit_from && nextAutopay.collection.debit_to && <p className="text-xs text-ink-subtle">Next planned debit: {formatShortDate(nextAutopay.collection.debit_from)} to {formatShortDate(nextAutopay.collection.debit_to)}.</p>}
    </div>
    <div className="grid grid-cols-2 gap-3 rounded-md bg-wash p-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-ink-subtle">Sessions</p><p className="mt-1 font-semibold">{period.lesson_count}</p></div><div><p className="text-xs text-ink-subtle">Total fee</p><p className="mt-1 font-semibold">{period.total_fee === null ? 'To confirm' : `$${period.total_fee.toLocaleString('en-US')}`}</p></div><div className="col-span-2 sm:col-span-1"><p className="text-xs text-ink-subtle">Payment</p><p className="mt-1 text-xs">{period.collection.method === 'manual' ? `Before ${formatShortDate(period.collection.due_before_lesson)}` : `${formatShortDate(period.collection.debit_from)} to ${formatShortDate(period.collection.debit_to)}`}</p></div></div>
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs"><dt>Tuition · {period.lesson_count} sessions</dt><dd>${period.gross_tuition.toLocaleString('en-US')}</dd>{period.deductions.map((deduction, index) => <div key={index} className="contents"><dt>{deduction.kind === 'trial' ? 'Trial deduction' : deduction.kind === 'staff' ? 'Staff coupon' : 'Coupon'}</dt><dd>−${deduction.amount.toLocaleString('en-US')}</dd></div>)}<dt>Materials</dt><dd>{period.materials_fee === null ? 'To confirm' : `$${period.materials_fee.toLocaleString('en-US')}`}</dd><dt className="border-t border-line pt-1 font-semibold">Total</dt><dd className="border-t border-line pt-1 font-semibold">{period.total_fee === null ? 'To confirm' : `$${period.total_fee.toLocaleString('en-US')}`}</dd></dl>
    <div aria-label="Sessions by month" className="flex flex-wrap gap-2">{period.counts_by_month.map(value => <span key={value.month} className="rounded bg-tint px-2 py-1 text-xs"><span className="font-medium">{new Date(`${value.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span> · {value.lessons} {value.lessons === 1 ? 'session' : 'sessions'}</span>)}</div>
    {period.counts_by_slot.filter(count => count > 0).length > 1 && <div aria-label="Sessions by class" className="grid gap-2">{period.counts_by_slot.map((count, index) => {
      if (!count) return null;
      const slot = review.scenario.slots[index];
      const lessons = period.lessons.filter(lesson => lesson.slot === index);
      return <div key={index} className="flex items-start justify-between gap-3 rounded border border-line p-2 text-xs"><div><p className="font-medium">{slot?.weekday} {slot?.time_slot} @ {slot?.location}</p>{lessons.length > 0 && <p className="mt-1 text-ink-subtle">{formatShortDate(lessons[0].date)} to {formatShortDate(lessons[lessons.length - 1].date)}</p>}</div><span className="shrink-0 font-medium">{count} {count === 1 ? 'session' : 'sessions'}</span></div>;
    })}</div>}
    <BillingChecks issues={checks} compact />
    <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm">{period.lesson_count} session dates</summary><ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2">{period.lessons.map(lesson => <li key={`${lesson.date}:${lesson.slot}`}>{formatShortDate(lesson.date)} ({lesson.weekday})<span className="block text-ink-subtle">{lesson.time_slot} · {lesson.location}</span></li>)}</ul></details>
  </div>;
}

export interface BillingCopyFeedback {
  kind: 'success' | 'error' | 'info';
  message: string;
}

export function BillingCopyFeedbackNotice({ feedback }: { feedback: BillingCopyFeedback }) {
  const notice = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    // Revalidation can remove a long message above this action.
    const target = notice.current?.closest<HTMLElement>('[data-billing-copy-actions]') ?? notice.current;
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [feedback]);
  return <p ref={notice} data-billing-copy-feedback role={feedback.kind === 'error' ? 'alert' : 'status'} className={`text-xs ${feedback.kind === 'error' ? 'text-red-700 dark:text-red-300' : feedback.kind === 'success' ? 'text-green-700 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}`}>{feedback.message}</p>;
}

export function BillingDraftMessage({ review, canCopy, onCopy, busy = false, onLanguageChange, feedback }: { review: Review; canCopy: boolean; onCopy: (language: 'zh' | 'en') => void; busy?: boolean; onLanguageChange?: (language: 'zh' | 'en') => void; feedback?: BillingCopyFeedback | null }) {
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const text = review.message[language];
  const blocked = review.message.blocked_reasons;
  const messageKey = JSON.stringify([review.student.id, review.source_fingerprint, review.review_hash, review.message.template_version, language, text, blocked, canCopy]);
  const currentMessage = useRef(messageKey); currentMessage.current = messageKey;
  const [shownFeedback, setShownFeedback] = useState<{ value: BillingCopyFeedback; key: string } | null>(null);
  useEffect(() => {
    setShownFeedback(feedback ? { value: feedback, key: currentMessage.current } : null);
    if (feedback?.kind !== 'success') return;
    const timer = setTimeout(() => setShownFeedback(current => current?.value === feedback ? null : current), 2500);
    return () => clearTimeout(timer);
  }, [feedback]);
  useEffect(() => { setShownFeedback(current => current?.key === messageKey ? current : null); }, [messageKey]);
  const visibleFeedback = shownFeedback?.key === messageKey ? shownFeedback.value : null;
  const copied = visibleFeedback?.kind === 'success';
  return <section className="space-y-3" aria-label="Fee message preview">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Fee message</h3><Segmented label="Fee message language" value={language} onChange={value => { setLanguage(value); setShownFeedback(null); onLanguageChange?.(value); }} options={[{ value: 'zh', label: '中文', disabled: busy }, { value: 'en', label: 'English', disabled: busy }]} /></div>
    {blocked.length > 0 && <div role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"><p className="font-semibold">Resolve these checks before copying:</p><ul className="mt-1 list-inside list-disc">{blocked.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
    {text && blocked.length === 0 && <><Label htmlFor={`draft-message-${review.review_hash}-${language}`}>{language === 'zh' ? 'Chinese fee message' : 'English fee message'}</Label><Textarea id={`draft-message-${review.review_hash}-${language}`} readOnly value={text} className="min-h-48" /></>}
    <div data-billing-copy-actions className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button size="sm" icon={copied ? Check : ClipboardCopy} iconClassName={copied ? 'text-green-700 dark:text-green-300' : undefined} disabled={!canCopy || !text || blocked.length > 0 || busy} onClick={() => { setShownFeedback(null); onCopy(language); }}>{copied ? 'Copied' : 'Copy message'}</Button>
      {visibleFeedback && <BillingCopyFeedbackNotice feedback={visibleFeedback} />}
    </div>
  </section>;
}

const confirmations: Record<BillingConfirmableCheck, string> = {
  UNPAID_PAST_DATES: 'The past session dates are correct.',
  CONTINUING_SLOTS_REVIEW: 'The student will attend both weekly classes.',
  CONTINUATION_UNCONFIRMED: 'The student is continuing lessons.',
  HOLIDAY_OPENING_ASSUMED: 'These holiday classes will run.',
};

export function BillingDraftReview({ studentId, reviewRequest, storageAvailable, onSaved, revisionTarget, inline = false, onBusyChange, calculation }: {
  studentId: number;
  reviewRequest: BillingDraftReviewRequest;
  storageAvailable: boolean;
  inline?: boolean;
  onBusyChange?: (busy: boolean) => void;
  calculation?: BillingPreviewResponse;
  onSaved?: (detail: BillingDraftDetail) => void;
  revisionTarget?: { id: string; current_revision: number };
}) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const presentation = useJourneyDetail();
  const setReviewing = presentation?.setReviewing;
  const setDetailBusy = presentation?.setBusy;
  const baseKey = JSON.stringify([studentId, billingDraftAuthScope(auth), reviewRequest, revisionTarget]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = inline || (openKey === baseKey && (!presentation || presentation.active));
  const active = useRef(open); active.current = open;
  const [confirmed, setConfirmed] = useState<{ key: string; values: BillingConfirmableCheck[] }>({ key: '', values: [] });
  const [mandate, setMandate] = useState({ key: '', ready: false });
  const mandateReady = auth.isAdmin && mandate.key === baseKey && mandate.ready;
  const values = confirmed.key === baseKey ? confirmed.values : reviewRequest.confirmed_checks ?? [];
  const request = { ...reviewRequest, scenario: { ...reviewRequest.scenario, mandate_ready: mandateReady }, confirmed_checks: values };
  const requestKey = JSON.stringify([baseKey, values, mandateReady]);
  const currentKey = useRef(requestKey); currentKey.current = requestKey;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; baseKey: string; data: Review } | null>(null);
  const review = result?.key === requestKey ? result.data : null;
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; value: BillingCopyFeedback; previousReview?: Review } | null>(null);
  useEffect(() => { setCopyFeedback(null); }, [requestKey]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey === requestKey;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => { setDetailBusy?.(busy); return () => setDetailBusy?.(false); }, [busy, setDetailBusy]);
  const currentFailure = failure?.key === requestKey ? failure : null;
  const [noteState, setNote] = useState({ key: '', text: '' });
  const note = noteState.key === baseKey ? noteState.text : '';
  const idempotency = useRef<{ content: string; token: string } | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const operation = useRef<AbortController | null>(null);

  useEffect(() => () => { operation.current?.abort(); setReviewing?.(false); }, [baseKey, setReviewing]);
  useEffect(() => () => operation.current?.abort(), [open, requestKey]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    billingAPI.draftReview(studentId, JSON.parse(JSON.stringify(request)), abort.signal, tutorId).then(data => {
      if (!abort.signal.aborted && currentKey.current === requestKey) { setResult({ key: requestKey, baseKey, data }); setFailure(null); }
    }).catch(error => { if (!abort.signal.aborted && currentKey.current === requestKey) setFailure({ key: requestKey, message: error instanceof Error ? error.message : 'Could not review this payment.' }); });
    return () => abort.abort();
    // requestKey captures the complete request and authorisation scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestKey, retry]);
  useLayoutEffect(() => {
    if (presentation?.inDialog) {
      if (open) back.current?.focus();
      else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open, presentation?.inDialog]);

  const close = (completed = false) => { if (busy && !completed) return; operation.current?.abort(); setCopyFeedback(null); setOpenKey(null); setReviewing?.(false); };
  const contentKey = JSON.stringify([requestKey, review?.review_hash, note]);

  async function save() {
    if (!active.current || currentKey.current !== requestKey || !auth.isAdmin || !storageAvailable || !review || busy || savedContent === contentKey) return;
    const key = requestKey;
    if (idempotency.current?.content !== contentKey) idempotency.current = { content: contentKey, token: crypto.randomUUID() };
    const data = { review: request, expected_review_hash: review.review_hash, idempotency_key: idempotency.current.token, note };
    const abort = new AbortController(); operation.current = abort; setBusyKey(key); setFailure(null); setNotice(null); setCopyFeedback(null);
    try {
      const saved = revisionTarget ? await billingAPI.reviseDraft(revisionTarget.id, { ...data, expected_revision: revisionTarget.current_revision }, abort.signal) : await billingAPI.saveDraft(studentId, data, abort.signal);
      if (abort.signal.aborted || !active.current || currentKey.current !== key) return;
      setSavedContent(contentKey); idempotency.current = null; setNotice({ key, message: `Draft saved · Revision ${saved.revision}` });
      if (onSaved) { close(true); presentation?.closeDetails?.(); onSaved(saved); }
      void invalidateRenewalQueueCache();
    } catch (error) {
      if (!abort.signal.aborted && currentKey.current === key) {
        if ((error as { status?: number }).status === 409) setResult(null);
        setFailure({ key, message: error instanceof Error ? error.message : 'Could not save the draft. Try again.' });
      }
    }
    finally { if (currentKey.current === key) setBusyKey(null); }
  }

  async function copy(language: 'zh' | 'en') {
    if (!active.current || currentKey.current !== requestKey || !review || review.message.blocked_reasons.length || !review.message[language] || busy) return;
    const key = requestKey;
    let validated = false;
    const abort = new AbortController(); operation.current = abort; setBusyKey(key); setFailure(null); setNotice(null); setCopyFeedback(null);
    try {
      const fresh = await billingAPI.draftReview(studentId, request, abort.signal, tutorId);
      if (abort.signal.aborted || !active.current || currentKey.current !== key) return;
      if (fresh.review_hash !== review.review_hash || fresh.message.blocked_reasons.length || !fresh.message[language]) {
        setResult({ key, baseKey, data: fresh }); setCopyFeedback({ key, value: { kind: 'info', message: 'The payment changed. Review the updated message before copying.' } }); return;
      }
      validated = true;
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable in this browser.');
      await navigator.clipboard.writeText(fresh.message[language]);
      if (!abort.signal.aborted && active.current && currentKey.current === key) setCopyFeedback({ key, value: { kind: 'success', message: 'Message copied.' } });
    } catch (error) {
      if (!abort.signal.aborted && currentKey.current === key) {
        if (!validated) setResult(null);
        const message = error instanceof Error ? error.message : 'Could not copy the message.';
        if (!validated) setFailure({ key, message });
        setCopyFeedback({ key, value: { kind: 'error', message }, previousReview: !validated ? review : undefined });
      }
    }
    finally { if (currentKey.current === key) setBusyKey(null); }
  }

  const activeCopyFeedback = copyFeedback?.key === requestKey ? copyFeedback : null;
  const withheldCopyReview = !review && activeCopyFeedback?.previousReview;
  const body = <div className="space-y-5">
    {presentation?.inDialog && <Button ref={back} icon={ArrowLeft} variant="quiet" disabled={busy} onClick={() => close()}>Back to payment details</Button>}
    {!review && !currentFailure && <p role="status" className="text-sm text-ink-subtle">Checking payment details…</p>}
    {failure?.key === requestKey && !withheldCopyReview && <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-300"><p>{failure.message}</p>{!review && <Button size="sm" onClick={() => { setFailure(null); setCopyFeedback(null); setRetry(value => value + 1); }}>Retry review</Button>}</div>}
    {auth.isAdmin && result?.baseKey === baseKey && result.data.period.collection.method === 'autopay' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={mandateReady} disabled={busy} onChange={event => setMandate({ key: baseKey, ready: event.target.checked })} />Bank authorisation is ready for this payment.</label>}
    {review && <><BillingDraftSummaryContent review={review} calculation={review.source_fingerprint === reviewRequest.expected_source_fingerprint ? calculation : undefined} />
      {auth.isAdmin && Object.entries(confirmations).filter(([code]) => review.issues.some(issue => issue.code === code) || values.includes(code as BillingConfirmableCheck)).map(([code, label]) => <label key={code} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={values.includes(code as BillingConfirmableCheck)} disabled={busy} onChange={event => setConfirmed({ key: baseKey, values: event.target.checked ? [...values, code as BillingConfirmableCheck] : values.filter(value => value !== code) })} />{label}</label>)}
      <BillingDraftMessage review={review} canCopy={review.period.total_fee !== null} onCopy={copy} busy={busy} feedback={activeCopyFeedback?.value} onLanguageChange={() => setCopyFeedback(null)} />
      {auth.isAdmin && <div className="space-y-2"><Label htmlFor={`draft-note-${review.review_hash}`}>Draft note</Label><Textarea id={`draft-note-${review.review_hash}`} value={note} maxLength={5000} disabled={busy} onChange={event => setNote({ key: baseKey, text: event.target.value })} /><Button icon={Save} disabled={!storageAvailable || busy || savedContent === contentKey} onClick={save}>{savedContent === contentKey ? 'Saved' : revisionTarget ? 'Save revision' : 'Save draft'}</Button>{!storageAvailable && <p className="text-xs text-ink-subtle">Saving drafts is not available yet.</p>}</div>}
    </>}
    {withheldCopyReview && <div className="space-y-2"><BillingDraftMessage review={{ ...withheldCopyReview, message: { ...withheldCopyReview.message, zh: null, en: null, blocked_reasons: [] } }} canCopy={false} onCopy={copy} feedback={activeCopyFeedback?.value} /><Button size="sm" onClick={() => { setFailure(null); setCopyFeedback(null); setRetry(value => value + 1); }}>Retry review</Button></div>}
    {notice?.key === requestKey && <p role="status" className="text-sm text-ink-subtle">{notice.message}</p>}
  </div>;

  if (inline) return body;

  return <div>
    <Button ref={trigger} icon={FileCheck2} hidden={open && !!presentation?.inDialog} onClick={() => { setOpenKey(baseKey); setReviewing?.(true); }}>Review payment</Button>
    {presentation?.inDialog ? open && body : <Modal key={baseKey} isOpen={open} onClose={() => close()} persistent={busy} title="Review payment" size="xl" className="min-w-0"><BillingDraftFocus trigger={trigger}>{body}</BillingDraftFocus></Modal>}
  </div>;
}
