import { describe, it, expect } from "vitest";
import {
  EMPTY_CONVERSION_FILTERS,
  DEFAULT_CONVERSION_SORT,
  NO_BRANCH_WANTED,
  UNKNOWN_INTENTION,
  conversionFiltersFromQuery,
  conversionFiltersToQuery,
  filterLostProspects,
  formatConversionSort,
  parseConversionSort,
  type ConversionChaseFilters,
} from "./conversion-utils";
import type { RegularConversionLostRow } from "@/types";

function row(over: Partial<RegularConversionLostRow> = {}): RegularConversionLostRow {
  return {
    prospect_id: 1,
    student_name: "Chan Tai Man",
    source_branch: "MAC",
    primary_student_id: "MAC2140",
    grade: "P6",
    school: "CDSJ1-C",
    phone_1: "62711422",
    phone_2: null,
    wechat_id: null,
    wants_regular: "Yes",
    preferred_branches: ["MSA"],
    outreach_status: "WeChat - Added",
    attended_summer: false,
    summer_student_code: null,
    ...over,
  };
}

const filters = (over: Partial<ConversionChaseFilters> = {}): ConversionChaseFilters => ({
  ...EMPTY_CONVERSION_FILTERS,
  ...over,
});

describe("filterLostProspects", () => {
  it("shows the whole list until something is chosen", () => {
    const rows = [row({ prospect_id: 1 }), row({ prospect_id: 2 })];
    expect(filterLostProspects(rows, EMPTY_CONVERSION_FILTERS)).toHaveLength(2);
  });

  it("searches name, code, phone and school together", () => {
    const rows = [
      row({
        prospect_id: 1,
        student_name: "Wong Siu Ming",
        primary_student_id: "MAC2140",
        phone_1: "62711422",
        school: "CDSJ1-C",
      }),
      row({
        prospect_id: 2,
        student_name: "Chan Tai Man",
        source_branch: "MNT",
        primary_student_id: "MNT0881",
        phone_1: "66163182",
        school: "DBYW-E",
      }),
    ];
    const only = (q: string) =>
      filterLostProspects(rows, filters({ q })).map((r) => r.prospect_id);

    expect(only("siu")).toEqual([1]);
    expect(only("6616")).toEqual([2]);
    expect(only("DBYW")).toEqual([2]);
    expect(only("2140")).toEqual([1]);
  });

  it("finds a prospect by the code as the table writes it and as the record holds it", () => {
    // The table shows "MAC-2140"; the record holds "MAC2140". Whoever is typing
    // may be reading either one.
    const rows = [row({ source_branch: "MAC", primary_student_id: "MAC2140" })];
    expect(filterLostProspects(rows, filters({ q: "MAC-2140" }))).toHaveLength(1);
    expect(filterLostProspects(rows, filters({ q: "MAC2140" }))).toHaveLength(1);
  });

  it("searches the summer code of a prospect who did the summer course", () => {
    const rows = [
      row({ prospect_id: 1, summer_student_code: "MSA-1001", attended_summer: true }),
      row({ prospect_id: 2 }),
    ];
    expect(filterLostProspects(rows, filters({ q: "msa-1001" })).map((r) => r.prospect_id))
      .toEqual([1]);
  });

  it("searches the second phone number as well as the first", () => {
    // Families give a father's and a mother's number, and the callback can come
    // from either.
    const rows = [row({ phone_1: "62711422", phone_2: "66802772" })];
    expect(filterLostProspects(rows, filters({ q: "66802772" }))).toHaveLength(1);
  });

  it("ignores case and stray spaces in the search", () => {
    // Staff paste names and codes in from elsewhere, so both arrive padded.
    const rows = [row({ student_name: "Wong Siu Ming" })];
    for (const q of ["  WONG  ", "wong", "  Wong"]) {
      expect(filterLostProspects(rows, filters({ q }))).toHaveLength(1);
    }
    expect(filterLostProspects(rows, filters({ q: "wongg" }))).toHaveLength(0);
  });

  it("does not match on a field the table never shows", () => {
    // WeChat ids are on the row but not in the haystack, so a search cannot
    // quietly return somebody the reader has no way of recognising.
    const rows = [row({ wechat_id: "tinatina88" })];
    expect(filterLostProspects(rows, filters({ q: "tinatina" }))).toHaveLength(0);
  });

  it("narrows to one branch through the search, since the list has no branch control", () => {
    // Scoping the report to a branch is the page's job. The search still gets
    // you there on its own, because the branch code is the front of every
    // prospect code.
    const rows = [
      row({ prospect_id: 1, source_branch: "MAC", primary_student_id: "MAC2140" }),
      row({ prospect_id: 2, source_branch: "MNT", primary_student_id: "MNT0881" }),
    ];
    expect(filterLostProspects(rows, filters({ q: "mnt" })).map((r) => r.prospect_id))
      .toEqual([2]);
  });

  it("separates the branch a parent named from the ones who named none", () => {
    const rows = [
      row({ prospect_id: 1, preferred_branches: ["MSA"] }),
      row({ prospect_id: 2, preferred_branches: ["MSB", "MSA"] }),
      row({ prospect_id: 3, preferred_branches: [] }),
    ];
    expect(filterLostProspects(rows, filters({ wantsBranch: "MSA" })).map((r) => r.prospect_id))
      .toEqual([1, 2]);
    expect(
      filterLostProspects(rows, filters({ wantsBranch: NO_BRANCH_WANTED })).map((r) => r.prospect_id)
    ).toEqual([3]);
  });

  it("groups a prospect who never answered under Unknown", () => {
    const rows = [
      row({ prospect_id: 1, wants_regular: "Considering" }),
      row({ prospect_id: 2, wants_regular: null }),
    ];
    expect(
      filterLostProspects(rows, filters({ wantsRegular: UNKNOWN_INTENTION })).map((r) => r.prospect_id)
    ).toEqual([2]);
  });

  it("combines filters rather than replacing them", () => {
    const rows = [
      row({ prospect_id: 1, preferred_branches: ["MSA"], wants_regular: "Yes", outreach_status: "Not Started" }),
      row({ prospect_id: 2, preferred_branches: ["MSA"], wants_regular: "No", outreach_status: "Not Started" }),
      row({ prospect_id: 3, preferred_branches: ["MSB"], wants_regular: "Yes", outreach_status: "Not Started" }),
      row({ prospect_id: 4, preferred_branches: ["MSA"], wants_regular: "Yes", outreach_status: "WeChat - Added" }),
    ];
    const got = filterLostProspects(
      rows,
      filters({ wantsBranch: "MSA", wantsRegular: "Yes", outreach: "Not Started" })
    );
    expect(got.map((r) => r.prospect_id)).toEqual([1]);
  });

  it("narrows a search by the filters already in force", () => {
    const rows = [
      row({ prospect_id: 1, student_name: "Wong Siu Ming", wants_regular: "Yes" }),
      row({ prospect_id: 2, student_name: "Wong Ka Ho", wants_regular: "No" }),
    ];
    expect(
      filterLostProspects(rows, filters({ q: "wong", wantsRegular: "No" })).map((r) => r.prospect_id)
    ).toEqual([2]);
  });

  it("does not reorder what it is given", () => {
    // The report arrives with the parents who said Yes at the top, and that is
    // the order to work in until somebody clicks a column.
    const rows = [row({ prospect_id: 3 }), row({ prospect_id: 1 }), row({ prospect_id: 2 })];
    expect(filterLostProspects(rows, EMPTY_CONVERSION_FILTERS).map((r) => r.prospect_id))
      .toEqual([3, 1, 2]);
  });
});

