"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { List, RowComponentProps } from "react-window";
import { HandCoins, Clock, AlertTriangle, GraduationCap, Building2, Calendar, Search, ArrowUp, ArrowDown, User } from "lucide-react";
import type { Enrollment } from "@/types";
import { cn } from "@/lib/utils";
import { getDisplayPaymentStatus, getPaymentStatusConfig } from "@/lib/enrollment-utils";
import { DAY_NAME_TO_INDEX, getGradeColor } from "@/lib/constants";
import { getTutorFirstName } from "@/components/zen/utils/sessionSorting";

// Group options - can be combined
export type GroupOption = 'payment_status' | 'grade_lang' | 'school' | 'day' | 'time_slot' | 'tutor';

// Sort options - mutually exclusive
export type SortOption = 'name' | 'student_id';
export type SortDirection = 'asc' | 'desc';

// Helper to escape special regex characters
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Multi-term AND search with quoted phrase support
// - Unquoted terms: partial match (e.g., "IS" matches "TIS", "Iris")
// - Quoted terms: exact word match (e.g., "IS" only matches "IS")
const matchesSearch = (enrollment: Enrollment, searchTerm: string): boolean => {
  if (!searchTerm.trim()) return true;

  // Parse search term: extract quoted phrases and unquoted terms
  // Regex captures: "double quoted" | 'single quoted' | unquoted-word
  const tokenRegex = /"([^"]+)"|'([^']+)'|(\S+)/g;
  const terms: { text: string; exact: boolean }[] = [];

  let match;
  while ((match = tokenRegex.exec(searchTerm)) !== null) {
    const text = (match[1] || match[2] || match[3]).toLowerCase();
    const exact = !!(match[1] || match[2]); // true if quoted
    terms.push({ text, exact });
  }

  if (terms.length === 0) return true;

  // Build searchable text from all fields
  const searchableText = [
    enrollment.student_name,
    enrollment.school_student_id,
    enrollment.school,
    `${enrollment.grade || ''}${enrollment.lang_stream || ''}`,
    enrollment.assigned_day,
    enrollment.assigned_time,
  ].filter(Boolean).join(' ').toLowerCase();

  // ALL terms must match
  return terms.every(({ text, exact }) => {
    if (exact) {
      // Word boundary match: \b ensures whole word
      const regex = new RegExp(`\\b${escapeRegex(text)}\\b`, 'i');
      return regex.test(searchableText);
    } else {
      // Partial match (current behavior)
      return searchableText.includes(text);
    }
  });
};

// Group option configuration
const GROUP_OPTIONS: { value: GroupOption; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'payment_status', label: 'Payment', icon: HandCoins },
  { value: 'grade_lang', label: 'Grade', icon: GraduationCap },
  { value: 'school', label: 'School', icon: Building2 },
  { value: 'day', label: 'Day', icon: Calendar },
  { value: 'time_slot', label: 'Time', icon: Clock },
  { value: 'tutor', label: 'Tutor', icon: User },
];

// Sort option configuration
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'student_id', label: 'Student ID' },
  { value: 'name', label: 'Name' },
];

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
// Exported for use in MyStudentsWeeklyGrid for group filtering
export const getGroupKey = (enrollment: Enrollment, activeGroups: GroupOption[]): string => {
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
      case 'tutor':
        parts.push(enrollment.tutor_name || 'Unknown');
        break;
    }
  }

  return parts.join('|') || 'all';
};

// Generate display label for a group
export const getGroupLabel = (groupKey: string): string => {
  if (groupKey === 'all' || !groupKey) return '';
  const parts = groupKey.split('|');
  return parts.join(' › ');
};

// Compare group keys for sorting
export const compareGroupKeys = (keyA: string, keyB: string, activeGroups: GroupOption[]): number => {
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
  highlightStudentIds?: number[];
  selectedGroupKey?: string | null;
  onStudentSelect: (studentId: number | null) => void;
  onEnrollmentClick?: (enrollment: Enrollment, event: React.MouseEvent) => void;
  activeGroups: GroupOption[];
  onGroupsChange: (groups: GroupOption[]) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  // Optional controlled sort direction (if not provided, uses local state)
  sortDirection?: SortDirection;
  onSortDirectionChange?: (direction: SortDirection) => void;
  onGroupHeaderClick?: (groupKey: string, studentIds: number[]) => void;
  isMobile?: boolean;
  isAllTutors?: boolean;
}

