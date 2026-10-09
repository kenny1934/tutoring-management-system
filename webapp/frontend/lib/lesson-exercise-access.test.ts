import { describe, it, expect } from "vitest";
import { canChangeLessonExercises } from "./lesson-exercise-access";

// Tutor 2 teaches the lesson. Tutor 3 is a new tutor who assists tutor 2.
const today = "2026-10-09";
const base = { lessonTutorId: 2, viewerId: 3, isAdmin: false, viewer: null, todayIso: today };

describe("canChangeLessonExercises", () => {
  it("lets the lesson's own tutor change it", () => {
    expect(canChangeLessonExercises({ ...base, viewerId: 2 })).toBe(true);
  });

  it("lets an admin change anybody's lesson", () => {
    expect(canChangeLessonExercises({ ...base, isAdmin: true })).toBe(true);
  });

  it("leaves another tutor looking only", () => {
    expect(canChangeLessonExercises({ ...base, viewer: { assisting: [] } })).toBe(false);
  });

  it("lets an assistant change the lead tutor's lesson", () => {
    expect(canChangeLessonExercises({ ...base, viewer: { assisting: [{ lead_tutor_id: 2 }] } })).toBe(true);
  });

  it("doesn't reach a different tutor's lessons through the link", () => {
    expect(canChangeLessonExercises({ ...base, viewer: { assisting: [{ lead_tutor_id: 4 }] } })).toBe(false);
  });

  it("still holds on the link's last day and lapses the day after", () => {
    const until = (effective_until: string) => ({ ...base, viewer: { assisting: [{ lead_tutor_id: 2, effective_until }] } });
    expect(canChangeLessonExercises(until("2026-10-09"))).toBe(true);
    expect(canChangeLessonExercises(until("2026-10-08"))).toBe(false);
  });

  it("waits for the tutor list before letting an assistant in", () => {
    expect(canChangeLessonExercises({ ...base, viewer: undefined })).toBe(false);
  });
});
