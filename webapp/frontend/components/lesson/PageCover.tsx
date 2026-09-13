"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GripHorizontal, X } from "lucide-react";
import { PDF_DARK_FILTER } from "@/hooks/usePdfDarkMode";

// The tab on the cover's edge is this tall in CSS pixels at any zoom. The edge
// can't go so low that the tab would hang off the bottom of the page.
const TAB_HEIGHT = 52;
// How far one arrow key moves the edge, as a share of the page's height.
const KEY_STEP = 0.05;

// A light paper grey with faint hatching, so it reads as a cover and not as a
// blank part of the page. Dark PDF darkens it along with the page.
const COVER_LOOK = {
  backgroundColor: "#d8d0c2",
  backgroundImage: "repeating-linear-gradient(135deg, rgba(79, 64, 48, 0.1) 0 1.5px, transparent 1.5px 12px)",
};

interface PageCoverProps {
  /** Where the cover's top edge sits, from 0 at the top of the page to 1 at the bottom. */
  top: number;
  /** Called with the edge's new place once a drag ends, or after an arrow key. */
  onMove: (top: number) => void;
  onRemove: () => void;
  /** The viewer's zoom as a scale, such as 1.5 for 150%. The tab is shrunk by it, so it stays the same size for a finger. */
  scale: number;
  darkMode: boolean;
}

/**
 * A cover over the rest of a page, so the class sees one part of a worksheet
 * before the next. The tutor drags the tab on its top edge down to uncover the
 * page and up to cover it again, and the X on the tab takes the cover off.
 *
 * A cover is part of the exercise's view, like "Hide ink". It's never saved as
 * ink, printed or undone. The tab is a Touch Owner, so the viewer leaves its
 * touches alone in every tool. The cover's body isn't, so a finger on it
 * scrolls the worksheet, which keeps ink from landing under it.
 *
 * While a finger drags the edge, only the cover redraws. The viewer hears
 * where the edge ended up when the finger lifts.
 */
export function PageCover({ top, onMove, onRemove, scale, darkMode }: PageCoverProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; offset: number; top: number } | null>(null);
  const [dragTop, setDragTop] = useState<number | null>(null);
  const edge = dragTop ?? top;

  // Where a point is on the page, as a share of its height. The page's box on
  // screen already includes the zoom.
  const shareOf = (clientY: number) => {
    const box = areaRef.current?.getBoundingClientRect();
    return box && box.height > 0 ? (clientY - box.top) / box.height : 0;
  };
  // Keep the edge on the page, and high enough that the tab stays on it too.
  const keepOnPage = (next: number) => {
    const height = areaRef.current?.getBoundingClientRect().height ?? 0;
    const lowest = height > TAB_HEIGHT ? 1 - TAB_HEIGHT / height : 0;
    return Math.min(lowest, Math.max(0, next));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { id: e.pointerId, offset: shareOf(e.clientY) - top, top };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the finger already lifted */ }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    drag.top = keepOnPage(shareOf(e.clientY) - drag.offset);
    setDragTop(drag.top);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    setDragTop(null);
    if (drag.top !== top) onMove(drag.top);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === "ArrowDown" ? top + KEY_STEP
      : e.key === "ArrowUp" ? top - KEY_STEP
      : e.key === "Home" ? 0
      : e.key === "End" ? 1
      : null;
    if (next === null) return;
    // The lesson's own keys use the arrows to change exercise, so they stop here.
    e.preventDefault();
    e.stopPropagation();
    onMove(keepOnPage(next));
  };

  const edgeAt = `${edge * 100}%`;
  return (
    <div ref={areaRef} className="absolute inset-0 pointer-events-none">
      <div
        data-page-cover
        className="absolute inset-x-0 bottom-0 pointer-events-auto shadow-[0_-1.5px_0_rgba(46,37,28,0.5),0_-8px_16px_rgba(46,30,14,0.12)]"
        style={{ top: edgeAt, ...COVER_LOOK, filter: darkMode ? PDF_DARK_FILTER : undefined }}
      />
      <div
        data-touch-owner
        className="absolute left-1/2 flex items-center gap-0.5 px-1 pb-1 rounded-b-[14px] pointer-events-auto bg-[#2e251c] dark:bg-[#3b3025] text-[#f3e7d3] shadow-[0_12px_32px_rgba(46,30,14,0.3)]"
        style={{ top: edgeAt, transform: `translateX(-50%) scale(${1 / scale})`, transformOrigin: "top center" }}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="Drag the cover's edge down to uncover the page"
          title="Drag the cover's edge down to uncover the page"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(edge * 100)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="grid place-items-center w-[72px] h-12 rounded-[10px] cursor-ns-resize touch-none hover:bg-[#f3e7d3]/10 focus-visible:outline-2 focus-visible:outline-[#f3e7d3]"
        >
          <GripHorizontal className="h-6 w-6" />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove the cover"
          title="Remove the cover"
          className="grid place-items-center w-12 h-12 rounded-[10px] hover:bg-[#f3e7d3]/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
