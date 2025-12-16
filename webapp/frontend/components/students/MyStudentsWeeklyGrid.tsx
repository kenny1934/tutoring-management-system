"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { HandCoins, Eye, EyeOff, AlertTriangle, CalendarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoreEnrollmentsPopover } from "@/components/enrollments/MoreEnrollmentsPopover";
import type { Enrollment } from "@/types";
import {
  calculateSessionPosition,
  calculateSessionHeight,
  parseTimeSlot,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { getDisplayPaymentStatus, getPaymentStatusConfig } from "@/lib/enrollment-utils";
import { DAY_NAMES, DAY_NAME_TO_INDEX, getGradeColor } from "@/lib/constants";
import type { GroupOption, SortOption, SortDirection } from "./MyStudentsList";
import { getGroupKey, compareGroupKeys } from "./MyStudentsList";


interface MyStudentsWeeklyGridProps {
  enrollments: Enrollment[];
  onEnrollmentClick?: (enrollment: Enrollment, event: React.MouseEvent) => void;
  highlightStudentIds?: number[];
  isMobile?: boolean;
  fillHeight?: boolean;
  isAllTutors?: boolean;
  // Calendar-list sync props
  activeGroups?: GroupOption[];
  sortOption?: SortOption;
  sortDirection?: SortDirection;
  selectedGroupKey?: string | null;
}

// Get tutor first name, stripping title prefix
const getTutorFirstName = (name: string): string => {
  const cleaned = name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');
  return cleaned.split(' ')[0] || cleaned;
};

// For overlap detection and column assignment
interface TimeGroupInfo {
  key: string;
  top: number;
  bottom: number;
  column: number;
  totalColumns: number;
}

export function MyStudentsWeeklyGrid({
  enrollments,
  onEnrollmentClick,
  highlightStudentIds = [],
  isMobile = false,
  fillHeight = false,
  isAllTutors = false,
  // Calendar-list sync props
  activeGroups = [],
  sortOption = 'name',
  sortDirection = 'asc',
  selectedGroupKey = null,
}: MyStudentsWeeklyGridProps) {
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [expandedEmptyDays, setExpandedEmptyDays] = useState<Set<number>>(new Set());
  const [showAllDays, setShowAllDays] = useState(false);
  const [openMoreGroup, setOpenMoreGroup] = useState<string | null>(null);
  const moreButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure available height when fillHeight is enabled using parent's actual height
  useEffect(() => {
    if (!fillHeight || !containerRef.current) return;

    const parent = containerRef.current.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(Math.max(300, entry.contentRect.height));
      }
    });

    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, [fillHeight]);

  // Calculate grid height
  const totalMinutes = 10 * 60; // 10:00 AM to 8:00 PM
  let pixelsPerMinute: number;
  let totalHeight: number;

  if (fillHeight && containerHeight) {
    const gridHeight = Math.max(200, containerHeight - 35);
    pixelsPerMinute = Math.max(0.5, gridHeight / totalMinutes);
    totalHeight = gridHeight;
  } else {
    pixelsPerMinute = isMobile ? 0.75 : 1;
    totalHeight = totalMinutes * pixelsPerMinute;
  }

  // Group enrollments by day
  const enrollmentsByDay = useMemo(() => {
    const byDay = new Map<number, Enrollment[]>();

    enrollments.forEach((enrollment) => {
      if (!enrollment.assigned_day || !enrollment.assigned_time) return;

      const dayIndex = DAY_NAME_TO_INDEX[enrollment.assigned_day];
      if (dayIndex === undefined) return;

      if (!byDay.has(dayIndex)) {
        byDay.set(dayIndex, []);
      }
      byDay.get(dayIndex)!.push(enrollment);
    });

    return byDay;
  }, [enrollments]);

  // Calculate which days have enrollments
  const daysWithEnrollments = useMemo(() => {
    const result = new Set<number>();
    enrollmentsByDay.forEach((_, dayIndex) => {
      result.add(dayIndex);
    });
    return result;
  }, [enrollmentsByDay]);

  // Check if a day should be collapsed
  const isDayCollapsed = (dayIndex: number) => {
    if (showAllDays) return false;
    if (daysWithEnrollments.has(dayIndex)) return false;
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
    const columns = DAY_NAMES.map((_, index) =>
      isDayCollapsed(index) ? "36px" : "minmax(100px, 1fr)"
    );
    return `60px ${columns.join(" ")}`;
  }, [showAllDays, expandedEmptyDays, daysWithEnrollments]);

  // Calculate minimum width
  const minGridWidth = useMemo(() => {
    const timeColumnWidth = 60;
    const dayColumnsWidth = DAY_NAMES.reduce((sum, _, index) => {
      return sum + (isDayCollapsed(index) ? 36 : 100);
    }, 0);
    return timeColumnWidth + dayColumnsWidth;
  }, [showAllDays, expandedEmptyDays, daysWithEnrollments]);

  const emptyDaysCount = 7 - daysWithEnrollments.size;
  const hours = Array.from({ length: 10 }, (_, i) => i + 10); // 10 AM to 7 PM

  // Count unscheduled enrollments (missing day or time)
  const unscheduledCount = useMemo(() => {
    return enrollments.filter(e => !e.assigned_day || !e.assigned_time).length;
  }, [enrollments]);

  return (
    <div ref={containerRef} className={cn("flex flex-col relative", !fillHeight && "space-y-1", fillHeight && "flex-1 min-h-0 overflow-hidden")}>
      {/* Header - hidden when fillHeight to maximize calendar space */}
      {!fillHeight && (
        <div className="flex items-center justify-between gap-2 bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg px-3 py-1.5 paper-texture">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Weekly Schedule
          </span>

          <div className="flex items-center gap-2">
            {unscheduledCount > 0 && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs"
                title={`${unscheduledCount} student${unscheduledCount !== 1 ? 's' : ''} without scheduled time`}
              >
                <CalendarOff className="h-3 w-3" aria-hidden="true" />
                <span>{unscheduledCount} unscheduled</span>
              </span>
            )}

            {emptyDaysCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllDays(!showAllDays)}
                className="flex items-center gap-1 h-7 px-2 text-xs text-gray-600 dark:text-gray-400"
                title={showAllDays ? "Hide empty days" : "Show all days"}
              >
                {showAllDays ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{showAllDays ? "Hide empty" : `+${emptyDaysCount} empty`}</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Unscheduled indicator when fillHeight (compact mode) */}
      {fillHeight && unscheduledCount > 0 && (
        <div className="absolute top-1 right-1 z-20">
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[10px] shadow-sm"
            title={`${unscheduledCount} student${unscheduledCount !== 1 ? 's' : ''} without scheduled time`}
          >
            <CalendarOff className="h-2.5 w-2.5" aria-hidden="true" />
            <span>{unscheduledCount}</span>
          </span>
        </div>
      )}

      {/* Calendar Grid */}
      <div className={cn(
        "bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden",
        fillHeight && "flex-1 flex flex-col min-h-0"
      )}>
        <div className={cn(fillHeight ? "overflow-x-auto overflow-y-hidden flex-1 flex flex-col min-h-0 bg-white dark:bg-[#1a1a1a]" : "overflow-x-auto")}>
          <div className={cn(fillHeight ? "flex-1 flex flex-col bg-white dark:bg-[#1a1a1a]" : "min-w-[800px]")} style={fillHeight ? { minWidth: `${minGridWidth}px` } : undefined}>
            {/* Day Headers */}
            <div className="grid border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] sticky top-0 bg-white dark:bg-[#1a1a1a] z-10" style={{ gridTemplateColumns: gridColumns }}>
              <div className="p-1 bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center">
                <p className="text-[10px] font-bold text-gray-600 dark:text-gray-400">TIME</p>
              </div>
              {DAY_NAMES.map((dayName, index) => {
                const isCollapsed = isDayCollapsed(index);
                const hasNoEnrollments = !daysWithEnrollments.has(index);

                // Use button for interactive empty days, div for non-interactive days with enrollments
                const Element = hasNoEnrollments ? 'button' : 'div';

                return (
                  <Element
                    key={index}
                    type={hasNoEnrollments ? "button" : undefined}
                    onClick={hasNoEnrollments ? () => toggleDayExpand(index) : undefined}
                    aria-expanded={hasNoEnrollments ? !isCollapsed : undefined}
                    aria-label={hasNoEnrollments ? `${isCollapsed ? 'Expand' : 'Collapse'} ${dayName} column` : undefined}
                    className={cn(
                      "border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a] transition-all",
                      isCollapsed ? "py-1 px-0.5" : "py-1 px-1.5",
                      "bg-[#fef9f3] dark:bg-[#2d2618]",
                      hasNoEnrollments && "cursor-pointer hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#a0704b]"
                    )}
                  >
                    {isCollapsed ? (
                      <div className="h-full flex items-center justify-center">
                        <span
                          className="text-[9px] font-bold whitespace-nowrap text-gray-400 dark:text-gray-500"
                          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                          aria-hidden="true"
                        >
                          {dayName}
                        </span>
                        <span className="sr-only">{dayName}</span>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300">
                          {dayName}
                        </p>
                      </div>
                    )}
                  </Element>
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
                {hours.map((hour) => (
                  <div
                    key={`${hour}-30`}
                    className="absolute w-full border-t border-dashed border-gray-200/60 dark:border-gray-700/50"
                    style={{ top: `${((hour - 10) * 60 + 30) * pixelsPerMinute}px` }}
                  />
                ))}
              </div>

              {/* Day Columns */}
              {DAY_NAMES.map((_, dayIndex) => {
                const dayEnrollments = enrollmentsByDay.get(dayIndex) || [];
                const isCollapsed = isDayCollapsed(dayIndex);
                const hasNoEnrollments = !daysWithEnrollments.has(dayIndex);

                return (
                  <div
                    key={dayIndex}
                    onClick={isCollapsed && hasNoEnrollments ? () => toggleDayExpand(dayIndex) : undefined}
                    className={cn(
                      "relative h-full border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      isCollapsed && "bg-gray-50 dark:bg-gray-900/30"
                    )}
                  >
                    {/* Hour grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                        style={{ top: `${(hour - 10) * 60 * pixelsPerMinute}px` }}
                      />
                    ))}
                    {hours.map((hour) => (
                      <div
                        key={`${hour}-30`}
                        className="absolute w-full border-t border-dashed border-gray-200/60 dark:border-gray-700/50"
                        style={{ top: `${((hour - 10) * 60 + 30) * pixelsPerMinute}px` }}
                      />
                    ))}

                    {/* Enrollments - Grouped by time slot */}
                    {dayEnrollments.length > 0 && (() => {
                      // Group enrollments by overlapping time ranges
                      const timeGroups = new Map<string, Enrollment[]>();

                      dayEnrollments.forEach((enrollment) => {
                        const parsed = parseTimeSlot(enrollment.assigned_time || "");
                        if (!parsed) return;

                        const top = calculateSessionPosition(enrollment.assigned_time || "", pixelsPerMinute);
                        const height = calculateSessionHeight(enrollment.assigned_time || "", pixelsPerMinute);
                        const key = `${dayIndex}-${top}-${height}`;

                        if (!timeGroups.has(key)) {
                          timeGroups.set(key, []);
                        }
                        timeGroups.get(key)!.push(enrollment);
                      });

                      // Sort enrollments within each time slot:
                      // 1) First by group key (so F1 students cluster together, then F2, etc.)
                      // 2) Then by sortOption within each group
                      const sortMultiplier = sortDirection === 'asc' ? 1 : -1;
                      timeGroups.forEach((slotEnrollments) => {
                        slotEnrollments.sort((a, b) => {
                          // First, sort by group key to cluster similar items
                          if (activeGroups.length > 0) {
                            const aGroupKey = getGroupKey(a, activeGroups);
                            const bGroupKey = getGroupKey(b, activeGroups);
                            const groupCmp = compareGroupKeys(aGroupKey, bGroupKey, activeGroups);
                            if (groupCmp !== 0) return groupCmp;
                          }

                          // Then sort within group by sortOption
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
                          return cmp * sortMultiplier;
                        });
                      });

                      // Overlap detection and column assignment
                      const groupInfos: TimeGroupInfo[] = Array.from(timeGroups.keys()).map(key => {
                        const parts = key.split('-');
                        const height = parseFloat(parts[parts.length - 1]);
                        const top = parseFloat(parts[parts.length - 2]);
                        return { key, top, bottom: top + height, column: 0, totalColumns: 1 };
                      });

                      // Sort by start time for greedy algorithm
                      groupInfos.sort((a, b) => a.top - b.top);

                      // Assign columns using greedy algorithm
                      const columns: TimeGroupInfo[][] = [];
                      for (const group of groupInfos) {
                        let placed = false;
                        for (let col = 0; col < columns.length; col++) {
                          const lastInCol = columns[col][columns[col].length - 1];
                          if (lastInCol.bottom <= group.top) {
                            // No overlap - can reuse this column
                            columns[col].push(group);
                            group.column = col;
                            placed = true;
                            break;
                          }
                        }
                        if (!placed) {
                          // Need new column
                          group.column = columns.length;
                          columns.push([group]);
                        }
                      }

                      // Calculate total columns for each group based on overlapping groups
                      for (const group of groupInfos) {
                        const overlapping = groupInfos.filter(g =>
                          !(g.bottom <= group.top || g.top >= group.bottom)
                        );
                        const maxCol = Math.max(...overlapping.map(g => g.column));
                        overlapping.forEach(g => g.totalColumns = Math.max(g.totalColumns, maxCol + 1));
                      }

                      // Create lookup map
                      const groupInfoMap = new Map(groupInfos.map(g => [g.key, g]));

                      return Array.from(timeGroups.entries()).map(([key, groupEnrollments]) => {
                        const firstEnrollment = groupEnrollments[0];
                        const top = calculateSessionPosition(firstEnrollment.assigned_time || "", pixelsPerMinute);
                        const height = calculateSessionHeight(firstEnrollment.assigned_time || "", pixelsPerMinute);

                        // Get column positioning for this time group
                        const info = groupInfoMap.get(key);
                        const widthPercent = 100 / (info?.totalColumns || 1);
                        const leftPercent = (info?.column || 0) * widthPercent;

                        // Calculate how many enrollments can fit vertically
                        const maxDisplayedEnrollments = Math.max(1, Math.floor((height - 4) / 32)); // ~32px per item (card ~30px + gap)
                        const hasMoreEnrollments = groupEnrollments.length > maxDisplayedEnrollments;
                        const displayedEnrollments = hasMoreEnrollments
                          ? groupEnrollments.slice(0, maxDisplayedEnrollments - 1)
                          : groupEnrollments;

                        return (
                          <div
                            key={key}
                            className="absolute overflow-hidden"
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                              left: `calc(${leftPercent}% + 1px)`,
                              width: `calc(${widthPercent}% - 2px)`,
                            }}
                          >
                            <div className="flex flex-col gap-0.5 p-0.5 h-full overflow-hidden">
                              {displayedEnrollments.map((enrollment) => {
                                const displayStatus = getDisplayPaymentStatus(enrollment);
                                const statusConfig = getPaymentStatusConfig(displayStatus);
                                const isHighlighted = highlightStudentIds.includes(enrollment.student_id);
                                const isOverdue = displayStatus === 'Overdue';
                                const isPending = displayStatus === 'Pending Payment';

                                // Group filter: check if enrollment matches selected group
                                const enrollmentGroupKey = activeGroups.length > 0
                                  ? getGroupKey(enrollment, activeGroups)
                                  : null;
                                const isInSelectedGroup = !selectedGroupKey || enrollmentGroupKey === selectedGroupKey;

                                return (
                                  <motion.div
                                    key={enrollment.id}
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
                                      onEnrollmentClick?.(enrollment, e);
                                    }}
                                    className={cn(
                                      "cursor-pointer rounded overflow-hidden shadow-sm flex-shrink-0 flex transition-opacity",
                                      statusConfig.bgTint,
                                      isHighlighted && "outline outline-2 outline-[#a0704b] dark:outline-[#cd853f]",
                                      !isInSelectedGroup && "opacity-30 pointer-events-none"
                                    )}
                                    style={{ minHeight: "22px" }}
                                  >
                                    <div className="flex-1 flex flex-col min-w-0 px-1.5 py-0.5">
                                      <p className="font-bold text-[9px] text-gray-500 dark:text-gray-400 leading-tight flex justify-between items-center">
                                        <span className="flex items-center gap-0.5 truncate">
                                          {enrollment.school_student_id || "N/A"}
                                          {isOverdue && (
                                            <>
                                              <AlertTriangle className="h-2.5 w-2.5 text-red-500 flex-shrink-0" aria-hidden="true" />
                                              <span className="sr-only">Overdue payment</span>
                                            </>
                                          )}
                                          {isPending && !isOverdue && (
                                            <>
                                              <HandCoins className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" aria-hidden="true" />
                                              <span className="sr-only">Pending payment</span>
                                            </>
                                          )}
                                        </span>
                                        {isAllTutors && enrollment.tutor_name && (
                                          <span className="text-[8px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                                            {getTutorFirstName(enrollment.tutor_name)}
                                          </span>
                                        )}
                                      </p>
                                      <p className={cn(
                                        "font-semibold text-[10px] leading-tight flex items-center gap-0.5 overflow-hidden",
                                        isOverdue ? "text-red-600 dark:text-red-400" :
                                        isPending ? "text-amber-700 dark:text-amber-400" :
                                        "text-gray-900 dark:text-gray-100"
                                      )}>
                                        <span className="truncate">{enrollment.student_name || "Unknown"}</span>
                                        {!isMobile && widthPercent >= 50 && enrollment.grade && (
                                          <span
                                            className="text-[7px] px-1 py-px rounded text-gray-800 whitespace-nowrap flex-shrink-0"
                                            style={{ backgroundColor: getGradeColor(enrollment.grade, enrollment.lang_stream) }}
                                          >
                                            {enrollment.grade}{enrollment.lang_stream || ''}
                                          </span>
                                        )}
                                        {!isMobile && widthPercent > 50 && enrollment.school && (
                                          <span className="text-[7px] px-1 py-px rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap flex-shrink-0">
                                            {enrollment.school}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div className={cn("w-3 rounded-r flex-shrink-0", statusConfig.bgClass)} />
                                  </motion.div>
                                );
                              })}

                              {hasMoreEnrollments && (() => {
                                const hiddenEnrollments = groupEnrollments.slice(displayedEnrollments.length);
                                const hasHighlightedHidden = hiddenEnrollments.some(e =>
                                  highlightStudentIds.includes(e.student_id)
                                );
                                // Check if any hidden enrollments match the selected group
                                const hasMatchingHidden = !selectedGroupKey || hiddenEnrollments.some(e => {
                                  const eGroupKey = activeGroups.length > 0 ? getGroupKey(e, activeGroups) : null;
                                  return eGroupKey === selectedGroupKey;
                                });

                                return (
                                  <div
                                    ref={(el) => {
                                      if (el) moreButtonRefs.current.set(key, el);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMoreGroup(key);
                                    }}
                                    className={cn(
                                      "cursor-pointer rounded px-1.5 py-0.5 text-center transition-opacity",
                                      hasHighlightedHidden
                                        ? "bg-[#a0704b] border-2 border-[#8b6140] ring-2 ring-[#a0704b]/50"
                                        : "bg-amber-100 dark:bg-amber-900/50 border border-amber-400 dark:border-amber-600",
                                      "shadow-sm hover:shadow-md transition-all flex-shrink-0",
                                      !hasMatchingHidden && "opacity-30"
                                    )}
                                    style={{ minHeight: "20px" }}
                                  >
                                    <p className={cn(
                                      "font-bold text-[9px]",
                                      hasHighlightedHidden ? "text-white" : "text-amber-800 dark:text-amber-200"
                                    )}>
                                      +{groupEnrollments.length - displayedEnrollments.length} more
                                    </p>
                                  </div>
                                );
                              })()}
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

      {/* More Enrollments Popover */}
      {openMoreGroup !== null && (() => {
        const ref = moreButtonRefs.current.get(openMoreGroup);
        if (!ref) return null;

        // Parse dayIndex from the group key (format: dayIndex-top-height)
        const keyParts = openMoreGroup.split('-');
        const dayIndex = parseInt(keyParts[0], 10);
        const dayEnrollments = enrollmentsByDay.get(dayIndex) || [];

        // Find all enrollments in this time group
        const timeGroups = new Map<string, Enrollment[]>();
        dayEnrollments.forEach((enrollment) => {
          const parsed = parseTimeSlot(enrollment.assigned_time || "");
          if (!parsed) return;

          const top = calculateSessionPosition(enrollment.assigned_time || "", pixelsPerMinute);
          const height = calculateSessionHeight(enrollment.assigned_time || "", pixelsPerMinute);
          const key = `${dayIndex}-${top}-${height}`;

          if (!timeGroups.has(key)) {
            timeGroups.set(key, []);
          }
          timeGroups.get(key)!.push(enrollment);
        });

        // Get enrollments for this time group (sorting will be done in popover)
        const popoverEnrollments = timeGroups.get(openMoreGroup) || [];

        return (
          <MoreEnrollmentsPopover
            enrollments={popoverEnrollments}
            triggerRef={{ current: ref }}
            onClose={() => setOpenMoreGroup(null)}
            highlightStudentIds={highlightStudentIds}
            activeGroups={activeGroups}
            sortOption={sortOption}
            sortDirection={sortDirection}
            selectedGroupKey={selectedGroupKey}
          />
        );
      })()}
    </div>
  );
}
