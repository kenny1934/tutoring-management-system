"use client";

import { Fragment, useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo, useId, memo } from "react";
import getStroke from "perfect-freehand";
import { INK, INK_ORDER, getStrokeOptions, inkLayers, isText, kindOf, makeStroke, strokeOpacity } from "@/hooks/useAnnotations";
import type { InkKind, PageAnnotations, PenKind, Stroke } from "@/hooks/useAnnotations";
import { useStableKeyboardHandler } from "@/hooks/useStableKeyboardHandler";
import { boundingBox, eraseStrokes, type Box } from "@/lib/stroke-eraser";
import { TEXT_FONT, TEXT_LINE_HEIGHT, indexOfText, isCjk, makeTextStrokes, textAt, textLayout, type TextPart } from "@/lib/text-ink";
import { hasBrowserModifier, isTypingTarget } from "@/lib/lesson-utils";
import {
  clampMove, clampScale, dragScale, fitOnPage, moveStrokes, recolourStrokes, resizeStrokes, selectionBounds, strokesInLoop,
  type Vec,
} from "@/lib/stroke-select";
import { TEXT_SIZES, type InkSwatch } from "@/hooks/useAnnotationTools";
import { registerInkPage, type DrivenLine, type InkPage } from "@/hooks/useInkPages";
import { usePlacingPress } from "@/hooks/usePlacingPress";
import { snapOnPage } from "@/lib/snap";
import { CM, clipPointsToPage, type DrawingGuide, type GuidedLine } from "@/lib/drawing-guide";
import { LassoSelection, SELECTION_BAR_ROOM, type SelectionDragKind } from "./LassoSelection";
import { TextBox } from "./TextBox";

interface AnnotationLayerProps {
  /** Page width in CSS pixels */
  width: number;
  /** Page height in CSS pixels */
  height: number;
  /** Existing strokes for this page */
  strokes: Stroke[];
  /** Whether pen drawing mode is active */
  isDrawing: boolean;
  /** Whether eraser mode is active */
  isErasing: boolean;
  /**
   * Radius of the rubbing eraser, in the same units as the strokes. Leave it
   * out, or pass null, for the whole-stroke eraser, where tapping a stroke
   * removes all of it.
   */
  eraserRadius?: number | null;
  /** Current pen color */
  penColor: string;
  /** Current pen size */
  penSize: number;
  /** Whether new strokes are pen, pencil or highlighter ink. Defaults to pen. */
  inkKind?: PenKind;
  /**
   * Draw a straight line from where the finger goes down to where it lifts.
   * Either end that comes within half a centimetre of a point in the pen ink,
   * such as a dot or where two lines cross, lands exactly on that point.
   */
  straight?: boolean;
  /**
   * Draw fading ink, for pointing. Its marks fade away a few seconds after you
   * stop, and they never reach onStrokesChange, so they're never saved.
   */
  fading?: boolean;
  /**
   * The lasso is picked. A loop drawn round some ink selects it, and the
   * selection can then be moved, resized from its corner, recoloured or deleted.
   */
  isSelecting?: boolean;
  /** Called when strokes change (new stroke added or stroke removed) */
  onStrokesChange: (strokes: Stroke[]) => void;
  /** Hide strokes visually (drawing still works) */
  hidden?: boolean;
  /**
   * True while two fingers are scrolling or zooming the page. Any line or rub
   * that the first finger had started is thrown away, because it was the
   * start of that gesture, not something you meant to draw.
   */
  suspended?: boolean;
  /**
   * How much the page is scaled on screen, which is the zoom of the worksheet
   * or the Draft. The lasso's handle and its bar of buttons are divided by
   * it, so they stay the size of a finger at any zoom.
   */
  uiScale?: number;
  /**
   * The tools lying on this pane, such as the ruler and the protractor. A line
   * that starts where one of them guides it, such as just outside the ruler's
   * edge, runs against that tool.
   */
  guides?: ReadonlySet<DrawingGuide>;
  /**
   * The size of the page's squares, in page units, when it's squared paper.
   * Straight lines and the tools then snap to the squares' corners as well as
   * to the ink.
   */
  gridSpacing?: number;
  /**
   * This page's index in the exercise's annotations, its name, and a way to
   * save several pages as one change. With all three, ink the lasso selects
   * can be moved to any other page given the same onPagesChange, on the
   * worksheet or in the Draft, and one undo brings it back.
   */
  pageIndex?: number;
  /** What the Move list calls this page, such as "Page 3" or "Draft sheet 2". */
  pageLabel?: string;
  onPagesChange?: (pages: PageAnnotations) => void;
  /**
   * False until the lessons' saved ink has loaded. The Pen Tray stays on the
   * Hand until then, and a tool such as the compasses, which draws whatever
   * is picked, draws nothing either, so a new line can't replace ink the page
   * hasn't received yet. Defaults to true.
   */
  inkReady?: boolean;
  /**
   * The Text tool is picked. A tap on the page opens a box there to type in,
   * and a tap on text already on the page opens it to change it.
   */
  isTyping?: boolean;
  /** How new text looks: the size of its writing, in page units, and its colour. */
  textStyle?: { size: number; color: string };
  /**
   * A proof reason waiting to be placed. Whatever tool is picked, a finger on
   * the page shows it faintly under the finger, and lifting the finger puts
   * it there, as one change.
   */
  placingText?: TextPart[] | null;
  /** Called once the waiting reason has been placed on this page. */
  onTextPlaced?: () => void;
}

type Point = Stroke["points"][number];

/**
 * Fading ink is bright red, like a laser pointer, and a little thicker than a
 * medium pen so it shows up from the back of the room. Its marks stay while
 * you keep pointing, then fade out together a few seconds after your last one.
 */
const FADING_INK = { color: "#ef4444", size: 8 };
const FADE_DELAY = 3000;
const FADE_DURATION = 600;

// Every page's fading ink fades together, so marks on two pages both stay
// while you keep pointing on either of them. Each page's layer listens here.
// "hold" means a finger went down with fading ink, and "release" means it lifted.
type FadeSignal = "hold" | "release";
const fadeListeners = new Set<(signal: FadeSignal) => void>();
const signalFade = (signal: FadeSignal) => fadeListeners.forEach((listen) => listen(signal));

// A straight line within this many degrees of level or upright is snapped to
// it, because number lines and underlines are meant to be exactly level, and
// a finger on a vertical board rarely is.
const SNAP_DEGREES = 5;

// A pen stroke whose points all have a pressure of exactly 0.5 has its
// pressure worked out from its speed, which would make an arc drawn against
// the protractor thicken and thin. A steady 0.51 counts as real pressure, so
// the arc is drawn one width all along, a hair wider than the pen's size.
const STEADY_PRESSURE = 0.51;

