// Discount eligibility and fee computation for summer course applications.
//
// Discounts from `pricing_config.discounts` are NOT stackable — an application
// gets the single best-amount discount it qualifies for. Each discount can
// gate on `before_date` (a submission deadline) and/or `min_group_size` (how
// many members must be in the applicant's buddy group).
//
// The deadline comparison is payment-aware: the tier only qualifies if the
// applicant actually paid by the deadline. Effective date = paid_at when set,
// else today. Unpaid applications past the deadline cascade to the next tier.
//
// Group discounts with a `before_date` have two gates, both must pass:
// - The group must have reached N members by before_date (whole-group gate,
//   using Nth-smallest buddy_joined_at / sibling created_at).
// - THIS applicant must have paid by before_date (per-applicant gate, using
//   paid_at / today). So in a buddy-3, the on-time payer keeps EB3P while
//   the late payer drops to 3P.
//
// Exit-status members (Withdrawn, Rejected) are excluded from the group size
// count, so a rejected 4th member can't keep an otherwise-qualifying trio
// gated to the wrong tier. Declared siblings (SummerBuddyMember rows without
// their own application) count optimistically — Pending + Confirmed both count
// toward the threshold, using their `created_at` as the "joined at" timestamp
// for the Nth-joined date check.

import type { SummerApplication, SummerPricingConfig } from "@/types";
import { EXIT_STATUSES, nonRejectedSiblings } from "@/lib/summer-utils";

export type DiscountEntry = NonNullable<SummerPricingConfig["discounts"]>[number];

export const DEFAULT_PARTIAL_PER_LESSON_RATE = 400;

export function isPartialApp(app: SummerApplication): boolean {
  return app.lessons_paid < app.total_lessons;
}

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

// Backend denormalises the group's full sibling list onto every member's
// `buddy_siblings`, so reading off `members[0]` gives the whole group.
function groupSiblings(members: SummerApplication[]) {
  return nonRejectedSiblings(members[0]?.buddy_siblings);
}

/** Nth-smallest join timestamp among non-exit apps + non-rejected siblings, or null if fewer. */
function nthJoinedAt(members: SummerApplication[], n: number): string | null {
  const appTimes = members
    .filter((m) => !EXIT_STATUSES.has(m.application_status) && !isPartialApp(m))
    .map((m) => m.buddy_joined_at)
    .filter((t): t is string => !!t);
  const sibTimes = groupSiblings(members)
    .map((s) => s.created_at)
    .filter((t): t is string => !!t);
  const times = [...appTimes, ...sibTimes].sort();
  return times.length >= n ? times[n - 1] : null;
}

function activeMemberCount(members: SummerApplication[]): number {
  // Partial-plan apps are ineligible for group discounts and must not inflate
  // their siblings' group size either.
  const apps = members.filter(
    (m) => !EXIT_STATUSES.has(m.application_status) && !isPartialApp(m),
  ).length;
  return apps + groupSiblings(members).length;
}

/** Date used to compare against before_date deadlines.
 *  Prefers paid_at (actual payment date, set when admin marks Paid) and
 *  falls back to today — so an unpaid applicant past the deadline fails
 *  deadline-gated tiers, while a paid applicant locks in their tier. */
function effectiveDate(app: SummerApplication): string {
  if (app.paid_at) return app.paid_at.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
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
      // Whole-group gate: group must have hit N by deadline (inclusive —
      // reaching size on the deadline day still counts).
      const reachAt = nthJoinedAt(groupMembers, minSize);
      const reachDate = reachAt?.slice(0, 10);
      if (!reachDate || reachDate > d.conditions.before_date) return false;
      // Per-applicant gate: THIS applicant must have paid by deadline.
      if (effectiveDate(app) > d.conditions.before_date) return false;
    }
  } else if (d.conditions?.before_date) {
    // Solo early-bird — applicant's own effective date must beat deadline.
    if (effectiveDate(app) > d.conditions.before_date) return false;
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
  if (isPartialApp(app)) {
    const rate = config?.partial_per_lesson_rate ?? DEFAULT_PARTIAL_PER_LESSON_RATE;
    return {
      best: null,
      amount: 0,
      finalFee: app.lessons_paid * rate,
      nearMiss: null,
    };
  }
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
