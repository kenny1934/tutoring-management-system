"use client";

import { useMemo } from "react";
import { ChevronDown, Printer } from "lucide-react";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";
import { ItemChip } from "./ItemChip";
import { itemMatchesStatus } from "./ChecktableGrid";
import type { GridSectionFilter, GridStatusFilter } from "./ChecktableGrid";

type Props = {
  table: Checktable;
  statusByItemId?: Record<string, AssignmentStatus | null>;
  kindByItemId?: Record<string, ExerciseKind | undefined>;
  noteByItemId?: Record<string, string | undefined>;
  selectedItemIds?: Set<string>;
  statusFilter?: GridStatusFilter;
  sectionFilter?: GridSectionFilter;
  /** Show per-chapter assigned/done tallies on the chapter header. Off for the
   *  courseware library (no per-student progress); on for a student's table. */
  showProgress?: boolean;
  /** Chapter ids currently collapsed (header only, rows hidden). */
  collapsed?: Set<string>;
  onToggleChapter?: (chapterId: string) => void;
  /** Viewport offset (px) where a chapter header parks when stuck, so it sits
   *  below the sticky chrome above the list rather than under it. */
  stickyTop?: number;
  /** Queue every (currently visible) worksheet in a chapter for printing in one
   *  click. Without it, the per-chapter batch button is hidden. */
  onAddItemsToBatch?: (itemIds: string[]) => void;
  onItemClick: (item: ChecktableItem) => void;
};

const EMPTY_STATUS: Record<string, AssignmentStatus | null> = {};
const EMPTY_SELECTION = new Set<string>();
const EMPTY_COLLAPSED = new Set<string>();

/** Objective-led reading view of a checktable: each chapter is a card, with one
 *  row per set (series that has worksheets), showing the series badge, the
 *  learning objective, and that set's worksheet chips. Complements the matrix
 *  grid (better for scanning status across variants) and honours the same
 *  status/section filters so the two views stay in sync. Chapter headers are
 *  sticky and collapsible so a long book stays navigable. */
