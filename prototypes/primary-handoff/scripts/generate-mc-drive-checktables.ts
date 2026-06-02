/**
 * Generate `lib/mock-data/mc-drive-checktables.ts` from the scraped MC Drive
 * tree (`scripts/mc-drive-tree.json`).
 *
 * One checktable per leaf level folder (SG Level 1, Math 1-6 Level 2, ...).
 * Filenames encode structure — [STRAND?] + Level + Unit(2) + SeriesLetter +
 * Variant — which we parse into Section (strand, for CA) / Chapter (unit) /
 * Series (letter) / variant items. Anything unparseable falls back to the
 * checktable's supplementary list so no file is ever dropped.
 *
 * Run from the prototype root:
 *   npx tsx scripts/generate-mc-drive-checktables.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Checktable,
  ChecktableChapter,
  ChecktableItem,
  ChecktableSection,
  ChecktableSeries,
} from "../lib/types";
import { mcDriveViewerUrl } from "../lib/mc-drive";

const ROOT = process.cwd();
const TREE = path.resolve(ROOT, "scripts/mc-drive-tree.json");
const OUT = path.resolve(ROOT, "lib/mock-data/mc-drive-checktables.ts");
const UPDATED_AT = "2026-06-02";
const VERSION = "MCD";

type Material = {
  filename: string;
  folder_id: number;
  s3_path: string;
  s3_url: string;
  viewer_url: string;
};
type Tree = { materials: Material[] };

const BRANCH_META: Record<string, { family: string; order: number }> = {
  "01_SG_Letter Size": { family: "SG (Letter Size)", order: 1 },
  "02_Math 1 to 6_A4 Size": { family: "Math 1-6 (A4)", order: 2 },
  "03_PS_2types(SG+PS)": { family: "Problem Solving", order: 3 },
  "04_Kindergarten Supplementary_v1.0": { family: "Kindergarten", order: 4 },
  "05_CA_new code_Answer Set_Level 1&2_v2.0": { family: "CA (Level 1&2)", order: 5 },
};

const STRAND_LABEL: Record<string, string> = {
  MG: "Measurement and Geometry",
  NA: "Number & Algebra",
  PS: "Problem Solving",
  ST: "Statistics",
  "PS.NA": "Problem Solving · Number & Algebra",
  "PS.MG": "Problem Solving · Measurement and Geometry",
  "PS.ST": "Problem Solving · Statistics",
};

/** Decode the few HTML entities the scraper left in filenames (the link text
 *  came from rendered HTML). s3_path is already clean, so this is display-only. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}

type Parsed = {
  code: string;
  strand?: string; // CA only -> drives section
  unit: string; // "01"
  unitNum: number;
  series: string; // "A".."R", or "PS"
  variant: string; // "1", "2"
  topic: string;
};

const cleanTopic = (raw: string) =>
  raw.replace(/\./g, " ").replace(/\s+/g, " ").trim();

/** Topic from the middle filename tokens (everything but the code and the
 *  trailing ANS / language markers). */
function midTopic(tokens: string[]): string {
  return cleanTopic(
    tokens
      .slice(1)
      .filter((t) => !/^(ans|e|c)$/i.test(t))
      .join(" ")
  );
}

