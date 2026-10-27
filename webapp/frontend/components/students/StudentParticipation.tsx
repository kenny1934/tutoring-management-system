'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/controls';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/contexts/AuthContext';
import { billingDraftAuthScope, billingDraftTutorId } from '@/components/billing/BillingDraftReview';
import { makeupAPI } from '@/lib/makeup-api';
import { invalidateCaches } from '@/lib/hooks';
import { invalidateRenewalQueueCache } from '@/lib/renewal-queue';
import { formatShortDate } from '@/lib/formatters';
import type { ParticipationChange, ParticipationDetail, ParticipationPreview, ParticipationStatus } from '@/types/makeup';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Macau', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export function StudentParticipation({ studentId }: { studentId: number }) {
  const auth = useAuth();
  const scope = JSON.stringify([studentId, billingDraftAuthScope(auth)]);
  return <ParticipationContent key={scope} studentId={studentId} scope={scope} />;
}

function ParticipationContent({ studentId, scope }: { studentId: number; scope: string }) {
  const auth = useAuth();
  const state = useSWR(auth.user && !auth.isGuest ? ['student-participation', scope] : null,
    () => makeupAPI.participation(studentId, billingDraftTutorId(auth)), { keepPreviousData: false });
  const detail = state.data?.student_id === studentId ? state.data : null;
  const [open, setOpen] = useState(false);
  if (state.error) return <div className="flex items-center gap-2 text-xs text-ink-subtle"><span>Could not load participation.</span><Button size="sm" variant="quiet" onClick={() => state.mutate()}>Retry</Button></div>;
  if (!detail?.enabled) return null;
  const canManage = auth.isAdmin && !auth.isReadOnly && detail.can_manage;
  return <div className="flex flex-wrap items-center gap-2 py-1.5 text-xs" aria-label="Student participation">
    <span className="text-ink-subtle">Participation</span><Badge tone={detail.status === 'Active' ? 'success' : 'warning'}>{detail.status}</Badge>
    {detail.scheduled_status && <span>{detail.scheduled_status} from {formatShortDate(detail.scheduled_effective_on)}</span>}
    <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>{canManage ? 'Change' : 'History'}</Button>
    {open && <ParticipationDialog key={`${scope}:${detail.version}`} detail={detail} canManage={canManage} onClose={() => setOpen(false)}
      onReload={() => state.mutate()}
      onSaved={async next => { await state.mutate(next, false); setOpen(false); invalidateCaches('sessions', { studentId }); invalidateCaches('enrollments', { studentId }); invalidateCaches('proposals', { studentId }); void invalidateRenewalQueueCache(); }} />}
  </div>;
}

