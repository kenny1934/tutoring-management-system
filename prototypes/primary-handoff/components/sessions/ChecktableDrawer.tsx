"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Table2 } from "lucide-react";
import type {
  AssignmentStatus,
  ChecktableAssignment,
  ChecktableItem,
  Student,
} from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { ChecktableGrid, type GridStatusFilter, type GridSectionFilter } from "@/components/checktable/ChecktableGrid";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { Legend } from "@/components/checktable/Legend";

type Props = {
  student: Student;
  /** Optional item to scroll into focus on open — used by the per-row
   *  "Next" pill so the user lands on the suggested untouched item. */
  focusItemId?: string;
  onClose: () => void;
};

export function ChecktableDrawer({ student, focusItemId, onClose }: Props) {
  const {
    checktables,
    assignments,
    sessions,
    sessionLabel: formatSessionLabel,
    setAssignments,
    togglePrintBatch: togglePrintBatchForStudent,
    getPrintBatch,
  } = usePrimaryStore();

  // Auto-pick a checktable matching the student's grade. Matches the
  // RecordExerciseModal heuristic so the drawer doesn't open on the wrong
  // book.
  const initialChecktableId = useMemo(() => {
    const match = checktables.find((c) => c.grade === student.grade);
    return (match ?? checktables[0]).id;
  }, [checktables, student.grade]);

  const [checktableId, setChecktableId] = useState(initialChecktableId);
  const [activeItem, setActiveItem] = useState<ChecktableItem | null>(null);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");
  // Two-phase mount/unmount so the slide-in and slide-out animations have
  // time to play. `visible` flips after first paint to trigger the
  // translate-x → 0 transition; `close` flips it back then waits for the
  // transition before calling `onClose` (which actually unmounts).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  const table = checktables.find((c) => c.id === checktableId)!;

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [close]);

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

  const upcomingSessionsForStudent = useMemo(
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

  const printBatchIds = getPrintBatch(student.id);
  const selectedIds = new Set(printBatchIds);

  // Auto-open the assign dialog on focusItemId (from the "Next" pill) so
  // the tutor lands directly on the suggested action.
  useEffect(() => {
    if (!focusItemId) return;
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

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-ink-900/40 transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Checktable for ${student.name}`}
        className={`fixed top-0 right-0 z-40 h-screen w-full sm:w-[640px] lg:w-[760px] bg-ink-50 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-mc-line bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Table2 className="h-4 w-4 text-mc-red-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink-900 truncate">
                {student.name}
                <span className="text-ink-500 font-normal">
                  {" "}· {student.code} · {student.grade}
                </span>
              </div>
              <div className="text-[11px] text-ink-500 truncate">
                {table.textbook} · {table.version}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={checktableId}
              onChange={(e) => setChecktableId(e.target.value)}
              className="rounded-md border border-mc-line px-2 py-1 text-xs bg-white max-w-[200px]"
              aria-label="Switch checktable"
            >
              {checktables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.textbook} · {c.grade} · {c.version}
                </option>
              ))}
            </select>
            <button
              onClick={close}
              className="text-ink-400 hover:text-ink-800 p-1 -mr-1"
              aria-label="Close drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
        </div>

        {activeItem && (
          <AssignDialog
            item={activeItem}
            student={student}
            basePath={table.basePath}
            existingAssignment={existingAssignmentFor(activeItem)}
            upcomingSessions={upcomingSessionsForStudent}
            openAssignmentCount={openAssignmentCount}
            formatSessionLabel={formatSessionLabel}
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
      </aside>
    </>
  );
}
