"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The dark bar that offers to undo a clear, with an Undo button big enough
 * for a finger at the board. The Pen Tray floats it above itself, and the
 * Draft shows it at the bottom of its pane. useUndoOffer decides when it shows.
 */
export function UndoOfferBar({ message, onUndo, floatingRef, style, className }: {
  message: string;
  /** Leave it out when there's nothing to undo with, which greys the button out. */
  onUndo?: () => void;
  /** For a bar that's positioned as a floating element. */
  floatingRef?: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      ref={floatingRef}
      style={style}
      role="status"
      className={cn(
        "z-[200] flex items-center gap-3 rounded-[14px] p-1.5 pl-4",
        "bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3] shadow-[0_12px_32px_rgba(46,30,14,0.35)]",
        className,
      )}
    >
      <span className="text-sm font-medium">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={!onUndo}
        className="min-h-12 px-4 rounded-[10px] font-semibold text-sm bg-[#f3e7d3] text-[#2e251c] hover:bg-white transition-colors"
      >
        Undo
      </button>
    </div>
  );
}
