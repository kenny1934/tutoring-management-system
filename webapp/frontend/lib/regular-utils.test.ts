import { describe, it, expect } from "vitest";
import {
  effectiveStream,
  divergentRecordStream,
  foldStream,
  foldSchoolName,
  schoolGroupKey,
  streamName,
  getMismatchedStreams,
} from "./regular-utils";

/** The rule these cover: school-aware surfaces group on the backend's
 *  canonical code when it recognised the spelling, and on the folded raw
 *  spelling otherwise, so the frontend never re-implements the alias mapping
 *  yet unrecognised spellings still group with themselves. */
describe("schoolGroupKey and foldSchoolName", () => {
  it("prefers the canonical code from the backend", () => {
    expect(schoolGroupKey({ school: "聖羅撒女子中學", school_canonical: "SRL-C" })).toBe("SRL-C");
  });

  it("falls back to the folded spelling when unrecognised", () => {
    expect(schoolGroupKey({ school: " Mystery  Academy ", school_canonical: null })).toBe("mystery academy");
  });

  it("is null when no school was given", () => {
    expect(schoolGroupKey({ school: "   ", school_canonical: null })).toBeNull();
    expect(schoolGroupKey({})).toBeNull();
  });

  it("folds full-width spaces like the backend does", () => {
    expect(foldSchoolName("培正中學　（路環校部）")).toBe(foldSchoolName("培正中學 （路環校部）"));
  });
});

/** The rule these cover: an application's own stream governs placement, because
 *  a family fills the form in for the year they are applying for while the
 *  student record can be a year stale and nothing in the intake writes back to
 *  it. Mirror of effective_stream in the backend's regular_course router. */
describe("effectiveStream", () => {
  it("prefers the form over a stale student record", () => {
    expect(effectiveStream({ lang_stream: "E", linked_student: { lang_stream: "C" } })).toBe("E");
  });

  it("folds International into English", () => {
    expect(effectiveStream({ lang_stream: "Int" })).toBe("E");
    expect(effectiveStream({ lang_stream: "Int", linked_student: { lang_stream: "C" } })).toBe("E");
  });

  it("falls back to the record when the form carries no stream", () => {
    expect(effectiveStream({ lang_stream: null, linked_student: { lang_stream: "C" } })).toBe("C");
    expect(effectiveStream({ lang_stream: "  ", linked_student: { lang_stream: "C" } })).toBe("C");
  });

  it("is null when neither side has anything", () => {
    expect(effectiveStream({ lang_stream: null, linked_student: null })).toBeNull();
    expect(effectiveStream({})).toBeNull();
  });
});

describe("divergentRecordStream", () => {
  it("returns the record's stream when the two disagree", () => {
    expect(divergentRecordStream({ lang_stream: "E", linked_student: { lang_stream: "C" } })).toBe("C");
    expect(divergentRecordStream({ lang_stream: "C", linked_student: { lang_stream: "E" } })).toBe("E");
  });

  it("does not call an International form against an English record a disagreement", () => {
    expect(divergentRecordStream({ lang_stream: "Int", linked_student: { lang_stream: "E" } })).toBeNull();
  });

  it("stays quiet when either side is missing or they agree", () => {
    expect(divergentRecordStream({ lang_stream: "E", linked_student: { lang_stream: "E" } })).toBeNull();
    expect(divergentRecordStream({ lang_stream: "E", linked_student: null })).toBeNull();
    expect(divergentRecordStream({ lang_stream: null, linked_student: { lang_stream: "C" } })).toBeNull();
  });
});

describe("streamName", () => {
  it("writes the stream out for a sentence an admin reads", () => {
    expect(streamName("C")).toBe("Chinese");
    expect(streamName("E")).toBe("English");
    expect(streamName("Int")).toBe("International");
  });

  it("hands anything else back untouched", () => {
    expect(streamName(null)).toBe("");
    expect(streamName("X")).toBe("X");
  });
});

describe("foldStream and getMismatchedStreams", () => {
  it("folds Int and treats blanks as nothing set", () => {
    expect(foldStream("Int")).toBe("E");
    expect(foldStream(" ")).toBeNull();
    expect(foldStream("C")).toBe("C");
  });

  it("warns the slot card only about students who really are on another stream", () => {
    // The slot payload now carries the effective stream, so an E student whose
    // record still says C arrives as E and raises nothing.
    expect(getMismatchedStreams("E", [{ lang_stream: "E" }, { lang_stream: "E" }])).toEqual([]);
    expect(getMismatchedStreams("E", [{ lang_stream: "C" }, { lang_stream: "E" }])).toEqual(["C"]);
    // A slot with no stream of its own takes anybody.
    expect(getMismatchedStreams(null, [{ lang_stream: "C" }])).toEqual([]);
  });
});
