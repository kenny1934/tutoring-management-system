"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared positioning + dismissal hook for portaled inline popovers.
 *
 * Caller wires `triggerRef` to the toggle button and `menuRef` to the
 * portaled menu div, sets the `open` state itself, and renders the menu
 * at `pos` (which is null until the first measurement).
 *
 * - Measures the trigger's bottom-left on open / scroll / resize so the
 *   menu follows the trigger.
 * - Closes on outside click and Escape.
 */
export function usePortalPopover(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return { triggerRef, menuRef, pos };
}
