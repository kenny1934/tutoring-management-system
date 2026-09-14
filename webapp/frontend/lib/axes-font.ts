/**
 * A tiny stroke font for the numbers and letters on a pair of axes: the
 * digits 0 to 9, the minus sign, the decimal point, and the letters x and y.
 * The axes write their numbers in ink, so the numbers save, print, undo and
 * move with the lasso like everything else on the page, and that needs a font
 * made of lines, not one a browser draws.
 *
 * Each glyph is one or two lines through points, in a box as tall as the text
 * and no more than 0.6 of that wide, with y running down the page as it does
 * everywhere in lesson ink. Curves are runs of points round an ellipse. The
 * shapes are plain, after the Hershey "simplex" digits, which are public
 * domain, so they read from the back of a room.
 */
import type { Vec } from "./stroke-select";

/** One glyph: how wide it is, as a share of the text's height, and the lines that draw it, in the same share. */
interface Glyph {
  width: number;
  lines: Vec[][];
}

/**
 * Points round an ellipse centred at (cx, cy), from one angle to another, one
 * every 15 degrees or so. Angles are in degrees, clockwise from pointing right,
 * because y runs down the page, so 270 is the top of the ellipse.
 */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Vec[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 15));
  return Array.from({ length: steps + 1 }, (_, i): Vec => {
    const angle = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
}

// A six turned upside down is a nine, so the nine is made from the six.
const SIX: Vec[] = [...arc(0.32, 0.5, 0.28, 0.5, -60, -180), ...arc(0.3, 0.7, 0.28, 0.28, 180, -180)];
const upsideDown = (points: Vec[]): Vec[] => points.map(([x, y]) => [0.6 - x, 1 - y]);

export const GLYPHS: Record<string, Glyph> = {
  "0": { width: 0.6, lines: [arc(0.3, 0.5, 0.3, 0.5, 0, 360)] },
  "1": { width: 0.6, lines: [[[0.12, 0.22], [0.36, 0], [0.36, 1]]] },
  // Over the top from the left, down the right, then across the bottom.
  "2": { width: 0.6, lines: [[...arc(0.3, 0.28, 0.28, 0.28, 200, 390), [0, 1], [0.6, 1]]] },
  // A flat top, then the bowl.
  "3": { width: 0.6, lines: [[[0.05, 0], [0.55, 0], ...arc(0.28, 0.68, 0.3, 0.3, -90, 150)]] },
  "4": { width: 0.6, lines: [[[0.45, 1], [0.45, 0], [0, 0.7], [0.6, 0.7]]] },
  "5": { width: 0.6, lines: [[[0.55, 0], [0.1, 0], [0.05, 0.42], ...arc(0.28, 0.66, 0.3, 0.32, -120, 150)]] },
  // Down the left from the top right, then once round the loop at the bottom.
  "6": { width: 0.6, lines: [SIX] },
  "7": { width: 0.6, lines: [[[0, 0], [0.6, 0], [0.2, 1]]] },
  // Two loops that touch, the lower one a little bigger.
  "8": { width: 0.6, lines: [arc(0.3, 0.24, 0.24, 0.24, 90, 450), arc(0.3, 0.74, 0.29, 0.26, -90, 270)] },
  "9": { width: 0.6, lines: [upsideDown(SIX)] },
  "-": { width: 0.5, lines: [[[0.05, 0.5], [0.45, 0.5]]] },
  // A stroke of one point draws as a round dot.
  ".": { width: 0.2, lines: [[[0.1, 0.95]]] },
  "x": { width: 0.6, lines: [[[0.05, 0.25], [0.55, 0.75]], [[0.55, 0.25], [0.05, 0.75]]] },
  // The short arm meets the long one on the line the x sits on, and the long one carries on down.
  "y": { width: 0.6, lines: [[[0.05, 0.25], [0.31, 0.75]], [[0.58, 0.25], [0.18, 1]]] },
};

/** The space between one glyph and the next, as a share of the text's height. */
const GAP = 0.15;

export type TextAlign = "center" | "right";

/** The glyphs of a piece of text. A character the font doesn't have is left out. */
const glyphsOf = (text: string) => [...text].map((c) => GLYPHS[c]).filter((g): g is Glyph => g !== undefined);

/** How wide a piece of text is when it's written this tall, in the same units as the height. */
export function textWidth(text: string, height: number): number {
  const glyphs = glyphsOf(text);
  if (glyphs.length === 0) return 0;
  return (glyphs.reduce((sum, g) => sum + g.width, 0) + GAP * (glyphs.length - 1)) * height;
}

/**
 * The lines that write a piece of text `height` tall. The top of the text is
 * at `at[1]`. `at[0]` is where its middle or its right edge goes, as `align`
 * says.
 */
export function textStrokes(text: string, at: Vec, height: number, align: TextAlign): Vec[][] {
  const width = textWidth(text, height);
  let x = align === "center" ? at[0] - width / 2 : at[0] - width;
  const lines: Vec[][] = [];
  for (const glyph of glyphsOf(text)) {
    const left = x;
    for (const line of glyph.lines) lines.push(line.map(([gx, gy]): Vec => [left + gx * height, at[1] + gy * height]));
    x += (glyph.width + GAP) * height;
  }
  return lines;
}
