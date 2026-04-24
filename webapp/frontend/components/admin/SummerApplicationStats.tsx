"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BRANCH_INFO, EXIT_STATUSES, SUMMER_GRADE_BG, displayLocation, MIN_GROUP_SIZE, formatCompactDate, isPlaced } from "@/lib/summer-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import { STATUS_COLORS, ALL_STATUSES } from "./SummerApplicationCard";
import { Users, User, Send, Loader2, ExternalLink } from "lucide-react";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import type { SummerApplication, SummerCourseConfig, SummerMarketingSnapshotResponse } from "@/types";
import type { DiscountResult } from "@/lib/summer-discounts";
import { suggestReceiptCode } from "@/lib/summer-receipt-codes";

// ── Color helpers ──────────────────────────────────────────────────────────

const EXTRA_BAR: Record<string, string> = {
  MSA: "bg-blue-400", MSB: "bg-purple-400", New: "bg-green-500",
};
const EXTRA_PILL: Record<string, string> = {
  MSA: "bg-blue-400/15 text-blue-600 dark:text-blue-400",
  MSB: "bg-purple-400/15 text-purple-600 dark:text-purple-400",
  New: "bg-green-500/15 text-green-600 dark:text-green-400",
};

function branchBarColor(b: string) { return BRANCH_INFO[b]?.dot ?? EXTRA_BAR[b] ?? "bg-gray-300 dark:bg-gray-600"; }
function branchPillColor(b: string) { return BRANCH_INFO[b]?.badge ?? EXTRA_PILL[b] ?? "bg-gray-100 dark:bg-gray-800 text-muted-foreground"; }

const GRADE_STROKE: Record<string, string> = {
  F1: "#3b82f6", F2: "#a855f7", F3: "#f97316",
};
const GRADE_STROKE_DEFAULT = "#9ca3af";

