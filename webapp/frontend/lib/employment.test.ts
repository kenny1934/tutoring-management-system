import { describe, it, expect } from "vitest";
import {
  departureLabel,
  hasDeparted,
  isLeaving,
  pickableForOpenEndedWork,
  pickableTutors,
  pickableWithLeavers,
  coverageLabel,
  isHomeBranch,
  partitionByBranch,
  shouldReleaseTutorFilter,
  tutorOptionLabel,
  tutorsForLocation,
  withCurrentTutor,
  worksAt,
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

// ---------------------------------------------------------------------------
// Which branch a tutor may be offered at
// ---------------------------------------------------------------------------

const at = (
  home: string | null,
  coverage: Array<{
    location: string;
    effective_from?: string | null;
    effective_until?: string | null;
    weekday?: string | null;
  }> = []
) => ({
  id: 1,
  tutor_name: "Simon",
  role: "Tutor" as const,
  is_active_tutor: true,
  departure_effective_on: null,
  default_location: home,
  branch_coverage: coverage,
});

// A Saturday and a Tuesday in the same month, for the weekday rules below.
const SATURDAY = "2026-08-22";
const TUESDAY = "2026-08-25";

describe("which branch a tutor works at", () => {
  it("counts their own branch without any coverage", () => {
    expect(worksAt(at("MSA"), "MSA")).toBe(true);
    expect(worksAt(at("MSA"), "MSB")).toBe(false);
  });

  it("offers everybody when no branch is selected", () => {
    expect(worksAt(at("MSA"), null)).toBe(true);
    expect(worksAt(at("MSA"), "All Locations")).toBe(true);
  });

  it("accepts the Chinese branch name as well as the code", () => {
    expect(worksAt(at("MSB"), "二龍喉分校")).toBe(true);
    expect(worksAt(at("MSB"), "華士古分校")).toBe(false);
  });

  it("lets an open-ended arrangement through on any day", () => {
    const simon = at("MSA", [{ location: "MSB" }]);
    expect(worksAt(simon, "MSB")).toBe(true);
    expect(worksAt(simon, "MSB", SATURDAY)).toBe(true);
    expect(worksAt(simon, "MSB", TUESDAY)).toBe(true);
  });

  it("keeps a weekday arrangement to that weekday", () => {
    const simon = at("MSA", [{ location: "MSB", weekday: "Sat" }]);
    expect(worksAt(simon, "MSB", SATURDAY)).toBe(true);
    expect(worksAt(simon, "MSB", TUESDAY)).toBe(false);
  });

  it("keeps a one-day arrangement to that day", () => {
    const simon = at("MSA", [
      { location: "MSB", effective_from: SATURDAY, effective_until: SATURDAY },
    ]);
    expect(worksAt(simon, "MSB", SATURDAY)).toBe(true);
    expect(worksAt(simon, "MSB", "2026-08-23")).toBe(false);
  });

  it("respects a date range at both ends", () => {
    const simon = at("MSA", [
      { location: "MSB", effective_from: "2026-08-01", effective_until: "2026-08-31" },
    ]);
    expect(worksAt(simon, "MSB", "2026-07-31")).toBe(false);
    expect(worksAt(simon, "MSB", "2026-08-01")).toBe(true);
    expect(worksAt(simon, "MSB", "2026-08-31")).toBe(true);
    expect(worksAt(simon, "MSB", "2026-09-01")).toBe(false);
  });

  it("answers a filter permissively, since it has no day in mind", () => {
    // Saturdays only, and asked with no date. A filter wants to know whether
    // this tutor has anything at MSB at all, and they do.
    const simon = at("MSA", [{ location: "MSB", weekday: "Sat" }]);
    expect(worksAt(simon, "MSB", null, TODAY)).toBe(true);
  });

  it("drops an arrangement that has already run out", () => {
    const finished = at("MSA", [{ location: "MSB", effective_until: "2026-07-31" }]);
    expect(worksAt(finished, "MSB", null, TODAY)).toBe(false);
    // Still true for a date inside the window, so history stays readable.
    expect(worksAt(finished, "MSB", "2026-07-15")).toBe(true);
  });

  it("ignores coverage of a different branch", () => {
    expect(worksAt(at("MSA", [{ location: "MSC" }]), "MSB")).toBe(false);
  });
});

describe("the home branch question, which coverage does not answer", () => {
  it("stays false for somebody who is only covering", () => {
    const simon = at("MSA", [{ location: "MSB" }]);
    expect(worksAt(simon, "MSB")).toBe(true);
    expect(isHomeBranch(simon, "MSB")).toBe(false);
  });

  it("is true for their own branch and when nothing is selected", () => {
    expect(isHomeBranch(at("MSA"), "MSA")).toBe(true);
    expect(isHomeBranch(at("MSA"), "All Locations")).toBe(true);
  });
});

describe("splitting a roster into home and visiting", () => {
  const msa = { ...at("MSA"), id: 1, tutor_name: "Home" };
  const visitor = { ...at("MSB", [{ location: "MSA" }]), id: 2, tutor_name: "Visitor" };
  const elsewhere = { ...at("MSB"), id: 3, tutor_name: "Elsewhere" };
  const departed = {
    ...at("MSA"),
    id: 4,
    tutor_name: "Departed",
    departure_effective_on: "2026-01-31",
  };

  it("puts the branch's own people and the visitors in separate groups", () => {
    const { home, visiting } = tutorsForLocation(
      [msa, visitor, elsewhere, departed],
      "MSA",
      null,
      TODAY
    );
    expect(home.map((t) => t.id)).toEqual([1]);
    expect(visiting.map((t) => t.id)).toEqual([2]);
  });

  it("leaves out anybody who has already gone", () => {
    const { home } = tutorsForLocation([msa, departed], "MSA", null, TODAY);
    expect(home.map((t) => t.tutor_name)).toEqual(["Home"]);
  });

  it("returns everybody as home when no branch is selected", () => {
    const { home, visiting } = tutorsForLocation(
      [msa, visitor, elsewhere],
      "All Locations",
      null,
      TODAY
    );
    expect(home).toHaveLength(3);
    expect(visiting).toHaveLength(0);
  });
});

describe("how a coverage arrangement reads", () => {
  it("names the branch alone when there are no bounds", () => {
    expect(coverageLabel({ location: "MSB" })).toBe("MSB");
  });

  it("spells out a recurring day", () => {
    expect(coverageLabel({ location: "MSB", weekday: "Sat" })).toBe("MSB Sats");
  });

  it("reads a single day as one date rather than a range", () => {
    expect(
      coverageLabel({ location: "MSB", effective_from: SATURDAY, effective_until: SATURDAY })
    ).toBe("MSB on 22 Aug 2026");
  });

  it("spells out a range and an open end", () => {
    expect(
      coverageLabel({ location: "MSB", effective_from: "2026-08-01", effective_until: "2026-08-31" })
    ).toBe("MSB 1 Aug 2026 to 31 Aug 2026");
    expect(coverageLabel({ location: "MSB", effective_from: "2026-08-01" })).toBe(
      "MSB from 1 Aug 2026"
    );
  });
});

describe("how a visiting tutor is presented", () => {
  const visitor = { ...at("MSB", [{ location: "MSA" }]), tutor_name: "Simon" };
  const local = { ...at("MSA"), tutor_name: "Bella" };

  it("splits a list somebody has already narrowed, without changing it", () => {
    const { home, visiting } = partitionByBranch([local, visitor], "MSA");
    expect(home.map((t) => t.tutor_name)).toEqual(["Bella"]);
    expect(visiting.map((t) => t.tutor_name)).toEqual(["Simon"]);
  });

  it("leaves the list alone when no branch is selected", () => {
    const { home, visiting } = partitionByBranch([local, visitor], "All Locations");
    expect(home).toHaveLength(2);
    expect(visiting).toHaveLength(0);
  });

  it("names the home branch for a visitor and nothing extra for a local", () => {
    expect(tutorOptionLabel(visitor, "MSA")).toBe("Simon (MSB)");
    expect(tutorOptionLabel(local, "MSA")).toBe("Bella");
  });
});
