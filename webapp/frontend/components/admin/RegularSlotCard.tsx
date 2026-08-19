"use client";

import { memo, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Trash2, X, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SUMMER_GRADE_TEXT, SUMMER_GRADE_BORDER, getMismatchedSessionGrades,
  getMismatchedStreams, foldStream, schoolGroupKey,
} from "@/lib/regular-utils";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { RegularWorkflowStatusIcon, regularStatusRowBg } from "./RegularApplicationCard";
import type { RegularSlot, RegularSlotUpdate } from "@/types";

export interface RegularTutorOption {
  id: number;
  name: string;
  /** Rostered for this cell's day and time. */
  onDuty?: boolean;
}

/** Prompt shown in place of a tutor list when nobody is rostered for a cell.
 *  Staffing runs off the duty roster, so an empty cell means the roster
 *  hasn't been filled in rather than that no tutor could take the class. */
const NO_DUTY_HINT = "No tutors on duty here. Set the roster with Tutor Duties in the header.";

interface RegularSlotCardProps {
  slot: RegularSlot;
  grades: string[];
  /** Selectable slot streams (C/E). Int is never a slot stream — it folds to E. */
  streams: string[];
  tutors: RegularTutorOption[];
  readOnly?: boolean;
  onUpdate: (data: RegularSlotUpdate) => void;
  onDelete: () => void;
  onDropStudent: (applicationId: number) => void;
  onUnassign: (applicationId: number, studentName: string) => void;
  /** Opens the application detail modal from an assigned student row. */
  onClickStudent?: (applicationId: number) => void;
  /** Mobile tap-to-place: when set, a tap anywhere on the card body funnels
   * into onDropStudent with this appId (or onTapPlaceFailed when full). */
  pendingPlacementAppId?: number | null;
  onTapPlaceFailed?: (reason: string) => void;
  /** Briefly ring + auto-expand the card when one of its students matches the
   * given application. The matching row rings too. Only the card whose id
   * equals `scrollSlotId` scrolls into view. `seq` re-fires the effect when
   * the same student is picked again. */
  highlightTarget?: {
    applicationId: number;
    scrollSlotId: number | null;
    seq: number;
  } | null;
  /** Schoolmate highlight: the selected school key (canonical code or folded
   * spelling). Cards holding a matching student open to show them and ring the
   * matching rows; cards with none recede. */
  schoolHighlight?: string | null;
}

function fillBarColor(pct: number): string {
  if (pct >= 1) return "bg-red-400 dark:bg-red-400/80";
  if (pct >= 0.75) return "bg-yellow-400 dark:bg-yellow-400/80";
  return "bg-green-400 dark:bg-green-400/80";
}

