"use client";

import { useState, useMemo } from "react";
import { Users, Calendar, DollarSign, Search, X, Loader2, Eye, EyeOff, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import { useActiveStudents, useCurrentMonthRevenue, useLocationMonthlyRevenue } from "@/lib/hooks";
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
import { GradeBadge } from "@/components/ui/grade-label";
import { IconButton, Input } from "@/components/controls";

interface HeaderStatsProps {
  stats: DashboardStats;
  tutorId?: number;
}

export function HeaderStats({ stats, tutorId }: HeaderStatsProps) {
  const { selectedLocation } = useLocation();
  const [isStudentsOpen, setIsStudentsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Revenue visibility state
  const [isRevenueVisible, setIsRevenueVisible] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Fetch active students only when popover is open (SWR caches results)
  // Pass tutorId to filter for "My View" mode
  const { data: students = [], isLoading } = useActiveStudents(selectedLocation, tutorId, isStudentsOpen);

  // Determine view mode: tutorId present = My View, otherwise = Center View
  const isCenterView = !tutorId;

  // My View: fetch tutor's personal revenue (only when visible)
  const { data: tutorRevenueData, isLoading: tutorRevenueLoading } = useCurrentMonthRevenue(
    tutorId,
    isRevenueVisible && !isCenterView
  );

  // Center View: fetch location-aggregated revenue (only when visible)
  const { data: locationRevenueData, isLoading: locationRevenueLoading } = useLocationMonthlyRevenue(
    selectedLocation === "All Locations" ? null : selectedLocation,
    isRevenueVisible && isCenterView
  );

  // Combine loading states and revenue values
  const revenueLoading = isCenterView ? locationRevenueLoading : tutorRevenueLoading;
  const realRevenue = isCenterView
    ? (locationRevenueData?.total_revenue ?? 0)
    : (tutorRevenueData?.session_revenue ?? 0);

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
              "flex items-center gap-1.5 text-sm transition-all rounded-full px-2.5 py-1",
              "border border-line bg-white/50 dark:bg-[#2d2618]/50",
              "hover:bg-tint",
              isStudentsOpen && "bg-[#f5ede3] dark:bg-[#3d3628]"
            )}
          >
            <Users className="h-4 w-4 text-ink-subtle" />
            <span className="font-bold text-accent-ink">
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
                  "border border-line",
                  "overflow-hidden"
                )}
              >
                {/* Header */}
                <div className="px-3 py-2 border-b border-line bg-tint">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Active Students ({stats.active_students})
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        Students with sessions in past/next 14 days
                      </span>
                    </div>
                    <IconButton
                      size="sm"
                      icon={X}
                      label="Close"
                      onClick={() => setIsStudentsOpen(false)}
                    />
                  </div>

                  {/* Search */}
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                    <Input
                      size="sm"
                      type="text"
                      placeholder="Search students..."
                      aria-label="Search students"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-7"
                    />
                  </div>
                </div>

                {/* Student List */}
                <div className="max-h-[300px] overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
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
                          className="flex items-center gap-2 px-3 py-2 hover:bg-tint transition-colors"
                        >
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0 whitespace-nowrap">
                            {selectedLocation === "All Locations" && student.home_location && `${student.home_location}-`}{student.school_student_id || `#${student.id}`}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">
                            {student.student_name}
                          </span>
                          {student.grade && (
                            <GradeBadge className="text-[11px] px-1.5 py-0.5 rounded font-semibold text-gray-800 whitespace-nowrap flex-shrink-0" grade={student.grade} langStream={student.lang_stream} />
                          )}
                          {student.school && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 whitespace-nowrap flex-shrink-0">
                              {student.school}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-3 py-2 border-t border-line bg-tint/50">
                  <Link
                    href="/students"
                    onClick={() => setIsStudentsOpen(false)}
                    className="text-xs text-accent-ink hover:underline"
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
          className={cn(
            "flex items-center gap-1.5 text-sm transition-all rounded-full px-2.5 py-1",
            "border border-line bg-white/50 dark:bg-[#2d2618]/50",
            "hover:bg-tint"
          )}
        >
          <Calendar className="h-4 w-4 text-ink-subtle" />
          <span className="font-bold text-accent-ink">
            {stats.sessions_this_week}
          </span>
          <span className="hidden sm:inline text-gray-500 dark:text-gray-400 font-medium">
            This Week
          </span>
        </Link>

        {/* Revenue stat - hidden by default with eye toggle */}
        <div className="flex items-center gap-1.5 text-sm">
          <DollarSign className="h-4 w-4 text-ink-subtle" />

          {isRevenueVisible ? (
            // Revenue visible state
            <>
              <span className="font-bold text-accent-ink">
                {revenueLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin inline" />
                ) : (
                  `$${realRevenue.toLocaleString()}`
                )}
              </span>
              <button
                onClick={() => setIsRevenueVisible(false)}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Hide revenue"
              >
                <EyeOff className="h-3.5 w-3.5 text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </>
          ) : showConfirmation ? (
            // Confirmation state
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Show?</span>
              <button
                onClick={() => { setIsRevenueVisible(true); setShowConfirmation(false); }}
                className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                title="Confirm"
              >
                <Check className="h-3.5 w-3.5 text-green-700" />
              </button>
              <button
                onClick={() => setShowConfirmation(false)}
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                title="Cancel"
              >
                <X className="h-3.5 w-3.5 text-red-600" />
              </button>
            </div>
          ) : (
            // Hidden state (default)
            <>
              <span className="font-bold text-accent-ink/30">
                $••••
              </span>
              <button
                onClick={() => setShowConfirmation(true)}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Show revenue"
              >
                <Eye className="h-3.5 w-3.5 text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </>
          )}

          <span className="hidden sm:inline text-gray-500 dark:text-gray-400 font-medium">
            This Month
          </span>
        </div>
      </div>
    </div>
  );
}
