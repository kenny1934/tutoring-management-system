/**
 * Shared utilities for the regular course (September intake) application
 * surfaces. Regular components import ONLY from this module — a re-export
 * choke point over lib/summer-utils — so a future fork of any shared helper
 * is a one-file change and summer's seasonal churn can't leak into regular.
 *
 * Deliberately NOT re-exported: getActiveSummerPromo and every pricing /
 * placement / arrangement helper. Regular has no discounts and no placement
 * subsystem.
 */

export {
  // Language + bilingual text
  type Lang,
  t,
  // Dates
  hkTodayIso,
  formatDate,
  formatDateShort,
  // Day names
  dayLabel,
  dayShort,
  DAY_SHORT_ZH,
  DAY_ABBREV,
  WEEK_DAY_ORDER,
  // Config option helpers
  labelForOption,
  shortCenterName,
  // Branch metadata
  BRANCH_INFO,
  formatProspectCode,
  BRANCH_IMAGES_FALLBACK,
  LOCATION_TO_CODE,
  CODE_TO_LOCATION,
  displayLocation,
  // Shared form styling primitives
  inputClass,
  sectionClass,
  labelClass,
  radioGroupClass,
  radioLabelClass,
  RadioCheck,
  IconLabel,
  InfoRow,
  RequiredMark,
  // Grade chip colours (admin surfaces)
  SUMMER_GRADE_BORDER,
  SUMMER_GRADE_TEXT,
  // Arrangement helpers that carry no summer-specific semantics
  getMismatchedSessionGrades,
} from "@/lib/summer-utils";

import { type Lang as RegularLang, t as rt } from "@/lib/summer-utils";
import { getGradeColor } from "@/lib/constants";
import type { RegularCourseFormConfig } from "@/types";

// Grade badge colours are keyed on grade + stream (F1C, F2E, ...); regular
// surfaces feed effectiveStream into this so Int applicants colour as English.
export { getGradeColor };

/** Fold a raw stream value to the one that governs placement and colour: the
 *  International stream sits with English (a class, and a placed student, is
 *  only ever Chinese or English). Returns null when nothing is set. */
export function foldStream(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v === "Int" ? "E" : (v || null);
}

/** The stream that governs an application's placement and badge colour. The
 *  linked student record wins when present (it is the system of record and only
 *  ever holds C or E); otherwise the submitted value with Int folded into E. */
export function effectiveStream(app: {
  lang_stream?: string | null;
  linked_student?: { lang_stream?: string | null } | null;
}): string | null {
  const recordStream = app.linked_student?.lang_stream;
  if (recordStream) return recordStream;
  return foldStream(app.lang_stream);
}

/** Distinct effective streams among `students` that clash with a slot's own
 *  stream. Empty when the slot has no stream (any) or nothing clashes. Mirrors
 *  getMismatchedSessionGrades for the slot-card mixed-stream warning. */
export function getMismatchedStreams(
  slotStream: string | null | undefined,
  students: { lang_stream?: string | null }[],
): string[] {
  const slot = foldStream(slotStream);
  if (!slot) return [];
  return Array.from(
    new Set(
      students
        .map((s) => foldStream(s.lang_stream))
        .filter((s): s is string => !!s && s !== slot),
    ),
  );
}

/** Whether one application's effective stream clashes with a slot's stream. An
 *  unset slot stream (any) or unset application stream never clashes. */
export function slotStreamMismatch(
  slot: { lang_stream?: string | null },
  app: {
    lang_stream?: string | null;
    linked_student?: { lang_stream?: string | null } | null;
  },
): boolean {
  const slotStream = foldStream(slot.lang_stream);
  const appStream = effectiveStream(app);
  return !!slotStream && !!appStream && slotStream !== appStream;
}

/** Split a demand bucket key ("F1C") into grade + stream. Streams are single
 *  letters (C/E); a bare grade key ("F1") yields a null stream. */
export function splitGradeStream(key: string): { grade: string; stream: string | null } {
  const last = key.slice(-1);
  if ((last === "C" || last === "E") && key.length > 2) {
    return { grade: key.slice(0, -1), stream: last };
  }
  return { grade: key, stream: null };
}

