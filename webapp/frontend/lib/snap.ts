/**
 * Points in lesson ink that the compasses, the ruler and the protractor snap
 * onto: where two lines of pen ink cross, the ends of lines, and single dots
 * tapped to mark a point. Two arcs crossing is how most constructions find a
 * point, so the tools can land on one exactly, not just wherever a finger
 * happens to stop. The compasses' needle and pencil snap, and so do the ends
 * of a line along the ruler, the protractor's centre mark, the end of a ray
 * drawn from it, and the ends of a line drawn with straight lines on.
 *
 * Only pen ink counts. Highlighter strokes are broad, and their edges would
 * catch the compasses in places nobody meant. A line crossing itself doesn't
 * count either, because handwriting is full of loops.
 */
import type { Stroke } from "@/hooks/useAnnotations";
import { boundingBox, distanceToSegment } from "./stroke-eraser";
import { kindOf, type Vec } from "./stroke-select";

/** How close, in centimetres, a tool has to come to a point in the ink to snap onto it. */
export const SNAP_REACH_CM = 0.5;

/** Where the segment from a to b crosses the segment from c to d, or null when they don't meet. */
export function crossing(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const across = rx * sy - ry * sx;
  // Parallel segments never cross at a single point.
  if (across === 0) return null;
  const qx = c[0] - a[0];
  const qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / across;
  const u = (qx * ry - qy * rx) / across;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + t * rx, a[1] + t * ry];
}

/**
 * The point in the ink nearest to `at`, among the crossings, ends and dots
 * within `reach` of it, or null when there's none. Everything is in page
 * units. It runs on every move of a tool, so a page full of ink has to stay
 * quick: a stroke whose box is out of reach isn't looked at at all, and only
 * the stretches of line within reach are checked against each other for
 * crossings.
 */
export function snapPoint(strokes: Stroke[], at: Vec, reach: number): Vec | null {
  const points: Vec[] = [];
  const near: { stroke: number; a: Vec; b: Vec }[] = [];
  strokes.forEach((stroke, i) => {
    const line = stroke.points;
    // Pen and pencil lines are snapped to, pencil construction lines above all. Highlighter ink is too broad to aim at.
    if (kindOf(stroke) === "highlighter" || line.length === 0) return;
    const box = boundingBox(stroke);
    if (box.left > at[0] + reach || box.right < at[0] - reach || box.top > at[1] + reach || box.bottom < at[1] - reach) return;
    // A dot is its one point, and a line has its two ends.
    points.push([line[0][0], line[0][1]]);
    if (line.length > 1) points.push([line[line.length - 1][0], line[line.length - 1][1]]);
    for (let j = 1; j < line.length; j++) {
      const a: Vec = [line[j - 1][0], line[j - 1][1]];
      const b: Vec = [line[j][0], line[j][1]];
      if (distanceToSegment(at[0], at[1], a, b) <= reach) near.push({ stroke: i, a, b });
    }
  });
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      if (near[i].stroke === near[j].stroke) continue;
      const meet = crossing(near[i].a, near[i].b, near[j].a, near[j].b);
      if (meet) points.push(meet);
    }
  }
  let best: Vec | null = null;
  let bestDistance = reach;
  for (const point of points) {
    const distance = Math.hypot(point[0] - at[0], point[1] - at[1]);
    if (distance <= bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}
