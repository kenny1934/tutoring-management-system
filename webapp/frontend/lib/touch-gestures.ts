/**
 * The maths behind two-finger gestures on the lesson viewer. The viewer
 * handles every touch itself, so one finger can draw while two fingers scroll
 * or pinch-zoom. These helpers hold the parts worth testing on their own.
 */

export interface TouchPoint {
  x: number;
  y: number;
}

export type TwoFingerGesture = "scroll" | "pinch";

/**
 * How far, in screen pixels, the gap between two fingers has to change before
 * a gesture counts as a pinch, and how far the fingers have to travel together
 * before it counts as a scroll.
 */
export const PINCH_SPREAD = 60;
export const SCROLL_TRAVEL = 30;

export const midpoint = (a: TouchPoint, b: TouchPoint): TouchPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export const distance = (a: TouchPoint, b: TouchPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Decide whether two fingers are scrolling or pinching, from where they
 * started and where they are now. Returns null while it's too early to tell.
 *
 * Two fingers dragging side by side always drift apart a little, and on a big
 * touch board that drift was enough to zoom the page in the middle of a
 * scroll. So it only counts as a pinch when the gap changes a lot before the
 * fingers have travelled far together, and the viewer holds the answer until
 * every finger lifts.
 */
export function classifyTwoFingerGesture(
  start: [TouchPoint, TouchPoint],
  now: [TouchPoint, TouchPoint],
): TwoFingerGesture | null {
  const startMid = midpoint(...start);
  const nowMid = midpoint(...now);
  const travel = distance(startMid, nowMid);
  const spread = Math.abs(distance(...now) - distance(...start));
  if (spread > PINCH_SPREAD && spread > travel * 1.5) return "pinch";
  if (travel > SCROLL_TRAVEL) return "scroll";
  return null;
}
