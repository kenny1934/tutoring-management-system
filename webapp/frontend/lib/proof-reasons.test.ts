import { describe, it, expect, beforeEach } from "vitest";
import {
  PROOF_TOPICS, fillSlots, readRecentLines, reasonPart, rememberRecentLine, searchReasons, slotsIn,
  type ProofReason, type ReasonLine,
} from "./proof-reasons";

const ALL = PROOF_TOPICS.flatMap((topic) => topic.reasons);
const find = (line: string): ProofReason => ALL.find((r) => r.en.includes(line) || r.zh.includes(line))!;

describe("the proof reasons", () => {
  it("gives every reason something to place, and no empty lines", () => {
    for (const reason of ALL) {
      expect(reason.en.length + reason.zh.length).toBeGreaterThan(0);
      for (const line of [...reason.en, ...reason.zh]) expect(line.trim()).not.toBe("");
    }
  });

  it("writes the Chinese with full-width punctuation", () => {
    for (const line of ALL.flatMap((r) => [...r.zh, r.note ?? ""])) expect(line).not.toMatch(/[,:;()]/);
  });

  it("closes every set of letters it opens", () => {
    for (const line of ALL.flatMap((r) => [...r.en, ...r.zh])) {
      expect(slotsIn(line)).toHaveLength((line.match(/\{/g) ?? []).length);
      expect(line.match(/\{/g)?.length ?? 0).toBe(line.match(/\}/g)?.length ?? 0);
    }
  });

  it("asks for the two lines' letters in the three reasons about parallel lines", () => {
    const withLetters = ALL.flatMap((r) => r.en).filter((line) => slotsIn(line).length > 0);
    expect(withLetters).toEqual(["corr. ∠s, {AB} // {CD}", "alt. ∠s, {AB} // {CD}", "int. ∠s, {AB} // {CD}"]);
  });
});

describe("fillSlots", () => {
  it("puts the typed letters in, and keeps the letters a slot starts with when it's left blank", () => {
    expect(fillSlots("alt. ∠s, {AB} // {CD}")).toBe("alt. ∠s, AB // CD");
    expect(fillSlots("alt. ∠s, {AB} // {CD}", ["PQ", "RS"])).toBe("alt. ∠s, PQ // RS");
    expect(fillSlots("alt. ∠s, {AB} // {CD}", ["PQ", "  "])).toBe("alt. ∠s, PQ // CD");
  });
});

describe("reasonPart", () => {
  it("fills in the letters, keeps the ones a line starts with, and sets only the English in italic", () => {
    const alternate = { side: "en", line: "alt. ∠s, {AB} // {CD}" } as const;
    expect(reasonPart(alternate, ["PQ", "RS"])).toEqual({ text: "alt. ∠s, PQ // RS", italic: true });
    expect(reasonPart(alternate)).toEqual({ text: "alt. ∠s, AB // CD", italic: true });
    expect(reasonPart({ side: "zh", line: "對頂角相等" })).toEqual({ text: "對頂角相等", italic: false });
  });
});

describe("searchReasons", () => {
  it("finds English with the dots and spaces left out, and Chinese as it's typed", () => {
    expect(searchReasons("vert opp").flatMap((t) => t.reasons)).toEqual([find("vert. opp. ∠s")]);
    expect(searchReasons("內錯").flatMap((t) => t.reasons.map((r) => r.en[0]))).toEqual(["alt. ∠s, {AB} // {CD}", "alt. ∠s equal"]);
  });

  it("keeps each match under its topic, and leaves out the topics with none", () => {
    const topics = searchReasons("rhombus");
    expect(topics.map((t) => t.title)).toEqual(["Rectangles, rhombuses and squares"]);
  });

  it("finds a reason by the letters its slots start with", () => {
    expect(searchReasons("AB // CD").flatMap((t) => t.reasons)).toHaveLength(3);
  });

  it("finds the whole of a topic by its name, in English or in Chinese", () => {
    const congruent = PROOF_TOPICS.find((topic) => topic.tab === "Congruent")!;
    expect(searchReasons("congruent")).toEqual([congruent]);
    expect(searchReasons("cong")).toEqual([congruent]);
    expect(searchReasons("全等")).toEqual([congruent]);
    expect(searchReasons("pythagoras theorem").map((topic) => topic.tab)).toEqual(["Pythagoras"]);
  });

  it("matches a topic's English name from the start of a word, so a search for angles leaves out the triangles", () => {
    const titles = searchReasons("angle").map((topic) => topic.title);
    expect(titles).toContain("Angles and parallel lines");
    expect(titles).toContain("Angles in a circle");
    expect(titles).not.toContain("Triangles and polygons");
  });

  it("leaves out commas, so Chinese typed without its punctuation still matches", () => {
    expect(searchReasons("兩直線平行內錯角").flatMap((topic) => topic.reasons)).toEqual([find("兩直線平行，內錯角相等")]);
  });

  it("finds nothing for words no reason has", () => {
    expect(searchReasons("xylophone")).toEqual([]);
  });
});

describe("the topics' tabs", () => {
  it("gives every topic a short name of one or two words", () => {
    for (const topic of PROOF_TOPICS) expect(topic.tab.split(" ").length).toBeLessThanOrEqual(2);
    expect(new Set(PROOF_TOPICS.map((topic) => topic.tab)).size).toBe(PROOF_TOPICS.length);
  });
});

describe("the recent lines", () => {
  beforeEach(() => localStorage.clear());

  it("keeps the last six picked, newest first, with no line twice", () => {
    const lines: ReasonLine[] = ALL.flatMap((r) => r.zh.map((line) => ({ side: "zh" as const, line }))).slice(0, 7);
    for (const line of lines) rememberRecentLine(line);
    rememberRecentLine(lines[3]);
    expect(readRecentLines()).toEqual([lines[3], lines[6], lines[5], lines[4], lines[2], lines[1]]);
  });

  it("drops a remembered line that the list no longer has", () => {
    localStorage.setItem("csm_proof_reasons_recent", JSON.stringify([{ side: "en", line: "gone" }, { side: "zh", line: "對頂角相等" }]));
    expect(readRecentLines()).toEqual([{ side: "zh", line: "對頂角相等" }]);
  });
});
