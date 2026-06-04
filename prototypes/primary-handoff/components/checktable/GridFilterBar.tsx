"use client";

import { useMemo } from "react";
import type { AssignmentStatus, Checktable } from "@/lib/types";
import type {
  GridSectionFilter,
  GridStatusFilter,
} from "./ChecktableGrid";

export function GridFilterBar({
  table,
  statusByItemId,
  status,
  section,
  onStatusChange,
  onSectionChange,
}: {
  table: Checktable;
  statusByItemId: Record<string, AssignmentStatus | null>;
  status: GridStatusFilter;
  section: GridSectionFilter;
  onStatusChange: (v: GridStatusFilter) => void;
  onSectionChange: (v: GridSectionFilter) => void;
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

  const sectionOptions: { id: GridSectionFilter; label: string }[] = [
    { id: "all", label: "All sections" },
    ...table.sections.map((s) => ({
      id: s.id as GridSectionFilter,
      label: s.label,
    })),
  ];
  if (table.supplementary.length > 0) {
    sectionOptions.push({ id: "supp", label: "補充" });
  }

  // A single-section book with no supplementary would only offer
  // "All sections | <that section>" — two buttons that filter to the same
  // thing. Hide the section toggle there; it's only meaningful when the book
  // splits into multiple sections or has supplementary material.
  const showSectionFilter =
    table.sections.length > 1 || table.supplementary.length > 0;

  return (
    <div className="surface flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="text-xs text-ink-500 mr-1">Filter</span>
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
      {showSectionFilter && (
        <div className="inline-flex rounded-md border border-ink-200 bg-white p-0.5 text-xs">
          {sectionOptions.map((opt) => {
            const active = section === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSectionChange(opt.id)}
                className={`px-2 py-0.5 rounded-md ${
                  active
                    ? "bg-ink-800 text-white"
                    : "text-ink-600 hover:bg-ink-100"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      {(status !== "all" || section !== "all") && (
        <button
          type="button"
          onClick={() => {
            onStatusChange("all");
            onSectionChange("all");
          }}
          className="text-xs text-ink-500 hover:text-ink-800 ml-auto"
        >
          Reset
        </button>
      )}
    </div>
  );
}
