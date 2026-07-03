import { describe, it, expect } from "vitest";
import { computeConceptLanes } from "./curriculum-bands";
import type { CurriculumTimelineConcept } from "@/types";

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
