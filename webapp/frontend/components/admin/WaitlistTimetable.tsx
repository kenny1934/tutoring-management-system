"use client";

import { useState, useMemo, useEffect } from "react";
import { useAllStudents } from "@/lib/hooks";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { getGradeColor, DAY_NAMES, DAY_NAME_TO_INDEX, getTimeSlotsForDay, ALL_TIME_SLOTS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Users, AlertCircle } from "lucide-react";
import { BRANCH_COLORS } from "@/components/summer/prospect-badges";
import type { Enrollment, WaitlistEntry } from "@/types";

interface SlotChangeHighlight {
  currentDay?: string | null;
  currentTime?: string | null;
  currentLocation?: string | null;
  preferredSlots: { day?: string | null; time?: string | null; location?: string | null }[];
}

interface WaitlistTimetableProps {
  location: string;
  waitlistEntries: WaitlistEntry[];
  onEntryClick?: (entry: WaitlistEntry) => void;
  onEnrollmentClick?: (enrollmentId: number, event: React.MouseEvent) => void;
  highlight?: SlotChangeHighlight | null;
  gradeFilter?: string;
}

interface TutorSlot {
  tutorId: number;
  tutorName: string;
  location: string;
  enrollments: Enrollment[];
  waitlistCount: number;
  waitlistEntries: WaitlistEntry[];
}

interface GradeGroup {
  key: string; // e.g. "F2E"
  count: number;
}

interface SchoolGroup {
  school: string;
  count: number;
}

const MAX_CAPACITY = 8;
const DAYS = DAY_NAMES; // Sun-Sat

function normalizeTimeSlot(time: string): string {
  return time.replace(/\s/g, "");
}

