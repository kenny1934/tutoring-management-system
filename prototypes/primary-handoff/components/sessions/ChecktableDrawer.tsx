"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListChecks, Plus, Printer, X, Table2 } from "lucide-react";
import type { ChecktableItem, Student } from "@/lib/types";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import {
  ChecktableGrid,
  itemMatchesStatus,
  type GridStatusFilter,
  type GridSectionFilter,
} from "@/components/checktable/ChecktableGrid";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { Legend } from "@/components/checktable/Legend";

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
    togglePrintBatch,
    removeFromPrintBatch,
    clearPrintBatch,
  } = usePrimaryStore();
  const editor = useChecktableEditor(student.id, focusItemId);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    onUndo?: () => void;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, onUndo?: () => void) => {
    setToast({ message, onUndo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // Select mode: tap a chip to queue/unqueue it for printing instead of opening
  // the assign dialog. Ref keeps the handler stable so the memoised grid chips
  // don't all re-render on a mode flip.
  const selectModeRef = useRef(selectMode);
  useEffect(() => {
    selectModeRef.current = selectMode;
  }, [selectMode]);
  const printBatchKey = editor.printBatchKey;
  const setActiveItem = editor.setActiveItem;
  const handleChipClick = useCallback(
    (item: ChecktableItem) => {
      if (selectModeRef.current) togglePrintBatch(printBatchKey, item.id);
      else setActiveItem(item);
    },
    [togglePrintBatch, printBatchKey, setActiveItem]
  );

  // Items matching the current filters — what the grid is showing.
  const shownItemIds = useMemo(() => {
    const t = editor.table;
    if (!t) return [];
    const ids: string[] = [];
    const sections =
      gridSection === "supp"
        ? []
        : gridSection === "all"
          ? t.sections
          : t.sections.filter((s) => s.id === gridSection);
    for (const section of sections)
      for (const ch of section.chapters)
        for (const sr of t.series)
          for (const it of ch.cells[sr.id]?.items ?? [])
            if (itemMatchesStatus(it, editor.statusByItemId, gridStatus))
              ids.push(it.id);
    if (gridSection === "all" || gridSection === "supp")
      for (const it of t.supplementary)
        if (itemMatchesStatus(it, editor.statusByItemId, gridStatus))
          ids.push(it.id);
    return ids;
  }, [editor.table, editor.statusByItemId, gridSection, gridStatus]);

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
  const shownPending = shownItemIds.filter(
    (i) => !editor.selectedIds.has(i)
  ).length;

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
              onClick={() => setSelectMode((v) => !v)}
              aria-pressed={selectMode}
              title="Tap worksheets to add or remove them from the print batch without opening each one"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                selectMode
                  ? "bg-mc-red-600 text-white hover:bg-mc-red-700"
                  : "border border-mc-line text-ink-700 hover:bg-ink-100"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {selectMode ? "Selecting" : "Select"}
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
          <Legend />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <GridFilterBar
              table={table}
              statusByItemId={editor.statusByItemId}
              status={gridStatus}
              section={gridSection}
              onStatusChange={setGridStatus}
              onSectionChange={setGridSection}
            />
            {shownItemIds.length > 0 && (
              <button
                type="button"
                onClick={() => editor.addItemsToBatch(shownItemIds)}
                disabled={shownPending === 0}
                title={
                  shownPending === 0
                    ? "Everything shown is already queued"
                    : `Queue all ${shownPending} shown worksheet${
                        shownPending === 1 ? "" : "s"
                      } for printing`
                }
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:cursor-default disabled:text-ink-300 disabled:hover:bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
                {shownPending === 0 ? "All shown queued" : `Add ${shownPending} shown`}
              </button>
            )}
          </div>
          {selectMode && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-mc-red-200 bg-mc-red-50 px-2.5 py-1.5 text-xs text-mc-red-700">
              <span>
                Select mode — tap worksheets to add or remove them from the print
                batch.
              </span>
              <button
                type="button"
                onClick={() => setSelectMode(false)}
                className="font-medium hover:underline shrink-0"
              >
                Done
              </button>
            </div>
          )}
          <ChecktableGrid
            table={table}
            statusByItemId={editor.statusByItemId}
            kindByItemId={editor.kindByItemId}
            noteByItemId={editor.noteByItemId}
            selectedItemIds={editor.selectedIds}
            statusFilter={gridStatus}
            sectionFilter={gridSection}
            onItemClick={handleChipClick}
          />
        </div>

        <PrintTray
          variant="docked"
          entries={editor.printBatchEntries}
          student={student}
          onRemove={(pid) => removeFromPrintBatch(editor.printBatchKey, pid)}
          onSetPageRange={editor.setPageRange}
          onClear={() => {
            const snapshot = editor.printBatchEntriesRaw;
            clearPrintBatch(editor.printBatchKey);
            showToast(`Cleared ${snapshot.length} from the batch`, () =>
              editor.addEntriesToBatch(snapshot)
            );
          }}
          onPrint={() => {
            const snapshot = editor.printBatchEntriesRaw;
            const count = snapshot.length;
            clearPrintBatch(editor.printBatchKey);
            showToast(
              `Would print ${count} ${count === 1 ? "PDF" : "PDFs"} (demo)`,
              () => editor.addEntriesToBatch(snapshot)
            );
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

        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-[10px] border border-ink-800 bg-ink-900 text-white px-4 py-2 text-sm flex items-center gap-2 shadow-lg"
          >
            <Printer className="h-4 w-4 text-mc-yellow-400" />
            {toast.message}
            {toast.onUndo && (
              <button
                onClick={() => {
                  toast.onUndo?.();
                  if (toastTimer.current) clearTimeout(toastTimer.current);
                  setToast(null);
                }}
                className="ml-1 font-medium text-mc-yellow-400 hover:underline"
              >
                Undo
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
