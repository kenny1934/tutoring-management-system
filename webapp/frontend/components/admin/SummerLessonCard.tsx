"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp, X, AlertTriangle, Loader2, Trash2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, SUMMER_GRADE_TEXT, SUMMER_GRADE_BORDER, COURSE_TYPE_COLORS, LESSON_BADGE_COLORS, isNonAttending, sessionStatusBg } from "@/lib/summer-utils";
import { summerAPI } from "@/lib/api";
import { confirmDuplicateOrRetry, DUPLICATE_CANCELLED } from "@/lib/lesson-duplicate";
import { useToast } from "@/contexts/ToastContext";
import { LessonNumberPromptModal } from "@/components/admin/LessonNumberPromptModal";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import type { SummerLessonCalendarEntry, SummerLessonUpdate } from "@/types";

interface SummerLessonCardProps {
  lesson: SummerLessonCalendarEntry;
  onUpdateLesson: (lessonId: number, data: SummerLessonUpdate) => void;
  /** Regular drops pass undefined for lessonNumber (backend inherits from
   * the SummerLesson). Ad-hoc drops pass the admin-picked value (or null to
   * leave blank) collected via the drop prompt. */
  onDropStudent?: (
    applicationId: number,
    slotId: number,
    lessonId: number,
    lessonNumber?: number | null,
  ) => void;
  onRemoveSession?: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
  /** Called after a successful Make-up Slot delete or per-student edit so
   * the parent can revalidate SWR and drop the card from the grid. */
  onDeleted?: () => void;
  /** Post-publish rows open the session-detail popover in the parent — it
   * owns the popover portal and the useSession fetch. */
  onOpenSessionPopover?: (
    sessionLogId: number,
    clickPosition: { x: number; y: number },
  ) => void;
  /** Inclusive max for the lesson-number input (typically config.total_lessons). */
  totalLessons?: number;
  /** Briefly ring + scroll-into-view the card if one of its sessions matches.
   * `seq` lets the effect re-fire when the same session is targeted twice.
   * On match, the card auto-expands and the matching student row rings for
   * the same 2s as the card outline, so arrivals from the application modal
   * land directly on the relevant student. */
  highlightTarget?: {
    sessionId: number;
    seq: number;
  } | null;
}

function fillBarColor(pct: number): string {
  if (pct >= 1) return "bg-red-400 dark:bg-red-400/80";
  if (pct >= 0.75) return "bg-yellow-400 dark:bg-yellow-400/80";
  return "bg-green-400 dark:bg-green-400/80";
}

const AMBER_BADGE = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";

