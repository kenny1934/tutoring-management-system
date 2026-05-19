"use client";

import type {
  AssignmentStatus,
  Checktable,
  ChecktableItem,
} from "@/lib/types";
import { ItemChip } from "./ItemChip";

type Props = {
  table: Checktable;
  statusByItemId: Record<string, AssignmentStatus | null>;
  selectedItemIds: Set<string>;
  onItemClick: (item: ChecktableItem) => void;
};

export function ChecktableGrid({
  table,
  statusByItemId,
  selectedItemIds,
  onItemClick,
}: Props) {
  return (
    <div className="surface overflow-hidden">
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
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.sections.map((section) => (
              <SectionRows
                key={section.id}
                table={table}
                section={section}
                statusByItemId={statusByItemId}
                selectedItemIds={selectedItemIds}
                onItemClick={onItemClick}
              />
            ))}
          </tbody>
        </table>
      </div>

      {table.supplementary.length > 0 && (
        <div className="border-t border-ink-200 p-4">
          <div className="text-xs uppercase tracking-wide text-ink-500 font-medium mb-2">
            補充教材 · Supplementary
          </div>
          <div className="flex flex-wrap gap-1.5">
            {table.supplementary.map((item) => (
              <ItemChip
                key={item.id}
                item={item}
                status={statusByItemId[item.id] ?? null}
                isSelected={selectedItemIds.has(item.id)}
                onClick={() => onItemClick(item)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionRows({
  table,
  section,
  statusByItemId,
  selectedItemIds,
  onItemClick,
}: {
  table: Checktable;
  section: Checktable["sections"][number];
  statusByItemId: Record<string, AssignmentStatus | null>;
  selectedItemIds: Set<string>;
  onItemClick: (item: ChecktableItem) => void;
}) {
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
      {section.chapters.map((ch) => (
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
            return (
              <td
                key={s.id}
                className="border-r border-ink-100 px-2 py-2 last:border-r-0 align-top"
              >
                {cell && cell.items.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {cell.items.map((item) => (
                      <ItemChip
                        key={item.id}
                        item={item}
                        status={statusByItemId[item.id] ?? null}
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
