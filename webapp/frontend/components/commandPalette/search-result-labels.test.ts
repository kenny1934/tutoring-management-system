import { afterEach, describe, expect, it, vi } from "vitest";
import { enrollmentLabel, formatSearchDate, sessionLabel } from "./search-result-labels";
afterEach(() => vi.useRealTimers());
describe("Search result identity", () => {
  it("distinguishes sessions by weekday, date, year and time", () => {
    const label = sessionLabel({ id: 71, student_id: 1, student_name: "Learner", session_date: "2026-11-23", time_slot: "16:45 - 18:15", tutor_name: "Tutor", session_status: "Scheduled" });
    expect(label).toContain("Mon, 23 Nov 2026"); expect(label).toContain("16:45 - 18:15");
    expect(formatSearchDate(null)).toBe("");
  });
  it("distinguishes renewals and uses the same overdue status as enrolment details", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-23T12:00:00"));
    const enrollment = { id: 81, student_id: 1, student_name: "Learner", tutor_name: "Tutor", location: "MSA", payment_status: "Pending Payment", assigned_day: "Mon", assigned_time: "16:45 - 18:15", first_lesson_date: "2026-11-01", enrollment_type: "Regular" };
    const label = enrollmentLabel(enrollment);
    expect(label).toContain("Started Sun, 1 Nov 2026"); expect(label).toContain("Overdue");
    expect(enrollmentLabel({ ...enrollment, first_lesson_date: "2026-12-01" })).not.toBe(label);
  });
});
