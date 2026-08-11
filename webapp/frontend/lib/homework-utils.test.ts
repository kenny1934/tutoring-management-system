import { describe, it, expect } from "vitest";
import {
  isChecked,
  isAwaitingMarking,
  checkedCount,
  uncheckedCount,
  awaitingMarkingCount,
  homeworkCountTone,
  homeworkCountLabel,
  assignedLabel,
} from "./homework-utils";
import type { HomeworkCompletion, HomeworkStatus } from "@/types";

const at = (completion_status?: HomeworkStatus) => ({ completion_status });

describe("isChecked", () => {
  it("counts the three verdicts as checked", () => {
    expect(isChecked(at("Completed"))).toBe(true);
    expect(isChecked(at("Partially Completed"))).toBe(true);
    expect(isChecked(at("Not Completed"))).toBe(true);
  });

  it("does not count handed in as checked", () => {
    // The work came back but nobody has marked it, which is what keeps it in
    // the backlog. Treating it as done would drop it out of every count.
    expect(isChecked(at("Submitted"))).toBe(false);
  });

  it("does not count an empty or missing status as checked", () => {
    expect(isChecked(at("Not Checked"))).toBe(false);
    expect(isChecked(at(undefined))).toBe(false);
  });
});

describe("isAwaitingMarking", () => {
  it("is true only for handed in", () => {
    expect(isAwaitingMarking(at("Submitted"))).toBe(true);
    expect(isAwaitingMarking(at("Not Checked"))).toBe(false);
    expect(isAwaitingMarking(at("Completed"))).toBe(false);
    expect(isAwaitingMarking(at(undefined))).toBe(false);
  });
});

describe("counts", () => {
  const items = [
    at("Completed"),
    at("Not Completed"),
    at("Submitted"),
    at("Submitted"),
    at("Not Checked"),
  ];

  it("splits checked from still open", () => {
    expect(checkedCount(items)).toBe(2);
    expect(uncheckedCount(items)).toBe(3);
  });

  it("counts the handed in ones separately, inside the open ones", () => {
    expect(awaitingMarkingCount(items)).toBe(2);
    expect(awaitingMarkingCount(items)).toBeLessThanOrEqual(uncheckedCount(items));
  });

  it("adds up on an empty list", () => {
    expect(checkedCount([])).toBe(0);
    expect(uncheckedCount([])).toBe(0);
    expect(awaitingMarkingCount([])).toBe(0);
  });
});

describe("homeworkCountTone", () => {
  it("goes green only once everything is checked", () => {
    expect(homeworkCountTone(3, 3)).toContain("green");
    expect(homeworkCountTone(2, 3)).toContain("orange");
  });

  it("stays green when nothing was ever set", () => {
    expect(homeworkCountTone(0, 0)).toContain("green");
  });
});

describe("homeworkCountLabel", () => {
  it("says all clear when nothing is left", () => {
    expect(homeworkCountLabel(4, 4)).toBe("All homework checked");
    expect(homeworkCountLabel(0, 0)).toBe("All homework checked");
  });

  it("counts what is left, singular and plural", () => {
    expect(homeworkCountLabel(3, 4)).toBe("1 homework item still to check");
    expect(homeworkCountLabel(1, 4)).toBe("3 homework items still to check");
  });
});

describe("assignedLabel", () => {
  it("joins the date and the tutor", () => {
    const label = assignedLabel({
      homework_assigned_date: "2026-08-15",
      assigned_by_tutor: "Ms Chan",
    } as HomeworkCompletion);

    // Mid-month, so the assertion cannot break on a timezone shifting the day.
    expect(label).toContain("Aug");
    expect(label).toContain("Ms Chan");
    expect(label).toContain(" · ");
  });

  it("drops the separator when only one part is known", () => {
    expect(
      assignedLabel({ assigned_by_tutor: "Ms Chan" } as HomeworkCompletion)
    ).toBe("Ms Chan");
  });

  it("is empty when neither is known", () => {
    expect(assignedLabel({} as HomeworkCompletion)).toBe("");
  });
});
