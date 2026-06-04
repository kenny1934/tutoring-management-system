"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Viewport y where `ref`'s bottom edge rests once the element is stuck:
 *  its resolved `top` offset plus its own height. Use it to park a second
 *  sticky element (a thead, a chapter header) directly beneath the first so
 *  they stack instead of overlapping. Recomputes on resize — and on window
 *  resize generally, which also catches a parent sticky offset (e.g. the
 *  shared `--ct-stick` var) shifting at a breakpoint. */
export function useStuckBottom(
  ref: RefObject<HTMLElement | null>
): number {
  const [bottom, setBottom] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // For a sticky element, computed `top` is the specified offset (not the
      // live scrolled position), so top + height is where it parks when stuck.
      const top = parseFloat(getComputedStyle(el).top) || 0;
      setBottom(Math.round(top + el.offsetHeight));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);
  return bottom;
}
