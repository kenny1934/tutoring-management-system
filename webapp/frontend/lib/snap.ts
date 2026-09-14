/**
 * Points in lesson ink that the compasses, the ruler and the protractor snap
 * onto: where two lines of pen ink cross, the ends of lines, and single dots
 * tapped to mark a point. Two arcs crossing is how most constructions find a
 * point, so the tools can land on one exactly, not just wherever a finger
 * happens to stop. The compasses' needle and pencil snap, and so do the ends
 * of a line along the ruler, the protractor's centre mark, the end of a ray
 * drawn from it, and the ends of a line drawn with straight lines on.
 *
 * The INK table says how each kind of ink snaps. Pen and pencil ink snap to
 * their points. Highlighter strokes never do, because they're broad, and
 * their edges would catch the compasses in places nobody meant. A line
 * crossing itself doesn't count either, because handwriting is full of loops.
 *
 * On squared paper the corners of the squares count too, after the ink, so a
 * figure can be built on the grid the way it would be in an exercise book.
 *
 * The scale ink of a pair of axes on the Draft only snaps where it crosses
 * ink that snaps to its points, and we call such a place a tick point. On a
 * pair of axes, that's where each tick crosses its axis. The scale ink's own
 * ends never count. If they did, a line you ended near the point (2, 0)
 * would jump to the end of the tick, or to the tip of the "2" below it, and
 * miss the axis. A tick point has the same short reach as a corner of the
 * squares. The ticks are a centimetre apart, so that leaves the middle of each
 * square free, and a line can still end between two ticks, at 2.5 for
 * example. On squared paper the ticks sit on corners anyway, so the tick
 * points are what make a pair of axes snap the same way on blank paper.
 */
import type { Stroke } from "@/hooks/useAnnotations";
import { boundingBox, distanceToSegment } from "./stroke-eraser";
import { INK, kindOf } from "@/hooks/useAnnotations";
import { clamp, type Vec } from "./stroke-select";

/** How close, in centimetres, a tool has to come to a point in the ink to snap onto it. */
export const SNAP_REACH_CM = 0.5;

/**
 * How close, in centimetres, a tool has to come to a corner of the squares,
 * or to a tick point on a pair of axes, to snap onto it. It's shorter than
 * the reach for ink, because every point on one-centimetre squares is within
 * 0.71 cm of a corner, and a pull as strong as the ink's would catch almost
 * every tap. Ticks are a centimetre apart too, so the same goes for them.
 */
export const GRID_REACH_CM = 0.3;

/** A page's squares, in page units: how far apart they are, and the page's size, which they stop at. */
export interface SnapGrid {
  spacing: number;
  width: number;
  height: number;
}

/**
 * The corner of a page's squares nearest to `at`, among the corners on the
 * page, however far away it is. The squares start from the page's top-left
 * corner, as the Draft's squared paper does on screen and in the saved PDF.
 * Snapping finds its corners here, and so does a pair of axes crossing on a
 * corner, so a line ended on the axes' origin lands exactly on it.
 */
export function nearestCorner(at: Vec, grid: SnapGrid): Vec {
  const { spacing, width, height } = grid;
  const corner = (value: number, size: number) =>
    clamp(Math.round(value / spacing), 0, Math.floor(size / spacing)) * spacing;
  return [corner(at[0], width), corner(at[1], height)];
}

/** The nearest corner of a page's squares within `reach` of `at`, or null. Only corners on the page count. */
export function gridCorner(at: Vec, grid: SnapGrid, reach: number): Vec | null {
  if (grid.spacing <= 0) return null;
  const [x, y] = nearestCorner(at, grid);
  return Math.hypot(x - at[0], y - at[1]) <= reach ? [x, y] : null;
}

/**
 * The point a tool or a straight line snaps onto near `at`, in page units. A
 * point in the ink within half a centimetre comes first. Failing that, it's
 * whichever is nearer of a tick point on a pair of axes and a corner of the
 * page's squares, when it has any, within 0.3 cm. The ink wins, so a crossing
 * just drawn with the compasses is never lost to the squares behind it. `cm`
 * is a centimetre of the page, in page units.
 */
