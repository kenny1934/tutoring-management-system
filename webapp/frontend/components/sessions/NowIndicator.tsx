"use client";

import { cn } from "@/lib/utils";
import { minutesToTime } from "@/lib/calendar-utils";

/**
 * Red divider marking the current time in the gap before the next upcoming
 * slot. `compact` fits the dashboard card's density; default fits the
 * sessions list.
 */
export function NowDivider({ nowMinutes, compact = false }: { nowMinutes: number; compact?: boolean }) {
  return (
    <div className={cn("flex items-center", compact ? "gap-1.5 px-3 pt-1.5" : "gap-2 px-1")} aria-hidden="true">
      <span className={cn("rounded-full bg-red-500", compact ? "h-1.5 w-1.5" : "h-2 w-2")} />
      <span className={cn("flex-1 bg-red-400/60", compact ? "h-px" : "h-0.5 rounded-full")} />
      <span className={cn("font-semibold tabular-nums text-red-500", compact ? "text-[10px]" : "text-xs")}>
        {minutesToTime(nowMinutes)}
      </span>
    </div>
  );
}

/** Pulsing "Now" marker for the slot header whose lesson is in progress. */
export function NowChip({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-1 font-bold text-red-500", compact ? "text-[10px]" : "text-xs")}>
      <span className={cn("animate-pulse rounded-full bg-red-500", compact ? "h-1.5 w-1.5" : "h-2 w-2")} />
      Now
    </span>
  );
}
