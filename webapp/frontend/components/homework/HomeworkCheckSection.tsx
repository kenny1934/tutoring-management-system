"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Home } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { checkedCount } from "@/lib/homework-utils";
import { HomeworkCheckRow } from "./HomeworkCheckRow";
import type { HomeworkCompletion } from "@/types";

/**
 * Homework set in earlier lessons, ready to mark, for a lesson sidebar.
 *
 * Collapsed by default and styled as a pinned note rather than a third
 * exercise section: it is a reminder about the last lesson, not part of this
 * one. The dashed edge and the count carry the signal; opening it is a choice.
 *
 * Distinct from HomeworkPanel, which says the same thing in the modal palette
 * where there is room to open it by default. This is the desk-palette one, cut
 * to fit a sidebar column.
 *
 * Expansion may be left alone or driven from outside, which is what lets a
 * keyboard shortcut open it. When it opens it scrolls itself into view, so a
 * shortcut works the same whether the block is on screen or below the fold.
 */
export function HomeworkCheckSection({
  sessionId,
  items,
  isReadOnly,
  onMarked,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  sessionId: number;
  items: HomeworkCompletion[];
  isReadOnly?: boolean;
  onMarked?: (updated: HomeworkCompletion) => void;
  /** Omit to let the block own its own state. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [ownExpanded, setOwnExpanded] = useState(false);
  const expanded = controlledExpanded ?? ownExpanded;
  const ref = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const next = !expanded;
    setOwnExpanded(next);
    onExpandedChange?.(next);
  };

  // "nearest" so an already-visible block stays put: the shortcut should not
  // yank the sidebar around when it had nothing to reveal. Called optionally
  // because scrolling is a nicety, and not every environment implements it.
  useEffect(() => {
    if (expanded) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [expanded]);

  if (!items.length) return null;

  const done = checkedCount(items);
  const outstanding = done < items.length;

  return (
    <div ref={ref}>
      <button
        onClick={toggle}
        title={
          outstanding
            ? `${items.length - done} to check from earlier lessons`
            : "All homework checked"
        }
        className={cn(
          "w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-dashed transition-colors",
          outstanding
            ? "border-amber-400/60 bg-amber-50/60 text-amber-700 hover:bg-amber-50 dark:border-amber-600/40 dark:bg-amber-900/10 dark:text-amber-400/90 dark:hover:bg-amber-900/20"
            : "border-[#dcc9a8] text-[#a0906e] hover:bg-[#f0e6d4]/50 dark:border-[#3a3228] dark:text-[#8a7a60] dark:hover:bg-[#252018]/60"
        )}
      >
        <div className={cn("transition-transform flex-shrink-0", expanded ? "rotate-0" : "-rotate-90")}>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </div>
        <Home className="h-3 w-3 flex-shrink-0 opacity-80" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">
          To check
        </span>
        <span className="ml-auto text-[10px] font-medium tabular-nums">
          {done}/{items.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1 px-2 rounded-md bg-[#faf3e8]/70 dark:bg-[#221c14]/50 divide-y divide-[#e8d4b8]/70 dark:divide-[#3a3228]/70">
              {items.map((hw) => (
                <HomeworkCheckRow
                  key={hw.session_exercise_id}
                  homework={hw}
                  sessionId={sessionId}
                  readOnly={isReadOnly}
                  onMarked={onMarked}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
