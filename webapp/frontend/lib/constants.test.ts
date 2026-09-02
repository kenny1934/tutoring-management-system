import { describe, it, expect } from "vitest";
import {
  findDiscountByValue,
  findStaffReferralDiscount,
  minLessonsForDiscount,
  MIN_LESSONS_FOR_DISCOUNT,
  PER_TWO_LESSONS_DISCOUNT_TYPE,
} from "./constants";

// The production discount list as of August 2026, so the lookups are tested
// against the rows they actually have to pick from.
const DISCOUNTS = [
  { id: 1, discount_name: "Student Discount $300", discount_value: 300 },
  { id: 2, discount_name: "Staff Referral Coupon $500", discount_value: 500 },
  { id: 3, discount_name: "Student Discount $200", discount_value: 200 },
  { id: 4, discount_name: "No Discount", discount_value: 0 },
  { id: 5, discount_name: "Trial to Enrollment Discount $150", discount_value: 150 },
  { id: 7, discount_name: "Extra Lessons (per 2)", discount_value: 100 },
  { id: 8, discount_name: "2026 Back to School 新生優惠", discount_value: 300 },
];

describe("findDiscountByValue", () => {
  it("finds the row worth a coupon's value", () => {
    expect(findDiscountByValue(DISCOUNTS, 200)?.id).toBe(3);
  });

  it("copes with the API serialising the value as a decimal string", () => {
    const asStrings = DISCOUNTS.map((d) => ({ ...d, discount_value: d.discount_value.toFixed(2) }));
    expect(findDiscountByValue(asStrings, 200)?.id).toBe(3);
    expect(findDiscountByValue(DISCOUNTS, "200.00")?.id).toBe(3);
  });

  it("returns undefined when nothing is worth that amount", () => {
    expect(findDiscountByValue(DISCOUNTS, 250)).toBeUndefined();
    expect(findDiscountByValue([{ id: 9, discount_name: "Unpriced" }], 250)).toBeUndefined();
  });
});

describe("findStaffReferralDiscount", () => {
  it("picks the staff referral row out of the production list", () => {
    expect(findStaffReferralDiscount(DISCOUNTS)?.id).toBe(2);
  });

  it("falls back to the $500 value when the row has been renamed", () => {
    const renamed = DISCOUNTS.map((d) =>
      d.id === 2 ? { ...d, discount_name: "Colleague family rate" } : d
    );
    expect(findStaffReferralDiscount(renamed)?.id).toBe(2);
  });

  it("returns undefined when no staff discount is configured", () => {
    expect(findStaffReferralDiscount(DISCOUNTS.filter((d) => d.id !== 2))).toBeUndefined();
  });
});

describe("minLessonsForDiscount", () => {
  it("lets the per-2-lessons promo apply from two lessons", () => {
    expect(minLessonsForDiscount({ discount_type: PER_TWO_LESSONS_DISCOUNT_TYPE })).toBe(2);
  });

  it("holds every other discount to the standard floor", () => {
    expect(minLessonsForDiscount({ discount_type: "Fixed Amount" })).toBe(MIN_LESSONS_FOR_DISCOUNT);
    expect(minLessonsForDiscount(null)).toBe(MIN_LESSONS_FOR_DISCOUNT);
  });
});
