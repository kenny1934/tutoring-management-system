"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CalculatorDisplayProps {
  /**
   * Value to display
   */
  value: string | number;

  /**
   * Calculator display style
   * @default "lcd"
   */
  variant?: "lcd" | "led" | "modern";

  /**
   * Display size
   * @default "md"
   */
  size?: "sm" | "md" | "lg";

  /**
   * Whether to show calculator branding
   * @default false
   */
  showBranding?: boolean;

  /**
   * Optional label/title
   */
  label?: string;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * CalculatorDisplay - Retro calculator screen aesthetic
 *
 * Creates nostalgic calculator display with LCD, LED, or modern styling.
 * Use for calculation results, number displays, or retro math aesthetic.
 *
 * @example
 * ```tsx
 * <CalculatorDisplay value="42.857142" variant="lcd" size="lg" showBranding />
 * <CalculatorDisplay value="1337" variant="led" label="Score" />
 * ```
 */
export function CalculatorDisplay({
  value,
  variant = "lcd",
  size = "md",
  showBranding = false,
  label,
  className,
}: CalculatorDisplayProps) {
  const sizeStyles = {
    sm: "text-xl p-3",
    md: "text-3xl p-4",
    lg: "text-5xl p-6",
  }[size];

  const variantStyles = {
    lcd: {
      container: "bg-[#9ca89f] border-4 border-[#7a857d]",
      screen: "bg-[#697466] text-[#1c2117] font-mono",
      glow: "",
    },
    led: {
      container: "bg-black border-4 border-gray-800",
      screen: "bg-black text-red-500 font-mono",
      glow: "shadow-[0_0_10px_rgba(239,68,68,0.5)]",
    },
    modern: {
      container: "bg-gray-100 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700",
      screen: "bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans",
      glow: "",
    },
  }[variant];

  return (
    <div
      className={cn(
        "inline-block rounded-lg overflow-hidden",
        variantStyles.container,
        className
      )}
    >
      {/* Solar Panel (LCD only) */}
      {variant === "lcd" && showBranding && (
        <div className="flex gap-1 p-2 bg-[#7a857d]">
          <div className="w-16 h-3 bg-[#1a2a3a]/60 rounded-sm"></div>
          <div className="w-16 h-3 bg-[#1a2a3a]/60 rounded-sm"></div>
        </div>
      )}

      {/* Label */}
      {label && (
        <div className="px-4 pt-2 text-xs uppercase tracking-wider opacity-70">
          {label}
        </div>
      )}

      {/* Screen */}
      <div
        className={cn(
          "text-right tracking-wider select-none rounded",
          sizeStyles,
          variantStyles.screen,
          variantStyles.glow
        )}
      >
        {value}
      </div>

      {/* Branding */}
      {showBranding && (
        <div className="px-4 pb-2 text-xs font-bold opacity-60 text-center">
          {variant === "lcd" ? "CASIO" : variant === "led" ? "TI" : "CALC"}
        </div>
      )}
    </div>
  );
}
