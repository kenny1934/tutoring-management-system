import { describe, it, expect, vi } from "vitest";
import {
  computeBestDiscount,
  DEFAULT_PARTIAL_PER_LESSON_RATE,
  isPartialApp,
} from "./summer-discounts";
import type { SummerApplication, SummerPricingConfig } from "@/types";

function makeApp(overrides: Partial<SummerApplication> = {}): SummerApplication {
  return {
    id: 1,
    config_id: 1,
    reference_code: "SC2026-A",
    student_name: "Student",
    grade: "F1",
    application_status: "Placement Confirmed",
    lessons_paid: 8,
    total_lessons: 8,
    submitted_at: "2026-04-01T00:00:00",
    ...overrides,
  } as SummerApplication;
}

const GROUP_3P: NonNullable<SummerPricingConfig["discounts"]>[number] = {
  code: "3P",
  name_zh: "三人同行",
  name_en: "Group of 3+",
  amount: 300,
  conditions: { min_group_size: 3 },
};

const PRICING: SummerPricingConfig = {
  base_fee: 1500,
  discounts: [GROUP_3P],
};

describe("isPartialApp", () => {
  it("treats lessons_paid < total_lessons as partial", () => {
    expect(isPartialApp(makeApp({ lessons_paid: 4, total_lessons: 8 }))).toBe(true);
  });

  it("treats lessons_paid === total_lessons as full", () => {
    expect(isPartialApp(makeApp({ lessons_paid: 8, total_lessons: 8 }))).toBe(false);
  });
});

describe("computeBestDiscount — partial plan", () => {
  it("short-circuits to flat per-lesson rate, no discount, no near-miss", () => {
    const app = makeApp({ lessons_paid: 4, total_lessons: 8 });
    const result = computeBestDiscount(app, [app], PRICING);
    expect(result.best).toBeNull();
    expect(result.amount).toBe(0);
    expect(result.finalFee).toBe(4 * DEFAULT_PARTIAL_PER_LESSON_RATE);
    expect(result.nearMiss).toBeNull();
  });

  it("honours pricing_config.partial_per_lesson_rate override", () => {
    const app = makeApp({ lessons_paid: 5, total_lessons: 8 });
    const result = computeBestDiscount(app, [app], { ...PRICING, partial_per_lesson_rate: 380 });
    expect(result.finalFee).toBe(5 * 380);
  });

  it("still returns flat rate even when the group would otherwise qualify for a discount", () => {
    const partial = makeApp({ id: 10, lessons_paid: 4, total_lessons: 8, buddy_group_id: 99, buddy_joined_at: "2026-04-01T00:00:00" });
    const sibA = makeApp({ id: 11, buddy_group_id: 99, buddy_joined_at: "2026-04-02T00:00:00" });
    const sibB = makeApp({ id: 12, buddy_group_id: 99, buddy_joined_at: "2026-04-03T00:00:00" });
    const result = computeBestDiscount(partial, [partial, sibA, sibB], PRICING);
    expect(result.best).toBeNull();
    expect(result.finalFee).toBe(4 * DEFAULT_PARTIAL_PER_LESSON_RATE);
  });
});

