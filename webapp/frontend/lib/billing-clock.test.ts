import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { billingLocalDateTime, billingToday, setBillingTestDate } from './billing-clock';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T16:37:42Z'));
  setBillingTestDate(null);
});
afterEach(() => {
  setBillingTestDate(null);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('the billing fee date', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('uses Hong Kong day and time when the browser timezone is %s', timezone => {
    vi.stubEnv('TZ', timezone);
    expect(billingToday()).toBe('2026-10-23');
    expect(billingLocalDateTime()).toBe('2026-10-23T00:37');
  });

  it.each([
    ['2026-10-22T15:59:59Z', '2026-10-22', '2026-10-22T23:59'],
    ['2026-10-22T16:00:00Z', '2026-10-23', '2026-10-23T00:00'],
    ['2026-12-31T16:00:00Z', '2027-01-01', '2027-01-01T00:00'],
  ])('changes day at the Hong Kong midnight boundary for %s', (time, date, datetime) => {
    vi.setSystemTime(new Date(time));
    expect(billingToday()).toBe(date); expect(billingLocalDateTime()).toBe(datetime);
  });

  it('overrides the fee date while retaining the actual Hong Kong hour and minute', () => {
    setBillingTestDate('2026-11-20');
    expect(billingToday()).toBe('2026-11-20');
    expect(billingLocalDateTime()).toBe('2026-11-20T00:37');
    vi.setSystemTime(new Date('2026-10-23T04:05:00Z'));
    expect(billingToday()).toBe('2026-11-20');
    expect(billingLocalDateTime()).toBe('2026-11-20T12:05');
  });

  it('resets to the actual Hong Kong date when the boundary clears its override', () => {
    setBillingTestDate('2026-11-20'); setBillingTestDate(null);
    expect(billingToday()).toBe('2026-10-23');
  });

  it('accepts a genuine leap day', () => {
    setBillingTestDate('2028-02-29'); expect(billingToday()).toBe('2028-02-29');
  });

  it.each(['', '2026-2-01', '2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-11-20T12:00', '2026-11-20+08:00', 'not-a-date'])('rejects invalid date %s without replacing the last verified date', value => {
    setBillingTestDate('2026-11-20');
    expect(() => setBillingTestDate(value)).toThrow();
    expect(billingToday()).toBe('2026-11-20');
  });

  it('does not trust local storage or a public environment date', () => {
    localStorage.setItem('billing-test-date', '2099-01-01');
    vi.stubEnv('NEXT_PUBLIC_BILLING_TEST_DATE', '2099-01-01');
    expect(billingToday()).toBe('2026-10-23');
  });
});
