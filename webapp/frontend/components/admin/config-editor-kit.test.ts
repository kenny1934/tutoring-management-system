import { describe, it, expect } from "vitest";
import { reorderByIds, stampIds, stripIds, unrenderedKeys } from "./config-editor-kit";

const LOCATIONS = [
  { name: "華士古分校", name_en: "Vasco Center", open_days: ["Sunday"] },
  { name: "二龍喉分校", name_en: "Flora Garden Center", open_days: ["Sunday"] },
];

describe("stampIds / stripIds", () => {
  it("round-trips a list back to exactly what came in", () => {
    // The whole point: what an admin saves must match what was loaded, or
    // the drag-handle key ends up in the stored config JSON.
    expect(stripIds(stampIds(LOCATIONS, "l"))).toEqual(LOCATIONS);
  });

  it("leaves no _id key behind, not even an undefined one", () => {
    const stripped = stripIds(stampIds(LOCATIONS, "l"));
    expect(stripped.every((l) => !("_id" in l))).toBe(true);
  });

  it("does not mutate the stamped list, which is still rendering", () => {
    const stamped = stampIds(LOCATIONS, "l");
    stripIds(stamped);
    expect(stamped.every((l) => typeof l._id === "string")).toBe(true);
  });

  it("keeps order, so a reordered list saves in the order shown", () => {
    const stamped = stampIds(LOCATIONS, "l");
    const flipped = reorderByIds(stamped, [stamped[1]._id, stamped[0]._id]);
    expect(stripIds(flipped)).toEqual([LOCATIONS[1], LOCATIONS[0]]);
  });

  it("gives every item a distinct id", () => {
    const ids = stampIds(LOCATIONS, "l").map((l) => l._id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles an empty list", () => {
    expect(stripIds(stampIds([], "l"))).toEqual([]);
  });
});

describe("unrenderedKeys", () => {
  // What the regular editor's pricing form actually has fields for.
  const REGULAR = ["base_fee", "lessons_per_block", "registration_fee", "registration_fee_charged", "promo"];

  it("keeps nothing when the object is only fields the form renders", () => {
    // Those are reassembled from form state on save, so carrying them across
    // as well would just duplicate them.
    const pricing = { base_fee: 2400, lessons_per_block: 6, registration_fee: 100 };
    expect(unrenderedKeys(pricing, REGULAR)).toEqual({});
  });

  it("keeps a rule the form has no field for", () => {
    // The case that cost money: a pricing rule added by a migration has to
    // survive an admin saving the config from a form that never showed it.
    const pricing = { base_fee: 2400, lessons_per_block: 6, sibling_discount: 150 };
    expect(unrenderedKeys(pricing, REGULAR)).toEqual({ sibling_discount: 150 });
  });

  it("keeps a false or zero value rather than dropping it as empty", () => {
    // registration_fee_charged is exactly this shape, so a truthiness filter
    // here would reintroduce the bug for any flag the form does not render.
    const pricing = { base_fee: 2400, late_fee: 0, waives_late_fee: false };
    expect(unrenderedKeys(pricing, REGULAR)).toEqual({ late_fee: 0, waives_late_fee: false });
  });

  it("keeps the summer config's unrendered half", () => {
    // The summer editor renders three keys and the config carries several more.
    const pricing = {
      base_fee: 3200,
      registration_fee: 100,
      discounts: [],
      payment_terms_zh: "請於首堂或之前繳費。",
      partial_per_lesson_rate: 400,
      receipt_codes: { partial: "P" },
    };
    expect(unrenderedKeys(pricing, ["base_fee", "registration_fee", "discounts"])).toEqual({
      payment_terms_zh: "請於首堂或之前繳費。",
      partial_per_lesson_rate: 400,
      receipt_codes: { partial: "P" },
    });
  });

  it("has nothing to keep from an absent config", () => {
    expect(unrenderedKeys(null, REGULAR)).toEqual({});
    expect(unrenderedKeys(undefined, REGULAR)).toEqual({});
  });
});
