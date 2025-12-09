"use client";

import { useState, useMemo } from "react";
import { useCalendarEvents } from "@/lib/hooks";
import { CalendarEvent } from "@/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, BookOpen } from "lucide-react";
import {
  useFloating,
  offset,
  flip,
  shift,
  useHover,
  useClick,
  useDismiss,
  useInteractions,
  useClientPoint,
  FloatingPortal,
} from "@floating-ui/react";

// Event type colors
const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Test: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  Exam: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500" },
  Quiz: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", dot: "bg-green-500" },
};

// Days until urgency colors
const getUrgencyColor = (daysUntil: number) => {
  if (daysUntil <= 3) return "bg-red-500 text-white";
  if (daysUntil <= 7) return "bg-orange-500 text-white";
  if (daysUntil <= 14) return "bg-yellow-500 text-gray-900";
  return "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300";
};

// Get month calendar dates (includes days from prev/next month to fill grid)
const getMonthCalendarDates = (year: number, month: number): Date[] => {
  const dates: Date[] = [];
  const firstDay = new Date(year, month, 1);

  // Start from Sunday of the week containing the 1st
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  // Fill 6 weeks (42 days) to ensure consistent grid
  for (let i = 0; i < 42; i++) {
    dates.push(new Date(startDate));
    startDate.setDate(startDate.getDate() + 1);
  }

  return dates;
};

// Format date to YYYY-MM-DD (local timezone)
const toDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Extended event type with optional days until
interface EventWithDaysUntil extends CalendarEvent {
  daysUntil?: number;
}

