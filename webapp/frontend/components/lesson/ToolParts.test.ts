import { describe, it, expect } from "vitest";
import { readingPlace } from "./ToolParts";

describe("readingPlace", () => {
  // The pane shows the container from 100 to 400 down, and 0 to 500 across.
  const view = { left: 0, top: 100, right: 500, bottom: 400 };
  const size: [number, number] = [60, 20];

  it("keeps a reading in its usual place while all of it is in view", () => {
    expect(readingPlace([250, 200], [250, 300], size, view)).toEqual([250, 200]);
  });

  it("moves a reading to the far side of its tool when its usual place is out of view", () => {
    expect(readingPlace([250, 95], [250, 300], size, view)).toEqual([250, 300]);
  });

  it("pulls a reading just into view when neither place is in view, keeping it a little inside the edge", () => {
    // Half the reading is 30 by 10, and it's kept 4 inside the edge.
    expect(readingPlace([-50, 95], [-50, 450], size, view)).toEqual([34, 114]);
  });

  it("leaves a reading in its usual place when what the pane shows isn't known", () => {
    expect(readingPlace([250, -500], [250, 300], size, null)).toEqual([250, -500]);
  });
});
