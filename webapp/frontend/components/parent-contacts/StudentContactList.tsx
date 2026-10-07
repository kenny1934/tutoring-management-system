"use client";

import { useState, useMemo, memo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CountBadge, IconButton, Input, Segmented, Select } from "@/components/controls";
import { ContactStatusBadge, ContactStatusDot } from "./ContactStatusBadge";
import type { StudentContactStatus } from "@/lib/api";
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  AlertTriangle,
  MessageSquarePlus,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";

interface StudentContactListProps {
  students: StudentContactStatus[];
  selectedStudentId: number | null;
  onStudentClick: (student: StudentContactStatus) => void;
  onRecordContact: (studentId: number) => void;
  showLocationPrefix?: boolean;
  /** When true, disables record contact buttons (Supervisor mode) */
  readOnly?: boolean;
  /** Controlled search query from parent (enables backend notes search) */
  searchQuery?: string;
  /** Callback when search changes (lifts state to parent for backend search) */
  onSearchChange?: (query: string) => void;
}

type GroupMode = 'grade' | 'urgency';
type WithinGroupSort = 'name' | 'student_id' | 'urgency';
type SortedGroup = { key: string; label: string; students: StudentContactStatus[] };

// Priority order for urgency grouping
const urgencyOrder: Record<string, number> = {
  'Contact Needed': 0,
  'Never Contacted': 1,
  'Been a While': 2,
  'Recent': 3,
};

// Grade order for sorting
const gradeOrder: Record<string, number> = {
  'K1': 0, 'K2': 1, 'K3': 2,
  'P1': 3, 'P2': 4, 'P3': 5, 'P4': 6, 'P5': 7, 'P6': 8,
  'F1': 9, 'F2': 10, 'F3': 11, 'F4': 12, 'F5': 13, 'F6': 14,
};

