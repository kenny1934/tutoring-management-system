// Turns the weekly consensus timeline into Gantt-style concept lanes for the
// Curriculum page: one lane per concept, bands spanning consecutive weeks,
// solid where the concept held rank 1 and faint where it was rank 2-3.
import type { CurriculumTimelineConcept } from "@/types";

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
