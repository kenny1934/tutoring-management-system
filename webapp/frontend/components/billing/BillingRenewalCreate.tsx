'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/controls';
import { useAuth } from '@/contexts/AuthContext';
import type { BillingRenewalCreator } from '@/lib/billing-renewal-create';
import type { BillingDraftReview, BillingDraftReviewRequest, BillingPaymentDetail } from '@/types/billing';

export function BillingRenewalCreate({ creator, authScope, studentId, review, request, note, revisionTarget, canWrite, storageAvailable, onCreated, onBusyChange, onStale }: {
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
}) {
  const auth = useAuth();
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
  return <div className="space-y-2">
    <Button icon={CalendarPlus} variant="primary" loading={busy} disabled={!allowed || busy} onClick={create}>Create {multiple ? 'enrollments' : 'enrollment'}</Button>
    {failure?.key === key && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{failure.text}</p>}
    {!canWrite && <p className="text-xs text-ink-subtle">Enrollment creation is not available right now.</p>}
  </div>;
}
