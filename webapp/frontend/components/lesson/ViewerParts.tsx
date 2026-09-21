"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Small pieces the lesson views and the homework Check Viewer both draw their
// panes with, kept apart from the viewers themselves so that borrowing one
// doesn't bring a whole viewer along.

/** The line between two panes side by side. */
export const viewerDivider = <div className="w-px bg-[#d4c4a8] dark:bg-[#3a3228] flex-shrink-0" />;

/** A tab on a phone's bar for switching between panes. */
export const viewerTabClass = (active: boolean) => cn(
  "flex-1 py-2.5 text-xs font-semibold text-center transition-colors",
  active
    ? "text-[#6b4c30] dark:text-[#d4a574] border-b-2 border-[#a0704b]"
    : "text-[#8b7355] dark:text-[#a09080]"
);

/**
 * What a viewer's pane shows when drawing its file broke the renderer, with a
 * way to try again, for an error boundary around the viewer.
 */
export function PdfRenderFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#e8dcc8] dark:bg-[#1e1a14]">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm text-[#8b7355] dark:text-[#a09080]">
          Something went wrong rendering the PDF
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
