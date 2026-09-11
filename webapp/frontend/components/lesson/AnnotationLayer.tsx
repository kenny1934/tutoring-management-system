"use client";

import { useRef, useState, useCallback, useEffect, useMemo, memo } from "react";
import getStroke from "perfect-freehand";
import { getStrokeOptions, inkLayers, makeStroke, strokeOpacity } from "@/hooks/useAnnotations";
import type { InkKind, Stroke } from "@/hooks/useAnnotations";
import { eraseStrokes } from "@/lib/stroke-eraser";

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
  /** Whether new strokes are pen or highlighter ink. Defaults to pen. */
  inkKind?: InkKind;
  /** Draw a straight line from where the finger goes down to where it lifts. */
  straight?: boolean;
  /**
   * Draw fading ink, for pointing. Its marks fade away a few seconds after you
   * stop, and they never reach onStrokesChange, so they're never saved.
   */
  fading?: boolean;
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

/** Where a straight line from start towards the pointer ends, snapped level or upright when it's nearly there. */
function straightLineEnd(start: Point, pointer: Point): Point {
  const angle = Math.abs((Math.atan2(pointer[1] - start[1], pointer[0] - start[0]) * 180) / Math.PI);
  if (angle < SNAP_DEGREES || angle > 180 - SNAP_DEGREES) return [pointer[0], start[1], pointer[2]];
  if (Math.abs(angle - 90) < SNAP_DEGREES) return [start[0], pointer[1], pointer[2]];
  return pointer;
}

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

/** Render a completed stroke as an SVG path element. Memoized to avoid re-rendering unchanged strokes. */
const StrokePath = memo(function StrokePath({ stroke }: { stroke: Stroke }) {
  const outlinePoints = getStroke(stroke.points, getStrokeOptions(stroke, true));
  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return null;
  return <path d={pathData} fill={stroke.color} opacity={strokeOpacity(stroke)} />;
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
  const outlinePoints = getStroke(stroke.points, getStrokeOptions(stroke, true));
  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return null;

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
      {/* Invisible wider hit area for easier targeting */}
      <path
        d={pathData}
        fill="transparent"
        stroke="transparent"
        strokeWidth={10}
        pointerEvents="stroke"
      />
      {/* Visible stroke with hover effect */}
      <path
        d={pathData}
        fill={stroke.color}
        opacity={isHovered ? strokeOpacity(stroke) * 0.35 : strokeOpacity(stroke)}
        style={{ transition: "opacity 0.1s ease" }}
      />
      {/* Red outline on hover */}
      {isHovered && (
        <path
          d={pathData}
          fill="none"
          stroke="#ef4444"
          strokeWidth={1.5}
          opacity={0.7}
          pointerEvents="none"
        />
      )}
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
  onStrokesChange,
  hidden = false,
  suspended = false,
}: AnnotationLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentPoints, setCurrentPoints] = useState<[number, number, number][]>([]);
  const currentPointsRef = useRef<[number, number, number][]>([]);
  const isDrawingStroke = useRef(false);

  // What a new stroke looks like. Fading ink has its own look, whatever colour is picked.
  const inkColor = fading ? FADING_INK.color : penColor;
  const inkSize = fading ? FADING_INK.size : penSize;
  const newInk: InkKind = fading ? "pen" : inkKind;

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

  // Reset hover when leaving eraser mode
  useEffect(() => {
    if (!isErasing) setHoveredStroke(null);
  }, [isErasing]);

  // Throw away a half-drawn line or rub, and the eraser circle. Each setter
  // skips the render when there was nothing to throw away.
  const discardInProgress = useCallback(() => {
    isDrawingStroke.current = false;
    currentPointsRef.current = [];
    setCurrentPoints((prev) => (prev.length ? [] : prev));
    rubbedStrokesRef.current = null;
    lastRubPointRef.current = null;
    setRubbedStrokes(null);
    setEraserCursor(null);
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

  const handleEraseStroke = useCallback(
    (stroke: Stroke) => {
      onStrokesChange(strokes.filter((s) => s !== stroke));
      setHoveredStroke(null);
    },
    [strokes, onStrokesChange]
  );

  const handleHoverLeave = useCallback(() => setHoveredStroke(null), []);

  const getPoint = useCallback(
    (e: React.PointerEvent): [number, number, number] => {
      const svg = svgRef.current;
      if (!svg) return [0, 0, 0.5];
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * width;
      const y = ((e.clientY - rect.top) / rect.height) * height;
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      return [x, y, pressure];
    },
    [width, height]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawing || suspended) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      isDrawingStroke.current = true;
      if (fading) {
        holdingRef.current = true;
        signalFade("hold");
      }
      const pt = getPoint(e);
      currentPointsRef.current = [pt];
      setCurrentPoints([pt]);
    },
    [isDrawing, suspended, fading, getPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingStroke.current) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = getPoint(e);
      if (straight) {
        // A straight line only ever has its two ends: where the finger went
        // down, and where it is now.
        const start = currentPointsRef.current[0];
        const line = [start, straightLineEnd(start, pt)];
        currentPointsRef.current = line;
        setCurrentPoints(line);
        return;
      }
      currentPointsRef.current.push(pt);
      setCurrentPoints((prev) => [...prev, pt]);
    },
    [straight, getPoint]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingStroke.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDrawingStroke.current = false;

      let points = currentPointsRef.current;
      currentPointsRef.current = [];
      setCurrentPoints([]);

      // A straight line that has barely moved is a tap, so it's kept as a dot.
      if (straight && points.length === 2 && Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]) < 1) {
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

  const active = isDrawing || isErasing;

  // The page's pointer handlers depend on the tool. The whole-stroke eraser
  // needs none here, because each stroke handles its own tap.
  const pointerHandlers = isRubbing
    ? {
        onPointerDown: handleRubDown,
        onPointerMove: handleRubMove,
        onPointerUp: handleRubEnd,
        onPointerCancel: handleRubEnd,
        onPointerLeave: handleRubLeave,
      }
    : isErasing
      ? {}
      : {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerLeave: handlePointerUp,
        };

  // The finished strokes, in their two layers so pen ink always sits on top of
  // highlighter ink. They are only rebuilt when the ink itself changes, so a
  // move of the pen re-renders the line being drawn and nothing else.
  const [highlighterPaths, penPaths] = useMemo(() => {
    const tappable = isErasing && !isRubbing;
    return inkLayers(shownStrokes).map((layer) =>
      layer.map((stroke) =>
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
  }, [shownStrokes, isErasing, isRubbing, hoveredStroke, handleHoverLeave, handleEraseStroke]);

  return (
    <svg
      ref={svgRef}
      data-annotation-layer=""
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: active ? "auto" : "none",
        // The rubbing eraser draws its own circle, so the system cursor is hidden
        cursor: isRubbing ? "none" : isErasing ? "pointer" : isDrawing ? "crosshair" : "default",
        touchAction: active ? "none" : "auto",
      }}
      {...pointerHandlers}
    >
      {/* Completed strokes, highlighter first. The whole-stroke eraser makes
          each one tappable. "Hide ink" hides these, but not fading ink, which
          is for pointing at the clean worksheet as much as the marked one. */}
      <g style={{ opacity: hidden ? 0 : 1, transition: "opacity 0.15s ease" }}>
        {highlighterPaths}
        {newInk === "highlighter" && currentSavedInk}
        {penPaths}
        {newInk !== "highlighter" && currentSavedInk}
      </g>

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
  );
}
