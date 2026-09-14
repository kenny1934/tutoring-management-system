"use client";

import { memo, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { usePlacedTool, type OnScreen } from "@/hooks/usePlacedTool";
import { inkSnapAt } from "@/hooks/useInkPages";
import { CATCH, readingFlipped, type DrawingGuide } from "@/lib/drawing-guide";
import {
  HOLE_SHARE, STRIP_SHARE, arcTo, draggedSize, lineKind, nearProtractor, polar, rayOnto, rayTo, readProtractorSize,
  saveProtractorSize, shownTilt, type ProtractorFrame,
} from "@/lib/protractor";
import type { Vec } from "@/lib/stroke-select";
import { HANDLE_DOT, READING, ROUND_BUTTON, SnapRings, grabPointer, usePinnedPoints } from "./ToolParts";

const LABEL =
  "Protractor: drag it to move it, or turn it with two fingers or the mouse wheel. " +
  "Start a line in the hole at its centre to draw an angle, or just outside its curved edge to draw an arc.";

/** A protractor for buttons and menus: a half-disc with a ray from its centre, drawn to match the other icons. */
export function ProtractorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 18a10 10 0 0 1 20 0Z" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 18l5-7" />
    </svg>
  );
}

// The marks are drawn in millimetres for a protractor 10 cm across, and they
// grow and shrink with it: the curved edge is 50 from the centre mark, which
// sits on the baseline at (50, 50), and the strip runs down below it. They're
// worked out once.
const R = 50;
const STRIP = R * STRIP_SHARE;
const HOLE = R * HOLE_SHARE;

/** Where a mark goes at this many degrees round from the right and this far from the centre, turned to face out. */
function onRadius(degrees: number, r: number) {
  const a = (degrees * Math.PI) / 180;
  return { x: R + r * Math.cos(a), y: R - r * Math.sin(a), turn: 90 - degrees };
}

// A tick every degree round the curved edge, longer at every 5 and 10 degrees.
const TICKS = Array.from({ length: 181 }, (_, deg) => {
  const length = deg % 10 === 0 ? 5 : deg % 5 === 0 ? 3.5 : 2;
  const outer = onRadius(deg, R);
  const inner = onRadius(deg, R - length);
  return `M${outer.x.toFixed(2)} ${outer.y.toFixed(2)}L${inner.x.toFixed(2)} ${inner.y.toFixed(2)}`;
}).join("");
// A number every 10 degrees on each of the two scales, placed once.
const NUMBERS = Array.from({ length: 19 }, (_, n) => ({ deg: n * 10, outer: onRadius(n * 10, 42), inner: onRadius(n * 10, 36.5) }));

// The plastic, with the hole cut out of it at the centre mark.
const PLASTIC =
  `M0 ${R}A${R} ${R} 0 0 1 ${2 * R} ${R}V${R + STRIP}H0Z` +
  `M${R - HOLE} ${R}a${HOLE} ${HOLE} 0 1 0 ${2 * HOLE} 0a${HOLE} ${HOLE} 0 1 0 ${-2 * HOLE} 0Z`;

