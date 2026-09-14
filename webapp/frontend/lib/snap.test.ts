import { describe, it, expect } from "vitest";
import { crossing, gridCorner, snapOnPage, snapPoint, tickPoint } from "./snap";
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

describe("tick points on a pair of axes", () => {
  // A pencil axis along y = 50, with a tick of scale ink across it at x = 50.
  // A centimetre is 10 page units, so a tick point is caught within 3 units.
  const cm = 10;
  const axis = line([[0, 50], [100, 50]], "pencil");
  const tick = line([[50, 45], [50, 55]], "scale");

  it("never snaps to the scale ink's own ends or dots", () => {
    expect(snapOnPage([tick], [50, 46], cm)).toBeNull();
    expect(snapOnPage([line([[30, 30]], "scale")], [31, 29], cm)).toBeNull();
    expect(snapPoint([axis, tick], [50, 46], 5)).toBeNull();
  });

  it("snaps to where a tick crosses its axis, within 0.3 cm and not beyond", () => {
    expect(tickPoint([axis, tick], [52, 51], 3)).toEqual([50, 50]);
    expect(snapOnPage([axis, tick], [52, 51], cm)).toEqual([50, 50]);
    expect(snapOnPage([axis, tick], [53, 52], cm)).toBeNull();
  });

  it("finds nothing where two strokes of scale ink cross", () => {
    const across = line([[40, 50], [60, 50]], "scale");
    expect(snapOnPage([tick, across], [51, 51], cm)).toBeNull();
  });

  it("lets a point in the ink win over a nearer tick point", () => {
    expect(snapOnPage([axis, tick, line([[54, 50]])], [51, 50], cm)).toEqual([54, 50]);
  });

  it("takes whichever is nearer of a tick point and a corner of the squares", () => {
    const grid = { spacing: 10, width: 100, height: 100 };
    // A tick at x = 53, which isn't on a corner, as after the lasso has moved the axes.
    const offTheSquares = line([[53, 45], [53, 55]], "scale");
    expect(snapOnPage([axis, offTheSquares], [52, 50], cm, grid)).toEqual([53, 50]);
    expect(snapOnPage([axis, offTheSquares], [51, 50], cm, grid)).toEqual([50, 50]);
  });
});
