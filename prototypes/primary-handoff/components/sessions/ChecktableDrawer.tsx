"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Table2, ListChecks } from "lucide-react";
import type { Student } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import {
  ChecktableGrid,
  type GridStatusFilter,
  type GridSectionFilter,
} from "@/components/checktable/ChecktableGrid";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { LegendPopover } from "@/components/checktable/LegendPopover";
import { AddShownButton } from "@/components/checktable/AddShownButton";
import { SelectModeBanner } from "@/components/checktable/SelectModeBanner";
import { PrintBatchToast } from "@/components/checktable/PrintBatchToast";
import { usePrintBatchUI } from "@/components/checktable/usePrintBatchUI";

type Props = {
  student: Student;
  /** Optional item to scroll into focus on open, used by the per-row
   *  "Next" pill so the user lands on the suggested untouched item. */
  focusItemId?: string;
  onClose: () => void;
};

export function ChecktableDrawer({ student, focusItemId, onClose }: Props) {
  const {
    sessionLabel: formatSessionLabel,
    removeFromPrintBatch,
  } = usePrimaryStore();
  const editor = useChecktableEditor(student.id, focusItemId);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");
  const batch = usePrintBatchUI(editor, gridStatus, gridSection);

  // Two-phase mount/unmount so the slide-in and slide-out animations have
  // time to play. `visible` flips after first paint to trigger the
  // translate-x-to-0 transition; `close` flips it back then waits for the
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
            <button
              type="button"
              onClick={() => batch.setSelectMode((v) => !v)}
              aria-pressed={batch.selectMode}
              title="Tap worksheets to add or remove them from the print batch without opening each one"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                batch.selectMode
                  ? "bg-mc-red-600 text-white hover:bg-mc-red-700"
                  : "border border-mc-line text-ink-700 hover:bg-ink-100"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {batch.selectMode ? "Selecting" : "Select"}
            </button>
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <GridFilterBar
              table={table}
              statusByItemId={editor.statusByItemId}
              status={gridStatus}
              section={gridSection}
              onStatusChange={setGridStatus}
              onSectionChange={setGridSection}
            />
            <div className="flex items-center gap-2 shrink-0">
              <AddShownButton
                shownCount={batch.shownItemIds.length}
                pendingCount={batch.shownPending}
                onAdd={() => editor.addItemsToBatch(batch.shownItemIds)}
              />
              <LegendPopover />
            </div>
          </div>
          {batch.selectMode && (
            <SelectModeBanner onDone={() => batch.setSelectMode(false)} />
          )}
          <ChecktableGrid
            table={table}
            statusByItemId={editor.statusByItemId}
            kindByItemId={editor.kindByItemId}
            noteByItemId={editor.noteByItemId}
            selectedItemIds={editor.selectedIds}
            statusFilter={gridStatus}
            sectionFilter={gridSection}
            onItemClick={batch.handleChipClick}
          />
        </div>

        <PrintTray
          variant="docked"
          entries={editor.printBatchEntries}
          student={student}
          onRemove={(pid) => removeFromPrintBatch(editor.printBatchKey, pid)}
          onSetPageRange={editor.setPageRange}
          onClear={batch.onClearBatch}
          onPrint={batch.onPrintBatch}
        />

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
            onAddToPrintBatch={(pages) =>
              editor.togglePrintBatch(editor.activeItem!.id, pages)
            }
            isInPrintBatch={editor.selectedIds.has(editor.activeItem.id)}
          />
        )}

        <PrintBatchToast toast={batch.toast} onDismiss={batch.dismissToast} />
      </aside>
    </>
  );
}
