"use client";

import { motion } from "framer-motion";
import { pageVariants } from "../animations/variants";

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
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="enter"
      exit="exit"
      variants={pageVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}
