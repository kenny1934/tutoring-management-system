"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// Inline dropdown with click-outside + escape handling. The menu is portalled
// to document.body so it escapes any overflow-hidden ancestors (the paper
// card), and its position is computed from the trigger's bounding rect and
// clamped to the viewport so it never overflows on narrow screens.
export type DropdownTriggerProps = {
  onClick: () => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
};

export function DropdownMenu({
  trigger,
  children,
  align = "left",
  menuClassName,
}: {
  trigger: (ctx: { open: boolean; triggerProps: DropdownTriggerProps }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // `left` is always the final clamped x-coordinate. We use left-only
  // positioning (no `right`) so the menu can never escape the viewport
  // regardless of whether align is "left" or "right".
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const compute = () => {
      const rect = wrapperRef.current!.getBoundingClientRect();
      // Fall back to 220 on the first pass before the menu is in the DOM;
      // the rAF pass below corrects once the real width is measured.
      const menuWidth = menuRef.current?.offsetWidth ?? 220;
      const preferred = align === "right" ? rect.right - menuWidth : rect.left;
      const maxLeft = window.innerWidth - menuWidth - 8;
      const left = Math.max(8, Math.min(preferred, maxLeft));
      setPos({ top: rect.bottom + 6, left });
    };
    compute();
    const raf = requestAnimationFrame(compute);
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const triggerProps: DropdownTriggerProps = {
    onClick: () => setOpen((o) => !o),
    "aria-haspopup": "menu",
    "aria-expanded": open,
  };

  return (
    <>
      <span ref={wrapperRef} className="inline-flex">
        {trigger({ open, triggerProps })}
      </span>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            top: `${pos.top}px`,
            left: `${pos.left}px`,
            maxWidth: "calc(100vw - 1rem)",
          }}
          className={cn(
            "z-[60] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]",
            menuClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  );
}

export const menuItemClass =
  "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors";
