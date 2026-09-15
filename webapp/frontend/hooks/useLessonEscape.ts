"use client";

import { useEffect, useRef } from "react";

/**
 * Escape for something opened over a lesson view while `open` is true, such
 * as the proof reasons list, the Draft's axes or the strip of pages.
 *
 * The lesson views listen for their shortcuts on the window, which hears a
 * key after the document does. So this listens on the document and stops
 * Escape there. Otherwise the same press would also put the pen down or
 * leave the lesson.
 */
export function useLessonEscape(open: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onEscapeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
