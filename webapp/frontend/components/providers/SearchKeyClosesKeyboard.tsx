"use client";

import { useEffect } from "react";

/**
 * Lets the Search key on a phone's keyboard put the keyboard away.
 *
 * Most search boxes in CSM filter as you type, so there is nothing for the
 * Search key to submit, and on a phone the keyboard would stay up covering
 * half of the results. When the key is pressed in a field marked
 * `enterKeyHint="search"` and nothing else has handled it (the command
 * palette, for one, uses Enter to open the highlighted result and marks the
 * key as handled), the field lets go of focus and the keyboard closes.
 *
 * It listens on the document, which hears the key after the page's own
 * handlers have run, and only on a touch screen.
 */
export function SearchKeyClosesKeyboard() {
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (!(target instanceof HTMLInputElement) || target.enterKeyHint !== "search") return;
      if (target.form) return;
      target.blur();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