function getGradeGroups(items: { grade?: string | null; lang_stream?: string | null }[]): GradeGroup[] {
  const map = new Map<string, number>();
  for (const e of items) {
    const key = `${e.grade || "?"}${e.lang_stream || ""}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function getSchoolGroups(enrollments: Enrollment[]): SchoolGroup[] {
  const map = new Map<string, number>();
  for (const e of enrollments) {
    const school = e.school || "Unknown";
    map.set(school, (map.get(school) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([school, count]) => ({ school, count }))
    .sort((a, b) => b.count - a.count);
}

const LOCATION_ORDER: Record<string, number> = { MSA: 0, MSB: 1 };

function sortTutorSlots(slots: TutorSlot[]): TutorSlot[] {
  return [...slots].sort((a, b) => {
    // Waitlist placeholder cards sort after real tutor cards
    if (a.tutorId === -1 && b.tutorId !== -1) return 1;
    if (a.tutorId !== -1 && b.tutorId === -1) return -1;
    const locA = LOCATION_ORDER[a.location] ?? 99;
    const locB = LOCATION_ORDER[b.location] ?? 99;
    if (locA !== locB) return locA - locB;
    return getTutorSortName(a.tutorName).localeCompare(getTutorSortName(b.tutorName));
  });
}

export function WaitlistTimetable({
  location,
  waitlistEntries,
  onEntryClick,
  onEnrollmentClick,
  highlight,
  gradeFilter,
}: WaitlistTimetableProps) {
  const { data: enrollments = [], isLoading, error } = useAllStudents(
    location !== "All Locations" ? location : undefined
  );

  // Group enrollments by day + time + tutor
  const slotMap = useMemo(() => {
    const map = new Map<string, TutorSlot[]>();

    for (const enrollment of enrollments) {
      if (!enrollment.assigned_day || !enrollment.assigned_time) continue;
      // Filter by location if specified
      if (location !== "All Locations" && enrollment.location !== location)
        continue;

      const day = enrollment.assigned_day;
      const time = enrollment.assigned_time;
      const key = `${day}|${normalizeTimeSlot(time)}`;
      const tutorId = enrollment.tutor_id || 0;
      const tutorName = enrollment.tutor_name || "Unknown";

      if (!map.has(key)) map.set(key, []);
      const slots = map.get(key)!;

      let tutorSlot = slots.find((s) => s.tutorId === tutorId);
      if (!tutorSlot) {
        tutorSlot = {
          tutorId,
          tutorName,
          location: enrollment.location || "",
          enrollments: [],
          waitlistCount: 0,
          waitlistEntries: [],
        };
        slots.push(tutorSlot);
      }
      tutorSlot.enrollments.push(enrollment);
    }

    // Collect waitlist entries per slot
    // Helper to add a waitlist entry to a slot key
    // Waitlist entries tracked separately per slot+location, then merged after
    const waitlistBySlot = new Map<string, Map<string, WaitlistEntry[]>>();

    const addWaitlistToSlot = (key: string, entry: WaitlistEntry, loc: string) => {
      if (!waitlistBySlot.has(key)) waitlistBySlot.set(key, new Map());
      const locMap = waitlistBySlot.get(key)!;
      if (!locMap.has(loc)) locMap.set(loc, []);
      const entries = locMap.get(loc)!;
      if (!entries.some((w) => w.id === entry.id)) {
        entries.push(entry);
      }
    };

    const filteredWaitlist = gradeFilter
      ? waitlistEntries.filter((e) => e.grade === gradeFilter)
      : waitlistEntries;

    for (const entry of filteredWaitlist) {
      for (const pref of entry.slot_preferences) {
        if (location !== "All Locations" && pref.location !== location)
          continue;

        if (pref.day_of_week && pref.time_slot) {
          // Specific day + time
          addWaitlistToSlot(`${pref.day_of_week}|${normalizeTimeSlot(pref.time_slot)}`, entry, pref.location);
        } else if (pref.day_of_week && !pref.time_slot) {
          // Specific day, any time — add to valid time slots for that day
          const dayIdx = DAY_NAME_TO_INDEX[pref.day_of_week] ?? 1;
          for (const ts of getTimeSlotsForDay(dayIdx)) {
            addWaitlistToSlot(`${pref.day_of_week}|${normalizeTimeSlot(ts)}`, entry, pref.location);
          }
        }
        // Fully open (no day, no time) — skip in timetable, shown in list only
      }
    }

    // Merge waitlist entries into tutor slots — distribute by location
    for (const [key, locMap] of waitlistBySlot) {
      if (!map.has(key)) map.set(key, []);
      const slots = map.get(key)!;

      for (const [loc, entries] of locMap) {
        // Always create a dedicated waitlist card per location — never mix with tutor cards
        slots.push({
          tutorId: -1,
          tutorName: "",
          location: loc,
          enrollments: [],
          waitlistCount: entries.length,
          waitlistEntries: [...entries],
        });
      }
    }

    // Pre-sort all slots by location then tutor name
    for (const [key, slots] of map) {
      map.set(key, sortTutorSlots(slots));
    }

    return map;
  }, [enrollments, waitlistEntries, location, gradeFilter]);

  // Find which time slots actually have data, ordered correctly
  const activeTimeSlots = useMemo(() => {
    const active = new Set<string>();
    for (const key of slotMap.keys()) {
      const time = key.split("|")[1];
      active.add(time);
    }
    return ALL_TIME_SLOTS.filter((t) => active.has(normalizeTimeSlot(t)));
  }, [slotMap]);

  // Valid time slots per day (for skipping invalid cells)
  const validSlotsForDay = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const day of DAYS) {
      const dayIdx = DAY_NAME_TO_INDEX[day] ?? 1;
      const slots = getTimeSlotsForDay(dayIdx);
      map.set(day, new Set(slots.map(normalizeTimeSlot)));
    }
    return map;
  }, []);

  // Aggregate stats per day and per time slot
  const dayStats = useMemo(() => {
    const stats = new Map<string, { enrolled: number; waiting: number }>();
    for (const day of DAYS) stats.set(day, { enrolled: 0, waiting: 0 });
    for (const [key, slots] of slotMap) {
      const day = key.split("|")[0];
      const s = stats.get(day);
      if (!s) continue;
      for (const slot of slots) {
        s.enrolled += slot.enrollments.length;
        s.waiting += slot.waitlistCount;
      }
    }
    return stats;
  }, [slotMap]);

  const timeStats = useMemo(() => {
    const stats = new Map<string, number>();
    for (const [key, slots] of slotMap) {
      const time = key.split("|")[1];
      const waiting = slots.reduce((sum, s) => sum + s.waitlistCount, 0);
      stats.set(time, (stats.get(time) || 0) + waiting);
    }
    return stats;
  }, [slotMap]);

  // Cell-level occupancy for heat tinting
  const cellOccupancy = useMemo(() => {
    const occ = new Map<string, number>();
    for (const [key, slots] of slotMap) {
      const tutorSlots = slots.filter((s) => s.tutorId !== -1);
      if (tutorSlots.length === 0) { occ.set(key, 0); continue; }
      const maxPct = Math.max(...tutorSlots.map((s) => s.enrollments.length / MAX_CAPACITY));
      occ.set(key, maxPct);
    }
    return occ;
  }, [slotMap]);

  // Day filter state
  const [visibleDays, setVisibleDays] = useState<Set<string>>(new Set(DAYS));
  const allDaysVisible = visibleDays.size === DAYS.length;

  // Auto-narrow when highlight changes; reset only when clearing an active highlight
  useEffect(() => {
    if (highlight) {
      const relevantDays = new Set<string>();
      if (highlight.currentDay) relevantDays.add(highlight.currentDay);
      for (const s of highlight.preferredSlots) {
        if (s.day) relevantDays.add(s.day);
      }
      if (relevantDays.size > 0) setVisibleDays(relevantDays);
    } else {
      setVisibleDays((prev) =>
        prev.size === DAYS.length ? prev : new Set(DAYS)
      );
    }
  }, [highlight]);

  const toggleDay = (day: string) => {
    setVisibleDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        if (next.size > 1) next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-foreground/40">
        <div className="animate-spin h-6 w-6 border-2 border-[#a0704b] border-t-transparent rounded-full mr-3" />
        Loading timetable...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-500 dark:text-red-400">
        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm font-medium">Failed to load enrollment data</p>
        <p className="text-xs text-foreground/40 mt-1">Try refreshing the page</p>
      </div>
    );
  }

  if (activeTimeSlots.length === 0) {
    return (
      <div className="text-center py-12 text-foreground/40">
        <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No scheduled classes</p>
        <p className="text-sm mt-1">
          No enrollments found for {location === "All Locations" ? "any location" : location}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
      {/* Day filter chips */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[#faf8f5] dark:bg-[#1a1a1a] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
        <span className="text-[9px] text-foreground/40 mr-1">Days:</span>
        {DAYS.map((day) => {
          const ds = dayStats.get(day);
          const hasData = ds && (ds.enrolled > 0 || ds.waiting > 0);
          return (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                visibleDays.has(day)
                  ? hasData
                    ? "bg-[#a0704b] text-white"
                    : "bg-gray-300 dark:bg-gray-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-foreground/40 hover:text-foreground/60"
              )}
            >
              {day}
            </button>
          );
        })}
        {!allDaysVisible && (
          <button
            onClick={() => setVisibleDays(new Set(DAYS))}
            className="text-[9px] text-[#a0704b] hover:underline ml-1"
          >
            All
          </button>
        )}
      </div>
      <div className="overflow-auto max-h-[65vh] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#d4a574]/40">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#faf8f5] dark:bg-[#1a1a1a] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <th className="text-left py-2 px-2 text-xs font-medium text-foreground/50 w-28 sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a] z-30">
                Time
              </th>
              {DAYS.filter((d) => visibleDays.has(d)).map((day) => {
                const ds = dayStats.get(day);
                return (
                  <th
                    key={day}
                    className="text-center py-1.5 px-2 text-xs font-medium text-foreground/50 min-w-[130px] lg:min-w-[160px]"
                  >
                    <div>{day}</div>
                    {ds && (ds.enrolled > 0 || ds.waiting > 0) && (
                      <div className="text-[8px] font-normal mt-0.5">
                        <span className="text-foreground/40">{ds.enrolled}</span>
                        {ds.waiting > 0 && (
                          <span className="text-orange-500 ml-1">+{ds.waiting}w</span>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
        <tbody>
          {activeTimeSlots.map((timeSlot) => (
            <tr
              key={timeSlot}
              className="border-t border-gray-200 dark:border-gray-700"
            >
              <td className="py-2 px-2 text-xs font-mono text-foreground/50 align-top sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a] z-10 border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div>{timeSlot}</div>
                {(() => {
                  const tw = timeStats.get(normalizeTimeSlot(timeSlot)) || 0;
                  return tw > 0 ? (
                    <div className="text-[8px] text-orange-500 font-sans mt-0.5">{tw} waiting</div>
                  ) : null;
                })()}
              </td>
              {DAYS.filter((d) => visibleDays.has(d)).map((day) => {
                const normalizedTime = normalizeTimeSlot(timeSlot);
                const isValidForDay = validSlotsForDay.get(day)?.has(normalizedTime) ?? false;

                if (!isValidForDay) {
                  return (
                    <td key={day} className="py-1 px-1 align-top">
                      <div className="h-8 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.03)_4px,rgba(0,0,0,0.03)_8px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.03)_4px,rgba(255,255,255,0.03)_8px)] rounded" />
                    </td>
                  );
                }

                const key = `${day}|${normalizedTime}`;
                const tutorSlots = slotMap.get(key) || [];
                const occ = cellOccupancy.get(key) ?? 0;
                const heatClass = occ >= 1 ? "bg-red-50/60 dark:bg-red-950/20"
                  : occ >= 0.75 ? "bg-orange-50/50 dark:bg-orange-950/15"
                  : occ >= 0.5 ? "bg-amber-50/40 dark:bg-amber-950/10"
                  : "";

                return (
                  <td
                    key={day}
                    className={cn("py-1 px-1 align-top", heatClass)}
                  >
                    {tutorSlots.length > 0 ? (
                      <div className="space-y-1">
                        {tutorSlots.map((slot) => {
                          // Per-card highlight based on location + day + time
                          let cardHighlight: "current" | "preferred" | "dimmed" | null = null;
                          if (highlight) {
                            const isCurrent = highlight.currentDay === day
                              && highlight.currentTime && normalizeTimeSlot(highlight.currentTime) === normalizedTime
                              && highlight.currentLocation === slot.location;
                            const isPreferred = highlight.preferredSlots.some(
                              (s) => s.day === day
                                && (!s.time || normalizeTimeSlot(s.time) === normalizedTime)
                                && s.location === slot.location
                            );
                            cardHighlight = isCurrent ? "current" : isPreferred ? "preferred" : "dimmed";
                          }
                          return (
                            <TutorCard
                              key={slot.tutorId === -1 ? `wait-${slot.location}` : slot.tutorId}
                              slot={slot}
                              onEntryClick={onEntryClick}
                              onEnrollmentClick={onEnrollmentClick}
                              highlight={cardHighlight}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-8 flex items-center justify-center">
                        <span className="text-[8px] text-foreground/15 select-none">No classes</span>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================
// Tutor Card (collapsed/expanded)
// ============================================

function TutorCard({ slot, onEntryClick, onEnrollmentClick, highlight }: {
  slot: TutorSlot;
  onEntryClick?: (entry: WaitlistEntry) => void;
  onEnrollmentClick?: (enrollmentId: number, event: React.MouseEvent) => void;
  highlight?: "current" | "preferred" | "dimmed" | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = slot.enrollments.length;
  const gradeGroups = useMemo(() => getGradeGroups(slot.enrollments), [slot.enrollments]);
  const schoolGroups = useMemo(() => getSchoolGroups(slot.enrollments), [slot.enrollments]);
  const schoolCount = schoolGroups.length;

  // Waitlist-only card (no tutor, no enrollments) — collapsible
  const waitGradeGroups = useMemo(() => getGradeGroups(slot.waitlistEntries), [slot.waitlistEntries]);

  if (slot.tutorId === -1) {

    return (
      <div
        className={cn(
          "rounded-lg border border-dashed text-xs cursor-pointer",
          "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10",
          highlight === "preferred" && "border-2 border-dashed border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/10",
          highlight === "dimmed" && "opacity-40",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="px-2 py-1.5">
          {/* Header — always visible */}
          <div className="flex items-center gap-1">
            {slot.location && (
              <span className={cn("text-[8px] font-medium px-1 rounded flex-shrink-0", BRANCH_COLORS[slot.location]?.badge || "bg-gray-200 text-foreground/50")}>
                {slot.location}
              </span>
            )}
            <span className="text-[8px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-medium">
              {slot.waitlistEntries.length}w
            </span>
            {/* Grade summary (collapsed) */}
            {!expanded && (
              <div className="flex gap-0.5 ml-0.5">
                {waitGradeGroups.slice(0, 3).map((g) => (
                  <span
                    key={g.key}
                    className="px-0.5 rounded text-[8px] font-medium text-gray-800"
                    style={{ backgroundColor: getGradeColor(g.key.replace(/[CE]$/, ""), g.key.match(/[CE]$/)?.[0]) }}
                  >
                    {g.key}&times;{g.count}
                  </span>
                ))}
              </div>
            )}
            <span className="ml-auto">
              {expanded ? <ChevronUp className="h-2.5 w-2.5 text-orange-400" /> : <ChevronDown className="h-2.5 w-2.5 text-orange-400" />}
            </span>
          </div>
          {/* Expanded: student list */}
          {expanded && (
            <div className="mt-1 space-y-0.5">
              {slot.waitlistEntries.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-orange-100/50 dark:hover:bg-orange-900/20 rounded transition-colors"
                  onClick={(e) => { e.stopPropagation(); onEntryClick?.(w); }}
                >
                  <span
                    className="px-1 py-px rounded text-[9px] font-medium text-gray-800 flex-shrink-0"
                    style={{ backgroundColor: getGradeColor(w.grade, w.lang_stream || undefined) }}
                  >
                    {w.grade}{w.lang_stream}
                  </span>
                  {w.school_student_id && (
                    <span className="text-[8px] text-foreground/30 font-mono flex-shrink-0">{w.school_student_id}</span>
                  )}
                  <span className="truncate text-foreground/60 text-[9px]">{w.student_name}</span>
                  {w.school && (
                    <span className="text-[8px] text-foreground/30 flex-shrink-0">{w.school}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const capacityPct = count / MAX_CAPACITY;
  const capacityColor =
    capacityPct >= 1
      ? "text-red-600 dark:text-red-400"
      : capacityPct >= 0.75
        ? "text-amber-600 dark:text-amber-400"
        : "text-green-600 dark:text-green-400";

  return (
    <div
      className={cn(
        "rounded-lg border text-xs transition-all duration-200 cursor-pointer",
        expanded
          ? "bg-white dark:bg-[#252525] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
          : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-[#d4a574] dark:hover:border-[#8b6f47]",
        highlight === "current" && "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50 dark:bg-blue-900/20",
        highlight === "preferred" && "border-2 border-dashed border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/10",
        highlight === "dimmed" && "opacity-40",
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {highlight === "current" && (
        <div className="text-[8px] font-medium uppercase tracking-wider text-center text-blue-600 dark:text-blue-400 pt-0.5">
          Current
        </div>
      )}
      {highlight === "preferred" && (
        <div className="text-[8px] font-medium uppercase tracking-wider text-center text-amber-600 dark:text-amber-400 pt-0.5">
          Preferred
        </div>
      )}
      {/* Collapsed header */}
      <div className="px-2 py-1.5 flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {slot.location && (
              <span className={cn("text-[8px] font-medium px-1 rounded flex-shrink-0", BRANCH_COLORS[slot.location]?.badge || "bg-gray-200 dark:bg-gray-700 text-foreground/50")}>
                {slot.location}
              </span>
            )}
            <span className="font-medium text-foreground truncate">
              {slot.tutorName}
            </span>
            <span className={cn("font-mono text-[9px]", capacityColor)}>
              {count}/{MAX_CAPACITY}
            </span>
          </div>
          {/* Capacity bar */}
          <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 mt-0.5">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                capacityPct >= 1 ? "bg-red-500" : capacityPct >= 0.75 ? "bg-amber-500" : "bg-green-500"
              )}
              style={{ width: `${Math.min(capacityPct * 100, 100)}%` }}
            />
          </div>
          {/* Grade composition */}
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {gradeGroups.map((g) => (
              <span
                key={g.key}
                className="px-1 py-px rounded text-[9px] font-medium text-gray-800"
                style={{
                  backgroundColor: getGradeColor(
                    g.key.replace(/[CE]$/, ""),
                    g.key.match(/[CE]$/)?.[0]
                  ),
                }}
              >
                {g.key}&times;{g.count}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {schoolCount >= 3 && (
            <span
              className={cn(
                "text-[7px] px-1 rounded font-medium",
                schoolCount >= 4 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "bg-gray-100 dark:bg-gray-800 text-foreground/40"
              )}
              title={schoolGroups.map((s) => `${s.school}(${s.count})`).join(", ")}
            >
              {schoolCount}sch
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-foreground/40" />
          ) : (
            <ChevronDown className="h-3 w-3 text-foreground/40" />
          )}
        </div>
      </div>

      {/* Expanded: student list */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-1.5 space-y-0.5">
          {/* School diversity hint */}
          {schoolCount >= 3 && (
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] mb-1",
                schoolCount >= 4
                  ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                  : "bg-gray-100 dark:bg-gray-800 text-foreground/50"
              )}
            >
              <AlertCircle className="h-3 w-3" />
              {schoolCount} school{schoolCount !== 1 ? "s" : ""}: {schoolGroups.map((s) => `${s.school}(${s.count})`).join(", ")}
            </div>
          )}

          {slot.enrollments.map((e) => (
            <div
              key={e.id}
              className={cn("flex items-center gap-1.5 py-0.5", onEnrollmentClick && "cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/20 rounded transition-colors")}
              onClick={onEnrollmentClick ? (ev) => { ev.stopPropagation(); onEnrollmentClick(e.id, ev); } : undefined}
            >
              <span
                className="px-1 py-px rounded text-[9px] font-medium text-gray-800 flex-shrink-0"
                style={{
                  backgroundColor: getGradeColor(
                    e.grade,
                    e.lang_stream || undefined
                  ),
                }}
              >
                {e.grade}
                {e.lang_stream}
              </span>
              {e.school_student_id && (
                <span className="text-[8px] text-foreground/30 font-mono flex-shrink-0">{e.school_student_id}</span>
              )}
              <span className="truncate text-foreground/80">
                {e.student_name}
              </span>
              {e.school && (
                <span className="text-[9px] text-foreground/40 flex-shrink-0">
                  {e.school}
                </span>
              )}
            </div>
          ))}
          {slot.enrollments.length === 0 && (
            <div className="text-[9px] text-foreground/40 italic">
              No current students
            </div>
          )}
        </div>
      )}
    </div>
  );
}
