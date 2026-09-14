import { describe, it, expect } from "vitest";
import { CM, clipPointsToPage, clipToPage, readingFlipped, snapAngle } from "./drawing-guide";

describe("CM", () => {
  it("is a true centimetre of the printed page", () => {
    // An A4 page is 595.28 points, or 21 cm, across.
    expect((595.28 * 1.5) / CM).toBeCloseTo(21, 2);
  });
});

describe("snapAngle", () => {
  it("snaps to level, upright and every 15 degrees when it's close to one", () => {
    expect(snapAngle(13)).toBe(15);
    expect(snapAngle(88)).toBe(90);
    expect(snapAngle(87)).toBe(87);
  });
});

describe("readingFlipped", () => {
  it("flips a tool's reading once the tool is turned far enough for it to be upside down", () => {
    [0, 89, 270, 359, -30, 400].forEach((angle) => expect(readingFlipped(angle)).toBe(false));
    // Upright either way round, the reading ends up running from bottom to top.
    [90, 180, 269, -100, -180].forEach((angle) => expect(readingFlipped(angle)).toBe(true));
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
