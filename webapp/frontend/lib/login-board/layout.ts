/**
 * Where everything goes on the sign-in board, as real Draft ink. The board is
 * a stretch of Draft paper, in a sheet's own page units, and everything on it
 * is made by the same code that makes a tutor's ink: the working is text
 * strokes from lib/text-ink, the axes come from lib/axes, and each graph,
 * with its equation and its key points, comes from lib/plot. So the board
 * looks like a Draft a colleague left up, down to the grey pencil axes and
 * the way a key point's coordinates sit beside its dot.
 *
 * The working is written down the left, the way a tutor writes it, with the
 * equals signs lined up under each other and the reasons in a margin in blue.
 * A graph, when there is one, goes on the right, level with the top of the
 * working. Everything sits on the squares, so the axes cross on a corner and
 * their ticks land on the lines, as they do on squared paper in a lesson.
 *
 * Each piece says what kind of entrance it makes, and in what order, which is
 * what LoginBoard uses to write the board out once.
 */
import { makeStroke, type Stroke } from "@/hooks/useAnnotations";
import { INK_SIZES, INK_SWATCHES, TEXT_SIZES } from "@/hooks/useAnnotationTools";
import { axesParts, axesStrokes, type AxesSettings } from "@/lib/axes";
import { CM } from "@/lib/drawing-guide";
import { DRAFT_SHEET, DRAFT_SQUARE } from "@/lib/draft-sheets";
import { writtenNumber } from "@/lib/key-points";
import { graphStrokes } from "@/lib/plot";
import { readFunction } from "@/lib/plot-expression";
import { boundingBox, boxesApart, segmentReachesBox, type Box } from "@/lib/stroke-eraser";
import { makeTextStrokes, textWidth } from "@/lib/text-ink";
import type { Vec } from "@/lib/stroke-select";
import { graphMeetings } from "./check";
import { functionOf, unitOf, valueOf } from "./maths";
import type { Answer, BoardProblem, Interval, Statement, WorkingLine } from "./problems";

const colour = (id: string) => INK_SWATCHES.find((swatch) => swatch.id === id)!.color;
const BLACK = colour("black");
const BLUE = colour("blue");
const RED = colour("red");

/** The working is written at the Text tool's middle size, and the reasons and a graph's labels at its small size. */
const WORKING_SIZE = TEXT_SIZES.M;
const SMALL_SIZE = TEXT_SIZES.S;
/** How much wider than every other left-hand side the question's has to be before it's written from the margin. */
const QUESTION_APART = 3 * CM;
/** How far apart the lines of working are, from middle to middle. */
const LINE_PITCH = 1.3 * CM;
/** The empty margin round the board, which is also where the first line starts. */
const MARGIN = DRAFT_SQUARE;
/** How far the reasons sit to the right of the longest line. */
const REASON_GAP = 0.8 * CM;
/** How far the graph's y-axis numbers and the working keep apart. */
const GRAPH_GAP = 1.6 * CM;
/** The graphs are drawn in the medium pen, which reads from the back of a room better than the small one. */
const GRAPH_PEN = INK_SIZES.pen.M;

/** How a piece of the board comes on when the board writes itself out. */
export type Entrance =
  /** Written from left to right, as text is. */
  | "write"
  /** Drawn along its length, as a curve or an underline is. */
  | "trace"
  /** Fades in, as the axes and the key points do. */
  | "appear";

export interface BoardPiece {
  stroke: Stroke;
  entrance: Entrance;
  /** When it comes on: pieces with the same step come on together, and a lower step comes first. */
  step: number;
  /** What part of the board it is, which says how long its entrance takes. */
  part: "axes" | "line" | "reason" | "underline" | "curve" | "label" | "point";
  /**
   * For a left-hand side of the working, where it has to end, which is just
   * before the column the equals signs line up in. The board draws it ending
   * there whatever the device's fonts make its width, because a phone without
   * the board's serif font measures the text differently from how it draws
   * it, and the equals signs would then step in and out down the board.
   */
  endsAt?: number;
}

