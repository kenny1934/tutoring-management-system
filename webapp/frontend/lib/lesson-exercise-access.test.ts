import { describe, it, expect } from "vitest";
import { hasExerciseTutorMismatch } from "./lesson-exercise-access";

const base = { lessonTutorId: 2, viewerId: 3, effectiveRole: "Tutor" };

describe("exercise tutor mismatch warnings", () => {
  it("warns a tutor preparing another tutor's exercises", () => {
    expect(hasExerciseTutorMismatch(base)).toBe(true);
  });
  it("does not warn the assigned tutor", () => {
    expect(hasExerciseTutorMismatch({ ...base, viewerId: 2 })).toBe(false);
  });
  it.each(["Admin", "Super Admin", "Supervisor", "Guest", null])("does not warn for the %s role", (effectiveRole) => {
    expect(hasExerciseTutorMismatch({ ...base, effectiveRole })).toBe(false);
  });
  it("waits for both tutor identities", () => {
    expect(hasExerciseTutorMismatch({ ...base, viewerId: undefined })).toBe(false);
    expect(hasExerciseTutorMismatch({ ...base, lessonTutorId: null })).toBe(false);
  });
});