describe("computeBestDiscount — partial sibling exclusion from group count", () => {
  it("does not credit a partial sibling toward another app's group-size threshold", () => {
    // 2 full apps + 1 partial app → group-size effectively 2 for discount math,
    // so the 3P tier should NOT unlock for the full apps.
    const full1 = makeApp({ id: 1, buddy_group_id: 7, buddy_joined_at: "2026-04-01T00:00:00" });
    const full2 = makeApp({ id: 2, buddy_group_id: 7, buddy_joined_at: "2026-04-02T00:00:00" });
    const partial = makeApp({ id: 3, buddy_group_id: 7, buddy_joined_at: "2026-04-03T00:00:00", lessons_paid: 4 });
    const members = [full1, full2, partial];
    const result = computeBestDiscount(full1, members, PRICING);
    expect(result.best).toBeNull();
    expect(result.finalFee).toBe(1500);
  });

  it("unlocks the 3P tier when all three siblings are full-plan", () => {
    const m1 = makeApp({ id: 1, buddy_group_id: 7, buddy_joined_at: "2026-04-01T00:00:00" });
    const m2 = makeApp({ id: 2, buddy_group_id: 7, buddy_joined_at: "2026-04-02T00:00:00" });
    const m3 = makeApp({ id: 3, buddy_group_id: 7, buddy_joined_at: "2026-04-03T00:00:00" });
    const result = computeBestDiscount(m1, [m1, m2, m3], PRICING);
    expect(result.best?.code).toBe("3P");
    expect(result.finalFee).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// Payment-aware deadline checks. `qualifies()` uses paid_at (falling back to
// today) vs. before_date, with > comparison so the deadline day itself counts
// as on-time.
// ---------------------------------------------------------------------------

const EB: NonNullable<SummerPricingConfig["discounts"]>[number] = {
  code: "EB",
  name_zh: "早鳥",
  name_en: "Early Bird",
  amount: 150,
  conditions: { before_date: "2026-06-15" },
};

const EB3P: NonNullable<SummerPricingConfig["discounts"]>[number] = {
  code: "EB3P",
  name_zh: "早鳥三人同行",
  name_en: "Early Bird Group of 3+",
  amount: 500,
  conditions: { before_date: "2026-06-15", min_group_size: 3 },
};

const PRICING_TIERED: SummerPricingConfig = {
  base_fee: 1600,
  discounts: [EB, EB3P, GROUP_3P],
};

describe("computeBestDiscount — solo early-bird payment gate", () => {
  it("qualifies when paid before the deadline", () => {
    const app = makeApp({ paid_at: "2026-06-10T00:00:00" });
    const r = computeBestDiscount(app, [app], { ...PRICING_TIERED, discounts: [EB] });
    expect(r.best?.code).toBe("EB");
  });

  it("qualifies when paid on the deadline day itself (inclusive)", () => {
    const app = makeApp({ paid_at: "2026-06-15T00:00:00" });
    const r = computeBestDiscount(app, [app], { ...PRICING_TIERED, discounts: [EB] });
    expect(r.best?.code).toBe("EB");
  });

  it("fails when paid the day after the deadline", () => {
    const app = makeApp({ paid_at: "2026-06-16T00:00:00" });
    const r = computeBestDiscount(app, [app], { ...PRICING_TIERED, discounts: [EB] });
    expect(r.best).toBeNull();
  });

  it("unpaid apps near the deadline still qualify (fall back to today)", () => {
    vi.useFakeTimers();
    // UTC noon well before the deadline — TZ-safe across HK/UTC runners.
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
    const app = makeApp({ paid_at: undefined, application_status: "Submitted" });
    const r = computeBestDiscount(app, [app], { ...PRICING_TIERED, discounts: [EB] });
    expect(r.best?.code).toBe("EB");
    vi.useRealTimers();
  });

  it("unpaid apps past the deadline lose the tier", () => {
    vi.useFakeTimers();
    // Well past the deadline so UTC/local timezone skew can't flip the day.
    vi.setSystemTime(new Date("2026-06-18T12:00:00Z"));
    const app = makeApp({ paid_at: undefined, application_status: "Submitted" });
    const r = computeBestDiscount(app, [app], { ...PRICING_TIERED, discounts: [EB] });
    expect(r.best).toBeNull();
    vi.useRealTimers();
  });
});

describe("computeBestDiscount — per-applicant group gate", () => {
  function groupOfThree(firstMemberPaidAt?: string) {
    const a = makeApp({ id: 1, buddy_group_id: 7, buddy_joined_at: "2026-05-01T00:00:00", paid_at: firstMemberPaidAt });
    const b = makeApp({ id: 2, buddy_group_id: 7, buddy_joined_at: "2026-05-02T00:00:00" });
    const c = makeApp({ id: 3, buddy_group_id: 7, buddy_joined_at: "2026-05-03T00:00:00" });
    return [a, b, c];
  }

  it("on-time payer in a group-of-3 keeps EB3P", () => {
    const members = groupOfThree("2026-06-14T00:00:00");
    const r = computeBestDiscount(members[0], members, PRICING_TIERED);
    expect(r.best?.code).toBe("EB3P");
    expect(r.amount).toBe(500);
  });

  it("late payer in a group-of-3 drops to plain 3P (group still qualifies)", () => {
    const members = groupOfThree("2026-06-20T00:00:00");
    const r = computeBestDiscount(members[0], members, PRICING_TIERED);
    expect(r.best?.code).toBe("3P");
    expect(r.amount).toBe(300);
  });

  it("group formed after the deadline — nobody gets EB3P even if paid on time", () => {
    const a = makeApp({ id: 1, buddy_group_id: 7, buddy_joined_at: "2026-06-20T00:00:00", paid_at: "2026-06-14T00:00:00" });
    const b = makeApp({ id: 2, buddy_group_id: 7, buddy_joined_at: "2026-06-21T00:00:00" });
    const c = makeApp({ id: 3, buddy_group_id: 7, buddy_joined_at: "2026-06-22T00:00:00" });
    const r = computeBestDiscount(a, [a, b, c], PRICING_TIERED);
    expect(r.best?.code).toBe("3P");
  });
});
