"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { BRANCH_INFO, EXIT_STATUSES } from "@/lib/summer-utils";
import type { SummerApplication } from "@/types";

const EXTRA_BAR_COLOR: Record<string, string> = {
  MSA: "bg-blue-400",
  MSB: "bg-purple-400",
  New: "bg-green-500",
};

const EXTRA_PILL_COLOR: Record<string, string> = {
  MSA: "bg-blue-400/15 text-blue-600 dark:text-blue-400",
  MSB: "bg-purple-400/15 text-purple-600 dark:text-purple-400",
  New: "bg-green-500/15 text-green-600 dark:text-green-400",
};

function branchBarColor(branch: string): string {
  return BRANCH_INFO[branch]?.dot ?? EXTRA_BAR_COLOR[branch] ?? "bg-gray-300 dark:bg-gray-600";
}

function branchPillColor(branch: string): string {
  return BRANCH_INFO[branch]?.badge ?? EXTRA_PILL_COLOR[branch] ?? "bg-gray-100 dark:bg-gray-800 text-muted-foreground";
}

interface Props {
  applications: SummerApplication[];
}

export function SummerApplicationStats({ applications }: Props) {
  const { branchCounts, maxCount, total } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const app of applications) {
      if (EXIT_STATUSES.has(app.application_status)) continue;
      const branch = app.verified_branch_origin || "Unverified";
      counts[branch] = (counts[branch] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted.length > 0 ? sorted[0][1] : 0;
    const t = sorted.reduce((sum, [, c]) => sum + c, 0);
    return { branchCounts: sorted, maxCount: max, total: t };
  }, [applications]);

  return (
    <div className="max-w-xl">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Branch Origin Distribution</span>
          <span className="text-xs text-muted-foreground tabular-nums">{total} active applicants</span>
        </div>
        {branchCounts.length > 0 ? (
          <div className="space-y-1.5">
            {branchCounts.map(([branch, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
              const isUnverified = branch === "Unverified";
              return (
                <div key={branch} className="flex items-center gap-2.5">
                  <span className={cn(
                    "shrink-0 w-20 text-right",
                    isUnverified
                      ? "text-[10px] italic text-muted-foreground px-1.5 py-0.5 rounded border border-dashed border-gray-300 dark:border-gray-600"
                      : "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    !isUnverified && branchPillColor(branch),
                  )}>
                    {branch}
                  </span>
                  <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-md transition-all",
                        isUnverified ? "bg-gray-300 dark:bg-gray-600" : branchBarColor(branch),
                      )}
                      style={{ width: `${barWidth}%`, minWidth: barWidth > 0 ? "4px" : "0" }}
                    />
                  </div>
                  <span className="shrink-0 text-xs font-medium text-foreground tabular-nums w-7 text-right">
                    {count}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No active applications
          </div>
        )}
      </div>
    </div>
  );
}