export const RegularSlotCard = memo(function RegularSlotCard({
  slot,
  grades,
  streams,
  tutors,
  readOnly = false,
  onUpdate,
  onDelete,
  onDropStudent,
  onUnassign,
  onClickStudent,
  pendingPlacementAppId,
  onTapPlaceFailed,
  highlightTarget,
  schoolHighlight,
}: RegularSlotCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingMax, setEditingMax] = useState(false);
  const maxRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const isFull = slot.assigned_count >= slot.max_students;
  const fillPct = slot.max_students > 0 ? slot.assigned_count / slot.max_students : 0;
  // The grid groups by slot.grade + stream, so surface any assigned student
  // whose own grade or stream diverges from it rather than letting the row hide
  // in a collapsed card.
  const mismatchedGrades = useMemo(
    () => getMismatchedSessionGrades(slot.grade, slot.students),
    [slot.grade, slot.students],
  );
  const mismatchedStreams = useMemo(
    () => getMismatchedStreams(slot.lang_stream, slot.students),
    [slot.lang_stream, slot.students],
  );
  const hasGradeMismatch = mismatchedGrades.length > 0;
  const hasStreamMismatch = mismatchedStreams.length > 0;
  const mismatchTitle = [
    hasGradeMismatch
      ? `Contains ${mismatchedGrades.join(", ")} student${mismatchedGrades.length > 1 ? "s" : ""} in a ${slot.grade} slot`
      : null,
    hasStreamMismatch
      ? `Contains ${mismatchedStreams.join(", ")}-stream student${mismatchedStreams.length > 1 ? "s" : ""} in a ${foldStream(slot.lang_stream)} slot`
      : null,
  ].filter(Boolean).join(". ");

  // Only rostered tutors can staff a slot, same rule as summer.
  const onDutyTutors = useMemo(() => tutors.filter((t) => t.onDuty), [tutors]);

  // Schoolmate highlight: a card holding a match opens so the matching rows
  // are visible; a card holding none recedes the way filtered-out cells do.
  const hasSchoolMatch =
    !!schoolHighlight && slot.students.some((s) => schoolGroupKey(s) === schoolHighlight);
  const schoolDimmed = !!schoolHighlight && !hasSchoolMatch;

  // One line summarising who is in the class by school, e.g. "PCMS ×3 ·
  // SRL-E ×2". Recognised schools show their code; unrecognised spellings
  // count under their folded form. Students with no school are left out.
  const schoolComposition = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of slot.students) {
      const key = schoolGroupKey(s);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, n]) => (n > 1 ? `${key} ×${n}` : key))
      .join(" · ");
  }, [slot.students]);

  // Search-jump highlight. Deps exclude slot.students on purpose: SWR
  // revalidates every 30s and returns a fresh array, which would re-fire the
  // highlight on each refresh while the same target stands.
  const [highlightedAppId, setHighlightedAppId] = useState<number | null>(null);
  useEffect(() => {
    if (!highlightTarget) return;
    const hasMatch = slot.students.some((s) => s.application_id === highlightTarget.applicationId);
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
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isFull) setDragOver(true);
  }, [readOnly, isFull]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (isNaN(appId)) return;
      if (isFull) {
        onTapPlaceFailed?.("This slot is full");
        return;
      }
      onDropStudent(appId);
    },
    [readOnly, isFull, onDropStudent, onTapPlaceFailed]
  );

  const tapPlaceActive = pendingPlacementAppId != null && !readOnly;
  const handleTapPlace = useCallback(
    (e: React.MouseEvent) => {
      if (!tapPlaceActive) return;
      // Skip when the tap landed on an inner control (delete, expand,
      // grade/tutor selects, capacity edit) so those keep working in tap mode.
      const target = e.target as HTMLElement;
      if (target.closest("button, select, input")) return;
      e.stopPropagation();
      if (isFull) {
        onTapPlaceFailed?.("This slot is full");
        return;
      }
      onDropStudent(pendingPlacementAppId!);
    },
    [tapPlaceActive, isFull, pendingPlacementAppId, onDropStudent, onTapPlaceFailed]
  );

  const commitMax = () => {
    const val = parseInt(maxRef.current?.value ?? "");
    if (!isNaN(val) && val >= 1 && val <= 20 && val !== slot.max_students) {
      onUpdate({ max_students: val });
    }
    setEditingMax(false);
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
        schoolDimmed && "opacity-40",
        isHighlighted && "ring-2 ring-primary ring-offset-1 shadow-lg",
        tapPlaceActive && !isFull && "ring-2 ring-primary/60 ring-offset-1 cursor-pointer",
        tapPlaceActive && isFull && "ring-2 ring-red-300/60 ring-offset-1 cursor-not-allowed"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={tapPlaceActive ? handleTapPlace : undefined}
    >
      {/* Row 1: grade + stream + actions */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 min-w-0">
        {readOnly ? (
          <span
            className={cn(
              "text-[10px] font-bold px-1 py-0 rounded bg-[#fef9f3] dark:bg-[#2d2618]",
              slot.grade ? SUMMER_GRADE_TEXT[slot.grade] || "text-foreground" : "text-muted-foreground"
            )}
            title="Grade and stream"
          >
            {slot.grade || slot.lang_stream ? `${slot.grade ?? ""}${slot.lang_stream ?? ""}` : "Any"}
          </span>
        ) : (
          <>
            <select
              value={slot.grade || ""}
              onChange={(e) => onUpdate({ grade: e.target.value || null })}
              className={cn(
                "text-[10px] font-bold px-1 py-0 rounded border-0 cursor-pointer bg-[#fef9f3] dark:bg-[#2d2618] appearance-none",
                slot.grade ? SUMMER_GRADE_TEXT[slot.grade] || "text-foreground" : "text-muted-foreground"
              )}
              title="Grade"
            >
              <option value="">Any</option>
              {grades.map((g) => (
                <option key={g} value={g} className={SUMMER_GRADE_TEXT[g] || ""}>{g}</option>
              ))}
            </select>
            <select
              value={slot.lang_stream || ""}
              onChange={(e) => onUpdate({ lang_stream: e.target.value || null })}
              className={cn(
                "text-[10px] font-bold px-0.5 py-0 rounded border-0 cursor-pointer bg-[#fef9f3] dark:bg-[#2d2618] appearance-none",
                slot.lang_stream ? "text-foreground" : "text-muted-foreground"
              )}
              title="Stream"
            >
              <option value="">Any</option>
              {streams.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}

        {(hasGradeMismatch || hasStreamMismatch) && (
          <span
            title={mismatchTitle}
            className="shrink-0 flex items-center"
          >
            <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Mixed grade or stream" />
          </span>
        )}

        <div className="flex-1" />

        <div className="flex items-center shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-muted-foreground hover:text-foreground"
            title={expanded ? "Collapse student list" : "Show assigned students"}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {!readOnly && (
            <button
              onClick={onDelete}
              className="p-0.5 text-muted-foreground hover:text-red-500"
              title="Delete slot"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: tutor picker */}
      <div className="px-1 pb-0.5 flex items-center gap-1">
        {readOnly ? (
          <span className="flex-1 min-w-0 text-[9px] px-0.5 py-0 rounded bg-[#fef9f3] dark:bg-[#2d2618] text-muted-foreground dark:text-gray-300 text-center truncate">
            {slot.tutor_name || "No tutor"}
          </span>
        ) : onDutyTutors.length === 0 ? (
          <span
            className="flex-1 min-w-0 text-[9px] px-0.5 py-0 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-center truncate"
            title={NO_DUTY_HINT}
          >
            {slot.tutor_name || "Set duties first"}
          </span>
        ) : (
          <select
            value={slot.tutor_id ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              onUpdate({ tutor_id: val ? parseInt(val) : null });
            }}
            className="flex-1 min-w-0 text-[9px] px-0.5 py-0 rounded border-0 bg-[#fef9f3] dark:bg-[#2d2618] text-muted-foreground dark:text-gray-300 cursor-pointer appearance-none text-center"
            title="Assign tutor"
          >
            <option value="">No tutor</option>
            {onDutyTutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Row 3: capacity bar */}
      <div className="flex items-center gap-1 px-1 pb-0.5">
        <div className="flex-1 h-1.5 rounded-full bg-[#fef9f3] dark:bg-[#2d2618] overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", fillBarColor(fillPct))}
            style={{ width: `${Math.min(fillPct * 100, 100)}%` }}
          />
        </div>
        {readOnly ? (
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
            {slot.assigned_count}/{slot.max_students}
          </span>
        ) : editingMax ? (
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
            title="Click to edit capacity"
          >
            {slot.assigned_count}/{slot.max_students}
          </button>
        )}
      </div>

      {/* Expanded: assigned student list. A schoolmate match forces the list
          open so the highlighted rows are actually visible. */}
      {(expanded || hasSchoolMatch) && (
        <div className="px-1.5 pb-1 space-y-0.5">
          {slot.students.length === 0 && (
            <div className="text-[9px] text-muted-foreground italic py-1">
              {readOnly ? "No students assigned." : "No students assigned yet. Drag here to assign."}
            </div>
          )}
          {schoolComposition && (
            <div
              className="text-[9px] text-muted-foreground truncate"
              title={`Schools in this class: ${schoolComposition}`}
            >
              {schoolComposition}
            </div>
          )}
          {slot.students.map((s) => {
            const gradeMismatch = !!slot.grade && !!s.grade && s.grade !== slot.grade;
            const slotStream = foldStream(slot.lang_stream);
            const studentStream = foldStream(s.lang_stream);
            const streamMismatch = !!slotStream && !!studentStream && studentStream !== slotStream;
            const rowMismatchTitle = [
              gradeMismatch ? `${s.grade} student in a ${slot.grade} slot` : null,
              streamMismatch ? `${studentStream}-stream student in a ${slotStream} slot` : null,
            ].filter(Boolean).join(". ");
            const isSchoolmate = !!schoolHighlight && schoolGroupKey(s) === schoolHighlight;
            return (
              <div
                key={s.application_id}
                className={cn(
                  "flex items-center gap-1 rounded px-1 py-0.5 min-w-0",
                  regularStatusRowBg(s.application_status),
                  (highlightedAppId === s.application_id || isSchoolmate) &&
                    "ring-2 ring-primary/60 ring-offset-1",
                  !!schoolHighlight && !isSchoolmate && "opacity-40",
                )}
              >
                <div className="flex-1 min-w-0">
                  <StudentInfoBadges
                    compact
                    gradeIsEntering
                    student={{
                      student_name: s.student_name,
                      school_student_id: s.school_student_id ?? undefined,
                      grade: s.grade,
                      // Fold Int into E so the badge colours as English, never grey.
                      lang_stream: studentStream ?? undefined,
                    }}
                    nameTitle={s.school || "View application details"}
                    onNameClick={onClickStudent ? () => onClickStudent(s.application_id) : undefined}
                  />
                </div>
                {(gradeMismatch || streamMismatch) && (
                  <span
                    title={rowMismatchTitle}
                    className="shrink-0 flex items-center"
                  >
                    <AlertTriangle className="h-2.5 w-2.5 text-amber-500" aria-label="Grade or stream mismatch" />
                  </span>
                )}
                {s.published ? (
                  <span className="shrink-0 flex items-center" title="Published as an enrollment">
                    <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </span>
                ) : (
                  <RegularWorkflowStatusIcon status={s.application_status} />
                )}
                {!readOnly && !s.published && (
                  <button
                    onClick={() => onUnassign(s.application_id, s.student_name)}
                    className="p-0 text-muted-foreground hover:text-red-500"
                    title="Unassign"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