export interface BoardLayout {
  /** The stretch of paper the board shows, in page units. */
  box: { left: number; top: number; width: number; height: number };
  pieces: BoardPiece[];
}

// ---------- Writing a line ----------

const LABEL_START = /^[^=]*= /;
const MINUS = "−";
const ITALIC_X = "\u{1D465}";
const ITALIC_Y = "\u{1D466}";

/** The raised characters a power of x can be written in. */
const RAISED: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", [MINUS]: "⁻", [ITALIC_X]: "ˣ",
};

/**
 * Powers with x in them written raised, as 3ˣ and 2ˣ⁺¹, the way a tutor
 * writes them. The Draft's labels write them as 3^𝑥 and 2^(𝑥 + 1), because
 * its graph labels can be anything, but the board's are only ever short
 * powers made of digits, signs and x, which all have raised forms.
 */
function raisePowers(text: string): string {
  return text.replace(/\^(\((?:[^()]*)\)|\u{1D465}|\d+)/gu, (whole, power: string) => {
    const inside = power.startsWith("(") ? power.slice(1, -1) : power;
    const chars = [...inside.replace(/ /g, "")];
    return chars.every((ch) => ch in RAISED) ? chars.map((ch) => RAISED[ch]).join("") : whole;
  });
}

/** A side of a line as the Draft writes it, such as 𝑥² − 6𝑥 + 5, with an italic x and a proper minus sign. */
export function writtenSide(latex: string): string {
  const reading = readFunction(latex);
  if (reading.status !== "ready") return latex;
  // The reader writes the whole equation of a graph, "𝑦 = …", and the board wants only the side.
  return raisePowers(reading.label.replace(LABEL_START, ""));
}

/**
 * Two right-hand sides written as one with ±, as a textbook writes the two
 * square roots of a number or the two halves of the quadratic formula: 2 and
 * −2 become ±2, and (3 + √17)/4 and (3 − √17)/4 become (3 ± √17)/4. Null
 * when the two don't differ in just that way.
 */
function plusOrMinus(a: string, b: string): string | null {
  if (b === `${MINUS}${a}`) return `±${a}`;
  if (a.length !== b.length) return null;
  const differ = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter((i) => i !== -1);
  if (differ.length !== 1) return null;
  const i = differ[0];
  return a[i] === "+" && b[i] === MINUS ? `${a.slice(0, i)}±${a.slice(i + 1)}` : null;
}

/** A line split where its first relation starts, so the relations can be lined up down the board. */
interface SplitLine {
  left: string;
  right: string;
  reason?: string;
}

function splitStatements(statements: Statement[]): SplitLine {
  const [first, second] = statements;
  if (statements.length === 2 && first.lhs === second.lhs && first.rel === second.rel) {
    const together = plusOrMinus(writtenSide(first.rhs), writtenSide(second.rhs));
    if (together) return { left: writtenSide(first.lhs), right: `${first.rel} ${together}` };
  }
  const rest = statements.slice(1).map((s) => `or ${writtenSide(s.lhs)} ${s.rel} ${writtenSide(s.rhs)}`);
  return { left: writtenSide(first.lhs), right: [`${first.rel} ${writtenSide(first.rhs)}`, ...rest].join(" ") };
}

/** A value as the answer writes it: as the Draft writes the number, with a degree sign on an angle. */
function answerValue(latex: string, degrees: boolean): string {
  return `${writtenSide(latex)}${degrees ? "°" : ""}`;
}

