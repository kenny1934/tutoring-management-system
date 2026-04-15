import { describe, it, expect } from "vitest";
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
