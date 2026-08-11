import { describe, it, expect } from "vitest";
import {
  EMPTY_CHASE_FILTERS,
  filterChaseRows,
  hasPhone,
  isFollowUpDue,
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
    tutor_id: 1,
    tutor_name: "Ms Ho",
    source: "regular_only",
    on_prospect_board: false,
    state: "no_response",
    reference_code: null,
    last_contact_date: null,
    days_since_contact: null,
    follow_up_needed: false,
    follow_up_date: null,
    decline_reason: null,
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
      row({ student_id: 1, tutor_name: "Ms Ho", branch: "MSA", expected_grade: "F2" }),
      row({ student_id: 2, tutor_name: "Ms Ho", branch: "MSB", expected_grade: "F2" }),
      row({ student_id: 3, tutor_name: "Ms Ho", branch: "MSA", expected_grade: "F3" }),
    ];
    const got = filterChaseRows(rows, filters({ tutor: "Ms Ho", branch: "MSA", grade: "F2" }), TODAY);
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