// Threshold for enabling virtualization
const VIRTUALIZATION_THRESHOLD = 50;
// Estimated row height for virtualized list
const ROW_HEIGHT = 72;

// Custom props passed to row component via rowProps (react-window v2)
interface EnrollmentRowProps {
  enrollments: Enrollment[];
  selectedStudentId: number | null;
  highlightStudentIds?: number[];
  onStudentSelect: (studentId: number | null) => void;
  onEnrollmentClick?: (enrollment: Enrollment, event: React.MouseEvent) => void;
  isAllTutors?: boolean;
}

// Row component for virtualized list (react-window v2 API)
function EnrollmentRow({
  index,
  style,
  enrollments,
  selectedStudentId,
  highlightStudentIds,
  onStudentSelect,
  onEnrollmentClick,
  isAllTutors,
}: RowComponentProps<EnrollmentRowProps>) {
  const enrollment = enrollments[index];
  const isSelected = selectedStudentId === enrollment.student_id;
  const isHighlighted = highlightStudentIds?.includes(enrollment.student_id) ?? false;
  const displayStatus = getDisplayPaymentStatus(enrollment);
  const isOverdue = displayStatus === 'Overdue';
  const isPending = displayStatus === 'Pending Payment';

  return (
    <div style={{ ...style, paddingRight: 8, paddingBottom: 8 }}>
      <div
        onClick={(e) => {
          onStudentSelect(isSelected ? null : enrollment.student_id);
          onEnrollmentClick?.(enrollment, e);
        }}
        className={cn(
          "p-2 rounded-lg cursor-pointer transition-all h-full",
          "border border-[#e8d4b8] dark:border-[#6b5a4a]",
          "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]",
          (isSelected || isHighlighted) && "ring-2 ring-[#a0704b] dark:ring-[#cd853f] bg-[#fef9f3] dark:bg-[#2d2618]",
          isOverdue && "border-l-4 border-l-red-500",
          isPending && !isOverdue && "border-l-4 border-l-amber-500"
        )}
      >
        {/* Header: Student ID, Name, Grade, School */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
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
          {isAllTutors && enrollment.tutor_name && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0">
              {getTutorFirstName(enrollment.tutor_name)}
            </span>
          )}
          {isOverdue && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden="true" />
              <span className="text-[9px] font-bold text-red-500 uppercase">Overdue</span>
            </span>
          )}
          {isPending && !isOverdue && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <HandCoins className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span className="text-[9px] font-bold text-amber-500 uppercase">Pending</span>
            </span>
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
    </div>
  );
}