export function snapOnPage(strokes: Stroke[], at: Vec, cm: number, grid?: SnapGrid): Vec | null {
  const inInk = snapPoint(strokes, at, SNAP_REACH_CM * cm);
  if (inInk) return inInk;
  const reach = GRID_REACH_CM * cm;
  const candidates = [tickPoint(strokes, at, reach), grid ? gridCorner(at, grid, reach) : null];
  return nearest(candidates.filter((point): point is Vec => point !== null), at, reach);
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

/** One stretch of a stroke, between two of its points, that passes within reach of the point being snapped. */
interface Stretch {
  /** Which stroke it's part of, so a line crossing itself can be left out. */
  stroke: number;
  a: Vec;
  b: Vec;
  /** Whether its ink only snaps where it crosses other ink, as a pair of axes' scale ink does. */
  onlyCrossings: boolean;
}

/**
 * What snapping looks at near `at`: the ends and dots of the ink that snaps
 * to its points, and the stretches of line that pass within `reach`. Ink that
 * only snaps where it crosses has its stretches among them when
 * `withCrossings` is set, but never its ends. This runs on every move of a
 * tool, so a page full of ink has to stay quick. A stroke whose box is out of
 * reach isn't looked at at all, and only the stretches within reach are
 * kept, so only those get checked for crossings.
 */
function inkNear(strokes: Stroke[], at: Vec, reach: number, withCrossings: boolean) {
  const ends: Vec[] = [];
  const stretches: Stretch[] = [];
  strokes.forEach((stroke, i) => {
    const line = stroke.points;
    const snap = INK[kindOf(stroke)].snap;
    if (!(snap === "points" || (withCrossings && snap === "crossings")) || line.length === 0) return;
    const box = boundingBox(stroke);
    if (box.left > at[0] + reach || box.right < at[0] - reach || box.top > at[1] + reach || box.bottom < at[1] - reach) return;
    // A dot is its one point, and a line has its two ends.
    if (snap === "points") {
      ends.push([line[0][0], line[0][1]]);
      if (line.length > 1) ends.push([line[line.length - 1][0], line[line.length - 1][1]]);
    }
    for (let j = 1; j < line.length; j++) {
      const a: Vec = [line[j - 1][0], line[j - 1][1]];
      const b: Vec = [line[j][0], line[j][1]];
      if (distanceToSegment(at[0], at[1], a, b) <= reach) stretches.push({ stroke: i, a, b, onlyCrossings: snap === "crossings" });
    }
  });
  return { ends, stretches };
}

/** Where the stretches cross each other. A stroke never crosses itself, and `counts` can turn down other pairs. */
function crossings(stretches: Stretch[], counts: (p: Stretch, q: Stretch) => boolean): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i < stretches.length; i++) {
    for (let j = i + 1; j < stretches.length; j++) {
      const p = stretches[i];
      const q = stretches[j];
      if (p.stroke === q.stroke || !counts(p, q)) continue;
      const meet = crossing(p.a, p.b, q.a, q.b);
      if (meet) points.push(meet);
    }
  }
  return points;
}

/** The point nearest to `at` within `reach` of it, or null when there's none. */
function nearest(points: Vec[], at: Vec, reach: number): Vec | null {
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

/**
 * The point in the ink nearest to `at`, among the crossings, ends and dots
 * within `reach` of it, or null when there's none. Everything is in page
 * units. Ink that only snaps where it crosses plays no part here.
 */
export function snapPoint(strokes: Stroke[], at: Vec, reach: number): Vec | null {
  const { ends, stretches } = inkNear(strokes, at, reach, false);
  return nearest([...ends, ...crossings(stretches, () => true)], at, reach);
}

/**
 * The nearest tick point within `reach` of `at`, or null when there's none.
 * That's a place where ink that only snaps where it crosses, such as a tick
 * on a pair of axes, crosses ink that snaps to its points, such as the axis
 * the tick marks. Two strokes of the first kind crossing don't count, so the
 * strokes of a digit never make a point between themselves.
 */
export function tickPoint(strokes: Stroke[], at: Vec, reach: number): Vec | null {
  const { stretches } = inkNear(strokes, at, reach, true);
  return nearest(crossings(stretches, (p, q) => p.onlyCrossings !== q.onlyCrossings), at, reach);
}
