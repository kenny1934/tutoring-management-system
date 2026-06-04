"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, ListChecks, Printer } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import { ChecktableGrid } from "@/components/checktable/ChecktableGrid";
import { ChecktableSyllabus } from "@/components/checktable/ChecktableSyllabus";
import { ChecktableViewControls } from "@/components/checktable/ChecktableViewControls";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { LegendPopover } from "@/components/checktable/LegendPopover";
import { AddShownButton } from "@/components/checktable/AddShownButton";
import { SelectModeBanner } from "@/components/checktable/SelectModeBanner";
import { PrintBatchToast } from "@/components/checktable/PrintBatchToast";
import { usePrintBatchUI } from "@/components/checktable/usePrintBatchUI";
import { useStuckBottom } from "@/components/checktable/useStickyOffset";
import { useChapterCollapse } from "@/components/checktable/useChapterCollapse";
import { objectiveForItemCode } from "@/lib/mock-data/courseware-objectives";
import type {
  GridSectionFilter,
  GridStatusFilter,
} from "@/components/checktable/ChecktableGrid";

export function StudentChecktablesTab() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const focusItemId = searchParams.get("focus");
  const { students, sessionLabel, removeFromPrintBatch } = usePrimaryStore();

  const student = students.find((s) => s.id === id);
  const editor = useChecktableEditor(id, focusItemId);
  const [gridStatus, setGridStatus] = useState<GridStatusFilter>("all");
  const [gridSection, setGridSection] = useState<GridSectionFilter>("all");
  const [view, setView] = useState<"grid" | "syllabus">("syllabus");
  const batch = usePrintBatchUI(editor, gridStatus, gridSection);

  const collapse = useChapterCollapse(editor.table);
  // The controls strip pins under the student header; content headers (grid
  // thead, syllabus chapter headers) park just below the strip.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const contentTop = useStuckBottom(toolbarRef);

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
      {/* Single sticky controls strip: the book switcher doubles as the title
          and the chip legend is on-demand, so this one band replaces the old
          title + legend + two-row toolbar stack. */}
      <div
        ref={toolbarRef}
        style={{ top: "var(--ct-stick, 0px)" }}
        className="sticky z-20 -mx-4 space-y-2 bg-ink-50/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <ChecktableViewControls
            view={view}
            onViewChange={setView}
            collapse={collapse}
            size="sm"
          />
          <button
            type="button"
            onClick={() => batch.setSelectMode((v) => !v)}
            aria-pressed={batch.selectMode}
            title="Tap worksheets to add or remove them from the print batch without opening each one"
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
              batch.selectMode
                ? "bg-mc-red-600 text-white hover:bg-mc-red-700"
                : "border border-ink-200 text-ink-700 hover:bg-ink-100"
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            {batch.selectMode ? "Selecting" : "Select"}
          </button>

          <div className="ml-auto flex items-center gap-2 text-xs">
            {editor.otherBookBatchCount > 0 && (
              <span
                title="Worksheets queued under this student's other books. Switch to that book to print them."
                className="inline-flex items-center gap-1 rounded-md border border-mc-red-200 bg-mc-red-50 px-2 py-1 font-medium text-mc-red-700"
              >
                <Printer className="h-3 w-3" />
                {editor.otherBookBatchCount} queued in other books
              </span>
            )}
            <LegendPopover />
            <label className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white pl-2">
              <BookOpen
                className="h-3.5 w-3.5 shrink-0 text-ink-500"
                aria-hidden
              />
              <select
                value={editor.checktableId}
                onChange={(e) => editor.setChecktableId(e.target.value)}
                className="max-w-[220px] bg-transparent py-1 pr-2 text-xs font-medium text-ink-800 focus:outline-none"
                aria-label="Switch book"
              >
                {editor.bookOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.textbook} · {c.grade} · {c.version}
                  </option>
                ))}
              </select>
            </label>
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
          <AddShownButton
            shownCount={batch.shownItemIds.length}
            pendingCount={batch.shownPending}
            onAdd={() => editor.addItemsToBatch(batch.shownItemIds)}
          />
        </div>

        {batch.selectMode && (
          <SelectModeBanner onDone={() => batch.setSelectMode(false)} />
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
          onItemClick={batch.handleChipClick}
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
          onItemClick={batch.handleChipClick}
        />
      )}

      <PrintTray
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

      <PrintBatchToast toast={batch.toast} onDismiss={batch.dismissToast} />
    </div>
  );
}
