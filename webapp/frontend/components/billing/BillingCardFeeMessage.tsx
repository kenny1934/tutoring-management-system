'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Button, IconButton } from '@/components/controls';
import { FeeMessagePanel } from '@/components/enrollments/FeeMessagePanel';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { enrollmentsAPI } from '@/lib/api';
import type { Enrollment } from '@/types';
import type { BillingDraftDetail, BillingPaymentDetail, BillingQueueRow } from '@/types/billing';
import { BillingDraftMessage, billingDraftAuthScope, billingDraftTutorId, type BillingCopyFeedback } from './BillingDraftReview';

export type BillingCardMessageTarget = { kind: 'draft' | 'payment'; id: string; studentId: number }
  | { kind: 'legacy'; id: number; studentId: number };

export function cardFeeMessageTarget(row: BillingQueueRow): BillingCardMessageTarget | null {
  if (row.stage === 'no_payment') return null;
  if (row.origin === 'draft' && row.draft_id && !row.payment_id && !row.payment_ids.length) return { kind: 'draft', id: row.draft_id, studentId: row.student.id };
  if (row.origin === 'payment' && row.payment_id && row.payment_ids.length <= 1) return { kind: 'payment', id: row.payment_id, studentId: row.student.id };
  if (row.origin === 'legacy' && row.enrollment_ids.length === 1 && !row.payment_ids.length) return { kind: 'legacy', id: row.enrollment_ids[0], studentId: row.student.id };
  return null;
}

export function BillingCardFeeMessage({ target, onClose, onChanged }: {
  target: BillingCardMessageTarget; onClose: () => void; onChanged: () => void;
}) {
  const auth = useAuth();
  const identity = JSON.stringify([billingDraftAuthScope(auth), target]);
  return target.kind === 'legacy' ? <LegacyCardMessage key={identity} target={target} onClose={onClose} onChanged={onChanged} />
    : <ReviewedCardMessage key={identity} target={target} onClose={onClose} />;
}

