"use client";

import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toolbar toggle for the session-list declutter filter (hides cancelled and
 * make-up-booked rows). Shows the hidden-row count while active; the full
 * label only fits from lg widths when inactive.
 */
export function HideSupersededToggle({
  active,
  onToggle,
  hiddenCount,
}: {
  active: boolean;
  onToggle: () => void;
  hiddenCount: number;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      title={active ? "Show Cancelled & Make-up Booked" : "Hide Cancelled & Make-up Booked"}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors",
        active
          ? "bg-[#a0704b]/10 text-[#a0704b] dark:text-[#cd853f] font-medium"
          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-[#f5ede3] dark:hover:bg-[#2d2820]"
      )}
    >
      <EyeOff className="h-3.5 w-3.5" />
      {active ? (
        <span>{hiddenCount} hidden</span>
      ) : (
        <span className="hidden lg:inline">Hide Cancelled & Make-up Booked</span>
      )}
    </button>
  );
}

/** Shown when the declutter filter leaves nothing to display. */
export function AllSessionsHiddenNote() {
  return (
    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
      All sessions here are cancelled or have make-ups booked. Turn off the filter to see them.
    </p>
  );
}
