import { describe, it, expect } from "vitest";
import { edgeAt, nearRuler, ontoEdge, pinnedLine, shownAngle, shownLength, type RulerFrame } from "./ruler";

// A level ruler centred at (100, 100), 160 pixels long and 30 tall, so a pixel to the millimetre.
const LEVEL: RulerFrame = { cx: 100, cy: 100, dx: 1, dy: 0, halfLength: 80, halfHeight: 15 };

const expectNear = (actual: number[] | undefined, expected: number[]) => {
  expect(actual).toBeDefined();
  expected.forEach((value, i) => expect(actual![i]).toBeCloseTo(value));
};

describe("edgeAt", () => {
  it("finds the long edge a line starts just outside of", () => {
    const below = edgeAt(LEVEL, [100, 130]);
    expectNear(below?.origin, [100, 115]);
    expectNear(below?.out, [0, 1]);
    expect(below?.mm).toBeCloseTo(1);

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

  it("lands on the nearest millimetre mark", () => {
    const edge = edgeAt(LEVEL, [100, 130])!;
    expectNear(ontoEdge(edge, [60.4, 140], 2), [60, 117]);
    expectNear(ontoEdge(edge, [60.6, 140], 2), [61, 117]);

    // Zoomed in to 4 pixels to the millimetre, 9 pixels from the centre is nearest the 2 mm mark.
    const zoomed = edgeAt({ ...LEVEL, halfLength: 320 }, [100, 130])!;
    expect(zoomed.mm).toBeCloseTo(4);
    expectNear(ontoEdge(zoomed, [109, 130], 0), [108, 115]);
  });
});

describe("nearRuler", () => {
  it("counts a finger just beside the ruler, but not one further away", () => {
    expect(nearRuler(LEVEL, [100, 128], 16)).toBe(true);
    expect(nearRuler(LEVEL, [100, 135], 16)).toBe(false);
  });
});

describe("the ruler's angle", () => {
  it("shows from 0 to 179 degrees", () => {
    expect(shownAngle(-30)).toBe(150);
    expect(shownAngle(190)).toBe(10);
  });
});

describe("pinnedLine", () => {
  // A line along a level edge, from (10, 50) to (90, 50).
  const along: [number, number] = [1, 0];

  it("joins two pinned points exactly, even where the ruler lies a little off them", () => {
    expect(pinnedLine(along, [10, 50], [90, 50], [11, 52], [89, 47], 1)).toEqual([[11, 52], [89, 47]]);
  });

  it("runs from a single pinned point in the ruler's direction, as far as the other end reaches", () => {
    expect(pinnedLine(along, [10, 50], [90, 50], [11, 52], null, 1)).toEqual([[11, 52], [90, 52]]);
    expect(pinnedLine(along, [10, 50], [90, 50], null, [89, 47], 1)).toEqual([[10, 47], [89, 47]]);
  });

  it("counts whole millimetres from a single pinned point that isn't on a mark", () => {
    // 78.7 pixels from the pinned point to the other end rounds to 79 millimetres.
    const [start, end] = pinnedLine(along, [10, 50], [90, 50], [11.3, 52], null, 1);
    expectNear(start, [11.3, 52]);
    expectNear(end, [90.3, 52]);
  });

  it("leaves a line with nothing pinned as it was", () => {
    expect(pinnedLine(along, [10, 50], [90, 50], null, null, 1)).toEqual([[10, 50], [90, 50]]);
  });
});

describe("shownLength", () => {
  it("reads a line's length in centimetres to the nearest millimetre", () => {
    expect(shownLength([[0, 0], [61, 0]], 1)).toBe("6.1 cm");
    expect(shownLength([[0, 0], [240, 0]], 4)).toBe("6.0 cm");
    // Two pinned points can be any distance apart, here 78.16 millimetres.
    expect(shownLength([[11, 52], [89, 47]], 1)).toBe("7.8 cm");
    expect(shownLength([[5, 5], [5, 5]], 1)).toBe("0.0 cm");
  });
});
