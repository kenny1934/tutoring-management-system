"use client";

import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

/** The strip along the lesson sidebar's edge that a mouse drags to change its width. */
export function SidebarResizeHandle({ onResizeStart }: { onResizeStart: (e: MouseEvent) => void }) {
  return (
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
  );
}
