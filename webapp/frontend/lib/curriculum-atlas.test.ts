import { describe, it, expect } from "vitest";
import {
  ATLAS_GRADES,
  STRAND_ORDER,
  collectRelated,
  computeAtlasLayout,
  computeAtlasStatus,
  inferSeries,
  toAtlasInputs,
  type AtlasConceptInput,
  type AtlasEdgeInput,
  type AtlasGrade,
  type AtlasSeries,
  type AtlasStrand,
} from "./curriculum-atlas";
import type { CurriculumConceptVocab, CurriculumPacingBand } from "@/types";

function concept(
  id: number,
  grade: AtlasGrade,
  strand: AtlasStrand,
  displayOrder: number,
  overrides: Partial<AtlasConceptInput> = {}
): AtlasConceptInput {
  return {
    id,
    name_en: `Concept ${id}`,
    name_zh: null,
    grade,
    strand,
    displayOrder,
    series: ["HK"],
    isExtension: false,
    ...overrides,
  };
}

function vocab(
  id: number,
  overrides: Partial<CurriculumConceptVocab> = {}
): CurriculumConceptVocab {
  return {
    id,
    kind: "chapter",
    name_en: `Concept ${id}`,
    name_zh: null,
    grade: "F1",
    parent_id: null,
    strand: "algebra",
    atlas_grade: null,
    display_order: id,
    codes: [{ code_space: "HK_NEW", code: `${700 + id}` }],
    equivalent_ids: [],
    builds_on_ids: [],
    leads_to_ids: [],
    ...overrides,
  };
}

describe("toAtlasInputs", () => {
  it("derives series from code spaces and defaults codeless concepts to both", () => {
    const { concepts } = toAtlasInputs([
      vocab(1, { codes: [{ code_space: "MAS", code: "701" }] }),
      vocab(2, { codes: [{ code_space: "HK_OLD", code: "707" }] }),
      vocab(3, { codes: [], kind: "extension", grade: null, atlas_grade: "F2" }),
    ]);
    expect(concepts.find((c) => c.id === 1)?.series).toEqual(["MAS"]);
    expect(concepts.find((c) => c.id === 2)?.series).toEqual(["HK"]);
    expect(concepts.find((c) => c.id === 3)?.series).toEqual(["MAS", "HK"]);
    expect(concepts.find((c) => c.id === 3)?.grade).toBe("F2");
    expect(concepts.find((c) => c.id === 3)?.isExtension).toBe(true);
  });

  it("skips concepts without strand or placeable grade, and their edges", () => {
    const { concepts, edges } = toAtlasInputs([
      vocab(1),
      vocab(2, { strand: null }),
      vocab(3, { grade: null, atlas_grade: null }),
      vocab(4, { builds_on_ids: [1, 2, 3] }),
    ]);
    expect(concepts.map((c) => c.id)).toEqual([1, 4]);
    expect(edges).toEqual([{ fromId: 1, toId: 4 }]);
  });
});

