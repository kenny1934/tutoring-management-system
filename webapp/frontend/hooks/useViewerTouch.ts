"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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
  startMid: TouchPoint;
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
 * - A finger that lands on something marked `data-touch-owner`, such as a
 *   cover's tab, belongs to that element, which handles it itself. We call
 *   this the Touch Owner rule.
 * - A finger or the mouse on something marked `data-takes-one-finger`, such
 *   as the Draft's layer for placing a pair of axes, goes to that element
 *   whatever tool is picked, so it never pans. Unlike a touch owner's finger,
 *   it still counts towards a two-finger gesture.
 * - A long press never opens the browser's right-click menu, except in a text
 *   box. Chrome takes a finger held still for a right click, and opening the
 *   menu cancels the touch, so a tutor holding a finger down to draw a dot
 *   would lose the dot to the menu.
 *
 * The handlers go on the scrolling container in the capture phase, so they
 * see every touch before the drawing layer does and can keep the second
 * finger away from it. Everything they need is read through refs, so they
 * don't need to keep the same identity between renders.
 */
export function useViewerTouch(options: ViewerTouchOptions) {
  const opts = useRef(options);
  opts.current = options;

  const touches = useRef(new Map<number, TouchPoint>());
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const [gestureActive, setGestureActive] = useState(false);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const firstTwo = (): [TouchPoint, TouchPoint] => {
    const [a, b] = [...touches.current.values()];
    return [a, b];
  };

  const startPan = (e: React.PointerEvent) => {
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { opts.current.scrollRef.current?.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  };

  // Start (or restart, when fingers are added or lifted) measuring a gesture
  // from where the fingers are now.
  const beginGesture = (zoom: number) => {
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
      startMid: mid,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      zoom,
      liveZoom: zoom,
      anchor: page ? { x: (mid.x - page.left) / scale, y: (mid.y - page.top) / scale } : { x: 0, y: 0 },
      committed: false,
    };
  };

  const moveGesture = () => {
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
      el.scrollLeft = g.scrollLeft - (mid.x - g.startMid.x);
      el.scrollTop = g.scrollTop - (mid.y - g.startMid.y);
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
  };

  // Each finger reports its own moves, so a two-finger gesture would run twice
  // a frame. The moves only record where the fingers are, and the gesture runs
  // once, just before the next frame is painted.
  const scheduleMove = () => {
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; moveGesture(); });
  };
  // Catch up on a move still waiting for its frame, before fingers are added or lifted.
  const flushMove = () => {
    if (!frame.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    moveGesture();
  };

  const endGesture = () => {
    const g = gesture.current;
    if (!g || g.committed) return;
    g.committed = true;
    if (g.kind === "pinch") opts.current.commitZoom(g.liveZoom);
  };

  const onPointerDownCapture = (e: React.PointerEvent) => {
    // The Touch Owner rule. A finger or a mouse that lands on something marked
    // data-touch-owner, such as a cover's tab, is left to it: the viewer
    // doesn't pan with it or count it towards a two-finger gesture, and lets
    // the event through. A finger that lands anywhere else in the meantime is
    // an ordinary touch, so a tutor can hold something with one hand and draw
    // with the other.
    if ((e.target as Element).closest?.("[data-touch-owner]")) return;
    // Something marked data-takes-one-finger, such as the Draft's layer for
    // placing a pair of axes, takes one finger or the mouse whatever tool is
    // picked, so the viewer never pans with it. Unlike a touch owner, it
    // still counts towards a two-finger gesture, so two fingers still scroll.
    const takesOneFinger = !!(e.target as Element).closest?.("[data-takes-one-finger]");
    if (e.pointerType === "mouse") {
      if (opts.current.handTool && e.button === 0 && !takesOneFinger) startPan(e);
      return;
    }
    // The first finger of a fresh touch clears anything left over from a
    // touch whose lift we never saw, such as one that ended off the window.
    if (e.isPrimary) {
      touches.current.clear();
      gesture.current = null;
      setGestureActive(false);
    }
    flushMove();
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (touches.current.size >= 2) {
      e.stopPropagation();
      pan.current = null;
      beginGesture(gesture.current?.liveZoom ?? opts.current.zoom);
      setGestureActive(true);
      return;
    }
    // A finger that lands while the last gesture's other finger is still down
    // waits for every finger to lift, instead of starting a stray line.
    if (gesture.current) { e.stopPropagation(); return; }

    const onPage = (e.target as Element).closest?.("[data-annotation-layer]");
    if (!takesOneFinger && (opts.current.handTool || !onPage)) startPan(e);
  };

  const onPointerMoveCapture = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current && touches.current.has(e.pointerId)) {
      e.stopPropagation();
      scheduleMove();
      return;
    }
    const p = pan.current;
    const el = opts.current.scrollRef.current;
    if (p && p.id === e.pointerId && el) {
      el.scrollLeft -= e.clientX - p.x;
      el.scrollTop -= e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    }
  };

  const onPointerEndCapture = (e: React.PointerEvent) => {
    if (pan.current?.id === e.pointerId) pan.current = null;
    if (!touches.current.has(e.pointerId) || !gesture.current) {
      touches.current.delete(e.pointerId);
      return;
    }
    flushMove();
    touches.current.delete(e.pointerId);
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
  };

  // A text box keeps its menu, so a tutor can still paste into it with a right click.
  const onContextMenu = (e: React.MouseEvent) => {
    if (!(e.target as Element).closest?.("input, textarea, [contenteditable]")) e.preventDefault();
  };

  return {
    /** True from the moment a second finger lands until every finger lifts. */
    gestureActive,
    handlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture: onPointerEndCapture,
      onPointerCancelCapture: onPointerEndCapture,
      onContextMenu,
    },
  };
}