function ParticipationDialog({ detail, canManage, onClose, onSaved, onReload }: { detail: ParticipationDetail; canManage: boolean; onClose: () => void; onSaved: (next: ParticipationDetail) => Promise<void>; onReload: () => Promise<unknown> }) {
  const [status, setStatus] = useState<ParticipationStatus>(detail.status === 'Active' ? 'Paused' : 'Active');
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [returnId, setReturnId] = useState('');
  const [review, setReview] = useState<{ key: string; value: ParticipationPreview } | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const retry = useRef<{ key: string; body: ParticipationChange & { expected_version: number; expected_review_hash: string; idempotency_key: string } } | null>(null);
  const change: ParticipationChange = { status, effective_on: date, reason: reason.trim(), return_enrollment_id: status === 'Active' && returnId ? Number(returnId) : null };
  const key = JSON.stringify([detail.student_id, detail.version, change]);
  const current = useRef(key); current.current = key;
  const preview = review?.key === key ? review.value : null;
  const returning = status === 'Active';
  const complete = !!date && !!change.reason && (!returning || !!returnId);
  useEffect(() => () => operation.current?.abort(), [key]);

  async function check() {
    if (!canManage || !complete || running.current) return;
    running.current = true; setBusy(true); setFailure(null); setConfirmed(null);
    const abort = new AbortController(); operation.current = abort;
    try {
      const result = await makeupAPI.previewParticipation(detail.student_id, change, abort.signal);
      if (abort.signal.aborted || current.current !== key) return;
      if (result.student_id !== detail.student_id || result.version !== detail.version || result.change.status !== change.status
        || result.change.effective_on !== change.effective_on || result.change.reason !== change.reason || result.change.return_enrollment_id !== change.return_enrollment_id) { setNeedsReload(true); throw new Error('Participation changed. Refresh before continuing.'); }
      setReview({ key, value: result });
    } catch (error) { if (!abort.signal.aborted && current.current === key) { setFailure(error instanceof Error ? error.message : 'Could not review this change.'); if ((error as { status?: number }).status === 409) setNeedsReload(true); } }
    finally { running.current = false; if (current.current === key) setBusy(false); }
  }

  async function save() {
    if (!canManage || !preview?.can_confirm || preview.blocked_reasons.length || confirmed !== key || running.current) return;
    const content = JSON.stringify([key, preview.review_hash]);
    if (retry.current?.key !== content) retry.current = { key: content, body: { ...preview.change, expected_version: preview.version, expected_review_hash: preview.review_hash, idempotency_key: crypto.randomUUID() } };
    const abort = new AbortController(); operation.current = abort; running.current = true; setBusy(true); setFailure(null);
    try {
      const saved = await makeupAPI.changeParticipation(detail.student_id, retry.current.body, abort.signal);
      if (abort.signal.aborted || current.current !== key) return;
      if (saved.student_id !== detail.student_id) throw new Error('The student changed. Refresh participation.');
      await onSaved(saved);
    } catch (error) { if (!abort.signal.aborted && current.current === key) { setFailure(error instanceof Error ? error.message : 'Could not save participation. Retry this reviewed change.'); if ((error as { status?: number }).status === 409) setNeedsReload(true); } }
    finally { running.current = false; if (current.current === key) setBusy(false); }
  }

  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} persistent={busy} title="Student participation" size="lg"
    footer={<div className="flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={onClose}>Close</Button>{canManage && (preview ? <Button variant="primary" loading={busy} disabled={!preview.can_confirm || preview.blocked_reasons.length > 0 || confirmed !== key} onClick={save}>Confirm change</Button> : <Button variant="primary" loading={busy} disabled={!complete} onClick={check}>Review change</Button>)}</div>}>
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs"><span>Current: {detail.status}</span>{detail.paid_through && <span>Paid through {formatShortDate(detail.paid_through)}</span>}</div>
      {canManage && <fieldset disabled={busy} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Participation" id="participation-status"><Select value={status} onChange={event => { setStatus(event.target.value as ParticipationStatus); setConfirmed(null); }}><option value="Active">Active</option><option value="Paused">Paused</option><option value="Left">Left</option></Select></Field><Field label="From" id="participation-date"><Input type="date" min={detail.academic_start} value={date} onChange={event => setDate(event.target.value)} /></Field></div>
        {returning && <Field label="Paid return enrollment" id="participation-return" hint={!detail.return_candidates.length ? 'Record the paid return enrollment first.' : undefined}><Select value={returnId} onChange={event => setReturnId(event.target.value)}><option value="">Choose paid enrollment</option>{detail.return_candidates.map(candidate => <option key={candidate.enrollment_id} value={candidate.enrollment_id}>{formatShortDate(candidate.coverage_from)} to {formatShortDate(candidate.coverage_through)}</option>)}</Select></Field>}
        <Field label="Reason" id="participation-reason"><Textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      </fieldset>}
      {failure && <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-300"><p>{failure}</p>{needsReload && <Button size="sm" disabled={busy} onClick={async () => { await onReload(); setReview(null); setConfirmed(null); setFailure(null); setNeedsReload(false); }}>Refresh participation</Button>}</div>}
      {preview && <section aria-label="Participation change review" className="space-y-3 border-t border-line pt-3">
        <p className="font-medium">{preview.change.status} from {formatShortDate(preview.change.effective_on)}</p>
        {preview.affected_bookings.length > 0 ? <><p>{preview.affected_bookings.length} future makeup {preview.affected_bookings.length === 1 ? 'booking will' : 'bookings will'} return to pending.</p><ul className="space-y-2">{preview.affected_bookings.map(booking => <li key={booking.session_id} className="rounded border border-line p-2 text-xs"><span>{formatShortDate(booking.session_date)} · {booking.time_slot}</span><span className="mt-1 block text-ink-subtle">{booking.tutor_name} · {booking.location}</span></li>)}</ul></> : <p className="text-xs text-ink-subtle">No future makeup bookings need releasing.</p>}
        {[...preview.blocked_reasons, ...preview.warnings].map((message, index) => <p key={index} className="text-xs text-amber-800 dark:text-amber-300">{message}</p>)}
        {preview.can_confirm && <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={confirmed === key} onChange={event => setConfirmed(event.target.checked ? key : null)} />{preview.affected_bookings.length ? 'Release these bookings and keep the unused makeups pending.' : 'I checked this participation change.'}</label>}
      </section>}
      {detail.history.length > 0 && <details className="border-t border-line pt-3"><summary className="cursor-pointer text-sm">History</summary><ul className="mt-3 space-y-3">{detail.history.map(item => <li key={item.id} className="space-y-1 text-xs"><p className="font-medium">{item.status} from {formatShortDate(item.effective_on)}</p><p>{item.reason}</p><p className="text-ink-subtle">{item.actor_name} · {formatShortDate(item.created_at)}{item.released_session_ids.length ? ` · ${item.released_session_ids.length} bookings released` : ''}</p></li>)}</ul></details>}
    </div>
  </Modal>;
}