/** Where a straight line from start towards the pointer ends, snapped level or upright when it's nearly there. */
function straightLineEnd(start: Point, pointer: Point): Point {
  const angle = Math.abs((Math.atan2(pointer[1] - start[1], pointer[0] - start[0]) * 180) / Math.PI);
  if (angle < SNAP_DEGREES || angle > 180 - SNAP_DEGREES) return [pointer[0], start[1], pointer[2]];
  if (Math.abs(angle - 90) < SNAP_DEGREES) return [start[0], pointer[1], pointer[2]];
  return pointer;
}

// Only one page holds a selection at a time. A layer that starts a new loop
// tells the others, on the worksheet and in the Draft, to let go of theirs.
const lassoListeners = new Set<(from: string) => void>();

// Only one page has a text box open at a time. A layer that opens one tells
// the others, on the worksheet and in the Draft, to put their text on the page.
const typingListeners = new Set<(from: string) => void>();

const DEFAULT_TEXT_STYLE = { size: TEXT_SIZES.M, color: "#000000" };

/** The Text tool's box while it's open. */
interface TextEditor {
  /** Where the text starts: the left edge of its first line, and the middle of that line. */
  at: Vec;
  size: number;
  color: string;
  italic: boolean;
  /** What's typed so far. */
  text: string;
  /** The text stroke being changed, which is hidden while its box is open, or null for new text. */
  editing: Stroke | null;
}

// The lasso's loop and the glow round selected ink are in the tray's brown.
const LASSO_COLOUR = "#a0704b";
const SELECTED_GLOW = "drop-shadow(0 0 3px rgba(160, 112, 75, 0.9))";

/** Ink the lasso has selected. */
interface InkSelection {
  strokes: Stroke[];
  /** The box round the selected strokes' centre lines. A move or a resize keeps it on the page. */
  bounds: Box;
  /** Half the widest selected stroke's width, which is how far its ink reaches past the centre line. */
  reach: number;
  /** The bar of buttons goes under the box, because the ink is near the top of the page. */
  below: boolean;
  /** Scroll the box into view once it shows, for ink that has just been moved here from another page. */
  reveal: boolean;
}

/** A move or a resize of the selection, as far as the finger has taken it. */
type SelectionDrag = { kind: "move"; dx: number; dy: number } | { kind: "resize"; scale: number };

/**
 * Convert perfect-freehand outline points to an SVG path string. A one-point
 * stroke still has a full outline, a small circle, so it draws as a dot.
 */
export function getSvgPathFromStroke(outlinePoints: [number, number][]): string {
  if (outlinePoints.length < 2) return "";

  const d: string[] = [];
  d.push(`M ${outlinePoints[0][0].toFixed(2)} ${outlinePoints[0][1].toFixed(2)}`);

  for (let i = 1; i < outlinePoints.length - 1; i++) {
    const cp = outlinePoints[i];
    const next = outlinePoints[i + 1];
    const mx = ((cp[0] + next[0]) / 2).toFixed(2);
    const my = ((cp[1] + next[1]) / 2).toFixed(2);
    d.push(`Q ${cp[0].toFixed(2)} ${cp[1].toFixed(2)} ${mx} ${my}`);
  }

  d.push("Z");
  return d.join(" ");
}

const coord = (n: number) => n.toFixed(2);

/**
 * The SVG path for a finished stroke. Most ink is the outline that
 * perfect-freehand builds around its points, filled in. Exact ink, the marks
 * and numbers on a pair of axes, is instead a line of the stroke's width
 * joining its points, which `line` says, and inkPaint draws it with rounded
 * corners and ends. An outline folds back on itself at a corner as sharp as
 * the one in a 4, and the fill leaves the folded parts out, so parts of those
 * digits came out faint. A single point of exact ink, such as a decimal
 * point, is a filled dot the stroke's width across.
 */
function strokeShape(stroke: Stroke): { d: string; line: boolean } {
  if (!INK[kindOf(stroke)].exact) {
    return { d: getSvgPathFromStroke(getStroke(stroke.points, getStrokeOptions(stroke, true))), line: false };
  }
  const [first, ...rest] = stroke.points;
  if (!first) return { d: "", line: false };
  const [x, y] = first;
  if (rest.length === 0) {
    const r = stroke.size / 2;
    return {
      d: `M ${coord(x - r)} ${coord(y)} a ${coord(r)} ${coord(r)} 0 1 0 ${coord(2 * r)} 0 a ${coord(r)} ${coord(r)} 0 1 0 ${coord(-2 * r)} 0 Z`,
      line: false,
    };
  }
  return { d: [`M ${coord(x)} ${coord(y)}`, ...rest.map(([px, py]) => `L ${coord(px)} ${coord(py)}`)].join(" "), line: true };
}

/** How a stroke's shape is painted: an outline or a dot is filled, and a line is stroked at the stroke's width. */
function inkPaint(stroke: Stroke, line: boolean) {
  return line
    ? { fill: "none", stroke: stroke.color, strokeWidth: stroke.size, strokeLinecap: "round", strokeLinejoin: "round" } as const
    : { fill: stroke.color };
}

// Each stroke object gets its own React key the first time it's drawn.
// Strokes are never changed in place, so when the rubbing eraser splits one,
// the new pieces get new keys and every other stroke keeps its own, and only
// the pieces re-render. Keying by position would shift the key of every stroke
// drawn after the one being rubbed, on every move of the eraser.
const strokeKeys = new WeakMap<Stroke, number>();
let nextStrokeKey = 0;

function strokeKey(stroke: Stroke): number {
  let key = strokeKeys.get(stroke);
  if (key === undefined) {
    key = nextStrokeKey++;
    strokeKeys.set(stroke, key);
  }
  return key;
}

/**
 * Text ink, a line at a time in the text's fonts (see lib/text-ink). Each line
 * starts at the box's left edge, and keeps its spaces as they were typed. It
 * takes no taps itself, so they go to the page, or to the whole-stroke
 * eraser's box round it.
 */
function TextShape({ stroke, opacity = strokeOpacity(stroke) }: { stroke: Stroke; opacity?: number }) {
  const { size, italic, lines } = textLayout(stroke);
  return (
    <text
      data-text-ink=""
      fill={stroke.color}
      fontSize={size}
      fontFamily={TEXT_FONT}
      fontStyle={italic ? "italic" : undefined}
      opacity={opacity}
      pointerEvents="none"
      style={{ whiteSpace: "pre", userSelect: "none", transition: "opacity 0.1s ease" }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={line.x} y={line.baseline}>{line.text}</tspan>
      ))}
    </text>
  );
}

/**
 * Render a completed stroke as an SVG path element, or text as text.
 * Memoized to avoid re-rendering unchanged strokes. The Draft's preview of a
 * pair of axes draws with it too, so the preview looks exactly like the ink it
 * becomes, and so does the faint copy of a proof reason being placed.
 */
