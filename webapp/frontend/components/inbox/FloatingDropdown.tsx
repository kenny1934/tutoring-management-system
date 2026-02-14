"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface FloatingDropdownProps {
  triggerRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
  /** Where to open relative to trigger. "auto" picks based on viewport space. */
  placement?: "above" | "below" | "auto";
  /** Which edge of the trigger to align to. */
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}

const GAP = 4;
const MARGIN = 8; // min distance from viewport edge

export default function FloatingDropdown({
  triggerRef,
  isOpen,
  onClose,
  placement = "auto",
  align = "right",
  className,
  children,
}: FloatingDropdownProps) {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    const goAbove =
      placement === "above" ||
      (placement === "auto" && spaceAbove > spaceBelow);

    const newStyle: React.CSSProperties = {
      position: "fixed",
      zIndex: 61,
      maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
    };

    if (goAbove) {
      newStyle.bottom = window.innerHeight - rect.top + GAP;
    } else {
      newStyle.top = rect.bottom + GAP;
    }

    if (align === "right") {
      newStyle.right = Math.max(MARGIN, window.innerWidth - rect.right);
    } else {
      newStyle.left = Math.max(MARGIN, rect.left);
    }

    setStyle(newStyle);
  }, [triggerRef, placement, align]);

  useEffect(() => {
    if (!isOpen) {
      setStyle(null);
      return;
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  // After render, measure actual dropdown rect and clamp to viewport.
  // useLayoutEffect fires before paint so there's no visual flicker.
  useLayoutEffect(() => {
    const el = dropdownRef.current;
    if (!el || !style) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Clamp horizontal
    if (rect.left < MARGIN) {
      el.style.left = `${MARGIN}px`;
      el.style.right = "auto";
    } else if (rect.right > vw - MARGIN) {
      el.style.right = `${MARGIN}px`;
      el.style.left = "auto";
    }

    // Clamp vertical
    if (rect.top < MARGIN) {
      el.style.top = `${MARGIN}px`;
      el.style.bottom = "auto";
    } else if (rect.bottom > vh - MARGIN) {
      el.style.bottom = `${MARGIN}px`;
      el.style.top = "auto";
    }
  }, [style]);

  if (!isOpen || !style) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div ref={dropdownRef} style={style} className={cn(className)}>
        {children}
      </div>
    </>,
    document.body
  );
}
