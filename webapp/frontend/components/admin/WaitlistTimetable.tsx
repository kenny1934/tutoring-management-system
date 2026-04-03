"use client";

import { useState, useMemo } from "react";
import { useAllStudents } from "@/lib/hooks";
import { getGradeColor, DAY_NAMES, ALL_TIME_SLOTS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Users, AlertCircle } from "lucide-react";
import type { Enrollment, WaitlistEntry } from "@/types";

interface WaitlistTimetableProps {
  location: string;
  waitlistEntries: WaitlistEntry[];
  onSlotClick?: (day: string, time: string, tutorId: number) => void;
}

interface TutorSlot {
  tutorId: number;
  tutorName: string;
  enrollments: Enrollment[];
  waitlistCount: number;
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

export function WaitlistTimetable({
  location,
  waitlistEntries,
  onSlotClick,
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
          enrollments: [],
          waitlistCount: 0,
        };
        slots.push(tutorSlot);
      }
      tutorSlot.enrollments.push(enrollment);
    }

    // Count waitlist entries per slot
    for (const entry of waitlistEntries) {
      for (const pref of entry.slot_preferences) {
        if (
          location !== "All Locations" &&
          pref.location !== location
        )
          continue;
        if (!pref.day_of_week || !pref.time_slot) continue;

        const key = `${pref.day_of_week}|${normalizeTimeSlot(pref.time_slot)}`;
        if (!map.has(key)) map.set(key, []);
        const slots = map.get(key)!;

        // Add waitlist count to all tutor slots in this time, or create a placeholder
        if (slots.length === 0) {
          slots.push({
            tutorId: 0,
            tutorName: "—",
            enrollments: [],
            waitlistCount: 1,
          });
        } else {
          // Distribute across all tutors equally (just increment total)
          slots[0].waitlistCount++;
        }
      }
    }

    return map;
  }, [enrollments, waitlistEntries, location]);

  // Find which time slots actually have data
  const activeTimeSlots = useMemo(() => {
    const active = new Set<string>();
    for (const key of slotMap.keys()) {
      const time = key.split("|")[1];
      active.add(time);
    }
    // Return all standard slots that have data, in order
    return ALL_TIME_SLOTS.filter((t) => active.has(normalizeTimeSlot(t)));
  }, [slotMap]);

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 px-2 text-xs font-medium text-foreground/50 w-28 sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a] z-10">
              Time
            </th>
            {DAYS.map((day) => (
              <th
                key={day}
                className="text-center py-2 px-2 text-xs font-medium text-foreground/50 min-w-[140px]"
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
              <td className="py-2 px-2 text-xs font-mono text-foreground/50 align-top sticky left-0 bg-[#faf8f5] dark:bg-[#1a1a1a] z-10">
                {timeSlot}
              </td>
              {DAYS.map((day) => {
                const key = `${day}|${normalizeTimeSlot(timeSlot)}`;
                const tutorSlots = slotMap.get(key) || [];

                return (
                  <td
                    key={day}
                    className="py-1 px-1 align-top"
                  >
                    {tutorSlots.length > 0 ? (
                      <div className="space-y-1">
                        {tutorSlots.map((slot) => (
                          <TutorCard
                            key={slot.tutorId}
                            slot={slot}
                          />
                        ))}
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
  );
}

// ============================================
// Tutor Card (collapsed/expanded)
// ============================================

function TutorCard({ slot }: { slot: TutorSlot }) {
  const [expanded, setExpanded] = useState(false);
  const count = slot.enrollments.length;
  const gradeGroups = useMemo(() => getGradeGroups(slot.enrollments), [slot.enrollments]);
  const schoolGroups = useMemo(() => getSchoolGroups(slot.enrollments), [slot.enrollments]);
  const schoolCount = schoolGroups.length;

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
        "rounded-lg border text-xs transition-colors cursor-pointer",
        expanded
          ? "bg-white dark:bg-[#252525] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
          : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-[#d4a574] dark:hover:border-[#8b6f47]"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Collapsed header */}
      <div className="px-2 py-1.5 flex items-start gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
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
          {slot.waitlistCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-[9px] font-medium">
              {slot.waitlistCount} waiting
            </span>
          )}
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
          {slot.enrollments.length === 0 && slot.waitlistCount > 0 && (
            <div className="text-[9px] text-foreground/40 italic">
              No current students — {slot.waitlistCount} on waitlist
            </div>
          )}
        </div>
      )}
    </div>
  );
}
