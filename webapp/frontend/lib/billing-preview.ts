import type { BillingWeekday } from '@/types/billing';
import { formatShortDate } from '@/lib/formatters';

export const BILLING_DAYS: BillingWeekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayForDate(value: string): BillingWeekday | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const day = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) return undefined;
  return BILLING_DAYS[(day.getUTCDay() + 6) % 7];
}

export function suggestedStartAfterTrial(value: string): string {
  if (!weekdayForDate(value)) return '';
  const day = new Date(`${value}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 7);
  return day.toISOString().slice(0, 10);
}

export function trialBillingPreviewHref(trial: { session_date: string; time_slot: string; location: string; student_id?: number; enrollment_id?: number; session_id?: number }): string {
  if (trial.student_id && trial.enrollment_id && trial.session_id) {
    return `/billing/preview?${new URLSearchParams({ student_id: String(trial.student_id), trial_enrollment_id: String(trial.enrollment_id), trial_session_id: String(trial.session_id) })}`;
  }
  const query = new URLSearchParams({
    trial_date: trial.session_date, time_slot: trial.time_slot, location: trial.location,
  });
  return `/billing/preview?${query}`;
}

export function displayBillingDate(value: string): string {
  return formatShortDate(value);
}

export function displayBillingMonth(value: string): string {
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
