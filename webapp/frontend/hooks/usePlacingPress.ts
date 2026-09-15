"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PlacingPressOptions<Spot> {
  /** True while two fingers scroll or zoom the pane, which drops the preview and places nothing. */
  suspended: boolean;
  /**
   * What would be placed for the pointer in this event, or null where nothing
   * can go. `from` is what the press began with, for a drag that has to keep
   * to where it started. It's null as a press begins, and for a mouse moving
   * without being pressed.
   */
  spotAt: (e: React.PointerEvent, from: Spot | null) => Spot | null;
  onPlace: (spot: Spot) => void;
  /** Whether a mouse shows the preview before it's pressed, since there's a pointer to follow. */
  hover?: boolean;
  /** Whether two spots are the same, so a move that changes nothing leaves the preview as it is. */
  same?: (a: Spot, b: Spot) => boolean;
}

/**
 * A press that places something where the finger lifts, such as a proof
 * reason on a page or the axes on the Draft. A board has no hover, so with a
 * plain tap you'd have no idea where it would land. So a finger going down
 * shows a faint preview of it there, dragging moves the preview, and lifting
 * the finger places it where the preview is. A quick tap still works, and
 * places it where the tap landed.
 *
 * One finger places at a time, and the mouse's other buttons do nothing. A
 * second finger turning the touch into a scroll drops the preview and places
 * nothing, and so does a cancelled touch. The handlers go on the element that
 * takes the press, which captures the pointer, so a drag that strays off the
 * element still ends the press.
 */
export function usePlacingPress<Spot>(options: PlacingPressOptions<Spot>) {
  const pressRef = useRef<{ pointerId: number; from: Spot } | null>(null);
  const [preview, setPreview] = useState<Spot | null>(null);
  // The handlers read the latest options through this, so they stay the same functions from one render to the next.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const drop = useCallback(() => {
    pressRef.current = null;
    setPreview((prev) => (prev === null ? prev : null));
  }, []);
  const { suspended } = options;
  useEffect(() => {
    if (suspended) drop();
  }, [suspended, drop]);

  const handlers = useMemo(() => {
    const show = (spot: Spot | null) => {
      const { same } = latest.current;
      setPreview((prev) => (prev !== null && spot !== null && same?.(prev, spot) ? prev : spot));
    };
    return {
      onPointerDown: (e: React.PointerEvent) => {
        const { suspended, spotAt } = latest.current;
        if (suspended || pressRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
        const spot = spotAt(e, null);
        if (spot === null) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the finger has already lifted */ }
        pressRef.current = { pointerId: e.pointerId, from: spot };
        show(spot);
      },
      onPointerMove: (e: React.PointerEvent) => {
        const { suspended, spotAt, hover } = latest.current;
        const press = pressRef.current;
        if (press ? press.pointerId !== e.pointerId : !hover || e.pointerType !== "mouse" || suspended) return;
        e.preventDefault();
        e.stopPropagation();
        const spot = spotAt(e, press?.from ?? null);
        // A drag that strays where nothing can go leaves the preview where it last was.
        if (spot !== null || !press) show(spot);
      },
      onPointerUp: (e: React.PointerEvent) => {
        const press = pressRef.current;
        if (!press || press.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        const spot = latest.current.spotAt(e, press.from);
        drop();
        if (spot !== null) latest.current.onPlace(spot);
      },
      onPointerCancel: (e: React.PointerEvent) => {
        if (pressRef.current?.pointerId === e.pointerId) drop();
      },
      // A mouse that leaves takes its preview with it, unless it's pressed.
      onPointerLeave: () => {
        if (!pressRef.current) show(null);
      },
    };
  }, [drop]);

  return { preview, handlers, drop };
}
