"use client";

import React, { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_ABBREV } from "@/lib/summer-utils";
import {
  getWeekStartStr,
  getWeekDateStrings,
  toDateString,
} from "@/lib/calendar-utils";
import useSWR, { useSWRConfig } from "swr";
import { summerAPI } from "@/lib/api";
import { SummerLessonCard } from "@/components/admin/SummerLessonCard";
import { useToast } from "@/contexts/ToastContext";
import type { SummerLessonUpdate, SummerLessonCalendarEntry } from "@/types";

interface SummerSessionCalendarProps {
  configId: number;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  openDays: string[];
  timeSlots: string[];
  onDropStudent?: (applicationId: number, slotId: number, lessonId: number) => void;
  onRemoveSession?: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
  dragPrefs?: {
    primary: { day: string; time: string }[];
    backup: { day: string; time: string }[];
  } | null;
}

const DAY_NAME_FROM_NUM: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

function formatColumnDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRange(start: string, end: string, courseStart: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const cs = new Date(courseStart + "T00:00:00");
  const weekNum = Math.floor((s.getTime() - cs.getTime()) / (7 * 86400000)) + 1;
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  const range = sMonth === eMonth
    ? `${sMonth} ${s.getDate()} – ${e.getDate()}`
    : `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}`;
  return `Week ${weekNum}: ${range}`;
}

