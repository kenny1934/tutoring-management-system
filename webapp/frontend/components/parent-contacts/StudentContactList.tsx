"use client";

import { useState, useMemo, memo, useCallback } from "react";
import { cn } from "@/lib/utils";
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

interface StudentContactListProps {
  students: StudentContactStatus[];
  selectedStudentId: number | null;
  onStudentClick: (student: StudentContactStatus) => void;
  onRecordContact: (studentId: number) => void;
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
}: StudentContactListProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>('grade');
  const [withinGroupSort, setWithinGroupSort] = useState<WithinGroupSort>('urgency');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const query = searchQuery.toLowerCase();
    return students.filter(s =>
      s.student_name.toLowerCase().includes(query) ||
      s.school_student_id?.toLowerCase().includes(query) ||
      s.grade?.toLowerCase().includes(query)
    );
  }, [students, searchQuery]);

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
  useMemo(() => {
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
      return <GraduationCap className="h-4 w-4 text-[#a0704b]" />;
    }
    // For urgency mode, use status indicators
    if (key === 'Contact Needed' || key === 'Never Contacted') {
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
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
      "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]",
      "overflow-hidden"
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            Students ({filteredStudents.length})
          </h3>

          {/* Group Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
              <button
                onClick={() => setGroupMode('grade')}
                className={cn(
                  "p-1 rounded text-xs",
                  groupMode === 'grade'
                    ? "bg-white dark:bg-[#2d2618] text-[#a0704b] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
                title="Group by Grade"
              >
                <GraduationCap className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setGroupMode('urgency')}
                className={cn(
                  "p-1 rounded text-xs",
                  groupMode === 'urgency'
                    ? "bg-white dark:bg-[#2d2618] text-[#a0704b] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
                title="Group by Urgency"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Within-group sort */}
            <select
              value={withinGroupSort}
              onChange={(e) => setWithinGroupSort(e.target.value as WithinGroupSort)}
              className={cn(
                "text-xs px-1.5 py-1 rounded-md",
                "bg-gray-100 dark:bg-gray-800 border-0",
                "text-gray-600 dark:text-gray-400",
                "focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              )}
              title="Sort within groups"
            >
              <option value="urgency">Urgency</option>
              <option value="name">Name</option>
              <option value="student_id">ID</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-7 pr-3 py-1.5 text-sm",
              "bg-white dark:bg-[#1a1a1a] border border-[#d4a574]/50 dark:border-[#6b5a4a] rounded-md",
              "focus:outline-none focus:ring-1 focus:ring-[#a0704b]",
              "placeholder:text-gray-400"
            )}
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
            <div key={group.key} className="border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 last:border-b-0">
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
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                {getGroupIcon(group.key)}
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {group.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {group.students.length}
                </span>
                {groupMode === 'grade' && getUrgentCount(group.students) > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                    {getUrgentCount(group.students)}
                  </span>
                )}
              </button>

              {/* Students */}
              {expandedGroups.has(group.key) && (
                <div className="pb-1">
                  {group.students.map(student => (
                    <div
                      key={student.student_id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 mx-2 rounded-md cursor-pointer",
                        "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                        selectedStudentId === student.student_id && "bg-[#f5ede3] dark:bg-[#3d3628]"
                      )}
                      onClick={() => onStudentClick(student)}
                    >
                      <ContactStatusDot status={student.contact_status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {student.student_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {student.school_student_id || student.grade || 'No ID'}
                          {student.last_contact_date && (
                            <> · {student.days_since_contact}d ago</>
                          )}
                        </p>
                      </div>
                      {student.pending_follow_up && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Follow-up pending" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRecordContact(student.student_id);
                        }}
                        className={cn(
                          "p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
                          "text-gray-400 hover:text-[#a0704b]"
                        )}
                        title="Record contact"
                      >
                        <MessageSquarePlus className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});
