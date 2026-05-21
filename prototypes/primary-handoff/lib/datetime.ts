/** Timezone-safe date helpers.
 *
 *  CSM is anchored in Hong Kong Time (UTC+08:00). All seed timestamps carry
 *  an explicit `+08:00` offset and all date-only values (YYYY-MM-DD) are
 *  HKT calendar days. Mixing those with the host JS Date's local-timezone
 *  methods (getDay/setDate/toISOString) silently drifts by a day when a
 *  reviewer opens the prototype outside HK — see audit B2-B4. These helpers
 *  do all arithmetic in pure UTC and only convert at the display boundary.
 */

const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD string to a UTC-midnight Date for safe arithmetic. */
export function parseIsoDateUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a UTC Date back to YYYY-MM-DD. */
export function isoDateFromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Shift a YYYY-MM-DD by an integer number of days (UTC arithmetic). */
export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDateUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateFromUTC(d);
}

/** ISO weekday of a YYYY-MM-DD: Mon=1 .. Sun=7. */
export function isoWeekday(iso: string): number {
  const jsDay = parseIsoDateUTC(iso).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/** YYYY-MM-DD of the Monday of the ISO week containing `iso`. */
export function isoMondayOf(iso: string): string {
  return addDaysIso(iso, -(isoWeekday(iso) - 1));
}

/** Integer day delta between two YYYY-MM-DD dates (`b - a`, UTC). */
export function daysBetweenIso(aIso: string, bIso: string): number {
  const a = parseIsoDateUTC(aIso).getTime();
  const b = parseIsoDateUTC(bIso).getTime();
  return Math.round((b - a) / 86400000);
}

/** HKT calendar date (YYYY-MM-DD) of an absolute ISO timestamp.
 *  Works regardless of the host timezone. */
export function hktDateFromIso(isoTimestamp: string): string {
  const t = new Date(isoTimestamp).getTime();
  return new Date(t + HKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** HKT wall-clock time (HH:MM) of an absolute ISO timestamp. */
export function hktTimeFromIso(isoTimestamp: string): string {
  const t = new Date(isoTimestamp).getTime();
  return new Date(t + HKT_OFFSET_MS).toISOString().slice(11, 16);
}
