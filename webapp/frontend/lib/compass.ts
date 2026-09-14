/**
 * The compasses for lesson annotations: a pair of compasses drawn from the
 * side, with a needle and a pencil on two legs that meet at a hinge, in true
 * centimetres of the printed page. The legs are 7 cm long until a handle on
 * the needle's leg resizes them. The needle moves them, the pencil's
 * grip opens or closes them, and the handle on the hinge turns them round the
 * needle, drawing with the pencil unless it's lifted. Each board remembers the
 * width they were last left at.
 *
 * Angles here are in degrees, measured clockwise from pointing right, which
 * is how CSS turns things and how the screen's y axis runs downwards. Points
 * are in screen pixels, the space pointer events arrive in.
 */
import { clamp, type Vec } from "@/lib/stroke-select";
import { draggedLength, readToolSize, saveToolSize } from "@/lib/tool-size";

/**
 * The legs are 7 cm long until the handle resizes them, from 5 cm up to
 * 12 cm. Shorter legs take less room on the board for small circles, and
 * longer ones reach further. The compasses open from 0.5 cm to a centimetre
 * short of their two legs laid end to end, so 13 cm with 7 cm legs, and they
 * start at 4 cm.
 */
const COMPASS_LEG_CM = 7;
const COMPASS_LEGS_MIN_CM = 5;
const COMPASS_LEGS_MAX_CM = 12;
const COMPASS_MIN_CM = 0.5;
const COMPASS_START_CM = 4;

/** The widest the compasses open with legs this long. */
export function widestFor(legs: number): number {
  return 2 * legs - 1;
}

/** Whether the compasses, with legs this long, can open or close to this width. */
export function opensTo(cm: number, legs = COMPASS_LEG_CM): boolean {
  return cm >= COMPASS_MIN_CM && cm <= widestFor(legs);
}

/**
 * A width kept between 0.5 cm and the widest legs this long allow, and
 * snapped to a whole millimetre so a 4 cm circle comes out exactly.
 */
export function snapWidth(cm: number, legs = COMPASS_LEG_CM): number {
  return Math.round(clamp(cm, COMPASS_MIN_CM, widestFor(legs)) * 10) / 10;
}

/**
 * The width typed into the compasses' box, kept within what legs this long
 * allow and snapped to a millimetre, or null when what's typed isn't a number.
 */
export function typedWidth(text: string, legs = COMPASS_LEG_CM): number | null {
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? snapWidth(value, legs) : null;
}

const clampLegs = (cm: number) => clamp(cm, COMPASS_LEGS_MIN_CM, COMPASS_LEGS_MAX_CM);

/**
 * How long a drag of the resize handle makes the legs. The handle sits part
 * way up the needle's leg, so the legs grow or shrink with the finger's
 * distance from the needle, the way the protractor's handle works. They're
 * kept between 5 and 12 cm and rounded to a millimetre.
 */
export function draggedLegs(startCm: number, fromDistance: number, toDistance: number): number {
  return draggedLength(startCm, fromDistance, toDistance, clampLegs);
}

// Each board remembers the width its compasses were last left at, and how long their legs were.
const WIDTH_KEY = "csm_compass_width";
const LEGS_KEY = "csm_compass_legs";

/**
 * The width, in centimetres, the compasses were last left at on this board,
 * or the usual 4 cm, kept within what legs this long allow.
 */
export function readCompassWidth(legs = COMPASS_LEG_CM): number {
  return readToolSize(WIDTH_KEY, COMPASS_START_CM, (cm) => snapWidth(cm, legs));
}

export function saveCompassWidth(cm: number) {
  saveToolSize(WIDTH_KEY, cm);
}

/** How long, in centimetres, the compasses' legs were last left on this board, or the usual 7 cm. */
export function readCompassLegs(): number {
  return readToolSize(LEGS_KEY, COMPASS_LEG_CM, clampLegs);
}

export function saveCompassLegs(cm: number) {
  saveToolSize(LEGS_KEY, cm);
}

/** How high the hinge stands above the line from the needle to the pencil, in centimetres, at this width. */
export function hingeHeight(widthCm: number, legs = COMPASS_LEG_CM): number {
  return Math.sqrt(Math.max(legs ** 2 - (widthCm / 2) ** 2, 0));
}

/** The direction from one point to another. */
export function directionOf(from: Vec, to: Vec): number {
  return (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
}

/** The point at this distance from a centre, in this direction. */
export function pointAt(centre: Vec, distance: number, degrees: number): Vec {
  const turn = (degrees * Math.PI) / 180;
  return [centre[0] + distance * Math.cos(turn), centre[1] + distance * Math.sin(turn)];
}

/**
 * How far the compasses have turned, once the finger has moved on from one
 * direction to the next. A step is counted the short way round, so the count
 * carries on past half a turn, and it stops at one full circle either way.
 */
export function addTurn(swept: number, lastDirection: number, direction: number): number {
  let step = direction - lastDirection;
  step -= 360 * Math.round(step / 360);
  return clamp(swept + step, -360, 360);
}

/**
 * The stretch of a turn the pencil has passed over, as the lowest and highest
 * amounts turned so far, once the turn has reached `swept`. A real pencil
 * marks everything it passes, so going back over the arc keeps it, and going
 * on past the start extends it the other way. It never covers more than one
 * full circle.
 */
export function sweepRange([low, high]: [number, number], swept: number): [number, number] {
  if (swept > high) return [Math.max(low, swept - 360), swept];
  if (swept < low) return [swept, Math.min(high, swept + 360)];
  return [low, high];
}

/**
 * Whether the compasses are drawn mirrored at this angle, which keeps their
 * hinge and handle above the line from the needle to the pencil. That's
 * whenever the pencil is left of the needle.
 */
export function mirroredAt(angle: number): boolean {
  return Math.cos((angle * Math.PI) / 180) < -1e-9;
}

/** The points of an arc round a centre, from one direction to another, with a point for every degree. */
export function arcPoints(centre: Vec, radius: number, from: number, to: number): Vec[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from)));
  return Array.from({ length: steps + 1 }, (_, i) => pointAt(centre, radius, from + ((to - from) * i) / steps));
}
