import { describe, it, expect } from "vitest";
import {
  displayGrade,
  gradeColorKey,
  applyTargetToPreGrade,
  coursewareGrade,
} from "./grade-utils";

const WINDOW = { start: "2026-07-05", end: "2026-08-31" };
const IN_WINDOW = new Date(2026, 6, 15);
const BEFORE_WINDOW = new Date(2026, 5, 1);
const AFTER_WINDOW = new Date(2026, 8, 2);

describe("displayGrade (stored current grade)", () => {
  it("promotes with Pre- prefix inside the window", () => {
    expect(displayGrade("P6", WINDOW, IN_WINDOW)).toBe("Pre-F1");
    expect(displayGrade("F1", WINDOW, IN_WINDOW)).toBe("Pre-F2");
  });

  it("returns the raw grade outside the window", () => {
    expect(displayGrade("P6", WINDOW, BEFORE_WINDOW)).toBe("P6");
    expect(displayGrade("P6", WINDOW, AFTER_WINDOW)).toBe("P6");
  });

  it("leaves terminal or unknown grades untouched", () => {
    expect(displayGrade("F6", WINDOW, IN_WINDOW)).toBe("F6");
    expect(displayGrade("Graduated", WINDOW, IN_WINDOW)).toBe("Graduated");
    expect(displayGrade("??", WINDOW, IN_WINDOW)).toBe("??");
  });
});

describe("applyTargetToPreGrade / displayGrade round trip", () => {
  it("target F1 stores as P6 and displays as Pre-F1 during the window", () => {
    const stored = applyTargetToPreGrade("F1", 2026, IN_WINDOW);
    expect(stored).toBe("P6");
    expect(displayGrade(stored, WINDOW, IN_WINDOW)).toBe("Pre-F1");
  });

  it("passes the target through from Sept 1 of the config year", () => {
    expect(applyTargetToPreGrade("F1", 2026, AFTER_WINDOW)).toBe("F1");
  });
});

describe("coursewareGrade", () => {
  it("promotes the stored grade before Sept 1 and passes through after", () => {
    expect(coursewareGrade("P6", 2026, IN_WINDOW)).toBe("F1");
    expect(coursewareGrade("F1", 2026, AFTER_WINDOW)).toBe("F1");
  });
});

describe("gradeColorKey (badge colour follows displayed grade)", () => {
  it("promotes the colour key alongside the Pre- text inside the window", () => {
    // Pre-F1 badge takes F1's colour
    expect(gradeColorKey("P6", WINDOW, IN_WINDOW)).toBe("F1");
    expect(gradeColorKey("F1", WINDOW, IN_WINDOW)).toBe("F2");
  });

  it("keeps the raw grade outside the window or when display stays raw", () => {
    expect(gradeColorKey("P6", WINDOW, BEFORE_WINDOW)).toBe("P6");
    expect(gradeColorKey("P6", WINDOW, AFTER_WINDOW)).toBe("P6");
    expect(gradeColorKey("F6", WINDOW, IN_WINDOW)).toBe("F6");
    expect(gradeColorKey("Graduated", WINDOW, IN_WINDOW)).toBe("Graduated");
  });
});
