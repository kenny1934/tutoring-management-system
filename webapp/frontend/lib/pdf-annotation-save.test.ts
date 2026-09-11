import { describe, it, expect, vi } from "vitest";
import { drawStrokeToCanvas } from "./pdf-annotation-save";
import type { Stroke } from "@/hooks/useAnnotations";

// A stand-in for a canvas context that records the calls the saved PDF relies on.
function fakeContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
  };
}

describe("drawStrokeToCanvas", () => {
  it("fills in a dot left by a tap, centred where the tap landed", () => {
    const ctx = fakeContext();
    const dot: Stroke = { points: [[40, 60, 0.5]], color: "#2563eb", size: 6 };

    drawStrokeToCanvas(ctx as unknown as CanvasRenderingContext2D, dot, 2);

    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.fillStyle).toBe("#2563eb");
    // Every point of the outline sits close to the tap, at twice the scale.
    for (const [x, y] of ctx.quadraticCurveTo.mock.calls.map(([cx, cy]) => [cx, cy])) {
      expect(Math.hypot(x - 80, y - 120)).toBeLessThan(12);
    }
  });
});