export const StudentContactList = memo(function StudentContactList({
  students,
  selectedStudentId,
  onStudentClick,
  onRecordContact,
  showLocationPrefix,
  readOnly = false,
  searchQuery: controlledSearchQuery,
  onSearchChange,
}: StudentContactListProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>('urgency');
  const [withinGroupSort, setWithinGroupSort] = useState<WithinGroupSort>('student_id');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [fullyExpandedGroups, setFullyExpandedGroups] = useState<Set<string>>(new Set());

  const INITIAL_GROUP_LIMIT = 20;

  // Use controlled search if provided, otherwise local
  const searchQuery = controlledSearchQuery ?? localSearchQuery;
  const setSearchQuery = onSearchChange ?? setLocalSearchQuery;

  // When using controlled search (backend handles filtering), skip client-side filter
  // When using local search, filter client-side as before
  const filteredStudents = useMemo(() => {
    if (onSearchChange) return students; // Backend already filtered
    if (!searchQuery.trim()) return students;
    const query = searchQuery.toLowerCase();
    return students.filter(s =>
      s.student_name.toLowerCase().includes(query) ||
      s.school_student_id?.toLowerCase().includes(query) ||
      s.grade?.toLowerCase().includes(query)
    );
  }, [students, searchQuery, onSearchChange]);

  // Group students
  const groupedStudents = useMemo((): SortedGroup[] => {
    const groups: Record<string, StudentContactStatus[]> = {};

    filteredStudents.forEach(student => {
      const key = groupMode === 'grade'
        ? (student.grade || 'Unknown')
        : student.contact_status;

      if (!groups[key]) groups[key] = [];
      groups[key].push(student);
    });

    // Sort groups
    const sortedGroups = Object.entries(groups).map(([key, students]) => ({
      key,
      label: key,
      students: students.sort((a, b) => {
        if (withinGroupSort === 'name') {
          return a.student_name.localeCompare(b.student_name);
        }
        if (withinGroupSort === 'student_id') {
          const idA = a.school_student_id || '';
          const idB = b.school_student_id || '';
          return idA.localeCompare(idB);
        }
        // Urgency: never contacted first, then by days_since_contact descending
        const daysA = a.days_since_contact ?? Infinity;
        const daysB = b.days_since_contact ?? Infinity;
        return daysB - daysA; // Higher days = more urgent = first
      }),
    }));

    // Sort group order
    if (groupMode === 'grade') {
      sortedGroups.sort((a, b) => {
        const orderA = gradeOrder[a.key] ?? 999;
        const orderB = gradeOrder[b.key] ?? 999;
        return orderA - orderB;
      });
    } else {
      sortedGroups.sort((a, b) => {
        const orderA = urgencyOrder[a.key] ?? 999;
        const orderB = urgencyOrder[b.key] ?? 999;
        return orderA - orderB;
      });
    }

    return sortedGroups;
  }, [filteredStudents, groupMode, withinGroupSort]);

  // Auto-expand groups with urgent contacts or when searching
  useEffect(() => {
    setFullyExpandedGroups(new Set());
    if (searchQuery) {
      setExpandedGroups(new Set(groupedStudents.map(g => g.key)));
    } else if (groupMode === 'urgency') {
      // Auto-expand urgent groups
      setExpandedGroups(new Set(['Contact Needed', 'Never Contacted']));
    } else {
      // Expand all by default for grade view
      setExpandedGroups(new Set(groupedStudents.map(g => g.key)));
    }
  }, [groupMode, searchQuery, groupedStudents]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getGroupIcon = (key: string) => {
    if (groupMode === 'grade') {
      return <GraduationCap className="h-4 w-4 text-accent-ink" />;
    }
    // For urgency mode, use status indicators
    if (key === 'Contact Needed' || key === 'Never Contacted') {
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    }
    return <ContactStatusDot status={key} />;
  };

  const getUrgentCount = (students: StudentContactStatus[]) => {
    return students.filter(s =>
      s.contact_status === 'Contact Needed' || s.contact_status === 'Never Contacted'
    ).length;
  };

  return (
    <div className={cn(
      "flex flex-col h-full",
      "bg-white dark:bg-[#1a1a1a] rounded-lg border border-line",
      "overflow-hidden"
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-line bg-tint">
        {/* Wraps when the panel is narrow, so the sort select drops under the
            heading instead of running past the panel's edge. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider whitespace-nowrap">
            Students ({filteredStudents.length})
          </h3>

          {/* Group Toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Segmented<GroupMode>
              label="Group students"
              value={groupMode}
              onChange={(mode) => {
                setGroupMode(mode);
                if (mode === 'urgency' && withinGroupSort === 'urgency') setWithinGroupSort('student_id');
              }}
              options={[
                { value: 'urgency', icon: AlertTriangle, label: <span className="sr-only">Urgency</span>, title: "Group by urgency" },
                { value: 'grade', icon: GraduationCap, label: <span className="sr-only">Grade</span>, title: "Group by grade" },
              ]}
            />
            {/* Within-group sort */}
            <Select
              size="sm"
              value={withinGroupSort}
              onChange={(e) => setWithinGroupSort(e.target.value as WithinGroupSort)}
              className="w-24"
              title="Sort within groups"
              aria-label="Sort within groups"
            >
              {groupMode !== 'urgency' && <option value="urgency">Urgency</option>}
              <option value="name">Name</option>
              <option value="student_id">ID</option>
            </Select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <Input
            type="text"
            placeholder={onSearchChange ? "Search students & notes..." : "Search students..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7"
          />
        </div>
      </div>

      {/* Student List */}
      <div className="flex-1 overflow-y-auto">
        {groupedStudents.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            <p className="text-sm">No students found</p>
          </div>
        ) : (
          groupedStudents.map(group => (
            <div key={group.key} className="border-b border-line/50 last:border-b-0">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2",
                  "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                  "text-left"
                )}
              >
                {expandedGroups.has(group.key) ? (
                  <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                )}
                {getGroupIcon(group.key)}
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {group.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {group.students.length}
                </span>
                {groupMode === 'grade' && getUrgentCount(group.students) > 0 && (
                  <CountBadge tone="danger" count={getUrgentCount(group.students)} />
                )}
              </button>

              {/* Students */}
              {expandedGroups.has(group.key) && (
                <div className="pb-1">
                  {(fullyExpandedGroups.has(group.key)
                    ? group.students
                    : group.students.slice(0, INITIAL_GROUP_LIMIT)
                  ).map(student => (
                    <div
                      key={student.student_id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 mx-2 rounded-md cursor-pointer",
                        "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                        selectedStudentId === student.student_id && "bg-tint"
                      )}
                      onClick={() => onStudentClick(student)}
                    >
                      <ContactStatusDot status={student.contact_status} />
                      <div className="flex-1 min-w-0">
                        <StudentInfoBadges
                          student={{
                            student_id: student.student_id,
                            student_name: student.student_name,
                            school_student_id: student.school_student_id || undefined,
                            grade: student.grade || undefined,
                            lang_stream: student.lang_stream || undefined,
                            school: student.school || undefined,
                            home_location: student.home_location || undefined,
                          }}
                          showLocationPrefix={showLocationPrefix}
                          trailing={student.last_contact_date && (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              {student.days_since_contact}d ago
                            </span>
                          )}
                        />
                      </div>
                      {student.pending_follow_up && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Follow-up pending" />
                      )}
                      <IconButton
                        label="Record contact"
                        icon={MessageSquarePlus}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!readOnly) onRecordContact(student.student_id);
                        }}
                        disabled={readOnly}
                        title={readOnly ? "Read-only access" : "Record contact"}
                      />
                    </div>
                  ))}
                  {!fullyExpandedGroups.has(group.key) && group.students.length > INITIAL_GROUP_LIMIT && (
                    <button
                      onClick={() => setFullyExpandedGroups(prev => new Set([...prev, group.key]))}
                      className="w-full py-2 text-xs text-accent-ink hover:text-[#8b5d3b] dark:hover:text-[#deb887] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      Show all {group.students.length} students
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});
