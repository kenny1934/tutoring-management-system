"use client";

import { useRef, useState, useCallback, useEffect, memo } from "react";
import getStroke from "perfect-freehand";
import { getStrokeOptions } from "@/hooks/useAnnotations";
import type { Stroke } from "@/hooks/useAnnotations";

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
  /** Current pen color */
  penColor: string;
  /** Current pen size */
  penSize: number;
  /** Called when strokes change (new stroke added or stroke removed) */
  onStrokesChange: (strokes: Stroke[]) => void;
}

/** Convert perfect-freehand outline points to an SVG path string. */
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

/** Render a completed stroke as an SVG path element. Memoized to avoid re-rendering unchanged strokes. */
const StrokePath = memo(function StrokePath({ stroke }: { stroke: Stroke }) {
  const outlinePoints = getStroke(stroke.points, getStrokeOptions(stroke, true));
  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return null;
  return <path d={pathData} fill={stroke.color} opacity={0.85} />;
});

/** A stroke wrapped in a clickable group for eraser mode. */
const ErasableStrokePath = memo(function ErasableStrokePath({
  stroke,
  index,
  isHovered,
  onHover,
  onLeave,
  onErase,
}: {
  stroke: Stroke;
  index: number;
  isHovered: boolean;
  onHover: (index: number) => void;
  onLeave: () => void;
  onErase: (index: number) => void;
}) {
  const outlinePoints = getStroke(stroke.points, getStrokeOptions(stroke, true));
  const pathData = getSvgPathFromStroke(outlinePoints);
  if (!pathData) return null;

  return (
    <g
      onPointerEnter={() => onHover(index)}
      onPointerLeave={onLeave}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onErase(index);
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
        opacity={isHovered ? 0.3 : 0.85}
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
  penColor,
  penSize,
  onStrokesChange,
}: AnnotationLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentPoints, setCurrentPoints] = useState<[number, number, number][]>([]);
  const currentPointsRef = useRef<[number, number, number][]>([]);
  const isDrawingStroke = useRef(false);

  // Eraser hover state
  const [hoveredStrokeIndex, setHoveredStrokeIndex] = useState<number | null>(null);

  // Reset hover when leaving eraser mode
  useEffect(() => {
    if (!isErasing) setHoveredStrokeIndex(null);
  }, [isErasing]);

  const handleEraseStroke = useCallback(
    (index: number) => {
      onStrokesChange(strokes.filter((_, i) => i !== index));
      setHoveredStrokeIndex(null);
    },
    [strokes, onStrokesChange]
  );

  const handleHoverLeave = useCallback(() => setHoveredStrokeIndex(null), []);

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
      if (!isDrawing) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      isDrawingStroke.current = true;
      const pt = getPoint(e);
      currentPointsRef.current = [pt];
      setCurrentPoints([pt]);
    },
    [isDrawing, getPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingStroke.current) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = getPoint(e);
      currentPointsRef.current.push(pt);
      setCurrentPoints((prev) => [...prev, pt]);
    },
    [getPoint]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDrawingStroke.current) return;
      e.preventDefault();
      e.stopPropagation();
      isDrawingStroke.current = false;

      const points = currentPointsRef.current;
      currentPointsRef.current = [];
      setCurrentPoints([]);

      if (points.length >= 2) {
        const newStroke: Stroke = {
          points,
          color: penColor,
          size: penSize,
        };
        onStrokesChange([...strokes, newStroke]);
      }
    },
    [strokes, penColor, penSize, onStrokesChange]
  );

  // Render current in-progress stroke
  const currentOutline =
    currentPoints.length >= 2
      ? getStroke(currentPoints, {
          size: penSize,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
          simulatePressure: true,
          start: { cap: true, taper: 0 },
          end: { cap: true, taper: 0 },
          last: false,
        })
      : null;

  const currentPath = currentOutline
    ? getSvgPathFromStroke(currentOutline)
    : null;

  const active = isDrawing || isErasing;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full"
      style={{
        pointerEvents: active ? "auto" : "none",
        cursor: isErasing ? "pointer" : isDrawing ? "crosshair" : "default",
        touchAction: active ? "none" : "auto",
      }}
      onPointerDown={isErasing ? undefined : handlePointerDown}
      onPointerMove={isErasing ? undefined : handlePointerMove}
      onPointerUp={isErasing ? undefined : handlePointerUp}
      onPointerLeave={isErasing ? undefined : handlePointerUp}
    >
      {/* Completed strokes */}
      {isErasing
        ? strokes.map((stroke, i) => (
            <ErasableStrokePath
              key={i}
              stroke={stroke}
              index={i}
              isHovered={hoveredStrokeIndex === i}
              onHover={setHoveredStrokeIndex}
              onLeave={handleHoverLeave}
              onErase={handleEraseStroke}
            />
          ))
        : strokes.map((stroke, i) => (
            <StrokePath key={i} stroke={stroke} />
          ))
      }

      {/* In-progress stroke (pen mode only) */}
      {currentPath && (
        <path d={currentPath} fill={penColor} opacity={0.85} />
      )}
    </svg>
  );
}
