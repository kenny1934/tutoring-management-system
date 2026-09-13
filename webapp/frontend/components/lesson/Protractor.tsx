"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { usePlacedTool, type OnScreen } from "@/hooks/usePlacedTool";
import { CATCH, type DrawingGuide } from "@/lib/ruler";
import {
  PROTRACTOR_HOLE_CM, PROTRACTOR_RADIUS_CM, PROTRACTOR_STRIP_CM, arcTo, lineKind, nearProtractor, polar, rayTo, shownTilt,
  type ProtractorFrame,
} from "@/lib/protractor";
import type { Vec } from "@/lib/stroke-select";

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

// The marks are drawn in millimetres: the curved edge is 70 from the centre
// mark at (70, 70), the strip runs down to 80, and the hole is 4.5 across the
// middle. They're worked out once.
const R = 70;
const C = 70;
const HOLE = PROTRACTOR_HOLE_CM * 10;

/** Where a mark goes at this many degrees round from the right and this far from the centre, turned to face out. */
function onRadius(degrees: number, r: number) {
  const a = (degrees * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C - r * Math.sin(a), turn: 90 - degrees };
}

// A tick every degree round the curved edge, longer at every 5 and 10 degrees.
const TICKS = Array.from({ length: 181 }, (_, deg) => {
  const length = deg % 10 === 0 ? 6 : deg % 5 === 0 ? 4 : 2.4;
  const outer = onRadius(deg, R);
  const inner = onRadius(deg, R - length);
  return `M${outer.x.toFixed(2)} ${outer.y.toFixed(2)}L${inner.x.toFixed(2)} ${inner.y.toFixed(2)}`;
}).join("");
const TENS = Array.from({ length: 19 }, (_, n) => n * 10);

// The plastic, with the hole cut out of it at the centre mark.
const PLASTIC =
  `M0 ${C}A${R} ${R} 0 0 1 ${2 * R} ${C}V80H0Z` +
  `M${C - HOLE} ${C}a${HOLE} ${HOLE} 0 1 0 ${2 * HOLE} 0a${HOLE} ${HOLE} 0 1 0 ${-2 * HOLE} 0Z`;

function ProtractorMarks({ held }: { held: boolean }) {
  return (
    <svg
      viewBox="0 0 140 80"
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
      <path d={`M0 ${C}H${2 * R}M${C} ${C - 6}V${C + 6}`} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {/* Two scales every 10 degrees: the outer one counts from the right, the inner one from the left */}
      <g fill="currentColor" textAnchor="middle" dominantBaseline="central" className="font-mono">
        {TENS.map((deg) => {
          const outer = onRadius(deg, 60.5);
          const inner = onRadius(deg, 54.5);
          return (
            <g key={deg}>
              <text x={outer.x} y={outer.y} fontSize={3.4} fontWeight={600} transform={`rotate(${outer.turn} ${outer.x} ${outer.y})`}>
                {deg}
              </text>
              <text x={inner.x} y={inner.y} fontSize={2.8} opacity={0.7} transform={`rotate(${inner.turn} ${inner.x} ${inner.y})`}>
                {180 - deg}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

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

/** The protractor in screen pixels, for its gestures and for the drawing layers. */
function protractorFrame(at: OnScreen, cm: number): ProtractorFrame {
  const onScreenCm = cm * at.scale;
  return {
    cx: at.cx,
    cy: at.cy,
    dx: Math.cos(at.turn),
    dy: Math.sin(at.turn),
    radius: PROTRACTOR_RADIUS_CM * onScreenCm,
    strip: PROTRACTOR_STRIP_CM * onScreenCm,
    hole: PROTRACTOR_HOLE_CM * onScreenCm,
  };
}

/**
 * A protractor lying on a pane, 14 cm across in true centimetres of the
 * printed page. It sits in the container with the pages, like the ruler, and
 * it's moved and turned the same way, as usePlacedTool describes.
 *
 * A line started in the hole at its centre draws a ray, and one started just
 * outside its curved edge draws an arc. While either is drawn, the middle of
 * the protractor shows its reading: both scales' readings for a ray, such as
 * "35° / 145°", and how many degrees an arc spans. While it's held, it shows
 * its own tilt, and the rest of the time it shows nothing.
 */
export function Protractor({ containerRef, cm, start, guides, darkMode, onHide }: ProtractorProps) {
  const radius = PROTRACTOR_RADIUS_CM * cm;
  const strip = PROTRACTOR_STRIP_CM * cm;
  const { toolRef, place, held, onScreen, handlers } = usePlacedTool({
    containerRef,
    // The centre mark is on the baseline, below the middle of the protractor.
    start: [start[0], start[1] + (radius - strip) / 2],
    near: (at, point) => nearProtractor(protractorFrame(at, cm), point, CATCH),
  });
  const [reading, setReading] = useState<string | null>(null);

  useLayoutEffect(() => {
    const guide: DrawingGuide = {
      lineFrom: (from, offset) => {
        const at = onScreen();
        if (!at) return null;
        const frame = protractorFrame(at, cm);
        const kind = lineKind(frame, from);
        if (!kind) return null;
        const fromAngle = polar(frame, from).angle;
        return {
          to: (point) => {
            if (kind === "ray") {
              const ray = rayTo(frame, point);
              setReading(`${ray.degrees}° / ${180 - ray.degrees}°`);
              return ray.ends;
            }
            const arc = arcTo(frame, fromAngle, point, offset);
            setReading(`${arc.degrees}°`);
            return arc.points;
          },
          end: () => setReading(null),
        };
      },
    };
    guides.add(guide);
    return () => {
      guides.delete(guide);
    };
  }, [guides, onScreen, cm]);

  const shown = reading ?? (held ? `${shownTilt(place.angle)}°` : null);

  return (
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
      {shown && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#2e251c]/80 px-2 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-[#f3e7d3]"
          style={{ top: radius * 0.55 }}
        >
          {shown}
        </span>
      )}
      {/* The X sits on the strip below the baseline, at its right-hand end */}
      <button
        type="button"
        aria-label="Hide the protractor"
        title="Hide the protractor"
        onClick={onHide}
        className="pointer-events-auto absolute grid place-items-center rounded-full bg-[#2e251c]/80 text-[#f3e7d3] hover:bg-[#2e251c]"
        style={{ right: 0.5 * cm, bottom: 0.1 * cm, width: 0.8 * cm, height: 0.8 * cm }}
      >
        <X className="h-1/2 w-1/2" />
      </button>
    </div>
  );
}
