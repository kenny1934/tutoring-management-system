"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LessonNumberBadge } from "./LessonNumberBadge";

interface EditableLessonNumberBadgeProps {
  lessonNumber: number | null | undefined;
  size?: "xs" | "sm" | "md";
  className?: string;
  onSave?: (value: number) => void | Promise<void>;
  disabled?: boolean;
}

const MIN_LESSON = 1;
const MAX_LESSON = 20;

export function EditableLessonNumberBadge({
  lessonNumber,
  size = "sm",
  className,
  onSave,
  disabled,
}: EditableLessonNumberBadgeProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (lessonNumber == null) return null;

  const readOnly = !onSave || disabled;

  const commit = async () => {
    const raw = inputRef.current?.value ?? "";
    const parsed = parseInt(raw, 10);
    const valid =
      !isNaN(parsed) &&
      parsed >= MIN_LESSON &&
      parsed <= MAX_LESSON &&
      parsed !== lessonNumber;
    if (valid && onSave) {
      setSaving(true);
      try {
        await onSave(parsed);
      } finally {
        setSaving(false);
      }
    }
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
        max={MAX_LESSON}
        disabled={saving}
        autoFocus
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
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
        setEditing(true);
      }}
      title={`Lesson ${lessonNumber} — click to edit`}
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
