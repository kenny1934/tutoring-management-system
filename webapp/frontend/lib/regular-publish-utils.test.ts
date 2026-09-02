import { describe, it, expect } from "vitest";
import { firstWeekdayOnOrAfter } from "./regular-publish-utils";

// 2026-09-01 (the regular course start date) is a Tuesday.
describe("firstWeekdayOnOrAfter", () => {
  it("returns the start date itself when it already falls on the target day", () => {
    expect(firstWeekdayOnOrAfter("2026-09-01", "Tuesday")).toBe("2026-09-01");
  });

  it("advances to the first Saturday after the start date", () => {
    expect(firstWeekdayOnOrAfter("2026-09-01", "Saturday")).toBe("2026-09-05");
  });

  it("wraps past the weekend to the following Monday", () => {
    expect(firstWeekdayOnOrAfter("2026-09-01", "Monday")).toBe("2026-09-07");
  });

  it("accepts short day forms", () => {
    expect(firstWeekdayOnOrAfter("2026-09-01", "Sat")).toBe("2026-09-05");
  });

  it("tolerates a datetime-shaped start string", () => {
    expect(firstWeekdayOnOrAfter("2026-09-01T00:00:00", "Tuesday")).toBe("2026-09-01");
  });

  it("returns null for an unknown day name", () => {
    expect(firstWeekdayOnOrAfter("2026-09-01", "Someday")).toBeNull();
  });

  it("returns null for a malformed date", () => {
    expect(firstWeekdayOnOrAfter("not-a-date", "Monday")).toBeNull();
  });
});
