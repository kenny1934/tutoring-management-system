/**
 * Drawing the graph of a function on the Draft, on a pair of axes crossing
 * where the tutor taps. The axes are ordinary ink, so the page can't tell
 * where they are or what a square is worth. The graph uses the axes settings
 * this board remembers, which are the ones it drew last (see lib/axes), and
 * the tap says where the axes cross.
 *
 * The curve is ordinary ink too, one stroke for each unbroken piece of it, so
 * undo, the eraser, the lasso, saving and the PDF all work on it. The
 * function's equation goes just above the end of the curve as a text stroke
 * in the same colour, and all of it goes onto the sheet as one change.
 *
 * The curve runs the length of the x axis and stops at the ends of the y
 * axis, both as far as the axes were actually drawn. It's worked out a point
 * every 0.05 cm along the x axis, with more points wherever the curve climbs
 * steeply, so y = x¹⁰ and tan x near its asymptotes still come out smooth.
 * A piece ends where the function has no value, such as 1/x at 0 and √x below
 * 0, where the curve leaves the top or bottom of the y axis, and where it
 * jumps, as tan x does at 90°. Each of those places is narrowed down by
 * halving, so a piece reaches the edge of the axes, or the last x the
 * function has a value at, and not a point short of it.
 */
import { makeStroke, type InkKind, type Stroke } from "@/hooks/useAnnotations";
import { axesFrame, graphSpan, toPage, type AxesSettings } from "./axes";
import { CM } from "./drawing-guide";
import { DRAFT_SHEET } from "./draft-sheets";
import { TEXT_LINE_HEIGHT, makeTextStrokes, textWidth } from "./text-ink";
import type { Vec } from "./stroke-select";

/** How far apart the curve's points are at most, along the curve, in centimetres. */
const STEP_CM = 0.05;
/**
 * How many times over the space between two points is halved to follow a
 * steep curve. Two points still further apart than STEP_CM after this many
 * halvings are either side of a jump, and the curve lifts there.
 */
const MOST_HALVINGS = 14;
/** How many times over the edge of the y axis, or of where the function has values, is narrowed down by halving. */
const EDGE_HALVINGS = 40;
/** How deep the search for the curve crossing the y axis between two points outside it goes into its own halves. */
const MOST_SPLITS = 8;
/** The most times the function is worked out for one graph, so one that wiggles faster than anyone could see can't hold up the page. */
const MOST_EVALUATIONS = 200_000;
/** The most points in one stroke. The server keeps up to 20,000, and a piece of curve with more than this is split. */
export const MOST_POINTS = 2000;
/**
 * The pressure every point of the curve carries. A pen stroke whose points
 * all carry exactly 0.5 has its pressure made up from its speed, which would
 * thin the curve wherever its points are spread out. With a pressure that
 * isn't 0.5, the curve is one width all along.
 */
const PRESSURE = 0.6;
/** How far above the end of the curve its equation sits, in centimetres. */
const LABEL_GAP_CM = 0.15;
/** How far short of the sheet's right edge the equation stops, in centimetres. */
const LABEL_EDGE_CM = 0.5;

/** Where a value of the function is: within the y axis, above or below it, or nowhere, where the function has no value. */
type Place = "in" | "above" | "below" | "none";

/**
 * The curve of y = f(x) on a pair of axes crossing at `origin`, as lines
 * through points on the page, from left to right. Each line is one unbroken
 * piece of the curve. It's empty when no part of the curve is on the axes.
 */
