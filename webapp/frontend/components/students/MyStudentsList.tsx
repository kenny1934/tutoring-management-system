"use client";

import { useMemo } from "react";
import { HandCoins, Clock, AlertTriangle, GraduationCap, Building2, Calendar } from "lucide-react";
import type { Enrollment } from "@/types";
import { cn } from "@/lib/utils";
import { getDisplayPaymentStatus, getPaymentStatusConfig } from "@/lib/enrollment-utils";

// Group options - can be combined
export type GroupOption = 'payment_status' | 'grade_lang' | 'school' | 'day' | 'time_slot';

// Sort options - mutually exclusive
export type SortOption = 'name' | 'student_id';

// Group option configuration
const GROUP_OPTIONS: { value: GroupOption; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'payment_status', label: 'Payment', icon: HandCoins },
  { value: 'grade_lang', label: 'Grade', icon: GraduationCap },
  { value: 'school', label: 'School', icon: Building2 },
  { value: 'day', label: 'Day', icon: Calendar },
  { value: 'time_slot', label: 'Time', icon: Clock },
];

// Sort option configuration
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'student_id', label: 'Student ID' },
  { value: 'name', label: 'Name' },
];

// Map day names to day index for schedule sorting
const DAY_NAME_TO_INDEX: Record<string, number> = {
  'Sun': 0, 'Sunday': 0,
  'Mon': 1, 'Monday': 1,
  'Tue': 2, 'Tuesday': 2,
  'Wed': 3, 'Wednesday': 3,
  'Thu': 4, 'Thursday': 4,
  'Fri': 5, 'Friday': 5,
  'Sat': 6, 'Saturday': 6,
};

// Grade tag colors
const GRADE_COLORS: Record<string, string> = {
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
};

const getGradeColor = (grade: string | undefined, langStream: string | undefined): string => {
  const key = `${grade || ""}${langStream || ""}`;
  return GRADE_COLORS[key] || "#e5e7eb";
};

// Group sorting priority
const GROUP_SORT_ORDER: Record<string, Record<string, number>> = {
  payment_status: {
    'Overdue': 0,
    'Pending Payment': 1,
    'Paid': 2,
    '': 99,
  },
  day: {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
    'Unscheduled': 99,
  },
};

// Generate group key for an enrollment based on active groups
const getGroupKey = (enrollment: Enrollment, activeGroups: GroupOption[]): string => {
  const parts: string[] = [];

  for (const group of activeGroups) {
    switch (group) {
      case 'payment_status':
        parts.push(getDisplayPaymentStatus(enrollment));
        break;
      case 'grade_lang':
        parts.push(`${enrollment.grade || ''}${enrollment.lang_stream || ''}`);
        break;
      case 'school':
        parts.push(enrollment.school || 'Unknown');
        break;
      case 'day':
        // Normalize day name to short form
        const dayName = enrollment.assigned_day || 'Unscheduled';
        const dayIndex = DAY_NAME_TO_INDEX[dayName];
        const normalizedDay = dayIndex !== undefined
          ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIndex]
          : 'Unscheduled';
        parts.push(normalizedDay);
        break;
      case 'time_slot':
        parts.push(enrollment.assigned_time || 'Unscheduled');
        break;
    }
  }

  return parts.join('|') || 'all';
};

// Generate display label for a group
const getGroupLabel = (groupKey: string, activeGroups: GroupOption[]): string => {
  const parts = groupKey.split('|');
  return parts.join(' › ');
};