/** A list written the way a sentence lists things: "2 or 3", "0°, 120° or 240°". */
function listed(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** One stretch of an inequality's answer, such as "1 ≤ 𝑥 ≤ 3", split where x is so it lines up. */
function intervalText({ from, to }: Interval): { before: string; after: string } {
  // With only a lower end, x is written first, as a textbook writes x > 3 rather than 3 < x.
  if (from && !to) return { before: "", after: ` ${from.closed ? "≥" : ">"} ${writtenSide(from.at)}` };
  const before = from ? `${writtenSide(from.at)} ${from.closed ? "≤" : "<"} ` : "";
  const after = to ? ` ${to.closed ? "≤" : "<"} ${writtenSide(to.at)}` : "";
  return { before, after };
}

/** The answer's lines, written from the checked answer, never typed separately. */
function answerLines(answer: Answer, problem: BoardProblem): SplitLine[] {
  const degrees = problem.degrees === true;
  if (answer.kind === "interval") {
    const [first, ...rest] = answer.parts.map(intervalText);
    const more = rest.map((part) => ` or ${part.before}${ITALIC_X}${part.after}`).join("");
    return [{ left: `${first.before}${ITALIC_X}`, right: `${first.after.trimStart()}${more}` }];
  }
  const lines: SplitLine[] = [];
  const exact = answer.values.map((v) => answerValue(v, degrees));
  // A rejected value is written after the ones that stand, with its own x
  // and "(rejected)", as a DSE answer writes x = 5 or x = −2 (rejected).
  const rejected = (answer.rejected ?? []).map((v) => ` or ${ITALIC_X} = ${answerValue(v, degrees)} (rejected)`).join("");
  let main = `= ${listed(exact)}${rejected}`;
  if (answer.yFrom !== undefined && answer.values.length === 1) {
    // Two lines meet at one point, so its y is written beside its x, worked
    // out rather than typed. With more points than one, the graph's own
    // coordinates say where each is.
    const y = functionOf(answer.yFrom, unitOf(problem))(valueOf(answer.values[0]));
    main = `= ${exact[0]}, ${ITALIC_Y} = ${writtenNumber(y, 1)}`;
  }
  lines.push({ left: ITALIC_X, right: main });
  if (answer.rounded) {
    const rounded = answer.values.map((v) => `${writtenNumber(valueOf(v), 1)}${degrees ? "°" : ""}`);
    lines.push({ left: ITALIC_X, right: `≈ ${listed(rounded)}`, reason: "cor. to 3 sig. fig." });
  }
  return lines;
}

// ---------- Laying out the board ----------

const snapUp = (v: number) => Math.ceil(v / DRAFT_SQUARE - 1e-9) * DRAFT_SQUARE;

/**
 * The board's own text: the working, the reasons and the coordinates where
 * two graphs meet. It's laid out on a page much wider than a sheet, because
 * the board can be wider than one, and text kept to a sheet would be pushed
 * back over the working instead of sitting where it's put.
 */
const BOARD_PAGE = { width: 100 * CM, height: 100 * CM };

function text(words: string, left: number, middle: number, size: number, color: string, italic = false): Stroke[] {
  return makeTextStrokes([{ text: words, italic }], [left, middle], {
    size, color, pageWidth: BOARD_PAGE.width, pageHeight: BOARD_PAGE.height,
  });
}

/** A stroke moved across and down by so much, the way the lasso moves ink. */
function moved(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map(([x, y, p]): [number, number, number] => [x + dx, y + dy, p]) };
}

