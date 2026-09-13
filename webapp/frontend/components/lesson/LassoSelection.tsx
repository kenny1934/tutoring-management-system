"use client";

import { Trash2 } from "lucide-react";
import type { Box } from "@/lib/stroke-eraser";

// The box is padded round the ink and never smaller than a fingertip, so a
// finger can always land inside it to drag. Both are in screen pixels.
const PAD = 14;
const MIN_BOX = 64;
const BUTTON_GAP = 8;

/**
 * How much room, in screen pixels, the Delete button needs above the ink. A
 * selection nearer the top of the page than this gets its button underneath.
 */
export const DELETE_BUTTON_ROOM = PAD + BUTTON_GAP + 48;

export type SelectionDragKind = "move" | "resize";

interface LassoSelectionProps {
  /** The selected ink's box in page units, with the ink's width included. */
  box: Box;
  /** The page's size in page units. */
  width: number;
  height: number;
  /** How much the page is scaled on screen. The handle and the button are divided by it, so they stay finger-sized. */
  uiScale: number;
  /** Puts the Delete button under the box, for a selection near the top of the page. */
  below: boolean;
  /** A finger or the mouse on the box moves the ink, and on the corner handle it resizes the ink. */
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, kind: SelectionDragKind) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onDelete: () => void;
}

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * The box round ink the lasso has selected, with a handle on its bottom-right
 * corner to resize the ink and a Delete button. It sits on the page, inside
 * the dark PDF filter with the ink, so it darkens along with the page.
 *
 * The whole box is a touch owner. A finger that lands anywhere on it, the
 * handle and the button included, is the box's to handle, so the viewer
 * doesn't scroll or zoom with it.
 */
export function LassoSelection({
  box, width, height, uiScale, below, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onDelete,
}: LassoSelectionProps) {
  const pad = PAD / uiScale;
  const min = MIN_BOX / uiScale;
  const unscale = `scale(${1 / uiScale})`;

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        data-ink-selection=""
        data-touch-owner=""
        onPointerDown={(e) => {
          // The Delete button takes its own taps.
          const target = e.target as Element;
          if (target.closest("button")) return;
          onPointerDown(e, target.closest("[data-resize-handle]") ? "resize" : "move");
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="absolute pointer-events-auto touch-none cursor-move rounded-md border-dashed border-[#a0704b]"
        style={{
          left: percent((box.left + box.right) / 2, width),
          top: percent((box.top + box.bottom) / 2, height),
          width: `max(calc(${percent(box.right - box.left, width)} + ${2 * pad}px), ${min}px)`,
          height: `max(calc(${percent(box.bottom - box.top, height)} + ${2 * pad}px), ${min}px)`,
          borderWidth: 2 / uiScale,
          transform: "translate(-50%, -50%)",
        }}
      >
        <span
          data-resize-handle=""
          role="img"
          aria-label="Drag to resize"
          title="Drag to resize"
          className="absolute right-0 bottom-0 grid h-12 w-12 place-items-center cursor-nwse-resize"
          style={{ transform: `translate(50%, 50%) ${unscale}` }}
        >
          <i className="block h-4 w-4 rounded-full border-2 border-[#a0704b] bg-white" />
        </span>
        <button
          type="button"
          onClick={onDelete}
          title="Delete the selected ink (Delete)"
          className="absolute left-1/2 flex h-12 items-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-medium text-[#b91c1c] shadow-md ring-1 ring-black/10 hover:bg-[#fdf2f2]"
          style={{
            [below ? "top" : "bottom"]: `calc(100% + ${BUTTON_GAP / uiScale}px)`,
            transform: `translateX(-50%) ${unscale}`,
            transformOrigin: below ? "top center" : "bottom center",
          }}
        >
          <Trash2 className="h-5 w-5" />
          Delete
        </button>
      </div>
    </div>
  );
}
