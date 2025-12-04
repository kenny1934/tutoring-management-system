"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarDays, HandCoins, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { MoreSessionsPopover } from "@/components/sessions/MoreSessionsPopover";
import type { Session, Tutor } from "@/types";
import {
  toDateString,
  getToday,
  calculateSessionHeight,
  parseTimeSlot,
  timeToMinutes,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getStatusSortOrder } from "@/lib/session-status";

// Helper to get tutor name without Mr/Ms prefix for sorting
const getTutorSortName = (name: string) => name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

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

interface DailyGridViewProps {
  sessions: Session[];
  tutors: Tutor[];  // Filtered by location already
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isMobile?: boolean;
  fillHeight?: boolean;
}

export function DailyGridView({
  sessions,
  tutors,
  selectedDate,
  onDateChange,
  isMobile = false,
  fillHeight = false,
}: DailyGridViewProps) {
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [openMoreGroup, setOpenMoreGroup] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [expandedTutors, setExpandedTutors] = useState<Set<number>>(new Set());
  const [showAllTutors, setShowAllTutors] = useState(false);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);
  const moreButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoExpanded = useRef(false);

  const today = getToday();

  // Group sessions by tutor
  const sessionsByTutor = useMemo(() => {
    const groups = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const tutorId = session.tutor_id?.toString() || "unknown";
      if (!groups.has(tutorId)) {
        groups.set(tutorId, []);
      }
      groups.get(tutorId)!.push(session);
    });
    return groups;
  }, [sessions]);

  // Get tutors with sessions for this day (filtered by location in parent)
  const activeTutors = useMemo(() => {
    const tutorIds = new Set(sessions.map(s => s.tutor_id));
    return tutors
      .filter(t => tutorIds.has(t.id))
      .sort((a, b) => getTutorSortName(a.tutor_name).localeCompare(getTutorSortName(b.tutor_name)));
  }, [sessions, tutors]);

  // Calculate dynamic time range based on actual sessions
  const { startHour, endHour } = useMemo(() => {
    if (sessions.length === 0) {
      return { startHour: 10, endHour: 20 };
    }

    let minStartMinutes = Infinity;
    let maxEndMinutes = -Infinity;

    sessions.forEach((session) => {
      const parsed = parseTimeSlot(session.time_slot);
      if (!parsed) return;

      const startMins = timeToMinutes(parsed.start);
      const endMins = timeToMinutes(parsed.end);
      minStartMinutes = Math.min(minStartMinutes, startMins);
      maxEndMinutes = Math.max(maxEndMinutes, endMins);
    });

    if (minStartMinutes === Infinity) {
      return { startHour: 10, endHour: 20 };
    }

    // Start at floor hour of earliest session, end at ceil hour of latest session
    const calcStartHour = Math.max(8, Math.floor(minStartMinutes / 60));
    const calcEndHour = Math.min(20, Math.ceil(maxEndMinutes / 60));

    return { startHour: calcStartHour, endHour: calcEndHour };
  }, [sessions]);

  // Auto-expand first tutor with sessions (only on initial load)
  useEffect(() => {
    if (hasAutoExpanded.current) return;

    const firstTutorWithSessions = activeTutors.find(t =>
      sessionsByTutor.has(t.id.toString())
    );
    if (firstTutorWithSessions) {
      setExpandedTutors(new Set([firstTutorWithSessions.id]));
      hasAutoExpanded.current = true;
    }
  }, [activeTutors, sessionsByTutor]);

  // Measure available height when fillHeight is enabled
  useEffect(() => {
    if (!fillHeight || !containerRef.current) return;

    const measureHeight = () => {
      const container = containerRef.current;
      if (!container) return;

      // Get viewport height minus the container's top position minus some padding
      const rect = container.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 16; // 16px bottom padding
      setContainerHeight(Math.max(300, availableHeight)); // Minimum 300px
    };

    measureHeight();
    window.addEventListener('resize', measureHeight);
    return () => window.removeEventListener('resize', measureHeight);
  }, [fillHeight]);

  // Calculate grid height - use measured height when fillHeight is enabled
  const totalMinutes = (endHour - startHour) * 60;

  // Pixels per minute calculation
  let pixelsPerMinute: number;
  let totalHeight: number;

  if (fillHeight) {
    if (containerHeight) {
      // Calculate pixelsPerMinute to fit the available height
      // Account for: navHeader(40) + tutorHeader(36) + borders(8) + space-y-1(4) + buffer(12) = 100px
      const gridHeight = containerHeight - 100;
      pixelsPerMinute = Math.max(0.5, gridHeight / totalMinutes); // Minimum 0.5 to keep things readable
      totalHeight = gridHeight;
    } else {
      // Before measurement, use a safe small default to avoid scrollbar flash
      pixelsPerMinute = 0.5;
      totalHeight = totalMinutes * pixelsPerMinute;
    }
  } else {
    // Default fixed calculation
    pixelsPerMinute = isMobile ? 0.75 : 1;
    totalHeight = totalMinutes * pixelsPerMinute;
  }

  // Determine if tutor column is collapsed
  const isTutorCollapsed = (tutorId: number) => {
    if (showAllTutors) return false;
    return !expandedTutors.has(tutorId);
  };

  // Toggle individual tutor expansion
  const toggleTutorExpand = (tutorId: number) => {
    if (showAllTutors) {
      // Transitioning from "show all" mode - expand all others except this one
      setShowAllTutors(false);
      setExpandedTutors(new Set(activeTutors.filter(t => t.id !== tutorId).map(t => t.id)));
    } else {
      setExpandedTutors(prev => {
        const next = new Set(prev);
        if (next.has(tutorId)) {
          next.delete(tutorId);
        } else {
          next.add(tutorId);
        }
        return next;
      });
    }
  };

  // Generate dynamic grid columns
  const gridColumns = useMemo(() => {
    const columns = activeTutors.map(t => {
      const isCollapsed = showAllTutors ? false : !expandedTutors.has(t.id);
      return isCollapsed ? "36px" : "1fr";
    });
    return `60px ${columns.join(" ")}`;
  }, [activeTutors, expandedTutors, showAllTutors]);

  // Count collapsed tutors for toggle button
  const collapsedTutorsCount = activeTutors.filter(t => isTutorCollapsed(t.id)).length;

  const handlePreviousDay = () => {
    const prevDay = new Date(selectedDate);
    prevDay.setDate(prevDay.getDate() - 1);
    onDateChange(prevDay);
  };

  const handleNextDay = () => {
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);
    onDateChange(nextDay);
  };

  // Generate hour labels
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

  // Calculate session position using dynamic start hour
  const getSessionTop = (timeSlot: string) => {
    const parsed = parseTimeSlot(timeSlot);
    if (!parsed) return 0;
    const startMins = timeToMinutes(parsed.start);
    return (startMins - startHour * 60) * pixelsPerMinute;
  };

  // Format full date display
  const fullDateDisplay = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const isToday = toDateString(selectedDate) === toDateString(today);

  return (
    <div ref={containerRef} className={cn("space-y-1 flex flex-col", fillHeight && "flex-1 min-h-0 overflow-hidden")}>
      {/* Day Navigation */}
      <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5 paper-texture">
        {/* Left: Prev button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousDay}
          className="flex items-center gap-1 h-7 px-2 text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        {/* Center: Today, Date picker, Date display */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Today button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDateChange(getToday())}
            className="flex items-center gap-1 h-7 px-2 text-xs"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Today</span>
          </Button>

          {/* Date picker */}
          <input
            type="date"
            defaultValue={toDateString(selectedDate)}
            key={toDateString(selectedDate)}
            onBlur={(e) => {
              const date = new Date(e.target.value + 'T00:00:00');
              if (!isNaN(date.getTime()) && toDateString(date) !== toDateString(selectedDate)) {
                onDateChange(date);
              }
            }}
            className="h-7 px-2 text-xs bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md focus:outline-none focus:ring-1 focus:ring-[#a0704b] text-gray-900 dark:text-gray-100 font-medium"
          />

          {/* Full date display */}
          <div className="text-center hidden sm:block">
            <p className={cn(
              "text-sm font-bold",
              isToday ? "text-[#a0704b] dark:text-[#cd853f]" : "text-gray-900 dark:text-gray-100"
            )}>
              {fullDateDisplay}
            </p>
          </div>
          {/* Mobile date display */}
          <span className="sm:hidden text-xs font-bold text-gray-900 dark:text-gray-100">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Toggle all tutors button */}
        {collapsedTutorsCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllTutors(!showAllTutors)}
            className="flex items-center gap-1 h-7 px-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            title={showAllTutors ? "Collapse tutors" : "Show all tutors"}
          >
            {showAllTutors ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{showAllTutors ? "Collapse" : `+${collapsedTutorsCount} tutors`}</span>
          </Button>
        )}

        {/* Right: Next button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextDay}
          className="flex items-center gap-1 h-7 px-2 text-xs"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden",
        fillHeight && "flex-1 flex flex-col min-h-0"
      )}>
        <div className={cn(fillHeight ? "overflow-hidden flex-1 flex flex-col min-h-0" : "overflow-x-auto")}>
          <div className={cn(fillHeight ? "flex-1 flex flex-col overflow-hidden" : "min-w-[800px]")}>
            {/* Tutor Headers */}
            <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] sticky top-0 bg-white dark:bg-[#1a1a1a] z-10" style={{ gridTemplateColumns: gridColumns }}>
              <div className="p-1.5 bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center">
                <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400">TIME</p>
              </div>
              {activeTutors.map((tutor, index) => {
                const isCollapsed = isTutorCollapsed(tutor.id);
                const tutorSessions = sessionsByTutor.get(tutor.id.toString()) || [];
                return (
                  <div
                    key={tutor.id}
                    onClick={() => toggleTutorExpand(tutor.id)}
                    className={cn(
                      "border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a] transition-all cursor-pointer",
                      isCollapsed ? "py-1 px-0.5" : "py-1 px-1.5",
                      index % 2 === 1
                        ? "bg-[#f5ede3] dark:bg-[#181510] hover:bg-[#ebe3d3] dark:hover:bg-[#252015]"
                        : "bg-[#fef9f3] dark:bg-[#2d2618] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                    )}
                  >
                    {isCollapsed ? (
                      <div className="h-full flex items-center justify-center">
                        <span
                          className="text-[9px] font-bold whitespace-nowrap text-gray-400 dark:text-gray-500"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                        >
                          {getTutorSortName(tutor.tutor_name).split(' ')[0] || tutor.tutor_name}
                        </span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase leading-tight text-gray-600 dark:text-gray-400">
                          {tutor.tutor_name}
                        </p>
                        <p className="text-xs font-medium leading-tight text-[#a0704b] dark:text-[#cd853f]">
                          {tutorSessions.length} session{tutorSessions.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div
              className={cn("grid", fillHeight && "overflow-hidden")}
              style={{ height: `${totalHeight}px`, gridTemplateColumns: gridColumns }}
            >
              {/* Time Labels Column */}
              <div className="relative bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                    style={{ top: `${(hour - startHour) * 60 * pixelsPerMinute}px` }}
                  >
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 px-2">
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
                {/* 30-minute grid lines */}
                {hours.map((hour) => (
                  <div
                    key={`${hour}-30`}
                    className="absolute w-full border-t border-dashed border-gray-200/60 dark:border-gray-700/50"
                    style={{ top: `${((hour - startHour) * 60 + 30) * pixelsPerMinute}px` }}
                  />
                ))}
              </div>

              {/* Tutor Columns */}
              {activeTutors.map((tutor, index) => {
                const tutorSessions = sessionsByTutor.get(tutor.id.toString()) || [];
                const isCollapsed = isTutorCollapsed(tutor.id);

                return (
                  <div
                    key={tutor.id}
                    onClick={isCollapsed ? () => toggleTutorExpand(tutor.id) : undefined}
                    className={cn(
                      "relative border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      isCollapsed && "bg-gray-50 dark:bg-gray-900/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50",
                      !isCollapsed && index % 2 === 1 && "bg-[#f8f4ef] dark:bg-[#131310]"
                    )}
                  >
                    {/* Collapsed tutor expand indicator */}
                    {isCollapsed && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}

                    {/* Hour grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                        style={{ top: `${(hour - startHour) * 60 * pixelsPerMinute}px` }}
                      />
                    ))}
                    {/* 30-minute grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={`${hour}-30`}
                        className="absolute w-full border-t border-dashed border-gray-200/60 dark:border-gray-700/50"
                        style={{ top: `${((hour - startHour) * 60 + 30) * pixelsPerMinute}px` }}
                      />
                    ))}

                    {/* Current Time Indicator (show on today) */}
                    {isToday && (() => {
                      const now = new Date();
                      const currentMinutes = now.getHours() * 60 + now.getMinutes();
                      const dayStartMinutes = startHour * 60;
                      const dayEndMinutes = endHour * 60;

                      if (currentMinutes >= dayStartMinutes && currentMinutes <= dayEndMinutes) {
                        const topPosition = (currentMinutes - dayStartMinutes) * pixelsPerMinute;
                        return (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: `${topPosition}px` }}
                          >
                            <div className="flex items-center">
                              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-sm" />
                              <div className="flex-1 h-[2px] bg-red-500 shadow-sm" />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Sessions - Vertical Stacking Container */}
                    {tutorSessions.length > 0 && !isCollapsed && (() => {
                      // Group sessions by overlapping time ranges
                      const timeGroups = new Map<string, Session[]>();

                      tutorSessions.forEach((session) => {
                        const parsed = parseTimeSlot(session.time_slot);
                        if (!parsed) return;

                        const top = getSessionTop(session.time_slot);
                        const height = calculateSessionHeight(session.time_slot, pixelsPerMinute);
                        const key = `${tutor.id}-${top}-${height}`;

                        if (!timeGroups.has(key)) {
                          timeGroups.set(key, []);
                        }
                        timeGroups.get(key)!.push(session);
                      });

                      // Sort sessions within each time group with main group priority
                      timeGroups.forEach((groupSessions) => {
                        // Find majority grade+lang_stream among Scheduled only
                        const scheduledSessions = groupSessions.filter(s => s.session_status === 'Scheduled');
                        const gradeCounts = new Map<string, number>();
                        scheduledSessions.forEach(s => {
                          const key = `${s.grade || ''}${s.lang_stream || ''}`;
                          gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
                        });
                        const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

                        // Sort with main group priority
                        groupSessions.sort((a, b) => {
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

                          // Within same priority, sort by school then student_id
                          if (priorityA <= 2) {
                            const schoolCompare = (a.school || '').localeCompare(b.school || '');
                            if (schoolCompare !== 0) return schoolCompare;
                          }
                          return (a.school_student_id || '').localeCompare(b.school_student_id || '');
                        });
                      });

                      // Detect overlapping groups and assign columns
                      interface TimeGroupInfo {
                        key: string;
                        top: number;
                        bottom: number;
                        column: number;
                        totalColumns: number;
                      }

                      const groupInfos: TimeGroupInfo[] = Array.from(timeGroups.keys()).map(key => {
                        const parts = key.split('-');
                        const height = parseFloat(parts[parts.length - 1]);
                        const top = parseFloat(parts[parts.length - 2]);
                        return { key, top, bottom: top + height, column: 0, totalColumns: 1 };
                      });

                      // Sort by start time
                      groupInfos.sort((a, b) => a.top - b.top);

                      // Assign columns using a greedy algorithm
                      const columns: TimeGroupInfo[][] = [];
                      for (const group of groupInfos) {
                        let placed = false;
                        for (let col = 0; col < columns.length; col++) {
                          const lastInCol = columns[col][columns[col].length - 1];
                          if (lastInCol.bottom <= group.top) {
                            // No overlap, can place in this column
                            columns[col].push(group);
                            group.column = col;
                            placed = true;
                            break;
                          }
                        }
                        if (!placed) {
                          // Need a new column
                          group.column = columns.length;
                          columns.push([group]);
                        }
                      }

                      // Update totalColumns for overlapping groups
                      for (const group of groupInfos) {
                        const overlapping = groupInfos.filter(g =>
                          !(g.bottom <= group.top || g.top >= group.bottom)
                        );
                        const maxCol = Math.max(...overlapping.map(g => g.column));
                        overlapping.forEach(g => g.totalColumns = Math.max(g.totalColumns, maxCol + 1));
                      }

                      const groupInfoMap = new Map(groupInfos.map(g => [g.key, g]));

                      return Array.from(timeGroups.entries()).map(([key, sessionsInGroup]) => {
                        const firstSession = sessionsInGroup[0];
                        const top = getSessionTop(firstSession.time_slot);
                        const height = calculateSessionHeight(firstSession.time_slot, pixelsPerMinute);

                        const info = groupInfoMap.get(key);
                        const widthPercent = 100 / (info?.totalColumns || 1);
                        const leftPercent = (info?.column || 0) * widthPercent;

                        const maxDisplayedSessions = Math.max(1, Math.floor(height / 24)); // ~24px per session
                        const hasMoreSessions = sessionsInGroup.length > maxDisplayedSessions;
                        const displayedSessions = hasMoreSessions
                          ? sessionsInGroup.slice(0, maxDisplayedSessions - 1)
                          : sessionsInGroup;

                        return (
                          <div
                            key={key}
                            className="absolute overflow-hidden"
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`,
                            }}
                          >
                            <div className="flex flex-col gap-0.5 p-0.5 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[#d4a574] scrollbar-track-transparent">
                              {displayedSessions.map((session) => {
                                const statusConfig = getSessionStatusConfig(session.session_status);
                                const StatusIcon = statusConfig.Icon;
                                return (
                                  <motion.div
                                    key={session.id}
                                    whileHover={{
                                      scale: 1.02,
                                      y: -1,
                                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                      zIndex: 50
                                    }}
                                    whileTap={{ scale: 0.98 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPopoverClickPosition({ x: e.clientX, y: e.clientY });
                                      setOpenSessionId(session.id);
                                      setOpenMoreGroup(null);
                                    }}
                                    className={cn(
                                      "cursor-pointer rounded overflow-hidden",
                                      "shadow-sm transition-all",
                                      "flex-shrink-0 flex",
                                      statusConfig.bgTint
                                    )}
                                    style={{
                                      minHeight: "22px",
                                    }}
                                  >
                                    <div className="flex-1 flex flex-col min-w-0 px-1.5 py-0.5">
                                      <p className="font-bold text-[9px] text-gray-500 dark:text-gray-400 leading-tight flex justify-between items-center">
                                        <span className="flex items-center gap-0.5">
                                          {session.school_student_id || "N/A"}
                                          {session.financial_status !== "Paid" && (
                                            <HandCoins className="h-2.5 w-2.5 text-red-500" />
                                          )}
                                        </span>
                                        <span className="text-[8px]">{session.time_slot?.split('-')[0]}</span>
                                      </p>
                                      <p className={cn(
                                        "font-semibold text-[10px] leading-tight flex items-center gap-0.5 overflow-hidden",
                                        session.financial_status !== "Paid"
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-gray-900 dark:text-gray-100",
                                        statusConfig.strikethrough && "line-through text-gray-400 dark:text-gray-500"
                                      )}>
                                        <span className="truncate">{session.student_name || "Unknown"}</span>
                                        {widthPercent >= 50 && session.grade && (
                                          <span
                                            className="text-[7px] px-1 py-px rounded text-gray-800 whitespace-nowrap"
                                            style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                                          >{session.grade}{session.lang_stream || ''}</span>
                                        )}
                                        {widthPercent > 50 && session.school && (
                                          <span className="text-[7px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">{session.school}</span>
                                        )}
                                      </p>
                                    </div>
                                    <div className={cn("w-4 rounded-r flex items-center justify-center", statusConfig.bgClass)}>
                                      <StatusIcon className={cn("h-2.5 w-2.5 text-white", statusConfig.iconClass)} />
                                    </div>
                                  </motion.div>
                                );
                              })}

                              {hasMoreSessions && (
                                <div
                                  ref={(el) => {
                                    if (el) moreButtonRefs.current.set(key, el);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMoreGroup(key);
                                    setOpenSessionId(null);
                                  }}
                                  className={cn(
                                    "cursor-pointer rounded px-1.5 py-0.5 text-center",
                                    "bg-amber-100 dark:bg-amber-900/50",
                                    "border border-amber-400 dark:border-amber-600",
                                    "shadow-sm hover:shadow-md hover:bg-amber-200 dark:hover:bg-amber-800/50",
                                    "transition-all flex-shrink-0"
                                  )}
                                  style={{
                                    minHeight: "20px",
                                  }}
                                >
                                  <p className="font-bold text-[9px] text-amber-800 dark:text-amber-200">
                                    +{sessionsInGroup.length - displayedSessions.length} more
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Session Detail Popovers */}
      {openSessionId !== null && (() => {
        const session = sessions.find((s) => s.id === openSessionId);
        if (!session) return null;

        return (
          <SessionDetailPopover
            session={session}
            isOpen={true}
            onClose={() => setOpenSessionId(null)}
            clickPosition={popoverClickPosition}
          />
        );
      })()}

      {/* More Sessions Popover */}
      {openMoreGroup !== null && (() => {
        const ref = moreButtonRefs.current.get(openMoreGroup);
        if (!ref) return null;

        // Parse tutorId from the group key (format: tutorId-top-height)
        const keyParts = openMoreGroup.split('-');
        const tutorId = keyParts[0];
        const tutorSessions = sessionsByTutor.get(tutorId) || [];

        // Find all sessions in this time group
        const timeGroups = new Map<string, Session[]>();
        tutorSessions.forEach((session) => {
          const parsed = parseTimeSlot(session.time_slot);
          if (!parsed) return;

          const top = getSessionTop(session.time_slot);
          const height = calculateSessionHeight(session.time_slot, pixelsPerMinute);
          const key = `${tutorId}-${top}-${height}`;

          if (!timeGroups.has(key)) {
            timeGroups.set(key, []);
          }
          timeGroups.get(key)!.push(session);
        });

        // Sort sessions within the group
        timeGroups.forEach((groupSessions) => {
          const scheduledSessions = groupSessions.filter(s => s.session_status === 'Scheduled');
          const gradeCounts = new Map<string, number>();
          scheduledSessions.forEach(s => {
            const key = `${s.grade || ''}${s.lang_stream || ''}`;
            gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
          });
          const mainGroup = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

          groupSessions.sort((a, b) => {
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

            if (priorityA <= 2) {
              const schoolCompare = (a.school || '').localeCompare(b.school || '');
              if (schoolCompare !== 0) return schoolCompare;
            }
            return (a.school_student_id || '').localeCompare(b.school_student_id || '');
          });
        });

        const groupSessions = timeGroups.get(openMoreGroup) || [];

        return (
          <MoreSessionsPopover
            sessions={groupSessions}
            triggerRef={{ current: ref }}
            onClose={() => setOpenMoreGroup(null)}
          />
        );
      })()}
    </div>
  );
}
