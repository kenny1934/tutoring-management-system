/**
 * The compasses for lesson annotations: a pair of compasses drawn from the
 * side, with a needle and a pencil on two 7 cm legs that meet at a hinge, in
 * true centimetres of the printed page. The needle moves them, the pencil's
 * grip opens or closes them, and the handle on the hinge turns them round the
 * needle, drawing with the pencil when a pen is picked.
 *
 * Angles here are in degrees, measured clockwise from pointing right, which
 * is how CSS turns things and how the screen's y axis runs downwards. Points
 * are in screen pixels, the space pointer events arrive in.
 */
import type { Vec } from "@/lib/stroke-select";

/** Each leg is 7 cm, so the compasses open from 0.5 cm to 13 cm. They start at 4 cm. */
export const COMPASS_LEG_CM = 7;
export const COMPASS_MIN_CM = 0.5;
export const COMPASS_MAX_CM = 13;
export const COMPASS_START_CM = 4;

/** How close, in centimetres, the needle or the pencil has to come to a point in the ink to snap onto it. */
export const COMPASS_SNAP_CM = 0.5;

/** Whether the compasses can open, or close, to this width. */
export function opensTo(cm: number): boolean {
  return cm >= COMPASS_MIN_CM && cm <= COMPASS_MAX_CM;
}

/** A width kept between 0.5 and 13 cm, and snapped to a whole millimetre so a 4 cm circle comes out exactly. */
export function snapWidth(cm: number): number {
  return Math.round(Math.min(Math.max(cm, COMPASS_MIN_CM), COMPASS_MAX_CM) * 10) / 10;
}

/** How high the hinge stands above the line from the needle to the pencil, in centimetres, at this width. */
export function hingeHeight(widthCm: number): number {
  return Math.sqrt(Math.max(COMPASS_LEG_CM ** 2 - (widthCm / 2) ** 2, 0));
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
  return Math.min(Math.max(swept + step, -360), 360);
}

/** The points of an arc round a centre, from one direction to another, with a point for every degree. */
export function arcPoints(centre: Vec, radius: number, from: number, to: number): Vec[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from)));
  return Array.from({ length: steps + 1 }, (_, i) => pointAt(centre, radius, from + ((to - from) * i) / steps));
}
