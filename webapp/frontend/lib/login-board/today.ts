/**
 * Which problem is on the sign-in board today. It's chosen by the date in
 * Hong Kong, so everyone signing in on the same day sees the same board,
 * whatever their laptop's clock is set to, and it changes at midnight here.
 * Counting days since 1970 rather than days into the year means the problems
 * keep going round in order across New Year instead of starting again.
 */
import { BOARD_PROBLEMS, type BoardProblem } from "./problems";

const HONG_KONG = "Asia/Hong_Kong";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The date in Hong Kong at a moment, as year, month and day. */
export function hongKongDate(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: HONG_KONG, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** The problem on the board on the day `at` falls on in Hong Kong. */
export function problemForDay(at: Date = new Date()): BoardProblem {
  const { year, month, day } = hongKongDate(at);
  const days = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  return BOARD_PROBLEMS[days % BOARD_PROBLEMS.length];
}

/** Today's date as the board's heading writes it, such as "Wednesday 7 October". */
export function boardDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: HONG_KONG, weekday: "long", day: "numeric", month: "long" }).format(at);
}

/**
 * Which week of the school year today is in Hong Kong, counting the week the
 * regular course starts as week 1, such as 6 for 7 October when the course
 * started on 1 September. It's null before the course starts and once 52
 * weeks have gone by, because by then the start date belongs to last year's
 * course and the count would be wrong. It's null too for a date it can't read.
 */
export function schoolWeek(courseStart: string, at: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(courseStart);
  if (!match) return null;
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const { year, month, day } = hongKongDate(at);
  const days = Math.round((Date.UTC(year, month - 1, day) - start) / DAY_MS);
  if (days < 0 || days >= 52 * 7) return null;
  return Math.floor(days / 7) + 1;
}
