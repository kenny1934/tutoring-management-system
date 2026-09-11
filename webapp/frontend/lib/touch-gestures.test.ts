import { describe, it, expect } from "vitest";
import { classifyTwoFingerGesture, PINCH_SPREAD, SCROLL_TRAVEL } from "./touch-gestures";

// Two fingers 200 pixels apart, side by side, as they land for a scroll.
const start: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 400, y: 500 }, { x: 600, y: 500 }];

describe("classifyTwoFingerGesture", () => {
  it("waits while the fingers have barely moved", () => {
    expect(classifyTwoFingerGesture(start, [{ x: 402, y: 505 }, { x: 601, y: 508 }])).toBeNull();
  });

  it("calls it a scroll once both fingers travel together", () => {
    const now: typeof start = [{ x: 400, y: 500 - SCROLL_TRAVEL - 5 }, { x: 600, y: 500 - SCROLL_TRAVEL - 5 }];
    expect(classifyTwoFingerGesture(start, now)).toBe("scroll");
  });

  it("keeps a scroll a scroll when the fingers drift apart as they move", () => {
    // On the classroom board a two-finger scroll drifted wide enough to zoom
    // under the old rule. Here the gap grows by 80 pixels, past the pinch
    // spread, but over 200 pixels of travel, so it's still a scroll.
    const now: typeof start = [{ x: 370, y: 300 }, { x: 650, y: 300 }];
    expect(classifyTwoFingerGesture(start, now)).toBe("scroll");
  });

  it("calls it a pinch when the gap opens up while the fingers stay put", () => {
    const now: typeof start = [{ x: 400 - PINCH_SPREAD, y: 500 }, { x: 600 + 5, y: 500 }];
    expect(classifyTwoFingerGesture(start, now)).toBe("pinch");
  });

  it("calls it a pinch when the fingers close together", () => {
    const now: typeof start = [{ x: 450, y: 500 }, { x: 540, y: 500 }];
    expect(classifyTwoFingerGesture(start, now)).toBe("pinch");
  });
});
