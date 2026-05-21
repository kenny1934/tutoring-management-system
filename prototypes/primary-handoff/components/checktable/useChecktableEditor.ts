"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AssignmentStatus,
  ChecktableAssignment,
  ChecktableItem,
} from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { newId } from "@/lib/id";

type AssignInput = {
  pageRange?: string;
  tutorNote?: string;
  sessionLabel: string;
  sessionId?: string;
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
    getPrintBatch,
    togglePrintBatch,
    itemMeta,
  } = usePrimaryStore();

  const student = students.find((s) => s.id === studentId);

  const initialChecktableId = useMemo(() => {
    if (!student) return checktables[0]?.id ?? "";
    const match = checktables.find((c) => c.grade === student.grade);
    return (match ?? checktables[0]).id;
  }, [checktables, student]);

  const [checktableId, setChecktableId] = useState(initialChecktableId);
  const [activeItem, setActiveItem] = useState<ChecktableItem | null>(null);

  const table = checktables.find((c) => c.id === checktableId);

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
    [existingAssignmentFor, setAssignments, studentId, checktableId]
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
    checktableId,
    setChecktableId,
    table,
    activeItem,
    setActiveItem,
    statusByItemId,
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
