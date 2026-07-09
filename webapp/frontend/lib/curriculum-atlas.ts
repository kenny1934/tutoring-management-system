// Pure layout engine for the curriculum atlas (grade x strand concept map).
// No DOM access: node positions, edge paths and status tiers are all computed
// from data so the geometry is unit-testable like curriculum-bands.

import type {
  CurriculumConceptVocab,
  CurriculumPacingBand,
  CurriculumTimelineConcept,
} from "@/types";

export type AtlasSeries = "MAS" | "HK";
export type AtlasGrade = "F1" | "F2" | "F3";
export type AtlasStrand = "number" | "algebra" | "geometry" | "data";

export const ATLAS_GRADES: AtlasGrade[] = ["F1", "F2", "F3"];
export const STRAND_ORDER: AtlasStrand[] = ["number", "algebra", "geometry", "data"];
export const STRAND_LABELS: Record<AtlasStrand, string> = {
  number: "Number",
  algebra: "Algebra",
  geometry: "Geometry & Measures",
  data: "Data Handling",
};

export interface AtlasConceptInput {
  id: number;
  name_en: string | null;
  name_zh: string | null;
  grade: AtlasGrade;
  strand: AtlasStrand;
  displayOrder: number;
  series: AtlasSeries[];
  isExtension: boolean;
}

export interface AtlasEdgeInput {
  fromId: number; // the prerequisite
  toId: number; // the topic that builds on it
}

/**
 * Adapter from the concepts endpoint to atlas inputs. Concepts without a
 * strand or a placeable grade are skipped (the strand fill has not run for
 * them); concepts without codes belong to both series.
 */
export function toAtlasInputs(vocab: CurriculumConceptVocab[]): {
  concepts: AtlasConceptInput[];
  edges: AtlasEdgeInput[];
} {
  const concepts: AtlasConceptInput[] = [];
  const kept = new Set<number>();
  for (const c of vocab) {
    const grade = (c.grade ?? c.atlas_grade) as AtlasGrade | null;
    const strand = c.strand as AtlasStrand | null;
    if (!grade || !ATLAS_GRADES.includes(grade)) continue;
    if (!strand || !STRAND_ORDER.includes(strand)) continue;
    const spaces = new Set(c.codes.map((code) => code.code_space));
    const series: AtlasSeries[] = [];
    if (spaces.has("MAS")) series.push("MAS");
    if (spaces.has("HK_NEW") || spaces.has("HK_OLD")) series.push("HK");
    if (series.length === 0) series.push("MAS", "HK");
    concepts.push({
      id: c.id,
      name_en: c.name_en,
      name_zh: c.name_zh,
      grade,
      strand,
      displayOrder: c.display_order ?? Number.MAX_SAFE_INTEGER,
      series,
      isExtension: c.kind === "extension",
    });
    kept.add(c.id);
  }
  const edges: AtlasEdgeInput[] = [];
  for (const c of vocab) {
    if (!kept.has(c.id)) continue;
    for (const from of c.builds_on_ids || []) {
      if (kept.has(from)) edges.push({ fromId: from, toId: c.id });
    }
  }
  return { concepts, edges };
}

export interface AtlasLayoutOptions {
  canvasWidth?: number; // fixed logical width — the canvas pans, never reflows
  nodeWidth?: number;
  nodeHeight?: number;
  nodeGapY?: number;
  cellPadX?: number; // >= 22: same-cell edges loop through this padding
  cellPadY?: number;
  rowGapY?: number; // skip edges bow into this gap
}

const DEFAULTS: Required<AtlasLayoutOptions> = {
  canvasWidth: 960,
  nodeWidth: 148,
  nodeHeight: 34,
  nodeGapY: 8,
  cellPadX: 26,
  cellPadY: 12,
  rowGapY: 16,
};

