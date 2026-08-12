import { describe, it, expect } from "vitest";
import {
  getActiveRegularPromo,
  intakeChargesRegistrationFee,
  isPromoActive,
  promoItems,
  promoName,
  promoPricing,
  unrenderedPricing,
} from "./regular-promo";
import type { RegularPricingConfig, RegularPromo } from "@/types";

const PROMO: RegularPromo = {
  code: "26BTSSA",
  name_zh: "2026 中學教室 Back to School 新生優惠",
  name_en: "2026 Secondary Academy Back to School New Student Offer",
  short_name_zh: "2026 Back to School 新生優惠",
  short_name_en: "2026 Back to School new student offer",
  total_value: 400,
  tuition_amount: 300,
  waives_registration_fee: true,
  from_date: "2026-08-12",
  until_date: null,
  items: [
    { name_zh: "9月新生學費立減 MOP 300", name_en: "MOP 300 off September tuition for new students" },
    { name_zh: "免教材費 MOP 100", name_en: "MOP 100 materials fee waived" },
    { name_zh: "贈 MathConcept 限量檯曆一份（價值 MOP 100）", name_en: "A limited edition MathConcept desk calendar (worth MOP 100)" },
  ],
};

const PRICING: RegularPricingConfig = {
  base_fee: 2400,
  lessons_per_block: 6,
  // The standard fee, which the offer quotes, but this intake collects it
  // from nobody.
  registration_fee: 100,
  registration_fee_charged: false,
  promo: PROMO,
};

describe("isPromoActive", () => {
  it("hides the offer before its launch day", () => {
    // The form opens around 5 August; the campaign lands on the 12th.
    expect(isPromoActive(PROMO, "2026-08-05")).toBe(false);
    expect(isPromoActive(PROMO, "2026-08-11")).toBe(false);
  });

  it("treats the launch day as inclusive", () => {
    expect(isPromoActive(PROMO, "2026-08-12")).toBe(true);
  });

  it("keeps running when no end date is set", () => {
    expect(isPromoActive(PROMO, "2027-01-01")).toBe(true);
  });

  it("treats the end date as inclusive", () => {
    const bounded = { ...PROMO, until_date: "2026-09-30" };
    expect(isPromoActive(bounded, "2026-09-30")).toBe(true);
    expect(isPromoActive(bounded, "2026-10-01")).toBe(false);
  });

  it("tolerates a full timestamp on either side", () => {
    expect(isPromoActive({ ...PROMO, from_date: "2026-08-12T00:00:00" }, "2026-08-12T09:30:00")).toBe(true);
  });

  it("is false for a missing or codeless promo", () => {
    expect(isPromoActive(null, "2026-08-20")).toBe(false);
    expect(isPromoActive({ ...PROMO, code: "" }, "2026-08-20")).toBe(false);
  });
});

describe("getActiveRegularPromo", () => {
  it("trusts the API when no date is passed", () => {
    // The public config is filtered server-side, so a promo that arrived at
    // the browser is one the API decided to publish.
    expect(getActiveRegularPromo(PRICING)).toEqual(PROMO);
  });

  it("date-checks when a date is passed, for the unfiltered admin preview", () => {
    expect(getActiveRegularPromo(PRICING, "2026-08-11")).toBeNull();
    expect(getActiveRegularPromo(PRICING, "2026-08-12")).toEqual(PROMO);
  });

  it("returns null when pricing carries no promo", () => {
    expect(getActiveRegularPromo({ base_fee: 2400, lessons_per_block: 6 })).toBeNull();
    expect(getActiveRegularPromo(null)).toBeNull();
    expect(getActiveRegularPromo(undefined)).toBeNull();
  });
});

