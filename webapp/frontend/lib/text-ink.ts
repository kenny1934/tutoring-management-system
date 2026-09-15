/**
 * Text on a lesson page: the proof reasons a tutor places from the Pen Tray,
 * and whatever they type with the Text tool. Text is kept as a stroke with the
 * kind "text", so undo, clearing, saving, the lasso and moving ink to another
 * page all carry it without knowing it's text. Its two points are the
 * top-left and bottom-right corners of its box, and it carries its words, with
 * a line break between its lines.
 *
 * The box sets the size of the writing. Each line takes an equal share of the
 * box's height, so when the lasso resizes a text stroke, its writing grows or
 * shrinks with it, and there's only ever one thing saying how big it is.
 *
 * Every line is set in one list of fonts, and the browser takes each character
 * from the first font in it that has that character. The boards run Windows,
 * so letters and numbers come from Times New Roman, the symbols Times doesn't
 * have, such as ∠, △, ⊥ and ≅, come from Cambria Math, and Chinese comes from
 * SimSun, as in the textbooks. Only the English reasons are italic, and they
 * have no Chinese in them, so Chinese is never slanted.
 */
import { isText, type Stroke } from "@/hooks/useAnnotations";
import { boundingBox } from "./stroke-eraser";
import { fitOnPage, type Vec } from "./stroke-select";
import { CM } from "./drawing-guide";

export const TEXT_FONT = '"Times New Roman", "Cambria Math", SimSun, serif';

/** A line of text is this many times as tall as the size of its writing. */
export const TEXT_LINE_HEIGHT = 1.25;
// A line's baseline sits this far below the middle of the line, as a share of
// the writing's size, which puts a Chinese character in the middle of its line.
const BASELINE_BELOW_MIDDLE = 0.35;
// Text placed near the page's right edge wraps this far short of it. It never
// wraps narrower than MIN_WRAP_WIDTH, and moves left to stay on the page instead.
const EDGE_MARGIN = 0.5 * CM;
const MIN_WRAP_WIDTH = 6 * CM;

/** Some text to place, such as one language of a proof reason. */
export interface TextPart {
  text: string;
  /** Set for the English reasons, which are in italic, as the textbooks set them. */
  italic?: boolean;
}

/** The canvas font for text of a size, in the same fonts the screen uses. */
export function textFont(size: number, italic = false): string {
  return `${italic ? "italic " : ""}${size}px ${TEXT_FONT}`;
}

/** Whether a character is Chinese, Chinese punctuation or a full-width form. */
export function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x20000 && code <= 0x2ffff);
}

// Widths are measured once, at this size, and kept as a share of the size.
const MEASURE_SIZE = 100;
const widths = new Map<string, number>();
let measurer: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * How wide some text is at a size, in page units. It's measured on a canvas
 * in the text's own fonts, which is how the screen and the saved PDF write it.
 * Where there's no canvas to measure on, as in tests, a Chinese character is
 * taken to be as wide as the writing's size, and anything else half that.
 */
export function textWidth(text: string, size: number, italic = false): number {
  const key = `${italic ? "i" : "u"}${text}`;
  let share = widths.get(key);
  if (share === undefined) {
    if (measurer === undefined) {
      measurer = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
    }
    if (measurer) {
      measurer.font = textFont(MEASURE_SIZE, italic);
      share = measurer.measureText(text).width / MEASURE_SIZE;
    } else {
      share = [...text].reduce((sum, ch) => sum + (isCjk(ch) ? 1 : 0.5), 0);
    }
    widths.set(key, share);
  }
  return share * size;
}

// Chinese punctuation that mustn't start a line, and brackets that mustn't end one.
const NO_BREAK_BEFORE = "，。、：；！？）」』〉》…";
const NO_BREAK_AFTER = "（「『〈《";

/**
 * A line cut into the pieces it can wrap between. Chinese can wrap between
 * any two characters, except before its closing punctuation or after an
 * opening bracket. Anything else wraps only after a space, or where it meets
 * Chinese.
 */
