"use client";

import { NotebookPen } from "lucide-react";
import { cn } from "@/lib/utils";

/** The lesson's own Draft, as a lesson sidebar's row shows it. */
export interface LessonDraftEntry {
  /** Whether it's on screen now, in the worksheet's place. */
  open: boolean;
  hasInk: boolean;
  onOpen: () => void;
}

const DESCRIPTION = "Blank or squared paper for working. It stays with the lesson, whichever worksheet is open.";

/**
 * The row above a lesson sidebar's exercises that shows the lesson's own
 * Draft. That Draft is kept with the lesson, not with any exercise, so this
 * row is how a tutor gets back to working they started before the lesson had
 * any courseware. It looks like an exercise's row, with the same dot when
 * there's ink on it.
 */
export function LessonDraftRow({ open, hasInk, onOpen }: LessonDraftEntry) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={open || undefined}
      title={DESCRIPTION}
      className={cn(
        "w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-md transition-all text-sm border min-h-10",
        open
          ? "bg-[#f5e6d0] dark:bg-[#3d3020] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
          : "border-transparent hover:bg-[#faf3e8] dark:hover:bg-[#2a2318] hover:border-[#e8d4b8]/50 dark:hover:border-[#5a4d3a]/50",
      )}
    >
      <NotebookPen className="h-4 w-4 flex-shrink-0 text-[#a0704b] dark:text-[#c4a882]" />
      <span
        className={cn(
          "flex-1 min-w-0 truncate font-medium",
          open ? "text-[#6b4c30] dark:text-[#d4a574]" : "text-gray-700 dark:text-gray-300",
        )}
      >
        Lesson draft
      </span>
      {hasInk && <span className="w-2 h-2 flex-shrink-0 rounded-full bg-[#a0704b]" title="Has annotations" />}
    </button>
  );
}
