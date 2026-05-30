"use client";

import { useMemo } from "react";
import type { Enrollment } from "@/types";

// Warm sepia palette, matching the dashboard distribution charts so a tutor's
// breakdowns read in the same visual language as the dashboard's.
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

const GRADE_ORDER = ["F1", "F2", "F3", "F4", "F5", "F6"];
const OTHER = "Other";
const TOP_SCHOOLS = 4;

interface Slice {
  name: string;
  value: number;
  color: string;
}

// A single thin stacked bar — one colored segment per slice, widths summing to
// the total. Used for the grade mix at the top of the card.
function StackedBar({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
      {slices.map((s) => (
        <div
          key={s.name}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          title={`${s.name}: ${s.value}`}
        />
      ))}
    </div>
  );
}

// A labelled mini horizontal bar (school rows). Width is relative to the
// largest value so the leader fills the track.
function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 flex-shrink-0 truncate text-xs text-foreground/60" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/5">
        <div
          className="h-full rounded-full"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-5 flex-shrink-0 text-right text-xs font-medium text-foreground/70">
        {value}
      </span>
    </div>
  );
}

export function TutorStatsCard({ roster }: { roster: Enrollment[] }) {
  const { grades, schools, locations, total } = useMemo(() => {
    const gradeCounts: Record<string, number> = {};
    const schoolCounts: Record<string, number> = {};
    const locationSet = new Set<string>();

    for (const e of roster) {
      const grade = (e.grade || OTHER).toUpperCase();
      gradeCounts[grade] = (gradeCounts[grade] ?? 0) + 1;
      if (e.school) schoolCounts[e.school] = (schoolCounts[e.school] ?? 0) + 1;
      if (e.location) locationSet.add(e.location);
    }

    // Grades ordered F1→F6, with anything unrecognised ("Other") pinned last.
    const grades: Slice[] = Object.entries(gradeCounts)
      .sort(([a], [b]) => {
        const ia = GRADE_ORDER.indexOf(a);
        const ib = GRADE_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([name, value], i) => ({ name, value, color: SEPIA[i % SEPIA.length] }));

    // Top schools by headcount, remainder folded into "Others".
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

    return {
      grades,
      schools,
      locations: [...locationSet].sort(),
      total: roster.length,
    };
  }, [roster]);

  if (total === 0) {
    return <p className="py-2 text-sm text-foreground/40">No active students yet.</p>;
  }

  const maxSchool = Math.max(...schools.map((s) => s.value), 1);

  return (
    <div className="space-y-4">
      {/* Grade mix */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs text-foreground/55">Grade mix</span>
          <span className="text-xs text-foreground/40">{total} students</span>
        </div>
        <StackedBar slices={grades} total={total} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {grades.map((g) => (
            <span key={g.name} className="inline-flex items-center gap-1.5 text-xs text-foreground/70">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
              {g.name}
              <span className="text-foreground/40">{g.value}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Schools */}
      {schools.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-foreground/55">Schools</p>
          <div className="space-y-1.5">
            {schools.map((s) => (
              <MiniBar key={s.name} label={s.name} value={s.value} max={maxSchool} color={s.color} />
            ))}
          </div>
        </div>
      )}

      {/* Locations taught */}
      {locations.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-foreground/55">Locations taught</p>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((loc) => (
              <span
                key={loc}
                className="rounded-full border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white/60 dark:bg-white/5 px-2 py-0.5 text-xs text-foreground/70"
              >
                {loc}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