function LegacyCardMessage({ target, onClose, onChanged }: {
  target: Extract<BillingCardMessageTarget, { kind: 'legacy' }>; onClose: () => void; onChanged: () => void;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    enrollmentsAPI.getById(target.id).then(record => {
      if (!active) return;
      if (record.student_id !== target.studentId) throw new Error('These records belong to another student.');
      setEnrollment(record);
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load the enrollment.'); });
    return () => { active = false; };
  }, [target.id, target.studentId]);
  // A record can have moved to the combined workflow since the queue loaded.
  if (enrollment?.billing_payment_id) return <ReviewedCardMessage target={{ kind: 'payment', id: enrollment.billing_payment_id, studentId: target.studentId }} onClose={onClose} />;
  const blocked = error || (enrollment?.enrollment_type === 'Summer' ? 'Open this enrollment to use its Summer fee message.'
    : enrollment && !['Pending Payment', 'Unpaid', 'Overdue'].includes(enrollment.payment_status) ? 'This enrollment is no longer awaiting payment.'
    : enrollment && (!enrollment.lessons_paid || enrollment.lessons_paid <= 0) ? 'Check the enrollment’s lesson count first.' : null);
  if (!enrollment || blocked) return <div className="border-t border-line bg-wash p-4"><div className="flex items-center justify-between gap-2"><p role={blocked ? 'alert' : 'status'} className="text-sm">{blocked || 'Loading fee message…'}</p><IconButton label="Close fee message" icon={X} size="sm" onClick={onClose} /></div></div>;
  return <FeeMessagePanel enrollment={{
    id: enrollment.id, student_id: enrollment.student_id, renewal_enrollment_id: enrollment.id,
    renewal_lessons_paid: enrollment.lessons_paid,
    renewal_status: enrollment.fee_message_sent ? 'message_sent' : 'pending_message',
  }} onClose={onClose} onMarkSent={onChanged} />;
}

type MessageRecord = { kind: 'draft'; data: BillingDraftDetail } | { kind: 'payment'; data: BillingPaymentDetail };

function copyBlocks(record: MessageRecord): string[] {
  if (record.kind === 'draft') {
    const draft = record.data;
    return [
      ...(draft.state === 'discarded' ? ['This draft was discarded.'] : []),
      ...(draft.confirmed_payment_id ? ['Open the payment to use its fee message.'] : []),
      ...(draft.revision !== draft.current_revision ? ['Open the latest draft revision.'] : []),
      ...draft.stale_reasons, ...draft.review.message.blocked_reasons,
      ...(!draft.can_copy ? ['Review the draft before copying its message.'] : []),
    ];
  }
  return [
    ...(record.data.status !== 'Pending Payment' ? ['This payment is no longer awaiting collection.'] : []),
    ...record.data.review_issues, ...record.data.review.message.blocked_reasons,
    ...(!record.data.can_copy ? ['Review this payment before copying its message.'] : []),
  ];
}

function sameMessage(before: MessageRecord, after: MessageRecord): boolean {
  if (before.kind !== after.kind || before.data.id !== after.data.id || before.data.review.review_hash !== after.data.review.review_hash) return false;
  if (before.kind === 'draft' && after.kind === 'draft') return before.data.revision === after.data.revision;
  return before.kind === 'payment' && after.kind === 'payment' && before.data.version === after.data.version;
}

function ReviewedCardMessage({ target, onClose }: {
  target: Exclude<BillingCardMessageTarget, { kind: 'legacy' }>; onClose: () => void;
}) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const [record, setRecord] = useState<MessageRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<BillingCopyFeedback | null>(null);
  const [verified, setVerified] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const copying = useRef(false);
  const active = useRef(true);
  const operation = useRef<AbortController | null>(null);

  async function read(signal: AbortSignal): Promise<MessageRecord> {
    const next: MessageRecord = target.kind === 'draft'
      ? { kind: 'draft', data: await billingAPI.draft(target.id, undefined, signal, tutorId) }
      : { kind: 'payment', data: await billingAPI.payment(target.id, tutorId, signal) };
    if (next.data.student_id !== target.studentId || next.data.id !== target.id) throw new Error('These records belong to another student or payment.');
    return next;
  }

  useEffect(() => {
    active.current = true;
    const abort = new AbortController(); operation.current = abort;
    setLoadError(null); setRecord(null); setFeedback(null); setVerified(true);
    // Identity changes remount this component; this effect only retries that source.
    void read(abort.signal).then(next => { if (!abort.signal.aborted) setRecord(next); })
      .catch(error => { if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not load the fee message.'); });
    return () => { active.current = false; abort.abort(); operation.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  const blocks = record ? copyBlocks(record) : [];
  const canCopy = !!record && verified && !blocks.length;

  async function copy(language: 'zh' | 'en') {
    if (!record || !canCopy || copying.current) return;
    copying.current = true; setBusy(true); setFeedback(null);
    const abort = new AbortController(); operation.current = abort;
    let checked = false;
    try {
      const fresh = await read(abort.signal);
      if (!active.current || abort.signal.aborted) return;
      setRecord(fresh);
      if (copyBlocks(fresh).length || !sameMessage(record, fresh) || !fresh.data.review.message[language]) {
        setFeedback({ kind: 'info', message: 'The fee message changed. Check it before copying.' }); return;
      }
      checked = true;
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable in this browser.');
      await navigator.clipboard.writeText(fresh.data.review.message[language]!);
      if (active.current && !abort.signal.aborted) setFeedback({ kind: 'success', message: 'Message copied.' });
    } catch (error) {
      if (active.current && !abort.signal.aborted) {
        if (!checked) setVerified(false);
        setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not copy the message.' });
      }
    } finally { copying.current = false; if (active.current) setBusy(false); }
  }

  const review = record && (!canCopy ? { ...record.data.review, message: { ...record.data.review.message, zh: null, en: null,
    blocked_reasons: [...new Set([...blocks, ...(!verified ? ['Reload the message before copying.'] : [])])],
  } } : record.data.review);
  return <div className="space-y-3 border-t border-line bg-wash p-3 sm:p-4" onClick={event => event.stopPropagation()}>
    <div className="flex justify-end"><IconButton label="Close fee message" icon={X} size="sm" disabled={busy} onClick={onClose} /></div>
    {loadError ? <div role="alert" className="space-y-2 text-sm"><p>{loadError}</p><Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry message</Button></div> : !record ? <p role="status" className="text-sm text-ink-subtle">Loading fee message…</p> : review && <>
      <BillingDraftMessage review={review} canCopy={canCopy} onCopy={copy} busy={busy} feedback={feedback} onLanguageChange={() => setFeedback(null)} />
      {!verified && <Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry message</Button>}
      {record.kind === 'draft' && record.data.confirmed_payment_id && <Link className="text-sm text-accent-ink hover:underline" href={`/billing/students/${target.studentId}?view=payments&payment=${encodeURIComponent(record.data.confirmed_payment_id)}`}>Open payment</Link>}
    </>}
  </div>;
}