export function curveLines(f: (x: number) => number, origin: Vec, settings: AxesSettings): Vec[][] {
  const frame = axesFrame(origin, settings);
  const [xStart, xEnd] = graphSpan("x", origin, settings.x);
  const [yStart, yEnd] = graphSpan("y", origin, settings.y);
  if (xEnd <= xStart || yEnd <= yStart) return [];
  // The stretch of each axis the curve covers, in the axes' own numbers.
  const xLo = xStart * settings.x.perSquare;
  const xHi = xEnd * settings.x.perSquare;
  const yLo = yStart * settings.y.perSquare;
  const yHi = yEnd * settings.y.perSquare;
  const step = STEP_CM * CM;

  let evaluations = 0;
  const valueAt = (x: number) => {
    evaluations++;
    return f(x);
  };
  const placeOf = (v: number): Place => (!Number.isFinite(v) ? "none" : v > yHi ? "above" : v < yLo ? "below" : "in");
  const edgeOf = (place: Place) => (place === "above" ? yHi : yLo);
  const apart = (xa: number, va: number, xb: number, vb: number) => {
    const [ax, ay] = toPage(frame, xa, va);
    const [bx, by] = toPage(frame, xb, vb);
    return Math.hypot(bx - ax, by - ay);
  };

  const lines: Vec[][] = [];
  let line: Vec[] = [];
  // A point that lands on the last one, as the edge of the y axis can, takes its place.
  const draw = (x: number, y: number) => {
    const point = toPage(frame, x, y);
    const last = line[line.length - 1];
    if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.01) line[line.length - 1] = point;
    else line.push(point);
  };
  const lift = () => {
    if (line.length > 1) lines.push(line);
    line = [];
  };

  // From a point within the y axis that's already drawn, to another within it.
  const along = (xa: number, va: number, xb: number, vb: number, halvings: number) => {
    const long = apart(xa, va, xb, vb) > step;
    if (long && halvings < MOST_HALVINGS && evaluations < MOST_EVALUATIONS) {
      const xm = (xa + xb) / 2;
      const vm = valueAt(xm);
      if (placeOf(vm) === "in") {
        along(xa, va, xm, vm, halvings + 1);
        along(xm, vm, xb, vb, halvings + 1);
      } else {
        // The curve leaves the y axis between them and comes back.
        leave(xa, va, xm, vm);
        enter(xm, vm, xb, vb);
      }
      return;
    }
    // Still far apart after all that halving, so the function jumps here, as 1/x does across 0 on a tall y axis.
    if (long && halvings >= MOST_HALVINGS) lift();
    draw(xb, vb);
  };

  // From a point within the y axis that's already drawn, to one outside it.
  // The curve goes on to the edge of the y axis, or to the last x the
  // function has a value at, and lifts there.
  function leave(xa: number, va: number, xb: number, vb: number) {
    let lo = xa, vlo = va, hi = xb, vhi = vb;
    for (let i = 0; i < EDGE_HALVINGS; i++) {
      const xm = (lo + hi) / 2;
      const vm = valueAt(xm);
      if (placeOf(vm) === "in") { lo = xm; vlo = vm; } else { hi = xm; vhi = vm; }
    }
    along(xa, va, lo, vlo, 0);
    // A curve that jumps out of the y axis, rather than running off its end, stops where it was.
    const out = placeOf(vhi);
    if (out !== "none" && apart(lo, vlo, lo, edgeOf(out)) <= step) draw(lo, edgeOf(out));
    lift();
  }

  // From a point outside the y axis to one within it, which isn't drawn yet. The curve starts at the edge.
  function enter(xa: number, va: number, xb: number, vb: number) {
    let lo = xa, vlo = va, hi = xb, vhi = vb;
    for (let i = 0; i < EDGE_HALVINGS; i++) {
      const xm = (lo + hi) / 2;
      const vm = valueAt(xm);
      if (placeOf(vm) === "in") { hi = xm; vhi = vm; } else { lo = xm; vlo = vm; }
    }
    lift();
    const out = placeOf(vlo);
    if (out !== "none" && apart(hi, vhi, hi, edgeOf(out)) <= step) draw(hi, edgeOf(out));
    draw(hi, vhi);
    along(hi, vhi, xb, vb, 0);
  }

  // Between two points outside the y axis. A steep curve can still cross the
  // whole of it between them, or the function can jump from one end to the
  // other without crossing it, as tan x does at 90°.
  function across(xa: number, va: number, xb: number, vb: number, splits: number) {
    let lo = xa, vlo = va, hi = xb, vhi = vb;
    if (placeOf(vlo) === placeOf(vhi)) return;
    for (let i = 0; i < EDGE_HALVINGS; i++) {
      const xm = (lo + hi) / 2;
      const vm = valueAt(xm);
      const place = placeOf(vm);
      if (place === "in") {
        enter(lo, vlo, xm, vm);
        leave(xm, vm, hi, vhi);
        return;
      }
      if (place === placeOf(vlo)) { lo = xm; vlo = vm; }
      else if (place === placeOf(vhi)) { hi = xm; vhi = vm; }
      else {
        // A third kind of place in between, such as no value between above and below, so both halves are looked at.
        if (splits < MOST_SPLITS) {
          across(lo, vlo, xm, vm, splits + 1);
          across(xm, vm, hi, vhi, splits + 1);
        }
        return;
      }
    }
  }

  const count = Math.max(1, Math.ceil((xEnd - xStart) / STEP_CM - 1e-9));
  let xPrev = xLo;
  let vPrev = valueAt(xLo);
  if (placeOf(vPrev) === "in") draw(xPrev, vPrev);
  for (let i = 1; i <= count; i++) {
    const x = i === count ? xHi : xLo + ((xHi - xLo) * i) / count;
    const v = valueAt(x);
    const from = placeOf(vPrev);
    const to = placeOf(v);
    if (from === "in" && to === "in") along(xPrev, vPrev, x, v, 0);
    else if (from === "in") leave(xPrev, vPrev, x, v);
    else if (to === "in") enter(xPrev, vPrev, x, v);
    else across(xPrev, vPrev, x, v, 0);
    xPrev = x;
    vPrev = v;
  }
  lift();
  return lines;
}