function wrapPieces(line: string): string[] {
  const pieces: string[] = [];
  let piece = "";
  let prev = "";
  for (const ch of line) {
    const breakHere = piece !== "" && !NO_BREAK_AFTER.includes(prev) &&
      (isCjk(ch) ? !NO_BREAK_BEFORE.includes(ch) : isCjk(prev) && ch !== " ");
    if (breakHere) {
      pieces.push(piece);
      piece = "";
    }
    piece += ch;
    prev = ch;
    if (ch === " ") {
      pieces.push(piece);
      piece = "";
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/**
 * Text wrapped to a width, keeping the line breaks it already has. A piece
 * that's wider than the width on its own gets a line to itself.
 */
export function wrapText(text: string, size: number, italic: boolean, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const piece of wrapPieces(paragraph)) {
      if (line.trim() !== "" && textWidth((line + piece).trimEnd(), size, italic) > maxWidth) {
        lines.push(line.trimEnd());
        line = piece;
      } else {
        line += piece;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

interface TextLine {
  text: string;
  /** Where the line starts and where its baseline is, in page units. */
  x: number;
  baseline: number;
}

/** How big a text stroke's writing is, whether it's italic, and where each of its lines is written. */
export function textLayout(stroke: Stroke): { size: number; italic: boolean; lines: TextLine[] } {
  const box = boundingBox(stroke);
  const texts = (stroke.text ?? "").split("\n");
  const lineHeight = (box.bottom - box.top) / texts.length;
  const size = lineHeight / TEXT_LINE_HEIGHT;
  return {
    size,
    italic: stroke.italic === true,
    lines: texts.map((text, i) => ({
      text,
      x: box.left,
      baseline: box.top + lineHeight * (i + 0.5) + BASELINE_BELOW_MIDDLE * size,
    })),
  };
}

/** How wide text starting at x can be before it wraps, on a page this wide. */
export function wrapWidth(x: number, pageWidth: number): number {
  return Math.max(pageWidth - x - EDGE_MARGIN, MIN_WRAP_WIDTH);
}

interface TextOptions {
  /** The size of the writing, which is the height of a Chinese character, in page units. */
  size: number;
  color: string;
  /** The page's size. The text is kept inside it. */
  pageWidth: number;
  pageHeight: number;
}

/**
 * Text strokes for the given parts, one under another, as one piece of text
 * would be written: the left edge of the first line at `at`, and the middle
 * of the first line level with it. Each part wraps before it would run past
 * the page's right edge, and then the whole group moves as far as it takes to
 * stay on the page. A part with nothing but spaces in it is left out.
 *
 * A text stroke's width is 1. Nothing reads it, because the writing's size
 * comes from the box, but the server wants every stroke to have a width, and
 * 1 keeps the lasso's padding round selected text small.
 */
export function makeTextStrokes(parts: TextPart[], at: Vec, { size, color, pageWidth, pageHeight }: TextOptions): Stroke[] {
  const lineHeight = size * TEXT_LINE_HEIGHT;
  const room = wrapWidth(at[0], pageWidth);
  let bottom = at[1] - lineHeight / 2;
  const boxes = parts.filter((part) => part.text.trim() !== "").map((part) => {
    const italic = part.italic === true;
    const lines = wrapText(part.text, size, italic, room);
    const top = bottom;
    bottom += lines.length * lineHeight;
    return { top, bottom, width: Math.max(...lines.map((line) => textWidth(line, size, italic))), text: lines.join("\n"), italic };
  });
  if (boxes.length === 0) return [];

  const width = Math.max(...boxes.map((box) => box.width));
  const [dx, dy] = fitOnPage({ left: at[0], right: at[0] + width, top: boxes[0].top, bottom }, pageWidth, pageHeight);
  const left = at[0] + dx;
  return boxes.map((box): Stroke => ({
    points: [[left, box.top + dy, 0.5], [left + box.width, box.bottom + dy, 0.5]],
    color,
    size: 1,
    kind: "text",
    text: box.text,
    ...(box.italic ? { italic: true } : {}),
  }));
}

/** The text stroke under a point, the one on top where they overlap, or null. */
export function textAt(strokes: Stroke[], [x, y]: Vec): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (!isText(stroke)) continue;
    const box = boundingBox(stroke);
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return stroke;
  }
  return null;
}
