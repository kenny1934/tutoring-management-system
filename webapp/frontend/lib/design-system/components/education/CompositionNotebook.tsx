"use client";

import { ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface CompositionNotebookProps {
  /**
   * Cover label text
   */
  coverLabel?: string;

  /**
   * Line ruling for pages
   * @default "college"
   */
  ruling?: "wide" | "college" | "blank";

  /**
   * Number of visible pages
   * @default 1
   */
  pages?: number;

  /**
   * Show cover or open to pages
   * @default false
   */
  showCover?: boolean;

  /**
   * Notebook content
   */
  children: ReactNode;

  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * CompositionNotebook - Classic black marbled composition notebook
 *
 * Creates a traditional composition notebook with sewn binding and
 * ruled pages. More formal alternative to spiral notebooks, suitable
 * for long-form content, course outlines, and lecture notes.
 *
 * @example
 * ```tsx
 * <CompositionNotebook
 *   coverLabel="Algebra II - Spring 2025"
 *   ruling="college"
 *   showCover={true}
 * >
 *   <p>Course content goes here...</p>
 * </CompositionNotebook>
 * ```
 */
export function CompositionNotebook({
  coverLabel,
  ruling = "college",
  pages = 1,
  showCover = false,
  children,
  className,
}: CompositionNotebookProps) {
  const [isOpen, setIsOpen] = useState(!showCover);

  if (showCover && !isOpen) {
    return (
      <div
        className={cn(
          "relative w-full aspect-[8.5/11]",
          "cursor-pointer",
          className
        )}
        onClick={() => setIsOpen(true)}
      >
        {/* Cover */}
        <div className="absolute inset-0 marbled-cover rounded-sm shadow-2xl">
          {/* Label area */}
          {coverLabel && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-64 h-20 bg-white/90 dark:bg-[#2d2618] border-2 border-black dark:border-gray-700 rounded-sm flex items-center justify-center p-2">
              <div className="text-center">
                <div className="text-xs font-semibold mb-1">SUBJECT:</div>
                <div className="text-sm font-handwriting-print">{coverLabel}</div>
              </div>
            </div>
          )}

          {/* Sewn binding marks */}
          <div className="absolute left-4 top-0 bottom-0 flex flex-col justify-around">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="w-2 h-2 bg-gray-700 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full cursor-pointer", className)} onClick={() => setIsOpen(false)}>
      {/* Notebook pages */}
      <div className="relative">
        {/* Page */}
        <div
          className={cn(
            "relative w-full aspect-[8.5/11]",
            "bg-white dark:bg-[#2d2618]",
            "paper-texture rounded-sm shadow-lg",
            "p-8 pl-16"
          )}
        >
          {/* Sewn binding - left edge */}
          <div className="absolute left-0 top-0 bottom-0 w-12 border-r-2 border-gray-300 dark:border-gray-400 sewn-binding">
            {Array.from({ length: 12 }, (_, i) => (
              <div
                key={i}
                className="absolute left-2 w-1.5 h-3 bg-gray-600 dark:bg-gray-700 rounded-full"
                style={{ top: `${(i + 1) * 8}%` }}
              />
            ))}
          </div>

          {/* Ruled lines background */}
          <div className={cn("absolute inset-0 pl-16 pointer-events-none", getRulingClass(ruling))} />

          {/* Content */}
          <div className="relative z-10 text-gray-900 dark:text-gray-100">
            {children}
          </div>
        </div>

        {/* Page stack effect (multiple pages) */}
        {pages > 1 && (
          <>
            <div className="absolute top-1 -right-1 bottom-1 w-full bg-white dark:bg-[#2d2618] -z-10 rounded-sm shadow-md" />
            {pages > 2 && (
              <div className="absolute top-2 -right-2 bottom-2 w-full bg-white dark:bg-[#342d20] -z-20 rounded-sm shadow-sm" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function getRulingClass(ruling: string): string {
  switch (ruling) {
    case "wide":
      return "ruled-wide";
    case "college":
      return "ruled-college";
    case "blank":
    default:
      return "";
  }
}
