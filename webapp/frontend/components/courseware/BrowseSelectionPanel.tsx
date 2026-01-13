"use client";

import { X, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { type FileSelection } from "@/components/ui/folder-tree-modal";

interface BrowseSelectionPanelProps {
  selections: Map<string, FileSelection>;
  onUpdatePages: (path: string, pages: string) => void;
  onRemove: (path: string) => void;
  onClear: () => void;
  onAssign: () => void;
}

export function BrowseSelectionPanel({
  selections,
  onUpdatePages,
  onRemove,
  onClear,
  onAssign,
}: BrowseSelectionPanelProps) {
  if (selections.size === 0) return null;

  return (
    <div className="p-2 mx-3 mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {selections.size} file{selections.size !== 1 ? "s" : ""} selected
          <span className="font-normal ml-1 opacity-70">(Esc to clear)</span>
        </span>
        <button
          onClick={onClear}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline"
        >
          Clear all
        </button>
      </div>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {Array.from(selections.values()).map((sel) => (
          <div key={sel.path} className="space-y-0.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={sel.path}>
                {sel.path.split("\\").pop()}
              </span>
              <input
                type="text"
                value={sel.pages}
                onChange={(e) => onUpdatePages(sel.path, e.target.value)}
                placeholder={sel.pageCount ? `1-${sel.pageCount}` : "Pages"}
                className={cn(
                  "w-20 px-1.5 py-0.5 text-xs border rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400",
                  sel.error
                    ? "border-red-400 focus:ring-red-400"
                    : "border-gray-300 dark:border-gray-600 focus:ring-amber-400"
                )}
              />
              {sel.pageCount && (
                <span className="text-gray-400 shrink-0">/{sel.pageCount}</span>
              )}
              <button
                onClick={() => onRemove(sel.path)}
                className="p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            {sel.error && (
              <p className="text-[10px] text-red-500 pl-1">{sel.error}</p>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-1">
        <button
          onClick={onAssign}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-[#5a8a5a] text-white hover:bg-[#4a7a4a] transition-colors"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Assign to Sessions
        </button>
      </div>
    </div>
  );
}
