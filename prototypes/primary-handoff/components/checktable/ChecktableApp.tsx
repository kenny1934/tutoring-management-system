"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableAssignment,
  ChecktableItem,
  Student,
} from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import {
  ChecktableGrid,
  type GridSectionFilter,
  type GridStatusFilter,
} from "./ChecktableGrid";
import { AssignDialog } from "./AssignDialog";
import { PrintTray } from "./PrintTray";
import { HistoryDrawer } from "./HistoryDrawer";

export function ChecktableApp() {
  const {
    students,
    checktables,
    assignments,
    sessions,
    itemMeta,
    setAssignments,
    sessionLabel: formatSessionLabel,
    getPrintBatch,
    togglePrintBatch: togglePrintBatchForStudent,
    removeFromPrintBatch,
    clearPrintBatch,
  } = usePrimaryStore();

  const searchParams = useSearchParams();
  const studentParam = searchParams.get("student");

  const [studentOverride, setStudentOverride] = useState<string | null>(null);
  const studentId =
    studentOverride ??
    (studentParam && students.some((s) => s.id === studentParam)
      ? studentParam
      : students[0].id);

  const [checktableId, setChecktableId] = useState(checktables[0].id);
  const [activeItem, setActiveItem] = useState<ChecktableItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");

  const student = students.find((s) => s.id === studentId)!;
  const table = checktables.find((c) => c.id === checktableId)!;

  const printBatchIds = getPrintBatch(studentId);

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

  const selectedIds = new Set(printBatchIds);

  const studentAssignments = assignments.filter(
    (a) => a.studentId === studentId
  );

  const openAssignmentCount = useMemo(
    () =>
      studentAssignments.filter((a) => a.status === "assigned").length,
    [studentAssignments]
  );

  const printBatchItems = useMemo(
    () =>
      printBatchIds
        .map((id) => itemMeta.get(id)?.item)
        .filter((i): i is ChecktableItem => Boolean(i)),
    [printBatchIds, itemMeta]
  );

  const existingAssignmentFor = (item: ChecktableItem) =>
    assignments.find(
      (a) =>
        a.studentId === studentId &&
        a.checktableId === checktableId &&
        a.itemId === item.id
    );

  const upcomingSessionsForStudent = useMemo(
    () =>
      sessions
        .filter(
          (s) =>
            s.startAt.slice(0, 10) >= DEMO_DAY &&
            s.students.some((st) => st.studentId === studentId)
        )
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .slice(0, 8),
    [sessions, studentId]
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

  const togglePrintBatch = (item: ChecktableItem) => {
    togglePrintBatchForStudent(studentId, item.id);
  };

  const handlePrint = () => {
    alert(
      `Demo only.\n\nWould resolve ${printBatchItems.length} PDFs from:\n${table.basePath}\n\nFiles:\n${printBatchItems
        .map((i) => i.pdfPath ?? `${table.basePath}\\${i.code}.pdf`)
        .join("\n")}\n\nAnd send to default printer.`
    );
    clearPrintBatch(studentId);
  };

  return (
    <div className="space-y-4">
      <Header
        students={students}
        student={student}
        onStudentChange={setStudentOverride}
        checktables={checktables}
        table={table}
        onChecktableChange={setChecktableId}
        historyCount={studentAssignments.length}
        onOpenHistory={() => setHistoryOpen(true)}
      />

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
        basePath={table.basePath}
        onRemove={(id) => removeFromPrintBatch(studentId, id)}
        onClear={() => clearPrintBatch(studentId)}
        onPrint={handlePrint}
      />

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
          onAddToPrintBatch={() => togglePrintBatch(activeItem)}
          isInPrintBatch={selectedIds.has(activeItem.id)}
        />
      )}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        student={student}
        assignments={studentAssignments}
        checktables={checktables}
      />
    </div>
  );
}

