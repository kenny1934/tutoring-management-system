import { describe, it, expect } from "vitest";
import {
  EMPTY_CHASE_FILTERS,
  chaseFiltersFromQuery,
  chaseFiltersToQuery,
  countChaseContact,
  countChaseStates,
  filterChaseRows,
  formatChaseSort,
  hasPhone,
  isFollowUpDue,
  parseChaseSort,
  shortDate,
  sortChaseRows,
  staleness,
  type ChaseFilters,
} from "./retention-utils";
import type { RegularRetentionChaseRow } from "@/types";

const TODAY = "2026-08-11";

function row(over: Partial<RegularRetentionChaseRow> = {}): RegularRetentionChaseRow {
  return {
    student_id: 1,
    student_name: "Chan Tai Man",
    student_code: "MSA-1001",
    branch: "MSA",
    grade: "F1",
    expected_grade: "F2",
    rung: "open",
    lang_stream: "C",
    school: null,
    phone: "66880000",
    tutor_name: "Ms Ho",
    source: "regular_only",
    prospect_journey: null,
    state: "no_response",
    reference_code: null,
    last_contact_date: null,
    last_contact_note: null,
    days_since_contact: null,
    follow_up_needed: false,
    follow_up_date: null,
    decline_reason_category: null,
    ...over,
  };
}

const filters = (over: Partial<ChaseFilters> = {}): ChaseFilters => ({
  ...EMPTY_CHASE_FILTERS,
  ...over,
});

describe("staleness", () => {
  it("treats never contacted as infinitely stale, not as zero", () => {
    // The trap: a null here reads as "no data", but for a chase list it means
    // the most urgent row on the board.
    expect(staleness(row({ days_since_contact: null }))).toBeGreaterThan(
      staleness(row({ days_since_contact: 9999 }))
    );
  });
});

describe("sortChaseRows", () => {
  it("orders by days numerically, not as strings", () => {
    // The original bug: "96" sorts before "9" under localeCompare.
    const rows = [
      row({ student_id: 1, days_since_contact: 9 }),
      row({ student_id: 2, days_since_contact: 96 }),
      row({ student_id: 3, days_since_contact: 100 }),
    ];
    const asc = sortChaseRows(rows, "days_since_contact", "asc");
    expect(asc.map((r) => r.days_since_contact)).toEqual([9, 96, 100]);
  });

  it("puts never-contacted first when sorting by most stale", () => {
    const rows = [
      row({ student_id: 1, days_since_contact: 30 }),
      row({ student_id: 2, days_since_contact: null }),
      row({ student_id: 3, days_since_contact: 5 }),
    ];
    const desc = sortChaseRows(rows, "days_since_contact", "desc");
    expect(desc.map((r) => r.student_id)).toEqual([2, 1, 3]);
  });

  it("mixes nulls and numbers without falling back to string order", () => {
    const rows = [
      row({ student_id: 1, days_since_contact: 96 }),
      row({ student_id: 2, days_since_contact: null }),
      row({ student_id: 3, days_since_contact: 9 }),
    ];
    expect(sortChaseRows(rows, "days_since_contact", "asc").map((r) => r.student_id))
      .toEqual([3, 1, 2]);
  });

  it("leaves the server's order alone when nothing is selected", () => {
    const rows = [row({ student_id: 2 }), row({ student_id: 1 })];
    expect(sortChaseRows(rows, null, "asc").map((r) => r.student_id)).toEqual([2, 1]);
  });

  it("does not mutate the array it is given", () => {
    const rows = [row({ student_id: 2, student_name: "B" }), row({ student_id: 1, student_name: "A" })];
    sortChaseRows(rows, "student_name", "asc");
    expect(rows.map((r) => r.student_id)).toEqual([2, 1]);
  });
});

