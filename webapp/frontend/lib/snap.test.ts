import { describe, it, expect } from "vitest";
import { crossing, gridCorner, snapOnPage, snapPoint } from "./snap";
import type { Stroke } from "@/hooks/useAnnotations";

const line = (points: [number, number][], kind?: Stroke["kind"]): Stroke => ({
  points: points.map(([x, y]) => [x, y, 0.5]),
  color: "#000000",
  size: 3,
  ...(kind ? { kind } : {}),
});

describe("crossing", () => {
  it("finds where two segments cross, and nothing for segments that miss or run side by side", () => {
    expect(crossing([0, 0], [10, 10], [0, 10], [10, 0])).toEqual([5, 5]);
    expect(crossing([0, 0], [4, 4], [0, 10], [10, 0])).toBeNull();
    expect(crossing([0, 0], [10, 0], [0, 5], [10, 5])).toBeNull();
  });
});

describe("snapPoint", () => {
  // Two lines crossing at (50, 50), well away from either line's ends.
  const cross = [line([[0, 0], [100, 100]]), line([[0, 100], [100, 0]])];

  it("snaps onto where two lines cross", () => {
    expect(snapPoint(cross, [53, 48], 5)).toEqual([50, 50]);
  });

  it("snaps onto the end of a line, and onto a dot", () => {
    expect(snapPoint([line([[10, 10], [60, 10]])], [62, 12], 5)).toEqual([60, 10]);
    expect(snapPoint([line([[30, 30]])], [31, 29], 5)).toEqual([30, 30]);
  });

  it("takes the nearest point when several are in reach", () => {
    expect(snapPoint([...cross, line([[54, 50]])], [53, 50], 5)).toEqual([54, 50]);
  });

  it("snaps to pencil construction lines the same as pen lines", () => {
    const inPen = snapPoint(cross, [53, 48], 5);
    expect(inPen).not.toBeNull();
    expect(snapPoint(cross.map((s) => ({ ...s, kind: "pencil" as const })), [53, 48], 5)).toEqual(inPen);
  });

  it("finds nothing out of reach, in highlighter ink, or where a line crosses itself", () => {
    expect(snapPoint(cross, [60, 48], 5)).toBeNull();
    expect(snapPoint(cross.map((s) => ({ ...s, kind: "highlighter" as const })), [53, 48], 5)).toBeNull();
    expect(snapPoint([line([[0, 0], [100, 100], [100, 0], [0, 100]])], [53, 48], 5)).toBeNull();
  });
});

describe("snapping to squared paper", () => {
  // Squares 10 page units apart on a page 100 by 50, with a centimetre of 10
  // page units, so a corner is caught within 3 units and the ink within 5.
  const grid = { spacing: 10, width: 100, height: 50 };
  const cm = 10;

  it("finds the nearest corner of the squares within reach, and none beyond it", () => {
    expect(gridCorner([21, 29], grid, 3)).toEqual([20, 30]);
    expect(gridCorner([25, 25], grid, 3)).toBeNull();
  });

  it("only counts corners that are on the page", () => {
    // The nearest corner, at (50, 50), is past the bottom of a page 48 units tall.
    expect(gridCorner([50, 47], { spacing: 10, width: 100, height: 48 }, 3)).toBeNull();
  });

  it("lets a point in the ink win over a nearer corner of the squares", () => {
    expect(snapOnPage([line([[23, 27]])], [21, 29], cm, grid)).toEqual([23, 27]);
  });

  it("falls back to a corner with no ink near, with a shorter reach than the ink's, and to nothing without squares", () => {
    expect(snapOnPage([], [21, 29], cm, grid)).toEqual([20, 30]);
    expect(snapOnPage([], [24, 26], cm, grid)).toBeNull();
    expect(snapOnPage([], [21, 29], cm)).toBeNull();
  });
});
