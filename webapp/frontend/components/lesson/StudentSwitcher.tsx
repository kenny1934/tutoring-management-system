"use client";

import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getStudentIdDisplay } from "@/lib/lesson-utils";
import type { StudentExerciseEntry } from "./LessonWideMode";

interface StudentSwitcherProps {
  entries: StudentExerciseEntry[];
  selectedEntry: StudentExerciseEntry | null;
  onSelect: (entry: StudentExerciseEntry) => void;
  selectedLocation: string;
}

export function StudentSwitcher({
  entries,
  selectedEntry,
  onSelect,
  selectedLocation,
}: StudentSwitcherProps) {
  if (entries.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#d4c4a8] dark:border-[#3a3228] bg-[#f5efe5] dark:bg-[#1e1a14] overflow-x-auto">
      <span className="text-[10px] text-[#a0906e] dark:text-[#8a7a60] flex-shrink-0 mr-1">
        Student:
      </span>
      {entries.map((entry) => {
        const isActive =
          selectedEntry?.exercise.id === entry.exercise.id &&
          selectedEntry?.session.id === entry.session.id;
        const studentId = getStudentIdDisplay(entry.session, selectedLocation);

        return (
          <button
            key={`${entry.session.id}-${entry.exercise.id}`}
            onClick={() => onSelect(entry)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0",
              "border",
              isActive
                ? "bg-[#e8d4b8] dark:bg-[#3a3228] border-[#d4a574] dark:border-[#8b6f47] text-[#6b4c30] dark:text-[#d4a574]"
                : "border-transparent text-[#8b7355] dark:text-[#a09080] hover:bg-[#f0e6d4] dark:hover:bg-[#252018]"
            )}
          >
            {studentId && (
              <span className="text-[10px] font-mono opacity-70">{studentId}</span>
            )}
            <span className="truncate max-w-[120px]">{entry.studentName}</span>
            {entry.grade && (
              <span
                className="text-[8px] px-1 py-0.5 rounded font-medium text-gray-800"
                style={{ backgroundColor: getGradeColor(entry.grade, entry.langStream) }}
              >
                {entry.grade}
              </span>
            )}
          </button>
        );
      })}
      <span className="text-[10px] text-[#b0a090] dark:text-[#706050] flex-shrink-0 ml-1">
        Tab to switch
      </span>
    </div>
  );
}