// Compare group keys for sorting
const compareGroupKeys = (keyA: string, keyB: string, activeGroups: GroupOption[]): number => {
  const partsA = keyA.split('|');
  const partsB = keyB.split('|');

  for (let i = 0; i < activeGroups.length; i++) {
    const group = activeGroups[i];
    const valA = partsA[i] || '';
    const valB = partsB[i] || '';

    const order = GROUP_SORT_ORDER[group];
    if (order) {
      const orderA = order[valA] ?? 50;
      const orderB = order[valB] ?? 50;
      if (orderA !== orderB) return orderA - orderB;
    } else {
      // Alphabetical for grade_lang, school
      const cmp = valA.localeCompare(valB);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
};

interface MyStudentsListProps {
  enrollments: Enrollment[];
  selectedStudentId: number | null;
  onStudentSelect: (studentId: number | null) => void;
  onEnrollmentClick?: (enrollment: Enrollment, event: React.MouseEvent) => void;
  activeGroups: GroupOption[];
  onGroupsChange: (groups: GroupOption[]) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  onGroupHeaderClick?: (studentIds: number[]) => void;
  isMobile?: boolean;
}

export function MyStudentsList({
  enrollments,
  selectedStudentId,
  onStudentSelect,
  onEnrollmentClick,
  activeGroups,
  onGroupsChange,
  sortOption,
  onSortChange,
  onGroupHeaderClick,
  isMobile = false,
}: MyStudentsListProps) {
  // Toggle a group option
  const toggleGroup = (group: GroupOption) => {
    if (activeGroups.includes(group)) {
      onGroupsChange(activeGroups.filter(g => g !== group));
    } else {
      onGroupsChange([...activeGroups, group]);
    }
  };

  // Sort enrollments based on selected sort option
  const sortedEnrollments = useMemo(() => {
    return [...enrollments].sort((a, b) => {
      switch (sortOption) {
        case 'student_id':
          return (a.school_student_id || '').localeCompare(b.school_student_id || '');
        case 'name':
        default:
          return (a.student_name || '').localeCompare(b.student_name || '');
      }
    });
  }, [enrollments, sortOption]);

  // Group enrollments based on active groups
  const groupedEnrollments = useMemo(() => {
    if (activeGroups.length === 0) {
      // No grouping - return flat sorted list
      return new Map([['all', sortedEnrollments]]);
    }

    // Group enrollments
    const groups = new Map<string, Enrollment[]>();
    sortedEnrollments.forEach(enrollment => {
      const key = getGroupKey(enrollment, activeGroups);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(enrollment);
    });

    // Sort group keys and return as sorted Map
    return new Map(
      [...groups.entries()]
        .sort((a, b) => compareGroupKeys(a[0], b[0], activeGroups))
    );
  }, [sortedEnrollments, activeGroups]);

  // Count unpaid/overdue for summary display
  const unpaidCount = useMemo(() => {
    return enrollments.filter(e => {
      const status = getDisplayPaymentStatus(e);
      return status === 'Pending Payment' || status === 'Overdue';
    }).length;
  }, [enrollments]);

  const renderEnrollmentCard = (enrollment: Enrollment) => {
    const isSelected = selectedStudentId === enrollment.student_id;
    const displayStatus = getDisplayPaymentStatus(enrollment);
    const isOverdue = displayStatus === 'Overdue';
    const isPending = displayStatus === 'Pending Payment';

    return (
      <div
        key={enrollment.id}
        onClick={(e) => {
          onStudentSelect(isSelected ? null : enrollment.student_id);
          onEnrollmentClick?.(enrollment, e);
        }}
        className={cn(
          "p-2 rounded-lg cursor-pointer transition-all",
          "border border-[#e8d4b8] dark:border-[#6b5a4a]",
          "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]",
          isSelected && "ring-2 ring-[#a0704b] dark:ring-[#cd853f] bg-[#fef9f3] dark:bg-[#2d2618]",
          isOverdue && "border-l-4 border-l-red-500",
          isPending && !isOverdue && "border-l-4 border-l-amber-500"
        )}
      >
        {/* Header: Student ID, Name, Grade, School */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            {enrollment.school_student_id && (
              <span className="text-gray-500 dark:text-gray-400 font-mono text-[10px] flex-shrink-0">
                {enrollment.school_student_id}
              </span>
            )}
            <span className={cn(
              "font-semibold text-sm truncate",
              isOverdue ? "text-red-600 dark:text-red-400" :
              isPending ? "text-amber-700 dark:text-amber-400" :
              "text-gray-900 dark:text-gray-100"
            )}>
              {enrollment.student_name || "Unknown"}
            </span>
            {enrollment.grade && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap flex-shrink-0"
                style={{ backgroundColor: getGradeColor(enrollment.grade, enrollment.lang_stream) }}
              >
                {enrollment.grade}{enrollment.lang_stream || ''}
              </span>
            )}
            {enrollment.school && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 whitespace-nowrap flex-shrink-0">
                {enrollment.school}
              </span>
            )}
          </div>
          {isOverdue && (
            <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
          )}
          {isPending && !isOverdue && (
            <HandCoins className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )}
        </div>

        {/* Details: Schedule only */}
        {enrollment.assigned_day && enrollment.assigned_time && (
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <Clock className="h-3 w-3" />
            {enrollment.assigned_day} {enrollment.assigned_time}
          </div>
        )}
      </div>
    );
  };

  if (enrollments.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-sm font-medium">No students found</p>
          <p className="text-xs mt-1">Select a tutor to view their students</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Summary & Controls */}
      <div className="p-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#fef9f3] dark:bg-[#2d2618]">
        {/* Student count and unpaid indicator */}
        <div className="flex items-center justify-between gap-2 text-xs mb-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {enrollments.length} student{enrollments.length !== 1 ? 's' : ''}
          </span>
          {unpaidCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <HandCoins className="h-3 w-3" />
              {unpaidCount}
            </span>
          )}
        </div>

        {/* Group by chips */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-0.5">Group:</span>
          {GROUP_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => toggleGroup(value)}
              className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors",
                activeGroups.includes(value)
                  ? "bg-[#a0704b] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              <Icon className="h-2.5 w-2.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Sort by radio */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Sort:</span>
          {SORT_OPTIONS.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-1 text-[10px] cursor-pointer">
              <input
                type="radio"
                name="sort"
                value={value}
                checked={sortOption === value}
                onChange={() => onSortChange(value)}
                className="w-2.5 h-2.5 accent-[#a0704b]"
              />
              <span className={cn(
                sortOption === value
                  ? "text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-600 dark:text-gray-400"
              )}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {Array.from(groupedEnrollments.entries()).map(([groupKey, groupEnrollments]) => (
          <div key={groupKey}>
            {/* Group header (only if grouping is active) */}
            {activeGroups.length > 0 && groupKey !== 'all' && (
              <div
                onClick={() => onGroupHeaderClick?.(groupEnrollments.map(e => e.student_id))}
                className="sticky top-0 z-10 -mx-2 px-2 py-1 bg-[#f5ede3] dark:bg-[#3d3628] border-b border-[#d4a574] dark:border-[#6b5a4a] mb-2 cursor-pointer hover:bg-[#ebe0d4] dark:hover:bg-[#4d4638] transition-colors"
              >
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase">
                  {getGroupLabel(groupKey, activeGroups)}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                  ({groupEnrollments.length})
                </span>
              </div>
            )}
            {/* Enrollments in this group */}
            <div className="space-y-2">
              {groupEnrollments.map(renderEnrollmentCard)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
