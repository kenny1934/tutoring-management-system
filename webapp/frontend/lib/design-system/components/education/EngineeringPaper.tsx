"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EngineeringPaperProps {
  /**
   * Content to display on the engineering paper
   */
  children: ReactNode;

  /**
   * Grid ruling type
   * @default "quad"
   */
  ruling?: "quad" | "engineering" | "isometric";

  /**
   * Grid scale
   * @default "4-per-inch"
   */
  scale?: "4-per-inch" | "5-per-inch" | "8-per-inch";

  /**
   * Show margin measurement scale
   * @default false
   */
  showMeasurements?: boolean;

  /**
   * Show major gridlines (every 5th line thicker)
   * @default true
   */
  showMajorGrid?: boolean;

  /**
   * Paper color theme
   * @default "cream"
   */
  theme?: "cream" | "white" | "aged";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * EngineeringPaper - Technical drawing paper with precise grid patterns
 *
 * Creates engineering/quad ruled paper suitable for technical drawings,
 * geometry proofs, and precise diagrams. Supports multiple ruling patterns
 * and measurement scales.
 *
 * @example
 * ```tsx
 * <EngineeringPaper
 *   ruling="quad"
 *   scale="4-per-inch"
 *   showMeasurements={true}
 * >
 *   <GeometryProof />
 * </EngineeringPaper>
 * ```
 */
export function EngineeringPaper({
  children,
  ruling = "quad",
  scale = "4-per-inch",
  showMeasurements = false,
  showMajorGrid = true,
  theme = "cream",
  className,
}: EngineeringPaperProps) {
  const rulingClass = getRulingClass(ruling, scale, showMajorGrid);
  const themeClass = getThemeClass(theme);

  return (
    <div
      className={cn(
        "relative w-full min-h-[400px] rounded-lg overflow-hidden",
        themeClass,
        rulingClass,
        showMeasurements && "engineering-measurements",
        className
      )}
    >
      {showMeasurements && (
        <>
          {/* Top measurement scale */}
          <div className="absolute top-0 left-0 right-0 h-6 bg-gray-100/80 dark:bg-gray-800/80 border-b border-gray-400 dark:border-gray-600 flex items-center justify-around text-xs text-gray-600 dark:text-gray-400 font-mono">
            {Array.from({ length: 20 }, (_, i) => (
              <span key={i} className="text-[10px]">
                {i % 5 === 0 ? i : "·"}
              </span>
            ))}
          </div>

          {/* Left measurement scale */}
          <div className="absolute top-0 left-0 bottom-0 w-6 bg-gray-100/80 dark:bg-gray-800/80 border-r border-gray-400 dark:border-gray-600 flex flex-col items-center justify-around text-xs text-gray-600 dark:text-gray-400 font-mono">
            {Array.from({ length: 15 }, (_, i) => (
              <span key={i} className="text-[10px] -rotate-90">
                {i % 5 === 0 ? i : "·"}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Content area */}
      <div className={cn("relative z-10", showMeasurements && "ml-6 mt-6 p-4", !showMeasurements && "p-6")}>
        {children}
      </div>
    </div>
  );
}

function getRulingClass(ruling: string, scale: string, showMajorGrid: boolean): string {
  // Isometric paper doesn't have scale variants, return as-is
  if (ruling === "isometric") {
    return "isometric-paper";
  }

  const baseClass = ruling === "quad"
    ? "quad-paper"
    : "engineering-paper";

  const scaleClass = scale === "4-per-inch"
    ? "-4"
    : scale === "5-per-inch"
    ? "-5"
    : "-8";

  const majorClass = showMajorGrid ? "-major" : "";

  return `${baseClass}${scaleClass}${majorClass}`;
}

function getThemeClass(theme: string): string {
  switch (theme) {
    case "white":
      return "bg-white dark:bg-gray-900";
    case "aged":
      return "bg-[#f5f0e8] dark:bg-[#2a2720]";
    case "cream":
    default:
      return "bg-[#fef9f3] dark:bg-[#2d2618]";
  }
}