export interface PositionedNode {
  concept: AtlasConceptInput;
  col: number;
  row: number;
  indexInCell: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AtlasEdgeKind = "forward" | "same-cell" | "cross-strand" | "same-col" | "skip";

export interface RoutedEdge {
  fromId: number;
  toId: number;
  kind: AtlasEdgeKind;
  d: string;
}

export interface AtlasGridMeta {
  width: number;
  height: number;
  columns: { grade: AtlasGrade; x: number; width: number }[];
  rows: { strand: AtlasStrand; label: string; y: number; height: number }[];
}

export interface AtlasLayout {
  nodes: PositionedNode[]; // sorted row-major: reading order = tab order
  nodesById: Map<number, PositionedNode>;
  edges: RoutedEdge[];
  grid: AtlasGridMeta;
  preds: Map<number, number[]>;
  succs: Map<number, number[]>;
}

export function computeAtlasLayout(
  concepts: AtlasConceptInput[],
  edges: AtlasEdgeInput[],
  series: AtlasSeries,
  opts?: AtlasLayoutOptions
): AtlasLayout {
  const o = { ...DEFAULTS, ...opts };
  const visible = concepts.filter((c) => c.series.includes(series));
  const visibleIds = new Set(visible.map((c) => c.id));

  const cells = new Map<string, AtlasConceptInput[]>();
  for (const c of visible) {
    const key = `${c.strand}|${c.grade}`;
    const list = cells.get(key) || [];
    list.push(c);
    cells.set(key, list);
  }
  for (const list of cells.values()) {
    list.sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
  }

  // Row heights: tallest cell of the row; empty rows keep a one-node floor.
  const colWidth = o.canvasWidth / ATLAS_GRADES.length;
  const rows: AtlasGridMeta["rows"] = [];
  let y = 0;
  for (const strand of STRAND_ORDER) {
    const maxN = Math.max(
      1,
      ...ATLAS_GRADES.map((g) => cells.get(`${strand}|${g}`)?.length || 0)
    );
    const height = maxN * o.nodeHeight + (maxN - 1) * o.nodeGapY + 2 * o.cellPadY;
    rows.push({ strand, label: STRAND_LABELS[strand], y, height });
    y += height + o.rowGapY;
  }
  const totalHeight = y - o.rowGapY;

  const columns: AtlasGridMeta["columns"] = ATLAS_GRADES.map((grade, i) => ({
    grade,
    x: i * colWidth,
    width: colWidth,
  }));

  const nodes: PositionedNode[] = [];
  const nodesById = new Map<number, PositionedNode>();
  for (let row = 0; row < STRAND_ORDER.length; row++) {
    for (let col = 0; col < ATLAS_GRADES.length; col++) {
      const list = cells.get(`${STRAND_ORDER[row]}|${ATLAS_GRADES[col]}`) || [];
      list.forEach((concept, indexInCell) => {
        const node: PositionedNode = {
          concept,
          col,
          row,
          indexInCell,
          x: columns[col].x + (colWidth - o.nodeWidth) / 2,
          y: rows[row].y + o.cellPadY + indexInCell * (o.nodeHeight + o.nodeGapY),
          w: o.nodeWidth,
          h: o.nodeHeight,
        };
        nodes.push(node);
        nodesById.set(concept.id, node);
      });
    }
  }

  // Adjacency (visible edges only) + drop data errors: prerequisites cannot
  // flow backwards in grade.
  const preds = new Map<number, number[]>();
  const succs = new Map<number, number[]>();
  const usable: AtlasEdgeInput[] = [];
  for (const e of edges) {
    if (!visibleIds.has(e.fromId) || !visibleIds.has(e.toId)) continue;
    const f = nodesById.get(e.fromId)!;
    const t = nodesById.get(e.toId)!;
    if (t.col < f.col) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `curriculum-atlas: dropped backwards edge ${e.fromId} -> ${e.toId}`
        );
      }
      continue;
    }
    usable.push(e);
    preds.set(e.toId, [...(preds.get(e.toId) || []), e.fromId]);
    succs.set(e.fromId, [...(succs.get(e.fromId) || []), e.toId]);
  }

  // Port allocation: spread the horizontal anchors of fan-in/fan-out edges by
  // a few px so they don't stack on one pixel. Only horizontal-anchor kinds
  // (different column) take ports.
  const horizontal = usable.filter(
    (e) => nodesById.get(e.fromId)!.col !== nodesById.get(e.toId)!.col
  );
  const outPort = new Map<AtlasEdgeInput, number>();
  const inPort = new Map<AtlasEdgeInput, number>();
  const spread = (list: AtlasEdgeInput[], target: Map<AtlasEdgeInput, number>, sortBy: (e: AtlasEdgeInput) => number) => {
    list.sort((a, b) => sortBy(a) - sortBy(b));
    list.forEach((e, i) => {
      target.set(e, (i - (list.length - 1) / 2) * 7);
    });
  };
  const byFrom = new Map<number, AtlasEdgeInput[]>();
  const byTo = new Map<number, AtlasEdgeInput[]>();
  for (const e of horizontal) {
    byFrom.set(e.fromId, [...(byFrom.get(e.fromId) || []), e]);
    byTo.set(e.toId, [...(byTo.get(e.toId) || []), e]);
  }
  for (const list of byFrom.values()) {
    spread(list, outPort, (e) => nodesById.get(e.toId)!.y);
  }
  for (const list of byTo.values()) {
    spread(list, inPort, (e) => nodesById.get(e.fromId)!.y);
  }

  const clampPort = (p: number, h: number) =>
    Math.max(-(h / 2 - 4), Math.min(h / 2 - 4, p));

  const routed: RoutedEdge[] = usable.map((e) => {
    const f = nodesById.get(e.fromId)!;
    const t = nodesById.get(e.toId)!;
    let kind: AtlasEdgeKind;
    let d: string;
    if (f.col === t.col && f.row === t.row) {
      // Loop through the left cell padding; the arrow enters pointing right,
      // consistent with the global left-to-right flow.
      kind = "same-cell";
      const fy = f.y + f.h / 2;
      const ty = t.y + t.h / 2;
      d = `M${f.x},${fy} C${f.x - 20},${fy} ${t.x - 20},${ty} ${t.x},${ty}`;
    } else if (f.col === t.col) {
      kind = "same-col";
      const down = t.y > f.y;
      const fx = f.x + f.w / 2;
      const fy = down ? f.y + f.h : f.y;
      const tx = t.x + t.w / 2;
      const ty = down ? t.y : t.y + t.h;
      const dy = ty - fy;
      d = `M${fx},${fy} C${fx},${fy + dy * 0.5} ${tx},${ty - dy * 0.5} ${tx},${ty}`;
    } else {
      const fx = f.x + f.w;
      const fy = f.y + f.h / 2 + clampPort(outPort.get(e) || 0, f.h);
      const tx = t.x;
      const ty = t.y + t.h / 2 + clampPort(inPort.get(e) || 0, t.h);
      const dx = tx - fx;
      if (t.col - f.col >= 2) {
        // Bow into the nearest row gap so the curve arcs past the middle
        // column instead of slicing through its cell.
        kind = "skip";
        const bow = f.row === 0 ? o.nodeHeight * 1.2 : -o.nodeHeight * 1.2;
        d = `M${fx},${fy} C${fx + dx * 0.25},${fy + bow} ${tx - dx * 0.25},${ty + bow} ${tx},${ty}`;
      } else {
        kind = f.row === t.row ? "forward" : "cross-strand";
        const cp = Math.min(Math.max(dx * 0.42, 40), 120);
        d = `M${fx},${fy} C${fx + cp},${fy} ${tx - cp},${ty} ${tx},${ty}`;
      }
    }
    return { fromId: e.fromId, toId: e.toId, kind, d };
  });

  return {
    nodes,
    nodesById,
    edges: routed,
    grid: { width: o.canvasWidth, height: totalHeight, columns, rows },
    preds,
    succs,
  };
}

