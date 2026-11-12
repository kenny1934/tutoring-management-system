'use client';

import { useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/controls';
import { EnrollmentDetailPopover } from '@/components/enrollments/EnrollmentDetailPopover';
import { useAuth } from '@/contexts/AuthContext';
import { useOverlayLayer } from '@/hooks/useOverlayLayer';
import { enrollmentsAPI } from '@/lib/api';
import { billingDraftAuthScope } from './BillingDraftReview';

interface BillingCouponEnrollmentLinkProps {
  enrollmentId: number;
  studentId: number;
  disabled?: boolean;
  onChanged?: () => void;
}

/** Opens the teaching record without losing the coupon check underneath. */
export function BillingCouponEnrollmentLink(props: BillingCouponEnrollmentLinkProps) {
  const auth = useAuth();
  const scope = JSON.stringify([billingDraftAuthScope(auth), props.studentId, props.enrollmentId]);
  return <EnrollmentLink key={scope} {...props} scope={scope} canRead={!!auth.user && !auth.isLoading} />;
}

function EnrollmentLink({ enrollmentId, studentId, disabled = false, onChanged, scope, canRead }: BillingCouponEnrollmentLinkProps & { scope: string; canRead: boolean }) {
  const [selection, setSelection] = useState<{ request: number; position: { x: number; y: number } } | null>(null);
  const request = useRef(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const instance = useId();
  const validIdentity = Number.isInteger(enrollmentId) && enrollmentId > 0 && Number.isInteger(studentId) && studentId > 0;
  const available = validIdentity && canRead && !disabled;
  useEffect(() => { if (!available) setSelection(null); }, [available]);
  // A deliberate open always reads current payment/teaching details. Identity
  // and auth scope also keep late responses out of another student's popup.
  const state = useSWR(selection && available ? ['enrollment-detail', enrollmentId, scope, instance, selection.request] : null,
    () => enrollmentsAPI.getById(enrollmentId),
    { keepPreviousData: false, revalidateOnFocus: false, shouldRetryOnError: false });
  const owned = state.data?.id === enrollmentId && state.data.student_id === studentId;
  const failed = !!selection && available && (!!state.error || (state.data !== undefined && !owned));
  const loading = !!selection && available && !failed && !state.data;
  const visible = !!selection && available && owned && !failed;
  const layer = useOverlayLayer(visible);

  function close() {
    setSelection(null);
    requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); });
  }
  function open() {
    if (!available) return;
    const rect = trigger.current!.getBoundingClientRect();
    setSelection({ request: ++request.current, position: { x: rect.left + rect.width / 2, y: rect.bottom } });
  }

  return <span className="inline-flex min-w-0 flex-col items-start gap-1">
    <button ref={trigger} type="button" disabled={!available || loading} aria-haspopup="dialog" aria-expanded={visible} aria-busy={loading || undefined}
      onClick={event => { event.stopPropagation(); open(); }}
      className="inline-flex items-center gap-1 rounded text-left font-medium text-accent-ink underline decoration-accent-ink/40 underline-offset-2 hover:decoration-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60">
      Enrollment #{enrollmentId}{loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
    </button>
    {loading && <span role="status" className="text-xs text-ink-subtle">Opening enrollment…</span>}
    {failed && <span role="alert" className="flex flex-wrap items-center gap-2 text-xs"><span>Could not open this enrollment.</span><Button size="sm" variant="quiet" onClick={event => { event.stopPropagation(); open(); }}>Retry</Button></span>}
    {visible && selection && <EnrollmentDetailPopover enrollment={state.data!} isOpen onClose={close} onNavigate={close} clickPosition={selection.position} zIndex={layer.zIndex}
      onStatusChange={() => { close(); onChanged?.(); }} />}
  </span>;
}
