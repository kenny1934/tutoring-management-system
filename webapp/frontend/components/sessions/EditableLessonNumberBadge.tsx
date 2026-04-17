"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { sessionsAPI } from "@/lib/api";
import { updateSessionInCache } from "@/lib/session-cache";
import { useToast } from "@/contexts/ToastContext";
import { LessonNumberBadge } from "./LessonNumberBadge";

interface EditableLessonNumberBadgeProps {
  lessonNumber: number | null | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
  /** Called with the new value, or `null` when admin clears the input. */
  onSave?: (value: number | null) => void | Promise<void>;
  disabled?: boolean;
  /** Inclusive upper bound for the input. Defaults to 8 (summer's typical
   * total_lessons); callers with a different ceiling can pass their own. */
  maxLesson?: number;
}

const MIN_LESSON = 1;
const DEFAULT_MAX_LESSON = 8;

export function useSaveLessonNumber(sessionId: number | null | undefined) {
  const { showToast } = useToast();
  return useCallback(
    async (value: number | null) => {
      if (!sessionId) return;
      try {
        const updated = await sessionsAPI.updateSession(sessionId, {
          ...(value === null
            ? { clear_lesson_number: true }
            : { lesson_number: value }),
        });
        updateSessionInCache(updated);
        showToast(
          value === null ? "Lesson number cleared" : `Lesson number set to L${value}`,
          "success",
        );
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Failed to update lesson number",
          "error",
        );
      }
    },
    [sessionId, showToast],
  );
}

export function EditableLessonNumberBadge({
  lessonNumber,
  size = "sm",
  className,
  onSave,
  disabled,
  maxLesson = DEFAULT_MAX_LESSON,
}: EditableLessonNumberBadgeProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Prevents Enter → blur and Esc → blur from triggering commit twice (or at all, for Esc).
  const skipCommitRef = useRef(false);

  if (lessonNumber == null) return null;

  const readOnly = !onSave || disabled;

  const commit = () => {
    if (skipCommitRef.current) return;
    skipCommitRef.current = true;
    const raw = (inputRef.current?.value ?? "").trim();
    if (raw === "") {
      // Empty input on a populated badge → clear the lesson_number
      // explicitly. No-op if it was already null.
      if (lessonNumber != null && onSave) {
        void onSave(null);
      }
      setEditing(false);
      return;
    }
    const parsed = parseInt(raw, 10);
    const valid =
      !isNaN(parsed) &&
      parsed >= MIN_LESSON &&
      parsed <= maxLesson &&
      parsed !== lessonNumber;
    if (valid && onSave) {
      void onSave(parsed);
    }
    setEditing(false);
  };

  const cancel = () => {
    skipCommitRef.current = true;
    setEditing(false);
  };

  if (editing) {
    const inputSize =
      size === "xs"
        ? "w-7 h-[18px] text-[10px]"
        : size === "md"
          ? "w-9 h-6 text-sm"
          : "w-8 h-5 text-xs";
    return (
      <input
        ref={inputRef}
        type="number"
        defaultValue={lessonNumber}
        min={MIN_LESSON}
        max={maxLesson}
        autoFocus
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "rounded border border-amber-400 bg-amber-50 text-amber-900 text-center font-semibold tabular-nums",
          "dark:bg-amber-900/60 dark:text-amber-100 dark:border-amber-600",
          "focus:outline-none focus:ring-1 focus:ring-amber-400",
          inputSize,
          className,
        )}
      />
    );
  }

  if (readOnly) {
    return (
      <LessonNumberBadge
        lessonNumber={lessonNumber}
        size={size}
        className={className}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        skipCommitRef.current = false;
        setEditing(true);
      }}
      title={`Lesson ${lessonNumber}, click to edit`}
      className="inline-flex align-middle rounded focus:outline-none focus:ring-1 focus:ring-amber-400 hover:opacity-80 transition-opacity"
    >
      <LessonNumberBadge
        lessonNumber={lessonNumber}
        size={size}
        className={className}
      />
    </button>
  );
}
