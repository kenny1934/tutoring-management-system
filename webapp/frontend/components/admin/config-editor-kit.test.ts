import { describe, it, expect } from "vitest";
import { reorderByIds, stampIds, stripIds } from "./config-editor-kit";

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
