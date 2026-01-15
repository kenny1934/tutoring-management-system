"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useCalendarEvents } from "@/lib/hooks";
import { toDateString } from "@/lib/calendar-utils";

interface ZenCalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose?: () => void;
  isFocused?: boolean;
}

// Helper to get today's date string
const getToday = (): string => toDateString(new Date());

// Get first day of month
const getFirstDayOfMonth = (year: number, month: number): Date => {
  return new Date(year, month, 1);
};

// Get number of days in month
const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

// Month names
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function ZenCalendar({
  selectedDate,
  onSelectDate,
  onClose,
  isFocused = true,
}: ZenCalendarProps) {
  // Parse selected date to get initial month/year
  const [year, month] = useMemo(() => {
    const parts = selectedDate.split("-");
    return [parseInt(parts[0]), parseInt(parts[1]) - 1];
  }, [selectedDate]);

  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  const [cursorDate, setCursorDate] = useState(selectedDate);

  // Fetch calendar events for the view month (and surrounding months)
  const { data: events } = useCalendarEvents(60); // 60 days to cover current + next month

  // Build set of dates that have events
  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    if (events) {
      events.forEach((event) => {
        if (event.event_date) {
          dates.add(event.event_date);
        }
      });
    }
    return dates;
  }, [events]);

  // Generate calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Get days from previous month to fill first row
    const prevMonthDays = getDaysInMonth(viewYear, viewMonth - 1);

    const grid: Array<{ date: string; day: number; isCurrentMonth: boolean }> = [];

    // Previous month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
      grid.push({
        date: toDateString(new Date(prevYear, prevMonth, day)),
        day,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push({
        date: toDateString(new Date(viewYear, viewMonth, day)),
        day,
        isCurrentMonth: true,
      });
    }

    // Next month days to fill remaining cells (6 rows = 42 cells)
    const remaining = 42 - grid.length;
    for (let day = 1; day <= remaining; day++) {
      const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
      grid.push({
        date: toDateString(new Date(nextYear, nextMonth, day)),
        day,
        isCurrentMonth: false,
      });
    }

    return grid;
  }, [viewYear, viewMonth]);

  // Navigation handlers
  const goToPrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const goToNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setCursorDate(getToday());
  }, []);

  // Cursor navigation
  const moveCursor = useCallback((days: number) => {
    const current = new Date(cursorDate + "T00:00:00");
    current.setDate(current.getDate() + days);
    const newDate = toDateString(current);
    setCursorDate(newDate);

    // Update view month if needed
    const newMonth = current.getMonth();
    const newYear = current.getFullYear();
    if (newMonth !== viewMonth || newYear !== viewYear) {
      setViewMonth(newMonth);
      setViewYear(newYear);
    }
  }, [cursorDate, viewMonth, viewYear]);

  // Keyboard handling
  useEffect(() => {
    if (!isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Track if we handled this key to stop propagation
      let handled = true;

      switch (e.key) {
        case "h":
        case "ArrowLeft":
          moveCursor(-1);
          break;
        case "l":
        case "ArrowRight":
          moveCursor(1);
          break;
        case "k":
        case "ArrowUp":
          moveCursor(-7);
          break;
        case "j":
        case "ArrowDown":
          moveCursor(7);
          break;
        case "H":
        case "<":
          goToPrevMonth();
          break;
        case "L":
        case ">":
          goToNextMonth();
          break;
        case "t":
          goToToday();
          break;
        case "Enter":
          onSelectDate(cursorDate);
          onClose?.();
          break;
        case "Escape":
          onClose?.();
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    // Use capture phase so calendar handles keys BEFORE other handlers
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isFocused, moveCursor, goToPrevMonth, goToNextMonth, goToToday, cursorDate, onSelectDate, onClose]);

  const today = getToday();

  return (
    <div
      style={{
        fontFamily: "var(--zen-font)",
        fontSize: "13px",
        color: "var(--zen-fg)",
        backgroundColor: "var(--zen-bg)",
        border: "1px solid var(--zen-border)",
        padding: "12px",
        minWidth: "280px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--zen-border)",
        }}
      >
        <button
          onClick={goToPrevMonth}
          style={{
            background: "none",
            border: "none",
            color: "var(--zen-accent)",
            cursor: "pointer",
            padding: "2px 8px",
            fontFamily: "inherit",
          }}
          title="Previous month (H or <)"
        >
          {"<"}
        </button>
        <span style={{ fontWeight: "bold", color: "var(--zen-fg)" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={goToNextMonth}
          style={{
            background: "none",
            border: "none",
            color: "var(--zen-accent)",
            cursor: "pointer",
            padding: "2px 8px",
            fontFamily: "inherit",
          }}
          title="Next month (L or >)"
        >
          {">"}
        </button>
      </div>

      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "2px",
          marginBottom: "4px",
        }}
      >
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            style={{
              textAlign: "center",
              color: "var(--zen-dim)",
              fontSize: "11px",
              padding: "4px 0",
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "2px",
        }}
      >
        {calendarGrid.map((cell, idx) => {
          const isToday = cell.date === today;
          const isSelected = cell.date === selectedDate;
          const isCursor = cell.date === cursorDate;
          const hasEvent = eventDates.has(cell.date);

          return (
            <button
              key={idx}
              onClick={() => {
                onSelectDate(cell.date);
                onClose?.();
              }}
              style={{
                background: isSelected
                  ? "var(--zen-accent)"
                  : isCursor
                  ? "var(--zen-border)"
                  : "none",
                border: "none",
                color: isSelected
                  ? "var(--zen-bg)"
                  : !cell.isCurrentMonth
                  ? "var(--zen-dim)"
                  : isToday
                  ? "var(--zen-accent)"
                  : "var(--zen-fg)",
                fontWeight: isToday ? "bold" : "normal",
                padding: "6px 2px",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "12px",
                textAlign: "center",
                position: "relative",
              }}
              title={cell.date}
            >
              {isCursor && !isSelected ? "[" : ""}
              {cell.day}
              {isCursor && !isSelected ? "]" : ""}
              {hasEvent && (
                <span
                  style={{
                    position: "absolute",
                    bottom: "2px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontSize: "8px",
                    color: "var(--zen-warning)",
                  }}
                >
                  ●
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer with today button and hints */}
      <div
        style={{
          marginTop: "12px",
          paddingTop: "8px",
          borderTop: "1px solid var(--zen-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          onClick={goToToday}
          style={{
            background: "none",
            border: "1px solid var(--zen-border)",
            color: "var(--zen-accent)",
            cursor: "pointer",
            padding: "4px 12px",
            fontFamily: "inherit",
            fontSize: "11px",
          }}
        >
          [t] Today
        </button>
        <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
          hjkl/arrows ← → Esc close
        </span>
      </div>
    </div>
  );
}
