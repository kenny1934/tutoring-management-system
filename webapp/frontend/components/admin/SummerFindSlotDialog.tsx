"use client";

import React, { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  FloatingOverlay,
  FloatingFocusManager,
  FloatingPortal,
  useFloating,
  useDismiss,
  useInteractions,
} from "@floating-ui/react";
import { Search, Check, AlertTriangle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import useSWR from "swr";
import { summerAPI } from "@/lib/api";
import { formatShortDate, formatCompactDate, DAY_ABBREV } from "@/lib/summer-utils";
import { getWeekStartStr, toDateString, getWeekDateStrings } from "@/lib/calendar-utils";
import { useToast } from "@/contexts/ToastContext";
import type { SummerFindSlotResult, SummerLessonCalendarEntry } from "@/types";

interface SummerFindSlotDialogProps {
  isOpen: boolean;
  onClose: () => void;
  configId: number;
  location: string;
  applicationId: number;
  studentName: string;
  grade: string;
  lessonNumber: number;
  afterDate?: string;
  beforeDate?: string;
  onPlaced: () => void;
  // For mini calendar
  openDays?: string[];
  courseStartDate?: string;
  courseEndDate?: string;
  timeSlots?: string[];
}

const DAY_NAME_FROM_NUM: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

function formatWeekLabel(start: string, end: string, courseStart: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const cs = new Date(courseStart + "T00:00:00");
  const weekNum = Math.max(1, Math.floor((s.getTime() - cs.getTime()) / (7 * 86400000)) + 1);
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  const range = sMonth === eMonth
    ? `${sMonth} ${s.getDate()} – ${e.getDate()}`
    : `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}`;
  return `Week ${weekNum}: ${range}`;
}

export function SummerFindSlotDialog({
  isOpen,
  onClose,
  configId,
  location,
  applicationId,
  studentName,
  grade,
  lessonNumber,
  afterDate,
  beforeDate,
  onPlaced,
  openDays,
  courseStartDate,
  courseEndDate,
  timeSlots: configTimeSlots,
}: SummerFindSlotDialogProps) {
  const { showToast, showError } = useToast();
  const [placingId, setPlacingId] = useState<number | null>(null);

  // Suggested matches
  const { data: results, isLoading, error } = useSWR(
    isOpen
      ? ["summer-find-slot", configId, location, grade, lessonNumber, afterDate, beforeDate]
      : null,
    () =>
      summerAPI.findSlot({
        config_id: configId,
        location,
        grade,
        lesson_number: lessonNumber,
        after_date: afterDate,
        before_date: beforeDate,
      })
  );

  // Mini calendar state
  const initialWeek = useMemo(() => {
    if (afterDate) return getWeekStartStr(afterDate);
    if (courseStartDate) {
      const d = new Date(courseStartDate + "T00:00:00");
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      else if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      return getWeekStartStr(toDateString(d));
    }
    return getWeekStartStr(new Date().toISOString().slice(0, 10));
  }, [afterDate, courseStartDate]);

  const [calWeekStart, setCalWeekStart] = useState(initialWeek);

  // Reset week when dialog reopens for a different student
  useEffect(() => {
    setCalWeekStart(initialWeek);
  }, [initialWeek]);

  const { data: calendarData } = useSWR(
    isOpen && openDays
      ? ["summer-find-slot-calendar", configId, location, calWeekStart]
      : null,
    () => summerAPI.getLessonCalendar(configId, location, calWeekStart)
  );

  // Filter calendar lessons by grade
  const gradeLessons = useMemo(() => {
    if (!calendarData?.lessons) return [];
    return calendarData.lessons.filter((l) => l.grade === grade);
  }, [calendarData?.lessons, grade]);

  // Index by "date|timeSlot"
  const lessonIndex = useMemo(() => {
    const m = new Map<string, SummerLessonCalendarEntry>();
    for (const l of gradeLessons) {
      m.set(`${l.date}|${l.time_slot}`, l);
    }
    return m;
  }, [gradeLessons]);

  // Week dates filtered to openDays
  const weekDates = useMemo(() => {
    if (!openDays) return [];
    return getWeekDateStrings(calWeekStart).filter((dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      return openDays.includes(DAY_NAME_FROM_NUM[d.getDay()]);
    });
  }, [calWeekStart, openDays]);

  // Time slots from calendar data (deduplicate)
  const calTimeSlots = useMemo(() => {
    if (configTimeSlots?.length) return configTimeSlots;
    const set = new Set(gradeLessons.map((l) => l.time_slot));
    return Array.from(set).sort();
  }, [gradeLessons, configTimeSlots]);

  // Week nav bounds
  const canGoPrev = courseStartDate ? calWeekStart > getWeekStartStr(courseStartDate) : false;
  const canGoNext = courseEndDate ? (() => {
    const end = new Date(calWeekStart + "T00:00:00");
    end.setDate(end.getDate() + 6);
    return toDateString(end) < courseEndDate;
  })() : false;

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && placingId === null) onClose();
    },
  });

  const dismiss = useDismiss(context, {
    outsidePressEvent: "mousedown",
    enabled: placingId === null,
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!isOpen) return null;

  async function handlePlace(slotId: number, lessonId: number, lessonNum: number, dateStr: string) {
    setPlacingId(lessonId);
    try {
      await summerAPI.createSession({
        application_id: applicationId,
        slot_id: slotId,
        lesson_id: lessonId,
        mode: "single",
      });
      showToast(
        `Placed in Lesson ${lessonNum} on ${formatShortDate(dateStr)}`,
        "success"
      );
      onPlaced();
      onClose();
    } catch (err) {
      showError(err, "Failed to place student");
    } finally {
      setPlacingId(null);
    }
  }

  function handlePlaceResult(result: SummerFindSlotResult) {
    handlePlace(result.slot_id, result.lesson_id, result.lesson_number, result.date);
  }

  const fillPercent = (current: number, max: number) =>
    max > 0 ? Math.round((current / max) * 100) : 0;

  const showCalendar = openDays && courseStartDate && courseEndDate;

  return (
    <FloatingPortal>
      <FloatingOverlay
        className="z-[10000] bg-black/50 flex items-center justify-center p-4"
        lockScroll
      >
        <FloatingFocusManager context={context}>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className={cn(
              "bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl border-2 border-[#e8d4b8] dark:border-[#6b5a4a] flex flex-col",
              showCalendar ? "w-full max-w-2xl max-h-[85vh]" : "w-full max-w-md max-h-[80vh]"
            )}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">
                  Find Lesson {lessonNumber}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {studentName} · {grade}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {/* Section 1: Suggested matches */}
              <div className="p-4">
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Suggested Matches
                </h4>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : error ? (
                  <div className="text-center py-4 text-xs text-red-500">
                    Failed to load.
                  </div>
                ) : !results || results.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    No exact matches found — try the calendar below
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {results.map((result) => {
                      const pct = fillPercent(result.current_count, result.max_students);
                      const isFull = result.current_count >= result.max_students;
                      const isPlacing = placingId === result.lesson_id;

                      return (
                        <div
                          key={result.lesson_id}
                          className={cn(
                            "rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-3 py-2 transition-colors flex items-center gap-3",
                            isFull ? "opacity-50" : "hover:border-primary/50"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-xs font-medium">
                              {result.lesson_match ? (
                                <Check className="h-3 w-3 text-green-500 shrink-0" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                              )}
                              <span>{formatShortDate(result.date)}</span>
                              <span className="text-muted-foreground">{result.time_slot}</span>
                              <span className={cn(
                                "text-[10px] font-bold px-1 rounded",
                                result.lesson_match
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              )}>
                                L{result.lesson_number}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {result.tutor_name && (
                                <span className="text-[10px] text-muted-foreground">{result.tutor_name}</span>
                              )}
                              <div className="flex-1 h-1 bg-[#e8d4b8]/30 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", pct >= 100 ? "bg-red-400" : pct >= 75 ? "bg-yellow-400" : "bg-green-400")}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground">{result.current_count}/{result.max_students}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handlePlaceResult(result)}
                            disabled={isFull || placingId !== null}
                            className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          >
                            {isPlacing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Place"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Mini calendar picker */}
              {showCalendar && (
                <div className="px-4 pb-4">
                  {/* Divider */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-px bg-[#e8d4b8]/50 dark:bg-[#6b5a4a]/50" />
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Or pick manually</span>
                    <div className="flex-1 h-px bg-[#e8d4b8]/50 dark:bg-[#6b5a4a]/50" />
                  </div>

                  {/* Week nav */}
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <button
                      onClick={() => {
                        const d = new Date(calWeekStart + "T00:00:00");
                        d.setDate(d.getDate() - 7);
                        setCalWeekStart(toDateString(d));
                      }}
                      disabled={!canGoPrev}
                      className="p-0.5 rounded hover:bg-[#e8d4b8]/30 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] font-medium min-w-[130px] text-center">
                      {formatWeekLabel(
                        weekDates[0] || calWeekStart,
                        weekDates[weekDates.length - 1] || calWeekStart,
                        courseStartDate!
                      )}
                    </span>
                    <button
                      onClick={() => {
                        const d = new Date(calWeekStart + "T00:00:00");
                        d.setDate(d.getDate() + 7);
                        setCalWeekStart(toDateString(d));
                      }}
                      disabled={!canGoNext}
                      className="p-0.5 rounded hover:bg-[#e8d4b8]/30 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Grid */}
                  <div
                    className="border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 rounded-lg overflow-hidden"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `50px repeat(${weekDates.length}, 1fr)`,
                      gap: "1px",
                      background: "rgb(232 212 184 / 0.3)",
                    }}
                  >
                    {/* Header corner */}
                    <div className="bg-[#fef9f3] dark:bg-[#2d2618]" />

                    {/* Day headers */}
                    {weekDates.map((dateStr) => {
                      const d = new Date(dateStr + "T00:00:00");
                      const dayName = DAY_NAME_FROM_NUM[d.getDay()];
                      return (
                        <div
                          key={dateStr}
                          className="bg-[#fef9f3] dark:bg-[#2d2618] text-center py-1"
                        >
                          <div className="text-[10px] font-medium text-muted-foreground">{DAY_ABBREV[dayName]}</div>
                          <div className="text-[9px] text-muted-foreground">{formatCompactDate(dateStr)}</div>
                        </div>
                      );
                    })}

                    {/* Time slot rows */}
                    {calTimeSlots.map((ts) => (
                      <React.Fragment key={ts}>
                        {/* Time label */}
                        <div
                          className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-center justify-center text-[9px] text-muted-foreground font-medium px-0.5"
                        >
                          {ts.split(" - ")[0]}
                        </div>

                        {/* Cells */}
                        {weekDates.map((dateStr) => {
                          const key = `${dateStr}|${ts}`;
                          const lesson = lessonIndex.get(key);

                          if (!lesson) {
                            return (
                              <div key={key} className="bg-white dark:bg-[#1a1a1a] min-h-[32px]" />
                            );
                          }

                          const count = lesson.sessions.length;
                          const isFull = count >= lesson.max_students;
                          const isMatch = lesson.lesson_number === lessonNumber;
                          const isPlacing = placingId === lesson.lesson_id;

                          return (
                            <button
                              key={key}
                              onClick={() => !isFull && !placingId && handlePlace(lesson.slot_id, lesson.lesson_id, lesson.lesson_number, lesson.date)}
                              disabled={isFull || placingId !== null}
                              className={cn(
                                "min-h-[32px] flex flex-col items-center justify-center text-[10px] transition-colors",
                                isFull
                                  ? "bg-gray-100 dark:bg-gray-800 opacity-40 cursor-not-allowed"
                                  : isMatch
                                    ? "bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 cursor-pointer"
                                    : "bg-white dark:bg-[#1a1a1a] hover:bg-amber-50 dark:hover:bg-amber-900/10 cursor-pointer"
                              )}
                              title={`${formatShortDate(lesson.date)}, ${ts}, L${lesson.lesson_number} (${count}/${lesson.max_students})${isMatch ? "" : " — mismatch"}`}
                            >
                              <span className={cn(
                                "font-bold",
                                isMatch ? "text-green-700 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                              )}>
                                L{lesson.lesson_number}
                              </span>
                              <span className="text-[8px] text-muted-foreground">
                                {count}/{lesson.max_students}
                              </span>
                              {isPlacing && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            </button>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>

                  <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded bg-green-200 dark:bg-green-800 border border-green-400" /> match
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-400" /> mismatch
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded bg-gray-200 dark:bg-gray-700 border border-gray-400" /> full
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-[#e8d4b8] dark:border-[#6b5a4a] flex justify-end">
              <button
                onClick={onClose}
                disabled={placingId !== null}
                className="px-3 py-1.5 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
