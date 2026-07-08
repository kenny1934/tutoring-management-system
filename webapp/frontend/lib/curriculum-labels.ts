// Shared display vocabulary for the curriculum feature (suggestion section,
// Curriculum page, search). Keep product nouns here — no backend jargon.

export const ROLE_LABELS: Record<string, string> = {
  exercise: "Exercise",
  quiz: "Quiz",
  mc: "MC",
  master: "Handout",
  revision: "Revision",
  question_bank: "Question Bank",
  past_paper: "Past Paper",
  mock: "Mock",
};

export const SOURCE_LABELS: Record<string, string> = {
  assignment: "assignments",
  prep_folder: "prep folders",
  sheet: "curriculum sheets",
  exam_scope: "exam scopes",
  tutor_confirm: "tutor confirmations",
};

export function conceptDisplayName(c: {
  name_en?: string | null;
  name_zh?: string | null;
}): string {
  if (c.name_en && c.name_zh) return `${c.name_en} · ${c.name_zh}`;
  return c.name_en || c.name_zh || "Unknown topic";
}

/**
 * Single-language topic name when the school's language stream is known
 * (C = Chinese, E = English); bilingual pair otherwise.
 */
export function conceptNameForStream(
  c: { name_en?: string | null; name_zh?: string | null },
  stream?: string | null
): string {
  if (stream === "C") return c.name_zh || c.name_en || "Unknown topic";
  if (stream === "E") return c.name_en || c.name_zh || "Unknown topic";
  return conceptDisplayName(c);
}

export function sourcesText(sources: string[]): string {
  return sources.map((s) => SOURCE_LABELS[s] || s).join(", ");
}

/** "week 12" / "weeks 9 to 14" — the span wording every evidence line uses. */
export function weeksSpanText(weeks: number[]): string {
  if (weeks.length === 0) return "";
  if (weeks.length === 1) return `week ${weeks[0]}`;
  return `weeks ${Math.min(...weeks)} to ${Math.max(...weeks)}`;
}

/** The standard evidence line under a topic: span first, then sources. */
export function evidenceSummary(weeks: number[], sources: string[]): string {
  return `Seen in ${weeksSpanText(weeks)} · ${sourcesText(sources)}`;
}

// Mirrors the backend's SUGGESTED_GRADES — widening the scope means changing
// both sides together.
export const SUGGESTED_GRADES = ["F1", "F2", "F3"];

/**
 * Whether a session should show curriculum surfaces (suggestion section,
 * School Progress tab). Summer classes follow lesson numbers, not a school
 * timeline.
 */
export function isCurriculumEligible(session: {
  summer_slot_id?: number | null;
  lesson_number?: number | null;
  grade?: string | null;
  school?: string | null;
  student_id?: number | null;
}): boolean {
  const isSummer = session.summer_slot_id != null || session.lesson_number != null;
  return (
    !isSummer &&
    SUGGESTED_GRADES.includes(session.grade || "") &&
    !!session.school &&
    !!session.student_id
  );
}

/** "2025-2026" -> "2024-2025"; input returned unchanged if not year-shaped. */
export function priorAcademicYear(year: string): string {
  const parts = year.split("-");
  if (parts.length !== 2) return year;
  return `${parseInt(parts[0]) - 1}-${parseInt(parts[1]) - 1}`;
}

export function stripExtension(name: string): string {
  return name.replace(/\.(pdf|docx?|xlsx|pptx|jpg)$/i, "");
}

/**
 * Concept-vocabulary matcher shared by the search autocomplete and the
 * suggestion section's correction picker: bilingual name substring or an
 * exact series code (e.g. 803).
 */
export function matchesConcept(
  c: { name_en?: string | null; name_zh?: string | null; codes: { code: string }[] },
  needle: string
): boolean {
  const n = needle.toLowerCase();
  return (
    (c.name_en || "").toLowerCase().includes(n) ||
    (c.name_zh || "").includes(needle) ||
    c.codes.some((code) => code.code.toLowerCase() === n)
  );
}
