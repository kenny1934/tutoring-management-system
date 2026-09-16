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
 *
 * The graph can be drawn with its key points marked as well, which is a tick
 * box in the Graph panel. Each of them gets a dot and its coordinates, and
 * they go on in the same change as the curve, because once the ink is on the
 * sheet nothing knows which function drew it. Finding them is lib/key-points,
 * and what's here is where each label goes, which is the part that has to know
 * what else is on the sheet.
 */
import { isText, makeStroke, type InkKind, type Stroke } from "@/hooks/useAnnotations";
import { axesFrame, graphSpan, toPage, type AxesFrame, type AxesSettings } from "./axes";
import { createBooleanPreference } from "./boolean-preference";
import { CM } from "./drawing-guide";
import { DRAFT_SHEET } from "./draft-sheets";
import { keyPoints as findKeyPoints, type KeyPoint } from "./key-points";
import { boundingBox, boxesApart, segmentReachesBox, type Box } from "./stroke-eraser";
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
/** How wide a key point's dot is, next to the curve it sits on. */
const DOT_WIDTH = 2;
/** How far a key point's coordinates sit from its dot, corner to corner, in centimetres. */
const POINT_GAP_CM = 0.12;
/** The least room a key point's coordinates keep between themselves and anything else on the sheet, in centimetres. */
const POINT_ROOM_CM = 0.05;
/**
 * How many steps further out a key point's coordinates will go to find room,
 * past the four places closest to its dot. Each step is one line of writing,
 * so two points too close together for both labels end up with one above the
 * other, and a label never wanders more than about three lines from its point.
 */
const MOST_STEPS = 3;

/**
 * Whether a graph is drawn with its key points marked. It's one tick box in
 * the Graph panel, and each board remembers it, so a tutor teaching quadratics
 * can leave it on for a whole lesson.
 */
export const draftKeyPoints = createBooleanPreference("csm_draft_key_points");

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
  /** True when the key points are marked as well: where the curve crosses the axes, and where it turns. */
  keyPoints?: boolean;
  /** The ink already on the sheet, which the key points' coordinates keep clear of where they can. */
  existing?: Stroke[];
}

/** One of the four corners round a dot that its coordinates can sit at. */
type Corner = "above-left" | "above-right" | "below-left" | "below-right";

/**
 * The corners a point's coordinates are tried at, the likeliest first. Where
 * they end up depends on what kind of point it is, because each kind has one
 * side with room on it and one side with something in the way.
 */
function cornerOrder({ kind, rising }: KeyPoint): Corner[] {
  switch (kind) {
    // The curve is above the bottom of a dip and below the top of a hump, so
    // in each case the coordinates go on the empty side.
    case "bottom": return ["below-right", "below-left", "above-right", "above-left"];
    case "top": return ["above-right", "above-left", "below-right", "below-left"];
    // The x axis's own numbers sit under it, so a crossing goes above the
    // axis, on the side the curve isn't: to the left where the curve rises
    // through the axis, and to the right where it falls.
    case "crossing": return rising
      ? ["above-left", "above-right", "below-left", "below-right"]
      : ["above-right", "above-left", "below-right", "below-left"];
    // The y axis's own numbers sit to the left of it, so the y-intercept goes to its right.
    default: return ["above-right", "below-right", "above-left", "below-left"];
  }
}

/**
 * Where a label of this size sits when it's put at one corner of the dot at
 * `at`. A label `step` steps out stands that many lines further up, or further
 * down, than it otherwise would, keeping to the same side of the dot. That's
 * what lets the coordinates of two points too close together stack up instead
 * of landing on each other.
 */
function labelBox([px, py]: Vec, corner: Corner, width: number, height: number, gap: number, step: number): Box {
  const out = gap + step * (height + gap);
  const left = corner.endsWith("right") ? px + gap : px - gap - width;
  const top = corner.startsWith("above") ? py - out - height : py + out;
  return { left, right: left + width, top, bottom: top + height };
}

/** Whether a label's box would land on any of these strokes, keeping `room` clear around it. */
function touches(box: Box, strokes: Stroke[], room: number): boolean {
  const left = box.left - room;
  const right = box.right + room;
  const top = box.top - room;
  const bottom = box.bottom + room;
  return strokes.some((stroke) => {
    // Most strokes are nowhere near, and the box around a stroke settles that in one go.
    if (boxesApart(box, boundingBox(stroke), room)) return false;
    // A text stroke's two points are the corners of its box, so its box is all of it.
    if (isText(stroke)) return true;
    const points = stroke.points;
    if (points.length === 1) return segmentReachesBox(box, points[0], points[0], room);
    // A curve runs right across the sheet in hundreds of short pieces, and
    // hardly any of them are near this one label, so each is thrown out by the
    // two ends it lies between before the line itself is measured.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (Math.max(a[0], b[0]) < left || Math.min(a[0], b[0]) > right) continue;
      if (Math.max(a[1], b[1]) < top || Math.min(a[1], b[1]) > bottom) continue;
      if (segmentReachesBox(box, a, b, room)) return true;
    }
    return false;
  });
}

