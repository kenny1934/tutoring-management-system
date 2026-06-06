"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverProps {
  trigger: ReactNode;
  content: ReactNode;
  className?: string;
  align?: "left" | "right";
  /** Close the popover after any click inside the content (menu-style usage). */
  closeOnContentClick?: boolean;
}

export function Popover({ trigger, content, className, align = "left", closeOnContentClick }: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ top: 0, left: 0, triggerTop: 0 });

  const measurePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    posRef.current = {
      top: rect.bottom + 8,
      left: align === "right" ? rect.right : rect.left,
      triggerTop: rect.top,
    };
  }, [align]);

  // Position from posRef, then keep the panel on screen: slide it back
  // inside the horizontal edges and flip above the trigger when it would
  // run off the bottom (triggers near the right edge or in bottom rows).
  // The anchor write comes before the rect read because a fixed element's
  // shrink-to-fit width depends on where it sits in the viewport.
  const applyPosition = useCallback(() => {
    const el = popoverRef.current;
    if (!el) return;
    el.style.top = `${posRef.current.top}px`;
    el.style.left = `${posRef.current.left}px`;

    const margin = 8;
    const rect = el.getBoundingClientRect();
    let dx = 0;
    if (rect.right > window.innerWidth - margin) {
      dx = window.innerWidth - margin - rect.right;
    }
    if (rect.left + dx < margin) dx = margin - rect.left;
    let dy = 0;
    if (rect.bottom > window.innerHeight - margin) {
      const flippedTop = posRef.current.triggerTop - margin - rect.height;
      dy = flippedTop >= margin
        ? flippedTop - rect.top
        : window.innerHeight - margin - rect.bottom;
    }
    if (dx) el.style.left = `${posRef.current.left + dx}px`;
    if (dy) el.style.top = `${posRef.current.top + dy}px`;
  }, []);

  // Clamp before first paint, then keep following the trigger on
  // scroll/resize while open.
  useLayoutEffect(() => {
    if (!isOpen) return;
    applyPosition();

    function handleReposition() {
      measurePosition();
      applyPosition();
    }

    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, measurePosition, applyPosition]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    measurePosition();
    setIsOpen((prev) => !prev);
  }, [measurePosition]);

  return (
    <div className="relative inline-block">
      <div ref={triggerRef} onClick={handleToggle}>
        {trigger}
      </div>

      {isOpen && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className={cn(
              "fixed z-50",
              "bg-[#fef9f3] dark:bg-[#2d2618]",
              "border-2 border-[#d4a574] dark:border-[#8b6f47]",
              "rounded-lg shadow-lg",
              "p-4 min-w-[200px] max-w-[400px]",
              "paper-texture",
              className
            )}
            style={{
              // Inline so the un-layered `.paper-texture { position: relative }`
              // rule in globals.css can't override Tailwind's layered `fixed`.
              position: "fixed",
              top: posRef.current.top,
              left: posRef.current.left,
              transform: align === "right" ? "translateX(-100%)" : undefined,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)",
            }}
            onClick={closeOnContentClick ? () => setIsOpen(false) : undefined}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
}