export function SummerLessonCard({
  lesson,
  onUpdateLesson,
  onDropStudent,
  onRemoveSession,
  onClickStudent,
  onOpenSessionPopover,
  onDeleted,
  totalLessons = 8,
  highlightTarget,
}: SummerLessonCardProps) {
  const { showToast } = useToast();
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingLesson, setEditingLesson] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lessonRef = useRef<HTMLInputElement>(null);
  // Pending ad-hoc drop: (appId) waiting on the lesson-number prompt.
  const [pendingAdhocDrop, setPendingAdhocDrop] = useState<number | null>(null);
  // Per-student lesson-number edit (expanded view).
  const [editingSession, setEditingSession] = useState<
    { id: number; current: number | null } | null
  >(null);

  const activeSessions = lesson.sessions;

  // Brief attention-ring when arriving from a placement-row click. Auto-clears
  // after 2s. Deps exclude lesson.sessions on purpose: SWR revalidates every
  // 30s and returns a fresh array each time — including it would re-fire the
  // highlight every refresh while calendarTarget is still set.
  const [highlightedSessionId, setHighlightedSessionId] = useState<number | null>(null);
  const isHighlighted = highlightedSessionId != null;
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightTarget) return;
    const matchingSession = lesson.sessions.find((s) => s.id === highlightTarget.sessionId);
    if (!matchingSession) return;
    setHighlightedSessionId(matchingSession.id);
    setExpanded(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const clearTimer = setTimeout(() => setHighlightedSessionId(null), 2000);
    return () => clearTimeout(clearTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightTarget?.seq, highlightTarget?.sessionId]);
  const attendingCount = activeSessions.filter((s) => !isNonAttending(s.session_status)).length;
  const isFull = attendingCount >= lesson.max_students;
  const fillPct = lesson.max_students > 0 ? attendingCount / lesson.max_students : 0;
  const isCancelled = lesson.lesson_status === "Cancelled";
  // Distinguish admin-created Make-up Slots (real SummerLesson, lesson_id > 0)
  // from synthetic cards emitted for off-grid rescheduled makeups
  // (lesson_id < 0, no backing SummerLesson — read-only).
  const isAdhoc = lesson.is_adhoc === true;
  const isSyntheticAdhoc = isAdhoc && lesson.lesson_id < 0;
  const isRealAdhoc = isAdhoc && lesson.lesson_id > 0;
  const canEditBadge = !isCancelled && !isSyntheticAdhoc;
  const canDrop = !!onDropStudent && !isSyntheticAdhoc;
  const showCapacity = !isSyntheticAdhoc;
  const canDelete = isRealAdhoc && activeSessions.length === 0 && !!onDeleted;

  // Ad-hoc cards have no meaningful default, so divergence there is noise.
  const divergentLessonNumbers = useMemo(
    () =>
      isAdhoc
        ? []
        : Array.from(
            new Set(
              activeSessions
                .filter((s) => s.lesson_number != null && s.lesson_number !== lesson.lesson_number)
                .map((s) => s.lesson_number as number),
            ),
          ).sort((a, b) => a - b),
    [isAdhoc, activeSessions, lesson.lesson_number],
  );
  const hasMixedSessions = divergentLessonNumbers.length > 0;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canDrop) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isFull && !isCancelled) setDragOver(true);
  }, [canDrop, isFull, isCancelled]);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!canDrop || !onDropStudent) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (isNaN(appId) || isFull || isCancelled) return;
      if (isRealAdhoc) {
        // Defer: prompt admin for the lesson number this student is covering
        // on this Make-up Slot before creating the session.
        setPendingAdhocDrop(appId);
      } else {
        onDropStudent(appId, lesson.slot_id, lesson.lesson_id);
      }
    },
    [canDrop, onDropStudent, isFull, isCancelled, isRealAdhoc, lesson.slot_id, lesson.lesson_id]
  );

  const handleAdhocDropConfirm = (lessonNumber: number | null) => {
    if (pendingAdhocDrop == null || !onDropStudent) return;
    onDropStudent(pendingAdhocDrop, lesson.slot_id, lesson.lesson_id, lessonNumber);
    setPendingAdhocDrop(null);
  };

  const commitLessonNumber = () => {
    const raw = lessonRef.current?.value ?? "";
    const trimmed = raw.trim();
    // Empty input on a card that already has a value → clear. This is the
    // only path back to NULL since None is "no change" in the backend schema.
    if (trimmed === "") {
      if (lesson.lesson_number) {
        onUpdateLesson(lesson.lesson_id, { clear_lesson_number: true });
      }
      setEditingLesson(false);
      return;
    }
    const val = parseInt(trimmed, 10);
    if (!isNaN(val) && val >= 1 && val <= totalLessons && val !== lesson.lesson_number) {
      onUpdateLesson(lesson.lesson_id, { lesson_number: val });
    }
    setEditingLesson(false);
  };

  const handlePerStudentLessonEdit = async (newValue: number | null) => {
    if (!editingSession) return;
    const trySave = (force: boolean) =>
      summerAPI.updateSessionLessonNumber(editingSession.id, {
        ...(newValue === null
          ? { clear_lesson_number: true }
          : { lesson_number: newValue }),
        ...(force ? { force_lesson_duplicate: true } : {}),
      });
    try {
      const result = await confirmDuplicateOrRetry(trySave);
      if (result === DUPLICATE_CANCELLED) {
        setEditingSession(null);
        return;
      }
      showToast("Lesson number updated.", "success");
      onDeleted?.(); // Reuse the refresh callback — it revalidates the calendar SWR.
    } catch (e: any) {
      showToast(e?.message || "Failed to update", "error");
    } finally {
      setEditingSession(null);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm("Delete this Make-up Slot?")) return;
    setDeleting(true);
    try {
      await summerAPI.deleteSlot(lesson.slot_id);
      showToast("Make-up Slot deleted.", "success");
      onDeleted?.();
    } catch (e: any) {
      showToast(e?.message || "Failed to delete", "error");
    } finally {
      setDeleting(false);
    }
  };

  const containerClass = isAdhoc
    ? "border-dashed border-amber-400 dark:border-amber-500/70 bg-amber-50/40 dark:bg-amber-900/10 border-l-gray-300"
    : dragOver
      ? "border-primary bg-primary/15"
      : cn(
          "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]",
          SUMMER_GRADE_BORDER[lesson.grade ?? ""] || "border-l-gray-300",
        );

  return (
    <div
      ref={rootRef}
      className={cn(
        "rounded border border-l-[3px] text-[11px] transition-all overflow-hidden",
        isCancelled && "opacity-50",
        containerClass,
        isHighlighted && "ring-2 ring-primary ring-offset-1 shadow-lg",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Row 1: Lesson badge + grade + course type + expand */}
      <div className="flex items-center gap-1 px-1 py-0.5 min-w-0">
        {/* Lesson number badge. Synthetic ad-hoc cards are read-only (no
            backing SummerLesson to PATCH); real ad-hoc + regular cards are
            click-to-edit. Shows "—" when no lesson_number is assigned. */}
        {canEditBadge && editingLesson ? (
          <input
            ref={lessonRef}
            type="number"
            defaultValue={lesson.lesson_number || undefined}
            min={1}
            max={totalLessons}
            className="w-6 h-5 text-[10px] text-center rounded-full border border-primary bg-white dark:bg-gray-800"
            autoFocus
            onBlur={commitLessonNumber}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLessonNumber();
              if (e.key === "Escape") setEditingLesson(false);
            }}
          />
        ) : (
          <button
            onClick={() => canEditBadge && setEditingLesson(true)}
            disabled={!canEditBadge}
            className={cn(
              "relative w-6 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors",
              isCancelled
                ? "bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 line-through"
                : isAdhoc
                ? cn(
                    AMBER_BADGE,
                    isRealAdhoc ? "hover:opacity-80" : "cursor-default",
                  )
                : (LESSON_BADGE_COLORS[lesson.grade ?? ""] || "bg-primary text-primary-foreground") + " hover:opacity-80"
            )}
            title={
              isSyntheticAdhoc
                ? lesson.lesson_number
                  ? `Make-up covering Lesson ${lesson.lesson_number}`
                  : "Make-up session"
                : isRealAdhoc
                ? lesson.lesson_number
                  ? `Make-up (Lesson ${lesson.lesson_number}) — click to edit`
                  : "Make-up — click to set lesson number"
                : hasMixedSessions
                ? `Lesson ${lesson.lesson_number} — click to edit\nMixed: some students covering L${divergentLessonNumbers.join(", L")}`
                : `Lesson ${lesson.lesson_number} — click to edit`
            }
          >
            {lesson.lesson_number || "—"}
            {hasMixedSessions && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 ring-1 ring-white dark:ring-gray-900"
              />
            )}
          </button>
        )}

        {/* Make-up tag replaces grade/course-type chips (neither applies). */}
        {isAdhoc ? (
          <span className="text-[9px] font-bold px-1 rounded bg-amber-200/60 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200">
            Make-up
          </span>
        ) : (
          <>
            {lesson.grade && (
              <span
                className={cn(
                  "text-[9px] font-bold px-1 rounded",
                  SUMMER_GRADE_BG[lesson.grade] || "bg-[#e8d4b8]/30 dark:bg-gray-700"
                )}
              >
                {lesson.grade}
              </span>
            )}

            {lesson.course_type && (
              <span className={cn(
                "text-[9px] font-bold px-0.5 rounded",
                COURSE_TYPE_COLORS[lesson.course_type] || "text-primary/70"
              )}>
                {lesson.course_type}
              </span>
            )}
          </>
        )}

        <div className="flex-1" />

        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0 disabled:opacity-50"
            title="Delete Make-up Slot"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Row 2: Tutor */}
      <div className="px-1 pb-0.5 text-[9px] text-muted-foreground dark:text-gray-300 text-center truncate">
        {lesson.tutor_name || "— tutor —"}
      </div>

      {/* Row 3: Capacity bar. Synthetic ad-hoc cards hide it (max_students
          mirrors count); real cards (regular + admin-created ad-hoc) show it. */}
      {showCapacity && (
        <div className="flex items-center gap-1 px-1 pb-0.5">
          <div className="flex-1 h-1.5 rounded-full bg-[#e8d4b8]/30 dark:bg-gray-700 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", fillBarColor(fillPct))}
              style={{ width: `${Math.min(fillPct * 100, 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
            {attendingCount}/{lesson.max_students}
          </span>
        </div>
      )}

      {/* Expanded: student list */}
      {expanded && (
        <div className="px-1.5 pb-1 space-y-0.5">
          {activeSessions.length === 0 && (
            <div className="text-[9px] text-muted-foreground italic py-1">
              No students assigned.
            </div>
          )}
          {activeSessions.map((s) => {
            const isPending = s.session_status.endsWith("- Pending Make-up");
            const isBooked = s.session_status.endsWith("- Make-up Booked");
            const isResolved = isPending || isBooked;
            // Per-row divergent L-badge: regular slots only, active rows
            // only. Matches the card-level dot's logic.
            const isDivergent =
              !isAdhoc &&
              !isResolved &&
              s.lesson_number != null &&
              s.lesson_number !== lesson.lesson_number;
            // Prefer the linked CSM student's canonical name; surface the
            // self-filled form value as a tooltip when the two diverge so
            // admins can still spot mismatches.
            const displayName = s.existing_student_name || s.student_name;
            const nameDiverges =
              !!s.existing_student_name &&
              s.existing_student_name !== s.student_name;
            const nameTooltip = isResolved
              ? s.session_status
              : nameDiverges
              ? `Application form name: ${s.student_name}`
              : "View details";
            const handleDivergentClick = (e: React.MouseEvent) => {
              if (s.session_log_id != null) {
                onOpenSessionPopover?.(s.session_log_id, {
                  x: e.clientX,
                  y: e.clientY,
                });
              } else {
                setEditingSession({ id: s.id, current: s.lesson_number ?? null });
              }
            };
            return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 min-w-0 transition-shadow",
                sessionStatusBg(s.session_status),
                isPending && "opacity-80",
                isBooked && "opacity-60",
                highlightedSessionId === s.id && "ring-2 ring-primary/60 ring-offset-1",
              )}
            >
              {isPending && (
                <span title={s.session_status}>
                  <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                </span>
              )}
              {isBooked && (
                <span title={s.session_status}>
                  <Loader2 className="h-3 w-3 text-gray-400 shrink-0" />
                </span>
              )}
              <div
                className={cn(
                  "flex-1 min-w-0",
                  isPending && "line-through text-orange-600 dark:text-orange-400",
                  isBooked && "line-through text-gray-500 dark:text-gray-400",
                )}
              >
                <StudentInfoBadges
                  compact
                  student={{
                    student_name: displayName,
                    school_student_id: s.school_student_id ?? undefined,
                    grade: s.grade,
                    lang_stream: s.lang_stream ?? undefined,
                  }}
                  nameTitle={nameTooltip}
                  onNameClick={() => onClickStudent?.(s.application_id)}
                />
              </div>
              {isDivergent && (
                <button
                  onClick={handleDivergentClick}
                  className={cn(
                    "text-[8px] font-bold px-1 rounded shrink-0 transition-opacity hover:opacity-80",
                    AMBER_BADGE,
                  )}
                  title={
                    s.session_log_id != null
                      ? `Covering Lesson ${s.lesson_number} (slot default: L${lesson.lesson_number}) — click for session details`
                      : `Covering Lesson ${s.lesson_number} (slot default: L${lesson.lesson_number}) — click to edit`
                  }
                >
                  L{s.lesson_number}
                </button>
              )}
              {s.session_log_id != null && !isResolved && (
                <button
                  onClick={(e) =>
                    onOpenSessionPopover?.(s.session_log_id!, {
                      x: e.clientX,
                      y: e.clientY,
                    })
                  }
                  className="p-0 text-muted-foreground/50 hover:text-foreground shrink-0 transition-colors"
                  title="View session details"
                >
                  <Eye className="h-3 w-3" />
                </button>
              )}
              {isRealAdhoc && (
                <button
                  onClick={() =>
                    setEditingSession({ id: s.id, current: s.lesson_number ?? null })
                  }
                  className={cn(
                    "text-[8px] font-bold px-1 rounded shrink-0 transition-opacity hover:opacity-80",
                    AMBER_BADGE,
                  )}
                  title={
                    s.lesson_number
                      ? `Lesson ${s.lesson_number} — click to edit`
                      : "Set lesson number for this student"
                  }
                >
                  L{s.lesson_number ?? "—"}
                </button>
              )}
              {onRemoveSession && (
                <button
                  onClick={() => onRemoveSession(s.id, s.student_name)}
                  className="p-0 text-muted-foreground hover:text-red-500 shrink-0"
                  title="Remove from this lesson"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
          })}
        </div>
      )}

      <LessonNumberPromptModal
        isOpen={pendingAdhocDrop != null}
        onClose={() => setPendingAdhocDrop(null)}
        onConfirm={handleAdhocDropConfirm}
        title="Lesson for this student"
        description="This Make-up Slot can host students covering different lessons. Leave blank to decide later."
        confirmLabel="Place"
        maxLesson={totalLessons}
      />
      <LessonNumberPromptModal
        isOpen={editingSession != null}
        onClose={() => setEditingSession(null)}
        onConfirm={handlePerStudentLessonEdit}
        title="Edit lesson number"
        description="Blank clears the lesson number for this student."
        initialValue={editingSession?.current ?? null}
        confirmLabel="Save"
        maxLesson={totalLessons}
      />
    </div>
  );
}
