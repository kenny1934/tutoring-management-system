"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, ListChecks, Printer, Search, X } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { useChecktableEditor } from "@/components/checktable/useChecktableEditor";
import { ChecktableSyllabus } from "@/components/checktable/ChecktableSyllabus";
import { CollapseAllControl } from "@/components/checktable/CollapseAllControl";
import { AssignDialog } from "@/components/checktable/AssignDialog";
import { PrintTray } from "@/components/checktable/PrintTray";
import { GridFilterBar } from "@/components/checktable/GridFilterBar";
import { SectionTabs } from "@/components/checktable/SectionTabs";
import { LegendPopover } from "@/components/checktable/LegendPopover";
import { AddShownButton } from "@/components/checktable/AddShownButton";
import { SelectModeBanner } from "@/components/checktable/SelectModeBanner";
import { PrintBatchToast } from "@/components/checktable/PrintBatchToast";
import { usePrintBatchUI } from "@/components/checktable/usePrintBatchUI";
import { useStuckBottom } from "@/components/checktable/useStickyOffset";
import { useChapterCollapse } from "@/components/checktable/useChapterCollapse";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { filterTableBySearch } from "@/lib/checktable-search";
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
  const [search, setSearch] = useState("");

  // Debounce so each keystroke doesn't deep-rebuild the filtered tree on the
  // largest (400+ worksheet) books. The filtered table feeds both the rendered
  // list and the "Add N shown" set, so queueing respects the search too.
  const debouncedSearch = useDebouncedValue(search, 150);
  const filteredTable = useMemo(
    () =>
      editor.table ? filterTableBySearch(editor.table, debouncedSearch) : undefined,
    [editor.table, debouncedSearch]
  );
  const batch = usePrintBatchUI(editor, gridStatus, gridSection, filteredTable);

  const collapse = useChapterCollapse(editor.table);
  // On a wide monitor the capped list leaves the right two-thirds empty, so the
  // assign/preview panel docks there as a master-detail rail instead of popping
  // a centered modal. Below this width it stays a modal (matchMedia, not a CSS
  // breakpoint, so we render a single dialog instance rather than two).
  const wide = useMediaQuery("(min-width: 1280px)");
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
  const activeItem = editor.activeItem;

  // Built once and rendered either docked (wide) or as a modal (narrow), so the
  // long prop list lives in a single place.
  const assignDialog = (variant: "modal" | "docked") =>
    activeItem ? (
      <AssignDialog
        variant={variant}
        item={activeItem}
        student={student}
        basePath={table.basePath}
        objective={objectiveForItemCode(activeItem.code)}
        existingAssignment={editor.existingAssignmentFor(activeItem)}
        upcomingSessions={editor.upcomingSessions}
        openAssignmentCount={editor.openAssignmentCount}
        formatSessionLabel={sessionLabel}
        onClose={() => editor.setActiveItem(null)}
        onAssign={(input) => editor.handleAssign(activeItem, input)}
        onMarkDone={() => editor.handleMarkDone(activeItem)}
        onUnassign={() => editor.handleUnassign(activeItem)}
        onAddToPrintBatch={(pages) =>
          editor.togglePrintBatch(activeItem.id, pages)
        }
        isInPrintBatch={editor.selectedIds.has(activeItem.id)}
      />
    ) : null;

  // Floating (fixed bottom-right) on narrow screens; docked into the bottom of
  // the detail rail on wide ones, so the print queue sits under the panel's
  // "Add to print batch" button instead of overlapping it.
  const printTray = (variant: "floating" | "docked") => (
    <PrintTray
      variant={variant}
      entries={editor.printBatchEntries}
      student={student}
      onRemove={(pid) => removeFromPrintBatch(editor.printBatchKey, pid)}
      onSetPageRange={editor.setPageRange}
      onClear={batch.onClearBatch}
      onPrint={batch.onPrintBatch}
    />
  );

  return (
    // Wide screens split into a capped worksheet list (left) and a docked
    // assign/preview rail (right); below xl it's a single capped column with a
    // modal. Capping the list keeps rows at a comfortable reading width so the
    // chips don't strand ~460px from their objective text.
    <div className="xl:flex xl:items-start xl:gap-6">
      <div className="space-y-3 max-w-3xl xl:flex-[2] xl:min-w-0">
      {/* Single sticky controls strip: the book switcher doubles as the title
          and the chip legend is on-demand, so this one band replaces the old
          title + legend + two-row toolbar stack. */}
      <div
        ref={toolbarRef}
        style={{ top: "var(--ct-stick, 0px)" }}
        className="sticky z-20 space-y-2 bg-ink-50 px-4 py-2"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search leads the toolbar as the primary find control. */}
          <div className="relative min-w-[180px] flex-1">
            <Search
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, chapter, or objective"
              aria-label="Search worksheets by code, chapter, or objective"
              className="w-full rounded-md border border-ink-200 bg-white py-1 pl-8 pr-7 text-xs focus:border-ink-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-400 hover:text-ink-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quiet utility cluster (collapse-all, legend) + the book switcher,
              which doubles as the title. */}
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
            <CollapseAllControl collapse={collapse} size="sm" iconOnly />
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
            onStatusChange={setGridStatus}
          />
          {/* Batch-building cluster: enter tap-to-queue mode, or queue every
              worksheet matching the current filter, side by side. */}
          <div className="flex items-center gap-2">
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
            <AddShownButton
              shownCount={batch.shownItemIds.length}
              pendingCount={batch.shownPending}
              onAdd={() => editor.addItemsToBatch(batch.shownItemIds)}
            />
          </div>
        </div>

        {batch.selectMode && (
          <SelectModeBanner onDone={() => batch.setSelectMode(false)} />
        )}
      </div>

      {/* Strand navigation above the list, for books that split into multiple
          sections (renders nothing for single-section books). */}
      <SectionTabs
        table={table}
        value={gridSection}
        onChange={setGridSection}
        className="px-4"
      />

      <ChecktableSyllabus
        table={filteredTable ?? table}
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

      </div>

      {/* Wide-screen detail rail: a single sticky card holding the docked
          assign/preview panel (or a placeholder) above, and the print batch
          docked at the bottom when it has items — so the panel's "Add to print
          batch" feeds a queue right beneath it instead of a floating tray
          overlapping the footer. The aside is the sticky element (self-start)
          so it pins below the student header through the whole list scroll; it
          flex-grows to absorb leftover width (capped), and `@container` lets the
          panel reflow to 2 columns when wide. Full viewport height while a
          worksheet is open so the preview can fill; natural height otherwise. */}
      {wide && (
        <aside
          aria-label="Worksheet detail"
          style={{ top: "calc(var(--ct-stick, 0px) + 1rem)" }}
          className={`hidden xl:flex xl:flex-col xl:flex-1 xl:min-w-[380px] xl:max-w-[880px] xl:self-start xl:sticky @container surface overflow-hidden bg-white ${
            activeItem
              ? "xl:h-[calc(100vh_-_var(--ct-stick-live,var(--ct-stick,0px))_-_2rem)]"
              : "xl:max-h-[calc(100vh_-_var(--ct-stick-live,var(--ct-stick,0px))_-_2rem)]"
          }`}
        >
          <div className="min-h-0 flex-1">
            {activeItem ? (
              assignDialog("docked")
            ) : (
              <div className="grid h-full place-items-center px-6 py-16 text-center">
                <div>
                  <FileText className="mx-auto mb-3 h-10 w-10 text-ink-300" />
                  <div className="text-sm font-medium text-ink-700">
                    No worksheet selected
                  </div>
                  <p className="mx-auto mt-1 max-w-[230px] text-xs text-ink-500">
                    Click a worksheet to preview it and assign, mark it done, or
                    queue it for printing right here.
                  </p>
                </div>
              </div>
            )}
          </div>
          {printTray("docked")}
        </aside>
      )}

      {/* Narrow screens keep the centered modal + floating tray. */}
      {!wide && assignDialog("modal")}
      {!wide && printTray("floating")}

      <PrintBatchToast toast={batch.toast} onDismiss={batch.dismissToast} />
    </div>
  );
}
