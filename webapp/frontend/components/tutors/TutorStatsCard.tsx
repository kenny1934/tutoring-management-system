"use client";

import { memo, useMemo } from "react";
import type { Enrollment } from "@/types";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import {
  normalizeGrade,
  normalizeStream,
  shortDay,
  gradeIdx,
  STREAM_ORDER,
  type RosterFacets,
  type StreamKey,
} from "@/lib/tutor-roster";

// Warm sepia palette for the school/location bars (grade segments use the
// canonical grade-stream palette via getGradeColor instead).
const SEPIA = [
  "#a0704b",
  "#cd853f",
  "#d4a574",
  "#8b6f47",
  "#c2956e",
  "#b8860b",
  "#d2691e",
  "#a0522d",
];

const TOP_SCHOOLS = 4;

// Timetable column order — Sunday first, matching the app's calendar convention.
const SCHEDULE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Heat fill is interpolated between two OPAQUE sepia endpoints (light tan →
// dark brown) so the cell color — and therefore the text contrast — is the same
// in light and dark mode. Filled cells get a floor so even a single student is
// clearly tinted.
const HEAT_LIGHT = [232, 212, 184]; // #e8d4b8 light tan
const HEAT_DARK = [122, 74, 42]; // #7a4a2a dark sepia

// Interpolation position (0..1) of a filled cell; 0 means empty.
function heatT(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return 0.28 + 0.72 * (count / max);
}

// Opaque sepia at position t (only called for filled cells).
function heatColor(t: number): string {
  const ch = (i: number) => Math.round(HEAT_LIGHT[i] + (HEAT_DARK[i] - HEAT_LIGHT[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

// Flip text to light once the fill is dark enough; deterministic since the fill
// is opaque and theme-independent.
function heatTextClass(t: number): string {
  return t > 0.55 ? "text-amber-50" : "text-[#5a3a1f]";
}

interface ScheduleData {
  days: string[];
  slots: string[];
  counts: Record<string, number>;
  dayTotals: Record<string, number>;
  max: number;
}

interface GradeSlice {
  key: string;
  grade: string;
  stream: StreamKey;
  label: string;
  value: number;
  color: string;
}

interface Slice {
  name: string;
  value: number;
  color: string;
}

// Memoized: the page re-renders on every roster-search keystroke, but this
// card's props (the facet-filtered roster, facets, and onToggle) are all
// reference-stable while typing, so memo keeps the heatmap off the hot path.
export const TutorStatsCard = memo(function TutorStatsCard({
  roster,
  facets,
  onToggle,
}: {
  /** Already facet-filtered roster — the stats reflect the active filter. */
  roster: Enrollment[];
  facets: RosterFacets;
  onToggle: (patch: Partial<RosterFacets>) => void;
}) {
  const { grades, schools, locations, schedule, maxSchool, total } = useMemo(() => {
    const gradeCounts: Record<string, GradeSlice> = {};
    const schoolCounts: Record<string, number> = {};
    const locationCounts: Record<string, number> = {};
    const cellCounts: Record<string, number> = {};
    const dayTotals: Record<string, number> = {};
    const daySet = new Set<string>();
    const slotSet = new Set<string>();

    for (const e of roster) {
      const grade = normalizeGrade(e.grade);
      const stream = normalizeStream(e.lang_stream);
      const key = `${grade}|${stream}`;
      if (!gradeCounts[key]) {
        gradeCounts[key] = {
          key,
          grade,
          stream,
          label: `${grade}${stream === "Other" ? "" : stream}`,
          value: 0,
          color: getGradeColor(grade, stream === "Other" ? undefined : stream),
        };
      }
      gradeCounts[key].value += 1;
      if (e.school) schoolCounts[e.school] = (schoolCounts[e.school] ?? 0) + 1;
      if (e.location) locationCounts[e.location] = (locationCounts[e.location] ?? 0) + 1;

      const day = shortDay(e.assigned_day);
      const slot = e.assigned_time?.trim();
      if (day && slot) {
        daySet.add(day);
        slotSet.add(slot);
        cellCounts[`${day}|${slot}`] = (cellCounts[`${day}|${slot}`] ?? 0) + 1;
        dayTotals[day] = (dayTotals[day] ?? 0) + 1;
      }
    }

    const grades = Object.values(gradeCounts).sort(
      (a, b) =>
        gradeIdx(a.grade) - gradeIdx(b.grade) ||
        STREAM_ORDER[a.stream] - STREAM_ORDER[b.stream]
    );

    const sortedSchools = Object.entries(schoolCounts).sort((a, b) => b[1] - a[1]);
    const top = sortedSchools.slice(0, TOP_SCHOOLS);
    const rest = sortedSchools.slice(TOP_SCHOOLS);
    const schools: Slice[] = top.map(([name, value], i) => ({
      name,
      value,
      color: SEPIA[i % SEPIA.length],
    }));
    if (rest.length) {
      schools.push({
        name: `Others (${rest.length})`,
        value: rest.reduce((sum, [, v]) => sum + v, 0),
        color: SEPIA[TOP_SCHOOLS % SEPIA.length],
      });
    }

    const locations: Slice[] = Object.entries(locationCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value], i) => ({ name, value, color: SEPIA[i % SEPIA.length] }));

    const schedule: ScheduleData = {
      days: SCHEDULE_DAYS.filter((d) => daySet.has(d)),
      slots: [...slotSet].sort((a, b) => a.localeCompare(b)),
      counts: cellCounts,
      dayTotals,
      max: Math.max(0, ...Object.values(cellCounts)),
    };

    // Schools are sorted descending, so the leader's count is the bar scale.
    const maxSchool = schools[0]?.value ?? 1;

    return { grades, schools, locations, schedule, maxSchool, total: roster.length };
  }, [roster]);

  if (total === 0) {
    return <p className="py-2 text-sm text-foreground/40">No students match the current filter.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Grade mix (split by stream) */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs text-foreground/55">Grade mix</span>
          <span className="text-xs text-foreground/40">{total} students</span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
          {grades.map((g) => (
            <div
              key={g.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(g.value / total) * 100}%`, backgroundColor: g.color }}
              title={`${g.label}: ${g.value}`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {grades.map((g) => {
            const active = facets.grade === g.grade && facets.lang === g.stream;
            return (
              <button
                key={g.key}
                onClick={() => onToggle({ grade: g.grade, lang: g.stream })}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-amber-400 bg-amber-50 font-medium text-foreground dark:border-amber-500 dark:bg-amber-900/30"
                    : "border-[#e8d4b8] text-foreground/70 hover:bg-foreground/5 dark:border-[#6b5a4a]"
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                {g.label}
                <span className="text-foreground/40">{g.value}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Weekly schedule heatmap — day columns × time-slot rows, intensity by
          headcount. Click a day header to filter by day, a time label to filter
          by slot, or a cell to filter that exact day+time. Selections combine,
          so you can drill day → slot in sequence. */}
      {schedule.days.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-foreground/55">Weekly schedule</p>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-separate border-spacing-0.5 text-center">
              <colgroup>
                <col className="w-12" />
                {schedule.days.map((day) => (
                  <col key={day} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th />
                  {schedule.days.map((day) => {
                    const active = facets.day === day;
                    return (
                      <th key={day} className="px-0">
                        <button
                          onClick={() => onToggle({ day })}
                          aria-pressed={active}
                          title={`${day}: ${schedule.dayTotals[day] ?? 0} students`}
                          className={cn(
                            "w-full rounded px-1 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            active
                              ? "bg-amber-200 text-amber-900 dark:bg-amber-700/50 dark:text-amber-100"
                              : "text-foreground/55 hover:bg-foreground/5"
                          )}
                        >
                          {day}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {schedule.slots.map((slot) => {
                  const slotActive = facets.time === slot;
                  return (
                    <tr key={slot}>
                      <td className="p-0">
                        <button
                          onClick={() => onToggle({ time: slot })}
                          aria-pressed={slotActive}
                          title={`${slot}: filter this time slot`}
                          className={cn(
                            "w-full rounded py-0.5 pr-1 text-right font-mono text-[10px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                            slotActive
                              ? "bg-amber-200 font-semibold text-amber-900 dark:bg-amber-700/50 dark:text-amber-100"
                              : "text-foreground/40 hover:bg-foreground/5"
                          )}
                        >
                          {slot.split(" - ")[0]}
                        </button>
                      </td>
                      {schedule.days.map((day) => {
                        const count = schedule.counts[`${day}|${slot}`] ?? 0;
                        const t = heatT(count, schedule.max);
                        const matches =
                          (!facets.day || facets.day === day) &&
                          (!facets.time || facets.time === slot);
                        const dimmed = (facets.day || facets.time) && !matches;
                        return (
                          <td key={day} className="p-0">
                            <button
                              onClick={() => onToggle({ day, time: slot })}
                              title={`${day} ${slot}: ${count} student${count === 1 ? "" : "s"}`}
                              className={cn(
                                "flex h-6 w-full items-center justify-center rounded text-[10px] font-medium transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                                count > 0 ? heatTextClass(t) : "bg-foreground/[0.04] text-transparent",
                                dimmed && "opacity-30"
                              )}
                              style={count > 0 ? { backgroundColor: heatColor(t) } : undefined}
                            >
                              {count > 0 ? count : "·"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Schools */}
      {schools.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-foreground/55">Schools</p>
          <div className="space-y-1">
            {schools.map((s) => {
              const isOthers = s.name.startsWith("Others (");
              const active = facets.school === s.name;
              const content = (
                <>
                  <span
                    className={cn(
                      "w-24 flex-shrink-0 truncate text-xs",
                      active ? "font-medium text-foreground" : "text-foreground/60"
                    )}
                    title={s.name}
                  >
                    {s.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(s.value / maxSchool) * 100}%`, backgroundColor: s.color }}
                    />
                  </div>
                  <span className="w-5 flex-shrink-0 text-right text-xs font-medium text-foreground/70">
                    {s.value}
                  </span>
                </>
              );
              return isOthers ? (
                <div key={s.name} className="flex items-center gap-2 px-1" title="Multiple schools — not filterable">
                  {content}
                </div>
              ) : (
                <button
                  key={s.name}
                  onClick={() => onToggle({ school: s.name })}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    active ? "bg-amber-50 dark:bg-amber-900/20" : "hover:bg-foreground/5"
                  )}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Locations taught */}
      {locations.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-foreground/55">Locations taught</p>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((loc) => {
              const active = facets.location === loc.name;
              return (
                <button
                  key={loc.name}
                  onClick={() => onToggle({ location: loc.name })}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    active
                      ? "border-amber-400 bg-amber-50 font-medium text-foreground dark:border-amber-500 dark:bg-amber-900/30"
                      : "border-[#e8d4b8] text-foreground/70 hover:bg-foreground/5 dark:border-[#6b5a4a]"
                  )}
                >
                  {loc.name}
                  <span className="text-foreground/40">{loc.value}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
