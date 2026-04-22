"use client";

import { useState, useCallback } from "react";
import { Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_TEXT } from "@/lib/summer-utils";
import { SummerSlotCard } from "./SummerSlotCard";
import type { AvailableTutor } from "@/types";
import type { SummerDemandCell, SummerSlot, SummerSlotUpdate } from "@/types";

export interface DemandBarFilter {
  day: string;
  timeSlot: string;
  grade: string;
  tier: "first" | "second";
}

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
  onRemoveSession: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
  onDropFailed?: (reason: string) => void;
  prefHighlight?: boolean;
  buddyHighlight?: boolean;
  gradeMaxDemand?: number;
  availableTutors?: AvailableTutor[];
  onConfirmSlot?: (slotId: number) => void;
  onDemandBarClick?: (filter: DemandBarFilter) => void;
  slotHighlightTarget?: {
    applicationId: number;
    scrollSlotId: number | null;
    seq: number;
  } | null;
}

// Solid fill (1st pref) and light fill (2nd pref) for demand sparklines per grade
const GRADE_BAR_FILL: Record<string, { solid: string; light: string }> = {
  F1: { solid: "bg-blue-400", light: "bg-blue-200 dark:bg-blue-800" },
  F2: { solid: "bg-purple-400", light: "bg-purple-200 dark:bg-purple-800" },
  F3: { solid: "bg-orange-400", light: "bg-orange-200 dark:bg-orange-800" },
};
const GRADE_BAR_DEFAULT = { solid: "bg-gray-400", light: "bg-gray-200 dark:bg-gray-700" };

function heatColor(count: number): string {
  if (count === 0) return "bg-white dark:bg-[#1a1a1a]";
  if (count <= 3) return "bg-orange-50/60 dark:bg-orange-950/20";
  if (count <= 6) return "bg-orange-100/60 dark:bg-orange-900/25";
  if (count <= 10) return "bg-orange-200/50 dark:bg-orange-800/25";
  return "bg-orange-300/40 dark:bg-orange-700/25";
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
  onRemoveSession,
  onClickStudent,
  onDropFailed,
  prefHighlight,
  buddyHighlight,
  gradeMaxDemand = 1,
  availableTutors,
  onConfirmSlot,
  onDemandBarClick,
  slotHighlightTarget,
}: SummerSlotCellProps) {
  const [dragOver, setDragOver] = useState(false);

  const totalDemand = (demandCell?.total_first_pref ?? 0) + (demandCell?.total_second_pref ?? 0);
  const totalPlaced = slots.reduce((sum, s) => sum + s.session_count, 0);
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
      const target = slots.find((s) => s.session_count < s.max_students);
      if (target) {
        onDropStudent(appId, target.id);
      } else if (slots.length > 0) {
        onDropFailed?.("All slots in this cell are full");
      } else {
        onDropFailed?.("Create a slot first");
      }
    },
    [slots, onDropStudent, onDropFailed]
  );

  return (
    <div
      className={cn(
        "min-h-[80px] p-1.5 transition-colors relative",
        heatColor(remainingDemand),
        dragOver && "ring-2 ring-inset ring-primary",
        prefHighlight && !dragOver && "ring-2 ring-inset ring-primary/40 bg-primary/5",
        buddyHighlight && !dragOver && !prefHighlight && "ring-1 ring-inset ring-violet-400/50 bg-violet-50/30 dark:bg-violet-900/10"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {buddyHighlight && (
        <div className="absolute top-0.5 right-0.5 z-10" title="Buddy placed here">
          <Users className="h-3 w-3 text-violet-400" />
        </div>
      )}

      {/* Demand sparklines: always rendered to keep vertical alignment across cells */}
      <div className="mb-1 space-y-px">
        {grades.map((grade) => {
          const first = demandCell?.by_grade_first[grade] ?? 0;
          const second = demandCell?.by_grade_second[grade] ?? 0;
          const total = first + second;
          const colors = GRADE_BAR_FILL[grade] || GRADE_BAR_DEFAULT;
          const barPct = gradeMaxDemand > 0 && total > 0 ? (total / gradeMaxDemand) * 100 : 0;
          const firstPct = total > 0 ? (first / total) * 100 : 0;
          return (
            <div key={grade} className="flex items-center gap-0.5 h-[7px]" title={total > 0 ? `${grade}: ${first} first choice, ${second} second choice` : `${grade}: no demand`}>
              <span className={cn("text-[8px] font-bold w-[14px] shrink-0 text-center leading-none", total > 0 ? SUMMER_GRADE_TEXT[grade] : "text-muted-foreground/30")}>
                {grade}
              </span>
              <div className="flex-1 h-1.5 flex">
                {barPct > 0 && (
                  <>
                    {first > 0 && (
                      <div
                        className={cn(
                          "h-full rounded-l-sm", second === 0 && "rounded-r-sm", colors.solid,
                          onDemandBarClick && "cursor-pointer hover:opacity-80"
                        )}
                        style={{ width: `${firstPct * barPct / 100}%` }}
                        onClick={onDemandBarClick ? (e) => { e.stopPropagation(); onDemandBarClick({ day, timeSlot, grade, tier: "first" }); } : undefined}
                      />
                    )}
                    {second > 0 && (
                      <div
                        className={cn(
                          "h-full rounded-r-sm", first === 0 && "rounded-l-sm", colors.light,
                          onDemandBarClick && "cursor-pointer hover:opacity-80"
                        )}
                        style={{ width: `${(100 - firstPct) * barPct / 100}%` }}
                        onClick={onDemandBarClick ? (e) => { e.stopPropagation(); onDemandBarClick({ day, timeSlot, grade, tier: "second" }); } : undefined}
                      />
                    )}
                  </>
                )}
              </div>
              <span className={cn("text-[8px] tabular-nums w-3 shrink-0 text-right leading-none", total > 0 ? "text-muted-foreground" : "text-muted-foreground/30")}>
                {total || ""}
              </span>
            </div>
          );
        })}
      </div>

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
            onRemoveSession={onRemoveSession}
            onClickStudent={onClickStudent}
            availableTutors={availableTutors}
            onConfirmSlot={onConfirmSlot}
            highlightTarget={slotHighlightTarget}
          />
        ))}
      </div>

      {/* Add slot button — more prominent when no slots yet */}
      <button
        onClick={onCreateSlot}
        className={cn(
          "mt-1 w-full flex items-center justify-center gap-1 rounded transition-colors",
          slots.length === 0
            ? "py-2 text-xs border border-dashed border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/10"
            : "py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-primary/10"
        )}
      >
        <Plus className={slots.length === 0 ? "h-3.5 w-3.5" : "h-3 w-3"} />
        {slots.length === 0 ? "Add slot" : "slot"}
      </button>
    </div>
  );
}
