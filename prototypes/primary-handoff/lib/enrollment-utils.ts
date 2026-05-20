import type {
  EnrollmentPreviewSession,
  EnrollmentType,
  WeekdayNum,
} from "./types";
import { holidayMap } from "./mock-data/holidays";

/** Number of sessions a given enrollment type generates. Regular packs the
 *  full lessons_paid count; Trial/One-Time always generate exactly one. */
export function sessionCountFor(
  type: EnrollmentType,
  lessonsPaid: number
): number {
  if (type === "Trial" || type === "One-Time") return 1;
  return lessonsPaid;
}

/** Date math is done in pure UTC so toISOString() round-trips the same
 *  YYYY-MM-DD components regardless of the host's local timezone. */
function parseIsoUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** ISO weekday (Mon=1..Sun=7) of a YYYY-MM-DD date. */
function isoWeekday(iso: string): WeekdayNum {
  const jsDay = parseIsoUTC(iso).getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as WeekdayNum;
}

function addDays(iso: string, days: number): string {
  const d = parseIsoUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Snap a starting date forward to the nearest occurrence of `targetDay`.
 *  If first_lesson_date already lands on target, returns it unchanged. */
function snapToWeekday(start: string, targetDay: WeekdayNum): string {
  const current = isoWeekday(start);
  if (current === targetDay) return start;
  const delta = (targetDay - current + 7) % 7;
  return addDays(start, delta);
}

export type GenerateInput = {
  enrollmentType: EnrollmentType;
  firstLessonDate: string;
  assignedDay: WeekdayNum;
  lessonsPaid: number;
};

/** Mirrors CSM's weekly recurrence: starting at first_lesson_date (snapped
 *  to assigned_day), step one week at a time; if the candidate date is a
 *  holiday, bump to the next week and emit a "skipped-holiday" row that
 *  records where it was bumped from. */
export function generateSessions(
  input: GenerateInput
): EnrollmentPreviewSession[] {
  const count = sessionCountFor(input.enrollmentType, input.lessonsPaid);
  const out: EnrollmentPreviewSession[] = [];

  let candidate = snapToWeekday(input.firstLessonDate, input.assignedDay);

  for (let i = 0; i < count; i++) {
    const initialHoliday = holidayMap.get(candidate);
    if (initialHoliday) {
      const skipped_from = candidate;
      candidate = addDays(candidate, 7);
      out.push({
        lesson_number: i + 1,
        session_date: candidate,
        status: "skipped-holiday",
        skipped_from,
        skipped_holiday_label: initialHoliday.label,
      });
    } else {
      out.push({
        lesson_number: i + 1,
        session_date: candidate,
        status: "ok",
      });
    }
    candidate = addDays(candidate, 7);
  }

  return out;
}

/** Effective end date of an enrollment = the date of the last generated
 *  session. */
export function effectiveEndDate(
  sessions: EnrollmentPreviewSession[]
): string | null {
  return sessions[sessions.length - 1]?.session_date ?? null;
}

/** Fee formula mirrored from CSM (`format_fee_message`):
 *  base = 400 * lessons_paid, minus discount, plus reg_fee for new students. */
export type FeeInput = {
  enrollmentType: EnrollmentType;
  lessonsPaid: number;
  isNewStudent: boolean;
  discount: number;
};
export function computeFee(input: FeeInput): {
  base: number;
  discount: number;
  regFee: number;
  total: number;
} {
  const count = sessionCountFor(input.enrollmentType, input.lessonsPaid);
  const base = 400 * count;
  const regFee = input.isNewStudent ? 100 : 0;
  const total = Math.max(0, base - input.discount + regFee);
  return { base, discount: input.discount, regFee, total };
}

const WEEKDAY_NAMES: Record<WeekdayNum, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};
export function weekdayLabel(day: WeekdayNum): string {
  return WEEKDAY_NAMES[day];
}
