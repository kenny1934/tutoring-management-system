"use client";

import { useState, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, X, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, SUMMER_GRADE_TEXT, SUMMER_GRADE_BORDER, COURSE_TYPE_COLORS, LESSON_BADGE_COLORS, isNonAttending, sessionStatusBg } from "@/lib/summer-utils";
import type { SummerLessonCalendarEntry, SummerLessonUpdate } from "@/types";

interface SummerLessonCardProps {
  lesson: SummerLessonCalendarEntry;
  onUpdateLesson: (lessonId: number, data: SummerLessonUpdate) => void;
  onDropStudent?: (applicationId: number, slotId: number, lessonId: number) => void;
  onRemoveSession?: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
}

function fillBarColor(pct: number): string {
  if (pct >= 1) return "bg-red-400 dark:bg-red-400/80";
  if (pct >= 0.75) return "bg-yellow-400 dark:bg-yellow-400/80";
  return "bg-green-400 dark:bg-green-400/80";
}

export function SummerLessonCard({
  lesson,
  onUpdateLesson,
  onDropStudent,
  onRemoveSession,
  onClickStudent,
}: SummerLessonCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingLesson, setEditingLesson] = useState(false);
  const lessonRef = useRef<HTMLInputElement>(null);

  const activeSessions = lesson.sessions;
  const attendingCount = activeSessions.filter((s) => !isNonAttending(s.session_status)).length;
  const isFull = attendingCount >= lesson.max_students;
  const fillPct = lesson.max_students > 0 ? attendingCount / lesson.max_students : 0;
  const isCancelled = lesson.lesson_status === "Cancelled";
  const isAdhoc = lesson.is_adhoc === true;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!onDropStudent || isAdhoc) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isFull && !isCancelled) setDragOver(true);
  }, [onDropStudent, isFull, isCancelled, isAdhoc]);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onDropStudent || isAdhoc) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (!isNaN(appId) && !isFull && !isCancelled) {
        onDropStudent(appId, lesson.slot_id, lesson.lesson_id);
      }
    },
    [onDropStudent, isFull, isCancelled, isAdhoc, lesson.slot_id, lesson.lesson_id]
  );

  const commitLessonNumber = () => {
    const val = parseInt(lessonRef.current?.value ?? "");
    if (!isNaN(val) && val >= 1 && val <= 20 && val !== lesson.lesson_number) {
      onUpdateLesson(lesson.lesson_id, { lesson_number: val });
    }
    setEditingLesson(false);
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
      className={cn(
        "rounded border border-l-[3px] text-[11px] transition-all overflow-hidden",
        isCancelled && "opacity-50",
        containerClass,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Row 1: Lesson badge + grade + course type + expand */}
      <div className="flex items-center gap-1 px-1 py-0.5 min-w-0">
        {/* Lesson number badge. Ad-hoc cards have no underlying SummerLesson,
            so the badge is read-only and shows "—" when no live lesson_number. */}
        {!isAdhoc && editingLesson ? (
          <input
            ref={lessonRef}
            type="number"
            defaultValue={lesson.lesson_number}
            min={1}
            max={20}
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
            onClick={() => !isCancelled && !isAdhoc && setEditingLesson(true)}
            disabled={isAdhoc}
            className={cn(
              "w-6 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors",
              isCancelled
                ? "bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 line-through"
                : isAdhoc
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 cursor-default"
                : (LESSON_BADGE_COLORS[lesson.grade ?? ""] || "bg-primary text-primary-foreground") + " hover:opacity-80"
            )}
            title={
              isAdhoc
                ? lesson.lesson_number
                  ? `Make-up covering Lesson ${lesson.lesson_number}`
                  : "Make-up session"
                : `Lesson ${lesson.lesson_number} — click to edit`
            }
          >
            {lesson.lesson_number || "—"}
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

      {/* Row 3: Capacity bar — hidden for ad-hoc cards (no meaningful max). */}
      {!isAdhoc && (
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
            return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-1 text-[10px] rounded px-1 py-0.5",
                sessionStatusBg(s.session_status),
                isPending && "opacity-80",
                isBooked && "opacity-60",
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
              <button
                onClick={() => onClickStudent?.(s.application_id)}
                className={cn(
                  "truncate flex-1 text-left hover:text-primary hover:underline",
                  isPending && "line-through text-orange-600 dark:text-orange-400",
                  isBooked && "line-through text-gray-500 dark:text-gray-400",
                )}
                title={isResolved ? s.session_status : "View details"}
              >
                {s.student_name}
              </button>
              <span
                className={cn(
                  "text-[8px] font-bold px-0.5 rounded",
                  SUMMER_GRADE_BG[s.grade] || "bg-[#e8d4b8]/30 dark:bg-gray-700"
                )}
              >
                {s.grade}
              </span>
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
    </div>
  );
}
