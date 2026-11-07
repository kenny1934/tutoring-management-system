'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { Button, IconButton } from '@/components/controls';
import { FeeMessageContent } from '@/components/enrollments/FeeMessageContent';
import { shareOrCopy, useCanShare } from '@/lib/share';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { FeeMessagePanel } from '@/components/enrollments/FeeMessagePanel';
import { useAuth } from '@/contexts/AuthContext';
import { billingAPI } from '@/lib/billing-api';
import { enrollmentsAPI } from '@/lib/api';
import type { Enrollment } from '@/types';
import type { BillingDraftDetail, BillingPaymentDetail, BillingQueueRow } from '@/types/billing';
import { BillingCopyFeedbackNotice, billingDraftAuthScope, billingDraftTutorId, type BillingCopyFeedback } from './BillingDraftReview';

export type BillingCardMessageTarget = { kind: 'draft' | 'payment'; id: string; studentId: number }
  | { kind: 'legacy'; id: number; studentId: number };

export function cardFeeMessageTarget(row: BillingQueueRow): BillingCardMessageTarget | null {
  if (row.stage === 'no_payment') return null;
  if (row.origin === 'draft' && row.draft_id && !row.payment_id && !row.payment_ids.length) return { kind: 'draft', id: row.draft_id, studentId: row.student.id };
  if (row.origin === 'payment' && row.payment_id && row.payment_ids.length <= 1) return { kind: 'payment', id: row.payment_id, studentId: row.student.id };
  if (row.origin === 'legacy' && row.enrollment_ids.length === 1 && !row.payment_ids.length) return { kind: 'legacy', id: row.enrollment_ids[0], studentId: row.student.id };
  return null;
}

export function BillingCardFeeMessage({ target, onClose, onChanged, canWrite = false, expectsUnsent = false }: {
  expectsUnsent?: boolean;
  canWrite?: boolean;
  target: BillingCardMessageTarget; onClose: () => void; onChanged: () => void;
}) {
  const auth = useAuth();
  const identity = JSON.stringify([billingDraftAuthScope(auth), target]);
  return target.kind === 'legacy' ? <LegacyCardMessage key={identity} expectsUnsent={expectsUnsent} canWrite={canWrite} target={target} onClose={onClose} onChanged={onChanged} />
    : <ReviewedCardMessage key={identity} expectsUnsent={expectsUnsent} canWrite={canWrite} target={target} onClose={onClose} onChanged={onChanged} />;
}