/** Step labels for the 4-step regular wizard (contact merged into confirm). */
export const REGULAR_STEP_LABELS = [
  { zh: "學生資料", en: "Student" },
  { zh: "學生背景", en: "Background" },
  { zh: "課堂安排", en: "Schedule" },
  { zh: "聯絡及確認", en: "Confirm" },
];

/** The status ladder shown on the public status page. Same rungs as summer's,
 *  so a parent applying to both intakes reads one progression. */
export const REGULAR_STATUS_STEPS = [
  "Submitted",
  "Under Review",
  "Placement Offered",
  "Placement Confirmed",
  "Fee Sent",
  "Paid",
  "Enrolled",
] as const;

/** The course page on the MathConcept site. It is the marketing front door for
 *  the September intake — the regular.* subdomain carries only the form — so
 *  every parent-facing surface that needs "tell me about the course" points
 *  here rather than at a landing page of our own. */
export const REGULAR_COURSE_PAGE_URL =
  "https://mathconcept.com.mo/regular-courses/secondary-school/";

/** Side-exit statuses rendered as a pill instead of a ladder rung. */
export const REGULAR_EXIT_STATUSES = new Set(["Waitlisted", "Withdrawn", "Rejected"]);

/** Statuses that mean the applicant has left this intake: they drop out of
 *  demand, out of the unassigned panel, and out of a slot's seat count.
 *  Narrower than REGULAR_EXIT_STATUSES above, which is about ladder display
 *  and counts Waitlisted as a side exit — a waitlisted applicant is still
 *  being worked and still holds any seat they were placed in. Mirrors the
 *  backend REGULAR_EXIT_STATUSES. */
export const REGULAR_LEFT_INTAKE_STATUSES = new Set(["Withdrawn", "Rejected"]);

/** Seats a slot actually has taken. An applicant who withdrew after being
 *  placed stays listed on the slot but stops occupying one of its places. */
export function countSeatHolders(
  students: { application_status: string }[]
): number {
  return students.filter(
    (s) => !REGULAR_LEFT_INTAKE_STATUSES.has(s.application_status)
  ).length;
}

export const REGULAR_STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  "Submitted": { zh: "已提交", en: "Submitted" },
  "Under Review": { zh: "處理中", en: "Under Review" },
  "Placement Offered": { zh: "已安排時間", en: "Placement Offered" },
  "Placement Confirmed": { zh: "時間已確認", en: "Placement Confirmed" },
  "Fee Sent": { zh: "已發送繳費通知", en: "Fee Sent" },
  "Paid": { zh: "已繳費", en: "Paid" },
  "Enrolled": { zh: "已報名", en: "Enrolled" },
  "Waitlisted": { zh: "候補中", en: "Waitlisted" },
  "Withdrawn": { zh: "已取消", en: "Withdrawn" },
  "Rejected": { zh: "未能安排", en: "Not Arranged" },
};

export function regularStatusLabel(status: string, lang: RegularLang): string {
  const entry = REGULAR_STATUS_LABELS[status];
  return entry ? rt(entry.zh, entry.en, lang) : status;
}

/** Time slots available for a given location + day, mirroring
 *  getSummerTimeSlots but reading the regular config shape. */
export function getRegularTimeSlots(
  // Only the two slot-bearing fields, so the admin config type works here too
  // — the detail modal reads day/time options straight off the admin config.
  config: Pick<RegularCourseFormConfig, "locations" | "time_slots"> | null,
  locationName: string,
  day: string,
): string[] {
  if (!config) return [];
  const loc = config.locations.find((l) => l.name === locationName);
  const perDay = loc?.time_slots?.[day];
  if (perDay && perDay.length > 0) return perDay;
  return config.time_slots || [];
}

/** Conversion-funnel stage text tones, each a light + dark class pair. The
 *  single owner for the funnel table, KPI cards and every breakdown table on
 *  the conversion page, so a palette change is a one-line edit. */
export const STAGE_TONES = {
  prospects: "text-foreground",
  wantsSummer: "text-teal-600 dark:text-teal-400",
  wantsRegular: "text-sky-600 dark:text-sky-400",
  didSummer: "text-emerald-600 dark:text-emerald-400",
  applied: "text-indigo-600 dark:text-indigo-400",
  enrolled: "text-purple-600 dark:text-purple-400",
} as const;
