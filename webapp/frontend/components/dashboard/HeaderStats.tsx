"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, Calendar, DollarSign, Search, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import type { DashboardStats } from "@/types";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useClick,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";

interface HeaderStatsProps {
  stats: DashboardStats;
}

interface StudentBasic {
  id: number;
  school_student_id: string | null;
  student_name: string;
  grade: string | null;
  lang_stream: string | null;
  school: string | null;
}


export function HeaderStats({ stats }: HeaderStatsProps) {
  const { selectedLocation } = useLocation();
  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Floating UI for students popover
  const { refs, floatingStyles, context } = useFloating({
    open: isStudentsOpen,
    onOpenChange: setIsStudentsOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
    ],
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  // Fetch active students when popover opens
  useEffect(() => {
    if (isStudentsOpen && students.length === 0) {
      const fetchStudents = async () => {
        setIsLoading(true);
        try {
          const params = new URLSearchParams();
          if (selectedLocation && selectedLocation !== "All Locations") {
            params.set("location", selectedLocation);
          }
          const response = await fetch(`/api/active-students?${params}`);
          if (response.ok) {
            const data = await response.json();
            setStudents(data);
          }
        } catch (error) {
          console.error("Failed to fetch active students:", error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchStudents();
    }
  }, [isStudentsOpen, selectedLocation, students.length]);

  // Reset students when location changes
  useEffect(() => {
    setStudents([]);
  }, [selectedLocation]);

  // Filter students by search term
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(
      (s) =>
        s.student_name.toLowerCase().includes(term) ||
        s.id.toString().includes(term) ||
        s.school_student_id?.toLowerCase().includes(term) ||
        s.school?.toLowerCase().includes(term) ||
        s.grade?.toLowerCase().includes(term)
    );
  }, [students, searchTerm]);

  return (
    <div className="px-4 sm:px-6 py-2.5">
      <div className="flex items-center justify-between sm:justify-start sm:gap-8">
        {/* Students stat with popover */}
        <div className="relative">
          <button
            ref={refs.setReference}
            {...getReferenceProps()}
            className={cn(
              "flex items-center gap-1.5 text-sm transition-all rounded-md px-1 -mx-1",
              "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
              isStudentsOpen && "bg-[#f5ede3] dark:bg-[#3d3628]"
            )}
          >
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-bold text-[#a0704b] dark:text-[#cd853f]">
              {stats.active_students}
            </span>
            <span className="hidden sm:inline text-gray-500 dark:text-gray-400 font-medium">
              Students
            </span>
          </button>

          {/* Students Popover */}
          {isStudentsOpen && (
            <FloatingPortal>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
                className={cn(
                  "z-50 w-80 sm:w-96",
                  "bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg",
                  "border border-[#e8d4b8] dark:border-[#6b5a4a]",
                  "overflow-hidden"
                )}
              >
                {/* Header */}
                <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Active Students ({stats.active_students})
                    </span>
                    <button
                      onClick={() => setIsStudentsOpen(false)}
                      className="p-1 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors"
                    >
                      <X className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>

                  {/* Search */}
                  <div className="relative mt-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={cn(
                        "w-full pl-7 pr-3 py-1.5 text-sm rounded-md",
                        "bg-white dark:bg-[#1a1a1a]",
                        "border border-[#d4a574] dark:border-[#8b6f47]",
                        "focus:outline-none focus:ring-1 focus:ring-[#a0704b]",
                        "placeholder:text-gray-400"
                      )}
                    />
                  </div>
                </div>

                {/* Student List */}
                <div className="max-h-[300px] overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">
                      {searchTerm ? "No students found" : "No active students"}
                    </div>
                  ) : (
                    <div className="py-1">
                      {filteredStudents.map((student) => (
                        <Link
                          key={student.id}
                          href={`/students/${student.id}`}
                          onClick={() => setIsStudentsOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
                        >
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono w-16 flex-shrink-0 truncate">
                            {student.school_student_id || `#${student.id}`}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                            {student.student_name}
                          </span>
                          {student.grade && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 whitespace-nowrap flex-shrink-0">
                              {student.grade}{student.lang_stream || ""}
                            </span>
                          )}
                          {student.school && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-gray-800 dark:text-amber-200 whitespace-nowrap flex-shrink-0">
                              {student.school}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-3 py-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50">
                  <Link
                    href="/students"
                    onClick={() => setIsStudentsOpen(false)}
                    className="text-xs text-[#a0704b] dark:text-[#cd853f] hover:underline"
                  >
                    View all students →
                  </Link>
                </div>
              </div>
            </FloatingPortal>
          )}
        </div>

        {/* This Week stat - clickable link */}
        <Link
          href="/sessions?view=weekly"
          className="flex items-center gap-1.5 text-sm rounded-md px-1 -mx-1 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-all"
        >
          <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="font-bold text-[#a0704b] dark:text-[#cd853f]">
            {stats.sessions_this_week}
          </span>
          <span className="hidden sm:inline text-gray-500 dark:text-gray-400 font-medium">
            This Week
          </span>
        </Link>

        {/* Revenue stat */}
        <div className="flex items-center gap-1.5 text-sm">
          <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="font-bold text-[#a0704b] dark:text-[#cd853f]">
            ${stats.revenue_this_month?.toLocaleString() || "0"}
          </span>
          <span className="hidden sm:inline text-gray-500 dark:text-gray-400 font-medium">
            This Month
          </span>
        </div>
      </div>
    </div>
  );
}
