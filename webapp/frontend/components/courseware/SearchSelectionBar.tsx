"use client";

import { CalendarPlus } from "lucide-react";
import { type DocSelection } from "@/lib/use-selection";

interface SearchSelectionBarProps {
  selections: Map<number, DocSelection>;
  onClear: () => void;
  onAssign: () => void;
}

export function SearchSelectionBar({
  selections,
  onClear,
  onAssign,
}: SearchSelectionBarProps) {
  if (selections.size === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
        {selections.size} selected
        <span className="font-normal ml-1 opacity-70">(Esc to clear)</span>
      </span>
      <button
        onClick={onClear}
        className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
      >
        Clear all
      </button>
      <button
        onClick={onAssign}
        className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-[#5a8a5a] text-white hover:bg-[#4a7a4a] transition-colors"
      >
        <CalendarPlus className="h-3.5 w-3.5" />
        Assign to Sessions
      </button>
    </div>
  );
}
