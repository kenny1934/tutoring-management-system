"use client";

import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SummerSlotCard } from "./SummerSlotCard";
import type { SummerDemandCell, SummerSlot, SummerSlotUpdate } from "@/types";

interface SummerSlotCellProps {
  day: string;
  timeSlot: string;
  demandCell?: SummerDemandCell;
  slots: SummerSlot[];
  grades: string[];
  onCreateSlot: () => void;
  onUpdateSlot: (slotId: number, data: SummerSlotUpdate) => void;
  onDeleteSlot: (slotId: number) => void;
  onDropStudent: (applicationId: number, slotId: number) => void;
  onRemovePlacement: (placementId: number) => void;
  onDropFailed?: (reason: string) => void;
}

const GRADE_COLORS: Record<string, string> = {
  F1: "text-blue-600 dark:text-blue-400",
  F2: "text-purple-600 dark:text-purple-400",
  F3: "text-orange-600 dark:text-orange-400",
};

function heatColor(count: number): string {
  if (count === 0) return "bg-white dark:bg-gray-900";
  if (count <= 3) return "bg-amber-50 dark:bg-amber-950/30";
  if (count <= 6) return "bg-amber-100 dark:bg-amber-900/30";
  if (count <= 10) return "bg-amber-200/70 dark:bg-amber-800/30";
  return "bg-amber-300/60 dark:bg-amber-700/30";
}

export function SummerSlotCell({
  day,
  timeSlot,
  demandCell,
  slots,
  grades,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
  onDropStudent,
  onRemovePlacement,
  onDropFailed,
}: SummerSlotCellProps) {
  const [dragOver, setDragOver] = useState(false);

  const totalDemand = (demandCell?.total_first_pref ?? 0) + (demandCell?.total_second_pref ?? 0);
  const totalPlaced = slots.reduce((sum, s) => sum + s.placement_count, 0);
  const remainingDemand = Math.max(0, totalDemand - totalPlaced);

  // Drop target for the whole cell (assigns to first non-full slot)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (isNaN(appId)) return;

      // Find first non-full slot in this cell
      const target = slots.find((s) => s.placement_count < s.max_students);
      if (target) {
        onDropStudent(appId, target.id);
      } else if (slots.length > 0) {
        onDropFailed?.("All slots in this cell are full");
      } else {
        onDropFailed?.("Create a slot first");
      }
    },
    [slots, onDropStudent]
  );

  return (
    <div
      className={cn(
        "min-h-[80px] p-1.5 transition-colors relative",
        heatColor(remainingDemand),
        dragOver && "ring-2 ring-inset ring-amber-400 dark:ring-amber-500"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Demand badge */}
      {demandCell && totalDemand > 0 && (
        <div className="flex items-center gap-1.5 mb-1 text-[10px] leading-tight">
          <span className="text-muted-foreground">
            {demandCell.total_first_pref > 0 && (
              <span title="1st preference count">{demandCell.total_first_pref}①</span>
            )}
            {demandCell.total_second_pref > 0 && (
              <span title="2nd preference count" className="ml-0.5">
                {demandCell.total_second_pref}②
              </span>
            )}
          </span>
          {/* Grade breakdown (combined 1st + 2nd) */}
          <span className="flex gap-1">
            {(() => {
              const combined: Record<string, number> = {};
              for (const [g, c] of Object.entries(demandCell.by_grade_first)) {
                combined[g] = (combined[g] ?? 0) + c;
              }
              for (const [g, c] of Object.entries(demandCell.by_grade_second)) {
                combined[g] = (combined[g] ?? 0) + c;
              }
              return Object.entries(combined).map(([grade, count]) => (
                <span key={grade} className={cn("font-medium", GRADE_COLORS[grade])}>
                  {grade}:{count}
                </span>
              ));
            })()}
          </span>
        </div>
      )}

      {/* Slot cards */}
      <div className="space-y-1">
        {slots.map((slot) => (
          <SummerSlotCard
            key={slot.id}
            slot={slot}
            grades={grades}
            onUpdate={(data) => onUpdateSlot(slot.id, data)}
            onDelete={() => onDeleteSlot(slot.id)}
            onDropStudent={(appId) => onDropStudent(appId, slot.id)}
            onRemovePlacement={onRemovePlacement}
          />
        ))}
      </div>

      {/* Add slot button — more prominent when no slots yet */}
      <button
        onClick={onCreateSlot}
        className={cn(
          "mt-1 w-full flex items-center justify-center gap-1 rounded transition-colors",
          slots.length === 0
            ? "py-2 text-xs border border-dashed border-gray-300 dark:border-gray-600 text-muted-foreground hover:text-foreground hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            : "py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800"
        )}
      >
        <Plus className={slots.length === 0 ? "h-3.5 w-3.5" : "h-3 w-3"} />
        {slots.length === 0 ? "Add slot" : "slot"}
      </button>
    </div>
  );
}
