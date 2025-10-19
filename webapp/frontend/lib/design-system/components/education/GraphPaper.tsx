"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GraphPaperProps {
  /**
   * Child content to display on graph paper
   */
  children: ReactNode;

  /**
   * Grid size
   * @default "1cm"
   */
  gridSize?: "5mm" | "1cm" | "quad" | "dot";

  /**
   * Whether to show X/Y axes
   * @default false
   */
  showAxes?: boolean;

  /**
   * Whether to show grid numbering
   * @default false
   */
  showNumbers?: boolean;

  /**
   * Paper color variant
   * @default "cream"
   */
  paperColor?: "cream" | "white";

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Whether to add paper texture
   * @default true
   */
  textured?: boolean;
}

/**
 * GraphPaper - Display content on graph paper background
 *
 * Use for charts, coordinate planes, data visualizations, and graphing exercises.
 * Provides authentic graph paper grid with optional axes and numbering.
 *
 * @example
 * ```tsx
 * <GraphPaper gridSize="1cm" showAxes>
 *   <RechartsChart />
 * </GraphPaper>
 * ```
 */
export function GraphPaper({
  children,
  gridSize = "1cm",
  showAxes = false,
  showNumbers = false,
  paperColor = "cream",
  className,
  textured = true,
}: GraphPaperProps) {
  const gridClass = {
    "5mm": "graph-paper-5mm",
    "1cm": "graph-paper-1cm",
    "quad": "graph-paper-quad",
    "dot": "graph-paper-dot",
  }[gridSize];

  const paperClass = paperColor === "white" ? "paper-white" : "paper-cream";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg p-6",
        paperClass,
        gridClass,
        textured && "paper-texture",
        "paper-shadow-md",
        className
      )}
    >
      {/* Content */}
      <div className="relative z-10">{children}</div>

      {/* Optional axes */}
      {showAxes && (
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%" }}
        >
          {/* X-axis */}
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-40"
          />
          {/* Y-axis */}
          <line
            x1="50%"
            y1="0"
            x2="50%"
            y2="100%"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-40"
          />

          {/* Arrows */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3, 0 6"
                fill="currentColor"
                className="opacity-40"
              />
            </marker>
          </defs>

          {/* X-axis arrow */}
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="currentColor"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
            className="opacity-40"
          />

          {/* Y-axis arrow */}
          <line
            x1="50%"
            y1="100%"
            x2="50%"
            y2="0"
            stroke="currentColor"
            strokeWidth="2"
            markerEnd="url(#arrowhead)"
            className="opacity-40"
          />

          {/* Optional numbering */}
          {showNumbers && (
            <g className="text-xs opacity-60">
              {/* X-axis labels */}
              {[-4, -3, -2, -1, 1, 2, 3, 4].map((n) => (
                <text
                  key={`x-${n}`}
                  x={`${50 + n * 10}%`}
                  y="52%"
                  textAnchor="middle"
                  className="fill-current text-[10px]"
                >
                  {n}
                </text>
              ))}

              {/* Y-axis labels */}
              {[-4, -3, -2, -1, 1, 2, 3, 4].map((n) => (
                <text
                  key={`y-${n}`}
                  x="52%"
                  y={`${50 - n * 10}%`}
                  textAnchor="start"
                  className="fill-current text-[10px]"
                >
                  {n}
                </text>
              ))}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
