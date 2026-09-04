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
  sortWeekDays,
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
  SUMMER_GRADE_BG,
  // Arrangement helpers that carry no summer-specific semantics
  getMismatchedSessionGrades,
} from "@/lib/summer-utils";

import { type Lang as RegularLang, t as rt } from "@/lib/summer-utils";
import { getGradeColor } from "@/lib/constants";
import type { RegularCourseFormConfig } from "@/types";

// Grade badge colours are keyed on grade + stream (F1C, F2E, ...); regular
// surfaces feed effectiveStream into this so Int applicants colour as English.
export { getGradeColor };

/** Fold a typed school name the way the backend's alias layer does: trim,
 *  collapse whitespace runs (including full-width spaces), lower-case. Only a
 *  grouping fallback — the real mapping lives in the backend's alias table and
 *  arrives as school_canonical; this keys the spellings that table does not
 *  recognise yet. */
export function foldSchoolName(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The grouping key every school-aware surface shares: the canonical code when
 *  the backend recognised the spelling, the folded raw spelling otherwise, null
 *  when the field is empty. Two students group together exactly when the
 *  backend's schoolmate matching would count them together. */
export function schoolGroupKey(app: {
  school?: string | null;
  school_canonical?: string | null;
}): string | null {
  return app.school_canonical ?? (foldSchoolName(app.school) || null);
}

/** The distinct school keys across a list, sorted, for a school select's
 *  options. A plain sort happens to read well here: canonical codes are
 *  uppercase so they come first, folded spellings (lowercase and Chinese)
 *  follow. */
export function schoolKeysOf(
  items: { school?: string | null; school_canonical?: string | null }[],
): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    const k = schoolGroupKey(item);
    if (k) keys.add(k);
  }
  return Array.from(keys).sort();
}

/** Fold a raw stream value to the one that governs placement and colour: the
 *  International stream sits with English (a class, and a placed student, is
 *  only ever Chinese or English). Returns null when nothing is set. */
export function foldStream(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  return v === "Int" ? "E" : (v || null);
}

/** The stream that governs an application's placement and badge colour. The
 *  application's own value wins, because a family fills the form in for the year
 *  they are applying for while the student record can be a year stale, and Int
 *  folds into E. The record is only a fallback for a form with no stream at all.
 *  Mirrors effective_stream in the backend's regular_course router; where the
 *  two sides disagree the detail modal warns an admin and offers to copy the
 *  form's value onto the record. */
export function effectiveStream(app: {
  lang_stream?: string | null;
  linked_student?: { lang_stream?: string | null } | null;
}): string | null {
  return foldStream(app.lang_stream) ?? foldStream(app.linked_student?.lang_stream);
}

/** The stream written out for a sentence an admin reads. The names match the
 *  English ones the application form itself uses for its three options, shortened
 *  because "the record says Chinese Section" reads badly. An unrecognised value
 *  comes back as it was stored. */
export function streamName(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  return v === "C" ? "Chinese" : v === "E" ? "English" : v === "Int" ? "International" : v;
}

/** The record's stream when it disagrees with the form's, otherwise null. Drives
 *  the detail modal's warning: both sides must have a value and they must differ
 *  after folding, so an Int form against an E record is not a disagreement. */
export function divergentRecordStream(app: {
  lang_stream?: string | null;
  linked_student?: { lang_stream?: string | null } | null;
}): string | null {
  const form = foldStream(app.lang_stream);
  const record = foldStream(app.linked_student?.lang_stream);
  return form && record && form !== record ? record : null;
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

/** The September intake form itself, on its own subdomain. Summer's closed
 *  pages link here to send an out-of-season parent somewhere that can actually
 *  take their application, so the address has to be absolute: they are on
 *  summer.* when they follow it. */
export const REGULAR_APPLY_URL =
  "https://regular.mathconceptsecondary.academy/apply";

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

/** Status pill colours, matching the summer card's dot/bg/text/borderL scheme
 *  rung for rung, because the two intakes share one ladder.
 *
 *  Here rather than on the application card that used to own them: they are a
 *  plain lookup table, and a surface that wants a stage's colour should not have
 *  to pull in the card, its inline status editor and its portal machinery to get
 *  one. The card re-exports the name so its own callers are unaffected. */
export const REGULAR_STATUS_COLORS: Record<string, { dot: string; bg: string; text: string; borderL: string }> = {
  "Submitted":           { dot: "bg-gray-400",    bg: "bg-gray-100 dark:bg-gray-800",         text: "text-gray-700 dark:text-gray-300",       borderL: "border-l-gray-400" },
  "Under Review":        { dot: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",       text: "text-blue-700 dark:text-blue-300",       borderL: "border-l-blue-500" },
  "Placement Offered":   { dot: "bg-indigo-500",  bg: "bg-indigo-50 dark:bg-indigo-900/20",   text: "text-indigo-700 dark:text-indigo-300",   borderL: "border-l-indigo-500" },
  "Placement Confirmed": { dot: "bg-purple-500",  bg: "bg-purple-50 dark:bg-purple-900/20",   text: "text-purple-700 dark:text-purple-300",   borderL: "border-l-purple-500" },
  "Fee Sent":            { dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-900/20",     text: "text-amber-700 dark:text-amber-300",     borderL: "border-l-amber-500" },
  "Paid":                { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300", borderL: "border-l-emerald-500" },
  "Enrolled":            { dot: "bg-green-500",   bg: "bg-green-50 dark:bg-green-900/20",     text: "text-green-700 dark:text-green-300",     borderL: "border-l-green-500" },
  "Waitlisted":          { dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-900/20",   text: "text-orange-700 dark:text-orange-300",   borderL: "border-l-orange-500" },
  "Withdrawn":           { dot: "bg-slate-400",   bg: "bg-slate-50 dark:bg-slate-800/50",     text: "text-slate-600 dark:text-slate-400",     borderL: "border-l-slate-400" },
  "Rejected":            { dot: "bg-red-500",     bg: "bg-red-50 dark:bg-red-900/20",         text: "text-red-700 dark:text-red-300",         borderL: "border-l-red-500" },
};

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
