"use client";

import { memo, useMemo } from "react";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableChapter,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";
import { ItemChip } from "./ItemChip";
import { objectiveForItemCode } from "@/lib/mock-data/courseware-objectives";
import {
  journeyForTable,
  topicPrefixForChapter,
} from "@/lib/mock-data/ca-journey";

export type GridStatusFilter = "all" | "pending" | "untouched";
export type GridSectionFilter = "all" | "supp" | string;

type Props = {
  table: Checktable;
  statusByItemId: Record<string, AssignmentStatus | null>;
  kindByItemId?: Record<string, ExerciseKind | undefined>;
  noteByItemId?: Record<string, string | undefined>;
  selectedItemIds: Set<string>;
  statusFilter?: GridStatusFilter;
  sectionFilter?: GridSectionFilter;
  /** Viewport offset (px) of the sticky chrome above the grid (student header +
   *  controls strip). The grid scrolls inside a height-bounded box starting
   *  here so its header row can stay genuinely sticky — a plain `sticky top`
   *  can't, because the horizontal-scroll wrapper is itself a scroll container. */
  stickyTop?: number;
  onItemClick: (item: ChecktableItem) => void;
};

/** Shared status-filter predicate for both the grid and the syllabus view, so
 *  the two stay in lockstep when the filter set changes. */
