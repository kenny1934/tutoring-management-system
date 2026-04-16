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
  // Payment context for the "forfeited" message.
  paidAt?: string | null;
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
  paidAt,
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

  const tone: Tone = isOverride
    ? "override"
    : forfeited
    ? "warn"
    : effective
    ? "ok"
    : "none";

  const bg =
    tone === "override"
      ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800"
      : tone === "warn"
      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
      : tone === "ok"
      ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
      : "bg-gray-50 border-gray-200 dark:bg-gray-900/40 dark:border-gray-700";
  const Icon =
    tone === "override" ? Shield : tone === "warn" ? AlertTriangle : CheckCircle2;
  const iconColor =
    tone === "override"
      ? "text-indigo-600 dark:text-indigo-400"
      : tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-gray-500";

  const tierLabel = effective
    ? `${effective.name_zh || effective.name_en} (${effective.code})`
    : "No discount";

  const deadline = effective?.conditions?.before_date;
  const amount = currentAmount ?? effective?.amount ?? 0;

  let headline: React.ReactNode;
  if (isOverride) {
    headline = (
      <>
        Override locked: <strong>{tierLabel}</strong> {amount > 0 && `− $${amount}`}
      </>
    );
  } else if (forfeited && effective) {
    const forfeitedLabel = forfeited.name_zh || forfeited.name_en;
    headline = (
      <>
        <strong>{forfeitedLabel}</strong> forfeited — deadline {formatDeadline(forfeited.conditions?.before_date)} passed.
        Current tier: <strong>{tierLabel}</strong> {amount > 0 && `− $${amount}`}
      </>
    );
  } else if (forfeited && !effective) {
    const forfeitedLabel = forfeited.name_zh || forfeited.name_en;
    headline = (
      <>
        <strong>{forfeitedLabel}</strong> forfeited — deadline {formatDeadline(forfeited.conditions?.before_date)} passed.
        No discount currently qualifies.
      </>
    );
  } else if (effective && deadline) {
    headline = (
      <>
        <strong>{tierLabel}</strong> {amount > 0 && `− $${amount}`} — locks in once paid by {formatDeadline(deadline)}.
      </>
    );
  } else if (effective) {
    headline = (
      <>
        <strong>{tierLabel}</strong> {amount > 0 && `− $${amount}`}
      </>
    );
  } else {
    headline = <>No discount applies.</>;
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        bg,
        className
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0 mt-0.5", iconColor)} />
      <div className="flex-1 min-w-0">
        <div className="leading-snug">{headline}</div>
        {isOverride && (
          <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
            {overrideReason && <div>Reason: {overrideReason}</div>}
            {(overrideBy || overrideAt) && (
              <div>
                Set by {overrideBy ?? "admin"}
                {overrideAt && ` on ${overrideAt.slice(0, 10)}`}
              </div>
            )}
          </div>
        )}
        {!isOverride && paidAt && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Payment recorded {paidAt.slice(0, 10)}
          </div>
        )}
      </div>
    </div>
  );
}
