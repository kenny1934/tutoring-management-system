"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cardVariants } from "../animations/variants";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  /**
   * Whether the card has hover effects
   * @default true
   */
  interactive?: boolean;
  /**
   * Glassmorphism intensity
   * @default "default"
   */
  blur?: "default" | "lg";
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Children elements
   */
  children?: React.ReactNode;
}

/**
 * Glassmorphic card component with optional hover animations
 * Showcases modern glass effect with backdrop blur
 */
export function GlassCard({
  interactive = true,
  blur = "default",
  className,
  children,
  ...props
}: GlassCardProps) {
  const blurClass = blur === "lg" ? "glass-lg" : "glass";

  return (
    <motion.div
      className={cn(
        blurClass,
        "rounded-lg",
        interactive && "cursor-pointer",
        className
      )}
      variants={interactive ? cardVariants : undefined}
      initial={interactive ? "rest" : undefined}
      whileHover={interactive ? "hover" : undefined}
      whileTap={interactive ? "tap" : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}
