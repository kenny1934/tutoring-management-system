import type { Enrollment } from "@/types";
import { DAY_NAME_TO_INDEX } from "@/lib/constants";

// Faceted filtering / sorting for a tutor's active-student roster. Shared by the
// roster card (the visible list) and the Quick Stats card (the clickable facet
// menu) so the two stay in lock-step.

export type StreamKey = "C" | "E" | "Other";

// One value per dimension; dimensions AND together.
export interface RosterFacets {
  grade?: string;
  lang?: StreamKey;
  school?: string;
  location?: string;
  day?: string;
  time?: string;
}

// Canonical short day name ("Mon", "Sat") for an enrollment's assigned day,
// or null when unscheduled. Normalizes longer forms to their 3-letter prefix.
export function shortDay(day: string | null | undefined): string | null {
  if (!day) return null;
  const d = day.trim();
  if (!d) return null;
  return d.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
}

export type RosterSort = "school_id" | "name" | "grade" | "school" | "stream" | "day_time";

export const ROSTER_SORTS: { value: RosterSort; label: string }[] = [
  { value: "school_id", label: "School ID" },
  { value: "name", label: "Name" },
  { value: "grade", label: "Grade" },
  { value: "school", label: "School" },
  { value: "stream", label: "Lang" },
  { value: "day_time", label: "Day & time" },
];

// Grade progression and C/E/Other ordering — the single source of truth for the
// tutor roster feature (the stats card imports these rather than re-declaring).
export const GRADE_ORDER = ["P6", "F1", "F2", "F3", "F4", "F5", "F6"];
export const STREAM_ORDER: Record<StreamKey, number> = { C: 0, E: 1, Other: 2 };

export function normalizeStream(raw: string | null | undefined): StreamKey {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "C" || v === "E") return v;
  return "Other";
}

export function normalizeGrade(raw: string | null | undefined): string {
  return (raw || "Other").toUpperCase();
}

// Sort index for a grade; unknown grades sort last.
export function gradeIdx(grade: string | null | undefined): number {
  const i = GRADE_ORDER.indexOf(normalizeGrade(grade));
  return i === -1 ? 99 : i;
}

function dayIdx(day: string | null | undefined): number {
  if (!day) return 99;
  return DAY_NAME_TO_INDEX[day] ?? DAY_NAME_TO_INDEX[day.slice(0, 3)] ?? 99;
}

function schoolIdNum(e: Enrollment): number | null {
  if (!e.school_student_id) return null;
  const n = Number(e.school_student_id);
  return Number.isNaN(n) ? null : n;
}

/** Keep only roster entries matching every set facet dimension. */
export function applyFacets(roster: Enrollment[], f: RosterFacets): Enrollment[] {
  return roster.filter((e) => {
    if (f.grade && normalizeGrade(e.grade) !== f.grade) return false;
    if (f.lang && normalizeStream(e.lang_stream) !== f.lang) return false;
    if (f.school && e.school !== f.school) return false;
    if (f.location && e.location !== f.location) return false;
    if (f.day && shortDay(e.assigned_day) !== f.day) return false;
    if (f.time && (e.assigned_time?.trim() || "") !== f.time) return false;
    return true;
  });
}

/** Free-text match across name, school, student id and grade/stream. */
// `q` must already be trimmed + lowercased by the caller (normalize once, not
// once per roster row).
export function matchesSearch(e: Enrollment, q: string): boolean {
  if (!q) return true;
  return (
    (e.student_name || "").toLowerCase().includes(q) ||
    (e.school || "").toLowerCase().includes(q) ||
    (e.school_student_id || "").toLowerCase().includes(q) ||
    `${e.grade || ""}${e.lang_stream || ""}`.toLowerCase().includes(q)
  );
}

export function sortRoster(roster: Enrollment[], sort: RosterSort): Enrollment[] {
  const byName = (a: Enrollment, b: Enrollment) =>
    (a.student_name || "").localeCompare(b.student_name || "");
  const arr = [...roster];

  switch (sort) {
    case "name":
      return arr.sort(byName);
    case "grade":
      return arr.sort(
        (a, b) =>
          gradeIdx(a.grade) - gradeIdx(b.grade) ||
          STREAM_ORDER[normalizeStream(a.lang_stream)] - STREAM_ORDER[normalizeStream(b.lang_stream)] ||
          byName(a, b)
      );
    case "school":
      return arr.sort((a, b) => {
        const as = a.school || "";
        const bs = b.school || "";
        if (!as || !bs) return as ? -1 : bs ? 1 : byName(a, b);
        return as.localeCompare(bs) || byName(a, b);
      });
    case "stream":
      return arr.sort(
        (a, b) =>
          STREAM_ORDER[normalizeStream(a.lang_stream)] - STREAM_ORDER[normalizeStream(b.lang_stream)] ||
          gradeIdx(a.grade) - gradeIdx(b.grade) ||
          byName(a, b)
      );
    case "day_time":
      return arr.sort(
        (a, b) =>
          dayIdx(a.assigned_day) - dayIdx(b.assigned_day) ||
          (a.assigned_time || "").localeCompare(b.assigned_time || "") ||
          byName(a, b)
      );
    case "school_id":
    default:
      return arr.sort((a, b) => {
        const an = schoolIdNum(a);
        const bn = schoolIdNum(b);
        if (an === null || bn === null) return an !== null ? -1 : bn !== null ? 1 : byName(a, b);
        return an - bn;
      });
  }
}
