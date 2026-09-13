"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";

// How tall each small page is. At this height a finger can pick one out at the board.
const THUMB_HEIGHT = 120;

interface PageThumbnailsProps {
  /** The viewer's page images, in the order it shows them. */
  pages: { url: string; width: number; height: number }[];
  /** The page in view, counted from 1. */
  current: number;
  /** Dark PDF mode darkens the small pages the same way it darkens the big ones. */
  darkMode: boolean;
  /** Called with the picked page, counted from 1. */
  onPick: (page: number) => void;
  onClose: () => void;
  /** The page bar's button that opens the strip. A tap on it is left to the button, so the button can close the strip itself. */
  toggleRef: RefObject<HTMLElement | null>;
}

/**
 * The strip of small pages that the page bar's "Show all pages" button raises,
 * so a tutor can jump straight to any page of a long worksheet.
 *
 * It shows the viewer's own page images, so it draws nothing new. The viewer
 * swaps in sharper images after a zoom and frees the old ones, so the strip
 * must always be given the viewer's current list and never keep its own copy.
 *
 * Tapping anywhere outside it, its close button and Escape all close it.
 * Escape stops at the strip. Without that, the same key press would also reach
 * the lesson's own Escape, which puts the pen away or leaves the lesson.
 */
export function PageThumbnails({ pages, current, darkMode, onPick, onClose, toggleRef }: PageThumbnailsProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  // Open with the page in view in the middle of the row, and give it the
  // keyboard focus. The row is scrolled directly, because scrollIntoView would
  // scroll the worksheet and the page behind it as well.
  useEffect(() => {
    const row = rowRef.current, thumb = currentRef.current;
    if (row && thumb) row.scrollLeft = thumb.offsetLeft - (row.clientWidth - thumb.offsetWidth) / 2;
    thumb?.focus({ preventScroll: true });
    // Only when the strip opens, so it doesn't jump while you scroll it.
  }, []);

  useEffect(() => {
    // The capture phase sees a tap before anything on the page can stop it,
    // such as the eraser, which keeps its taps to itself.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (stripRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The lesson views listen on the window, which hears a key after the document does.
      e.stopPropagation();
      toggleRef.current?.focus();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, toggleRef]);

  return (
    <div
      ref={stripRef}
      role="dialog"
      aria-label="All pages"
      className={cn(
        // It sits over the bottom of the worksheet, where the Pen Tray is, so it takes no room from the pages.
        "absolute inset-x-0 bottom-0 z-30 flex items-center gap-1 pr-2",
        "border-t border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]",
        "shadow-[0_-8px_24px_rgba(46,30,14,0.18)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.5)]",
      )}
    >
      <div ref={rowRef} className="flex-1 min-w-0 flex gap-2 p-2 overflow-x-auto overscroll-x-contain touch-pan-x">
        {pages.map((page, i) => {
          const number = i + 1;
          const on = number === current;
          return (
            <button
              key={i}
              ref={on ? currentRef : undefined}
              type="button"
              onClick={() => onPick(number)}
              aria-label={`Page ${number}`}
              aria-current={on ? "page" : undefined}
              className="flex-none flex flex-col items-center gap-1 rounded-lg p-1.5 hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] transition-colors"
            >
              <span
                className={cn(
                  "block overflow-hidden rounded bg-white shadow-sm ring-2",
                  on ? "ring-[#a0704b]" : "ring-black/5 dark:ring-white/5",
                )}
                style={{ height: THUMB_HEIGHT, width: (THUMB_HEIGHT * page.width) / page.height }}
              >
                <img
                  src={page.url}
                  alt=""
                  draggable={false}
                  className="block w-full h-full"
                  style={darkMode ? { filter: PDF_DARK_FILTER } : undefined}
                />
              </span>
              <span className={cn(
                "text-xs tabular-nums",
                on ? "font-semibold text-[#a0704b]" : "text-[#8b7355] dark:text-[#a09080]",
              )}>
                {number}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => { toggleRef.current?.focus(); onClose(); }}
        aria-label="Close"
        title="Close"
        className="flex-none grid place-items-center h-12 w-12 rounded-lg text-[#8b7355] dark:text-[#a09080] hover:bg-[#d4c4a8] dark:hover:bg-[#3a3228] transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