// The marks only change when the protractor is picked up or put down, so a move doesn't draw them again.
const ProtractorMarks = memo(function ProtractorMarks({ held }: { held: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${2 * R} ${R + STRIP}`}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full overflow-visible"
      style={{ pointerEvents: "none", filter: "drop-shadow(0 8px 14px rgba(46, 30, 14, 0.22))" }}
    >
      {/* Only the plastic takes touches, so a finger in the hole reaches the page underneath */}
      <path
        d={PLASTIC}
        fillRule="evenodd"
        fill="rgba(253, 249, 238, 0.6)"
        stroke={held ? "#a0704b" : "rgba(46, 37, 28, 0.5)"}
        strokeWidth={held ? 2 : 1}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "visiblePainted" }}
      />
      <path d={TICKS} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {/* The baseline runs through the hole, and a short upright line crosses it there to mark the centre */}
      <path d={`M0 ${R}H${2 * R}M${R} ${R - 5}V${R + 5}`} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {/* Two scales every 10 degrees: the outer one counts from the right, the inner one from the left */}
      <g fill="currentColor" textAnchor="middle" dominantBaseline="central" className="font-mono">
        {NUMBERS.map(({ deg, outer, inner }) => (
          <g key={deg}>
            <text x={outer.x} y={outer.y} fontSize={3.2} fontWeight={600} transform={`rotate(${outer.turn} ${outer.x} ${outer.y})`}>
              {deg}
            </text>
            <text x={inner.x} y={inner.y} fontSize={2.6} opacity={0.7} transform={`rotate(${inner.turn} ${inner.x} ${inner.y})`}>
              {180 - deg}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
});

interface ProtractorProps {
  /** What the protractor lies in, such as the worksheet's stack of pages. It scrolls and zooms along with it. */
  containerRef: RefObject<HTMLElement | null>;
  /** A centimetre in the container's own pixels, before any zoom. */
  cm: number;
  /** Where the middle of the protractor starts, in the container's own pixels. */
  start: Vec;
  /** The tools on the pane, which its drawing layers ask about each line. The protractor is one of them while it's out. */
  guides: Set<DrawingGuide>;
  /** Dark PDF mode, where the protractor darkens along with the pages. */
  darkMode: boolean;
  onHide: () => void;
}

/** The protractor in screen pixels, for its gestures and for the drawing layers. Its radius is given in the container's pixels. */
function protractorFrame(at: OnScreen, radius: number): ProtractorFrame {
  const onScreenRadius = radius * at.scale;
  return {
    cx: at.cx,
    cy: at.cy,
    dx: Math.cos(at.turn),
    dy: Math.sin(at.turn),
    radius: onScreenRadius,
    strip: onScreenRadius * STRIP_SHARE,
    hole: onScreenRadius * HOLE_SHARE,
  };
}

/**
 * A protractor lying on a pane, in true centimetres of the printed page. It
 * sits in the container with the pages, like the ruler, and it's moved and
 * turned the same way, as usePlacedTool describes. It starts at the size it
 * was last left at on this board, 10 cm across the first time, and the handle
 * at the left end of its strip resizes it about its centre mark.
 *
 * A line started in the hole at its centre draws a ray, and one started just
 * outside its curved edge draws an arc. While either is drawn, the middle of
 * the protractor shows its reading: both scales' readings for a ray, such as
 * "35° / 145°", and how many degrees an arc spans. While it's held, it shows
 * its own tilt, and the rest of the time it shows nothing.
 *
 * Dragged with one finger, its centre mark snaps onto points in the pen ink,
 * as the compasses' needle does, so it can sit exactly on the corner of an
 * angle. A ray whose end comes within half a centimetre of a point runs
 * exactly to it, with its reading turned to the nearest whole degree, so a ray
 * from the corner to a point on the angle's other arm measures the angle. A
 * ring shows each point it has caught.
 */
export function Protractor({ containerRef, cm, start, guides, darkMode, onHide }: ProtractorProps) {
  const [across, setAcross] = useState(readProtractorSize);
  const radius = (across / 2) * cm;
  const strip = radius * STRIP_SHARE;
  const { toolRef, place, held, snapped, onScreen, handlers } = usePlacedTool({
    containerRef,
    // The centre mark is on the baseline, below the middle of the protractor.
    start: [start[0], start[1] + (radius - strip) / 2],
    near: (at, point) => nearProtractor(protractorFrame(at, radius), point, CATCH),
    snap: inkSnapAt,
  });
  const [reading, setReading] = useState<string | null>(null);
  // The point the end of the ray being drawn is pinned to, for the ring that shows it.
  const { pinned, show, clear } = usePinnedPoints(containerRef);

  useLayoutEffect(() => {
    const guide: DrawingGuide = {
      lineFrom: (from, offset) => {
        const at = onScreen();
        if (!at) return null;
        const frame = protractorFrame(at, radius);
        const kind = lineKind(frame, from);
        if (!kind) return null;
        const fromAngle = polar(frame, from).angle;
        return {
          to: (point) => {
            if (kind === "ray") {
              // A ray whose end comes near a point in the ink runs exactly to that point.
              const turned = rayTo(frame, point);
              const pin = inkSnapAt(turned.ends[1]);
              const ray = pin ? rayOnto(frame, pin) : turned;
              show([pin]);
              setReading(`${ray.degrees}° / ${180 - ray.degrees}°`);
              return ray.ends;
            }
            const arc = arcTo(frame, fromAngle, point, offset);
            setReading(`${arc.degrees}°`);
            return arc.points;
          },
          end: () => {
            setReading(null);
            clear();
          },
        };
      },
    };
    guides.add(guide);
    return () => {
      guides.delete(guide);
    };
  }, [guides, onScreen, radius, show, clear]);

  // A drag of the handle, measured by the finger's distance from the centre
  // mark on screen. The size is saved for this board when the finger lifts.
  const resizeRef = useRef<{ pointerId: number; from: number; startCm: number; size: number } | null>(null);
  const distanceFromCentre = (e: React.PointerEvent) => {
    const at = onScreen();
    return at ? Math.hypot(e.clientX - at.cx, e.clientY - at.cy) : 0;
  };
  const endResize = (e: React.PointerEvent) => {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    resizeRef.current = null;
    saveProtractorSize(drag.size);
  };

  const shown = reading ?? (held ? `${shownTilt(place.angle)}°` : null);
  // The X and the handle stay big enough for a finger at every size.
  const control = 0.8 * cm;
  // The centre mark has a ring too while a drag has it on a point in the ink.
  const rings: Vec[] = snapped ? [[place.cx, place.cy], ...pinned] : pinned;

  return (
    <>
      <div
        ref={toolRef}
        role="group"
        aria-label={LABEL}
        title={LABEL}
        data-touch-owner=""
        {...handlers}
        // The box itself lets touches through, and the plastic inside it takes them.
        className={cn("pointer-events-none absolute z-10 touch-none select-none text-[#2e251c]", held ? "cursor-grabbing" : "cursor-grab")}
        style={{
          left: place.cx - radius,
          top: place.cy - radius,
          width: 2 * radius,
          height: radius + strip,
          transform: `rotate(${place.angle}deg)`,
          transformOrigin: `${radius}px ${radius}px`,
          filter: darkMode ? PDF_DARK_FILTER : undefined,
        }}
      >
        <ProtractorMarks held={held} />
        {/* The reading turns with the protractor, and flips half a turn whenever it would otherwise be upside down */}
        {shown && (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap",
              readingFlipped(place.angle) && "rotate-180",
              READING,
            )}
            style={{ top: radius * 0.55 }}
          >
            {shown}
          </span>
        )}
        {/* The handle sits on the strip below the baseline, at its left-hand end */}
        <span
          data-tool-handle=""
          role="img"
          aria-label="Drag to resize"
          title="Drag to resize"
          onPointerDown={(e) => {
            if (!grabPointer(e)) return;
            resizeRef.current = { pointerId: e.pointerId, from: distanceFromCentre(e), startCm: across, size: across };
          }}
          onPointerMove={(e) => {
            const drag = resizeRef.current;
            if (!drag || drag.pointerId !== e.pointerId) return;
            e.stopPropagation();
            drag.size = draggedSize(drag.startCm, drag.from, distanceFromCentre(e));
            setAcross(drag.size);
          }}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="pointer-events-auto absolute grid -translate-y-1/2 place-items-center cursor-ew-resize"
          style={{ left: 0.3 * cm, top: radius + strip / 2, width: control, height: control }}
        >
          <i className={HANDLE_DOT} />
        </span>
        {/* The X sits on the strip too, at its right-hand end */}
        <button
          type="button"
          aria-label="Hide the protractor"
          title="Hide the protractor"
          onClick={onHide}
          className={cn("pointer-events-auto absolute -translate-y-1/2", ROUND_BUTTON)}
          style={{ right: 0.3 * cm, top: radius + strip / 2, width: control, height: control }}
        >
          {/* The X turns back against the protractor, so it never looks like a plus */}
          <X className="h-1/2 w-1/2" style={{ transform: `rotate(${-place.angle}deg)` }} />
        </button>
      </div>
      <SnapRings points={rings} cm={cm} darkMode={darkMode} />
    </>
  );
}