function LegacyCardMessage({ target, onClose, onChanged, canWrite, expectsUnsent }: {
  expectsUnsent: boolean;
  canWrite: boolean;
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
  if (enrollment?.billing_payment_id) return <ReviewedCardMessage expectsUnsent={expectsUnsent} canWrite={canWrite} onChanged={onChanged} target={{ kind: 'payment', id: enrollment.billing_payment_id, studentId: target.studentId }} onClose={onClose} />;
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

function ReviewedCardMessage({ target, onClose, onChanged, canWrite, expectsUnsent }: {
  expectsUnsent: boolean;
  onChanged: () => void; canWrite: boolean;
  target: Exclude<BillingCardMessageTarget, { kind: 'legacy' }>; onClose: () => void;
}) {
  const auth = useAuth();
  const tutorId = billingDraftTutorId(auth);
  const canShare = useCanShare();
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [editing, setEditing] = useState(false);
  const [localMessage, setLocalMessage] = useState<{ key: string; text: string } | null>(null);
  const sentRetry = useRef<{ key: string; token: string } | null>(null);
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
    // A lost Mark sent response can leave an old card in the queue. Recover
    // from the authoritative read without sending the request a second time.
    // Already-sent messages in Awaiting payment need no queue refresh: doing
    // that on every mount would repeatedly unmount and reload their panel.
    if (!signal.aborted && active.current && (expectsUnsent || sentRetry.current !== null) && next.kind === 'payment' && (next.data.sent_at || next.data.status !== 'Pending Payment')) {
      void invalidateRenewalQueueCache(); onChanged();
    }
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

  const templateKey = JSON.stringify([record?.data.id, record?.data.review.review_hash, record?.kind === 'payment' ? record.data.version : record?.data.revision, language]);
  const originalMessage = record?.data.review.message[language] || '';
  const message = localMessage?.key === templateKey ? localMessage.text : originalMessage;
  const canMarkSent = auth.isAdmin && !auth.isReadOnly && canWrite && canCopy && record?.kind === 'payment' && !record.data.sent_at;

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
      const outcome = await shareOrCopy(message);
      if (outcome === 'cancelled') return;
      if (active.current && !abort.signal.aborted) setFeedback({ kind: 'success', message: outcome === 'copied' ? 'Message copied.' : 'Message shared.' });
    } catch (error) {
      if (active.current && !abort.signal.aborted) {
        if (!checked) setVerified(false);
        setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not copy the message.' });
      }
    } finally { copying.current = false; if (active.current) setBusy(false); }
  }

  async function markSent() {
    if (!record || record.kind !== 'payment' || !canMarkSent || !message.trim() || copying.current) return;
    copying.current = true; setBusy(true); setFeedback(null);
    const abort = new AbortController(); operation.current = abort;
    try {
      const fresh = await read(abort.signal);
      if (!active.current || abort.signal.aborted) return;
      setRecord(fresh);
      if (fresh.kind !== 'payment' || copyBlocks(fresh).length || !sameMessage(record, fresh) || !fresh.data.review.message[language] || fresh.data.sent_at) {
        setFeedback({ kind: 'info', message: 'The fee message changed. Check it before marking sent.' }); return;
      }
      const body = { language, expected_version: fresh.data.version };
      const key = JSON.stringify([target, body]);
      if (sentRetry.current?.key !== key) sentRetry.current = { key, token: crypto.randomUUID() };
      const result = await billingAPI.markPaymentSent(fresh.data.id, { ...body, idempotency_key: sentRetry.current.token }, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      if (result.id !== target.id || result.student_id !== target.studentId || result.status !== 'Pending Payment' || !result.sent_at || result.sent_language !== language) throw new Error('Could not verify the sent status. Reload the message before continuing.');
      sentRetry.current = null; setRecord({ kind: 'payment', data: result });
      setFeedback({ kind: 'success', message: 'Fee message marked sent.' });
      void invalidateRenewalQueueCache(); onChanged();
    } catch (error) {
      if (active.current && !abort.signal.aborted) {
        setVerified(false);
        setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Could not mark the message sent.' });
      }
    } finally { copying.current = false; if (active.current) setBusy(false); }
  }

  const errorContent = loadError ? <div className="space-y-2 text-sm"><p>{loadError}</p><Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry message</Button></div>
    : record && !canCopy ? <div className="space-y-2 text-sm">{feedback?.kind === 'error' && <p>{feedback.message}</p>}<ul>{[...new Set([...blocks, ...(!verified ? ['Reload the message before copying.'] : [])])].map(reason => <li key={reason}>{reason}</li>)}</ul>{!verified && <Button size="sm" onClick={() => setRetry(value => value + 1)}>Retry message</Button>}</div> : undefined;
  return <FeeMessageContent
    language={language} onLanguageChange={value => { setLanguage(value); setFeedback(null); setEditing(false); }}
    lessons={record?.data.review.period.lesson_count ?? 0} message={canCopy ? message : ''} originalMessage={originalMessage}
    editable={editing} onEditableChange={setEditing} onMessageChange={value => { setLocalMessage({ key: templateKey, text: value }); setFeedback(null); }}
    onReset={() => { setLocalMessage(null); setEditing(false); setFeedback(null); }} loading={!record && !loadError} error={errorContent}
    busy={busy} canCopy={canCopy && !!message.trim()} copied={feedback?.kind === 'success' && feedback.message === 'Message copied.'} canShare={canShare}
    onCopy={() => { void copy(language); }} onClose={onClose} closeLabel="Close fee message"
    onMarkSent={canMarkSent ? () => { void markSent(); } : undefined}
    feedback={<>{feedback && !(errorContent && feedback.kind === 'error') && <BillingCopyFeedbackNotice feedback={feedback} />}{record?.kind === 'draft' && record.data.confirmed_payment_id && <Link className="text-sm text-accent-ink hover:underline" href={`/billing/students/${target.studentId}?view=payments&payment=${encodeURIComponent(record.data.confirmed_payment_id)}`}>Open payment</Link>}</>}
  />;
}