/** The board for a problem: the working, the answer, and the graph if it has one. */
export function boardLayout(problem: BoardProblem): BoardLayout {
  const working: SplitLine[] = [
    ...problem.lines.map((line: WorkingLine) => ({ ...splitStatements(line.or), reason: line.reason })),
    ...answerLines(problem.answer, problem),
  ];
  const pieces: BoardPiece[] = [];
  const answerFrom = problem.lines.length;

  // The relations line up down a column, just right of the widest left-hand
  // side. A question whose left-hand side is much wider than the rest, such
  // as 2x² − 3x − 1 = 0 above a column of x = …, is written from the margin
  // instead, as a tutor writes the question and lines the working up under it.
  const space = textWidth(" ", WORKING_SIZE);
  const lefts = working.map((line) => textWidth(line.left, WORKING_SIZE));
  const restWidest = Math.max(...lefts.slice(1));
  const questionApart = lefts[0] - restWidest > QUESTION_APART;
  const column = MARGIN + (questionApart ? restWidest : Math.max(...lefts)) + space;
  const rightEdge = Math.max(
    column + Math.max(...working.slice(questionApart ? 1 : 0).map((line) => textWidth(line.right, WORKING_SIZE))),
    questionApart ? MARGIN + lefts[0] + space + textWidth(working[0].right, WORKING_SIZE) : 0,
  );
  const reasonsAt = rightEdge + REASON_GAP;
  const reasonsEdge = reasonsAt + Math.max(0, ...working.map((line) => (line.reason ? textWidth(line.reason, SMALL_SIZE, true) : 0)));
  const workingEdge = working.some((line) => line.reason) ? reasonsEdge : rightEdge;

  // The board starts a margin above the first line, and the lines go down from there.
  const firstMiddle = MARGIN + WORKING_SIZE * 0.6;
  let step = 1;
  working.forEach((line, i) => {
    const middle = firstMiddle + i * LINE_PITCH;
    const lineStep = step++;
    const ownLine = i === 0 && questionApart;
    const leftAt = ownLine ? MARGIN : column - space - lefts[i];
    for (const stroke of text(line.left, leftAt, middle, WORKING_SIZE, BLACK)) {
      pieces.push({ stroke, entrance: "write", step: lineStep, part: "line", ...(!ownLine && { endsAt: column - space }) });
    }
    for (const stroke of text(line.right, ownLine ? leftAt + lefts[0] + space : column, middle, WORKING_SIZE, BLACK)) {
      pieces.push({ stroke, entrance: "write", step: lineStep, part: "line" });
    }
    if (line.reason) {
      for (const stroke of text(line.reason, reasonsAt, middle + (WORKING_SIZE - SMALL_SIZE) * 0.1, SMALL_SIZE, BLUE, true)) {
        pieces.push({ stroke, entrance: "write", step: lineStep, part: "reason" });
      }
    }
    // The first line of the answer gets a red line under it, the way a tutor marks the answer.
    if (i === answerFrom) {
      const y = middle + WORKING_SIZE * 0.62;
      const left = leftAt - 0.1 * CM;
      const right = column + textWidth(line.right, WORKING_SIZE) + 0.1 * CM;
      const points: Stroke["points"] = [];
      for (let k = 0; k <= 24; k++) {
        const x = left + ((right - left) * k) / 24;
        // A hand-drawn line isn't ruled, so it rises a hair across its length.
        points.push([x, y - (k / 24) * 0.06 * CM, 0.6]);
      }
      pieces.push({ stroke: makeStroke(points, RED, INK_SIZES.pen.S, "pen"), entrance: "trace", step: step++, part: "underline" });
    }
  });
  const workingBottom = firstMiddle + (working.length - 1) * LINE_PITCH + WORKING_SIZE;

  let right = workingEdge;
  let bottom = workingBottom;
  const graph = problem.graph;
  if (graph) {
    const settings: AxesSettings = { x: graph.x, y: graph.y };
    // The graph is drawn near the left of a Draft sheet first, where the
    // Draft's own code has the room it needs, because that code keeps the
    // axes and every label on one 21 cm sheet. It's then moved across, the
    // way the lasso moves ink, to sit beside the working with its top level
    // with the top of the board. Room is left left of the y-axis for its
    // numbers, and above it for its arrow and its letter.
    const drawnAt: Vec = [snapUp((-graph.x.from + 1.2) * DRAFT_SQUARE), snapUp(MARGIN * 0.5 + (graph.y.to + 0.5) * DRAFT_SQUARE)];
    const originX = snapUp(workingEdge + GRAPH_GAP + -graph.x.from * DRAFT_SQUARE);
    const shift = originX - drawnAt[0];
    const across = (stroke: Stroke) => moved(stroke, shift, 0);

    const axes = axesStrokes(drawnAt, settings);

    // What a key point's coordinates keep clear of, where the graph is drawn.
    const existing = [...axes];
    const unit = unitOf(problem);
    const single = graph.functions.length === 1;
    const inks = [RED, BLUE];
    const curvesStep = step++;
    graph.functions.forEach((latex, n) => {
      const reading = readFunction(latex);
      if (reading.status !== "ready") return;
      const strokes = graphStrokes({
        f: functionOf(latex, unit), label: reading.label, origin: drawnAt, settings,
        ink: { color: inks[n], size: GRAPH_PEN, kind: "pen" }, textSize: SMALL_SIZE,
        keyPoints: single, existing,
      });
      // Two graphs can leave the axes close together, as a line and a parabola
      // both do across the top, which puts their equations on top of each
      // other. The second equation then moves down a line at a time until it's
      // clear, staying beside the end of its own curve and in its colour.
      if (n > 0) {
        const at = strokes.findIndex((stroke) => stroke.kind === "text");
        if (at !== -1) strokes[at] = clearOfText(strokes[at], existing);
      }
      existing.push(...strokes);
      let seenText = false;
      for (const stroke of strokes.map(across)) {
        if (stroke.kind === "text") {
          // The first text is the graph's equation, and any after it are the key points' coordinates.
          pieces.push({ stroke, entrance: "appear", step: seenText ? curvesStep + 2 : curvesStep + 1, part: seenText ? "point" : "label" });
          seenText = true;
        } else if (stroke.points.length === 1) {
          pieces.push({ stroke, entrance: "appear", step: curvesStep + 2, part: "point" });
        } else {
          pieces.push({ stroke, entrance: "trace", step: curvesStep, part: "curve" });
        }
      }
    });

    // Where a pair of graphs meet, marked the way the Draft marks a key point:
    // a dot twice the curve's width, and its coordinates in the clear beside it.
    if (!single) {
      const [f, g] = graph.functions;
      const fx = functionOf(f, unit);
      for (const x of graphMeetings(f, g, problem)) {
        const y = fx(x);
        const at: Vec = [drawnAt[0] + (x / graph.x.perSquare) * DRAFT_SQUARE, drawnAt[1] - (y / graph.y.perSquare) * DRAFT_SQUARE];
        const dot = makeStroke([[at[0], at[1], 0.6]], BLACK, GRAPH_PEN * 2, "pen");
        pieces.push({ stroke: across(dot), entrance: "appear", step: curvesStep + 2, part: "point" });
        const words = `(${writtenNumber(x, graph.x.perSquare, graph.x.degrees)}, ${writtenNumber(y, graph.y.perSquare)})`;
        const label = clearLabel(words, at, existing);
        existing.push(dot, ...label);
        for (const stroke of label) pieces.push({ stroke: across(stroke), entrance: "appear", step: curvesStep + 2, part: "point" });
      }
    }

    // The axes go on last, once it's known where the curves run, so any
    // number a curve runs through can be moved off it first.
    const ink = existing.slice(axes.length);
    for (const stroke of numbersOffCurves(axes, drawnAt, settings, ink)) {
      pieces.push({ stroke: across(stroke), entrance: "appear", step: 0, part: "axes" });
    }

    right = Math.max(right, originX + (graph.x.to + 1.2) * DRAFT_SQUARE);
    bottom = Math.max(bottom, drawnAt[1] + (-graph.y.from + 0.8) * DRAFT_SQUARE);
  }

  // Anything a graph's label pushed further out, such as an equation written past the end of its curve, stays on the board.
  for (const { stroke } of pieces) {
    const box = boundingBox(stroke);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }

  return { box: { left: 0, top: 0, width: snapUp(right + MARGIN), height: snapUp(bottom + MARGIN * 0.6) }, pieces };
}

