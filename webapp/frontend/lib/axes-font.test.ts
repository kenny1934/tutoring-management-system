import { describe, it, expect } from "vitest";
import { GLYPHS, textStrokes, textWidth } from "./axes-font";

const xs = (lines: [number, number][][]) => lines.flat().map(([x]) => x);

describe("the axes' stroke font", () => {
  it("has every character a pair of axes writes, and each one fits its box", () => {
    for (const c of "0123456789-.xy") {
      const glyph = GLYPHS[c];
      expect(glyph, `the glyph for "${c}"`).toBeDefined();
      expect(glyph.width).toBeLessThanOrEqual(0.6);
      for (const [x, y] of glyph.lines.flat()) {
        expect(x, `"${c}" across`).toBeGreaterThanOrEqual(-1e-9);
        expect(x, `"${c}" across`).toBeLessThanOrEqual(glyph.width + 1e-9);
        expect(y, `"${c}" down`).toBeGreaterThanOrEqual(-1e-9);
        expect(y, `"${c}" down`).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("writes the decimal point as a single dot", () => {
    expect(GLYPHS["."].lines).toHaveLength(1);
    expect(GLYPHS["."].lines[0]).toHaveLength(1);
  });

  it("adds up the width of a piece of text from its glyphs and the gaps between them", () => {
    // A minus sign, two digits and a decimal point, with three gaps of 0.15 between them.
    expect(textWidth("-2.5", 10)).toBeCloseTo((0.5 + 0.6 + 0.2 + 0.6 + 3 * 0.15) * 10);
    expect(textWidth("7", 10)).toBeCloseTo(6);
    expect(textWidth("", 10)).toBe(0);
  });

  it("ends right-aligned text where it's told, and centres centred text", () => {
    // The 2 runs right to the edge of its box along its bottom line.
    const right = textStrokes("12", [100, 0], 10, "right");
    expect(Math.max(...xs(right))).toBeCloseTo(100);
    expect(Math.min(...xs(right))).toBeGreaterThanOrEqual(100 - textWidth("12", 10));

    const centred = textStrokes("0", [50, 20], 10, "center");
    expect(Math.min(...xs(centred))).toBeCloseTo(47);
    expect(Math.max(...xs(centred))).toBeCloseTo(53);
    const ys = centred.flat().map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(20);
    expect(Math.max(...ys)).toBeCloseTo(30);
  });
});
