import { describe, it, expect } from "vitest";
import { nextPrefs, type PreferenceSlot } from "./PreferenceSlotGrid";

const A: PreferenceSlot = { day: "Monday", time: "10:00 - 11:30" };
const B: PreferenceSlot = { day: "Tuesday", time: "11:45 - 13:15" };
const C: PreferenceSlot = { day: "Wednesday", time: "14:00 - 15:30" };

describe("nextPrefs", () => {
  it("fills pref1 when nothing is selected", () => {
    expect(nextPrefs(null, null, A)).toEqual([A, null]);
  });

  it("fills pref2 when only pref1 is set", () => {
    expect(nextPrefs(A, null, B)).toEqual([A, B]);
  });

  it("replaces pref2 when a third slot is tapped", () => {
    expect(nextPrefs(A, B, C)).toEqual([A, C]);
  });

  it("clears pref2 when the pref2 cell is tapped again", () => {
    expect(nextPrefs(A, B, B)).toEqual([A, null]);
  });

  it("promotes pref2 into pref1 when pref1 is tapped again", () => {
    // This preserves the invariant that a set pref2 never exists without a
    // set pref1 — tapping the 1st choice doesn't orphan the 2nd choice.
    expect(nextPrefs(A, B, A)).toEqual([B, null]);
  });

  it("clears pref1 when pref1 is tapped again and pref2 is empty", () => {
    expect(nextPrefs(A, null, A)).toEqual([null, null]);
  });

  it("treats slots with same day but different time as distinct", () => {
    const SameDayLater: PreferenceSlot = { day: A.day, time: "15:00 - 16:30" };
    expect(nextPrefs(A, null, SameDayLater)).toEqual([A, SameDayLater]);
  });

  it("treats slots with same time but different day as distinct", () => {
    const SameTimeDifferentDay: PreferenceSlot = { day: "Friday", time: A.time };
    expect(nextPrefs(A, null, SameTimeDifferentDay)).toEqual([
      A,
      SameTimeDifferentDay,
    ]);
  });
});
