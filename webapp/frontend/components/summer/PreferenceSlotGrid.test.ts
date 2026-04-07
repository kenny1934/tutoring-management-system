import { describe, it, expect } from "vitest";
import { nextPicks, type PreferenceSlot } from "./PreferenceSlotGrid";

const A: PreferenceSlot = { day: "Monday", time: "10:00 - 11:30" };
const B: PreferenceSlot = { day: "Tuesday", time: "11:45 - 13:15" };
const C: PreferenceSlot = { day: "Wednesday", time: "14:00 - 15:30" };
const D: PreferenceSlot = { day: "Thursday", time: "10:00 - 11:30" };
const ASameDayLater: PreferenceSlot = { day: "Monday", time: "15:00 - 16:30" };

// 1x mode: maxPicks=2, primaryCount=1 (main + optional backup)
describe("nextPicks (single mode)", () => {
  it("appends to an empty list", () => {
    expect(nextPicks([], A, 2, 1)).toEqual({ picks: [A], rejected: false });
  });

  it("appends a backup when main is set", () => {
    expect(nextPicks([A], B, 2, 1)).toEqual({ picks: [A, B], rejected: false });
  });

  it("rejects a third tap (full)", () => {
    expect(nextPicks([A, B], C, 2, 1)).toEqual({ picks: [A, B], rejected: true });
  });

  it("toggles off when the same slot is tapped again, shifting later picks up", () => {
    expect(nextPicks([A, B], A, 2, 1)).toEqual({ picks: [B], rejected: false });
  });

  it("allows same-day across primary/backup tiers", () => {
    expect(nextPicks([A], ASameDayLater, 2, 1)).toEqual({
      picks: [A, ASameDayLater],
      rejected: false,
    });
  });
});

// 2x mode: maxPicks=4, primaryCount=2 (primary pair + optional backup pair)
describe("nextPicks (pair mode)", () => {
  it("blocks same-day collision within the primary pair", () => {
    expect(nextPicks([A], ASameDayLater, 4, 2)).toEqual({
      picks: [A],
      rejected: true,
    });
  });

  it("blocks same-day collision within the backup pair", () => {
    // Primary is full (A, B). Backup slot 1 is D (Thursday). Tapping another
    // Thursday slot would land in backup slot 2 (idx=3) and collide with D.
    const DSameDayLater: PreferenceSlot = { day: "Thursday", time: "16:00 - 17:30" };
    expect(nextPicks([A, B, D], DSameDayLater, 4, 2)).toEqual({
      picks: [A, B, D],
      rejected: true,
    });
  });

  it("allows a backup slot on the same day as a primary slot", () => {
    // Primary is full (A, B). Next pick goes into backup. ASameDayLater shares
    // a day with primary slot A (idx=0), but they're in different tiers.
    expect(nextPicks([A, B], ASameDayLater, 4, 2)).toEqual({
      picks: [A, B, ASameDayLater],
      rejected: false,
    });
  });

  it("rejects a fifth tap (full)", () => {
    expect(nextPicks([A, B, C, D], { day: "Friday", time: "10:00" }, 4, 2)).toEqual({
      picks: [A, B, C, D],
      rejected: true,
    });
  });
});