describe("isFollowUpDue", () => {
  it("is due on the day itself", () => {
    expect(isFollowUpDue(row({ follow_up_needed: true, follow_up_date: TODAY }), TODAY)).toBe(true);
  });

  it("is not due while the date is still ahead", () => {
    expect(isFollowUpDue(row({ follow_up_needed: true, follow_up_date: "2026-08-20" }), TODAY)).toBe(false);
  });

  it("is due once the date has passed", () => {
    expect(isFollowUpDue(row({ follow_up_needed: true, follow_up_date: "2026-08-01" }), TODAY)).toBe(true);
  });

  it("needs the flag, not just a date", () => {
    expect(isFollowUpDue(row({ follow_up_needed: false, follow_up_date: "2026-08-01" }), TODAY)).toBe(false);
  });
});

describe("filterChaseRows", () => {
  it("opens on the unresponsive students, who are the work", () => {
    const rows = [
      row({ student_id: 1, state: "no_response" }),
      row({ student_id: 2, state: "applied" }),
    ];
    expect(filterChaseRows(rows, EMPTY_CHASE_FILTERS, TODAY).map((r) => r.student_id)).toEqual([1]);
  });

  it("searches name, code and phone together", () => {
    const rows = [
      row({ student_id: 1, student_name: "Wong Siu Ming", student_code: "MSA-1001", phone: "66880000" }),
      row({ student_id: 2, student_name: "Chan Tai Man", student_code: "MSB-2002", phone: "66991111" }),
    ];
    const only = (q: string) =>
      filterChaseRows(rows, filters({ q }), TODAY).map((r) => r.student_id);
    expect(only("siu")).toEqual([1]);
    expect(only("MSB")).toEqual([2]);
    expect(only("6699")).toEqual([2]);
  });

  it("ignores case and stray spaces in the search", () => {
    // Staff paste codes and names in from elsewhere, so both arrive padded.
    const rows = [row({ student_name: "Wong Siu Ming" })];
    for (const q of ["  WONG  ", "wong", "  Wong"]) {
      expect(filterChaseRows(rows, filters({ q }), TODAY)).toHaveLength(1);
    }
    expect(filterChaseRows(rows, filters({ q: "wongg" }), TODAY)).toHaveLength(0);
  });

  it("scopes to one tutor", () => {
    const rows = [
      row({ student_id: 1, tutor_name: "Ms Ho" }),
      row({ student_id: 2, tutor_name: "Mr Lei" }),
    ];
    expect(filterChaseRows(rows, filters({ tutor: "Mr Lei" }), TODAY).map((r) => r.student_id))
      .toEqual([2]);
  });

  it("separates never contacted from contacted before", () => {
    const rows = [
      row({ student_id: 1, last_contact_date: null }),
      row({ student_id: 2, last_contact_date: "2026-05-30T00:00:00" }),
    ];
    expect(filterChaseRows(rows, filters({ contact: "no" }), TODAY).map((r) => r.student_id)).toEqual([1]);
    expect(filterChaseRows(rows, filters({ contact: "yes" }), TODAY).map((r) => r.student_id)).toEqual([2]);
  });

  it("finds the students who cannot be rung at all", () => {
    // These absorb caller effort silently: they look like ordinary work until
    // somebody opens the row and finds there is no number.
    const rows = [
      row({ student_id: 1, phone: null }),
      row({ student_id: 2, phone: "   " }),
      row({ student_id: 3, phone: "66880000" }),
    ];
    expect(filterChaseRows(rows, filters({ contact: "nophone" }), TODAY).map((r) => r.student_id))
      .toEqual([1, 2]);
  });

  it("finds the follow-ups that have come due", () => {
    const rows = [
      row({ student_id: 1, follow_up_needed: true, follow_up_date: "2026-08-01" }),
      row({ student_id: 2, follow_up_needed: true, follow_up_date: "2026-09-01" }),
      row({ student_id: 3 }),
    ];
    expect(filterChaseRows(rows, filters({ contact: "due" }), TODAY).map((r) => r.student_id))
      .toEqual([1]);
  });

  it("combines filters rather than replacing them", () => {
    const rows = [
      row({ student_id: 1, tutor_name: "Ms Ho", source: "regular_only", expected_grade: "F2" }),
      row({ student_id: 2, tutor_name: "Ms Ho", source: "summer_only", expected_grade: "F2" }),
      row({ student_id: 3, tutor_name: "Ms Ho", source: "regular_only", expected_grade: "F3" }),
    ];
    const got = filterChaseRows(
      rows,
      filters({ tutor: "Ms Ho", source: "regular_only", grade: "F2" }),
      TODAY
    );
    expect(got.map((r) => r.student_id)).toEqual([1]);
  });

  it("shows every state when asked for everyone", () => {
    const rows = [
      row({ student_id: 1, state: "no_response" }),
      row({ student_id: 2, state: "declined" }),
      row({ student_id: 3, state: "enrolled" }),
    ];
    expect(filterChaseRows(rows, filters({ state: "all" }), TODAY)).toHaveLength(3);
  });

  it("separates a transfer from a family that left", () => {
    // Two states written by the same dialog and meaning opposite things: one
    // is a lost customer, the other is a customer who is still ours.
    const rows = [
      row({ student_id: 1, state: "declined" }),
      row({ student_id: 2, state: "not_churn" }),
    ];
    expect(filterChaseRows(rows, filters({ state: "not_churn" }), TODAY).map((r) => r.student_id))
      .toEqual([2]);
    expect(filterChaseRows(rows, filters({ state: "declined" }), TODAY).map((r) => r.student_id))
      .toEqual([1]);
  });
});