describe("chase filters in the query string", () => {
  it("writes nothing for a filter still at its default", () => {
    expect(conversionFiltersToQuery(EMPTY_CONVERSION_FILTERS)).toEqual({
      q: null,
      wantsBranch: null,
      wantsRegular: null,
      outreach: null,
    });
  });

  it("leaves the page's own keys alone", () => {
    // The page owns the year, the branch the whole report is scoped to and
    // which tab is open. A writer that returned those too would fight the page
    // for them every time somebody typed.
    const written = Object.keys(conversionFiltersToQuery(filters({ q: "chan" })));
    for (const theirs of ["year", "branch", "tab"]) {
      expect(written).not.toContain(theirs);
    }
  });

  it("survives the round trip", () => {
    const chosen = filters({
      q: "chan",
      wantsBranch: "MSA",
      wantsRegular: "Considering",
      outreach: "Not Started",
    });
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(conversionFiltersToQuery(chosen))) if (v) params.set(k, v);

    expect(conversionFiltersFromQuery(params)).toEqual(chosen);
  });

  it("shows the whole list when the link says nothing", () => {
    expect(conversionFiltersFromQuery(new URLSearchParams())).toEqual(EMPTY_CONVERSION_FILTERS);
  });

  it("trims a search before it goes in the address bar", () => {
    expect(conversionFiltersToQuery(filters({ q: "  chan  " })).q).toBe("chan");
  });

  it("keeps a wanted branch it does not recognise", () => {
    // Branch codes are an open set: an unfamiliar one is a real branch nobody
    // is asking for any more, and an empty list is the honest answer rather
    // than quietly showing somebody else's prospects.
    expect(conversionFiltersFromQuery(new URLSearchParams("wantsBranch=MSC")).wantsBranch)
      .toBe("MSC");
  });

  it("ignores a branch the prospect came from, which the page owns now", () => {
    // The list used to carry its own copy of this filter. An old link still
    // holding one must not resurrect it as a filter nothing on screen explains.
    expect(conversionFiltersFromQuery(new URLSearchParams("from=MAC"))).toEqual(
      EMPTY_CONVERSION_FILTERS
    );
  });

  it("drops an intention or outreach status the list cannot offer", () => {
    // These two are closed sets, so an unrecognised value is a typo or a stale
    // link rather than a real value. Honouring it would empty the table while
    // its own control still read "all".
    const got = conversionFiltersFromQuery(
      new URLSearchParams("wantsRegular=Maybe&outreach=Ringing")
    );
    expect(got.wantsRegular).toBe("");
    expect(got.outreach).toBe("");
  });

  it("keeps every outreach status that really exists", () => {
    for (const status of ["Not Started", "WeChat - Added", "Called", "No Response"]) {
      const params = new URLSearchParams();
      params.set("outreach", status);
      expect(conversionFiltersFromQuery(params).outreach).toBe(status);
    }
  });

  it("keeps the no-answer bucket, which is a real choice on the ladder", () => {
    const params = new URLSearchParams();
    params.set("wantsRegular", UNKNOWN_INTENTION);
    expect(conversionFiltersFromQuery(params).wantsRegular).toBe(UNKNOWN_INTENTION);
  });
});

describe("chase sort in the query string", () => {
  it("survives the round trip", () => {
    const sort = { key: "student_name", dir: "asc" } as const;
    expect(parseConversionSort(formatConversionSort(sort))).toEqual(sort);
  });

  it("writes nothing while the list is in the order the server sent", () => {
    expect(formatConversionSort(DEFAULT_CONVERSION_SORT)).toBe("");
  });

  it("falls back to that order rather than throwing on rubbish", () => {
    for (const raw of [null, "", "nonsense", "student_nam:asc", ":::"]) {
      expect(parseConversionSort(raw)).toEqual(DEFAULT_CONVERSION_SORT);
    }
  });

  it("ignores a column that is not on the table", () => {
    // wechat_id is on the row but has no header to click, so a link asking for
    // it would sort by something the reader cannot see.
    expect(parseConversionSort("wechat_id:asc")).toEqual(DEFAULT_CONVERSION_SORT);
  });

  it("treats anything but asc as descending, which is how a header opens", () => {
    expect(parseConversionSort("grade:sideways")).toEqual({ key: "grade", dir: "desc" });
  });
});
