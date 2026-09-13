"use client";

import { useCallback, useState, type RefObject } from "react";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";
import type { Vec } from "@/lib/stroke-select";

const samePoints = (a: Vec[], b: Vec[]) =>
  a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.01 && Math.abs(p[1] - b[i][1]) < 0.01);

/**
 * The points in the ink that the line being drawn against a tool is pinned
 * to, such as the ends of a line along the ruler, kept in the container's own
 * pixels for the rings that show them. `show` takes the points in screen
 * pixels, the way the drawing layers hand them over, along with how much the
 * container is zoomed, and it skips an end that isn't pinned. It runs on
 * every step of the line, so it only sets the points when they've moved.
 */
export function usePinnedPoints(containerRef: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState<Vec[]>([]);
  const show = useCallback((points: (Vec | null)[], scale: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const next = points
      .filter((p): p is Vec => p !== null)
      .map(([x, y]): Vec => [(x - box.left) / scale, (y - box.top) / scale]);
    setPinned((prev) => (samePoints(prev, next) ? prev : next));
  }, [containerRef]);
  const clear = useCallback(() => setPinned([]), []);
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
