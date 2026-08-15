import { describe, it, expect } from "vitest";
import {
  departureLabel,
  hasDeparted,
  isLeaving,
  pickableForOpenEndedWork,
  pickableTutors,
  pickableWithLeavers,
  shouldReleaseTutorFilter,
  withCurrentTutor,
} from "./employment";

const TODAY = new Date("2026-08-15T09:00:00");
const LAST_DAY = "2026-08-22";

const tutor = (id: number, departure: string | null = null, teaches = true) => ({
  id,
  tutor_name: `Tutor ${id}`,
  role: "Tutor" as const,
  is_active_tutor: teaches,
  departure_effective_on: departure,
});

describe("who is still here", () => {
  it("treats a tutor with no leaving date as staying", () => {
    expect(isLeaving(tutor(1))).toBe(false);
    expect(hasDeparted(tutor(1), TODAY)).toBe(false);
  });

  it("counts the last working day itself as still here", () => {
    expect(hasDeparted(tutor(1, LAST_DAY), new Date("2026-08-22T23:00:00"))).toBe(false);
  });

  it("counts the day after as gone", () => {
    expect(hasDeparted(tutor(1, LAST_DAY), new Date("2026-08-23T09:00:00"))).toBe(true);
  });

  it("still counts somebody serving notice as here", () => {
    expect(hasDeparted(tutor(1, LAST_DAY), TODAY)).toBe(false);
  });
});

describe("who a picker may offer", () => {
  it("keeps somebody serving notice, because they are still teaching", () => {
    const list = [tutor(1), tutor(2, LAST_DAY)];

    expect(pickableTutors(list, TODAY).map((t) => t.id)).toEqual([1, 2]);
  });

  it("drops somebody whose last day has passed", () => {
    const list = [tutor(1), tutor(2, "2026-01-31")];

    expect(pickableTutors(list, TODAY).map((t) => t.id)).toEqual([1]);
  });

  it("drops staff who do not teach at all", () => {
    const list = [tutor(1), tutor(2, null, false)];

    expect(pickableTutors(list, TODAY).map((t) => t.id)).toEqual([1]);
  });

  it("keeps somebody who has already gone when the subject is the departure", () => {
    // The list of lessons left past a last working day has to be able to name
    // the person whose lessons they are, and pickableTutors drops them.
    const list = [tutor(1), tutor(2, "2026-01-31"), tutor(3, null, false)];

    expect(pickableWithLeavers(list, TODAY).map((t) => t.id)).toEqual([1, 2]);
  });

  it("keeps a leaver who has already been marked as not teaching", () => {
    // Suspending the account and recording the last day are two separate acts,
    // and either order has to leave the name reachable.
    const list = [tutor(1, LAST_DAY, false)];

    expect(pickableWithLeavers(list, TODAY).map((t) => t.id)).toEqual([1]);
  });

  it("drops anybody leaving at all from open-ended work", () => {
    // A regular slot or waitlist preference runs until somebody changes it, so
    // the server refuses a leaver however far off their last day is.
    const list = [tutor(1), tutor(2, LAST_DAY), tutor(3, "2027-06-30")];

    expect(pickableForOpenEndedWork(list, TODAY).map((t) => t.id)).toEqual([1]);
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

describe("when a filter has to let go of its tutor", () => {
  it("holds on to somebody who has left, because they are the subject", () => {
    // The filter's value is the tutor you came to look at. Swapping in another
    // name would show you their data under a link you had shared as this one's.
    const atBranch = [tutor(1), tutor(2, "2026-01-31")];

    expect(shouldReleaseTutorFilter(atBranch, 2)).toBe(false);
  });

  it("lets go when the tutor teaches at another branch", () => {
    const atBranch = [tutor(1)];

    expect(shouldReleaseTutorFilter(atBranch, 2)).toBe(true);
  });

  it("holds on while the roster has not arrived", () => {
    expect(shouldReleaseTutorFilter([], 2)).toBe(false);
  });

  it("has nothing to let go of when no tutor is selected", () => {
    expect(shouldReleaseTutorFilter([tutor(1)], null)).toBe(false);
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
