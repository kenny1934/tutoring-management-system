"use client";

/**
 * A lesson taught but not in CSM yet, shown faintly in its time slot on the
 * Sessions list, where the real lesson will appear. Clicking it opens the
 * record to change it. When the real lesson arrives, it is filled in from the
 * record and this card is replaced by the real one.
 */
import { memo } from "react";
import { BookOpen, Home, User } from "lucide-react";
import { GradeBadge } from "@/components/ui/grade-label";
import type { UnlistedLesson } from "@/types";

export const TaughtLessonRow = memo(function TaughtLessonRow({
  lesson,
  onClick,
}: {
  lesson: UnlistedLesson;
  onClick: () => void;
}) {
  const classwork = lesson.exercises.filter((ex) => ex.exercise_type === "CW").length;
  const homework = lesson.exercises.filter((ex) => ex.exercise_type === "HW").length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg border border-dashed border-line-strong bg-paper/60 p-3 text-left opacity-80 transition-colors hover:bg-paper hover:opacity-100"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-subtle">{lesson.school_student_id || "No ID"}</span>
            <span className="truncate text-sm font-semibold text-gray-800 dark:text-gray-200">{lesson.student_name}</span>
            <GradeBadge className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-800" grade={lesson.grade} langStream={lesson.lang_stream} />
            {lesson.school && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">{lesson.school}</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" aria-hidden="true" />{lesson.tutor_name}</span>
            {classwork > 0 && (
              <span className="inline-flex items-center gap-1"><BookOpen className="h-3 w-3 text-red-600 dark:text-red-400" aria-hidden="true" />{classwork} CW</span>
            )}
            {homework > 0 && (
              <span className="inline-flex items-center gap-1"><Home className="h-3 w-3 text-blue-600 dark:text-blue-400" aria-hidden="true" />{homework} HW</span>
            )}
          </div>
        </div>
        <span className="flex-shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-subtle">
          Not in CSM yet
        </span>
      </div>
    </button>
  );
});
