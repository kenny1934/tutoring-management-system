"use client";

import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode, useState, useEffect } from "react";

interface StickyNoteProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  /** Color variant of the sticky note */
  variant?: "yellow" | "pink" | "blue" | "green";
  /** Size of the sticky note */
  size?: "sm" | "md" | "lg";
  /** Rotation angle in degrees (randomized if not specified) */
  rotation?: number;
  /** Whether to show tape at the top */
  showTape?: boolean;
}

const variantColors = {
  yellow: {
    bg: "bg-[#fff9db] dark:bg-[#2b2a1f]",
    shadow: "shadow-yellow-600/20",
  },
  pink: {
    bg: "bg-[#ffe4e9] dark:bg-[#2b1f22]",
    shadow: "shadow-pink-600/20",
  },
  blue: {
    bg: "bg-[#e0f2ff] dark:bg-[#1f2b33]",
    shadow: "shadow-blue-600/20",
  },
  green: {
    bg: "bg-[#e8f5e9] dark:bg-[#1f2b21]",
    shadow: "shadow-green-600/20",
  },
};

const sizeClasses = {
  sm: "w-48 h-48 p-4",
  md: "w-64 h-64 p-6",
  lg: "w-80 h-80 p-8",
};

/**
 * StickyNote - A realistic sticky note component
 *
 * Features:
 * - Paper texture with SVG noise
 * - Slight rotation for handmade feel
 * - Realistic shadow
 * - Optional tape at top
 * - Multiple color variants
 * - Hover animation (lift effect)
 *
 * @example
 * ```tsx
 * <StickyNote variant="yellow" size="md" showTape>
 *   Remember to review homework!
 * </StickyNote>
 * ```
 */
export function StickyNote({
  children,
  variant = "yellow",
  size = "md",
  rotation,
  showTape = false,
  className,
  ...props
}: StickyNoteProps) {
  // Use state for random rotation to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  const [randomRotation] = useState(() => Math.random() * 6 - 3);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use 0 rotation during SSR, then apply random rotation after mount
  const finalRotation = rotation ?? (mounted ? randomRotation : 0);
  const colors = variantColors[variant];

  return (
    <motion.div
      className="relative inline-block"
      style={{
        transform: `rotate(${finalRotation}deg)`,
      }}
      initial={{ scale: 1, rotate: finalRotation }}
      whileHover={{
        scale: 1.02,
        rotate: 0,
        y: -4,
        transition: { duration: 0.2 },
      }}
      {...props}
    >
      {/* Tape effect at top - outside the clipped area */}
      {showTape && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-6 bg-white/40 dark:bg-white/20 backdrop-blur-sm border-l border-r border-white/50 shadow-sm z-20" />
      )}

      {/* Sticky note paper with torn edge */}
      <motion.div
        className={cn(
          "relative",
          "paper-texture",
          "torn-edge-top",
          colors.bg,
          sizeClasses[size],
          colors.shadow,
        )}
        whileHover={{
          boxShadow: "0 12px 24px rgba(0, 0, 0, 0.2)",
          transition: { duration: 0.2 },
        }}
      >
        {/* Paper grain overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            mixBlendMode: "multiply",
          }}
        />

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col">
          {children}
        </div>

        {/* Bottom shadow for curl effect */}
        <div
          className="absolute bottom-0 right-0 w-12 h-12 pointer-events-none"
          style={{
            background: "linear-gradient(135deg, transparent 0%, rgba(0,0,0,0.1) 100%)",
            clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}