describe("hasPhone", () => {
  it("treats a blank number as no number", () => {
    expect(hasPhone(row({ phone: "   " }))).toBe(false);
    expect(hasPhone(row({ phone: null }))).toBe(false);
    expect(hasPhone(row({ phone: "66880000" }))).toBe(true);
  });
});

describe("countChaseStates", () => {
  it("counts each state under the other filters, not under itself", () => {
    // The point of the numbers on the buttons: pressing one has to give you
    // the number it was showing. Counting the whole payload instead would have
    // every button overstate itself the moment anything else was narrowed.
    const rows = [
      row({ student_id: 1, state: "no_response", tutor_name: "Ms Ho" }),
      row({ student_id: 2, state: "applied", tutor_name: "Ms Ho" }),
      row({ student_id: 3, state: "applied", tutor_name: "Mr Lei" }),
    ];
    const counts = countChaseStates(rows, filters({ tutor: "Ms Ho" }), TODAY);

    expect(counts.no_response).toBe(1);
    expect(counts.applied).toBe(1);
    expect(counts.all).toBe(2);
  });

  it("holds still while you move between states", () => {
    const rows = [
      row({ student_id: 1, state: "no_response" }),
      row({ student_id: 2, state: "declined" }),
    ];
    const onChase = countChaseStates(rows, filters({ state: "no_response" }), TODAY);
    const onDeclined = countChaseStates(rows, filters({ state: "declined" }), TODAY);

    expect(onChase).toEqual(onDeclined);
  });

  it("agrees with the list each button produces", () => {
    const rows = [
      row({ student_id: 1, state: "no_response" }),
      row({ student_id: 2, state: "no_response", phone: null }),
      row({ student_id: 3, state: "applied" }),
    ];
    const base = filters({ contact: "nophone" });
    const counts = countChaseStates(rows, base, TODAY);

    expect(filterChaseRows(rows, { ...base, state: "no_response" }, TODAY)).toHaveLength(
      counts.no_response
    );
    expect(filterChaseRows(rows, { ...base, state: "all" }, TODAY)).toHaveLength(counts.all);
  });
});

