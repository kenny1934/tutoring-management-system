"use client";

import { ReactNode } from "react";
import { Minimize2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton, Select } from "@/components/controls";
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
    <div className="px-2 py-1.5 sm:px-3 border-b border-line flex items-center gap-2">
      {children}
      <StudentJumpSearch
        entries={entries}
        onSelect={onSearchSelect}
        className="w-full max-w-[14rem] sm:max-w-xs"
      />
      <div className="flex-1" />
      <Select
        size="sm"
        value={location}
        onChange={(e) => onLocationChange(e.target.value)}
        className="max-w-[7rem] sm:max-w-none"
        aria-label="Branch"
      >
        {locations.map((l) => (
          <option key={l.name} value={l.name}>
            {LOCATION_TO_CODE[l.name] || l.name}
          </option>
        ))}
      </Select>
      <IconButton
        size="sm"
        icon={RefreshCw}
        onClick={onRefresh}
        disabled={refreshing}
        label="Refresh arrangement data"
        title="Refresh"
        iconClassName={cn(refreshing && "animate-spin")}
      />
      <IconButton
        size="sm"
        icon={Minimize2}
        onClick={onExit}
        label="Exit full screen"
        title="Exit full screen (Esc)"
        className="border border-line-strong bg-field-fill"
      />
    </div>
  );
}
