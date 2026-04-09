"use client";

import { cn } from "@/lib/utils";
import type { DiscountResult } from "@/lib/summer-discounts";

// Compact chip for list/board views: shows the applied discount code and
// amount when one is unlocked, or the near-miss nudge when the applicant is
// one member away from a better tier. Returns null when neither applies so
// cards stay uncluttered for full-price applicants with no path to a tier.
export function DiscountChip({ result, className }: { result: DiscountResult; className?: string }) {
  if (result.best) {
    return (
      <span
        className={cn(
          "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold",
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
          className,
        )}
        title={`${result.best.name_en} — ${result.best.name_zh}`}
      >
        {result.best.code}
        <span className="font-sans">−${result.amount}</span>
      </span>
    );
  }
  if (result.nearMiss) {
    const { discount, extraSavings, neededMembers } = result.nearMiss;
    return (
      <span
        className={cn(
          "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold",
          "border border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",
          className,
        )}
        title={`${neededMembers} more member${neededMembers === 1 ? "" : "s"} to unlock ${discount.name_en} (−$${extraSavings} more)`}
      >
        +{neededMembers} → {discount.code}
      </span>
    );
  }
  return null;
}
