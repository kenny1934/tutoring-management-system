'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/controls';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import type { BillingDraftDetail, BillingPaymentDetail } from '@/types/billing';
import { billingDraftAuthScope, billingDraftTutorId } from './BillingDraftReview';

export function BillingConfirmDraft({ draft, onConfirmed, canWrite = false, onBusyChange }: { onBusyChange?: (busy: boolean) => void; draft: BillingDraftDetail; onConfirmed: (payment: BillingPaymentDetail) => void; canWrite?: boolean }) {
  const auth = useAuth();
  const key = JSON.stringify([billingDraftAuthScope(auth), draft.id, draft.revision, draft.review.review_hash]);
  const safe = draft.state !== 'discarded' && draft.can_copy && !draft.stale_reasons.length && !draft.review.message.blocked_reasons.length && draft.revision === draft.current_revision && !draft.confirmed_payment_id;
  const preferences = useSWR(auth.isAdmin && safe ? ['billing-preferences', `${draft.student_id}:${billingDraftAuthScope(auth)}`] : null, () => billingAPI.preferences(draft.student_id, billingDraftTutorId(auth)), { keepPreviousData: false });
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey === key;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const retry = useRef<{ content: string; token: string } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const current = useRef(key); current.current = key;
  useEffect(() => () => operation.current?.abort(), [key, canWrite]);
  const methodMatches = preferences.data?.payment_method === draft.review.scenario.payment_method;
  const bankReady = draft.review.period.collection.method !== 'autopay' || preferences.data?.mandate_ready;

  async function confirm() {
    if (!safe || !auth.isAdmin || !canWrite || !preferences.data || !methodMatches || !bankReady || confirmed !== key || busy) return;
    const body = { expected_revision: draft.revision, expected_review_hash: draft.review.review_hash, expected_preference_version: preferences.data.version };
    const content = JSON.stringify([key, body]);
    if (retry.current?.content !== content) retry.current = { content, token: crypto.randomUUID() };
    const abort = new AbortController(); operation.current = abort; setBusyKey(key); setFailure(null);
    try {
      const payment = await billingAPI.confirmDraft(draft.id, { ...body, idempotency_key: retry.current.token }, abort.signal);
      if (!abort.signal.aborted && current.current === key) { retry.current = null; onConfirmed(payment); }
    } catch (error) {
      if (!abort.signal.aborted && current.current === key) setFailure({ key, text: error instanceof Error ? error.message : 'Could not create the enrollment. Try again.' });
    } finally { if (current.current === key) setBusyKey(null); }
  }

  if (!auth.isAdmin || !canWrite || !safe) return null;
  const count = draft.review.period.counts_by_slot.filter(value => value > 0).length;
  return <section className="space-y-3 border-t border-line pt-4" aria-label="Create reviewed enrollment">
    <div><h3 className="text-sm font-semibold">Create {count === 1 ? 'enrollment' : 'enrollments'}</h3><p className="mt-1 text-xs text-ink-subtle">{draft.review.period.lesson_count} sessions will be created under {count === 1 ? 'one enrollment' : `${count} enrollments`}. The payment starts as unpaid.</p></div>
    {preferences.error ? <div role="alert" className="text-sm">Could not load payment settings. <Button size="sm" onClick={() => preferences.mutate()}>Retry settings</Button></div> : !preferences.data ? <p role="status" className="text-sm">Checking payment settings…</p> : !methodMatches ? <p className="text-sm text-amber-800 dark:text-amber-300">Save the parent’s {draft.review.scenario.payment_method === 'autopay' ? 'Autopay' : 'Manual'} preference in Payment settings first.</p> : !bankReady ? <p className="text-sm text-amber-800 dark:text-amber-300">Record the completed bank authorisation in Payment settings first.</p> : <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed === key} disabled={busy} onChange={event => setConfirmed(event.target.checked ? key : null)} />I checked the session dates and total fee.</label>}
    <Button icon={CalendarPlus} variant="primary" loading={busy} disabled={!methodMatches || !bankReady || !!preferences.error || confirmed !== key} onClick={confirm}>Create {count === 1 ? 'enrollment' : 'enrollments'}</Button>
    {failure?.key === key && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure.text}</p>}
  </section>;
}
