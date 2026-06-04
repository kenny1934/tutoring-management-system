"use client";

import { useParams, useSearchParams } from "next/navigation";
import { BookOpen, Printer, LayoutGrid, ListTree } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import { ChecktableGrid } from "@/components/checktable/ChecktableGrid";
import { ChecktableSyllabus } from "@/components/checktable/ChecktableSyllabus";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { Legend } from "@/components/checktable/Legend";
import { objectiveForItemCode } from "@/lib/mock-data/courseware-objectives";
import { useEffect, useRef, useState } from "react";
import type {
  GridSectionFilter,
  GridStatusFilter,
} from "@/components/checktable/ChecktableGrid";

export function StudentChecktablesTab() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const focusItemId = searchParams.get("focus");
  const { students, sessionLabel, removeFromPrintBatch, clearPrintBatch } =
    usePrimaryStore();

  const student = students.find((s) => s.id === id);
  const editor = useChecktableEditor(id, focusItemId);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");
  const [view, setView] = useState<"grid" | "syllabus">("syllabus");
  const [printToast, setPrintToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // Section ids are book-specific, so a selection carried over from another
  // book would filter the new one to nothing (and its toggle may be hidden).
  // Reset to "all" whenever the active book changes.
  useEffect(() => {
    setGridSection("all");
  }, [editor.checktableId]);

  if (!student || !editor.table) return null;
  const { table } = editor;

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
        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label="View"
            className="inline-flex shrink-0 rounded-md border border-ink-200 bg-white p-0.5 text-xs"
          >
            {(
              [
                { id: "syllabus", label: "Syllabus", Icon: ListTree },
                { id: "grid", label: "Grid", Icon: LayoutGrid },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`flex items-center gap-1.5 rounded px-2 py-0.5 font-medium transition-colors ${
                  view === id
                    ? "bg-ink-800 text-white"
                    : "text-ink-600 hover:bg-ink-100"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-ink-500">Switch book</span>
            <select
              value={editor.checktableId}
              onChange={(e) => editor.setChecktableId(e.target.value)}
              className="rounded-md border border-ink-200 px-2 py-1 text-xs bg-white"
              aria-label="Switch checktable"
            >
              {editor.bookOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.textbook} · {c.grade} · {c.version}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Legend />

      <GridFilterBar
        table={table}
        statusByItemId={editor.statusByItemId}
        status={gridStatus}
        section={gridSection}
        onStatusChange={setGridStatus}
        onSectionChange={setGridSection}
      />

      {view === "grid" ? (
        <ChecktableGrid
          table={table}
          statusByItemId={editor.statusByItemId}
          kindByItemId={editor.kindByItemId}
          noteByItemId={editor.noteByItemId}
          selectedItemIds={editor.selectedIds}
          statusFilter={gridStatus}
          sectionFilter={gridSection}
          onItemClick={editor.setActiveItem}
        />
      ) : (
        <ChecktableSyllabus
          table={table}
          statusByItemId={editor.statusByItemId}
          kindByItemId={editor.kindByItemId}
          noteByItemId={editor.noteByItemId}
          selectedItemIds={editor.selectedIds}
          statusFilter={gridStatus}
          sectionFilter={gridSection}
          onItemClick={editor.setActiveItem}
        />
      )}

      <PrintTray
        items={editor.printBatchItems}
        student={student}
        onRemove={(pid) => removeFromPrintBatch(student.id, pid)}
        onClear={() => clearPrintBatch(student.id)}
        onPrint={() => {
          const count = editor.printBatchItems.length;
          setPrintToast(
            `Would print ${count} ${count === 1 ? "PDF" : "PDFs"} (demo)`
          );
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setPrintToast(null), 3000);
          clearPrintBatch(student.id);
        }}
      />

      {editor.activeItem && (
        <AssignDialog
          item={editor.activeItem}
          student={student}
          basePath={table.basePath}
          objective={objectiveForItemCode(editor.activeItem.code)}
          existingAssignment={editor.existingAssignmentFor(editor.activeItem)}
          upcomingSessions={editor.upcomingSessions}
          openAssignmentCount={editor.openAssignmentCount}
          formatSessionLabel={sessionLabel}
          onClose={() => editor.setActiveItem(null)}
          onAssign={(input) => editor.handleAssign(editor.activeItem!, input)}
          onMarkDone={() => editor.handleMarkDone(editor.activeItem!)}
          onUnassign={() => editor.handleUnassign(editor.activeItem!)}
          onAddToPrintBatch={() => editor.togglePrintBatch(editor.activeItem!.id)}
          isInPrintBatch={editor.selectedIds.has(editor.activeItem.id)}
        />
      )}

      {printToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 surface bg-ink-900 text-white px-4 py-2 text-sm flex items-center gap-2 shadow-lg"
        >
          <Printer className="h-4 w-4 text-mc-yellow-400" />
          {printToast}
        </div>
      )}
    </div>
  );
}
