import type {
  EnrollmentPreviewRow,
  EnrollmentType,
  WeekdayNum,
} from "./types";
import { holidayMap } from "./mock-data/holidays";

/** Number of sessions a given enrollment type generates. Regular packs the
 *  full lessons_paid count; Assessment/One-Time always generate exactly one. */
export function sessionCountFor(
  type: EnrollmentType,
  lessonsPaid: number
): number {
  if (type === "Assessment" || type === "One-Time") return 1;
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
 *  to assigned_day), step one week at a time. A holiday-candidate emits a
 *  visible "skipped" row (date + holiday label) and the loop advances to
 *  the next week without consuming a lesson number — the actual lesson
 *  lands on the next available week. */
export function generateSessions(
  input: GenerateInput
): EnrollmentPreviewRow[] {
  const count = sessionCountFor(input.enrollmentType, input.lessonsPaid);
  const rows: EnrollmentPreviewRow[] = [];

  let candidate = snapToWeekday(input.firstLessonDate, input.assignedDay);
  let lessonsEmitted = 0;
  // Safety belt so a runaway holiday list can't hang the loop. 52 weeks
  // is enough for a year's worth of holidays even in the worst case.
  let guard = 0;

  while (lessonsEmitted < count && guard < 200) {
    guard++;
    const holiday = holidayMap.get(candidate);
    if (holiday) {
      rows.push({
        kind: "skipped",
        session_date: candidate,
        holiday_label: holiday.label,
      });
    } else {
      lessonsEmitted++;
      rows.push({
        kind: "lesson",
        lesson_number: lessonsEmitted,
        session_date: candidate,
      });
    }
    candidate = addDays(candidate, 7);
  }

  return rows;
}

/** Effective end date of an enrollment = the date of the last *lesson* row
 *  (skipped rows don't count). */
export function effectiveEndDate(
  rows: EnrollmentPreviewRow[]
): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.kind === "lesson") return r.session_date;
  }
  return null;
}

/** Per-lesson rate for the Regular / One-Time package types (HK$). */
export const LESSON_RATE = 250;
/** Flat fee for a single Assessment lesson (HK$). */
export const ASSESSMENT_FEE = 200;
/** First-time registration fee added to new students (HK$). */
export const REG_FEE = 100;

/** Fee formula mirrored from CSM (`format_fee_message`):
 *  Regular/One-Time: LESSON_RATE × lessons − discount (+ reg fee if new).
 *  Assessment: ASSESSMENT_FEE flat (single lesson, no reg fee added). */
export type FeeInput = {
  enrollmentType: EnrollmentType;
  lessonsPaid: number;
  isNewStudent: boolean;
  discount: number;
};
export function computeFee(input: FeeInput): {
  base: number;
  perLesson: number;
  count: number;
  discount: number;
  regFee: number;
  total: number;
} {
  const count = sessionCountFor(input.enrollmentType, input.lessonsPaid);
  if (input.enrollmentType === "Assessment") {
    return {
      base: ASSESSMENT_FEE,
      perLesson: ASSESSMENT_FEE,
      count: 1,
      discount: 0,
      regFee: 0,
      total: ASSESSMENT_FEE,
    };
  }
  const base = LESSON_RATE * count;
  const regFee = input.isNewStudent ? REG_FEE : 0;
  const total = Math.max(0, base - input.discount + regFee);
  return {
    base,
    perLesson: LESSON_RATE,
    count,
    discount: input.discount,
    regFee,
    total,
  };
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
