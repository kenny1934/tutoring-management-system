"use client";

import { useState, type ReactNode } from "react";
import { BookCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The answer key while the Draft is open. The lesson view's row of viewers is
 * a container named "viewers", and when it's at least 1100px wide the answer
 * key is an ordinary third column.
 *
 * On anything narrower it folds into a tab on the right edge. Tapping the tab
 * slides the answer key in over the Draft, at exactly the Draft's width, so
 * the worksheet stays in view and you can keep writing on it while the
 * answers are showing. Tapping the tab again slides the answer key away and
 * brings the Draft back.
 *
 * It starts slid in, because it only appears when someone has just asked to
 * see the answers. The row has to be `relative` and hide its overflow, so the
 * answer key can wait off its right edge while it's away.
 */
export function FoldingAnswerKey({ children }: { children: ReactNode }) {
  const [out, setOut] = useState(true);

  return (
    <>
      <div
        className={cn(
          "flex min-h-0 min-w-0",
          // The worksheet and the Draft share the row equally after the tab, so half of what's left is the Draft's width.
          "absolute inset-y-0 right-11 z-30 w-[calc((100%_-_2.75rem)/2)] shadow-2xl",
          "transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none",
          out ? "translate-x-0" : "invisible translate-x-[calc(100%_+_2.75rem)]",
          "@[1100px]/viewers:static @[1100px]/viewers:z-auto @[1100px]/viewers:w-auto @[1100px]/viewers:flex-1",
          "@[1100px]/viewers:visible @[1100px]/viewers:translate-x-0 @[1100px]/viewers:shadow-none",
        )}
      >
        <div className="hidden @[1100px]/viewers:block w-px flex-shrink-0 bg-[#d4c4a8] dark:bg-[#3a3228]" />
        {children}
      </div>
      <button
        type="button"
        onClick={() => setOut((o) => !o)}
        aria-expanded={out}
        title={out ? "Slide the answer key away" : "Show the answer key"}
        className={cn(
          "relative z-30 w-11 flex-none flex flex-col items-center justify-center gap-2",
          "border-l border-[#d4c4a8] dark:border-[#3a3228]",
          "text-sm font-medium transition-colors",
          out
            ? "bg-[#a0704b] text-white"
            : "bg-[#f0e6d4] dark:bg-[#252018] text-[#8b7355] dark:text-[#a09080] hover:bg-[#e8d4b8] dark:hover:bg-[#3a3228]",
          "@[1100px]/viewers:hidden",
        )}
      >
        <BookCheck className="h-5 w-5" />
        <span className="[writing-mode:vertical-rl]">Answers</span>
      </button>
    </>
  );
}
