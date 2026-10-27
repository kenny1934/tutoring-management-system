import type { MakeupEligibility, Session } from '@/types';

/** Show entitlement information only where there is an unused or future booked makeup. */
export function showsMakeupEligibility(session: Pick<Session, 'session_status' | 'make_up_for_id'>) {
  return session.session_status.includes('Pending Make-up') || (!!session.make_up_for_id && session.session_status === 'Make-up Class');
}

export function makeupBookingIssue(eligibility: MakeupEligibility | null | undefined, targetDate?: string): string | null {
  if (!eligibility || eligibility.policy !== 'academic_year') return null;
  if (!eligibility.can_book) return eligibility.reason || 'Check makeup eligibility before booking.';
  const block = targetDate && eligibility.participation_blocks?.find(period => targetDate >= period.from_date && targetDate <= period.through_date);
  if (block) return `The student is ${block.status.toLowerCase()} on this date.`;
  if (targetDate && eligibility.valid_until && targetDate > eligibility.valid_until) return `Makeups must be completed by ${eligibility.valid_until}.`;
  return null;
}

export function isAdvanceMakeup(eligibility: MakeupEligibility | null | undefined, targetDate?: string) {
  return !!eligibility?.can_book && (!!eligibility.advance_booking || !!(targetDate && eligibility.paid_through && targetDate > eligibility.paid_through));
}

/** Recording attendance or editing teaching notes is separate from making a booking. */
export function changesMakeupBooking(session: Session, next: { session_date: string; time_slot: string; tutor_id: number | null; location: string; session_status: string }) {
  if (!session.make_up_for_id) return false;
  return next.session_date !== session.session_date || next.time_slot !== session.time_slot || next.tutor_id !== session.tutor_id
    || next.location !== (session.location || '') || (next.session_status === 'Make-up Class' && session.session_status !== 'Make-up Class');
}

export function makeupWaitingAge(session: Pick<Session, 'root_original_session_date' | 'session_date'>, today: string) {
  const original = session.root_original_session_date || session.session_date;
  return Math.max(0, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${original}T00:00:00Z`)) / 86400000));
}
