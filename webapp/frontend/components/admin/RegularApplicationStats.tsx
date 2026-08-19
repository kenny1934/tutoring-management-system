"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseHKTimestamp } from "@/lib/formatters";
import {
  BRANCH_INFO, LOCATION_TO_CODE, SUMMER_GRADE_BG,
  REGULAR_EXIT_STATUSES, foldSchoolName, schoolGroupKey,
} from "@/lib/regular-utils";
import { REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS } from "./RegularApplicationCard";
import {
  BarRow,
  ChartCard,
  DonutChart,
  TimelineChart,
  buildTimelineData,
} from "./application-stats-atoms";
import { SchoolAliasAssign } from "./SchoolAliasAssign";
import { Users, ArrowRight } from "lucide-react";
import type { RegularApplication } from "@/types";

// Grade donut colours, matching the grade badge palette the cards use.
const GRADE_STROKE: Record<string, string> = {
  F1: "#3b82f6", F2: "#a855f7", F3: "#f97316", F4: "#10b981",
};
const GRADE_STROKE_DEFAULT = "#9ca3af";

const SCHOOL_ROWS_COLLAPSED = 15;

interface StatsFilterHandler {
  onStatusFilter?: (status: string) => void;
  onGradeFilter?: (grade: string) => void;
  onLocationFilter?: (code: string) => void;
  onSchoolFilter?: (schoolKey: string) => void;
}

interface Props {
  applications: RegularApplication[];
  filters?: StatsFilterHandler;
  readOnly?: boolean;
  /** Called after a spelling is assigned a code, so the page can refetch the
   *  list and the cards regroup under the new canonical school. */
  onAliasCreated?: () => void;
}

