"use client";

import { useState, useEffect } from "react";
import { CheckSquare, Square, MinusSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentIdDisplay } from "@/lib/lesson-utils";
import { getGradeColor } from "@/lib/constants";
import type { Session } from "@/types";

/**
 * Student multi-select popover used by lesson-wide bulk assignment
 * (and the summer materials wide panel). Renders below the nearest
 * positioned ancestor.
 */
export function StudentPickerPopover({
  students,
  selectedLocation,
  onAssign,
  onClose,
  initialSelectedIds,
}: {
  students: Session[];
  selectedLocation: string;
  onAssign: (sessionIds: number[]) => void;
  onClose: () => void;
  /** Pre-ticked students; defaults to everyone. */
  initialSelectedIds?: number[];
}) {
  const [pickerIds, setPickerIds] = useState<Set<number>>(
    () => new Set(initialSelectedIds ?? students.map(s => s.id))
  );

  const allSelected = pickerIds.size === students.length;
  const noneSelected = pickerIds.size === 0;

  const toggleAll = () => {
    setPickerIds(allSelected ? new Set() : new Set(students.map(s => s.id)));
  };

  const toggleOne = (id: number) => {
    setPickerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If target was detached from DOM (React re-render replaced the icon), click was inside
      if (!document.contains(target)) return;
      if (!target.closest('[data-student-picker]')) onClose();
    };
    const timer = setTimeout(() => document.addEventListener('click', handle), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handle); };
  }, [onClose]);

  return (
    <div
      data-student-picker
      className="absolute left-1 right-1 top-full mt-1 bg-[#fef9f3] dark:bg-[#2d2618] shadow-lg rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] z-50 py-1"
    >
      {/* Select All toggle */}
      <button
        onClick={toggleAll}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-[#6b5a42] dark:text-[#c4a882] font-medium"
      >
        {allSelected ? (
          <CheckSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
        ) : noneSelected ? (
          <Square className="h-3.5 w-3.5" />
        ) : (
          <MinusSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f]" />
        )}
        {allSelected ? "Deselect All" : "Select All"}
      </button>
      <div className="border-t border-[#e8d4b8] dark:border-[#3a3228] my-0.5" />
      {/* Student list */}
      <div className="max-h-[200px] overflow-y-auto">
        {students.map(session => {
          const studentId = getStudentIdDisplay(session, selectedLocation);
          const checked = pickerIds.has(session.id);
          return (
            <button
              key={session.id}
              onClick={() => toggleOne(session.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#f5ede3] dark:hover:bg-[#3d3520] text-gray-700 dark:text-gray-300"
            >
              {checked ? (
                <CheckSquare className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
              ) : (
                <Square className="h-3.5 w-3.5 flex-shrink-0" />
              )}
              {studentId && (
                <span className="text-[10px] font-mono text-[#a0906e] dark:text-[#8a7a60] whitespace-nowrap flex-shrink-0">{studentId}</span>
              )}
              <span className="truncate">{session.student_name}</span>
              {session.grade && (
                <span
                  className="text-[8px] px-1 py-0.5 rounded font-medium text-gray-800 flex-shrink-0"
                  style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                >
                  {session.grade}{session.lang_stream || ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="border-t border-[#e8d4b8] dark:border-[#3a3228] my-0.5" />
      {/* Assign button */}
      <div className="px-2 py-1">
        <button
          onClick={() => onAssign(Array.from(pickerIds))}
          disabled={noneSelected}
          className={cn(
            "w-full py-1.5 rounded-md text-xs font-medium transition-colors",
            noneSelected
              ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              : "bg-[#a0704b] hover:bg-[#8b6040] text-white"
          )}
        >
          Assign to {pickerIds.size} student{pickerIds.size !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
