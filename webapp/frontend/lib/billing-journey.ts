import type { BillingMethod, BillingPeriod, BillingPreviewResponse } from '@/types/billing';

export type BillingJourneys = Partial<Record<BillingMethod, BillingPreviewResponse>>;
export type JourneyEvent = {
  method: BillingMethod;
  period: BillingPeriod;
  skipMonth?: string;
};

export function journeySelectionKey(event: JourneyEvent): string {
  return `${event.method}:${event.period.number}:${event.skipMonth ?? 'bill'}`;
}

export function billingCycle(period: BillingPeriod): string {
  return period.collection.notice_from?.slice(0, 7) ?? 'intro';
}

/** The axis describes notice cycles. Deadlines and teaching months stay on each card. */
export function journeyCycles(journeys: BillingJourneys): string[] {
  return [...new Set(Object.values(journeys).flatMap(journey => [
    ...journey.periods.map(billingCycle), ...journey.skipped_collections.map(skip => skip.month),
  ]))].sort((a, b) => a === b ? 0 : a === 'intro' ? -1 : b === 'intro' ? 1 : a.localeCompare(b));
}

export function journeyEvents(journeys: BillingJourneys, method: BillingMethod, cycle: string): JourneyEvent[] {
  const journey = journeys[method];
  if (!journey) return [];
  const bills: JourneyEvent[] = journey.periods.filter(period => billingCycle(period) === cycle).map(period => ({ method, period }));
  const skips: JourneyEvent[] = journey.skipped_collections.filter(skip => skip.month === cycle).flatMap(skip => {
    const period = journey.periods.find(value => value.number === skip.covered_by_period);
    return period ? [{ method, period, skipMonth: skip.month }] : [];
  });
  return [...bills, ...skips];
}

export function followingMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

export function paymentGap(period: BillingPeriod): string | null {
  const { gap_min_days: min, gap_max_days: max, method } = period.collection;
  if (min === null || max === null) return null;
  const days = min === max ? `${min}` : `${min}–${max}`;
  return method === 'manual' ? `Deadlines ${days} days apart` : `${days} days after previous payment window`;
}
