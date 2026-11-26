"use client";

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { useOverlayLayer } from "@/hooks/useOverlayLayer";
import type { SearchOrigin } from "@/contexts/CommandPaletteContext";
import styles from "./SearchSurface.module.css";

export function SearchSurface({ children, origin, onClose, onUnmount, input, wide = false, detailed = false }: {
  detailed?: boolean; wide?: boolean; children: ReactNode; origin: SearchOrigin | null; onClose: () => void; onUnmount: () => void; input: RefObject<HTMLInputElement | null>;
}) {
  const layer = useOverlayLayer(true, { lockScroll: true });
  const reduced = useReducedMotion(), present = useIsPresent();
  const backdrop = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(onUnmount); returnFocus.current = onUnmount;
  const initial = useRef<{ x: number; y: number; scale: number; opacity: number } | null>(null);
  if (!initial.current) {
    const phone = typeof window !== "undefined" && window.innerWidth < 640;
    const rect = origin?.anchor;
    initial.current = { x: phone || !rect ? 0 : Math.max(-24, Math.min(24, rect.left + rect.width / 2 - window.innerWidth / 2)), y: phone ? -10 : rect ? -14 : 8, scale: phone ? 1 : .98, opacity: 0 };
  }
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const fit = () => {
      backdrop.current?.style.setProperty("--search-height", `${viewport?.height ?? window.innerHeight}px`);
      backdrop.current?.style.setProperty("--search-top", `${viewport?.offsetTop ?? 0}px`);
    };
    fit(); viewport?.addEventListener("resize", fit); viewport?.addEventListener("scroll", fit);
    return () => { viewport?.removeEventListener("resize", fit); viewport?.removeEventListener("scroll", fit); returnFocus.current(); };
  }, [input]);
  return <motion.div ref={backdrop} className={styles.backdrop} style={{ zIndex: layer.zIndex }}
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .14 }}
    onClick={event => { if (event.target === event.currentTarget && layer.isTopmost) onClose(); }}>
    <motion.div ref={panel} role="dialog" aria-modal="true" aria-label="Command palette" data-command-palette className={`${styles.panel} ${wide ? styles.coursewarePanel : detailed ? styles.recordDetailPanel : ""}`} inert={!present}
      initial={reduced ? false : initial.current} animate={{ x: 0, y: 0, scale: 1, opacity: 1 }} exit={reduced ? { opacity: 0 } : initial.current!}
      transition={{ duration: reduced ? 0 : .16, ease: [.2, .7, .2, 1] }}
      onKeyDown={event => {
        if (!layer.isTopmost) return;
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!event.defaultPrevented) { event.preventDefault(); onClose(); }
        }
        if (event.key !== "Tab") return;
        const stops = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(element => element.getClientRects().length);
        const first = stops[0], last = stops.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus({ preventScroll: true }); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
      }}>
      {children}
    </motion.div>
  </motion.div>;
}
