"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import { useBackToClose } from "@/hooks/useBackToClose";
import styles from "@/components/material/MaterialWorkspace.module.css";

/** The worksheet owns the entrance motion; the containing phone surface stays still. */
export function DocumentReaderSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const { zIndex, isTopmost } = useOverlayLayer(true, { lockScroll: true });
  useBackToClose(true, onClose);
  useEffect(() => {
    const main = document.getElementById("main-content"), previous = main?.inert;
    const first = surface.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]');
    (first ?? surface.current)?.focus({ preventScroll: true });
    if (main) main.inert = true;
    return () => { if (main) main.inert = previous ?? false; };
  }, []);
  return createPortal(<div ref={surface} role="dialog" aria-modal="true" aria-label="Document preview" tabIndex={-1} className={styles.materialReaderSheet} style={{ zIndex }} onKeyDown={event => { if (!isTopmost) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const targets = [...(surface.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length > 0);
      const first = targets[0], last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); surface.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === surface.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    } }}>{children}</div>, document.body);
}
