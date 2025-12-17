"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";

interface ScrollToTopButtonProps {
  threshold?: number;
  className?: string;
}

// Find the closest scrollable ancestor
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const { overflowY } = getComputedStyle(el);
  if (overflowY === "auto" || overflowY === "scroll") {
    return el;
  }
  return findScrollParent(el.parentElement);
}

export function ScrollToTopButton({
  threshold = 300,
  className = "",
}: ScrollToTopButtonProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Find scroll parent on mount
  useEffect(() => {
    const parent = findScrollParent(anchorRef.current?.parentElement || null);
    setScrollParent(parent);
  }, []);

  // Listen to scroll events
  useEffect(() => {
    if (!scrollParent) return;

    const toggleVisibility = () => {
      setIsVisible(scrollParent.scrollTop > threshold);
    };

    scrollParent.addEventListener("scroll", toggleVisibility);
    toggleVisibility(); // Check initial state

    return () => scrollParent.removeEventListener("scroll", toggleVisibility);
  }, [scrollParent, threshold]);

  const scrollToTop = useCallback(() => {
    scrollParent?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [scrollParent]);

  return (
    <>
      {/* Hidden anchor to find scroll parent */}
      <div ref={anchorRef} className="hidden" aria-hidden="true" />

      <AnimatePresence>
        {isVisible && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={scrollToTop}
            className={`fixed bottom-6 right-6 z-50 p-3 sm:p-3.5 rounded-full bg-[#a0704b] text-white shadow-lg hover:bg-[#8b5e3c] transition-colors ${className}`}
            aria-label="Scroll to top"
          >
            <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
