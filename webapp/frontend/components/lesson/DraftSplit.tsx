"use client";

import { useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

const LABEL = "Drag to resize the Draft";
// Each board remembers how it last shared the space, like the tray's place.
const STORAGE_KEY = "csm_draft_share";
/** The Draft's share of the space before anyone has dragged the border, the same as the worksheet's. */
const EVEN = 0.5;
/** Neither side is squeezed narrower than this, in pixels. */
const MIN_PANE = 240;
/** How far each press of an arrow key moves the border, as a share of the space. */
const KEY_STEP = 0.05;

function readShare(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored > 0 && stored < 1 ? stored : EVEN;
  } catch {
    return EVEN;
  }
}

/** A share for the Draft, kept so that neither side of a row this wide gets narrower than MIN_PANE. */
function keepInBounds(rowWidth: number, share: number): number {
  const least = Math.min(MIN_PANE / rowWidth, EVEN);
  return Math.min(Math.max(share, least), 1 - least);
}

/**
 * The Draft beside the worksheet, behind a border that drags to share the
 * space between them. Dragging it most of the way across gives the Draft
 * nearly the whole area, and dragging it back returns the room to the
 * worksheet.
 *
 * While a finger holds the border, only a line follows it, and both sides
 * take their new widths when it lifts. The worksheet refits its pages to its
 * width whenever that changes, which would be heavy on every move.
 *
 * It's a child of the row that holds the worksheet, so its parent is the
 * space being shared. The share is read when the Draft opens, which is always
 * after the page has first been drawn, so the stored value can't disagree
 * with the server's render.
 */
export function DraftSplit({ children }: { children: ReactNode }) {
  const [share, setShare] = useState(readShare);
  // Where the line is while the border is being dragged, as the Draft's share.
  const [dragAt, setDragAt] = useState<number | null>(null);
  const borderRef = useRef<HTMLDivElement>(null);

  /** The Draft's share for a finger at this point across the screen, or null before the row is on the page. */
  const shareAt = (clientX: number) => {
    const row = borderRef.current?.parentElement?.getBoundingClientRect();
    return row && row.width > 0 ? keepInBounds(row.width, (row.right - clientX) / row.width) : null;
  };

  const keep = (next: number) => {
    setShare(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* private window or storage full */ }
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* the finger has already lifted */ }
    setDragAt(shareAt(e.clientX));
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragAt === null) return;
    setDragAt(shareAt(e.clientX) ?? dragAt);
  };

  const up = () => {
    if (dragAt === null) return;
    keep(dragAt);
    setDragAt(null);
  };

  // The arrow keys move the border too, and Left gives the Draft more room.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowLeft" ? KEY_STEP : e.key === "ArrowRight" ? -KEY_STEP : 0;
    const rowWidth = borderRef.current?.parentElement?.getBoundingClientRect().width;
    if (!step || !rowWidth) return;
    e.preventDefault();
    keep(keepInBounds(rowWidth, share + step));
  };

  return (
    <>
      <div
        ref={borderRef}
        role="separator"
        aria-orientation="vertical"
        aria-label={LABEL}
        title={LABEL}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        tabIndex={0}
        data-touch-owner=""
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDragAt(null)}
        onKeyDown={onKeyDown}
        className="relative z-10 w-2 flex-shrink-0 cursor-col-resize touch-none select-none bg-[#e8dcc8] dark:bg-[#1e1a14] focus-visible:outline-2 focus-visible:outline-[#a0704b]"
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#d4c4a8] dark:bg-[#3a3228]" />
        {/* The grip is wider than the border, so a finger finds it easily */}
        <div className="absolute left-1/2 top-1/2 grid h-16 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#d4c4a8] bg-[#fef9f3] text-[#8b7355] shadow-sm dark:border-[#6b5a4a] dark:bg-[#2d2618] dark:text-[#a09080]">
          <GripVertical className="h-4 w-4" />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0" style={{ flex: `${share / (1 - share)} 1 0%` }}>
        {children}
      </div>
      {dragAt !== null && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-30 w-0.5 translate-x-1/2 bg-[#a0704b]"
          style={{ right: `${dragAt * 100}%` }}
        />
      )}
    </>
  );
}
