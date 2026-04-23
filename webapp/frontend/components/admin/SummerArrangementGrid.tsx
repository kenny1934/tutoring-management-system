"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { SummerSlotCell } from "./SummerSlotCell";
import type { DemandBarFilter } from "./SummerSlotCell";
import { DAY_ABBREV } from "@/lib/summer-utils";
import { cn } from "@/lib/utils";
import type { AvailableTutor } from "@/types";
import type { SummerDemandCell, SummerSlot, SummerSlotUpdate } from "@/types";

interface DragPrefs {
  primary: { day: string; time: string }[];
  backup: { day: string; time: string }[];
}

interface SummerArrangementGridProps {
  days: string[];
  timeSlots: string[];
  demand: SummerDemandCell[];
  slots: SummerSlot[];
  grades: string[];
  onCreateSlot: (day: string, timeSlot: string) => void;
  onUpdateSlot: (slotId: number, data: SummerSlotUpdate) => void;
  onDeleteSlot: (slotId: number) => void;
  onDropStudent: (applicationId: number, slotId: number) => void;
  onRemoveSession: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
  onDropFailed?: (reason: string) => void;
  dragPrefs?: DragPrefs | null;
  getAvailableTutors?: (day: string, timeSlot: string) => AvailableTutor[];
  onConfirmSlot?: (slotId: number) => void;
  dragBuddySlots?: Set<string> | null;
  onDemandBarClick?: (filter: DemandBarFilter) => void;
  /** Ring + auto-expand every slot card containing this application. Only
   * the card whose id matches `scrollSlotId` scrolls into view. `seq` lets
   * the effect re-fire when the same student is targeted twice. */
  slotHighlightTarget?: {
    applicationId: number;
    scrollSlotId: number | null;
    seq: number;
  } | null;
}


