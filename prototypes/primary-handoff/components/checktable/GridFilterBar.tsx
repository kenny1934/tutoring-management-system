"use client";

import { useMemo } from "react";
import type { AssignmentStatus, Checktable } from "@/lib/types";
import type { GridStatusFilter } from "./ChecktableGrid";

/** Status filter for the checktable (All / Pending / Untouched, with live
 *  counts). Section scoping lives in <SectionTabs> above the list, so this is
 *  status-only. */
export function GridFilterBar({
  table,
  statusByItemId,
  status,
  onStatusChange,
}: {
  table: Checktable;
  statusByItemId: Record<string, AssignmentStatus | null>;
  status: GridStatusFilter;
  onStatusChange: (v: GridStatusFilter) => void;
}) {
  const counts = useMemo(() => {
    let total = 0;
    let pending = 0;
    let untouched = 0;
    const visit = (id: string) => {
      total += 1;
      const s = statusByItemId[id] ?? null;
      if (s === "assigned") pending += 1;
      else if (s === null) untouched += 1;
    };
    for (const sec of table.sections) {
      for (const ch of sec.chapters) {
        for (const sId of Object.keys(ch.cells)) {
          ch.cells[sId].items.forEach((i) => visit(i.id));
        }
      }
    }
    table.supplementary.forEach((i) => visit(i.id));
    return { total, pending, untouched };
  }, [table, statusByItemId]);

  const statusOptions: { id: GridStatusFilter; label: string; count: number }[] =
    [
      { id: "all", label: "All", count: counts.total },
      { id: "pending", label: "Pending", count: counts.pending },
      { id: "untouched", label: "Untouched", count: counts.untouched },
    ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs">
        {statusOptions.map((opt) => {
          const active = status === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onStatusChange(opt.id)}
              className={`px-2 py-0.5 rounded-md ${
                active
                  ? "bg-ink-800 text-white"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              {opt.label}
              <span
                className={`ml-1 ${active ? "opacity-80" : "text-ink-400"}`}
              >
                ({opt.count})
              </span>
            </button>
          );
        })}
      </div>
      {status !== "all" && (
        <button
          type="button"
          onClick={() => onStatusChange("all")}
          className="text-xs text-ink-500 hover:text-ink-800 ml-auto"
        >
          Reset
        </button>
      )}
    </div>
  );
}
