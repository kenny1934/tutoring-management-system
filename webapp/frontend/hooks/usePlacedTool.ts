"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { snapAngle } from "@/lib/ruler";
import type { Vec } from "@/lib/stroke-select";

/** Where a placed tool lies: its centre in the container's own pixels, and how far it's turned, in degrees. */
export interface Place {
  cx: number;
  cy: number;
  angle: number;
}

/** A placed tool on screen: its centre in screen pixels, how much its container is zoomed, and its turn in radians. */
export interface OnScreen {
  cx: number;
  cy: number;
  scale: number;
  turn: number;
}

interface PlacedToolOptions {
  /** What the tool lies in, such as the worksheet's stack of pages. It scrolls and zooms along with it. */
  containerRef: RefObject<HTMLElement | null>;
  /** Where the tool's centre starts, in the container's own pixels. */
  start: Vec;
  /** Whether a finger at this screen point is close enough to the tool, where it is now, to be a second finger on it. */
  near: (at: OnScreen, point: Vec) => boolean;
}

/** The fingers on the tool, and where they and the tool were when the last one landed or lifted. */
interface Hold {
  points: Map<number, Vec>;
  base: { points: Vec[]; centre: Vec; angle: number } | null;
}

const middle = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const direction = (a: Vec, b: Vec) => Math.atan2(b[1] - a[1], b[0] - a[0]);

/**
 * How a tool lying on a pane, such as the ruler or the protractor, is moved
 * and turned. One finger or the mouse drags it, and two fingers move it and
 * turn it about the point between them without changing its size, snapping to
 * level, upright and every 15 degrees in between.
 *
 * A tool can be narrow, so a second finger that lands just beside it counts
 * too: while it's held, it listens for new fingers on the whole window, before
 * the pane sees them. A finger further away is left to the pane, so a tutor
 * can hold the tool with one hand and draw against it with the other. On a
 * laptop, the mouse wheel over the tool turns it a degree at a time, or 15
 * degrees with Shift.
 *
 * The tool's element takes the ref and the pointer handlers this returns.
 */
export function usePlacedTool({ containerRef, start, near }: PlacedToolOptions) {
  const toolRef = useRef<HTMLDivElement>(null);
  const [place, setPlaceState] = useState<Place>({ cx: start[0], cy: start[1], angle: 0 });
  const placeRef = useRef(place);
  const holdRef = useRef<Hold | null>(null);
  const [held, setHeld] = useState(false);
  // The window's listener reads the latest test through this, so it isn't added again when the test changes.
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  });

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

  /** Where the tool is on screen now, or null before its container is on the page. */
  const onScreen = useCallback((): OnScreen | null => {
    const m = measure();
    if (!m) return null;
    const { cx, cy, angle } = placeRef.current;
    return { cx: m.left + cx * m.scale, cy: m.top + cy * m.scale, scale: m.scale, turn: (angle * Math.PI) / 180 };
  }, [measure]);

  /** Put the tool's centre at a point on screen, kept inside the container so it can't get lost. */
  const moveTo = useCallback((centre: Vec, angle: number) => {
    const m = measure();
    if (!m) return;
    let cx = (centre[0] - m.left) / m.scale;
    let cy = (centre[1] - m.top) / m.scale;
    if (m.width > 0) cx = Math.min(Math.max(cx, 0), m.width);
    if (m.height > 0) cy = Math.min(Math.max(cy, 0), m.height);
    setPlace({ cx, cy, angle });
  }, [measure, setPlace]);

  // Measure from where the fingers and the tool are now. It runs whenever a finger lands or lifts.
  const rebase = useCallback(() => {
    const hold = holdRef.current;
    const at = onScreen();
    if (!hold || !at) return;
    hold.base = { points: [...hold.points.values()], centre: [at.cx, at.cy], angle: placeRef.current.angle };
  }, [onScreen]);

  const grab = useCallback((pointerId: number, point: Vec) => {
    const hold = holdRef.current ?? { points: new Map<number, Vec>(), base: null };
    // Two fingers are all it takes, and Windows keeps three-finger touches for itself.
    if (hold.points.size >= 2) return;
    holdRef.current = hold;
    hold.points.set(pointerId, point);
    try { toolRef.current?.setPointerCapture?.(pointerId); } catch { /* the finger has already lifted */ }
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

  // While the tool is held, a second finger that lands just beside it is
  // caught here, on the window, before the pane or its drawing layer sees it.
  useEffect(() => {
    if (!held) return;
    const catchSecond = (e: PointerEvent) => {
      const hold = holdRef.current;
      if (!hold || hold.points.size !== 1 || hold.points.has(e.pointerId) || e.pointerType === "mouse") return;
      // Buttons, the Pen Tray and menus keep their own taps.
      if (!(e.target instanceof Element) || e.target.closest("button, [role='toolbar'], [role='menu'], [role='dialog']")) return;
      const at = onScreen();
      if (!at || !nearRef.current(at, [e.clientX, e.clientY])) return;
      e.stopPropagation();
      e.preventDefault();
      grab(e.pointerId, [e.clientX, e.clientY]);
    };
    window.addEventListener("pointerdown", catchSecond, true);
    return () => window.removeEventListener("pointerdown", catchSecond, true);
  }, [held, onScreen, grab]);

  // The mouse wheel over the tool turns it. Some browsers send Shift and the
  // wheel as a sideways scroll, so either direction counts.
  useEffect(() => {
    const el = toolRef.current;
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

  const onPointerDown = (e: React.PointerEvent) => {
    // Buttons and handles on the tool take their own touches, and only the mouse's main button drags.
    if ((e.target as Element).closest("button, [data-tool-handle]") || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    grab(e.pointerId, [e.clientX, e.clientY]);
  };

  return {
    toolRef,
    place,
    held,
    onScreen,
    /** Puts the tool somewhere new, for a tool with handles of its own, such as the compasses. */
    setPlace,
    handlers: { onPointerDown, onPointerMove: follow, onPointerUp: lift, onPointerCancel: lift },
  };
}
