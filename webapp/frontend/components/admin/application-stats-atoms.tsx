"use client";

/**
 * Chart atoms shared by the application stats views.
 *
 * These started life inside SummerApplicationStats and were extracted
 * unchanged when the regular applications page grew a stats view of its own.
 * Anything summer-specific (colour tables keyed on summer statuses, buddy
 * logic) stays in the page that owns it; what lives here is the neutral
 * plumbing: pills, bar rows, cards, the donut and the submission timeline.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCompactDate, SUMMER_GRADE_BG } from "@/lib/summer-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import { Users } from "lucide-react";
import type { User } from "lucide-react";

/** Click-through handlers a stats view can offer; a chart is interactive only
 *  when its handler is provided. One shape serves both intakes' views, each
 *  wiring up the handlers its charts have. */
export interface StatsFilterHandler {
  onStatusFilter?: (status: string) => void;
  onGradeFilter?: (grade: string) => void;
  onBranchFilter?: (branch: string) => void;
  onUnverifiedFilter?: () => void;
  onLocationFilter?: (code: string) => void;
  onPlacementFilter?: (value: "placed" | "unplaced") => void;
  onBuddyFilter?: (value: "solo" | "grouped" | "threshold" | "below") => void;
  onSchoolFilter?: (schoolKey: string) => void;
}

// ── Breakdown pills ─────────────────────────────────────────────────────────

export type BreakdownTone = "default" | "emerald" | "blue" | "amber";

const BREAKDOWN_TONE_CLASSES: Record<BreakdownTone, { outer: string; inner: string }> = {
  default: {
    outer: "bg-gray-100 dark:bg-gray-800 text-muted-foreground",
    inner: "bg-gray-200/70 dark:bg-gray-700 text-foreground",
  },
  emerald: {
    outer: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    inner: "bg-emerald-200/60 dark:bg-emerald-500/25 text-emerald-900 dark:text-emerald-100",
  },
  blue: {
    outer: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    inner: "bg-blue-200/60 dark:bg-blue-500/25 text-blue-900 dark:text-blue-100",
  },
  amber: {
    outer: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
    inner: "bg-amber-200/60 dark:bg-amber-500/25 text-amber-900 dark:text-amber-100",
  },
};

export function BreakdownPill({
  label,
  count,
  tone = "default",
  labelMono = false,
}: {
  label: string;
  count: number;
  tone?: BreakdownTone;
  labelMono?: boolean;
}) {
  const t = BREAKDOWN_TONE_CLASSES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] pl-2 pr-1 py-0.5 rounded-full", t.outer)}>
      <span className={cn(labelMono && "font-mono font-medium")}>{label}</span>
      <span className={cn("inline-flex items-center justify-center min-w-[1.375rem] h-[18px] px-1.5 rounded-full text-[11px] font-semibold tabular-nums", t.inner)}>
        {count}
      </span>
    </span>
  );
}

