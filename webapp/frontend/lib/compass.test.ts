import { describe, it, expect, beforeEach } from "vitest";
import {
  addTurn, arcPoints, directionOf, draggedLegs, hingeHeight, mirroredAt, opensTo, readCompassLegs, readCompassWidth,
  saveCompassLegs, saveCompassWidth, snapWidth, sweepRange, typedWidth, widestFor,
} from "./compass";

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

describe("typedWidth", () => {
  it("takes a typed width, snapped to a millimetre and kept between 0.5 and 13 cm", () => {
    expect(typedWidth("6.25")).toBe(6.3);
    expect(typedWidth(" 5 ")).toBe(5);
    expect(typedWidth("5 cm")).toBe(5);
    expect(typedWidth("20")).toBe(13);
  });

  it("takes nothing that isn't a number", () => {
    expect(typedWidth("")).toBeNull();
    expect(typedWidth("abc")).toBeNull();
  });
});

describe("the remembered width", () => {
  beforeEach(() => localStorage.clear());

  it("starts at 4 cm, and comes back at the width it was last left at", () => {
    expect(readCompassWidth()).toBe(4);
    saveCompassWidth(6.2);
    expect(readCompassWidth()).toBe(6.2);
    // A width pinned onto a point in the ink comes back to the nearest millimetre, within reach.
    saveCompassWidth(6.234);
    expect(readCompassWidth()).toBe(6.2);
    saveCompassWidth(40);
    expect(readCompassWidth()).toBe(13);
    localStorage.setItem("csm_compass_width", "nonsense");
    expect(readCompassWidth()).toBe(4);
  });

  it("keeps a remembered width within what the legs allow", () => {
    saveCompassWidth(13);
    expect(readCompassWidth(5)).toBe(9);
  });

  it("remembers the legs' length, starting at 7 cm", () => {
    expect(readCompassLegs()).toBe(7);
    saveCompassLegs(10);
    expect(readCompassLegs()).toBe(10);
    saveCompassLegs(30);
    expect(readCompassLegs()).toBe(12);
  });
});

describe("hingeHeight", () => {
  it("stands the hinge lower as the compasses open", () => {
    expect(hingeHeight(0)).toBe(7);
    expect(hingeHeight(4)).toBeCloseTo(Math.sqrt(45));
  });

  it("stands it higher on longer legs", () => {
    expect(hingeHeight(4, 10)).toBeCloseTo(Math.sqrt(96));
  });
});

describe("the legs' length", () => {
  it("sets how wide the compasses can open, a centimetre short of the legs laid end to end", () => {
    expect(widestFor(7)).toBe(13);
    expect(widestFor(12)).toBe(23);
    expect(opensTo(15)).toBe(false);
    expect(opensTo(15, 12)).toBe(true);
    expect(snapWidth(20, 12)).toBe(20);
    expect(snapWidth(20, 5)).toBe(9);
    expect(typedWidth("20", 12)).toBe(20);
  });

  it("grows and shrinks with a drag of the handle, between 5 and 12 cm", () => {
    expect(draggedLegs(7, 24.5, 35)).toBe(10);
    expect(draggedLegs(7, 10, 100)).toBe(12);
    expect(draggedLegs(7, 50, 10)).toBe(5);
    expect(draggedLegs(7, 0, 10)).toBe(7);
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
