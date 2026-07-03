import { describe, it, expect } from "vitest";
import { computeConceptLanes, mergePacingRows } from "./curriculum-bands";
import type { CurriculumPacingBand, CurriculumTimelineConcept } from "@/types";

function concept(
  id: number,
  rank: number,
  overrides: Partial<CurriculumTimelineConcept> = {}
): CurriculumTimelineConcept {
  return {
    concept_id: id,
    weight: 2.5,
    source_count: 2,
    sources: ["assignment", "prep_folder"],
    rank,
    name_en: `Concept ${id}`,
    name_zh: null,
    ...overrides,
  };
}

describe("computeConceptLanes", () => {
  it("merges consecutive weeks of the same rank status into one segment", () => {
    const lanes = computeConceptLanes([
      { week_number: 10, concepts: [concept(1, 1)] },
      { week_number: 11, concepts: [concept(1, 1)] },
      { week_number: 12, concepts: [concept(1, 1)] },
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].segments).toEqual([
      { startWeek: 10, endWeek: 12, primary: true },
    ]);
    expect(lanes[0].firstWeek).toBe(10);
    expect(lanes[0].lastWeek).toBe(12);
  });

  it("splits segments on week gaps", () => {
    const lanes = computeConceptLanes([
      { week_number: 10, concepts: [concept(1, 1)] },
      { week_number: 13, concepts: [concept(1, 1)] },
    ]);
    expect(lanes[0].segments).toEqual([
      { startWeek: 10, endWeek: 10, primary: true },
      { startWeek: 13, endWeek: 13, primary: true },
    ]);
  });

  it("splits segments when rank-1 status changes", () => {
    const lanes = computeConceptLanes([
      { week_number: 10, concepts: [concept(1, 2)] },
      { week_number: 11, concepts: [concept(1, 1)] },
      { week_number: 12, concepts: [concept(1, 1)] },
      { week_number: 13, concepts: [concept(1, 3)] },
    ]);
    expect(lanes[0].segments).toEqual([
      { startWeek: 10, endWeek: 10, primary: false },
      { startWeek: 11, endWeek: 12, primary: true },
      { startWeek: 13, endWeek: 13, primary: false },
    ]);
  });

  it("orders lanes by first appearance", () => {
    const lanes = computeConceptLanes([
      { week_number: 12, concepts: [concept(2, 1)] },
      { week_number: 10, concepts: [concept(1, 1), concept(3, 2)] },
    ]);
    expect(lanes.map((l) => l.conceptId)).toEqual([1, 3, 2]);
  });

  it("keeps per-week evidence for the detail strip", () => {
    const lanes = computeConceptLanes([
      {
        week_number: 10,
        concepts: [concept(1, 1, { weight: 4.2, sources: ["sheet"] })],
      },
    ]);
    expect(lanes[0].weeks).toEqual([
      { week_number: 10, rank: 1, weight: 4.2, sources: ["sheet"] },
    ]);
  });

  it("keeps the best rank when a concept appears twice in a week", () => {
    const lanes = computeConceptLanes([
      {
        week_number: 10,
        concepts: [concept(1, 2), concept(1, 1, { weight: 5 })],
      },
    ]);
    expect(lanes[0].weeks).toEqual([
      { week_number: 10, rank: 1, weight: 5, sources: ["assignment", "prep_folder"] },
    ]);
    expect(lanes[0].segments).toEqual([
      { startWeek: 10, endWeek: 10, primary: true },
    ]);
  });

  it("returns an empty list for an empty timeline", () => {
    expect(computeConceptLanes([])).toEqual([]);
  });
});

function band(
  conceptId: number,
  meanWeek: number,
  overrides: Partial<CurriculumPacingBand> = {}
): CurriculumPacingBand {
  return {
    concept_id: conceptId,
    years_observed: 2,
    mean_week: meanWeek,
    min_week: Math.max(1, meanWeek - 2),
    max_week: meanWeek + 2,
    week_spread: 2,
    name_en: `Concept ${conceptId}`,
    name_zh: null,
    ...overrides,
  };
}

describe("mergePacingRows", () => {
  it("keys rows by concept and orders by the primary school's pace", () => {
    const rows = mergePacingRows(
      [[band(1, 20), band(2, 5)], [band(1, 22)]],
      new Map()
    );
    expect(rows.map((r) => r.conceptId)).toEqual([2, 1]);
    expect(rows[1].cells[0]?.band.mean_week).toBe(20);
    expect(rows[1].cells[1]?.band.mean_week).toBe(22);
    expect(rows[1].cells[1]?.fromEquivalent).toBe(false);
  });

  it("attaches a comparison band to the primary row via a direct equivalence edge", () => {
    // primary is an HK school (concept 10), comparison is MAS (concept 90)
    const rows = mergePacingRows(
      [[band(10, 12)], [band(90, 14)]],
      new Map([
        [10, [90]],
        [90, [10]],
      ])
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].conceptId).toBe(10);
    expect(rows[0].cells[1]?.band.concept_id).toBe(90);
    expect(rows[0].cells[1]?.fromEquivalent).toBe(true);
  });

  it("renders a band on every equivalent primary row (1:2 chapter split)", () => {
    // MAS Real Numbers (90) spans HK roots (10) + surds (11)
    const rows = mergePacingRows(
      [[band(10, 8), band(11, 15)], [band(90, 10)]],
      new Map([
        [90, [10, 11]],
        [10, [90]],
        [11, [90]],
      ])
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].cells[1]?.band.concept_id).toBe(90);
    expect(rows[1].cells[1]?.band.concept_id).toBe(90);
    expect(rows[0].cells[1]?.fromEquivalent).toBe(true);
  });

  it("does not chain equivalence transitively", () => {
    // 90 ~ 10 and 91 ~ 10, but 90 and 91 must not merge with each other:
    // primary has no row for 10, so both keep their own rows.
    const rows = mergePacingRows(
      [[band(5, 3)], [band(90, 10)], [band(91, 12)]],
      new Map([
        [90, [10]],
        [91, [10]],
        [10, [90, 91]],
      ])
    );
    expect(rows.map((r) => r.conceptId)).toEqual([5, 90, 91]);
  });

  it("prefers the same-concept row over an equivalent one", () => {
    const rows = mergePacingRows(
      [[band(10, 8), band(90, 20)], [band(90, 21)]],
      new Map([
        [10, [90]],
        [90, [10]],
      ])
    );
    const target = rows.find((r) => r.conceptId === 90);
    expect(target?.cells[1]?.band.mean_week).toBe(21);
    expect(target?.cells[1]?.fromEquivalent).toBe(false);
    expect(rows.find((r) => r.conceptId === 10)?.cells[1]).toBeNull();
  });

  it("appends unmatched comparison concepts after the primary rows", () => {
    const rows = mergePacingRows(
      [[band(1, 30)], [band(50, 2)]],
      new Map()
    );
    expect(rows.map((r) => r.conceptId)).toEqual([1, 50]);
    expect(rows[1].cells[0]).toBeNull();
  });

  it("shares one trailing row when two comparisons carry the same concept", () => {
    const rows = mergePacingRows(
      [[band(1, 10)], [band(50, 20)], [band(50, 22)]],
      new Map()
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].cells[1]?.band.mean_week).toBe(20);
    expect(rows[1].cells[2]?.band.mean_week).toBe(22);
  });
});
