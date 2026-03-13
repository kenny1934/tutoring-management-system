"use client";

import { Fragment, useMemo } from "react";
import { SummerSlotCell } from "./SummerSlotCell";
import type { SummerDemandCell, SummerSlot, SummerSlotUpdate } from "@/types";

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
  onRemovePlacement: (placementId: number) => void;
  onDropFailed?: (reason: string) => void;
}

const DAY_ABBREV: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

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
  onRemovePlacement,
  onDropFailed,
}: SummerArrangementGridProps) {
  // Index demand by (day, timeSlot)
  const demandMap = useMemo(() => {
    const map = new Map<string, SummerDemandCell>();
    for (const cell of demand) {
      map.set(`${cell.day}|${cell.time_slot}`, cell);
    }
    return map;
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
    <div className="space-y-3">
      {/* Getting started hint */}
      {!hasSlots && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {hasDemand ? (
            <>Demand data loaded from applications. Click <strong>+ slot</strong> in any cell to create a class slot, then drag students from the panel on the right.</>
          ) : (
            <>No applications yet for this location. You can still create slots, or switch to the Applications tab to review incoming applications.</>
          )}
        </div>
      )}

      <div
        className="grid gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      style={{
        gridTemplateColumns: `80px repeat(${days.length}, minmax(140px, 1fr))`,
        gridTemplateRows: `40px repeat(${timeSlots.length}, auto)`,
      }}
    >
      {/* Header row: empty corner + day headers */}
      <div className="bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xs font-medium text-muted-foreground">
        Time
      </div>
      {days.map((day) => (
        <div
          key={day}
          className="bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-sm font-medium"
        >
          {DAY_ABBREV[day] || day}
        </div>
      ))}

      {/* Data rows: time label + cells */}
      {timeSlots.map((ts) => (
        <Fragment key={ts}>
          {/* Time label */}
          <div className="bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-xs text-muted-foreground px-1 text-center">
            {ts}
          </div>

          {/* Cells for each day */}
          {days.map((day) => {
            const key = `${day}|${ts}`;
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
                onRemovePlacement={onRemovePlacement}
                onDropFailed={onDropFailed}
              />
            );
          })}
        </Fragment>
      ))}
      </div>
    </div>
  );
}
