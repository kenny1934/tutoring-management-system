"use client";

import { useEffect, useId, useSyncExternalStore } from "react";

/**
 * One ordered stack of every overlay currently on screen.
 *
 * Overlays are independent React trees: each portals to `document.body` and
 * registers its own key listener, so nothing about the component hierarchy
 * tells the modal underneath that something has just been stacked on top of
 * it. One Escape then reaches every open overlay at once and closes the lot,
 * and paint order comes down to whichever portal happened to mount last.
 *
 * Registering here gives an overlay the two things it cannot work out alone:
 * whether it is topmost, so only that one answers a keypress or a backdrop
 * click, and a z-index that follows its position in the stack rather than a
 * hardcoded guess. It also reference-counts the body scroll lock, so an inner
 * overlay closing does not hand scrolling back to the page while an outer one
 * is still open.
 *
 * Fail-open by design: an overlay that is not in the stack, whether not yet
 * registered or already removed, reports itself topmost. A bug here can make
 * Escape close too much, never too little, because an overlay that cannot be
 * dismissed is the one failure a reader cannot recover from.
 */

/**
 * Deliberately the numbers the overlays already hardcoded: 9999 for a modal
 * and 10000 for a confirm dialog over it. Nothing that layers correctly today
 * moves, and the dozens of overlays still carrying their own z-index keep
 * their place relative to the stack until they join it.
 */
const BASE_Z = 9999;
const Z_STEP = 1;
const MAX_LAYERS = 10;

/**
 * For the few things that must stay visible over any depth of overlay, toasts
 * above all: a confirm dialog's scrim would otherwise hide the toast reporting
 * what the confirmed action did.
 */
export const ABOVE_OVERLAYS_Z = BASE_Z + MAX_LAYERS * Z_STEP;

let stack: readonly string[] = [];
const listeners = new Set<() => void>();

function setStack(next: readonly string[]) {
  stack = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => stack;
// The server renders no overlays, and the snapshot has to be referentially
// stable or useSyncExternalStore loops.
const SERVER_STACK: readonly string[] = [];
const getServerSnapshot = () => SERVER_STACK;

let scrollLocks = 0;
let overflowBeforeLock = "";

function lockBodyScroll() {
  if (scrollLocks++ === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function releaseBodyScroll() {
  if (scrollLocks === 0) return;
  if (--scrollLocks === 0) {
    document.body.style.overflow = overflowBeforeLock;
  }
}

export interface OverlayLayer {
  /** True when nothing is stacked above: Escape and backdrop clicks are ours. */
  isTopmost: boolean;
  /** Paints this overlay above everything opened before it. */
  zIndex: number;
}

/**
 * Join the overlay stack for as long as `isOpen` holds.
 *
 * Pass `lockScroll` only for overlays that already froze the page themselves;
 * the counter replaces their own save-and-restore, it does not add a lock
 * where there wasn't one.
 */
export function useOverlayLayer(
  isOpen: boolean,
  { lockScroll = false }: { lockScroll?: boolean } = {},
): OverlayLayer {
  const id = useId();

  useEffect(() => {
    if (!isOpen) return;
    setStack([...stack, id]);
    if (lockScroll) lockBodyScroll();
    return () => {
      setStack(stack.filter((entry) => entry !== id));
      if (lockScroll) releaseBodyScroll();
    };
  }, [isOpen, id, lockScroll]);

  const layers = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const depth = layers.indexOf(id);

  return {
    isTopmost: depth === -1 || depth === layers.length - 1,
    // Clamped so a runaway stack can never climb over ABOVE_OVERLAYS_Z. Depth
    // -1 is the pre-registration render, which paints at the base.
    zIndex: BASE_Z + Math.min(Math.max(depth, 0), MAX_LAYERS - 1) * Z_STEP,
  };
}
