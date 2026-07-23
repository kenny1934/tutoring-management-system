"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { RegularSlotCard, type RegularTutorOption } from "./RegularSlotCard";
import type { RegularDemandCell, RegularSlot, RegularSlotUpdate } from "@/types";

interface RegularSlotCellProps {
  day: string;
  timeSlot: string;
  demandCell?: RegularDemandCell;
  slots: RegularSlot[];
  grades: string[];
  tutors: RegularTutorOption[];
  readOnly?: boolean;
  onCreateSlot: (day: string, timeSlot: string) => void;
  onUpdateSlot: (slotId: number, data: RegularSlotUpdate) => void;
  onDeleteSlot: (slotId: number) => void;
  onDropStudent: (applicationId: number, slotId: number) => void;
  onUnassign: (applicationId: number, studentName: string) => void;
  onDropFailed?: (reason: string) => void;
  prefHighlight?: boolean;
  /** Mobile tap-to-place: when set, the cell + each inner slot card become
   * tap targets that fire onDropStudent with this appId. */
  pendingPlacementAppId?: number | null;
}

function heatColor(count: number): string {
  if (count === 0) return "bg-white dark:bg-[#1a1a1a]";
  if (count <= 3) return "bg-orange-50/60 dark:bg-orange-950/20";
  if (count <= 6) return "bg-orange-100/60 dark:bg-orange-900/25";
  if (count <= 10) return "bg-orange-200/50 dark:bg-orange-800/25";
  return "bg-orange-300/40 dark:bg-orange-700/25";
}

function compareRegularSlots(a: RegularSlot, b: RegularSlot): number {
  const gradeCmp = (a.grade ?? "").localeCompare(b.grade ?? "");
  if (gradeCmp !== 0) return gradeCmp;
  const tutorCmp = (a.tutor_name ?? "").localeCompare(b.tutor_name ?? "");
  if (tutorCmp !== 0) return tutorCmp;
  return a.id - b.id;
}

export const RegularSlotCell = memo(function RegularSlotCell({
  day,
  timeSlot,
  demandCell,
  slots,
  grades,
  tutors,
  readOnly = false,
  onCreateSlot,
  onUpdateSlot,
  onDeleteSlot,
  onDropStudent,
  onUnassign,
  onDropFailed,
  prefHighlight,
  pendingPlacementAppId,
}: RegularSlotCellProps) {
  const [dragOver, setDragOver] = useState(false);

  const sortedSlots = useMemo(() => [...slots].sort(compareRegularSlots), [slots]);

  const first = demandCell?.total_first_pref ?? 0;
  const second = demandCell?.total_second_pref ?? 0;
  const totalAssigned = slots.reduce((sum, s) => sum + s.assigned_count, 0);
  const remainingDemand = Math.max(0, first + second - totalAssigned);

  const demandTooltip = useMemo(() => {
    if (!demandCell || (first === 0 && second === 0)) return "No preferences for this slot";
    const parts: string[] = [];
    if (first > 0) {
      parts.push(`First choice: ${Object.entries(demandCell.by_grade_first).map(([g, n]) => `${g} x ${n}`).join(", ")}`);
    }
    if (second > 0) {
      parts.push(`Backup: ${Object.entries(demandCell.by_grade_second).map(([g, n]) => `${g} x ${n}`).join(", ")}`);
    }
    return parts.join(" | ");
  }, [demandCell, first, second]);

  // Drop target for the whole cell (assigns to first non-full slot)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    setDragOver(true);
  }, [readOnly]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const placeInFirstOpenSlot = useCallback((appId: number) => {
    const target = sortedSlots.find((s) => s.assigned_count < s.max_students);
    if (target) {
      onDropStudent(appId, target.id);
    } else if (sortedSlots.length > 0) {
      onDropFailed?.("All slots in this cell are full");
    } else {
      onDropFailed?.("Create a slot first");
    }
  }, [sortedSlots, onDropStudent, onDropFailed]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (isNaN(appId)) return;
      placeInFirstOpenSlot(appId);
    },
    [readOnly, placeInFirstOpenSlot]
  );

  // Cell-level tap mirrors the cell-level drop fallback (first non-full slot).
  const tapPlaceActive = pendingPlacementAppId != null && !readOnly;
  const handleTapPlace = useCallback(
    (e: React.MouseEvent) => {
      if (!tapPlaceActive) return;
      const target = e.target as HTMLElement;
      // Slot cards and the Add-slot button stop or own this tap themselves.
      if (target.closest("button")) return;
      placeInFirstOpenSlot(pendingPlacementAppId!);
    },
    [tapPlaceActive, pendingPlacementAppId, placeInFirstOpenSlot]
  );

  return (
    <div
      className={cn(
        "min-h-[72px] p-1.5 transition-colors relative",
        heatColor(remainingDemand),
        dragOver && "ring-2 ring-inset ring-primary",
        prefHighlight && !dragOver && "ring-2 ring-inset ring-primary/40 bg-primary/5"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={tapPlaceActive ? handleTapPlace : undefined}
    >
      {/* Compact demand badge */}
      <div className="mb-1 h-[13px]" title={demandTooltip}>
        {(first > 0 || second > 0) && (
          <span className="inline-flex items-baseline gap-1 text-[9px] leading-none tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{first} first choice</span>
            {second > 0 && <span>/ {second} backup</span>}
          </span>
        )}
      </div>

      {/* Slot cards */}
      <div className="space-y-1">
        {sortedSlots.map((slot) => (
          <RegularSlotCard
            key={slot.id}
            slot={slot}
            grades={grades}
            tutors={tutors}
            readOnly={readOnly}
            onUpdate={(data) => onUpdateSlot(slot.id, data)}
            onDelete={() => onDeleteSlot(slot.id)}
            onDropStudent={(appId) => onDropStudent(appId, slot.id)}
            onUnassign={onUnassign}
            pendingPlacementAppId={pendingPlacementAppId}
            onTapPlaceFailed={onDropFailed}
          />
        ))}
      </div>

      {/* Add slot button — more prominent when no slots yet */}
      {!readOnly && (
        <button
          onClick={() => onCreateSlot(day, timeSlot)}
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
      )}
    </div>
  );
});
