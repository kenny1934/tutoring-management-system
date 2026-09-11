"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import {
  classifyTwoFingerGesture, distance, midpoint,
  type TouchPoint, type TwoFingerGesture,
} from "@/lib/touch-gestures";

interface ViewerTouchOptions {
  /** The scrolling container that holds the pages. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The first page. Pinch-zoom keeps the point under your fingers fixed relative to it. */
  getAnchor: () => HTMLElement | null;
  /** True when the Hand is picked, so one finger or a mouse drag scrolls. */
  handTool: boolean;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /** Show a zoom level straight away, during a pinch, without a React render. */
  previewZoom: (zoom: number) => void;
  /** Keep the zoom level a pinch ended on. */
  commitZoom: (zoom: number) => void;
}

interface Gesture {
  kind: TwoFingerGesture | null;
  start: [TouchPoint, TouchPoint];
  scrollLeft: number;
  scrollTop: number;
  zoom: number;
  liveZoom: number;
  /** The point under the fingers when the pinch began, in unzoomed page pixels from the first page's corner. */
  anchor: TouchPoint;
  committed: boolean;
}

/**
 * Touch handling for the lesson viewer, written for a touch board where the
 * stylus works like a finger:
 *
 * - One finger uses the picked tool. With the Hand, or on the grey margin
 *   beside the pages, it scrolls instead. A mouse drag with the Hand scrolls
 *   too, and the mouse wheel scrolls as usual.
 * - Two fingers scroll or pinch-zoom, decided once per gesture.
 * - When a second finger lands, the drawing layers are told to throw away
 *   whatever the first finger had started, through `gestureActive`.
 *
 * The handlers go on the scrolling container in the capture phase, so they
 * see every touch before the drawing layer does and can keep the second
 * finger away from it.
 */
export function useViewerTouch(options: ViewerTouchOptions) {
  const opts = useRef(options);
  opts.current = options;

  const touches = useRef(new Map<number, TouchPoint>());
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [gestureActive, setGestureActive] = useState(false);

  const firstTwo = (): [TouchPoint, TouchPoint] => {
    const [a, b] = [...touches.current.values()];
    return [a, b];
  };

  // Start (or restart, when fingers are added or lifted) measuring a gesture
  // from where the fingers are now.
  const beginGesture = useCallback((zoom: number) => {
    const el = opts.current.scrollRef.current;
    if (!el || touches.current.size < 2) return;
    const pts = firstTwo();
    const mid = midpoint(...pts);
    const page = opts.current.getAnchor()?.getBoundingClientRect();
    const scale = zoom / 100;
    const previous = gesture.current;
    gesture.current = {
      // A finger added or lifted mid-gesture keeps it a scroll or a pinch. A
      // fresh second finger after a finished pinch gets decided again.
      kind: previous && !previous.committed ? previous.kind : null,
      start: pts,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      zoom,
      liveZoom: zoom,
      anchor: page ? { x: (mid.x - page.left) / scale, y: (mid.y - page.top) / scale } : { x: 0, y: 0 },
      committed: false,
    };
  }, []);

  const moveGesture = useCallback(() => {
    const g = gesture.current;
    const el = opts.current.scrollRef.current;
    if (!g || !el || touches.current.size < 2 || g.committed) return;
    const now = firstTwo();
    if (!g.kind) {
      g.kind = classifyTwoFingerGesture(g.start, now);
      // Measure the pinch from here, so the zoom doesn't jump by the spread
      // it took to recognise it.
      if (g.kind === "pinch") { beginGesture(g.liveZoom); return; }
    }
    const mid = midpoint(...now);
    if (g.kind !== "pinch") {
      const startMid = midpoint(...g.start);
      el.scrollLeft = g.scrollLeft - (mid.x - startMid.x);
      el.scrollTop = g.scrollTop - (mid.y - startMid.y);
      return;
    }
    const { minZoom, maxZoom } = opts.current;
    const ratio = distance(...now) / Math.max(distance(...g.start), 1);
    const zoom = Math.min(maxZoom, Math.max(minZoom, g.zoom * ratio));
    g.liveZoom = zoom;
    opts.current.previewZoom(zoom);
    // Scroll so the point that was under your fingers is under them again.
    const page = opts.current.getAnchor()?.getBoundingClientRect();
    if (!page) return;
    const scale = zoom / 100;
    el.scrollLeft += page.left + g.anchor.x * scale - mid.x;
    el.scrollTop += page.top + g.anchor.y * scale - mid.y;
  }, [beginGesture]);

  const endGesture = useCallback(() => {
    const g = gesture.current;
    if (!g || g.committed) return;
    g.committed = true;
    if (g.kind === "pinch") opts.current.commitZoom(g.liveZoom);
  }, []);

  const onPointerDownCapture = useCallback((e: React.PointerEvent) => {
    const el = opts.current.scrollRef.current;
    if (e.pointerType === "mouse") {
      if (opts.current.handTool && e.button === 0) {
        pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try { el?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      }
      return;
    }
    // The first finger of a fresh touch clears anything left over from a
    // touch whose lift we never saw, such as one that ended off the window.
    if (e.isPrimary) {
      touches.current.clear();
      gesture.current = null;
      setGestureActive(false);
    }
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touches.current.size >= 2) {
      e.stopPropagation();
      pan.current = null;
      const wasActive = gesture.current !== null;
      beginGesture(gesture.current?.liveZoom ?? opts.current.zoom);
      if (!wasActive) setGestureActive(true);
      return;
    }
    // A finger that lands while the last gesture's other finger is still down
    // waits for every finger to lift, instead of starting a stray line.
    if (gesture.current) { e.stopPropagation(); return; }

    const onPage = (e.target as Element).closest?.("[data-annotation-layer]");
    if (opts.current.handTool || !onPage) {
      pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { el?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    }
  }, [beginGesture]);

  const onPointerMoveCapture = useCallback((e: React.PointerEvent) => {
    const el = opts.current.scrollRef.current;
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current && touches.current.has(e.pointerId)) {
      e.stopPropagation();
      moveGesture();
      return;
    }
    const p = pan.current;
    if (p && p.id === e.pointerId && el) {
      el.scrollLeft -= e.clientX - p.x;
      el.scrollTop -= e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    }
  }, [moveGesture]);

  const onPointerEndCapture = useCallback((e: React.PointerEvent) => {
    if (pan.current?.id === e.pointerId) pan.current = null;
    if (!touches.current.delete(e.pointerId) || !gesture.current) return;
    e.stopPropagation();
    if (touches.current.size >= 2) {
      beginGesture(gesture.current.liveZoom);
      return;
    }
    endGesture();
    if (touches.current.size === 0) {
      gesture.current = null;
      setGestureActive(false);
    }
  }, [beginGesture, endGesture]);

  return {
    /** True from the moment a second finger lands until every finger lifts. */
    gestureActive,
    handlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture: onPointerEndCapture,
      onPointerCancelCapture: onPointerEndCapture,
    },
  };
}
