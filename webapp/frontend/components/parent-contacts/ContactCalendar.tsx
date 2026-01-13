"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ParentCommunication, StudentContactStatus } from "@/lib/api";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2
} from "lucide-react";

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
}: ContactCalendarProps) {
  // Get follow-up dates as a Set for quick lookup
  const followupDates = useMemo(() => {
    return new Set(
      pendingFollowups
        .filter(f => f.follow_up_date)
        .map(f => f.follow_up_date!)
    );
  }, [pendingFollowups]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, ParentCommunication[]> = {};
    events.forEach(event => {
      const dateKey = event.contact_date.split('T')[0];
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
        dateKey: date.toISOString().split('T')[0],
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
        dateKey: date.toISOString().split('T')[0],
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
        dateKey: date.toISOString().split('T')[0],
      });
    }

    return days;
  }, [selectedDate]);

  // Navigate months
  const goToPrevMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    onDateChange(newDate);
  };

  const goToNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    onDateChange(newDate);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

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
        <div className="flex items-center justify-between">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevMonth}
              className="p-1.5 rounded hover:bg-white dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
              {MONTHS[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </h3>
            <button
              onClick={goToNextMonth}
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
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Day/Week view placeholder - simplified list view
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contacts in this period</p>
              </div>
            ) : (
              events.map(event => (
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {event.student_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(event.contact_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 truncate">
                        {event.contact_type} · {event.contact_method}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
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