export function SummerArrangementGrid({
  days,
  timeSlots,
  demand,
  slots,
  grades,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
  onDropStudent,
  onRemoveSession,
  onClickStudent,
  onDropFailed,
  dragPrefs,
  getAvailableTutors,
  onConfirmSlot,
  dragBuddySlots,
  onDemandBarClick,
  slotHighlightTarget,
}: SummerArrangementGridProps) {
  // Index demand by (day, timeSlot)
  const demandMap = useMemo(() => {
    const map = new Map<string, SummerDemandCell>();
    for (const cell of demand) {
      map.set(`${cell.day}|${cell.time_slot}`, cell);
    }
    return map;
  }, [demand]);

  // Global per-grade max demand across all cells — used so bars are comparable
  const gradeMaxDemand = useMemo(() => {
    let max = 0;
    for (const cell of demand) {
      for (const g of new Set([...Object.keys(cell.by_grade_first), ...Object.keys(cell.by_grade_second)])) {
        const total = (cell.by_grade_first[g] ?? 0) + (cell.by_grade_second[g] ?? 0);
        if (total > max) max = total;
      }
    }
    return max;
  }, [demand]);

  // Index slots by (day, timeSlot)
  const slotsMap = useMemo(() => {
    const map = new Map<string, SummerSlot[]>();
    for (const slot of slots) {
      const key = `${slot.slot_day}|${slot.time_slot}`;
      const arr = map.get(key) ?? [];
      arr.push(slot);
      map.set(key, arr);
    }
    return map;
  }, [slots]);

  // Day-visibility toggle: resets when the set of open days changes (e.g.
  // location switch). `days` is a fresh array every parent render, so key the
  // effect off a stable joined string to avoid clobbering user selection.
  const openDaysKey = days.join("|");
  const [visibleDays, setVisibleDays] = useState<Set<string>>(
    () => new Set(days)
  );
  useEffect(() => {
    setVisibleDays(new Set(openDaysKey ? openDaysKey.split("|") : []));
  }, [openDaysKey]);

  const toggleDay = useCallback((day: string) => {
    setVisibleDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        if (next.size > 1) next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  const visibleDaysList = days.filter((d) => visibleDays.has(d));

  if (days.length === 0 || timeSlots.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No days or time slots configured for this location. Set them up in the Config tab.
      </div>
    );
  }

  const hasSlots = slots.length > 0;
  const hasDemand = demand.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Getting started hint */}
      {!hasSlots && (
        <div className="rounded-lg border border-orange-200/60 dark:border-orange-800/40 bg-orange-50/60 dark:bg-orange-900/20 px-4 py-3 text-sm text-orange-800 dark:text-orange-200">
          {hasDemand ? (
            <>Demand data loaded from applications. Click <strong>+ slot</strong> in any cell to create a class slot, then drag students from the panel on the right.</>
          ) : (
            <>No applications yet for this location. You can still create slots, or switch to the Applications tab to review incoming applications.</>
          )}
        </div>
      )}

      {/* Day filter chips — subset of open days */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] text-muted-foreground mr-0.5">Days:</span>
        {days.map((day) => {
          const isVisible = visibleDays.has(day);
          return (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                isVisible
                  ? "bg-[#a0704b] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-foreground/40 hover:text-foreground/60"
              )}
              title={isVisible ? `Hide ${day}` : `Show ${day}`}
            >
              {DAY_ABBREV[day] || day}
            </button>
          );
        })}
        {visibleDays.size !== days.length && (
          <button
            onClick={() => setVisibleDays(new Set(days))}
            className="text-[10px] text-[#a0704b] hover:underline ml-0.5"
          >
            All
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
      <div
        className="grid gap-px bg-[#e8d4b8]/40 dark:bg-[#6b5a4a]/40"
        style={{
          gridTemplateColumns: `auto repeat(${visibleDaysList.length}, minmax(110px, 1fr))`,
          gridTemplateRows: `36px repeat(${timeSlots.length}, auto)`,
          minWidth: `${64 + visibleDaysList.length * 110}px`,
        }}
      >
        {/* Header row: empty corner + day headers */}
        <div className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center text-xs font-medium text-muted-foreground sticky left-0 top-0 z-20">
          Time
        </div>
        {visibleDaysList.map((day) => (
          <div
            key={day}
            className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center text-sm font-medium sticky top-0 z-10"
          >
            {DAY_ABBREV[day] || day}
          </div>
        ))}

        {/* Data rows: time label + cells */}
        {timeSlots.map((ts) => (
          <Fragment key={ts}>
            {/* Time label */}
            <div className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center text-[10px] text-muted-foreground px-0.5 text-center sticky left-0 z-10">
              {ts}
            </div>

            {/* Cells for each day */}
            {visibleDaysList.map((day) => {
              const key = `${day}|${ts}`;
              const matches = (s: { day: string; time: string }) => s.day === day && s.time === ts;
              const isPrefMatch =
                dragPrefs?.primary.some(matches) || dragPrefs?.backup.some(matches);
              return (
                <SummerSlotCell
                  key={key}
                  day={day}
                  timeSlot={ts}
                  demandCell={demandMap.get(key)}
                  slots={slotsMap.get(key) ?? []}
                  grades={grades}
                  onCreateSlot={() => onCreateSlot(day, ts)}
                  onUpdateSlot={onUpdateSlot}
                  onDeleteSlot={onDeleteSlot}
                  onDropStudent={onDropStudent}
                  onRemoveSession={onRemoveSession}
                  onClickStudent={onClickStudent}
                  onDropFailed={onDropFailed}
                  prefHighlight={isPrefMatch}
                  buddyHighlight={dragBuddySlots?.has(key)}
                  gradeMaxDemand={gradeMaxDemand}
                  availableTutors={getAvailableTutors?.(day, ts)}
                  onConfirmSlot={onConfirmSlot}
                  onDemandBarClick={onDemandBarClick}
                  slotHighlightTarget={slotHighlightTarget}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
      </div>
    </div>
  );
}
