/**
 * The key points of a graph on the Draft: where the curve crosses the x axis,
 * where it crosses the y axis, and where it turns. They're the points a
 * textbook marks, so y = x² − 2x − 3 on the usual axes has (−1, 0), (3, 0),
 * (0, −3) and (1, −4).
 *
 * The points are found from the curve that was just traced, one unbroken piece
 * of it at a time. That matters for two reasons. The piece's points are
 * already values of the function, close together and closer still where the
 * curve is steep, so the search starts from what's drawn rather than working
 * the function out all over again. And because a search never runs across a
 * break, 1/x is never said to cross the x axis at 0 and tan x is never said to
 * turn at 90°, which is where each of them jumps.
 *
 * Everything here is in the axes' own numbers, so x is 90 on an axis in
 * degrees and 1.57 on one in radians. Turning a point into a place on the page
 * is lib/plot's job.
 */
import { fromPage, type AxesFrame, type AxesSettings } from "./axes";
import type { Vec } from "./stroke-select";

/**
 * What a key point is. It decides which way round the coordinates are written
 * beside it, which lib/plot works out, because there's usually only room on
 * one side.
 */
export type KeyPointKind = "crossing" | "y-intercept" | "top" | "bottom";

export interface KeyPoint {
  kind: KeyPointKind;
  /** Where it is, in the axes' own numbers. */
  at: Vec;
  /** For a crossing of the x axis, true when the curve is on its way up through it. */
  rising?: boolean;
  /** The coordinates as they're written beside the dot, such as "(−1, 0)". */
  text: string;
}

/** A proper minus sign, the one a textbook uses, not the hyphen a number comes out of JavaScript with. */
const MINUS = "−";
/**
 * How many significant figures the coordinates are written to. That's what
 * HKDSE answers use unless a question says otherwise, so √2 is written 1.41.
 */
const FIGURES = 3;
/**
 * A value smaller than this share of what a square is worth is written as 0.
 * The searches below land a hair off the exact answer, so the bottom of
 * y = x² comes out at 3 × 10⁻⁹ rather than 0, and nobody wants to read that on
 * a board. Anything this small is far too close to the axis to see.
 */
const WRITTEN_AS_ZERO = 1e-6;
/**
 * A curve closer to the x axis than this share of what a square is worth is
 * taken to be sitting on it. It's the same size as WRITTEN_AS_ZERO, and for
 * the same reason, that nothing this small can be seen on a board, but it
 * answers a different question, so moving one shouldn't quietly move the other.
 */
const ON_THE_AXIS = 1e-6;
/** How many times the stretch holding a crossing is halved to close in on it. */
const CROSSING_HALVINGS = 40;
/** How many times the stretch holding a turning point is narrowed. Each step leaves 0.618 of it, so 60 steps leave almost nothing. */
const TURNING_STEPS = 60;
/** The share of a stretch a golden-section search keeps at each step. */
const GOLDEN = (Math.sqrt(5) - 1) / 2;
/**
 * The most times the function is worked out while finding the points of one
 * graph, which is the limit the curve itself is drawn under. A function that
 * wiggles faster than anyone could see stops being searched rather than
 * holding up the page.
 */
const MOST_EVALUATIONS = 200_000;

/**
 * A coordinate as it's written beside a point: three significant figures with
 * any trailing zeros dropped, so 3 is written 3 and not 3.00, with a proper
 * minus sign, and with a degree sign on an axis in degrees.
 */
export function writtenNumber(value: number, perSquare: number, degrees = false): string {
  const rounded = Math.abs(value) < WRITTEN_AS_ZERO * perSquare ? 0 : Number(value.toPrecision(FIGURES));
  return `${String(rounded).replace("-", MINUS)}${degrees ? "°" : ""}`;
}

/** A point as its coordinates are written, such as "(−1, 0)" or "(90°, 1)". */
function coordinates([x, y]: Vec, settings: AxesSettings): string {
  return `(${writtenNumber(x, settings.x.perSquare, settings.x.degrees)}, ${writtenNumber(y, settings.y.perSquare)})`;
}

/**
 * The key points of the curve drawn as `lines`, which are the pieces
 * lib/plot's curveLines traced, in page units. Each point comes back with its
 * coordinates already written.
 *
 * Two points that are written the same way are the same point, so where a
 * curve touches the x axis and turns back, as y = (x − 1)² does at 1, there's
 * one point and not two. The turning point is the one kept, because its label
 * has somewhere to go.
 */
