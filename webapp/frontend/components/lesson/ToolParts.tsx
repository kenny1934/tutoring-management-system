"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import { measureContainer, toContainer } from "@/hooks/usePlacedTool";
import type { Vec } from "@/lib/stroke-select";

// The parts that the tools lying on a pane share: the look of their readings,
// buttons and handles, how a handle takes a finger, and the blue rings that
// show which points in the ink they've caught.

/** The dark pill a tool shows a reading in, such as the ruler's angle or the compasses' width. Each tool adds where it sits. */
export const READING =
  "rounded-full bg-[#2e251c]/80 px-2 py-0.5 font-mono text-[13px] font-semibold tabular-nums text-[#f3e7d3]";

/** A tool's round, dark button, such as the X that hides it. Each tool adds where it sits, and sets its size. */
export const ROUND_BUTTON = "grid place-items-center rounded-full bg-[#2e251c]/80 text-[#f3e7d3] hover:bg-[#2e251c]";

// The other controls a tap is left to when it closes something opened out
// over the page. The Pen Tray's buttons are among them, so picking a pen
// closes the box and picks the pen with the same tap.
const OTHER_CONTROLS = "button, input, [role='toolbar'], [role='menu'], [role='dialog']";

/**
 * Close something opened out over the page, such as the compasses' width box
 * or the Draft's axes panel, on a tap anywhere outside it. The tap is kept
 * from the page unless it lands on another control, so closing the box with
 * a pen picked never leaves a dot. The listener is on the window in the
 * capture phase, so it sees the tap before anything on the page can stop it.
 * It reads `close` afresh on every tap, so `close` can use the latest state
 * without the listener being added again.
 */
export function useCloseOnOutsideTap(boxRef: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || boxRef.current?.contains(e.target)) return;
      if (!(e.target instanceof Element && e.target.closest(OTHER_CONTROLS))) {
        e.stopPropagation();
        e.preventDefault();
      }
      closeRef.current();
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [boxRef]);
}

/** The white dot on a handle that a finger drags, such as the protractor's resize handle. */
export const HANDLE_DOT = "block h-4 w-4 rounded-full border-2 border-[#a0704b] bg-white";

/**
 * Take a finger or the mouse on a handle, such as the compasses' grip, for
 * the rest of its drag. The page underneath neither scrolls nor draws with it,
 * and its moves keep coming to the handle even once it slides off. It returns
 * false, and takes nothing, for the mouse's other buttons.
 */
export function grabPointer(e: React.PointerEvent<Element>): boolean {
  if (e.pointerType === "mouse" && e.button !== 0) return false;
  e.preventDefault();
  e.stopPropagation();
  try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* the finger has already lifted */ }
  return true;
}

const samePoints = (a: Vec[], b: Vec[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.01 && Math.abs(p[1] - b[i][1]) < 0.01);

/**
 * The points in the ink that the line being drawn against a tool is pinned
 * to, such as the ends of a line along the ruler, kept in the container's own
 * pixels for the rings that show them. `show` takes the points in screen
 * pixels, the way the drawing layers hand them over, and it skips an end that
 * isn't pinned. It runs on every step of the line, so it only measures the
 * container when there's a point to show, and only sets the points when
 * they've moved.
 */
export function usePinnedPoints(containerRef: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState<Vec[]>([]);
  const clear = useCallback(() => setPinned((prev) => (prev.length > 0 ? [] : prev)), []);
  const show = useCallback((points: (Vec | null)[]) => {
    const ends = points.filter((p): p is Vec => p !== null);
    const el = containerRef.current;
    if (ends.length === 0 || !el) {
      clear();
      return;
    }
    const box = measureContainer(el);
    const next = ends.map((p) => toContainer(box, p));
    setPinned((prev) => (samePoints(prev, next) ? prev : next));
  }, [containerRef, clear]);
  return { pinned, show, clear };
}

/** A blue ring round each point in the ink that a tool has caught, given in the container's own pixels. */
export function SnapRings({ points, cm, darkMode }: { points: Vec[]; cm: number; darkMode: boolean }) {
  return (
    <>
      {points.map(([x, y], i) => (
        <span
          key={i}
          data-pinned=""
          aria-hidden="true"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#2563eb]"
          style={{ left: x, top: y, width: 0.6 * cm, height: 0.6 * cm, filter: darkMode ? PDF_DARK_FILTER : undefined }}
        />
      ))}
    </>
  );
}
