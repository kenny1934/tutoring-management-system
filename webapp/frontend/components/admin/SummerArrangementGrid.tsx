"use client";

import { Fragment, useMemo } from "react";
import { SummerSlotCell } from "./SummerSlotCell";
import { DAY_ABBREV } from "@/lib/summer-utils";
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
        <div className="rounded-lg border border-orange-200/60 dark:border-orange-800/40 bg-orange-50/60 dark:bg-orange-900/20 px-4 py-3 text-sm text-orange-800 dark:text-orange-200">
          {hasDemand ? (
            <>Demand data loaded from applications. Click <strong>+ slot</strong> in any cell to create a class slot, then drag students from the panel on the right.</>
          ) : (
            <>No applications yet for this location. You can still create slots, or switch to the Applications tab to review incoming applications.</>
          )}
        </div>
      )}

      <div
        className="grid gap-px bg-[#e8d4b8]/40 dark:bg-[#6b5a4a]/40 border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden"
        style={{
          gridTemplateColumns: `40px repeat(${days.length}, minmax(110px, 1fr))`,
          gridTemplateRows: `36px repeat(${timeSlots.length}, auto)`,
          minWidth: `${40 + days.length * 110}px`,
        }}
      >
        {/* Header row: empty corner + day headers */}
        <div className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center text-xs font-medium text-muted-foreground sticky left-0 top-0 z-20">
          Time
        </div>
        {days.map((day) => (
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
            {days.map((day) => {
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
                  availableTutors={getAvailableTutors?.(day, ts)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
