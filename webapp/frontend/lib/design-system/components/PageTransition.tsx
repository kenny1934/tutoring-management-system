"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { pageVariants, quickPageVariants } from "../animations/variants";

interface PageTransitionProps {
  /**
   * Page content
   */
  children: React.ReactNode;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Page transition wrapper component
 * Provides smooth enter/exit animations for route changes
 *
 * On a phone the page arrives in 0.15s instead of 0.4s. A tap on the bottom bar
 * should feel as immediate as it does in a native app, and a slow rise reads as
 * lag there. Only the timing changes: the starting position is the same either
 * way, because the server has already drawn the page in that position.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const [onPhone] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)").matches);
  return (
    <motion.div
      initial="initial"
      animate="enter"
      exit="exit"
      variants={onPhone ? quickPageVariants : pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
