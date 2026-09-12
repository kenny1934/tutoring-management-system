"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

const STORAGE_KEY = "lesson-sidebar-width";
export const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

const clampWidth = (width: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));

/** The width saved by the last drag, if there is one and it's still within bounds. */
function savedWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  try {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? "", 10);
    if (!isNaN(saved) && saved >= SIDEBAR_MIN_WIDTH && saved <= SIDEBAR_MAX_WIDTH) return saved;
  } catch {}
  return DEFAULT_WIDTH;
}

/**
 * The lesson sidebar's width, which the tutor sets by dragging its edge. Both
 * lesson views share one saved width, so a tutor who widens it in one finds it
 * wide in the other.
 *
 * Each drag starts from the width the last one left. The one-student view used
 * to start every drag from the width it opened with, so the sidebar jumped
 * back when it was grabbed a second time. The width follows the mouse once per
 * frame and is saved when the drag ends.
 */
export function useSidebarWidth() {
  const [width, setWidth] = useState(savedWidth);
  const widthRef = useRef(width);
  const stopDragRef = useRef<(() => void) | null>(null);

  const startResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    stopDragRef.current?.();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    let lastX = startX;
    let frame: number | null = null;

    const apply = () => {
      frame = null;
      const next = clampWidth(startWidth + lastX - startX);
      widthRef.current = next;
      setWidth(next);
    };
    const onMove = (ev: MouseEvent) => {
      lastX = ev.clientX;
      if (frame === null) frame = requestAnimationFrame(apply);
    };
    const stop = () => {
      // A move still waiting for its frame is where the mouse let go, so it counts.
      if (frame !== null) {
        cancelAnimationFrame(frame);
        apply();
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      stopDragRef.current = null;
      try { localStorage.setItem(STORAGE_KEY, String(widthRef.current)); } catch {}
    };

    stopDragRef.current = stop;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stop);
  }, []);

  // A drag still going when the view closes would otherwise leave its listeners behind.
  useEffect(() => () => stopDragRef.current?.(), []);

  return { width, startResize };
}
