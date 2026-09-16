import { describe, it, expect } from "vitest";
import { MOST_POINTS, curveLines, graphStrokes } from "./plot";
import { DEFAULT_AXES, axesFrame, axesStrokes, fromPage, withDegrees, type AxesSettings } from "./axes";
import { DRAFT_SHEET, DRAFT_SQUARE } from "./draft-sheets";
import { evaluate, readFunction, type AngleUnit } from "./plot-expression";
import { CM } from "./drawing-guide";
import { isText, kindOf, type Stroke } from "@/hooks/useAnnotations";
import type { Vec } from "./stroke-select";

const SQ = DRAFT_SQUARE;
// A corner of the squares near the middle of the sheet, 10 squares across and 14 down.
const MIDDLE: Vec = [10 * SQ, 14 * SQ];

const fn = (latex: string, unit: AngleUnit = "radians") => {
  const reading = readFunction(latex);
  if (reading.status !== "ready") throw new Error(`${latex} was ${reading.status}`);
  return (x: number) => evaluate(reading.expression, x, unit);
};

/** A point on the page back in the axes' own numbers. */
const onGraph = (point: Vec, origin: Vec = MIDDLE, settings: AxesSettings = DEFAULT_AXES): Vec =>
  fromPage(axesFrame(origin, settings), point);

const linesOf = (latex: string, origin: Vec = MIDDLE, settings: AxesSettings = DEFAULT_AXES, unit: AngleUnit = "radians") =>
  curveLines(fn(latex, unit), origin, settings).map((line) => line.map((point) => onGraph(point, origin, settings)));

// 0° to 360° at 30° a square, crossing 4 squares in from the left so all of it fits.
const DEGREES: AxesSettings = { x: { ...withDegrees(DEFAULT_AXES.x, true), from: 0, to: 12 }, y: DEFAULT_AXES.y };
const LEFT: Vec = [4 * SQ, 14 * SQ];

const INK = { color: "#2563eb", size: 3, kind: "pen" as const };
const TEXT_SIZE = 0.7 * CM;

/** The strokes for the graph of a function, on axes crossing in the middle of the sheet unless another crossing is given. */
const graph = (
  latex: string,
  { settings = DEFAULT_AXES, origin = MIDDLE, keyPoints = false, existing = [] }:
    { settings?: AxesSettings; origin?: Vec; keyPoints?: boolean; existing?: Stroke[] } = {},
) => {
  const reading = readFunction(latex);
  if (reading.status !== "ready") throw new Error(latex);
  return graphStrokes({
    f: (x) => evaluate(reading.expression, x, "radians"), label: reading.label, origin,
    settings, ink: INK, textSize: TEXT_SIZE, keyPoints, existing,
  });
};

describe("the curve", () => {
  it("draws x² as one piece that stops at the top of the y axis", () => {
    const lines = linesOf("x^2");
    expect(lines).toHaveLength(1);
    const [first, last] = [lines[0][0], lines[0].at(-1)!];
    expect(first[0]).toBeCloseTo(-Math.sqrt(5), 3);
    expect(first[1]).toBeCloseTo(5, 6);
    expect(last[0]).toBeCloseTo(Math.sqrt(5), 3);
    expect(last[1]).toBeCloseTo(5, 6);
  });

  it("breaks 1/x into two pieces at 0, each reaching the ends of the y axis", () => {
    const lines = linesOf("\\frac{1}{x}");
    expect(lines).toHaveLength(2);
    expect(lines[0].at(-1)![1]).toBeCloseTo(-5, 6);
    expect(lines[1][0][1]).toBeCloseTo(5, 6);
  });

  it("draws tan x from 0° to 360° in three pieces", () => {
    expect(linesOf("\\tan x", LEFT, DEGREES, "degrees")).toHaveLength(3);
  });

  it("starts √x at 0, where it starts to have values", () => {
    const [line] = linesOf("\\sqrt{x}");
    expect(line[0][0]).toBeCloseTo(0, 6);
    expect(line[0][1]).toBeCloseTo(0, 3);
  });

  it("keeps the corner of |x|", () => {
    const [line] = linesOf("|x|");
    expect(line.some(([x, y]) => Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9)).toBe(true);
  });

  it("keeps every point within the axes and on the sheet", () => {
    const check = (latex: string, origin: Vec, settings: AxesSettings, unit: AngleUnit = "radians") => {
      const [xFrom, xTo] = [settings.x.from * settings.x.perSquare, settings.x.to * settings.x.perSquare];
      const [yFrom, yTo] = [settings.y.from * settings.y.perSquare, settings.y.to * settings.y.perSquare];
      for (const line of curveLines(fn(latex, unit), origin, settings)) {
        for (const point of line) {
          const [x, y] = onGraph(point, origin, settings);
          expect(x).toBeGreaterThanOrEqual(xFrom - 1e-9);
          expect(x).toBeLessThanOrEqual(xTo + 1e-9);
          expect(y).toBeGreaterThanOrEqual(yFrom - 1e-9);
          expect(y).toBeLessThanOrEqual(yTo + 1e-9);
          expect(point[0]).toBeGreaterThanOrEqual(0);
          expect(point[0]).toBeLessThanOrEqual(DRAFT_SHEET.width);
          expect(point[1]).toBeGreaterThanOrEqual(0);
          expect(point[1]).toBeLessThanOrEqual(DRAFT_SHEET.height);
        }
      }
    };
    check("\\tan x", LEFT, DEGREES, "degrees");
    check("x^{10}", MIDDLE, DEFAULT_AXES);
    check("\\frac{1}{x}", MIDDLE, { ...DEFAULT_AXES, y: { ...DEFAULT_AXES.y, perSquare: 100 } });
    check("\\sin 3x", MIDDLE, DEFAULT_AXES);
  });

  it("stops where the sheet cut the x axis short", () => {
    // Crossing 17 squares across leaves room for three and a half squares, and the curve stops half a square short of the arrow.
    const origin: Vec = [17 * SQ, 14 * SQ];
    const [line] = linesOf("0", origin);
    // The sheet is a shade over 21 squares across, so it's a shade over 3.
    expect(line.at(-1)![0]).toBeCloseTo(3, 3);
  });

  it("spaces the points no more than 0.05 cm apart", () => {
    const [line] = curveLines(fn("x"), MIDDLE, DEFAULT_AXES);
    for (let i = 1; i < line.length; i++) {
      expect(Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])).toBeLessThanOrEqual(0.05 * CM + 1e-9);
    }
  });

  it("lifts where a function jumps within the y axis", () => {
    // At 100 a square, 1/x is within the y axis on both sides of 0, and jumps between them.
    const tall: AxesSettings = { ...DEFAULT_AXES, y: { ...DEFAULT_AXES.y, perSquare: 100 } };
    expect(linesOf("\\frac{1}{x}", MIDDLE, tall)).toHaveLength(2);
  });

  it("draws nothing for a function with no values on the axes", () => {
    expect(linesOf("\\ln\\left(-x^{2}-1\\right)")).toEqual([]);
  });
});

