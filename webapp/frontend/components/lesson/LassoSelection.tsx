"use client";

import { useMemo, useState, type Ref } from "react";
import { MoveRight, Palette, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Box } from "@/lib/stroke-eraser";
import { kindOf } from "@/lib/stroke-select";
import type { InkKind, PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import { INK_SWATCHES, type InkSwatch } from "@/hooks/useAnnotationTools";
import { useMoveTargets, type InkPage } from "@/hooks/useInkPages";
import { SwatchMark } from "./AnnotationTray";

// The box is padded round the ink and never smaller than a fingertip, so a
// finger can always land inside it to drag. Both are in screen pixels.
const PAD = 14;
const MIN_BOX = 64;
const BUTTON_GAP = 8;
const BAR_HEIGHT = 48;
// The tallest panel the bar opens.
const PANEL_HEIGHT = 124;

/**
 * How much room, in screen pixels, the bar of buttons and an open panel need
 * above the ink. A selection nearer the top of the page than this gets its
 * bar underneath, and the panel opens below the bar.
 */
export const SELECTION_BAR_ROOM = PAD + BUTTON_GAP + BAR_HEIGHT + BUTTON_GAP + PANEL_HEIGHT;

export type SelectionDragKind = "move" | "resize";

// The kinds of ink the Colour panel offers colours for. A pencil only comes in
// grey, so pencil ink has no row, and a pen colour never turns it into pen.
const INK_KINDS: InkKind[] = ["pen", "highlighter"];

interface LassoSelectionProps {
  /** The selected ink's box in page units, with the ink's width included. */
  box: Box;
  /** The page's size in page units. */
  width: number;
  height: number;
  /** The selected strokes, which say which colours to offer. */
  strokes: Stroke[];
  /** How much the page is scaled on screen. The handle and the bar are divided by it, so they stay finger-sized. */
  uiScale: number;
  /** Puts the bar under the box, for a selection near the top of the page. */
  below: boolean;
  /** A finger or the mouse on the box moves the ink, and on the corner handle it resizes the ink. */
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, kind: SelectionDragKind) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onRecolour: (swatch: InkSwatch) => void;
  onDelete: () => void;
  /** The box itself, so the page can scroll it into view. */
  boxRef?: Ref<HTMLDivElement>;
  /** This page's index and how its ink is saved, which say which other pages the Move button offers. */
  pageIndex?: number;
  onPagesChange?: (pages: PageAnnotations) => void;
  onMove: (to: InkPage) => void;
}

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

const barButton = "flex h-12 items-center gap-2 whitespace-nowrap px-4 text-sm font-medium";
const panelClass = "flex flex-col gap-1.5 rounded-xl bg-white p-2 shadow-md ring-1 ring-black/10";

/**
 * The box round ink the lasso has selected, with a handle on its bottom-right
 * corner to resize the ink and a bar of buttons to recolour it, move it to
 * another page or delete it.
 * It sits on the page, inside the dark PDF filter with the ink, so it darkens
 * along with the page.
 *
 * The whole box is a touch owner. A finger that lands anywhere on it, the
 * handle and the bar included, is the box's to handle, so the viewer doesn't
 * scroll or zoom with it.
 */