export function itemMatchesStatus(
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

/** Ids of every item currently visible under the given status + section
 *  filters — i.e. exactly what the grid/syllabus is rendering. Drives the
 *  "Add all shown" bulk action so it honours the active filter. Shared so the
 *  student tab and the session drawer can't drift on what "shown" means. */
export function collectShownItemIds(
  table: Checktable,
  statusByItemId: Record<string, AssignmentStatus | null>,
  sectionFilter: GridSectionFilter,
  statusFilter: GridStatusFilter
): string[] {
  const ids: string[] = [];
  const sections =
    sectionFilter === "supp"
      ? []
      : sectionFilter === "all"
        ? table.sections
        : table.sections.filter((s) => s.id === sectionFilter);
  for (const section of sections)
    for (const ch of section.chapters)
      for (const sr of table.series)
        for (const it of ch.cells[sr.id]?.items ?? [])
          if (itemMatchesStatus(it, statusByItemId, statusFilter)) ids.push(it.id);
  if (sectionFilter === "all" || sectionFilter === "supp")
    for (const it of table.supplementary)
      if (itemMatchesStatus(it, statusByItemId, statusFilter)) ids.push(it.id);
  return ids;
}

// Breathing room below a height-bounded grid so its scrollbox doesn't run flush
// to the viewport edge.
const GRID_BOTTOM_GUTTER_PX = 12;

export function ChecktableGrid({
  table,
  statusByItemId,
  kindByItemId,
  noteByItemId,
  selectedItemIds,
  statusFilter = "all",
  sectionFilter = "all",
  stickyTop = 0,
  onItemClick,
}: Props) {
  const visibleSections = useMemo(() => {
    if (sectionFilter === "supp") return [];
    if (sectionFilter === "all") return table.sections;
    return table.sections.filter((s) => s.id === sectionFilter);
  }, [table.sections, sectionFilter]);

  const showSupplementary =
    table.supplementary.length > 0 &&
    (sectionFilter === "all" || sectionFilter === "supp");

  const visibleSupplementary = useMemo(
    () =>
      showSupplementary
        ? table.supplementary.filter((i) =>
            itemMatchesStatus(i, statusByItemId, statusFilter)
          )
        : [],
    [showSupplementary, table.supplementary, statusByItemId, statusFilter]
  );

  // Books with a learning journey (the CA line) render as one continuous
  // topic sequence instead of strand-grouped blocks: the journey interleaves
  // strands deliberately (shapes after the first add/sub arc, length after
  // subtraction within 20, ...), so grouping by strand would misread as "finish
  // all of Number and Algebra first". Step numbers index into the full journey,
  // so they stay stable under strand/search/status filtering; each row carries
  // its strand as a tag since the strand header rows are gone.
  const journey = useMemo(() => journeyForTable(table), [table]);
  const journeyRows = useMemo(() => {
    if (!journey) return undefined;
    const rows: {
      chapter: ChecktableChapter;
      strand: { id: string; label: string };
      pos: number;
    }[] = [];
    for (const sec of visibleSections) {
      for (const ch of sec.chapters) {
        const visible = table.series.some((s) =>
          (ch.cells[s.id]?.items ?? []).some((it) =>
            itemMatchesStatus(it, statusByItemId, statusFilter)
          )
        );
        if (!visible) continue;
        const prefix = topicPrefixForChapter(ch);
        const pos = prefix ? journey.indexOf(prefix) : -1;
        rows.push({
          chapter: ch,
          strand: { id: sec.id, label: sec.label },
          pos,
        });
      }
    }
    // Unknown topics (not in the journey) sink to the end in source order.
    rows.sort(
      (a, b) => (a.pos === -1 ? 9999 : a.pos) - (b.pos === -1 ? 9999 : b.pos)
    );
    return rows.map((r) => ({
      ...r,
      step: r.pos === -1 ? r.chapter.number : r.pos + 1,
    }));
  }, [journey, visibleSections, table.series, statusByItemId, statusFilter]);

  // Nested walk over every cell; memoise so unrelated re-renders (sticky-offset
  // measurement, parent state) don't re-scan the whole table.
  const hasAnyRows = useMemo(
    () =>
      visibleSections.some((sec) =>
        sec.chapters.some((ch) =>
          table.series.some((s) =>
            (ch.cells[s.id]?.items ?? []).some((it) =>
              itemMatchesStatus(it, statusByItemId, statusFilter)
            )
          )
        )
      ) || visibleSupplementary.length > 0,
    [visibleSections, table.series, statusByItemId, statusFilter, visibleSupplementary]
  );

  return (
    <div className="surface overflow-hidden">
      {visibleSections.length > 0 && (
        <div
          // On a page surface (stickyTop set) bound the height so the matrix
          // scrolls inside the box and its header row stays sticky; the
          // horizontal-scroll wrapper is itself a scroll container, so a plain
          // sticky `top` can't pin to the viewport. Inside a drawer/modal
          // (no offset) keep the original horizontal-only scroll.
          className={stickyTop > 0 ? "overflow-auto" : "overflow-x-auto"}
          style={
            stickyTop > 0
              ? {
                  maxHeight: `calc(100vh - ${stickyTop + GRID_BOTTOM_GUTTER_PX}px)`,
                }
              : undefined
          }
        >
          <table className="w-full text-sm border-collapse">
            <thead className="bg-ink-100 text-ink-700 sticky top-0 z-10">
              <tr>
                <th className="border-r border-ink-200 px-2 py-2 text-left font-medium w-10">
                  #
                </th>
                <th className="border-r border-ink-200 px-3 py-2 text-left font-medium min-w-[180px]">
                  Chapter
                </th>
                {table.series.map((s) => (
                  <th
                    key={s.id}
                    className="border-r border-ink-200 px-3 py-2 text-left font-medium last:border-r-0 min-w-[140px]"
                    title={s.hint}
                  >
                    <div>{s.label}</div>
                    {s.hint && (
                      <div className="text-[10px] font-normal text-ink-500 mt-0.5 leading-tight">
                        {s.hint}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {journeyRows
                ? journeyRows.map((r) => (
                    <ChapterRow
                      key={r.chapter.id}
                      table={table}
                      chapter={r.chapter}
                      step={r.step}
                      strand={r.strand}
                      statusByItemId={statusByItemId}
                      kindByItemId={kindByItemId}
                      noteByItemId={noteByItemId}
                      selectedItemIds={selectedItemIds}
                      statusFilter={statusFilter}
                      onItemClick={onItemClick}
                    />
                  ))
                : visibleSections.map((section) => (
                    <SectionRows
                      key={section.id}
                      table={table}
                      section={section}
                      statusByItemId={statusByItemId}
                      kindByItemId={kindByItemId}
                      noteByItemId={noteByItemId}
                      selectedItemIds={selectedItemIds}
                      statusFilter={statusFilter}
                      onItemClick={onItemClick}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {showSupplementary && visibleSupplementary.length > 0 && (
        <div className="border-t border-ink-200 p-4">
          <div className="text-xs uppercase tracking-wide text-ink-500 font-medium mb-2">
            補充教材 · Supplementary
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleSupplementary.map((item) => (
              <ItemChip
                key={item.id}
                item={item}
                status={statusByItemId[item.id] ?? null}
                kind={kindByItemId?.[item.id]}
                tutorNote={noteByItemId?.[item.id]}
                isSelected={selectedItemIds.has(item.id)}
                onItemClick={onItemClick}
              />
            ))}
          </div>
        </div>
      )}

      {!hasAnyRows && (
        <div className="px-4 py-10 text-center text-sm text-ink-500">
          No items match the current filter.
        </div>
      )}
    </div>
  );
}

// Memoised: with stable per-student status/selection maps from the editor, a
// section only re-renders when its own data changes, not on every parent
// re-render (sticky measurement, view toggle, search keystroke).
const SectionRows = memo(function SectionRows({
  table,
  section,
  statusByItemId,
  kindByItemId,
  noteByItemId,
  selectedItemIds,
  statusFilter,
  onItemClick,
}: {
  table: Checktable;
  section: Checktable["sections"][number];
  statusByItemId: Record<string, AssignmentStatus | null>;
  kindByItemId?: Record<string, ExerciseKind | undefined>;
  noteByItemId?: Record<string, string | undefined>;
  selectedItemIds: Set<string>;
  statusFilter: GridStatusFilter;
  onItemClick: (item: ChecktableItem) => void;
}) {
  const visibleChapters = useMemo(
    () =>
      section.chapters.filter((ch) =>
        table.series.some((s) =>
          (ch.cells[s.id]?.items ?? []).some((it) =>
            itemMatchesStatus(it, statusByItemId, statusFilter)
          )
        )
      ),
    [section.chapters, table.series, statusByItemId, statusFilter]
  );

  if (visibleChapters.length === 0) return null;

  return (
    <>
      <tr className="bg-ink-50">
        <td
          colSpan={2 + table.series.length}
          className="px-3 py-1.5 text-xs uppercase tracking-wide text-ink-500 font-medium border-y border-ink-200"
        >
          {section.label}
        </td>
      </tr>
      {visibleChapters.map((ch) => (
        <ChapterRow
          key={ch.id}
          table={table}
          chapter={ch}
          step={ch.number}
          statusByItemId={statusByItemId}
          kindByItemId={kindByItemId}
          noteByItemId={noteByItemId}
          selectedItemIds={selectedItemIds}
          statusFilter={statusFilter}
          onItemClick={onItemClick}
        />
      ))}
    </>
  );
});

// Journey-mode strand tags: only the minority strands get a tint so the MG/ST
// interruptions pop against the (untagged-colour) NA spine — colouring every
// row would just be noise, and saturated tags would compete with the amber
// assigned / green done chip colours that carry workflow meaning. The mc
// palette has no dark peach/yellow text shades, so the tints pair with dark
// stock text colours, same as the amber "Assigned" badge does.
const STRAND_TAG_CLASS: Record<string, string> = {
  MG: "bg-mc-peach-100 text-orange-800",
  ST: "bg-mc-yellow-100 text-yellow-800",
};

// One chapter (topic) row: shared between the strand-sectioned layout (step =
// chapter number within the strand) and the journey layout (step = position in
// the learning journey, plus a strand tag standing in for the removed strand
// header rows).
const ChapterRow = memo(function ChapterRow({
  table,
  chapter: ch,
  step,
  strand,
  statusByItemId,
  kindByItemId,
  noteByItemId,
  selectedItemIds,
  statusFilter,
  onItemClick,
}: {
  table: Checktable;
  chapter: ChecktableChapter;
  step: number;
  strand?: { id: string; label: string };
  statusByItemId: Record<string, AssignmentStatus | null>;
  kindByItemId?: Record<string, ExerciseKind | undefined>;
  noteByItemId?: Record<string, string | undefined>;
  selectedItemIds: Set<string>;
  statusFilter: GridStatusFilter;
  onItemClick: (item: ChecktableItem) => void;
}) {
  return (
    <tr className="hover:bg-ink-50/50 border-b border-ink-100 last:border-b-0">
      <td className="border-r border-ink-100 px-2 py-2 text-center text-ink-500 align-top">
        {step}
      </td>
      <td className="border-r border-ink-100 px-3 py-2 text-ink-800 align-top">
        {ch.title}
        {strand && (
          <span
            title={strand.label}
            className={`ml-1.5 inline-block rounded px-1 py-px align-middle text-[10px] font-medium ${
              STRAND_TAG_CLASS[strand.id] ?? "bg-ink-100 text-ink-500"
            }`}
          >
            {strand.id}
          </span>
        )}
      </td>
      {table.series.map((s) => {
        const cell = ch.cells[s.id];
        // Apply the status filter at the chip level too, earlier
        // versions only filtered chapter rows, so "Untouched" still
        // surfaced done/assigned chips inside visible rows.
        const visibleItems = cell
          ? cell.items.filter((it) =>
              itemMatchesStatus(it, statusByItemId, statusFilter)
            )
          : [];
        return (
          <td
            key={s.id}
            className="border-r border-ink-100 px-2 py-2 last:border-r-0 align-top"
          >
            {visibleItems.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {visibleItems.map((item) => (
                  <ItemChip
                    key={item.id}
                    item={item}
                    status={statusByItemId[item.id] ?? null}
                    kind={kindByItemId?.[item.id]}
                    tutorNote={noteByItemId?.[item.id]}
                    objective={objectiveForItemCode(item.code)}
                    isSelected={selectedItemIds.has(item.id)}
                    onItemClick={onItemClick}
                  />
                ))}
              </div>
            ) : (
              <span className="text-ink-300 text-xs">·</span>
            )}
          </td>
        );
      })}
    </tr>
  );
});
