"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatSessionDisplay } from "@/lib/formatters";
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
  calculateSessionLayouts,
  parseTimeSlot,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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

  const handleSessionClick = (sessionId: number) => {
    router.push(`/sessions/${sessionId}`);
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
                const sessionsWithLayout = calculateSessionLayouts(daySessions);

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

                    {/* Sessions */}
                    {sessionsWithLayout.map((session) => {
                      const parsed = parseTimeSlot(session.time_slot);
                      const top = calculateSessionPosition(session.time_slot, pixelsPerMinute);
                      const height = calculateSessionHeight(session.time_slot, pixelsPerMinute);

                      return (
                        <motion.div
                          key={session.id}
                          whileHover={{ scale: 1.02, zIndex: 50 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSessionClick(session.id)}
                          className={cn(
                            "absolute cursor-pointer rounded px-2 py-1 overflow-hidden",
                            "bg-white dark:bg-gray-800",
                            "border-l-4 border-[#d4a574] dark:border-[#8b6f47]",
                            "shadow-sm hover:shadow-md transition-shadow"
                          )}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            left: `${session.layoutLeft}%`,
                            width: `${session.layoutWidth}%`,
                          }}
                        >
                          <div className="text-xs">
                            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {formatSessionDisplay(session)}
                            </p>
                            {parsed && (
                              <p className="text-gray-600 dark:text-gray-400">
                                {parsed.start} - {parsed.end}
                              </p>
                            )}
                            <div className="mt-1">
                              <StatusBadge status={session.session_status} size="xs" />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
