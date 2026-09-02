import { describe, it, expect } from "vitest";
import { sortWeekDays, WEEK_DAY_ORDER } from "./summer-utils";

describe("sortWeekDays", () => {
  it("starts the week on Sunday", () => {
    // The regular 2026 config was seeded Monday-first, which made the apply
    // form's time picker disagree with the branch card's open-days strip.
    expect(
      sortWeekDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
    ).toEqual([...WEEK_DAY_ORDER]);
  });

  it("keeps a branch's closed days out rather than filling the week", () => {
    expect(sortWeekDays(["Monday", "Thursday", "Friday", "Saturday", "Sunday"])).toEqual([
      "Sunday",
      "Monday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });

  it("leaves an already-ordered list alone", () => {
    expect(sortWeekDays(WEEK_DAY_ORDER)).toEqual([...WEEK_DAY_ORDER]);
  });

  it("does not mutate its input", () => {
    const days = ["Saturday", "Sunday"];
    sortWeekDays(days);
    expect(days).toEqual(["Saturday", "Sunday"]);
  });

  it("parks an unrecognised day at the end instead of dropping it", () => {
    // A typo in a config should show up as a stray row someone can spot, not
    // vanish from the picker along with its slots.
    expect(sortWeekDays(["Friday", "Funday", "Sunday"])).toEqual(["Sunday", "Friday", "Funday"]);
  });

  it("handles an empty list", () => {
    expect(sortWeekDays([])).toEqual([]);
  });
});
