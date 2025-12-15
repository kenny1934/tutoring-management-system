"use client";

import { useState } from "react";
import { useMyStudents } from "@/lib/hooks";
import { MyStudentsList, type SortOption, type GroupOption } from "./MyStudentsList";
import { MyStudentsWeeklyGrid } from "./MyStudentsWeeklyGrid";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { StickyNote } from "@/lib/design-system";
import { Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Enrollment } from "@/types";

interface MyStudentsViewProps {
  tutorId: number | null;
  location: string;
  isMobile: boolean;
}

export function MyStudentsView({
  tutorId,
  location,
  isMobile,
}: MyStudentsViewProps) {
  const { data: enrollments = [], isLoading, error } = useMyStudents(tutorId, location);
  const [highlightedStudentIds, setHighlightedStudentIds] = useState<number[]>([]);
  const [activeGroups, setActiveGroups] = useState<GroupOption[]>([]);
  const [sortOption, setSortOption] = useState<SortOption>('student_id');
  const [mobileTab, setMobileTab] = useState<'list' | 'calendar'>('list');

  // Handle individual student selection
  const handleStudentSelect = (studentId: number | null) => {
    setHighlightedStudentIds(studentId ? [studentId] : []);
  };

  // Handle group header click - highlight all students in group
  const handleGroupHeaderClick = (studentIds: number[]) => {
    setHighlightedStudentIds(studentIds);
  };

  // Popover state
  const [popoverEnrollment, setPopoverEnrollment] = useState<Enrollment | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Handle enrollment click
  const handleEnrollmentClick = (enrollment: Enrollment, event: React.MouseEvent) => {
    setPopoverClickPosition({ x: event.clientX, y: event.clientY });
    setPopoverEnrollment(enrollment);
  };

  // Close popover
  const handleClosePopover = () => {
    setPopoverEnrollment(null);
    setPopoverClickPosition(null);
  };

  if (!tutorId) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <StickyNote variant="yellow" size="lg" showTape>
          <div className="text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Select a Tutor</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Choose a tutor from the dropdown above to see their students
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading students...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <StickyNote variant="pink" size="lg" showTape>
          <div className="text-center">
            <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Error</p>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {error instanceof Error ? error.message : "Failed to load students"}
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  if (enrollments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <StickyNote variant="yellow" size="lg" showTape>
          <div className="text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No Students Found</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              This tutor doesn't have any active students in the selected location
            </p>
          </div>
        </StickyNote>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Mobile Tab Buttons */}
      {isMobile && (
        <div className="flex border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] mb-2 rounded-t-lg overflow-hidden">
          <button
            onClick={() => setMobileTab('list')}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-colors",
              mobileTab === 'list'
                ? "bg-[#a0704b] text-white"
                : "bg-[#fef9f3] dark:bg-[#2d2618] text-gray-700 dark:text-gray-300"
            )}
          >
            Students
          </button>
          <button
            onClick={() => setMobileTab('calendar')}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-colors",
              mobileTab === 'calendar'
                ? "bg-[#a0704b] text-white"
                : "bg-[#fef9f3] dark:bg-[#2d2618] text-gray-700 dark:text-gray-300"
            )}
          >
            Calendar
          </button>
        </div>
      )}

      {/* Desktop: side-by-side | Mobile: tab content */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* List - show on desktop OR when list tab active on mobile */}
        {(!isMobile || mobileTab === 'list') && (
          <div className={cn(
            "flex-shrink-0 flex flex-col bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden",
            isMobile ? "w-full" : "w-[280px]"
          )}>
            <MyStudentsList
              enrollments={enrollments}
              selectedStudentId={highlightedStudentIds.length === 1 ? highlightedStudentIds[0] : null}
              onStudentSelect={handleStudentSelect}
              onEnrollmentClick={handleEnrollmentClick}
              activeGroups={activeGroups}
              onGroupsChange={setActiveGroups}
              sortOption={sortOption}
              onSortChange={setSortOption}
              onGroupHeaderClick={handleGroupHeaderClick}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* Calendar - show on desktop OR when calendar tab active on mobile */}
        {(!isMobile || mobileTab === 'calendar') && (
          <div className={cn(
            "flex flex-col",
            isMobile ? "w-full" : "flex-1 min-w-0 overflow-hidden"
          )}>
            <MyStudentsWeeklyGrid
              enrollments={enrollments}
              onEnrollmentClick={handleEnrollmentClick}
              highlightStudentIds={highlightedStudentIds}
              isMobile={isMobile}
              fillHeight
            />
          </div>
        )}
      </div>

      {/* Enrollment Detail Popover */}
      <EnrollmentDetailPopover
        enrollment={popoverEnrollment}
        isOpen={!!popoverEnrollment}
        onClose={handleClosePopover}
        clickPosition={popoverClickPosition}
      />
    </div>
  );
}
