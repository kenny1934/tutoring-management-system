"use client";

import { useEffect, type RefObject } from "react";

/** Close an open popover/menu on an outside pointer-down or the Escape key.
 *  Listeners are attached only while `open` so a closed popover costs nothing.
 *  A lightweight alternative to the focus-trapping `useModalA11y` for anchored,
 *  non-modal surfaces. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [ref, open, onDismiss]);
}