/**
 * Whether a label's box would land on any of these strokes, keeping `room`
 * clear round it. It's the test lib/plot gives a key point's coordinates: a
 * text stroke is the whole of its box, and a line counts wherever it runs,
 * not only at its points, so the long straight lines of the axes count too.
 */
function touches(box: Box, strokes: Stroke[], room: number): boolean {
  return strokes.some((stroke) => {
    if (boxesApart(box, boundingBox(stroke), room)) return false;
    if (stroke.kind === "text") return true;
    const points = stroke.points;
    if (points.length === 1) return segmentReachesBox(box, points[0], points[0], room + stroke.size / 2);
    for (let i = 1; i < points.length; i++) {
      if (segmentReachesBox(box, points[i - 1], points[i], room + stroke.size / 2)) return true;
    }
    return false;
  });
}

/**
 * The axes' strokes, with any number a curve or a label runs through moved to
 * the nearest place beside its tick that's clear. The Draft writes every
 * number below or left of its axis, centred on its tick, because it can't
 * know where a tutor's curves will go. Here the curves are known, and a sine
 * curve crossing the axis at 180 would run straight through the number.
 *
 * A curve that crosses an axis at a tick runs through both sides of it there,
 * so moving the number across the axis isn't enough on its own. It's slid
 * along the axis too, by up to about half its width, to whichever side the
 * curve leaves clear, which still reads as the number for that tick. It tries
 * the Draft's side first and the smallest slide first. A number with nowhere
 * clear stays where the Draft put it.
 */
