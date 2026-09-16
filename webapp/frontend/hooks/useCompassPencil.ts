"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The compasses that are out on the lesson's panes, so the u key can lift or
 * put down a pencil while a finger stays on the handle. A pair is on the list
 * from when it's shown until it's hidden.
 *
 * The list is kept at the module's level, like the pages in useInkPages,
 * rather than threaded down through props. The views know nothing about which
 * tools a pane has out, and the compasses know nothing about the lesson's
 * keys, so this is the one place they meet, for one pane or several.
 *
 * There can be a pair on the worksheet and another on the Draft at the same
 * time. The key goes to the pair that was shown or touched last, which is the
 * one the tutor is working with.
 */

/** A pair's way to lift or put down its pencil, read fresh on every press. */
type Pencil = { readonly current: () => void };

// The pairs that are out, with the one shown or touched last at the end.
let out: readonly Pencil[] = [];
const listeners = new Set<() => void>();
const announce = () => listeners.forEach((listen) => listen());
const subscribe = (listen: () => void) => {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
};
const anyOut = () => out.length > 0;
const noneOnServer = () => false;

/** Lifts the pencil of the pair shown or touched last, or puts it down again. It does nothing while no pair is out. */
function toggleLastTouched() {
  out[out.length - 1]?.current();
}

/**
 * Called by a pair of compasses while it's out, with the way to lift or put
 * down its pencil. It returns `touched`, for the pair to call when a finger
 * lands on it, so the key follows the tutor from one pair to another.
 */
export function useCompassPencil(toggle: () => void): () => void {
  const pencil = useRef(toggle);
  pencil.current = toggle;
  useEffect(() => {
    out = [...out, pencil];
    announce();
    return () => {
      out = out.filter((entry) => entry !== pencil);
      announce();
    };
  }, []);
  return useCallback(() => {
    if (out[out.length - 1] === pencil) return;
    out = [...out.filter((entry) => entry !== pencil), pencil];
  }, []);
}

/**
 * For the lesson views: whether any pair is out, so the key is only claimed
 * while it does something, and what the key does.
 */
export function useCompassPencilKey(): { out: boolean; toggle: () => void } {
  return { out: useSyncExternalStore(subscribe, anyOut, noneOnServer), toggle: toggleLastTouched };
}
