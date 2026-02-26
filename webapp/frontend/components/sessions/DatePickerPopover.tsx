"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useInteractions,
  FloatingPortal,
  useClick,
} from "@floating-ui/react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toDateString,
  getMonthCalendarDates,
  isSameDay,
  getMonthName,
  getPreviousMonth,
  getNextMonth,
} from "@/lib/calendar-utils";

interface DatePickerPopoverProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function DatePickerPopover({ selectedDate, onSelect }: DatePickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(selectedDate);
  const [inputValue, setInputValue] = useState("");

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
    placement: "bottom-start",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  // Sync viewMonth when selectedDate changes externally (e.g. Today button)
  useEffect(() => {
    setViewMonth(selectedDate);
  }, [selectedDate]);

  // Reset input and viewMonth when popover opens
  useEffect(() => {
    if (isOpen) {
      setInputValue(toDateString(selectedDate));
      setViewMonth(selectedDate);
    }
  }, [isOpen, selectedDate]);

  const calendarDates = useMemo(() => getMonthCalendarDates(viewMonth), [viewMonth]);
  const currentMonth = viewMonth.getMonth();
  const today = useMemo(() => new Date(), []);

  const handleDateClick = (date: Date) => {
    onSelect(date);
    setIsOpen(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const date = new Date(inputValue + "T00:00:00");
      if (!isNaN(date.getTime())) {
        onSelect(date);
        setIsOpen(false);
      }
    }
  };

  // Format trigger label: "Wed, Feb 26, 2026"
  const triggerLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Shorter mobile label: "Feb 26"
  const triggerLabelShort = selectedDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <>
      {/* Trigger button */}
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 text-sm",
          "bg-white dark:bg-[#1a1a1a]",
          "border border-[#d4a574] dark:border-[#6b5a4a] rounded-md",
          "focus:outline-none focus:ring-1 focus:ring-[#a0704b]",
          "text-gray-900 dark:text-gray-100 font-medium",
          "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        )}
      >
        <CalendarDays className="h-3.5 w-3.5 text-[#a0704b]" />
        <span className="hidden sm:inline">{triggerLabel}</span>
        <span className="sm:hidden">{triggerLabelShort}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#a0704b] transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Calendar popover */}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-[9999]",
              "bg-white dark:bg-[#1a1a1a]",
              "border border-[#d4a574] dark:border-[#6b5a4a]",
              "rounded-md shadow-lg",
              "p-2 w-[260px]"
            )}
          >
            {/* Month navigation header */}
            <div className="flex items-center justify-between px-1 pb-2">
              <button
                onClick={() => setViewMonth(getPreviousMonth(viewMonth))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#8b6f47] dark:text-[#cd853f]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-[#5d4e37] dark:text-[#e8d4b8]">
                {getMonthName(viewMonth)} {viewMonth.getFullYear()}
              </span>
              <button
                onClick={() => setViewMonth(getNextMonth(viewMonth))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-[#8b6f47] dark:text-[#cd853f]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((day, i) => (
                <div
                  key={i}
                  className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days grid */}
            <div className="grid grid-cols-7">
              {calendarDates.map((date) => {
                const isCurrentMonth = date.getMonth() === currentMonth;
                const isSelected = isSameDay(date, selectedDate);
                const isToday = isSameDay(date, today);

                return (
                  <button
                    key={toDateString(date)}
                    onClick={() => handleDateClick(date)}
                    className={cn(
                      "h-8 w-full text-xs rounded-full flex items-center justify-center transition-colors",
                      !isCurrentMonth && "text-gray-300 dark:text-gray-600",
                      isCurrentMonth && !isSelected && "text-gray-700 dark:text-gray-300",
                      isCurrentMonth && !isSelected && "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                      isToday && !isSelected && "ring-1 ring-[#a0704b] dark:ring-[#cd853f] font-semibold",
                      isSelected && "bg-[#a0704b] dark:bg-[#cd853f] text-white font-bold"
                    )}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Keyboard input */}
            <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] mt-2 pt-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="YYYY-MM-DD"
                className={cn(
                  "w-full px-2 py-1 text-xs",
                  "bg-white dark:bg-[#1a1a1a]",
                  "border border-gray-200 dark:border-gray-700 rounded",
                  "focus:outline-none focus:ring-1 focus:ring-[#a0704b]",
                  "text-gray-700 dark:text-gray-300",
                  "placeholder:text-gray-400 dark:placeholder:text-gray-600"
                )}
              />
            </div>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
