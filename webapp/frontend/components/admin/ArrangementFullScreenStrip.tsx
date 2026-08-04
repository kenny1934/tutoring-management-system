"use client";

import { ReactNode } from "react";
import { Minimize2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudentJumpSearch, type StudentJumpSearchEntry } from "@/components/ui/student-jump-search";
import { LOCATION_TO_CODE } from "@/lib/summer-utils";

/** The slim header both arrangement pages swap in while full screen: an
 *  optional leading slot (summer's view-tab icons), student search, branch
 *  select, refresh, and the exit button. Exit sits far right, matching where
 *  the enter button lives in the normal header, so the toggle does not jump
 *  sides. */
export function ArrangementFullScreenStrip({
  entries,
  onSearchSelect,
  locations,
  location,
  onLocationChange,
  refreshing,
  onRefresh,
  onExit,
  children,
}: {
  entries: StudentJumpSearchEntry[];
  onSearchSelect: (entry: StudentJumpSearchEntry) => void;
  locations: { name: string }[];
  location: string;
  onLocationChange: (name: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onExit: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="px-2 py-1.5 sm:px-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center gap-2">
      {children}
      <StudentJumpSearch
        entries={entries}
        onSelect={onSearchSelect}
        className="w-full max-w-[14rem] sm:max-w-xs"
      />
      <div className="flex-1" />
      <select
        value={location}
        onChange={(e) => onLocationChange(e.target.value)}
        className="px-2.5 py-1 text-sm border border-border rounded-lg bg-card text-foreground max-w-[7rem] sm:max-w-none"
        aria-label="Branch"
      >
        {locations.map((l) => (
          <option key={l.name} value={l.name}>
            {LOCATION_TO_CODE[l.name] || l.name}
          </option>
        ))}
      </select>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        title="Refresh"
        aria-label="Refresh arrangement data"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
      </button>
      <button
        onClick={onExit}
        className="p-1.5 shrink-0 rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        title="Exit full screen (Esc)"
        aria-label="Exit full screen"
      >
        <Minimize2 className="h-4 w-4" />
      </button>
    </div>
  );
}