function parseFile(branch: string, filename: string): Parsed | null {
  const base = filename.replace(/\.pdf$/i, "").replace(/\s*\(\d+\)\s*$/, "");
  const tokens = base.split("_");
  const code0 = tokens[0];
  const mk = (
    code: string,
    strand: string | undefined,
    unit: string,
    series: string,
    variant: string,
    topic: string
  ): Parsed => ({
    code,
    strand,
    unit,
    unitNum: parseInt(unit, 10) || 0,
    series,
    variant,
    topic,
  });

  // SG: SG{L}{UU}{Series}{Variant}, optional trailing X (extended set).
  if (branch.startsWith("01_SG")) {
    const m = code0.match(/^SG(\d)(\d{2})([A-Z]+)(\d+)X?$/);
    if (m) return mk(code0, undefined, m[2], m[3], m[4], midTopic(tokens));
  }
  // Math 1-6: two code schemes — {L}{UU}{Series}{Variant}(X?) and {L}{Series}{UU}.
  if (branch.startsWith("02_Math")) {
    let m = code0.match(/^(\d)(\d{2})([A-Z]+)(\d+)X?$/);
    if (m) return mk(code0, undefined, m[2], m[3], m[4], midTopic(tokens));
    m = code0.match(/^(\d)([A-Z])(\d{2})$/);
    if (m) return mk(code0, undefined, m[3], m[2], "1", midTopic(tokens));
  }
  // CA: {Strand}{L}{UU}{Series}{Variant}(X?), strand may be composite (PS.NA).
  if (branch.startsWith("05_CA")) {
    const m = code0.match(/^([A-Z]+(?:\.[A-Z]+)?)(\d)(\d{2})([A-Z]+)(\d+)X?$/);
    if (m) return mk(code0, m[1], m[3], m[4], m[5], midTopic(tokens));
  }
  if (branch.startsWith("03_PS")) {
    // SG-prefixed worksheets also live under the PS branch.
    const sg = code0.match(/^SG(\d)(\d{2})([A-Z]+)(\d+)X?$/);
    if (sg) return mk(code0, undefined, sg[2], sg[3], sg[4], midTopic(tokens));
    // PS_{LUU}_{topic}: token0 = "PS", token1 = level+unit number, no series.
    if (code0 === "PS" && /^\d{3,}$/.test(tokens[1] ?? "")) {
      const num = tokens[1];
      const unit = num.slice(-2);
      const topic = cleanTopic(
        tokens
          .slice(2)
          .filter((t) => !/^(ans|e)$/i.test(t))
          .join(" ")
      );
      return mk(`PS_${num}`, undefined, unit, "PS", "1", topic);
    }
  }
  // Kindergarten: FS{UU}{Series} (First Step) and K{UU}{nn} (numbered set).
  if (branch.startsWith("04_Kindergarten")) {
    const f = code0.match(/^FS(\d{2})([A-Z])$/);
    if (f) return mk(code0, undefined, f[1], f[2], "1", midTopic(tokens));
    const k = code0.match(/^K(\d{2})(\d{2})$/);
    if (k) return mk(code0, undefined, k[1], "K", k[2], midTopic(tokens));
  }
  return null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** A-Z then numeric-ish; "R" (revision) naturally sorts after A-E. */
const seriesSort = (a: string, b: string) => a.localeCompare(b);

function gradeFor(levelLabel: string): string {
  const m = levelLabel.match(/Level\s*(\d+)/i);
  return m ? `P${m[1]}` : "K";
}

function buildChecktable(
  branch: string,
  levelKey: string,
  mats: Material[]
): { table: Checktable; stats: { items: number; fallback: number; dups: number } } {
  const family = BRANCH_META[branch]?.family ?? branch;
  const levelLabel = levelKey.replace(/_PDF/gi, "").replace(/\//g, " / ");
  const id = `ct-mcd-${slug(family)}-${slug(levelKey)}`;
  const basePath = `MC_Drive/Answer/${branch}/${levelKey}`;

  // section -> unit -> series -> items
  const sections = new Map<string, Map<string, Map<string, ChecktableItem[]>>>();
  const unitTopic = new Map<string, string>(); // `${sec}|${unit}` -> title
  const seriesSet = new Set<string>();
  const supplementary: ChecktableItem[] = [];
  const seenCode = new Set<string>();
  let dups = 0;
  let itemCount = 0;

  // Deterministic: process without the " (n)" duplicates winning over canonical.
  const sorted = [...mats].sort((a, b) =>
    a.filename.replace(/\s*\(\d+\)/, "").localeCompare(
      b.filename.replace(/\s*\(\d+\)/, "")
    ) || a.filename.localeCompare(b.filename)
  );

  for (const mat of sorted) {
    const filename = decodeEntities(mat.filename);
    const p = parseFile(branch, filename);
    if (!p) {
      const fbBase = filename
        .replace(/\.pdf$/i, "")
        .replace(/\s*\(\d+\)\s*$/, "");
      supplementary.push({
        id: `${id}/misc/${fbBase}`,
        code: fbBase,
        mcDriveS3Path: mat.s3_path,
      });
      itemCount++;
      continue;
    }
    if (seenCode.has(p.code)) {
      dups++;
      continue;
    }
    seenCode.add(p.code);

    const sec = p.strand ?? "main";
    if (!sections.has(sec)) sections.set(sec, new Map());
    const units = sections.get(sec)!;
    if (!units.has(p.unit)) units.set(p.unit, new Map());
    const series = units.get(p.unit)!;
    if (!series.has(p.series)) series.set(p.series, []);
    series.get(p.series)!.push({
      id: `${id}/${p.code}`,
      code: p.code,
      mcDriveS3Path: mat.s3_path,
    });
    seriesSet.add(p.series);
    const tKey = `${sec}|${p.unit}`;
    if (p.topic && !unitTopic.has(tKey)) unitTopic.set(tKey, p.topic);
    itemCount++;
  }

  const seriesList: ChecktableSeries[] = [...seriesSet]
    .sort(seriesSort)
    .map((s) => ({
      id: s,
      label: s,
      hint: s === "R" ? "Revision" : undefined,
    }));

  // CA sections in strand order; otherwise a single "main" section.
  const STRAND_ORDER = ["MG", "NA", "PS", "ST"];
  const sectionKeys = [...sections.keys()].sort((a, b) => {
    const ia = STRAND_ORDER.indexOf(a);
    const ib = STRAND_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });

  const outSections: ChecktableSection[] = sectionKeys.map((secKey) => {
    const units = sections.get(secKey)!;
    const unitKeys = [...units.keys()].sort(
      (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b)
    );
    const chapters: ChecktableChapter[] = unitKeys.map((unit, i) => {
      const series = units.get(unit)!;
      const cells: ChecktableChapter["cells"] = {};
      for (const s of seriesList) {
        const items = (series.get(s.id) ?? []).sort((a, b) =>
          a.code.localeCompare(b.code)
        );
        cells[s.id] = { items };
      }
      return {
        id: `${id}-${slug(secKey)}-u${unit}`,
        number: parseInt(unit, 10) || i + 1,
        title: unitTopic.get(`${secKey}|${unit}`) ?? `Unit ${unit}`,
        cells,
      };
    });
    return {
      id: secKey === "main" ? "main" : secKey,
      label: secKey === "main" ? "Worksheets" : STRAND_LABEL[secKey] ?? secKey,
      chapters,
    };
  });

  const table: Checktable = {
    id,
    textbook: levelLabel,
    grade: gradeFor(levelLabel),
    version: VERSION,
    updatedAt: UPDATED_AT,
    basePath,
    series: seriesList,
    sections: outSections,
    supplementary,
    source: "mc-drive",
    family,
    levelLabel,
  };
  return { table, stats: { items: itemCount, fallback: supplementary.length, dups } };
}

function main() {
  const tree: Tree = JSON.parse(fs.readFileSync(TREE, "utf8"));

  // Group materials by (branch, levelKey) where levelKey is the path under the
  // branch (handles nested Kindergarten "Little First Step/N1" leaves).
  const groups = new Map<string, { branch: string; levelKey: string; mats: Material[] }>();
  for (const m of tree.materials) {
    const parts = m.s3_path.split("/"); // MC_Drive/Answer/<branch>/<level...>/<file>
    if (parts.length < 5) continue;
    const branch = parts[2];
    const levelKey = parts.slice(3, -1).join("/");
    const key = `${branch}::${levelKey}`;
    if (!groups.has(key)) groups.set(key, { branch, levelKey, mats: [] });
    groups.get(key)!.mats.push(m);
  }

  const tables: Checktable[] = [];
  let totalItems = 0;
  let totalFallback = 0;
  let totalDups = 0;

  const ordered = [...groups.values()].sort(
    (a, b) =>
      (BRANCH_META[a.branch]?.order ?? 99) - (BRANCH_META[b.branch]?.order ?? 99) ||
      a.levelKey.localeCompare(b.levelKey, undefined, { numeric: true })
  );

  for (const g of ordered) {
    const { table, stats } = buildChecktable(g.branch, g.levelKey, g.mats);
    tables.push(table);
    totalItems += stats.items;
    totalFallback += stats.fallback;
    totalDups += stats.dups;
    console.log(
      `  ${table.id.padEnd(48)} grade=${table.grade.padEnd(3)} ` +
        `sec=${table.sections.length} series=${table.series.length} ` +
        `items=${stats.items} fallback=${stats.fallback} dups=${stats.dups}`
    );
  }

  // Validate the viewer-URL helper against the scraped ground truth.
  let mismatches = 0;
  for (const m of tree.materials) {
    if (mcDriveViewerUrl(m.s3_path) !== m.viewer_url) {
      if (mismatches < 5) {
        console.error(`  URL MISMATCH for ${m.s3_path}`);
        console.error(`    got: ${mcDriveViewerUrl(m.s3_path)}`);
        console.error(`    exp: ${m.viewer_url}`);
      }
      mismatches++;
    }
  }

  const header =
    "// AUTO-GENERATED by scripts/generate-mc-drive-checktables.ts — do not edit by hand.\n" +
    "// Source: MC Drive scrape (scripts/mc-drive-tree.json).\n" +
    "// Regenerate: npx tsx scripts/generate-mc-drive-checktables.ts\n" +
    'import type { Checktable } from "../types";\n\n' +
    "export const mcDriveChecktables: Checktable[] = ";
  fs.writeFileSync(OUT, header + JSON.stringify(tables, null, 2) + ";\n");

  console.log(
    `\nWrote ${tables.length} checktables, ${totalItems} items ` +
      `(${totalFallback} fallback, ${totalDups} dup-skipped) -> ${path.relative(ROOT, OUT)}`
  );
  console.log(
    mismatches === 0
      ? "viewer-URL helper matches all scraped URLs ✓"
      : `WARNING: ${mismatches} viewer-URL mismatches`
  );
}

main();
