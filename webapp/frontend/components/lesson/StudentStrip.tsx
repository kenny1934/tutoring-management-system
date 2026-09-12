"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentIdDisplay } from "@/lib/lesson-utils";
import { isPreviewExercise } from "@/lib/summer-courseware-session";
import { GradeBadge } from "@/components/ui/grade-label";
import type { StudentExerciseEntry } from "./LessonWideMode";
import { WithSchoolIfItFits } from "./SchoolBadge";

interface StudentStripProps {
  /** The worksheet on screen, which says whose it is. */
  entry: StudentExerciseEntry;
  /** Where that student sits among the students the arrows step through, counting from 1, and how many there are. */
  position: { index: number; total: number } | null;
  onPrevious?: () => void;
  onNext?: () => void;
  selectedLocation: string;
  /** Shown before the Previous arrow. In focus mode, that's the Students button. */
  start?: ReactNode;
  /** Shown after the Next arrow. In focus mode, that's the way out of it. */
  end?: ReactNode;
}

/**
 * For the words on buttons at the strip's ends. They only show while the
 * strip is at least 720px wide, so on a narrow pane those buttons keep to
 * their icons and the student's name keeps its room.
 */
export const stripLabel = "hidden @[720px]/strip:inline";

const arrowClass =
  "flex-none w-11 h-11 grid place-items-center rounded-lg transition-colors " +
  "text-[#6b4c30] dark:text-[#d4a574] hover:bg-[#e8d4b8] dark:hover:bg-[#3a3228] " +
  "disabled:text-[#d4c4a8] dark:disabled:text-[#3a3228] disabled:hover:bg-transparent";

/**
 * The strip above the multi-student view's worksheet that says, in large
 * letters, whose worksheet is on the board. Its arrows step to the previous
 * and next student. It's always there, so the page never shifts when it
 * appears. In focus mode, where the header is hidden, it's the top bar, so it
 * also holds the Students button and the way out of focus mode.
 */
export function StudentStrip({ entry, position, onPrevious, onNext, selectedLocation, start, end }: StudentStripProps) {
  const preview = isPreviewExercise(entry.exercise);
  const studentId = preview ? null : getStudentIdDisplay(entry.session, selectedLocation);

  return (
    <div
      className={cn(
        "@container/strip flex items-center gap-2 px-2 py-1 flex-none",
        "border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f5efe5] dark:bg-[#1e1a14]",
      )}
    >
      {start}
      <button type="button" onClick={onPrevious} disabled={!onPrevious} className={arrowClass}
        aria-label="Previous student" title="Previous student (Shift+Tab)">
        <ChevronLeft className="h-6 w-6" />
      </button>

      <div className="flex-1 min-w-0 flex flex-col items-center leading-tight" aria-live="polite">
        <WithSchoolIfItFits
          school={preview ? null : entry.session.school}
          lineClass="h-6"
          className="max-w-full justify-center gap-x-2"
          badgeClassName="text-xs leading-4 py-0.5"
        >
          {studentId && (
            <span className="flex-none text-sm font-mono text-[#a0906e] dark:text-[#8a7a60]">{studentId}</span>
          )}
          <span className="truncate text-lg font-bold text-[#4a3520] dark:text-[#e8d4b8]">
            {entry.studentName}
          </span>
          {!preview && entry.grade && (
            <GradeBadge
              className="flex-none text-xs px-1.5 py-0.5 rounded font-medium text-gray-800"
              grade={entry.grade}
              langStream={entry.langStream}
            />
          )}
        </WithSchoolIfItFits>
        {/* The count keeps its line even when it's empty, so the strip's height never changes. */}
        <span className="text-xs text-[#a0906e] dark:text-[#8a7a60] tabular-nums min-h-4">
          {position ? `${position.index} of ${position.total}` : ""}
        </span>
      </div>

      <button type="button" onClick={onNext} disabled={!onNext} className={arrowClass}
        aria-label="Next student" title="Next student (Tab)">
        <ChevronRight className="h-6 w-6" />
      </button>
      {end}
    </div>
  );
}