function numbersOffCurves(axes: Stroke[], origin: Vec, settings: AxesSettings, ink: Stroke[]): Stroke[] {
  const result = [...axes];
  const room = 0.04 * CM;
  // The strokes come in the order of the axes' parts, a part's lines at a time, which says which strokes make up each number.
  let at = 0;
  for (const part of axesParts(origin, settings)) {
    const from = at;
    at += part.lines.length;
    if (part.role !== "number") continue;
    const own = result.slice(from, at);
    const box = own.map(boundingBox).reduce((a, b) => ({
      left: Math.min(a.left, b.left), right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom),
    }));
    if (!touches(box, ink, room)) continue;
    const others = [...ink, ...result.filter((_, i) => i < from || i >= at)];
    const isX = part.axis === "x";
    // Across the axis is its mirror image in the axis, and along it is a slide of up to half the number's length.
    const across = isX ? 2 * origin[1] - box.top - box.bottom : 2 * origin[0] - box.left - box.right;
    const length = isX ? box.right - box.left : box.bottom - box.top;
    const slides = [0, 0.25, -0.25, 0.4, -0.4, 0.55, -0.55].map((share) => share * length);
    const moves: Vec[] = [];
    for (const slide of slides) {
      for (const over of [0, across]) moves.push(isX ? [slide, over] : [over, slide]);
    }
    const clear = moves.find(([dx, dy]) =>
      !touches({ left: box.left + dx, right: box.right + dx, top: box.top + dy, bottom: box.bottom + dy }, others, room));
    if (!clear) continue;
    for (let i = from; i < at; i++) result[i] = moved(axes[i], clear[0], clear[1]);
  }
  return result;
}

/** A graph's equation moved down a line at a time, up to three, until it's clear of the other text on the board. */
function clearOfText(label: Stroke, existing: Stroke[]): Stroke {
  const texts = existing.filter((stroke) => stroke.kind === "text");
  const { top, bottom } = boundingBox(label);
  for (let lines = 0; lines <= 3; lines++) {
    const candidate = moved(label, 0, lines * (bottom - top) * 1.1);
    if (!touches(boundingBox(candidate), texts, 0.05 * CM)) return candidate;
  }
  return label;
}

/**
 * The coordinates beside a point where two graphs meet, in the first of the
 * four corners round the dot that's clear of the curves, the axes and the
 * other labels, one line further out each time round, as the Draft places a
 * key point's. Where nothing is clear, they go above and to the right.
 */
function clearLabel(words: string, [px, py]: Vec, existing: Stroke[]): Stroke[] {
  const width = textWidth(words, SMALL_SIZE);
  const height = SMALL_SIZE * 1.25;
  const gap = 0.12 * CM;
  const corners = [[1, -1], [-1, -1], [1, 1], [-1, 1]] as const;
  for (let out = 0; out < 6; out++) {
    for (const [sx, sy] of corners) {
      const left = sx > 0 ? px + gap : px - gap - width;
      const top = sy < 0 ? py - gap - height - out * height : py + gap + out * height;
      const box = { left, right: left + width, top, bottom: top + height };
      if (box.left < 0 || box.right > DRAFT_SHEET.width || box.top < 0) continue;
      if (!touches(box, existing, 0.05 * CM)) return text(words, left, top + height / 2, SMALL_SIZE, BLACK);
    }
  }
  return text(words, px + gap, py - gap - height / 2, SMALL_SIZE, BLACK);
}