export function RegularApplicationStats({ applications, filters, readOnly = false, onAliasCreated }: Props) {
  const activeApps = useMemo(
    () => applications.filter((a) => !REGULAR_EXIT_STATUSES.has(a.application_status)),
    [applications],
  );

  // ── Status pipeline ──
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of applications) {
      counts[app.application_status] = (counts[app.application_status] || 0) + 1;
    }
    const entries = REGULAR_ALL_STATUSES
      .map((s) => [s, counts[s] || 0] as const)
      .filter(([, c]) => c > 0);
    return { entries, total: applications.length };
  }, [applications]);

  // ── Feeder schools ──
  // Grouped on the shared school key: the backend's canonical code where the
  // spelling is recognised, the folded raw spelling otherwise. An unrecognised
  // group is labelled with its most common original spelling.
  const schoolData = useMemo(() => {
    const counts = new Map<string, number>();
    const recognised = new Set<string>();
    const rawDisplay = new Map<string, Map<string, number>>();
    let unknown = 0;
    for (const app of activeApps) {
      const key = schoolGroupKey(app);
      if (!key) { unknown++; continue; }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (app.school_canonical) {
        recognised.add(key);
      } else {
        const spelling = (app.school ?? "").trim();
        const byRaw = rawDisplay.get(key) ?? new Map<string, number>();
        byRaw.set(spelling, (byRaw.get(spelling) ?? 0) + 1);
        rawDisplay.set(key, byRaw);
      }
    }
    const entries = Array.from(counts.entries())
      .map(([key, count]) => {
        const isRecognised = recognised.has(key);
        const display = isRecognised
          ? key
          : Array.from(rawDisplay.get(key)!.entries())
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
        return { key, display, count, recognised: isRecognised };
      })
      .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
    const max = entries.length > 0 ? entries[0].count : 0;
    return { entries, max, unknown, total: activeApps.length };
  }, [activeApps]);
  const [allSchoolsShown, setAllSchoolsShown] = useState(false);
  const shownSchools = allSchoolsShown
    ? schoolData.entries
    : schoolData.entries.slice(0, SCHOOL_ROWS_COLLAPSED);

  // ── Unrecognised spellings ──
  const unrecognised = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of applications) {
      if (app.school_canonical) continue;
      const spelling = (app.school ?? "").trim();
      if (!spelling) continue;
      counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [applications]);

  // ── Grade distribution ──
  const gradeSegments = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of activeApps) {
      if (app.grade) counts[app.grade] = (counts[app.grade] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([grade, count]) => ({
        label: grade, count,
        color: GRADE_STROKE[grade] ?? GRADE_STROKE_DEFAULT,
        pillClass: SUMMER_GRADE_BG[grade] || "bg-gray-100 dark:bg-gray-700 text-foreground",
      }));
  }, [activeApps]);

  // ── Preferred location ──
  const locationData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of activeApps) {
      const code = app.preferred_location
        ? LOCATION_TO_CODE[app.preferred_location] || app.preferred_location
        : "Unknown";
      counts[code] = (counts[code] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted.length > 0 ? sorted[0][1] : 0;
    return { entries: sorted, max, total: activeApps.length };
  }, [activeApps]);

  // ── Submission timeline ──
  const timelineData = useMemo(
    () => buildTimelineData(applications.map((a) => a.submitted_at), parseHKTimestamp),
    [applications],
  );


  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No applications match your filters</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Status pipeline */}
      <ChartCard title="Status Pipeline" badge={`${statusData.total} total`} className="lg:col-span-2">
        <div className="space-y-3">
          <div className="flex h-8 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800">
            {statusData.entries.map(([status, count]) => {
              const pct = statusData.total > 0 ? (count / statusData.total) * 100 : 0;
              if (pct === 0) return null;
              const colors = REGULAR_STATUS_COLORS[status];
              return (
                <div
                  key={status}
                  className={cn(
                    "h-full first:rounded-l-md last:rounded-r-md transition-opacity",
                    colors?.dot ?? "bg-gray-400",
                    filters?.onStatusFilter && "cursor-pointer hover:opacity-80",
                  )}
                  style={{ width: `${pct}%`, minWidth: pct > 0 ? "3px" : "0" }}
                  title={`${status}: ${count} (${Math.round(pct)}%)`}
                  onClick={filters?.onStatusFilter ? () => filters.onStatusFilter!(status) : undefined}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {statusData.entries.map(([status, count]) => {
              const colors = REGULAR_STATUS_COLORS[status];
              return (
                <div
                  key={status}
                  className={cn("flex items-center gap-1.5", filters?.onStatusFilter && "cursor-pointer hover:underline")}
                  onClick={filters?.onStatusFilter ? () => filters.onStatusFilter!(status) : undefined}
                >
                  <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", colors?.dot ?? "bg-gray-400")} />
                  <span className="text-[10px] text-muted-foreground">{status}</span>
                  <span className="text-[10px] font-medium text-foreground tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </ChartCard>

      {/* Feeder schools */}
      <ChartCard title="Feeder Schools" badge={`${schoolData.total} active`} className="lg:col-span-2">
        {schoolData.entries.length > 0 ? (
          <div className="space-y-1.5">
            {shownSchools.map(({ key, display, count, recognised }) => (
              <BarRow
                key={key}
                label={display}
                labelClass={recognised
                  ? "font-semibold bg-gray-100 dark:bg-gray-800 text-foreground"
                  : "italic text-muted-foreground border border-dashed border-gray-300 dark:border-gray-600"}
                labelWidth="w-36 truncate"
                barColor={recognised ? "bg-emerald-400 dark:bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}
                count={count} total={schoolData.total} maxCount={schoolData.max}
                onClick={filters?.onSchoolFilter ? () => filters.onSchoolFilter!(key) : undefined}
              />
            ))}
            {schoolData.entries.length > SCHOOL_ROWS_COLLAPSED && (
              <button
                type="button"
                onClick={() => setAllSchoolsShown((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                {allSchoolsShown
                  ? "Show fewer schools"
                  : `Show all ${schoolData.entries.length} schools`}
              </button>
            )}
            {schoolData.unknown > 0 && (
              <p className="text-[11px] text-muted-foreground pt-1">
                {schoolData.unknown} application{schoolData.unknown !== 1 ? "s" : ""} did not name a school.
              </p>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">No school data yet</div>
        )}
        <div className="pt-3 mt-1 border-t border-gray-200 dark:border-gray-700">
          <Link
            href="/admin/regular/conversion"
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            The conversion report breaks feeder schools down by prospect outcome
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </ChartCard>

      {/* Grade + location */}
      <ChartCard title="Grade Distribution" badge={`${activeApps.length} active`}>
        <DonutChart segments={gradeSegments} onSegmentClick={filters?.onGradeFilter} />
      </ChartCard>

      <ChartCard title="Preferred Location" badge={`${locationData.total} active`}>
        {locationData.entries.length > 0 ? (
          <div className="space-y-1.5">
            {locationData.entries.map(([code, count]) => (
              <BarRow
                key={code}
                label={code}
                labelClass={cn("font-semibold", BRANCH_INFO[code]?.badge ?? "bg-gray-100 dark:bg-gray-800 text-muted-foreground")}
                barColor={BRANCH_INFO[code]?.dot ?? "bg-gray-300 dark:bg-gray-600"}
                count={count} total={locationData.total} maxCount={locationData.max}
                onClick={filters?.onLocationFilter ? () => filters.onLocationFilter!(code) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">No location data</div>
        )}
      </ChartCard>

      {/* Submission timeline */}
      {timelineData.days.length > 0 && (
        <TimelineChart days={timelineData.days} max={timelineData.max} />
      )}

      {/* Unrecognised spellings */}
      <ChartCard
        title="Unrecognised Spellings"
        badge={unrecognised.length > 0 ? `${unrecognised.length} to review` : undefined}
        className="lg:col-span-2"
      >
        {unrecognised.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every spelling in the current list is recognised.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              These school names are not recognised yet, so they group by their own
              spelling. Assign each one a school code and every chart here regroups.
            </p>
            {unrecognised.map(([spelling, count]) => (
              <div key={spelling} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-foreground">{spelling}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">×{count}</span>
                {!readOnly && (
                  <SchoolAliasAssign raw={spelling} onAssigned={onAliasCreated} className="ml-auto" />
                )}
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

