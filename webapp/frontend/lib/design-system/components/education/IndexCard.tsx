"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface IndexCardProps {
  /**
   * Card content
   */
  children: ReactNode;

  /**
   * Card size (aspect ratio)
   * @default "3x5"
   */
  size?: "3x5" | "4x6" | "5x7";

  /**
   * Whether to show ruled lines
   * @default true
   */
  lined?: boolean;

  /**
   * Paper color
   * @default "white"
   */
  color?: "white" | "cream" | "yellow";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * IndexCard - Classic index card (3x5, 4x6, 5x7)
 *
 * Creates traditional index card with optional ruled lines and header line.
 * Use for homework lists, quick references, task cards, or bite-sized content.
 *
 * @example
 * ```tsx
 * <IndexCard size="3x5" lined>
 *   <h3 className="font-bold mb-2">Homework - Oct 19</h3>
 *   <ul className="space-y-1 text-sm">
 *     <li>• Complete Ex. 1-15</li>
 *     <li>• Review Ch. 3</li>
 *     <li>• Quiz Friday</li>
 *   </ul>
 * </IndexCard>
 * ```
 */
export function IndexCard({
  children,
  size = "3x5",
  lined = true,
  color = "white",
  className,
}: IndexCardProps) {
  // Aspect ratios: 3x5 = 0.6, 4x6 = 0.667, 5x7 = 0.714
  const sizeStyles = {
    "3x5": "aspect-[3/5] max-w-[300px]",
    "4x6": "aspect-[4/6] max-w-[400px]",
    "5x7": "aspect-[5/7] max-w-[500px]",
  }[size];

  const colorStyles = {
    white: "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
    cream: "bg-[#fef9f3] dark:bg-[#2d2618] text-gray-900 dark:text-gray-100",
    yellow: "bg-[#fff9db] dark:bg-[#2b2a1f] text-gray-900 dark:text-gray-100",
  }[color];

  return (
    <div
      className={cn(
        "relative p-6 rounded-sm paper-texture paper-shadow-md",
        "border border-gray-300",
        sizeStyles,
        colorStyles,
        className
      )}
    >
      {/* Header line (red/blue) */}
      {lined && (
        <div className="absolute left-0 right-0 top-10 h-0.5 bg-blue-500/30 dark:bg-blue-400/40" />
      )}

      {/* Ruled lines */}
      {lined && (
        <div
          className="absolute inset-0 pointer-events-none opacity-100 dark:opacity-50"
          style={{
            backgroundImage:
              "repeating-linear-gradient(transparent, transparent 27px, rgba(59, 130, 246, 0.15) 27px, rgba(59, 130, 246, 0.15) 28px)",
            marginTop: "40px", // Start below header line
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10" style={{ lineHeight: lined ? "28px" : "1.5" }}>
        {children}
      </div>
    </div>
  );
}