describe("computeAtlasLayout", () => {
  const opts = {
    canvasWidth: 900,
    nodeWidth: 100,
    nodeHeight: 30,
    nodeGapY: 10,
    cellPadX: 26,
    cellPadY: 10,
    rowGapY: 20,
  };

  it("sizes each row to its tallest cell and keeps a floor for empty rows", () => {
    const layout = computeAtlasLayout(
      [
        concept(1, "F1", "number", 1),
        concept(2, "F1", "number", 2),
        concept(3, "F2", "number", 1),
        concept(4, "F1", "algebra", 1),
      ],
      [],
      "HK",
      opts
    );
    // number row: 2 nodes -> 2*30 + 10 + 2*10 = 90; algebra: 1 node -> 50;
    // geometry/data empty -> floor 50.
    expect(layout.grid.rows[0].height).toBe(90);
    expect(layout.grid.rows[1].height).toBe(50);
    expect(layout.grid.rows[2].height).toBe(50);
    expect(layout.grid.rows[3].height).toBe(50);
    expect(layout.grid.height).toBe(90 + 50 + 50 + 50 + 3 * 20);
    expect(layout.grid.columns.map((c) => c.x)).toEqual([0, 300, 600]);
  });

  it("orders nodes in a cell by displayOrder without overlap", () => {
    const layout = computeAtlasLayout(
      [concept(1, "F1", "number", 5), concept(2, "F1", "number", 2)],
      [],
      "HK",
      opts
    );
    const first = layout.nodes[0];
    const second = layout.nodes[1];
    expect(first.concept.id).toBe(2);
    expect(second.concept.id).toBe(1);
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.h);
  });

  it("filters to the requested series", () => {
    const layout = computeAtlasLayout(
      [
        concept(1, "F1", "number", 1, { series: ["MAS"] }),
        concept(2, "F1", "number", 2, { series: ["HK"] }),
        concept(3, "F1", "number", 3, { series: ["MAS", "HK"] }),
      ],
      [{ fromId: 1, toId: 3 }],
      "MAS",
      opts
    );
    expect(layout.nodes.map((n) => n.concept.id)).toEqual([1, 3]);
    expect(layout.edges).toHaveLength(1);
  });

  it("classifies edge kinds by geometry", () => {
    const layout = computeAtlasLayout(
      [
        concept(1, "F1", "number", 1),
        concept(2, "F1", "number", 2), // same cell as 1
        concept(3, "F2", "number", 1), // forward from 1
        concept(4, "F2", "algebra", 1), // cross-strand from 1
        concept(5, "F1", "algebra", 1), // same-col from 1
        concept(6, "F3", "number", 1), // skip from 1
      ],
      [
        { fromId: 1, toId: 2 },
        { fromId: 1, toId: 3 },
        { fromId: 1, toId: 4 },
        { fromId: 1, toId: 5 },
        { fromId: 1, toId: 6 },
      ],
      "HK",
      opts
    );
    const kinds = new Map(layout.edges.map((e) => [e.toId, e.kind]));
    expect(kinds.get(2)).toBe("same-cell");
    expect(kinds.get(3)).toBe("forward");
    expect(kinds.get(4)).toBe("cross-strand");
    expect(kinds.get(5)).toBe("same-col");
    expect(kinds.get(6)).toBe("skip");
  });

  it("drops edges that flow backwards in grade", () => {
    const layout = computeAtlasLayout(
      [concept(1, "F2", "number", 1), concept(2, "F1", "number", 1)],
      [{ fromId: 1, toId: 2 }],
      "HK",
      opts
    );
    expect(layout.edges).toHaveLength(0);
    expect(layout.preds.size).toBe(0);
  });

  it("anchors horizontal paths on the node edges", () => {
    const layout = computeAtlasLayout(
      [concept(1, "F1", "number", 1), concept(2, "F2", "number", 1)],
      [{ fromId: 1, toId: 2 }],
      "HK",
      opts
    );
    const from = layout.nodesById.get(1)!;
    const to = layout.nodesById.get(2)!;
    const d = layout.edges[0].d;
    expect(d.startsWith(`M${from.x + from.w},`)).toBe(true);
    expect(d.endsWith(` ${to.x},${to.y + to.h / 2}`)).toBe(true);
  });

  it("spreads ports so fan-out edges get distinct anchors", () => {
    const layout = computeAtlasLayout(
      [
        concept(1, "F1", "number", 1),
        concept(2, "F2", "number", 1),
        concept(3, "F2", "number", 2),
        concept(4, "F2", "number", 3),
      ],
      [
        { fromId: 1, toId: 2 },
        { fromId: 1, toId: 3 },
        { fromId: 1, toId: 4 },
      ],
      "HK",
      opts
    );
    const starts = layout.edges.map((e) => e.d.split(" ")[0]);
    expect(new Set(starts).size).toBe(3);
  });
});

