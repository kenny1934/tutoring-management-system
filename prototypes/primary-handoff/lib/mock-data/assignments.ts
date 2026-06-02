import type { ChecktableAssignment } from "../types";
import { studentPlans } from "./mc-drive-seed-helpers";

// Seed assignments are built from each student's *grade-matched* MC Drive
// worksheet plan (see mc-drive-seed-helpers). Every itemId/checktableId
// therefore resolves to a real scraped worksheet, and a P6 student gets P6
// worksheets in their history while a P1 student gets P1 worksheets — no
// hand-maintained ids. Keep the per-student narratives diverse: some done,
// some still assigned, a few from the secondary (Math 1-6) book.

// Deterministic dates anchored to the demo "today" (no Date.now() so seeds
// stay stable across reloads).
const ANCHOR = new Date("2026-05-19T09:00:00Z");

function dateInfo(daysAgo: number): { iso: string; label: string } {
  const d = new Date(ANCHOR);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const ymd = d.toISOString().slice(0, 10);
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return { iso: d.toISOString(), label: `${ymd} ${weekday} 4:00pm` };
}

type Spec = {
  studentId: string;
  /** Primary-book worksheets completed (from chapter 1 onward). */
  done: number;
  /** Primary-book worksheets currently assigned (after the done run). */
  assigned: number;
  /** Secondary-book worksheets completed. */
  secondaryDone?: number;
  /** Tutor notes keyed by assignment offset, for flavour. */
  notes?: Record<number, string>;
};

const SPECS: Spec[] = [
  // Chan Ho Yin (P6) — mid-semester, through chapter ~6, a couple ahead.
  {
    studentId: "s-001",
    done: 6,
    assigned: 3,
    secondaryDone: 2,
    notes: { 7: "Skip word problems, focus on conversion drills" },
  },
  // Wong Mei Ling (P4) — heavy load, well ahead.
  {
    studentId: "s-002",
    done: 11,
    assigned: 2,
    secondaryDone: 2,
    notes: { 12: "Whole consolidated review for half-term check" },
  },
  // Lee Tsz Kit (P2) — light load, just getting going.
  { studentId: "s-003", done: 1, assigned: 1 },
  // Ng Wing Yan (P1) — newer student, a little early work done.
  { studentId: "s-004", done: 2, assigned: 2 },
];

function buildAssignments(spec: Spec): ChecktableAssignment[] {
  const plan = studentPlans[spec.studentId];
  if (!plan) return [];
  const out: ChecktableAssignment[] = [];
  let n = 0;
  const note = (offset: number) => spec.notes?.[offset];

  // Completed primary worksheets, weekly cadence working backwards.
  for (let i = 0; i < spec.done && i < plan.primary.length; i++) {
    const pi = plan.primary[i];
    const di = dateInfo((spec.done - i) * 7 + 7);
    out.push({
      id: `a-${spec.studentId}-${n++}`,
      studentId: spec.studentId,
      checktableId: pi.checktableId,
      itemId: pi.item.id,
      status: "done",
      assignedAt: di.iso,
      doneAt: di.iso,
      sessionLabel: di.label,
      tutorNote: note(i),
    });
  }

  // Currently-assigned primary worksheets (last week / this week).
  for (let i = 0; i < spec.assigned; i++) {
    const idx = spec.done + i;
    if (idx >= plan.primary.length) break;
    const pi = plan.primary[idx];
    const di = dateInfo(i === 0 ? 7 : 0);
    out.push({
      id: `a-${spec.studentId}-${n++}`,
      studentId: spec.studentId,
      checktableId: pi.checktableId,
      itemId: pi.item.id,
      status: "assigned",
      assignedAt: di.iso,
      sessionLabel: di.label,
      tutorNote: note(idx),
    });
  }

  // A few completed worksheets from the secondary (Math 1-6) book, so the
  // history spans more than one checktable.
  const secDone = spec.secondaryDone ?? 0;
  for (let i = 0; i < secDone && i < plan.secondary.length; i++) {
    const pi = plan.secondary[i];
    const di = dateInfo((secDone - i) * 7 + 3);
    out.push({
      id: `a-${spec.studentId}-sec-${i}`,
      studentId: spec.studentId,
      checktableId: pi.checktableId,
      itemId: pi.item.id,
      status: "done",
      assignedAt: di.iso,
      doneAt: di.iso,
      sessionLabel: di.label,
    });
  }

  return out;
}

export const seedAssignments: ChecktableAssignment[] = SPECS.flatMap(
  buildAssignments
);
