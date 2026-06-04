"use client";

import {
  LayoutGrid,
  ListTree,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";

export type ChecktableView = "grid" | "syllabus";

/** The Syllabus/Grid segmented toggle plus the syllabus-only Collapse-all /
 *  Expand-all button, shared by the courseware browser and the student tab so
 *  the two surfaces stay in sync. `size` matches each surface's control scale. */
export function ChecktableViewControls({
  view,
  onViewChange,
  collapse,
  size = "md",
}: {
  view: ChecktableView;
  onViewChange: (v: ChecktableView) => void;
  collapse: {
    allCollapsed: boolean;
    collapseAll: () => void;
    expandAll: () => void;
  };
  size?: "sm" | "md";
}) {
  const text = size === "sm" ? "text-xs" : "text-sm";
  const togglePad = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const buttonPad = size === "sm" ? "px-2 py-1" : "px-2.5 py-1";

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="View"
        className={`inline-flex shrink-0 rounded-md border border-ink-200 bg-white p-0.5 ${text}`}
      >
        {(
          [
            { id: "syllabus", label: "Syllabus", Icon: ListTree },
            { id: "grid", label: "Grid", Icon: LayoutGrid },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onViewChange(id)}
            aria-pressed={view === id}
            className={`flex items-center gap-1.5 rounded ${togglePad} font-medium transition-colors ${
              view === id
                ? "bg-ink-800 text-white"
                : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
      {view === "syllabus" && (
        <button
          type="button"
          onClick={collapse.allCollapsed ? collapse.expandAll : collapse.collapseAll}
          className={`inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white ${buttonPad} ${text} font-medium text-ink-600 hover:bg-ink-100`}
        >
          {collapse.allCollapsed ? (
            <>
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Expand all
            </>
          ) : (
            <>
              <ChevronsDownUp className="h-3.5 w-3.5" />
              Collapse all
            </>
          )}
        </button>
      )}
    </div>
  );
}
