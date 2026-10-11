"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

// How far in from each edge the fade reaches.
const FADE = 32;

/**
 * Fades the edges of a row that scrolls sideways, the way a phone's own lists
 * show there's more: the right edge while there's more to the right, and the
 * left once it has been scrolled. Each fade goes when that end is reached, and
 * a row that fits without scrolling gets none.
 *
 * @returns the ref for the row, and the style that draws the fades.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft > 2;
      const end = max > 2 && el.scrollLeft < max - 2;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, []);

  let style: CSSProperties | undefined;
  if (edges.start || edges.end) {
    const stops = [
      edges.start ? `transparent, black ${FADE}px` : "black",
      edges.end ? `black calc(100% - ${FADE}px), transparent` : "black",
    ];
    const mask = `linear-gradient(to right, ${stops.join(", ")})`;
    style = { maskImage: mask, WebkitMaskImage: mask };
  }
  return { ref, style };
}
