import { describe, it, expect } from "vitest";
import { eraseStrokes } from "./stroke-eraser";
import type { Stroke } from "@/hooks/useAnnotations";

// A horizontal line along y = 50 from x = 0 to x = 100, one point every 10 units.
function line(size = 2): Stroke {
  const points: [number, number, number][] = [];
  for (let x = 0; x <= 100; x += 10) points.push([x, 50, 0.5]);
  return { points, color: "#dc2626", size };
}

const xs = (stroke: Stroke) => stroke.points.map(([x]) => x);

describe("eraseStrokes", () => {
  it("cuts a gap out of the middle and keeps both sides as separate strokes", () => {
    const stroke = line(2);
    // A tap at x = 50 with radius 10 reaches 11 either side, once the pen's half width is added.
    const result = eraseStrokes([stroke], [50, 50], [50, 50], 10);

    expect(result).toHaveLength(2);
    const [left, right] = result;
    expect(xs(left)[0]).toBe(0);
    expect(xs(left).at(-1)).toBeCloseTo(39, 3);
    expect(xs(right)[0]).toBeCloseTo(61, 3);
    expect(xs(right).at(-1)).toBe(100);
    expect(left.color).toBe(stroke.color);
    expect(left.size).toBe(stroke.size);
  });

  it("erases a continuous gap along a fast swipe, not just where the pointer was reported", () => {
    // Crossing the line diagonally from above-left to below-right in one move.
    const result = eraseStrokes([line(2)], [30, 0], [70, 100], 5);

    expect(result).toHaveLength(2);
    expect(xs(result[0]).at(-1)).toBeLessThan(50);
    expect(xs(result[1])[0]).toBeGreaterThan(50);
  });

  it("shortens a stroke from the end when the eraser covers only that end", () => {
    const result = eraseStrokes([line(2)], [100, 50], [100, 50], 10);

    expect(result).toHaveLength(1);
    expect(xs(result[0])[0]).toBe(0);
    expect(xs(result[0]).at(-1)).toBeCloseTo(89, 3);
  });

  it("removes a stroke entirely when the eraser covers all of it", () => {
    const result = eraseStrokes([line(2)], [0, 50], [100, 50], 5);
    expect(result).toEqual([]);
  });

  it("reaches further into thicker ink, so the gap still matches the eraser circle", () => {
    const thin = eraseStrokes([line(2)], [50, 50], [50, 50], 10);
    const thick = eraseStrokes([line(12)], [50, 50], [50, 50], 10);

    expect(xs(thin[0]).at(-1)).toBeCloseTo(39, 3);
    expect(xs(thick[0]).at(-1)).toBeCloseTo(34, 3);
  });

  it("keeps the same array and stroke objects when the eraser misses", () => {
    const strokes = [line(2), line(3)];
    expect(eraseStrokes(strokes, [50, 90], [60, 90], 5)).toBe(strokes);

    // A near miss: the eraser reaches 5 plus half the thinner pen's width of 2,
    // which is 6, and the thicker pen's reach is 6.5, so 6.6 away just clears both.
    expect(eraseStrokes(strokes, [50, 43.4], [50, 43.4], 5)).toBe(strokes);
    // And 5.9 away catches them.
    expect(eraseStrokes(strokes, [50, 44.1], [50, 44.1], 5)).not.toBe(strokes);
  });

  it("only replaces the strokes it touches", () => {
    const far: Stroke = { points: [[0, 200, 0.5], [100, 200, 0.5]], color: "#000000", size: 2 };
    const near = line(2);
    const result = eraseStrokes([far, near], [50, 50], [50, 50], 10);

    expect(result[0]).toBe(far);
    expect(result).toHaveLength(3);
  });

  it("interpolates pen pressure at the cut", () => {
    const stroke: Stroke = { points: [[0, 0, 0.2], [100, 0, 0.8]], color: "#000000", size: 2 };
    const [left] = eraseStrokes([stroke], [100, 0], [100, 0], 49);

    // The cut lands at x = 50, halfway, so the pressure there is halfway too.
    expect(left.points.at(-1)![0]).toBeCloseTo(50, 3);
    expect(left.points.at(-1)![2]).toBeCloseTo(0.5, 3);
  });
});
