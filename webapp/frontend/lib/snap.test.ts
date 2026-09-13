import { describe, it, expect } from "vitest";
import { crossing, snapPoint } from "./snap";
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

  it("finds nothing out of reach, in highlighter ink, or where a line crosses itself", () => {
    expect(snapPoint(cross, [60, 48], 5)).toBeNull();
    expect(snapPoint(cross.map((s) => ({ ...s, kind: "highlighter" as const })), [53, 48], 5)).toBeNull();
    expect(snapPoint([line([[0, 0], [100, 100], [100, 0], [0, 100]])], [53, 48], 5)).toBeNull();
  });
});