describe("computeAtlasStatus", () => {
  const pacingBand = (
    concept_id: number,
    mean_week: number
  ): CurriculumPacingBand => ({
    concept_id,
    years_observed: 2,
    mean_week,
    min_week: mean_week - 2,
    max_week: mean_week + 2,
    week_spread: 4,
  });

  it("tiers observed concepts by recency and fills gaps from pacing", () => {
    const status = computeAtlasStatus(
      [
        { week_number: 10, concepts: [{ concept_id: 1 } as never] },
        { week_number: 29, concepts: [{ concept_id: 2 } as never] },
        { week_number: 30, concepts: [{ concept_id: 3 } as never] },
        // future observation is ignored
        { week_number: 33, concepts: [{ concept_id: 6 } as never] },
      ],
      30,
      [pacingBand(4, 33), pacingBand(5, 45), pacingBand(1, 30)]
    );
    expect(status.get(1)).toBe("covered"); // observation wins over pacing
    expect(status.get(2)).toBe("current");
    expect(status.get(3)).toBe("current");
    expect(status.get(4)).toBe("coming-up");
    expect(status.get(5)).toBeUndefined(); // too far out
    expect(status.get(6)).toBeUndefined();
  });

  it("marks unobserved concepts current when pacing says now", () => {
    const status = computeAtlasStatus([], 20, [pacingBand(1, 21)]);
    expect(status.get(1)).toBe("current");
  });

  it("returns no overlay for past years (no current week)", () => {
    const status = computeAtlasStatus(
      [{ week_number: 10, concepts: [{ concept_id: 1 } as never] }],
      null,
      [pacingBand(2, 12)]
    );
    expect(status.size).toBe(0);
  });
});

describe("collectRelated", () => {
  it("walks ancestors and descendants transitively, edges between related nodes only", () => {
    const concepts = [
      concept(1, "F1", "algebra", 1),
      concept(2, "F1", "algebra", 2),
      concept(3, "F2", "algebra", 1),
      concept(4, "F3", "algebra", 1),
      concept(5, "F2", "number", 1), // side branch off 1
    ];
    const edges: AtlasEdgeInput[] = [
      { fromId: 1, toId: 2 },
      { fromId: 2, toId: 3 },
      { fromId: 3, toId: 4 },
      { fromId: 1, toId: 5 },
      { fromId: 2, toId: 4 }, // ancestor -> descendant shortcut past 3
    ];
    const layout = computeAtlasLayout(concepts, edges, "HK");
    const related = collectRelated(layout, 3);
    expect(related.nodes).toEqual(new Set([1, 2, 3, 4]));
    // The 2>4 shortcut joins both related endpoints, so it lights up too;
    // the 1>5 side branch stays out because 5 is unrelated.
    expect(related.edges).toEqual(new Set(["1>2", "2>3", "3>4", "2>4"]));
  });
});

describe("inferSeries", () => {
  const concepts = [
    concept(1, "F1", "number", 1, { series: ["MAS"] }),
    concept(2, "F1", "number", 2, { series: ["MAS"] }),
    concept(3, "F1", "number", 3, { series: ["HK"] }),
    concept(4, "F1", "number", 4, { series: ["MAS", "HK"] as AtlasSeries[] }),
  ];

  it("picks the series with more exclusive members in the timeline", () => {
    expect(inferSeries([1, 2, 3, 4], concepts)).toBe("MAS");
    expect(inferSeries([3, 4], concepts)).toBe("HK");
  });

  it("defaults to HK on a tie or unknown ids", () => {
    expect(inferSeries([], concepts)).toBe("HK");
    expect(inferSeries([99], concepts)).toBe("HK");
  });
});

describe("constants", () => {
  it("keeps the fixed grid axes", () => {
    expect(ATLAS_GRADES).toEqual(["F1", "F2", "F3"]);
    expect(STRAND_ORDER).toEqual(["number", "algebra", "geometry", "data"]);
  });
});
