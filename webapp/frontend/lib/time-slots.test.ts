import { describe, expect, it } from "vitest";
import { normaliseTimeSlot, parseTimeRange, sameTimeSlot } from "./time-slots";
import { seedTimeSlotState } from "@/components/admin/TimeSlotPicker";

describe("class time ranges", () => {
  it.each(["18:00-19:30", "18:00 - 19:30", " 18:00  -  19:30 "])("normalises %s", (value) => {
    expect(normaliseTimeSlot(value)).toBe("18:00 - 19:30");
    expect(sameTimeSlot(value, "18:00 - 19:30")).toBe(true);
  });
  it("pads single-digit hours", () => {
    expect(parseTimeRange("9:00-10:30")).toEqual({ start: "09:00", end: "10:30" });
  });
  it.each(["", "Unscheduled", "Various", "18:60-19:30", "24:00-25:00", "19:30-18:00", "18:00-18:00", "18:00 - ", "prefix 18:00-19:30"])("rejects %s without reinterpreting legacy labels", (value) => {
    expect(parseTimeRange(value)).toBeNull();
    expect(normaliseTimeSlot(value)).toBe(value);
  });
  it("keeps custom times and preset identity when opening old values", () => {
    expect(seedTimeSlotState("18:00-19:30", ["18:00 - 19:30"])).toMatchObject({ useCustom: false, preset: "18:00 - 19:30" });
    expect(seedTimeSlotState("18:00-19:30", ["18:25 - 19:55"])).toMatchObject({ useCustom: true, start: "18:00", end: "19:30" });
  });
});
