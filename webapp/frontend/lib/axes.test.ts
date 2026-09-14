import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_AXES, axesOrigin, axesParts, axesStrokes, axisNumber, nearestPerSquare, readAxesSettings, saveAxesSettings,
  stepPerSquare, withEnd, type AxesPart, type AxesSettings, type AxisName,
} from "./axes";
import { DRAFT_SHEET, DRAFT_SQUARE } from "./draft-sheets";
import { kindOf } from "@/hooks/useAnnotations";
import type { Vec } from "./stroke-select";

beforeEach(() => localStorage.clear());

const SQ = DRAFT_SQUARE;
// A corner of the squares near the middle of the sheet, 10 squares across and 14 down.
const MIDDLE: Vec = [10 * SQ, 14 * SQ];

const partsAt = (origin: Vec, settings: AxesSettings = DEFAULT_AXES) => axesParts(origin, settings);
const ofRole = (parts: AxesPart[], role: AxesPart["role"], axis?: AxisName) =>
  parts.filter((p) => p.role === role && (axis === undefined || p.axis === axis));
const squares = (parts: AxesPart[], role: AxesPart["role"], axis: AxisName) => ofRole(parts, role, axis).map((p) => p.square);
const texts = (parts: AxesPart[], role: AxesPart["role"], axis: AxisName) => ofRole(parts, role, axis).map((p) => p.text);
const axisLine = (parts: AxesPart[], axis: AxisName) => ofRole(parts, "axis", axis)[0].lines[0];

const withAxis = (axis: AxisName, change: Partial<AxesSettings["x"]>): AxesSettings =>
  ({ ...DEFAULT_AXES, [axis]: { ...DEFAULT_AXES[axis], ...change } });

describe("the axes' settings", () => {
  it("comes back with the usual settings when nothing is stored, or what's stored is broken", () => {
    expect(readAxesSettings()).toEqual(DEFAULT_AXES);
    localStorage.setItem("csm_draft_axes", "not json");
    expect(readAxesSettings()).toEqual(DEFAULT_AXES);
  });

  it("keeps each stored setting that's valid, and puts back the default for each one that isn't", () => {
    localStorage.setItem("csm_draft_axes", JSON.stringify({
      x: { from: 3, to: 99, perSquare: 3, numbers: 4 },
      y: { from: -2, to: 4, perSquare: 0.5, numbers: 2 },
    }));
    expect(readAxesSettings()).toEqual({ x: DEFAULT_AXES.x, y: { from: -2, to: 4, perSquare: 0.5, numbers: 2 } });

    // Each end is fine by itself, but together they make an x axis 30 squares long.
    localStorage.setItem("csm_draft_axes", JSON.stringify({ x: { from: -15, to: 15, perSquare: 1, numbers: 1 } }));
    expect(readAxesSettings().x).toEqual(DEFAULT_AXES.x);
  });

  it("remembers what it's given", () => {
    const settings = withAxis("y", { from: 0, to: 12, perSquare: 5, numbers: 2 });
    saveAxesSettings(settings);
    expect(readAxesSettings()).toEqual(settings);
  });

  it("keeps 0 on every axis, and keeps each axis short enough for the sheet", () => {
    expect(withEnd("x", DEFAULT_AXES.x, "from", 3).from).toBe(0);
    expect(withEnd("x", DEFAULT_AXES.x, "to", -2).to).toBe(1);
    // From −5, the x axis can reach 15 at most, which is 20 squares.
    expect(withEnd("x", DEFAULT_AXES.x, "to", 30).to).toBe(15);
    expect(withEnd("y", DEFAULT_AXES.y, "to", 30).to).toBe(23);
  });

  it("rounds an end to a whole number of squares", () => {
    // −2.4 typed at 0.2 a square is twelve squares back, however the division comes out in binary.
    expect(withEnd("x", { ...DEFAULT_AXES.x, perSquare: 0.2 }, "from", -2.4 / 0.2).from).toBe(-12);
    expect(withEnd("x", DEFAULT_AXES.x, "to", 3.4).to).toBe(3);
  });

  it("steps through the values a square can stand for, and takes the nearest one to a typed value", () => {
    expect(stepPerSquare(1, 1)).toBe(2);
    expect(stepPerSquare(0.5, -1)).toBe(0.2);
    expect(stepPerSquare(100, 1)).toBe(100);
    expect(stepPerSquare(0.1, -1)).toBe(0.1);
    expect(nearestPerSquare(3)).toBe(2);
    expect(nearestPerSquare(4)).toBe(5);
    expect(nearestPerSquare(0.25)).toBe(0.2);
    expect(nearestPerSquare(0)).toBeNull();
    expect(nearestPerSquare(Number.NaN)).toBeNull();
  });

  it("writes numbers without the noise of binary fractions", () => {
    expect(axisNumber(3, 0.1)).toBe("0.3");
    expect(axisNumber(7, 0.2)).toBe("1.4");
    expect(axisNumber(-5, 0.5)).toBe("-2.5");
    expect(axisNumber(4, 0.5)).toBe("2");
    expect(axisNumber(3, 100)).toBe("300");
  });
});