describe("the graph's strokes", () => {
  it("draws the curve in the picked ink at one even pressure, with its equation just above the end of it", () => {
    const strokes = graph("x^2-2x-3");
    const curve = strokes.filter((s) => !isText(s));
    const label = strokes.at(-1)!;
    expect(curve).toHaveLength(1);
    expect(curve.every((s) => kindOf(s) === "pen" && s.color === INK.color && s.size === INK.size)).toBe(true);
    expect(curve[0].points.every(([, , p]) => p === 0.6)).toBe(true);

    expect(isText(label)).toBe(true);
    expect(label.text).toBe("𝑦 = 𝑥² − 2𝑥 − 3");
    expect(label.color).toBe(INK.color);
    // The curve ends at (4, 5), and the equation starts just right of that and sits just above it.
    const [endX, endY] = curve[0].points.at(-1)!;
    const [[left, top], [, bottom]] = label.points;
    expect(left).toBeGreaterThan(endX);
    expect(bottom).toBeLessThan(endY);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  it("splits a piece of curve with more than 2,000 points, each piece starting where the last ends", () => {
    const curve = graph("\\sin 200x").filter((s) => !isText(s));
    expect(curve.length).toBeGreaterThan(1);
    expect(curve.every((s) => s.points.length <= MOST_POINTS)).toBe(true);
    for (let i = 1; i < curve.length; i++) expect(curve[i].points[0]).toEqual(curve[i - 1].points.at(-1));
  });

  it("is nothing at all, without its equation, when the curve misses the axes", () => {
    expect(graph("x+100")).toEqual([]);
  });
});

describe("the key points on a graph", () => {
  /** The same graph, with its key points marked. */
  const marked = (latex: string, existing: Stroke[] = []) => graph(latex, { keyPoints: true, existing });
  /** The dots, which are the strokes of one point each. */
  const dotsOf = (strokes: Stroke[]) => strokes.filter((s) => !isText(s) && s.points.length === 1);
  const textsOf = (strokes: Stroke[]) => strokes.filter((s) => isText(s));
  /** Where a piece of text sits, as its box, since its two points are the corners of it. */
  const boxAround = (s: Stroke) =>
    ({ left: s.points[0][0], top: s.points[0][1], right: s.points[1][0], bottom: s.points[1][1] });
  /** Where the label saying these words sits. */
  const boxOf = (strokes: Stroke[], text: string) => {
    const label = textsOf(strokes).find((s) => s.text === text);
    if (!label) throw new Error(`no label ${text} among ${textsOf(strokes).map((s) => s.text).join(", ")}`);
    return boxAround(label);
  };

  it("draws a dot twice as wide as the curve at each key point, with its coordinates after the equation", () => {
    const strokes = marked("x^2-2x-3");
    const dots = dotsOf(strokes);
    expect(dots).toHaveLength(4);
    expect(dots.every((s) => s.size === INK.size * 2 && s.color === INK.color && kindOf(s) === "pen")).toBe(true);
    expect(textsOf(strokes).map((s) => s.text))
      .toEqual(["𝑦 = 𝑥² − 2𝑥 − 3", "(−1, 0)", "(0, −3)", "(1, −4)", "(3, 0)"]);
    // The bottom of the curve is at (1, −4), a square right of the crossing and four squares down.
    const bottom = dots.find((s) => Math.abs(s.points[0][0] - 11 * SQ) < 1e-6);
    expect(bottom!.points[0][1]).toBeCloseTo(18 * SQ, 6);
  });

  it("draws the curve and its equation and nothing else with the box unticked", () => {
    const strokes = graph("x^2-2x-3");
    expect(dotsOf(strokes)).toHaveLength(0);
    expect(textsOf(strokes).map((s) => s.text)).toEqual(["𝑦 = 𝑥² − 2𝑥 − 3"]);
  });

  it("writes a bottom's coordinates below it and a top's above it, where the curve isn't", () => {
    const bottom = marked("x^2");
    expect(boxOf(bottom, "(0, 0)").top).toBeGreaterThan(14 * SQ);
    const top = marked("-x^2");
    expect(boxOf(top, "(0, 0)").bottom).toBeLessThan(14 * SQ);
  });

  it("writes a crossing's coordinates above the axis, on the side the curve isn't", () => {
    // y = x² − 9 crosses at −3 and at 3, far enough apart that neither label is in the other's way.
    const strokes = marked("x^2-9");
    // The curve falls through (−3, 0), so the coordinates go above it and to the right.
    const falling = boxOf(strokes, "(−3, 0)");
    expect(falling.left).toBeGreaterThan(7 * SQ);
    expect(falling.bottom).toBeLessThan(14 * SQ);
    // It rises through (3, 0), so they go above it and to the left.
    const rising = boxOf(strokes, "(3, 0)");
    expect(rising.right).toBeLessThan(13 * SQ);
    expect(rising.bottom).toBeLessThan(14 * SQ);
  });

  it("moves a label off the ink that's already on the sheet", () => {
    // The bottom of y = x² is at the crossing, and its coordinates would go below and to the right of it.
    const clear = boxOf(marked("x^2"), "(0, 0)");
    expect(clear.left).toBeGreaterThan(10 * SQ);
    // A stroke lying across that spot sends them to the other side.
    const inTheWay: Stroke = { points: [[10 * SQ + 2, 14 * SQ + 2, 0.5], [10 * SQ + 120, 14 * SQ + 40, 0.5]], color: "#000", size: 3 };
    expect(boxOf(marked("x^2", [inTheWay]), "(0, 0)").right).toBeLessThan(10 * SQ);
  });

  /** Every pair of labels sharing any space at all, as their words. */
  const clashes = (strokes: Stroke[]) => {
    const boxes = textsOf(strokes).map((s) => ({ text: s.text!, ...boxAround(s) }));
    const found: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const clear = b.left >= a.right || a.left >= b.right || b.top >= a.bottom || a.top >= b.bottom;
        if (!clear) found.push(`${a.text} on ${b.text}`);
      }
    }
    return found;
  };

  it("keeps every label on the sheet and clear of the others", () => {
    const strokes = marked("\\sin 3x");
    const boxes = textsOf(strokes).map(boxAround);
    expect(boxes.length).toBeGreaterThan(15);
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(DRAFT_SHEET.width);
      expect(box.bottom).toBeLessThanOrEqual(DRAFT_SHEET.height);
    }
    expect(clashes(strokes)).toEqual([]);
  });

  // The axes are ordinary ink on the sheet before the graph goes on, and their
  // numbers sit in a band under the x axis, right where a crossing's
  // coordinates would like to go. Without them on the sheet, none of this bites.
  describe("on a sheet that already has its axes drawn", () => {
    const WIDE: AxesSettings = { x: { ...DEFAULT_AXES.x, from: -5, to: 10 }, y: DEFAULT_AXES.y };
    const CROSSING: Vec = [6 * SQ, 14 * SQ];
    const onAxes = (latex: string, settings = WIDE, origin = CROSSING) =>
      graph(latex, { settings, origin, keyPoints: true, existing: axesStrokes(origin, settings) });

    it("stacks the coordinates of two roots too close together to sit side by side", () => {
      // y = (1/3)(x − 4)² − 1 crosses at 2.27 and 5.73. The gap between them is
      // 3.46 cm and the two labels are wider than that together, so one goes above the other.
      const strokes = onAxes("\\frac{1}{3}\\left(x-4\\right)^2-1");
      const first = boxOf(strokes, "(2.27, 0)");
      const second = boxOf(strokes, "(5.73, 0)");
      expect(clashes(strokes)).toEqual([]);
      // Both stay in the clear space above the axis, one a line higher than the other.
      expect(second.bottom).toBeLessThanOrEqual(first.top);
      expect(first.bottom).toBeLessThan(14 * SQ);
    });

    it("keeps the labels off each other on a busy curve too", () => {
      expect(clashes(onAxes("\\sin 3x", DEFAULT_AXES, MIDDLE))).toEqual([]);
      expect(clashes(onAxes("x^2-2x-3", DEFAULT_AXES, MIDDLE))).toEqual([]);
    });
  });
});
