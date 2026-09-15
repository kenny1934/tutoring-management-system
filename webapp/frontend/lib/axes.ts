/**
 * A pair of numbered axes for the Draft, worked out without a screen: the
 * settings a tutor picks, how each board remembers them, where the axes
 * cross, and the ink that draws them.
 *
 * The squares on the Draft are always a centimetre, and a tick is drawn at
 * every square, so on squared paper the ticks always sit on the lines. The
 * settings only change the numbers written beside the ticks, and how far each
 * axis runs. That's why an axis's ends are kept in squares, counted from the
 * origin. Changing what a square is worth then keeps the axis the same length
 * on the sheet and changes its numbers, so x from −5 to 5 at 1 a square
 * becomes −10 to 10 at 2 a square.
 *
 * The axes are drawn as ordinary ink in one change, so undo, the eraser, the
 * lasso, saving and the PDF all work on them without knowing they're axes.
 * The two axis lines are pencil ink, so straight lines and the tools snap
 * onto their ends and onto the origin where they cross. The ticks, arrowheads,
 * numbers and letters are scale ink, whose own ends never snap. Where a tick
 * crosses its axis still does, as a tick point (see lib/snap).
 */
import { makeStroke, type Stroke } from "@/hooks/useAnnotations";
import { INK_SIZES, INK_SWATCHES } from "@/hooks/useAnnotationTools";
import { CM } from "./drawing-guide";
import { DRAFT_SHEET, DRAFT_SQUARE } from "./draft-sheets";
import { textStrokes, textWeights, textWidth } from "./axes-font";
import { nearestCorner } from "./snap";
import { clamp, type Vec } from "./stroke-select";

export type AxisName = "x" | "y";

/** The values one square can stand for, from smallest to largest. */
export const PER_SQUARE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100] as const;

/** How often a number is written beside the ticks: on every square, every 2, every 5, or none at all, which is 0. */
export const NUMBERING = [1, 2, 5, 0] as const;
export type Numbering = (typeof NUMBERING)[number];

export interface AxisSettings {
  /** Where the axis starts, in squares from the origin, so 0 or below. */
  from: number;
  /** Where the axis ends, in squares from the origin, so 1 or above. Its arrow goes half a square further on. */
  to: number;
  /** What one square stands for, one of PER_SQUARE. */
  perSquare: number;
  /** A number on every this many squares, or none at 0. */
  numbers: Numbering;
}

export type AxesSettings = Record<AxisName, AxisSettings>;

/**
 * The longest each axis can be, in squares. That's what fits on the A4 sheet,
 * 21 by 29.7 cm, with room left for the arrows.
 */
export const MOST_SQUARES: Record<AxisName, number> = { x: 20, y: 28 };

export const DEFAULT_AXES: AxesSettings = {
  x: { from: -5, to: 5, perSquare: 1, numbers: 1 },
  y: { from: -5, to: 5, perSquare: 1, numbers: 1 },
};

// ---------- The settings ----------

// Each board remembers the axes it drew last, the way it remembers the compasses' width.
const STORAGE_KEY = "csm_draft_axes";

const isWhole = (value: unknown, low: number, high: number): value is number =>
  Number.isInteger(value) && (value as number) >= low && (value as number) <= high;

/** One axis's settings as they were stored, with anything missing or out of range put back to its default. */
function checkedAxis(stored: unknown, axis: AxisName): AxisSettings {
  const usual = DEFAULT_AXES[axis];
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof AxisSettings, unknown>>;
  const most = MOST_SQUARES[axis];
  let from = isWhole(raw.from, 1 - most, 0) ? raw.from : usual.from;
  let to = isWhole(raw.to, 1, most) ? raw.to : usual.to;
  // Two ends that are each fine by themselves can still make an axis too long for the sheet.
  if (to - from > most) ({ from, to } = usual);
  return {
    from,
    to,
    perSquare: (PER_SQUARE as readonly unknown[]).includes(raw.perSquare) ? (raw.perSquare as number) : usual.perSquare,
    numbers: (NUMBERING as readonly unknown[]).includes(raw.numbers) ? (raw.numbers as Numbering) : usual.numbers,
  };
}

