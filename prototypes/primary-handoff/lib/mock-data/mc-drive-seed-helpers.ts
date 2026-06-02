import type {
  Checktable,
  ChecktableChapter,
  ChecktableItem,
} from "../types";
import { mcDriveChecktables } from "./mc-drive-checktables";

// Helpers that pull *real* MC Drive worksheet items, grade-matched, so the
// students/sessions/history seeds reference live checktable data instead of
// the archived hand-coded textbooks. Everything derives from a student's
// grade + a worksheet family, which keeps the seed referentially intact even
// if grades change.

/** Family used as each student's main checktable. */
export const PRIMARY_FAMILY = "SG (Letter Size)";
/** Secondary family so a student's history spans more than one book. */
export const SECONDARY_FAMILY = "Math 1-6 (A4)";

// R / P / PS are render-only note codes (revision marker, project, problem-set
// header) — not assignable worksheets. Mirrors PrimaryStore.nextSuggestedItem.
const NON_ASSIGNABLE = new Set(["R", "P", "PS"]);

export type PlanItem = {
  item: ChecktableItem;
  checktableId: string;
  chapter: ChecktableChapter;
  sectionLabel: string;
};

export function findTable(
  grade: string,
  family: string
): Checktable | undefined {
  return mcDriveChecktables.find(
    (t) => t.grade === grade && t.family === family
  );
}

/** Flatten a checktable's assignable worksheets in chapter → series order. */
export function assignableItems(table: Checktable): PlanItem[] {
  const out: PlanItem[] = [];
  for (const sec of table.sections) {
    for (const ch of sec.chapters) {
      for (const s of table.series) {
        for (const it of ch.cells[s.id]?.items ?? []) {
          if (NON_ASSIGNABLE.has(it.code)) continue;
          out.push({
            item: it,
            checktableId: table.id,
            chapter: ch,
            sectionLabel: sec.label,
          });
        }
      }
    }
  }
  return out;
}

export type StudentPlan = {
  grade: string;
  /** Ordered assignable items in the student's primary (SG) book. */
  primary: PlanItem[];
  /** Ordered assignable items in the student's secondary (Math 1-6) book. */
  secondary: PlanItem[];
};

function planFor(grade: string): StudentPlan {
  const sg = findTable(grade, PRIMARY_FAMILY);
  const m16 = findTable(grade, SECONDARY_FAMILY);
  return {
    grade,
    primary: sg ? assignableItems(sg) : [],
    secondary: m16 ? assignableItems(m16) : [],
  };
}

/** Grade each demo student is in. Drives every grade-matched seed below. */
export const STUDENT_GRADES: Record<string, string> = {
  "s-001": "P6",
  "s-002": "P4",
  "s-003": "P2",
  "s-004": "P1",
};

/** Per-student ordered worksheet plans, keyed by student id. */
export const studentPlans: Record<string, StudentPlan> = Object.fromEntries(
  Object.entries(STUDENT_GRADES).map(([id, g]) => [id, planFor(g)])
);

/** Shorthand for a SessionExercise's worksheet fields from a plan item. */
export function exRef(items: PlanItem[], i: number): {
  pdf_name: string;
  item_id: string;
} {
  const it = items[i].item;
  return { pdf_name: it.code, item_id: it.id };
}
