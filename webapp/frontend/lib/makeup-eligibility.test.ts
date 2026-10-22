import { describe, expect, it } from 'vitest';
import { changesMakeupBooking, isAdvanceMakeup, makeupBookingIssue, makeupWaitingAge, showsMakeupEligibility } from './makeup-eligibility';
import type { MakeupEligibility, Session } from '@/types';

const available: MakeupEligibility = { policy: 'academic_year', status: 'available', can_book: true, valid_until: '2027-06-30', paid_through: '2027-03-31', reason: null, advance_booking: false };
describe('academic-year makeup eligibility', () => {
  it('limits the popover notice to pending sources and active booked descendants', () => {
    for (const session_status of ['Scheduled', 'Attended', 'Cancelled', 'Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked']) {
      expect(showsMakeupEligibility({ session_status, make_up_for_id: undefined })).toBe(false);
      expect(showsMakeupEligibility({ session_status, make_up_for_id: 9 })).toBe(false);
    }
    expect(showsMakeupEligibility({ session_status: 'Make-up Class', make_up_for_id: undefined })).toBe(false);
    expect(showsMakeupEligibility({ session_status: 'Make-up Class', make_up_for_id: 9 })).toBe(true);
    expect(showsMakeupEligibility({ session_status: 'Rescheduled - Pending Make-up', make_up_for_id: undefined })).toBe(true);
    expect(showsMakeupEligibility({ session_status: 'Sick Leave - Pending Make-up', make_up_for_id: 9 })).toBe(true);
  });
  it('leaves legacy and Summer scheduling to their existing rules when eligibility is absent', () => {
    expect(makeupBookingIssue(undefined, '2027-07-01')).toBeNull();
    expect(isAdvanceMakeup(null, '2027-04-10')).toBe(false);
  });
  it('permits advance booking beyond current paid coverage but keeps the June deadline', () => {
    expect(makeupBookingIssue(available, '2027-04-10')).toBeNull();
    expect(isAdvanceMakeup(available, '2027-04-10')).toBe(true);
    expect(makeupBookingIssue(available, '2027-06-30')).toBeNull();
    expect(makeupBookingIssue(available, '2027-07-01')).toContain('2027-06-30');
  });
  it.each(['payment_required', 'paused', 'left', 'expired', 'needs_review'] as const)('preserves the authoritative %s reason', status => {
    expect(makeupBookingIssue({ ...available, status, can_book: false, reason: 'Specific server check.' }, '2027-03-20')).toBe('Specific server check.');
  });
  it('blocks dates inside a confirmed future pause and allows the paid-return boundary', () => {
    const eligibility = { ...available, participation_blocks: [{ from_date: '2027-04-01', through_date: '2027-04-30', status: 'Paused' as const }] };
    expect(makeupBookingIssue(eligibility, '2027-04-10')).toContain('paused');
    expect(makeupBookingIssue(eligibility, '2027-05-01')).toBeNull();
  });
  it('checks time-only moves and same-date reactivation while allowing notes and truthful attendance', () => {
    const session = { make_up_for_id: 9, session_date: '2027-04-10', time_slot: '16:00 - 17:30', tutor_id: 3, location: 'MSA', session_status: 'Make-up Class' } as Session;
    const next = { session_date: session.session_date, time_slot: session.time_slot, tutor_id: session.tutor_id, location: session.location!, session_status: session.session_status };
    expect(changesMakeupBooking(session, next)).toBe(false);
    expect(changesMakeupBooking(session, { ...next, session_status: 'Attended' })).toBe(false);
    expect(changesMakeupBooking(session, { ...next, time_slot: '18:00 - 19:30' })).toBe(true);
    expect(changesMakeupBooking({ ...session, session_status: 'Cancelled' }, next)).toBe(true);
  });
  it('measures follow-up age from the original entitlement without changing expiry', () => {
    expect(makeupWaitingAge({ session_date: '2027-02-02', root_original_session_date: '2026-09-01' }, '2027-03-01')).toBe(181);
    expect(makeupBookingIssue(available, '2027-03-01')).toBeNull();
  });
});
