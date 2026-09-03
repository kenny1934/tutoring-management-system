// Turns the weekly consensus timeline into Gantt-style concept lanes for the
// Curriculum page: one lane per concept, bands spanning consecutive weeks,
// solid where the concept held rank 1 and faint where it was rank 2-3.
import type {
  CurriculumPacingBand,
  CurriculumTimelineConcept,
  CurriculumWeekDates,
} from "@/types";

export interface LaneWeek {
  week_number: number;
  rank: number;
  weight: number;
  sources: string[];
}

export interface LaneSegment {
  startWeek: number;
  endWeek: number; // inclusive
  primary: boolean; // held rank 1 across this span
}

export interface ConceptLane {
  conceptId: number;
  name_en: string | null;
  name_zh: string | null;
  firstWeek: number;
  lastWeek: number;
  segments: LaneSegment[];
  weeks: LaneWeek[];
}

interface TimelineWeek {
  week_number: number;
  concepts: CurriculumTimelineConcept[];
}

export function computeConceptLanes(weeks: TimelineWeek[]): ConceptLane[] {
  const byConcept = new Map<number, ConceptLane>();

  for (const week of weeks) {
    for (const c of week.concepts) {
      let lane = byConcept.get(c.concept_id);
      if (!lane) {
        lane = {
          conceptId: c.concept_id,
          name_en: c.name_en ?? null,
          name_zh: c.name_zh ?? null,
          firstWeek: week.week_number,
          lastWeek: week.week_number,
          segments: [],
          weeks: [],
        };
        byConcept.set(c.concept_id, lane);
      }
      const existing = lane.weeks.find((w) => w.week_number === week.week_number);
      if (existing) {
        // Keep the best rank if the same concept somehow appears twice.
        if (c.rank < existing.rank) {
          existing.rank = c.rank;
          existing.weight = c.weight;
          existing.sources = c.sources;
        }
      } else {
        lane.weeks.push({
          week_number: week.week_number,
          rank: c.rank,
          weight: c.weight,
          sources: c.sources,
        });
      }
      lane.firstWeek = Math.min(lane.firstWeek, week.week_number);
      lane.lastWeek = Math.max(lane.lastWeek, week.week_number);
    }
  }

  for (const lane of byConcept.values()) {
    lane.weeks.sort((a, b) => a.week_number - b.week_number);
    let current: LaneSegment | null = null;
    for (const w of lane.weeks) {
      const primary = w.rank === 1;
      if (
        current &&
        w.week_number === current.endWeek + 1 &&
        current.primary === primary
      ) {
        current.endWeek = w.week_number;
      } else {
        current = { startWeek: w.week_number, endWeek: w.week_number, primary };
        lane.segments.push(current);
      }
    }
  }

  return Array.from(byConcept.values()).sort(
    (a, b) => a.firstWeek - b.firstWeek || a.conceptId - b.conceptId
  );
}

// ---------------------------------------------------------------------------
// Typical-pace comparison rows.
//
// MAS-series and HK-series schools cover the same maths under different
// concept rows, so keying rows by concept_id alone leaves a comparison
// school's bands stranded on their own lanes. A comparison band therefore
// attaches to a primary-school row when its concept is the same OR directly
// equivalent (concept_links). Direct edges only — walking equivalence
// transitively would chain e.g. Real Numbers -> Surds -> Pythagoras into one
// giant lane. A band that matches several primary rows appears on each
// (their chapter genuinely spans both); one with no match keeps its own row
// after the primary-sorted ones, as before.
// ---------------------------------------------------------------------------

export interface PacingCell {
  band: CurriculumPacingBand;
  // true when this band belongs to the equivalent concept in the other
  // series rather than the row's own concept
  fromEquivalent: boolean;
}

export interface PacingRow {
  conceptId: number;
  name_en: string | null;
  name_zh: string | null;
  cells: (PacingCell | null)[]; // one slot per combo, index 0 = primary
}

