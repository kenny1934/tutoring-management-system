"use client";

import type { Checktable } from "@/lib/types";
import type { GridSectionFilter } from "./ChecktableGrid";

/** Strand navigation for a book that splits into multiple sections (or carries
 *  supplementary material): a wrapping tab strip that sits above the worksheet
 *  list and scopes it to one strand. Replaces the old in-toolbar section
 *  segmented control, which ballooned into a full-width bar on books with many
 *  long-named strands. Renders nothing for single-section books, so the band
 *  only appears when it's actually meaningful. Shared by the student tab and
 *  the session drawer. */
export function SectionTabs({
  table,
  value,
  onChange,
  className = "",
}: {
  table: Checktable;
  value: GridSectionFilter;
  onChange: (v: GridSectionFilter) => void;
  /** Extra classes on the root, e.g. horizontal padding to line the tabs up
   *  with the content column when the parent doesn't already inset them. */
  className?: string;
}) {
  const hasSupp = table.supplementary.length > 0;
  if (table.sections.length <= 1 && !hasSupp) return null;

  const tabs: { id: GridSectionFilter; label: string }[] = [
    { id: "all", label: "All sections" },
    ...table.sections.map((s) => ({ id: s.id as GridSectionFilter, label: s.label })),
    ...(hasSupp ? [{ id: "supp" as GridSectionFilter, label: "補充" }] : []),
  ];

  return (
    <div
      role="tablist"
      aria-label="Section"
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-ink-800 text-white"
                : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