/** A line cut into pieces of MOST_POINTS at most, each starting where the one before ends. */
function pieces(line: Vec[]): Vec[][] {
  if (line.length <= MOST_POINTS) return [line];
  const cut: Vec[][] = [];
  for (let i = 0; i < line.length - 1; i += MOST_POINTS - 1) cut.push(line.slice(i, i + MOST_POINTS));
  return cut;
}

/** The ink a graph is drawn in. */
export interface GraphInk {
  color: string;
  size: number;
  kind: InkKind;
}

interface GraphOptions {
  /** The function, as y for each x in the axes' own numbers. */
  f: (x: number) => number;
  /** The function's equation, such as "y = x² − 2x − 3". */
  label: string;
  origin: Vec;
  settings: AxesSettings;
  ink: GraphInk;
  /** How big the equation's writing is, in page units. */
  textSize: number;
}

/**
 * The strokes for the graph of a function on axes crossing at `origin`: one
 * stroke of the given ink for each piece of the curve, and the equation as
 * text just above the end of the last piece, in the same colour. The text
 * starts there and runs to the right, unless it would run past the sheet's
 * edge, when it moves left. A graph with no piece on the axes at all is
 * nothing, without its equation either.
 */
export function graphStrokes({ f, label, origin, settings, ink, textSize }: GraphOptions): Stroke[] {
  const lines = curveLines(f, origin, settings);
  if (lines.length === 0) return [];
  const curve = lines.flatMap(pieces).map((line) =>
    makeStroke(line.map(([x, y]): Stroke["points"][number] => [x, y, PRESSURE]), ink.color, ink.size, ink.kind),
  );
  const lastLine = lines[lines.length - 1];
  const [endX, endY] = lastLine[lastLine.length - 1];
  const gap = LABEL_GAP_CM * CM;
  const left = Math.max(0, Math.min(endX + gap, DRAFT_SHEET.width - LABEL_EDGE_CM * CM - textWidth(label, textSize)));
  const middle = endY - gap - (textSize * TEXT_LINE_HEIGHT) / 2;
  const text = makeTextStrokes([{ text: label }], [left, middle], {
    size: textSize, color: ink.color, pageWidth: DRAFT_SHEET.width, pageHeight: DRAFT_SHEET.height,
  });
  return [...curve, ...text];
}
