/**
 * Grade progression and pre-grade display helpers (frontend mirror of
 * webapp/backend/utils/grades.py).
 *
 * The school year in HK starts on Sept 1. Stored grades only change when the
 * promotion job runs; during the summer transitional window the badge shows
 * "Pre-Fx" for tutor clarity without flipping the underlying value early.
 */

export const GRADE_ORDER = ["P6", "F1", "F2", "F3", "F4", "F5", "F6", "Graduated"] as const;

/** Ladder position of a grade; anything unrecognised sorts after the ladder. */
export function gradeRank(grade: string): number {
  const i = (GRADE_ORDER as readonly string[]).indexOf(grade);
  return i === -1 ? GRADE_ORDER.length : i;
}

/** Sort grades up the ladder (P6 → F6), unrecognised values last, alphabetically. */
export function sortGrades(grades: string[]): string[] {
  return [...grades].sort((a, b) => gradeRank(a) - gradeRank(b) || a.localeCompare(b));
}

export const PROMOTE_MAP: Record<string, string> = {
  P6: "F1",
  F1: "F2",
  F2: "F3",
  F3: "F4",
  F4: "F5",
  F5: "F6",
  F6: "Graduated",
};

/**
 * A primary prospect is by definition a P6 student heading for secondary, but
 * the grade arrives as free text from a branch tutor's pasted spreadsheet, so
 * the column holds "P6", "P6/G6", "小六" and friends. Every spelling a token
 * can take; a value made only of these folds to the canonical "P6".
 */
const P6_TOKENS = new Set([
  "p6", "g6", "6",
  "primary6", "grade6",
  "小六", "六年級", "小學六年級",
]);

/**
 * Fold the many spellings of P6 to the canonical "P6". Only recognised P6
 * forms are rewritten; anything else is returned as typed, so a genuinely odd
 * value stays visible for a human to fix. Mirrors normalize_prospect_grade in
 * webapp/backend/utils/grades.py — the paste table shows what will be stored.
 */
export function normalizeProspectGrade(grade: string): string {
  const text = grade.trim();
  if (!text) return text;
  const tokens = text.toLowerCase().split(/[^0-9a-z一-鿿]+/).filter(Boolean);
  if (!tokens.length) return text;
  // "primary 6" arrives as two tokens; rejoin so spelled-out forms match too.
  if (P6_TOKENS.has(tokens.join("")) || tokens.every((t) => P6_TOKENS.has(t))) return "P6";
  return text;
}

export const TARGET_TO_PRE_GRADE: Record<string, string> = {
  F1: "P6",
  F2: "F1",
  F3: "F2",
  F4: "F3",
};

export interface PreGradeWindow {
  start: string | null;
  end: string | null;
}

function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isInPreGradeWindow(window: PreGradeWindow | null | undefined, today: Date = todayLocal()): boolean {
  if (!window?.start || !window?.end) return false;
  const start = parseISODate(window.start);
  const end = parseISODate(window.end);
  if (!start || !end) return false;
  return today >= start && today <= end;
}

/**
 * Render a grade with "Pre-" prefix when inside the pre-grade window.
 * Falls back to the raw grade outside the window or for grades that have
 * no meaningful next step (Graduated, unknown).
 */
export function displayGrade(
  grade: string | null | undefined,
  window: PreGradeWindow | null | undefined,
  today: Date = todayLocal(),
): string | undefined {
  if (!grade) return grade ?? undefined;
  if (!isInPreGradeWindow(window, today)) return grade;
  const promoted = PROMOTE_MAP[grade];
  if (!promoted || promoted === "Graduated") return grade;
  return `Pre-${promoted}`;
}

/**
 * Resolve the grade whose colour a badge should carry. Badge colours follow
 * the DISPLAYED grade, so a stored P6 showing "Pre-F1" during the window
 * takes F1's colour. Mirrors displayGrade's promotion rules exactly.
 */
export function gradeColorKey(
  grade: string | null | undefined,
  window: PreGradeWindow | null | undefined,
  today: Date = todayLocal(),
): string | undefined {
  if (!grade) return grade ?? undefined;
  if (!isInPreGradeWindow(window, today)) return grade;
  const promoted = PROMOTE_MAP[grade];
  if (!promoted || promoted === "Graduated") return grade;
  return promoted;
}

/**
 * Translate a summer application's target grade into the stored "current"
 * grade when creating a Student record before the Sept 1 promotion of the
 * application's config year fires. After Sept 1 of that year, the target
 * IS the current grade and we pass through.
 *
 * The cutoff is Sept 1 — wider than the badge display window — because a
 * pre-F1 applicant is currently in P6 at any point before the promotion,
 * not just during the summer course itself.
 */
export function applyTargetToPreGrade(
  targetGrade: string | null | undefined,
  configYear: number | null | undefined,
  today: Date = todayLocal(),
): string | undefined {
  if (!targetGrade) return targetGrade ?? undefined;
  if (!configYear) return targetGrade;
  const promotionDate = new Date(configYear, 8, 1); // Sept 1 (month is 0-indexed)
  if (today >= promotionDate) return targetGrade;
  return TARGET_TO_PRE_GRADE[targetGrade] ?? targetGrade;
}

/**
 * Resolve the grade a summer course's materials are indexed under (the grade
 * the student is *entering*: F1/F2/F3) from a student's stored grade.
 *
 * Inverse of applyTargetToPreGrade. Before Sept 1 of the summer's year the
 * stored grade is still the pre-grade (a Pre-F1 student is stored "P6"), so we
 * promote it for the courseware lookup. On/after Sept 1 the promotion job has
 * already advanced the stored grade, so it passes through unchanged. The cutoff
 * is Sept 1 (not the badge window) so prep before the course start also works.
 */
export function coursewareGrade(
  grade: string | null | undefined,
  summerYear: number | null | undefined,
  today: Date = todayLocal(),
): string | undefined {
  if (!grade) return grade ?? undefined;
  if (!summerYear) return grade;
  const promotionDate = new Date(summerYear, 8, 1); // Sept 1 (month is 0-indexed)
  if (today >= promotionDate) return grade;
  return PROMOTE_MAP[grade] ?? grade;
}
