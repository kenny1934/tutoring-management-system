"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { RegularSlotCell, type RegularDemandBarFilter } from "./RegularSlotCell";
import type { RegularTutorOption } from "./RegularSlotCard";
import { DAY_ABBREV } from "@/lib/regular-utils";
import { cn } from "@/lib/utils";
import type { RegularDemandCell, RegularSlot, RegularSlotUpdate } from "@/types";

// Stable empty-slot array so cells with no slots keep a fixed `slots` prop
// identity across renders.
const EMPTY_SLOTS: RegularSlot[] = [];

interface DragPrefs {
  primary: { day: string; time: string }[];
  backup: { day: string; time: string }[];
}

interface RegularArrangementGridProps {
  days: string[];
  timeSlots: string[];
  demand: RegularDemandCell[];
  slots: RegularSlot[];
  grades: string[];
  tutors: RegularTutorOption[];
  /** True on initial load while slots/demand are still fetching. */
  loading?: boolean;
  readOnly?: boolean;
  onCreateSlot: (day: string, timeSlot: string) => void;
  onUpdateSlot: (slotId: number, data: RegularSlotUpdate) => void;
  onDeleteSlot: (slotId: number) => void;
  onDropStudent: (applicationId: number, slotId: number) => void;
  onUnassign: (applicationId: number, studentName: string) => void;
  onClickStudent?: (applicationId: number) => void;
  onDropFailed?: (reason: string) => void;
  onDemandBarClick?: (filter: RegularDemandBarFilter) => void;
  /** Search jump: rings every card holding this application, scrolls the one
   * matching `scrollSlotId`, and un-hides `day` if the column is filtered out. */
  slotHighlightTarget?: {
    applicationId: number;
    scrollSlotId: number | null;
    day?: string | null;
    seq: number;
  } | null;
  dragPrefs?: DragPrefs | null;
  pendingPlacementAppId?: number | null;
}

export function RegularArrangementGrid({
  days,
  timeSlots,
  demand,
  slots,
  grades,
  tutors,
  loading = false,
  readOnly = false,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
  onDropStudent,
  onUnassign,
  onClickStudent,
  onDropFailed,
  onDemandBarClick,
  slotHighlightTarget,
  dragPrefs,
  pendingPlacementAppId,
}: RegularArrangementGridProps) {
  // Index demand by (day, timeSlot)
  const demandMap = useMemo(() => {
    const map = new Map<string, RegularDemandCell>();
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
    const map = new Map<string, RegularSlot[]>();
    for (const slot of slots) {
      const key = `${slot.slot_day}|${slot.time_slot}`;
      const arr = map.get(key) ?? [];
      arr.push(slot);
      map.set(key, arr);
    }
    return map;
  }, [slots]);

  // Day-visibility toggle: resets when the set of open days changes (e.g.
  // branch switch). `days` is a fresh array every parent render, so key the
  // effect off a stable joined string to avoid clobbering user selection.
  const openDaysKey = days.join("|");
  const [visibleDays, setVisibleDays] = useState<Set<string>>(
    () => new Set(days)
  );
  useEffect(() => {
    setVisibleDays(new Set(openDaysKey ? openDaysKey.split("|") : []));
  }, [openDaysKey]);

  // A jump into a day the user has filtered out would land on nothing, so the
  // column comes back first.
  const jumpDay = slotHighlightTarget?.day ?? null;
  const jumpSeq = slotHighlightTarget?.seq;
  useEffect(() => {
    if (!jumpDay) return;
    setVisibleDays((prev) => (prev.has(jumpDay) ? prev : new Set(prev).add(jumpDay)));
  }, [jumpDay, jumpSeq]);

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
        No days or time slots configured for this branch. Set them up in the Config tab.
      </div>
    );
  }

  const hasSlots = slots.length > 0;
  const hasDemand = demand.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Getting started hint (suppressed during initial load) */}
      {!loading && !hasSlots && (
        <div className="rounded-lg border border-orange-200/60 dark:border-orange-800/40 bg-orange-50/60 dark:bg-orange-900/20 px-4 py-3 text-sm text-orange-800 dark:text-orange-200">
          {hasDemand ? (
            <>Demand data loaded from applications. Click <strong>+ Add slot</strong> in any cell to create a weekly class slot, then drag students from the panel on the right.</>
          ) : (
            <>No applications yet for this branch. You can still create slots, or switch to the Applications tab to review incoming applications.</>
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
              <div className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center text-[10px] text-muted-foreground px-0.5 text-center sticky left-0 z-10">
                {ts}
              </div>

              {visibleDaysList.map((day) => {
                const key = `${day}|${ts}`;
                if (loading) {
                  return (
                    <div
                      key={key}
                      className="bg-white dark:bg-[#1a1a1a] min-h-[80px] p-1.5"
                      aria-hidden
                    >
                      <div className="h-full w-full rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                    </div>
                  );
                }
                const matches = (s: { day: string; time: string }) => s.day === day && s.time === ts;
                const isPrefMatch =
                  dragPrefs?.primary.some(matches) || dragPrefs?.backup.some(matches);
                return (
                  <RegularSlotCell
                    key={key}
                    day={day}
                    timeSlot={ts}
                    demandCell={demandMap.get(key)}
                    slots={slotsMap.get(key) ?? EMPTY_SLOTS}
                    grades={grades}
                    tutors={tutors}
                    readOnly={readOnly}
                    onCreateSlot={onCreateSlot}
                    onUpdateSlot={onUpdateSlot}
                    onDeleteSlot={onDeleteSlot}
                    onDropStudent={onDropStudent}
                    onUnassign={onUnassign}
                    onClickStudent={onClickStudent}
                    onDropFailed={onDropFailed}
                    prefHighlight={isPrefMatch}
                    gradeMaxDemand={gradeMaxDemand}
                    onDemandBarClick={onDemandBarClick}
                    slotHighlightTarget={slotHighlightTarget}
                    pendingPlacementAppId={pendingPlacementAppId}
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
