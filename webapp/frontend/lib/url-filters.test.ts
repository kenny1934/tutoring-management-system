import { describe, it, expect } from "vitest";
import { mergeQuery } from "./url-filters";

describe("mergeQuery", () => {
  it("writes the keys it is given", () => {
    expect(mergeQuery("", { grade: "F2", state: "applied" })).toBe("grade=F2&state=applied");
  });

  it("leaves keys it was not given alone", () => {
    // The reason this function exists. Two components own different halves of
    // the retention board's query string, and a writer that rebuilt the whole
    // thing from its own state would drop the other one's keys every time.
    expect(mergeQuery("year=2026&branch=MSA", { grade: "F2" })).toBe(
      "year=2026&branch=MSA&grade=F2"
    );
  });

  it("removes a key set back to its default", () => {
    for (const empty of [null, undefined, ""]) {
      expect(mergeQuery("year=2026&grade=F2", { grade: empty })).toBe("year=2026");
    }
  });

  it("overwrites rather than appending a second copy", () => {
    expect(mergeQuery("grade=F2", { grade: "F3" })).toBe("grade=F3");
  });

  it("copes with a leading question mark, which is how the browser hands it over", () => {
    expect(mergeQuery("?year=2026", { grade: "F2" })).toBe("year=2026&grade=F2");
  });

  it("escapes what it writes", () => {
    expect(mergeQuery("", { tutor: "Ms Ho & Co", q: "chan tai" })).toBe(
      "tutor=Ms+Ho+%26+Co&q=chan+tai"
    );
  });

  it("empties out completely when the last filter goes", () => {
    expect(mergeQuery("grade=F2", { grade: null })).toBe("");
  });
});
