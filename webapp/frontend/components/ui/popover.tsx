"use client";

import { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverProps {
  trigger: ReactNode;
  content: ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function Popover({ trigger, content, className, align = "left" }: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ top: 0, left: 0 });

  const measurePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    posRef.current = {
      top: rect.bottom + 8,
      left: align === "right" ? rect.right : rect.left,
    };
  }, [align]);

  // Update position on scroll/resize while open
  useEffect(() => {
    if (!isOpen) return;

    function handleReposition() {
      measurePosition();
      if (popoverRef.current) {
        popoverRef.current.style.top = `${posRef.current.top}px`;
        popoverRef.current.style.left = `${posRef.current.left}px`;
      }
    }

    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, measurePosition]);

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
              top: posRef.current.top,
              left: posRef.current.left,
              transform: align === "right" ? "translateX(-100%)" : undefined,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)",
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
}
