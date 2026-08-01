/**
 * Pure date helpers for the regular-course publish bridge. Kept free of React
 * and API imports so they can be unit tested directly.
 */

const DAY_INDEX: Record<string, number> = {
  Monday: 0, Mon: 0,
  Tuesday: 1, Tue: 1,
  Wednesday: 2, Wed: 2,
  Thursday: 3, Thu: 3,
  Friday: 4, Fri: 4,
  Saturday: 5, Sat: 5,
  Sunday: 6, Sun: 6,
};

/**
 * First occurrence of `dayName` (full or short form, e.g. "Tuesday" or "Tue")
 * on or after the ISO date `startIso` (YYYY-MM-DD). Returns an ISO date
 * string, or null when either input is unusable.
 *
 * Mirrors the backend's first-lesson auto-compute so the date input can be
 * prefilled with the value the server would pick when the field is omitted.
 */
export function firstWeekdayOnOrAfter(startIso: string, dayName: string): string | null {
  const target = DAY_INDEX[dayName];
  if (target === undefined) return null;
  const datePart = startIso.split("T")[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return null;
  // Work in UTC so local timezone offsets can never shift the calendar day.
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // JS getUTCDay(): Sunday = 0. Convert to Monday = 0 to match DAY_INDEX.
  const startDow = (start.getUTCDay() + 6) % 7;
  const offset = (target - startDow + 7) % 7;
  start.setUTCDate(start.getUTCDate() + offset);
  return start.toISOString().slice(0, 10);
}
