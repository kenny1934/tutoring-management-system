"use client";

import { useParams, useSearchParams } from "next/navigation";
import { BookOpen } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import { ChecktableGrid } from "@/components/checktable/ChecktableGrid";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { Legend } from "@/components/checktable/Legend";
import { useState } from "react";
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
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-500">Switch book</span>
          <select
            value={editor.checktableId}
            onChange={(e) => editor.setChecktableId(e.target.value)}
            className="rounded-md border border-ink-200 px-2 py-1 text-xs bg-white"
            aria-label="Switch checktable"
          >
            {editor.checktables.map((c) => (
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
        statusByItemId={editor.statusByItemId}
        status={gridStatus}
        section={gridSection}
        onStatusChange={setGridStatus}
        onSectionChange={setGridSection}
      />

      <ChecktableGrid
        table={table}
        statusByItemId={editor.statusByItemId}
        noteByItemId={editor.noteByItemId}
        selectedItemIds={editor.selectedIds}
        statusFilter={gridStatus}
        sectionFilter={gridSection}
        onItemClick={editor.setActiveItem}
      />

      <PrintTray
        items={editor.printBatchItems}
        student={student}
        onRemove={(pid) => removeFromPrintBatch(student.id, pid)}
        onClear={() => clearPrintBatch(student.id)}
        onPrint={() => {
          alert(
            `Demo only.\n\nWould print ${editor.printBatchItems.length} PDFs from:\n${table.basePath}`
          );
          clearPrintBatch(student.id);
        }}
      />

      {editor.activeItem && (
        <AssignDialog
          item={editor.activeItem}
          student={student}
          basePath={table.basePath}
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
    </div>
  );
}
