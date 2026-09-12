"use client";

import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SIDEBAR_MIN_WIDTH } from "@/hooks/useSidebarWidth";

interface SidebarPaneProps {
  /** The width from useSidebarWidth, which keeps it within its limits. */
  width: number;
  onResizeStart: (e: MouseEvent) => void;
  children: ReactNode;
}

/**
 * The lesson sidebar beside the worksheet, with the strip along its edge that
 * a mouse drags to change its width. The minimum width stops a narrow window
 * squeezing the sidebar below the smallest width a drag can leave it at.
 */
export function SidebarPane({ width, onResizeStart, children }: SidebarPaneProps) {
  return (
    <>
      <div
        className={cn(
          "flex flex-col border-r border-[#d4c4a8] dark:border-[#3a3228]",
          "bg-[#faf5ed] dark:bg-[#1e1a14]",
          "overflow-hidden"
        )}
        style={{ width, minWidth: SIDEBAR_MIN_WIDTH }}
      >
        {children}
      </div>
      <div
        onMouseDown={onResizeStart}
        className={cn(
          "w-1.5 cursor-col-resize flex-shrink-0",
          "bg-[#d4c4a8] dark:bg-[#3a3228]",
          "hover:bg-[#c4a882] dark:hover:bg-[#5a4d3a]",
          "active:bg-[#a0704b] dark:active:bg-[#8b6f47]",
          "transition-colors"
        )}
      />
    </>
  );
}
