"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import { AnnotationLayer } from "./AnnotationLayer";
import { UndoOfferBar } from "./UndoOfferBar";
import { TRAY_CLEARANCE } from "./AnnotationTray";
import { PAGE_BAR_HEIGHT, tbBtn, tbBtnIdle, tbBtnOn, toolbarRow } from "./PdfPageViewer";
import { useViewerTouch } from "@/hooks/useViewerTouch";
import { PDF_DARK_FILTER, usePdfDarkMode } from "@/hooks/usePdfDarkMode";
import { inkLayerProps, type AnnotationTools } from "@/hooks/useAnnotationTools";
import { useUndoOffer } from "@/hooks/useUndoOffer";
import type { PageAnnotations, Stroke } from "@/hooks/useAnnotations";
import {
  DRAFT_GRID_COLOUR, DRAFT_PAGE_BASE, DRAFT_SHEET, DRAFT_SHEET_PT, DRAFT_SQUARE_PT,
  draftSheetsInUse, draftSquared, inkedDraftPages,
} from "@/lib/draft-sheets";

interface DraftPaneProps {
  exerciseId: number;
  /** The exercise's annotations. The Draft's sheets are its pages from DRAFT_PAGE_BASE up. */
  annotations: PageAnnotations;
  onPageStrokesChange: (pageIndex: number, strokes: Stroke[]) => void;
  /** Clears the given pages as one change, so one undo brings them all back. */
  onClearPages: (pageIndices: number[]) => void;
  /** Takes back the last change, for the Undo in the message after a clear. */
  onUndo?: () => void;
  tools: AnnotationTools;
  onClose: () => void;
}

// The squares are a background sized as a share of the sheet, so they grow
// and shrink with it and line up with the squares in the saved PDF.
const SQUARED_PAPER: CSSProperties = {
  backgroundImage:
    `linear-gradient(to right, ${DRAFT_GRID_COLOUR.css} 1px, transparent 1px), ` +
    `linear-gradient(to bottom, ${DRAFT_GRID_COLOUR.css} 1px, transparent 1px)`,
  backgroundSize: `${(100 * DRAFT_SQUARE_PT) / DRAFT_SHEET_PT.width}% ${(100 * DRAFT_SQUARE_PT) / DRAFT_SHEET_PT.height}%`,
};

const DARK_PAPER: CSSProperties = { filter: PDF_DARK_FILTER };

// The lesson views float the Pen Tray across the worksheet and the Draft, just
// above the worksheet's page bar. This is how far the tray's top sits above
// the bottom of the Draft.
const TRAY_TOP = PAGE_BAR_HEIGHT + TRAY_CLEARANCE;

const barButton = cn(tbBtn, "transition-colors");
const clearOption = cn(
  menuItemClass,
  "min-h-11 text-red-700 dark:text-red-400 hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]",
  "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed",
);

/**
 * The Draft: sheets of blank or squared paper in a pane beside the worksheet,
 * for the tutor's working. It scrolls on its own, so the worksheet can move on
 * to another question while the working stays where it is.
 *
 * It shares the worksheet's Pen Tray, which floats across both panes while
 * the Draft is open, and it follows the same touch rules: one finger uses the
 * tool, and two fingers scroll. It always fits the pane's width, so a pinch
 * doesn't zoom it. Its ink is part of the exercise's own, so a single undo
 * history covers the worksheet and the Draft together.
 */
