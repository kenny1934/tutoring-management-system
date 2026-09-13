/**
 * The rubbing eraser for lesson annotations. Strokes are stored as lines of
 * points, so erasing part of one means cutting out the stretch of line under
 * the eraser and keeping whatever is left on either side as separate, shorter
 * strokes. The erased ink is really gone, which keeps undo, the saved PDF and
 * the sessionStorage copy working without knowing an eraser exists.
 */
import type { Stroke } from "@/hooks/useAnnotations";

/**
 * Eraser radius for each size, in the same page units as stroke points and
 * pen sizes (the pens are 3, 6 and 12 wide). A medium eraser is about one
 * handwritten character across.
 */
export const ERASER_RADIUS = { S: 6, M: 12, L: 24 } as const;

/** The eraser sizes on the toolbar, plus the older eraser that removes whole strokes. */
export type EraserSetting = keyof typeof ERASER_RADIUS | "stroke";

type Point = [number, number, number];
type Vec = [number, number];
/** A box in page units, given by its four edges. */
export type Box = { left: number; right: number; top: number; bottom: number };

// Pieces shorter than this are two points sitting on top of each other, left
// behind when a cut lands exactly on a point. They would draw as a stray dot.
const MIN_PIECE_LENGTH = 0.01;

/** Distance from point (px, py) to the segment from a to b. */
function distanceToSegment(px: number, py: number, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + t * dx - px, a[1] + t * dy - py);
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Find where f changes sign between lo and hi, given it has opposite signs at the two ends. */
function bisect(f: (t: number) => number, lo: number, hi: number): number {
  const loInside = f(lo) <= 0;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if ((f(mid) <= 0) === loInside) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The part of the stroke segment from a to b that the eraser covers, as a
 * range of positions along it from 0 (at a) to 1 (at b), or null when the
 * eraser misses it.
 *
 * The eraser sweeps a capsule shape, a circle dragged from one pointer
 * position to the next, so a quick swipe still erases a continuous gap. The
 * distance from the capsule's centre line rises and falls only once along a
 * straight segment, so the covered part is always one unbroken range, and we
 * only need to find its two ends.
 */
function coveredRange(a: Point, b: Point, from: Vec, to: Vec, reach: number): [number, number] | null {
  const f = (t: number) =>
    distanceToSegment(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, from, to) - reach;
  const atStart = f(0) <= 0;
  const atEnd = f(1) <= 0;
  if (atStart && atEnd) return [0, 1];
  if (atStart) return [0, bisect(f, 0, 1)];
  if (atEnd) return [bisect(f, 0, 1), 1];

  // Both ends are clear, but the eraser could still cross the middle.
  // Ternary search finds the closest approach.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (f(m1) <= f(m2)) hi = m2;
    else lo = m1;
  }
  const closest = (lo + hi) / 2;
  if (f(closest) > 0) return null;
  return [bisect(f, 0, closest), bisect(f, closest, 1)];
}

// Strokes are never changed in place, so each one's bounding box is worked
// out the first time the eraser or the lasso needs it, and kept for as long as
// the stroke is.
const strokeBoxes = new WeakMap<Stroke, Box>();

export function boundingBox(stroke: Stroke): Box {
  let box = strokeBoxes.get(stroke);
  if (!box) {
    box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const [x, y] of stroke.points) {
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    }
    strokeBoxes.set(stroke, box);
  }
  return box;
}

function pathLength(points: Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

/**
 * Erase one stroke. Returns null when the eraser misses it, so the caller can
 * keep the original stroke object, or the pieces that survive, which may be
 * none at all.
 */
function eraseStroke(stroke: Stroke, from: Vec, to: Vec, radius: number): Stroke[] | null {
  // The ink spreads half the pen width either side of the stroke's centre
  // line, so the eraser reaches that much further. That makes the gap you see
  // match the eraser circle, once the rounded ends of the pieces are drawn.
  const reach = radius + stroke.size / 2;
  const points = stroke.points;
  if (points.length === 0) return null;

  // Most strokes on a page are nowhere near the eraser, so rule them out by
  // their bounding box before doing any real geometry, and then do the same
  // for each segment of the strokes that are left.
  const boxLeft = Math.min(from[0], to[0]) - reach;
  const boxRight = Math.max(from[0], to[0]) + reach;
  const boxTop = Math.min(from[1], to[1]) - reach;
  const boxBottom = Math.max(from[1], to[1]) + reach;
  const box = boundingBox(stroke);
  if (box.right < boxLeft || box.left > boxRight || box.bottom < boxTop || box.top > boxBottom) {
    return null;
  }
  const segmentNearEraser = (a: Point, b: Point) =>
    Math.max(a[0], b[0]) >= boxLeft && Math.min(a[0], b[0]) <= boxRight &&
    Math.max(a[1], b[1]) >= boxTop && Math.min(a[1], b[1]) <= boxBottom;

  if (points.length === 1) {
    const [x, y] = points[0];
    return distanceToSegment(x, y, from, to) <= reach ? [] : null;
  }

  const pieces: Point[][] = [];
  let current: Point[] | null = null;
  let touched = false;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const range = segmentNearEraser(a, b) ? coveredRange(a, b, from, to, reach) : null;

    if (!range) {
      if (!current) current = [a];
      current.push(b);
      continue;
    }

    touched = true;
    const [start, end] = range;
    // Keep the stretch before the eraser, ending exactly at its edge.
    if (start > 0) {
      if (!current) current = [a];
      current.push(lerpPoint(a, b, start));
    }
    if (current) pieces.push(current);
    current = null;
    // Pick up again on the far side of the eraser, if the segment gets that far.
    if (end < 1) current = [lerpPoint(a, b, end), b];
  }
  if (current) pieces.push(current);

  if (!touched) return null;
  return pieces
    .filter((piece) => piece.length >= 2 && pathLength(piece) >= MIN_PIECE_LENGTH)
    .map((piece) => ({ ...stroke, points: piece }));
}

/**
 * Rub the eraser from one pointer position to the next over a page's strokes.
 * Strokes the eraser misses come back as the same objects, and when it misses
 * everything the original array comes back, so the caller can tell nothing
 * changed without comparing.
 */
export function eraseStrokes(strokes: Stroke[], from: Vec, to: Vec, radius: number): Stroke[] {
  let changed = false;
  const result: Stroke[] = [];
  for (const stroke of strokes) {
    const pieces = eraseStroke(stroke, from, to, radius);
    if (pieces === null) {
      result.push(stroke);
    } else {
      changed = true;
      result.push(...pieces);
    }
  }
  return changed ? result : strokes;
}
