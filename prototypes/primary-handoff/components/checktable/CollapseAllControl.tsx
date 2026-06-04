"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/** Collapse-all / Expand-all toggle for the syllabus view, shared by the
 *  courseware browser and the student checktables tab so the two surfaces stay
 *  in sync. `size` matches each surface's control scale.
 *
 *  (This was previously `ChecktableViewControls`, which also carried a
 *  Syllabus/Grid view toggle. The dense grid view was archived — both surfaces
 *  are syllabus-only now — leaving just this collapse control.) */
export function CollapseAllControl({
  collapse,
  size = "md",
}: {
  collapse: {
    allCollapsed: boolean;
    collapseAll: () => void;
    expandAll: () => void;
  };
  size?: "sm" | "md";
}) {
  const text = size === "sm" ? "text-xs" : "text-sm";
  const buttonPad = size === "sm" ? "px-2 py-1" : "px-2.5 py-1";

  return (
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
  );
}