describe("where the axes cross", () => {
  it("is the nearest corner of the squares on squared paper, and exactly where the finger is on blank paper", () => {
    const [x, y] = axesOrigin([3.4 * SQ, 7.6 * SQ], true);
    expect(x).toBeCloseTo(3 * SQ);
    expect(y).toBeCloseTo(8 * SQ);
    expect(axesOrigin([3.4 * SQ, 7.6 * SQ], false)).toEqual([3.4 * SQ, 7.6 * SQ]);
  });

  it("stays on a corner that's on the sheet, however far out the finger is", () => {
    const [x, y] = axesOrigin([DRAFT_SHEET.width + 30, DRAFT_SHEET.height], true);
    expect(x).toBeCloseTo(21 * SQ);
    expect(y).toBeCloseTo(29 * SQ);
  });
});

describe("the ink for a pair of axes", () => {
  it("puts a tick at every square of each axis's range, except at the origin", () => {
    const parts = partsAt(MIDDLE);
    expect(squares(parts, "tick", "x")).toEqual([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
    expect(squares(parts, "tick", "y")).toEqual([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
  });

  it("puts the ticks on the lines of the squares", () => {
    const tick = ofRole(partsAt(MIDDLE), "tick", "x").find((p) => p.square === 3)!;
    expect(tick.lines[0][0][0]).toBeCloseTo(13 * SQ);
    const up = ofRole(partsAt(MIDDLE), "tick", "y").find((p) => p.square === 2)!;
    // Up the graph is up the page.
    expect(up.lines[0][0][1]).toBeCloseTo(12 * SQ);
  });

  it("runs each axis to half a square past its last square, where its arrow is", () => {
    const [start, tip] = axisLine(partsAt(MIDDLE), "x");
    expect(start[0]).toBeCloseTo(5 * SQ);
    expect(tip[0]).toBeCloseTo(15.5 * SQ);
    const arrow = ofRole(partsAt(MIDDLE), "arrow", "x")[0].lines[0];
    expect(arrow).toHaveLength(3);
    expect(arrow[1][0]).toBeCloseTo(15.5 * SQ);
  });

  it("keeps the axis the same length when a square is worth more, and changes its numbers", () => {
    const doubled = partsAt(MIDDLE, withAxis("x", { perSquare: 2 }));
    const [start, tip] = axisLine(doubled, "x");
    expect(start[0]).toBeCloseTo(5 * SQ);
    expect(tip[0]).toBeCloseTo(15.5 * SQ);
    expect(texts(doubled, "number", "x")).toEqual(["-10", "-8", "-6", "-4", "-2", "2", "4", "6", "8", "10"]);
  });

  it("numbers each axis on its own setting", () => {
    const parts = partsAt(MIDDLE, { x: DEFAULT_AXES.x, y: { ...DEFAULT_AXES.y, numbers: 2 } });
    expect(squares(parts, "number", "x")).toEqual([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
    expect(squares(parts, "number", "y")).toEqual([-4, -2, 2, 4]);
    // The ticks stay on every square.
    expect(squares(parts, "tick", "y")).toHaveLength(10);

    expect(ofRole(partsAt(MIDDLE, withAxis("x", { numbers: 0 })), "number", "x")).toHaveLength(0);
  });

  it("hangs a negative number's minus sign to the left on the x axis, so its digits sit centred under the tick", () => {
    const parts = partsAt(MIDDLE);
    const centreOf = (lines: Vec[][]) => {
      const xs = lines.flat().map(([x]) => x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    const minusTwo = ofRole(parts, "number", "x").find((p) => p.square === -2)!;
    expect(minusTwo.text).toBe("-2");
    // The first line is the minus sign, and the rest is the 2.
    expect(centreOf(minusTwo.lines.slice(1))).toBeCloseTo(8 * SQ);
    const two = ofRole(parts, "number", "x").find((p) => p.square === 2)!;
    expect(centreOf(two.lines)).toBeCloseTo(12 * SQ);
  });

  it("writes a single 0 at the origin and none at either axis's ticks", () => {
    const parts = partsAt(MIDDLE);
    expect(ofRole(parts, "origin")).toHaveLength(1);
    expect(ofRole(parts, "number").filter((p) => p.text === "0")).toHaveLength(0);
    // It sits below and to the left of the crossing.
    const points = ofRole(parts, "origin")[0].lines.flat();
    expect(Math.max(...points.map(([x]) => x))).toBeLessThan(MIDDLE[0]);
    expect(Math.min(...points.map(([, y]) => y))).toBeGreaterThan(MIDDLE[1]);
  });

  it("leaves off the 0, and the y axis's numbers, when the axes cross right at the sheet's left edge", () => {
    const parts = partsAt([0, 14 * SQ]);
    expect(ofRole(parts, "origin")).toHaveLength(0);
    expect(ofRole(parts, "number", "y")).toHaveLength(0);
    // Nothing is left behind the origin on the x axis, and its numbers ahead of it are all there.
    expect(squares(parts, "number", "x")).toEqual([1, 2, 3, 4, 5]);
  });

  it("writes no 0 when neither axis has numbers", () => {
    const bare = partsAt(MIDDLE, { x: { ...DEFAULT_AXES.x, numbers: 0 }, y: { ...DEFAULT_AXES.y, numbers: 0 } });
    expect(ofRole(bare, "origin")).toHaveLength(0);
  });

  it("stops an axis half a square short of the sheet's edge, with its arrow there and nothing beyond it", () => {
    // Crossing 17 squares across leaves room for three and a half squares to the right.
    const parts = partsAt([17 * SQ, 14 * SQ]);
    const [, tip] = axisLine(parts, "x");
    expect(tip[0]).toBeCloseTo(DRAFT_SHEET.width - SQ / 2);
    expect(ofRole(parts, "arrow", "x")[0].lines[0][1][0]).toBeCloseTo(DRAFT_SHEET.width - SQ / 2);
    expect(squares(parts, "tick", "x")).toEqual([-5, -4, -3, -2, -1, 1, 2, 3]);
    expect(squares(parts, "number", "x")).toEqual([-5, -4, -3, -2, -1, 1, 2, 3]);

    // Two squares from the top leaves room for one tick up the y axis.
    const high = partsAt([10 * SQ, 2 * SQ]);
    expect(axisLine(high, "y")[1][1]).toBeCloseTo(SQ / 2);
    expect(squares(high, "tick", "y")).toEqual([-5, -4, -3, -2, -1, 1]);
  });

  it("draws the axis lines in grey pencil, and every mark on them in scale ink", () => {
    const strokes = axesStrokes(MIDDLE, DEFAULT_AXES);
    const lines = strokes.filter((s) => kindOf(s) === "pencil");
    expect(lines).toHaveLength(2);
    expect(lines.every((s) => s.points.length === 2 && s.size === 4)).toBe(true);
    expect(strokes.filter((s) => kindOf(s) !== "pencil").every((s) => kindOf(s) === "scale")).toBe(true);
    expect(new Set(strokes.map((s) => s.color))).toEqual(new Set(["#6b7280"]));
  });
});
