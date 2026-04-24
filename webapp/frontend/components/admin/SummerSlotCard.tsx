"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Trash2, X, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_TEXT, SUMMER_GRADE_BORDER, COURSE_TYPE_COLORS, sessionStatusBg, getMismatchedSessionGrades } from "@/lib/summer-utils";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { WorkflowStatusIcon } from "@/components/admin/SummerApplicationCard";
import type { AvailableTutor } from "@/types";
import type { SummerSlot, SummerSlotUpdate } from "@/types";

interface SummerSlotCardProps {
  slot: SummerSlot;
  grades: string[];
  onUpdate: (data: SummerSlotUpdate) => void;
  onDelete: () => void;
  onDropStudent: (applicationId: number) => void;
  onRemoveSession: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
  availableTutors?: AvailableTutor[];
  onConfirmSlot?: (slotId: number) => void;
  /** Briefly ring + auto-expand the card if one of its sessions matches the
   * given application. The matching student row also rings. Only the card
   * whose id equals `scrollSlotId` scrolls into view. `seq` re-fires the
   * effect on repeat selection of the same student. */
  highlightTarget?: {
    applicationId: number;
    scrollSlotId: number | null;
    seq: number;
  } | null;
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
  onRemoveSession,
  onClickStudent,
  availableTutors,
  onConfirmSlot,
  highlightTarget,
}: SummerSlotCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingMax, setEditingMax] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const maxRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isFull = slot.session_count >= slot.max_students;
  const fillPct = slot.max_students > 0 ? slot.session_count / slot.max_students : 0;
  // Find Slot / auto-suggest / grid grouping treat slot.grade as
  // authoritative, so surface any session whose student grade diverges.
  const mismatchedGrades = useMemo(
    () => getMismatchedSessionGrades(slot.grade, slot.sessions),
    [slot.grade, slot.sessions],
  );
  const hasGradeMismatch = mismatchedGrades.length > 0;

  // Search-jump highlight. Deps exclude slot.sessions on purpose: SWR
  // revalidates every 30s and returns a fresh array — including it would
  // re-fire the highlight each refresh while the same slotTarget stands.
  const [highlightedAppId, setHighlightedAppId] = useState<number | null>(null);
  useEffect(() => {
    if (!highlightTarget) return;
    const hasMatch = slot.sessions.some((p) => p.application_id === highlightTarget.applicationId);
    if (!hasMatch) return;
    setHighlightedAppId(highlightTarget.applicationId);
    setExpanded(true);
    if (highlightTarget.scrollSlotId === slot.id) {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    const clearTimer = setTimeout(() => setHighlightedAppId(null), 2000);
    return () => clearTimeout(clearTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTarget?.seq, highlightTarget?.applicationId]);
  const isHighlighted = highlightedAppId != null;

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
      onUpdate({ slot_label: val || null });
    }
    setEditingLabel(false);
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "rounded border border-l-[3px] text-[11px] transition-all overflow-hidden",
        dragOver
          ? "border-primary bg-primary/15"
          : "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]",
        !dragOver && (SUMMER_GRADE_BORDER[slot.grade ?? ""] || "border-l-gray-300"),
        isFull && "opacity-80",
        isHighlighted && "ring-2 ring-primary ring-offset-1 shadow-lg"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Row 1: Identity + actions */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 min-w-0">
        {/* Grade badge */}
        <select
          value={slot.grade || ""}
          onChange={(e) => onUpdate({ grade: e.target.value || null })}
          className={cn(
            "text-[10px] font-bold px-1 py-0 rounded border-0 cursor-pointer bg-[#fef9f3] dark:bg-[#2d2618] appearance-none",
            slot.grade ? SUMMER_GRADE_TEXT[slot.grade] || "text-foreground" : "text-muted-foreground"
          )}
          title="Grade"
        >
          <option value="">--</option>
          {grades.map((g) => (
            <option key={g} value={g} className={SUMMER_GRADE_TEXT[g] || ""}>{g}</option>
          ))}
        </select>

        {/* Course type toggle */}
        <button
          onClick={() => {
            const next = slot.course_type === "A" ? "B" : slot.course_type === "B" ? null : "A";
            onUpdate({ course_type: next });
          }}
          className={cn(
            "text-[9px] font-bold px-1 rounded transition-colors",
            slot.course_type
              ? COURSE_TYPE_COLORS[slot.course_type] || "bg-primary/10 text-primary"
              : "bg-[#fef9f3] dark:bg-[#2d2618] text-muted-foreground hover:text-foreground"
          )}
          title="Course type (click to toggle A/B)"
        >
          {slot.course_type || "·"}
        </button>

        {hasGradeMismatch && (
          <span
            title={`Contains ${mismatchedGrades.join(", ")} student${mismatchedGrades.length > 1 ? "s" : ""} in a ${slot.grade} slot`}
            className="shrink-0 flex items-center"
          >
            <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Mixed grades" />
          </span>
        )}

        <div className="flex-1" />

        {/* Action buttons — always visible */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <button
            onClick={onDelete}
            className="p-0.5 text-muted-foreground hover:text-red-500"
            title="Delete slot"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Row 2: Label + Tutor picker */}
      <div className="px-1 pb-0.5 flex items-center gap-1">
        {(slot.slot_label || editingLabel) && (
          editingLabel ? (
            <input
              ref={labelRef}
              defaultValue={slot.slot_label ?? ""}
              className="text-[9px] w-10 px-0.5 rounded border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white dark:bg-gray-800 shrink-0"
              autoFocus
              onBlur={commitLabel}
              onKeyDown={(e) => { if (e.key === "Enter") commitLabel(); if (e.key === "Escape") setEditingLabel(false); }}
              placeholder="label"
            />
          ) : (
            <button
              onClick={() => setEditingLabel(true)}
              className="text-[9px] text-muted-foreground shrink-0 hover:text-foreground hover:underline"
              title="Click to edit label"
            >
              {slot.slot_label}
            </button>
          )
        )}
        <select
          value={slot.tutor_id ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate({ tutor_id: val ? parseInt(val) : null });
          }}
          className="flex-1 min-w-0 text-[9px] px-0.5 py-0 rounded border-0 bg-[#fef9f3] dark:bg-[#2d2618] text-muted-foreground dark:text-gray-300 cursor-pointer appearance-none text-center"
          title="Assign tutor"
        >
          <option value="">— tutor —</option>
          {availableTutors?.filter((t) => t.onDuty).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Row 3: Capacity bar */}
      <div className="flex items-center gap-1 px-1 pb-0.5">
        <div className="flex-1 h-1.5 rounded-full bg-[#fef9f3] dark:bg-[#2d2618] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", fillBarColor(fillPct))}
            style={{ width: `${Math.min(fillPct * 100, 100)}%` }}
          />
        </div>
        {editingMax ? (
          <input
            ref={maxRef}
            type="number"
            defaultValue={slot.max_students}
            min={1}
            max={20}
            className="text-[9px] w-8 px-0.5 rounded border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white dark:bg-gray-800 text-center"
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
            {slot.session_count}/{slot.max_students}
          </button>
        )}
      </div>

      {/* Expanded: student list */}
      {expanded && (
        <div className="px-1.5 pb-1 space-y-0.5">
          <input
            defaultValue={slot.slot_label ?? ""}
            key={slot.slot_label}
            className="text-[9px] w-full px-1 py-0.5 rounded border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 bg-white dark:bg-gray-800"
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (slot.slot_label ?? "")) onUpdate({ slot_label: val || null });
            }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
            placeholder="Add label..."
          />
          {slot.sessions.length === 0 && (
            <div className="text-[9px] text-muted-foreground italic py-1">
              No students placed yet. Drag here to assign.
            </div>
          )}
          {slot.sessions.map((p) => {
            const displayName = p.existing_student_name || p.student_name;
            const nameDiverges =
              !!p.existing_student_name &&
              p.existing_student_name !== p.student_name;
            const nameTooltip = nameDiverges
              ? `Application form name: ${p.student_name}`
              : "View application details";
            const gradeMismatch = !!slot.grade && !!p.grade && p.grade !== slot.grade;
            return (
            <div
              key={p.id}
              className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 min-w-0",
                sessionStatusBg(p.session_status),
                highlightedAppId === p.application_id && "ring-2 ring-primary/60 ring-offset-1",
              )}
            >
              <div className="flex-1 min-w-0">
                <StudentInfoBadges
                  compact
                  student={{
                    student_name: displayName,
                    school_student_id: p.school_student_id ?? undefined,
                    grade: p.grade,
                    lang_stream: p.lang_stream ?? undefined,
                  }}
                  nameTitle={nameTooltip}
                  onNameClick={() => onClickStudent?.(p.application_id)}
                />
              </div>
              {gradeMismatch && (
                <span
                  title={`${p.grade} student in a ${slot.grade} slot`}
                  className="shrink-0 flex items-center"
                >
                  <AlertTriangle className="h-2.5 w-2.5 text-amber-500" aria-label="Grade mismatch" />
                </span>
              )}
              <WorkflowStatusIcon status={p.application_status} />
              <button
                onClick={() => onRemoveSession(p.id, p.student_name)}
                className="p-0 text-muted-foreground hover:text-red-500"
                title="Remove"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
            );
          })}
          {onConfirmSlot && slot.sessions.some((p) => p.session_status === "Tentative") && (
            <button
              onClick={() => onConfirmSlot(slot.id)}
              className="w-full text-[9px] font-medium text-green-700 dark:text-green-400 hover:underline mt-1 text-center"
            >
              Confirm all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
