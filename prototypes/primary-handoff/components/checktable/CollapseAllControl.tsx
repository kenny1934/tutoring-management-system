"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/** Collapse-all / Expand-all toggle for the syllabus view, shared by the
 *  courseware browser and the student checktables tab so the two surfaces stay
 *  in sync. `size` matches each surface's control scale; `iconOnly` drops the
 *  label so it reads as a quiet list utility rather than a primary action.
 *
 *  (This was previously `ChecktableViewControls`, which also carried a
 *  Syllabus/Grid view toggle. The dense grid view was archived — both surfaces
 *  are syllabus-only now — leaving just this collapse control.) */
export function CollapseAllControl({
  collapse,
  size = "md",
  iconOnly = false,
}: {
  collapse: {
    allCollapsed: boolean;
    collapseAll: () => void;
    expandAll: () => void;
  };
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const text = size === "sm" ? "text-xs" : "text-sm";
  const buttonPad = iconOnly
    ? "p-1.5"
    : size === "sm"
      ? "px-2 py-1"
      : "px-2.5 py-1";
  const label = collapse.allCollapsed ? "Expand all" : "Collapse all";
  const Icon = collapse.allCollapsed ? ChevronsUpDown : ChevronsDownUp;

  return (
    <button
      type="button"
      onClick={collapse.allCollapsed ? collapse.expandAll : collapse.collapseAll}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white ${buttonPad} ${text} font-medium text-ink-600 hover:bg-ink-100`}
    >
      <Icon className="h-3.5 w-3.5" />
      {!iconOnly && label}
    </button>
  );
}