describe("promoPricing", () => {
  it("prices a waived materials fee out of the total", () => {
    // 2400 tuition − 300 = 2100, materials fee waived, against a 2500 sticker.
    expect(promoPricing(PRICING, PROMO)).toEqual({
      originalFee: 2500,
      promoFee: 2100,
      saving: 400,
    });
  });

  it("charges nobody on an intake that has opted out", () => {
    // Even an offer that claims no waiver leaves the fee uncollected, because
    // the intake decides what is charged and the offer only decides wording.
    const noWaiver = { ...PROMO, waives_registration_fee: false, total_value: 300 };
    expect(promoPricing(PRICING, noWaiver)).toEqual({
      originalFee: 2500,
      promoFee: 2100,
      saving: 300,
    });
  });

  it("keeps the materials fee on an intake that does charge it", () => {
    const charging = { ...PRICING, registration_fee_charged: true };
    const noWaiver = { ...PROMO, waives_registration_fee: false, total_value: 300 };
    expect(promoPricing(charging, noWaiver)).toEqual({
      originalFee: 2500,
      promoFee: 2200,
      saving: 300,
    });
  });

  it("handles a config with no materials fee at all", () => {
    const pricing = { base_fee: 2400, lessons_per_block: 6, promo: PROMO };
    expect(promoPricing(pricing, PROMO)).toEqual({
      originalFee: 2400,
      promoFee: 2100,
      saving: 400,
    });
  });

  it("quotes the campaign's headline saving rather than re-deriving it", () => {
    // Keeps the form and the advertising in agreement even if the two parts
    // are edited to disagree.
    const odd = { ...PROMO, total_value: 500 };
    expect(promoPricing(PRICING, odd)?.saving).toBe(500);
  });

  it("returns null when there is no base fee to price against", () => {
    expect(promoPricing(null, PROMO)).toBeNull();
  });
});

describe("promoName and promoItems", () => {
  it("resolves the full name per language", () => {
    expect(promoName(PROMO, "zh")).toBe("2026 中學教室 Back to School 新生優惠");
    expect(promoName(PROMO, "en")).toBe("2026 Secondary Academy Back to School New Student Offer");
  });

  it("resolves the bullet list per language", () => {
    expect(promoItems(PROMO, "zh")).toEqual([
      "9月新生學費立減 MOP 300",
      "免教材費 MOP 100",
      "贈 MathConcept 限量檯曆一份（價值 MOP 100）",
    ]);
    expect(promoItems(PROMO, "en")[1]).toBe("MOP 100 materials fee waived");
  });

  it("returns an empty list when items are absent", () => {
    expect(promoItems({ ...PROMO, items: undefined }, "zh")).toEqual([]);
  });
});

describe("intakeChargesRegistrationFee", () => {
  it("charges by default, so existing configs are unaffected", () => {
    expect(intakeChargesRegistrationFee({ base_fee: 2400, lessons_per_block: 6 })).toBe(true);
    expect(intakeChargesRegistrationFee(null)).toBe(true);
    expect(intakeChargesRegistrationFee(undefined)).toBe(true);
  });

  it("is false only when the intake explicitly opts out", () => {
    expect(intakeChargesRegistrationFee(PRICING)).toBe(false);
  });
});

describe("unrenderedPricing", () => {
  it("keeps nothing when the config is only fields the editor renders", () => {
    // Saving assembles those from the form, so carrying them across as well
    // would just duplicate them.
    expect(unrenderedPricing(PRICING)).toEqual({});
  });

  it("keeps a rule the editor has no field for", () => {
    // The case that caused the bug: a pricing rule added by a migration must
    // survive an admin saving the config from a form that never showed it.
    const withExtra = { ...PRICING, sibling_discount: 150 } as RegularPricingConfig;
    expect(unrenderedPricing(withExtra)).toEqual({ sibling_discount: 150 });
  });

  it("keeps a false or zero value rather than dropping it as empty", () => {
    const withExtra = {
      ...PRICING,
      late_payment_fee: 0,
      waives_late_fee: false,
    } as RegularPricingConfig;
    expect(unrenderedPricing(withExtra)).toEqual({
      late_payment_fee: 0,
      waives_late_fee: false,
    });
  });

  it("has nothing to keep from an absent config", () => {
    expect(unrenderedPricing(null)).toEqual({});
    expect(unrenderedPricing(undefined)).toEqual({});
  });
});