export function DraftPane({ exerciseId, annotations, onPageStrokesChange, onClearPages, onUndo, tools, onClose }: DraftPaneProps) {
  const [squared, setSquared] = draftSquared.usePreference();
  const [pdfDarkMode] = usePdfDarkMode();
  // How many sheets each exercise's Draft has been given with "Add a sheet".
  // Sheets with ink on them are counted from the ink, so they survive a reload.
  const [sheetsAsked, setSheetsAsked] = useState<Record<number, number>>({});
  const sheetCount = Math.max(1, draftSheetsInUse(annotations), sheetsAsked[exerciseId] ?? 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const newSheetRef = useRef<number | null>(null);

  const { gestureActive, handlers } = useViewerTouch({
    scrollRef,
    getAnchor: () => sheetRefs.current[0] ?? null,
    handTool: !tools.drawingEnabled,
    zoom: 100,
    minZoom: 100,
    maxZoom: 100,
    previewZoom: () => {},
    commitZoom: () => {},
  });

  // Each exercise's Draft opens at its first sheet.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [exerciseId]);

  // A sheet that was just added is scrolled into view, ready to write on.
  useEffect(() => {
    if (newSheetRef.current === null) return;
    sheetRefs.current[newSheetRef.current]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    newSheetRef.current = null;
  }, [sheetCount]);

  const addSheet = () => {
    newSheetRef.current = sheetCount;
    setSheetsAsked((asked) => ({ ...asked, [exerciseId]: sheetCount + 1 }));
  };

  // ---------- Clearing ----------
  // Both clears can be undone, and a message at the bottom of the pane offers
  // an Undo straight after each one, as the Pen Tray does for the worksheet.
  const undoOffer = useUndoOffer(annotations);
  // "This sheet" is whichever sheet fills most of the pane when the menu opens.
  const [sheetInView, setSheetInView] = useState(0);
  const draftHasInk = draftSheetsInUse(annotations) > 0;
  const sheetHasInk = (n: number) => (annotations[DRAFT_PAGE_BASE + n]?.length ?? 0) > 0;

  const sheetMostInView = () => {
    const view = scrollRef.current?.getBoundingClientRect();
    let best = 0;
    let bestHeight = -Infinity;
    if (view) {
      sheetRefs.current.slice(0, sheetCount).forEach((sheet, n) => {
        const box = sheet?.getBoundingClientRect();
        if (!box) return;
        const height = Math.min(box.bottom, view.bottom) - Math.max(box.top, view.top);
        if (height > bestHeight) { best = n; bestHeight = height; }
      });
    }
    return best;
  };

  const clearSheet = (n: number) => {
    onClearPages([DRAFT_PAGE_BASE + n]);
    undoOffer.offer(`Sheet ${n + 1} of the draft was cleared.`);
  };

  // Clearing the whole draft takes it back to one sheet as well. Undo brings
  // the ink back, and its sheets with it, because they're counted from the ink.
  const clearDraft = () => {
    onClearPages(inkedDraftPages(annotations));
    setSheetsAsked((asked) => ({ ...asked, [exerciseId]: 0 }));
    scrollRef.current?.scrollTo?.({ top: 0 });
    undoOffer.offer("The draft was cleared.");
  };

  return (
    <section aria-label="Draft" className="relative flex-1 flex flex-col min-h-0 min-w-0 bg-[#e8dcc8] dark:bg-[#1e1a14]">
      <div className={toolbarRow}>
        <span className="ml-1 text-xs font-medium text-[#8b7355] dark:text-[#a09080]">Draft</span>
        <div className="flex-1" />
        <div role="group" aria-label="Paper" className="flex flex-none gap-0.5">
          <button type="button" aria-pressed={!squared} onClick={() => setSquared(false)} className={cn(barButton, squared ? tbBtnIdle : tbBtnOn)}>
            Blank
          </button>
          <button type="button" aria-pressed={squared} onClick={() => setSquared(true)} className={cn(barButton, squared ? tbBtnOn : tbBtnIdle)}>
            Squared
          </button>
        </div>
        <DropdownMenu
          align="right"
          menuClassName="bg-[#fef9f3] dark:bg-[#2d2618] border-[#e8d4b8] dark:border-[#6b5a4a]"
          trigger={({ triggerProps }) => (
            <button
              type="button"
              {...triggerProps}
              onClick={() => {
                setSheetInView(sheetMostInView());
                undoOffer.drop();
                triggerProps.onClick();
              }}
              disabled={!draftHasInk}
              className={cn(barButton, tbBtnIdle, "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed")}
            >
              <Trash2 className="h-5 w-5" />
              Clear
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={!sheetHasInk(sheetInView)}
                onClick={() => { close(); clearSheet(sheetInView); }}
                className={clearOption}
              >
                <span>
                  Clear this sheet
                  <small className="block text-xs font-normal opacity-70">Sheet {sheetInView + 1}</small>
                </span>
              </button>
              <button type="button" role="menuitem" onClick={() => { close(); clearDraft(); }} className={clearOption}>
                Clear the draft
              </button>
            </>
          )}
        </DropdownMenu>
        <div className="flex-none h-6 w-px bg-[#d4c4a8] dark:bg-[#3a3228]" />
        <button type="button" onClick={onClose} aria-label="Close the draft" title="Close the draft" className={cn(barButton, tbBtnIdle)}>
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={scrollRef}
        {...handlers}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pt-2 md:px-4 md:pt-4",
          !tools.drawingEnabled && "cursor-grab active:cursor-grabbing",
        )}
        // Every touch is handled here, as in the worksheet viewer: one finger for the tool, two to scroll.
        // The room at the bottom lets the last sheet and "Add a sheet" scroll clear of the tray.
        style={{ touchAction: "none", paddingBottom: TRAY_TOP + 20 }}
      >
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: sheetCount }, (_, n) => {
            const pageIndex = DRAFT_PAGE_BASE + n;
            return (
              <div
                key={n}
                ref={(el) => { sheetRefs.current[n] = el; }}
                aria-label={`Draft sheet ${n + 1}`}
                className="relative w-full rounded shadow-lg ring-1 ring-black/5 dark:ring-white/5"
                style={{ aspectRatio: `${DRAFT_SHEET.width} / ${DRAFT_SHEET.height}` }}
              >
                {/* The paper and its ink darken together in dark PDF mode, as the worksheet does */}
                <div
                  className="absolute inset-0 rounded bg-white"
                  style={{ ...(squared ? SQUARED_PAPER : null), ...(pdfDarkMode ? DARK_PAPER : null) }}
                >
                  <AnnotationLayer
                    // A new exercise gets fresh layers, so fading ink from the last one doesn't linger
                    key={exerciseId}
                    width={DRAFT_SHEET.width}
                    height={DRAFT_SHEET.height}
                    strokes={annotations[pageIndex] || []}
                    {...inkLayerProps(tools)}
                    onStrokesChange={(strokes) => onPageStrokesChange(pageIndex, strokes)}
                    suspended={gestureActive}
                  />
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addSheet}
            className={cn(barButton, "px-4 border border-[#d4c4a8] dark:border-[#3a3228] bg-[#f0e6d4] dark:bg-[#252018]", tbBtnIdle)}
          >
            <Plus className="h-5 w-5" />
            Add a sheet
          </button>
        </div>
      </div>

      {undoOffer.message && (
        <UndoOfferBar
          message={undoOffer.message}
          onUndo={onUndo && (() => { undoOffer.drop(); onUndo(); })}
          // It sits just above the tray, where the tray's own messages appear.
          style={{ bottom: TRAY_TOP + 10 }}
          className="absolute left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-2rem)]"
        />
      )}
    </section>
  );
}
