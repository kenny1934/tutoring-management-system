import { describe, it, expect } from "vitest";
import { keyPoints, writtenNumber } from "./key-points";
import { curveLines } from "./plot";
import { DEFAULT_AXES, axesFrame, withDegrees, type AxesSettings } from "./axes";
import { DRAFT_SQUARE } from "./draft-sheets";
import { evaluate, readFunction, type AngleUnit } from "./plot-expression";
import type { Vec } from "./stroke-select";

const SQ = DRAFT_SQUARE;
// A corner of the squares near the middle of the sheet, 10 squares across and 14 down.
const MIDDLE: Vec = [10 * SQ, 14 * SQ];
// 0° to 360° at 30° a square, crossing 4 squares in from the left so all of it fits.
const DEGREES: AxesSettings = { x: { ...withDegrees(DEFAULT_AXES.x, true), from: 0, to: 12 }, y: DEFAULT_AXES.y };
const LEFT: Vec = [4 * SQ, 14 * SQ];

const fn = (latex: string, unit: AngleUnit = "radians") => {
  const reading = readFunction(latex);
  if (reading.status !== "ready") throw new Error(`${latex} was ${reading.status}`);
  return (x: number) => evaluate(reading.expression, x, unit);
};

const pointsOf = (latex: string, origin: Vec = MIDDLE, settings: AxesSettings = DEFAULT_AXES, unit: AngleUnit = "radians") => {
  const f = fn(latex, unit);
  return keyPoints(curveLines(f, origin, settings), f, axesFrame(origin, settings), settings);
};
const textsOf = (...args: Parameters<typeof pointsOf>) => pointsOf(...args).map((point) => point.text);

describe("writing a coordinate", () => {
  it("writes three significant figures, dropping trailing zeros, with a proper minus sign", () => {
    expect(writtenNumber(Math.SQRT2, 1)).toBe("1.41");
    expect(writtenNumber(12.345, 1)).toBe("12.3");
    expect(writtenNumber(3, 1)).toBe("3");
    expect(writtenNumber(-0.5, 1)).toBe("−0.5");
    expect(writtenNumber(-1234.5, 1)).toBe("−1230");
  });

  it("writes a value far too small to see as 0, and puts a degree sign on an axis in degrees", () => {
    expect(writtenNumber(3e-9, 1)).toBe("0");
    expect(writtenNumber(-3e-9, 1)).toBe("0");
    expect(writtenNumber(90, 30, true)).toBe("90°");
  });
});

describe("the key points of a graph", () => {
  it("finds where a quadratic crosses both axes and where it turns", () => {
    expect(textsOf("x^2-2x-3")).toEqual(["(−1, 0)", "(0, −3)", "(1, −4)", "(3, 0)"]);
  });

  it("says which way the curve goes through each crossing, and what each turn is", () => {
    const points = pointsOf("x^2-2x-3");
    expect(points.map((point) => point.kind)).toEqual(["crossing", "y-intercept", "bottom", "crossing"]);
    // The curve is on its way down through −1 and on its way back up through 3.
    expect(points[0].rising).toBe(false);
    expect(points[3].rising).toBe(true);
  });

  it("marks a curve that touches the x axis and turns back with one point, not two", () => {
    expect(textsOf("\\left(x-1\\right)^2")).toEqual(["(0, 1)", "(1, 0)"]);
    expect(pointsOf("\\left(x-1\\right)^2")[1].kind).toBe("bottom");
  });

  it("finds the corner of |x|, and marks it once", () => {
    expect(textsOf("|x|")).toEqual(["(0, 0)"]);
  });

  it("rounds a crossing that isn't a whole number to three significant figures", () => {
    expect(textsOf("x^2-2")).toEqual(["(−1.41, 0)", "(0, −2)", "(1.41, 0)"]);
  });

  it("marks where a curve keeps going through the axis without turning", () => {
    expect(textsOf("x^3")).toEqual(["(0, 0)"]);
  });

  it("finds the tops, the bottoms and the crossings of sin x from 0° to 360°", () => {
    expect(textsOf("\\sin x", LEFT, DEGREES, "degrees"))
      .toEqual(["(0°, 0)", "(90°, 1)", "(180°, 0)", "(270°, −1)", "(360°, 0)"]);
  });

  it("finds no point across a break, where the function jumps", () => {
    // 1/x has neither a crossing nor a y-intercept at 0, where it breaks.
    expect(textsOf("\\frac{1}{x}")).toEqual([]);
    // tan x crosses the axis at 0°, 180° and 360°, and nothing is found at 90° or 270°, where it jumps.
    expect(textsOf("\\tan x", LEFT, DEGREES, "degrees")).toEqual(["(0°, 0)", "(180°, 0)", "(360°, 0)"]);
  });

  it("finds no turning point on a flat line, and no crossing along the x axis", () => {
    expect(textsOf("3")).toEqual(["(0, 3)"]);
    expect(textsOf("0")).toEqual(["(0, 0)"]);
  });

  it("marks every point of a busy curve, since the tutor can turn the whole thing off", () => {
    // sin 3x turns and crosses about seven times each way across ten squares.
    expect(textsOf("\\sin 3x").length).toBeGreaterThan(15);
  });

  it("finds nothing at all when no part of the curve is on the axes", () => {
    expect(textsOf("x+100")).toEqual([]);
  });
});
