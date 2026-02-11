"use client";

import { useRef, useEffect } from "react";

/**
 * Registers a stable `keydown` listener on `window`.
 *
 * The handler is stored in a ref and synced on every render, so callers
 * can pass an inline function that captures the latest closure state
 * without needing `useCallback` or manual ref-syncing.
 *
 * The event listener is only registered/unregistered when `enabled` changes.
 */
export function useStableKeyboardHandler(
  handler: (e: KeyboardEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => handlerRef.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [enabled]);
}
