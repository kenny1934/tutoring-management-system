/**
 * The protractor for lesson annotations: a clear half-disc that lies on the
 * worksheet or the Draft, measured in true centimetres of the printed page.
 * It starts 10 cm across, and a handle resizes it. It has a strip of plastic
 * below its baseline and a small hole cut at its centre mark, and it's moved
 * and turned the same way as the ruler.
 *
 * A line started in the hole is a ray from the centre mark, turned to the
 * nearest whole degree. A line started just outside the curved edge follows
 * the curve as an arc, with a point for every degree. Both are stored as
 * ordinary strokes, so saving, undo, the server and the PDF don't need to
 * know the protractor exists.
 *
 * Its angles are in degrees from the right-hand end of the baseline, counted
 * round towards the curved edge, which is how its outer scale reads. Like the
 * ruler's, its frame is in screen pixels, the space pointer events arrive in.
 */
import { EDGE_REACH } from "@/lib/drawing-guide";
import { clamp, type Vec } from "@/lib/stroke-select";
import { draggedLength, readToolSize, saveToolSize } from "@/lib/tool-size";

/**
 * The protractor starts 10 cm across, the size of a usual school protractor.
 * Its handle resizes it from 8 to 20 cm. Its angles don't depend on its size,
 * so unlike the ruler it measures truly at any size. Below 8 cm its numbers
 * get too small to read on the board.
 */
const PROTRACTOR_ACROSS_CM = 10;
const PROTRACTOR_MIN_CM = 8;
const PROTRACTOR_MAX_CM = 20;

/**
 * The strip of plastic below the baseline, which holds the X and the handle,
 * and the hole at the centre mark, as shares of the radius, so the whole
 * protractor grows and shrinks together. At 10 cm across, the strip is 0.8 cm
 * tall and the hole 0.9 cm across. The hole is cut through the plastic, so a
 * finger in it reaches the page.
 */
export const STRIP_SHARE = 0.16;
export const HOLE_SHARE = 0.09;

// Each board remembers the size its protractor was last left at.
const SIZE_KEY = "csm_protractor_size";

const clampSize = (cm: number) => clamp(cm, PROTRACTOR_MIN_CM, PROTRACTOR_MAX_CM);

/** The size, in centimetres across, the protractor was last left at on this board, or the usual size. */
export function readProtractorSize(): number {
  return readToolSize(SIZE_KEY, PROTRACTOR_ACROSS_CM, clampSize);
}

export function saveProtractorSize(cm: number) {
  saveToolSize(SIZE_KEY, cm);
}

/**
 * The size a drag of the handle asks for. The handle resizes the protractor
 * about its centre mark, so the size grows or shrinks with the finger's
 * distance from it. It's kept between 8 and 20 cm and rounded to a millimetre.
 */
export function draggedSize(startCm: number, fromDistance: number, toDistance: number): number {
  return draggedLength(startCm, fromDistance, toDistance, clampSize);
}

/** The protractor on screen: its centre mark, the direction along its baseline, and its sizes. */
export interface ProtractorFrame {
  cx: number;
  cy: number;
  /** A unit vector pointing along the baseline, towards 0 degrees. */
  dx: number;
  dy: number;
  radius: number;
  strip: number;
  hole: number;
}

/** A point's place against the protractor: how far along the baseline from the centre mark, and how far out towards the curved edge. */
function against(frame: ProtractorFrame, [px, py]: Vec) {
  const rx = px - frame.cx;
  const ry = py - frame.cy;
  return { u: rx * frame.dx + ry * frame.dy, v: rx * frame.dy - ry * frame.dx };
}

/** A point's distance from the centre mark, and its angle in degrees, from -180 to 180. Below the baseline, it's negative. */
export function polar(frame: ProtractorFrame, point: Vec) {
  const { u, v } = against(frame, point);
  return { r: Math.hypot(u, v), angle: (Math.atan2(v, u) * 180) / Math.PI };
}

/** The point on screen at this distance from the centre mark and this angle. */
function fromPolar(frame: ProtractorFrame, r: number, angle: number): Vec {
  const turn = (angle * Math.PI) / 180;
  const u = r * Math.cos(turn);
  const v = r * Math.sin(turn);
  return [frame.cx + u * frame.dx + v * frame.dy, frame.cy + u * frame.dy - v * frame.dx];
}

/** Whether a point is on the protractor, its half-disc or its strip, or no further than `margin` screen pixels from it. */
export function nearProtractor(frame: ProtractorFrame, point: Vec, margin: number): boolean {
  const { u, v } = against(frame, point);
  if (v >= 0) return Math.hypot(u, v) <= frame.radius + margin;
  return Math.abs(u) <= frame.radius + margin && -v <= frame.strip + margin;
}

/**
 * What a line started at this point draws: a ray when it starts in the hole,
 * an arc when it starts just outside the curved edge, or nothing special.
 * The hole is a little forgiving, because the edge of a finger can land on its rim.
 */
export function lineKind(frame: ProtractorFrame, point: Vec): "ray" | "arc" | null {
  const { r, angle } = polar(frame, point);
  if (r <= frame.hole * 1.25) return "ray";
  if (angle >= 0 && r >= frame.radius && r <= frame.radius + EDGE_REACH) return "arc";
  return null;
}

/**
 * A ray from the centre mark towards the finger, turned to the nearest whole
 * degree and running as far as the finger. It comes with its reading from
 * the baseline, from 0 to 180 degrees on whichever side of the baseline it is.
 */
export function rayTo(frame: ProtractorFrame, point: Vec): { ends: [Vec, Vec]; degrees: number } {
  const { r, angle } = polar(frame, point);
  const whole = Math.round(angle);
  return { ends: [[frame.cx, frame.cy], fromPolar(frame, r, whole)], degrees: Math.abs(whole) };
}

/**
 * A ray from the centre mark that runs exactly to a point, such as a point in
 * the ink that a ray's end is pinned to. It's usually a fraction of a degree
 * off a whole one, so only its reading is turned to the nearest whole degree.
 */
export function rayOnto(frame: ProtractorFrame, point: Vec): { ends: [Vec, Vec]; degrees: number } {
  return { ends: [[frame.cx, frame.cy], point], degrees: Math.abs(Math.round(polar(frame, point).angle)) };
}

// An angle kept to the curved edge, from 0 to 180. Below the baseline, a point counts as the nearer end.
const onCurve = (angle: number) => clamp(angle < -90 ? angle + 360 : angle, 0, 180);

/**
 * An arc along the curved edge, moved out from it by the offset, from the
 * angle where the line started to the angle the finger is at now. Both ends
 * are turned to whole degrees and there's a point for every degree, so it
 * comes with how many degrees it spans.
 */
export function arcTo(frame: ProtractorFrame, fromAngle: number, point: Vec, offset: number): { points: Vec[]; degrees: number } {
  const from = Math.round(onCurve(fromAngle));
  const to = Math.round(onCurve(polar(frame, point).angle));
  const steps = Math.max(1, Math.abs(to - from));
  const r = frame.radius + offset;
  const points = Array.from({ length: steps + 1 }, (_, i) => fromPolar(frame, r, from + ((to - from) * i) / steps));
  return { points, degrees: Math.abs(to - from) };
}

/** The protractor's own tilt as it's shown while it's held, from 0 to 359 degrees, since it only reads one way round. */
export function shownTilt(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360;
}
