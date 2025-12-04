"use client";

import React, { useEffect, useLayoutEffect, useState, useMemo } from "react";
import { api, tutorsAPI } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session, Tutor } from "@/types";
import Link from "next/link";
import { Calendar, Clock, ChevronRight, ExternalLink, HandCoins } from "lucide-react";
import { getSessionStatusConfig, getStatusSortOrder } from "@/lib/session-status";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, IndexCard, StickyNote } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ViewSwitcher, type ViewMode } from "@/components/sessions/ViewSwitcher";
import { WeeklyGridView } from "@/components/sessions/WeeklyGridView";
import { DailyGridView } from "@/components/sessions/DailyGridView";
import { MonthlyCalendarView } from "@/components/sessions/MonthlyCalendarView";
import { StatusFilterDropdown } from "@/components/sessions/StatusFilterDropdown";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { StarRating, parseStarRating } from "@/components/ui/star-rating";
import { toDateString, getWeekBounds, getMonthBounds } from "@/lib/calendar-utils";

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
  return GRADE_COLORS[key] || "#e5e7eb"; // fallback to gray-200
};

export default function SessionsPage() {
  const { selectedLocation } = useLocation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize state from URL query params (with fallbacks)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const dateParam = searchParams.get('date');
    return dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [tutorFilter, setTutorFilter] = useState("");
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const param = searchParams.get('view');
    return (param as ViewMode) || 'list';
  });

  // Popover state for list view
  const [popoverSession, setPopoverSession] = useState<Session | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Toolbar height tracking for dynamic sticky offset
  // Use callback ref (setState) so effect re-runs when element mounts
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(52);

  // Track toolbar height changes (for responsive wrapping)
  useLayoutEffect(() => {
    // Only track when in list view and element is mounted
    if (viewMode !== "list" || !toolbarElement) return;

    const updateHeight = () => {
      setToolbarHeight(toolbarElement.getBoundingClientRect().height);
    };

    // Initial measurement
    updateHeight();

    // ResizeObserver for element size changes
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });
    resizeObserver.observe(toolbarElement);

    // Window resize listener as backup (for when wrapping changes due to width)
    window.addEventListener('resize', updateHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [viewMode, toolbarElement]);

  // Detect mobile device for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync view state to URL (use replace to avoid polluting history)
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', viewMode);
    params.set('date', toDateString(selectedDate));

    router.replace(`/sessions?${params.toString()}`, { scroll: false });
  }, [viewMode, selectedDate, router]);

  // Fetch tutors on mount
  useEffect(() => {
    async function fetchTutors() {
      try {
        const data = await tutorsAPI.getAll();
        setTutors(data);
      } catch (err) {
        console.error("Failed to load tutors:", err);
      }
    }
    fetchTutors();
  }, []);

  // Handle card click - open popover at click position
  const handleCardClick = (session: Session, event: React.MouseEvent) => {
    setPopoverClickPosition({ x: event.clientX, y: event.clientY });
    setPopoverSession(session);
  };

  useEffect(() => {
    async function fetchSessions() {
      try {
        setLoading(true);

        // Prepare date filters based on view mode
        const filters: Record<string, string | number | undefined> = {
          location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
          status: statusFilter || undefined,
          tutor_id: tutorFilter ? parseInt(tutorFilter) : undefined,
          limit: viewMode === "monthly" ? 2000 : 500,
        };

        if (viewMode === "list" || viewMode === "daily") {
          // For list and daily views, fetch just the selected date
          filters.date = toDateString(selectedDate);
        } else if (viewMode === "weekly") {
          // For weekly view, fetch the entire week
          const { start, end } = getWeekBounds(selectedDate);
          filters.from_date = toDateString(start);
          filters.to_date = toDateString(end);
        } else if (viewMode === "monthly") {
          // For monthly view, fetch the entire month
          const { start, end } = getMonthBounds(selectedDate);
          filters.from_date = toDateString(start);
          filters.to_date = toDateString(end);
        }

        const data = await api.sessions.getAll(filters);
        setSessions(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, [selectedDate, statusFilter, tutorFilter, selectedLocation, viewMode]);

  // Helper to get tutor name without Mr/Ms prefix for sorting
  const getTutorSortName = (name: string) => name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

  // Group sessions by time slot
  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};

    sessions.forEach((session) => {
      const timeSlot = session.time_slot || "Unscheduled";
      if (!groups[timeSlot]) {
        groups[timeSlot] = [];
      }
      groups[timeSlot].push(session);
    });

    // Sort sessions within each group using main group priority
    Object.values(groups).forEach((groupSessions) => {
      // Group by tutor first
      const byTutor = new Map<string, Session[]>();
      groupSessions.forEach(s => {
        const tutor = s.tutor_name || '';
        if (!byTutor.has(tutor)) byTutor.set(tutor, []);
        byTutor.get(tutor)!.push(s);
      });

      // For each tutor, find main group and sort
      const sortedSessions: Session[] = [];
      const tutorNames = [...byTutor.keys()].sort((a, b) =>
        getTutorSortName(a).localeCompare(getTutorSortName(b))
      );

      for (const tutor of tutorNames) {
        const tutorSessions = byTutor.get(tutor)!;

        // Find majority grade+lang_stream among Scheduled only
        const scheduledSessions = tutorSessions.filter(s => s.session_status === 'Scheduled');
        const gradeCounts = new Map<string, number>();
        scheduledSessions.forEach(s => {
          const key = `${s.grade || ''}${s.lang_stream || ''}`;
          gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
        });
        const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

        // Sort with main group priority
        tutorSessions.sort((a, b) => {
          const getPriority = (s: Session) => {
            const gradeKey = `${s.grade || ''}${s.lang_stream || ''}`;
            const isMainGroup = gradeKey === mainGroup && mainGroup !== '';
            const status = s.session_status || '';

            if (status === 'Trial Class') return 0;
            if (isMainGroup && status === 'Scheduled') return 1;
            if (isMainGroup && status === 'Attended') return 2;
            if (status === 'Scheduled') return 3;
            if (status === 'Attended') return 4;
            if (status === 'Make-up Class') return 5;
            if (status === 'Attended (Make-up)') return 6;
            return 10 + getStatusSortOrder(status);
          };

          const priorityA = getPriority(a);
          const priorityB = getPriority(b);
          if (priorityA !== priorityB) return priorityA - priorityB;

          // Within same priority (especially main group), sort by school then student_id
          if (priorityA <= 2) {
            const schoolCompare = (a.school || '').localeCompare(b.school || '');
            if (schoolCompare !== 0) return schoolCompare;
          }
          return (a.school_student_id || '').localeCompare(b.school_student_id || '');
        });

        sortedSessions.push(...tutorSessions);
      }

      // Replace original array contents
      groupSessions.length = 0;
      groupSessions.push(...sortedSessions);
    });

    // Sort time slots chronologically
    return Object.entries(groups).sort(([timeA], [timeB]) => {
      // Handle "Unscheduled" to appear last
      if (timeA === "Unscheduled") return 1;
      if (timeB === "Unscheduled") return -1;

      const startA = timeA.split("-")[0];
      const startB = timeB.split("-")[0];
      return startA.localeCompare(startB);
    });
  }, [sessions]);

  // Filter and sort tutors by selected location
  const filteredTutors = useMemo(() => {
    const filtered = selectedLocation === "All Locations"
      ? tutors
      : tutors.filter(t => t.default_location === selectedLocation);
    return [...filtered].sort((a, b) =>
      getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name))
    );
  }, [tutors, selectedLocation]);

  if (loading) {
    return (
      <DeskSurface fullHeight={viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly"}>
        <PageTransition className={cn(
          "flex flex-col gap-2 sm:gap-3 p-2 sm:p-4",
          (viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly") && "h-full overflow-hidden"
        )}>
          {/* Toolbar Skeleton */}
          <div className={cn(
            "flex items-center gap-2 sm:gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
            !isMobile && "paper-texture"
          )}>
            {/* Title */}
            <div className="h-5 w-5 bg-[#d4a574]/50 dark:bg-[#8b6f47]/50 rounded animate-pulse" />
            <div className="h-5 w-20 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />
            {/* View switcher */}
            <div className="flex gap-1">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-7 w-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
            <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />
            {/* Filters placeholder */}
            <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse hidden sm:block" />
            <div className="h-7 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse hidden sm:block" />
            <div className="ml-auto h-5 w-16 bg-amber-200/50 dark:bg-amber-800/50 rounded-full animate-pulse" />
          </div>

          {viewMode === "weekly" ? (
            /* Weekly View Skeleton */
            <div className="flex-1 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
              {/* Day headers row */}
              <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
                <div className="p-2 bg-[#fef9f3] dark:bg-[#2d2618]" />
                {[1,2,3,4,5,6,7].map(i => (
                  <div key={i} className="py-2 px-1.5 text-center bg-[#fef9f3] dark:bg-[#2d2618] border-l border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="h-3 w-8 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-1" />
                    <div className="h-5 w-6 mx-auto bg-gray-400 dark:bg-gray-500 rounded animate-pulse" />
                  </div>
                ))}
              </div>
              {/* Grid body */}
              <div className="grid flex-1" style={{ gridTemplateColumns: "60px repeat(7, 1fr)", height: "calc(100% - 52px)" }}>
                {/* Time labels column */}
                <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] py-4">
                  {["10AM","11AM","12PM","1PM","2PM","3PM","4PM","5PM"].map(t => (
                    <div key={t} className="h-3 w-10 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-8" />
                  ))}
                </div>
                {/* Day columns */}
                {[1,2,3,4,5,6,7].map(d => (
                  <div key={d} className="border-l border-[#e8d4b8] dark:border-[#6b5a4a] relative p-1">
                    {d % 2 === 0 && (
                      <div className="absolute top-4 left-1 right-1 h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    )}
                    {d % 3 === 0 && (
                      <div className="absolute top-16 left-1 right-1 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : viewMode === "daily" ? (
            /* Daily View Skeleton */
            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
              {/* Day Navigation Skeleton */}
              <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5">
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                <div className="flex items-center gap-2">
                  <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  <div className="h-7 w-28 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  <div className="h-5 w-40 bg-gray-300 dark:bg-gray-600 rounded animate-pulse hidden sm:block" />
                </div>
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
              </div>

              {/* Grid Skeleton */}
              <div className="flex-1 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
                {/* Tutor headers row - 1 expanded + 3 collapsed */}
                <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]" style={{ gridTemplateColumns: "60px 1fr 36px 36px 36px" }}>
                  <div className="p-1.5 bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="h-3 w-8 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  </div>
                  {/* Expanded tutor header */}
                  <div className="py-1 px-1.5 text-center bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                    <div className="h-3 w-20 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-1" />
                    <div className="h-3 w-16 mx-auto bg-[#d4a574]/50 dark:bg-[#8b6f47]/50 rounded animate-pulse" />
                  </div>
                  {/* Collapsed tutor headers */}
                  {[1, 2, 3].map(i => (
                    <div key={i} className={cn(
                      "py-1 px-0.5 border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      i % 2 === 1 ? "bg-[#f5ede3] dark:bg-[#181510]" : "bg-[#fef9f3] dark:bg-[#2d2618]"
                    )}>
                      <div className="h-full flex items-center justify-center">
                        <div className="h-8 w-2 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Grid body */}
                <div className="grid flex-1" style={{ gridTemplateColumns: "60px 1fr 36px 36px 36px", height: "calc(100% - 40px)" }}>
                  {/* Time labels column */}
                  <div className="bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] py-4">
                    {["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"].map(t => (
                      <div key={t} className="h-3 w-10 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-8" />
                    ))}
                  </div>
                  {/* Expanded tutor column with session placeholders */}
                  <div className="border-r border-[#e8d4b8] dark:border-[#6b5a4a] relative p-1">
                    <div className="absolute top-8 left-1 right-1 h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="absolute top-28 left-1 right-1 h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="absolute top-48 left-1 right-1 h-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  {/* Collapsed tutor columns */}
                  {[1, 2, 3].map(i => (
                    <div key={i} className={cn(
                      "border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      i % 2 === 1 ? "bg-[#f8f4ef] dark:bg-[#131310]" : ""
                    )} />
                  ))}
                </div>
              </div>
            </div>
          ) : viewMode === "monthly" ? (
            /* Monthly View Skeleton */
            <div className="flex-1 flex flex-col gap-1 overflow-hidden">
              {/* Month Navigation Skeleton */}
              <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5">
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                <div className="flex items-center gap-2">
                  <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                  <div className="h-5 w-32 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                </div>
                <div className="h-7 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
              </div>

              {/* Calendar Grid Skeleton */}
              <div className="flex-1 bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                    <div
                      key={day}
                      className={cn(
                        "py-1.5 px-1 text-center bg-[#fef9f3] dark:bg-[#2d2618]",
                        i > 0 && "border-l border-[#e8d4b8] dark:border-[#6b5a4a]"
                      )}
                    >
                      <div className="h-3 w-8 mx-auto bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
                {/* Calendar Days Grid - 6 rows */}
                <div className="grid grid-cols-7 auto-rows-fr" style={{ minHeight: isMobile ? "400px" : "500px" }}>
                  {Array.from({ length: 42 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-1.5 border-b border-[#e8d4b8] dark:border-[#6b5a4a]",
                        i % 7 !== 0 && "border-l",
                        (i < 3 || i > 30) && "opacity-40"
                      )}
                    >
                      {/* Day number */}
                      <div className="h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-1" />
                      {/* Tutor workload placeholders - show on some cells */}
                      {i % 4 === 0 && i >= 3 && i <= 30 && (
                        <div className="space-y-0.5">
                          <div className="h-2.5 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                          <div className="h-2.5 w-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                      )}
                      {/* Load bar placeholder */}
                      {i % 3 === 0 && i >= 3 && i <= 30 && (
                        <div className="absolute bottom-1 left-1 right-1">
                          <div className="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* List View Skeleton */
            <AnimatePresence mode="wait">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: i * 0.1,
                    duration: 0.4,
                    ease: [0.38, 1.21, 0.22, 1.00]
                  }}
                >
                  {/* Time slot header skeleton */}
                  <div className={cn(
                    "flex items-center gap-3 p-4 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-l-4 border-[#a0704b] dark:border-[#cd853f] mb-4",
                    !isMobile && "paper-texture"
                  )}>
                    <div className="w-9 h-9 bg-[#a0704b]/30 dark:bg-[#cd853f]/30 rounded-full animate-pulse" />
                    <div className="h-5 w-24 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                    <div className="ml-auto h-6 w-16 bg-amber-200 dark:bg-amber-800 rounded-full animate-pulse" />
                  </div>
                  {/* Session card skeletons */}
                  <div className="ml-0 sm:ml-4 space-y-3">
                    {[1, 2].map((j) => (
                      <div key={j} className={cn(
                        "flex rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
                        !isMobile && "paper-texture"
                      )}>
                        <div className="flex-1 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="h-5 w-28 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                            <div className="h-4 w-10 bg-green-200 dark:bg-green-900 rounded animate-pulse hidden sm:block" />
                          </div>
                          <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                        <div className="w-10 sm:w-12 bg-gray-300 dark:bg-gray-600 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </PageTransition>
      </DeskSurface>
    );
  }

  if (error) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Oops!</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">Error: {error}</p>
            </div>
          </StickyNote>
        </PageTransition>
      </DeskSurface>
    );
  }

  // Toolbar content (shared between animated and non-animated versions)
  const toolbarContent = (
    <>
      {/* Title */}
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
        <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">Schedule</h1>
      </div>

      <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

      {/* Inline View Switcher */}
      <ViewSwitcher currentView={viewMode} onViewChange={setViewMode} compact />

      {/* Show filters for list and weekly views */}
      {(viewMode === "list" || viewMode === "weekly") && (
        <>
          <div className="h-6 w-px bg-[#d4a574]/50 hidden sm:block" />

          {/* Date Picker (only for list view) */}
          {viewMode === "list" && (
            <input
              type="date"
              defaultValue={toDateString(selectedDate)}
              key={toDateString(selectedDate)}
              onBlur={(e) => {
                const date = new Date(e.target.value + 'T00:00:00');
                if (!isNaN(date.getTime()) && toDateString(date) !== toDateString(selectedDate)) {
                  setSelectedDate(date);
                }
              }}
              className="px-2 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 font-medium"
            />
          )}

          {/* Compact Status Filter with color indicators */}
          <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />

          {/* Compact Tutor Filter */}
          <select
            value={tutorFilter}
            onChange={(e) => setTutorFilter(e.target.value)}
            className="px-2 py-1 text-sm bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 font-medium appearance-none cursor-pointer pr-7"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0704b' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.5rem center',
            }}
          >
            <option value="">Tutor</option>
            {filteredTutors.map((tutor) => (
              <option key={tutor.id} value={tutor.id.toString()}>
                {tutor.tutor_name}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="flex-1" />

      {/* Session count */}
      <span className="text-xs sm:text-sm font-semibold text-[#a0704b] dark:text-[#cd853f] whitespace-nowrap">
        {sessions.length} sessions
      </span>
    </>
  );

  // Toolbar: outer div is clean sticky container, inner div has visual styling
  const toolbarStickyClasses = "sticky top-0 z-30";
  const toolbarInnerClasses = cn(
    "flex flex-wrap items-center gap-2 sm:gap-3 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 sm:px-4 py-2",
    !isMobile && "paper-texture"
  );

  // For list view: Use fullHeight to propagate height constraints for sticky positioning
  // For other views: Use PageTransition with animations
  if (viewMode === "list") {
    return (
      <DeskSurface fullHeight>
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 sm:gap-3 p-2 sm:p-4">
            {/* Toolbar - outer div is sticky, inner div has visual styling */}
            <div ref={setToolbarElement} className={toolbarStickyClasses}>
              <div className={toolbarInnerClasses}>
                {toolbarContent}
              </div>
            </div>

            {/* List view content */}
            {groupedSessions.length === 0 ? (
              <div className="flex justify-center py-12">
                <StickyNote variant="yellow" size="lg" showTape={true} className="desk-shadow-medium">
                  <div className="text-center">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-gray-700 dark:text-gray-300" />
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">No sessions found</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Try selecting a different date or adjusting your filters
                    </p>
                  </div>
                </StickyNote>
              </div>
            ) : (
              <>
                {groupedSessions.map(([timeSlot, sessionsInSlot], groupIndex) => (
                  <React.Fragment key={timeSlot}>
                    {/* Time Slot Header - Index Card Style */}
                    {/* Outer div is clean sticky container; inner div has visual effects */}
                    <div className="sticky z-20 mb-4" style={{ top: toolbarHeight }}>
                      <div
                        className={cn(
                          "bg-[#fef9f3] dark:bg-[#2d2618] border-l-4 border-[#a0704b] dark:border-[#cd853f] rounded-lg p-4 desk-shadow-low",
                          !isMobile && "paper-texture"
                        )}
                        style={{ transform: isMobile ? 'none' : 'rotate(-0.1deg)' }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="bg-[#a0704b] dark:bg-[#cd853f] p-2 rounded-full">
                              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                            </div>
                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                              {timeSlot}
                            </h3>
                          </div>
                          <div className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-3 py-1 rounded-full border-2 border-amber-600 dark:border-amber-700 font-bold text-xs sm:text-sm">
                            {sessionsInSlot.length} session{sessionsInSlot.length !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Session Cards */}
                    <div className="space-y-3 ml-0 sm:ml-4">
                      {sessionsInSlot.map((session, sessionIndex) => {
                        const statusConfig = getSessionStatusConfig(session.session_status);
                        const StatusIcon = statusConfig.Icon;
                        const prevSession = sessionIndex > 0 ? sessionsInSlot[sessionIndex - 1] : null;
                        const isNewTutor = prevSession && prevSession.tutor_name !== session.tutor_name;
                        return (
                          <div key={session.id}>
                            {isNewTutor && (
                              <div className="border-t-2 border-dashed border-[#d4a574] dark:border-[#8b6f47] my-4" />
                            )}
                            <motion.div
                              initial={{ opacity: 0, x: -20 }}
                              animate={{
                                opacity: 1,
                                x: 0
                              }}
                              transition={{
                                delay: isMobile ? 0 : 0.7 + groupIndex * 0.1 + sessionIndex * 0.05,
                                duration: 0.35,
                                ease: [0.38, 1.21, 0.22, 1.00]
                              }}
                              whileHover={!isMobile ? {
                                scale: 1.02,
                                y: -4,
                                transition: { duration: 0.2 }
                              } : {}}
                              whileTap={{ scale: 0.98 }}
                              onClick={(e) => handleCardClick(session, e)}
                              title="Click for quick view"
                              className={cn(
                                "relative rounded-lg cursor-pointer transition-all duration-200 overflow-hidden flex",
                                statusConfig.bgTint,
                                !isMobile && "paper-texture"
                              )}
                              style={{
                                transform: isMobile ? 'none' : `rotate(${sessionIndex % 2 === 0 ? -0.3 : 0.3}deg)`,
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                              }}
                            >
                              {/* Main content */}
                              <div className="flex-1 p-3 sm:p-4 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  {/* Left side - Session info */}
                                  <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className={cn(
                                        "flex items-center gap-1.5 min-w-0",
                                        statusConfig.strikethrough && "line-through decoration-gray-500 dark:decoration-gray-400"
                                      )}>
                                        <span className={cn(
                                          "text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap flex-shrink-0",
                                          statusConfig.strikethrough && "text-gray-500 dark:text-gray-400"
                                        )}>
                                          {selectedLocation === "All Locations" && session.location && `${session.location}-`}{session.school_student_id}
                                        </span>
                                        <span className={cn(
                                          "font-bold text-base truncate",
                                          session.financial_status !== "Paid"
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-gray-900 dark:text-gray-100",
                                          statusConfig.strikethrough && "text-gray-500 dark:text-gray-400"
                                        )}>
                                          {session.student_name}
                                        </span>
                                      </p>
                                      {session.grade && (
                                        <span
                                          className="text-[11px] px-1.5 py-0.5 rounded text-gray-800 whitespace-nowrap hidden sm:inline"
                                          style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                                        >{session.grade}{session.lang_stream || ''}</span>
                                      )}
                                      {session.school && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap hidden sm:inline">{session.school}</span>
                                      )}
                                      {session.financial_status !== "Paid" && (
                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 whitespace-nowrap flex items-center gap-0.5">
                                          <HandCoins className="h-3.5 w-3.5" />
                                          <span className="hidden sm:inline">Unpaid</span>
                                        </span>
                                      )}
                                      <Link
                                        href={`/sessions/${session.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#a0704b]/10 hover:bg-[#a0704b]/20 dark:bg-[#cd853f]/10 dark:hover:bg-[#cd853f]/20 text-[#a0704b] dark:text-[#cd853f] font-medium whitespace-nowrap transition-colors flex-shrink-0"
                                      >
                                        <span className="hidden sm:inline">View</span>
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Link>
                                    </div>

                                    {session.notes && (
                                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
                                        {session.notes}
                                      </p>
                                    )}

                                    {session.performance_rating && (
                                      <StarRating
                                        rating={parseStarRating(session.performance_rating)}
                                        showEmpty={true}
                                        size="sm"
                                        className="mt-1"
                                      />
                                    )}
                                  </div>

                                  {/* Right side - Status text */}
                                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                                    <p className={cn("text-sm font-medium truncate max-w-[80px] sm:max-w-none", statusConfig.textClass)}>
                                      {session.session_status}
                                    </p>
                                    {session.tutor_name && (
                                      <p className="text-xs text-gray-600 dark:text-gray-400">
                                        {session.tutor_name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Status color strip with icon - RIGHT side */}
                              <div className={cn("w-10 sm:w-12 flex-shrink-0 flex items-center justify-center rounded-r-lg", statusConfig.bgClass)}>
                                <StatusIcon className={cn("h-5 w-5 sm:h-6 sm:w-6 text-white", statusConfig.iconClass)} />
                              </div>
                            </motion.div>
                          </div>
                        );
                      })}
                    </div>
                  </React.Fragment>
                ))}

                {/* Quick Stats - Report Card Style */}
                {groupedSessions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: isMobile ? 0.4 : 0.3 + groupedSessions.length * 0.05,
                      duration: isMobile ? 0.3 : 0.5,
                      ease: [0.38, 1.21, 0.22, 1.00]
                    }}
                    className={cn(
                      "relative bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 border-4 border-amber-400 dark:border-amber-600 rounded-lg p-4 sm:p-6 desk-shadow-medium",
                      !isMobile && "paper-texture"
                    )}
                    style={{ transform: isMobile ? 'none' : 'rotate(0.3deg)' }}
                  >
                    {/* Paper texture overlay - hidden on mobile */}
                    {!isMobile && (
                      <div
                        className="absolute inset-0 opacity-10 pointer-events-none rounded-lg"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
                        }}
                      />
                    )}

                    {/* Header */}
                    <div className="relative mb-4 sm:mb-6">
                      <h3 className="text-lg sm:text-xl font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wide text-center">
                        Session Summary
                      </h3>
                      <p className="text-center text-xs sm:text-sm text-amber-700 dark:text-amber-300 mt-1">
                        {selectedDate.toLocaleDateString('en-US', {
                          weekday: isMobile ? 'short' : 'long',
                          year: 'numeric',
                          month: isMobile ? 'short' : 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="relative grid gap-3 sm:gap-6 grid-cols-3">
                      {/* Total Sessions */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700 text-center">
                        <p className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                          Total
                        </p>
                        <p className="text-2xl sm:text-4xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                          {sessions.length}
                        </p>
                      </div>

                      {/* Time Slots */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700 text-center">
                        <p className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                          Slots
                        </p>
                        <p className="text-2xl sm:text-4xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                          {groupedSessions.length}
                        </p>
                      </div>

                      {/* Average per Slot */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 sm:p-4 border-2 border-amber-300 dark:border-amber-700 text-center">
                        <p className="text-xs sm:text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1 sm:mb-2">
                          Average
                        </p>
                        <p className="text-2xl sm:text-4xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                          {(sessions.length / groupedSessions.length).toFixed(1)}
                        </p>
                      </div>
                    </div>

                    {/* Corner fold */}
                    <div className="absolute top-0 right-0 w-0 h-0 border-t-[30px] border-t-amber-600 dark:border-t-amber-700 border-l-[30px] border-l-transparent" />
                  </motion.div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Session Detail Popover */}
        {popoverSession && (
          <SessionDetailPopover
            session={popoverSession}
            isOpen={!!popoverSession}
            onClose={() => setPopoverSession(null)}
            clickPosition={popoverClickPosition}
            tutorFilter={tutorFilter}
          />
        )}
      </DeskSurface>
    );
  }

  // Non-list views (weekly, daily, monthly)
  return (
    <DeskSurface fullHeight={viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly"}>
      <PageTransition className={cn(
        "flex flex-col gap-2 sm:gap-3 p-2 sm:p-4",
        (viewMode === "weekly" || viewMode === "daily" || viewMode === "monthly") && "h-full overflow-hidden"
      )}>
        {/* Toolbar with animation (non-list views don't need sticky) */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.38, 1.21, 0.22, 1.00] }}
          className={toolbarInnerClasses}
        >
          {toolbarContent}
        </motion.div>

      {/* Weekly Calendar View */}
      {viewMode === "weekly" && (
        <WeeklyGridView
          sessions={sessions}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          isMobile={isMobile}
          tutorFilter={tutorFilter}
          fillHeight
        />
      )}

      {/* Daily View */}
      {viewMode === "daily" && (
        <DailyGridView
          sessions={sessions}
          tutors={filteredTutors}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          isMobile={isMobile}
          fillHeight
        />
      )}

      {/* Monthly View */}
      {viewMode === "monthly" && (
        <MonthlyCalendarView
          sessions={sessions}
          tutors={filteredTutors}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onViewModeChange={setViewMode}
          isMobile={isMobile}
        />
      )}
      </PageTransition>
    </DeskSurface>
  );
}
