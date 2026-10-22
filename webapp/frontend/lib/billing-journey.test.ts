import { describe, expect, it } from 'vitest';
import { billingCycle, followingMonth, journeyCycles, journeyEvents, journeySelectionKey, paymentGap } from './billing-journey';
import type { BillingPeriod, BillingPreviewResponse } from '@/types/billing';

const period = (number: number, notice: string | null): BillingPeriod => ({
  number, collection: { notice_from: notice, gap_min_days: 10, gap_max_days: 10, method: 'manual' },
} as BillingPeriod);
const journey = (periods: BillingPeriod[]): BillingPreviewResponse => ({ periods, skipped_collections: [] } as unknown as BillingPreviewResponse);

describe('payment journey presentation', () => {
  it('aligns both methods by notice cycle without inventing a notice for a first payment', () => {
    const manual = journey([period(1, null), period(2, '2026-12-12')]);
    const autopay = journey([period(1, '2026-11-12'), period(2, '2026-12-12')]);
    manual.skipped_collections = [{ month: '2027-01', covered_by_period: 2, reason: 'February included.' }];
    expect(journeyCycles({ manual, autopay })).toEqual(['intro', '2026-11', '2026-12', '2027-01']);
    expect(billingCycle(manual.periods[0])).toBe('intro');
    expect(journeyEvents({ manual, autopay }, 'manual', '2026-11')).toEqual([]);
  });

  it('links a skipped cycle to its source bill while keeping each selection unique', () => {
    const manual = journey([period(1, '2026-11-12')]);
    manual.skipped_collections = [{ month: '2026-12', covered_by_period: 1, reason: 'January included.' }];
    const bill = journeyEvents({ manual }, 'manual', '2026-11')[0];
    const skip = journeyEvents({ manual }, 'manual', '2026-12')[0];
    expect(skip.period).toBe(bill.period);
    expect(journeySelectionKey(skip)).not.toBe(journeySelectionKey(bill));
    expect(followingMonth('2026-12')).toBe('2027-01');
  });

  it('describes manual spacing as deadline spacing, never as an actual payment date', () => {
    const manual = period(1, null);
    expect(paymentGap(manual)).toBe('Deadlines 10 days apart');
    manual.collection.method = 'autopay';
    manual.collection.gap_max_days = 14;
    expect(paymentGap(manual)).toBe('10–14 days after previous payment window');
    manual.collection.gap_min_days = null;
    expect(paymentGap(manual)).toBeNull();
  });

  it('omits broken skip references rather than making a bill with unknown data', () => {
    const manual = journey([]);
    manual.skipped_collections = [{ month: '2026-12', covered_by_period: 5, reason: 'January included.' }];
    expect(journeyEvents({ manual }, 'manual', '2026-12')).toEqual([]);
  });
});
