"use client";

import { ChevronDown } from "lucide-react";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";
import { ItemChip } from "./ItemChip";
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
  onItemClick: (item: ChecktableItem) => void;
};

const EMPTY_STATUS: Record<string, AssignmentStatus | null> = {};
const EMPTY_SELECTION = new Set<string>();
const EMPTY_COLLAPSED = new Set<string>();

function itemMatchesStatus(
  item: ChecktableItem,
  statusByItemId: Record<string, AssignmentStatus | null>,
  filter: GridStatusFilter
): boolean {
  if (filter === "all") return true;
  const s = statusByItemId[item.id] ?? null;
  if (filter === "pending") return s === "assigned";
  if (filter === "untouched") return s === null;
  return true;
}

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
          onClick={() => onItemClick(item)}
        />
      ))}
    </div>
  );

  const visibleSections =
    sectionFilter === "supp"
      ? []
      : sectionFilter === "all"
        ? table.sections
        : table.sections.filter((s) => s.id === sectionFilter);

  const showSupplementary =
    table.supplementary.length > 0 &&
    (sectionFilter === "all" || sectionFilter === "supp");
  const visibleSupplementary = showSupplementary
    ? table.supplementary.filter((i) =>
        itemMatchesStatus(i, statusByItemId, statusFilter)
      )
    : [];

  const sectionBlocks = visibleSections
    .map((section) => {
      const chapters = section.chapters
        .map((ch) => {
          let done = 0;
          let assigned = 0;
          const sets = table.series
            .map((sr) => {
              const cell = ch.cells[sr.id];
              for (const it of cell?.items ?? []) {
                const s = statusByItemId[it.id] ?? null;
                if (s === "done") done += 1;
                else if (s === "assigned") assigned += 1;
              }
              const items = (cell?.items ?? []).filter((it) =>
                itemMatchesStatus(it, statusByItemId, statusFilter)
              );
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
          <div className="text-xs uppercase tracking-wide text-ink-500 font-medium px-1">
            {section.label}
          </div>
          {chapters.map(({ chapter: ch, sets, done, assigned }) => {
            const isCollapsed = collapsed.has(ch.id);
            return (
              <div key={ch.id} className="surface">
                <button
                  type="button"
                  onClick={() => onToggleChapter?.(ch.id)}
                  disabled={!onToggleChapter}
                  aria-expanded={!isCollapsed}
                  style={{ top: stickyTop }}
                  className="sticky z-10 flex w-full items-center gap-2 rounded-t-[9px] border-b border-ink-100 bg-ink-50 px-4 py-2 text-left last:rounded-b-[9px] last:border-b-0 disabled:cursor-default enabled:hover:bg-ink-100/70"
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
                {!isCollapsed && (
                  <div className="divide-y divide-ink-100">
                    {sets.map(({ series, cell, items }) => (
                      <div
                        key={series.id}
                        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
                      >
                        <div className="flex items-center gap-2 sm:w-32 sm:shrink-0">
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
