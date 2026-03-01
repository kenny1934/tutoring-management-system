"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useHolidays } from "@/lib/hooks";
import type { Holiday } from "@/types";
import { toDateString } from "@/lib/calendar-utils";

// Get the start of the week (Sunday)
const getWeekStart = (baseDate: Date, weekOffset: number = 0): Date => {
  const d = new Date(baseDate);
  // Move to Sunday of current week
  d.setDate(d.getDate() - d.getDay());
  // Apply week offset
  d.setDate(d.getDate() + weekOffset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get an array of 7 days starting from Sunday
const getWeekDays = (weekOffset: number = 0): Date[] => {
  const start = getWeekStart(new Date(), weekOffset);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
};

// Format week range for header (e.g., "Dec 8 - 14")
const formatWeekRange = (days: Date[]): string => {
  const start = days[0];
  const end = days[6];
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
  }
  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
};

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface WeeklyMiniCalendarProps {
  className?: string;
}

export function WeeklyMiniCalendar({ className }: WeeklyMiniCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = toDateString(new Date());
  const dayRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    let newIndex = index;
    let newWeekOffset = weekOffset;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (index === 0) {
          // Go to previous week, last day
          newWeekOffset = weekOffset - 1;
          newIndex = 6;
        } else {
          newIndex = index - 1;
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (index === 6) {
          // Go to next week, first day
          newWeekOffset = weekOffset + 1;
          newIndex = 0;
        } else {
          newIndex = index + 1;
        }
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = 6;
        break;
      default:
        return;
    }

    setFocusedIndex(newIndex);
    if (newWeekOffset !== weekOffset) {
      setWeekOffset(newWeekOffset);
      // Focus after state update
      setTimeout(() => dayRefs.current[newIndex]?.focus(), 0);
    } else {
      dayRefs.current[newIndex]?.focus();
    }
  }, [weekOffset]);

  // Fetch holidays for the current week
  const firstDay = weekDays[0];
  const lastDay = weekDays[6];
  const { data: holidays = [] } = useHolidays(
    toDateString(firstDay),
    toDateString(lastDay)
  );

  // Create holiday lookup map for O(1) access
  const holidayMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach(holiday => {
      map.set(holiday.holiday_date, holiday);
    });
    return map;
  }, [holidays]);

  const goToPrevWeek = () => setWeekOffset(prev => prev - 1);
  const goToNextWeek = () => setWeekOffset(prev => prev + 1);
  const goToThisWeek = () => setWeekOffset(0);

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPrevWeek}
          className="p-1 hover:bg-foreground/10 rounded transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-foreground/60" />
        </button>
        <button
          onClick={goToThisWeek}
          className={cn(
            "text-xs font-semibold transition-colors",
            weekOffset === 0
              ? "text-primary"
              : "text-foreground/70 hover:text-foreground"
          )}
        >
          {formatWeekRange(weekDays)}
        </button>
        <button
          onClick={goToNextWeek}
          className="p-1 hover:bg-foreground/10 rounded transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="h-3.5 w-3.5 text-foreground/60" />
        </button>
      </div>

      {/* Week days grid with keyboard navigation */}
      <div
        role="grid"
        aria-label="Week calendar"
        className="flex justify-between gap-1"
      >
        <div role="row" className="contents">
          {weekDays.map((day, i) => {
            const dateStr = toDateString(day);
            const isToday = dateStr === today;
            const holiday = holidayMap.get(dateStr);
            const isHoliday = !!holiday;

            // Build tooltip text
            const baseTooltip = day.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const tooltipText = isHoliday && holiday?.holiday_name
              ? `${baseTooltip} • ${holiday.holiday_name}`
              : baseTooltip;

            return (
              <Link
                key={dateStr}
                ref={(el) => { dayRefs.current[i] = el; }}
                href={`/sessions?date=${dateStr}`}
                role="gridcell"
                tabIndex={focusedIndex === i ? 0 : -1}
                aria-current={isToday ? "date" : undefined}
                aria-label={tooltipText}
                onKeyDown={(e) => handleKeyDown(e, i)}
                onFocus={() => setFocusedIndex(i)}
                className={cn(
                  "flex-1 flex flex-col items-center py-1.5 px-0.5 rounded-lg transition-all",
                  "hover:bg-foreground/10 hover:scale-105 active:scale-95",
                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                  isToday && "bg-primary/10 ring-1 ring-primary/30",
                  isHoliday && "bg-rose-500/15 ring-1 ring-rose-500/40"
                )}
                title={tooltipText}
              >
                {/* Day label */}
                <span className={cn(
                  "text-[10px] font-semibold",
                  isToday ? "text-primary" : isHoliday ? "text-rose-500" : "text-foreground/60"
                )}>
                  {DAY_LABELS[i]}
                </span>

                {/* Date number with optional holiday icon */}
                <div className="flex items-center gap-0.5">
                  <span className={cn(
                    "text-xs font-bold",
                    isToday ? "text-primary" : isHoliday ? "text-rose-500" : "text-foreground/80"
                  )}>
                    {day.getDate()}
                  </span>
                  {isHoliday && (
                    <CalendarDays className={cn(
                      "h-2.5 w-2.5",
                      isToday ? "text-primary" : "text-rose-500"
                    )} />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