function Header({
  students,
  student,
  onStudentChange,
  checktables,
  table,
  onChecktableChange,
  historyCount,
  onOpenHistory,
}: {
  students: Student[];
  student: Student;
  onStudentChange: (id: string) => void;
  checktables: Checktable[];
  table: Checktable;
  onChecktableChange: (id: string) => void;
  historyCount: number;
  onOpenHistory: () => void;
}) {
  return (
    <div className="surface p-4 flex flex-wrap items-end gap-4">
      <div className="min-w-[180px] flex-1">
        <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
          Student
        </label>
        <select
          value={student.id}
          onChange={(e) => onStudentChange(e.target.value)}
          className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm bg-white"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.code} · {s.grade}
            </option>
          ))}
        </select>
        <div className="text-xs text-ink-500 mt-1">
          School: {student.school} · HW load:{" "}
          <span
            className="rounded-md px-1.5 py-0.5 bg-ink-100 text-ink-700"
            data-hw-load={student.hwLoad}
          >
            {student.hwLoad}
          </span>
        </div>
      </div>

      <div className="min-w-[220px] flex-1">
        <label className="block text-xs uppercase tracking-wide text-ink-500 mb-1">
          Checktable
        </label>
        <select
          value={table.id}
          onChange={(e) => onChecktableChange(e.target.value)}
          className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm bg-white"
        >
          {checktables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.textbook} · {t.grade} · {t.version}
            </option>
          ))}
        </select>
        <div className="text-xs text-ink-500 mt-1">
          Updated {table.updatedAt} ·{" "}
          <code className="font-mono">{table.basePath}</code>
        </div>
      </div>

      <button
        onClick={onOpenHistory}
        className="rounded-md border border-ink-300 text-ink-700 px-3 py-1.5 text-sm hover:bg-ink-100 flex items-center gap-1.5 whitespace-nowrap"
      >
        <History className="h-4 w-4" />
        History ({historyCount})
      </button>
    </div>
  );
}

function GridFilterBar({
  table,
  statusByItemId,
  status,
  section,
  onStatusChange,
  onSectionChange,
}: {
  table: Checktable;
  statusByItemId: Record<string, AssignmentStatus | null>;
  status: GridStatusFilter;
  section: GridSectionFilter;
  onStatusChange: (v: GridStatusFilter) => void;
  onSectionChange: (v: GridSectionFilter) => void;
}) {
  const counts = useMemo(() => {
    let total = 0;
    let pending = 0;
    let untouched = 0;
    const visit = (id: string) => {
      total += 1;
      const s = statusByItemId[id] ?? null;
      if (s === "assigned") pending += 1;
      else if (s === null) untouched += 1;
    };
    for (const sec of table.sections) {
      for (const ch of sec.chapters) {
        for (const sId of Object.keys(ch.cells)) {
          ch.cells[sId].items.forEach((i) => visit(i.id));
        }
      }
    }
    table.supplementary.forEach((i) => visit(i.id));
    return { total, pending, untouched };
  }, [table, statusByItemId]);

  const statusOptions: { id: GridStatusFilter; label: string; count: number }[] =
    [
      { id: "all", label: "All", count: counts.total },
      { id: "pending", label: "Pending", count: counts.pending },
      { id: "untouched", label: "Untouched", count: counts.untouched },
    ];

  const sectionOptions: { id: GridSectionFilter; label: string }[] = [
    { id: "all", label: "All sections" },
    ...table.sections.map((s) => ({
      id: s.id as GridSectionFilter,
      label: s.label,
    })),
  ];
  if (table.supplementary.length > 0) {
    sectionOptions.push({ id: "supp", label: "補充" });
  }

  return (
    <div className="surface flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-ink-500 mr-1">
        Filter
      </span>
      <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs">
        {statusOptions.map((opt) => {
          const active = status === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStatusChange(opt.id)}
              className={`px-2 py-0.5 rounded-md ${
                active
                  ? "bg-ink-800 text-white"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              {opt.label}
              <span
                className={`ml-1 ${active ? "opacity-80" : "text-ink-400"}`}
              >
                ({opt.count})
              </span>
            </button>
          );
        })}
      </div>
      <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs">
        {sectionOptions.map((opt) => {
          const active = section === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSectionChange(opt.id)}
              className={`px-2 py-0.5 rounded-md ${
                active
                  ? "bg-ink-800 text-white"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {(status !== "all" || section !== "all") && (
        <button
          type="button"
          onClick={() => {
            onStatusChange("all");
            onSectionChange("all");
          }}
          className="text-xs text-ink-500 hover:text-ink-800 ml-auto"
        >
          Reset
        </button>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
      <span className="flex items-center gap-1.5">
        <span className="chip">601A</span>
        <span>Untouched</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip" data-state="assigned">
          601A
        </span>
        <span>Assigned</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip" data-state="done">
          601A
        </span>
        <span>Done</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="chip" data-state="selected">
          601A
        </span>
        <span>In print batch</span>
      </span>
      <span className="text-ink-400 ml-auto">
        Click any chip to assign, mark done, or add to print batch.
      </span>
    </div>
  );
}