/**
 * The axes this board drew last, or the usual ones. Every field is checked,
 * as readToolSize in lib/tool-size checks a tool's size, and anything that's
 * missing or out of range falls back to its default.
 */
export function readAxesSettings(): AxesSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return { x: checkedAxis(stored?.x, "x"), y: checkedAxis(stored?.y, "y") };
  } catch {
    return DEFAULT_AXES;
  }
}

/** Remember the axes' settings on this board. */
export function saveAxesSettings(settings: AxesSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private window */ }
}

/**
 * The lowest and highest each end of an axis can go, in squares, given where
 * the other end is. The axis has to reach 0 from both sides, so that the two
 * axes cross at the origin, and it can't be longer than the sheet allows.
 */
export function endLimits(axis: AxisName, settings: AxisSettings): Record<"from" | "to", [number, number]> {
  const most = MOST_SQUARES[axis];
  return { from: [settings.to - most, 0], to: [1, settings.from + most] };
}

/**
 * An axis with one of its ends moved to this many squares from the origin.
 * It's rounded to a whole square, the way a width typed for the compasses is
 * rounded to a millimetre, and kept within the end's limits.
 */
export function withEnd(axis: AxisName, settings: AxisSettings, end: "from" | "to", squares: number): AxisSettings {
  const [low, high] = endLimits(axis, settings)[end];
  return { ...settings, [end]: clamp(Math.round(squares), low, high) };
}

/** The next value a square can stand for, down or up the list, stopping at either end of it. */
export function stepPerSquare(perSquare: number, direction: -1 | 1): number {
  const index = PER_SQUARE.indexOf(perSquare as (typeof PER_SQUARE)[number]);
  return PER_SQUARE[clamp(index + direction, 0, PER_SQUARE.length - 1)];
}

/**
 * The value on the list nearest to one that was typed, measured as a ratio,
 * so 3 goes to 2 and 4 goes to 5. It's null when what was typed isn't a
 * number above 0.
 */
export function nearestPerSquare(typed: number): number | null {
  if (!(typed > 0) || !Number.isFinite(typed)) return null;
  const off = (value: number) => Math.abs(Math.log(value / typed));
  return PER_SQUARE.reduce((best, value) => (off(value) < off(best) ? value : best), PER_SQUARE[0]);
}

/**
 * A number as the axes write it: the value that many squares from the origin
 * stands for. It's written without the noise of binary fractions, so three
 * squares at 0.1 each is 0.3, not 0.30000000000000004, and a whole number
 * never gets a ".0".
 */
export function axisNumber(squares: number, perSquare: number): string {
  const decimals = perSquare < 1 ? 1 : 0;
  return String(Number((squares * perSquare).toFixed(decimals)));
}

// ---------- Where the axes go ----------

/**
 * Where a pair of axes is on the page, and what a square is worth along each
 * of them. Together, those say where any point on the graph lands on the page.
 */
export interface AxesFrame {
  origin: Vec;
  /** A square, in page units. */
  square: number;
  perSquare: Record<AxisName, number>;
}

export function axesFrame(origin: Vec, settings: AxesSettings): AxesFrame {
  return { origin, square: DRAFT_SQUARE, perSquare: { x: settings.x.perSquare, y: settings.y.perSquare } };
}

/** Where the point (x, y) on the graph lands on the page. Up the graph is up the page, where page y gets smaller. */
export function toPage(frame: AxesFrame, x: number, y: number): Vec {
  return [
    frame.origin[0] + (x / frame.perSquare.x) * frame.square,
    frame.origin[1] - (y / frame.perSquare.y) * frame.square,
  ];
}

/**
 * Where the axes cross for a finger at `point`, in page units. On blank
 * paper it's the point itself. On squared paper it's the nearest corner of
 * the squares on the sheet, however far away that is, because the ticks have
 * to sit on the lines. It's the same corner that lines snap to, found by
 * lib/snap, so a line ended on the origin lands exactly on it.
 */
export function axesOrigin(point: Vec, squared: boolean): Vec {
  return squared ? nearestCorner(point, { spacing: DRAFT_SQUARE, ...DRAFT_SHEET }) : point;
}

// ---------- What gets drawn ----------

