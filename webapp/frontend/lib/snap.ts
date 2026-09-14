/**
 * Points in lesson ink that the compasses, the ruler and the protractor snap
 * onto: where two lines of pen ink cross, the ends of lines, and single dots
 * tapped to mark a point. Two arcs crossing is how most constructions find a
 * point, so the tools can land on one exactly, not just wherever a finger
 * happens to stop. The compasses' needle and pencil snap, and so do the ends
 * of a line along the ruler, the protractor's centre mark, the end of a ray
 * drawn from it, and the ends of a line drawn with straight lines on.
 *
 * Pen and pencil ink count. Highlighter strokes are broad, and their edges
 * would catch the compasses in places nobody meant. A line crossing itself
 * doesn't count either, because handwriting is full of loops.
 *
 * On squared paper the corners of the squares count too, after the ink, so a
 * figure can be built on the grid the way it would be in an exercise book.
 */
import type { Stroke } from "@/hooks/useAnnotations";
import { boundingBox, distanceToSegment } from "./stroke-eraser";
import { INK, kindOf } from "@/hooks/useAnnotations";
import type { Vec } from "./stroke-select";

/** How close, in centimetres, a tool has to come to a point in the ink to snap onto it. */
export const SNAP_REACH_CM = 0.5;

/**
 * How close, in centimetres, a tool has to come to a corner of the squares to
 * snap onto it. It's shorter than the reach for ink, because every point on
 * one-centimetre squares is within 0.71 cm of a corner, and a pull as strong
 * as the ink's would catch almost every tap.
 */
export const GRID_REACH_CM = 0.3;

/** A page's squares, in page units: how far apart they are, and the page's size, which they stop at. */
export interface SnapGrid {
  spacing: number;
  width: number;
  height: number;
}

/**
 * The nearest corner of a page's squares within `reach` of `at`, or null. The
 * squares start from the page's top-left corner, as the Draft's squared paper
 * does on screen and in the saved PDF, and only corners on the page count.
 */
export function gridCorner(at: Vec, grid: SnapGrid, reach: number): Vec | null {
  const { spacing, width, height } = grid;
  if (spacing <= 0) return null;
  const x = Math.round(at[0] / spacing) * spacing;
  const y = Math.round(at[1] / spacing) * spacing;
  if (x < 0 || y < 0 || x > width || y > height) return null;
  return Math.hypot(x - at[0], y - at[1]) <= reach ? [x, y] : null;
}

/**
 * The point a tool or a straight line snaps onto near `at`, in page units: a
 * point in the ink within half a centimetre, or failing that, a corner of the
 * page's squares within 0.3 cm when it has any. The ink wins, so a crossing
 * just drawn with the compasses is never lost to the squares behind it. `cm`
 * is a centimetre of the page, in page units.
 */
export function snapOnPage(strokes: Stroke[], at: Vec, cm: number, grid?: SnapGrid): Vec | null {
  return snapPoint(strokes, at, SNAP_REACH_CM * cm) ?? (grid ? gridCorner(at, grid, GRID_REACH_CM * cm) : null);
}

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
    if (!INK[kindOf(stroke)].snappedTo || line.length === 0) return;
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
