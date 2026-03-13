"use client";

import { useState, useCallback } from "react";
import { Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummerSlot, SummerSlotUpdate } from "@/types";

interface SummerSlotCardProps {
  slot: SummerSlot;
  grades: string[];
  onUpdate: (data: SummerSlotUpdate) => void;
  onDelete: () => void;
  onDropStudent: (applicationId: number) => void;
  onRemovePlacement: (placementId: number) => void;
}

const GRADE_BG: Record<string, string> = {
  F1: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  F2: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  F3: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

function fillBarColor(pct: number): string {
  if (pct >= 1) return "bg-red-400 dark:bg-red-500";
  if (pct >= 0.75) return "bg-yellow-400 dark:bg-yellow-500";
  return "bg-green-400 dark:bg-green-500";
}

export function SummerSlotCard({
  slot,
  grades,
  onUpdate,
  onDelete,
  onDropStudent,
  onRemovePlacement,
}: SummerSlotCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isFull = slot.placement_count >= slot.max_students;
  const fillPct = slot.max_students > 0 ? slot.placement_count / slot.max_students : 0;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isFull) setDragOver(true);
  }, [isFull]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (!isNaN(appId) && !isFull) {
        onDropStudent(appId);
      }
    },
    [isFull, onDropStudent]
  );

  return (
    <div
      className={cn(
        "rounded border text-[11px] transition-all",
        dragOver
          ? "border-amber-400 bg-amber-50/50 dark:border-amber-500 dark:bg-amber-900/20"
          : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-850",
        isFull && "opacity-80"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header row */}
      <div className="flex items-center gap-1 px-1.5 py-1">
        {/* Grade badge */}
        <select
          value={slot.grade || ""}
          onChange={(e) => onUpdate({ grade: e.target.value || null })}
          className={cn(
            "text-[10px] font-bold px-1 py-0 rounded border-0 cursor-pointer appearance-none",
            slot.grade ? GRADE_BG[slot.grade] || "bg-gray-100 dark:bg-gray-700" : "bg-gray-100 dark:bg-gray-700 text-muted-foreground"
          )}
          title="Grade"
        >
          <option value="">--</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        {/* Course type badge */}
        {slot.course_type && (
          <span className="text-[9px] font-medium px-1 rounded bg-gray-100 dark:bg-gray-700">
            {slot.course_type}
          </span>
        )}

        {/* Label */}
        {slot.slot_label && (
          <span className="text-[9px] text-muted-foreground truncate max-w-[40px]">
            {slot.slot_label}
          </span>
        )}

        {/* Fill bar */}
        <div className="flex-1 flex items-center gap-1 ml-1">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", fillBarColor(fillPct))}
              style={{ width: `${Math.min(fillPct * 100, 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
            {slot.placement_count}/{slot.max_students}
          </span>
        </div>

        {/* Expand/collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-0.5 text-muted-foreground hover:text-red-500"
          title="Delete slot"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Tutor */}
      {slot.tutor_name && (
        <div className="px-1.5 pb-0.5 text-[9px] text-muted-foreground truncate">
          {slot.tutor_name}
        </div>
      )}

      {/* Expanded: student list */}
      {expanded && (
        <div className="px-1.5 pb-1 space-y-0.5">
          {slot.placements.length === 0 && (
            <div className="text-[9px] text-muted-foreground italic py-1">
              No students placed yet. Drag here to assign.
            </div>
          )}
          {slot.placements.map((p) => (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-1 text-[10px] rounded px-1 py-0.5",
                p.placement_status === "Confirmed"
                  ? "bg-green-50 dark:bg-green-900/20"
                  : "bg-gray-50 dark:bg-gray-800"
              )}
            >
              <span className="truncate flex-1">{p.student_name}</span>
              <span className={cn("text-[8px]", GRADE_BG[p.grade] || "")}>
                {p.grade}
              </span>
              {p.placement_status === "Tentative" && (
                <span className="text-[8px] text-yellow-600">T</span>
              )}
              <button
                onClick={() => onRemovePlacement(p.id)}
                className="p-0 text-muted-foreground hover:text-red-500"
                title="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
