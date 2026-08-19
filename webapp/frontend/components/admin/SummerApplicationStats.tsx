"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BRANCH_INFO, EXIT_STATUSES, displayLocation, MIN_GROUP_SIZE, isPlaced } from "@/lib/summer-utils";
import { STATUS_COLORS, ALL_STATUSES } from "./SummerApplicationCard";
import {
  BarRow,
  BreakdownPill,
  BreakdownStrip,
  ChartCard,
  DonutChart,
  GRADE_STROKE_DEFAULT,
  StatCard,
  StatsEmptyState,
  StatusPipeline,
  TimelineChart,
  buildTimelineData,
  gradeDonutSegments,
  type StatsFilterHandler,
} from "./application-stats-atoms";
import { Users, User, Send, Loader2, ExternalLink } from "lucide-react";
import { summerAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import BranchRevenueCard from "./BranchRevenueCard";
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

const SESSIONS_STROKE: Record<string, string> = { "1": "#3b82f6", "2": "#f59e0b" };
const SESSIONS_PILL: Record<string, string> = {
  "1": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "2": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  applications: SummerApplication[];
  filters?: StatsFilterHandler;
  config?: SummerCourseConfig | null;
  discountByAppId?: Map<number, DiscountResult>;
  readOnly?: boolean;
}

export function SummerApplicationStats({ applications, filters, config, discountByAppId, readOnly = false }: Props) {
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
  const gradeSegments = useMemo(() => gradeDonutSegments(activeApps), [activeApps]);

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
  const timelineData = useMemo(
    () => buildTimelineData(applications.map((a) => a.submitted_at)),
    [applications],
  );

  const placedPct = placementData.total > 0 ? Math.round((placementData.placed / placementData.total) * 100) : 0;

  if (applications.length === 0) {
    return <StatsEmptyState />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {!readOnly && <MarketingSnapshotCard className="lg:col-span-2" />}
      {!readOnly && <BranchRevenueCard className="lg:col-span-2" />}

      {/* Row 1: Status Pipeline + Placement (full width) */}
      <ChartCard title="Status Pipeline" badge={`${statusData.total} total`} className="lg:col-span-2">
        <div className="space-y-3">
          <StatusPipeline
            entries={statusData.entries}
            total={statusData.total}
            colors={STATUS_COLORS}
            onStatusFilter={filters?.onStatusFilter}
          />
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
