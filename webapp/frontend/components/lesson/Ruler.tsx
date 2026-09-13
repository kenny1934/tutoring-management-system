"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import {
  CATCH, RULER_HEIGHT_CM, RULER_LENGTH_CM, edgeAt, nearRuler, shownAngle, snapAngle,
  type RulerFrame, type RulerGuide,
} from "@/lib/ruler";
import type { Vec } from "@/lib/stroke-select";

const LABEL = "Ruler: drag it to move it, or turn it with two fingers or the mouse wheel";

/** Where a new ruler goes: level across the middle of what the pane is showing, in the container's own pixels. */
export function rulerStart(container: HTMLElement | null, viewport: HTMLElement | null): Vec | null {
  if (!container || !viewport) return null;
  const box = container.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  const scale = container.offsetWidth > 0 ? box.width / container.offsetWidth : 1;
  return [((view.left + view.right) / 2 - box.left) / scale, ((view.top + view.bottom) / 2 - box.top) / scale];
}

// The marks, worked out once in millimetres: a tick every millimetre along
// both long edges, longer ones at every half and whole centimetre, and a
// number at every centimetre from 0 to 15.
const TICKS = Array.from({ length: 151 }, (_, mm) => {
  const x = 5 + mm;
  const length = mm % 10 === 0 ? 6 : mm % 5 === 0 ? 4.2 : 2.6;
  return `M${x} 0v${length}M${x} 30v-${length}`;
}).join("");
const NUMBERS = Array.from({ length: 16 }, (_, n) => n);

function RulerMarks() {
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
}

interface RulerProps {
  /** What the ruler lies in, such as the worksheet's stack of pages. It scrolls and zooms along with it. */
  containerRef: RefObject<HTMLElement | null>;
  /** A centimetre in the container's own pixels, before any zoom. */
  cm: number;
  /** Where the ruler's centre starts, in the container's own pixels. */
  start: Vec;
  /** Filled in with the ruler's edges while it's out, for the pane's drawing layers. */
  guideRef: RefObject<RulerGuide | null>;
  /** Dark PDF mode, where the ruler darkens along with the pages. */
  darkMode: boolean;
  onHide: () => void;
}

interface Place {
  cx: number;
  cy: number;
  angle: number;
}

/** The fingers on the ruler, and where they and the ruler were when the last one landed or lifted. */
interface Hold {
  points: Map<number, Vec>;
  base: { points: Vec[]; centre: Vec; angle: number } | null;
}

const middle = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const direction = (a: Vec, b: Vec) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/**
 * A ruler lying on a pane, 16 cm long in true centimetres of the printed
 * page. It sits in the container with the pages, so it scrolls and zooms with
 * them and can lie across a page break.
 *
 * It's a touch owner. One finger or the mouse drags it, and two fingers move
 * it and turn it about the point between them without changing its size. The
 * ruler is narrow, so a second finger that lands just beside it counts too:
 * while it's held, it listens for new fingers on the whole window, before the
 * pane sees them. A finger further away is left to the pane, so a tutor can
 * hold the ruler with one hand and draw along it with the other. On a laptop,
 * the mouse wheel turns it a degree at a time, or 15 degrees with Shift.
 */
