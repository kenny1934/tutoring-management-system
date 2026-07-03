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