export function LassoSelection({
  box, width, height, strokes, uiScale, below, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onRecolour, onDelete,
  boxRef, pageIndex, onPagesChange, onMove,
}: LassoSelectionProps) {
  const [panel, setPanel] = useState<"colour" | "move" | null>(null);
  // The Move button only shows when there's another page to move the ink to.
  const targets = useMoveTargets(pageIndex, onPagesChange);
  const pad = PAD / uiScale;
  const min = MIN_BOX / uiScale;
  const unscale = `scale(${1 / uiScale})`;
  // The bar lines up with the side of the box nearer the middle of the page,
  // so it runs across the page and not off its edge.
  const onRight = (box.left + box.right) / 2 > width / 2;
  const corner = `${below ? "top" : "bottom"} ${onRight ? "right" : "left"}`;

  // Each kind of ink in the selection gets its row of colours. A colour shows
  // as picked when all the selected ink of its kind is already that colour.
  // They only change with the selection, not on each move of a drag.
  const colourRows = useMemo(() => INK_KINDS.flatMap((kind) => {
    const colours = new Set(strokes.filter((s) => kindOf(s) === kind).map((s) => s.color));
    if (colours.size === 0) return [];
    const picked = colours.size === 1 ? [...colours][0] : null;
    return [{ kind, picked, swatches: INK_SWATCHES.filter((s) => s.kind === kind) }];
  }), [strokes]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        ref={boxRef}
        data-ink-selection=""
        data-touch-owner=""
        onPointerDown={(e) => {
          // The bar and its panel take their own taps.
          const target = e.target as Element;
          if (target.closest("[data-selection-bar]")) return;
          setPanel(null);
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

        {/* The bar, with any panel it opens on the side away from the ink */}
        <div
          data-selection-bar=""
          className={cn("absolute flex gap-2 cursor-auto", below ? "flex-col" : "flex-col-reverse", onRight ? "items-end" : "items-start")}
          style={{
            [below ? "top" : "bottom"]: `calc(100% + ${BUTTON_GAP / uiScale}px)`,
            [onRight ? "right" : "left"]: 0,
            transform: unscale,
            transformOrigin: corner,
          }}
        >
          <div className="flex overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-black/10 divide-x divide-black/10">
            {/* Pencil ink on its own has no other colour to change to, so it gets no Colour button */}
            {colourRows.length > 0 && (
              <button
                type="button"
                onClick={() => setPanel(panel === "colour" ? null : "colour")}
                aria-expanded={panel === "colour"}
                title="Change the colour of the selected ink"
                className={cn(barButton, "text-[#6b4c30] hover:bg-[#f5ebe0]", panel === "colour" && "bg-[#f5ebe0]")}
              >
                <Palette className="h-5 w-5" />
                Colour
              </button>
            )}
            {targets.length > 0 && (
              <button
                type="button"
                onClick={() => setPanel(panel === "move" ? null : "move")}
                aria-expanded={panel === "move"}
                title="Move the selected ink to another page"
                className={cn(barButton, "text-[#6b4c30] hover:bg-[#f5ebe0]", panel === "move" && "bg-[#f5ebe0]")}
              >
                <MoveRight className="h-5 w-5" />
                Move
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              title="Delete the selected ink (Delete)"
              className={cn(barButton, "text-[#b91c1c] hover:bg-[#fdf2f2]")}
            >
              <Trash2 className="h-5 w-5" />
              Delete
            </button>
          </div>

          {/* The colours stay open, so pen ink and highlighter ink can each be changed in turn */}
          {panel === "colour" && (
            <div className={panelClass}>
              {colourRows.map(({ kind, picked, swatches }) => (
                <div key={kind} className="flex gap-1.5">
                  {swatches.map((swatch) => (
                    <button
                      key={swatch.id}
                      type="button"
                      aria-label={swatch.label}
                      title={swatch.label}
                      aria-pressed={picked === swatch.color}
                      onClick={() => onRecolour(swatch)}
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-lg hover:bg-[#f5ebe0]",
                        picked === swatch.color && "bg-[#f5ebe0] ring-2 ring-inset ring-[#a0704b]",
                      )}
                    >
                      <SwatchMark swatch={swatch} className="shadow-[0_0_0_1.5px_rgba(0,0,0,0.15)]" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* The other pages scroll inside the panel when there are more than fit */}
          {panel === "move" && targets.length > 0 && (
            <div className={panelClass}>
              <p className="px-1 text-xs font-medium text-[#8b7355]">Move the ink to</p>
              <div className="flex max-h-[86px] max-w-[19rem] flex-wrap gap-1.5 overflow-y-auto touch-pan-y">
                {targets.map((page) => (
                  <button
                    key={page.index}
                    type="button"
                    onClick={() => onMove(page)}
                    className="h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[#6b4c30] ring-1 ring-inset ring-[#e8d4b8] hover:bg-[#f5ebe0]"
                  >
                    {page.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
