"use client";

import { useParams, useSearchParams } from "next/navigation";
import { BookOpen, ListChecks, Plus, Printer } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import {
  ChecktableGrid,
  itemMatchesStatus,
} from "@/components/checktable/ChecktableGrid";
import { ChecktableSyllabus } from "@/components/checktable/ChecktableSyllabus";
import { ChecktableViewControls } from "@/components/checktable/ChecktableViewControls";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { Legend } from "@/components/checktable/Legend";
import { useStuckBottom } from "@/components/checktable/useStickyOffset";
import { useChapterCollapse } from "@/components/checktable/useChapterCollapse";
import { objectiveForItemCode } from "@/lib/mock-data/courseware-objectives";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChecktableItem } from "@/lib/types";
import type {
  GridSectionFilter,
  GridStatusFilter,
} from "@/components/checktable/ChecktableGrid";

export function StudentChecktablesTab() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const focusItemId = searchParams.get("focus");
  const {
    students,
    sessionLabel,
    togglePrintBatch,
    removeFromPrintBatch,
    clearPrintBatch,
  } = usePrimaryStore();

  const student = students.find((s) => s.id === id);
  const editor = useChecktableEditor(id, focusItemId);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");
  const [view, setView] = useState<"grid" | "syllabus">("syllabus");
  const [selectMode, setSelectMode] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    onUndo?: () => void;
  } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // In select mode a chip click toggles batch membership directly; otherwise it
  // opens the assign dialog. A ref keeps the handler identity stable so the
  // memoised chips in a long book don't all re-render on each mode flip.
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

  // Every item currently matching the status + section filters — i.e. exactly
  // what the grid/syllabus is showing. Drives the "Add all shown" bulk action,
  // so it honours whatever the tutor has filtered to (e.g. just "Untouched").
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

  // Show a transient toast; an optional Undo lets the user reverse a clear or a
  // (demo) print before the queue is really gone.
  const showToast = (message: string, onUndo?: () => void) => {
    setToast({ message, onUndo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const collapse = useChapterCollapse(editor.table);
  // The controls strip pins under the student header; content headers (grid
  // thead, syllabus chapter headers) park just below the strip.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const contentTop = useStuckBottom(toolbarRef);

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
      <div className="flex items-center gap-2 text-sm text-ink-700">
        <BookOpen className="h-4 w-4 text-ink-500" />
        <span className="font-medium">{table.textbook}</span>
        <span className="text-ink-500">
          {table.grade} · {table.version}
        </span>
      </div>

      <Legend />

      {/* Controls stay reachable while scrolling a long book: view toggle,
          collapse-all, status/section filters, and the book switcher pin just
          below the student header. */}
      <div
        ref={toolbarRef}
        style={{ top: "var(--ct-stick, 0px)" }}
        className="sticky z-20 -mx-4 space-y-2 bg-ink-50/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <ChecktableViewControls
              view={view}
              onViewChange={setView}
              collapse={collapse}
              size="sm"
            />
            <button
              type="button"
              onClick={() => setSelectMode((v) => !v)}
              aria-pressed={selectMode}
              title="Tap worksheets to add or remove them from the print batch without opening each one"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                selectMode
                  ? "bg-mc-red-600 text-white hover:bg-mc-red-700"
                  : "border border-ink-200 text-ink-700 hover:bg-ink-100"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {selectMode ? "Selecting" : "Select"}
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {editor.otherBookBatchCount > 0 && (
              <span
                title="Worksheets queued under this student's other books. Switch to that book to print them."
                className="inline-flex items-center gap-1 rounded-md border border-mc-red-200 bg-mc-red-50 px-2 py-1 font-medium text-mc-red-700"
              >
                <Printer className="h-3 w-3" />
                {editor.otherBookBatchCount} queued in other books
              </span>
            )}
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

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <GridFilterBar
            table={table}
            statusByItemId={editor.statusByItemId}
            status={gridStatus}
            section={gridSection}
            onStatusChange={setGridStatus}
            onSectionChange={setGridSection}
          />
          {shownItemIds.length > 0 &&
            (() => {
              const pending = shownItemIds.filter(
                (i) => !editor.selectedIds.has(i)
              ).length;
              return (
                <button
                  type="button"
                  onClick={() => editor.addItemsToBatch(shownItemIds)}
                  disabled={pending === 0}
                  title={
                    pending === 0
                      ? "Everything shown is already queued"
                      : `Queue all ${pending} shown worksheet${
                          pending === 1 ? "" : "s"
                        } for printing`
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:cursor-default disabled:text-ink-300 disabled:hover:bg-white"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {pending === 0 ? "All shown queued" : `Add ${pending} shown`}
                </button>
              );
            })()}
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
      </div>

      {view === "grid" ? (
        <ChecktableGrid
          table={table}
          statusByItemId={editor.statusByItemId}
          kindByItemId={editor.kindByItemId}
          noteByItemId={editor.noteByItemId}
          selectedItemIds={editor.selectedIds}
          statusFilter={gridStatus}
          sectionFilter={gridSection}
          stickyTop={contentTop}
          onItemClick={handleChipClick}
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
          showProgress
          collapsed={collapse.collapsed}
          onToggleChapter={collapse.toggle}
          stickyTop={contentTop}
          onAddItemsToBatch={editor.addItemsToBatch}
          onItemClick={handleChipClick}
        />
      )}

      <PrintTray
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
          objective={objectiveForItemCode(editor.activeItem.code)}
          existingAssignment={editor.existingAssignmentFor(editor.activeItem)}
          upcomingSessions={editor.upcomingSessions}
          openAssignmentCount={editor.openAssignmentCount}
          formatSessionLabel={sessionLabel}
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
    </div>
  );
}
