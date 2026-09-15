import { describe, it, expect } from "vitest";
import { MOST_POINTS, curveLines, graphStrokes } from "./plot";
import { DEFAULT_AXES, withDegrees, type AxesSettings } from "./axes";
import { DRAFT_SHEET, DRAFT_SQUARE } from "./draft-sheets";
import { evaluate, readFunction, type AngleUnit } from "./plot-expression";
import { CM } from "./drawing-guide";
import { isText, kindOf } from "@/hooks/useAnnotations";
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
const onGraph = ([px, py]: Vec, origin: Vec = MIDDLE, settings: AxesSettings = DEFAULT_AXES): Vec =>
  [((px - origin[0]) / SQ) * settings.x.perSquare, ((origin[1] - py) / SQ) * settings.y.perSquare];

const linesOf = (latex: string, origin: Vec = MIDDLE, settings: AxesSettings = DEFAULT_AXES, unit: AngleUnit = "radians") =>
  curveLines(fn(latex, unit), origin, settings).map((line) => line.map((point) => onGraph(point, origin, settings)));

// 0° to 360° at 30° a square, crossing 4 squares in from the left so all of it fits.
const DEGREES: AxesSettings = { x: { ...withDegrees(DEFAULT_AXES.x, true), from: 0, to: 12 }, y: DEFAULT_AXES.y };
const LEFT: Vec = [4 * SQ, 14 * SQ];

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
  const ink = { color: "#2563eb", size: 3, kind: "pen" as const };
  const graph = (latex: string, settings: AxesSettings = DEFAULT_AXES) => {
    const reading = readFunction(latex);
    if (reading.status !== "ready") throw new Error(latex);
    return graphStrokes({
      f: (x) => evaluate(reading.expression, x, "radians"), label: reading.label, origin: MIDDLE, settings, ink, textSize: 0.7 * CM,
    });
  };

  it("draws the curve in the picked ink at one even pressure, with its equation just above the end of it", () => {
    const strokes = graph("x^2-2x-3");
    const curve = strokes.filter((s) => !isText(s));
    const label = strokes.at(-1)!;
    expect(curve).toHaveLength(1);
    expect(curve.every((s) => kindOf(s) === "pen" && s.color === ink.color && s.size === ink.size)).toBe(true);
    expect(curve[0].points.every(([, , p]) => p === 0.6)).toBe(true);

    expect(isText(label)).toBe(true);
    expect(label.text).toBe("𝑦 = 𝑥² − 2𝑥 − 3");
    expect(label.color).toBe(ink.color);
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
