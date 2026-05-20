"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import type {
  AssignmentStatus,
  ChecktableAssignment,
  ChecktableItem,
} from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import {
  ChecktableGrid,
  type GridSectionFilter,
  type GridStatusFilter,
} from "@/components/checktable/ChecktableGrid";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import {
  GridFilterBar,
  Legend,
} from "@/components/checktable/ChecktableApp";

export function StudentChecktablesTab() {
  const { id } = useParams<{ id: string }>();
  const {
    students,
    checktables,
    assignments,
    sessions,
    sessionLabel,
    setAssignments,
    getPrintBatch,
    togglePrintBatch: togglePrintBatchForStudent,
    removeFromPrintBatch,
    clearPrintBatch,
    itemMeta,
  } = usePrimaryStore();

  const student = students.find((s) => s.id === id)!;

  // Auto-pick the checktable that matches the student's grade. Tutors can
  // still switch books via the inline selector — the picker is quiet but
  // there for ad-hoc cases (older book, supplementary tracks).
  const initialChecktableId = useMemo(() => {
    const match = checktables.find((c) => c.grade === student.grade);
    return (match ?? checktables[0]).id;
  }, [checktables, student.grade]);

  const [checktableId, setChecktableId] = useState(initialChecktableId);
  const [activeItem, setActiveItem] = useState<ChecktableItem | null>(null);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");

  const table = checktables.find((c) => c.id === checktableId)!;

  const statusByItemId = useMemo(() => {
    const map: Record<string, AssignmentStatus | null> = {};
    for (const a of assignments) {
      if (a.studentId === student.id && a.checktableId === checktableId) {
        map[a.itemId] = a.status;
      }
    }
    return map;
  }, [assignments, student.id, checktableId]);

  const noteByItemId = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    for (const a of assignments) {
      if (
        a.studentId === student.id &&
        a.checktableId === checktableId &&
        a.tutorNote
      ) {
        map[a.itemId] = a.tutorNote;
      }
    }
    return map;
  }, [assignments, student.id, checktableId]);

  const studentAssignments = useMemo(
    () => assignments.filter((a) => a.studentId === student.id),
    [assignments, student.id]
  );
  const openAssignmentCount = useMemo(
    () => studentAssignments.filter((a) => a.status === "assigned").length,
    [studentAssignments]
  );

  const upcomingSessions = useMemo(
    () =>
      sessions
        .filter(
          (s) => s.session_date >= DEMO_DAY && s.student_id === student.id
        )
        .sort((a, b) => {
          if (a.session_date !== b.session_date)
            return a.session_date.localeCompare(b.session_date);
          return a.start_time.localeCompare(b.start_time);
        })
        .slice(0, 8),
    [sessions, student.id]
  );

  const printBatchIds = getPrintBatch(student.id);
  const selectedIds = new Set(printBatchIds);
  const printBatchItems = useMemo(
    () =>
      printBatchIds
        .map((pid) => itemMeta.get(pid)?.item)
        .filter((i): i is ChecktableItem => Boolean(i)),
    [printBatchIds, itemMeta]
  );

  const existingAssignmentFor = (item: ChecktableItem) =>
    assignments.find(
      (a) =>
        a.studentId === student.id &&
        a.checktableId === checktableId &&
        a.itemId === item.id
    );

  const handleAssign = (
    item: ChecktableItem,
    input: {
      pageRange?: string;
      tutorNote?: string;
      sessionLabel: string;
      sessionId?: string;
    }
  ) => {
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
        id: `a-${Math.random().toString(36).slice(2, 8)}`,
        studentId: student.id,
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
  };

  const handleMarkDone = (item: ChecktableItem) => {
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
  };

  const handleUnassign = (item: ChecktableItem) => {
    const existing = existingAssignmentFor(item);
    if (!existing) return;
    setAssignments((prev) => prev.filter((a) => a.id !== existing.id));
    setActiveItem(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-ink-700">
          <BookOpen className="h-4 w-4 text-ink-500" />
          <span className="font-medium">{table.textbook}</span>
          <span className="text-ink-500">
            {table.grade} · {table.version}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-500">Switch book</span>
          <select
            value={checktableId}
            onChange={(e) => setChecktableId(e.target.value)}
            className="rounded-md border border-ink-200 px-2 py-1 text-xs bg-white"
            aria-label="Switch checktable"
          >
            {checktables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.textbook} · {c.grade} · {c.version}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Legend />

      <GridFilterBar
        table={table}
        statusByItemId={statusByItemId}
        status={gridStatus}
        section={gridSection}
        onStatusChange={setGridStatus}
        onSectionChange={setGridSection}
      />

      <ChecktableGrid
        table={table}
        statusByItemId={statusByItemId}
        noteByItemId={noteByItemId}
        selectedItemIds={selectedIds}
        statusFilter={gridStatus}
        sectionFilter={gridSection}
        onItemClick={setActiveItem}
      />

      <PrintTray
        items={printBatchItems}
        student={student}
        onRemove={(pid) => removeFromPrintBatch(student.id, pid)}
        onClear={() => clearPrintBatch(student.id)}
        onPrint={() => {
          alert(
            `Demo only.\n\nWould print ${printBatchItems.length} PDFs from:\n${table.basePath}`
          );
          clearPrintBatch(student.id);
        }}
      />

      {activeItem && (
        <AssignDialog
          item={activeItem}
          student={student}
          basePath={table.basePath}
          existingAssignment={existingAssignmentFor(activeItem)}
          upcomingSessions={upcomingSessions}
          openAssignmentCount={openAssignmentCount}
          formatSessionLabel={sessionLabel}
          onClose={() => setActiveItem(null)}
          onAssign={(input) => handleAssign(activeItem, input)}
          onMarkDone={() => handleMarkDone(activeItem)}
          onUnassign={() => handleUnassign(activeItem)}
          onAddToPrintBatch={() =>
            togglePrintBatchForStudent(student.id, activeItem.id)
          }
          isInPrintBatch={selectedIds.has(activeItem.id)}
        />
      )}
    </div>
  );
}