export function MyStudentsList({
  enrollments,
  selectedStudentId,
  highlightStudentIds,
  selectedGroupKey,
  onStudentSelect,
  onEnrollmentClick,
  activeGroups,
  onGroupsChange,
  sortOption,
  onSortChange,
  sortDirection: controlledSortDirection,
  onSortDirectionChange,
  onGroupHeaderClick,
  isMobile = false,
  isAllTutors = false,
}: MyStudentsListProps) {
  // Container ref for measuring available height
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  // Search state (local to component)
  const [searchTerm, setSearchTerm] = useState('');

  // Sort direction: use controlled props if provided, otherwise local state
  const [localSortDirection, setLocalSortDirection] = useState<SortDirection>('asc');
  const sortDirection = controlledSortDirection ?? localSortDirection;
  const setSortDirection = onSortDirectionChange ?? setLocalSortDirection;

  // Measure container height for virtualization
  useEffect(() => {
    const container = listContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListHeight(Math.max(200, entry.contentRect.height));
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Toggle a group option
  const toggleGroup = (group: GroupOption) => {
    if (activeGroups.includes(group)) {
      onGroupsChange(activeGroups.filter(g => g !== group));
    } else {
      onGroupsChange([...activeGroups, group]);
    }
  };

  // Filter enrollments by search term
  const filteredEnrollments = useMemo(() => {
    if (!searchTerm.trim()) return enrollments;
    return enrollments.filter(e => matchesSearch(e, searchTerm));
  }, [enrollments, searchTerm]);

  // Sort enrollments based on selected sort option and direction
  const sortedEnrollments = useMemo(() => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return [...filteredEnrollments].sort((a, b) => {
      let cmp: number;
      switch (sortOption) {
        case 'student_id':
          cmp = (a.school_student_id || '').localeCompare(b.school_student_id || '');
          break;
        case 'name':
        default:
          cmp = (a.student_name || '').localeCompare(b.student_name || '');
          break;
      }
      return cmp * multiplier;
    });
  }, [filteredEnrollments, sortOption, sortDirection]);

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

  // Count unpaid/overdue for summary display (from filtered results)
  const unpaidCount = useMemo(() => {
    return filteredEnrollments.filter(e => {
      const status = getDisplayPaymentStatus(e);
      return status === 'Pending Payment' || status === 'Overdue';
    }).length;
  }, [filteredEnrollments]);

  // Determine if we should use virtualization
  // Only virtualize when: no grouping AND count exceeds threshold
  const shouldVirtualize = activeGroups.length === 0 && filteredEnrollments.length > VIRTUALIZATION_THRESHOLD;

  // Handle sort option click - toggle direction if same option, or change option
  const handleSortClick = (option: SortOption) => {
    if (sortOption === option) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Change sort option, reset to asc
      onSortChange(option);
      setSortDirection('asc');
    }
  };

  const renderEnrollmentCard = useCallback((enrollment: Enrollment, style?: React.CSSProperties) => {
    const isSelected = selectedStudentId === enrollment.student_id;
    const isHighlighted = highlightStudentIds?.includes(enrollment.student_id) ?? false;
    const displayStatus = getDisplayPaymentStatus(enrollment);
    const isOverdue = displayStatus === 'Overdue';
    const isPending = displayStatus === 'Pending Payment';

    // For virtualized lists, we wrap with a div that has the positioning style
    const cardContent = (
      <div
        onClick={(e) => {
          onStudentSelect(isSelected ? null : enrollment.student_id);
          onEnrollmentClick?.(enrollment, e);
        }}
        className={cn(
          "p-2 rounded-lg cursor-pointer transition-all",
          "border border-[#e8d4b8] dark:border-[#6b5a4a]",
          "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]",
          (isSelected || isHighlighted) && "ring-2 ring-[#a0704b] dark:ring-[#cd853f] bg-[#fef9f3] dark:bg-[#2d2618]",
          isOverdue && "border-l-4 border-l-red-500",
          isPending && !isOverdue && "border-l-4 border-l-amber-500"
        )}
      >
        {/* Header: Student ID, Name, Grade, School */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
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
          {isAllTutors && enrollment.tutor_name && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500 flex-shrink-0">
              {getTutorFirstName(enrollment.tutor_name)}
            </span>
          )}
          {isOverdue && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-500" aria-hidden="true" />
              <span className="text-[9px] font-bold text-red-500 uppercase">Overdue</span>
            </span>
          )}
          {isPending && !isOverdue && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <HandCoins className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span className="text-[9px] font-bold text-amber-500 uppercase">Pending</span>
            </span>
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

    // If style is provided (from virtualized list), wrap with positioning div
    if (style) {
      return (
        <div style={{ ...style, paddingRight: 8, paddingBottom: 8 }} key={enrollment.id}>
          {cardContent}
        </div>
      );
    }

    // Otherwise return card with key directly
    return <div key={enrollment.id}>{cardContent}</div>;
  }, [selectedStudentId, highlightStudentIds, onStudentSelect, onEnrollmentClick, isAllTutors]);

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
        {/* Search input */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, ID, school, grade..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#a0704b] focus:border-transparent"
          />
        </div>

        {/* Student count and unpaid indicator */}
        <div className="flex items-center justify-between gap-2 text-xs mb-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {searchTerm.trim() ? (
              <>{filteredEnrollments.length} of {enrollments.length} student{enrollments.length !== 1 ? 's' : ''}</>
            ) : (
              <>{enrollments.length} student{enrollments.length !== 1 ? 's' : ''}</>
            )}
          </span>
          {unpaidCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <HandCoins className="h-3 w-3" aria-hidden="true" />
              <span>{unpaidCount} unpaid</span>
            </span>
          )}
        </div>

        {/* Group by chips */}
        <div className="flex flex-wrap items-center gap-1 mb-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-0.5">Group:</span>
          {GROUP_OPTIONS
            .filter(opt => opt.value !== 'tutor' || isAllTutors)
            .map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => toggleGroup(value)}
              aria-pressed={activeGroups.includes(value)}
              aria-label={`Group by ${label}`}
              className={cn(
                "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#a0704b] focus:ring-offset-1",
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

        {/* Sort by buttons with direction toggle */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-0.5">Sort:</span>
          {SORT_OPTIONS.map(({ value, label }) => {
            const isActive = sortOption === value;
            const DirectionIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;
            return (
              <button
                key={value}
                onClick={() => handleSortClick(value)}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#a0704b] focus:ring-offset-1",
                  isActive
                    ? "bg-[#a0704b] text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                {label}
                {isActive && <DirectionIcon className="h-2.5 w-2.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable list */}
      <div ref={listContainerRef} className="flex-1 min-h-0 overflow-hidden">
        {/* No results message */}
        {filteredEnrollments.length === 0 && searchTerm.trim() && (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">No matches found</p>
              <p className="text-xs mt-1">Try different search terms</p>
            </div>
          </div>
        )}
        {filteredEnrollments.length > 0 && shouldVirtualize ? (
          // Virtualized list for large flat lists (no grouping) - react-window v2 API
          <List<EnrollmentRowProps>
            rowCount={sortedEnrollments.length}
            rowHeight={ROW_HEIGHT}
            rowComponent={EnrollmentRow}
            rowProps={{
              enrollments: sortedEnrollments,
              selectedStudentId,
              highlightStudentIds,
              onStudentSelect,
              onEnrollmentClick,
              isAllTutors,
            }}
            defaultHeight={listHeight}
            className="p-2"
          />
        ) : filteredEnrollments.length > 0 ? (
          // Regular list for smaller lists or grouped views
          <div className="h-full overflow-y-auto p-2 space-y-2">
            {Array.from(groupedEnrollments.entries()).map(([groupKey, groupEnrollments]) => (
              <div key={groupKey}>
                {/* Group header (only if grouping is active) */}
                {activeGroups.length > 0 && groupKey !== 'all' && (() => {
                  const isGroupSelected = selectedGroupKey === groupKey;
                  return (
                    <div
                      onClick={() => onGroupHeaderClick?.(groupKey, groupEnrollments.map(e => e.student_id))}
                      className={cn(
                        "sticky top-0 z-10 -mx-2 px-2 py-1 border-b mb-2 cursor-pointer transition-colors",
                        isGroupSelected
                          ? "bg-[#a0704b]/20 dark:bg-[#cd853f]/20 border-[#a0704b] dark:border-[#cd853f]"
                          : "bg-[#f5ede3] dark:bg-[#3d3628] border-[#d4a574] dark:border-[#6b5a4a] hover:bg-[#ebe0d4] dark:hover:bg-[#4d4638]"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold uppercase",
                        isGroupSelected
                          ? "text-[#a0704b] dark:text-[#cd853f]"
                          : "text-gray-700 dark:text-gray-300"
                      )}>
                        {getGroupLabel(groupKey)}
                      </span>
                      <span className={cn(
                        "text-xs ml-2",
                        isGroupSelected
                          ? "text-[#a0704b]/70 dark:text-[#cd853f]/70"
                          : "text-gray-500 dark:text-gray-400"
                      )}>
                        ({groupEnrollments.length})
                      </span>
                    </div>
                  );
                })()}
                {/* Enrollments in this group */}
                <div className="space-y-2">
                  {groupEnrollments.map((e) => renderEnrollmentCard(e))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
