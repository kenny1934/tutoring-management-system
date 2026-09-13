import { describe, it, expect } from "vitest";
import { arcTo, lineKind, nearProtractor, polar, rayTo, shownTilt, type ProtractorFrame } from "./protractor";

// A level protractor with its centre mark at (200, 200), 100 pixels to its
// curved edge, a strip 10 tall below its baseline and a hole 5 in radius.
const LEVEL: ProtractorFrame = { cx: 200, cy: 200, dx: 1, dy: 0, radius: 100, strip: 10, hole: 5 };

/** The point this far from the level protractor's centre mark, at this many degrees round from the right. */
const point = (r: number, degrees: number): [number, number] => [
  200 + r * Math.cos((degrees * Math.PI) / 180),
  200 - r * Math.sin((degrees * Math.PI) / 180),
];

const expectNear = (actual: number[], expected: number[]) => expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v));

describe("lineKind", () => {
  it("draws a ray from a start in the hole, and an arc from a start just outside the curved edge", () => {
    expect(lineKind(LEVEL, [202, 197])).toBe("ray");
    expect(lineKind(LEVEL, point(110, 60))).toBe("arc");
  });

  it("draws nothing special from a start on the plastic, below the baseline, or too far from the edge", () => {
    expect(lineKind(LEVEL, point(50, 60))).toBeNull();
    expect(lineKind(LEVEL, [300, 230])).toBeNull();
    expect(lineKind(LEVEL, point(150, 60))).toBeNull();
  });

  it("follows the protractor round when it's turned", () => {
    // Turned a quarter clockwise, its baseline points down the screen and its curved edge faces right.
    const turned: ProtractorFrame = { ...LEVEL, dx: 0, dy: 1 };
    expect(lineKind(turned, [310, 200])).toBe("arc");
    expect(polar(turned, [310, 200]).angle).toBeCloseTo(90);
  });
});

describe("rayTo", () => {
  it("runs from the centre mark towards the finger, turned to the nearest whole degree, with its reading", () => {
    const ray = rayTo(LEVEL, point(80, 34.6));
    expect(ray.degrees).toBe(35);
    expect(ray.ends[0]).toEqual([200, 200]);
    expectNear(ray.ends[1], point(80, 35));
  });

  it("reads from the baseline on either side of it", () => {
    expect(rayTo(LEVEL, point(80, -30)).degrees).toBe(30);
  });
});

describe("arcTo", () => {
  it("follows the curved edge from where it started to the finger, with a point for every degree", () => {
    const arc = arcTo(LEVEL, 30.2, point(130, 90.4), 2);
    expect(arc.degrees).toBe(60);
    expect(arc.points).toHaveLength(61);
    expectNear(arc.points[0], point(102, 30));
    expectNear(arc.points[60], point(102, 90));
  });

  it("stops at the ends of the curved edge", () => {
    // A finger below the baseline, past its left-hand end, takes the arc as far as 180 degrees.
    expect(arcTo(LEVEL, 150, [50, 220], 0).degrees).toBe(30);
  });
});

describe("nearProtractor", () => {
  it("counts a finger on the half-disc, on the strip, or just beside either, but not one further away", () => {
    expect(nearProtractor(LEVEL, point(110, 45), 16)).toBe(true);
    expect(nearProtractor(LEVEL, [290, 220], 16)).toBe(true);
    expect(nearProtractor(LEVEL, [200, 240], 16)).toBe(false);
    expect(nearProtractor(LEVEL, point(120, 45), 16)).toBe(false);
  });
});

describe("shownTilt", () => {
  it("shows from 0 to 359 degrees", () => {
    expect(shownTilt(-30)).toBe(330);
    expect(shownTilt(390)).toBe(30);
  });
});
