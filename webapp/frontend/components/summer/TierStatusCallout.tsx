"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
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
  today,
  className,
}: Props) {
  const effectiveCode = overrideCode || currentCode || "NONE";
  const effective = tierEntry(config, effectiveCode);
  const isOverride = !!overrideCode;

  // Detect a forfeited higher tier: any discount with a larger amount whose
  // before_date has already passed. Shown so admins understand *why* the
  // applicant is on the current tier.
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  const currentAmt = effective?.amount ?? 0;
  const forfeited = (config?.discounts ?? []).find((d) => {
    if (d.amount <= currentAmt) return false;
    if (!d.conditions?.before_date) return false;
    return d.conditions.before_date <= todayIso;
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