describe("countChaseContact", () => {
  it("counts each way of being reachable, ignoring the one in force", () => {
    const rows = [
      row({ student_id: 1, last_contact_date: null }),
      row({ student_id: 2, last_contact_date: "2026-05-30T00:00:00" }),
      row({ student_id: 3, phone: null, last_contact_date: null }),
      row({ student_id: 4, follow_up_needed: true, follow_up_date: "2026-08-01" }),
    ];
    const counts = countChaseContact(rows, filters({ contact: "due" }), TODAY);

    expect(counts.no).toBe(3);
    expect(counts.yes).toBe(1);
    expect(counts.nophone).toBe(1);
    expect(counts.due).toBe(1);
  });

  it("respects the filters that are not about reachability", () => {
    const rows = [
      row({ student_id: 1, expected_grade: "F2", last_contact_date: null }),
      row({ student_id: 2, expected_grade: "F3", last_contact_date: null }),
    ];
    expect(countChaseContact(rows, filters({ grade: "F2" }), TODAY).no).toBe(1);
  });
});

describe("chase filters in the query string", () => {
  it("writes nothing for a filter still at its default", () => {
    expect(chaseFiltersToQuery(EMPTY_CHASE_FILTERS)).toEqual({
      q: null,
      grade: null,
      tutor: null,
      contact: null,
      source: null,
      state: null,
    });
  });

  it("survives the round trip", () => {
    const chosen = filters({
      q: "chan",
      grade: "F2",
      tutor: "Ms Ho",
      contact: "due",
      source: "regular_only",
      state: "applied",
    });
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(chaseFiltersToQuery(chosen))) if (v) params.set(k, v);

    expect(chaseFiltersFromQuery(params)).toEqual(chosen);
  });

  it("opens on the students to chase when the link says nothing", () => {
    expect(chaseFiltersFromQuery(new URLSearchParams())).toEqual(EMPTY_CHASE_FILTERS);
  });

  it("ignores values the list cannot offer", () => {
    // Links get edited, truncated by chat clients and kept past a rename. A
    // value nothing matches would show an empty table with no way to tell why.
    const params = new URLSearchParams("state=leaving&contact=maybe&source=nowhere");
    expect(chaseFiltersFromQuery(params)).toEqual(EMPTY_CHASE_FILTERS);
  });

  it("keeps a grade or tutor it does not recognise", () => {
    // These are real values that have simply moved on, and an empty list is
    // the honest answer rather than quietly showing somebody else's students.
    const got = chaseFiltersFromQuery(new URLSearchParams("grade=F9&tutor=Ms%20Nobody"));
    expect(got.grade).toBe("F9");
    expect(got.tutor).toBe("Ms Nobody");
  });
});

describe("chase sort in the query string", () => {
  it("survives the round trip", () => {
    const sort = { key: "days_since_contact", dir: "desc" } as const;
    expect(parseChaseSort(formatChaseSort(sort))).toEqual(sort);
  });

  it("writes nothing while the list is in the order the server sent", () => {
    expect(formatChaseSort({ key: null, dir: "asc" })).toBe("");
  });

  it("falls back to that order rather than throwing on rubbish", () => {
    for (const raw of [null, "", "nonsense", "student_nam:asc", ":::"]) {
      expect(parseChaseSort(raw)).toEqual({ key: null, dir: "asc" });
    }
  });

  it("treats anything but desc as ascending", () => {
    expect(parseChaseSort("student_name:sideways")).toEqual({
      key: "student_name",
      dir: "asc",
    });
  });
});

describe("shortDate", () => {
  it("drops the year within the current year", () => {
    expect(shortDate("2026-08-12T09:30:00", new Date("2026-08-11"))).toBe("12 Aug");
  });

  it("keeps the year for anything older", () => {
    expect(shortDate("2025-11-03T09:30:00", new Date("2026-08-11"))).toBe("3 Nov 2025");
  });

  it("passes an unparseable value straight through", () => {
    expect(shortDate("not a date", new Date("2026-08-11"))).toBe("not a date");
  });
});
