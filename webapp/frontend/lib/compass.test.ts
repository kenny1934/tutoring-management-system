import { describe, it, expect } from "vitest";
import { addTurn, arcPoints, directionOf, hingeHeight, mirroredAt, opensTo, snapWidth, sweepRange } from "./compass";

describe("sweepRange", () => {
  it("keeps what the pencil has passed over when a turn goes back, and extends it past the start", () => {
    expect(sweepRange([0, 0], 90)).toEqual([0, 90]);
    expect(sweepRange([0, 90], 10)).toEqual([0, 90]);
    expect(sweepRange([0, 90], -45)).toEqual([-45, 90]);
  });

  it("never covers more than one full circle", () => {
    expect(sweepRange([-100, 0], 300)).toEqual([-60, 300]);
    expect(sweepRange([0, 100], -300)).toEqual([-300, 60]);
  });
});

describe("mirroredAt", () => {
  it("mirrors the compasses whenever the pencil is left of the needle", () => {
    expect(mirroredAt(0)).toBe(false);
    expect(mirroredAt(90)).toBe(false);
    expect(mirroredAt(180)).toBe(true);
    expect(mirroredAt(-120)).toBe(true);
    expect(mirroredAt(270)).toBe(false);
  });
});

describe("opensTo", () => {
  it("says whether the compasses can open to a width", () => {
    expect(opensTo(6.22)).toBe(true);
    expect(opensTo(0.3)).toBe(false);
    expect(opensTo(13.5)).toBe(false);
  });
});

describe("snapWidth", () => {
  it("snaps to whole millimetres, between 0.5 and 13 cm", () => {
    expect(snapWidth(4.26)).toBe(4.3);
    expect(snapWidth(0.1)).toBe(0.5);
    expect(snapWidth(20)).toBe(13);
  });
});

describe("hingeHeight", () => {
  it("stands the hinge lower as the compasses open", () => {
    expect(hingeHeight(0)).toBe(7);
    expect(hingeHeight(4)).toBeCloseTo(Math.sqrt(45));
  });
});

describe("addTurn", () => {
  it("counts a step the short way round, so a turn carries on past half way", () => {
    expect(addTurn(0, 170, -170)).toBe(20);
    expect(addTurn(0, -170, 170)).toBe(-20);
  });

  it("stops at one full circle", () => {
    expect(addTurn(350, 0, 30)).toBe(360);
    expect(addTurn(-350, 0, -30)).toBe(-360);
  });
});

describe("arcPoints", () => {
  it("puts a point at every degree round the centre, turning clockwise on screen", () => {
    const points = arcPoints([0, 0], 10, 0, 90);
    expect(points).toHaveLength(91);
    expect(points[90][0]).toBeCloseTo(0);
    expect(points[90][1]).toBeCloseTo(10);
  });
});

describe("directionOf", () => {
  it("measures clockwise from pointing right, as the screen turns", () => {
    expect(directionOf([0, 0], [0, 10])).toBeCloseTo(90);
    expect(directionOf([0, 0], [-10, 0])).toBeCloseTo(180);
  });
});
