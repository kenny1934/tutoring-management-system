import { describe, expect, it } from 'vitest';
import { suggestedStartAfterTrial, trialBillingPreviewHref, weekdayForDate } from './billing-preview';

describe('billing preview dates', () => {
  it('keeps the proposed trial follow-up date stable across year boundaries', () => {
    expect(suggestedStartAfterTrial('2026-12-29')).toBe('2027-01-05');
    expect(weekdayForDate('2027-01-05')).toBe('Tue');
  });

  it('rejects invalid and normalised dates', () => {
    expect(weekdayForDate('2027-02-30')).toBeUndefined();
    expect(suggestedStartAfterTrial('invalid')).toBe('');
  });

  it('carries schedule context without exposing a student identity', () => {
    const href = trialBillingPreviewHref({ session_date: '2026-11-03', time_slot: '16:45 - 18:15', location: 'MSA' });
    const params = new URL(href, 'https://example.test').searchParams;
    expect(params.get('trial_date')).toBe('2026-11-03');
    expect(params.get('time_slot')).toBe('16:45 - 18:15');
    expect(Array.from(params.keys())).toEqual(['trial_date', 'time_slot', 'location']);
  });

  it('uses verified identity loading for a persisted trial and does not put names or assumed fees in the link', () => {
    const href = trialBillingPreviewHref({ student_id: 4, enrollment_id: 70, session_id: 71, session_date: '2026-11-03', time_slot: '16:45 - 18:15', location: 'MSA' });
    const params = new URL(href, 'https://example.test').searchParams;
    expect(Array.from(params.entries())).toEqual([['student_id', '4'], ['trial_enrollment_id', '70'], ['trial_session_id', '71']]);
  });
});
