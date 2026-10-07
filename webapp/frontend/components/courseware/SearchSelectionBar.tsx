"use client";

import { CalendarPlus } from "lucide-react";
import { type DocSelection } from "@/lib/hooks/useMapSelection";
import { Button } from "@/components/controls";

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
        className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
      >
        Clear all
      </button>
      <Button variant="primary" size="sm" icon={CalendarPlus} onClick={onAssign} className="ml-auto">
        Assign to sessions
      </Button>
    </div>
  );
}