export function Ruler({ containerRef, cm, start, guideRef, darkMode, onHide }: RulerProps) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [place, setPlaceState] = useState<Place>({ cx: start[0], cy: start[1], angle: 0 });
  const placeRef = useRef(place);
  const holdRef = useRef<Hold | null>(null);
  const [held, setHeld] = useState(false);

  const setPlace = useCallback((next: Place) => {
    placeRef.current = next;
    setPlaceState(next);
  }, []);

  // The container's corner on screen, how much it's zoomed, and its own size.
  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      scale: el.offsetWidth > 0 ? box.width / el.offsetWidth : 1,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
  }, [containerRef]);

  // The ruler in screen pixels, for its gestures and for the drawing layers.
  const frame = useCallback((): RulerFrame | null => {
    const m = measure();
    if (!m) return null;
    const { cx, cy, angle } = placeRef.current;
    const turn = (angle * Math.PI) / 180;
    return {
      cx: m.left + cx * m.scale,
      cy: m.top + cy * m.scale,
      dx: Math.cos(turn),
      dy: Math.sin(turn),
      halfLength: (RULER_LENGTH_CM * cm * m.scale) / 2,
      halfHeight: (RULER_HEIGHT_CM * cm * m.scale) / 2,
    };
  }, [measure, cm]);

  useLayoutEffect(() => {
    guideRef.current = {
      edgeAt: (point) => {
        const f = frame();
        return f ? edgeAt(f, point) : null;
      },
    };
    return () => {
      guideRef.current = null;
    };
  }, [guideRef, frame]);

  /** Put the ruler's centre at a point on screen, kept inside the container so it can't get lost. */
  const moveTo = useCallback((centre: Vec, angle: number) => {
    const m = measure();
    if (!m) return;
    let cx = (centre[0] - m.left) / m.scale;
    let cy = (centre[1] - m.top) / m.scale;
    if (m.width > 0) cx = Math.min(Math.max(cx, 0), m.width);
    if (m.height > 0) cy = Math.min(Math.max(cy, 0), m.height);
    setPlace({ cx, cy, angle });
  }, [measure, setPlace]);

  // Measure from where the fingers and the ruler are now. It runs whenever a finger lands or lifts.
  const rebase = useCallback(() => {
    const hold = holdRef.current;
    const f = frame();
    if (!hold || !f) return;
    hold.base = { points: [...hold.points.values()], centre: [f.cx, f.cy], angle: placeRef.current.angle };
  }, [frame]);

  const grab = useCallback((pointerId: number, point: Vec) => {
    const hold = holdRef.current ?? { points: new Map<number, Vec>(), base: null };
    // Two fingers are all it takes, and Windows keeps three-finger touches for itself.
    if (hold.points.size >= 2) return;
    holdRef.current = hold;
    hold.points.set(pointerId, point);
    try { rulerRef.current?.setPointerCapture?.(pointerId); } catch { /* the finger has already lifted */ }
    rebase();
    setHeld(true);
  }, [rebase]);

  const follow = (e: React.PointerEvent) => {
    const hold = holdRef.current;
    const base = hold?.base;
    if (!hold || !base || !hold.points.has(e.pointerId)) return;
    hold.points.set(e.pointerId, [e.clientX, e.clientY]);
    const now = [...hold.points.values()];
    if (now.length !== base.points.length) return;
    if (now.length === 1) {
      moveTo([base.centre[0] + now[0][0] - base.points[0][0], base.centre[1] + now[0][1] - base.points[0][1]], base.angle);
      return;
    }
    // Two fingers turn it about the point between them, and carry it with that point.
    const turned = ((direction(now[0], now[1]) - direction(base.points[0], base.points[1])) * 180) / Math.PI;
    const angle = snapAngle(base.angle + turned);
    const turn = ((angle - base.angle) * Math.PI) / 180;
    const [mx, my] = middle(base.points[0], base.points[1]);
    const [nx, ny] = middle(now[0], now[1]);
    const ox = base.centre[0] - mx;
    const oy = base.centre[1] - my;
    moveTo([nx + ox * Math.cos(turn) - oy * Math.sin(turn), ny + ox * Math.sin(turn) + oy * Math.cos(turn)], angle);
  };

  const lift = (e: React.PointerEvent) => {
    const hold = holdRef.current;
    if (!hold?.points.delete(e.pointerId)) return;
    if (hold.points.size > 0) {
      rebase();
      return;
    }
    holdRef.current = null;
    setHeld(false);
  };

  // While the ruler is held, a second finger that lands just beside it is
  // caught here, on the window, before the pane or its drawing layer sees it.
  useEffect(() => {
    if (!held) return;
    const catchSecond = (e: PointerEvent) => {
      const hold = holdRef.current;
      if (!hold || hold.points.size !== 1 || hold.points.has(e.pointerId) || e.pointerType === "mouse") return;
      // Buttons, the Pen Tray and menus keep their own taps.
      if (!(e.target instanceof Element) || e.target.closest("button, [role='toolbar'], [role='menu'], [role='dialog']")) return;
      const f = frame();
      if (!f || !nearRuler(f, [e.clientX, e.clientY], CATCH)) return;
      e.stopPropagation();
      e.preventDefault();
      grab(e.pointerId, [e.clientX, e.clientY]);
    };
    window.addEventListener("pointerdown", catchSecond, true);
    return () => window.removeEventListener("pointerdown", catchSecond, true);
  }, [held, frame, grab]);

  // The mouse wheel over the ruler turns it. Some browsers send Shift and the
  // wheel as a sideways scroll, so either direction counts.
  useEffect(() => {
    const el = rulerRef.current;
    if (!el) return;
    const turn = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      const { cx, cy, angle } = placeRef.current;
      setPlace({ cx, cy, angle: (angle + Math.sign(delta) * (e.shiftKey ? 15 : 1)) % 360 });
    };
    el.addEventListener("wheel", turn, { passive: false });
    return () => el.removeEventListener("wheel", turn);
  }, [setPlace]);

  const length = RULER_LENGTH_CM * cm;
  const height = RULER_HEIGHT_CM * cm;

  return (
    <div
      ref={rulerRef}
      role="group"
      aria-label={LABEL}
      title={LABEL}
      data-touch-owner=""
      onPointerDown={(e) => {
        // The X takes its own taps, and only the mouse's main button drags.
        if ((e.target as Element).closest("button") || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        grab(e.pointerId, [e.clientX, e.clientY]);
      }}
      onPointerMove={follow}
      onPointerUp={lift}
      onPointerCancel={lift}
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
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2e251c]/80 px-2 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-[#f3e7d3]"
      >
        {shownAngle(place.angle)}°
      </span>
      {/* The X sits in the clear band between the two rows of marks, at the ruler's far end */}
      <button
        type="button"
        aria-label="Hide the ruler"
        title="Hide the ruler"
        onClick={onHide}
        className="absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full bg-[#2e251c]/80 text-[#f3e7d3] hover:bg-[#2e251c]"
        style={{ right: 0.6 * cm, width: 1.1 * cm, height: 1.1 * cm }}
      >
        <X className="h-1/2 w-1/2" />
      </button>
    </div>
  );
}
