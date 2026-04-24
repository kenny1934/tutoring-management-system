"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarPlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_ABBREV, compareSummerSlots } from "@/lib/summer-utils";
import {
  getWeekStartStr,
  getWeekDateStrings,
  toDateString,
} from "@/lib/calendar-utils";
import useSWR, { useSWRConfig } from "swr";
import { summerAPI } from "@/lib/api";
import { SummerLessonCard } from "@/components/admin/SummerLessonCard";
import { CreateMakeupSlotModal } from "@/components/admin/CreateMakeupSlotModal";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { useSession } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import type { SummerLessonUpdate, SummerLessonCalendarEntry } from "@/types";

interface SummerSessionCalendarProps {
  configId: number;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  openDays: string[];
  timeSlots: string[];
  /** Upper bound for the lesson-number UIs, sourced from config.total_lessons. */
  totalLessons?: number;
  onDropStudent?: (
    applicationId: number,
    slotId: number,
    lessonId: number,
    lessonNumber?: number | null,
  ) => void;
  onRemoveSession?: (sessionId: number, studentName?: string) => void;
  onClickStudent?: (applicationId: number) => void;
  dragPrefs?: {
    primary: { day: string; time: string }[];
    backup: { day: string; time: string }[];
  } | null;
  /** When set externally (e.g. from student table click), jump to this week.
   * `highlightSessionId` opt-in briefly rings the card containing that
   * SummerSession after the jump lands and auto-expands it so the matching
   * student row is visible. */
  navigateToWeek?: {
    date: string;
    seq: number;
    highlightSessionId?: number | null;
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
  totalLessons = 8,
  onDropStudent,
  onRemoveSession,
  onClickStudent,
  dragPrefs,
  navigateToWeek,
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

  // External navigation (e.g. from student table click)
  useEffect(() => {
    if (navigateToWeek) setWeekStart(getWeekStartStr(navigateToWeek.date));
  }, [navigateToWeek]);

  // Day-visibility toggle: persists across week nav, resets when the set of
  // open days changes (e.g. location switch). openDays is a fresh array on
  // every parent render, so key the effect off a stable joined string to
  // avoid clobbering the user's selection on unrelated re-renders.
  const openDaysKey = openDays.join("|");
  const [visibleDays, setVisibleDays] = useState<Set<string>>(
    () => new Set(openDays)
  );
  useEffect(() => {
    setVisibleDays(new Set(openDaysKey ? openDaysKey.split("|") : []));
  }, [openDaysKey]);

  const toggleDay = useCallback((day: string) => {
    setVisibleDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        if (next.size > 1) next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  // Compute dates for this week, filtered to openDays ∩ visibleDays
  const weekDates = useMemo(() => {
    const all = getWeekDateStrings(weekStart);
    return all.filter((dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      const dayName = DAY_NAME_FROM_NUM[d.getDay()];
      return openDays.includes(dayName) && visibleDays.has(dayName);
    });
  }, [weekStart, openDays, visibleDays]);

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

  // Index lessons by "date|timeSlot", with each group sorted by
  // (grade, course_type, tutor first name, slot_id) so the calendar grid
  // mirrors the arrangement grid's visual order.
  const lessonIndex = useMemo(() => {
    const m = new Map<string, SummerLessonCalendarEntry[]>();
    for (const l of lessons) {
      const key = `${l.date}|${l.time_slot}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(l);
    }
    for (const group of m.values()) {
      group.sort(compareSummerSlots);
    }
    return m;
  }, [lessons]);

  // Merge in any lesson times that fall outside the configured timeSlots
  // (typically ad-hoc Make-up Slots at non-standard times). Extension rows
  // get a subtle italic marker so admins know they're not regular slot rows.
  const configuredTimeSet = useMemo(() => new Set(timeSlots), [timeSlots]);
  const effectiveTimeSlots = useMemo(() => {
    const extras = new Set<string>();
    for (const l of lessons) {
      if (!configuredTimeSet.has(l.time_slot)) extras.add(l.time_slot);
    }
    if (extras.size === 0) return timeSlots;
    return [...timeSlots, ...extras].sort();
  }, [timeSlots, lessons, configuredTimeSet]);

  // null = closed; object = open (with optional prefill from an empty cell).
  const [makeupModal, setMakeupModal] = useState<
    { date?: string; time?: string } | null
  >(null);
  const handleCreated = () => {
    globalMutate((key) => Array.isArray(key) && key[0] === "summer-calendar");
  };

  // Session-detail popover for post-publish rows. The card hands up the
  // session_log id + click point so this parent can own the portal lifecycle
  // and fetch the Session the popover expects as a prop.
  const [sessionPopover, setSessionPopover] = useState<
    { id: number; position: { x: number; y: number } } | null
  >(null);
  const { data: popoverSession, isLoading: popoverLoading } = useSession(
    sessionPopover?.id ?? null,
  );
  const handleOpenSessionPopover = useCallback(
    (id: number, position: { x: number; y: number }) => {
      setSessionPopover({ id, position });
    },
    [],
  );

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
  // Show skeleton only on the very first load (no cached data yet). Once
  // we have any data, keepPreviousData (global SWR default) shows the
  // previous week while revalidating, so week-nav doesn't blank.
  const showSkeleton = !calendarData && isLoading;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Week navigation + day toggles + Make-up Slot create */}
      <div className="flex items-center gap-3 py-2 flex-wrap">
        <div className="flex items-center gap-1">
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

        {/* Day filter chips — subset of openDays */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground mr-0.5">Days:</span>
          {openDays.map((day) => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                visibleDays.has(day)
                  ? "bg-[#a0704b] text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-foreground/40 hover:text-foreground/60"
              )}
              title={visibleDays.has(day) ? `Hide ${day}` : `Show ${day}`}
            >
              {DAY_ABBREV[day] || day}
            </button>
          ))}
          {visibleDays.size !== openDays.length && (
            <button
              onClick={() => setVisibleDays(new Set(openDays))}
              className="text-[10px] text-[#a0704b] hover:underline ml-0.5"
            >
              All
            </button>
          )}
        </div>

        <button
          onClick={() => setMakeupModal({})}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-amber-400/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
          title="Create a one-off Make-up Slot"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          Make-up Slot
        </button>
      </div>

      {/* Grid (always rendered so the + affordance works on empty weeks) */}
      <div className="flex-1 min-h-0 overflow-auto rounded-lg border-2 border-[#e8d4b8] dark:border-[#6b5a4a]">
      <div
        className="gap-px bg-[#e8d4b8]/40 dark:bg-[#6b5a4a]/40"
        style={{
          display: "grid",
          gridTemplateColumns: `auto repeat(${weekDates.length}, minmax(110px, 1fr))`,
          gridTemplateRows: `36px repeat(${effectiveTimeSlots.length}, auto)`,
          minWidth: `${64 + weekDates.length * 110}px`,
        }}
      >
          {/* Top-left corner */}
          <div className="bg-[#fef9f3] dark:bg-[#2d2618] sticky left-0 top-0 z-20 flex items-center justify-center px-1 text-xs font-medium text-muted-foreground">
            Time
          </div>

          {/* Day headers */}
          {weekDates.map((dateStr) => {
            const d = new Date(dateStr + "T00:00:00");
            const dayName = DAY_NAME_FROM_NUM[d.getDay()];
            return (
              <div
                key={dateStr}
                className="bg-[#fef9f3] dark:bg-[#2d2618] sticky top-0 z-10 flex flex-col items-center justify-center text-xs font-medium text-muted-foreground"
              >
                <span>{DAY_ABBREV[dayName] || dayName}</span>
                <span className="text-[10px]">{formatColumnDate(dateStr)}</span>
              </div>
            );
          })}

          {/* Time slot rows */}
          {effectiveTimeSlots.map((ts) => {
            const isExtensionRow = !configuredTimeSet.has(ts);
            return (
              <React.Fragment key={ts}>
                {/* Time label */}
                <div
                  className={cn(
                    "bg-[#fef9f3] dark:bg-[#2d2618] flex items-start justify-center pt-1 px-1 text-[10px] text-muted-foreground font-medium sticky left-0 z-10",
                    isExtensionRow && "italic text-amber-700/80 dark:text-amber-300/80",
                  )}
                  title={isExtensionRow ? "Ad-hoc time — outside regular slots" : undefined}
                >
                  {ts}
                </div>

                {/* Cells */}
                {weekDates.map((dateStr) => {
                  const key = `${dateStr}|${ts}`;
                  if (showSkeleton) {
                    return (
                      <div
                        key={key}
                        className="bg-white dark:bg-[#1a1a1a] p-0.5 min-h-[60px]"
                        aria-hidden
                      >
                        <div className="h-full w-full rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                      </div>
                    );
                  }
                  const cellLessons = lessonIndex.get(key) ?? [];
                  const pref = isPrefCell(dateStr, ts);
                  const isEmptyCell = cellLessons.length === 0;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "group relative bg-white dark:bg-[#1a1a1a] p-0.5 min-h-[60px] space-y-0.5",
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
                          onOpenSessionPopover={handleOpenSessionPopover}
                          onDeleted={handleCreated}
                          totalLessons={totalLessons}
                          highlightTarget={
                            navigateToWeek?.highlightSessionId
                              ? {
                                  sessionId: navigateToWeek.highlightSessionId,
                                  seq: navigateToWeek.seq,
                                }
                              : null
                          }
                        />
                      ))}
                      {isEmptyCell && (
                        <button
                          onClick={() => setMakeupModal({ date: dateStr, time: ts })}
                          className="absolute inset-0 flex items-center justify-center text-[10px] text-amber-700/70 dark:text-amber-300/70 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-amber-50/50 dark:hover:bg-amber-900/10"
                          title="Add a Make-up Slot at this time"
                        >
                          <Plus className="h-3.5 w-3.5 mr-0.5" />
                          Make-up
                        </button>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {isEmpty && (
        <p className="mt-2 text-xs text-muted-foreground text-center">
          No lessons this week. Hover an empty cell to add a Make-up Slot.
        </p>
      )}

      <CreateMakeupSlotModal
        isOpen={makeupModal != null}
        onClose={() => setMakeupModal(null)}
        onCreated={handleCreated}
        configId={configId}
        location={location}
        courseStartDate={courseStartDate}
        courseEndDate={courseEndDate}
        initialDate={makeupModal?.date}
        initialTime={makeupModal?.time}
      />

      {sessionPopover && (
        <SessionDetailPopover
          session={popoverSession ?? null}
          isOpen
          isLoading={popoverLoading}
          onClose={() => setSessionPopover(null)}
          clickPosition={sessionPopover.position}
        />
      )}
    </div>
  );
}