// The marks' sizes, in centimetres.
/** How far a tick reaches on each side of its axis. */
const TICK_CM = 0.15;
/** How long each arm of an arrowhead is. They open at 30 degrees either side of the axis. */
const ARROW_CM = 0.3;
const NUMBER_CM = 0.35;
/**
 * How far a number sits from its axis: its top below the x axis, and its
 * right-hand end left of the y axis. The ticks reach 0.15 cm, so this leaves
 * a clear gap between a number and the end of its tick.
 */
const NUMBER_GAP_CM = 0.25;
/**
 * How tall a letter's box is. Only the middle half of it is the letter's
 * x-height, so an x comes out a little under the height of a digit, as it
 * does on a textbook's axes. At this size, the pen that writes the numbers
 * matches the thick strokes of Times New Roman Italic, and half of it matches
 * the hairlines.
 */
const LETTER_CM = 0.6;
const LETTER_GAP_CM = 0.2;
/** How far down its box a letter's x and the short arm of its y sit on their line, as a share of its height. */
const LETTER_BASELINE = 0.75;

// Lengths along an axis, in squares.
/** How far past the last square an axis runs, to the tip of its arrow. */
const ARROW_ROOM = 0.5;
/** How far short of the sheet's edge an axis stops when there isn't room for all of it. */
const EDGE_ROOM = 0.5;

/** The axes are drawn in the Grey pencil's colour. */
const AXES_COLOUR = INK_SWATCHES.find((swatch) => swatch.kind === "pencil")!.color;
/** The axis lines are the pencil's medium width, and every mark on them is its finest. */
const LINE_SIZE = INK_SIZES.pencil.M;
const MARK_SIZE = INK_SIZES.pencil.S;

/**
 * One part of a pair of axes, and the lines that draw it, in page units. The
 * axis lines are drawn in pencil ink, and every other part in scale ink.
 */
export interface AxesPart {
  role: "axis" | "tick" | "arrow" | "number" | "letter" | "origin";
  /** Which axis it belongs to. The 0 at the origin belongs to both, so it leaves this out. */
  axis?: AxisName;
  /** For a tick or a number, how many squares from the origin it is. */
  square?: number;
  /** For a number or a letter, what it says. */
  text?: string;
  lines: Vec[][];
  /**
   * For a letter, how heavy each line is, as a share of the pen the marks are
   * drawn with, because its hairlines are thinner than its thick strokes.
   * Every other part's lines are the full weight.
   */
  weights?: number[];
}

const onSheet = (lines: Vec[][]) =>
  lines.every((line) => line.every(([x, y]) => x >= 0 && y >= 0 && x <= DRAFT_SHEET.width && y <= DRAFT_SHEET.height));

const keepOnSheet = ([x, y]: Vec): Vec => [clamp(x, 0, DRAFT_SHEET.width), clamp(y, 0, DRAFT_SHEET.height)];

