"use client";

import { X, CalendarPlus } from "lucide-react";
import { type FileSelection } from "@/components/ui/folder-tree-modal";
import { Button, IconButton, Input } from "@/components/controls";

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
          className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
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
              <Input
                size="sm"
                value={sel.pages}
                onChange={(e) => onUpdatePages(sel.path, e.target.value)}
                placeholder={sel.pageCount ? `1-${sel.pageCount}` : "Pages"}
                aria-label={`Pages of ${sel.path.split("\\").pop()}`}
                aria-invalid={sel.error ? true : undefined}
                className="w-20"
              />
              {sel.pageCount && (
                <span className="text-gray-500 shrink-0">/{sel.pageCount}</span>
              )}
              <IconButton
                icon={X}
                size="sm"
                label={`Remove ${sel.path.split("\\").pop()}`}
                onClick={() => onRemove(sel.path)}
              />
            </div>
            {sel.error && (
              <p className="text-[11px] text-red-600 pl-1">{sel.error}</p>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-1">
        <Button variant="primary" size="sm" icon={CalendarPlus} onClick={onAssign}>
          Assign to sessions
        </Button>
      </div>
    </div>
  );
}
