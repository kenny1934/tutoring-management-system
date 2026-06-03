"use client";

import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
  ExerciseKind,
} from "@/lib/types";
import { ItemChip } from "@/components/checktable/ItemChip";

type Props = {
  table: Checktable;
  statusByItemId?: Record<string, AssignmentStatus | null>;
  kindByItemId?: Record<string, ExerciseKind | undefined>;
  noteByItemId?: Record<string, string | undefined>;
  selectedItemIds?: Set<string>;
  onItemClick: (item: ChecktableItem) => void;
};

const EMPTY_STATUS: Record<string, AssignmentStatus | null> = {};
const EMPTY_SELECTION = new Set<string>();

/** Objective-led reading view of a checktable: each chapter is a card, with one
 *  row per set (series that has worksheets), showing the series badge, the
 *  learning objective, and that set's worksheet chips. Complements the matrix
 *  grid, which is better for scanning status across variants. */
export function CoursewareSyllabus({
  table,
  statusByItemId = EMPTY_STATUS,
  kindByItemId,
  noteByItemId,
  selectedItemIds = EMPTY_SELECTION,
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

  const hasChapters = table.sections.some((s) =>
    s.chapters.some((ch) =>
      table.series.some((sr) => (ch.cells[sr.id]?.items.length ?? 0) > 0)
    )
  );

  if (!hasChapters && table.supplementary.length === 0) {
    return (
      <div className="surface px-4 py-10 text-center text-sm text-ink-500">
        No items match the current filter.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {table.sections.map((section) => {
        const chapters = section.chapters.filter((ch) =>
          table.series.some((sr) => (ch.cells[sr.id]?.items.length ?? 0) > 0)
        );
        if (chapters.length === 0) return null;

        return (
          <div key={section.id} className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-ink-500 font-medium px-1">
              {section.label}
            </div>
            {chapters.map((ch) => {
              // Sets in series order; only those with worksheets in this chapter.
              const sets = table.series
                .map((sr) => ({ series: sr, cell: ch.cells[sr.id] }))
                .filter((s) => (s.cell?.items.length ?? 0) > 0);

              return (
                <div key={ch.id} className="surface overflow-hidden">
                  <div className="flex items-baseline gap-2 border-b border-ink-100 bg-ink-50 px-4 py-2">
                    <span className="text-xs tabular-nums text-ink-400">
                      Ch {ch.number}
                    </span>
                    <span className="font-medium text-ink-800">{ch.title}</span>
                  </div>
                  <div className="divide-y divide-ink-100">
                    {sets.map(({ series, cell }) => (
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
                          {cell!.objective ? (
                            <span className="text-ink-700">
                              {cell!.objective}
                            </span>
                          ) : (
                            <span className="text-ink-400 italic">
                              Objective not set yet
                            </span>
                          )}
                        </div>
                        <div className="sm:w-40 sm:shrink-0">
                          {chips(cell!.items, cell!.objective)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {table.supplementary.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="border-b border-ink-100 bg-ink-50 px-4 py-2 text-xs uppercase tracking-wide text-ink-500 font-medium">
            補充教材 · Supplementary
          </div>
          <div className="px-4 py-3">{chips(table.supplementary)}</div>
        </div>
      )}
    </div>
  );
}
