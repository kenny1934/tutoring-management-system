"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Table2 } from "lucide-react";
import type { Student } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import {
  ChecktableGrid,
  type GridStatusFilter,
  type GridSectionFilter,
} from "@/components/checktable/ChecktableGrid";
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
  const { sessionLabel: formatSessionLabel } = usePrimaryStore();
  const editor = useChecktableEditor(student.id, focusItemId);
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

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [close]);

  if (!editor.table) return null;
  const { table } = editor;

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
              value={editor.checktableId}
              onChange={(e) => editor.setChecktableId(e.target.value)}
              className="rounded-md border border-mc-line px-2 py-1 text-xs bg-white max-w-[200px]"
              aria-label="Switch checktable"
            >
              {editor.bookOptions.map((c) => (
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
        </div>

        {editor.activeItem && (
          <AssignDialog
            item={editor.activeItem}
            student={student}
            basePath={table.basePath}
            existingAssignment={editor.existingAssignmentFor(editor.activeItem)}
            upcomingSessions={editor.upcomingSessions}
            openAssignmentCount={editor.openAssignmentCount}
            formatSessionLabel={formatSessionLabel}
            onClose={() => editor.setActiveItem(null)}
            onAssign={(input) => editor.handleAssign(editor.activeItem!, input)}
            onMarkDone={() => editor.handleMarkDone(editor.activeItem!)}
            onUnassign={() => editor.handleUnassign(editor.activeItem!)}
            onAddToPrintBatch={() => editor.togglePrintBatch(editor.activeItem!.id)}
            isInPrintBatch={editor.selectedIds.has(editor.activeItem.id)}
          />
        )}
      </aside>
    </>
  );
}