export const StrokePath = memo(function StrokePath({ stroke }: { stroke: Stroke }) {
  if (isText(stroke)) return <TextShape stroke={stroke} />;
  const { d, line } = strokeShape(stroke);
  if (!d) return null;
  return <path d={d} {...inkPaint(stroke, line)} opacity={strokeOpacity(stroke)} />;
});

/**
 * A stroke wrapped in a clickable group for the whole-stroke eraser. Strokes
 * are never changed in place, so the stroke itself says which one to remove.
 */
const ErasableStrokePath = memo(function ErasableStrokePath({
  stroke,
  isHovered,
  onHover,
  onLeave,
  onErase,
}: {
  stroke: Stroke;
  isHovered: boolean;
  onHover: (stroke: Stroke) => void;
  onLeave: () => void;
  onErase: (stroke: Stroke) => void;
}) {
  const opacity = isHovered ? strokeOpacity(stroke) * 0.35 : strokeOpacity(stroke);
  let shape: React.ReactNode;
  if (isText(stroke)) {
    // Text is tapped anywhere in its box, and the box goes red under the pointer.
    const box = boundingBox(stroke);
    const area = { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
    shape = (
      <>
        <rect {...area} fill="transparent" pointerEvents="all" />
        <TextShape stroke={stroke} opacity={opacity} />
        {isHovered && <rect {...area} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.7} pointerEvents="none" />}
      </>
    );
  } else {
    const { d, line } = strokeShape(stroke);
    if (!d) return null;
    shape = (
      <>
        {/* Invisible wider hit area for easier targeting. A line reaches out from its middle, so it takes its own width as well. */}
        <path
          d={d}
          fill="transparent"
          stroke="transparent"
          strokeWidth={line ? stroke.size + 10 : 10}
          pointerEvents="stroke"
        />
        {/* Visible stroke with hover effect */}
        <path d={d} {...inkPaint(stroke, line)} opacity={opacity} style={{ transition: "opacity 0.1s ease" }} />
        {/* Red outline on hover. A line gets a red line down its middle instead. */}
        {isHovered && (
          <path
            d={d}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1.5}
            opacity={0.7}
            pointerEvents="none"
          />
        )}
      </>
    );
  }

  return (
    <g
      onPointerEnter={() => onHover(stroke)}
      onPointerLeave={onLeave}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onErase(stroke);
      }}
      style={{ cursor: "pointer" }}
    >
      {shape}
    </g>
  );
});

