"use client";

import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { Plus, Ruler as RulerIcon, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, menuItemClass } from "@/components/ui/dropdown-menu";
import { AnnotationLayer } from "./AnnotationLayer";
import { UndoOfferBar } from "./UndoOfferBar";
import { Ruler, rulerStart } from "./Ruler";
import { Protractor, ProtractorIcon } from "./Protractor";
import { TRAY_CLEARANCE } from "./AnnotationTray";
import { PAGE_BAR_HEIGHT, tbBtn, tbBtnIdle, tbBtnOn, toolbarRow } from "./PdfPageViewer";
import { useViewerTouch } from "@/hooks/useViewerTouch";
import { PDF_DARK_FILTER, usePdfDarkMode } from "@/hooks/usePdfDarkMode";
import { inkLayerProps, type AnnotationTools } from "@/hooks/useAnnotationTools";
import { useUndoOffer } from "@/hooks/useUndoOffer";
import { CM, type DrawingGuide } from "@/lib/ruler";
import type { Vec } from "@/lib/stroke-select";
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
  /** Saves several pages' strokes as one change, for the lasso's Move. The worksheet is given the same one. */
  onPagesStrokesChange?: (pages: PageAnnotations) => void;
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

// The Pen Tray floats in DraftTrayLane, at the end of this file, which stops
// at the top of the worksheet's page bar. This is how far the tray's top sits
// above the bottom of the Draft.
const TRAY_TOP = PAGE_BAR_HEIGHT + TRAY_CLEARANCE;

const barButton = cn(tbBtn, "transition-colors");
// Clear and its options grey out the same way when there's nothing to clear.
const greyedOut = "disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed";
const clearOption = cn(
  menuItemClass,
  "min-h-11 text-red-700 dark:text-red-400 hover:bg-[#f5ebe0] dark:hover:bg-[#3a3228]",
  greyedOut,
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
export function DraftPane({
  exerciseId, annotations, onPageStrokesChange, onPagesStrokesChange, onClearPages, onUndo, tools, onClose,
}: DraftPaneProps) {
  const [squared, setSquared] = draftSquared.usePreference();
  const [pdfDarkMode] = usePdfDarkMode();
  // How many sheets each exercise's Draft has been given with "Add a sheet".
  // Sheets with ink on them are counted from the ink, so they survive a reload.
  const [sheetsAsked, setSheetsAsked] = useState<Record<number, number>>({});
  const sheetsInUse = draftSheetsInUse(annotations);
  const sheetCount = Math.max(1, sheetsInUse, sheetsAsked[exerciseId] ?? 0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const newSheetRef = useRef<number | null>(null);

  // The Draft's own ruler and protractor, from the buttons on its bar. The
  // sheets fit the pane, so a centimetre is measured from a sheet's width
  // while either of them is out.
  const columnRef = useRef<HTMLDivElement>(null);
  const [rulerAt, setRulerAt] = useState<Vec | null>(null);
  const [protractorAt, setProtractorAt] = useState<Vec | null>(null);
  const [guides] = useState(() => new Set<DrawingGuide>());
  const [sheetWidth, setSheetWidth] = useState(0);
  const rulerOut = rulerAt !== null;
  const protractorOut = protractorAt !== null;
  const measuring = rulerOut || protractorOut;
  useEffect(() => {
    const sheet = sheetRefs.current[0];
    if (!measuring || !sheet) return;
    const measure = () => setSheetWidth(sheet.offsetWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [measuring]);

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

  // Each exercise's Draft opens at its first sheet, with the ruler and the protractor put away.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
    setRulerAt(null);
    setProtractorAt(null);
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

  const toggleRuler = () => setRulerAt(rulerAt ? null : rulerStart(columnRef.current, scrollRef.current));
  const toggleProtractor = () => setProtractorAt(protractorAt ? null : rulerStart(columnRef.current, scrollRef.current));
  // A centimetre of the Draft's sheets, on screen.
  const sheetCm = sheetWidth * (CM / DRAFT_SHEET.width);

  // ---------- Clearing ----------
  // Both clears can be undone, and a message at the bottom of the pane offers
  // an Undo straight after each one, as the Pen Tray does for the worksheet.
  const undoOffer = useUndoOffer(annotations);
  // "This sheet" is whichever sheet fills most of the pane when the menu opens.
  const [sheetInView, setSheetInView] = useState(0);
  const draftHasInk = sheetsInUse > 0;
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
      <div className={cn(toolbarRow, "@container/draftbar")}>
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
        <button
          type="button"
          aria-label="Ruler"
          aria-pressed={rulerOut}
          title={rulerOut ? "Hide the ruler" : "Show the ruler on the draft"}
          onClick={toggleRuler}
          className={cn(barButton, rulerOut ? tbBtnOn : tbBtnIdle)}
        >
          <RulerIcon className="h-5 w-5" />
          {/* The words go when the Draft is narrow, and the icons stay */}
          <span className="hidden @[560px]/draftbar:inline">Ruler</span>
        </button>
        <button
          type="button"
          aria-label="Protractor"
          aria-pressed={protractorOut}
          title={protractorOut ? "Hide the protractor" : "Show the protractor on the draft"}
          onClick={toggleProtractor}
          className={cn(barButton, protractorOut ? tbBtnOn : tbBtnIdle)}
        >
          <ProtractorIcon className="h-5 w-5" />
          <span className="hidden @[560px]/draftbar:inline">Protractor</span>
        </button>
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
              className={cn(barButton, tbBtnIdle, greyedOut)}
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
        <div ref={columnRef} className="relative flex flex-col items-center gap-4">
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
                    guides={guides}
                    pageIndex={pageIndex}
                    pageLabel={`Draft sheet ${n + 1}`}
                    onPagesChange={onPagesStrokesChange}
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
          {rulerAt && (
            <Ruler
              containerRef={columnRef}
              cm={sheetCm}
              start={rulerAt}
              guides={guides}
              darkMode={pdfDarkMode}
              onHide={() => setRulerAt(null)}
            />
          )}
          {protractorAt && (
            <Protractor
              containerRef={columnRef}
              cm={sheetCm}
              start={protractorAt}
              guides={guides}
              darkMode={pdfDarkMode}
              onHide={() => setProtractorAt(null)}
            />
          )}
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

/**
 * The lane the Pen Tray floats in while the Draft is open. A lesson view puts
 * it in the box that holds the worksheet and the Draft, and hands it to the
 * worksheet's viewer, which draws its tray in here. Touches pass through it to
 * the panes underneath. It stops at the top of the worksheet's page bar, so
 * the tray sits just above the bar.
 *
 * Below 1100px the answer key can slide in over the Draft (see
 * FoldingAnswerKey). While it's there, the lane keeps to the worksheet, which
 * is half the width less half the line between the two panes. For that to
 * work, the row of viewers needs the `group/viewers` class as well as being
 * the "viewers" container.
 */
export function DraftTrayLane({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "absolute left-0 right-0 top-0 pointer-events-none",
        "@max-[1100px]/viewers:group-has-[[data-answers-out]]/viewers:right-[calc(50%+0.5px)]",
      )}
      style={{ bottom: PAGE_BAR_HEIGHT }}
    />
  );
}
