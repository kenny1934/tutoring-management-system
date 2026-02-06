"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ParentCommunication, StudentContactStatus } from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2
} from "lucide-react";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";

interface ContactCalendarProps {
  events: ParentCommunication[];
  pendingFollowups: StudentContactStatus[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  view: 'day' | 'week' | 'month';
  onViewChange: (view: 'day' | 'week' | 'month') => void;
  selectedContactId: number | null;
  onEventClick: (contact: ParentCommunication) => void;
  loading?: boolean;
  showLocationPrefix?: boolean;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function ContactCalendar({
  events,
  pendingFollowups,
  selectedDate,
  onDateChange,
  view,
  onViewChange,
  selectedContactId,
  onEventClick,
  loading = false,
  showLocationPrefix,
}: ContactCalendarProps) {
  // Get follow-up dates as a Set for quick lookup
  const followupDates = useMemo(() => {
    return new Set(
      pendingFollowups
        .filter(f => f.follow_up_date)
        .map(f => f.follow_up_date!)
    );
  }, [pendingFollowups]);

  // Group events by date (using local timezone)
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, ParentCommunication[]> = {};
    events.forEach(event => {
      // Convert to local date to fix timezone issues (e.g., 8:13pm Jan 19 showing on Jan 20)
      const dateKey = new Date(event.contact_date).toLocaleDateString('en-CA');
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(event);
    });
    return grouped;
  }, [events]);

  // Generate calendar days for month view
  const calendarDays = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();

    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    const totalDays = lastDay.getDate();

    // Days from previous month
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days: Array<{
      date: Date;
      day: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      dateKey: string;
    }> = [];