export function keyPoints(lines: Vec[][], f: (x: number) => number, frame: AxesFrame, settings: AxesSettings): KeyPoint[] {
  let evaluations = 0;
  const valueAt = (x: number) => {
    evaluations++;
    return f(x);
  };
  const spent = () => evaluations >= MOST_EVALUATIONS;

  /**
   * Whether a value is close enough to the x axis to count as being on it.
   * Working out sin 360° leaves 2 × 10⁻¹⁶ behind rather than 0, and anything
   * that small is written as 0 and drawn on the axis anyway, so the curve is
   * taken to be on the axis there.
   */
  const onAxis = (y: number) => Math.abs(y) <= ON_THE_AXIS * settings.y.perSquare;

  const found: KeyPoint[] = [];
  const add = (kind: KeyPointKind, at: Vec, rising?: boolean) => {
    found.push({ kind, at, rising, text: coordinates(at, settings) });
  };

  /** Where the curve crosses the x axis between two samples on opposite sides of it, closed in on by halving. */
  const crossingBetween = (xa: number, ya: number, xb: number): number => {
    let lo = xa, vlo = ya, hi = xb;
    for (let i = 0; i < CROSSING_HALVINGS; i++) {
      const xm = (lo + hi) / 2;
      const vm = valueAt(xm);
      if (vm === 0) return xm;
      if (vm * vlo < 0) hi = xm;
      else { lo = xm; vlo = vm; }
    }
    return (lo + hi) / 2;
  };

  /**
   * The highest or lowest point of the curve between two x, closed in on by a
   * golden-section search. That's the standard way of finding the top or
   * bottom of a stretch of curve with few goes at the function, and it works
   * on a corner as well as a smooth turn, so it finds the point of y = |x|.
   */
  const turningBetween = (from: number, to: number, top: boolean): Vec => {
    let lo = from, hi = to;
    let c = hi - GOLDEN * (hi - lo), d = lo + GOLDEN * (hi - lo);
    let vc = valueAt(c), vd = valueAt(d);
    for (let i = 0; i < TURNING_STEPS && !spent(); i++) {
      if (top ? vc > vd : vc < vd) {
        hi = d; d = c; vd = vc;
        c = hi - GOLDEN * (hi - lo);
        vc = valueAt(c);
      } else {
        lo = c; c = d; vc = vd;
        d = lo + GOLDEN * (hi - lo);
        vd = valueAt(d);
      }
    }
    const x = (lo + hi) / 2;
    return [x, valueAt(x)];
  };

  const pieces = lines.map((line) => line.map((point) => fromPage(frame, point)));

  for (const piece of pieces) {
    // Where the curve crosses the x axis. A sample sitting on the axis counts,
    // as long as the curve leaves the axis on one side of it or the other,
    // which is what catches a crossing at the very end of a piece, such as
    // sin x at 360°. A curve lying along the axis, as y = 0 does, leaves it
    // nowhere and so crosses nothing.
    for (let i = 0; i < piece.length && !spent(); i++) {
      const [x, y] = piece[i];
      const next = piece[i + 1];
      if (onAxis(y)) {
        const before = i > 0 ? piece[i - 1][1] : 0;
        const after = next ? next[1] : 0;
        if (!onAxis(before) || !onAxis(after)) add("crossing", [x, 0], (onAxis(after) ? -before : after) > 0);
      } else if (next && y * next[1] < 0) {
        add("crossing", [crossingBetween(x, y, next[0]), 0], next[1] > y);
      }
    }

    // Where the curve turns. Walking the samples, the curve's direction is
    // either up or down, and the flat steps in between are passed over, so a
    // top that happens to have a flat step across it is still one turn and not
    // two. Wherever the direction changes, the curve turned somewhere between
    // the start of the step before and the end of the step after.
    let lastDirection = 0;
    let turnFrom = 0;
    for (let i = 0; i + 1 < piece.length && !spent(); i++) {
      const direction = Math.sign(piece[i + 1][1] - piece[i][1]);
      if (direction === 0) continue;
      if (lastDirection !== 0 && direction !== lastDirection) {
        const top = lastDirection > 0;
        add(top ? "top" : "bottom", turningBetween(piece[turnFrom][0], piece[i + 1][0], top));
      }
      lastDirection = direction;
      turnFrom = i;
    }
  }

  // Where the curve crosses the y axis, which is simply its value at 0. It's
  // only marked where the curve is actually drawn at 0, so 1/x and tan x have
  // none: each of them breaks there, leaving 0 in the gap between two pieces.
  const across = pieces.find((piece) => piece[0][0] <= 0 && piece[piece.length - 1][0] >= 0);
  if (across && !spent()) {
    const y = valueAt(0);
    if (Number.isFinite(y)) add("y-intercept", [0, y]);
  }

  // A turning point beats a crossing where both are written the same way,
  // because a label below the bottom of a curve reads better than one squeezed
  // above the axis it sits on.
  const rank: Record<KeyPointKind, number> = { top: 0, bottom: 0, crossing: 1, "y-intercept": 2 };
  const kept = new Map<string, KeyPoint>();
  for (const point of found) {
    const there = kept.get(point.text);
    if (!there || rank[point.kind] < rank[there.kind]) kept.set(point.text, point);
  }
  return [...kept.values()].sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
}
