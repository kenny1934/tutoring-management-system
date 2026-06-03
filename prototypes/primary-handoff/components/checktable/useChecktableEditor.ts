"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AssignmentStatus,
  ChecktableAssignment,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";
import { usePrimaryStore, parsePageRange } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { newId } from "@/lib/id";
import { bookGrade } from "@/lib/grade";

type AssignInput = {
  pageRange?: string;
  tutorNote?: string;
  sessionLabel: string;
  sessionId?: string;
  /** CW/HW, only set when a session is linked. */
  kind?: ExerciseKind;
};

/** Shared editing surface for the per-student checktable. Powers both the
 *  `/students/[id]/checktables` tab and the slide-out drawer on `/sessions`.
 *  Auto-picks a checktable that matches the student's grade. `focusItemId`,
 *  if set, opens AssignDialog on that item once the table resolves. */
export function useChecktableEditor(
  studentId: string,
  focusItemId?: string | null
) {
  const {
    checktables,
    assignments,
    sessions,
    students,
    setAssignments,
    recordExercise,
    getPrintBatch,
    togglePrintBatch,
    itemMeta,
    primaryChecktableId,
  } = usePrimaryStore();

  const student = students.find((s) => s.id === studentId);

  // Open on the checktable the student is most active in (their narrative book),
  // not just the first grade match — otherwise a merged MC Drive table could win.
  const initialChecktableId = useMemo(
    () => (student ? primaryChecktableId(studentId) : checktables[0]?.id ?? ""),
    [student, studentId, primaryChecktableId, checktables]
  );

  const [checktableId, setChecktableId] = useState(initialChecktableId);
  const [activeItem, setActiveItem] = useState<ChecktableItem | null>(null);

  const table = checktables.find((c) => c.id === checktableId);

  // Books offered in the switch dropdown: only grade-appropriate ones (a P5
  // student sees Level 5 MC Drive material, not every level). The current
  // selection is always included so the <select> can render its own value.
  const bookOptions = useMemo(() => {
    const opts = checktables.filter(
      (c) => student && c.grade === bookGrade(student.grade)
    );
    if (!opts.some((c) => c.id === checktableId)) {
      const current = checktables.find((c) => c.id === checktableId);
      if (current) opts.unshift(current);
    }
    return opts;
  }, [checktables, student, checktableId]);

  useEffect(() => {
    if (!focusItemId || !table) return;
    for (const sec of table.sections) {
      for (const ch of sec.chapters) {
        for (const sId of Object.keys(ch.cells)) {
          const hit = ch.cells[sId].items.find((it) => it.id === focusItemId);
          if (hit) {
            setActiveItem(hit);
            return;
          }
        }
      }
    }
    const supp = table.supplementary.find((it) => it.id === focusItemId);
    if (supp) setActiveItem(supp);
  }, [focusItemId, table]);

  const statusByItemId = useMemo(() => {
    const map: Record<string, AssignmentStatus | null> = {};
    for (const a of assignments) {
      if (a.studentId === studentId && a.checktableId === checktableId) {
        map[a.itemId] = a.status;
      }
    }
    return map;
  }, [assignments, studentId, checktableId]);

  const kindByItemId = useMemo(() => {
    const map: Record<string, ExerciseKind | undefined> = {};
    for (const a of assignments) {
      if (
        a.studentId === studentId &&
        a.checktableId === checktableId &&
        a.kind
      ) {
        map[a.itemId] = a.kind;
      }
    }
    return map;
  }, [assignments, studentId, checktableId]);

  const noteByItemId = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of assignments) {
      if (
        a.studentId === studentId &&
        a.checktableId === checktableId &&
        a.tutorNote
      ) {
        map[a.itemId] = a.tutorNote;
      }
    }
    return map;
  }, [assignments, studentId, checktableId]);

  const openAssignmentCount = useMemo(
    () =>
      assignments.filter(
        (a) => a.studentId === studentId && a.status === "assigned"
      ).length,
    [assignments, studentId]
  );

  const upcomingSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.session_date >= DEMO_DAY && s.student_id === studentId)
        .sort((a, b) => {
          if (a.session_date !== b.session_date)
            return a.session_date.localeCompare(b.session_date);
          return a.start_time.localeCompare(b.start_time);
        })
        .slice(0, 8),
    [sessions, studentId]
  );

  const existingAssignmentFor = useCallback(
    (item: ChecktableItem) =>
      assignments.find(
        (a) =>
          a.studentId === studentId &&
          a.checktableId === checktableId &&
          a.itemId === item.id
      ),
    [assignments, studentId, checktableId]
  );

  const handleAssign = useCallback(
    (item: ChecktableItem, input: AssignInput) => {
      const existing = existingAssignmentFor(item);
      // New assignment linked to a session → record it as a real session
      // exercise so it shows on the Sessions page too. recordExercise also
      // writes the matching ChecktableAssignment (CW → done, HW → assigned).
      if (!existing && input.sessionId && input.kind) {
        const { page_start, page_end } = parsePageRange(input.pageRange);
        recordExercise({
          sessionId: input.sessionId,
          studentId,
          kind: input.kind,
          pdf_name: item.code,
          item_id: item.id,
          page_start,
          page_end,
          remarks: input.tutorNote || undefined,
        });
        setActiveItem(null);
        return;
      }
      if (existing) {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === existing.id
              ? {
                  ...a,
                  pageRange: input.pageRange || undefined,
                  tutorNote: input.tutorNote || undefined,
                  sessionLabel: input.sessionLabel || undefined,
                  sessionId: input.sessionId,
                }
              : a
          )
        );
      } else {
        const newA: ChecktableAssignment = {
          id: newId("a"),
          studentId,
          checktableId,
          itemId: item.id,
          status: "assigned",
          assignedAt: new Date().toISOString(),
          pageRange: input.pageRange || undefined,
          tutorNote: input.tutorNote || undefined,
          sessionLabel: input.sessionLabel || undefined,
          sessionId: input.sessionId,
        };
        setAssignments((prev) => [...prev, newA]);
      }
      setActiveItem(null);
    },
    [
      existingAssignmentFor,
      setAssignments,
      recordExercise,
      studentId,
      checktableId,
    ]
  );

  const handleMarkDone = useCallback(
    (item: ChecktableItem) => {
      const existing = existingAssignmentFor(item);
      if (!existing) return;
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === existing.id
            ? { ...a, status: "done", doneAt: new Date().toISOString() }
            : a
        )
      );
      setActiveItem(null);
    },
    [existingAssignmentFor, setAssignments]
  );

  const handleUnassign = useCallback(
    (item: ChecktableItem) => {
      const existing = existingAssignmentFor(item);
      if (!existing) return;
      setAssignments((prev) => prev.filter((a) => a.id !== existing.id));
      setActiveItem(null);
    },
    [existingAssignmentFor, setAssignments]
  );

  const printBatchIds = getPrintBatch(studentId);
  const selectedIds = useMemo(() => new Set(printBatchIds), [printBatchIds]);
  const printBatchItems = useMemo(
    () =>
      printBatchIds
        .map((pid) => itemMeta.get(pid)?.item)
        .filter((i): i is ChecktableItem => Boolean(i)),
    [printBatchIds, itemMeta]
  );

  return {
    checktables,
    bookOptions,
    checktableId,
    setChecktableId,
    table,
    activeItem,
    setActiveItem,
    statusByItemId,
    kindByItemId,
    noteByItemId,
    openAssignmentCount,
    upcomingSessions,
    existingAssignmentFor,
    handleAssign,
    handleMarkDone,
    handleUnassign,
    printBatchIds,
    selectedIds,
    printBatchItems,
    togglePrintBatch: (itemId: string) => togglePrintBatch(studentId, itemId),
  };
}
