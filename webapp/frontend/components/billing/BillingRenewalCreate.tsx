'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/controls';
import { useAuth } from '@/contexts/AuthContext';
import type { BillingRenewalCreator } from '@/lib/billing-renewal-create';
import type { BillingDraftReview, BillingDraftReviewRequest, BillingPaymentDetail } from '@/types/billing';

// These server checks describe the same required action. Keep it visible once.
const creationReasonLabels: Record<string, string> = {
  'Check bank authorisation and the setup deadline before using these debit dates.': 'Bank authorisation needed.',
  'Confirm bank authorisation before preparing an autopay fee message.': 'Bank authorisation needed.',
};

export function BillingRenewalCreate({ creator, authScope, studentId, review, request, note, revisionTarget, canWrite, storageAvailable, onCreated, onBusyChange, onStale, reviewUnavailableReason, secondaryActions }: {
  creator: BillingRenewalCreator;
  authScope: string;
  studentId: number;
  review: BillingDraftReview | null;
  request: BillingDraftReviewRequest;
  note: string;
  revisionTarget?: { id: string; current_revision: number };
  canWrite: boolean;
  storageAvailable: boolean;
  onCreated: (payment: BillingPaymentDetail) => void;
  onBusyChange?: (busy: boolean) => void;
  onStale?: () => void;
  reviewUnavailableReason?: string;
  secondaryActions?: ReactNode;
}) {
  const auth = useAuth();
  const reasonId = useId();
  const scope = authScope;
  const key = JSON.stringify([scope, studentId, request, review?.review_hash, note, revisionTarget]);
  const current = useRef(key); current.current = key;
  const operation = useRef<AbortController | null>(null);
  const running = useRef(false);
  const [busyKey, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; text: string } | null>(null);
  const busy = busyKey === key;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => () => operation.current?.abort(), [key]);
  const allowed = auth.isAdmin && !auth.isReadOnly && canWrite && storageAvailable && !!review
    && !review.message.blocked_reasons.length && review.period.total_fee !== null;

  async function create() {
    if (!allowed || !review || running.current) return;
    const activeKey = key;
    const abort = new AbortController(); operation.current = abort; running.current = true;
    setBusy(activeKey); setFailure(null);
    try {
      const payment = await creator.create({ scope, studentId, request, review, note, revisionTarget }, abort.signal);
      if (!abort.signal.aborted && current.current === activeKey) onCreated(payment);
    } catch (error) {
      if (!abort.signal.aborted && current.current === activeKey) {
        setFailure({ key: activeKey, text: error instanceof Error ? error.message : 'Could not create the enrollment. Try again.' });
        if ((error as { status?: number } | null)?.status === 409) onStale?.();
      }
    } finally {
      running.current = false;
      setBusy(previous => previous === activeKey ? null : previous);
    }
  }

  if (!auth.isAdmin || auth.isReadOnly) return null;
  const multiple = (review?.period.counts_by_slot.filter(count => count > 0).length ?? 0) > 1;
  const reasons = !canWrite || !storageAvailable ? ['Enrollment creation is not available right now.']
    : !review ? [reviewUnavailableReason || 'Checking enrollment details…']
    : [...new Set([...review.message.blocked_reasons.map(reason => creationReasonLabels[reason] || reason),
      ...(review.period.total_fee === null ? ['Confirm the materials charge to calculate the total fee.'] : [])])];
  return <div className="min-w-0 space-y-2">
    {!busy && reasons.length > 0 && <div id={reasonId} role="status" className="flex items-start gap-1.5 text-left text-xs text-amber-800 dark:text-amber-300">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {reasons.length === 1 ? <p>{reasons[0]}</p> : <ul className="list-disc space-y-1 pl-4">{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      {secondaryActions}
      <div className="ml-auto shrink-0"><Button icon={CalendarPlus} variant="primary" loading={busy} disabled={!allowed || busy} aria-describedby={!busy && reasons.length ? reasonId : undefined} onClick={create}>Create {multiple ? 'enrollments' : 'enrollment'}</Button></div>
    </div>
    {failure?.key === key && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure.text}</p>}
  </div>;
}
