import { describe, it, expect, vi, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { drawStrokeToCanvas, saveAnnotatedPdf } from "./pdf-annotation-save";
import { DRAFT_PAGE_BASE, DRAFT_SHEET_PT } from "./draft-sheets";
import { textFont } from "./text-ink";
import type { Stroke } from "@/hooks/useAnnotations";

// The worksheet the export starts from: a single page, 300 by 400 points.
vi.mock("./pdf-utils", () => ({
  extractPagesForPrint: async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 400]);
    const bytes = await doc.save();
    return { arrayBuffer: async () => bytes.buffer };
  },
}));

// A stand-in for a canvas context that records the calls the saved PDF relies on.
function fakeContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
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

  it("draws the scale ink of a pair of axes as a line through its points with rounded corners, as the screen does", () => {
    const ctx = fakeContext();
    const tick: Stroke = { points: [[10, 20, 0.5], [10, 30, 0.5], [15, 30, 0.5]], color: "#6b7280", size: 2.5, kind: "scale" };

    drawStrokeToCanvas(ctx as unknown as CanvasRenderingContext2D, tick, 2);

    expect(ctx.moveTo).toHaveBeenCalledWith(20, 40);
    expect(ctx.lineTo.mock.calls).toEqual([[20, 60], [30, 60]]);
    expect(ctx.lineWidth).toBe(5);
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.lineCap).toBe("round");
    expect(ctx.strokeStyle).toBe("#6b7280");
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);
  });

  it("writes text in its fonts a line at a time, on the same baselines as the screen", () => {
    const ctx = fakeContext();
    const text: Stroke = {
      points: [[100, 187.5, 0.5], [170, 237.5, 0.5]], color: "#2563eb", size: 1, kind: "text", text: "alt. ∠s,\nAB // CD", italic: true,
    };

    drawStrokeToCanvas(ctx as unknown as CanvasRenderingContext2D, text, 2);

    // Two lines in a box 50 tall make each line 25 tall and the writing 20,
    // and the canvas is at twice the scale.
    expect(ctx.font).toBe(textFont(40, true));
    expect(ctx.fillStyle).toBe("#2563eb");
    const calls = ctx.fillText.mock.calls;
    expect(calls.map(([line]) => line)).toEqual(["alt. ∠s,", "AB // CD"]);
    expect(calls.map(([, x]) => x)).toEqual([200, 200]);
    expect(calls[0][2]).toBeCloseTo(2 * (187.5 + 12.5 + 7));
    expect(calls[1][2]).toBeCloseTo(2 * (187.5 + 37.5 + 7));
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("draws a single point of scale ink as a dot the stroke's width across", () => {
    const ctx = fakeContext();
    const point: Stroke = { points: [[40, 60, 0.5]], color: "#6b7280", size: 2.5, kind: "scale" };

    drawStrokeToCanvas(ctx as unknown as CanvasRenderingContext2D, point, 2);

    expect(ctx.arc).toHaveBeenCalledWith(80, 120, 2.5, 0, 2 * Math.PI);
    expect(ctx.fillStyle).toBe("#6b7280");
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

describe("saveAnnotatedPdf", () => {
  // jsdom has no canvas, so the ink is "drawn" into a 1 by 1 PNG, and its
  // Blob can't hand back its bytes, so they're read back with FileReader.
  const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
  });

  const bytesOf = (blob: Blob) => new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });

  it("adds the Draft's sheets with ink after the worksheet, at A4, and leaves empty sheets out", async () => {
    HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as never;
    HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
      callback({ arrayBuffer: async () => PNG.buffer } as unknown as Blob);
    };
    const ink: Stroke = { points: [[10, 10, 0.5], [90, 90, 0.5]], color: "#dc2626", size: 3 };

    const blob = await saveAnnotatedPdf(new ArrayBuffer(8), [], undefined, {
      0: [ink],
      [DRAFT_PAGE_BASE]: [ink],
      [DRAFT_PAGE_BASE + 1]: [],
      [DRAFT_PAGE_BASE + 2]: [ink],
    });

    const saved = await PDFDocument.load(await bytesOf(blob));
    const sizes = saved.getPages().map((page) => page.getSize());
    expect(sizes).toHaveLength(3);
    expect(sizes[0]).toEqual({ width: 300, height: 400 });
    expect(sizes[1].width).toBeCloseTo(DRAFT_SHEET_PT.width);
    expect(sizes[2].height).toBeCloseTo(DRAFT_SHEET_PT.height);
  });
});
