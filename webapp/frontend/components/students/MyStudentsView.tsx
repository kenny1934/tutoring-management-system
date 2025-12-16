"use client";

import { useState } from "react";
import { useMyStudents, useAllStudents } from "@/lib/hooks";
import { ALL_TUTORS, type TutorValue } from "@/components/selectors/TutorSelector";
import { MyStudentsList, type SortOption, type SortDirection, type GroupOption } from "./MyStudentsList";
import { MyStudentsWeeklyGrid } from "./MyStudentsWeeklyGrid";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { StickyNote } from "@/lib/design-system";
import { Users, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Enrollment } from "@/types";

interface MyStudentsViewProps {
  tutorId: TutorValue;
  location: string;
  isMobile: boolean;
  // Optional controlled props for URL persistence
  mobileTab?: 'list' | 'calendar';
  onMobileTabChange?: (tab: 'list' | 'calendar') => void;
  activeGroups?: GroupOption[];
  onGroupsChange?: (groups: GroupOption[]) => void;
  sortOption?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  sortDirection?: SortDirection;
  onSortDirectionChange?: (direction: SortDirection) => void;
}

export function MyStudentsView({
  tutorId,
  location,
  isMobile,
  mobileTab: controlledMobileTab,
  onMobileTabChange,
  activeGroups: controlledActiveGroups,
  onGroupsChange,
  sortOption: controlledSortOption,
  onSortChange,
  sortDirection: controlledSortDirection,
  onSortDirectionChange,
}: MyStudentsViewProps) {
  const isAllTutors = tutorId === ALL_TUTORS;
  const numericTutorId = typeof tutorId === 'number' ? tutorId : null;

  // Conditionally fetch based on mode
  const myStudentsResult = useMyStudents(isAllTutors ? null : numericTutorId, location);
  const allStudentsResult = useAllStudents(isAllTutors ? location : undefined);

  // Use the appropriate result based on mode
  const { data: enrollments = [], isLoading, error } = isAllTutors ? allStudentsResult : myStudentsResult;

  const [highlightedStudentIds, setHighlightedStudentIds] = useState<number[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);

  // Use controlled props if provided, otherwise local state
  const [localActiveGroups, setLocalActiveGroups] = useState<GroupOption[]>([]);
  const [localSortOption, setLocalSortOption] = useState<SortOption>('student_id');
  const [localSortDirection, setLocalSortDirection] = useState<SortDirection>('asc');
  const [localMobileTab, setLocalMobileTab] = useState<'list' | 'calendar'>('list');

  const activeGroups = controlledActiveGroups ?? localActiveGroups;
  const setActiveGroups = onGroupsChange ?? setLocalActiveGroups;
  const sortOption = controlledSortOption ?? localSortOption;
  const setSortOption = onSortChange ?? setLocalSortOption;
  const sortDirection = controlledSortDirection ?? localSortDirection;
  const setSortDirection = onSortDirectionChange ?? setLocalSortDirection;
  const mobileTab = controlledMobileTab ?? localMobileTab;
  const setMobileTab = onMobileTabChange ?? setLocalMobileTab;

  // Handle individual student selection
  const handleStudentSelect = (studentId: number | null) => {
    setHighlightedStudentIds(studentId ? [studentId] : []);
    setSelectedGroupKey(null); // Clear group selection when selecting individual student
  };

  // Handle group header click - toggle highlight all students in group
  const handleGroupHeaderClick = (groupKey: string, studentIds: number[]) => {
    if (selectedGroupKey === groupKey) {
      // Toggle off - same group clicked
      setHighlightedStudentIds([]);
      setSelectedGroupKey(null);
    } else {
      // Select new group
      setHighlightedStudentIds(studentIds);
      setSelectedGroupKey(groupKey);
    }
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
              Choose a tutor or &quot;All Tutors&quot; from the dropdown above
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
              {isAllTutors
                ? "No active students in the selected location"
                : "This tutor doesn't have any active students in the selected location"}
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
        <div
          role="tablist"
          aria-label="View selection"
          className="flex border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] mb-2 rounded-t-lg overflow-hidden"
        >
          <button
            role="tab"
            aria-selected={mobileTab === 'list'}
            aria-controls="students-list-panel"
            id="students-list-tab"
            onClick={() => setMobileTab('list')}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]",
              mobileTab === 'list'
                ? "bg-[#a0704b] text-white"
                : "bg-[#fef9f3] dark:bg-[#2d2618] text-gray-700 dark:text-gray-300"
            )}
          >
            Students
          </button>
          <button
            role="tab"
            aria-selected={mobileTab === 'calendar'}
            aria-controls="calendar-panel"
            id="calendar-tab"
            onClick={() => setMobileTab('calendar')}
            className={cn(
              "flex-1 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]",
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
          <div
            id={isMobile ? "students-list-panel" : undefined}
            role={isMobile ? "tabpanel" : undefined}
            aria-labelledby={isMobile ? "students-list-tab" : undefined}
            className={cn(
              "flex-shrink-0 flex flex-col bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden",
              isMobile ? "w-full" : "w-[280px]"
            )}
          >
            <MyStudentsList
              enrollments={enrollments}
              selectedStudentId={highlightedStudentIds.length === 1 ? highlightedStudentIds[0] : null}
              highlightStudentIds={highlightedStudentIds}
              selectedGroupKey={selectedGroupKey}
              onStudentSelect={handleStudentSelect}
              onEnrollmentClick={handleEnrollmentClick}
              activeGroups={activeGroups}
              onGroupsChange={setActiveGroups}
              sortOption={sortOption}
              onSortChange={setSortOption}
              sortDirection={sortDirection}
              onSortDirectionChange={setSortDirection}
              onGroupHeaderClick={handleGroupHeaderClick}
              isMobile={isMobile}
              isAllTutors={isAllTutors}
            />
          </div>
        )}

        {/* Calendar - show on desktop OR when calendar tab active on mobile */}
        {(!isMobile || mobileTab === 'calendar') && (
          <div
            id={isMobile ? "calendar-panel" : undefined}
            role={isMobile ? "tabpanel" : undefined}
            aria-labelledby={isMobile ? "calendar-tab" : undefined}
            className={cn(
              "flex flex-col",
              isMobile ? "w-full" : "flex-1 min-w-0 overflow-hidden"
            )}
          >
            <MyStudentsWeeklyGrid
              enrollments={enrollments}
              onEnrollmentClick={handleEnrollmentClick}
              highlightStudentIds={highlightedStudentIds}
              isMobile={isMobile}
              fillHeight
              isAllTutors={isAllTutors}
              // Calendar-list sync props
              activeGroups={activeGroups}
              sortOption={sortOption}
              sortDirection={sortDirection}
              selectedGroupKey={selectedGroupKey}
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
