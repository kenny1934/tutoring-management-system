"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The dark bar that says where to tap while something waits to be placed,
 * such as a proof reason or the Draft's axes, with a Cancel button big enough
 * for a finger at the board. The Pen Tray floats it above itself, and the
 * Draft shows it at the top of its pane.
 */
export function PlacingHint({ message, onCancel, floatingRef, style, className }: {
  message: string;
  onCancel: () => void;
  /** For a hint that's positioned as a floating element. */
  floatingRef?: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      ref={floatingRef}
      style={style}
      role="status"
      className={cn("flex items-center gap-2 rounded-lg bg-[#2e251c]/90 py-1 pl-4 pr-1 text-sm text-[#f3e7d3] shadow-lg", className)}
    >
      <span>{message}</span>
      <button type="button" onClick={onCancel} className="min-h-11 rounded-md px-3 font-medium hover:bg-white/10">
        Cancel
      </button>
    </div>
  );
}