const SESSIONS_STROKE: Record<string, string> = { "1": "#3b82f6", "2": "#f59e0b" };
const SESSIONS_PILL: Record<string, string> = {
  "1": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "2": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

// ── Shared components ──────────────────────────────────────────────────────

type BreakdownTone = "default" | "emerald" | "blue" | "amber";

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

function BreakdownPill({
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

function BreakdownStrip({
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

function BarRow({ label, labelClass, barColor, count, total, maxCount, labelWidth = "w-20", onClick }: {
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

function ChartCard({ title, badge, className: cls, children }: {
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

// ── Donut chart ────────────────────────────────────────────────────────────

const DONUT_RADIUS = 34;
const DONUT_STROKE = 10;
const DONUT_SIZE = (DONUT_RADIUS + DONUT_STROKE) * 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function DonutChart({ segments, onSegmentClick }: { segments: { label: string; count: number; color: string; pillClass: string }[]; onSegmentClick?: (label: string) => void }) {
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

// ── Timeline line chart ────────────────────────────────────────────────────

const TL_H = 100;
const TL_PAD_X = 8;
const TL_PAD_T = 4;
const TL_PAD_B = 4;

function TimelineChart({ days, max }: { days: [string, number][]; max: number }) {
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

// ── Main component ─────────────────────────────────────────────────────────

interface StatsFilterHandler {
  onStatusFilter?: (status: string) => void;
  onGradeFilter?: (grade: string) => void;
  onBranchFilter?: (branch: string) => void;
  onUnverifiedFilter?: () => void;
  onLocationFilter?: (code: string) => void;
  onPlacementFilter?: (value: "placed" | "unplaced") => void;
  onBuddyFilter?: (value: "solo" | "grouped" | "threshold" | "below") => void;
}

interface Props {
  applications: SummerApplication[];
  filters?: StatsFilterHandler;
  config?: SummerCourseConfig | null;
  discountByAppId?: Map<number, DiscountResult>;
}

export function SummerApplicationStats({ applications, filters, config, discountByAppId }: Props) {
  const activeApps = useMemo(
    () => applications.filter((a) => !EXIT_STATUSES.has(a.application_status)),
    [applications],
  );

  // ── Status pipeline ──
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of applications) {
      counts[app.application_status] = (counts[app.application_status] || 0) + 1;
    }
    const entries = ALL_STATUSES.map((s) => [s, counts[s] || 0] as const).filter(([, c]) => c > 0);
    return { entries, total: applications.length };
  }, [applications]);

  // ── Branch origin ──
  const branchData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of activeApps) {
      const branch = app.verified_branch_origin || "Unverified";
      counts[branch] = (counts[branch] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted.length > 0 ? sorted[0][1] : 0;
    return { entries: sorted, max, total: activeApps.length };
  }, [activeApps]);

  // ── Placement progress ──
  const placementData = useMemo(() => {
    let placed = 0;
    for (const app of activeApps) {
      if (isPlaced(app)) placed++;
    }
    return { placed, unplaced: activeApps.length - placed, total: activeApps.length };
  }, [activeApps]);

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

  // ── Sessions per week ──
  const sessionsSegments = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of activeApps) {
      const spw = String(app.sessions_per_week ?? 1);
      counts[spw] = (counts[spw] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([spw, count]) => ({
        label: `${spw}× / week`,
        count,
        color: SESSIONS_STROKE[spw] ?? GRADE_STROKE_DEFAULT,
        pillClass: SESSIONS_PILL[spw] || "bg-gray-100 dark:bg-gray-700 text-foreground",
      }));
  }, [activeApps]);

  // ── Location demand ──
  const locationData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of activeApps) {
      const code = displayLocation(app.preferred_location) || "Unknown";
      counts[code] = (counts[code] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted.length > 0 ? sorted[0][1] : 0;
    return { entries: sorted, max, total: activeApps.length };
  }, [activeApps]);

  // ── Buddy group stats ──
  const buddyData = useMemo(() => {
    let solo = 0;
    let discountEligible = 0;
    let needMore = 0;
    const groupIds = new Set<number>();
    for (const app of activeApps) {
      if (!app.buddy_group_id) { solo++; continue; }
      groupIds.add(app.buddy_group_id);
      const size = app.buddy_group_member_count ?? 1;
      if (size >= MIN_GROUP_SIZE) discountEligible++;
      else needMore++;
    }
    const grouped = activeApps.length - solo;
    return { solo, grouped, groupCount: groupIds.size, discountEligible, needMore };
  }, [activeApps]);

  // ── Discount tier breakdown (for Buddy Groups card) ──
  // Counts each active app by the tier it currently locks. Partial plans are
  // ineligible, so they don't appear; "None" collects non-partial apps that
  // didn't meet any tier. `nearMiss` counts applicants whose group is exactly
  // one member short of a better tier — matches the applicant unit of the
  // neighbouring pills.
  const discountBreakdown = useMemo(() => {
    if (!discountByAppId || discountByAppId.size === 0) return null;
    const counts = new Map<string, number>();
    let nearMiss = 0;
    let totalSaved = 0;
    for (const app of activeApps) {
      const r = discountByAppId.get(app.id);
      if (!r) continue;
      const key = r.best?.code ?? "None";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (r.nearMiss && r.nearMiss.neededMembers === 1) nearMiss++;
      totalSaved += r.amount;
    }
    const entries = Array.from(counts.entries()).sort((a, b) => {
      if (a[0] === "None") return 1;
      if (b[0] === "None") return -1;
      return b[1] - a[1];
    });
    return { entries, nearMiss, totalSaved };
  }, [activeApps, discountByAppId]);

  // ── Receipt code breakdown (for Branch Origin card) ──
  const receiptBreakdown = useMemo(() => {
    const pricing = config?.pricing_config;
    if (!pricing?.receipt_codes) return null;
    const counts = new Map<string, number>();
    let unresolved = 0;
    for (const app of activeApps) {
      const r = suggestReceiptCode(app, pricing);
      if (r.code) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
      else unresolved++;
    }
    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return { entries, unresolved };
  }, [activeApps, config]);

  // ── Submission timeline (daily, continuous) ──
  const timelineData = useMemo(() => {
    const dayCounts: Record<string, number> = {};
    for (const app of applications) {
      if (!app.submitted_at) continue;
      // Format in HK timezone regardless of browser locale
      const day = parseHKTimestamp(app.submitted_at)
        .toLocaleDateString("sv-SE", { timeZone: "Asia/Hong_Kong" });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const dates = Object.keys(dayCounts).sort();
    if (dates.length === 0) return { days: [], max: 0 };
    // Fill gaps so the line is continuous — use noon UTC to avoid DST edge cases
    const start = new Date(dates[0] + "T12:00:00Z");
    const end = new Date(dates[dates.length - 1] + "T12:00:00Z");
    const days: [string, number][] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toLocaleDateString("sv-SE", { timeZone: "UTC" });
      days.push([key, dayCounts[key] || 0]);
    }
    const max = days.reduce((m, [, c]) => Math.max(m, c), 0);
    return { days, max };
  }, [applications]);

  const placedPct = placementData.total > 0 ? Math.round((placementData.placed / placementData.total) * 100) : 0;

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
      <MarketingSnapshotCard className="lg:col-span-2" />

      {/* Row 1: Status Pipeline + Placement (full width) */}
      <ChartCard title="Status Pipeline" badge={`${statusData.total} total`} className="lg:col-span-2">
        <div className="space-y-3">
          <div className="flex h-8 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800">
            {statusData.entries.map(([status, count]) => {
              const pct = statusData.total > 0 ? (count / statusData.total) * 100 : 0;
              if (pct === 0) return null;
              const colors = STATUS_COLORS[status];
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
              const colors = STATUS_COLORS[status];
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
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Placement Progress</span>
              <span className="text-xs text-muted-foreground tabular-nums">{placedPct}%</span>
            </div>
            <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all" style={{ width: `${placedPct}%` }} />
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span
                className={cn("text-green-600 dark:text-green-400 font-medium", filters?.onPlacementFilter && "cursor-pointer hover:underline")}
                onClick={filters?.onPlacementFilter ? () => filters.onPlacementFilter!("placed") : undefined}
              >
                {placementData.placed} placed
              </span>
              <span
                className={cn("text-muted-foreground", filters?.onPlacementFilter && "cursor-pointer hover:underline")}
                onClick={filters?.onPlacementFilter ? () => filters.onPlacementFilter!("unplaced") : undefined}
              >
                {placementData.unplaced} unplaced
              </span>
            </div>
          </div>
        </div>
      </ChartCard>

      {/* Row 2: Branch Origin + Preferred Location */}
      <ChartCard title="Branch Origin" badge={`${branchData.total} active`}>
        {branchData.entries.length > 0 ? (
          <div className="space-y-1.5">
            {branchData.entries.map(([branch, count]) => {
              const isUnverified = branch === "Unverified";
              const isNew = branch === "New";
              const labelClass = isUnverified
                ? "italic text-muted-foreground border border-dashed border-gray-300 dark:border-gray-600"
                : isNew
                  ? "font-semibold border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400"
                  : cn("font-semibold", branchPillColor(branch));
              const barColor = isUnverified
                ? "bg-gray-300 dark:bg-gray-600"
                : isNew
                  ? "bg-green-400 dark:bg-green-500"
                  : branchBarColor(branch);
              return (
                <BarRow
                  key={branch}
                  label={branch}
                  labelClass={labelClass}
                  barColor={barColor}
                  count={count} total={branchData.total} maxCount={branchData.max}
                  onClick={isUnverified
                    ? filters?.onUnverifiedFilter
                    : filters?.onBranchFilter ? () => filters.onBranchFilter!(branch) : undefined}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">No active applications</div>
        )}
        {receiptBreakdown && (receiptBreakdown.entries.length > 0 || receiptBreakdown.unresolved > 0) && (
          <BreakdownStrip title="Receipt codes">
            {receiptBreakdown.entries.map(([code, count]) => (
              <BreakdownPill key={code} label={code} count={count} tone="blue" labelMono />
            ))}
            {receiptBreakdown.unresolved > 0 && (
              <BreakdownPill label="No code" count={receiptBreakdown.unresolved} />
            )}
          </BreakdownStrip>
        )}
      </ChartCard>

      <ChartCard title="Preferred Location" badge={`${locationData.total} active`}>
        {locationData.entries.length > 0 ? (
          <div className="space-y-1.5">
            {locationData.entries.map(([code, count]) => (
              <BarRow
                key={code}
                label={code}
                labelClass={cn("font-semibold", branchPillColor(code))}
                barColor={branchBarColor(code)}
                count={count} total={locationData.total} maxCount={locationData.max}
                onClick={filters?.onLocationFilter ? () => filters.onLocationFilter!(code) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">No location data</div>
        )}
      </ChartCard>

      {/* Row 3: Grade + Sessions per week (donuts side by side) */}
      <ChartCard title="Grade Distribution" badge={`${activeApps.length} active`}>
        <DonutChart segments={gradeSegments} onSegmentClick={filters?.onGradeFilter} />
      </ChartCard>

      <ChartCard title="Sessions per Week" badge={`${activeApps.length} active`}>
        <DonutChart segments={sessionsSegments} />
      </ChartCard>

      {/* Row 4: Submission Timeline */}
      {timelineData.days.length > 0 && (
        <TimelineChart days={timelineData.days} max={timelineData.max} />
      )}

      {/* Row 5: Buddy Groups */}
      <ChartCard title="Buddy Groups" className="lg:col-span-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={User} value={buddyData.solo} label="Solo applicants"
            onClick={filters?.onBuddyFilter ? () => filters.onBuddyFilter!("solo") : undefined} />
          <StatCard icon={Users} value={buddyData.grouped} label={`In ${buddyData.groupCount} buddy groups`}
            onClick={filters?.onBuddyFilter ? () => filters.onBuddyFilter!("grouped") : undefined} />
          <StatCard icon={Users} value={buddyData.discountEligible} label="Discount eligible"
            colorClass="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
            onClick={filters?.onBuddyFilter ? () => filters.onBuddyFilter!("threshold") : undefined} />
          <StatCard icon={Users} value={buddyData.needMore} label="Need more buddies"
            colorClass="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
            onClick={filters?.onBuddyFilter ? () => filters.onBuddyFilter!("below") : undefined} />
        </div>
        {discountBreakdown && discountBreakdown.entries.length > 0 && (
          <BreakdownStrip
            title="Locked discount tier"
            trailing={discountBreakdown.totalSaved > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                −${discountBreakdown.totalSaved.toLocaleString()} total
              </span>
            )}
          >
            {discountBreakdown.entries.map(([code, count]) => {
              const isNone = code === "None";
              return (
                <BreakdownPill
                  key={code}
                  label={isNone ? "No discount" : code}
                  count={count}
                  tone={isNone ? "default" : "emerald"}
                  labelMono={!isNone}
                />
              );
            })}
            {discountBreakdown.nearMiss > 0 && (
              <BreakdownPill label="Near miss" count={discountBreakdown.nearMiss} tone="amber" />
            )}
          </BreakdownStrip>
        )}
      </ChartCard>
    </div>
  );
}


// ── Marketing snapshot push card ───────────────────────────────────────────

function MarketingSnapshotCard({ className }: { className?: string }) {
  const { showToast, showError } = useToast();
  const [pushing, setPushing] = useState(false);
  const [lastResult, setLastResult] = useState<SummerMarketingSnapshotResponse | null>(null);
  const [lastPushedAt, setLastPushedAt] = useState<Date | null>(null);

  const handlePush = async () => {
    setPushing(true);
    try {
      const result = await summerAPI.pushMarketingSnapshot();
      setLastResult(result);
      setLastPushedAt(new Date());
      const msg =
        result.action === "skipped"
          ? `Skipped: ${result.reason ?? "no active config"}`
          : `${result.action === "updated" ? "Updated" : "Appended"} row ${result.row_index} for ${result.as_of_date}`;
      showToast(msg, "success");
    } catch (e) {
      showError(e, "Failed to push snapshot");
    } finally {
      setPushing(false);
    }
  };

  const sheetUrl = lastResult?.spreadsheet_id
    ? `https://docs.google.com/spreadsheets/d/${lastResult.spreadsheet_id}/edit`
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-5 flex flex-wrap items-center gap-x-4 gap-y-2",
        className,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">Marketing snapshot</div>
        <div className="hidden sm:block text-xs text-muted-foreground mt-0.5">
          Push today&rsquo;s applicant counts (split by location, bucket, status) to the marketing Google Sheet.
          Re-running on the same day overwrites the existing row.
        </div>
        {lastResult && lastPushedAt && (
          <div className="text-[11px] text-muted-foreground mt-1 sm:mt-2 tabular-nums">
            Last push {lastPushedAt.toLocaleTimeString()} —{" "}
            {lastResult.action === "skipped" ? (
              <span className="font-medium text-foreground">
                skipped ({lastResult.reason ?? "no active config"})
              </span>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {lastResult.action} row {lastResult.row_index}
                </span>{" "}
                for <span className="font-mono">{lastResult.as_of_date}</span> in tab{" "}
                <span className="font-mono">{lastResult.tab_name}</span>
                {sheetUrl && (
                  <a
                    href={sheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handlePush}
        disabled={pushing}
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          pushing
            ? "bg-gray-100 text-muted-foreground cursor-not-allowed dark:bg-gray-800"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {pushing ? "Pushing…" : <><span className="sm:hidden">Push</span><span className="hidden sm:inline">Push snapshot</span></>}
      </button>
    </div>
  );
}
