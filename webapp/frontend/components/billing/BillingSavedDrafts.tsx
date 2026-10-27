'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarPlus, FileClock, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button, Select, buttonClasses } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PaymentMethodBadge } from '@/components/payments/PaymentMethodBadge';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { formatShortDate } from '@/lib/formatters';
import { BillingCopyFeedbackNotice, BillingDraftFocus, BillingDraftMessage, BillingDraftSummaryContent, billingDraftAuthScope, billingDraftTutorId, type BillingCopyFeedback } from './BillingDraftReview';
import type { BillingDraftDetail, BillingPaymentDetail } from '@/types/billing';
import { BillingConfirmDraft } from './BillingConfirmDraft';

export function BillingSavedDrafts({ studentId, scope, refreshKey, initialDraftId, savedRevision, onDraftClosed, onDiscarded, onRevise, workflowAvailable = false, workflowWritesAvailable = false, onConfirmed, onOpenPayment, inline = false, onBusyChange }: {
  studentId: number;
  inline?: boolean;
  onBusyChange?: (busy: boolean) => void;
  scope: string;
  refreshKey?: string | number;
  initialDraftId?: string | null;
  savedRevision?: number;
  onDraftClosed?: () => void;
  onDiscarded?: (id: string) => void;
  onRevise?: (detail: BillingDraftDetail) => void;
  workflowAvailable?: boolean;
  workflowWritesAvailable?: boolean;
  onConfirmed?: (payment: BillingPaymentDetail) => void;
  onOpenPayment?: (id: string) => void;
}) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const identity = JSON.stringify([studentId, scope, billingDraftAuthScope(auth), refreshKey]);
  const initialToken = JSON.stringify([studentId, scope, billingDraftAuthScope(auth), initialDraftId, savedRevision]);
  const [dismissedInitial, setDismissedInitial] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ identity: string; id: string; revision?: number } | null>(null);
  const selected = selection?.identity === identity ? selection : initialDraftId && dismissedInitial !== initialToken ? { identity, id: initialDraftId, revision: undefined } : null;
  const [showDiscarded, setShowDiscarded] = useState(false);
  const list = useSWR(['billing-saved-drafts', identity, showDiscarded], () => showDiscarded ? billingAPI.studentDrafts(studentId, undefined, tutorId, true) : billingAPI.studentDrafts(studentId, undefined, tutorId), { keepPreviousData: false });
  const detailKey = selected ? JSON.stringify([identity, selected.id, selected.revision]) : null;
  const details = useSWR(detailKey ? ['billing-draft-detail', detailKey] : null, () => billingAPI.draft(selected!.id, selected!.revision, undefined, tutorId), { keepPreviousData: false });
  const detail = selected && details.data?.student_id === studentId && details.data.id === selected.id ? details.data : null;
  const discarded = detail?.state === 'discarded' || list.data?.some(item => item.id === selected?.id && item.state === 'discarded') === true;
  const currentRevision = detail?.current_revision ?? list.data?.find(item => item.id === selected?.id)?.current_revision ?? selected?.revision ?? 1;
  const viewedRevision = selected?.revision ?? detail?.revision ?? currentRevision;
  const revisionNumbers = [...new Set([...Array.from({ length: currentRevision }, (_, index) => index + 1), viewedRevision])].sort((a, b) => b - a);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const section = useRef<HTMLElement>(null);
  const listNotice = useRef<HTMLParagraphElement>(null);
  const operation = useRef<AbortController | null>(null);
  const current = useRef(detailKey); current.current = detailKey;
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  const [copyFeedback, setCopyFeedback] = useState<{ key: string; value: BillingCopyFeedback } | null>(null);
  useEffect(() => { setCopyFeedback(null); }, [detailKey]);
  const [listStatus, setListStatus] = useState<{ identity: string; text: string } | null>(null);
  const [copyingKey, setCopyingKey] = useState<string | null>(null);
  const [unverifiedKey, setUnverifiedKey] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<{ identity: string; id: string; revision: number } | null>(null);
  const target = discardTarget?.identity === identity ? discardTarget : null;
  const [discardingKey, setDiscardingKey] = useState<string | null>(null);
  const discarding = discardingKey === identity;
  const [discardError, setDiscardError] = useState<string | null>(null);
  const discardRetry = useRef<{ content: string; token: string } | null>(null);
  const copying = !!detailKey && copyingKey === detailKey;
  const [confirming, setConfirming] = useState(false);
  const busy = copying || discarding || confirming;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => () => operation.current?.abort(), [detailKey, identity]);
  useEffect(() => { if (!initialDraftId) setDismissedInitial(null); }, [initialDraftId]);
  const close = (restoreFocus = true) => {
    if (discarding) return;
    operation.current?.abort(); setCopyFeedback(null); setSelection(null); setDismissedInitial(initialToken); onDraftClosed?.();
    if (restoreFocus && initialDraftId && !trigger.current) requestAnimationFrame(() => {
      const tabId = section.current?.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby');
      if (tabId) document.getElementById(tabId)?.focus();
    });
  };

  function askDiscard(id: string, revision: number) {
    if (!auth.isAdmin || discarding || copying) return;
    setDiscardTarget({ identity, id, revision }); setDiscardError(null);
  }

  async function discard() {
    if (!target || !auth.isAdmin || discarding) return;
    const content = JSON.stringify(target);
    if (discardRetry.current?.content !== content) discardRetry.current = { content, token: crypto.randomUUID() };
    const abort = new AbortController(); operation.current = abort; setDiscardingKey(identity); setDiscardError(null);
    try {
      const result = await billingAPI.discardDraft(target.id, { expected_revision: target.revision, idempotency_key: discardRetry.current.token }, abort.signal);
      if (abort.signal.aborted || currentIdentity.current !== identity) return;
      if (selected?.id === target.id && selected.revision === undefined) await details.mutate(result, false);
      if (abort.signal.aborted || currentIdentity.current !== identity) return;
      await list.mutate(items => items?.flatMap(item => item.id !== target.id ? [item] : showDiscarded ? [{ ...item, state: 'discarded' as const, current_revision: result.current_revision }] : []), false);
      if (abort.signal.aborted || currentIdentity.current !== identity) return;
      discardRetry.current = null;
      setDiscardTarget(null); setSelection(null); setDismissedInitial(initialToken);
      setListStatus({ identity, text: 'Draft discarded.' });
      requestAnimationFrame(() => listNotice.current?.focus());
      onDraftClosed?.(); onDiscarded?.(target.id);
      void invalidateRenewalQueueCache();
      void list.mutate();
    } catch (error) {
      if (!abort.signal.aborted && currentIdentity.current === identity) {
        setDiscardError(error instanceof Error ? error.message : 'Could not discard this draft. Try again.');
        if ((error as { status?: number }).status === 409) { void list.mutate(); if (selected) void details.mutate(); }
      }
    } finally { setDiscardingKey(value => value === identity ? null : value); }
  }

  async function copy(language: 'zh' | 'en') {
    if (!detail || discarded || detail.confirmed_payment_id || !detailKey || current.current !== detailKey || !detail.can_copy || detail.stale_reasons.length || detail.revision !== detail.current_revision || copying || discarding) return;
    const key = detailKey;
    const abort = new AbortController(); operation.current = abort; setCopyingKey(key); setCopyFeedback(null);
    try {
      const fresh = await billingAPI.draft(detail.id, detail.revision, abort.signal, tutorId);
      if (abort.signal.aborted || current.current !== key) return;
      if (fresh.state === 'discarded' || fresh.confirmed_payment_id || !fresh.can_copy || fresh.stale_reasons.length || fresh.revision !== fresh.current_revision || fresh.review.review_hash !== detail.review.review_hash || fresh.review.message.blocked_reasons.length || !fresh.review.message[language]) {
        await details.mutate(fresh, false);
        if (abort.signal.aborted || current.current !== key) return;
        setCopyFeedback({ key, value: { kind: 'info', message: 'This draft changed. Review the latest payment before copying.' } }); return;
      }
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable in this browser.');
      await navigator.clipboard.writeText(fresh.review.message[language]);
      if (!abort.signal.aborted && current.current === key) setCopyFeedback({ key, value: { kind: 'success', message: 'Message copied.' } });
    } catch (error) {
      if (!abort.signal.aborted && current.current === key) {
        setUnverifiedKey(key);
        setCopyFeedback({ key, value: { kind: 'error', message: error instanceof Error ? error.message : 'Could not copy this message.' } });
      }
    } finally { if (current.current === key) setCopyingKey(null); }
  }

  const canCopy = !!detail && !discarded && !detail.confirmed_payment_id && unverifiedKey !== detailKey && detail.can_copy && !detail.stale_reasons.length && detail.revision === detail.current_revision;
  const messageReview = detail && !canCopy ? { ...detail.review, message: { ...detail.review.message, zh: null, en: null, blocked_reasons: unverifiedKey === detailKey ? ['Retry this revision to confirm its payment details.'] : detail.stale_reasons.length ? detail.stale_reasons : detail.review.message.blocked_reasons.length ? detail.review.message.blocked_reasons : ['Open and review the latest revision before copying.'] } } : detail?.review;
  const currentUnconfirmed = !!detail && !discarded && !detail.confirmed_payment_id && detail.revision === detail.current_revision;
  const visibleDrafts = list.data?.filter(draft => draft.student_id === studentId && (showDiscarded || draft.state !== 'discarded'));
  const activeCopyFeedback = copyFeedback?.key === detailKey ? copyFeedback.value : null;

  const detailBody = <div className="space-y-5">
      {selected && <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs"><span>Revision</span><Select aria-label="Draft revision" value={viewedRevision} disabled={discarding} onChange={event => setSelection({ identity, id: selected.id, revision: Number(event.target.value) })}>{revisionNumbers.map(revision => <option key={revision} value={revision}>Revision {revision}</option>)}</Select></div>{discarded ? <Badge>Discarded</Badge> : detail && detail.stale_reasons.length > 0 && <Badge tone="warning">Needs review</Badge>}</div>}
      {details.error && <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-300"><p>Could not load this revision.</p><Button size="sm" onClick={() => details.mutate()}>Retry revision</Button></div>}
      {!detail && !details.error && <p role="status" className="text-sm text-ink-subtle">Loading revision…</p>}
      {detail && !details.error && <>
        {initialDraftId === detail.id && savedRevision === detail.revision && !discarded && <p role="status" className="text-sm">Draft saved. Revision {detail.revision}.</p>}
        <BillingDraftSummaryContent review={detail.review} />
        {currentUnconfirmed && auth.isAdmin && <>
          {workflowAvailable && workflowWritesAvailable && onConfirmed ? <BillingConfirmDraft canWrite onBusyChange={setConfirming} draft={detail} onConfirmed={payment => { close(false); onConfirmed(payment); }} /> : <div className="space-y-2"><Button icon={CalendarPlus} disabled>Create enrollment</Button><p className="text-xs text-ink-subtle">Enrollment creation is not enabled yet.</p></div>}
        </>}
        {messageReview && !discarded && !detail.confirmed_payment_id ? <div className="space-y-2">
          <BillingDraftMessage review={messageReview} canCopy={canCopy} onCopy={copy} busy={copying || discarding} feedback={activeCopyFeedback} onLanguageChange={() => setCopyFeedback(null)} />
          {unverifiedKey === detailKey && <Button size="sm" onClick={async () => { const key = detailKey; try { await details.mutate(); if (current.current === key) { setUnverifiedKey(null); setCopyFeedback(null); } } catch { /* SWR exposes the revision error above. */ } }}>Retry revision</Button>}
        </div> : activeCopyFeedback && <BillingCopyFeedbackNotice feedback={activeCopyFeedback} />}
        {detail.note && <div><h3 className="text-xs font-semibold">Draft note</h3><p className="mt-1 whitespace-pre-wrap text-sm">{detail.note}</p></div>}
        <details className="rounded border border-line p-3"><summary className="cursor-pointer text-sm">Revision history</summary><ol className="mt-3 space-y-2 text-xs">{detail.history.map(item => <li key={item.revision}><span className="font-medium">{item.action === 'discarded' ? 'Discarded' : `Revision ${item.revision}`}</span> · {item.created_by_name} · {formatShortDate(item.created_at)}{item.note && <p className="mt-1 text-ink-subtle">{item.note}</p>}</li>)}</ol></details>
        {detail.confirmed_payment_id ? onOpenPayment ? <Button onClick={() => { close(false); onOpenPayment(detail.confirmed_payment_id!); }}>Open payment</Button> : <Link className="text-sm font-medium text-accent-ink hover:underline" href={`/billing/students/${studentId}?view=payments&payment=${encodeURIComponent(detail.confirmed_payment_id)}`}>Open payment</Link> : currentUnconfirmed && auth.isAdmin && <div className="flex flex-wrap gap-2">
          {onRevise && <Button icon={Pencil} disabled={discarding} onClick={() => { close(false); onRevise(detail); }}>Revise draft</Button>}
          <Button variant="quiet" icon={Trash2} disabled={copying || discarding} onClick={() => askDiscard(detail.id, detail.current_revision)}>Discard draft</Button>
        </div>}
      </>}
    </div>;

  return <section ref={section} aria-label="Saved payment drafts" className="space-y-3">
    {!inline && <><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-semibold"><FileClock className="h-4 w-4 text-ink-subtle" aria-hidden="true" />Saved drafts</h2><label className="flex items-center gap-2 text-xs text-ink-subtle"><input type="checkbox" checked={showDiscarded} onChange={event => setShowDiscarded(event.target.checked)} />Show discarded</label></div>
    {listStatus?.identity === identity && <p ref={listNotice} role="status" tabIndex={-1} className="text-sm outline-none">{listStatus.text}</p>}
    {list.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-300"><span>Could not load saved drafts.</span><Button size="sm" onClick={() => list.mutate()}>Retry</Button></div>}
    {!list.data && !list.error && <p role="status" className="text-sm text-ink-subtle">Loading drafts…</p>}
    {visibleDrafts?.length === 0 && <p className="text-sm text-ink-subtle">No saved drafts yet.</p>}
    <div className="grid gap-2 sm:grid-cols-2">{visibleDrafts?.map(draft => <article key={draft.id} className="rounded-md border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Payment {draft.period_number}</span><PaymentMethodBadge method={draft.payment_method} /></div>
      <p className="mt-2 text-sm">{draft.lesson_count} sessions · {draft.total_fee === null ? 'Fee to confirm' : `$${draft.total_fee.toLocaleString('en-US')}`}</p>
      <p className="mt-1 text-xs text-ink-subtle">{formatShortDate(draft.coverage_from)} to {formatShortDate(draft.coverage_through)} · Revision {draft.current_revision}</p>
      {draft.state === 'discarded' ? <Badge className="mt-2">Discarded</Badge> : draft.confirmed_payment_id && <Badge tone="success" className="mt-2">Enrollment created</Badge>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {draft.confirmed_payment_id && (onOpenPayment ? <Button size="sm" onClick={() => onOpenPayment(draft.confirmed_payment_id!)}>Open payment</Button> : <Link className={buttonClasses({ size: 'sm' })} href={`/billing/students/${studentId}?view=payments&payment=${encodeURIComponent(draft.confirmed_payment_id)}`}>Open payment</Link>)}
        <Button size="sm" variant={draft.confirmed_payment_id ? 'quiet' : 'secondary'} onClick={event => { trigger.current = event.currentTarget; setSelection({ identity, id: draft.id }); }}>{draft.state === 'discarded' ? 'View history' : draft.confirmed_payment_id ? 'View draft' : auth.isAdmin && workflowAvailable && workflowWritesAvailable ? 'Review & create enrollment' : 'View draft'}</Button>
        {auth.isAdmin && draft.state !== 'discarded' && !draft.confirmed_payment_id && <Button size="sm" variant="quiet" icon={Trash2} disabled={discarding} onClick={() => askDiscard(draft.id, draft.current_revision)}>Discard draft</Button>}
      </div>
    </article>)}</div>
    </>}
    {inline && listStatus?.identity === identity && <p ref={listNotice} role="status" tabIndex={-1} className="text-sm outline-none">{listStatus.text}</p>}
    {inline ? selected && detailBody : <Modal key={identity} isOpen={!!selected} onClose={() => close()} title="Saved payment draft" size="xl" className="min-w-0"><BillingDraftFocus trigger={trigger} suspended={!!target}>{detailBody}</BillingDraftFocus></Modal>}
    <ConfirmDialog isOpen={!!target} title="Discard draft?" message={<><p>The draft will leave the list. Its history stays available.</p>{discardError && <p role="alert" className="mt-2 text-red-700 dark:text-red-300">{discardError}</p>}</>} confirmText="Discard draft" cancelText="Keep draft" variant="danger" loading={discarding} onConfirm={() => { void discard(); }} onCancel={() => setDiscardTarget(null)} />
  </section>;
}