export function BreakdownStrip({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-3 mt-1 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</span>
        {trailing}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ── Bar row ─────────────────────────────────────────────────────────────────

export function BarRow({ label, labelClass, barColor, count, total, maxCount, labelWidth = "w-20", onClick }: {
  label: string;
  labelClass: string;
  barColor: string;
  count: number;
  total: number;
  maxCount: number;
  labelWidth?: string;
  onClick?: () => void;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div
      className={cn("flex items-center gap-2.5", onClick && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 -mx-1 px-1 rounded")}
      onClick={onClick}
    >
      <span className={cn("shrink-0 text-right text-[10px] px-1.5 py-0.5 rounded", labelWidth, labelClass)}>
        {label}
      </span>
      <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden">
        <div
          className={cn("h-full rounded-md transition-all", barColor)}
          style={{ width: `${barWidth}%`, minWidth: barWidth > 0 ? "4px" : "0" }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium text-foreground tabular-nums w-7 text-right">{count}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Status pipeline ─────────────────────────────────────────────────────────

/** The stacked status bar and its legend. The caller supplies its intake's
 *  status colour table and wraps this in a spacing container, so summer can
 *  append its placement-progress block underneath. */
export function StatusPipeline({ entries, total, colors, onStatusFilter }: {
  entries: (readonly [string, number])[];
  total: number;
  colors: Record<string, { dot: string }>;
  onStatusFilter?: (status: string) => void;
}) {
  if (total === 0) return null;
  return (
    <>
      <div className="flex h-8 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800">
        {entries.map(([status, count]) => {
          const pct = (count / total) * 100;
          return (
            <div
              key={status}
              className={cn(
                "h-full first:rounded-l-md last:rounded-r-md transition-opacity",
                colors[status]?.dot ?? "bg-gray-400",
                onStatusFilter && "cursor-pointer hover:opacity-80",
              )}
              style={{ width: `${pct}%`, minWidth: "3px" }}
              title={`${status}: ${count} (${Math.round(pct)}%)`}
              onClick={onStatusFilter ? () => onStatusFilter(status) : undefined}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map(([status, count]) => (
          <div
            key={status}
            className={cn("flex items-center gap-1.5", onStatusFilter && "cursor-pointer hover:underline")}
            onClick={onStatusFilter ? () => onStatusFilter(status) : undefined}
          >
            <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", colors[status]?.dot ?? "bg-gray-400")} />
            <span className="text-[10px] text-muted-foreground">{status}</span>
            <span className="text-[10px] font-medium text-foreground tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

export function StatsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">No applications match your filters</p>
    </div>
  );
}

// ── Card shell ──────────────────────────────────────────────────────────────

export function ChartCard({ title, badge, className: cls, children }: {
  title: string;
  badge?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4", cls)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {badge && <span className="text-xs text-muted-foreground tabular-nums">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Donut chart ─────────────────────────────────────────────────────────────

// Grade donut colours, matching the grade badge palette the cards use.
// Summer data stops at F3 and regular carries F4; one table covers both.
export const GRADE_STROKE: Record<string, string> = {
  F1: "#3b82f6", F2: "#a855f7", F3: "#f97316", F4: "#10b981",
};
export const GRADE_STROKE_DEFAULT = "#9ca3af";

/** Donut segments for the grade distribution, biggest first, coloured from
 *  the shared grade palette. */
export function gradeDonutSegments(apps: { grade?: string | null }[]) {
  const counts: Record<string, number> = {};
  for (const app of apps) {
    if (app.grade) counts[app.grade] = (counts[app.grade] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([grade, count]) => ({
      label: grade, count,
      color: GRADE_STROKE[grade] ?? GRADE_STROKE_DEFAULT,
      pillClass: SUMMER_GRADE_BG[grade] || "bg-gray-100 dark:bg-gray-700 text-foreground",
    }));
}

const DONUT_RADIUS = 34;
const DONUT_STROKE = 10;
const DONUT_SIZE = (DONUT_RADIUS + DONUT_STROKE) * 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function DonutChart({ segments, onSegmentClick }: { segments: { label: string; count: number; color: string; pillClass: string }[]; onSegmentClick?: (label: string) => void }) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const arcs = useMemo(() => {
    let off = 0;
    return segments.map((seg) => {
      const arcLen = total > 0 ? (seg.count / total) * DONUT_CIRCUMFERENCE : 0;
      const result = { ...seg, arcLen, offset: off };
      off += arcLen;
      return result;
    });
  }, [segments, total]);
  return (
    <div className="flex items-center gap-5">
      <svg width={DONUT_SIZE} height={DONUT_SIZE} className="shrink-0 -rotate-90">
        {total > 0 ? arcs.map((arc) => (
          <circle key={arc.label} cx={DONUT_RADIUS + DONUT_STROKE} cy={DONUT_RADIUS + DONUT_STROKE}
            r={DONUT_RADIUS} fill="none" stroke={arc.color} strokeWidth={DONUT_STROKE}
            strokeDasharray={`${arc.arcLen} ${DONUT_CIRCUMFERENCE}`} strokeDashoffset={-arc.offset} strokeLinecap="round" />
        )) : (
          <circle cx={DONUT_RADIUS + DONUT_STROKE} cy={DONUT_RADIUS + DONUT_STROKE}
            r={DONUT_RADIUS} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth={DONUT_STROKE} />
        )}
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg) => {
          const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
          return (
            <div
              key={seg.label}
              className={cn("flex items-center gap-2", onSegmentClick && "cursor-pointer hover:underline")}
              onClick={onSegmentClick ? () => onSegmentClick(seg.label) : undefined}
            >
              <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", seg.pillClass)}>{seg.label}</span>
              <span className="text-xs font-medium text-foreground tabular-nums">{seg.count}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────

export function StatCard({ icon: Icon, value, label, colorClass, onClick }: {
  icon: typeof User;
  value: number;
  label: string;
  colorClass?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn("flex items-center gap-2.5 p-3 rounded-lg", colorClass || "bg-gray-50 dark:bg-gray-800/50", onClick && "cursor-pointer hover:ring-1 hover:ring-primary/30 transition-shadow")}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4 shrink-0", colorClass ? "" : "text-muted-foreground")} />
      <div>
        <div className={cn("text-lg font-semibold tabular-nums", colorClass ? "" : "text-foreground")}>{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ── Timeline line chart ─────────────────────────────────────────────────────

const TL_H = 100;
const TL_PAD_X = 8;
const TL_PAD_T = 4;
const TL_PAD_B = 4;

export function TimelineChart({ days, max }: { days: [string, number][]; max: number }) {
  const n = days.length;
  const showAllDots = n <= 10;
  const totalSubmitted = useMemo(() => days.reduce((s, [, c]) => s + c, 0), [days]);

  const peakSet = useMemo(() => {
    const peaks = new Set<number>();
    for (let i = 0; i < n; i++) {
      const c = days[i][1];
      if (c === 0) continue;
      const prev = i > 0 ? days[i - 1][1] : 0;
      const next = i < n - 1 ? days[i + 1][1] : 0;
      if (c >= prev && c >= next) peaks.add(i);
    }
    if (n > 0 && days[0][1] > 0) peaks.add(0);
    if (n > 0 && days[n - 1][1] > 0) peaks.add(n - 1);
    return peaks;
  }, [days]);

  const { linePath, areaPath, points } = useMemo(() => {
    const plotW = 100 - TL_PAD_X * 2;
    const plotH = 100 - TL_PAD_T - TL_PAD_B;
    const pts = days.map(([, count], i) => {
      const x = TL_PAD_X + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
      const y = TL_PAD_T + (max > 0 ? (1 - count / max) * plotH : plotH);
      return { x, y, count };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const area = line + ` L${pts[n - 1].x},${100 - TL_PAD_B} L${pts[0].x},${100 - TL_PAD_B} Z`;
    return { linePath: line, areaPath: area, points: pts };
  }, [days, max]);

  return (
    <ChartCard title="Submission Timeline" badge={`${totalSubmitted} submitted`} className="lg:col-span-2">
      <div className="relative" style={{ height: TL_H }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <path d={areaPath} className="fill-primary/10 dark:fill-primary/20" />
          <path d={linePath} fill="none" className="stroke-primary dark:stroke-primary/80"
            strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {days.map(([date, count], i) => {
          const showDot = showAllDots || peakSet.has(i);
          if (!showDot) return null;
          const p = points[i];
          return (
            <div key={date} className="absolute" style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%, -50%)" }}>
              <div className="w-2 h-2 rounded-full bg-primary" title={`${formatCompactDate(date)}: ${count}`} />
              {peakSet.has(i) && count > 0 && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
        <span>{formatCompactDate(days[0][0])}</span>
        {n > 1 && <span>{formatCompactDate(days[n - 1][0])}</span>}
      </div>
    </ChartCard>
  );
}

/**
 * Group submissions into a continuous daily series for TimelineChart.
 * Days with no submissions are filled with zeroes so the line never jumps
 * across a gap. Timestamps are read in Hong Kong time regardless of the
 * browser locale.
 */
export function buildTimelineData(
  timestamps: (string | null | undefined)[],
): { days: [string, number][]; max: number } {
  const dayCounts: Record<string, number> = {};
  for (const ts of timestamps) {
    if (!ts) continue;
    const day = parseHKTimestamp(ts)
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Hong_Kong" });
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const dates = Object.keys(dayCounts).sort();
  if (dates.length === 0) return { days: [], max: 0 };
  // Noon UTC avoids DST edge cases while stepping one day at a time.
  const start = new Date(dates[0] + "T12:00:00Z");
  const end = new Date(dates[dates.length - 1] + "T12:00:00Z");
  const days: [string, number][] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toLocaleDateString("sv-SE", { timeZone: "UTC" });
    days.push([key, dayCounts[key] || 0]);
  }
  const max = days.reduce((m, [, c]) => Math.max(m, c), 0);
  return { days, max };
}
