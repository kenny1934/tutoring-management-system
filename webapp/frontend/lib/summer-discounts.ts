// Discount eligibility and fee computation for summer course applications.
//
// Discounts from `pricing_config.discounts` are NOT stackable — an application
// gets the single best-amount discount it qualifies for. Each discount can
// gate on `before_date` (a submission deadline) and/or `min_group_size` (how
// many members must be in the applicant's buddy group).
//
// The deadline comparison uses different timestamps depending on the gate:
// - Solo discounts (no min_group_size) compare against the applicant's own
//   submitted_at — each applicant locks in at their individual submit time.
// - Group discounts compare against the moment the group reached N members,
//   which is the Nth-smallest buddy_joined_at across the group's current
//   non-exit members. This matches the admin mental model: the whole group
//   locks in together the day the Nth member joined.
//
// Exit-status members (Withdrawn, Rejected) are excluded from the group size
// count, so a rejected 4th member can't keep an otherwise-qualifying trio
// gated to the wrong tier.

import type { SummerApplication, SummerPricingConfig } from "@/types";
import { EXIT_STATUSES } from "@/lib/summer-utils";

export type DiscountEntry = NonNullable<SummerPricingConfig["discounts"]>[number];

export type DiscountResult = {
  // The best discount the applicant currently qualifies for, or null if none.
  best: DiscountEntry | null;
  // Dollar amount knocked off (0 when best is null).
  amount: number;
  // base_fee - amount.
  finalFee: number;
  // A better-tier discount the applicant is close to, plus the *additional*
  // savings on top of `best` if they unlock it. Null when there is no better
  // tier, or when unlocking requires something non-actionable (date passed).
  nearMiss: {
    discount: DiscountEntry;
    extraSavings: number;
    // How many more members are needed, if the gate is group-size.
    neededMembers?: number;
  } | null;
};

/** Nth-smallest buddy_joined_at among non-exit members, or null if fewer. */
function nthJoinedAt(members: SummerApplication[], n: number): string | null {
  const times = members
    .filter((m) => !EXIT_STATUSES.has(m.application_status))
    .map((m) => m.buddy_joined_at)
    .filter((t): t is string => !!t)
    .sort();
  return times.length >= n ? times[n - 1] : null;
}

function activeMemberCount(members: SummerApplication[]): number {
  return members.filter((m) => !EXIT_STATUSES.has(m.application_status)).length;
}

function qualifies(
  d: DiscountEntry,
  app: SummerApplication,
  groupMembers: SummerApplication[],
): boolean {
  const minSize = d.conditions?.min_group_size;
  if (typeof minSize === "number" && minSize > 1) {
    if (activeMemberCount(groupMembers) < minSize) return false;
    if (d.conditions?.before_date) {
      const reachAt = nthJoinedAt(groupMembers, minSize);
      if (!reachAt || reachAt >= d.conditions.before_date) return false;
    }
  } else if (d.conditions?.before_date) {
    // Solo discount — each applicant locks in at their own submit time.
    if (!app.submitted_at || app.submitted_at >= d.conditions.before_date) {
      return false;
    }
  }
  return true;
}

/**
 * Compute the best discount an applicant currently qualifies for.
 *
 * `groupMembers` should be the full list of applications in the applicant's
 * buddy group (including the applicant themselves). Pass `[app]` for a solo
 * applicant — the helper tolerates either.
 */
export function computeBestDiscount(
  app: SummerApplication,
  groupMembers: SummerApplication[],
  config: SummerPricingConfig | null | undefined,
): DiscountResult {
  const baseFee = config?.base_fee ?? 0;
  const discounts = config?.discounts ?? [];

  let best: DiscountEntry | null = null;
  for (const d of discounts) {
    if (!qualifies(d, app, groupMembers)) continue;
    if (!best || d.amount > best.amount) best = d;
  }

  // "Near miss": any discount with a higher amount than `best` that is one
  // buddy short of qualifying AND whose deadline hasn't already lapsed.
  let nearMiss: DiscountResult["nearMiss"] = null;
  const bestAmount = best?.amount ?? 0;
  const activeCount = activeMemberCount(groupMembers);
  for (const d of discounts) {
    if (d.amount <= bestAmount) continue;
    const minSize = d.conditions?.min_group_size;
    if (typeof minSize !== "number" || minSize <= activeCount) continue;
    const needed = minSize - activeCount;
    // Only nudge if the deadline is still achievable in principle. We can't
    // know the exact future reach-date, but we can rule out a discount whose
    // deadline is already in the past.
    if (d.conditions?.before_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (d.conditions.before_date <= today) continue;
    }
    const extra = d.amount - bestAmount;
    if (!nearMiss || extra > nearMiss.extraSavings) {
      nearMiss = { discount: d, extraSavings: extra, neededMembers: needed };
    }
  }

  return {
    best,
    amount: best?.amount ?? 0,
    finalFee: baseFee - (best?.amount ?? 0),
    nearMiss,
  };
}

/**
 * Compute the best discount for every application in a batch, bucketing
 * buddy-grouped members together so the Nth-joined calculation is correct.
 * Solo applicants get evaluated against themselves as a group of 1.
 */
export function computeDiscountsForAll(
  apps: SummerApplication[],
  config: SummerPricingConfig | null | undefined,
): Map<number, DiscountResult> {
  const byGroup = new Map<number, SummerApplication[]>();
  for (const app of apps) {
    if (app.buddy_group_id == null) continue;
    const list = byGroup.get(app.buddy_group_id);
    if (list) list.push(app);
    else byGroup.set(app.buddy_group_id, [app]);
  }
  const out = new Map<number, DiscountResult>();
  for (const app of apps) {
    const members = app.buddy_group_id != null
      ? byGroup.get(app.buddy_group_id) ?? [app]
      : [app];
    out.set(app.id, computeBestDiscount(app, members, config));
  }
  return out;
}
