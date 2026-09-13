import { describe, it, expect } from "vitest";
import { addTurn, arcPoints, directionOf, hingeHeight, snapWidth } from "./compass";

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
