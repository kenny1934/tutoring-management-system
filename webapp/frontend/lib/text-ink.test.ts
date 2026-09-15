import { describe, it, expect } from "vitest";
import type { Stroke } from "@/hooks/useAnnotations";
import { eraseStrokes } from "./stroke-eraser";
import { insideLoop, resizeStrokes, strokesInLoop, textMidline } from "./stroke-select";
import { makeTextStrokes, textAt, textLayout, textWidth, wrapText } from "./text-ink";

// jsdom has no canvas, so text is measured by the estimate: a Chinese
// character is as wide as the writing's size, and anything else half that.
const PAGE = { pageWidth: 1000, pageHeight: 1000 };

describe("textWidth", () => {
  it("takes a Chinese character as wide as the size, and anything else as half of it", () => {
    expect(textWidth("AB", 20)).toBe(20);
    expect(textWidth("中文", 20)).toBe(40);
    expect(textWidth("∠ABC", 20, true)).toBe(40);
  });
});

describe("wrapText", () => {
  it("wraps Chinese between characters, but never before its punctuation", () => {
    const lines = wrapText("兩直線平行，同位角相等", 20, false, 110);
    expect(lines).toEqual(["兩直線平", "行，同位角", "相等"]);
  });

  it("wraps English only at its spaces", () => {
    expect(wrapText("alt. ∠s, AB // CD", 20, true, 100)).toEqual(["alt. ∠s,", "AB // CD"]);
  });

  it("keeps the line breaks the text already has", () => {
    expect(wrapText("a\n\nb", 20, false, 1000)).toEqual(["a", "", "b"]);
  });

  it("gives a word wider than the room a line to itself", () => {
    expect(wrapText("a verylongword b", 20, false, 60)).toEqual(["a", "verylongword", "b"]);
  });
});

describe("makeTextStrokes", () => {
  it("puts the first line's left edge at the tap, with its middle level with it", () => {
    const [stroke] = makeTextStrokes([{ text: "AB" }], [100, 200], { size: 20, color: "#000000", ...PAGE });
    expect(stroke).toEqual({
      points: [[100, 187.5, 0.5], [120, 212.5, 0.5]],
      color: "#000000",
      size: 1,
      kind: "text",
      text: "AB",
    });
  });

  it("puts the English over the Chinese, and marks only the English as italic", () => {
    const [en, zh] = makeTextStrokes(
      [{ text: "alt. ∠s", italic: true }, { text: "內錯角" }],
      [100, 200],
      { size: 20, color: "#2563eb", ...PAGE },
    );
    expect(en.points).toEqual([[100, 187.5, 0.5], [170, 212.5, 0.5]]);
    expect(en.italic).toBe(true);
    expect(zh.points).toEqual([[100, 212.5, 0.5], [160, 237.5, 0.5]]);
    expect(zh).not.toHaveProperty("italic");
  });

  it("moves text tapped into a corner as far as it takes to stay on the page", () => {
    const [stroke] = makeTextStrokes([{ text: "中文中文" }], [950, 990], { size: 20, color: "#000000", ...PAGE });
    expect(stroke.points).toEqual([[920, 975, 0.5], [1000, 1000, 0.5]]);
  });

  it("wraps a long reason before the page's right edge", () => {
    const text = "三角形的外角等於與它不相鄰的兩內角之和";
    const [stroke] = makeTextStrokes([{ text }], [0, 100], { size: 20, color: "#000000", pageWidth: 400, pageHeight: 1000 });
    const lines = stroke.text!.split("\n");
    expect(lines.length).toBe(2);
    expect(lines.join("")).toBe(text);
    expect(stroke.points[1][0]).toBeLessThanOrEqual(400);
  });

  it("leaves out a part with nothing but spaces", () => {
    expect(makeTextStrokes([{ text: "  " }], [100, 200], { size: 20, color: "#000000", ...PAGE })).toEqual([]);
  });
});

describe("textLayout", () => {
  const [stroke] = makeTextStrokes([{ text: "AB\nCD" }], [100, 200], { size: 20, color: "#000000", ...PAGE });

  it("gives each line an equal share of the box, the writing's size and a baseline", () => {
    const layout = textLayout(stroke);
    expect(layout.size).toBeCloseTo(20);
    expect(layout.lines.map((line) => line.text)).toEqual(["AB", "CD"]);
    expect(layout.lines.map((line) => line.x)).toEqual([100, 100]);
    expect(layout.lines[1].baseline - layout.lines[0].baseline).toBeCloseTo(25);
  });

  it("grows the writing with its box when the lasso resizes it", () => {
    const [bigger] = resizeStrokes([stroke], [100, 187.5], 2);
    expect(textLayout(bigger).size).toBeCloseTo(40);
    expect(bigger.text).toBe("AB\nCD");
  });
});

describe("textMidline and textAt", () => {
  const text: Stroke = { points: [[100, 100, 0.5], [200, 120, 0.5]], color: "#000000", size: 1, kind: "text", text: "Hi" };
  const pen: Stroke = { points: [[100, 100, 0.5], [200, 120, 0.5]], color: "#dc2626", size: 3 };

  it("gives points along the middle of the box", () => {
    expect(textMidline(text)).toEqual([[110, 110], [130, 110], [150, 110], [170, 110], [190, 110]]);
  });

  it("finds the text under a point, and ignores other ink", () => {
    expect(textAt([text, pen], [150, 110])).toBe(text);
    expect(textAt([pen], [150, 110])).toBeNull();
    expect(textAt([text], [250, 110])).toBeNull();
  });
});

describe("text under the eraser and the lasso", () => {
  const text: Stroke = { points: [[100, 100, 0.5], [300, 130, 0.5]], color: "#000000", size: 1, kind: "text", text: "Hello" };

  it("rubs out the whole of the text as soon as the eraser comes within reach of its box", () => {
    expect(eraseStrokes([text], [150, 90], [160, 90], 12)).toEqual([]);
    // A quick swipe right across it, which starts and ends outside the box.
    expect(eraseStrokes([text], [50, 115], [350, 115], 5)).toEqual([]);
  });

  it("leaves the text alone while the eraser stays out of reach", () => {
    const strokes = [text];
    expect(eraseStrokes(strokes, [150, 80], [160, 80], 12)).toBe(strokes);
  });

  it("lets a round loop catch text, even with the corners of its box outside the loop", () => {
    const loop = Array.from({ length: 24 }, (_, i): [number, number] => {
      const angle = (i / 24) * 2 * Math.PI;
      return [200 + 110 * Math.cos(angle), 115 + 25 * Math.sin(angle)];
    });
    expect(insideLoop([100, 100], loop)).toBe(false);
    expect(strokesInLoop([text], loop)).toEqual([text]);
  });
});
