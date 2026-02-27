"use client";

import { useMemo, useState, useRef, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarDays, HandCoins, Eye, EyeOff, GraduationCap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { MoreSessionsPopover } from "@/components/sessions/MoreSessionsPopover";
import { DatePickerPopover } from "@/components/sessions/DatePickerPopover";
import type { Session } from "@/types";
import {
  getWeekDates,
  getDayName,
  toDateString,
  isSameDay,
  getToday,
  getPreviousWeek,
  getNextWeek,
  getSchoolYearWeek,
  groupSessionsByDate,
  calculateSessionPosition,
  calculateSessionHeight,
  parseTimeSlot,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getStatusSortOrder, getDisplayStatus, isCountableSession } from "@/lib/session-status";
import { getGradeColor } from "@/lib/constants";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { ProposedSessionCard } from "@/components/sessions/ProposedSessionCard";
import type { ProposedSession } from "@/lib/proposal-utils";
import type { MakeupProposal } from "@/types";

interface WeeklyGridViewProps {
  sessions: Session[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isMobile?: boolean;
  tutorFilter?: string;
  fillHeight?: boolean;
  proposedSessions?: ProposedSession[];
  onProposalClick?: (proposal: MakeupProposal) => void;
  sessionProposalMap?: Map<number, MakeupProposal>;
}

export const WeeklyGridView = memo(function WeeklyGridView({
  sessions,
  selectedDate,
  onDateChange,
  isMobile = false,
  tutorFilter = "",
  fillHeight = false,
  proposedSessions = [],
  onProposalClick,
  sessionProposalMap,
}: WeeklyGridViewProps) {
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [openMoreGroup, setOpenMoreGroup] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [expandedEmptyDays, setExpandedEmptyDays] = useState<Set<number>>(() => new Set());
  const [showAllDays, setShowAllDays] = useState(false);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);
  const moreButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const today = getToday();

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
  const totalMinutes = 10 * 60; // 10:00 AM to 8:00 PM = 10 hours
  const navHeaderHeight = 40; // Approximate height of week navigation
  const dayHeaderHeight = 36; // Approximate height of day headers

  // Pixels per minute calculation
  let pixelsPerMinute: number;
  let totalHeight: number;

  if (fillHeight) {
    if (containerHeight) {
      // Calculate pixelsPerMinute to fit the available height
      // Account for: navHeader(40) + dayHeader(36) + borders(8) + space-y-1(4) + buffer(12) = 100px
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

  // Group sessions by date
  const sessionsByDate = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions]
  );

  // Group proposed sessions by date
  const proposedByDate = useMemo(() => {
    const map = new Map<string, ProposedSession[]>();
    proposedSessions.forEach((ps) => {
      const existing = map.get(ps.session_date) || [];
      existing.push(ps);
      map.set(ps.session_date, existing);
    });
    return map;
  }, [proposedSessions]);

  // Calculate which days have sessions
  const daysWithSessions = useMemo(() => {
    const result = new Set<number>();
    weekDates.forEach((date, index) => {
      const dateKey = toDateString(date);
      if ((sessionsByDate.get(dateKey) || []).length > 0) {
        result.add(index);
      }
    });
    return result;
  }, [weekDates, sessionsByDate]);

  // Check if a day should be collapsed
  const isDayCollapsed = (dayIndex: number) => {
    if (showAllDays) return false;
    if (daysWithSessions.has(dayIndex)) return false;
    return !expandedEmptyDays.has(dayIndex);
  };

  // Toggle individual day expansion
  const toggleDayExpand = (dayIndex: number) => {
    setExpandedEmptyDays(prev => {
      const next = new Set(prev);
      if (next.has(dayIndex)) {
        next.delete(dayIndex);
      } else {
        next.add(dayIndex);
      }
      return next;
    });
  };

  // Generate dynamic grid columns
  const gridColumns = useMemo(() => {
    const columns = weekDates.map((_, index) =>
      isDayCollapsed(index) ? "36px" : "minmax(100px, 1fr)"
    );
    return `60px ${columns.join(" ")}`;
  }, [weekDates, showAllDays, expandedEmptyDays, daysWithSessions]);

  // Calculate minimum width needed for horizontal scrolling
  const minGridWidth = useMemo(() => {
    const timeColumnWidth = 60;
    const dayColumnsWidth = weekDates.reduce((sum, _, index) => {
      const isCollapsed = isDayCollapsed(index);
      return sum + (isCollapsed ? 36 : 100);
    }, 0);
    return timeColumnWidth + dayColumnsWidth;
  }, [weekDates, showAllDays, expandedEmptyDays, daysWithSessions]);

  // Count empty days for toggle button visibility
  const emptyDaysCount = 7 - daysWithSessions.size;

  const handlePreviousWeek = () => {
    onDateChange(getPreviousWeek(selectedDate));
  };

  const handleNextWeek = () => {
    onDateChange(getNextWeek(selectedDate));
  };

  // Generate hour labels (10:00 to 19:00 - 20:00 is the end boundary)
  const hours = Array.from({ length: 10 }, (_, i) => i + 10); // 10 AM to 7 PM

  return (
    <div ref={containerRef} className={cn("space-y-1 flex flex-col", fillHeight && "flex-1 min-h-0 overflow-hidden")}>
      {/* Week Navigation */}
      <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5 paper-texture">
        {/* Left: Prev button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousWeek}
          className="flex items-center gap-1 h-7 px-2 text-xs"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        {/* Center: Today, Date picker, Week info */}
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
          <DatePickerPopover selectedDate={selectedDate} onSelect={onDateChange} />

          {/* Week info */}
          <div className="text-center hidden sm:block">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Week {getSchoolYearWeek(weekDates[0])}
            </p>
            <p className="text-[10px] text-gray-600 dark:text-gray-400">
              {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
          {/* Mobile week number */}
          <span className="sm:hidden text-xs font-bold text-gray-900 dark:text-gray-100">
            W{getSchoolYearWeek(weekDates[0])}
          </span>
        </div>

        {/* Toggle empty days button */}
        {emptyDaysCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllDays(!showAllDays)}
            className="flex items-center gap-1 h-7 px-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            title={showAllDays ? "Hide empty days" : "Show all days"}
          >
            {showAllDays ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{showAllDays ? "Hide empty" : `+${emptyDaysCount} empty`}</span>
          </Button>
        )}

        {/* Right: Next button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleNextWeek}
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
        <div className={cn(fillHeight ? "overflow-x-auto overflow-y-hidden flex-1 flex flex-col min-h-0 bg-white dark:bg-[#1a1a1a]" : "overflow-x-auto")}>
          <div className={cn(fillHeight ? "flex-1 flex flex-col bg-white dark:bg-[#1a1a1a]" : "min-w-[800px]")} style={fillHeight ? { minWidth: `${minGridWidth}px` } : undefined}>
            {/* Day Headers */}
            <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] sticky top-0 bg-white dark:bg-[#1a1a1a] z-10" style={{ gridTemplateColumns: gridColumns }}>
              <div className="p-1.5 bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center">
                <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400">TIME</p>
              </div>
              {weekDates.map((date, index) => {
                const isToday = isSameDay(date, today);
                const isCollapsed = isDayCollapsed(index);
                const hasNoSessions = !daysWithSessions.has(index);
                return (
                  <div
                    key={index}
                    onClick={hasNoSessions ? () => toggleDayExpand(index) : undefined}
                    className={cn(
                      "border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a] transition-all",
                      isCollapsed ? "py-1 px-0.5" : "py-1 px-1.5",
                      isToday
                        ? "bg-[#a0704b] dark:bg-[#cd853f]"
                        : "bg-[#fef9f3] dark:bg-[#2d2618]",
                      hasNoSessions && "cursor-pointer hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                    )}
                  >
                    {isCollapsed ? (
                      <div className="h-full flex items-center justify-center">
                        <span
                          className={cn(
                            "text-[9px] font-bold whitespace-nowrap",
                            isToday ? "text-white/80" : "text-gray-400 dark:text-gray-500"
                          )}
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                        >
                          {getDayName(date, true)} {date.getDate()}
                        </span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p
                          className={cn(
                            "text-[10px] font-bold uppercase leading-tight",
                            isToday ? "text-white" : "text-gray-600 dark:text-gray-400"
                          )}
                        >
                          {getDayName(date, true)}
                        </p>
                        <p
                          className={cn(
                            "text-base font-bold leading-tight",
                            isToday ? "text-white" : "text-gray-900 dark:text-gray-100"
                          )}
                        >
                          {date.getDate()}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div
              className="grid bg-white dark:bg-[#1a1a1a]"
              style={{ height: `${totalHeight}px`, gridTemplateColumns: gridColumns }}
            >
              {/* Time Labels Column */}
              <div className="relative h-full bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                    style={{ top: `${(hour - 10) * 60 * pixelsPerMinute}px` }}
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
                    style={{ top: `${((hour - 10) * 60 + 30) * pixelsPerMinute}px` }}
                  />
                ))}
                {/* Final grid line at 20:00 (bottom boundary) */}
                <div
                  className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                  style={{ top: `${10 * 60 * pixelsPerMinute}px` }}
                />
              </div>

              {/* Day Columns */}
              {weekDates.map((date, dayIndex) => {
                const dateKey = toDateString(date);
                const daySessions = sessionsByDate.get(dateKey) || [];
                const isToday = isSameDay(date, today);
                const isCollapsed = isDayCollapsed(dayIndex);
                const hasNoSessions = !daysWithSessions.has(dayIndex);

                return (
                  <div
                    key={dayIndex}
                    onClick={isCollapsed && hasNoSessions ? () => toggleDayExpand(dayIndex) : undefined}
                    className={cn(
                      "relative h-full border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      isToday && "bg-amber-50/30 dark:bg-amber-900/10",
                      isCollapsed && "bg-gray-50 dark:bg-gray-900/30",
                      isCollapsed && hasNoSessions && "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50"
                    )}
                  >
                    {/* Collapsed day expand indicator */}
                    {isCollapsed && hasNoSessions && (
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}

                    {/* Hour grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                        style={{ top: `${(hour - 10) * 60 * pixelsPerMinute}px` }}
                      />
                    ))}
                    {/* 30-minute grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={`${hour}-30`}
                        className="absolute w-full border-t border-dashed border-gray-200/60 dark:border-gray-700/50"
                        style={{ top: `${((hour - 10) * 60 + 30) * pixelsPerMinute}px` }}
                      />
                    ))}
                    {/* Final grid line at 20:00 (bottom boundary) */}
                    <div
                      className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                      style={{ top: `${10 * 60 * pixelsPerMinute}px` }}
                    />

                    {/* Current Time Indicator */}
                    {isToday && (() => {
                      const now = new Date();
                      const currentMinutes = now.getHours() * 60 + now.getMinutes();
                      const startMinutes = 10 * 60; // 10:00 AM
                      const endMinutes = 20 * 60;   // 8:00 PM

                      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                        const topPosition = (currentMinutes - startMinutes) * pixelsPerMinute;
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
                    {daySessions.length > 0 && (() => {
                      // Group sessions by overlapping time ranges
                      const timeGroups = new Map<string, Session[]>();

                      daySessions.forEach((session) => {
                        const parsed = parseTimeSlot(session.time_slot);
                        if (!parsed) return;

                        const top = calculateSessionPosition(session.time_slot, pixelsPerMinute);
                        const height = calculateSessionHeight(session.time_slot, pixelsPerMinute);
                        const key = `${dateKey}-${top}-${height}`;

                        if (!timeGroups.has(key)) {
                          timeGroups.set(key, []);
                        }
                        timeGroups.get(key)!.push(session);
                      });

                      // Sort sessions within each time group with main group priority
                      timeGroups.forEach((groupSessions) => {
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

                      return Array.from(timeGroups.entries()).map(([key, sessions]) => {
                        const firstSession = sessions[0];
                        const top = calculateSessionPosition(firstSession.time_slot, pixelsPerMinute);
                        const height = calculateSessionHeight(firstSession.time_slot, pixelsPerMinute);

                        const info = groupInfoMap.get(key);
                        const widthPercent = 100 / (info?.totalColumns || 1);
                        const leftPercent = (info?.column || 0) * widthPercent;

                        const maxDisplayedSessions = Math.max(1, Math.floor((height - 4) / 24)); // ~24px per session (22px + gap), account for p-0.5 padding (4px)
                        const hasMoreSessions = sessions.length > maxDisplayedSessions;
                        const displayedSessions = hasMoreSessions
                          ? sessions.slice(0, maxDisplayedSessions - 1)
                          : sessions;

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
                                const displayStatus = getDisplayStatus(session);
                                const statusConfig = getSessionStatusConfig(displayStatus);
                                const StatusIcon = statusConfig.Icon;
                                const isCancelledEnrollment = session.enrollment_payment_status === 'Cancelled';
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
                                      opacity: Math.min(isCancelledEnrollment ? 0.5 : 1, statusConfig.opacity ?? 1),
                                    }}
                                  >
                                    <div className="flex-1 flex flex-col min-w-0 px-1.5 py-0.5">
                                      <p className="font-bold text-[9px] text-gray-500 dark:text-gray-400 leading-tight flex justify-between items-center">
                                        <span className="flex items-center gap-0.5">
                                          {session.school_student_id || "N/A"}
                                          {isCancelledEnrollment ? (
                                            <span className="text-[7px] px-1 py-px rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                                              Cancelled
                                            </span>
                                          ) : session.financial_status !== "Paid" && (
                                            <HandCoins className="h-2.5 w-2.5 text-red-500" />
                                          )}
                                        </span>
                                        {!tutorFilter && session.tutor_name && (
                                          <span>{session.tutor_name.split(' ')[1] || session.tutor_name.split(' ')[0]}</span>
                                        )}
                                      </p>
                                      <p className={cn(
                                        "font-semibold text-[10px] leading-tight flex items-center gap-0.5 overflow-hidden",
                                        isCancelledEnrollment
                                          ? "text-gray-400 dark:text-gray-500"
                                          : session.financial_status !== "Paid"
                                            ? "text-red-600 dark:text-red-400"
                                            : statusConfig.strikethrough
                                              ? "text-gray-400 dark:text-gray-500"
                                              : "text-gray-900 dark:text-gray-100",
                                        statusConfig.strikethrough && "line-through"
                                      )}>
                                        <span className="truncate">{session.student_name || "Unknown"}</span>
                                        {!isMobile && widthPercent >= 50 && session.grade && (
                                          <span
                                            className="text-[7px] px-1 py-px rounded text-gray-800 whitespace-nowrap"
                                            style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                                          >{session.grade}{session.lang_stream || ''}</span>
                                        )}
                                        {!isMobile && widthPercent > 50 && session.school && (
                                          <span className="text-[7px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">{session.school}</span>
                                        )}
                                        {session.exam_revision_slot_id && (
                                          <span title="Exam Revision"><GraduationCap className="h-3 w-3 text-purple-500 flex-shrink-0" /></span>
                                        )}
                                        {session.extension_request_id && (
                                          <span title={`Extension ${session.extension_request_status}`}><Clock className="h-3 w-3 text-amber-500 flex-shrink-0" /></span>
                                        )}
                                      </p>
                                    </div>
                                    <div className={cn("w-4 rounded-r flex items-center justify-center", statusConfig.bgClass)}>
                                      <StatusIcon className={cn("h-2.5 w-2.5 text-white", statusConfig.iconClass)} />
                                    </div>
                                  </motion.div>
                                );
                              })}

                              {/* Proposed sessions for this time slot */}
                              {(proposedByDate.get(dateKey) || [])
                                .filter((ps) => {
                                  const psParsed = parseTimeSlot(ps.time_slot);
                                  if (!psParsed) return false;
                                  const psTop = calculateSessionPosition(ps.time_slot, pixelsPerMinute);
                                  const psHeight = calculateSessionHeight(ps.time_slot, pixelsPerMinute);
                                  const psKey = `${dateKey}-${psTop}-${psHeight}`;
                                  return psKey === key;
                                })
                                .map((ps) => (
                                  <ProposedSessionCard
                                    key={ps.id}
                                    proposedSession={ps}
                                    onClick={() => {
                                      // Clear any open session popovers before opening proposal modal
                                      setOpenSessionId(null);
                                      setOpenMoreGroup(null);
                                      onProposalClick?.(ps.proposal);
                                    }}
                                    size="compact"
                                    showTutor={!tutorFilter}
                                    widthPercent={widthPercent}
                                    isMobile={isMobile}
                                  />
                                ))}

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
                                    +{sessions.filter(isCountableSession).length - displayedSessions.filter(isCountableSession).length} more
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}

                    {/* Standalone proposed sessions (those not overlapping with any real session group) */}
                    {(() => {
                      // Get all proposed sessions for this day
                      const dayProposed = proposedByDate.get(dateKey) || [];
                      if (dayProposed.length === 0) return null;

                      // Build set of all existing time group keys
                      const existingKeys = new Set<string>();
                      daySessions.forEach((session) => {
                        const parsed = parseTimeSlot(session.time_slot);
                        if (!parsed) return;
                        const top = calculateSessionPosition(session.time_slot, pixelsPerMinute);
                        const height = calculateSessionHeight(session.time_slot, pixelsPerMinute);
                        existingKeys.add(`${dateKey}-${top}-${height}`);
                      });

                      // Filter to proposed sessions that don't match any existing group
                      const standaloneProposed = dayProposed.filter((ps) => {
                        const psParsed = parseTimeSlot(ps.time_slot);
                        if (!psParsed) return false;
                        const psTop = calculateSessionPosition(ps.time_slot, pixelsPerMinute);
                        const psHeight = calculateSessionHeight(ps.time_slot, pixelsPerMinute);
                        const psKey = `${dateKey}-${psTop}-${psHeight}`;
                        return !existingKeys.has(psKey);
                      });

                      return standaloneProposed.map((ps) => {
                        const top = calculateSessionPosition(ps.time_slot, pixelsPerMinute);
                        const height = calculateSessionHeight(ps.time_slot, pixelsPerMinute);
                        return (
                          <ProposedSessionCard
                            key={ps.id}
                            proposedSession={ps}
                            onClick={() => {
                              // Clear any open session popovers before opening proposal modal
                              setOpenSessionId(null);
                              setOpenMoreGroup(null);
                              onProposalClick?.(ps.proposal);
                            }}
                            size="compact"
                            showTutor={!tutorFilter}
                            widthPercent={100}
                            isMobile={isMobile}
                            style={{
                              position: 'absolute',
                              top: `${top}px`,
                              height: `${height}px`,
                              left: 0,
                              right: 0,
                            }}
                          />
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
            tutorFilter={tutorFilter}
            sessionProposalMap={sessionProposalMap}
            onProposalClick={onProposalClick}
          />
        );
      })()}

      {/* More Sessions Popover */}
      {openMoreGroup !== null && (() => {
        const ref = moreButtonRefs.current.get(openMoreGroup);
        if (!ref) return null;

        // Parse dateKey from the group key (format: dateKey-top-height)
        const keyParts = openMoreGroup.split('-');
        const dateKey = keyParts.slice(0, 3).join('-'); // YYYY-MM-DD format
        const daySessions = sessionsByDate.get(dateKey) || [];

        // Find all sessions in this time group for this specific day
        const timeGroups = new Map<string, Session[]>();
        daySessions.forEach((session) => {
          const parsed = parseTimeSlot(session.time_slot);
          if (!parsed) return;

          const top = calculateSessionPosition(session.time_slot, pixelsPerMinute);
          const height = calculateSessionHeight(session.time_slot, pixelsPerMinute);
          const key = `${dateKey}-${top}-${height}`;

          if (!timeGroups.has(key)) {
            timeGroups.set(key, []);
          }
          timeGroups.get(key)!.push(session);
        });

        // Sort sessions within each time group with main group priority
        timeGroups.forEach((groupSessions) => {
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

        const groupSessions = timeGroups.get(openMoreGroup) || [];

        return (
          <MoreSessionsPopover
            sessions={groupSessions}
            triggerRef={{ current: ref }}
            onClose={() => setOpenMoreGroup(null)}
            tutorFilter={tutorFilter}
          />
        );
      })()}
    </div>
  );
});
