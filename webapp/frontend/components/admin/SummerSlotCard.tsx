"use client";

import { useState, useCallback, useRef } from "react";
import { Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, SUMMER_GRADE_TEXT } from "@/lib/summer-utils";
import type { SummerSlot, SummerSlotUpdate } from "@/types";

interface SummerSlotCardProps {
  slot: SummerSlot;
  grades: string[];
  onUpdate: (data: SummerSlotUpdate) => void;
  onDelete: () => void;
  onDropStudent: (applicationId: number) => void;
  onRemovePlacement: (placementId: number) => void;
  onClickStudent?: (applicationId: number) => void;
}

function fillBarColor(pct: number): string {
  if (pct >= 1) return "bg-red-400 dark:bg-red-400/80";
  if (pct >= 0.75) return "bg-yellow-400 dark:bg-yellow-400/80";
  return "bg-green-400 dark:bg-green-400/80";
}

export function SummerSlotCard({
  slot,
  grades,
  onUpdate,
  onDelete,
  onDropStudent,
  onRemovePlacement,
  onClickStudent,
}: SummerSlotCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingMax, setEditingMax] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const maxRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
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

  const commitMax = () => {
    const val = parseInt(maxRef.current?.value ?? "");
    if (!isNaN(val) && val >= 1 && val <= 20 && val !== slot.max_students) {
      onUpdate({ max_students: val });
    }
    setEditingMax(false);
  };

  const commitLabel = () => {
    const val = labelRef.current?.value?.trim() ?? "";
    if (val !== (slot.slot_label ?? "")) {
      onUpdate({ slot_label: val || undefined });
    }
    setEditingLabel(false);
  };

  // Grade mix dots for collapsed view
  const gradeMix = slot.placements.reduce<Record<string, number>>((acc, p) => {
    acc[p.grade] = (acc[p.grade] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className={cn(
        "rounded border text-[11px] transition-all",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-card dark:bg-gray-800",
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
            slot.grade ? SUMMER_GRADE_BG[slot.grade] || "bg-gray-100 dark:bg-gray-700" : "bg-gray-100 dark:bg-gray-700 text-muted-foreground"
          )}
          title="Grade"
        >
          <option value="">--</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        {/* Course type toggle */}
        <button
          onClick={() => {
            const next = slot.course_type === "A" ? "B" : slot.course_type === "B" ? null : "A";
            onUpdate({ course_type: next });
          }}
          className={cn(
            "text-[9px] font-medium px-1 rounded transition-colors",
            slot.course_type
              ? "bg-primary/10 text-primary dark:bg-primary/20"
              : "bg-gray-100 dark:bg-gray-700 text-muted-foreground hover:text-foreground"
          )}
          title="Course type (click to toggle A/B)"
        >
          {slot.course_type || "·"}
        </button>

        {/* Label (click to edit) */}
        {editingLabel ? (
          <input
            ref={labelRef}
            defaultValue={slot.slot_label ?? ""}
            className="text-[9px] w-10 px-0.5 rounded border border-border bg-card dark:bg-gray-700"
            autoFocus
            onBlur={commitLabel}
            onKeyDown={(e) => { if (e.key === "Enter") commitLabel(); if (e.key === "Escape") setEditingLabel(false); }}
            placeholder="label"
          />
        ) : (
          <button
            onClick={() => setEditingLabel(true)}
            className="text-[9px] text-muted-foreground truncate max-w-[40px] hover:text-foreground hover:underline"
            title="Click to edit label"
          >
            {slot.slot_label || "…"}
          </button>
        )}

        {/* Fill bar */}
        <div className="flex-1 flex items-center gap-1 ml-1">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", fillBarColor(fillPct))}
              style={{ width: `${Math.min(fillPct * 100, 100)}%` }}
            />
          </div>
          {/* Clickable count to edit max */}
          {editingMax ? (
            <input
              ref={maxRef}
              type="number"
              defaultValue={slot.max_students}
              min={1}
              max={20}
              className="text-[9px] w-8 px-0.5 rounded border border-border bg-card dark:bg-gray-700 text-center"
              autoFocus
              onBlur={commitMax}
              onKeyDown={(e) => { if (e.key === "Enter") commitMax(); if (e.key === "Escape") setEditingMax(false); }}
            />
          ) : (
            <button
              onClick={() => setEditingMax(true)}
              className="text-[9px] text-muted-foreground whitespace-nowrap hover:text-foreground hover:underline"
              title="Click to edit max students"
            >
              {slot.placement_count}/{slot.max_students}
            </button>
          )}
        </div>

        {/* Grade mix dots (collapsed) */}
        {!expanded && slot.placement_count > 0 && (
          <span className="flex gap-0.5">
            {Object.entries(gradeMix).map(([g, c]) => (
              <span
                key={g}
                className={cn("text-[8px] font-bold", SUMMER_GRADE_TEXT[g] || "text-muted-foreground")}
                title={`${g}: ${c}`}
              >
                {c}
              </span>
            ))}
          </span>
        )}

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
                  : "bg-gray-50 dark:bg-gray-800/60"
              )}
            >
              <button
                onClick={() => onClickStudent?.(p.application_id)}
                className="truncate flex-1 text-left hover:text-primary hover:underline"
                title="View application details"
              >
                {p.student_name}
              </button>
              <span className={cn("text-[8px]", SUMMER_GRADE_BG[p.grade] || "")}>
                {p.grade}
              </span>
              {p.placement_status === "Tentative" && (
                <span className="text-[8px] text-yellow-600 dark:text-yellow-400">T</span>
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
