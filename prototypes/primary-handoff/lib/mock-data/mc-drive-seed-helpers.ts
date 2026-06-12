import type {
  Checktable,
  ChecktableChapter,
  ChecktableItem,
} from "../types";
import { mcDriveChecktables } from "./mc-drive-checktables";
import { bookGrade } from "../grade";

// Helpers that pull *real* MC Drive worksheet items, grade-matched, so the
// students/sessions/history seeds reference live checktable data instead of
// the archived hand-coded textbooks. Everything derives from a student's
// grade + a worksheet family, which keeps the seed referentially intact even
// if grades change.

/** The active CA line, used as the main checktable wherever it covers the
 *  student's grade (it only spans P1-P2). */
export const CA_FAMILY = "CA (Level 1&2)";
/** Legacy main family, the fallback for grades the CA line doesn't cover so
 *  older students' demo history still has a (now archived) book to live in. */
export const SG_FAMILY = "SG (Letter Size)";
/** Secondary family so a student's history spans more than one book. */
export const SECONDARY_FAMILY = "Math 1-6 (A4)";

/** Family used as each student's main checktable: CA when it has a book for
 *  the grade, otherwise the legacy SG line. */
export function primaryFamily(grade: string): string {
  return findTable(grade, CA_FAMILY) ? CA_FAMILY : SG_FAMILY;
}

// R / P / PS are render-only note codes (revision marker, project, problem-set
// header), not assignable worksheets. Mirrors PrimaryStore.nextSuggestion.
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
  const key = bookGrade(grade);
  return mcDriveChecktables.find(
    (t) => t.grade === key && t.family === family
  );
}

/** Flatten a checktable's assignable worksheets in chapter, then series, order. */
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
  /** Ordered assignable items in the student's primary book (CA for P1-P2,
   *  legacy SG otherwise). */
  primary: PlanItem[];
  /** Ordered assignable items in the student's secondary (Math 1-6) book. */
  secondary: PlanItem[];
};

function planFor(grade: string): StudentPlan {
  const main = findTable(grade, primaryFamily(grade));
  const m16 = findTable(grade, SECONDARY_FAMILY);
  return {
    grade,
    primary: main ? assignableItems(main) : [],
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

// --- Variant pairs (CW / HW) ----------------------------------------------
//
// MC Drive worksheets come in variant pairs within a chapter's series cell:
// the "...1" variant is the classwork copy and the "...2" variant is the
// matching homework copy (e.g. SG601A1 done in class, SG601A2 sent home).
// The SG (Letter Size) primary books are always exactly two clean variants
// per cell, so a "unit" is just that pair.

export type PlanUnit = {
  /** Variant 1, the classwork copy. */
  cw: ChecktableItem;
  /** Variant 2, the matching homework copy. */
  hw: ChecktableItem;
  chapter: ChecktableChapter;
  sectionLabel: string;
  checktableId: string;
  seriesId: string;
};

/** Pair up a checktable's worksheets into CW (variant 1) / HW (variant 2)
 *  units, in chapter then series order. Cells without a clean pair are skipped. */
export function assignableUnits(table: Checktable): PlanUnit[] {
  const out: PlanUnit[] = [];
  for (const sec of table.sections) {
    for (const ch of sec.chapters) {
      for (const s of table.series) {
        const its = ch.cells[s.id]?.items ?? [];
        if (its.length < 2) continue;
        const [cw, hw] = its;
        if (NON_ASSIGNABLE.has(cw.code)) continue;
        out.push({
          cw,
          hw,
          chapter: ch,
          sectionLabel: sec.label,
          checktableId: table.id,
          seriesId: s.id,
        });
      }
    }
  }
  return out;
}

/** Per-student CW/HW unit list from their primary book. */
export const studentUnits: Record<string, PlanUnit[]> = Object.fromEntries(
  Object.entries(STUDENT_GRADES).map(([id, g]) => {
    const main = findTable(g, primaryFamily(g));
    return [id, main ? assignableUnits(main) : []];
  })
);

/** Single source of truth for where each student sits in their book:
 *  `historyUnits` early units are fully done before the visible sessions
 *  (so the sessions start at unit index `historyUnits`), plus a few done
 *  worksheets in the secondary book. Read by both the session seed (to pick
 *  unit offsets) and the assignment seed (to layer history). */
export type SeedPlan = { historyUnits: number; secondaryDone: number };
export const SEED_PLAN: Record<string, SeedPlan> = {
  "s-001": { historyUnits: 4, secondaryDone: 2 }, // P6, mid-semester
  "s-002": { historyUnits: 7, secondaryDone: 2 }, // P4, heavy load, well ahead
  "s-003": { historyUnits: 0, secondaryDone: 0 }, // P2, just started
  "s-004": { historyUnits: 1, secondaryDone: 1 }, // P1, newer student
};

/** Worksheet fields for a unit's CW (variant 1) copy. */
export function cwRef(unit: PlanUnit): { pdf_name: string; item_id: string } {
  return { pdf_name: unit.cw.code, item_id: unit.cw.id };
}
/** Worksheet fields for a unit's HW (variant 2) copy. */
export function hwRef(unit: PlanUnit): { pdf_name: string; item_id: string } {
  return { pdf_name: unit.hw.code, item_id: unit.hw.id };
}
