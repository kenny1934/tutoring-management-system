"use client";

import { memo, useLayoutEffect, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { usePlacedTool, type OnScreen } from "@/hooks/usePlacedTool";
import { inkSnapAt } from "@/hooks/useInkPages";
import { CATCH, readingFlipped, type DrawingGuide } from "@/lib/drawing-guide";
import {
  RULER_HEIGHT_CM, RULER_LENGTH_CM, edgeAt, nearRuler, ontoEdge, pinnedLine, shownAngle, shownLength, type RulerFrame,
} from "@/lib/ruler";
import type { Vec } from "@/lib/stroke-select";
import { READING, ROUND_BUTTON, SnapRings, usePinnedPoints } from "./ToolParts";

const LABEL = "Ruler: drag it to move it, or turn it with two fingers or the mouse wheel";

// The marks, worked out once in millimetres: a tick every millimetre along
// both long edges, longer ones at every half and whole centimetre, and a
// number at every centimetre from 0 to 15.
const TICKS = Array.from({ length: 151 }, (_, mm) => {
  const x = 5 + mm;
  const length = mm % 10 === 0 ? 6 : mm % 5 === 0 ? 4.2 : 2.6;
  return `M${x} 0v${length}M${x} 30v-${length}`;
}).join("");
const NUMBERS = Array.from({ length: 16 }, (_, n) => n);

// The marks never change, so a move of the ruler doesn't draw them again.
const RulerMarks = memo(function RulerMarks() {
  return (
    <svg viewBox="0 0 160 30" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
      <path d={TICKS} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <g fill="currentColor" textAnchor="middle" className="font-mono">
        {NUMBERS.map((n) => (
          <text key={n} x={5 + n * 10} y={10.6} fontSize={3.2} fontWeight={600}>{n}</text>
        ))}
        <text x={10} y={10.2} fontSize={2.4} fontWeight={500}>cm</text>
      </g>
    </svg>
  );
});

interface RulerProps {
  /** What the ruler lies in, such as the worksheet's stack of pages. It scrolls and zooms along with it. */
  containerRef: RefObject<HTMLElement | null>;
  /** A centimetre in the container's own pixels, before any zoom. */
  cm: number;
  /** Where the ruler's centre starts, in the container's own pixels. */
  start: Vec;
  /** The tools on the pane, which its drawing layers ask about each line. The ruler is one of them while it's out. */
  guides: Set<DrawingGuide>;
  /** Dark PDF mode, where the ruler darkens along with the pages. */
  darkMode: boolean;
  onHide: () => void;
}

/** The ruler in screen pixels, for its gestures and for the drawing layers. */
function rulerFrame(at: OnScreen, cm: number): RulerFrame {
  return {
    cx: at.cx,
    cy: at.cy,
    dx: Math.cos(at.turn),
    dy: Math.sin(at.turn),
    halfLength: (RULER_LENGTH_CM * cm * at.scale) / 2,
    halfHeight: (RULER_HEIGHT_CM * cm * at.scale) / 2,
  };
}

/**
 * A ruler lying on a pane, 16 cm long in true centimetres of the printed
 * page. It sits in the container with the pages, so it scrolls and zooms with
 * them and can lie across a page break.
 *
 * It's a touch owner, moved and turned as usePlacedTool describes: one finger
 * or the mouse drags it, two fingers turn it, and on a laptop the mouse wheel
 * turns it. The ruler is narrow, so a second finger that lands just beside it
 * turns it too, and a finger further away is left to the pane, so a tutor can
 * hold the ruler with one hand and draw along it with the other.
 *
 * Both ends of a line along an edge land on millimetre marks, so the line is
 * always a whole number of millimetres long. While it's drawn, the middle of
 * the ruler shows its length, such as "6.0 cm", in place of the angle, so a
 * tutor can stop on the length they want.
 *
 * A line along an edge that starts or ends within half a centimetre of a
 * point in the pen ink, such as where two arcs cross, is pinned onto that
 * point, and a ring shows it while the line is drawn. With one end pinned,
 * its length is counted in whole millimetres from that point. With both ends
 * pinned, the line joins the two points exactly, which is how a construction
 * draws a line through two crossings.
 */
export function Ruler({ containerRef, cm, start, guides, darkMode, onHide }: RulerProps) {
  const { toolRef, place, held, onScreen, handlers } = usePlacedTool({
    containerRef,
    start,
    near: (at, point) => nearRuler(rulerFrame(at, cm), point, CATCH),
  });
  // The points the line being drawn is pinned to, for the rings that show them.
  const { pinned, show, clear } = usePinnedPoints(containerRef);
  // The length of the line being drawn, which the ruler shows in place of its angle.
  const [lineLength, setLineLength] = useState<string | null>(null);

  // A line that starts just outside either long edge runs along it, half a
  // pen width out, from mark to mark, and stops at the ruler's ends, unless an
  // end is pinned.
  useLayoutEffect(() => {
    const guide: DrawingGuide = {
      lineFrom: (start, offset) => {
        const at = onScreen();
        const edge = at && edgeAt(rulerFrame(at, cm), start);
        if (!at || !edge) return null;
        const from = ontoEdge(edge, start, offset);
        const pinFrom = inkSnapAt(from);
        return {
          to: (point) => {
            const to = ontoEdge(edge, point, offset);
            const pinTo = inkSnapAt(to);
            show([pinFrom, pinTo]);
            const line = pinnedLine(edge.along, from, to, pinFrom, pinTo, edge.mm);
            setLineLength(shownLength(line, edge.mm));
            return line;
          },
          end: () => {
            setLineLength(null);
            clear();
          },
        };
      },
    };
    guides.add(guide);
    return () => {
      guides.delete(guide);
    };
  }, [guides, onScreen, cm, show, clear]);

  const length = RULER_LENGTH_CM * cm;
  const height = RULER_HEIGHT_CM * cm;

  return (
    <>
      <div
        ref={toolRef}
        role="group"
        aria-label={LABEL}
        title={LABEL}
        data-touch-owner=""
        {...handlers}
        className={cn(
          "absolute z-10 touch-none select-none rounded border border-[#2e251c]/50 bg-[#fdf9ee]/60 text-[#2e251c]",
          "shadow-[0_8px_20px_rgba(46,30,14,0.22),inset_0_1px_0_rgba(255,255,255,0.6)]",
          held ? "cursor-grabbing ring-2 ring-[#a0704b]/60" : "cursor-grab",
        )}
        style={{
          left: place.cx - length / 2,
          top: place.cy - height / 2,
          width: length,
          height,
          transform: `rotate(${place.angle}deg)`,
          filter: darkMode ? PDF_DARK_FILTER : undefined,
        }}
      >
        <RulerMarks />
        {/* The reading turns with the ruler, and flips half a turn whenever it would otherwise be upside down */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap",
            readingFlipped(place.angle) && "rotate-180",
            READING,
          )}
        >
          {lineLength ?? `${shownAngle(place.angle)}°`}
        </span>
        {/* The X sits in the clear band between the two rows of marks, at the ruler's far end */}
        <button
          type="button"
          aria-label="Hide the ruler"
          title="Hide the ruler"
          onClick={onHide}
          className={cn("absolute top-1/2 -translate-y-1/2", ROUND_BUTTON)}
          style={{ right: 0.6 * cm, width: 1.1 * cm, height: 1.1 * cm }}
        >
          {/* The X turns back against the ruler, so it never looks like a plus */}
          <X className="h-1/2 w-1/2" style={{ transform: `rotate(${-place.angle}deg)` }} />
        </button>
      </div>

      <SnapRings points={pinned} cm={cm} darkMode={darkMode} />
    </>
  );
}
