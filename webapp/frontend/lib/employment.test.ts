import { describe, it, expect } from "vitest";
import {
  assignableTutors,
  canHoldWorkOn,
  departureLabel,
  hasDeparted,
  isLeaving,
  withCurrentTutor,
} from "./employment";

const TODAY = new Date("2026-08-15T09:00:00");
const LAST_DAY = "2026-08-22";

const tutor = (id: number, departure: string | null = null) => ({
  id,
  tutor_name: `Tutor ${id}`,
  role: "Tutor" as const,
  departure_effective_on: departure,
});

describe("who is still here", () => {
  it("treats a tutor with no leaving date as staying", () => {
    expect(isLeaving(tutor(1))).toBe(false);
    expect(hasDeparted(tutor(1), TODAY)).toBe(false);
    expect(canHoldWorkOn(tutor(1), "2030-01-01")).toBe(true);
  });

  it("counts the last working day itself as still here", () => {
    expect(hasDeparted(tutor(1, LAST_DAY), new Date("2026-08-22T23:00:00"))).toBe(false);
    expect(canHoldWorkOn(tutor(1, LAST_DAY), LAST_DAY)).toBe(true);
  });

  it("counts the day after as gone", () => {
    expect(hasDeparted(tutor(1, LAST_DAY), new Date("2026-08-23T09:00:00"))).toBe(true);
  });

  it("refuses work dated after the last day, notice period or not", () => {
    expect(hasDeparted(tutor(1, LAST_DAY), TODAY)).toBe(false);
    expect(canHoldWorkOn(tutor(1, LAST_DAY), "2026-08-23")).toBe(false);
  });
});

describe("who a picker may offer", () => {
  it("keeps somebody serving notice, because they are still teaching", () => {
    const list = [tutor(1), tutor(2, LAST_DAY)];

    expect(assignableTutors(list, TODAY).map((t) => t.id)).toEqual([1, 2]);
  });

  it("drops somebody whose last day has passed", () => {
    const list = [tutor(1), tutor(2, "2026-01-31")];

    expect(assignableTutors(list, TODAY).map((t) => t.id)).toEqual([1]);
  });
});

describe("keeping the current value in a picker", () => {
  it("adds the current tutor back when the narrowing dropped them", () => {
    const all = [tutor(1), tutor(2, "2026-01-31")];
    const offered = [tutor(1)];

    expect(withCurrentTutor(offered, 2, all).map((t) => t.id)).toEqual([1, 2]);
  });

  it("leaves the list alone when the current tutor is already in it", () => {
    const all = [tutor(1), tutor(2)];
    const offered = [tutor(1), tutor(2)];

    expect(withCurrentTutor(offered, 2, all)).toBe(offered);
  });

  it("leaves the list alone when nothing is selected", () => {
    const offered = [tutor(1)];

    expect(withCurrentTutor(offered, null, [tutor(1), tutor(2)])).toBe(offered);
  });
});

describe("how a departure reads", () => {
  it("says leaving before the date and left after it", () => {
    expect(departureLabel(tutor(1, LAST_DAY), TODAY)).toBe("Leaving 22 Aug 2026");
    expect(departureLabel(tutor(1, "2026-01-31"), TODAY)).toBe("Left 31 Jan 2026");
  });

  it("says nothing about somebody who is not leaving", () => {
    expect(departureLabel(tutor(1), TODAY)).toBeNull();
  });
});
