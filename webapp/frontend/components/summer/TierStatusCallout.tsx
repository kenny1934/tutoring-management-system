"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { hkTodayIso } from "@/lib/summer-utils";
import type { SummerPricingConfig } from "@/types";

// Pure display component for the current discount-tier state of an application
// or published enrollment. Reads tier metadata from the config so copy stays
// in sync with the seed/admin-edited pricing_config (no hardcoded tier names).

type Tone = "ok" | "warn" | "override" | "none";

interface Props {
  config: SummerPricingConfig | null | undefined;
  currentCode: string | null | undefined;
  currentAmount?: number | null;
  overrideCode?: string | null;
  overrideReason?: string | null;
  overrideBy?: string | null;
  overrideAt?: string | null;
  // The applicant's submission timestamp (ISO). Used to suppress the
  // "forfeited" flag for a higher tier whose deadline had already passed when
  // they applied — they never could have qualified, so nothing was forfeited.
  submittedAt?: string | null;
  // The applicant's active buddy-group size (from computeBestDiscount's member
  // list). Used to suppress the "forfeited" flag for a group tier whose
  // min_group_size the applicant never reached — they had nothing to forfeit.
  // When omitted, the group-size check is skipped (deadline-only behaviour).
  groupSize?: number | null;
  today?: string;  // ISO date; defaults to browser today
  className?: string;
}

function tierEntry(config: SummerPricingConfig | null | undefined, code: string | null | undefined) {
  if (!config?.discounts || !code) return null;
  return config.discounts.find((d) => d.code === code) ?? null;
}

function formatDeadline(raw: string | undefined): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TierStatusCallout({
  config,
  currentCode,
  currentAmount,
  overrideCode,
  overrideReason,
  overrideBy,
  overrideAt,
  submittedAt,
  groupSize,
  today,
  className,
}: Props) {
  const effectiveCode = overrideCode || currentCode || "NONE";
  const effective = tierEntry(config, effectiveCode);
  const isOverride = !!overrideCode;

  // Detect a forfeited higher tier: any discount with a larger amount whose
  // before_date has already passed. Shown so admins understand *why* the
  // applicant is on the current tier.
  const todayIso = today ?? hkTodayIso();
  const submittedDate = submittedAt ? submittedAt.slice(0, 10) : null;
  const currentAmt = effective?.amount ?? 0;
  // Proven group size: the larger of the counted active members and the current
  // tier's own min_group_size. The current tier was actually granted, so its
  // requirement is a lower bound on the real group — this keeps the check right
  // on surfaces (e.g. the enrollment page) that don't load the full group list.
  const knownGroupSize =
    groupSize != null
      ? Math.max(groupSize, effective?.conditions?.min_group_size ?? 0)
      : null;
  const forfeited = (config?.discounts ?? []).find((d) => {
    if (d.amount <= currentAmt) return false;
    if (!d.conditions?.before_date) return false;
    // A group tier the applicant's buddy group was never big enough to reach
    // isn't "forfeited" — there was nothing to lose. (A group that did reach the
    // size but completed it late still counts as reached, so it stays flagged.)
    const minSize = d.conditions?.min_group_size;
    if (typeof minSize === "number" && knownGroupSize != null && knownGroupSize < minSize) {
      return false;
    }
    // A tier the applicant could never have reached isn't "forfeited": if they
    // applied after its deadline (inclusive), it was already unavailable to them.
    if (submittedDate && submittedDate > d.conditions.before_date) return false;
    // Deadline is inclusive — a tier is only forfeited once its before_date is
    // strictly in the past (HK time). On the deadline day itself it's still live.
    return d.conditions.before_date < todayIso;
  });

  const tone: Tone = isOverride ? "override" : forfeited ? "warn" : "none";

  // Nothing noteworthy to flag: current tier is auto-computed and no higher
  // tier was forfeited. The fee block above already shows code, amount and
  // near-miss hint, so this callout would just add noise.
  if (tone === "none") return null;

  const bg =
    tone === "override"
      ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800"
      : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
  const Icon = tone === "override" ? Shield : AlertTriangle;
  const iconColor =
    tone === "override"
      ? "text-indigo-600 dark:text-indigo-400"
      : "text-amber-600 dark:text-amber-400";

  const tierLabel = effective
    ? `${effective.name_zh || effective.name_en} (${effective.code})`
    : "No discount";

  let headline: React.ReactNode;
  if (isOverride) {
    headline = (
      <>
        Override: <strong>{tierLabel}</strong>
      </>
    );
  } else if (forfeited) {
    const forfeitedLabel = forfeited.name_zh || forfeited.name_en;
    headline = (
      <>
        <strong>{forfeitedLabel}</strong> forfeited. Deadline {formatDeadline(forfeited.conditions?.before_date)} passed.
      </>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        bg,
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="leading-snug">{headline}</div>
        {isOverride && (
          <div className="mt-0.5 text-muted-foreground space-y-0.5">
            {overrideReason && <div>{overrideReason}</div>}
            {(overrideBy || overrideAt) && (
              <div>
                by {overrideBy ?? "admin"}
                {overrideAt && ` · ${overrideAt.slice(0, 10)}`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
