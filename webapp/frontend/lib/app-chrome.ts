"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Lets a screen that needs all of a phone's height, such as lesson mode, put
 * the bottom bar away while it is open. Each screen that asks is counted, so
 * the bar comes back only when the last of them closes.
 */

let hiders = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setHiders(next: number) {
  hiders = next;
  listeners.forEach((listener) => listener());
}

/** Hides the bottom bar for as long as the calling component is on screen. */
export function useHideBottomBar(hide = true) {
  useEffect(() => {
    if (!hide) return;
    setHiders(hiders + 1);
    return () => setHiders(hiders - 1);
  }, [hide]);
}

/** Whether some screen has asked for the bottom bar to be put away. */
export function useBottomBarHidden() {
  return useSyncExternalStore(subscribe, () => hiders > 0, () => false);
}