/** The parts of one axis. */
function axisParts(axis: AxisName, frame: AxesFrame, settings: AxisSettings): AxesPart[] {
  const { origin, square } = frame;
  // A point along the axis, so many squares from the origin, moved `across` page units to one side of it.
  const at = (squares: number, across = 0): Vec => {
    const [x, y] = axis === "x" ? toPage(frame, squares * settings.perSquare, 0) : toPage(frame, 0, squares * settings.perSquare);
    return axis === "x" ? [x, y + across] : [x + across, y];
  };

  // How many squares there's room for on each side of the origin, stopping
  // half a square short of the sheet's edge. The x axis runs to the right,
  // and the y axis runs up the page.
  const edge = EDGE_ROOM * square;
  const ahead = axis === "x" ? (DRAFT_SHEET.width - edge - origin[0]) / square : (origin[1] - edge) / square;
  const behind = axis === "x" ? (origin[0] - edge) / square : (DRAFT_SHEET.height - edge - origin[1]) / square;
  const start = Math.min(0, Math.max(settings.from, -behind));
  const tip = Math.max(0, Math.min(settings.to + ARROW_ROOM, ahead));
  if (tip - start <= 0) return [];

  const parts: AxesPart[] = [{ role: "axis", axis, lines: [[at(start), at(tip)]] }];

  // A tick at every square, except at the origin, where the other axis
  // crosses. Near the tip there has to be room for the arrowhead, so a tick
  // that would sit under it is left off, along with its number.
  const lastTick = Math.min(settings.to, Math.floor(tip - (ARROW_CM * CM) / square + 1e-9));
  const numberHeight = NUMBER_CM * CM;
  for (let n = Math.ceil(start - 1e-9); n <= lastTick; n++) {
    if (n === 0) continue;
    parts.push({
      role: "tick", axis, square: n,
      lines: [[keepOnSheet(at(n, -TICK_CM * CM)), keepOnSheet(at(n, TICK_CM * CM))]],
    });
    if (settings.numbers === 0 || n % settings.numbers !== 0) continue;
    const text = axisNumber(n, settings.perSquare);
    const [x, y] = at(n);
    // Along the x axis, a negative number's minus sign hangs out to its left,
    // as it does in a textbook, so its digits sit centred under the tick.
    // Centring the whole of "−0.5" would push it so close to the 0 at the
    // origin that the two would read as "−0.50".
    const hang = text.startsWith("-") ? (textWidth(text, numberHeight) - textWidth(text.slice(1), numberHeight)) / 2 : 0;
    const lines = axis === "x"
      ? textStrokes(text, [x - hang, y + NUMBER_GAP_CM * CM], numberHeight, "center")
      : textStrokes(text, [x - NUMBER_GAP_CM * CM, y - numberHeight / 2], numberHeight, "right");
    // A number that would run off the sheet is left off.
    if (onSheet(lines)) parts.push({ role: "number", axis, square: n, text, lines });
  }

  // An open arrowhead at the positive end, and the axis's letter beside it.
  if (tip > 0) {
    const back = (ARROW_CM * CM * Math.cos(Math.PI / 6)) / square;
    const side = ARROW_CM * CM * Math.sin(Math.PI / 6);
    parts.push({
      role: "arrow", axis,
      lines: [[keepOnSheet(at(tip - back, -side)), at(tip), keepOnSheet(at(tip - back, side))]],
    });
    // The x goes just below the tip of its arrow. The y goes just left of the
    // tip of its arrow, sitting on the tip's level, so its tail stays clear of
    // the top number on the axis.
    const [x, y] = at(tip);
    const letterHeight = LETTER_CM * CM;
    const lines = axis === "x"
      ? textStrokes("x", [x, y + LETTER_GAP_CM * CM], letterHeight, "center")
      : textStrokes("y", [x - LETTER_GAP_CM * CM, y - LETTER_BASELINE * letterHeight], letterHeight, "right");
    if (onSheet(lines)) parts.push({ role: "letter", axis, text: axis, lines, weights: textWeights(axis) });
  }
  return parts;
}

/**
 * Every part of a pair of axes crossing at `origin`, kept to the sheet. Where
 * the tap leaves less room than an axis needs, the axis stops half a square
 * short of the sheet's edge and its arrow goes there. The ticks and numbers
 * beyond that are left off, and so is any number that would run off the sheet.
 */
export function axesParts(origin: Vec, settings: AxesSettings): AxesPart[] {
  const frame = axesFrame(origin, settings);
  const parts = [...axisParts("x", frame, settings.x), ...axisParts("y", frame, settings.y)];
  // One 0 marks the origin, below and to the left of the crossing, and
  // neither axis writes it again. With no numbers on either axis, there's no 0 either.
  if (settings.x.numbers !== 0 || settings.y.numbers !== 0) {
    const gap = NUMBER_GAP_CM * CM;
    const lines = textStrokes("0", [origin[0] - gap, origin[1] + gap], NUMBER_CM * CM, "right");
    if (onSheet(lines)) parts.push({ role: "origin", text: "0", lines });
  }
  return parts;
}

/** The ink for a pair of axes crossing at `origin`, drawn all at once as one change. */
export function axesStrokes(origin: Vec, settings: AxesSettings): Stroke[] {
  return axesParts(origin, settings).flatMap((part) =>
    part.lines.map((line, i) =>
      makeStroke(
        line.map(([x, y]): Stroke["points"][number] => [x, y, 0.5]),
        AXES_COLOUR,
        part.role === "axis" ? LINE_SIZE : MARK_SIZE * (part.weights?.[i] ?? 1),
        part.role === "axis" ? "pencil" : "scale",
      ),
    ),
  );
}
