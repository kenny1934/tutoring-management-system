import { describe, it, expect } from 'vitest';
import { formatMakeupMessage } from './makeup-message';
import type { Session } from '@/types';

// Minimal session factory
const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 1,
  student_name: 'Alice',
  session_date: '2026-03-09',
  time_slot: '15:00 - 16:30',
  session_status: 'Rescheduled - Pending Make-up',
  tutor_name: 'Mr. Wong',
  rescheduled_to: {
    session_date: '2026-03-16',
    time_slot: '15:00 - 16:30',
    tutor_name: 'Mr. Wong',
  },
  ...overrides,
} as Session);

describe('formatMakeupMessage', () => {
  it('generates Chinese message with dates', () => {
    const msg = formatMakeupMessage(makeSession(), 'zh');
    expect(msg).toContain('Alice');
    expect(msg).toContain('補堂已安排好');
    expect(msg).toContain('3月9日');
    expect(msg).toContain('15:00 - 16:30');
  });

  it('generates English message with dates', () => {
    const msg = formatMakeupMessage(makeSession(), 'en');
    expect(msg).toContain('Alice');
    expect(msg).toContain('make-up class');
    expect(msg).toContain('Mar 9');
    expect(msg).toContain('15:00 - 16:30');
  });

  it('shows tutor suffix when different tutor', () => {
    const session = makeSession({
      rescheduled_to: {
        session_date: '2026-03-16',
        time_slot: '15:00 - 16:30',
        tutor_name: 'Ms. Chan',
        tutor_nickname: 'Bella',
      },
    } as Partial<Session>);
    const msg = formatMakeupMessage(session, 'en');
    expect(msg).toContain('(Bella)');
  });

  it('shows unknown when makeup date missing', () => {
    const session = makeSession({
      rescheduled_to: undefined,
    });
    const zhMsg = formatMakeupMessage(session, 'zh');
    expect(zhMsg).toContain('(未知)');
    const enMsg = formatMakeupMessage(session, 'en');
    expect(enMsg).toContain('(unknown)');
  });

  it('handles Make-up Class status (inverse direction)', () => {
    const session = makeSession({
      session_status: 'Make-up Class',
      make_up_for: {
        session_date: '2026-03-02',
        time_slot: '15:00 - 16:30',
        tutor_name: 'Mr. Wong',
      },
    } as Partial<Session>);
    const msg = formatMakeupMessage(session, 'en');
    expect(msg).toContain('Mar 2'); // original
    expect(msg).toContain('Mar 9'); // makeup (session_date)
  });
});