export function ChecktableSyllabus({
  table,
  statusByItemId = EMPTY_STATUS,
  kindByItemId,
  noteByItemId,
  selectedItemIds = EMPTY_SELECTION,
  statusFilter = "all",
  sectionFilter = "all",
  showProgress = false,
  collapsed = EMPTY_COLLAPSED,
  onToggleChapter,
  stickyTop = 0,
  onAddItemsToBatch,
  onItemClick,
}: Props) {
  const chips = (items: ChecktableItem[], objective?: string) => (
    <div className="flex flex-wrap gap-1 sm:justify-end">
      {items.map((item) => (
        <ItemChip
          key={item.id}
          item={item}
          status={statusByItemId[item.id] ?? null}
          kind={kindByItemId?.[item.id]}
          tutorNote={noteByItemId?.[item.id]}
          objective={objective}
          isSelected={selectedItemIds.has(item.id)}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  );

  const showSupplementary =
    table.supplementary.length > 0 &&
    (sectionFilter === "all" || sectionFilter === "supp");
  const visibleSupplementary = showSupplementary
    ? table.supplementary.filter((i) =>
        itemMatchesStatus(i, statusByItemId, statusFilter)
      )
    : [];

  // Derived purely from the table + status/filters, so memoise it: collapse and
  // sticky-offset state changes re-render this component without changing which
  // sets match or the per-chapter tallies. A single pass over each cell's items
  // both counts done/assigned and collects the filtered set.
  const sectionBlocks = useMemo(() => {
    const visibleSections =
      sectionFilter === "supp"
        ? []
        : sectionFilter === "all"
          ? table.sections
          : table.sections.filter((s) => s.id === sectionFilter);
    return visibleSections
        .map((section) => {
          const chapters = section.chapters
            .map((ch) => {
              let done = 0;
              let assigned = 0;
              const sets = table.series
                .map((sr) => {
                  const cell = ch.cells[sr.id];
                  const items: ChecktableItem[] = [];
                  for (const it of cell?.items ?? []) {
                    const s = statusByItemId[it.id] ?? null;
                    if (s === "done") done += 1;
                    else if (s === "assigned") assigned += 1;
                    if (itemMatchesStatus(it, statusByItemId, statusFilter))
                      items.push(it);
                  }
                  return { series: sr, cell, items };
                })
                .filter((s) => s.items.length > 0);
              return sets.length > 0
                ? { chapter: ch, sets, done, assigned }
                : null;
            })
            .filter((c): c is NonNullable<typeof c> => c !== null);
          return chapters.length > 0 ? { section, chapters } : null;
        })
        .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [
    table.sections,
    table.series,
    sectionFilter,
    statusByItemId,
    statusFilter,
  ]);

  if (sectionBlocks.length === 0 && visibleSupplementary.length === 0) {
    return (
      <div className="surface px-4 py-10 text-center text-sm text-ink-500">
        No items match the current filter.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sectionBlocks.map(({ section, chapters }) => (
        <div key={section.id} className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-ink-500 font-medium px-4">
            {section.label}
          </div>
          {chapters.map(({ chapter: ch, sets, done, assigned }) => {
            const isCollapsed = collapsed.has(ch.id);
            // Visible worksheets in this chapter, and how many aren't queued yet.
            // Drives the one-click "add chapter to batch" affordance.
            const chapterItemIds = sets.flatMap((s) =>
              s.items.map((i) => i.id)
            );
            const pendingToBatch = chapterItemIds.filter(
              (id) => !selectedItemIds.has(id)
            ).length;
            return (
              <div key={ch.id} className="surface">
                {/* Sticky wrapper holds two sibling buttons: nesting the batch
                 *  button inside the collapse <button> would be invalid HTML. */}
                <div
                  style={{ top: stickyTop }}
                  className="sticky z-10 flex items-stretch overflow-hidden rounded-t-[9px] border-b border-ink-100 bg-ink-50 last:rounded-b-[9px] last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => onToggleChapter?.(ch.id)}
                    disabled={!onToggleChapter}
                    aria-expanded={!isCollapsed}
                    className="flex flex-1 items-center gap-2 px-4 py-2 text-left disabled:cursor-default enabled:hover:bg-ink-100/70"
                  >
                    <ChevronDown
                      aria-hidden
                      className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${
                        isCollapsed ? "-rotate-90" : ""
                      } ${onToggleChapter ? "" : "invisible"}`}
                    />
                    <span className="text-xs tabular-nums text-ink-400">
                      Ch {ch.number}
                    </span>
                    <span className="font-medium text-ink-800">{ch.title}</span>
                    {showProgress && (assigned > 0 || done > 0) && (
                      <span className="ml-auto flex items-center gap-1.5 text-xs">
                        {assigned > 0 && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                            {assigned} pending
                          </span>
                        )}
                        {done > 0 && (
                          <span className="rounded bg-good/15 px-1.5 py-0.5 font-medium text-good">
                            {done} done
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                  {onAddItemsToBatch && chapterItemIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onAddItemsToBatch(chapterItemIds)}
                      disabled={pendingToBatch === 0}
                      title={
                        pendingToBatch === 0
                          ? "Every worksheet in this chapter is already queued"
                          : `Queue ${pendingToBatch} worksheet${
                              pendingToBatch === 1 ? "" : "s"
                            } in this chapter for printing`
                      }
                      className="flex shrink-0 items-center gap-1 border-l border-ink-100 px-3 text-xs font-medium text-ink-600 hover:bg-ink-100/70 disabled:cursor-default disabled:text-ink-300 disabled:hover:bg-transparent"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      {pendingToBatch === 0
                        ? "Queued"
                        : `Add ${pendingToBatch}`}
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="divide-y divide-ink-100">
                    {sets.map(({ series, cell, items }) => (
                      <div
                        key={series.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
                      >
                        <div className="flex items-center gap-2 sm:w-24 sm:shrink-0">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-ink-800 text-xs font-semibold text-white">
                            {series.label}
                          </span>
                          {series.hint && (
                            <span className="text-xs text-ink-500">
                              {series.hint}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-sm">
                          {cell?.objective ? (
                            <span className="text-ink-700">
                              {cell.objective}
                            </span>
                          ) : (
                            <span className="text-ink-400 italic">
                              Objective not set yet
                            </span>
                          )}
                        </div>
                        <div className="sm:w-40 sm:shrink-0">
                          {chips(items, cell?.objective)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {visibleSupplementary.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-xs uppercase tracking-wide text-ink-500 font-medium">
            補充教材 · Supplementary
          </div>
          <div className="px-4 py-3">{chips(visibleSupplementary)}</div>
        </div>
      )}
    </div>
  );
}
