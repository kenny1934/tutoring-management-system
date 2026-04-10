"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { BRANCH_INFO, EXIT_STATUSES } from "@/lib/summer-utils";
import { AlertCircle } from "lucide-react";
import type { SummerApplication } from "@/types";

// Extra bar colors for branches not in BRANCH_INFO
const EXTRA_BAR_COLOR: Record<string, string> = {
  MSA: "bg-blue-400",
  MSB: "bg-purple-400",
  New: "bg-green-500",
};
const DEFAULT_BAR_COLOR = "bg-gray-400";

function branchBarColor(branch: string): string {
  return BRANCH_INFO[branch]?.dot ?? EXTRA_BAR_COLOR[branch] ?? DEFAULT_BAR_COLOR;
}

interface Props {
  applications: SummerApplication[];
}

export function SummerApplicationStats({ applications }: Props) {
  const activeApps = useMemo(
    () => applications.filter((a) => !EXIT_STATUSES.has(a.application_status)),
    [applications],
  );

  const { verified, unverified, branchCounts, maxCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let v = 0;
    let u = 0;
    for (const app of activeApps) {
      const branch = app.verified_branch_origin;
      if (branch) {
        v++;
        counts[branch] = (counts[branch] || 0) + 1;
      } else {
        u++;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted.length > 0 ? sorted[0][1] : 0;
    return { verified: v, unverified: u, branchCounts: sorted, maxCount: max };
  }, [activeApps]);

  const total = activeApps.length;
  const pctVerified = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Verification progress */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Branch Origin Verification</span>
          <span className="text-xs text-muted-foreground">
            {verified}/{total} verified ({pctVerified}%)
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${pctVerified}%` }}
          />
        </div>
        {unverified > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {unverified} application{unverified !== 1 ? "s" : ""} still unverified
          </div>
        )}
      </div>

      {/* Branch distribution chart */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <span className="text-sm font-medium text-foreground">Branch Origin Distribution</span>
        {branchCounts.length > 0 ? (
          <div className="space-y-2">
            {branchCounts.map(([branch, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              return (
                <div key={branch} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-8 shrink-0 text-right text-foreground">{branch}</span>
                  <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
                    <div
                      className={cn("h-full rounded transition-all", branchBarColor(branch))}
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-foreground/70">
                      {count}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 shrink-0 tabular-nums">{pct}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No verified branch origins yet
          </div>
        )}
      </div>

      {/* Status breakdown */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <span className="text-sm font-medium text-foreground">Status Breakdown</span>
        <StatusBreakdown applications={applications} />
      </div>
    </div>
  );
}

function StatusBreakdown({ applications }: { applications: SummerApplication[] }) {
  const { statusCounts, maxCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of applications) {
      counts[app.application_status] = (counts[app.application_status] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { statusCounts: sorted, maxCount: sorted.length > 0 ? sorted[0][1] : 0 };
  }, [applications]);

  const total = applications.length;

  return (
    <div className="space-y-1.5">
      {statusCounts.map(([status, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
        return (
          <div key={status} className="flex items-center gap-3">
            <span className="text-xs w-32 shrink-0 text-foreground">{status}</span>
            <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden relative">
              <div
                className="h-full bg-primary/60 rounded transition-all"
                style={{ width: `${barWidth}%` }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-medium text-foreground/70">
                {count}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground w-8 shrink-0 tabular-nums">{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
