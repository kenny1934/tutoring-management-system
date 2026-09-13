import { describe, it, expect } from "vitest";
import {
  insideLoop, strokesInLoop, selectionBounds, clampMove, moveStrokes, dragScale, clampScale, resizeStrokes, recolourStrokes,
} from "./stroke-select";
import type { Stroke } from "@/hooks/useAnnotations";

const stroke = (points: [number, number][], size = 2): Stroke => ({
  points: points.map(([x, y]): [number, number, number] => [x, y, 0.5]),
  color: "#dc2626",
  size,
});
const xy = (s: Stroke) => s.points.map(([x, y]) => [x, y]);

// A square loop from (10, 10) to (60, 60).
const SQUARE: [number, number][] = [[10, 10], [60, 10], [60, 60], [10, 60]];

describe("insideLoop", () => {
  it("tells points inside the loop from points outside it", () => {
    expect(insideLoop([30, 30], SQUARE)).toBe(true);
    expect(insideLoop([70, 30], SQUARE)).toBe(false);
    expect(insideLoop([30, 5], SQUARE)).toBe(false);
  });
});

describe("strokesInLoop", () => {
  it("catches a stroke when most of its points are inside the loop", () => {
    const inside = stroke([[20, 20], [30, 30], [40, 40]]);
    const mostly = stroke([[20, 50], [40, 50], [55, 50], [80, 50]]);
    const through = stroke([[0, 30], [30, 30], [90, 30], [100, 30]]);
    const away = stroke([[80, 80], [90, 90]]);

    expect(strokesInLoop([inside, mostly, through, away], SQUARE)).toEqual([inside, mostly]);
  });

  it("catches nothing with a loop too short to go round anything", () => {
    expect(strokesInLoop([stroke([[15, 15]])], [[10, 10], [20, 20]])).toEqual([]);
  });
});

describe("moving a selection", () => {
  it("moves every point and keeps the rest of each stroke", () => {
    const s = { ...stroke([[10, 20], [30, 40]], 6), kind: "highlighter" as const };
    const [moved] = moveStrokes([s], 5, -10);

    expect(xy(moved)).toEqual([[15, 10], [35, 30]]);
    expect(moved).toMatchObject({ color: s.color, size: 6, kind: "highlighter" });
    expect(s.points[0][0]).toBe(10);
  });

  it("stops the ink at the page's edges", () => {
    const bounds = selectionBounds([stroke([[10, 20], [30, 40]])]);
    expect(clampMove(bounds, -50, 200, 100, 100)).toEqual([-10, 60]);
  });

  it("lets ink that ran off the page come back, but go no further out", () => {
    const bounds = selectionBounds([stroke([[-5, 20], [30, 40]])]);
    expect(clampMove(bounds, -10, 0, 100, 100)).toEqual([0, 0]);
    expect(clampMove(bounds, 10, 0, 100, 100)).toEqual([10, 0]);
  });
});

describe("resizing a selection", () => {
  it("scales from the top-left corner and keeps each stroke's pen width", () => {
    const [resized] = resizeStrokes([stroke([[10, 10], [30, 20]], 6)], [10, 10], 2);
    expect(xy(resized)).toEqual([[10, 10], [50, 30]]);
    expect(resized.size).toBe(6);
  });

  it("reads a drag of the corner handle as a scale", () => {
    const bounds = selectionBounds([stroke([[10, 10], [30, 20]])]);
    expect(dragScale(bounds, [30, 20], [50, 30])).toBe(2);
    expect(dragScale(bounds, [30, 20], [20, 15])).toBe(0.5);
  });

  it("keeps a resize between a quarter and four times the size, and on the page", () => {
    const bounds = selectionBounds([stroke([[10, 10], [30, 20]])]);
    expect(clampScale(bounds, 0.1, 1000, 1000)).toBe(0.25);
    expect(clampScale(bounds, 10, 1000, 1000)).toBe(4);
    // On a 60 by 60 page, the ink's 20 across from x = 10 can only grow to 50 across.
    expect(clampScale(bounds, 10, 60, 60)).toBe(2.5);
  });
});

describe("recolourStrokes", () => {
  it("changes only ink of the colour's own kind, and leaves everything else the same object", () => {
    const pen = stroke([[0, 0], [5, 5]]);
    const highlighter: Stroke = { ...stroke([[0, 10], [5, 10]]), color: "#facc15", kind: "highlighter" };

    const [bluePen, sameHighlighter] = recolourStrokes([pen, highlighter], "pen", "#2563eb");
    expect(bluePen).toEqual({ ...pen, color: "#2563eb" });
    expect(sameHighlighter).toBe(highlighter);
    // A stroke that's already the colour picked is left as it is.
    expect(recolourStrokes([pen], "pen", pen.color)[0]).toBe(pen);
  });
});
