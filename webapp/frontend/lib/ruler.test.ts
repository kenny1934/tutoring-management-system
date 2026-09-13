import { describe, it, expect } from "vitest";
import {
  CM, clipPointsToPage, clipToPage, edgeAt, nearRuler, ontoEdge, pinnedLine, shownAngle, snapAngle, type RulerFrame,
} from "./ruler";

// A level ruler centred at (100, 100), 160 pixels long and 30 tall.
const LEVEL: RulerFrame = { cx: 100, cy: 100, dx: 1, dy: 0, halfLength: 80, halfHeight: 15 };

const expectNear = (actual: number[] | undefined, expected: number[]) => {
  expect(actual).toBeDefined();
  expected.forEach((value, i) => expect(actual![i]).toBeCloseTo(value));
};

describe("the ruler's centimetres", () => {
  it("are true centimetres of the printed page", () => {
    // An A4 page is 595.28 points, or 21 cm, across.
    expect((595.28 * 1.5) / CM).toBeCloseTo(21, 2);
  });
});

describe("edgeAt", () => {
  it("finds the long edge a line starts just outside of", () => {
    const below = edgeAt(LEVEL, [100, 130]);
    expectNear(below?.origin, [100, 115]);
    expectNear(below?.out, [0, 1]);

    const above = edgeAt(LEVEL, [60, 70]);
    expectNear(above?.origin, [100, 85]);
    expectNear(above?.out, [0, -1]);
  });

  it("finds nothing on the ruler, too far from it, or past its end", () => {
    expect(edgeAt(LEVEL, [100, 105])).toBeNull();
    expect(edgeAt(LEVEL, [100, 160])).toBeNull();
    expect(edgeAt(LEVEL, [200, 130])).toBeNull();
  });

  it("follows the ruler round when it's turned", () => {
    const upright: RulerFrame = { ...LEVEL, dx: 0, dy: 1 };
    const right = edgeAt(upright, [130, 100]);
    expectNear(right?.origin, [115, 100]);
    expectNear(right?.out, [1, 0]);
  });
});

describe("ontoEdge", () => {
  it("slides a point onto the edge, moved out by the offset and stopped at the ruler's ends", () => {
    const edge = edgeAt(LEVEL, [100, 130])!;
    expectNear(ontoEdge(edge, [60, 140], 2), [60, 117]);
    expectNear(ontoEdge(edge, [300, 200], 2), [180, 117]);
  });
});

describe("nearRuler", () => {
  it("counts a finger just beside the ruler, but not one further away", () => {
    expect(nearRuler(LEVEL, [100, 128], 16)).toBe(true);
    expect(nearRuler(LEVEL, [100, 135], 16)).toBe(false);
  });
});

describe("clipToPage", () => {
  it("keeps a line that's on the page, and cuts off whatever runs past its edge", () => {
    expect(clipToPage([10, 10], [50, 60], 100, 100)).toEqual([[10, 10], [50, 60]]);
    expect(clipToPage([50, 50], [150, 50], 100, 100)).toEqual([[50, 50], [100, 50]]);
    expect(clipToPage([-20, 50], [50, 50], 100, 100)).toEqual([[0, 50], [50, 50]]);
  });

  it("drops a line that misses the page", () => {
    expect(clipToPage([110, 50], [150, 50], 100, 100)).toBeNull();
  });
});

describe("clipPointsToPage", () => {
  const rounded = (points: number[][] | null) => points?.map((point) => point.map((v) => Math.round(v * 1000) / 1000));

  it("keeps a line of many points from its start to where it first leaves the page", () => {
    const line: [number, number][] = [[10, 10], [50, 10], [80, 10], [180, 10], [80, 20]];
    expect(rounded(clipPointsToPage(line, 100, 100))).toEqual([[10, 10], [50, 10], [80, 10], [100, 10]]);
  });

  it("keeps a dot that's on the page, and drops a line that misses it", () => {
    expect(clipPointsToPage([[10, 10]], 100, 100)).toEqual([[10, 10]]);
    expect(clipPointsToPage([[110, 10], [150, 10], [120, 50]], 100, 100)).toBeNull();
  });
});

describe("the ruler's angle", () => {
  it("snaps to level, upright and every 15 degrees when it's close to one", () => {
    expect(snapAngle(13)).toBe(15);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(87)).toBe(87);
  });

  it("shows from 0 to 179 degrees", () => {
    expect(shownAngle(-30)).toBe(150);
    expect(shownAngle(190)).toBe(10);
  });
});

describe("pinnedLine", () => {
  // A line along a level edge, from (10, 50) to (90, 50).
  const along: [number, number] = [1, 0];

  it("joins two pinned points exactly, even where the ruler lies a little off them", () => {
    expect(pinnedLine(along, [10, 50], [90, 50], [11, 52], [89, 47])).toEqual([[11, 52], [89, 47]]);
  });

  it("runs from a single pinned point in the ruler's direction, as far as the other end reaches", () => {
    expect(pinnedLine(along, [10, 50], [90, 50], [11, 52], null)).toEqual([[11, 52], [90, 52]]);
    expect(pinnedLine(along, [10, 50], [90, 50], null, [89, 47])).toEqual([[10, 47], [89, 47]]);
  });

  it("leaves a line with nothing pinned as it was", () => {
    expect(pinnedLine(along, [10, 50], [90, 50], null, null)).toEqual([[10, 50], [90, 50]]);
  });
});
