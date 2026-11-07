'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatProposalDate, formatShortDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { BillingDraftReview, BillingPeriod, BillingPreviewResponse, BillingWeekday } from '@/types/billing';

type Lesson = BillingPeriod['lessons'][number];
type PreviewRow = Lesson & { skipped: boolean };
const WEEKDAYS: BillingWeekday[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value ? day : null;
}

function after(value: string) {
  const day = calendarDate(value);
  if (!day) return null;
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** Add calendar context only when it belongs to the exact reviewed payment. */
function previewRows(review: BillingDraftReview, calculation?: BillingPreviewResponse): PreviewRow[] {
  const rows: PreviewRow[] = review.period.lessons.map(lesson => ({ ...lesson, skipped: false }));
  const matching = calculation?.policy_version === review.policy_version
    && calculation.payment_method === review.scenario.payment_method
    && calculation.periods.some(period => JSON.stringify(period) === JSON.stringify(review.period));
  if (matching && calendarDate(review.scenario.first_lesson_date)) {
    const previous = calculation?.periods.filter(period => period.number < review.period.number)
      .sort((a, b) => b.number - a.number)[0];
    const periodStart = previous ? after(previous.coverage_through) : review.scenario.first_lesson_date;
    const occupied = new Set(rows.map(row => `${row.date}:${row.slot}`));
    for (const date of new Set(calculation?.excluded_holidays)) {
      const day = calendarDate(date);
      if (!day || !periodStart || date < periodStart || date < review.scenario.first_lesson_date
        || date > review.period.coverage_through) continue;
      review.scenario.slots.forEach((slot, index) => {
        const key = `${date}:${index}`;
        if (WEEKDAYS[day.getUTCDay()] !== slot.weekday || occupied.has(key)
          || (slot.covered_through && date <= slot.covered_through)
          || slot.holiday_exceptions?.includes(date)) return;
        rows.push({ date, slot: index, weekday: slot.weekday, time_slot: slot.time_slot || '',
          location: slot.location || '', holiday_exception: false, skipped: true });
        occupied.add(key);
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date)
    || a.time_slot.localeCompare(b.time_slot) || a.slot - b.slot);
}

export function RenewalSessionPreview({ review, calculation }: {
  review: BillingDraftReview;
  calculation?: BillingPreviewResponse;
}) {
  const rows = previewRows(review, calculation);
  const hasClasses = review.scenario.slots.length > 1
    || new Set(review.period.lessons.map(lesson => `${lesson.time_slot.replace(/\s/g, '')}:${lesson.location}`)).size > 1;
  const conflicts = review.issues.some(issue => (issue.period === null || issue.period === review.period.number)
    && ['RENEWAL_SESSION_CONFLICT', 'EXISTING_ORIGINALS_OVERLAP'].includes(issue.code));
  let count = 0;
  return <section aria-label="Enrollment session dates" className="overflow-hidden rounded-lg border border-line">
    <div className="flex items-center justify-between gap-3 border-b border-line bg-wash px-3 py-2">
      <h4 className="text-sm font-medium">Session preview</h4>
      <span className="text-xs text-ink-subtle">{review.period.lesson_count} {review.period.lesson_count === 1 ? 'session' : 'sessions'}</span>
    </div>
    {conflicts && <p role="status" className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Check session conflicts.</p>}
    <div className="max-h-[240px] overflow-auto">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Sessions included in this enrollment</caption>
        <thead className="sticky top-0 z-10 bg-wash text-ink-subtle"><tr>
          <th scope="col" className="px-3 py-1.5 font-medium">#</th>
          <th scope="col" className="px-3 py-1.5 font-medium">Date</th>
          {hasClasses && <th scope="col" className="px-3 py-1.5 font-medium">Class</th>}
          <th scope="col" className="px-3 py-1.5 font-medium">Status</th>
        </tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => <tr key={`${row.date}:${row.slot}:${index}`} className={cn((row.skipped || row.holiday_exception) && 'bg-amber-50 dark:bg-amber-950/20')}>
            <td className="px-3 py-1.5 align-top tabular-nums text-ink-subtle">{row.skipped ? '-' : ++count}</td>
            <td className="whitespace-nowrap px-3 py-1.5 align-top font-medium">{formatProposalDate(row.date)}</td>
            {hasClasses && <td className="px-3 py-1.5 align-top">{row.time_slot || 'To confirm'}{row.location && ` @ ${row.location}`}</td>}
            <td className="px-3 py-1.5 align-top">
              {row.skipped ? <span className="text-amber-800 dark:text-amber-300">Holiday skipped</span>
                : row.holiday_exception ? <span className="text-amber-800 dark:text-amber-300">Holiday class{conflicts && <span className="block text-ink-subtle">Check schedule</span>}</span>
                : conflicts ? <span className="text-ink-subtle">Check schedule</span>
                : <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />OK</span>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <p className="border-t border-line bg-wash px-3 py-2 text-xs text-ink-subtle">End date: <span className="font-medium text-foreground">{formatShortDate(review.period.last_lesson_date)}</span></p>
  </section>;
}
