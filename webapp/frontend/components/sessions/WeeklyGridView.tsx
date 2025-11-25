"use client";

import { useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { MoreSessionsPopover } from "@/components/sessions/MoreSessionsPopover";
import type { Session } from "@/types";
import {
  getWeekDates,
  getDayName,
  toDateString,
  isSameDay,
  getToday,
  getPreviousWeek,
  getNextWeek,
  groupSessionsByDate,
  calculateSessionPosition,
  calculateSessionHeight,
  parseTimeSlot,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";

interface WeeklyGridViewProps {
  sessions: Session[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  isMobile?: boolean;
}

export function WeeklyGridView({
  sessions,
  selectedDate,
  onDateChange,
  isMobile = false,
}: WeeklyGridViewProps) {
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [openMoreGroup, setOpenMoreGroup] = useState<string | null>(null);
  const sessionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const moreButtonRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const today = getToday();

  // Pixels per minute (adjust for mobile)
  const pixelsPerMinute = isMobile ? 0.75 : 1;

  // Total height: 8:00 AM to 10:00 PM = 14 hours = 840 minutes
  const totalHeight = 14 * 60 * pixelsPerMinute;

  // Group sessions by date
  const sessionsByDate = useMemo(
    () => groupSessionsByDate(sessions),
    [sessions]
  );

  const handlePreviousWeek = () => {
    onDateChange(getPreviousWeek(selectedDate));
  };

  const handleNextWeek = () => {
    onDateChange(getNextWeek(selectedDate));
  };

  // Generate hour labels
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 8 AM to 10 PM

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 paper-texture">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreviousWeek}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        <div className="text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {weekDates[0].toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
            {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNextWeek}
          className="flex items-center gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white dark:bg-[#1a1a1a] border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day Headers */}
            <div className="grid grid-cols-8 border-b-2 border-[#e8d4b8] dark:border-[#6b5a4a] sticky top-0 bg-white dark:bg-[#1a1a1a] z-10">
              <div className="p-3 bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                <p className="text-xs font-bold text-gray-600 dark:text-gray-400">TIME</p>
              </div>
              {weekDates.map((date, index) => {
                const isToday = isSameDay(date, today);
                return (
                  <div
                    key={index}
                    className={cn(
                      "p-3 text-center border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]",
                      isToday
                        ? "bg-[#a0704b] dark:bg-[#cd853f]"
                        : "bg-[#fef9f3] dark:bg-[#2d2618]"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-bold uppercase",
                        isToday ? "text-white" : "text-gray-600 dark:text-gray-400"
                      )}
                    >
                      {getDayName(date, true)}
                    </p>
                    <p
                      className={cn(
                        "text-lg font-bold",
                        isToday ? "text-white" : "text-gray-900 dark:text-gray-100"
                      )}
                    >
                      {date.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div className="grid grid-cols-8" style={{ height: `${totalHeight}px` }}>
              {/* Time Labels Column */}
              <div className="relative bg-[#fef9f3] dark:bg-[#2d2618] border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                    style={{ top: `${(hour - 8) * 60 * pixelsPerMinute}px` }}
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
                    className="absolute w-full border-t border-dashed border-gray-300 dark:border-gray-600"
                    style={{ top: `${((hour - 8) * 60 + 30) * pixelsPerMinute}px` }}
                  />
                ))}
              </div>

              {/* Day Columns */}
              {weekDates.map((date, dayIndex) => {
                const dateKey = toDateString(date);
                const daySessions = sessionsByDate.get(dateKey) || [];

                return (
                  <div
                    key={dayIndex}
                    className="relative border-r last:border-r-0 border-[#e8d4b8] dark:border-[#6b5a4a]"
                  >
                    {/* Hour grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="absolute w-full border-t border-[#e8d4b8] dark:border-[#6b5a4a]"
                        style={{ top: `${(hour - 8) * 60 * pixelsPerMinute}px` }}
                      />
                    ))}
                    {/* 30-minute grid lines */}
                    {hours.map((hour) => (
                      <div
                        key={`${hour}-30`}
                        className="absolute w-full border-t border-dashed border-gray-300 dark:border-gray-600"
                        style={{ top: `${((hour - 8) * 60 + 30) * pixelsPerMinute}px` }}
                      />
                    ))}

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

                      return Array.from(timeGroups.entries()).map(([key, sessions]) => {
                        const firstSession = sessions[0];
                        const top = calculateSessionPosition(firstSession.time_slot, pixelsPerMinute);
                        const height = calculateSessionHeight(firstSession.time_slot, pixelsPerMinute);

                        const maxDisplayedSessions = Math.max(1, Math.floor(height / 28)); // ~28px per session
                        const hasMoreSessions = sessions.length > maxDisplayedSessions;
                        const displayedSessions = hasMoreSessions
                          ? sessions.slice(0, maxDisplayedSessions - 1)
                          : sessions;

                        return (
                          <div
                            key={key}
                            className="absolute w-full overflow-hidden"
                            style={{
                              top: `${top}px`,
                              height: `${height}px`,
                            }}
                          >
                            <div className="flex flex-col gap-0.5 p-0.5 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[#d4a574] scrollbar-track-transparent">
                              {displayedSessions.map((session) => {
                                return (
                                  <motion.div
                                    key={session.id}
                                    ref={(el) => {
                                      if (el) sessionRefs.current.set(session.id, el);
                                    }}
                                    whileHover={{ scale: 1.01, zIndex: 50 }}
                                    whileTap={{ scale: 0.99 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenSessionId(session.id);
                                      setOpenMoreGroup(null);
                                    }}
                                    className={cn(
                                      "cursor-pointer rounded px-1.5 py-0.5",
                                      "bg-white dark:bg-gray-800",
                                      "border-l-3",
                                      session.session_status === "Confirmed" && "border-green-500",
                                      session.session_status === "Pending" && "border-yellow-500",
                                      session.session_status === "Cancelled" && "border-red-500",
                                      session.session_status === "Completed" && "border-blue-500",
                                      !session.session_status && "border-[#d4a574] dark:border-[#8b6f47]",
                                      "shadow-sm hover:shadow-md transition-shadow",
                                      "overflow-hidden flex-shrink-0"
                                    )}
                                    style={{
                                      minHeight: "24px",
                                    }}
                                  >
                                    <div className="flex flex-col">
                                      <p className="font-bold text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                                        {session.school_student_id || "N/A"}
                                      </p>
                                      <p className="font-semibold text-[10px] text-gray-900 dark:text-gray-100 truncate leading-tight">
                                        {session.student_name || "Unknown"}
                                      </p>
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
                                    "bg-[#fef9f3] dark:bg-[#2d2618]",
                                    "border-l-3 border-[#d4a574] dark:border-[#8b6f47]",
                                    "shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
                                  )}
                                  style={{
                                    minHeight: "24px",
                                  }}
                                >
                                  <p className="font-bold text-[9px] text-[#a0704b] dark:text-[#cd853f]">
                                    +{sessions.length - displayedSessions.length} more
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
        const ref = sessionRefs.current.get(openSessionId);
        if (!session || !ref) return null;

        return (
          <SessionDetailPopover
            session={session}
            isOpen={true}
            onClose={() => setOpenSessionId(null)}
            triggerRef={{ current: ref }}
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