interface PointOptions {
  /**
   * Everything the coordinates have to keep clear of: the curve itself, its
   * equation, and the ink that was already on the sheet, such as the axes and
   * their numbers. Text among it counts as the whole of its box.
   */
  obstacles: Stroke[];
  frame: AxesFrame;
  ink: GraphInk;
  textSize: number;
}

/**
 * A dot for each key point and its coordinates beside it. The dot is twice as
 * wide as the curve, in the curve's own ink, so it reads as a point on the
 * curve from the back of the room and the tools still snap onto it.
 *
 * The coordinates try the four corners closest to their dot first, and then
 * the same four corners a line further out, and so on. They take the first
 * place that stays on the sheet and keeps clear of the curve, of the labels
 * already placed, and of the ink that was already on the sheet, such as the
 * axes and their numbers. So the two roots of a parabola, whose labels are
 * wider together than the gap between them, end up with one above the other,
 * both in the clear space between the curve and the axis.
 *
 * Where nothing is clear anywhere, they take the first place that at least
 * keeps off the other labels. Two labels on top of each other can't be read at
 * all, while one sitting over an axis number still can, and the tutor can
 * always move it with the lasso.
 */
function pointStrokes(points: KeyPoint[], { obstacles, frame, ink, textSize }: PointOptions): Stroke[] {
  const gap = POINT_GAP_CM * CM;
  const room = POINT_ROOM_CM * CM;
  const height = textSize * TEXT_LINE_HEIGHT;
  const fitsSheet = (box: Box) =>
    box.left >= 0 && box.top >= 0 && box.right <= DRAFT_SHEET.width && box.bottom <= DRAFT_SHEET.height;

  const taken: Box[] = [];
  const dots: Stroke[] = [];
  const texts: Stroke[] = [];
  for (const point of points) {
    const at = toPage(frame, point.at[0], point.at[1]);
    dots.push(makeStroke([[at[0], at[1], PRESSURE]], ink.color, ink.size * DOT_WIDTH, ink.kind));

    const width = textWidth(point.text, textSize);
    const corners = cornerOrder(point);
    const boxes: Box[] = [];
    for (let step = 0; step <= MOST_STEPS; step++) {
      for (const corner of corners) boxes.push(labelBox(at, corner, width, height, gap, step));
    }
    // Room for a label means room on the sheet and room beside every label
    // already placed. What else it has to keep off depends on how hard it is
    // to find anywhere at all, so that's asked separately.
    const roomFor = (candidate: Box) =>
      fitsSheet(candidate) && taken.every((other) => boxesApart(candidate, other, room));
    const box = boxes.find((candidate) => roomFor(candidate) && !touches(candidate, obstacles, room))
      ?? boxes.find(roomFor)
      ?? boxes[0];
    taken.push(box);
    texts.push(...makeTextStrokes([{ text: point.text }], [box.left, box.top + height / 2], {
      size: textSize, color: ink.color, pageWidth: DRAFT_SHEET.width, pageHeight: DRAFT_SHEET.height,
    }));
  }
  return [...dots, ...texts];
}

/**
 * The strokes for the graph of a function on axes crossing at `origin`: one
 * stroke of the given ink for each piece of the curve, and the equation as
 * text just above the end of the last piece, in the same colour. The text
 * starts there and runs to the right, unless it would run past the sheet's
 * edge, when it moves left. A graph with no piece on the axes at all is
 * nothing, without its equation either.
 *
 * With `keyPoints` on, a dot and its coordinates follow for each point where
 * the curve crosses an axis or turns.
 */
export function graphStrokes(
  { f, label, origin, settings, ink, textSize, keyPoints = false, existing = [] }: GraphOptions,
): Stroke[] {
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
  if (!keyPoints) return [...curve, ...text];

  const frame = axesFrame(origin, settings);
  const points = findKeyPoints(lines, f, frame, settings);
  const obstacles = [...curve, ...text, ...existing];
  return [...curve, ...text, ...pointStrokes(points, { obstacles, frame, ink, textSize })];
}
