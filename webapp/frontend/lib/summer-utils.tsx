/**
 * Shared utilities for summer course public pages.
 */

import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SummerApplicationSessionInfo, SummerPricingConfig, SummerSiblingInfo } from "@/types";

export type Lang = "zh" | "en";

/** Branch colors and district names — shared across summer pages. */
export const BRANCH_INFO: Record<string, { district: string; dot: string; badge: string }> = {
  MAC: { district: "高士德", dot: "bg-blue-500", badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  MCP: { district: "水坑尾", dot: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  MNT: { district: "東方明珠", dot: "bg-amber-500", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  MTA: { district: "氹仔美景I", dot: "bg-rose-500", badge: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  MLT: { district: "林茂塘", dot: "bg-violet-500", badge: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  MTR: { district: "氹仔美景II", dot: "bg-cyan-500", badge: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  MOT: { district: "二龍喉", dot: "bg-orange-500", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  KC:  { district: "KidsConcept", dot: "bg-pink-500", badge: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
};

/** Bilingual text selector. */
export const t = (zh: string, en: string, lang: Lang) =>
  lang === "zh" ? zh : en;

/** Step labels for the summer form progress bar and preview tabs. */
export const STEP_LABELS = [
  { zh: "學生資料", en: "Student" },
  { zh: "學生背景", en: "Background" },
  { zh: "課堂安排", en: "Schedule" },
  { zh: "聯絡方式", en: "Contact" },
  { zh: "確認提交", en: "Confirm" },
];

/** Day name translation map. */
const DAY_NAMES_ZH: Record<string, string> = {
  Monday: "星期一",
  Tuesday: "星期二",
  Wednesday: "星期三",
  Thursday: "星期四",
  Friday: "星期五",
  Saturday: "星期六",
  Sunday: "星期日",
};

/** Translate a day name based on language. */
export const dayLabel = (day: string, lang: Lang) =>
  lang === "zh" ? DAY_NAMES_ZH[day] || day : day;

/** Single-character ZH weekday (Monday → 一). */
export const DAY_SHORT_ZH: Record<string, string> = {
  Monday: "一",
  Tuesday: "二",
  Wednesday: "三",
  Thursday: "四",
  Friday: "五",
  Saturday: "六",
  Sunday: "日",
};

/** Sunday-first week order for calendar-style open-days strips. */
export const WEEK_DAY_ORDER = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Fallback branch photos, keyed by location name_en — overridden by
 *  `loc.image_url` in config when present. */
export const BRANCH_IMAGES_FALLBACK: Record<string, string> = {
  "Jardim de Vasco Center": "/summer/vasco-center.jpg",
  "Flora Garden Center": "/summer/flora-center.jpg",
};

/** Short weekday: 一/二/… (zh) or Mon/Tue/… (en). */
export const dayShort = (day: string, lang: Lang) =>
  lang === "zh" ? DAY_SHORT_ZH[day] || day : DAY_ABBREV[day] || day;

/** Bilingual label for sessions-per-week frequency. */
export const frequencyLabel = (n: number, lang: Lang) =>
  n === 1
    ? t("每星期一堂（標準）", "One lesson per week (standard)", lang)
    : t("每星期兩堂", "Two lessons per week", lang);

/** Pick the bilingual label of an option list entry, falling back to the raw value. */
export function labelForOption(
  options: { name: string; name_en: string; value?: string }[] | null | undefined,
  value: string | null | undefined,
  lang: Lang,
): string {
  if (!value) return "—";
  const opt = options?.find((o) => (o.value ?? o.name) === value);
  if (!opt) return value;
  return lang === "zh" ? opt.name : opt.name_en;
}

/** Format a date string like "2025-07-05" to compact "Jul 5". */
export function formatCompactDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Format a date string like "2025-07-05" to "Mon, Jul 5". */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Format a date string like "2025-07-05" to localized display. */
export function formatDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Compact date for tight UI strips — drops the year and uses short months. */
export function formatDateShort(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  if (lang === "zh") {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Common form input class (themed to match main app palette). */
export const inputClass =
  "w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-colors duration-200";

/** Section card class. */
export const sectionClass =
  "bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-6";

/** Label class for form fields. */
export const labelClass = "block text-sm font-medium text-foreground mb-2";

/** Radio group container. */
export const radioGroupClass = "flex flex-wrap gap-2.5";

/** Radio pill label class. */
export const radioLabelClass = (selected: boolean) =>
  `cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
    selected
      ? "bg-primary/10 text-primary border-primary shadow-sm"
      : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
  }`;

/** Small checkmark shown inside selected radio pills. */
export const RadioCheck = () => (
  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
    <Check className="h-2.5 w-2.5" strokeWidth={3} />
  </span>
);

/** Icon + label pattern for form field labels.
 *  Accepts any component that takes a `className` prop, so custom SVG icons
 *  (e.g. brand glyphs) work alongside lucide-react icons. */
export function IconLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0 text-primary/70" />
      <span>{children}</span>
    </span>
  );
}

/** Icon + text row for structured info blocks. */
export function InfoRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-foreground">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
      <span>{children}</span>
    </div>
  );
}

/** Strip "MathConcept中學教室" / "MathConcept Secondary Academy" prefix, showing just branch name. */
export function shortCenterName(fullName: string): string {
  const match = fullName.match(/\((.+)\)$/);
  return match ? match[1] : fullName;
}

/** Red asterisk for required fields. */
/** Visual required-field marker. Intentionally renders nothing — the form
 *  uses the inverse convention (everything required by default, optional
 *  fields marked explicitly with `（可選）`). Kept as an exported no-op so
 *  callers don't have to be touched if we ever flip the convention back. */
export const RequiredMark = () => null;

/** Grade badge colors for arrangement grid components. */
export const SUMMER_GRADE_BG: Record<string, string> = {
  F1: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  F2: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  F3: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

/** Course type A/B color scheme. */
export const COURSE_TYPE_COLORS: Record<string, string> = {
  A: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  B: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
};

/** Lesson number badge colors by grade (for calendar view). */
export const LESSON_BADGE_COLORS: Record<string, string> = {
  F1: "bg-blue-500 text-white dark:bg-blue-600",
  F2: "bg-purple-500 text-white dark:bg-purple-600",
  F3: "bg-orange-500 text-white dark:bg-orange-600",
};

/** Grade left-border colors for table rows. */
export const SUMMER_GRADE_BORDER: Record<string, string> = {
  F1: "border-l-blue-400",
  F2: "border-l-purple-400",
  F3: "border-l-orange-400",
};

/** Grade text-only colors for demand breakdowns. */
export const SUMMER_GRADE_TEXT: Record<string, string> = {
  F1: "text-blue-600 dark:text-blue-400",
  F2: "text-purple-600 dark:text-purple-400",
  F3: "text-orange-600 dark:text-orange-400",
};

export const DAY_ABBREV: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

/** Application statuses that count as "exited" (excluded from active counts). */
export const EXIT_STATUSES = new Set(["Withdrawn", "Rejected"]);

/** Keep only Pending + Confirmed siblings — Rejected ones are excluded from counts and displays. */
export function nonRejectedSiblings(
  siblings: SummerSiblingInfo[] | null | undefined,
): SummerSiblingInfo[] {
  return (siblings ?? []).filter((s) => s.verification_status !== "Rejected");
}

/** Whether an application has any session placements. */
export function isPlaced(app: { placed_count?: number | null; sessions?: unknown[] | null }): boolean {
  return (app.placed_count ?? 0) > 0 || (app.sessions != null && app.sessions.length > 0);
}

/** Get short weekday from ISO date string, e.g. "2025-07-07" → "Mon". */
export function getDayFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[d.getDay()];
}

/** Extract start time from a time slot like "10:00 - 11:30" → "10:00". */
export function getStartTime(timeSlot: string): string {
  return timeSlot.split(" - ")[0] || timeSlot;
}

/** Sort session-like objects by lesson_date then lesson_number. */
export function sortSessionsByDate<T extends { lesson_date?: string | null; lesson_number?: number | null }>(
  sessions: T[],
): T[] {
  return [...sessions].sort((a, b) => {
    if (a.lesson_date && b.lesson_date) return a.lesson_date.localeCompare(b.lesson_date);
    return (a.lesson_number ?? 0) - (b.lesson_number ?? 0);
  });
}

/** Status value for a freshly-rescheduled session (no make-up booked yet). */
export const RESCHEDULED_STATUS = "Rescheduled - Pending Make-up";

/** True when the post-publish session_log has drifted from the originally
 *  published placement on any of the six user-facing fields. Returns false
 *  pre-publish (nothing to diverge from). */
export function hasPlacementDiverged(p: SummerApplicationSessionInfo): boolean {
  if (p.session_log_id == null) return false;
  return (
    p.lesson_date !== p.original_lesson_date ||
    p.session_status !== p.original_session_status ||
    p.lesson_number !== p.original_lesson_number ||
    p.time_slot !== p.original_time_slot ||
    p.location !== p.original_location ||
    p.tutor_name !== p.original_tutor_name
  );
}

/**
 * Whether this session status means the student is not attending the slot.
 * Covers every Pending Make-up and Make-up Booked variant (Rescheduled /
 * Sick Leave / Weather Cancelled) plus Cancelled — matches the suffix
 * pattern used by session-status.ts.
 */
export function isNonAttending(status: string): boolean {
  return (
    status === "Cancelled" ||
    status.endsWith("- Pending Make-up") ||
    status.endsWith("- Make-up Booked")
  );
}

/** Session status → dot/bg color classes.
 *  Pre-publish placements use SummerSession statuses (Tentative / Confirmed /
 *  Rescheduled-Pending). Post-publish placements overlay live SessionLog
 *  statuses (Scheduled / Attended / No Show / Cancelled / Make-up variants)
 *  via _build_session_info in summer_course.py. Both sets must be mapped,
 *  or published rows fall back to the unplaced gray and read as missing. */
export const SESSION_STATUS_DOT: Record<string, string> = {
  // Pre-publish (SummerSession)
  Confirmed: "bg-green-500 dark:bg-green-400",
  Tentative: "bg-amber-400 dark:bg-amber-400",
  // Post-publish (SessionLog overlay) — Scheduled is a locked-in future placement
  Scheduled: "bg-green-500 dark:bg-green-400",
  Attended: "bg-green-600 dark:bg-green-500",
  "Attended (Make-up)": "bg-green-600 dark:bg-green-500",
  "Attended (Trial)": "bg-green-600 dark:bg-green-500",
  "No Show": "bg-red-500 dark:bg-red-400",
  Cancelled: "bg-red-500 dark:bg-red-400",
  // Make-up lifecycle (same visual in both publish states)
  "Rescheduled - Pending Make-up": "bg-orange-500 dark:bg-orange-400",
  "Sick Leave - Pending Make-up": "bg-orange-500 dark:bg-orange-400",
  "Weather Cancelled - Pending Make-up": "bg-orange-500 dark:bg-orange-400",
  "Rescheduled - Make-up Booked": "bg-gray-400 dark:bg-gray-400",
  "Sick Leave - Make-up Booked": "bg-gray-400 dark:bg-gray-400",
  "Weather Cancelled - Make-up Booked": "bg-gray-400 dark:bg-gray-400",
};
export const SESSION_STATUS_BG: Record<string, string> = {
  Confirmed: "bg-green-50 dark:bg-green-900/20",
  Tentative: "bg-yellow-50 dark:bg-yellow-900/20",
  "Rescheduled - Pending Make-up": "bg-orange-50/80 dark:bg-orange-900/20",
  "Sick Leave - Pending Make-up": "bg-orange-50/80 dark:bg-orange-900/20",
  "Weather Cancelled - Pending Make-up": "bg-orange-50/80 dark:bg-orange-900/20",
  "Rescheduled - Make-up Booked": "bg-gray-100/80 dark:bg-gray-800/20",
  "Sick Leave - Make-up Booked": "bg-gray-100/80 dark:bg-gray-800/20",
  "Weather Cancelled - Make-up Booked": "bg-gray-100/80 dark:bg-gray-800/20",
};
const SESSION_STATUS_DOT_DEFAULT = "bg-gray-300 dark:bg-gray-600";
const SESSION_STATUS_BG_DEFAULT = "bg-gray-50 dark:bg-gray-800/30";

export function sessionStatusDot(status: string): string {
  return SESSION_STATUS_DOT[status] ?? SESSION_STATUS_DOT_DEFAULT;
}
export function sessionStatusBg(status: string): string {
  return SESSION_STATUS_BG[status] ?? SESSION_STATUS_BG_DEFAULT;
}

/** One slot in the dot strip: either the session covering this lesson_number,
 *  or null for an unplaced slot. Sessions missing lesson_number are appended
 *  after the 1..totalLessons grid so nothing is lost. */
export interface PlacementDotSlot {
  lessonNumber: number | null;
  session: SummerApplicationSessionInfo | null;
}

/** Build a dot-strip layout indexed by lesson_number. Position N always
 *  represents lesson N (1..totalLessons); an empty slot means the student
 *  isn't placed on that specific lesson. Orphan sessions without a resolved
 *  lesson_number come last so they're still visible. */
export function buildPlacementDots(
  sessions: SummerApplicationSessionInfo[] | null | undefined,
  totalLessons: number,
): PlacementDotSlot[] {
  const byLesson = new Map<number, SummerApplicationSessionInfo>();
  const orphans: SummerApplicationSessionInfo[] = [];
  for (const s of sessions ?? []) {
    if (s.lesson_number != null && s.lesson_number >= 1 && s.lesson_number <= totalLessons) {
      byLesson.set(s.lesson_number, s);
    } else {
      orphans.push(s);
    }
  }
  const slots: PlacementDotSlot[] = [];
  for (let n = 1; n <= totalLessons; n++) {
    slots.push({ lessonNumber: n, session: byLesson.get(n) ?? null });
  }
  for (const o of orphans) {
    slots.push({ lessonNumber: null, session: o });
  }
  return slots;
}

/** Map summer config Chinese location names → internal system codes. */
export const LOCATION_TO_CODE: Record<string, string> = {
  "華士古分校": "MSA",
  "二龍喉分校": "MSB",
};

/** Display a location as its system code (MSA/MSB) for admin use. */
export function displayLocation(location: string | null | undefined): string {
  if (!location) return "";
  return LOCATION_TO_CODE[location] || location;
}

/** Minimum members needed to qualify as a "group" discount. */
export const MIN_GROUP_SIZE = 3;

export interface ActiveSummerPromo {
  ebActive: boolean;
  ebDeadline: Date | null;
  ebDateFormatted: string;
  daysUntilEb: number | null;
  groupFee: number | null;
  groupSavings: number | null;
  soloFee: number | null;
  soloSavings: number | null;
  /** True when the active group EB is a follow-up "加推" extension (i.e. an
   *  earlier group EB exists with an earlier deadline, regardless of whether
   *  that earlier one is still active). Lets the UI show a "加推" pill so
   *  parents understand they're seeing a smaller second-round offer. */
  isExtension: boolean;
}

/**
 * Derive the discount amounts to display right now from a pricing config.
 * Group discounts are those requiring {@link MIN_GROUP_SIZE}+ members; early
 * bird discounts are those with a `before_date` condition. Before the early
 * bird deadline, the early-bird group/solo discounts apply; after, only the
 * regular group discount does.
 */
export function getActiveSummerPromo(
  pricing: SummerPricingConfig,
  lang: Lang,
  now: Date = new Date()
): ActiveSummerPromo {
  const discounts = pricing.discounts || [];
  const isGroup = (d: { conditions?: { min_group_size?: number } }) =>
    (d.conditions?.min_group_size ?? 0) >= MIN_GROUP_SIZE;

  // Pick the earliest still-active early-bird in each tier (group / solo).
  // "Earliest active" rolls forward automatically as deadlines pass — once
  // the June EB expires, the July EB takes over without a redeploy.
  const earliestActive = (
    pred: (d: SummerPricingConfig["discounts"][number]) => boolean,
  ) =>
    discounts
      .filter((d) => pred(d) && !!d.conditions?.before_date)
      .map((d) => ({
        d,
        deadline: new Date(d.conditions!.before_date! + "T00:00:00"),
      }))
      .filter(({ deadline }) => deadline > now)
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())[0];

  const ebGroupActive = earliestActive(isGroup);
  const ebSoloActive = earliestActive((d) => !isGroup(d));
  const regularGroup = discounts.find(
    (d) => isGroup(d) && !d.conditions?.before_date
  );

  const ebDeadline = ebGroupActive?.deadline ?? null;
  const ebDateStr = ebGroupActive?.d.conditions?.before_date;
  const ebActive = !!ebGroupActive;
  const activeGroup = ebGroupActive?.d ?? regularGroup;
  const activeSolo = ebSoloActive?.d ?? null;

  // "Extension" = there exists at least one group EB with an earlier deadline
  // than the active one. Captures the 6月→7月加推 case where the second EB
  // is a smaller follow-up offer the parent should mentally distinguish.
  const isExtension =
    !!ebGroupActive &&
    discounts.some(
      (d) =>
        isGroup(d) &&
        !!d.conditions?.before_date &&
        new Date(d.conditions.before_date + "T00:00:00").getTime() <
          ebGroupActive.deadline.getTime(),
    );

  return {
    ebActive,
    ebDeadline,
    ebDateFormatted: ebDateStr ? formatDate(ebDateStr, lang) : "",
    daysUntilEb: ebDeadline
      ? Math.max(0, Math.ceil((ebDeadline.getTime() - now.getTime()) / 86400000))
      : null,
    groupFee: activeGroup ? pricing.base_fee - activeGroup.amount : null,
    groupSavings: activeGroup?.amount ?? null,
    soloFee: activeSolo ? pricing.base_fee - activeSolo.amount : null,
    soloSavings: activeSolo?.amount ?? null,
    isExtension,
  };
}

/** Format preference day+time pairs from a summer application. */
export function formatPreferences(app: {
  preference_1_day?: string | null;
  preference_1_time?: string | null;
  preference_2_day?: string | null;
  preference_2_time?: string | null;
}) {
  const pref1 = [app.preference_1_day, app.preference_1_time].filter(Boolean).join(" ");
  const pref2 = [app.preference_2_day, app.preference_2_time].filter(Boolean).join(" ");
  return { pref1, pref2, combined: [pref1, pref2].filter(Boolean).join(", ") };
}
