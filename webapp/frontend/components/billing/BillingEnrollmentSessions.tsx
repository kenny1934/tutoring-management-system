'use client';

import { useRef, useState } from 'react';
import { SessionDetailPopover } from '@/components/sessions/SessionDetailPopover';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/controls';
import { SessionLessonBadge } from '@/components/sessions/LessonNumberBadge';
import { SessionStatusTag } from '@/components/ui/session-status-tag';
import { formatShortDate } from '@/lib/formatters';
import { useEnrollmentSessions } from '@/lib/hooks';
import { getDisplayStatus } from '@/lib/session-status';
import { normaliseTimeSlot } from '@/lib/time-slots';
import type { Session } from '@/types';

interface BillingEnrollmentSessionsProps {
  enrollmentId: number;
  studentId: number;
}

function ownsSessions(data: unknown, enrollmentId: number, studentId: number): data is Session[] {
  if (!Array.isArray(data)) return false;
  const ids = new Set<number>();
  return data.every((session: Session | null) => {
    if (!session || session.enrollment_id !== enrollmentId || session.student_id !== studentId
      || !Number.isInteger(session.id) || session.id <= 0 || ids.has(session.id)
      || typeof session.session_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(session.session_date)
      || typeof session.session_status !== 'string' || !session.session_status
      || typeof session.time_slot !== 'string') return false;
    const date = new Date(`${session.session_date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== session.session_date) return false;
    ids.add(session.id);
    return true;
  });
}

/** Read the teaching records after creation; a reviewed forecast has no attendance status. */
export function BillingEnrollmentSessions({ enrollmentId, studentId }: BillingEnrollmentSessionsProps) {
  const [selection, setSelection] = useState<{ studentId: number; enrollmentId: number; sessionId: number; position: { x: number; y: number } } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const validIdentity = Number.isInteger(enrollmentId) && enrollmentId > 0 && Number.isInteger(studentId) && studentId > 0;
  const { data, isLoading, error, mutate } = useEnrollmentSessions(validIdentity ? enrollmentId : null);
  const validRecords = validIdentity && ownsSessions(data, enrollmentId, studentId);
  const unavailable = !validIdentity || !!error || (data !== undefined && !validRecords);
  const loading = !unavailable && (isLoading || data === undefined);
  const sessions = !unavailable && validRecords ? [...data].sort((left, right) =>
    left.session_date.localeCompare(right.session_date)
      || normaliseTimeSlot(left.time_slot).localeCompare(normaliseTimeSlot(right.time_slot))
      || left.id - right.id) : [];

  const selected = selection?.studentId === studentId && selection.enrollmentId === enrollmentId
    ? sessions.find(session => session.id === selection.sessionId) : undefined;
  function closeSession() {
    setSelection(null);
    requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus({ preventScroll: true }));
  }

  return <section aria-label={`Enrollment ${enrollmentId} sessions`} className="space-y-2">
    <h4 className="text-sm font-semibold">Sessions{!loading && !unavailable ? ` (${sessions.length})` : ''}</h4>
    {unavailable ? <div role="alert" className="space-y-2 text-sm">
      <p>Could not load sessions for this enrollment.</p>
      {validIdentity && <Button size="sm" variant="secondary" onClick={() => { void mutate(); }}>Reload sessions</Button>}
    </div> : loading ? <p role="status" className="flex items-center gap-2 text-xs text-ink-subtle">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Loading sessions…
    </p> : !sessions.length ? <p className="text-xs text-ink-subtle">No sessions found.</p> :
      <div role="region" aria-label="Enrollment session list" tabIndex={0} className="max-h-[240px] overflow-y-auto rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <ul className="space-y-1">
          {sessions.map(session => {
            const status = getDisplayStatus(session);
            const date = formatShortDate(session.session_date);
            const details = [session.time_slot, session.location].filter(Boolean).join(' · ');
            return <li key={session.id}>
              <button type="button" aria-haspopup="dialog" onClick={event => {
                event.stopPropagation(); trigger.current = event.currentTarget;
                const rect = event.currentTarget.getBoundingClientRect();
                setSelection({ studentId, enrollmentId, sessionId: session.id, position: { x: rect.left + rect.width / 2, y: rect.bottom } });
              }}
                aria-label={`${date}${details ? ` · ${details}` : ''} · ${status}`}
                className="flex w-full items-center justify-between gap-2 rounded border border-line bg-tint p-1.5 text-left text-xs transition-colors hover:bg-[#efe5d7] dark:hover:bg-[#4d4638]">
                <div className="flex min-w-0 items-center gap-2">
                  <SessionLessonBadge session={session} size="xs" className="shrink-0" />
                  <div className="min-w-0">
                    <p className="text-on-surface">{date}</p>
                    {details && <p className="truncate text-[11px] text-ink-subtle">{details}</p>}
                  </div>
                </div>
                <SessionStatusTag status={status} size="sm" iconOnly className="shrink-0" />
              </button>
            </li>;
          })}
        </ul>
      </div>}
    {selected && selection && <SessionDetailPopover key={`${studentId}:${enrollmentId}:${selected.id}`} session={selected} isOpen onClose={closeSession} onNavigate={closeSession} clickPosition={selection.position} />}
  </section>;
}
