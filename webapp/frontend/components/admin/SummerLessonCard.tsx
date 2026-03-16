"use client";

import { useState, useCallback, useRef } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUMMER_GRADE_BG, SUMMER_GRADE_TEXT } from "@/lib/summer-utils";
import type { SummerLessonCalendarEntry, SummerLessonUpdate } from "@/types";

interface SummerLessonCardProps {
  lesson: SummerLessonCalendarEntry;
  onUpdateLesson: (lessonId: number, data: SummerLessonUpdate) => void;
  onDropStudent: (applicationId: number, slotId: number, lessonId: number) => void;
  onRemoveSession: (sessionId: number) => void;
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
  const sessionCount = activeSessions.length;
  const isFull = sessionCount >= lesson.max_students;
  const fillPct = lesson.max_students > 0 ? sessionCount / lesson.max_students : 0;
  const isCancelled = lesson.lesson_status === "Cancelled";

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isFull && !isCancelled) setDragOver(true);
  }, [isFull, isCancelled]);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const appId = parseInt(e.dataTransfer.getData("application-id"));
      if (!isNaN(appId) && !isFull && !isCancelled) {
        onDropStudent(appId, lesson.slot_id, lesson.lesson_id);
      }
    },
    [isFull, isCancelled, onDropStudent, lesson.slot_id, lesson.lesson_id]
  );

  const commitLessonNumber = () => {
    const val = parseInt(lessonRef.current?.value ?? "");
    if (!isNaN(val) && val >= 1 && val <= 20 && val !== lesson.lesson_number) {
      onUpdateLesson(lesson.lesson_id, { lesson_number: val });
    }
    setEditingLesson(false);
  };

  return (
    <div
      className={cn(
        "rounded border text-[11px] transition-all overflow-hidden",
        isCancelled && "opacity-50",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border bg-card dark:bg-gray-800",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Row 1: Lesson badge + grade + tutor + expand */}
      <div className="flex items-center gap-1 px-1 py-0.5 min-w-0">
        {/* Lesson number badge */}
        {editingLesson ? (
          <input
            ref={lessonRef}
            type="number"
            defaultValue={lesson.lesson_number}
            min={1}
            max={20}
            className="w-6 h-5 text-[10px] text-center rounded-full border border-primary bg-card dark:bg-gray-700"
            autoFocus
            onBlur={commitLessonNumber}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLessonNumber();
              if (e.key === "Escape") setEditingLesson(false);
            }}
          />
        ) : (
          <button
            onClick={() => !isCancelled && setEditingLesson(true)}
            className={cn(
              "w-6 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors",
              isCancelled
                ? "bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 line-through"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            )}
            title={`Lesson ${lesson.lesson_number} — click to edit`}
          >
            {lesson.lesson_number}
          </button>
        )}

        {/* Grade badge */}
        {lesson.grade && (
          <span
            className={cn(
              "text-[9px] font-bold px-1 rounded",
              SUMMER_GRADE_BG[lesson.grade] || "bg-gray-100 dark:bg-gray-700"
            )}
          >
            {lesson.grade}
          </span>
        )}

        {/* Course type */}
        {lesson.course_type && (
          <span className="text-[9px] text-primary/70 font-medium">
            {lesson.course_type}
          </span>
        )}

        {/* Tutor name */}
        {lesson.tutor_name && (
          <span className="text-[9px] text-muted-foreground truncate">
            {lesson.tutor_name}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Row 2: Capacity bar */}
      <div className="flex items-center gap-1 px-1 pb-0.5">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", fillBarColor(fillPct))}
            style={{ width: `${Math.min(fillPct * 100, 100)}%` }}
          />
        </div>
        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
          {sessionCount}/{lesson.max_students}
        </span>
      </div>

      {/* Expanded: student list */}
      {expanded && (
        <div className="px-1.5 pb-1 space-y-0.5">
          {activeSessions.length === 0 && (
            <div className="text-[9px] text-muted-foreground italic py-1">
              No students. Drag here to assign.
            </div>
          )}
          {activeSessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-1 text-[10px] rounded px-1 py-0.5",
                s.session_status === "Confirmed"
                  ? "bg-green-50 dark:bg-green-900/20"
                  : "bg-gray-50 dark:bg-gray-800/60"
              )}
            >
              <button
                onClick={() => onClickStudent?.(s.application_id)}
                className="truncate flex-1 text-left hover:text-primary hover:underline"
                title="View details"
              >
                {s.student_name}
              </button>
              <span
                className={cn(
                  "text-[8px] font-bold px-0.5 rounded",
                  SUMMER_GRADE_BG[s.grade] || "bg-gray-100 dark:bg-gray-700"
                )}
              >
                {s.grade}
              </span>
              <button
                onClick={() => onRemoveSession(s.id)}
                className="p-0 text-muted-foreground hover:text-red-500 shrink-0"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