export function mergePacingRows(
  combosBands: (CurriculumPacingBand[] | null)[],
  equivalentIds: Map<number, number[]>
): PacingRow[] {
  const rows = new Map<number, PacingRow>();
  const comboCount = combosBands.length;

  const makeRow = (band: CurriculumPacingBand): PacingRow => ({
    conceptId: band.concept_id,
    name_en: band.name_en ?? null,
    name_zh: band.name_zh ?? null,
    cells: Array.from({ length: comboCount }, () => null),
  });

  // Primary rows first: they define lane identity and ordering.
  for (const band of combosBands[0] || []) {
    let row = rows.get(band.concept_id);
    if (!row) {
      row = makeRow(band);
      rows.set(band.concept_id, row);
    }
    row.cells[0] = { band, fromEquivalent: false };
  }

  const extras = new Map<number, PacingRow>();
  for (let idx = 1; idx < comboCount; idx++) {
    for (const band of combosBands[idx] || []) {
      const targets: { row: PacingRow; fromEquivalent: boolean }[] = [];
      const own = rows.get(band.concept_id);
      if (own) {
        targets.push({ row: own, fromEquivalent: false });
      } else {
        for (const eqId of equivalentIds.get(band.concept_id) || []) {
          const eqRow = rows.get(eqId);
          if (eqRow) targets.push({ row: eqRow, fromEquivalent: true });
        }
      }
      if (targets.length === 0) {
        let extra = extras.get(band.concept_id);
        if (!extra) {
          extra = makeRow(band);
          extras.set(band.concept_id, extra);
        }
        targets.push({ row: extra, fromEquivalent: false });
      }
      for (const { row, fromEquivalent } of targets) {
        // First band wins per cell (a combo rarely has two bands for one lane).
        if (!row.cells[idx]) row.cells[idx] = { band, fromEquivalent };
      }
    }
  }

  const meanOf = (row: PacingRow) =>
    row.cells.find((cell) => cell)?.band.mean_week ?? Number.MAX_SAFE_INTEGER;
  const primarySorted = Array.from(rows.values()).sort(
    (a, b) => (a.cells[0]?.band.mean_week ?? meanOf(a)) - (b.cells[0]?.band.mean_week ?? meanOf(b))
  );
  const extraSorted = Array.from(extras.values()).sort((a, b) => meanOf(a) - meanOf(b));
  return [...primarySorted, ...extraSorted];
}

// ---------------------------------------------------------------------------
// Week jumping: tutors think in dates at least as often as in week numbers,
// so the "go to week" box accepts both.
// ---------------------------------------------------------------------------

export function weekNumberForDate(
  d: Date,
  weekDates: CurriculumWeekDates[]
): number | null {
  const t = d.getTime();
  for (const w of weekDates) {
    if (
      t >= new Date(`${w.start_date}T00:00:00`).getTime() &&
      t <= new Date(`${w.end_date}T23:59:59`).getTime()
    ) {
      return w.week_number;
    }
  }
  return null;
}

/**
 * Parse a jump query: a bare week number ("30"), or a date in day-first
 * ("18/3", "18/3/2026") or free ("18 Mar") form. Dates without a year try
 * every calendar year the academic year spans.
 */
export function parseWeekJumpInput(
  input: string,
  weekDates: CurriculumWeekDates[],
  maxWeek: number
): number | null {
  const t = input.trim();
  if (!t) return null;

  if (/^\d{1,2}$/.test(t)) {
    const week = parseInt(t, 10);
    return week >= 1 && week <= maxWeek ? week : null;
  }

  const years = Array.from(
    new Set(weekDates.flatMap((w) => [w.start_date.slice(0, 4), w.end_date.slice(0, 4)]))
  );

  const candidates: Date[] = [];
  const dayFirst = t.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/);
  if (dayFirst) {
    const day = dayFirst[1].padStart(2, "0");
    const month = dayFirst[2].padStart(2, "0");
    const explicit = dayFirst[3];
    const candidateYears = explicit
      ? [explicit.length === 2 ? `20${explicit}` : explicit]
      : years;
    for (const y of candidateYears) {
      candidates.push(new Date(`${y}-${month}-${day}T12:00:00`));
    }
  } else {
    const hasYear = /\d{4}/.test(t);
    for (const y of hasYear ? [""] : years) {
      const parsed = new Date(hasYear ? t : `${t} ${y}`);
      if (!isNaN(parsed.getTime())) candidates.push(parsed);
    }
  }

  for (const c of candidates) {
    if (isNaN(c.getTime())) continue;
    const week = weekNumberForDate(c, weekDates);
    if (week != null) return week;
  }
  return null;
}