export function SummerSessionCalendar({
  configId,
  location,
  courseStartDate,
  courseEndDate,
  openDays,
  timeSlots,
  onDropStudent,
  onRemoveSession,
  onClickStudent,
  dragPrefs,
}: SummerSessionCalendarProps) {
  const { showToast } = useToast();
  const { mutate: globalMutate } = useSWRConfig();

  // Week navigation state — start from the first weekday on or after courseStartDate
  const initialWeek = useMemo(() => {
    const d = new Date(courseStartDate + "T00:00:00");
    // If courseStartDate is a weekend, advance to next Monday's week
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
    else if (d.getDay() === 6) d.setDate(d.getDate() + 2); // Saturday → Monday
    return getWeekStartStr(toDateString(d));
  }, [courseStartDate]);
  const [weekStart, setWeekStart] = useState(initialWeek);

  // Compute dates for this week, filtered to openDays
  const weekDates = useMemo(() => {
    const all = getWeekDateStrings(weekStart);
    return all.filter((dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      const dayName = DAY_NAME_FROM_NUM[d.getDay()];
      return openDays.includes(dayName);
    });
  }, [weekStart, openDays]);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return toDateString(d);
  }, [weekStart]);

  // Navigation bounds
  const canGoPrev = weekStart > getWeekStartStr(courseStartDate);
  const canGoNext = (() => {
    // Allow navigating as long as the current week end hasn't passed courseEndDate
    const currentEnd = new Date(weekStart + "T00:00:00");
    currentEnd.setDate(currentEnd.getDate() + 6);
    return toDateString(currentEnd) < courseEndDate;
  })();

  const goPrev = () => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() - 7);
    setWeekStart(toDateString(d));
  };
  const goNext = () => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + 7);
    setWeekStart(toDateString(d));
  };

  // Fetch calendar data
  const { data: calendarData, isLoading } = useSWR(
    ["summer-calendar", configId, location, weekStart],
    () => summerAPI.getLessonCalendar(configId, location, weekStart),
    { refreshInterval: 30000 }
  );

  const lessons = calendarData?.lessons ?? [];

  // Index lessons by "date|timeSlot"
  const lessonIndex = useMemo(() => {
    const m = new Map<string, SummerLessonCalendarEntry[]>();
    for (const l of lessons) {
      const key = `${l.date}|${l.time_slot}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    return m;
  }, [lessons]);

  // Update a lesson
  const handleUpdateLesson = useCallback(
    async (lessonId: number, data: SummerLessonUpdate) => {
      try {
        await summerAPI.updateLesson(lessonId, data);
        globalMutate(
          (key) => Array.isArray(key) && key[0] === "summer-calendar"
        );
      } catch (e: any) {
        showToast(e.message || "Failed to update lesson", "error");
      }
    },
    [globalMutate, showToast]
  );

  // Generate lessons
  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await summerAPI.generateLessons(configId, location);
      showToast(
        `Generated ${result.lessons_created} lessons (${result.slots_skipped} slots skipped)`,
        "success"
      );
      globalMutate(
        (key) => Array.isArray(key) && key[0] === "summer-calendar"
      );
    } catch (e: any) {
      showToast(e.message || "Failed to generate", "error");
    } finally {
      setGenerating(false);
    }
  };

  // Drag preference highlighting. Returns "pref1" for primary tier (gold
  // ring), "pref2" for backup tier (orange ring) — single source of truth
  // for the tier split lives in classifyPrefs.
  const isPrefCell = (dateStr: string, timeSlot: string): "pref1" | "pref2" | null => {
    if (!dragPrefs) return null;
    const d = new Date(dateStr + "T00:00:00");
    const dayName = DAY_NAME_FROM_NUM[d.getDay()];
    const matches = (s: { day: string; time: string }) =>
      s.day === dayName && s.time === timeSlot;
    if (dragPrefs.primary.some(matches)) return "pref1";
    if (dragPrefs.backup.some(matches)) return "pref2";
    return null;
  };

  const isEmpty = !isLoading && lessons.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Week navigation */}
      <div className="flex items-center justify-center gap-3 py-2">
        <button
          onClick={goPrev}
          disabled={!canGoPrev}
          className="p-1 rounded hover:bg-[#e8d4b8]/30 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium min-w-[140px] text-center">
          {formatWeekRange(weekDates[0] || weekStart, weekDates[weekDates.length - 1] || weekEnd, courseStartDate)}
        </span>
        <button
          onClick={goNext}
          disabled={!canGoNext}
          className="p-1 rounded hover:bg-[#e8d4b8]/30 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Empty state for this week */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">No lessons this week.</p>
        </div>
      ) : (
      /* Grid */
      <div className="flex-1 overflow-auto">
        <div
          className="gap-px bg-[#e8d4b8]/40 dark:bg-[#6b5a4a]/40 border-2 border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden"
          style={{
            display: "grid",
            gridTemplateColumns: `40px repeat(${weekDates.length}, minmax(110px, 1fr))`,
            gridTemplateRows: `36px repeat(${timeSlots.length}, auto)`,
            minWidth: `${40 + weekDates.length * 110}px`,
          }}
        >
          {/* Top-left corner */}
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] sticky left-0 z-10 flex items-center justify-center text-xs font-medium text-muted-foreground">
            Time
          </div>

          {/* Day headers */}
          {weekDates.map((dateStr) => {
            const d = new Date(dateStr + "T00:00:00");
            const dayName = DAY_NAME_FROM_NUM[d.getDay()];
            return (
              <div
                key={dateStr}
                className="bg-[#fef9f3] dark:bg-[#2d2618] flex flex-col items-center justify-center text-xs font-medium text-muted-foreground"
              >
                <span>{DAY_ABBREV[dayName] || dayName}</span>
                <span className="text-[10px]">{formatColumnDate(dateStr)}</span>
              </div>
            );
          })}

          {/* Time slot rows */}
          {timeSlots.map((ts) => (
            <React.Fragment key={ts}>
              {/* Time label */}
              <div
                className="bg-[#fef9f3] dark:bg-[#2d2618] flex items-start justify-center pt-1 text-[10px] text-muted-foreground font-medium sticky left-0 z-10"
              >
                {ts}
              </div>

              {/* Cells */}
              {weekDates.map((dateStr) => {
                const key = `${dateStr}|${ts}`;
                const cellLessons = lessonIndex.get(key) ?? [];
                const pref = isPrefCell(dateStr, ts);

                return (
                  <div
                    key={key}
                    className={cn(
                      "bg-white dark:bg-[#1a1a1a] p-0.5 min-h-[60px] space-y-0.5",
                      pref === "pref1" && "ring-2 ring-inset ring-primary/40 bg-primary/5",
                      pref === "pref2" && "ring-2 ring-inset ring-orange-400/40 bg-orange-50/50 dark:bg-orange-900/10"
                    )}
                  >
                    {cellLessons.map((l) => (
                      <SummerLessonCard
                        key={l.lesson_id}
                        lesson={l}
                        onUpdateLesson={handleUpdateLesson}
                        onDropStudent={onDropStudent}
                        onRemoveSession={onRemoveSession}
                        onClickStudent={onClickStudent}
                      />
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}