export type AtlasStatus = "covered" | "current" | "coming-up" | "no-data";

/**
 * Progress tier per concept for the selected school-grade, from the timeline
 * response. This year's observations win; pacing fills the gaps. Returns an
 * empty map when there is no current week (past years get no overlay).
 */
export function computeAtlasStatus(
  weeks: { week_number: number; concepts: CurriculumTimelineConcept[] }[],
  currentWeek: number | null | undefined,
  pacing: CurriculumPacingBand[]
): Map<number, AtlasStatus> {
  const out = new Map<number, AtlasStatus>();
  if (currentWeek == null) return out;

  const lastObserved = new Map<number, number>();
  for (const w of weeks) {
    if (w.week_number > currentWeek) continue;
    for (const c of w.concepts) {
      lastObserved.set(
        c.concept_id,
        Math.max(lastObserved.get(c.concept_id) ?? 0, w.week_number)
      );
    }
  }

  for (const [id, week] of lastObserved) {
    out.set(id, week >= currentWeek - 1 ? "current" : "covered");
  }
  for (const band of pacing) {
    if (out.has(band.concept_id)) continue;
    if (Math.abs(band.mean_week - currentWeek) <= 1) {
      out.set(band.concept_id, "current");
    } else if (
      band.mean_week > currentWeek + 1 &&
      band.mean_week <= currentWeek + 8
    ) {
      out.set(band.concept_id, "coming-up");
    }
  }
  return out;
}

/**
 * The highlight neighbourhood of a node: all its prerequisite ancestors and
 * all its dependents, plus the edges lying on those chains.
 */
export function collectRelated(
  layout: Pick<AtlasLayout, "preds" | "succs" | "edges">,
  id: number
): { nodes: Set<number>; edges: Set<string> } {
  const walk = (start: number, adj: Map<number, number[]>): Set<number> => {
    const seen = new Set<number>();
    const queue = [start];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const next of adj.get(cur) || []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };
  const ancestors = walk(id, layout.preds);
  const descendants = walk(id, layout.succs);
  const nodes = new Set<number>([id, ...ancestors, ...descendants]);
  // Any edge between two related nodes lights up — including an ancestor
  // feeding a descendant directly, bypassing the hovered node.
  const edges = new Set<string>();
  for (const e of layout.edges) {
    if (nodes.has(e.fromId) && nodes.has(e.toId)) {
      edges.add(`${e.fromId}>${e.toId}`);
    }
  }
  return { nodes, edges };
}

/**
 * Which series a school's timeline belongs to: the one whose concept set
 * overlaps the timeline's concepts most (HK on a tie — the larger cohort).
 */
export function inferSeries(
  timelineConceptIds: number[],
  concepts: AtlasConceptInput[]
): AtlasSeries {
  const membership = new Map<number, AtlasSeries[]>();
  for (const c of concepts) membership.set(c.id, c.series);
  let mas = 0;
  let hk = 0;
  for (const id of timelineConceptIds) {
    const series = membership.get(id);
    if (!series || series.length !== 1) continue; // shared concepts say nothing
    if (series[0] === "MAS") mas++;
    else hk++;
  }
  return mas > hk ? "MAS" : "HK";
}
