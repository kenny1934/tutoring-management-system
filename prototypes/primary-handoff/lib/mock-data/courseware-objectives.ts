// Learning objectives per worksheet SET (one objective per chapter x series
// cell). A "set" is the parts that share a code stem, e.g. SG101A1 + SG101A2,
// which together cover one objective.
//
// Keyed by SET CODE = an item code with its trailing part-number stripped:
//   SG101A1 / SG101A2  ->  "SG101A"
//   SG101R1 / SG101R2  ->  "SG101R"
//
// This file is hand-edited and kept separate from the auto-generated
// mc-drive-checktables.ts so objectives survive regeneration. Drop the real
// objectives in here as they arrive; sets with no entry just render without
// one.
//
// NOTE: the entries below are PLACEHOLDER samples (SG Level 1 only) so the
// Syllabus view has something to show. Replace with the authored objectives.

import type { Checktable } from "../types";

export const coursewareObjectives: Record<string, string> = {
  // Ch 1 — Numbers to 10
  SG101A: "Counting and recognising numbers from 1 to 10",
  SG101B: "Reading and writing numbers in words and figures up to 10",
  SG101C: "Comparing two groups to find which has more or fewer",
  SG101D: "Ordering numbers from 1 to 10 and finding what comes before and after",
  SG101R: "Revision of counting, reading and comparing numbers to 10",
  // Ch 2 — One to One Correspondence
  SG102A: "Matching objects one to one to compare quantities",
  SG102B: "Deciding whether two sets are equal by pairing items",
  SG102R: "Revision of one-to-one matching",
  // Ch 3 — Number Bonds
  SG103A: "Splitting numbers up to 10 into two parts",
  SG103B: "Finding the missing part of a number bond",
  SG103C: "Writing the number bonds that make a given number",
  SG103R: "Revision of number bonds within 10",
  // Ch 10 — Shapes and Patterns
  SG110A: "Identifying circles, triangles, rectangles and squares",
  SG110B: "Sorting shapes by their number of sides and corners",
  SG110C: "Continuing and completing simple repeating patterns",
  SG110R: "Revision of shapes and patterns",
  // Ch 13 — Numbers to 20
  SG113A: "Counting and writing numbers from 11 to 20",
  SG113B: "Showing teen numbers as a ten and some ones",
  SG113C: "Comparing and ordering numbers up to 20",
  SG113D: "Finding the number that is one more or one less within 20",
  SG113R: "Revision of numbers to 20",
};

/** Strip the trailing part-number from an item code to get its set code.
 *  "SG101A1" -> "SG101A", "SG101R2" -> "SG101R". */
export function setCodeFromItemCode(code: string): string {
  return code.replace(/\d+$/, "");
}

/** Look up the objective for a single item via its set code. */
export function objectiveForItemCode(code: string): string | undefined {
  return coursewareObjectives[setCodeFromItemCode(code)];
}

/** Return a copy of the checktables with each cell's `objective` filled in from
 *  the overlay above, derived from the first item's set code. Cells without a
 *  matching entry (or with no items) are left untouched. */
export function attachObjectives(tables: Checktable[]): Checktable[] {
  const objFor = (cell: { items: { code: string }[] }) => {
    const first = cell.items[0];
    return first ? coursewareObjectives[setCodeFromItemCode(first.code)] : undefined;
  };
  return tables.map((t) => ({
    ...t,
    sections: t.sections.map((sec) => ({
      ...sec,
      chapters: sec.chapters.map((ch) => {
        const cells: typeof ch.cells = {};
        for (const sId of Object.keys(ch.cells)) {
          const cell = ch.cells[sId];
          const objective = objFor(cell);
          cells[sId] = objective ? { ...cell, objective } : cell;
        }
        return { ...ch, cells };
      }),
    })),
  }));
}