export function AnnotationLayer({
  width,
  height,
  strokes,
  isDrawing,
  isErasing,
  eraserRadius = null,
  penColor,
  penSize,
  inkKind = "pen",
  straight = false,
  fading = false,
  isSelecting = false,
  onStrokesChange,
  hidden = false,
  suspended = false,
  uiScale = 1,
  guides,
  gridSpacing,
  pageIndex,
  pageLabel,
  onPagesChange,
  inkReady = true,
  isTyping = false,
  textStyle = DEFAULT_TEXT_STYLE,
  placingText = null,
  onTextPlaced,
}: AnnotationLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentPoints, setCurrentPoints] = useState<[number, number, number][]>([]);
  const currentPointsRef = useRef<[number, number, number][]>([]);
  const isDrawingStroke = useRef(false);
  // A line that starts where a tool on the pane guides it, such as just
  // outside the ruler's edge, runs against that tool. This holds the line,
  // and where on screen the finger landed, while it's drawn.
  const guidedRef = useRef<{ line: GuidedLine; start: Vec } | null>(null);
  // True while a tool, such as the compasses, is driving the line being drawn, not a finger on this page.
  const drivenRef = useRef(false);

  // What a new stroke looks like. Fading ink has its own look, whatever colour is picked.
  const inkColor = fading ? FADING_INK.color : penColor;
  const inkSize = fading ? FADING_INK.size : penSize;
  const newInk: PenKind = fading ? "pen" : inkKind;

  // Squared paper's squares, whose corners straight lines and the tools snap to after the ink.
  const grid = useMemo(
    () => (gridSpacing ? { spacing: gridSpacing, width, height } : undefined),
    [gridSpacing, width, height],
  );

  // Fading ink never reaches onStrokesChange, so it stays out of the saved
  // ink, the undo history and the PDF. It lives here until it has faded. The
  // ref lets the fade listener see the marks without subscribing again.
  const [fadingStrokes, setFadingStrokes] = useState<Stroke[]>([]);
  const fadingStrokesRef = useRef<Stroke[]>([]);
  const [fadingOut, setFadingOut] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // True from the moment a finger goes down with fading ink until it lifts.
  const holdingRef = useRef(false);

  useEffect(() => {
    const listen = (signal: FadeSignal) => {
      clearTimeout(fadeTimer.current);
      if (fadingStrokesRef.current.length === 0) return;
      // Pointing again brings back any marks that were part way through fading.
      setFadingOut(false);
      if (signal === "hold") return;
      fadeTimer.current = setTimeout(() => {
        setFadingOut(true);
        fadeTimer.current = setTimeout(() => {
          fadingStrokesRef.current = [];
          setFadingStrokes([]);
          setFadingOut(false);
        }, FADE_DURATION);
      }, FADE_DELAY);
    };
    fadeListeners.add(listen);
    return () => {
      fadeListeners.delete(listen);
      clearTimeout(fadeTimer.current);
    };
  }, []);

  /** A finger that was pointing with fading ink has lifted, or its mark was thrown away. */
  const releaseFade = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    signalFade("release");
  }, []);

  // Eraser hover state
  const [hoveredStroke, setHoveredStroke] = useState<Stroke | null>(null);

  // Rubbing eraser state. While you drag, the erased result is kept here and
  // drawn in place of the saved strokes. It is handed back once, when you let
  // go, so one drag of the eraser is one step in the undo history.
  const isRubbing = isErasing && eraserRadius !== null;
  const [rubbedStrokes, setRubbedStrokes] = useState<Stroke[] | null>(null);
  const rubbedStrokesRef = useRef<Stroke[] | null>(null);
  const lastRubPointRef = useRef<[number, number] | null>(null);
  const [eraserCursor, setEraserCursor] = useState<[number, number] | null>(null);

  // The lasso. While a loop is drawn its points are kept here, and when the
  // finger lifts, the ink it caught becomes the selection. While the selection
  // is dragged, the ink is shown moving or resizing, and the page's strokes
  // are only rewritten when the finger lifts, so a whole drag is one undo step.
  const layerId = useId();
  const [loop, setLoop] = useState<Vec[] | null>(null);
  const loopRef = useRef<Vec[] | null>(null);
  const [selection, setSelection] = useState<InkSelection | null>(null);
  const [drag, setDrag] = useState<SelectionDrag | null>(null);
  const dragRef = useRef<{ from: Vec; pointerId: number; preview: SelectionDrag } | null>(null);

  // Whether a proof reason is waiting to be placed. Nothing is placed before
  // the lessons' saved ink has loaded.
  const placing = !!placingText && placingText.length > 0 && inkReady;
  // The Text tool's box, and the finger whose tap will open one.
  const [editor, setEditor] = useState<TextEditor | null>(null);
  const editorRef = useRef<TextEditor | null>(null);
  const typeTapRef = useRef<number | null>(null);

  // Reset hover when leaving eraser mode
  useEffect(() => {
    if (!isErasing) setHoveredStroke(null);
  }, [isErasing]);

  // Throw away a half-drawn line, loop or rub, and the eraser circle. Each
  // setter skips the render when there was nothing to throw away.
  const discardInProgress = useCallback(() => {
    isDrawingStroke.current = false;
    drivenRef.current = false;
    guidedRef.current?.line.end?.();
    guidedRef.current = null;
    currentPointsRef.current = [];
    setCurrentPoints((prev) => (prev.length ? [] : prev));
    loopRef.current = null;
    setLoop(null);
    rubbedStrokesRef.current = null;
    lastRubPointRef.current = null;
    setRubbedStrokes(null);
    setEraserCursor(null);
    typeTapRef.current = null;
    releaseFade();
  }, [releaseFade]);

  // That happens when the rubbing eraser is put away, and when a second
  // finger turns the touch into a scroll or a zoom.
  useEffect(() => {
    if (!isRubbing) discardInProgress();
  }, [isRubbing, discardInProgress]);
  useEffect(() => {
    if (suspended) discardInProgress();
  }, [suspended, discardInProgress]);

  const dropSelection = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setSelection(null);
  }, []);

  // A reason waiting to be placed lets go of any selection, so a tap on it places the reason.
  useEffect(() => {
    if (placing) dropSelection();
  }, [placing, dropSelection]);

  // Starting a loop on another page lets go of this page's selection.
  useEffect(() => {
    const listen = (from: string) => {
      if (from !== layerId) dropSelection();
    };
    lassoListeners.add(listen);
    return () => {
      lassoListeners.delete(listen);
    };
  }, [layerId, dropSelection]);

  // Putting the lasso down lets go of the selection, and of a loop half drawn.
  useEffect(() => {
    if (isSelecting) return;
    loopRef.current = null;
    setLoop(null);
    dropSelection();
  }, [isSelecting, dropSelection]);

  // The selection goes as soon as any of its ink leaves the page, whether by
  // an undo, a clear, or another tutor's ink replacing the page. Strokes are
  // never changed in place, so looking for the stroke objects themselves is
  // enough. It's only checked when the page's ink changes, because a move
  // puts the moved strokes on the page and in the selection at the same time.
  // It's a layout effect, so ink that has gone is never drawn as selected.
  useLayoutEffect(() => {
    if (!selection) return;
    const onPage = new Set(strokes);
    if (!selection.strokes.every((s) => onPage.has(s))) dropSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  const handleEraseStroke = useCallback(
    (stroke: Stroke) => {
      onStrokesChange(strokes.filter((s) => s !== stroke));
      setHoveredStroke(null);
    },
    [strokes, onStrokesChange]
  );

  const handleHoverLeave = useCallback(() => setHoveredStroke(null), []);

  /**
   * Turns points between screen pixels and this page's units, measured from
   * where the page is on screen now, or null before the page is on screen.
   */
  const pageSpace = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      toPage: ([x, y]: Vec): Vec => [((x - rect.left) / rect.width) * width, ((y - rect.top) / rect.height) * height],
      toScreen: ([x, y]: Vec): Vec => [rect.left + (x / width) * rect.width, rect.top + (y / height) * rect.height],
    };
  }, [width, height]);

  const getPoint = useCallback(
    (e: React.PointerEvent): [number, number, number] => {
      const space = pageSpace();
      if (!space) return [0, 0, 0.5];
      const [x, y] = space.toPage([e.clientX, e.clientY]);
      return [x, y, e.pressure > 0 ? e.pressure : 0.5];
    },
    [pageSpace]
  );

  /**
   * A straight line's end moved exactly onto the point in the pen ink nearest
   * it, such as a dot, the end of a line or where two lines cross, keeping its
   * pressure. It's null when no point is within half a centimetre. This is the
   * same snapping the ruler and the compasses use, so a line drawn freehand
   * with straight lines on can join two points of a construction too.
   */
  const inkPointNear = useCallback(
    (point: Point): Point | null => {
      const found = snapOnPage(strokes, [point[0], point[1]], CM, grid);
      return found && [found[0], found[1], point[2]];
    },
    [strokes, grid]
  );

  // Whether each end of the straight line being drawn is on a point in the ink, for the rings that show them.
  const [startPinned, setStartPinned] = useState(false);
  const [endPinned, setEndPinned] = useState(false);

  /** Ask each tool on the pane whether a line starting at this screen point runs against it. */
  const startGuidedLine = useCallback(
    (start: Vec) => {
      const rect = svgRef.current?.getBoundingClientRect();
      // Half the pen's width in screen pixels, which a line keeps between its ink and the tool.
      const offset = (inkSize / 2) * (rect && width > 0 ? rect.width / width : 1);
      for (const guide of guides ?? []) {
        const line = guide.lineFrom(start, offset);
        if (line) return { line, start };
      }
      return null;
    },
    [guides, inkSize, width]
  );

  /**
   * A line against a tool, or one a tool draws by itself, as a stroke's
   * points: turned from screen pixels into page units, with whatever runs past
   * the edge of this page dropped. A two-point line is drawn one width
   * whatever its pressure. A line of more points, such as an arc, gets a
   * steady pressure, which draws it one width too.
   */
  const pageLine = useCallback(
    (points: Vec[], start: Vec): Point[] => {
      const space = pageSpace();
      if (!space) return [];
      const onPage = clipPointsToPage(points.map(space.toPage), width, height);
      if (onPage) return onPage.map(([x, y]): Point => [x, y, onPage.length > 2 ? STEADY_PRESSURE : 0.5]);
      // A line whose whole length is off this page leaves a dot where it started.
      const [sx, sy] = space.toPage(start);
      return [[sx, sy, 0.5]];
    },
    [pageSpace, width, height]
  );

  /** The line against a tool from where the finger landed to where it is now. */
  const guidedLine = useCallback(
    (pointer: Vec): Point[] => {
      const guided = guidedRef.current;
      return guided ? pageLine(guided.line.to(pointer), guided.start) : [];
    },
    [pageLine]
  );

  /** A line starts, from a finger on this page or from a tool. Fading ink keeps its marks from fading until the line ends. */
  const beginLine = useCallback(() => {
    isDrawingStroke.current = true;
    if (fading) {
      holdingRef.current = true;
      signalFade("hold");
    }
  }, [fading]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing || suspended) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      beginLine();
      guidedRef.current = startGuidedLine([e.clientX, e.clientY]);
      const point = getPoint(e);
      // A straight line that starts near a point in the ink starts exactly on it.
      const pin = straight && !guidedRef.current ? inkPointNear(point) : null;
      setStartPinned(pin !== null);
      setEndPinned(false);
      const first = guidedRef.current ? guidedLine([e.clientX, e.clientY]) : [pin ?? point];
      currentPointsRef.current = first;
      setCurrentPoints([...first]);
    },
    [isDrawing, suspended, straight, beginLine, getPoint, inkPointNear, startGuidedLine, guidedLine]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      // A line a tool is driving takes its points from the tool.
      if (!isDrawingStroke.current || drivenRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      if (guidedRef.current) {
        const line = guidedLine([e.clientX, e.clientY]);
        currentPointsRef.current = line;
        setCurrentPoints(line);
        return;
      }
      const pt = getPoint(e);
      if (straight) {
        // A straight line only ever has its two ends: where the finger went
        // down, and where it is now. An end near a point in the ink lands
        // exactly on it, even where that isn't quite level or upright.
        const start = currentPointsRef.current[0];
        const pin = inkPointNear(pt);
        const line = [start, pin ?? straightLineEnd(start, pt)];
        currentPointsRef.current = line;
        setCurrentPoints(line);
        setEndPinned(pin !== null);
        return;
      }
      currentPointsRef.current.push(pt);
      setCurrentPoints((prev) => [...prev, pt]);
    },
    [straight, getPoint, guidedLine, inkPointNear]
  );

  /** The line being drawn is done: keep it as a stroke, or as fading ink. */
  const finishStroke = useCallback(
    () => {
      const byTool = guidedRef.current !== null || drivenRef.current;
      isDrawingStroke.current = false;
      drivenRef.current = false;
      guidedRef.current?.line.end?.();
      guidedRef.current = null;

      let points = currentPointsRef.current;
      currentPointsRef.current = [];
      setCurrentPoints([]);

      // A straight line, or a line against or drawn by a tool, that has
      // barely moved is a tap, so it's kept as a dot.
      if ((straight || byTool) && points.length === 2 && Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]) < 1) {
        points = [points[0]];
      }

      if (fading) {
        if (points.length > 0) {
          fadingStrokesRef.current = [...fadingStrokesRef.current, makeStroke(points, inkColor, inkSize, newInk)];
          setFadingStrokes(fadingStrokesRef.current);
        }
        releaseFade();
        return;
      }

      // A tap without moving is a one-point stroke, which draws as a round
      // dot. That's how a tutor puts in a decimal point or dots an i.
      if (points.length > 0) {
        onStrokesChange([...strokes, makeStroke(points, inkColor, inkSize, newInk)]);
      }
    },
    [strokes, straight, fading, inkColor, inkSize, newInk, releaseFade, onStrokesChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      // A line a tool is driving ends when the tool says so.
      if (!isDrawingStroke.current || drivenRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      finishStroke();
    },
    [finishStroke]
  );

  /**
   * Start a line that a tool draws by itself, such as the compasses as they
   * turn. It's drawn like a line against a tool, but its points come from the
   * tool, in screen pixels, not from a finger on this page. It draws whatever
   * is picked on the Pen Tray: the picked pen, highlighter or fading ink, or
   * with the Hand, the eraser or the lasso, the colour picked last. Nothing
   * starts before the lessons' saved ink has loaded.
   */
  const startDrivenLine = useCallback(
    (start: Vec): DrivenLine | null => {
      if (!inkReady || suspended || isDrawingStroke.current) return null;
      beginLine();
      drivenRef.current = true;
      return {
        to: (points) => {
          if (!drivenRef.current || points.length === 0) return;
          const line = pageLine(points, start);
          currentPointsRef.current = line;
          setCurrentPoints(line);
        },
        // It's finished through the latest render's finishStroke, so ink that arrives on the page while it's drawn isn't lost.
        end: () => {
          if (drivenRef.current) liveRef.current.finishStroke();
        },
      };
    },
    [inkReady, suspended, beginLine, pageLine]
  );

  // The page list and a driven line reach the latest strokes, finishStroke
  // and startDrivenLine through this, so the page doesn't register again with
  // every stroke.
  const liveRef = useRef({ strokes, finishStroke, startDrivenLine });
  useEffect(() => {
    liveRef.current = { strokes, finishStroke, startDrivenLine };
  });

  /** Erase along the line from the last pointer position to this one. */
  const rubTo = useCallback(
    (to: [number, number]) => {
      if (eraserRadius === null || !rubbedStrokesRef.current) return;
      const from = lastRubPointRef.current ?? to;
      lastRubPointRef.current = to;
      const next = eraseStrokes(rubbedStrokesRef.current, from, to, eraserRadius);
      if (next !== rubbedStrokesRef.current) {
        rubbedStrokesRef.current = next;
        setRubbedStrokes(next);
      }
    },
    [eraserRadius]
  );

  const handleRubDown = useCallback(
    (e: React.PointerEvent) => {
      if (suspended) return;
      e.preventDefault();
      e.stopPropagation();
      svgRef.current?.setPointerCapture(e.pointerId);
      const [x, y] = getPoint(e);
      rubbedStrokesRef.current = strokes;
      lastRubPointRef.current = null;
      setEraserCursor([x, y]);
      rubTo([x, y]);
    },
    [getPoint, strokes, rubTo, suspended]
  );

  const handleRubMove = useCallback(
    (e: React.PointerEvent) => {
      const [x, y] = getPoint(e);
      setEraserCursor([x, y]);
      if (rubbedStrokesRef.current) {
        e.preventDefault();
        e.stopPropagation();
        rubTo([x, y]);
      }
    },
    [getPoint, rubTo]
  );

  const handleRubEnd = useCallback(() => {
    const result = rubbedStrokesRef.current;
    if (!result) return;
    rubbedStrokesRef.current = null;
    lastRubPointRef.current = null;
    setRubbedStrokes(null);
    if (result !== strokes) onStrokesChange(result);
  }, [strokes, onStrokesChange]);

  const handleRubLeave = useCallback(() => {
    handleRubEnd();
    setEraserCursor(null);
  }, [handleRubEnd]);

  /**
   * Keep the given strokes as the selection, and work out where its bar of
   * buttons fits. Ink that has just been moved here from another page is
   * scrolled into view too.
   */
  const select = useCallback(
    (picked: Stroke[], reveal = false) => {
      const bounds = selectionBounds(picked);
      const reach = Math.max(...picked.map((s) => s.size)) / 2;
      const rect = svgRef.current?.getBoundingClientRect();
      const onScreen = rect && height > 0 ? rect.height / height : 1;
      setSelection({ strokes: picked, bounds, reach, below: (bounds.top - reach) * onScreen < SELECTION_BAR_ROOM, reveal });
    },
    [height]
  );

  /**
   * Put changed copies of the selected strokes on the page in their places,
   * as one change, and keep them selected, ready for the next change.
   */
  const replaceSelection = useCallback(
    (changed: Stroke[]) => {
      if (!selection) return;
      const replaced = new Map(selection.strokes.map((s, i) => [s, changed[i]]));
      onStrokesChange(strokes.map((s) => replaced.get(s) ?? s));
      select(changed);
    },
    [selection, strokes, onStrokesChange, select]
  );

  // While it's showing, a page with a place among the exercise's pages is on
  // the list the lasso's Move button offers, and the compasses draw through
  // the same list. It reads the page's ink, and starts lines on it, through
  // liveRef, so the page doesn't register again with every stroke.
  const receiveInk = useCallback(
    (moved: Stroke[]) => {
      lassoListeners.forEach((listen) => listen(layerId));
      select(moved, true);
    },
    [layerId, select]
  );
  useEffect(() => {
    if (pageIndex === undefined || pageLabel === undefined || !onPagesChange) return;
    return registerInkPage(layerId, {
      index: pageIndex,
      label: pageLabel,
      width,
      height,
      onPagesChange,
      strokes: () => liveRef.current.strokes,
      receive: receiveInk,
      contains: ([x, y]) => {
        const box = svgRef.current?.getBoundingClientRect();
        return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      },
      startLine: (start) => liveRef.current.startDrivenLine(start),
      // The reach is measured in this page's centimetres, whatever its zoom.
      snapNear: (point) => {
        const space = pageSpace();
        if (!space) return null;
        const found = snapOnPage(liveRef.current.strokes, space.toPage(point), CM, grid);
        return found && space.toScreen(found);
      },
    });
  }, [layerId, pageIndex, pageLabel, width, height, onPagesChange, receiveInk, pageSpace, grid]);

  /**
   * Move the selection to another page, as one change to both pages. The ink
   * keeps its place, shifted only as far as it takes to stay on the new page,
   * and the new page selects it and scrolls it into view.
   */
  const moveSelection = useCallback(
    (to: InkPage) => {
      if (!selection || pageIndex === undefined || !onPagesChange) return;
      const [dx, dy] = fitOnPage(selection.bounds, to.width, to.height);
      const moved = moveStrokes(selection.strokes, dx, dy);
      const gone = new Set(selection.strokes);
      dropSelection();
      onPagesChange({ [pageIndex]: strokes.filter((s) => !gone.has(s)), [to.index]: [...to.strokes(), ...moved] });
      to.receive(moved);
    },
    [selection, pageIndex, onPagesChange, strokes, dropSelection]
  );

  // Ink that has just arrived from another page is scrolled into view.
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selection?.reveal) selectionBoxRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selection]);

  const handleLassoDown = useCallback(
    (e: React.PointerEvent) => {
      // While a finger drags the selection, another finger landing on the page starts nothing.
      if (suspended || dragRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      svgRef.current?.setPointerCapture(e.pointerId);
      lassoListeners.forEach((listen) => listen(layerId));
      dropSelection();
      const [x, y] = getPoint(e);
      loopRef.current = [[x, y]];
      setLoop(loopRef.current);
    },
    [suspended, getPoint, layerId, dropSelection]
  );

  const handleLassoMove = useCallback(
    (e: React.PointerEvent) => {
      const points = loopRef.current;
      if (!points) return;
      e.preventDefault();
      e.stopPropagation();
      const [x, y] = getPoint(e);
      loopRef.current = [...points, [x, y]];
      setLoop(loopRef.current);
    },
    [getPoint]
  );

  // A loop that catches no ink, such as a tap, leaves nothing selected.
  const handleLassoUp = useCallback(
    (e: React.PointerEvent) => {
      const points = loopRef.current;
      if (!points) return;
      e.preventDefault();
      e.stopPropagation();
      loopRef.current = null;
      setLoop(null);
      const caught = strokesInLoop(strokes, points);
      if (caught.length > 0) select(caught);
    },
    [strokes, select]
  );

  const handleSelectionDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, kind: SelectionDragKind) => {
      if (!selection) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const [x, y] = getPoint(e);
      const preview: SelectionDrag = kind === "move" ? { kind, dx: 0, dy: 0 } : { kind, scale: 1 };
      dragRef.current = { from: [x, y], pointerId: e.pointerId, preview };
      setDrag(preview);
    },
    [selection, getPoint]
  );

  const handleSelectionMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== e.pointerId || !selection) return;
      e.preventDefault();
      e.stopPropagation();
      const [x, y] = getPoint(e);
      const { bounds } = selection;
      if (current.preview.kind === "move") {
        const [dx, dy] = clampMove(bounds, x - current.from[0], y - current.from[1], width, height);
        current.preview = { kind: "move", dx, dy };
      } else {
        const scale = clampScale(bounds, dragScale(bounds, current.from, [x, y]), width, height);
        current.preview = { kind: "resize", scale };
      }
      setDrag(current.preview);
    },
    [selection, getPoint, width, height]
  );

  // A move or a resize is handed back as one change when the finger lifts,
  // and the ink stays selected, ready to move or resize again.
  const handleSelectionUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const current = dragRef.current;
      if (!current || current.pointerId !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = null;
      setDrag(null);
      if (!selection) return;
      const { strokes: picked, bounds } = selection;
      const done = current.preview;
      if (done.kind === "move" && (done.dx !== 0 || done.dy !== 0)) replaceSelection(moveStrokes(picked, done.dx, done.dy));
      if (done.kind === "resize" && done.scale !== 1) replaceSelection(resizeStrokes(picked, [bounds.left, bounds.top], done.scale));
    },
    [selection, replaceSelection]
  );

  const handleSelectionCancel = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  // A colour that changes none of the selected ink, because it's all that colour already, changes nothing.
  const recolourSelection = useCallback(
    (kind: InkKind, swatch: InkSwatch) => {
      if (!selection) return;
      const changed = recolourStrokes(selection.strokes, kind, swatch.color);
      if (changed.some((s, i) => s !== selection.strokes[i])) replaceSelection(changed);
    },
    [selection, replaceSelection]
  );

  const deleteSelection = useCallback(() => {
    if (!selection) return;
    const gone = new Set(selection.strokes);
    dropSelection();
    onStrokesChange(strokes.filter((s) => !gone.has(s)));
  }, [selection, strokes, dropSelection, onStrokesChange]);

  // ---------- Placing a proof reason ----------

  /** The waiting reason as it would be placed for a pointer at this point. */
  const reasonAt = useCallback(
    (e: React.PointerEvent): Stroke[] => {
      if (!placingText) return [];
      const [x, y] = getPoint(e);
      return makeTextStrokes(placingText, [x, y], { ...textStyle, pageWidth: width, pageHeight: height });
    },
    [placingText, textStyle, getPoint, width, height]
  );

  // The waiting reason's faint copy under the finger. A mouse shows it before
  // it's pressed too, because there's a pointer to follow. Once the reason is
  // placed, on this page or another, or cancelled, its faint copy goes too.
  const { preview: ghost, handlers: placeHandlers, drop: dropPlacing } = usePlacingPress<Stroke[]>({
    suspended,
    hover: true,
    spotAt: (e) => {
      const placed = reasonAt(e);
      return placed.length > 0 ? placed : null;
    },
    onPlace: (placed) => {
      onStrokesChange([...strokes, ...placed]);
      onTextPlaced?.();
    },
  });
  useEffect(() => {
    if (!placing) dropPlacing();
  }, [placing, dropPlacing]);

  // ---------- The Text tool ----------

  const showEditor = useCallback((next: TextEditor | null) => {
    editorRef.current = next;
    setEditor(next);
  }, []);

  /**
   * Put what's typed on the page, as one change, and close the box. Changed
   * text keeps its place among the page's strokes, and text emptied of words
   * is deleted. Typed text is never italic, and an English reason that has
   * Chinese typed into it stops being italic, so Chinese is never slanted.
   */
  const commitText = useCallback(() => {
    const current = editorRef.current;
    if (!current) return;
    showEditor(null);
    const { editing } = current;
    const words = current.text.replace(/^\n+/, "").trimEnd();
    if (editing && words === editing.text) return;
    const placed = makeTextStrokes(
      [{ text: words, italic: current.italic && ![...words].some(isCjk) }],
      current.at,
      { size: current.size, color: current.color, pageWidth: width, pageHeight: height },
    );
    const at = editing ? indexOfText(strokes, editing) : -1;
    if (at !== -1) onStrokesChange([...strokes.slice(0, at), ...placed, ...strokes.slice(at + 1)]);
    else if (placed.length > 0) onStrokesChange([...strokes, ...placed]);
  }, [showEditor, strokes, width, height, onStrokesChange]);

  const changeText = useCallback((text: string) => {
    const current = editorRef.current;
    if (current) showEditor({ ...current, text });
  }, [showEditor]);

  const cancelText = useCallback(() => showEditor(null), [showEditor]);

  // Opening a text box on another page puts this page's text on the page first.
  useEffect(() => {
    const listen = (from: string) => {
      if (from !== layerId) commitText();
    };
    typingListeners.add(listen);
    return () => {
      typingListeners.delete(listen);
    };
  }, [layerId, commitText]);

  // Putting the Text tool down puts what's typed on the page.
  useEffect(() => {
    if (!isTyping) commitText();
  }, [isTyping, commitText]);

  // A box still open as the page goes, such as when another exercise opens,
  // puts its text on the page it was typed on. The layer's last props still
  // belong to that page, because a new exercise gets fresh layers.
  const commitTextRef = useRef(commitText);
  useEffect(() => {
    commitTextRef.current = commitText;
  });
  useEffect(() => () => commitTextRef.current(), []);

  // The box opens when the finger lifts, so a finger that turns into a two-finger scroll opens nothing.
  const handleTypeDown = useCallback(
    (e: React.PointerEvent) => {
      if (suspended || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      e.stopPropagation();
      typeTapRef.current = e.pointerId;
    },
    [suspended]
  );

  /**
   * A tap with the Text tool. With a box already open, it puts what's typed
   * on the page and does nothing else. Otherwise it opens a box, on the text
   * under the tap to change it, or where the tap landed for new text.
   */
  const handleTypeUp = useCallback(
    (e: React.PointerEvent) => {
      if (typeTapRef.current !== e.pointerId) return;
      typeTapRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      if (editorRef.current) {
        commitText();
        return;
      }
      const [x, y] = getPoint(e);
      typingListeners.forEach((listen) => listen(layerId));
      const existing = textAt(strokes, [x, y]);
      if (existing) {
        const { size, italic } = textLayout(existing);
        const box = boundingBox(existing);
        const at: Vec = [box.left, box.top + (size * TEXT_LINE_HEIGHT) / 2];
        showEditor({ at, size, color: existing.color, italic, text: existing.text ?? "", editing: existing });
      } else {
        showEditor({ at: [x, y], size: textStyle.size, color: textStyle.color, italic: false, text: "", editing: null });
      }
    },
    [commitText, getPoint, layerId, strokes, showEditor, textStyle]
  );

  // On a laptop, the Delete and Backspace keys delete the selection too.
  useStableKeyboardHandler((e) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    if (isTypingTarget(e.target) || hasBrowserModifier(e)) return;
    e.preventDefault();
    deleteSelection();
  }, selection !== null);

  const shownStrokes = rubbedStrokes ?? strokes;

  // Render current in-progress stroke
  const currentStroke = makeStroke(currentPoints, inkColor, inkSize, newInk);
  const currentOutline =
    currentPoints.length > 0 ? getStroke(currentPoints, getStrokeOptions(currentStroke, false)) : null;

  const currentPath = currentOutline
    ? getSvgPathFromStroke(currentOutline)
    : null;
  const currentPathEl = currentPath && (
    <path d={currentPath} fill={inkColor} opacity={strokeOpacity(currentStroke)} />
  );
  const currentSavedInk = fading ? null : currentPathEl;

  const active = isDrawing || isErasing || isSelecting || isTyping || placing;

  // The page's pointer handlers depend on the tool, but a reason waiting to
  // be placed comes before any tool. The whole-stroke eraser needs none here,
  // because each stroke handles its own tap.
  let pointerHandlers: Partial<Record<"onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onPointerLeave", (e: React.PointerEvent) => void>>;
  if (placing) {
    pointerHandlers = placeHandlers;
  } else if (isRubbing) {
    pointerHandlers = {
      onPointerDown: handleRubDown,
      onPointerMove: handleRubMove,
      onPointerUp: handleRubEnd,
      onPointerCancel: handleRubEnd,
      onPointerLeave: handleRubLeave,
    };
  } else if (isErasing) {
    pointerHandlers = {};
  } else if (isSelecting) {
    pointerHandlers = {
      onPointerDown: handleLassoDown,
      onPointerMove: handleLassoMove,
      onPointerUp: handleLassoUp,
      onPointerCancel: discardInProgress,
      onPointerLeave: handleLassoUp,
    };
  } else if (isTyping) {
    pointerHandlers = { onPointerDown: handleTypeDown, onPointerUp: handleTypeUp, onPointerCancel: discardInProgress };
  } else {
    pointerHandlers = {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerUp,
    };
  }

  // The finished strokes, a layer for each kind of ink in INK_ORDER, so pen ink
  // always sits on top of pencil ink and both on top of highlighter ink. They
  // are only rebuilt when the ink itself changes, so a move of the pen
  // re-renders the line being drawn and nothing else. Ink the lasso has
  // selected is left out, and drawn in a group of its own on top of its layer,
  // so dragging it moves that group and nothing else. Text whose box is open to
  // change it is left out too, because the box shows it.
  const selected = useMemo(() => new Set(selection?.strokes), [selection]);
  // Ink from another laptop can bring a copy of the text while its box is open, and the copy is left out as well.
  const editing = useMemo(() => {
    const open = editor?.editing;
    return open ? shownStrokes[indexOfText(shownStrokes, open)] ?? null : null;
  }, [editor, shownStrokes]);
  const layerPaths = useMemo(() => {
    const tappable = isErasing && !isRubbing && !placing;
    return inkLayers(shownStrokes).map((layer) =>
      layer.filter((stroke) => !selected.has(stroke) && stroke !== editing).map((stroke) =>
        tappable ? (
          <ErasableStrokePath
            key={strokeKey(stroke)}
            stroke={stroke}
            isHovered={hoveredStroke === stroke}
            onHover={setHoveredStroke}
            onLeave={handleHoverLeave}
            onErase={handleEraseStroke}
          />
        ) : (
          <StrokePath key={strokeKey(stroke)} stroke={stroke} />
        ),
      ),
    );
  }, [shownStrokes, isErasing, isRubbing, placing, hoveredStroke, handleHoverLeave, handleEraseStroke, selected, editing]);

  // The selected ink as it looks part way through a drag. A resize draws it
  // again at its new size, and a move shifts its whole group on screen.
  const selectedPaths = useMemo((): React.ReactNode[][] => {
    if (!selection) return INK_ORDER.map(() => []);
    const shown = drag?.kind === "resize"
      ? resizeStrokes(selection.strokes, [selection.bounds.left, selection.bounds.top], drag.scale)
      : selection.strokes;
    return inkLayers(shown).map((layer) => layer.map((stroke, i) => <StrokePath key={i} stroke={stroke} />));
  }, [selection, drag]);
  const selectedGroup = (paths: React.ReactNode[]) =>
    paths.length > 0 && (
      <g
        data-selected-ink=""
        transform={drag?.kind === "move" ? `translate(${drag.dx} ${drag.dy})` : undefined}
        style={{ filter: SELECTED_GLOW }}
      >
        {paths}
      </g>
    );

  // The selection's box, which follows the ink part way through a drag.
  let selectionBox: Box | null = null;
  if (selection) {
    const { bounds, reach } = selection;
    const [dx, dy] = drag?.kind === "move" ? [drag.dx, drag.dy] : [0, 0];
    const scale = drag?.kind === "resize" ? drag.scale : 1;
    selectionBox = {
      left: bounds.left + dx - reach,
      top: bounds.top + dy - reach,
      right: bounds.left + (bounds.right - bounds.left) * scale + dx + reach,
      bottom: bounds.top + (bounds.bottom - bounds.top) * scale + dy + reach,
    };
  }

  return (
    <>
      <svg
        ref={svgRef}
        data-annotation-layer=""
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full"
        // While a reason waits to be placed, one finger places it whatever tool is picked, so the viewer never pans with it.
        data-takes-one-finger={placing ? "" : undefined}
        style={{
          pointerEvents: active ? "auto" : "none",
          // The rubbing eraser draws its own circle, so the system cursor is hidden
          cursor: placing ? "crosshair" : isRubbing ? "none" : isErasing ? "pointer" : isTyping ? "text" : isDrawing || isSelecting ? "crosshair" : "default",
          touchAction: active ? "none" : "auto",
        }}
        {...pointerHandlers}
      >
        {/* Completed strokes, a layer for each kind of ink from the bottom up,
            with any selected ink and the line being drawn on top of its own
            layer. The whole-stroke eraser makes each one tappable. "Hide ink"
            hides these, but not fading ink, which is for pointing at the clean
            worksheet as much as the marked one. */}
        <g style={{ opacity: hidden ? 0 : 1, transition: "opacity 0.15s ease" }}>
          {INK_ORDER.map((kind, i) => (
            <Fragment key={kind}>
              {layerPaths[i]}
              {selectedGroup(selectedPaths[i] ?? [])}
              {newInk === kind && currentSavedInk}
            </Fragment>
          ))}
        </g>

        {/* A proof reason waiting to be placed, faintly, where it would go. It shows even with the ink hidden. */}
        {ghost && ghost.length > 0 && (
          <g data-text-ghost="" opacity={0.45} pointerEvents="none">
            {ghost.map((stroke, i) => <StrokePath key={i} stroke={stroke} />)}
          </g>
        )}

        {/* Fading ink, on top of everything, with a soft glow */}
        {(fadingStrokes.length > 0 || (fading && currentPathEl)) && (
          <g
            data-fading-ink=""
            pointerEvents="none"
            style={{
              opacity: fadingOut ? 0 : 1,
              transition: fadingOut ? `opacity ${FADE_DURATION}ms ease-out` : "none",
              filter: "drop-shadow(0 0 3px rgba(239, 68, 68, 0.7))",
            }}
          >
            {fadingStrokes.map((stroke) => <StrokePath key={strokeKey(stroke)} stroke={stroke} />)}
            {fading && currentPathEl}
          </g>
        )}

        {/* The lasso's loop while it's being drawn */}
        {loop && loop.length > 1 && (
          <path
            data-lasso-loop=""
            d={`M ${loop.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`}
            fill="rgba(160, 112, 75, 0.08)"
            stroke={LASSO_COLOUR}
            strokeWidth={2}
            strokeDasharray="7 5"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

        {/* A ring round each end of the straight line being drawn that has landed on a point in the ink */}
        {currentPoints.length > 0 &&
          [startPinned && currentPoints[0], endPinned && currentPoints[currentPoints.length - 1]].map(
            (point, i) =>
              point && (
                <circle
                  key={i}
                  data-pinned=""
                  cx={point[0]}
                  cy={point[1]}
                  r={0.3 * CM}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              )
          )}

        {/* Rubbing eraser circle, the exact area it will erase */}
        {isRubbing && eraserCursor && eraserRadius !== null && (
          <circle
            cx={eraserCursor[0]}
            cy={eraserCursor[1]}
            r={eraserRadius}
            fill="rgba(255, 255, 255, 0.35)"
            stroke="#6b5a42"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
      {selection && selectionBox && (
        <LassoSelection
          box={selectionBox}
          width={width}
          height={height}
          strokes={selection.strokes}
          uiScale={uiScale}
          below={selection.below}
          onPointerDown={handleSelectionDown}
          onPointerMove={handleSelectionMove}
          onPointerUp={handleSelectionUp}
          onPointerCancel={handleSelectionCancel}
          onRecolour={recolourSelection}
          onDelete={deleteSelection}
          boxRef={selectionBoxRef}
          pageIndex={pageIndex}
          onPagesChange={onPagesChange}
          onMove={moveSelection}
        />
      )}
      {editor && (
        <TextBox
          at={editor.at}
          size={editor.size}
          color={editor.color}
          italic={editor.italic}
          text={editor.text}
          width={width}
          uiScale={uiScale}
          onChange={changeText}
          onDone={commitText}
          onCancel={cancelText}
        />
      )}
    </>
  );
}