    // Previous month days
    for (let i = startOffset - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthDays - i);
      days.push({
        date,
        day: prevMonthDays - i,
        isCurrentMonth: false,
        isToday: false,
        dateKey: date.toLocaleDateString('en-CA'),
      });
    }

    // Current month days
    const today = new Date();
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      const isToday = date.toDateString() === today.toDateString();
      days.push({
        date,
        day: i,
        isCurrentMonth: true,
        isToday,
        dateKey: date.toLocaleDateString('en-CA'),
      });
    }

    // Next month days (fill to complete grid)
    const remainingDays = 42 - days.length; // 6 rows * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      days.push({
        date,
        day: i,
        isCurrentMonth: false,
        isToday: false,
        dateKey: date.toLocaleDateString('en-CA'),
      });
    }

    return days;
  }, [selectedDate]);

  // Generate week days for week view
  const weekDays = useMemo(() => {
    const start = new Date(selectedDate);
    start.setDate(start.getDate() - start.getDay()); // Go to Sunday
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return {
        date,
        day: date.getDate(),
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
        dateKey: date.toLocaleDateString('en-CA'),
      };
    });
  }, [selectedDate]);

  // View-aware navigation
  const goToPrev = () => {
    const newDate = new Date(selectedDate);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    onDateChange(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(selectedDate);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    onDateChange(newDate);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  // View-aware header title
  const headerTitle = useMemo(() => {
    if (view === 'day') {
      return selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else if (view === 'week') {
      const start = new Date(selectedDate);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = start.getMonth() === end.getMonth()
        ? end.getDate().toString()
        : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${startStr} – ${endStr}, ${end.getFullYear()}`;
    }
    return `${MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  }, [selectedDate, view]);

  // Track which day's popover is open + its position
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);

  const openPopover = (dateKey: string, e: React.MouseEvent) => {
    if (expandedDay === dateKey) {
      setExpandedDay(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    setExpandedDay(dateKey);
  };

  // Close popover on outside click
  useEffect(() => {
    if (!expandedDay) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setExpandedDay(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [expandedDay]);

  // Get contact type color
  const getContactTypeColor = (type: string) => {
    switch (type) {
      case 'Progress Update':
        return 'bg-blue-500';
      case 'Concern':
        return 'bg-orange-500';
      case 'General':
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className={cn(
      "flex flex-col h-full",
      "bg-white dark:bg-[#1a1a1a] rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a]",
      "overflow-hidden"
    )}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
              {headerTitle}
            </h3>
            <button
              onClick={goToNext}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* View Toggle + Today */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                "bg-white dark:bg-[#2d2618] border border-[#d4a574]/50",
                "text-gray-600 dark:text-gray-400 hover:text-[#a0704b]"
              )}
            >
              Today
            </button>

            {/* View selector */}
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-md p-0.5">
              {(['day', 'week', 'month'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => onViewChange(v)}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors capitalize",
                    view === v
                      ? "bg-white dark:bg-[#2d2618] text-[#a0704b] shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-[#a0704b]" />
          </div>
        ) : view === 'month' ? (
          <div className="h-full flex flex-col">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_OF_WEEK.map(day => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="flex-1 grid grid-cols-7 gap-1 auto-rows-fr">
              {calendarDays.map((day, index) => {
                const dayEvents = eventsByDate[day.dateKey] || [];
                const hasFollowup = followupDates.has(day.dateKey);

                return (
                  <div
                    key={index}
                    className={cn(
                      "min-h-[60px] p-1 rounded border transition-colors",
                      day.isCurrentMonth
                        ? "bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700"
                        : "bg-gray-50 dark:bg-gray-800/50 border-transparent",
                      day.isToday && "ring-2 ring-[#a0704b] ring-offset-1"
                    )}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          day.isCurrentMonth
                            ? "text-gray-900 dark:text-gray-100"
                            : "text-gray-400 dark:text-gray-500",
                          day.isToday && "text-[#a0704b]"
                        )}
                      >
                        {day.day}
                      </span>
                      {hasFollowup && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Follow-up scheduled" />
                      )}
                    </div>

                    {/* Events */}
                    <div className="space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map(event => (
                        <button
                          key={event.id}
                          onClick={() => onEventClick(event)}
                          className={cn(
                            "w-full text-left px-1 py-0.5 rounded text-[10px] truncate transition-all",
                            getContactTypeColor(event.contact_type),
                            "text-white hover:brightness-110",
                            selectedContactId === event.id && "ring-2 ring-offset-1 ring-[#a0704b]"
                          )}
                          title={`${event.student_name} - ${event.contact_type}`}
                        >
                          {event.student_name.split(' ')[0]}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <button
                          onClick={(e) => openPopover(day.dateKey, e)}
                          className="w-full text-[10px] text-gray-500 dark:text-gray-400 text-center hover:text-[#a0704b] hover:underline transition-colors"
                        >
                          +{dayEvents.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fixed popover for expanded day */}
            {expandedDay && eventsByDate[expandedDay] && (
              <div
                ref={popoverRef}
                className="fixed z-50 w-40 p-1.5 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] space-y-0.5"
                style={{ top: popoverPos.top, left: popoverPos.left }}
              >
                {eventsByDate[expandedDay].map(event => (
                  <button
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className={cn(
                      "w-full text-left px-1.5 py-0.5 rounded text-[10px] truncate transition-all",
                      getContactTypeColor(event.contact_type),
                      "text-white hover:brightness-110",
                      selectedContactId === event.id && "ring-2 ring-offset-1 ring-[#a0704b]"
                    )}
                    title={`${event.student_name} - ${event.contact_type}`}
                  >
                    {event.student_name.split(' ')[0]} · {event.contact_type}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : view === 'week' ? (
          // Week view - 7-column grid for one week
          <div className="h-full flex flex-col">
            {/* Day headers with dates */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekDays.map((day) => (
                <div
                  key={day.dateKey}
                  className={cn(
                    "text-center text-xs font-medium py-1",
                    day.isToday ? "text-[#a0704b]" : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  {DAYS_OF_WEEK[day.date.getDay()]} {day.day}
                </div>
              ))}
            </div>

            {/* Week grid */}
            <div className="flex-1 grid grid-cols-7 gap-1">
              {weekDays.map((day) => {
                const dayEvents = eventsByDate[day.dateKey] || [];
                const hasFollowup = followupDates.has(day.dateKey);

                return (
                  <div
                    key={day.dateKey}
                    className={cn(
                      "p-1 rounded border transition-colors overflow-auto",
                      "bg-white dark:bg-[#1a1a1a] border-gray-200 dark:border-gray-700",
                      day.isToday && "ring-2 ring-[#a0704b] ring-offset-1"
                    )}
                  >
                    {hasFollowup && (
                      <div className="flex justify-end mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Follow-up scheduled" />
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {dayEvents.map(event => (
                        <button
                          key={event.id}
                          onClick={() => onEventClick(event)}
                          className={cn(
                            "w-full text-left px-1 py-0.5 rounded text-[10px] truncate transition-all",
                            getContactTypeColor(event.contact_type),
                            "text-white hover:brightness-110",
                            selectedContactId === event.id && "ring-2 ring-offset-1 ring-[#a0704b]"
                          )}
                          title={`${event.student_name} - ${event.contact_type}`}
                        >
                          {event.student_name.split(' ')[0]}
                        </button>
                      ))}
                      {dayEvents.length === 0 && (
                        <p className="text-[10px] text-gray-400 text-center py-2">—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Day view - single day event list
          <div className="space-y-2">
            {(() => {
              const dayKey = selectedDate.toLocaleDateString('en-CA');
              const dayEvents = eventsByDate[dayKey] || [];
              if (dayEvents.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No contacts on this day</p>
                  </div>
                );
              }
              return dayEvents.map(event => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                    selectedContactId === event.id
                      ? "border-[#a0704b] bg-[#f5ede3] dark:bg-[#3d3628]"
                      : "border-gray-200 dark:border-gray-700"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", getContactTypeColor(event.contact_type))} />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <StudentInfoBadges
                        student={{
                          student_id: event.student_id,
                          student_name: event.student_name,
                          school_student_id: event.school_student_id || undefined,
                          grade: event.grade || undefined,
                          lang_stream: event.lang_stream || undefined,
                          school: event.school || undefined,
                          home_location: event.home_location || undefined,
                        }}
                        showLocationPrefix={showLocationPrefix}
                      />
                      <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                        {event.contact_type} · {event.contact_method}
                      </p>
                      {event.notes && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.notes}</p>
                      )}
                    </div>
                  </div>
                </button>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3]/50 dark:bg-[#3d3628]/50">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Progress
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            Concern
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            General
          </div>
        </div>
      </div>
    </div>
  );
}
