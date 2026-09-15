/**
 * A tiny stroke font for the numbers and letters on a pair of axes: the
 * digits 0 to 9, the minus sign, the decimal point, the degree sign, and the
 * letters x and y.
 * The axes write their numbers in ink, so the numbers save, print, undo and
 * move with the lasso like everything else on the page, and that needs a font
 * made of lines, not one a browser draws.
 *
 * Each glyph is a few lines through points, in a box as tall as the text and
 * no more than 0.6 of that wide, with y running down the page as it does
 * everywhere in lesson ink. The digits are one or two lines each, and their
 * curves are runs of points round an ellipse. Their shapes are plain, after
 * the Hershey "simplex" digits, which are public domain, so they read from
 * the back of a room. The letters are italic, like the x and y in a maths
 * book, traced from Times New Roman Italic, with thick strokes, thinner
 * hairlines and round ends.
 */
import type { Vec } from "./stroke-select";

/** One glyph: how wide it is, as a share of the text's height, and the lines that draw it, in the same share. */
interface Glyph {
  width: number;
  lines: Vec[][];
  /**
   * How heavy each line is, as a share of the pen the text is written with,
   * for a glyph whose lines aren't all one weight. Left out, every line is
   * the full weight.
   */
  weights?: number[];
  /** The space before it, as a share of the text's height, for a glyph that sits closer to the one before than GAP. */
  gapBefore?: number;
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

/**
 * A traced line with its corners rounded off, by cutting each corner a
 * quarter of the way along the lines either side of it, twice over. Its ends
 * stay where they are.
 */
function smooth(points: Vec[]): Vec[] {
  let line = points;
  for (let round = 0; round < 2; round++) {
    const next: Vec[] = [line[0]];
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = line[i];
      const [bx, by] = line[i + 1];
      next.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    next.push(line[line.length - 1]);
    line = next;
  }
  return line;
}

// The letters' points are traced along the middle of each stroke of Times New
// Roman Italic, in the font's own units: 2048 to the em, with y running up
// from the baseline. The font's x-height of 881 fills the middle half of the
// glyph box, so the baseline is three quarters of the way down, and the tail
// of the y reaches the bottom. `left` is the font's leftmost ink for the
// letter, which goes at the left of the box. A single point is a round end,
// drawn as a dot.
const TIMES_UNIT = 0.5 / 881;
const trace = (left: number, points: Vec[]): Vec[] => {
  const line = points.map(([x, y]): Vec => [(x - left) * TIMES_UNIT, 0.75 - y * TIMES_UNIT]);
  return line.length > 1 ? smooth(line) : line;
};
/** The weight of a letter's hairlines, as a share of the pen the text is written with. */
const HAIRLINE = 0.5;

const ITALIC_X: Glyph = {
  width: 0.55,
  lines: [
    // The flag at the top left, the thick stroke down from it, and the hook at its foot.
    trace(-72, [[90, 842], [200, 836], [290, 848], [335, 872]]),
    trace(-72, [[335, 872], [365, 790], [414, 612], [470, 375], [513, 200], [548, 70]]),
    trace(-72, [[548, 70], [585, 25], [650, 35], [730, 110], [795, 210]]),
    // The hairline across it, and the round ends at either end of it.
    trace(-72, [
      [10, 58], [70, 45], [120, 50], [200, 110], [300, 250], [370, 385],
      [496, 578], [550, 665], [600, 737], [650, 790], [700, 822], [760, 835],
    ]),
    trace(-72, [[-18, 58]]),
    trace(-72, [[846, 827]]),
  ],
  weights: [HAIRLINE, 1, HAIRLINE, HAIRLINE, 1, 1],
};

const ITALIC_Y: Glyph = {
  width: 0.6,
  lines: [
    // The flag at the top left, and the thick short arm down from it to where it meets the long stroke.
    trace(-160, [[42, 815], [120, 805], [200, 808], [280, 840], [325, 876]]),
    trace(-160, [[325, 876], [322, 700], [331, 598], [345, 450], [357, 300], [370, 150], [378, 40]]),
    // The long stroke, from under the round end at the top right down into the tail, which ends in a round end too.
    trace(-160, [
      [815, 760], [840, 690], [786, 541], [646, 334], [474, 106], [290, -119], [200, -217], [120, -300], [50, -350], [0, -385],
    ]),
    trace(-160, [[807, 808]]),
    trace(-160, [[-88, -352]]),
  ],
  weights: [HAIRLINE, 1, HAIRLINE, 1, 1],
};

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
  // A small ring level with the top of the digits, drawn at the hairlines'
  // weight so it stays open in the middle. It sits close to the number, as it
  // does in print, which keeps a number such as 270° from running into the next.
  "°": { width: 0.3, lines: [arc(0.15, 0.15, 0.13, 0.13, 0, 360)], weights: [HAIRLINE], gapBefore: 0 },
  "x": ITALIC_X,
  "y": ITALIC_Y,
};

/** The space between one glyph and the next, as a share of the text's height. */
const GAP = 0.15;

export type TextAlign = "center" | "right";

/** The glyphs of a piece of text. A character the font doesn't have is left out. */
const glyphsOf = (text: string) => [...text].map((c) => GLYPHS[c]).filter((g): g is Glyph => g !== undefined);

/** The space before the `i`th glyph of some text, as a share of the text's height. */
const gapBefore = (glyph: Glyph, i: number) => (i === 0 ? 0 : glyph.gapBefore ?? GAP);

/** How wide a piece of text is when it's written this tall, in the same units as the height. */
export function textWidth(text: string, height: number): number {
  return glyphsOf(text).reduce((sum, g, i) => sum + gapBefore(g, i) + g.width, 0) * height;
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
  glyphsOf(text).forEach((glyph, i) => {
    const left = x + gapBefore(glyph, i) * height;
    for (const line of glyph.lines) lines.push(line.map(([gx, gy]): Vec => [left + gx * height, at[1] + gy * height]));
    x = left + glyph.width * height;
  });
  return lines;
}

/**
 * How heavy each of the lines that textStrokes gives for this text is, in the
 * same order, as a share of the pen the text is written with.
 */
export function textWeights(text: string): number[] {
  return glyphsOf(text).flatMap((glyph) => glyph.weights ?? glyph.lines.map(() => 1));
}
