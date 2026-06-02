import type { ChecktableAssignment, Session } from "../types";
import { studentPlans } from "./mc-drive-seed-helpers";
import { sessions } from "./sessions";
import { seedHomeworkCompletions } from "./homework-completions";

// Seed assignments are derived from the session record so the Checktables grid
// and the Sessions page always agree: every worksheet recorded in a session
// (CW or HW) becomes a grid assignment, exactly the way the live store's
// recordExercise() does it (CW -> done, HW -> assigned, then a submitted
// homework-completion flips the HW to done). Earlier-chapter "history" items
// are layered underneath so a student's grid shows prior coverage too. Because
// everything resolves through studentPlans, ids stay grade-matched and real.

// --- helpers ---------------------------------------------------------------

function formatPageRange(start?: number, end?: number): string | undefined {
  if (start === undefined) return undefined;
  if (end === undefined || end === start) return String(start);
  return `${start}-${end}`;
}

/** Mirror PrimaryStore.formatSessionLabel so labels match the live store. */
function labelFor(session: Session): string {
  const d = new Date(`${session.session_date}T${session.start_time}:00+08:00`);
  const weekday = d.toLocaleDateString("en-HK", { weekday: "short" });
  const time = d.toLocaleTimeString("en-HK", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${session.session_date} ${weekday} ${time}`;
}

function sessionIso(session: Session): string {
  return new Date(
    `${session.session_date}T${session.start_time}:00+08:00`
  ).toISOString();
}

// item id -> owning checktable id, across every student's primary + secondary
// book (covers every item the sessions can reference).
const checktableIdByItem = new Map<string, string>();
for (const plan of Object.values(studentPlans)) {
  for (const pi of [...plan.primary, ...plan.secondary]) {
    checktableIdByItem.set(pi.item.id, pi.checktableId);
  }
}

const completionByExerciseId = new Map(
  seedHomeworkCompletions.map((c) => [c.session_exercise_id, c])
);

// --- 1. replay the session record into assignments -------------------------

const out: ChecktableAssignment[] = [];
const indexByKey = new Map<string, number>(); // `${studentId}|${itemId}` -> out index

function upsert(a: ChecktableAssignment) {
  const key = `${a.studentId}|${a.itemId}`;
  const idx = indexByKey.get(key);
  if (idx === undefined) {
    indexByKey.set(key, out.length);
    out.push(a);
    return;
  }
  // Already seen this worksheet for this student: keep "done" over "assigned"
  // and otherwise let the newer record win.
  const cur = out[idx];
  if (cur.status === "done" && a.status !== "done") return;
  out[idx] = a;
}

// Oldest sessions first so later sessions override earlier state.
const orderedSessions = [...sessions].sort((x, y) => {
  if (x.session_date !== y.session_date)
    return x.session_date.localeCompare(y.session_date);
  return x.start_time.localeCompare(y.start_time);
});

for (const session of orderedSessions) {
  const iso = sessionIso(session);
  const label = labelFor(session);
  const rows: { kind: "CW" | "HW"; ex: Session["cw"][number] }[] = [
    ...session.cw.map((ex) => ({ kind: "CW" as const, ex })),
    ...session.hw.map((ex) => ({ kind: "HW" as const, ex })),
  ];
  for (const { kind, ex } of rows) {
    if (!ex.item_id) continue;
    const checktableId = checktableIdByItem.get(ex.item_id);
    if (!checktableId) continue;
    const completion =
      kind === "HW" ? completionByExerciseId.get(ex.id) : undefined;
    const done = kind === "CW" || completion?.submitted === true;
    upsert({
      id: `a-${ex.id}`,
      studentId: session.student_id,
      checktableId,
      itemId: ex.item_id,
      status: done ? "done" : "assigned",
      assignedAt: iso,
      doneAt: done ? completion?.checked_at ?? iso : undefined,
      pageRange: formatPageRange(ex.page_start, ex.page_end),
      tutorNote: ex.remarks,
      sessionLabel: label,
      sessionId: session.id,
      sourceRecordedExerciseId: ex.id,
    });
  }
}

// --- 2. layer earlier-chapter history beneath the session record -----------

// Worksheets the student finished before the visible session window, so the
// grid shows real prior coverage. Indexed from chapter 1 of each book; items
// already recorded in a session are skipped.
type History = { primaryDone: number; secondaryDone: number };
const HISTORY: Record<string, History> = {
  "s-001": { primaryDone: 4, secondaryDone: 2 }, // P6 — mid-semester
  "s-002": { primaryDone: 12, secondaryDone: 2 }, // P4 — heavy load, well ahead
  "s-003": { primaryDone: 0, secondaryDone: 0 }, // P2 — just started
  "s-004": { primaryDone: 2, secondaryDone: 1 }, // P1 — newer student
};

// Deterministic history dates anchored to the demo "today".
const ANCHOR = new Date("2026-05-19T09:00:00Z");
function histDate(daysAgo: number): { iso: string; label: string } {
  const d = new Date(ANCHOR);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  const ymd = d.toISOString().slice(0, 10);
  const weekday = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  return { iso: d.toISOString(), label: `${ymd} ${weekday} 4:00 pm` };
}

function addHistory(studentId: string, hist: History) {
  const plan = studentPlans[studentId];
  if (!plan) return;
  const banks: [typeof plan.primary, number, string][] = [
    [plan.primary, hist.primaryDone, "p"],
    [plan.secondary, hist.secondaryDone, "s"],
  ];
  for (const [items, count, tag] of banks) {
    let placed = 0;
    for (let i = 0; i < items.length && placed < count; i++) {
      const pi = items[i];
      const key = `${studentId}|${pi.item.id}`;
      if (indexByKey.has(key)) continue; // already covered by a session
      // Space history out weekly, oldest first.
      const di = histDate((count - placed) * 7 + 21);
      upsert({
        id: `a-${studentId}-hist-${tag}-${i}`,
        studentId,
        checktableId: pi.checktableId,
        itemId: pi.item.id,
        status: "done",
        assignedAt: di.iso,
        doneAt: di.iso,
        sessionLabel: di.label,
      });
      placed++;
    }
  }
}

for (const [studentId, hist] of Object.entries(HISTORY)) {
  addHistory(studentId, hist);
}

export const seedAssignments: ChecktableAssignment[] = out;
