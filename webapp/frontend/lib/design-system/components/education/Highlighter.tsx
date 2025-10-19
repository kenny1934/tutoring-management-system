"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HighlighterProps {
  /**
   * Content to highlight
   */
  children: ReactNode;

  /**
   * Highlighter color
   * @default "yellow"
   */
  color?: "yellow" | "pink" | "green" | "blue" | "orange";

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Highlighter - Emphasize text with highlighter mark effect
 *
 * Creates realistic highlighter mark with slightly wavy edges and
 * semi-transparent color overlay. Use for emphasis, important text,
 * or drawing attention to specific content.
 *
 * @example
 * ```tsx
 * <Highlighter color="yellow">
 *   This is important text that needs emphasis.
 * </Highlighter>
 * ```
 */
export function Highlighter({
  children,
  color = "yellow",
  className,
}: HighlighterProps) {
  const colorClass = `highlight-${color}`;

  return (
    <mark className={cn(colorClass, "font-inherit", className)}>
      {children}
    </mark>
  );
}
