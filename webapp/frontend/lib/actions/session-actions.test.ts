import { describe, expect, it } from 'vitest';
import { sessionActions } from './session-actions';
import type { Session } from '@/types';

const pending = { id: 1, session_status: 'Sick Leave - Pending Make-up' } as Session;
const visible = (id: string, session: Session) => sessionActions.find(action => action.id === id)!.isVisible!(session);
describe('makeup actions across shared session surfaces', () => {
  it('preserves legacy extension and scheduling actions', () => {
    expect(visible('request-extension', pending)).toBe(true);
    expect(visible('schedule-makeup', pending)).toBe(true);
  });
  it('retires extension creation for academic-year makeups even when temporarily blocked', () => {
    const session = { ...pending, makeup_eligibility: { policy: 'academic_year', status: 'paused', can_book: false } } as Session;
    expect(visible('request-extension', session)).toBe(false);
    expect(visible('schedule-makeup', session)).toBe(false);
  });
  it('restores scheduling on a paid return without reviving obsolete extension actions', () => {
    const session = { ...pending, makeup_eligibility: { policy: 'academic_year', status: 'available', can_book: true } } as Session;
    expect(visible('schedule-makeup', session)).toBe(true);
    expect(visible('request-extension', session)).toBe(false);
  });
  it('retains truthful attendance actions for an already-booked makeup awaiting payment review', () => {
    const session = { ...pending, session_status: 'Make-up Class', makeup_eligibility: { policy: 'academic_year', status: 'payment_required', can_book: false } } as Session;
    expect(visible('attended', session)).toBe(true);
  });
});
