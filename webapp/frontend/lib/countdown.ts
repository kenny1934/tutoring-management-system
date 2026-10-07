import { TONES } from "@/lib/tones";

/**
 * How soon a test or exam is, as a soft chip. This is the four-step scale the
 * dashboard's test calendar uses: red within three days, then orange within a
 * week, then amber within a fortnight, then neutral. None of the steps is a
 * solid block, so the countdown doesn't outshout the thing it belongs to.
 */
export function countdownChipClass(daysUntil: number): string {
  if (daysUntil <= 3) return TONES.danger.soft;
  if (daysUntil <= 7) {
    return "bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-800/60";
  }
  if (daysUntil <= 14) return TONES.warning.soft;
  return TONES.neutral.soft;
}

/** "Today", "Tomorrow" or "12 days", for a date that hasn't passed. */
export function countdownLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `${daysUntil} days`;
}
