"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CoursewareBannerProps {
  /**
   * Banner title text
   */
  title: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * CoursewareBanner - Small wooden tab/label component
 *
 * Creates a small wooden folder tab that labels the courseware section.
 * Positioned above the courseware grid like a folder tab.
 *
 * @example
 * ```tsx
 * <CoursewareBanner title="Today's Courseware" />
 * ```
 */
export function CoursewareBanner({ title, className }: CoursewareBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: 0.2,
        ease: [0.38, 1.21, 0.22, 1.0],
      }}
      className={cn(
        "absolute top-4 sm:top-6 lg:top-8 left-4 sm:left-12 lg:left-20 z-10 inline-block px-3 sm:px-4 lg:px-6 py-1.5 sm:py-2 rounded-t-lg",
        className
      )}
      style={{
        background:
          "linear-gradient(135deg, #8b6f47 0%, #a0826d 50%, #8b6f47 100%)",
        boxShadow: "0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.1)",
      }}
    >
      {/* Wood texture overlay */}
      <div
        className="absolute inset-0 opacity-20 rounded-t-lg pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cfilter id='woodgrain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.8' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='100' height='100' filter='url(%23woodgrain)'/%3E%3C/svg%3E")`,
          mixBlendMode: "multiply",
        }}
      />

      {/* Tab text */}
      <span
        className="relative z-10 text-[10px] sm:text-xs font-bold uppercase tracking-wide"
        style={{
          color: "#f5f0e8",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}
      >
        {title}
      </span>
    </motion.div>
  );
}