// Popover component for test items - works for both upcoming list and selected date events
function TestItemPopover({
  event,
  isMobile,
  variant = "upcoming",
}: {
  event: EventWithDaysUntil;
  isMobile: boolean;
  variant?: "upcoming" | "selected-date";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const colors = EVENT_TYPE_COLORS[event.event_type || 'Test'] || EVENT_TYPE_COLORS.Test;

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(12),
      flip({ fallbackAxisSideDirection: "end", padding: 8 }),
      shift({ padding: 8 }),
    ],
    placement: "bottom-start",
  });

  // Use clientPoint to follow cursor position
  const clientPoint = useClientPoint(context, { enabled: !isMobile });

  // Use hover on desktop, click on mobile
  const hover = useHover(context, { enabled: !isMobile, delay: { open: 200, close: 100 } });
  const click = useClick(context, { enabled: isMobile });
  const dismiss = useDismiss(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([clientPoint, hover, click, dismiss]);

  const hasDescription = event.description && event.description.trim().length > 0;

  // Render for upcoming list variant (with days badge)
  if (variant === "upcoming") {
    return (
      <div className="relative">
        <div
          ref={refs.setReference}
          {...getReferenceProps()}
          className={cn(
            "px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
            hasDescription && "cursor-pointer"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full flex-shrink-0", colors.dot)} />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {event.title}
                </span>
                {hasDescription && (
                  <BookOpen className="h-3 w-3 text-gray-400 flex-shrink-0" />
                )}
              </div>
              {event.school && event.grade && (
                <div className="text-xs text-gray-500 dark:text-gray-400 ml-4 mt-0.5">
                  {event.school} {event.grade}{event.academic_stream ? `(${event.academic_stream})` : ''}
                </div>
              )}
            </div>
            {event.daysUntil !== undefined && (
              <span className={cn(
                "text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0",
                getUrgencyColor(event.daysUntil)
              )}>
                {event.daysUntil === 0 ? 'Today' : event.daysUntil === 1 ? '1 day' : `${event.daysUntil} days`}
              </span>
            )}
          </div>
        </div>

        {/* Popover */}
        {isOpen && hasDescription && (
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
              className={cn(
                "z-[9999]",
                "bg-[#fef9f3] dark:bg-[#2d2618]",
                "border-2 border-[#d4a574] dark:border-[#8b6f47]",
                "rounded-lg shadow-lg",
                "p-3 w-64",
                "paper-texture"
              )}
            >
              <div className={cn("font-bold text-sm mb-1", colors.text)}>
                {event.title}
              </div>
              {event.school && event.grade && (
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {event.school} {event.grade}{event.academic_stream ? ` (${event.academic_stream})` : ''}
                  {' • '}
                  {new Date(event.start_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              )}
              <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap border-t border-[#d4a574]/30 dark:border-[#8b6f47]/30 pt-2">
                <span className="font-medium text-gray-600 dark:text-gray-400">Syllabus:</span>
                <div className="mt-1">{event.description}</div>
              </div>
            </div>
          </FloatingPortal>
        )}
      </div>
    );
  }

  // Render for selected-date variant (compact card style)
  return (
    <div
      ref={refs.setReference}
      {...getReferenceProps()}
      className={cn(
        "px-2 py-1.5 rounded text-xs relative",
        colors.bg,
        hasDescription && "cursor-pointer"
      )}
    >
      <div className="flex items-center gap-1">
        <div className={cn("font-medium", colors.text)}>{event.title}</div>
        {hasDescription && (
          <BookOpen className="h-3 w-3 text-gray-400 flex-shrink-0" />
        )}
      </div>
      {event.school && event.grade && (
        <div className="text-gray-600 dark:text-gray-400 mt-0.5">
          {event.school} {event.grade}{event.academic_stream ? `(${event.academic_stream})` : ''}
        </div>
      )}

      {/* Popover */}
      {isOpen && hasDescription && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[9999]",
              "bg-[#fef9f3] dark:bg-[#2d2618]",
              "border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "rounded-lg shadow-lg",
              "p-3 w-64",
              "paper-texture"
            )}
          >
            <div className={cn("font-bold text-sm mb-1", colors.text)}>
              {event.title}
            </div>
            {event.school && event.grade && (
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                {event.school} {event.grade}{event.academic_stream ? ` (${event.academic_stream})` : ''}
                {' • '}
                {new Date(event.start_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            )}
            <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap border-t border-[#d4a574]/30 dark:border-[#8b6f47]/30 pt-2">
              <span className="font-medium text-gray-600 dark:text-gray-400">Syllabus:</span>
              <div className="mt-1">{event.description}</div>
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}

interface TestCalendarProps {
  className?: string;
  isMobile?: boolean;
}

export function TestCalendar({ className, isMobile = false }: TestCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch 60 days of events to cover current and next month
  const { data: events = [], isLoading, error } = useCalendarEvents(60);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(event => {
      const dateKey = event.start_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    return map;
  }, [events]);

  // Get calendar dates for current month
  const calendarDates = useMemo(() => {
    return getMonthCalendarDates(currentMonth.getFullYear(), currentMonth.getMonth());
  }, [currentMonth]);

  // Calculate days until for each event
  const eventsWithDaysUntil = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return events
      .map(event => {
        const eventDate = new Date(event.start_date + 'T00:00:00');
        const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...event, daysUntil };
      })
      .filter(e => e.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 8); // Show max 8 upcoming events
  }, [events]);

  // Filter events for selected date
  const selectedDateEvents = selectedDate ? (eventsByDate.get(selectedDate) || []) : [];

  // Navigation handlers
  const goToPrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(toDateString(new Date()));
  };

  const today = toDateString(new Date());
  const currentMonthNum = currentMonth.getMonth();

  if (isLoading) {
    return (
      <div className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4",
        !isMobile && "paper-texture",
        className
      )}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-32" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4",
        !isMobile && "paper-texture",
        className
      )}>
        <div className="text-center text-red-500 dark:text-red-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Failed to load calendar events</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden flex flex-col h-[520px]",
      !isMobile && "paper-texture",
      className
    )}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Tests & Exams</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevMonth}
            className="p-1.5 hover:bg-[#d4a574]/20 rounded transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={goToToday}
            className="px-2 py-1 text-xs font-medium text-[#a0704b] dark:text-[#cd853f] hover:bg-[#d4a574]/20 rounded transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 hover:bg-[#d4a574]/20 rounded transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Month label */}
      <div className="flex-shrink-0 text-center py-2 font-semibold text-gray-800 dark:text-gray-200">
        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </div>

      {/* Calendar Grid */}
      <div className="flex-shrink-0 px-3 pb-2">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDates.map((date, i) => {
            const dateStr = toDateString(date);
            const isCurrentMonth = date.getMonth() === currentMonthNum;
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const dayEvents = eventsByDate.get(dateStr) || [];
            const hasEvents = dayEvents.length > 0;

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={cn(
                  "relative h-8 rounded text-sm transition-colors",
                  isCurrentMonth
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-600",
                  isToday && "font-bold",
                  isSelected && "bg-[#a0704b] text-white",
                  !isSelected && hasEvents && "hover:bg-[#d4a574]/30",
                  !isSelected && !hasEvents && "hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
              >
                <span className={cn(
                  "flex items-center justify-center h-full",
                  isToday && !isSelected && "ring-2 ring-[#a0704b] ring-inset rounded"
                )}>
                  {date.getDate()}
                </span>

                {/* Event dots */}
                {hasEvents && !isSelected && (
                  <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((event, j) => {
                      const colors = EVENT_TYPE_COLORS[event.event_type || 'Test'] || EVENT_TYPE_COLORS.Test;
                      return (
                        <div
                          key={j}
                          className={cn("w-1 h-1 rounded-full", colors.dot)}
                        />
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom section - toggles between upcoming and selected date events */}
      <div className="flex-1 min-h-0 flex flex-col border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]">
        {/* Tab header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSelectedDate(null)}
            className={cn(
              "text-xs font-semibold uppercase tracking-wide transition-colors",
              selectedDate
                ? "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
                : "text-[#a0704b] dark:text-[#cd853f]"
            )}
          >
            Upcoming
          </button>
          {selectedDate && (
            <>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="text-xs font-semibold text-[#a0704b] dark:text-[#cd853f]">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </>
          )}
        </div>

        {/* Content - either upcoming or selected date events */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {selectedDate && selectedDateEvents.length > 0 ? (
            /* Show selected date events */
            <div className="divide-y divide-gray-100 dark:divide-gray-800 p-2 space-y-1.5">
              {selectedDateEvents.map((event) => (
                <TestItemPopover
                  key={event.id}
                  event={event}
                  isMobile={isMobile}
                  variant="selected-date"
                />
              ))}
            </div>
          ) : selectedDate && selectedDateEvents.length === 0 ? (
            /* Selected date has no events */
            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              No events on this date
            </div>
          ) : eventsWithDaysUntil.length === 0 ? (
            /* No upcoming events */
            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              No upcoming tests
            </div>
          ) : (
            /* Show upcoming list */
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {eventsWithDaysUntil.map((event) => (
                <TestItemPopover key={event.id} event={event} isMobile={isMobile} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
