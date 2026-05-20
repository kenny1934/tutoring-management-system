"use client";

import { useMemo } from "react";
import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
} from "@/lib/types";
import { ItemChip } from "./ItemChip";

export type GridStatusFilter = "all" | "pending" | "untouched";
export type GridSectionFilter = "all" | "supp" | string;

type Props = {
  table: Checktable;
  statusByItemId: Record<string, AssignmentStatus | null>;
  noteByItemId?: Record<string, string | undefined>;
  selectedItemIds: Set<string>;
  statusFilter?: GridStatusFilter;
  sectionFilter?: GridSectionFilter;
  onItemClick: (item: ChecktableItem) => void;
};

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

export function ChecktableGrid({
  table,
  statusByItemId,
  noteByItemId,
  selectedItemIds,
  statusFilter = "all",
  sectionFilter = "all",
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

  const hasAnyRows =
    visibleSections.some((sec) =>
      sec.chapters.some((ch) =>
        table.series.some((s) =>
          (ch.cells[s.id]?.items ?? []).some((it) =>
            itemMatchesStatus(it, statusByItemId, statusFilter)
          )
        )
      )
    ) || visibleSupplementary.length > 0;

  return (
    <div className="surface overflow-hidden">
      {visibleSections.length > 0 && (
        <div className="overflow-x-auto">
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
              {visibleSections.map((section) => (
                <SectionRows
                  key={section.id}
                  table={table}
                  section={section}
                  statusByItemId={statusByItemId}
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
                tutorNote={noteByItemId?.[item.id]}
                isSelected={selectedItemIds.has(item.id)}
                onClick={() => onItemClick(item)}
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

function SectionRows({
  table,
  section,
  statusByItemId,
  noteByItemId,
  selectedItemIds,
  statusFilter,
  onItemClick,
}: {
  table: Checktable;
  section: Checktable["sections"][number];
  statusByItemId: Record<string, AssignmentStatus | null>;
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
        <tr
          key={ch.id}
          className="hover:bg-ink-50/50 border-b border-ink-100 last:border-b-0"
        >
          <td className="border-r border-ink-100 px-2 py-2 text-center text-ink-500 align-top">
            {ch.number}
          </td>
          <td className="border-r border-ink-100 px-3 py-2 text-ink-800 align-top">
            {ch.title}
          </td>
          {table.series.map((s) => {
            const cell = ch.cells[s.id];
            // Apply the status filter at the chip level too — earlier
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
                        tutorNote={noteByItemId?.[item.id]}
                        isSelected={selectedItemIds.has(item.id)}
                        onClick={() => onItemClick(item)}
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
      ))}
    </>
  );
}
