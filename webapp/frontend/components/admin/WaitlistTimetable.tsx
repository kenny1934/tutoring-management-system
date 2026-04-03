"use client";

import { useState, useMemo } from "react";
import { useAllStudents } from "@/lib/hooks";
import { getTutorSortName } from "@/components/zen/utils/sessionSorting";
import { getGradeColor, DAY_NAMES, DAY_NAME_TO_INDEX, getTimeSlotsForDay, WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS } from "@/lib/constants";
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
  onSlotClick?: (day: string, time: string, tutorId: number) => void;
  onEntryClick?: (entry: WaitlistEntry) => void;
  highlight?: SlotChangeHighlight | null;
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

function getGradeGroups(enrollments: Enrollment[]): GradeGroup[] {
  const map = new Map<string, number>();
  for (const e of enrollments) {
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
  onSlotClick,
  onEntryClick,
  highlight,
}: WaitlistTimetableProps) {
  const { data: enrollments = [], isLoading } = useAllStudents(
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

    for (const entry of waitlistEntries) {
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

    return map;
  }, [enrollments, waitlistEntries, location]);

  // Find which time slots actually have data, ordered correctly
  const activeTimeSlots = useMemo(() => {
    const active = new Set<string>();
    for (const key of slotMap.keys()) {
      const time = key.split("|")[1];
      active.add(time);
    }
    // Canonical order: weekend slots first, then weekday-only slots
    const allOrdered = [...WEEKEND_TIME_SLOTS, ...WEEKDAY_TIME_SLOTS];
    return allOrdered.filter((t) => active.has(normalizeTimeSlot(t)));
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-foreground/40">
        <div className="animate-spin h-6 w-6 border-2 border-[#a0704b] border-t-transparent rounded-full mr-3" />
        Loading timetable...
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
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#faf8f5] dark:bg-[#1a1a1a] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <th className="text-left py-2 px-2 text-xs font-medium text-foreground/50 w-28 sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a] z-30">
                Time
              </th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  className="text-center py-2 px-2 text-xs font-medium text-foreground/50 min-w-[160px]"
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
        <tbody>
          {activeTimeSlots.map((timeSlot) => (
            <tr
              key={timeSlot}
              className="border-t border-gray-200 dark:border-gray-700"
            >
              <td className="py-2 px-2 text-xs font-mono text-foreground/50 align-top sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a] z-10 border-r border-[#e8d4b8] dark:border-[#6b5a4a]">
                {timeSlot}
              </td>
              {DAYS.map((day) => {
                const normalizedTime = normalizeTimeSlot(timeSlot);
                const isValidForDay = validSlotsForDay.get(day)?.has(normalizedTime) ?? false;

                if (!isValidForDay) {
                  return (
                    <td key={day} className="py-1 px-1 align-top bg-gray-50/50 dark:bg-gray-900/20">
                      <div className="h-8" />
                    </td>
                  );
                }

                const key = `${day}|${normalizedTime}`;
                const tutorSlots = slotMap.get(key) || [];

                return (
                  <td
                    key={day}
                    className="py-1 px-1 align-top"
                  >
                    {tutorSlots.length > 0 ? (
                      <div className="space-y-1">
                        {sortTutorSlots(tutorSlots).map((slot) => {
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
                              highlight={cardHighlight}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-8" />
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

function TutorCard({ slot, onEntryClick, highlight }: {
  slot: TutorSlot;
  onEntryClick?: (entry: WaitlistEntry) => void;
  highlight?: "current" | "preferred" | "dimmed" | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = slot.enrollments.length;
  const gradeGroups = useMemo(() => getGradeGroups(slot.enrollments), [slot.enrollments]);
  const schoolGroups = useMemo(() => getSchoolGroups(slot.enrollments), [slot.enrollments]);
  const schoolCount = schoolGroups.length;

  // Waitlist-only card (no tutor, no enrollments)
  if (slot.tutorId === -1) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed text-xs",
          "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/10",
          highlight === "preferred" && "border-2 border-dashed border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/10",
          highlight === "dimmed" && "opacity-25",
        )}
      >
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1 mb-1">
            {slot.location && (
              <span className={cn("text-[8px] font-medium px-1 rounded flex-shrink-0", BRANCH_COLORS[slot.location]?.badge || "bg-gray-200 text-foreground/50")}>
                {slot.location}
              </span>
            )}
            <span className="text-[8px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-medium">
              Waiting ({slot.waitlistEntries.length})
            </span>
          </div>
          {slot.waitlistEntries.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-1.5 py-0.5 cursor-pointer hover:bg-orange-100/50 dark:hover:bg-orange-900/20 rounded transition-colors"
              onClick={() => onEntryClick?.(w)}
            >
              <span
                className="px-1 py-px rounded text-[9px] font-medium text-gray-800 flex-shrink-0"
                style={{ backgroundColor: getGradeColor(w.grade, w.lang_stream || undefined) }}
              >
                {w.grade}{w.lang_stream}
              </span>
              <span className="truncate text-foreground/60 text-[9px]">{w.student_name}</span>
              {w.school && (
                <span className="text-[8px] text-foreground/30 flex-shrink-0">{w.school}</span>
              )}
            </div>
          ))}
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
        highlight === "dimmed" && "opacity-25",
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
            <span className={cn("font-mono font-medium", capacityColor)}>
              {count}/{MAX_CAPACITY}
            </span>
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
          {schoolCount >= 4 && (
            <AlertCircle className="h-3 w-3 text-amber-500" />
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
              className="flex items-center gap-1.5 py-0.5"
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
