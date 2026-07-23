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
  SUMMER_GRADE_BG,
  SUMMER_GRADE_BORDER,
  SUMMER_GRADE_TEXT,
  // Arrangement helpers that carry no summer-specific semantics
  getMismatchedSessionGrades,
} from "@/lib/summer-utils";

import { type Lang as RegularLang, t as rt } from "@/lib/summer-utils";
import type { RegularCourseFormConfig } from "@/types";

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

/** Side-exit statuses rendered as a pill instead of a ladder rung. */
export const REGULAR_EXIT_STATUSES = new Set(["Waitlisted", "Withdrawn", "Rejected"]);

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
  config: RegularCourseFormConfig | null,
  locationName: string,
  day: string,
): string[] {
  if (!config) return [];
  const loc = config.locations.find((l) => l.name === locationName);
  const perDay = loc?.time_slots?.[day];
  if (perDay && perDay.length > 0) return perDay;
  return config.time_slots || [];
}
