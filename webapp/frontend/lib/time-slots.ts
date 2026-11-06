/** Valid class ranges share one spelling in editors, lists and slot comparisons. */
export function parseTimeRange(value: string): { start: string; end: string } | null {
  const match = value.match(/^\s*([0-9]{1,2}):([0-9]{2})\s*-\s*([0-9]{1,2}):([0-9]{2})\s*$/);
  if (!match) return null;
  const [sh, sm, eh, em] = match.slice(1).map(Number);
  if (sh > 23 || eh > 23 || sm > 59 || em > 59 || sh * 60 + sm >= eh * 60 + em) return null;
  return {
    start: `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`,
    end: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
  };
}

export function normaliseTimeSlot(value: string): string {
  const range = parseTimeRange(value);
  return range ? `${range.start} - ${range.end}` : value;
}

export function sameTimeSlot(left?: string | null, right?: string | null): boolean {
  return normaliseTimeSlot(left || "") === normaliseTimeSlot(right || "");
}
